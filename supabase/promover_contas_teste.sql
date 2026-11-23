-- Rode no SQL Editor do Supabase: define o papel de cada conta de teste.
UPDATE public.users SET role = 'voluntario'    WHERE id = (SELECT id FROM auth.users WHERE email = 'teste.voluntario@vidamais.app');
UPDATE public.users SET role = 'moderador'     WHERE id = (SELECT id FROM auth.users WHERE email = 'teste.moderador@vidamais.app');
UPDATE public.users SET role = 'administrador' WHERE id = (SELECT id FROM auth.users WHERE email = 'teste.administrador@vidamais.app');
SELECT u.email, p.role FROM auth.users u JOIN public.users p ON p.id = u.id WHERE u.email LIKE 'teste.%@vidamais.app';
