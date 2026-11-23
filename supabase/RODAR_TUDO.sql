-- ================= fix_comunidades.sql =================
-- Rode UMA vez no Supabase: SQL Editor -> New query -> Run.
-- Alinha community_messages / community_members com o app e libera permissões.

ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS body_encrypted TEXT;
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS alias_snapshot VARCHAR(80);
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS sender_id UUID;
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.community_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.community_messages ALTER COLUMN alias_snapshot DROP NOT NULL;

ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS alias VARCHAR(80);
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'membro';
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ativo';
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT SELECT, INSERT ON public.community_messages TO authenticated;
GRANT SELECT ON public.communities TO anon, authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_messages_select" ON public.community_messages;
CREATE POLICY "community_messages_select" ON public.community_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.community_members m
          WHERE m.community_id = community_messages.community_id
            AND m.user_id = auth.uid() AND m.status = 'ativo')
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador','administrador'))
);
DROP POLICY IF EXISTS "community_messages_insert" ON public.community_messages;
CREATE POLICY "community_messages_insert" ON public.community_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.community_members m
              WHERE m.community_id = community_messages.community_id
                AND m.user_id = auth.uid() AND m.status = 'ativo')
);

ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_members_access" ON public.community_members;
CREATE POLICY "community_members_access" ON public.community_members FOR ALL
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador','administrador')))
WITH CHECK (auth.uid() = user_id);

-- Recarrega o cache do PostgREST (resolve "Could not find the 'body' column ... schema cache")
NOTIFY pgrst, 'reload schema';

-- ================= fix_atendimento.sql =================
-- Rode UMA vez no Supabase (SQL Editor). Complementa fix_comunidades.sql.
-- Fila, chat voluntario<->usuario, prontuarios, denuncias, candidaturas e painel admin.

-- ===== mensagens de atendimento =====
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS body_encrypted TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.messages ALTER COLUMN body DROP NOT NULL;

-- ===== candidaturas: voluntario (usuario->voluntario) e moderador (voluntario->moderador) =====
ALTER TABLE public.volunteer_applications ADD COLUMN IF NOT EXISTS kind VARCHAR(20) DEFAULT 'voluntario';
ALTER TABLE public.volunteer_applications ADD COLUMN IF NOT EXISTS decision TEXT;

-- ===== denuncias aceitam alias (texto) e decisao da moderacao =====
ALTER TABLE public.reports ALTER COLUMN target_id DROP NOT NULL;
ALTER TABLE public.reports ALTER COLUMN target_id TYPE TEXT USING target_id::text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reported_alias TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS decision TEXT;

-- ===== relatorios de voluntarios: status livre =====
ALTER TABLE public.volunteer_reports ALTER COLUMN status TYPE VARCHAR(50);

