-- ==============================================================================
-- 4S Clima - Migración 027: Blindaje Post-Auditoría de Seguridad (VULN-04 a VULN-07)
-- ==============================================================================
-- Acciones y Controles:
-- 1. SEC-01: Hardening de funciones de verificación de roles (is_admin, is_owner) con search_path seguro.
-- 2. SEC-02 (VULN-04): Inmutabilidad financiera estricta en work_orders protegiendo technician_payout,
--    labor_rate_type y payout_status frente a modificaciones de técnicos.
-- 3. SEC-03 (VULN-05): Trigger de inmutabilidad en technician_shifts para impedir adulteración retroactiva
--    de shift_date y check_in_at por parte de técnicos.
-- 4. SEC-04 (VULN-06): Hardening de search_path = public, pg_temp en funciones SECURITY DEFINER.
-- 5. SEC-05 (VULN-07): Privilegios elevados SECURITY DEFINER en trg_update_equipment_on_order_completed
--    para permitir que el cierre de orden por el técnico actualice la trazabilidad del activo en equipment.
-- ==============================================================================

-- 1. Verificación de Roles Segura (Idempotente)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin', 'owner') AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'owner' AND active = true
  );
$$;

-- 2. Inmutabilidad de Roles en public.users con Bypass de Service Role
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Bypass seguro para SQL Editor, Edge Functions y procesos con service_role
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon' THEN
    RETURN NEW;
  END IF;

  IF (OLD.role IS DISTINCT FROM NEW.role) AND NOT public.is_owner() THEN
    RAISE EXCEPTION 'Access Denied: Only owners can modify user roles.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unauthorized_role_change ON public.users;
CREATE TRIGGER trg_prevent_unauthorized_role_change
BEFORE UPDATE OF role ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_unauthorized_role_change();

-- 3. VULN-04: Protección Antifraude Financiera y Liquidaciones en public.work_orders
CREATE OR REPLACE FUNCTION public.prevent_tech_financial_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Bypass seguro para SQL Editor, Edge Functions y procesos con service_role
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    -- El técnico no puede reasignar la orden a otro técnico
    IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
      RAISE EXCEPTION 'Access Denied: Technicians cannot reassign work orders.';
    END IF;

    -- El técnico no puede alterar campos comerciales, facturación ni montos de liquidación
    IF (OLD.total_amount IS DISTINCT FROM NEW.total_amount) OR
       (OLD.payment_status IS DISTINCT FROM NEW.payment_status) OR
       (OLD.payment_method IS DISTINCT FROM NEW.payment_method) OR
       (OLD.afip_voucher_number IS DISTINCT FROM NEW.afip_voucher_number) OR
       (OLD.afip_cae IS DISTINCT FROM NEW.afip_cae) OR
       (OLD.technician_payout IS DISTINCT FROM NEW.technician_payout) OR
       (OLD.labor_rate_type IS DISTINCT FROM NEW.labor_rate_type) OR
       (OLD.payout_status IS DISTINCT FROM NEW.payout_status) THEN
      RAISE EXCEPTION 'Access Denied: Technicians cannot alter financial, billing, or payout data.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tech_financial_tampering ON public.work_orders;
CREATE TRIGGER trg_prevent_tech_financial_tampering
BEFORE UPDATE ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_tech_financial_tampering();

-- 4. VULN-05: Inmutabilidad de Turnos y Prevención de Horas Extras Forjadas en public.technician_shifts
CREATE OR REPLACE FUNCTION public.prevent_shift_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Bypass seguro para SQL Editor, Edge Functions y procesos con service_role
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon' THEN
    RETURN NEW;
  END IF;

  -- Administradores y propietarios pueden realizar ajustes autorizados
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- El técnico no puede transferir su turno a otro técnico, cambiar la fecha ni modificar su hora de ingreso
  IF (OLD.technician_id IS DISTINCT FROM NEW.technician_id) OR
     (OLD.shift_date IS DISTINCT FROM NEW.shift_date) OR
     (OLD.check_in_at IS DISTINCT FROM NEW.check_in_at) THEN
    RAISE EXCEPTION 'Access Denied: Technicians cannot modify shift technician, date, or check-in timestamp.';
  END IF;

  -- Validación cronológica: El check-out no puede ser anterior al check-in
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

-- 5. VULN-07: Actualización de Equipamiento en Cierre de Orden con Privilegios Elevados
CREATE OR REPLACE FUNCTION public.trg_update_equipment_on_order_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.equipment_id IS NOT NULL AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
        UPDATE public.equipment
        SET last_service_at = COALESCE(NEW.completed_at, NOW()),
            next_recommended_service_at = (COALESCE(NEW.completed_at, NOW())::DATE + INTERVAL '90 days')::DATE,
            updated_at = NOW()
        WHERE id = NEW.equipment_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_orders_equipment_completed ON public.work_orders;
CREATE TRIGGER trg_work_orders_equipment_completed
AFTER UPDATE OF status ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_update_equipment_on_order_completed();

-- 6. VULN-06: Hardening de search_path en Funciones Adicionales
CREATE OR REPLACE FUNCTION public.prevent_completed_wo_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  wo_status public.work_order_status;
BEGIN
  IF public.is_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'work_orders' THEN
    wo_status := OLD.status;
  ELSIF TG_TABLE_NAME IN ('checklist_items', 'extras', 'photos', 'signatures') THEN
    SELECT status INTO wo_status FROM public.work_orders WHERE id = COALESCE(OLD.work_order_id, NEW.work_order_id);
  END IF;

  IF wo_status = 'completed' THEN
    RAISE EXCEPTION 'Record Locked: Cannot modify or delete items of a completed work order.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

