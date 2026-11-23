-- Medidas de moderacao, acompanhamento da denuncia e avaliacao da moderacao.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS handled_by UUID;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution_rating SMALLINT CHECK (resolution_rating BETWEEN 1 AND 5);
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution_comment TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS decision TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;

-- A equipe de moderacao pode excluir denuncias (a acao fica nos logs)
DROP POLICY IF EXISTS "reports_delete_staff" ON public.reports;
CREATE POLICY "reports_delete_staff" ON public.reports FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador')));

-- Medidas: advertir, suspender, reativar, remover_mensagem
CREATE OR REPLACE FUNCTION public.moderation_action(p_report_id UUID, p_action TEXT, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
  r RECORD;
  v_target UUID;
  v_msg UUID;
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('moderador', 'administrador') THEN
    RAISE EXCEPTION 'Apenas a moderacao pode aplicar medidas';
  END IF;
  SELECT * INTO r FROM public.reports WHERE id = p_report_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Denuncia nao encontrada'; END IF;

  IF r.target_type = 'mensagem' AND r.target_id ~* '^[0-9a-f-]{36}$' THEN
    v_msg := r.target_id::uuid;
    SELECT sender_id INTO v_target FROM public.community_messages WHERE id = v_msg;
  ELSIF r.target_type = 'usuario' AND r.target_id ~* '^[0-9a-f-]{36}$' THEN
    v_target := r.target_id::uuid;
  END IF;

  IF p_action IN ('advertir', 'suspender', 'reativar') AND v_target IS NULL THEN
    RAISE EXCEPTION 'Esta denuncia nao aponta para uma pessoa identificavel';
  END IF;

  IF p_action = 'advertir' THEN
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (v_target, 'moderacao', 'Aviso da moderação',
            COALESCE(v_reason, 'Seu comportamento foi sinalizado. Lembre-se de respeitar as regras da comunidade.'));
  ELSIF p_action = 'suspender' THEN
    IF (SELECT role FROM public.users WHERE id = v_target) = 'administrador' THEN
      RAISE EXCEPTION 'Nao e possivel suspender um administrador';
    END IF;
    UPDATE public.users SET status = 'banido' WHERE id = v_target;
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (v_target, 'moderacao', 'Conta suspensa', COALESCE(v_reason, 'Sua conta foi suspensa pela moderação.'));
  ELSIF p_action = 'reativar' THEN
    UPDATE public.users SET status = 'ativo' WHERE id = v_target;
  ELSIF p_action = 'remover_mensagem' THEN
    IF v_msg IS NULL THEN RAISE EXCEPTION 'Esta denuncia nao aponta para uma mensagem'; END IF;
    UPDATE public.community_messages SET deleted_at = now() WHERE id = v_msg;
  ELSE
    RAISE EXCEPTION 'Acao invalida';
  END IF;

  UPDATE public.reports
     SET handled_by = auth.uid(),
         updated_at = now(),
         status = CASE WHEN status = 'pendente' THEN 'em_analise'::public.report_status ELSE status END,
         decision = trim(both E'\n' FROM COALESCE(decision, '') || E'\n' || p_action || COALESCE(': ' || v_reason, ''))
   WHERE id = p_report_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_json)
  VALUES (auth.uid(), 'moderacao.' || p_action, 'denuncia', p_report_id::text,
          jsonb_build_object('alvo', v_target, 'motivo', v_reason));

  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.moderation_action(UUID, TEXT, TEXT) TO authenticated;

-- Quem denunciou avalia como a moderacao tratou o caso (so depois de resolvida/arquivada)
CREATE OR REPLACE FUNCTION public.rate_report(p_report_id UUID, p_rating INT, p_comment TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.reports WHERE id = p_report_id;
  IF r.id IS NULL OR r.reporter_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Voce so pode avaliar as suas proprias denuncias';
  END IF;
  IF r.status NOT IN ('resolvido', 'arquivado') THEN
    RAISE EXCEPTION 'A denuncia ainda esta em andamento';
  END IF;
  IF p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Nota invalida'; END IF;
  UPDATE public.reports
     SET resolution_rating = p_rating, resolution_comment = NULLIF(trim(COALESCE(p_comment, '')), '')
   WHERE id = p_report_id;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rate_report(UUID, INT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
