-- ========================================================
-- 4S Clima - Migración 033 (Blindada): Tarifas Horarias Personalizadas por Técnico y Protección Anti-Tampering
-- ========================================================

-- 1. Agregar columnas de tarifas horarias en public.users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS hourly_rate_regular NUMERIC NULL CHECK (hourly_rate_regular IS NULL OR hourly_rate_regular >= 0);

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS hourly_rate_overtime NUMERIC NULL CHECK (hourly_rate_overtime IS NULL OR hourly_rate_overtime >= 0);

COMMENT ON COLUMN public.users.hourly_rate_regular IS 'Tarifa por hora ordinaria pactada para el técnico en pesos argentinos ($).';
COMMENT ON COLUMN public.users.hourly_rate_overtime IS 'Tarifa por hora extra pactada para el técnico en pesos argentinos ($). Si es NULL, se calcula como 1.5x de la ordinaria.';

-- 2. Blindaje Anti-Fraude en public.users:
-- Impide que un técnico modifique su propio rol, estado activo, horario de entrada pactado o sus tarifas horarias
CREATE OR REPLACE FUNCTION public.prevent_user_sensitive_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Permitir ejecuciones desde SQL Editor o service_role
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon' THEN
    RETURN NEW;
  END IF;

  -- Si el usuario autenticado NO es administrador, bloquear cambios en campos administrativos/salariales
  IF NOT public.is_admin() THEN
    IF (OLD.role IS DISTINCT FROM NEW.role) OR
       (OLD.active IS DISTINCT FROM NEW.active) OR
       (OLD.default_entry_time IS DISTINCT FROM NEW.default_entry_time) OR
       (OLD.hourly_rate_regular IS DISTINCT FROM NEW.hourly_rate_regular) OR
       (OLD.hourly_rate_overtime IS DISTINCT FROM NEW.hourly_rate_overtime) THEN
      RAISE EXCEPTION 'Access Denied: Only administrators can modify role, status, schedule, or hourly rates.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_sensitive_updates ON public.users;
CREATE TRIGGER trg_prevent_user_sensitive_updates
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_sensitive_updates();

-- 3. Asegurar política RLS para que el Administrador pueda actualizar las fichas de todos los técnicos
DROP POLICY IF EXISTS "Users: Admin can update all users" ON public.users;
CREATE POLICY "Users: Admin can update all users"
ON public.users
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());