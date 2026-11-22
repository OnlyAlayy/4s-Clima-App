-- ========================================================
-- 4S Clima - Migración 034 (Completa): Vínculo de Jornadas a Liquidaciones (Anti-Doble Pago)
-- ========================================================

-- 1. Agregar settlement_id a public.technician_shifts
ALTER TABLE public.technician_shifts
ADD COLUMN IF NOT EXISTS settlement_id UUID NULL REFERENCES public.technician_settlements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.technician_shifts.settlement_id IS 'Identificador de la liquidación oficial en la que se abonaron las horas de esta jornada.';

-- 2. Índices de alto rendimiento para consultas y liquidaciones pendientes
CREATE INDEX IF NOT EXISTS idx_technician_shifts_settlement_id 
ON public.technician_shifts(settlement_id);

CREATE INDEX IF NOT EXISTS idx_technician_shifts_unsettled
ON public.technician_shifts(technician_id, shift_date)
WHERE settlement_id IS NULL AND status = 'completed';

-- 3. Blindaje completo en prevent_shift_tampering (030 + 032 + 034 unificados)
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

  -- Los administradores tienen control total para rectificar horarios, horas extras, liquidar y asentar notas
  IF public.is_admin() THEN
    NEW.edited_by := COALESCE(NEW.edited_by, auth.uid());
    NEW.edited_at := COALESCE(NEW.edited_at, NOW());

    IF NEW.check_out_at IS NOT NULL AND NEW.check_out_at < NEW.check_in_at THEN
      RAISE EXCEPTION 'Validation Error: Check-out time cannot be earlier than check-in time.';
    END IF;

    RETURN NEW;
  END IF;

  -- TÉCNICOS:
  IF OLD.settlement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Access Denied: Cannot modify a shift that has already been settled and paid.';
  END IF;

  IF (OLD.technician_id IS DISTINCT FROM NEW.technician_id) OR
     (OLD.shift_date IS DISTINCT FROM NEW.shift_date) OR
     (OLD.check_in_at IS DISTINCT FROM NEW.check_in_at) OR
     (OLD.settlement_id IS DISTINCT FROM NEW.settlement_id) THEN
    RAISE EXCEPTION 'Access Denied: Technicians cannot modify shift technician, date, check-in timestamp, or settlement link.';
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
