-- ==============================================================================
-- 4S Clima - Migración 015: Checklist en Modo Borrador, Inmutabilidad y Plantillas Dinámicas
-- 015_checklist_draft_and_templates.sql
-- ==============================================================================
-- 1. Tabla de plantillas dinámicas de checklist (checklist_templates)
-- 2. Campos checklist_status, checklist_submitted_at, checklist_template_id en work_orders
-- 3. Triggers de inmutabilidad y seguridad RLS para bloquear modificaciones post-envío
-- ==============================================================================

-- ==========================================
-- 1. TABLA: checklist_templates
-- ==========================================
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  equipment_type TEXT, -- 'split', 'central', etc., o NULL para genérico
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_checklist_templates_eq_type ON public.checklist_templates(equipment_type);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_active ON public.checklist_templates(active);

-- Trigger de updated_at para templates
DROP TRIGGER IF EXISTS set_checklist_templates_updated_at ON public.checklist_templates;
CREATE TRIGGER set_checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Habilitar RLS en checklist_templates
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "ChecklistTemplates: Admin All" ON public.checklist_templates;
CREATE POLICY "ChecklistTemplates: Admin All" ON public.checklist_templates
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "ChecklistTemplates: Tech Select" ON public.checklist_templates;
CREATE POLICY "ChecklistTemplates: Tech Select" ON public.checklist_templates
  FOR SELECT USING (auth.role() = 'authenticated');

-- ==========================================
-- 2. COLUMNAS EN TABLA: work_orders
-- ==========================================
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS checklist_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS checklist_submitted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS checklist_template_id UUID NULL REFERENCES public.checklist_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.work_orders.checklist_status IS 'Estado del checklist: draft (borrador editable) o submitted (enviado e inmutable)';
COMMENT ON COLUMN public.work_orders.checklist_submitted_at IS 'Fecha y hora exacta en la que el técnico selló y envió el checklist';
COMMENT ON COLUMN public.work_orders.checklist_template_id IS 'Plantilla dinámica opcional asignada a la orden de trabajo';

-- Constraint de validación de estado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_work_orders_checklist_status'
  ) THEN
    ALTER TABLE public.work_orders
      ADD CONSTRAINT check_work_orders_checklist_status
      CHECK (checklist_status IN ('draft', 'submitted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_orders_checklist_status ON public.work_orders(checklist_status);
CREATE INDEX IF NOT EXISTS idx_work_orders_checklist_template ON public.work_orders(checklist_template_id);

-- ==========================================
-- 3. INMUTABILIDAD EN WORK_ORDERS (Trigger Backend)
-- ==========================================
-- Un técnico no puede revertir un checklist 'submitted' a 'draft'.
-- Tampoco puede enviar ('submitted') si hay ítems con status NULL en checklist_items.
CREATE OR REPLACE FUNCTION public.prevent_tech_checklist_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin() THEN
    -- 1. Bloquear reversión de submitted a draft
    IF OLD.checklist_status = 'submitted' AND NEW.checklist_status != 'submitted' THEN
      RAISE EXCEPTION 'Access Denied: Technicians cannot revert a submitted checklist back to draft.';
    END IF;

    -- 2. Validar que no haya ítems sin responder al momento de pasar a submitted
    IF NEW.checklist_status = 'submitted' AND (OLD.checklist_status IS DISTINCT FROM 'submitted') THEN
      IF EXISTS (
        SELECT 1 FROM public.checklist_items 
        WHERE work_order_id = NEW.id AND status IS NULL
      ) THEN
        RAISE EXCEPTION 'Workflow Violation: Cannot submit checklist with unanswered items.';
      END IF;

      NEW.checklist_submitted_at := COALESCE(NEW.checklist_submitted_at, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_checklist_submission_rules ON public.work_orders;
CREATE TRIGGER enforce_checklist_submission_rules
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tech_checklist_tampering();

-- ==========================================
-- 4. INMUTABILIDAD EN CHECKLIST_ITEMS (Trigger Backend)
-- ==========================================
-- Bloquea cualquier INSERT, UPDATE o DELETE por parte de técnicos sobre ítems 
-- de una orden que ya tiene checklist_status = 'submitted'.
CREATE OR REPLACE FUNCTION public.prevent_submitted_checklist_item_modifications()
RETURNS TRIGGER AS $$
DECLARE
  target_wo_id UUID;
  current_c_status TEXT;
BEGIN
  -- Los administradores/dueños pueden gestionar o rectificar si fuera necesario
  IF public.is_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  target_wo_id := COALESCE(OLD.work_order_id, NEW.work_order_id);

  SELECT checklist_status INTO current_c_status
  FROM public.work_orders
  WHERE id = target_wo_id;

  IF current_c_status = 'submitted' THEN
    RAISE EXCEPTION 'Record Locked: Checklist has been submitted and is permanently sealed against technician modifications.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS lock_submitted_checklist_items ON public.checklist_items;
CREATE TRIGGER lock_submitted_checklist_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.checklist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_submitted_checklist_item_modifications();

-- ==========================================
-- 5. BACKFILL DE DATOS HISTÓRICOS
-- ==========================================
-- Asegurar que órdenes históricas ya completadas queden marcadas como 'submitted'
UPDATE public.work_orders
SET checklist_status = 'submitted',
    checklist_submitted_at = COALESCE(completed_at, updated_at, now())
WHERE status = 'completed' AND (checklist_status IS NULL OR checklist_status = 'draft');
