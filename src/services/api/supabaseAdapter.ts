/**
 * VIDA+ — Supabase Direct Adapter
 * 
 * Intercepta chamadas de API e executa diretamente contra o cliente Supabase (@supabase/supabase-js),
 * eliminando a necessidade de qualquer servidor intermediário (Node.js/Express/Render).
 */

import { supabase } from "@/lib/supabase";
import { APP_URL } from "./client";
import { logAudit } from "../audit";

type Envelope<T> = {
  status: string;
  message?: string;
  data: T;
};

function ok<T>(data: T, message = "Sucesso"): Envelope<T> {
  return { status: "success", message, data };
}

/** Envia um broadcast Realtime reaproveitando o canal já aberto (se houver). */
async function broadcast(channelName: string, event: string, payload: any) {
  if (!supabase) return;
  try {
    const topic = `realtime:${channelName}`;
    const existing = supabase.getChannels().find((c) => c.topic === topic);
    const message = { type: "broadcast" as const, event, payload };
    if (existing) {
      await existing.send(message);
      return;
    }
    const temp = supabase.channel(channelName);
    await new Promise<void>((resolve) => {
      temp.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve();
      });
    });
    await temp.send(message);
    supabase.removeChannel(temp);
  } catch {
    // o polling periódico cobre falhas do broadcast
  }
}

async function broadcastCommunityMessage(commId: string, row: any) {
  await broadcast(`community:${commId}`, "message", { ...row, alias: row.alias_snapshot });
}

async function myAlias(): Promise<string> {
  if (!supabase) return "Participante";
  const { data } = await supabase.auth.getUser();
  const u = data?.user;
  return u?.user_metadata?.nickname || u?.user_metadata?.display_name || "Participante";
}

const queueChanged = () => broadcast("volunteer:queue", "queue_changed", { at: Date.now() });

const USER_NAME_SELECT = "users:user_id(display_name, user_profiles(nickname))";
function userAlias(c: any) {
  return c.users?.user_profiles?.nickname || c.users?.display_name || "Pessoa acolhida";
}

/** Quem espera há mais de 3h é considerado desistência: não entra na fila nem nas médias. */
const STALE_WAIT_MS = 3 * 60 * 60 * 1000;
const waitCutoff = () => new Date(Date.now() - STALE_WAIT_MS).toISOString();

