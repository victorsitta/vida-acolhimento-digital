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
