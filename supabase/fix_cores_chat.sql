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
