-- =============================================================================
-- VIDA+ — SCHEMA COMPLETO, DEFINITIVO E OTIMIZADO PARA ARQUITETURA 100% SUPABASE
-- Execute este script no SQL Editor do Supabase (vmqzjgmbjvsrpfqigtso.supabase.co)
-- Idempotente: pode ser rodado múltiplas vezes sem erros.
-- Inclui: Autenticação, Perfis, Acolhimento, Chat, Tempo Real, Comunidades,
--         Auditoria, Relatórios de Voluntários e MÓDULO DE PRONTUÁRIOS (Care Records)
-- =============================================================================

BEGIN;

-- =============================================================================
-- BLOCO 1 — ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'anonimo', 'cadastrado', 'voluntario', 'moderador', 'administrador'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.conversation_status AS ENUM (
    'aguardando', 'ativa', 'sinalizada', 'encerrada', 'arquivada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_level AS ENUM (
    'baixo', 'medio', 'alto', 'imediato'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM (
    'pendente', 'em_analise', 'resolvido', 'arquivado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.application_status AS ENUM (
    'pendente', 'aprovada', 'rejeitada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- BLOCO 2 — TABELAS
-- =============================================================================

-- 1. USUÁRIOS
CREATE TABLE IF NOT EXISTS public.users (
  id           UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name VARCHAR(100),
  role         public.user_role DEFAULT 'cadastrado'::public.user_role,
  status       VARCHAR(50)  DEFAULT 'ativo',
  created_at   TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL,
  updated_at   TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. PERFIS DE USUÁRIOS
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id          UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  nickname         VARCHAR(50),
  birth_year       INT,
  state            VARCHAR(2),
  preferences_json JSONB       DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_birth_year_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_birth_year_check
  CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND EXTRACT(YEAR FROM CURRENT_DATE)::int - 13);

-- 3. CONSENTIMENTOS (LGPD)
CREATE TABLE IF NOT EXISTS public.consents (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  type        VARCHAR(100) NOT NULL,
  version     VARCHAR(20)  NOT NULL,
  accepted_at TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip_hash     VARCHAR(64)
);
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

-- 4. CANDIDATURAS DE VOLUNTÁRIOS E MODERADORES
CREATE TABLE IF NOT EXISTS public.volunteer_applications (
  id          UUID               DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID               REFERENCES public.users(id) ON DELETE CASCADE,
  status      public.application_status DEFAULT 'pendente'::public.application_status,
  motivation  TEXT,
  experience  TEXT,
  reviewer_id UUID               REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ        DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.volunteer_applications ENABLE ROW LEVEL SECURITY;

-- 5. PERFIS DE VOLUNTÁRIOS APROVADOS
CREATE TABLE IF NOT EXISTS public.volunteer_profiles (
  user_id             UUID             REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  approved_at         TIMESTAMPTZ      DEFAULT timezone('utc', now()) NOT NULL,
  availability_status VARCHAR(50)      DEFAULT 'offline',
  training_status     VARCHAR(50)      DEFAULT 'concluido',
  risk_level_allowed  public.risk_level DEFAULT 'baixo'::public.risk_level,
  total_chats         INT              DEFAULT 0
);
ALTER TABLE public.volunteer_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.volunteer_profiles
  DROP CONSTRAINT IF EXISTS volunteer_profiles_availability_check;
ALTER TABLE public.volunteer_profiles
  ADD CONSTRAINT volunteer_profiles_availability_check
  CHECK (availability_status IN ('online', 'ocupado', 'offline'));

-- 6. CONVERSAS (ATENDIMENTOS E TEAM CHAT)
CREATE TABLE IF NOT EXISTS public.conversations (
  id           UUID                      DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID                      REFERENCES public.users(id) ON DELETE RESTRICT,
  volunteer_id UUID                      REFERENCES public.users(id) ON DELETE SET NULL,
  status       public.conversation_status DEFAULT 'aguardando'::public.conversation_status,
  priority     VARCHAR(20)               DEFAULT 'normal',
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  closed_reason VARCHAR(100),
  is_team_chat BOOLEAN                   DEFAULT false,
  created_at   TIMESTAMPTZ               DEFAULT timezone('utc', now()) NOT NULL,
  updated_at   TIMESTAMPTZ               DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- 7. MENSAGENS DE ATENDIMENTO
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID        REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id       UUID        REFERENCES public.users(id) ON DELETE RESTRICT,
  body            TEXT        NOT NULL,
  body_encrypted  TEXT,
  type            VARCHAR(50) DEFAULT 'text',
  reply_to_id     UUID        REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  deleted_at      TIMESTAMPTZ
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 8. SINALIZAÇÕES DE RISCO
CREATE TABLE IF NOT EXISTS public.risk_flags (
  id              UUID              DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID              REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  created_by      UUID              REFERENCES public.users(id) NOT NULL,
  level           public.risk_level DEFAULT 'baixo'::public.risk_level,
  reason          TEXT              NOT NULL,
  action_taken    TEXT,
  created_at      TIMESTAMPTZ       DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.risk_flags ENABLE ROW LEVEL SECURITY;

-- 9. PRONTUÁRIO / FICHA DO ACOLHIDO (CARE RECORDS)
-- Registros de acolhimento e notas de evolução vinculadas ao paciente
CREATE TABLE IF NOT EXISTS public.care_records (
  id              UUID              DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID              REFERENCES public.users(id) ON DELETE CASCADE NOT NULL, -- O acolhido
  volunteer_id    UUID              REFERENCES public.users(id) NOT NULL,                   -- Voluntário responsável
  conversation_id UUID              REFERENCES public.conversations(id) ON DELETE SET NULL,
  risk_level      public.risk_level DEFAULT 'baixo'::public.risk_level,
  summary         TEXT              NOT NULL,                                               -- Relato/Evolução
  action_taken    TEXT,                                                                     -- Conduta adotada
  created_at      TIMESTAMPTZ       DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMPTZ       DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.care_records ENABLE ROW LEVEL SECURITY;

-- 10. RELATÓRIOS INTERNOS DE VOLUNTÁRIOS
CREATE TABLE IF NOT EXISTS public.volunteer_reports (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  volunteer_id    UUID        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  target_user_id  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  conversation_id UUID        REFERENCES public.conversations(id) ON DELETE SET NULL,
  title           VARCHAR(200) NOT NULL,
  description     TEXT        NOT NULL,
  status          VARCHAR(50) DEFAULT 'pendente',
  admin_feedback  TEXT,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.volunteer_reports ENABLE ROW LEVEL SECURITY;

-- 11. DENÚNCIAS (REPORTS)
CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID                  DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID                  REFERENCES public.users(id) ON DELETE SET NULL,
  target_type VARCHAR(50)           NOT NULL,
  target_id   UUID                  NOT NULL,
  reason      VARCHAR(100)          NOT NULL,
  description TEXT,
  status      public.report_status  DEFAULT 'pendente'::public.report_status,
  created_at  TIMESTAMPTZ           DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 12. CASOS DE MODERAÇÃO
CREATE TABLE IF NOT EXISTS public.moderation_cases (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id   UUID        REFERENCES public.reports(id) ON DELETE CASCADE UNIQUE,
  assigned_to UUID        REFERENCES public.users(id),
  status      VARCHAR(50) DEFAULT 'aberto',
  decision    TEXT,
  resolved_at TIMESTAMPTZ
);
ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;

-- 13. COMUNIDADES PSEUDÔNIMAS
CREATE TABLE IF NOT EXISTS public.communities (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  status      VARCHAR(50)  DEFAULT 'ativo',
  rules_json  JSONB        DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- 14. MEMBROS DA COMUNIDADE
CREATE TABLE IF NOT EXISTS public.community_members (
  community_id UUID        REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  alias        VARCHAR(80) NOT NULL,
  role         VARCHAR(50) DEFAULT 'membro',
  status       VARCHAR(50) DEFAULT 'ativo',
  joined_at    TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  PRIMARY KEY (community_id, user_id)
);
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

-- 15. MENSAGENS DE COMUNIDADE
CREATE TABLE IF NOT EXISTS public.community_messages (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id   UUID        REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  sender_id      UUID        REFERENCES public.users(id) ON DELETE RESTRICT NOT NULL,
  alias_snapshot VARCHAR(80) NOT NULL,
  body           TEXT        NOT NULL,
  body_encrypted TEXT,
  created_at     TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  edited_at      TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ
);
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- 16. NOTIFICAÇÕES
CREATE TABLE IF NOT EXISTS public.notifications (
  id      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  type    VARCHAR(50) NOT NULL,
  title   VARCHAR(150) NOT NULL,
  body    TEXT         NOT NULL,
  status  VARCHAR(50)  DEFAULT 'nao_lida',
  sent_at TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL,
  read_at TIMESTAMPTZ
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 17. LOGS DE AUDITORIA
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id      UUID,
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(100) NOT NULL,
  entity_id     UUID,
  metadata_json JSONB        DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- BLOCO 3 — ÍNDICES
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_open_per_user
  ON public.conversations(user_id)
  WHERE status IN ('aguardando', 'ativa', 'sinalizada') AND (is_team_chat IS NOT TRUE);

CREATE INDEX IF NOT EXISTS idx_conversations_queue
  ON public.conversations(status, created_at)
  WHERE status = 'aguardando';

CREATE INDEX IF NOT EXISTS idx_conversations_volunteer_history
  ON public.conversations(volunteer_id, created_at DESC)
  WHERE volunteer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_timeline
  ON public.messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_care_records_user
  ON public.care_records(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_volunteer_reports_vol
  ON public.volunteer_reports(volunteer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON public.reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_status
  ON public.notifications(user_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_messages_timeline
  ON public.community_messages(community_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- BLOCO 4 — POLÍTICAS RLS (ROW LEVEL SECURITY)
-- =============================================================================

-- users
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (
  auth.uid() = id OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario', 'moderador', 'administrador')
  )
);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (
  auth.uid() = id OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'administrador'
  )
);

-- user_profiles
DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
CREATE POLICY "user_profiles_select_own" ON public.user_profiles FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario', 'moderador', 'administrador')
  )
);

DROP POLICY IF EXISTS "user_profiles_all_own" ON public.user_profiles;
CREATE POLICY "user_profiles_all_own" ON public.user_profiles FOR ALL USING (auth.uid() = user_id);

-- consents
DROP POLICY IF EXISTS "consents_all_own" ON public.consents;
CREATE POLICY "consents_all_own" ON public.consents FOR ALL USING (auth.uid() = user_id);

-- volunteer_applications
DROP POLICY IF EXISTS "volunteer_applications_insert_own" ON public.volunteer_applications;
CREATE POLICY "volunteer_applications_insert_own" ON public.volunteer_applications FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "volunteer_applications_select_own" ON public.volunteer_applications;
CREATE POLICY "volunteer_applications_select_own" ON public.volunteer_applications FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador')
  )
);

DROP POLICY IF EXISTS "volunteer_applications_update_staff" ON public.volunteer_applications;
CREATE POLICY "volunteer_applications_update_staff" ON public.volunteer_applications FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador'))
);

-- volunteer_profiles
DROP POLICY IF EXISTS "volunteer_profiles_select" ON public.volunteer_profiles;
CREATE POLICY "volunteer_profiles_select" ON public.volunteer_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "volunteer_profiles_update_own" ON public.volunteer_profiles;
CREATE POLICY "volunteer_profiles_update_own" ON public.volunteer_profiles FOR UPDATE USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'administrador'
  )
);

-- conversations
DROP POLICY IF EXISTS "conversations_access" ON public.conversations;
CREATE POLICY "conversations_access" ON public.conversations FOR ALL USING (
  auth.uid() = user_id 
  OR auth.uid() = volunteer_id
  OR (status = 'aguardando' AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario', 'moderador', 'administrador')))
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador'))
);

-- messages
DROP POLICY IF EXISTS "messages_access" ON public.messages;
CREATE POLICY "messages_access" ON public.messages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (
        c.user_id = auth.uid() 
        OR c.volunteer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador'))
      )
  )
);

-- PRONTUÁRIOS (CARE RECORDS) - Apenas voluntários, moderadores e administradores
DROP POLICY IF EXISTS "care_records_staff_only" ON public.care_records;
CREATE POLICY "care_records_staff_only" ON public.care_records FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('voluntario', 'moderador', 'administrador')
  )
);

-- volunteer_reports
DROP POLICY IF EXISTS "volunteer_reports_access" ON public.volunteer_reports;
CREATE POLICY "volunteer_reports_access" ON public.volunteer_reports FOR ALL USING (
  volunteer_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador')
  )
);

