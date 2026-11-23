-- Guarda o e-mail em public.users para a equipe ver nome e e-mail reais nas conversas.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;

-- Preenche quem ja existe
UPDATE public.users u
   SET email = a.email
  FROM auth.users a
 WHERE a.id = u.id AND (u.email IS DISTINCT FROM a.email);

-- Novos cadastros ja nascem com e-mail
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_display VARCHAR(100);
  v_role public.user_role;
BEGIN
  v_display := LEFT(COALESCE(NULLIF(new.raw_user_meta_data->>'display_name', ''), 'Apoiado'), 100);
  IF (new.is_anonymous IS TRUE) THEN
    v_role := 'anonimo'::public.user_role;
  ELSE
    v_role := 'cadastrado'::public.user_role;
  END IF;

  INSERT INTO public.users (id, display_name, role, email)
  VALUES (new.id, v_display, v_role, new.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (new.id, COALESCE(NULLIF(new.raw_user_meta_data->>'nickname', ''), v_display))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

-- Mantem o e-mail sincronizado se a pessoa trocar de e-mail
CREATE OR REPLACE FUNCTION public.sync_user_email() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email) EXECUTE FUNCTION public.sync_user_email();

NOTIFY pgrst, 'reload schema';
