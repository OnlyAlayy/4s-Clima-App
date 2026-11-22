-- ========================================================
-- 4S Clima - Migración 031 (Verificada): Horarios Habituales de Técnicos y Control Inteligente de Puntualidad
-- ========================================================

-- 1. Agregar columna default_entry_time a public.users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS default_entry_time TIME NULL;

COMMENT ON COLUMN public.users.default_entry_time IS 'Horario habitual de ingreso pactado para el técnico (ej. 08:00:00). Si es NULL, el técnico opera con ingreso flexible o según órdenes asignadas.';

-- 2. Garantizar que los Administradores puedan actualizar la ficha de cualquier técnico (ej. default_entry_time, active, phone)
DROP POLICY IF EXISTS "Users: Admin can update all users" ON public.users;
CREATE POLICY "Users: Admin can update all users"
ON public.users
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());