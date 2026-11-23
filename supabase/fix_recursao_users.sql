-- Corrige: "infinite recursion detected in policy for relation users"
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- Funcao auxiliar: le o papel de quem esta logado SEM passar pelas regras (RLS),
-- evitando que a regra de "users" consulte a propria tabela "users".
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- Leitura: cada pessoa ve o proprio cadastro; a equipe ve todos.
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (
  auth.uid() = id
  OR public.current_user_role() IN ('voluntario', 'moderador', 'administrador')
);

-- Alteracao: o administrador muda qualquer papel; cada pessoa edita so o proprio
-- cadastro e NAO pode mudar o proprio papel.
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users FOR UPDATE
  USING (auth.uid() = id OR public.current_user_role() = 'administrador')
  WITH CHECK (
    public.current_user_role() = 'administrador'
    OR (auth.uid() = id AND role = public.current_user_role())
  );

NOTIFY pgrst, 'reload schema';
