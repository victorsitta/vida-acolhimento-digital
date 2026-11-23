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
