-- Encerra atendimentos "esquecidos" que distorcem o painel (ex.: espera de 107290 min).
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- 1) Quem esperou mais de 3 horas na fila desistiu.
UPDATE public.conversations
   SET status = 'encerrada', ended_at = now(), closed_reason = 'expirada', updated_at = now()
 WHERE status = 'aguardando'
   AND created_at < now() - interval '3 hours';

-- 2) Atendimentos "em andamento" sem nenhuma atividade ha mais de 24 horas.
UPDATE public.conversations c
   SET status = 'encerrada', ended_at = now(), closed_reason = 'expirada', updated_at = now()
 WHERE c.status IN ('ativa', 'sinalizada')
   AND COALESCE((SELECT max(m.created_at) FROM public.messages m WHERE m.conversation_id = c.id),
                c.started_at, c.created_at) < now() - interval '24 hours';

-- Conferir o resultado:
SELECT status, count(*) FROM public.conversations GROUP BY status ORDER BY 2 DESC;
