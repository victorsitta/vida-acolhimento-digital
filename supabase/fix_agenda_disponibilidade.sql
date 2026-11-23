-- Agenda com horarios disponiveis: voluntarios definem quando atendem; a pessoa escolhe entre os horarios
-- livres e o SISTEMA escolhe o voluntario e avisa no sino dele.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS public.volunteer_availability (
  volunteer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  weekday      SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = domingo
  hour         SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  PRIMARY KEY (volunteer_id, weekday, hour)
);
ALTER TABLE public.volunteer_availability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "volunteer_availability_own" ON public.volunteer_availability;
CREATE POLICY "volunteer_availability_own" ON public.volunteer_availability FOR ALL
  USING (volunteer_id = auth.uid()) WITH CHECK (volunteer_id = auth.uid());
GRANT SELECT, INSERT, DELETE ON public.volunteer_availability TO authenticated;

-- Voluntarios livres naquele horario (disponiveis e sem outro compromisso na mesma hora)
CREATE OR REPLACE FUNCTION public.free_volunteers_at(p_start TIMESTAMPTZ, p_exclude UUID DEFAULT NULL)
RETURNS TABLE(volunteer_id UUID, upcoming INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.volunteer_id,
         (SELECT count(*)::int FROM public.appointments x
           WHERE x.volunteer_id = a.volunteer_id AND x.status = 'confirmado' AND x.starts_at > now()) AS upcoming
    FROM public.volunteer_availability a
    JOIN public.users u ON u.id = a.volunteer_id
     AND u.role IN ('voluntario', 'moderador', 'administrador') AND COALESCE(u.status, 'ativo') = 'ativo'
   WHERE a.weekday = extract(dow FROM p_start AT TIME ZONE 'America/Sao_Paulo')::int
     AND a.hour = extract(hour FROM p_start AT TIME ZONE 'America/Sao_Paulo')::int
     AND (p_exclude IS NULL OR a.volunteer_id <> p_exclude)
     AND NOT EXISTS (
       SELECT 1 FROM public.appointments b
        WHERE b.volunteer_id = a.volunteer_id AND b.status = 'confirmado'
          AND b.starts_at >= date_trunc('hour', p_start AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
          AND b.starts_at <  (date_trunc('hour', p_start AT TIME ZONE 'America/Sao_Paulo') + interval '1 hour') AT TIME ZONE 'America/Sao_Paulo')
$$;

-- Horarios livres dos proximos dias: so horas com pelo menos 1 voluntario livre
CREATE OR REPLACE FUNCTION public.available_slots(p_days INT DEFAULT 7)
RETURNS TABLE(slot_start TIMESTAMPTZ, volunteers INT, free INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.slot_start, 0, (SELECT count(*)::int FROM public.free_volunteers_at(s.slot_start))
    FROM (
      SELECT DISTINCT ((d.d + make_interval(hours => a.hour)) AT TIME ZONE 'America/Sao_Paulo') AS slot_start
        FROM (SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date + g) AS d
                FROM generate_series(0, GREATEST(1, LEAST(p_days, 14)) - 1) g) d
        JOIN public.volunteer_availability a ON a.weekday = extract(dow FROM d.d)::int
    ) s
   WHERE s.slot_start > now() + interval '30 minutes'
     AND EXISTS (SELECT 1 FROM public.free_volunteers_at(s.slot_start))
   ORDER BY s.slot_start
$$;
GRANT EXECUTE ON FUNCTION public.available_slots(INT) TO authenticated;

-- O sistema escolhe o voluntario ao criar o agendamento (menos ocupado primeiro; empate sorteia)
CREATE OR REPLACE FUNCTION public.assign_appointment_volunteer() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v UUID;
BEGIN
  SELECT f.volunteer_id INTO v FROM public.free_volunteers_at(NEW.starts_at) f ORDER BY f.upcoming, random() LIMIT 1;
  IF v IS NULL THEN
    RAISE EXCEPTION 'Este horário acabou de ser preenchido. Escolha outro, por favor.';
  END IF;
  NEW.volunteer_id := v;
  NEW.status := 'confirmado';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_assign_appointment_volunteer ON public.appointments;
CREATE TRIGGER trg_assign_appointment_volunteer BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.assign_appointment_volunteer();

-- Avisos: voluntario escolhido recebe no sino; a pessoa recebe a confirmacao
CREATE OR REPLACE FUNCTION public.notify_appointment() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE label TEXT;
BEGIN
  label := to_char(NEW.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  IF TG_OP = 'INSERT' AND NEW.volunteer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.volunteer_id, 'agenda', 'Você tem uma nova conversa agendada', 'Uma pessoa agendou ' || label || '. Fique online nesse horário.', '/vol/agenda'),
           (NEW.user_id, 'agenda', 'Sua conversa foi agendada ✔', 'Marcada para ' || label || '. Avisaremos pouco antes de começar.', '/app/agendar');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'cancelado' AND OLD.status <> 'cancelado' AND NEW.volunteer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.volunteer_id, 'agenda', 'Uma conversa agendada foi cancelada', 'A pessoa cancelou o horário.', '/vol/agenda');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_appointment ON public.appointments;
CREATE TRIGGER trg_notify_appointment AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_appointment();

-- Voluntario nao pode mais: o sistema passa para outro voluntario livre; se nao houver, avisa a pessoa
CREATE OR REPLACE FUNCTION public.release_appointment(p_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v UUID; label TEXT;
BEGIN
  SELECT * INTO a FROM public.appointments WHERE id = p_id;
  IF a.id IS NULL OR a.volunteer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Este horário não é seu';
  END IF;
  label := to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');

  SELECT f.volunteer_id INTO v FROM public.free_volunteers_at(a.starts_at, auth.uid()) f ORDER BY f.upcoming, random() LIMIT 1;
  IF v IS NOT NULL THEN
    UPDATE public.appointments SET volunteer_id = v, reminded = false WHERE id = p_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v, 'agenda', 'Você assumiu uma conversa agendada', 'Marcada para ' || label || '.', '/vol/agenda');
    RETURN jsonb_build_object('ok', true, 'reassigned', true);
  END IF;

  UPDATE public.appointments SET status = 'cancelado' WHERE id = p_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (a.user_id, 'agenda', 'Precisamos remarcar sua conversa', 'O voluntário de ' || label || ' não pôde atender e não há outro livre. Escolha um novo horário.', '/app/agendar');
  RETURN jsonb_build_object('ok', true, 'reassigned', false);
END $$;
GRANT EXECUTE ON FUNCTION public.release_appointment(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
