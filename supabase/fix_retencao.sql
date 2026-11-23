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
