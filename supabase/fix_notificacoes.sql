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
