-- ========================================================
-- 4S Clima - Migración 032: Control y Aprobación de Horas Extras en Jornadas
-- ========================================================

-- 1. Agregar columnas de aprobación y ajuste manual de horas extras en technician_shifts
ALTER TABLE public.technician_shifts
ADD COLUMN IF NOT EXISTS overtime_approved BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.technician_shifts
ADD COLUMN IF NOT EXISTS custom_overtime_hours NUMERIC NULL;

-- Comentarios explicativos para el esquema
COMMENT ON COLUMN public.technician_shifts.overtime_approved IS 'Indica si las horas extras de la jornada están aprobadas para liquidación. Por defecto true.';
COMMENT ON COLUMN public.technician_shifts.custom_overtime_hours IS 'Horas extras fijadas manualmente por el administrador (en horas decimales). Si es NULL, se calcula automáticamente por reloj.';

-- 2. Actualizar función trigger prevent_shift_tampering para proteger los campos de horas extras
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

  -- Los administradores tienen control total para rectificar horarios, horas extras y asentar notas
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
     (OLD.edited_at IS DISTINCT FROM NEW.edited_at) OR
     (OLD.overtime_approved IS DISTINCT FROM NEW.overtime_approved) OR
     (OLD.custom_overtime_hours IS DISTINCT FROM NEW.custom_overtime_hours) THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can modify administrative audit and overtime fields.';
  END IF;

  IF NEW.check_out_at IS NOT NULL AND NEW.check_out_at < NEW.check_in_at THEN
    RAISE EXCEPTION 'Validation Error: Check-out time cannot be earlier than check-in time.';
  END IF;

  RETURN NEW;
END;
$$;
