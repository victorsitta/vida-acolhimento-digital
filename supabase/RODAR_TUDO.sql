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
