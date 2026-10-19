-- ==============================================================================
-- 4S Clima - Migración de Blindaje Integral de Seguridad (SEC-03 a SEC-08)
-- 017_security_hardening.sql
-- ==============================================================================

-- ==============================================================================
-- 1. SEC-03: Formalización y Blindaje de public.afip_vouchers
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.afip_vouchers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  work_order_id uuid,
  voucher_type text NOT NULL CHECK (voucher_type = ANY (ARRAY['invoice'::text, 'credit_note'::text])),
  voucher_number integer NOT NULL,
  cae text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT afip_vouchers_pkey PRIMARY KEY (id),
  CONSTRAINT afip_vouchers_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id)
);

ALTER TABLE public.afip_vouchers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'afip_vouchers'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.afip_vouchers', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "afip_vouchers: Admin and Owner Full Access"
  ON public.afip_vouchers
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_afip_vouchers_wo ON public.afip_vouchers(work_order_id);
CREATE INDEX IF NOT EXISTS idx_afip_vouchers_date ON public.afip_vouchers(created_at DESC);


-- ==============================================================================
-- 2. SEC-04: Eliminación de Políticas Residuales Permisivas (Migración 002)
-- ==============================================================================
DROP POLICY IF EXISTS "Técnicos y admins pueden leer firmas" ON public.signatures;
DROP POLICY IF EXISTS "Técnicos pueden insertar firmas" ON public.signatures;
DROP POLICY IF EXISTS "Técnicos y admins pueden leer fotos" ON public.photos;
DROP POLICY IF EXISTS "Técnicos pueden insertar fotos" ON public.photos;


-- ==============================================================================
-- 3. SEC-05: Protección de Precios Unitarios y Facturación en public.extras
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prevent_tech_extras_price_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Si quien ejecuta es un técnico autenticado (no admin ni owner)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      -- Un técnico solo puede declarar cantidad y descripción; el precio y facturación nacen en 0 y false
      NEW.unit_price := 0;
      NEW.billed := false;
    ELSIF TG_OP = 'UPDATE' THEN
      -- Un técnico no puede alterar unit_price ni billed
      IF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
        RAISE EXCEPTION 'Access Denied: Technicians cannot modify unit prices of extras.';
      END IF;
      IF NEW.billed IS DISTINCT FROM OLD.billed THEN
        RAISE EXCEPTION 'Access Denied: Technicians cannot alter billing status of extras.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS enforce_extras_price_integrity ON public.extras;
CREATE TRIGGER enforce_extras_price_integrity
  BEFORE INSERT OR UPDATE ON public.extras
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tech_extras_price_tampering();


-- ==============================================================================
-- 4. SEC-06 & SEC-07: Inmutabilidad en public.work_orders (Columnas Contables)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prevent_tech_immutable_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el usuario no es admin/owner (o sea, es técnico)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    -- Verificar si intentó cambiar columnas estructurales, asignaciones o contables/fiscales
    IF NEW.client_id IS DISTINCT FROM OLD.client_id OR
       NEW.plant_id IS DISTINCT FROM OLD.plant_id OR
       NEW.equipment_id IS DISTINCT FROM OLD.equipment_id OR
       NEW.order_number IS DISTINCT FROM OLD.order_number OR
       NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR
       NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
       NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
       NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
       NEW.afip_voucher_number IS DISTINCT FROM OLD.afip_voucher_number OR
       NEW.afip_cae IS DISTINCT FROM OLD.afip_cae THEN
      RAISE EXCEPTION 'Access Denied: Technicians cannot modify core assignments or financial billing fields.';
    END IF;

    -- Workflow Enforcement: Evitar bypass de completado
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
      -- 1. No puede haber items del checklist sin responder
      IF EXISTS (SELECT 1 FROM public.checklist_items WHERE work_order_id = NEW.id AND status IS NULL) THEN
        RAISE EXCEPTION 'Workflow Violation: Cannot complete work order with unanswered checklist items.';
      END IF;
      -- 2. Obligatorio tener firma
      IF NOT EXISTS (SELECT 1 FROM public.signatures WHERE work_order_id = NEW.id) THEN
        RAISE EXCEPTION 'Workflow Violation: Cannot complete work order without a client signature.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ==============================================================================
-- 5. SEC-07: Asegurar search_path = public, pg_temp en Funciones SECURITY DEFINER
-- ==============================================================================

-- 5.1 is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.2 is_owner
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.3 prevent_completed_wo_modifications
CREATE OR REPLACE FUNCTION public.prevent_completed_wo_modifications()
RETURNS TRIGGER AS $$
DECLARE
  wo_status public.work_order_status;
BEGIN
  -- Si el usuario es administrador/dueño, tiene permiso total para tasar y facturar incluso completadas
  IF public.is_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Determinar el status de la orden según la tabla afectada
  IF TG_TABLE_NAME = 'work_orders' THEN
    wo_status := OLD.status;
  ELSIF TG_TABLE_NAME IN ('checklist_items', 'extras', 'photos', 'signatures') THEN
    SELECT status INTO wo_status FROM public.work_orders WHERE id = COALESCE(OLD.work_order_id, NEW.work_order_id);
  END IF;

  -- Si la orden YA estaba completada ANTES de esta operación, bloquear todo cambio para técnicos
  IF wo_status = 'completed' THEN
    RAISE EXCEPTION 'Record Locked: Cannot modify or delete items of a completed work order.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.4 prevent_tech_checklist_tampering
CREATE OR REPLACE FUNCTION public.prevent_tech_checklist_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.5 prevent_submitted_checklist_item_modifications
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ==============================================================================
-- 6. SEC-08: Blindaje de Storage (work-orders) sin alterar URLs públicas de PDFs
-- ==============================================================================
-- Mantenemos public = true para que el renderizado de PDFs y miniaturas en Admin funcione sin firmas dinámicas.
-- Blindamos estrictamente la modificación y borrado en storage.objects:

DROP POLICY IF EXISTS "Storage: Admin Only Update work-orders" ON storage.objects;
CREATE POLICY "Storage: Admin Only Update work-orders"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'work-orders' AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'work-orders' AND public.is_admin()
);

DROP POLICY IF EXISTS "Storage: Admin Only Delete work-orders" ON storage.objects;
CREATE POLICY "Storage: Admin Only Delete work-orders"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'work-orders' AND public.is_admin()
);
