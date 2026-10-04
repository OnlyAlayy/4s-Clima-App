-- ==========================================
-- 4S Clima - Security Patch
-- Refinar RLS de la tabla users (Evitar Escalada de Privilegios)
-- ==========================================

-- 1. Eliminar política insegura previa
DROP POLICY IF EXISTS "Admins full access" ON public.users;
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;

-- 2. Nueva función para verificar si es owner
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. Políticas de SELECT (Lectura)
-- Todos pueden leer su propio perfil.
CREATE POLICY "Users can read own profile" ON public.users FOR SELECT USING (id = auth.uid());
-- Admins y Owners pueden leer todos los perfiles (para listarlos en el panel).
CREATE POLICY "Admins can read all profiles" ON public.users FOR SELECT USING (public.is_admin());

-- 4. Políticas de UPDATE (Actualización)
-- Un owner puede actualizar a cualquiera.
CREATE POLICY "Owners can update all profiles" ON public.users FOR UPDATE USING (public.is_owner());
-- Un admin solo puede actualizar a usuarios con rol 'tecnico'. NO puede cambiar roles ni tocar a otros admins/owners.
CREATE POLICY "Admins can update technicians" ON public.users FOR UPDATE 
  USING (public.is_admin() AND role = 'tecnico')
  WITH CHECK (public.is_admin() AND role = 'tecnico');

-- 5. Políticas de INSERT/DELETE
-- Solo el owner puede insertar o borrar perfiles manualmente (aunque se hace por trigger).
CREATE POLICY "Owners can insert profiles" ON public.users FOR INSERT WITH CHECK (public.is_owner());
CREATE POLICY "Owners can delete profiles" ON public.users FOR DELETE USING (public.is_owner());