-- risk_flags
DROP POLICY IF EXISTS "risk_flags_access" ON public.risk_flags;
CREATE POLICY "risk_flags_access" ON public.risk_flags FOR ALL USING (
  created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('voluntario', 'moderador', 'administrador')
  )
);

-- reports
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "reports_select" ON public.reports;
CREATE POLICY "reports_select" ON public.reports FOR SELECT USING (
  auth.uid() = reporter_id OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador')
  )
);

DROP POLICY IF EXISTS "reports_update" ON public.reports;
CREATE POLICY "reports_update" ON public.reports FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador'))
);

-- communities & members
DROP POLICY IF EXISTS "communities_select" ON public.communities;
CREATE POLICY "communities_select" ON public.communities FOR SELECT USING (status = 'ativo');

DROP POLICY IF EXISTS "community_members_access" ON public.community_members;
CREATE POLICY "community_members_access" ON public.community_members FOR ALL USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador')
  )
);

-- community_messages
DROP POLICY IF EXISTS "community_messages_select" ON public.community_messages;
CREATE POLICY "community_messages_select" ON public.community_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.community_members m
    WHERE m.community_id = community_messages.community_id
      AND m.user_id = auth.uid()
      AND m.status = 'ativo'
  )
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador'))
);

DROP POLICY IF EXISTS "community_messages_insert" ON public.community_messages;
CREATE POLICY "community_messages_insert" ON public.community_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_members m
    WHERE m.community_id = community_messages.community_id
      AND m.user_id = auth.uid()
      AND m.status = 'ativo'
  )
);

