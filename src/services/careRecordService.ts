import { supabase } from "@/lib/supabase";
import type { CareRecord } from "@/types";

export const careRecordService = {
  /**
   * Consulta o histórico de prontuário e evoluções de um paciente
   * (acessível exclusivamente por voluntários, moderadores e administradores)
   */
  async getPatientHistory(userId: string): Promise<CareRecord[]> {
    if (!supabase) {
      // Fallback local se cliente não inicializado
      return [];
    }

    try {
      // Tenta via RPC dedicada
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_patient_care_history", {
        p_user_id: userId,
      });

      if (!rpcError && Array.isArray(rpcData)) {
        return rpcData.map((r: any) => ({
          id: r.id,
          userId,
          volunteerId: r.volunteer_id ?? "",
          volunteerName: r.volunteer_name ?? "Voluntário",
          riskLevel: r.risk_level ?? "baixo",
          summary: r.summary ?? "",
          actionTaken: r.action_taken ?? "",
          createdAt: r.created_at ?? new Date().toISOString(),
        }));
      }

      // Consulta direta à tabela care_records com join em users
      const { data, error } = await supabase
        .from("care_records")
        .select("*, users:volunteer_id(display_name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Aviso ao carregar prontuário do acolhido:", error.message);
        return [];
      }

      return (data || []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        volunteerId: r.volunteer_id,
        volunteerName: r.users?.display_name || "Voluntário",
        conversationId: r.conversation_id,
        riskLevel: r.risk_level || "baixo",
        summary: r.summary,
        actionTaken: r.action_taken,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (err) {
      console.error("Erro ao buscar histórico do acolhido:", err);
      return [];
    }
  },

  /**
   * Registra uma nova nota de evolução ou atendimento no prontuário do paciente
   */
  async addRecord(data: {
    userId: string;
    volunteerId?: string;
    conversationId?: string;
    riskLevel?: "baixo" | "medio" | "alto" | "imediato";
    summary: string;
    actionTaken?: string;
  }): Promise<CareRecord | null> {
    if (!supabase) return null;

    try {
      const userRes = await supabase.auth.getUser();
      const currentVolunteerId = data.volunteerId || userRes.data.user?.id;

      if (!currentVolunteerId) {
        throw new Error("Voluntário não autenticado");
      }

      const { data: record, error } = await supabase
        .from("care_records")
        .insert({
          user_id: data.userId,
          volunteer_id: currentVolunteerId,
          conversation_id: data.conversationId || null,
          risk_level: data.riskLevel || "baixo",
          summary: data.summary,
          action_taken: data.actionTaken || null,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        id: record.id,
        userId: record.user_id,
        volunteerId: record.volunteer_id,
        volunteerName: "Você",
        conversationId: record.conversation_id,
        riskLevel: record.risk_level,
        summary: record.summary,
        actionTaken: record.action_taken,
        createdAt: record.created_at,
      };
    } catch (err: any) {
      console.error("Erro ao registrar prontuário:", err);
      throw new Error(err.message || "Erro ao salvar no prontuário");
    }
  },
};
