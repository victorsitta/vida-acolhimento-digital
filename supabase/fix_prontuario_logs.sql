-- Rode UMA vez no Supabase (SQL Editor). Pode rodar de novo sem problema.
-- Prontuario (titulo + anexos), avaliacao do atendimento e logs de auditoria.

-- ===== PRONTUARIO =====
ALTER TABLE public.care_records ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.care_records ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Bucket privado para anexos
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('prontuarios', 'prontuarios', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "prontuarios_staff_select" ON storage.objects;
CREATE POLICY "prontuarios_staff_select" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'prontuarios' AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario','moderador','administrador')));

DROP POLICY IF EXISTS "prontuarios_staff_insert" ON storage.objects;
CREATE POLICY "prontuarios_staff_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'prontuarios' AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario','moderador','administrador')));

DROP POLICY IF EXISTS "prontuarios_staff_delete" ON storage.objects;
CREATE POLICY "prontuarios_staff_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'prontuarios' AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario','moderador','administrador')));

-- RPC de historico agora devolve titulo e anexos
CREATE OR REPLACE FUNCTION public.get_patient_care_history(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role public.user_role; v_records JSONB;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('voluntario','moderador','administrador') THEN
    RAISE EXCEPTION 'Apenas a equipe pode consultar o prontuario';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'id', cr.id, 'created_at', cr.created_at, 'risk_level', cr.risk_level, 'title', cr.title,
    'summary', cr.summary, 'action_taken', cr.action_taken, 'attachments', COALESCE(cr.attachments, '[]'::jsonb),
    'volunteer_id', cr.volunteer_id, 'conversation_id', cr.conversation_id,
    'volunteer_name', COALESCE(u.display_name, 'Voluntario')) ORDER BY cr.created_at DESC)
  INTO v_records FROM public.care_records cr LEFT JOIN public.users u ON u.id = cr.volunteer_id
  WHERE cr.user_id = p_user_id;
  RETURN COALESCE(v_records, '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.get_patient_care_history(UUID) TO authenticated;

-- ===== AVALIACAO DO ATENDIMENTO (alimenta "Satisfacao" do admin) =====
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS rating_comment TEXT;

-- ===== LOGS DE AUDITORIA =====
ALTER TABLE public.audit_logs ALTER COLUMN entity_id TYPE TEXT USING entity_id::text;
ALTER TABLE public.audit_logs ALTER COLUMN entity_type DROP NOT NULL;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

DROP POLICY IF EXISTS "audit_logs_insert_own" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_own" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'administrador'));

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);

-- usuario pode avaliar a propria conversa
GRANT UPDATE (rating, rating_comment) ON public.conversations TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ===== MUDANCA DE PAPEL PELO ADMIN =====
-- Quando alguem vira voluntario/moderador/admin, garante o perfil de disponibilidade.
CREATE OR REPLACE FUNCTION public.ensure_staff_profile() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IN ('voluntario','moderador','administrador') THEN
    INSERT INTO public.volunteer_profiles (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ensure_staff_profile ON public.users;
CREATE TRIGGER trg_ensure_staff_profile AFTER UPDATE OF role ON public.users
  FOR EACH ROW WHEN (OLD.role IS DISTINCT FROM NEW.role) EXECUTE FUNCTION public.ensure_staff_profile();

-- somente administrador altera papeis (o proprio usuario nao pode se promover)
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users FOR UPDATE
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'administrador'))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'administrador')
    OR (auth.uid() = id AND role = (SELECT u2.role FROM public.users u2 WHERE u2.id = auth.uid()))
  );
NOTIFY pgrst, 'reload schema';