-- ===== aprovar/recusar candidatura (muda o papel com seguranca) =====
CREATE OR REPLACE FUNCTION public.review_application(
  p_application_id UUID, p_approved BOOLEAN, p_decision TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_role public.user_role;
  v_app RECORD;
BEGIN
  SELECT role INTO v_actor_role FROM public.users WHERE id = auth.uid();
  SELECT * INTO v_app FROM public.volunteer_applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Candidatura nao encontrada'; END IF;

  IF COALESCE(v_app.kind, 'voluntario') = 'moderador' THEN
    IF v_actor_role <> 'administrador' THEN
      RAISE EXCEPTION 'Apenas administradores aprovam moderadores';
    END IF;
  ELSIF v_actor_role NOT IN ('moderador', 'administrador') THEN
    RAISE EXCEPTION 'Apenas moderadores ou administradores aprovam voluntarios';
  END IF;

  UPDATE public.volunteer_applications
     SET status = CASE WHEN p_approved THEN 'aprovada' ELSE 'rejeitada' END::public.application_status,
         reviewer_id = auth.uid(), reviewed_at = now(), decision = p_decision
   WHERE id = p_application_id;

  IF p_approved THEN
    IF COALESCE(v_app.kind, 'voluntario') = 'moderador' THEN
      UPDATE public.users SET role = 'moderador' WHERE id = v_app.user_id;
    ELSE
      UPDATE public.users SET role = 'voluntario'
       WHERE id = v_app.user_id AND role IN ('cadastrado', 'anonimo');
      INSERT INTO public.volunteer_profiles (user_id) VALUES (v_app.user_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ===== fila (recria, caso a versao do banco seja antiga) =====
CREATE OR REPLACE FUNCTION public.join_support_queue() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid(); v_conv RECORD; v_pos INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  SELECT * INTO v_conv FROM public.conversations
   WHERE user_id = v_user AND status IN ('aguardando','ativa') AND is_team_chat IS NOT TRUE
   ORDER BY created_at DESC LIMIT 1;
  IF v_conv.id IS NULL THEN
    INSERT INTO public.conversations (user_id, status, priority)
    VALUES (v_user, 'aguardando', 'normal') RETURNING * INTO v_conv;
  END IF;
  SELECT count(*) INTO v_pos FROM public.conversations
   WHERE status = 'aguardando' AND created_at <= v_conv.created_at;
  RETURN jsonb_build_object('id', v_conv.id, 'status', v_conv.status,
    'position', COALESCE(v_pos,1), 'estimated_wait_minutes', GREATEST(2, COALESCE(v_pos,1)*3),
    'created_at', v_conv.created_at);
END $$;

-- ===== permissoes =====
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.care_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.volunteer_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.volunteer_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.volunteer_profiles TO authenticated;
GRANT SELECT, INSERT ON public.risk_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.communities TO authenticated;
GRANT SELECT, UPDATE ON public.community_messages TO authenticated;
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_application(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_support_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_support_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_support_conversation(UUID, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_care_history(UUID) TO authenticated;

-- ===== RLS =====
-- mensagens do atendimento: participantes (usuario/voluntario) leem e escrevem
DROP POLICY IF EXISTS "messages_access" ON public.messages;
CREATE POLICY "messages_access" ON public.messages FOR ALL
USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (
  c.user_id = auth.uid() OR c.volunteer_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador','administrador')))))
WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.conversations c
  WHERE c.id = messages.conversation_id AND (c.user_id = auth.uid() OR c.volunteer_id = auth.uid())));

-- fila: voluntario enxerga quem aguarda; usuario so as proprias conversas
DROP POLICY IF EXISTS "conversations_access" ON public.conversations;
CREATE POLICY "conversations_access" ON public.conversations FOR ALL USING (
  auth.uid() = user_id OR auth.uid() = volunteer_id
  OR (status = 'aguardando' AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario','moderador','administrador')))
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador','administrador'))
);

-- candidaturas: quem se candidata cria a sua
DROP POLICY IF EXISTS "volunteer_applications_insert_own" ON public.volunteer_applications;
CREATE POLICY "volunteer_applications_insert_own" ON public.volunteer_applications FOR INSERT WITH CHECK (auth.uid() = user_id);

-- admin ve grupos inativos, gerencia grupos e modera mensagens
DROP POLICY IF EXISTS "communities_select" ON public.communities;
CREATE POLICY "communities_select" ON public.communities FOR SELECT USING (
  status = 'ativo' OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'administrador'));
DROP POLICY IF EXISTS "communities_admin_write" ON public.communities;
CREATE POLICY "communities_admin_write" ON public.communities FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'administrador'));
DROP POLICY IF EXISTS "community_messages_admin_update" ON public.community_messages;
CREATE POLICY "community_messages_admin_update" ON public.community_messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador','administrador')));

-- ===== tempo real do banco (opcional; o app tambem usa broadcast) =====
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN OTHERS THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- presenca real dos voluntarios (heartbeat)
ALTER TABLE public.volunteer_profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';

-- voluntario cria/atualiza o proprio perfil de disponibilidade (upsert do heartbeat)
DROP POLICY IF EXISTS "volunteer_profiles_insert_own" ON public.volunteer_profiles;
CREATE POLICY "volunteer_profiles_insert_own" ON public.volunteer_profiles FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario','moderador','administrador')));
NOTIFY pgrst, 'reload schema';

-- moderador tambem enxerga todos os grupos (inclusive pausados/arquivados)
DROP POLICY IF EXISTS "communities_select" ON public.communities;
CREATE POLICY "communities_select" ON public.communities FOR SELECT USING (
  status = 'ativo' OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador','administrador')));
NOTIFY pgrst, 'reload schema';

-- ================= fix_prontuario_logs.sql =================
-- Rode UMA vez no Supabase (SQL Editor). Pode rodar de novo sem problema.
-- Prontuario (titulo + anexos), avaliacao do atendimento e logs de auditoria.

-- ===== PRONTUARIO =====
ALTER TABLE public.care_records ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.care_records ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Bucket privado para anexos
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('prontuarios', 'prontuarios', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "prontuarios_staff_select" ON storage.objects;
CREATE POLICY "prontuarios_staff_select" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'prontuarios' AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario','moderador','administrador')));

DROP POLICY IF EXISTS "prontuarios_staff_insert" ON storage.objects;
CREATE POLICY "prontuarios_staff_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'prontuarios' AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario','moderador','administrador')));

DROP POLICY IF EXISTS "prontuarios_staff_delete" ON storage.objects;
CREATE POLICY "prontuarios_staff_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'prontuarios' AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario','moderador','administrador')));

-- RPC de historico agora devolve titulo e anexos
CREATE OR REPLACE FUNCTION public.get_patient_care_history(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role public.user_role; v_records JSONB;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('voluntario','moderador','administrador') THEN
    RAISE EXCEPTION 'Apenas a equipe pode consultar o prontuario';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'id', cr.id, 'created_at', cr.created_at, 'risk_level', cr.risk_level, 'title', cr.title,
    'summary', cr.summary, 'action_taken', cr.action_taken, 'attachments', COALESCE(cr.attachments, '[]'::jsonb),
    'volunteer_id', cr.volunteer_id, 'conversation_id', cr.conversation_id,
    'volunteer_name', COALESCE(u.display_name, 'Voluntario')) ORDER BY cr.created_at DESC)
  INTO v_records FROM public.care_records cr LEFT JOIN public.users u ON u.id = cr.volunteer_id
  WHERE cr.user_id = p_user_id;
  RETURN COALESCE(v_records, '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.get_patient_care_history(UUID) TO authenticated;

-- ===== AVALIACAO DO ATENDIMENTO (alimenta "Satisfacao" do admin) =====
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS rating_comment TEXT;

-- ===== LOGS DE AUDITORIA =====
ALTER TABLE public.audit_logs ALTER COLUMN entity_id TYPE TEXT USING entity_id::text;
ALTER TABLE public.audit_logs ALTER COLUMN entity_type DROP NOT NULL;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

DROP POLICY IF EXISTS "audit_logs_insert_own" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_own" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'administrador'));

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);

-- usuario pode avaliar a propria conversa
GRANT UPDATE (rating, rating_comment) ON public.conversations TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ===== MUDANCA DE PAPEL PELO ADMIN =====
-- Quando alguem vira voluntario/moderador/admin, garante o perfil de disponibilidade.
CREATE OR REPLACE FUNCTION public.ensure_staff_profile() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IN ('voluntario','moderador','administrador') THEN
    INSERT INTO public.volunteer_profiles (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ensure_staff_profile ON public.users;
CREATE TRIGGER trg_ensure_staff_profile AFTER UPDATE OF role ON public.users
  FOR EACH ROW WHEN (OLD.role IS DISTINCT FROM NEW.role) EXECUTE FUNCTION public.ensure_staff_profile();

-- (regras de papel: veja fix_recursao_users.sql)


-- ================= promover_contas_teste.sql =================
-- Rode no SQL Editor do Supabase: define o papel de cada conta de teste.
UPDATE public.users SET role = 'voluntario'    WHERE id = (SELECT id FROM auth.users WHERE email = 'teste.voluntario@vidamais.app');
UPDATE public.users SET role = 'moderador'     WHERE id = (SELECT id FROM auth.users WHERE email = 'teste.moderador@vidamais.app');
UPDATE public.users SET role = 'administrador' WHERE id = (SELECT id FROM auth.users WHERE email = 'teste.administrador@vidamais.app');
SELECT u.email, p.role FROM auth.users u JOIN public.users p ON p.id = u.id WHERE u.email LIKE 'teste.%@vidamais.app';


-- ================= conversa encerrada nao aceita mensagens =================
DROP POLICY IF EXISTS "messages_access" ON public.messages;
CREATE POLICY "messages_access" ON public.messages FOR ALL
USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (
  c.user_id = auth.uid() OR c.volunteer_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador','administrador')))))
WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.conversations c
  WHERE c.id = messages.conversation_id
    AND c.status IN ('ativa','sinalizada')
    AND (c.user_id = auth.uid() OR c.volunteer_id = auth.uid())));
NOTIFY pgrst, 'reload schema';

-- ================= contagem real de participantes por grupo =================
CREATE OR REPLACE FUNCTION public.community_member_counts()
RETURNS TABLE(community_id UUID, member_count BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT m.community_id, count(*) FROM public.community_members m WHERE m.status = 'ativo' GROUP BY m.community_id
$$;
GRANT EXECUTE ON FUNCTION public.community_member_counts() TO authenticated;
NOTIFY pgrst, 'reload schema';

-- ================= fix_recursao_users.sql =================
-- Corrige: "infinite recursion detected in policy for relation users"
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- Funcao auxiliar: le o papel de quem esta logado SEM passar pelas regras (RLS),
-- evitando que a regra de "users" consulte a propria tabela "users".
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- Leitura: cada pessoa ve o proprio cadastro; a equipe ve todos.
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (
  auth.uid() = id
  OR public.current_user_role() IN ('voluntario', 'moderador', 'administrador')
);

-- Alteracao: o administrador muda qualquer papel; cada pessoa edita so o proprio
-- cadastro e NAO pode mudar o proprio papel.
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users FOR UPDATE
  USING (auth.uid() = id OR public.current_user_role() = 'administrador')
  WITH CHECK (
    public.current_user_role() = 'administrador'
    OR (auth.uid() = id AND role = public.current_user_role())
  );

NOTIFY pgrst, 'reload schema';

-- ================= fix_lgpd_equipe.sql =================
-- Perfil, LGPD (exportar/excluir), notificacoes, chat da equipe, avaliacoes e identidade.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- Permissoes das tabelas usadas pelas novas telas
GRANT SELECT, INSERT, UPDATE ON public.consents TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;

DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profiles_all_own" ON public.user_profiles;
CREATE POLICY "user_profiles_all_own" ON public.user_profiles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "consents_all_own" ON public.consents;
CREATE POLICY "consents_all_own" ON public.consents FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chat da equipe: mensagens entre voluntarios/moderadores/admins
-- (a regra de mensagens ja libera os dois participantes da conversa)

-- Exclusao de conta (direito de eliminacao - LGPD):
-- anonimiza os dados pessoais e bloqueia o login. Mantem historicos sem identificacao.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  IF (SELECT role FROM public.users WHERE id = uid) = 'administrador'
     AND (SELECT count(*) FROM public.users WHERE role = 'administrador' AND status = 'ativo') <= 1 THEN
    RAISE EXCEPTION 'Voce e o unico administrador. Promova outra pessoa antes de excluir a conta.';
  END IF;

  UPDATE public.users SET display_name = 'Conta excluída', status = 'excluido' WHERE id = uid;
  UPDATE public.user_profiles
     SET nickname = NULL, birth_year = NULL, state = NULL, preferences_json = '{}'::jsonb
   WHERE user_id = uid;
  DELETE FROM public.consents WHERE user_id = uid;
  DELETE FROM public.community_members WHERE user_id = uid;
  UPDATE public.community_messages SET alias_snapshot = 'Conta excluída' WHERE sender_id = uid;

  UPDATE auth.users
     SET banned_until = 'infinity',
         email = 'excluido+' || uid::text || '@vidamais.invalid',
         raw_user_meta_data = '{}'::jsonb
   WHERE id = uid;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_json)
  VALUES (uid, 'conta.excluida', 'usuario', uid::text, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ================= fix_email_usuarios.sql =================
-- Guarda o e-mail em public.users para a equipe ver nome e e-mail reais nas conversas.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;

-- Preenche quem ja existe
UPDATE public.users u
   SET email = a.email
  FROM auth.users a
 WHERE a.id = u.id AND (u.email IS DISTINCT FROM a.email);

-- Novos cadastros ja nascem com e-mail
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_display VARCHAR(100);
  v_role public.user_role;
BEGIN
  v_display := LEFT(COALESCE(NULLIF(new.raw_user_meta_data->>'display_name', ''), 'Apoiado'), 100);
  IF (new.is_anonymous IS TRUE) THEN
    v_role := 'anonimo'::public.user_role;
  ELSE
    v_role := 'cadastrado'::public.user_role;
  END IF;

  INSERT INTO public.users (id, display_name, role, email)
  VALUES (new.id, v_display, v_role, new.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (new.id, COALESCE(NULLIF(new.raw_user_meta_data->>'nickname', ''), v_display))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

-- Mantem o e-mail sincronizado se a pessoa trocar de e-mail
CREATE OR REPLACE FUNCTION public.sync_user_email() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email) EXECUTE FUNCTION public.sync_user_email();

NOTIFY pgrst, 'reload schema';

-- ================= fix_denuncias_moderacao.sql =================
-- Medidas de moderacao, acompanhamento da denuncia e avaliacao da moderacao.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS handled_by UUID;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution_rating SMALLINT CHECK (resolution_rating BETWEEN 1 AND 5);
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution_comment TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS decision TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;

-- A equipe de moderacao pode excluir denuncias (a acao fica nos logs)
DROP POLICY IF EXISTS "reports_delete_staff" ON public.reports;
CREATE POLICY "reports_delete_staff" ON public.reports FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador')));

-- Medidas: advertir, suspender, reativar, remover_mensagem
CREATE OR REPLACE FUNCTION public.moderation_action(p_report_id UUID, p_action TEXT, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
  r RECORD;
  v_target UUID;
  v_msg UUID;
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('moderador', 'administrador') THEN
    RAISE EXCEPTION 'Apenas a moderacao pode aplicar medidas';
  END IF;
  SELECT * INTO r FROM public.reports WHERE id = p_report_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Denuncia nao encontrada'; END IF;

  IF r.target_type = 'mensagem' AND r.target_id ~* '^[0-9a-f-]{36}$' THEN
    v_msg := r.target_id::uuid;
    SELECT sender_id INTO v_target FROM public.community_messages WHERE id = v_msg;
  ELSIF r.target_type = 'usuario' AND r.target_id ~* '^[0-9a-f-]{36}$' THEN
    v_target := r.target_id::uuid;
  END IF;

  IF p_action IN ('advertir', 'suspender', 'reativar') AND v_target IS NULL THEN
    RAISE EXCEPTION 'Esta denuncia nao aponta para uma pessoa identificavel';
  END IF;

  IF p_action = 'advertir' THEN
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (v_target, 'moderacao', 'Aviso da moderação',
            COALESCE(v_reason, 'Seu comportamento foi sinalizado. Lembre-se de respeitar as regras da comunidade.'));
  ELSIF p_action = 'suspender' THEN
    IF (SELECT role FROM public.users WHERE id = v_target) = 'administrador' THEN
      RAISE EXCEPTION 'Nao e possivel suspender um administrador';
    END IF;
    UPDATE public.users SET status = 'banido' WHERE id = v_target;
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (v_target, 'moderacao', 'Conta suspensa', COALESCE(v_reason, 'Sua conta foi suspensa pela moderação.'));
  ELSIF p_action = 'reativar' THEN
    UPDATE public.users SET status = 'ativo' WHERE id = v_target;
  ELSIF p_action = 'remover_mensagem' THEN
    IF v_msg IS NULL THEN RAISE EXCEPTION 'Esta denuncia nao aponta para uma mensagem'; END IF;
    UPDATE public.community_messages SET deleted_at = now() WHERE id = v_msg;
  ELSE
    RAISE EXCEPTION 'Acao invalida';
  END IF;

  UPDATE public.reports
     SET handled_by = auth.uid(),
         updated_at = now(),
         status = CASE WHEN status = 'pendente' THEN 'em_analise'::public.report_status ELSE status END,
         decision = trim(both E'\n' FROM COALESCE(decision, '') || E'\n' || p_action || COALESCE(': ' || v_reason, ''))
   WHERE id = p_report_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_json)
  VALUES (auth.uid(), 'moderacao.' || p_action, 'denuncia', p_report_id::text,
          jsonb_build_object('alvo', v_target, 'motivo', v_reason));

  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.moderation_action(UUID, TEXT, TEXT) TO authenticated;

-- Quem denunciou avalia como a moderacao tratou o caso (so depois de resolvida/arquivada)
CREATE OR REPLACE FUNCTION public.rate_report(p_report_id UUID, p_rating INT, p_comment TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.reports WHERE id = p_report_id;
  IF r.id IS NULL OR r.reporter_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Voce so pode avaliar as suas proprias denuncias';
  END IF;
  IF r.status NOT IN ('resolvido', 'arquivado') THEN
    RAISE EXCEPTION 'A denuncia ainda esta em andamento';
  END IF;
  IF p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Nota invalida'; END IF;
  UPDATE public.reports
     SET resolution_rating = p_rating, resolution_comment = NULLIF(trim(COALESCE(p_comment, '')), '')
   WHERE id = p_report_id;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rate_report(UUID, INT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ================= fix_cores_chat.sql =================
-- Cor das mensagens: cada pessoa ve a cor que a outra escolheu.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
CREATE OR REPLACE FUNCTION public.get_chat_themes(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM public.conversations WHERE id = p_conversation_id;
  IF c.id IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF auth.uid() NOT IN (c.user_id, c.volunteer_id)
     AND COALESCE(public.current_user_role()::text, '') NOT IN ('moderador', 'administrador') THEN
    RAISE EXCEPTION 'Sem acesso a esta conversa';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(p.user_id::text, p.preferences_json->>'chatTheme')
      FROM public.user_profiles p
     WHERE p.user_id IN (c.user_id, c.volunteer_id)
       AND p.preferences_json ? 'chatTheme'
  ), '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.get_chat_themes(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- ================= fix_stats_publicas.sql =================
-- Numeros reais para a pagina inicial (sem nenhum dado pessoal).
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
CREATE OR REPLACE FUNCTION public.public_stats()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'online', (SELECT count(*) FROM public.volunteer_profiles
                WHERE availability_status = 'online' AND last_seen_at > now() - interval '90 seconds'),
    'volunteers', (SELECT count(*) FROM public.users WHERE role = 'voluntario' AND COALESCE(status, 'ativo') = 'ativo'),
    'conversations', (SELECT count(*) FROM public.conversations
                       WHERE status = 'encerrada' AND COALESCE(is_team_chat, false) = false AND volunteer_id IS NOT NULL),
    'groups', (SELECT count(*) FROM public.communities WHERE status = 'ativo'),
    'rating', COALESCE((SELECT round(avg(rating)::numeric, 1) FROM public.conversations WHERE rating IS NOT NULL), 0)
  )
$$;
GRANT EXECUTE ON FUNCTION public.public_stats() TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

-- ================= fix_notificacoes.sql =================
-- Avisos automaticos (sino) + tempo real das notificacoes.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;

-- 1) Voluntario aceitou o atendimento -> avisa a pessoa
CREATE OR REPLACE FUNCTION public.notify_conversation_accepted() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'ativa' AND OLD.status = 'aguardando' AND COALESCE(NEW.is_team_chat, false) = false THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'atendimento', 'Um voluntário aceitou seu atendimento',
            'Entre na conversa para começar.', '/app/chat/' || NEW.id::text);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_conversation_accepted ON public.conversations;
CREATE TRIGGER trg_notify_conversation_accepted AFTER UPDATE OF status ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.notify_conversation_accepted();

-- 2) Denuncia atualizada -> avisa quem denunciou
CREATE OR REPLACE FUNCTION public.notify_report_updated() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reporter_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.reporter_id, 'denuncia',
            CASE NEW.status::text
              WHEN 'em_analise' THEN 'Sua denúncia está em análise'
              WHEN 'resolvido'  THEN 'Sua denúncia foi resolvida'
              WHEN 'arquivado'  THEN 'Sua denúncia foi arquivada'
              ELSE 'Sua denúncia foi atualizada' END,
            'Veja a resposta da moderação e avalie o atendimento.', '/app/denuncias');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_report_updated ON public.reports;
