-- Rode UMA vez no Supabase: SQL Editor -> New query -> Run.
-- Alinha community_messages / community_members com o app e libera permissões.

ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS body_encrypted TEXT;
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS alias_snapshot VARCHAR(80);
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS sender_id UUID;
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.community_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.community_messages ALTER COLUMN alias_snapshot DROP NOT NULL;

ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS alias VARCHAR(80);
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'membro';
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ativo';
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT SELECT, INSERT ON public.community_messages TO authenticated;
GRANT SELECT ON public.communities TO anon, authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_messages_select" ON public.community_messages;
CREATE POLICY "community_messages_select" ON public.community_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.community_members m
          WHERE m.community_id = community_messages.community_id
            AND m.user_id = auth.uid() AND m.status = 'ativo')
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador','administrador'))
);
DROP POLICY IF EXISTS "community_messages_insert" ON public.community_messages;
CREATE POLICY "community_messages_insert" ON public.community_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.community_members m
              WHERE m.community_id = community_messages.community_id
                AND m.user_id = auth.uid() AND m.status = 'ativo')
);

ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_members_access" ON public.community_members;
CREATE POLICY "community_members_access" ON public.community_members FOR ALL
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('moderador','administrador')))
WITH CHECK (auth.uid() = user_id);

-- Recarrega o cache do PostgREST (resolve "Could not find the 'body' column ... schema cache")
NOTIFY pgrst, 'reload schema';
