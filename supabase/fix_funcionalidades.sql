-- Plano de seguranca, pedido de apoio (supervisor), agendamento e trilhas.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- ============ 1) PLANO DE SEGURANCA PESSOAL (privado) ============
CREATE TABLE IF NOT EXISTS public.safety_plans (
  user_id       UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  warning_signs TEXT,
  coping        TEXT,
  reasons       TEXT,
  safe_place    TEXT,
  contacts      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.safety_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "safety_plans_own" ON public.safety_plans;
CREATE POLICY "safety_plans_own" ON public.safety_plans FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_plans TO authenticated;

-- ============ 2) PEDIDO DE APOIO AO SUPERVISOR ============
CREATE TABLE IF NOT EXISTS public.supervisor_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  volunteer_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note            TEXT,
  urgent          BOOLEAN NOT NULL DEFAULT false,
  status          VARCHAR(20) NOT NULL DEFAULT 'aberto',
  handled_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at      TIMESTAMPTZ
);
ALTER TABLE public.supervisor_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supervisor_requests_select" ON public.supervisor_requests;
CREATE POLICY "supervisor_requests_select" ON public.supervisor_requests FOR SELECT USING (
  volunteer_id = auth.uid() OR public.current_user_role() IN ('moderador', 'administrador'));
DROP POLICY IF EXISTS "supervisor_requests_update_staff" ON public.supervisor_requests;
CREATE POLICY "supervisor_requests_update_staff" ON public.supervisor_requests FOR UPDATE USING (
  public.current_user_role() IN ('moderador', 'administrador'));
GRANT SELECT, UPDATE ON public.supervisor_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.request_supervisor(p_conversation_id UUID, p_note TEXT DEFAULT NULL, p_urgent BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v_id UUID;
BEGIN
  SELECT * INTO c FROM public.conversations WHERE id = p_conversation_id;
  IF c.id IS NULL OR c.volunteer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Voce so pode pedir apoio nos seus atendimentos';
  END IF;
  INSERT INTO public.supervisor_requests (conversation_id, volunteer_id, note, urgent)
  VALUES (p_conversation_id, auth.uid(), NULLIF(trim(COALESCE(p_note, '')), ''), COALESCE(p_urgent, false))
  RETURNING id INTO v_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT u.id, 'apoio',
         CASE WHEN p_urgent THEN 'URGENTE: voluntário pede apoio' ELSE 'Um voluntário pede apoio' END,
         COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), 'Há um atendimento que precisa de supervisão.'),
         '/mod/apoio'
    FROM public.users u WHERE u.role IN ('moderador', 'administrador');

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_json)
  VALUES (auth.uid(), 'apoio.solicitado', 'atendimento', p_conversation_id::text, jsonb_build_object('urgente', p_urgent));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;
GRANT EXECUTE ON FUNCTION public.request_supervisor(UUID, TEXT, BOOLEAN) TO authenticated;

-- ============ 3) AGENDAMENTO DE CONVERSAS ============
CREATE TABLE IF NOT EXISTS public.appointments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  volunteer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  starts_at    TIMESTAMPTZ NOT NULL,
  topic        TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'aberto', -- aberto | confirmado | cancelado | concluido
  reminded     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_starts ON public.appointments (starts_at);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointments_select" ON public.appointments;
CREATE POLICY "appointments_select" ON public.appointments FOR SELECT USING (
  user_id = auth.uid() OR volunteer_id = auth.uid()
  OR (status = 'aberto' AND public.current_user_role() IN ('voluntario', 'moderador', 'administrador'))
  OR public.current_user_role() IN ('moderador', 'administrador'));
DROP POLICY IF EXISTS "appointments_insert_own" ON public.appointments;
CREATE POLICY "appointments_insert_own" ON public.appointments FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "appointments_update" ON public.appointments;
CREATE POLICY "appointments_update" ON public.appointments FOR UPDATE USING (
  user_id = auth.uid() OR volunteer_id = auth.uid()
  OR (status = 'aberto' AND public.current_user_role() IN ('voluntario', 'moderador', 'administrador')));
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;