CREATE TRIGGER trg_notify_report_updated AFTER UPDATE OF status ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_report_updated();

-- 3) Nova denuncia -> avisa moderadores e administradores
CREATE OR REPLACE FUNCTION public.notify_report_created() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT u.id, 'moderacao', 'Nova denúncia', COALESCE(NEW.reason, 'Uma denúncia foi aberta.'), '/mod/' || NEW.id::text
    FROM public.users u
   WHERE u.role IN ('moderador', 'administrador') AND u.id IS DISTINCT FROM NEW.reporter_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_report_created ON public.reports;
CREATE TRIGGER trg_notify_report_created AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_report_created();

-- 4) Nova candidatura -> avisa quem decide (admin; moderador tambem nas de voluntario)
CREATE OR REPLACE FUNCTION public.notify_application_created() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT u.id, 'candidatura',
         CASE WHEN COALESCE(NEW.kind, 'voluntario') = 'moderador'
              THEN 'Nova candidatura a moderador' ELSE 'Nova candidatura a voluntário' END,
         'Uma pessoa aguarda a sua decisão.', '/admin/candidaturas'
    FROM public.users u
   WHERE u.role = 'administrador';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_application_created ON public.volunteer_applications;
CREATE TRIGGER trg_notify_application_created AFTER INSERT ON public.volunteer_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_application_created();

