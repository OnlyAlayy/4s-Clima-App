-- ==========================================
-- 4S Clima - Security Patch
-- 009_immutable_work_orders.sql
-- ==========================================

-- VULNERABILIDAD: UNAUTHORIZED FIELD MODIFICATION (DATA CONTAMINATION)
-- La política "WO: Tech Update Assigned" permitía a los técnicos hacer UPDATE 
-- sobre sus órdenes de trabajo para poder cambiar el "status" (a completado).
-- SIN EMBARGO, como RLS se aplica a nivel de fila y no de columna,
-- un técnico malintencionado podía enviar un payload por API modificando
-- el "client_id", "plant_id", "order_number" o "assigned_to".
-- Esto permitiría a un técnico alterar los registros contables,
-- mover órdenes a clientes de la competencia, o alterar números de orden.

-- SOLUCIÓN: Trigger de integridad que bloquea la modificación de columnas 
-- críticas si el usuario que ejecuta la consulta no es un administrador.

CREATE OR REPLACE FUNCTION public.prevent_tech_immutable_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el usuario no es admin/owner (o sea, es técnico)
  IF NOT public.is_admin() THEN
    -- Verificar si intentó cambiar columnas estructurales
    IF NEW.client_id IS DISTINCT FROM OLD.client_id OR
       NEW.plant_id IS DISTINCT FROM OLD.plant_id OR
       NEW.equipment_id IS DISTINCT FROM OLD.equipment_id OR
       NEW.order_number IS DISTINCT FROM OLD.order_number OR
       NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      RAISE EXCEPTION 'Access Denied: Technicians cannot modify core work order assignments (client, plant, equipment, order_number, assigned_to).';
    END IF;

    -- Workflow Enforcement: Evitar bypass de completado
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
      -- 1. No puede haber items del checklist sin responder
      IF EXISTS (SELECT 1 FROM public.checklist_items WHERE work_order_id = NEW.id AND status IS NULL) THEN
        RAISE EXCEPTION 'Workflow Violation: Cannot complete work order with unanswered checklist items.';
      END IF;
      -- 2. Obligatorio tener firma (evita que se salten el paso de recabar firma del cliente)
      IF NOT EXISTS (SELECT 1 FROM public.signatures WHERE work_order_id = NEW.id) THEN
        RAISE EXCEPTION 'Workflow Violation: Cannot complete work order without a client signature.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar el trigger si ya existía para evitar duplicados
DROP TRIGGER IF EXISTS enforce_tech_immutable_updates ON public.work_orders;

CREATE TRIGGER enforce_tech_immutable_updates
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tech_immutable_updates();
