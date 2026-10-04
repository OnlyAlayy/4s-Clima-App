-- ==========================================
-- 4S Clima - Security Patch
-- 010_strict_workflow.sql
-- ==========================================

-- ==========================================
-- 1. FIX: Billing Evasion via INSERT (Fraude de Adicionales)
-- ==========================================
-- La política anterior (008) solo protegía UPDATE y DELETE.
-- Un técnico todavía podía INYECTAR un extra nuevo con `billed = true`, 
-- saltándose la facturación y bloqueando permanentemente el registro.

DROP POLICY IF EXISTS "Extras: Tech Insert" ON public.extras;

CREATE POLICY "Extras: Tech Insert" ON public.extras FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid())
  AND billed = false -- <-- CRÍTICO: Ningún técnico puede auto-facturar un extra
);


-- ==========================================
-- 2. FIX: Record Locking (Inmutabilidad Post-Finalización)
-- ==========================================
-- Una vez que una orden pasa a estado "completed", debe considerarse SELLADA.
-- Ningún técnico debería poder alterar la orden, ni borrar fotos, ni modificar 
-- repuestos de un trabajo que ya fue firmado por el cliente.

CREATE OR REPLACE FUNCTION public.prevent_completed_wo_modifications()
RETURNS TRIGGER AS $$
DECLARE
  wo_status public.work_order_status;
BEGIN
  -- Si el usuario es administrador/dueño, puede hacer lo que quiera
  IF public.is_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Determinar el status de la orden según la tabla afectada
  IF TG_TABLE_NAME = 'work_orders' THEN
    wo_status := OLD.status;
  ELSIF TG_TABLE_NAME IN ('checklist_items', 'extras', 'photos', 'signatures') THEN
    SELECT status INTO wo_status FROM public.work_orders WHERE id = COALESCE(OLD.work_order_id, NEW.work_order_id);
  END IF;

  -- Si la orden YA estaba completada ANTES de esta operación, bloquear todo cambio
  IF wo_status = 'completed' THEN
    RAISE EXCEPTION 'Record Locked: Cannot modify or delete items of a completed work order.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Limpiar triggers por si se corre múltiples veces
DROP TRIGGER IF EXISTS lock_completed_work_orders ON public.work_orders;
DROP TRIGGER IF EXISTS lock_completed_checklist ON public.checklist_items;
DROP TRIGGER IF EXISTS lock_completed_extras ON public.extras;
DROP TRIGGER IF EXISTS lock_completed_photos ON public.photos;
DROP TRIGGER IF EXISTS lock_completed_signatures ON public.signatures;

-- Aplicar el trigger maestro de inmutabilidad a todas las tablas operativas
-- (Evita que borren o modifiquen información posterior a la firma del cliente)
CREATE TRIGGER lock_completed_work_orders
  BEFORE UPDATE OR DELETE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_wo_modifications();

CREATE TRIGGER lock_completed_checklist
  BEFORE INSERT OR UPDATE OR DELETE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_wo_modifications();

CREATE TRIGGER lock_completed_extras
  BEFORE INSERT OR UPDATE OR DELETE ON public.extras
  FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_wo_modifications();

CREATE TRIGGER lock_completed_photos
  BEFORE INSERT OR UPDATE OR DELETE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_wo_modifications();

CREATE TRIGGER lock_completed_signatures
  BEFORE INSERT OR UPDATE OR DELETE ON public.signatures
  FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_wo_modifications();