async function handleInner<T>(
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

  if (cleanPath === "/auth/logout" && method === "POST") {
    await logAudit("logout", "sessao");
    await supabase.auth.signOut();
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
    if (payload.targetUserId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: payload.targetUserId, status: "aguardando", priority: "prioritaria" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await queueChanged();
      return ok(data) as T;
    }

    // Tenta primeiro via RPC join_support_queue
    const { data: rpcData, error: rpcError } = await supabase.rpc("join_support_queue");
    if (!rpcError && rpcData) {
      await queueChanged();
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
    await queueChanged();

    return ok({
      id: data.id,
      status: data.status,
      position: 1,
      estimated_wait_minutes: 4,
      created_at: data.created_at,
    }) as T;
  }

  if (cleanPath === "/conversations" && method === "GET") {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    const { data: me } = await supabase.from("users").select("role").eq("id", uid).maybeSingle();
    const role = me?.role;

    const isStaff = role === "moderador" || role === "administrador";
    const build = (withEmail: boolean) => {
      const who = withEmail
        ? "users:user_id(display_name, email, user_profiles(nickname)), volunteer:volunteer_id(display_name, email)"
        : `${USER_NAME_SELECT}, volunteer:volunteer_id(display_name)`;
      let query = supabase!
        .from("conversations")
        .select(`*, ${who}`)
        .order("created_at", { ascending: false });
      if (role === "voluntario") {
        // voluntário vê o que atendeu (e o que ele mesmo abriu), nunca a fila de outros aqui
        query = query.or(`volunteer_id.eq.${uid},user_id.eq.${uid}`);
      } else if (!isStaff) {
        query = query.eq("user_id", uid);
      }
      return query;
    };
    let { data, error } = await build(isStaff);
    if (error && isStaff) ({ data, error } = await build(false)); // coluna email ainda não existe
    if (error) throw new Error(error.message);
    return ok(
      (data || []).map((c: any) => ({
        ...c,
        anonymous_name: userAlias(c),
        volunteer_display_name: c.volunteer?.display_name,
        ...(isStaff
          ? {
              user_real_name: c.users?.display_name,
              user_email: c.users?.email,
              volunteer_email: c.volunteer?.email,
            }
          : {}),
      })),
    ) as T;
  }

  if (cleanPath === "/conversations/volunteer/queue") {
    const { data, error } = await supabase
      .from("conversations")
      .select(`*, ${USER_NAME_SELECT}`)
      .eq("status", "aguardando")
      .gte("created_at", waitCutoff())
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ok(
      (data || []).map((c: any) => ({
        ...c,
        anonymous_name: userAlias(c),
      }))
    ) as T;
  }

  const convMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)$/i);
  if (convMatch && method === "GET") {
    const convId = convMatch[1];
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select(`*, ${USER_NAME_SELECT}, volunteer:volunteer_id(display_name)`)
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
      anonymous_name: userAlias(conv),
      volunteer_display_name: conv.volunteer?.display_name,
      messages: msgs || [],
    }) as T;
  }

  const msgMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/messages$/i);
  if (msgMatch && method === "POST") {
    const convId = msgMatch[1];
    const { data: authData } = await supabase.auth.getUser();
    const { data: convRow } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", convId)
      .maybeSingle();
    if (convRow && ["encerrada", "arquivada"].includes(convRow.status)) {
      throw new Error("Esta conversa foi encerrada e não aceita novas mensagens.");
    }
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
    await broadcast(`conversation:${convId}`, "message", data);
    return ok(data) as T;
  }

  const typingMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/typing$/i);
  if (typingMatch && method === "POST") {
    const { data: authData } = await supabase.auth.getUser();
    await broadcast(`conversation:${typingMatch[1]}`, "typing", {
      userId: authData?.user?.id,
      alias: await myAlias(),
      typing: !!payload.typing,
    });
    return ok({ ok: true }) as T;
  }

  const acceptMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/accept$/i);
  if (acceptMatch && method === "POST") {
    const convId = acceptMatch[1];
    const { data: rpcData, error: rpcError } = await supabase.rpc("accept_support_conversation", {
      p_conversation_id: convId,
    });
    if (!rpcError && rpcData) {
      await broadcast(`conversation:${convId}`, "status", { status: "ativa" });
      await queueChanged();
      return ok(rpcData) as T;
    }

    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("conversations")
      .update({
        status: "ativa",
        volunteer_id: authData.user?.id,
        started_at: new Date().toISOString(),
      })
      .eq("id", convId)
      .eq("status", "aguardando")
      .gte("created_at", waitCutoff())
      .select()
      .single();
    if (error) throw new Error("Este atendimento já foi aceito por outra pessoa ou não está mais na fila.");
    await broadcast(`conversation:${convId}`, "status", { status: "ativa" });
    await queueChanged();
    return ok(data) as T;
  }

  const closeMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/close$/i);
  if (closeMatch && method === "POST") {
    const convId = closeMatch[1];
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("close_support_conversation", {
      p_conversation_id: convId,
      p_reason: payload.reason || "usuario_encerrou",
      p_notes: payload.notes || null,
    });

    if (rpcErr || !rpcRes) {
      // RPC indisponível: fecha direto e grava o prontuário manualmente
      const { data: conv } = await supabase
        .from("conversations")
        .select("user_id, volunteer_id")
        .eq("id", convId)
        .maybeSingle();
      const { error: updErr } = await supabase
        .from("conversations")
        .update({
          status: "encerrada",
          ended_at: new Date().toISOString(),
          closed_reason: payload.reason,
        })
        .eq("id", convId);
      if (updErr) throw new Error(updErr.message);
      if (payload.notes && conv?.volunteer_id) {
        await supabase.from("care_records").insert({
          user_id: conv.user_id,
          volunteer_id: conv.volunteer_id,
          conversation_id: convId,
          summary: payload.notes,
        });
      }
    }

    await broadcast(`conversation:${convId}`, "status", { status: "encerrada" });
    await queueChanged();
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
    const counts = new Map<string, number>();
    const { data: countRows } = await supabase.rpc("community_member_counts");
    (countRows || []).forEach((r: any) => counts.set(r.community_id, Number(r.member_count)));
    return ok(
      (data || []).map((c: any) => ({
        ...c,
        member_count: counts.get(c.id) ?? 0,
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
      .is("deleted_at", null)
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

  // 5a. CANDIDATURAS (voluntário <- usuário, moderador <- voluntário) & DENÚNCIAS
  const appKinds: Record<string, "voluntario" | "moderador"> = {
    "/admin/volunteers": "voluntario",
    "/admin/moderators": "moderador",
  };
  const appMatch = cleanPath.match(
    /^(\/admin\/(?:volunteers|moderators))\/(applications\/me|applications\/([a-f0-9-]+)|applications|apply|([a-f0-9-]+)\/(approve|reject))$/i,
  );
  if (appMatch) {
    const kind = appKinds[appMatch[1]];
    const sub = appMatch[2];
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    const sel = "*, users:user_id(display_name, role)";
    const kindFilter = (q: any) =>
      kind === "moderador" ? q.eq("kind", "moderador") : q.or("kind.is.null,kind.eq.voluntario");

    if (sub === "apply" && method === "POST") {
      const { data: dup } = await kindFilter(
        supabase.from("volunteer_applications").select("id").eq("user_id", uid).eq("status", "pendente"),
      ).maybeSingle();
      if (dup) throw new Error("Você já tem uma candidatura em análise.");
      const { data, error } = await supabase
        .from("volunteer_applications")
        .insert({ user_id: uid, kind, motivation: payload.motivation, experience: payload.experience })
        .select(sel)
        .single();
      if (error) throw new Error(error.message);
      return ok(data) as T;
    }

    if (sub === "applications/me") {
      const { data } = await kindFilter(
        supabase
          .from("volunteer_applications")
          .select(sel)
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1),
      ).maybeSingle();
      if (data) return ok(data) as T;
      const { data: me } = await supabase.from("users").select("role").eq("id", uid).maybeSingle();
      const already =
        kind === "voluntario"
          ? ["voluntario", "moderador", "administrador"].includes(me?.role)
          : ["moderador", "administrador"].includes(me?.role);
      if (already) return ok({ id: "self", status: "aprovada", created_at: new Date().toISOString() }) as T;
      throw new Error("Nenhuma candidatura encontrada.");
    }

    if (sub === "applications" && method === "GET") {
      const { data, error } = await kindFilter(
        supabase.from("volunteer_applications").select(sel).order("created_at", { ascending: false }),
      );
      if (error) throw new Error(error.message);
      return ok(data || []) as T;
    }

    if (appMatch[3] && method === "GET") {
      const { data, error } = await supabase
        .from("volunteer_applications")
        .select(sel)
        .eq("id", appMatch[3])
        .single();
      if (error) throw new Error(error.message);
      return ok(data) as T;
    }

    if (appMatch[4] && method === "POST") {
      const approved = appMatch[5].toLowerCase() === "approve";
      const { error } = await supabase.rpc("review_application", {
        p_application_id: appMatch[4],
        p_approved: approved,
        p_decision: payload.decision || null,
      });
      if (error) throw new Error(error.message);
      return ok({ ok: true }) as T;
    }
  }

  if (cleanPath === "/admin/volunteers/availability" && method === "PATCH") {
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("volunteer_profiles")
      .upsert({
        user_id: authData.user?.id,
        availability_status: payload.status,
        last_seen_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return ok({ status: payload.status }) as T;
  }

  const repAdminMatch = cleanPath.match(/^\/reports\/admin\/reports(?:\/([a-f0-9-]+))?$/i);
  const repSel = "*, reporter:reporter_id(display_name), handler:handled_by(display_name)";
  const mapRep = (r: any) => ({
    ...r,
    reporterAlias: r.reporter?.display_name ?? "Pessoa denunciante",
    reported_alias: r.reported_alias ?? r.target_id,
  });
  if (repAdminMatch && method === "GET") {
    if (repAdminMatch[1]) {
      const { data, error } = await supabase
        .from("reports")
        .select(repSel)
        .eq("id", repAdminMatch[1])
        .single();
      if (error) throw new Error(error.message);
      return ok(mapRep(data)) as T;
    }
    const { data, error } = await supabase
      .from("reports")
      .select(repSel)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ok((data || []).map(mapRep)) as T;
  }
  if (repAdminMatch && repAdminMatch[1] && method === "PATCH") {
    const { error } = await supabase
      .from("reports")
      .update({
        status: payload.status,
        decision: payload.decision || null,
        handled_by: (await supabase.auth.getUser()).data.user?.id,
        updated_at: new Date().toISOString(),
        resolved_at: ["resolvido", "arquivado"].includes(payload.status) ? new Date().toISOString() : null,
      })
      .eq("id", repAdminMatch[1]);
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }
  const repActionMatch = cleanPath.match(/^\/reports\/admin\/reports\/([a-f0-9-]+)\/action$/i);
  if (repActionMatch && method === "POST") {
    const { error } = await supabase.rpc("moderation_action", {
      p_report_id: repActionMatch[1],
      p_action: payload.action,
      p_reason: payload.reason || null,
    });
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }
  if (repAdminMatch && repAdminMatch[1] && method === "DELETE") {
    const { error } = await supabase.from("reports").delete().eq("id", repAdminMatch[1]);
    if (error) throw new Error(error.message);
    await logAudit("moderacao.denuncia_excluida", "denuncia", repAdminMatch[1]);
    return ok({ ok: true }) as T;
  }
  const repRateMatch = cleanPath.match(/^\/reports\/([a-f0-9-]+)\/rating$/i);
  if (repRateMatch && method === "POST") {
    const { error } = await supabase.rpc("rate_report", {
      p_report_id: repRateMatch[1],
      p_rating: Number(payload.rating),
      p_comment: payload.comment || null,
    });
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }
  if (cleanPath === "/moderators/ratings" && method === "GET") {
    const { data, error } = await supabase
      .from("reports")
      .select("id, handled_by, resolution_rating, resolution_comment, resolved_at, created_at, reason")
      .not("resolution_rating", "is", null)
      .not("handled_by", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((data || []).map((r: any) => r.handled_by)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: us } = await supabase.from("users").select("id, display_name").in("id", ids);
      (us || []).forEach((u: any) => names.set(u.id, u.display_name));
    }
    return ok(
      (data || []).map((r: any) => ({
        id: r.id,
        volunteer_id: r.handled_by,
        volunteer_name: names.get(r.handled_by) ?? "Moderador",
        user_alias: r.reason,
        rating: r.resolution_rating,
        rating_comment: r.resolution_comment,
        ended_at: r.resolved_at,
        created_at: r.created_at,
      })),
    ) as T;
  }
  if (cleanPath === "/reports/my" && method === "GET") {
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("reports")
      .select("*, handler:handled_by(display_name)")
      .eq("reporter_id", authData.user?.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ok(data || []) as T;
  }

  // 5b. ADMIN: usuários, grupos e relatórios de voluntários
  const userAdminMatch = cleanPath.match(/^\/users\/admin\/([a-f0-9-]+)(?:\/(role|ban))?$/i);
  if (userAdminMatch) {
    const uid = userAdminMatch[1];
    const action = userAdminMatch[2];
    if (action === "role" && method === "PATCH") {
      const { data, error } = await supabase
        .from("users")
        .update({ role: payload.role })
        .eq("id", uid)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return ok(data) as T;
    }
    if (action === "ban" && method === "POST") {
      const { data, error } = await supabase
        .from("users")
        .update({ status: payload.ban ? "banido" : "ativo" })
        .eq("id", uid)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return ok(data) as T;
    }
    if (!action && method === "GET") {
      const { data, error } = await supabase
        .from("users")
        .select("*, user_profiles(*)")
        .eq("id", uid)
        .single();
      if (error) throw new Error(error.message);
      return ok({ ...data, profile: data.user_profiles }) as T;
    }
  }

  if (cleanPath === "/communities/admin" && method === "GET") {
    const { data, error } = await supabase
      .from("communities")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: members } = await supabase
      .from("community_members")
      .select("community_id")
      .eq("status", "ativo");
    const { data: msgs } = await supabase
      .from("community_messages")
      .select("community_id")
      .is("deleted_at", null);
    const count = (rows: any[] | null, id: string) =>
      (rows || []).filter((r) => r.community_id === id).length;
    return ok(
      (data || []).map((c: any) => ({
        ...c,
        member_count: count(members, c.id),
        message_count: count(msgs, c.id),
      })),
    ) as T;
  }

  if (cleanPath === "/communities/admin" && method === "POST") {
    const { data, error } = await supabase
      .from("communities")
      .insert({ name: payload.name, description: payload.description || "", rules_json: payload.rules || [] })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok(data) as T;
  }

  const commAdminMsg = cleanPath.match(/^\/communities\/admin\/messages\/([a-f0-9-]+)$/i);
  if (commAdminMsg && method === "DELETE") {
    const { error } = await supabase
      .from("community_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", commAdminMsg[1]);
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }

  const commAdminMember = cleanPath.match(
    /^\/communities\/admin\/([a-f0-9-]+)\/members\/([a-f0-9-]+)$/i,
  );
  if (commAdminMember && method === "PATCH") {
    const { error } = await supabase
      .from("community_members")
      .update({ status: payload.status })
      .eq("community_id", commAdminMember[1])
      .eq("user_id", commAdminMember[2]);
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }

  const commAdmin = cleanPath.match(/^\/communities\/admin\/([a-f0-9-]+)$/i);
  if (commAdmin && method === "GET") {
    const id = commAdmin[1];
    const { data: c, error } = await supabase.from("communities").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    const { data: members } = await supabase
      .from("community_members")
      .select("*, users:user_id(display_name, role)")
      .eq("community_id", id);
    const { data: msgs } = await supabase
      .from("community_messages")
      .select("id, community_id, sender_id, alias_snapshot, body, body_encrypted, created_at")
      .eq("community_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300);
    const feed = [...(msgs || [])].reverse();
    return ok({
      ...c,
      messages: feed,
      member_count: (members || []).filter((m: any) => m.status === "ativo").length,
      message_count: (msgs || []).length,
      members: (members || []).map((m: any) => ({
        ...m,
        display_name: m.users?.display_name,
        platform_role: m.users?.role,
        messageCount: (msgs || []).filter((x: any) => x.sender_id === m.user_id).length,
      })),
    }) as T;
  }
  if (commAdmin && method === "PATCH") {
    const patch: Record<string, any> = {};
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.description !== undefined) patch.description = payload.description;
    if (payload.status !== undefined) patch.status = payload.status;
    const { data, error } = await supabase
      .from("communities")
      .update(patch)
      .eq("id", commAdmin[1])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok(data) as T;
  }

  const vrMatch = cleanPath.match(/^\/admin\/volunteers\/reports(\/me|\/([a-f0-9-]+)\/respond)?$/i);
  if (vrMatch) {
    const { data: authData } = await supabase.auth.getUser();
    const vrSel = "*, volunteer:volunteer_id(display_name), target:target_user_id(display_name)";
    const mapVr = (r: any) => ({
      ...r,
      volunteer_name: r.volunteer?.display_name,
      target_user_name: r.target?.display_name,
    });
    if (!vrMatch[1] && method === "POST") {
      const { data, error } = await supabase
        .from("volunteer_reports")
        .insert({
          volunteer_id: authData.user?.id,
          target_user_id: payload.targetUserId || null,
          conversation_id: payload.conversationId || null,
          title: payload.title,
          description: payload.description,
        })
        .select(vrSel)
        .single();
      if (error) throw new Error(error.message);
      return ok(mapVr(data)) as T;
    }
    if (vrMatch[1] === "/me") {
      const { data, error } = await supabase
        .from("volunteer_reports")
        .select(vrSel)
        .eq("volunteer_id", authData.user?.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ok((data || []).map(mapVr)) as T;
    }
    if (!vrMatch[1] && method === "GET") {
      const { data, error } = await supabase
        .from("volunteer_reports")
        .select(vrSel)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ok((data || []).map(mapVr)) as T;
    }
    if (vrMatch[2] && method === "POST") {
      const { data, error } = await supabase
        .from("volunteer_reports")
        .update({
          admin_feedback: payload.adminFeedback,
          status: "respondido",
          updated_at: new Date().toISOString(),
        })
        .eq("id", vrMatch[2])
        .select(vrSel)
        .single();
      if (error) throw new Error(error.message);
      return ok(mapVr(data)) as T;
    }
  }

  if (cleanPath === "/admin/logs" && method === "GET") {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((data || []).map((l: any) => l.actor_id).filter(Boolean)));
    const names = new Map<string, { name: string; role: string }>();
    if (ids.length) {
      const { data: us } = await supabase.from("users").select("id, display_name, role").in("id", ids);
      (us || []).forEach((u: any) => names.set(u.id, { name: u.display_name, role: u.role }));
    }
    return ok(
      (data || []).map((l: any) => ({
        ...l,
        actor_name: names.get(l.actor_id)?.name ?? null,
        actor_role: names.get(l.actor_id)?.role ?? null,
      })),
    ) as T;
  }

  const themesMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/themes$/i);
  if (themesMatch && method === "GET") {
    const { data, error } = await supabase.rpc("get_chat_themes", { p_conversation_id: themesMatch[1] });
    if (error) return ok({}) as T; // sem a função no banco: só não mostra a cor da outra pessoa
    return ok(data ?? {}) as T;
  }

  const ratingMatch = cleanPath.match(/^\/conversations\/([a-f0-9-]+)\/rating$/i);
  if (ratingMatch && method === "POST") {
    const rating = Math.min(5, Math.max(1, Number(payload.rating) || 0));
    const { error } = await supabase
      .from("conversations")
      .update({ rating, rating_comment: payload.comment || null })
      .eq("id", ratingMatch[1]);
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }

  // 5c. Perfil, consentimentos (LGPD), notificações, chat da equipe, identidade, avaliações
  if (cleanPath === "/users/me/preferences" && method === "PATCH") {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) throw new Error("Não autenticado");
    const row: Record<string, any> = { user_id: uid, updated_at: new Date().toISOString() };
    if (payload.nickname !== undefined) {
      const nick = String(payload.nickname).trim();
      if (nick.length < 2 || nick.length > 50) throw new Error("O apelido deve ter entre 2 e 50 caracteres.");
      row.nickname = nick;
    }
    if (payload.preferences && typeof payload.preferences === "object") {
      const { data: cur } = await supabase.from("user_profiles").select("preferences_json").eq("user_id", uid).maybeSingle();
      row.preferences_json = { ...(cur?.preferences_json ?? {}), ...payload.preferences };
    }
    const { error } = await supabase.from("user_profiles").upsert(row);
    if (error) throw new Error(error.message);
    if (row.nickname) await supabase.auth.updateUser({ data: { nickname: row.nickname } });
    return ok({ ok: true }) as T;
  }

  if (cleanPath === "/users/me/consent" && method === "POST") {
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("consents").insert({
      user_id: authData.user?.id,
      type: String(payload.type || "").slice(0, 100),
      version: String(payload.version || "1.0").slice(0, 20),
    });
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }

  const notifRead = cleanPath.match(/^\/notifications\/([a-f0-9-]+)\/read$/i);
  if (notifRead && method === "PATCH") {
    const { error } = await supabase
      .from("notifications")
      .update({ status: "lida", read_at: new Date().toISOString() })
      .eq("id", notifRead[1]);
    if (error) throw new Error(error.message);
    return ok({ ok: true }) as T;
  }

  if (cleanPath === "/conversations/team" && method === "POST") {
    const { data: authData } = await supabase.auth.getUser();
    const me = authData.user?.id;
    const other = payload.recipientId;
    if (!me || !other) throw new Error("Destinatário inválido.");
    const sel = `*, ${USER_NAME_SELECT}, volunteer:volunteer_id(display_name)`;
    const { data: existing } = await supabase
      .from("conversations")
      .select(sel)
      .eq("is_team_chat", true)
      .in("status", ["ativa", "sinalizada"])
      .or(`and(user_id.eq.${me},volunteer_id.eq.${other}),and(user_id.eq.${other},volunteer_id.eq.${me})`)
      .limit(1)
      .maybeSingle();
    if (existing) return ok({ ...existing, anonymous_name: userAlias(existing) }) as T;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: me, volunteer_id: other, status: "ativa", is_team_chat: true, priority: "normal", started_at: new Date().toISOString() })
      .select(sel)
      .single();
    if (error) throw new Error(error.message);
    return ok({ ...data, anonymous_name: userAlias(data) }) as T;
  }

  const revealMatch = cleanPath.match(/^\/communities\/messages\/([a-f0-9-]+)\/reveal-identity$/i);
  if (revealMatch && method === "POST") {
    const reason = String(payload.reason || "").trim();
    if (reason.length < 10) throw new Error("Descreva o motivo (mínimo 10 caracteres). Essa consulta fica registrada.");
    const { data: authData } = await supabase.auth.getUser();
    const { data: me } = await supabase.from("users").select("role").eq("id", authData.user?.id).maybeSingle();
    if (!["moderador", "administrador"].includes(me?.role)) throw new Error("Apenas a moderação pode consultar identidades.");
    const { data: msg, error } = await supabase
      .from("community_messages")
      .select("id, sender_id, alias_snapshot")
      .eq("id", revealMatch[1])
      .single();
    if (error) throw new Error(error.message);
    const { data: u } = await supabase.from("users").select("display_name").eq("id", msg.sender_id).maybeSingle();
    await logAudit("grupo.identidade_revelada", "mensagem", revealMatch[1], { motivo: reason });
    return ok({ message_id: msg.id, alias: msg.alias_snapshot, display_name: u?.display_name ?? "", email: "" }) as T;
  }

  if (cleanPath === "/volunteers/ratings" && method === "GET") {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    const { data: me } = await supabase.from("users").select("role").eq("id", uid).maybeSingle();
    let q = supabase
      .from("conversations")
      .select(`id, volunteer_id, rating, rating_comment, ended_at, created_at, ${USER_NAME_SELECT}`)
      .not("rating", "is", null)
      .not("volunteer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (me?.role === "voluntario") q = q.eq("volunteer_id", uid);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((data || []).map((r: any) => r.volunteer_id)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: us } = await supabase.from("users").select("id, display_name").in("id", ids);
      (us || []).forEach((u: any) => names.set(u.id, u.display_name));
    }
    return ok(
      (data || []).map((r: any) => ({
        ...r,
        volunteer_name: names.get(r.volunteer_id) ?? "Voluntário",
        user_alias: userAlias(r),
      })),
    ) as T;
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
        target_id: payload.targetId ? String(payload.targetId) : null,
        reported_alias: payload.reportedAlias || null,
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
      .eq("status", "ativa")
      .or("is_team_chat.is.null,is_team_chat.eq.false");
    const { count: pendingChats } = await supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "aguardando")
      .gte("created_at", waitCutoff());
    const since = new Date(Date.now() - 90_000).toISOString();
    const { count: onlineVolunteers } = await supabase
      .from("volunteer_profiles")
      .select("*", { count: "exact", head: true })
      .eq("availability_status", "online")
      .gte("last_seen_at", since);
    const { data: waitingRows } = await supabase
      .from("conversations")
      .select("created_at")
      .eq("status", "aguardando")
      .gte("created_at", waitCutoff());
    const avgWaitMinutes = (waitingRows || []).length
      ? Math.round(
          (waitingRows || []).reduce(
            (sum: number, r: any) => sum + (Date.now() - new Date(r.created_at).getTime()) / 60000,
            0,
          ) / (waitingRows || []).length,
        )
      : 0;

    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: recent } = await supabase
      .from("conversations")
      .select("created_at")
      .gte("created_at", weekAgo);
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400_000);
      const key = d.toDateString();
      return {
        day: dayNames[d.getDay()],
        conversations: (recent || []).filter((r: any) => new Date(r.created_at).toDateString() === key).length,
      };
    });
    const today = new Date().toDateString();
    const { data: rated } = await supabase
      .from("conversations")
      .select("rating")
      .not("rating", "is", null);
    const satisfaction = (rated || []).length
      ? Math.round(
          ((rated || []).reduce((sum: number, r: any) => sum + Number(r.rating), 0) /
            (rated || []).length /
            5) *
            100,
        )
      : 0;

    return ok({
      totalUsersAllTime: totalUsers || 0,
      activeChats: activeChats || 0,
      pendingChats: pendingChats || 0,
      avgWaitMinutes,
      onlineVolunteers: onlineVolunteers || 0,
      total: (recent || []).filter((r: any) => new Date(r.created_at).toDateString() === today).length,
      satisfactionRate: satisfaction,
      weeklyConversations: weekly,
    }) as T;
  }

  return null;
}

