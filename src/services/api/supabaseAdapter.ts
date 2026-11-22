/**
 * VIDA+ — Supabase Direct Adapter
 * 
 * Intercepta chamadas de API e executa diretamente contra o cliente Supabase (@supabase/supabase-js),
 * eliminando a necessidade de qualquer servidor intermediário (Node.js/Express/Render).
 */

import { supabase } from "@/lib/supabase";
import { APP_URL } from "./client";

type Envelope<T> = {
  status: string;
  message?: string;
  data: T;
};

function ok<T>(data: T, message = "Sucesso"): Envelope<T> {
  return { status: "success", message, data };
}

/** Avisa em tempo real quem está no grupo (canal usado por useCommunityRealtime). */
async function broadcastCommunityMessage(commId: string, row: any) {
  if (!supabase) return;
  try {
    const topic = `realtime:community:${commId}`;
    const existing = supabase.getChannels().find((c) => c.topic === topic);
    const message = {
      type: "broadcast" as const,
      event: "message",
      payload: { ...row, alias: row.alias_snapshot },
    };
    if (existing) {
      await existing.send(message);
      return;
    }
    const temp = supabase.channel(`community:${commId}`);
    await new Promise<void>((resolve) => {
      temp.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve();
      });
    });
    await temp.send(message);
    supabase.removeChannel(temp);
  } catch {
    // o refetch periódico cobre falhas do broadcast
  }
}

