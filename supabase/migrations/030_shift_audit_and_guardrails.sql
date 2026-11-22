-- ========================================================
-- 4S Clima - Migración 030 (Verificada): Blindaje de Asistencia, Auditoría Administrativa y RPC de Verificación Activa
-- ========================================================

-- 1. Agregar columnas de auditoría administrativa a public.technician_shifts
ALTER TABLE public.technician_shifts
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE public.technician_shifts
ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.technician_shifts
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- 2. Índice para consultas rápidas de auditoría administrativa
CREATE INDEX IF NOT EXISTS idx_technician_shifts_edited_by 
ON public.technician_shifts(edited_by) 
WHERE edited_by IS NOT NULL;

-- 3. Actualizar función trigger prevent_shift_tampering
CREATE OR REPLACE FUNCTION public.prevent_shift_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Bypass para procesos internos con service_role o SQL Editor directo
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon' THEN
    RETURN NEW;
  END IF;

  -- Los administradores tienen control total para rectificar horarios y asentar notas
  IF public.is_admin() THEN
    NEW.edited_by := COALESCE(NEW.edited_by, auth.uid());
    NEW.edited_at := COALESCE(NEW.edited_at, NOW());

    IF NEW.check_out_at IS NOT NULL AND NEW.check_out_at < NEW.check_in_at THEN
      RAISE EXCEPTION 'Validation Error: Check-out time cannot be earlier than check-in time.';
    END IF;

    RETURN NEW;
  END IF;

  -- TÉCNICOS:
  IF (OLD.technician_id IS DISTINCT FROM NEW.technician_id) OR
     (OLD.shift_date IS DISTINCT FROM NEW.shift_date) OR
     (OLD.check_in_at IS DISTINCT FROM NEW.check_in_at) THEN
    RAISE EXCEPTION 'Access Denied: Technicians cannot modify shift technician, date, or check-in timestamp.';
  END IF;

  IF (OLD.admin_notes IS DISTINCT FROM NEW.admin_notes) OR
     (OLD.edited_by IS DISTINCT FROM NEW.edited_by) OR
     (OLD.edited_at IS DISTINCT FROM NEW.edited_at) THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can modify administrative audit fields.';
  END IF;

  IF NEW.check_out_at IS NOT NULL AND NEW.check_out_at < NEW.check_in_at THEN
    RAISE EXCEPTION 'Validation Error: Check-out time cannot be earlier than check-in time.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_shift_tampering ON public.technician_shifts;
CREATE TRIGGER trg_prevent_shift_tampering
BEFORE UPDATE ON public.technician_shifts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_shift_tampering();

-- 4. Función RPC ligera para verificar si un técnico posee un turno activo (usada por NativeLocationService.java)
CREATE OR REPLACE FUNCTION public.is_technician_shift_active(p_tech_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.technician_shifts
    WHERE technician_id = p_tech_id 
      AND status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_technician_shift_active(UUID) TO anon, authenticated, service_role;

-- 5. Garantizar que las políticas RLS de technician_shifts permitan a Admin insertar y editar jornadas manuales
DROP POLICY IF EXISTS "Shifts: Admin full access" ON public.technician_shifts;
CREATE POLICY "Shifts: Admin full access"
ON public.technician_shifts
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());m