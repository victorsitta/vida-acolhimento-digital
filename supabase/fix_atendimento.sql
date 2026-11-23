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