export async function handleSupabaseRequest<T>(
  path: string,
  method = "GET",
  body?: any
): Promise<T | null> {
  if (!supabase) return null;

  const cleanPath = path.replace(/^\/api/, "").replace(/\/$/, "");
  const payload = typeof body === "string" ? JSON.parse(body || "{}") : body || {};

  // 1. AUTH
  if (cleanPath === "/auth/login" && method === "POST") {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });
    if (error) {
      if (error.code === "email_not_confirmed") {
        throw new Error("Confirme seu e-mail pelo link enviado antes de entrar.");
      }
      if (error.code === "invalid_credentials") {
        throw new Error("E-mail ou senha incorretos.");
      }
      throw new Error(error.message);
    }

    // Carrega dados da tabela users
    const { data: userData } = await supabase
      .from("users")
      .select("*, user_profiles(*)")
      .eq("id", data.user.id)
      .single();

    return ok({
      session: data.session,
      user: {
        id: data.user.id,
        email: data.user.email,
        display_name: userData?.display_name || data.user.user_metadata?.display_name,
        role: userData?.role || "cadastrado",
      },
    }) as T;
  }

  if (cleanPath === "/auth/register" && method === "POST") {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        emailRedirectTo: `${APP_URL}/login`,
        data: {
          display_name: payload.displayName || payload.name,
          nickname: payload.nickname,
        },
      },
    });
    if (error) {
      if (error.code === "signup_disabled") {
        throw new Error("O cadastro por e-mail está indisponível no momento.");
      }
      if (error.code === "email_address_not_authorized") {
        throw new Error("O serviço de confirmação de e-mail está indisponível para este endereço.");
      }
      if (error.code === "over_email_send_rate_limit") {
        throw new Error("O limite de envio de e-mails foi atingido. Tente novamente mais tarde.");
      }
      throw new Error(error.message);
    }

    return ok({
      session: data.session,
      emailConfirmationRequired: !data.session,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        display_name: payload.displayName || payload.name,
        role: "cadastrado",
      },
    }) as T;
  }

  if (cleanPath === "/auth/resend-confirmation" && method === "POST") {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: payload.email.trim(),
      options: { emailRedirectTo: `${APP_URL}/login` },
    });
    if (error) {
      if (error.code === "over_email_send_rate_limit") {
        throw new Error("O limite de envio de e-mails foi atingido. Tente novamente mais tarde.");
      }
      throw new Error(error.message);
    }
    return ok({ ok: true }) as T;
  }

  if (cleanPath === "/auth/anonymous" && method === "POST") {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error(error.message);

    return ok({
      session: data.session,
      user: {
        id: data.user?.id,
        display_name: "Pessoa Acolhida",
        role: "anonimo",
      },
    }) as T;
  }

  if (cleanPath === "/auth/password/reset" && method === "POST") {
    const { error } = await supabase.auth.resetPasswordForEmail(payload.email.trim(), {
      redirectTo: `${APP_URL}/nova-senha`,
    });
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }

  // 2. USERS
  if (cleanPath === "/users/me") {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) throw new Error("Não autenticado");

    const { data: u } = await supabase
      .from("users")
      .select("*, user_profiles(*)")
      .eq("id", authData.user.id)
      .single();

    return ok({
      id: authData.user.id,
      email: authData.user.email,
      name: u?.display_name || authData.user.user_metadata?.display_name || "Usuário",
      nickname: u?.user_profiles?.nickname || "Apoiado",
      role: u?.role || (authData.user.is_anonymous ? "anonimo" : "cadastrado"),
      status: u?.status || "ativo",
      createdAt: u?.created_at || authData.user.created_at,
    }) as T;
  }

  if (cleanPath === "/users" || cleanPath === "/users/admin") {
    const { data, error } = await supabase
      .from("users")
      .select("*, user_profiles(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ok(data || []) as T;
  }

  if (cleanPath === "/users/team") {
    const { data, error } = await supabase
      .from("users")
      .select("*, user_profiles(*)")
      .in("role", ["voluntario", "moderador", "administrador"])
      .order("display_name", { ascending: true });
    if (error) throw new Error(error.message);
    return ok(data || []) as T;
  }

  // 3. CONVERSATIONS & QUEUE
  if (cleanPath === "/conversations" && method === "POST") {
    // Tenta primeiro via RPC join_support_queue
    const { data: rpcData, error: rpcError } = await supabase.rpc("join_support_queue");
    if (!rpcError && rpcData) {
      return ok(rpcData) as T;
    }

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error("Não autenticado");

    // Inserção direta fallback
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: userId, status: "aguardando", priority: "normal" })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return ok({
      id: data.id,
      status: data.status,
      position: 1,
      estimated_wait_minutes: 4,
      created_at: data.created_at,
    }) as T;
  }

  if (cleanPath === "/conversations" && method === "GET") {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ok(data || []) as T;
  }

  if (cleanPath === "/conversations/volunteer/queue") {
    const { data, error } = await supabase
      .from("conversations")
      .select("*, users:user_id(display_name)")
      .eq("status", "aguardando")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ok(
      (data || []).map((c: any) => ({
        ...c,
        anonymous_name: c.users?.display_name || "Pessoa aguardando",
      }))
    ) as T;
  }

  const convMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)$/i);
  if (convMatch && method === "GET") {
    const convId = convMatch[1];
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("*, users:user_id(display_name), volunteer:volunteer_id(display_name)")
      .eq("id", convId)
      .single();
    if (convError) throw new Error(convError.message);

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    return ok({
      ...conv,
      anonymous_name: conv.users?.display_name || "Pessoa acolhida",
      volunteer_display_name: conv.volunteer?.display_name,
      messages: msgs || [],
    }) as T;
  }

  const msgMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/messages$/i);
  if (msgMatch && method === "POST") {
    const convId = msgMatch[1];
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: convId,
        sender_id: authData.user?.id,
        body: payload.text,
        body_encrypted: payload.text,
        reply_to_id: payload.replyToId || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok(data) as T;
  }

  const acceptMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/accept$/i);
  if (acceptMatch && method === "POST") {
    const convId = acceptMatch[1];
    const { data: rpcData, error: rpcError } = await supabase.rpc("accept_support_conversation", {
      p_conversation_id: convId,
    });
    if (!rpcError && rpcData) return ok(rpcData) as T;

    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("conversations")
      .update({
        status: "ativa",
        volunteer_id: authData.user?.id,
        started_at: new Date().toISOString(),
      })
      .eq("id", convId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok(data) as T;
  }

  const closeMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/close$/i);
  if (closeMatch && method === "POST") {
    const convId = closeMatch[1];
    await supabase.rpc("close_support_conversation", {
      p_conversation_id: convId,
      p_reason: payload.reason || "usuario_encerrou",
      p_notes: payload.notes || null,
    });

    await supabase
      .from("conversations")
      .update({
        status: "encerrada",
        ended_at: new Date().toISOString(),
        closed_reason: payload.reason,
      })
      .eq("id", convId);

    return ok({ ok: true }) as T;
  }

  const riskMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/risk-flags$/i);
  if (riskMatch && method === "POST") {
    const convId = riskMatch[1];
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("risk_flags")
      .insert({
        conversation_id: convId,
        created_by: authData.user?.id,
        level: payload.level || "baixo",
        reason: payload.reason || "",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok(data) as T;
  }

  // 4. COMMUNITIES
  if (cleanPath === "/communities" && method === "GET") {
    const { data, error } = await supabase
      .from("communities")
      .select("*")
      .eq("status", "ativo")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    const mine = new Map<string, string>();
    if (uid) {
      const { data: members } = await supabase
        .from("community_members")
        .select("community_id, alias")
        .eq("user_id", uid)
        .eq("status", "ativo");
      (members || []).forEach((m: any) => mine.set(m.community_id, m.alias));
    }
    return ok(
      (data || []).map((c: any) => ({
        ...c,
        is_member: mine.has(c.id),
        my_alias: mine.get(c.id),
      })),
    ) as T;
  }

  const commMsgMatch = cleanPath.match(/^\/communities\/([a-f0-9-]+)\/messages$/i);
  if (commMsgMatch && method === "GET") {
    const commId = commMsgMatch[1];
    const { data, error } = await supabase
      .from("community_messages")
      .select("*")
      .eq("community_id", commId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ok(data || []) as T;
  }

  if (commMsgMatch && method === "POST") {
    const commId = commMsgMatch[1];
    const { data: authData } = await supabase.auth.getUser();
    const { data: member } = await supabase
      .from("community_members")
      .select("alias")
      .eq("community_id", commId)
      .eq("user_id", authData.user?.id)
      .maybeSingle();
    const { data, error } = await supabase
      .from("community_messages")
      .insert({
        community_id: commId,
        sender_id: authData.user?.id,
        alias_snapshot: member?.alias || "Participante",
        body: payload.text,
        body_encrypted: payload.text,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await broadcastCommunityMessage(commId, data);
    return ok(data) as T;
  }

  const commJoinMatch = cleanPath.match(/^\/communities\/([a-f0-9-]+)\/join$/i);
  if (commJoinMatch && method === "POST") {
    const commId = commJoinMatch[1];
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) throw new Error("Não autenticado");
    const { data: prof } = await supabase
      .from("user_profiles")
      .select("nickname")
      .eq("user_id", uid)
      .maybeSingle();
    const alias =
      prof?.nickname || authData.user?.user_metadata?.nickname || "Membro";
    const { error } = await supabase.from("community_members").upsert({
      community_id: commId,
      user_id: uid,
      alias,
      status: "ativo",
    });
    if (error) throw new Error(`Não foi possível entrar no grupo: ${error.message}`);
    return ok({ ok: true }) as T;
  }

  const commLeaveMatch = cleanPath.match(/^\/communities\/([a-f0-9-]+)\/leave$/i);
  if (commLeaveMatch && method === "POST") {
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("community_members")
      .delete()
      .eq("community_id", commLeaveMatch[1])
      .eq("user_id", authData.user?.id);
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }

  // 5. VOLUNTEERS & APPLICATIONS
  if (cleanPath === "/admin/volunteers" && method === "GET") {
    const { data, error } = await supabase
      .from("volunteer_profiles")
      .select("*, users:user_id(display_name)");
    if (error) throw new Error(error.message);
    return ok(data || []) as T;
  }

  if (cleanPath === "/admin/volunteers/applications" && method === "GET") {
    const { data, error } = await supabase
      .from("volunteer_applications")
      .select("*, users:user_id(display_name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ok(data || []) as T;
  }

  if (cleanPath === "/admin/volunteers/apply" && method === "POST") {
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("volunteer_applications")
      .insert({
        user_id: authData.user?.id,
        motivation: payload.motivation,
        experience: payload.experience,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok(data) as T;
  }

  // 6. REPORTS & NOTIFICATIONS
  if (cleanPath === "/reports" && method === "POST") {
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("reports")
      .insert({
        reporter_id: authData.user?.id,
        target_type: payload.targetType || "usuario",
        target_id: payload.targetId || authData.user?.id,
        reason: payload.reason || "denuncia",
        description: payload.description || "",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok(data) as T;
  }

  if (cleanPath === "/notifications" && method === "GET") {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("sent_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ok(data || []) as T;
  }

  if (cleanPath === "/conversations/volunteer/dashboard") {
    const { count: totalUsers } = await supabase.from("users").select("*", { count: "exact", head: true });
    const { count: activeChats } = await supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "ativa");
    const { count: onlineVolunteers } = await supabase
      .from("volunteer_profiles")
      .select("*", { count: "exact", head: true })
      .eq("availability_status", "online");

    return ok({
      totalUsersAllTime: totalUsers || 0,
      activeChats: activeChats || 0,
      onlineVolunteers: onlineVolunteers || 1,
      satisfactionRate: 98,
      weeklyConversations: [],
    }) as T;
  }

  return null;
}
