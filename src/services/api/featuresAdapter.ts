/**
 * Rotas das funcionalidades de cuidado: plano de segurança, pedido de apoio,
 * agendamento de conversas e trilhas. Fica separado do adaptador principal.
 */
import { supabase } from "@/lib/supabase";
import { logAudit } from "../audit";

const ok = <T,>(data: T) => ({ status: "success", message: "Sucesso", data });

/** Devolve undefined quando o caminho não é desta área (o adaptador principal segue). */
export async function handleFeatureRequest(cleanPath: string, method: string, payload: any): Promise<unknown | undefined> {
  if (!supabase) return undefined;
  const sb = supabase;

  // ---------- Plano de segurança ----------
  if (cleanPath === "/safety-plan") {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error("Não autenticado");
    if (method === "GET") {
      const { data, error } = await sb.from("safety_plans").select("*").eq("user_id", uid).maybeSingle();
      if (error) throw new Error(error.message);
      return ok(data ?? null);
    }
    if (method === "PUT") {
      const row = {
        user_id: uid,
        warning_signs: String(payload.warningSigns ?? "").slice(0, 2000),
        coping: String(payload.coping ?? "").slice(0, 2000),
        reasons: String(payload.reasons ?? "").slice(0, 2000),
        safe_place: String(payload.safePlace ?? "").slice(0, 500),
        contacts: Array.isArray(payload.contacts) ? payload.contacts.slice(0, 5) : [],
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from("safety_plans").upsert(row);
      if (error) throw new Error(error.message);
      return ok({ ok: true });
    }
  }

  // ---------- Pedido de apoio ao supervisor ----------
  if (cleanPath === "/supervisor/request" && method === "POST") {
    const { error } = await sb.rpc("request_supervisor", {
      p_conversation_id: payload.conversationId,
      p_note: payload.note || null,
      p_urgent: !!payload.urgent,
    });
    if (error) throw new Error(error.message);
    return ok({ ok: true });
  }
  if (cleanPath === "/supervisor/requests" && method === "GET") {
    const { data, error } = await sb
      .from("supervisor_requests")
      .select("*, volunteer:volunteer_id(display_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return ok(data || []);
  }
  const supMatch = cleanPath.match(/^\/supervisor\/requests\/([a-f0-9-]+)$/i);
  if (supMatch && method === "PATCH") {
    const { data: auth } = await sb.auth.getUser();
    const { error } = await sb
      .from("supervisor_requests")
      .update({ status: "atendido", handled_by: auth.user?.id, handled_at: new Date().toISOString() })
      .eq("id", supMatch[1]);
    if (error) throw new Error(error.message);
    await logAudit("apoio.atendido", "atendimento", supMatch[1]);
    return ok({ ok: true });
  }

  // ---------- Agendamento ----------
  if (cleanPath === "/appointments/mine" && method === "GET") {
    const { data: auth } = await sb.auth.getUser();
    const { data, error } = await sb
      .from("appointments")
      .select("*, volunteer:volunteer_id(display_name)")
      .eq("user_id", auth.user?.id)
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ok(data || []);
  }
  if (cleanPath === "/appointments" && method === "POST") {
    const { data: auth } = await sb.auth.getUser();
    const starts = new Date(payload.startsAt);
    if (Number.isNaN(starts.getTime())) throw new Error("Escolha uma data e horário válidos.");
    const { data, error } = await sb
      .from("appointments")
      .insert({ user_id: auth.user?.id, starts_at: starts.toISOString(), topic: payload.topic ? String(payload.topic).slice(0, 300) : null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logAudit("agenda.criada", "agendamento", data.id);
    return ok(data);
  }
  if (cleanPath === "/appointments/open" && method === "GET") {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    const { data, error } = await sb
      .from("appointments")
      .select("*, person:user_id(display_name, user_profiles(nickname))")
      .or(`and(status.eq.aberto,starts_at.gt.${new Date().toISOString()}),volunteer_id.eq.${uid}`)
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ok(data || []);
  }
  const apptMatch = cleanPath.match(/^\/appointments\/([a-f0-9-]+)\/(cancel|claim|complete)$/i);
  if (apptMatch && method === "POST") {
    const [, id, action] = apptMatch;
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (action === "claim") {
      const { data, error } = await sb
        .from("appointments")
        .update({ volunteer_id: uid, status: "confirmado" })
        .eq("id", id)
        .eq("status", "aberto")
        .select()
        .single();
      if (error) throw new Error("Outro voluntário já assumiu este horário.");
      await logAudit("agenda.assumida", "agendamento", id);
      return ok(data);
    }
    const status = action === "cancel" ? "cancelado" : "concluido";
    const { error } = await sb.from("appointments").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
    await logAudit(action === "cancel" ? "agenda.cancelada" : "agenda.concluida", "agendamento", id);
    return ok({ ok: true });
  }

  // ---------- Trilhas ----------
  if (cleanPath === "/tracks/progress" && method === "GET") {
    const { data: auth } = await sb.auth.getUser();
    const { data, error } = await sb
      .from("track_progress")
      .select("track_id, day, completed_at")
      .eq("user_id", auth.user?.id);
    if (error) throw new Error(error.message);
    return ok(data || []);
  }
  const trackMatch = cleanPath.match(/^\/tracks\/([a-z0-9_-]+)\/(\d)$/i);
  if (trackMatch) {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    const day = Number(trackMatch[2]);
    if (method === "POST") {
      const { error } = await sb.from("track_progress").upsert({ user_id: uid, track_id: trackMatch[1], day });
      if (error) throw new Error(error.message);
      return ok({ ok: true });
    }
    if (method === "DELETE") {
      const { error } = await sb.from("track_progress").delete().eq("user_id", uid).eq("track_id", trackMatch[1]).eq("day", day);
      if (error) throw new Error(error.message);
      return ok({ ok: true });
    }
  }

  return undefined;
}