-- 5) Candidatura decidida -> avisa quem se candidatou
CREATE OR REPLACE FUNCTION public.notify_application_decided() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text IN ('aprovada', 'rejeitada') AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'candidatura',
            CASE WHEN NEW.status::text = 'aprovada' THEN 'Sua candidatura foi aprovada 🎉' ELSE 'Sua candidatura não foi aprovada' END,
            CASE WHEN NEW.status::text = 'aprovada'
                 THEN 'Saia e entre de novo para ver o novo painel.' ELSE 'Obrigado por querer ajudar. Você poderá tentar de novo no futuro.' END,
            CASE WHEN COALESCE(NEW.kind, 'voluntario') = 'moderador' THEN '/vol/candidatura' ELSE '/app/candidatura' END);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_application_decided ON public.volunteer_applications;
CREATE TRIGGER trg_notify_application_decided AFTER UPDATE OF status ON public.volunteer_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_application_decided();

-- 6) Papel alterado pelo admin -> avisa a pessoa
CREATE OR REPLACE FUNCTION public.notify_role_changed() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.id, 'conta', 'Seu papel mudou',
            'Agora você é ' || NEW.role::text || '. Saia e entre de novo para atualizar o menu.', NULL);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_role_changed ON public.users;
CREATE TRIGGER trg_notify_role_changed AFTER UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_role_changed();

