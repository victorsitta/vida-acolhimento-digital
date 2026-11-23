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
