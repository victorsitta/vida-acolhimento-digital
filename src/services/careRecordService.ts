import { supabase } from "@/lib/supabase";
import { logAudit } from "./audit";
import type { CareRecord, CareAttachment } from "@/types";

const BUCKET = "prontuarios";
export const MAX_ATTACHMENT_MB = 10;
export const MAX_ATTACHMENTS = 8;

function mapRecord(r: any): CareRecord {
  return {
    id: r.id,
    userId: r.user_id,
    volunteerId: r.volunteer_id,
    volunteerName: r.users?.display_name || r.volunteer_name || "Voluntário",
    conversationId: r.conversation_id ?? undefined,
    riskLevel: r.risk_level || "baixo",
    title: r.title ?? undefined,
    summary: r.summary ?? "",
    actionTaken: r.action_taken ?? "",
    attachments: Array.isArray(r.attachments) ? (r.attachments as CareAttachment[]) : [],
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? undefined,
  };
}

function safeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);
}

export const careRecordService = {
  /** Histórico de prontuário do acolhido (somente equipe). */
  async getPatientHistory(userId: string): Promise<CareRecord[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("care_records")
      .select("*, users:volunteer_id(display_name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error) {
      void logAudit("prontuario.consultado", "prontuario", userId, { registros: (data || []).length }, 5 * 60_000);
      return (data || []).map(mapRecord);
    }

    // fallback: RPC antiga (sem anexos/título)
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_patient_care_history", {
      p_user_id: userId,
    });
    if (!rpcError && Array.isArray(rpcData)) {
      return rpcData.map((r: any) => mapRecord({ ...r, user_id: userId }));
    }
    throw new Error(error.message);
  },

  /** Envia arquivos ao bucket privado e devolve os metadados para salvar no registro. */
  async uploadAttachments(userId: string, files: File[]): Promise<CareAttachment[]> {
    if (!supabase || files.length === 0) return [];
    const uploaded: CareAttachment[] = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        throw new Error(`"${file.name}" passa de ${MAX_ATTACHMENT_MB} MB.`);
      }
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(file.name)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) {
        throw new Error(
          error.message.toLowerCase().includes("bucket")
            ? "O armazenamento de anexos ainda não foi criado no Supabase (rode o SQL de prontuário)."
            : `Falha ao enviar "${file.name}": ${error.message}`,
        );
      }
      uploaded.push({ path, name: file.name, size: file.size, type: file.type || "application/octet-stream" });
    }
    return uploaded;
  },

  /** Link temporário (10 min) para abrir/baixar um anexo. */
  async getAttachmentUrl(path: string): Promise<string> {
    if (!supabase) throw new Error("Supabase indisponível");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Não foi possível abrir o anexo.");
    void logAudit("prontuario.anexo_aberto", "prontuario", null, { arquivo: path.split("/").pop() });
    return data.signedUrl;
  },

  async addRecord(data: {
    userId: string;
    volunteerId?: string;
    conversationId?: string;
    riskLevel?: "baixo" | "medio" | "alto" | "imediato";
    title?: string;
    summary: string;
    actionTaken?: string;
    files?: File[];
  }): Promise<CareRecord> {
    if (!supabase) throw new Error("Supabase indisponível");

    const userRes = await supabase.auth.getUser();
    const volunteerId = data.volunteerId || userRes.data.user?.id;
    if (!volunteerId) throw new Error("Você precisa estar autenticado.");

    const attachments = await careRecordService.uploadAttachments(data.userId, data.files ?? []);

    const { data: record, error } = await supabase
      .from("care_records")
      .insert({
        user_id: data.userId,
        volunteer_id: volunteerId,
        conversation_id: data.conversationId || null,
        risk_level: data.riskLevel || "baixo",
        title: data.title?.trim() || null,
        summary: data.summary,
        action_taken: data.actionTaken || null,
        attachments,
      })
      .select()
      .single();

    if (error) {
      // não deixa arquivos órfãos se o registro falhar
      if (attachments.length) await supabase.storage.from(BUCKET).remove(attachments.map((a) => a.path));
      throw new Error(error.message);
    }

    void supabase.from("audit_logs").insert({
      actor_id: volunteerId,
      action: "prontuario.criado",
      entity_type: "prontuario",
      entity_id: record.id,
      metadata_json: { acolhido: data.userId, risco: data.riskLevel, anexos: attachments.length },
    });

    return mapRecord({ ...record, users: { display_name: "Você" } });
  },
};