-- Limite: ate 3 agendamentos abertos por pessoa e so no futuro
CREATE OR REPLACE FUNCTION public.guard_appointment() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.starts_at < now() + interval '15 minutes' THEN
    RAISE EXCEPTION 'Escolha um horário a partir de 15 minutos de agora.';
  END IF;
  IF (SELECT count(*) FROM public.appointments
       WHERE user_id = NEW.user_id AND status IN ('aberto', 'confirmado') AND starts_at > now()) >= 3 THEN
    RAISE EXCEPTION 'Você já tem 3 conversas agendadas. Cancele uma para marcar outra.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_appointment ON public.appointments;
CREATE TRIGGER trg_guard_appointment BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_appointment();

-- Voluntario assumiu -> avisa a pessoa; novo pedido -> avisa voluntarios
CREATE OR REPLACE FUNCTION public.notify_appointment() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT u.id, 'agenda', 'Nova conversa agendada para assumir',
           'Uma pessoa marcou um horário: ' || to_char(NEW.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
           '/vol/agenda'
      FROM public.users u WHERE u.role = 'voluntario';
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'confirmado' AND OLD.status = 'aberto' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'agenda', 'Sua conversa foi confirmada ✔',
            'Um voluntário assumiu o horário de ' || to_char(NEW.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.',
            '/app/agendar');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'cancelado' AND OLD.status <> 'cancelado' AND NEW.volunteer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.volunteer_id, 'agenda', 'Uma conversa agendada foi cancelada', 'A pessoa cancelou o horário.', '/vol/agenda');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_appointment ON public.appointments;
CREATE TRIGGER trg_notify_appointment AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_appointment();

-- Lembretes 30 minutos antes (roda a cada 5 min se o pg_cron estiver ativo)
CREATE OR REPLACE FUNCTION public.send_appointment_reminders() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT := 0; a RECORD;
BEGIN
  FOR a IN SELECT * FROM public.appointments
            WHERE status = 'confirmado' AND NOT reminded AND starts_at BETWEEN now() AND now() + interval '30 minutes'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (a.user_id, 'agenda', 'Sua conversa começa em instantes', 'Entre na fila no horário combinado.', '/app/conversar');
    IF a.volunteer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (a.volunteer_id, 'agenda', 'Você tem uma conversa agendada em instantes', 'Fique online para receber a pessoa.', '/vol/agenda');
    END IF;
    UPDATE public.appointments SET reminded = true WHERE id = a.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.send_appointment_reminders() TO authenticated;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  BEGIN
    PERFORM cron.unschedule('vida-lembretes-agenda');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule('vida-lembretes-agenda', '*/5 * * * *', 'SELECT public.send_appointment_reminders()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponivel (%). Os lembretes automaticos ficam desligados.', SQLERRM;
END $$;

-- ============ 4) TRILHAS DE 7 DIAS (progresso privado) ============
CREATE TABLE IF NOT EXISTS public.track_progress (
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  track_id     VARCHAR(40) NOT NULL,
  day          SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 7),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id, day)
);
ALTER TABLE public.track_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "track_progress_own" ON public.track_progress;
CREATE POLICY "track_progress_own" ON public.track_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, DELETE ON public.track_progress TO authenticated;

-- Exclusao de conta apaga tambem os dados novos
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF (SELECT role FROM public.users WHERE id = uid) = 'administrador'
     AND (SELECT count(*) FROM public.users WHERE role = 'administrador' AND status = 'ativo') <= 1 THEN
    RAISE EXCEPTION 'Voce e o unico administrador. Promova outra pessoa antes de excluir a conta.';
  END IF;

  UPDATE public.users SET display_name = 'Conta excluída', status = 'excluido' WHERE id = uid;
  UPDATE public.user_profiles SET nickname = NULL, birth_year = NULL, state = NULL, preferences_json = '{}'::jsonb WHERE user_id = uid;
  DELETE FROM public.consents WHERE user_id = uid;
  DELETE FROM public.mood_checkins WHERE user_id = uid;
  DELETE FROM public.safety_plans WHERE user_id = uid;
  DELETE FROM public.track_progress WHERE user_id = uid;
  DELETE FROM public.appointments WHERE user_id = uid AND status IN ('aberto', 'confirmado');
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