-- notifications
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- BLOCO 5 — TRIGGERS E FUNÇÕES AUXILIARES
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display VARCHAR(100);
  v_role public.user_role;
BEGIN
  v_display := LEFT(COALESCE(NULLIF(new.raw_user_meta_data->>'display_name', ''), 'Apoiado'), 100);
  
  -- Se for login anônimo
  IF (new.is_anonymous IS TRUE) THEN
    v_role := 'anonimo'::public.user_role;
  ELSE
    v_role := 'cadastrado'::public.user_role;
  END IF;

  INSERT INTO public.users (id, display_name, role)
  VALUES (new.id, v_display, v_role)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (new.id, v_display)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- BLOCO 6 — RPCs PARA SUPABASE (AÇÕES DIRETAS DO FRONTEND COM SEGURANÇA)
-- =============================================================================

-- 1. Entrar na fila de espera de forma atômica
CREATE OR REPLACE FUNCTION public.join_support_queue()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_conv RECORD;
  v_pos INT;
  v_est INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Verifica se já tem atendimento ativo ou aguardando
  SELECT * INTO v_conv
  FROM public.conversations
  WHERE user_id = v_user_id AND status IN ('aguardando', 'ativa')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_conv.id IS NULL THEN
    INSERT INTO public.conversations (user_id, status, priority)
    VALUES (v_user_id, 'aguardando', 'normal')
    RETURNING * INTO v_conv;
  END IF;

  SELECT count(*) INTO v_pos
  FROM public.conversations
  WHERE status = 'aguardando' AND created_at <= v_conv.created_at;

  v_pos := COALESCE(v_pos, 1);
  v_est := GREATEST(2, v_pos * 3);

  RETURN jsonb_build_object(
    'id', v_conv.id,
    'status', v_conv.status,
    'position', v_pos,
    'estimated_wait_minutes', v_est,
    'created_at', v_conv.created_at
  );
