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