-- Tempo real do sino
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN OTHERS THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- ================= fix_bemestar.sql =================
-- Bem-estar: check-in diario de humor (privado: so a propria pessoa ve).
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS public.mood_checkins (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  mood       SMALLINT    NOT NULL CHECK (mood BETWEEN 1 AND 5),
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mood_checkins_user ON public.mood_checkins (user_id, created_at DESC);
ALTER TABLE public.mood_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mood_checkins_own" ON public.mood_checkins;
CREATE POLICY "mood_checkins_own" ON public.mood_checkins FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, DELETE ON public.mood_checkins TO authenticated;

-- A exclusao de conta tambem apaga os check-ins
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  IF (SELECT role FROM public.users WHERE id = uid) = 'administrador'
     AND (SELECT count(*) FROM public.users WHERE role = 'administrador' AND status = 'ativo') <= 1 THEN
    RAISE EXCEPTION 'Voce e o unico administrador. Promova outra pessoa antes de excluir a conta.';
  END IF;

  UPDATE public.users SET display_name = 'Conta excluída', status = 'excluido' WHERE id = uid;
  UPDATE public.user_profiles
     SET nickname = NULL, birth_year = NULL, state = NULL, preferences_json = '{}'::jsonb
   WHERE user_id = uid;
  DELETE FROM public.consents WHERE user_id = uid;
  DELETE FROM public.mood_checkins WHERE user_id = uid;
  DELETE FROM public.community_members WHERE user_id = uid;
  UPDATE public.community_messages SET alias_snapshot = 'Conta excluída' WHERE sender_id = uid;

  UPDATE auth.users
     SET banned_until = 'infinity',
         email = 'excluido+' || uid::text || '@vidamais.invalid',
         raw_user_meta_data = '{}'::jsonb
   WHERE id = uid;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_json)
  VALUES (uid, 'conta.excluida', 'usuario', uid::text, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ================= fix_seguranca_chat.sql =================
-- Protecao no servidor: alerta automatico de risco, filtro nos grupos e limite de envio.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- ============ 1) RISCO NO ATENDIMENTO ============
-- Quando a pessoa atendida escreve algo com sinal de risco, o sistema:
--   registra a sinalizacao, marca a conversa como "crise" e avisa o voluntario e a moderacao.
CREATE OR REPLACE FUNCTION public.detect_risk_message() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD;
  t TEXT := lower(COALESCE(NEW.body, ''));
  hit BOOLEAN;
