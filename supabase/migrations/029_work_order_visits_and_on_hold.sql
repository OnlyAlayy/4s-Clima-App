-- ========================================================
-- 4S Clima - Migración 029
-- Sistema de Tramos / Visitas Múltiples (Obras Largas y Relevo de Técnicos)
-- y Reporte de Impedimentos / Pausa Operativa (on_hold)
-- ========================================================

-- 1. Agregar 'on_hold' al ENUM de estados de work_order_status
ALTER TYPE public.work_order_status ADD VALUE IF NOT EXISTS 'on_hold';

-- 2. Ampliar public.work_orders con metadata de pausa e impedimentos
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS hold_notes TEXT,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.work_orders.hold_reason IS 'Motivo estandarizado de la pausa/bloqueo (missing_parts, human_error, client_absent, time_limit, technical_complexity, other)';
COMMENT ON COLUMN public.work_orders.hold_notes IS 'Explicación técnica detallada del técnico al reportar el impedimento o pausa';
COMMENT ON COLUMN public.work_orders.paused_at IS 'Fecha y hora en que la orden fue pausada';
COMMENT ON COLUMN public.work_orders.paused_by IS 'Usuario que reportó la pausa o bloqueo operativo';

-- 3. Crear tabla public.work_order_visits (Bitácora de Tramos y Visitas por Técnico)
CREATE TABLE IF NOT EXISTS public.work_order_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  outcome TEXT NOT NULL DEFAULT 'in_progress' CHECK (outcome IN ('in_progress', 'partial_advance', 'blocked', 'completed', 'reassigned')),
  reason_code TEXT,
  summary_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.work_order_visits IS 'Bitácora cronológica de tramos y visitas de trabajo realizadas por técnicos en órdenes de trabajo';
COMMENT ON COLUMN public.work_order_visits.outcome IS 'Resultado del tramo: in_progress, partial_advance, blocked, completed, reassigned';
COMMENT ON COLUMN public.work_order_visits.reason_code IS 'Código opcional de motivo (ej. motivo de bloqueo si outcome=blocked)';
COMMENT ON COLUMN public.work_order_visits.summary_notes IS 'Resumen o notas técnicas del avance registrado en la visita';

-- 4. Índices para alto rendimiento
CREATE INDEX IF NOT EXISTS idx_work_order_visits_wo_id 
  ON public.work_order_visits(work_order_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_order_visits_tech_id 
  ON public.work_order_visits(technician_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_order_visits_outcome 
  ON public.work_order_visits(outcome);

-- 5. Row Level Security (RLS) en public.work_order_visits
ALTER TABLE public.work_order_visits ENABLE ROW LEVEL SECURITY;

-- Limpieza idempotente de políticas previas
DROP POLICY IF EXISTS "Visits: Select for assigned techs or admin" ON public.work_order_visits;
DROP POLICY IF EXISTS "Visits: Insert for assigned tech or admin" ON public.work_order_visits;
DROP POLICY IF EXISTS "Visits: Update for visit tech or admin" ON public.work_order_visits;
DROP POLICY IF EXISTS "Visits: Delete for admin only" ON public.work_order_visits;

-- Lectura: Administradores, el técnico que creó la visita, o cualquier técnico asignado a la orden
-- Lectura: Administradores, el técnico que creó la visita, o cualquier técnico asignado a la orden (para ver avances de relevos anteriores)
CREATE POLICY "Visits: Select for assigned techs or admin"
ON public.work_order_visits
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR technician_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id = work_order_visits.work_order_id
      AND wo.assigned_to = auth.uid()
  )
);

-- Inserción: Administradores o el técnico actualmente asignado a la orden
CREATE POLICY "Visits: Insert for assigned tech or admin"
ON public.work_order_visits
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    technician_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = work_order_visits.work_order_id
        AND wo.assigned_to = auth.uid()
    )
  )
);

-- Actualización: Administradores o el técnico dueño de la visita
CREATE POLICY "Visits: Update for visit tech or admin"
ON public.work_order_visits
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR technician_id = auth.uid()
)
WITH CHECK (
  public.is_admin()
  OR technician_id = auth.uid()
);

-- Eliminación: Exclusivamente administradores
CREATE POLICY "Visits: Delete for admin only"
ON public.work_order_visits
FOR DELETE
TO authenticated
USING (public.is_admin());

-- 6. Agregar public.work_order_visits a Realtime (si la publicación existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_order_visits;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- 7. Actualización y Blindaje de Trigger de Integridad en public.work_orders
-- Permite al técnico registrar pausas operativas (on_hold), avances parciales (pending),
-- actualizar notas técnicas y vincular equipos sin romper inmutabilidad comercial ni bypass de completado.
CREATE OR REPLACE FUNCTION public.prevent_tech_immutable_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el usuario no es admin/owner (o sea, es técnico o rol operativo)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    -- Bloquear modificación de asignaciones troncales y datos contables/fiscales
    IF NEW.client_id IS DISTINCT FROM OLD.client_id OR
       NEW.plant_id IS DISTINCT FROM OLD.plant_id OR
       NEW.order_number IS DISTINCT FROM OLD.order_number OR
       NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR
       NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
       NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
       NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
       NEW.afip_voucher_number IS DISTINCT FROM OLD.afip_voucher_number OR
       NEW.afip_cae IS DISTINCT FROM OLD.afip_cae THEN
      RAISE EXCEPTION 'Access Denied: Technicians cannot modify core assignments or financial billing fields.';
    END IF;

    -- Permitir vincular equipo si la orden no tenía uno asignado (escaneo QR en planta)
    IF OLD.equipment_id IS NOT NULL AND NEW.equipment_id IS DISTINCT FROM OLD.equipment_id THEN
      RAISE EXCEPTION 'Access Denied: Technicians cannot reassign an already linked equipment.';
    END IF;

    -- Workflow Enforcement: Evitar bypass de completado
    -- Solo exige checklist respondido y firma si el estado final es 'completed'
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
      -- 1. No puede haber items del checklist sin responder
      IF EXISTS (SELECT 1 FROM public.checklist_items WHERE work_order_id = NEW.id AND status IS NULL) THEN
        RAISE EXCEPTION 'Workflow Violation: Cannot complete work order with unanswered checklist items.';
      END IF;
      -- 2. Obligatorio tener firma del cliente
      IF NOT EXISTS (SELECT 1 FROM public.signatures WHERE work_order_id = NEW.id) THEN
        RAISE EXCEPTION 'Workflow Violation: Cannot complete work order without a client signature.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS enforce_tech_immutable_updates ON public.work_orders;
CREATE TRIGGER enforce_tech_immutable_updates
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tech_immutable_updates();

-- 8. Actualización de Trigger Antifraude Financiero en public.work_orders (026/027)
-- Garantiza que las transiciones a 'on_hold' y 'pending' (avance parcial), así como la
-- carga de hold_reason, hold_notes, paused_at, paused_by, travel_started_at y arrived_at
-- sean fluidas y no bloqueadas para el técnico asignado.
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

-- 9. Concesión explícita de permisos sobre la tabla de visitas
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_order_visits TO authenticated, service_role;