// ───────────────────────── AUDITORIA ─────────────────────────
const UUID = "[a-f0-9-]{36}";
const AUDIT_RULES: Array<{ method: string; re: RegExp; action: string; entity: string; skip?: (payload: any) => boolean }> = [
  { method: "POST", re: /^\/auth\/login$/, action: "login", entity: "sessao" },
  { method: "POST", re: /^\/auth\/register$/, action: "cadastro", entity: "usuario" },
  { method: "POST", re: /^\/auth\/password\/reset$/, action: "senha.recuperacao", entity: "usuario" },
  { method: "POST", re: /^\/conversations$/, action: "fila.entrada", entity: "atendimento" },
  { method: "POST", re: new RegExp(`^/conversations/(${UUID})/accept$`), action: "atendimento.aceito", entity: "atendimento" },
  { method: "POST", re: new RegExp(`^/conversations/(${UUID})/close$`), action: "atendimento.encerrado", entity: "atendimento" },
  { method: "POST", re: new RegExp(`^/conversations/(${UUID})/risk-flags$`), action: "risco.sinalizado", entity: "atendimento" },
  { method: "POST", re: new RegExp(`^/conversations/(${UUID})/rating$`), action: "atendimento.avaliado", entity: "atendimento" },
  { method: "POST", re: new RegExp(`^/communities/(${UUID})/join$`), action: "grupo.entrada", entity: "grupo" },
  { method: "POST", re: new RegExp(`^/communities/(${UUID})/leave$`), action: "grupo.saida", entity: "grupo" },
  { method: "POST", re: /^\/reports$/, action: "denuncia.criada", entity: "denuncia" },
  { method: "PATCH", re: new RegExp(`^/reports/admin/reports/(${UUID})$`), action: "denuncia.atualizada", entity: "denuncia" },
  { method: "POST", re: /^\/admin\/(volunteers|moderators)\/apply$/, action: "candidatura.enviada", entity: "candidatura" },
  { method: "POST", re: new RegExp(`^/admin/(?:volunteers|moderators)/(${UUID})/approve$`), action: "candidatura.aprovada", entity: "candidatura" },
  { method: "POST", re: new RegExp(`^/admin/(?:volunteers|moderators)/(${UUID})/reject$`), action: "candidatura.recusada", entity: "candidatura" },
  { method: "PATCH", re: new RegExp(`^/users/admin/(${UUID})/role$`), action: "usuario.papel_alterado", entity: "usuario" },
  { method: "POST", re: new RegExp(`^/users/admin/(${UUID})/ban$`), action: "usuario.suspensao", entity: "usuario" },
  { method: "POST", re: /^\/communities\/admin$/, action: "grupo.criado", entity: "grupo" },
  { method: "PATCH", re: new RegExp(`^/communities/admin/(${UUID})$`), action: "grupo.atualizado", entity: "grupo" },
  { method: "PATCH", re: new RegExp(`^/communities/admin/(${UUID})/members/(${UUID})$`), action: "grupo.membro_atualizado", entity: "grupo" },
  { method: "DELETE", re: new RegExp(`^/communities/admin/messages/(${UUID})$`), action: "grupo.mensagem_removida", entity: "mensagem" },
  { method: "POST", re: /^\/admin\/volunteers\/reports$/, action: "relatorio.enviado", entity: "relatorio" },
  { method: "POST", re: new RegExp(`^/admin/volunteers/reports/(${UUID})/respond$`), action: "relatorio.respondido", entity: "relatorio" },
  { method: "POST", re: new RegExp(`^/conversations/(${UUID})/messages$`), action: "atendimento.mensagem", entity: "atendimento" },
  { method: "POST", re: new RegExp(`^/communities/(${UUID})/messages$`), action: "grupo.mensagem", entity: "grupo" },
  { method: "POST", re: new RegExp(`^/reports/admin/reports/(${UUID})/action$`), action: "moderacao.medida", entity: "denuncia" },
  { method: "POST", re: new RegExp(`^/reports/(${UUID})/rating$`), action: "denuncia.avaliada", entity: "denuncia" },
  { method: "POST", re: /^\/auth\/anonymous$/, action: "login.anonimo", entity: "sessao" },
  { method: "POST", re: /^\/auth\/resend-confirmation$/, action: "cadastro.reenvio_confirmacao", entity: "usuario" },
  { method: "PATCH", re: /^\/admin\/volunteers\/availability$/, action: "disponibilidade.alterada", entity: "voluntario", skip: (p: any) => !!p?.heartbeat },
];