BEGIN
  SELECT * INTO c FROM public.conversations WHERE id = NEW.conversation_id;
  IF c.id IS NULL OR COALESCE(c.is_team_chat, false) OR NEW.sender_id IS DISTINCT FROM c.user_id THEN
    RETURN NEW; -- so analisa mensagens da pessoa atendida
  END IF;

  hit := t ~ '(quero|vou|queria|penso em|pensando em|vontade de)\s+(me\s+)?(matar|morrer|suicidar|sumir|desaparecer)'
      OR t ~ 'me\s+matar'
      OR t ~ 'suic[ií]d'
      OR t ~ 'n[aã]o\s+(quero|aguento|consigo)\s+(mais\s+)?(viver|continuar|seguir|existir)'
      OR t ~ 'acabar\s+com\s+(tudo|(a\s+)?(minha\s+)?vida)'
      OR t ~ '(melhor|seria melhor)\s+(sem\s+mim|eu\s+morrer|se\s+eu\s+morresse)'
      OR t ~ 'me\s+(machucar|cortar|ferir)'
      OR t ~ 'overdose'
      OR t ~ 'tomar\s+(todos\s+os\s+)?(rem[eé]dios|comprimidos|p[ií]lulas)';

  IF hit AND NOT EXISTS (
    SELECT 1 FROM public.risk_flags f
     WHERE f.conversation_id = c.id AND f.created_at > now() - interval '10 minutes'
  ) THEN
    INSERT INTO public.risk_flags (conversation_id, created_by, level, reason)
    VALUES (c.id, c.user_id, 'alto', 'Alerta automatico: a mensagem da pessoa tem sinal de risco. Confirme com cuidado e, se preciso, acione CVV 188 / SAMU 192.');

    UPDATE public.conversations SET priority = 'crise', updated_at = now() WHERE id = c.id;

    -- avisa o voluntario do atendimento e a moderacao
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT x.uid, 'risco', 'Possível sinal de risco em um atendimento',
           'Leia a conversa com atenção e sinalize o risco se for necessário.',
           CASE WHEN x.uid = c.volunteer_id THEN '/vol/chat/' || c.id::text ELSE '/mod/historico' END
      FROM (
        SELECT c.volunteer_id AS uid WHERE c.volunteer_id IS NOT NULL
        UNION
        SELECT u.id FROM public.users u WHERE u.role IN ('moderador', 'administrador')
      ) x;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_detect_risk_message ON public.messages;
CREATE TRIGGER trg_detect_risk_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.detect_risk_message();

-- ============ 2) FILTRO NOS GRUPOS + LIMITE DE ENVIO ============
CREATE OR REPLACE FUNCTION public.guard_community_message() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t TEXT := lower(COALESCE(NEW.body, ''));
  recent INT;
BEGIN
  -- limite: no maximo 15 mensagens por minuto por pessoa
  SELECT count(*) INTO recent FROM public.community_messages
   WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 minute';
  IF recent >= 15 THEN
    RAISE EXCEPTION 'Você está enviando mensagens rápido demais. Aguarde alguns segundos.';
  END IF;

  -- dados pessoais: telefone, e-mail e links
  IF t ~ '(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}'
     OR t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     OR t ~ '(https?://|www\.)' THEN
    RAISE EXCEPTION 'Sua mensagem parece ter dados pessoais (telefone, e-mail ou link). Por segurança, remova-os e envie de novo.';
  END IF;

  -- ofensas graves
  IF t ~ '(filho\s+da\s+puta|\mfdp\M|vai\s+se\s+foder|\mvsf\M|arrombad|vagabund|retardad|desgra[cç]ad|\mcuz[aã]o\M|viado|sua\s+puta)' THEN
    RAISE EXCEPTION 'Mensagem não enviada: ela tem linguagem ofensiva. Reformule com respeito.';
  END IF;

  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_community_message ON public.community_messages;
CREATE TRIGGER trg_guard_community_message BEFORE INSERT ON public.community_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_message();

-- ============ 3) LIMITE DE ENVIO NO ATENDIMENTO ============
CREATE OR REPLACE FUNCTION public.guard_chat_rate() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recent INT;
BEGIN
  SELECT count(*) INTO recent FROM public.messages
   WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 minute';
  IF recent >= 30 THEN
    RAISE EXCEPTION 'Você está enviando mensagens rápido demais. Aguarde alguns segundos.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_chat_rate ON public.messages;
CREATE TRIGGER trg_guard_chat_rate BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_rate();

NOTIFY pgrst, 'reload schema';

-- ================= fix_retencao.sql =================
-- Retencao de dados (LGPD): apaga o que passou do prazo. Roda sozinho todo dia as 3h e o admin pode rodar na mao.
-- Prazos padrao: atendimentos 90 dias apos terminar, grupos 180 dias, logs 365 dias, avisos 90 dias.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