END;
$$;

-- 2. Voluntário aceita atendimento
CREATE OR REPLACE FUNCTION public.accept_support_conversation(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vol_id UUID := auth.uid();
  v_role public.user_role;
  v_conv RECORD;
BEGIN
  IF v_vol_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_vol_id;
  IF v_role NOT IN ('voluntario', 'moderador', 'administrador') THEN
    RAISE EXCEPTION 'Apenas voluntários podem aceitar atendimentos';
  END IF;

  UPDATE public.conversations
  SET status = 'ativa',
      volunteer_id = v_vol_id,
      started_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE id = p_conversation_id AND status = 'aguardando'
  RETURNING * INTO v_conv;

  IF v_conv.id IS NULL THEN
    RAISE EXCEPTION 'Atendimento não está mais aguardando ou não existe';
  END IF;

  RETURN jsonb_build_object(
    'id', v_conv.id,
    'status', v_conv.status,
    'volunteer_id', v_conv.volunteer_id,
    'started_at', v_conv.started_at
  );
END;
$$;

-- 3. Encerrar conversa e opcionalmente criar prontuário
CREATE OR REPLACE FUNCTION public.close_support_conversation(
  p_conversation_id UUID,
  p_reason VARCHAR(100) DEFAULT 'encerrado_normalmente',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_conv RECORD;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF v_conv.id IS NULL THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  IF v_conv.user_id != v_actor_id AND v_conv.volunteer_id != v_actor_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor_id AND role IN ('moderador', 'administrador')) THEN
      RAISE EXCEPTION 'Permissão negada';
    END IF;
  END IF;

  UPDATE public.conversations
  SET status = 'encerrada',
      ended_at = timezone('utc', now()),
      closed_reason = p_reason,
      updated_at = timezone('utc', now())
  WHERE id = p_conversation_id;

  -- Se foi informado notas/registro de prontuário e quem encerrou foi voluntário:
  IF p_notes IS NOT NULL AND TRIM(p_notes) != '' AND v_conv.volunteer_id IS NOT NULL THEN
    INSERT INTO public.care_records (user_id, volunteer_id, conversation_id, summary)
    VALUES (v_conv.user_id, v_conv.volunteer_id, p_conversation_id, p_notes);
  END IF;

  RETURN jsonb_build_object('ok', true, 'conversation_id', p_conversation_id);
END;
$$;

-- 4. Consultar histórico de prontuários do paciente (para voluntários)
CREATE OR REPLACE FUNCTION public.get_patient_care_history(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vol_id UUID := auth.uid();
  v_role public.user_role;
  v_records JSONB;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = v_vol_id;
  IF v_role NOT IN ('voluntario', 'moderador', 'administrador') THEN
    RAISE EXCEPTION 'Apenas voluntários podem consultar o prontuário';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', cr.id,
      'created_at', cr.created_at,
      'risk_level', cr.risk_level,
      'summary', cr.summary,
      'action_taken', cr.action_taken,
      'volunteer_name', COALESCE(u.display_name, 'Voluntário')
    ) ORDER BY cr.created_at DESC
  ) INTO v_records
  FROM public.care_records cr
  LEFT JOIN public.users u ON u.id = cr.volunteer_id
  WHERE cr.user_id = p_user_id;

  RETURN COALESCE(v_records, '[]'::jsonb);
END;
$$;

-- =============================================================================
-- BLOCO 7 — HABILITAR SUPABASE REALTIME
-- =============================================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.care_records;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- BLOCO 8 — DADOS INICIAIS DE COMUNIDADES
-- =============================================================================

INSERT INTO public.communities (name, description, rules_json)
SELECT * FROM (VALUES
  (
    'Conversas leves',
    'Um espaco para conversar sobre o dia e encontrar companhia.',
    '["Respeite o tempo de cada pessoa","Nao compartilhe dados pessoais","Sem diagnosticos ou prescricoes"]'::jsonb
  ),
  (
    'Ansiedade e rotina',
    'Trocas acolhedoras sobre ansiedade, habitos e pequenos passos.',
    '["Fale a partir da propria experiencia","Evite gatilhos explicitos","Procure ajuda profissional quando necessario"]'::jsonb
  ),
  (
    'Luto e saudade',
    'Um grupo cuidadoso para quem esta atravessando perdas.',
    '["Acolha sem comparar dores","Nao pressione ninguem a responder","Use aviso antes de conteudo sensivel"]'::jsonb
  )
) AS seed(name, description, rules_json)
WHERE NOT EXISTS (SELECT 1 FROM public.communities LIMIT 1);

COMMIT;