function auditMetadata(payload: any): Record<string, unknown> {
  const keep = ["role", "status", "ban", "reason", "name", "decision", "level", "title", "targetType"];
  const meta: Record<string, unknown> = {};
  for (const k of keep) if (payload && payload[k] !== undefined) meta[k] = payload[k];
  // mensagens: registra só o tamanho, nunca o conteúdo (privacidade)
  if (typeof payload?.text === "string") meta.caracteres = payload.text.length;
  return meta;
}

async function writeAudit(cleanPath: string, method: string, payload: any) {
  const rule = AUDIT_RULES.find((r) => r.method === method && r.re.test(cleanPath));
  if (!rule || rule.skip?.(payload)) return;
  const m = cleanPath.match(rule.re);
  const entityId = m && m[1] && /^[a-f0-9-]{36}$/i.test(m[1]) ? m[1] : null;
  await logAudit(rule.action, rule.entity, entityId, { ...auditMetadata(payload), path: cleanPath });
}

export async function handleSupabaseRequest<T>(
  path: string,
  method = "GET",
  body?: any,
): Promise<T | null> {
  const result = await handleInner<T>(path, method, body);
  if (result !== null && method !== "GET") {
    const cleanPath = path.replace(/^\/api/, "").replace(/\/$/, "");
    let payload: any = {};
    try {
      payload = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
    } catch {
      payload = {};
    }
    void writeAudit(cleanPath, method, payload);
  }
  return result;
}