CREATE OR REPLACE FUNCTION public.purge_old_data(
  p_chat_days INT DEFAULT 90,
  p_group_days INT DEFAULT 180,
  p_log_days INT DEFAULT 365,
  p_notification_days INT DEFAULT 90,
  p_dry_run BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_chat INT; v_group INT; v_logs INT; v_notes INT;
BEGIN
  -- so a rotina automatica (sem usuario) ou um administrador
  IF auth.uid() IS NOT NULL AND COALESCE(public.current_user_role()::text, '') <> 'administrador' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  SELECT count(*) INTO v_chat FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
   WHERE c.status IN ('encerrada', 'arquivada') AND c.ended_at < now() - make_interval(days => p_chat_days);
  SELECT count(*) INTO v_group FROM public.community_messages
   WHERE created_at < now() - make_interval(days => p_group_days);
  SELECT count(*) INTO v_logs FROM public.audit_logs
   WHERE created_at < now() - make_interval(days => p_log_days) AND action <> 'sistema.limpeza';
  SELECT count(*) INTO v_notes FROM public.notifications
   WHERE sent_at < now() - make_interval(days => p_notification_days);

  IF NOT p_dry_run THEN
    DELETE FROM public.messages m USING public.conversations c
     WHERE c.id = m.conversation_id AND c.status IN ('encerrada', 'arquivada')
       AND c.ended_at < now() - make_interval(days => p_chat_days);
    DELETE FROM public.community_messages WHERE created_at < now() - make_interval(days => p_group_days);
    DELETE FROM public.audit_logs
     WHERE created_at < now() - make_interval(days => p_log_days) AND action <> 'sistema.limpeza';
    DELETE FROM public.notifications WHERE sent_at < now() - make_interval(days => p_notification_days);

    INSERT INTO public.audit_logs (actor_id, action, entity_type, metadata_json)
    VALUES (auth.uid(), 'sistema.limpeza', 'sistema',
            jsonb_build_object('mensagens_atendimento', v_chat, 'mensagens_grupos', v_group, 'logs', v_logs, 'avisos', v_notes));
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'mensagens_atendimento', v_chat, 'mensagens_grupos', v_group, 'logs', v_logs, 'avisos', v_notes,
    'ultima_limpeza', (SELECT max(created_at) FROM public.audit_logs WHERE action = 'sistema.limpeza')
  );
END $$;
GRANT EXECUTE ON FUNCTION public.purge_old_data(INT, INT, INT, INT, BOOLEAN) TO authenticated;

-- Agenda a limpeza diaria (precisa da extensao pg_cron; se nao estiver ativa, o botao do admin continua valendo)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  BEGIN
    PERFORM cron.unschedule('vida-limpeza-diaria');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule('vida-limpeza-diaria', '0 3 * * *', 'SELECT public.purge_old_data()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponivel (%). Use o botao "Executar limpeza agora" no painel do admin.', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';

-- ================= fix_funcionalidades.sql =================
-- Plano de seguranca, pedido de apoio (supervisor), agendamento e trilhas.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- ============ 1) PLANO DE SEGURANCA PESSOAL (privado) ============
CREATE TABLE IF NOT EXISTS public.safety_plans (
  user_id       UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  warning_signs TEXT,
  coping        TEXT,
  reasons       TEXT,
  safe_place    TEXT,
  contacts      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.safety_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "safety_plans_own" ON public.safety_plans;
CREATE POLICY "safety_plans_own" ON public.safety_plans FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_plans TO authenticated;

-- ============ 2) PEDIDO DE APOIO AO SUPERVISOR ============
CREATE TABLE IF NOT EXISTS public.supervisor_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  volunteer_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note            TEXT,
  urgent          BOOLEAN NOT NULL DEFAULT false,
  status          VARCHAR(20) NOT NULL DEFAULT 'aberto',
  handled_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at      TIMESTAMPTZ
);
ALTER TABLE public.supervisor_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supervisor_requests_select" ON public.supervisor_requests;
CREATE POLICY "supervisor_requests_select" ON public.supervisor_requests FOR SELECT USING (
  volunteer_id = auth.uid() OR public.current_user_role() IN ('moderador', 'administrador'));
DROP POLICY IF EXISTS "supervisor_requests_update_staff" ON public.supervisor_requests;
CREATE POLICY "supervisor_requests_update_staff" ON public.supervisor_requests FOR UPDATE USING (
  public.current_user_role() IN ('moderador', 'administrador'));
GRANT SELECT, UPDATE ON public.supervisor_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.request_supervisor(p_conversation_id UUID, p_note TEXT DEFAULT NULL, p_urgent BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v_id UUID;
BEGIN
  SELECT * INTO c FROM public.conversations WHERE id = p_conversation_id;
  IF c.id IS NULL OR c.volunteer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Voce so pode pedir apoio nos seus atendimentos';
  END IF;
  INSERT INTO public.supervisor_requests (conversation_id, volunteer_id, note, urgent)
  VALUES (p_conversation_id, auth.uid(), NULLIF(trim(COALESCE(p_note, '')), ''), COALESCE(p_urgent, false))
  RETURNING id INTO v_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT u.id, 'apoio',
         CASE WHEN p_urgent THEN 'URGENTE: voluntário pede apoio' ELSE 'Um voluntário pede apoio' END,
         COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), 'Há um atendimento que precisa de supervisão.'),
         '/mod/apoio'
    FROM public.users u WHERE u.role IN ('moderador', 'administrador');

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_json)
  VALUES (auth.uid(), 'apoio.solicitado', 'atendimento', p_conversation_id::text, jsonb_build_object('urgente', p_urgent));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;
GRANT EXECUTE ON FUNCTION public.request_supervisor(UUID, TEXT, BOOLEAN) TO authenticated;

