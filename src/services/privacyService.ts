import { supabase } from "@/lib/supabase";
import { logAudit } from "./audit";

/** Reúne os dados da própria pessoa e baixa como arquivo JSON (direito de acesso — LGPD). */
export async function exportMyData(): Promise<void> {
  if (!supabase) throw new Error("Supabase indisponível");
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Você precisa estar autenticado.");

  const [profile, user, consents, convs, members, reports, notes] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", uid).maybeSingle(),
    supabase.from("users").select("id, display_name, role, status, created_at").eq("id", uid).maybeSingle(),
    supabase.from("consents").select("*").eq("user_id", uid),
    supabase.from("conversations").select("id, status, started_at, ended_at, rating, rating_comment, created_at").eq("user_id", uid),
    supabase.from("community_members").select("community_id, alias, status, joined_at").eq("user_id", uid),
    supabase.from("reports").select("id, target_type, reason, description, status, created_at").eq("reporter_id", uid),
    supabase.from("notifications").select("title, body, sent_at").eq("user_id", uid),
  ]);

  const convIds = (convs.data ?? []).map((c: any) => c.id);
  const messages = convIds.length
    ? await supabase.from("messages").select("conversation_id, body, created_at, sender_id").in("conversation_id", convIds).eq("sender_id", uid)
    : { data: [] as any[] };

  const payload = {
    exportado_em: new Date().toISOString(),
    email: auth.user?.email,
    conta: user.data,
    perfil: profile.data,
    consentimentos: consents.data,
    atendimentos: convs.data,
    minhas_mensagens_em_atendimentos: messages.data,
    grupos: members.data,
    denuncias_enviadas: reports.data,
    notificacoes: notes.data,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `meus-dados-vida-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  void logAudit("conta.dados_exportados", "usuario", uid);
}

/** Anonimiza e desativa a conta (direito de eliminação — LGPD). */
export async function deleteMyAccount(): Promise<void> {
  if (!supabase) throw new Error("Supabase indisponível");
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}