-- ============ 3) AGENDAMENTO DE CONVERSAS ============
CREATE TABLE IF NOT EXISTS public.appointments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  volunteer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  starts_at    TIMESTAMPTZ NOT NULL,
  topic        TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'aberto', -- aberto | confirmado | cancelado | concluido
  reminded     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_starts ON public.appointments (starts_at);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointments_select" ON public.appointments;
CREATE POLICY "appointments_select" ON public.appointments FOR SELECT USING (
  user_id = auth.uid() OR volunteer_id = auth.uid()
  OR (status = 'aberto' AND public.current_user_role() IN ('voluntario', 'moderador', 'administrador'))
  OR public.current_user_role() IN ('moderador', 'administrador'));
DROP POLICY IF EXISTS "appointments_insert_own" ON public.appointments;
CREATE POLICY "appointments_insert_own" ON public.appointments FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "appointments_update" ON public.appointments;
CREATE POLICY "appointments_update" ON public.appointments FOR UPDATE USING (
  user_id = auth.uid() OR volunteer_id = auth.uid()
  OR (status = 'aberto' AND public.current_user_role() IN ('voluntario', 'moderador', 'administrador')));
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;

-- Limite: ate 3 agendamentos abertos por pessoa e so no futuro
CREATE OR REPLACE FUNCTION public.guard_appointment() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.starts_at < now() + interval '15 minutes' THEN
    RAISE EXCEPTION 'Escolha um horário a partir de 15 minutos de agora.';
  END IF;
  IF (SELECT count(*) FROM public.appointments
       WHERE user_id = NEW.user_id AND status IN ('aberto', 'confirmado') AND starts_at > now()) >= 3 THEN
    RAISE EXCEPTION 'Você já tem 3 conversas agendadas. Cancele uma para marcar outra.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_appointment ON public.appointments;
CREATE TRIGGER trg_guard_appointment BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_appointment();

-- Voluntario assumiu -> avisa a pessoa; novo pedido -> avisa voluntarios
CREATE OR REPLACE FUNCTION public.notify_appointment() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT u.id, 'agenda', 'Nova conversa agendada para assumir',
           'Uma pessoa marcou um horário: ' || to_char(NEW.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
           '/vol/agenda'
      FROM public.users u WHERE u.role = 'voluntario';
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'confirmado' AND OLD.status = 'aberto' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'agenda', 'Sua conversa foi confirmada ✔',
            'Um voluntário assumiu o horário de ' || to_char(NEW.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.',
            '/app/agendar');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'cancelado' AND OLD.status <> 'cancelado' AND NEW.volunteer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.volunteer_id, 'agenda', 'Uma conversa agendada foi cancelada', 'A pessoa cancelou o horário.', '/vol/agenda');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_appointment ON public.appointments;
CREATE TRIGGER trg_notify_appointment AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_appointment();

-- Lembretes 30 minutos antes (roda a cada 5 min se o pg_cron estiver ativo)
CREATE OR REPLACE FUNCTION public.send_appointment_reminders() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT := 0; a RECORD;
BEGIN
  FOR a IN SELECT * FROM public.appointments
            WHERE status = 'confirmado' AND NOT reminded AND starts_at BETWEEN now() AND now() + interval '30 minutes'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (a.user_id, 'agenda', 'Sua conversa começa em instantes', 'Entre na fila no horário combinado.', '/app/conversar');
    IF a.volunteer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (a.volunteer_id, 'agenda', 'Você tem uma conversa agendada em instantes', 'Fique online para receber a pessoa.', '/vol/agenda');
    END IF;
    UPDATE public.appointments SET reminded = true WHERE id = a.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.send_appointment_reminders() TO authenticated;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  BEGIN
    PERFORM cron.unschedule('vida-lembretes-agenda');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule('vida-lembretes-agenda', '*/5 * * * *', 'SELECT public.send_appointment_reminders()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponivel (%). Os lembretes automaticos ficam desligados.', SQLERRM;
END $$;

-- ============ 4) TRILHAS DE 7 DIAS (progresso privado) ============
CREATE TABLE IF NOT EXISTS public.track_progress (
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  track_id     VARCHAR(40) NOT NULL,
  day          SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 7),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id, day)
);
ALTER TABLE public.track_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "track_progress_own" ON public.track_progress;
CREATE POLICY "track_progress_own" ON public.track_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, DELETE ON public.track_progress TO authenticated;

-- Exclusao de conta apaga tambem os dados novos
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF (SELECT role FROM public.users WHERE id = uid) = 'administrador'
     AND (SELECT count(*) FROM public.users WHERE role = 'administrador' AND status = 'ativo') <= 1 THEN
    RAISE EXCEPTION 'Voce e o unico administrador. Promova outra pessoa antes de excluir a conta.';
  END IF;

  UPDATE public.users SET display_name = 'Conta excluída', status = 'excluido' WHERE id = uid;
  UPDATE public.user_profiles SET nickname = NULL, birth_year = NULL, state = NULL, preferences_json = '{}'::jsonb WHERE user_id = uid;
  DELETE FROM public.consents WHERE user_id = uid;
  DELETE FROM public.mood_checkins WHERE user_id = uid;
  DELETE FROM public.safety_plans WHERE user_id = uid;
  DELETE FROM public.track_progress WHERE user_id = uid;
  DELETE FROM public.appointments WHERE user_id = uid AND status IN ('aberto', 'confirmado');
  DELETE FROM public.community_members WHERE user_id = uid;
  UPDATE public.community_messages SET alias_snapshot = 'Conta excluída' WHERE sender_id = uid;

  UPDATE auth.users
     SET banned_until = 'infinity',
         email = 'excluido+' || uid::text || '@vidamais.invalid',
         raw_user_meta_data = '{}'::jsonb
   WHERE id = uid;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_json)
  VALUES (uid, 'conta.excluida', 'usuario', uid::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
