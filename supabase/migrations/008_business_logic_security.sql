-- ==========================================
-- 4S Clima - Security Patch
-- 008_business_logic_security.sql
-- ==========================================

-- ==========================================
-- VULNERABILIDAD 1: FRAUDE Y ROBO DE EXTRAS (BILLING MANIPULATION)
-- Antes: Los técnicos tenían permisos "FOR ALL" sobre los extras de sus órdenes.
-- Podían actualizar `billed = true` para saltarse la facturación, o borrar extras consumidos.
-- Ahora: Los técnicos NO pueden modificar la columna `billed` a true, 
-- y NO pueden modificar ni borrar un extra que ya fue facturado.
-- ==========================================

DROP POLICY IF EXISTS "Extras: Tech Access" ON public.extras;

-- Lectura (igual, solo leen los de sus órdenes)
CREATE POLICY "Extras: Tech Select" ON public.extras FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid())
);

-- Inserción (pueden cargar repuestos usados)
CREATE POLICY "Extras: Tech Insert" ON public.extras FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid())
);

-- Actualización (SOLO si el extra no está facturado, y NO pueden forzar billed=true)
CREATE POLICY "Extras: Tech Update" ON public.extras FOR UPDATE 
  USING (
    EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid()) 
    AND billed = false
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid()) 
    AND billed = false
  );

-- Borrado (SOLO si el extra no está facturado)
CREATE POLICY "Extras: Tech Delete" ON public.extras FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid()) 
  AND billed = false
);

-- ==========================================
-- VULNERABILIDAD 2: EXFILTRACIÓN DE DATOS (CUSTOMER DB DUMP)
-- Antes: Las políticas "Clients/Plants/Equipment: Select all" permitían que
-- CUALQUIER usuario autenticado (un técnico) lea toda la base de clientes de la empresa.
-- Ahora: Los técnicos SOLO pueden leer los clientes, plantas y equipos de las 
-- órdenes que tienen expresamente asignadas.
-- ==========================================

DROP POLICY IF EXISTS "Clients: Select all" ON public.clients;
CREATE POLICY "Clients: Tech Select Assigned" ON public.clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.client_id = id AND wo.assigned_to = auth.uid())
);

DROP POLICY IF EXISTS "Plants: Select all" ON public.plants;
CREATE POLICY "Plants: Tech Select Assigned" ON public.plants FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.plant_id = id AND wo.assigned_to = auth.uid())
);

DROP POLICY IF EXISTS "Equipment: Select all" ON public.equipment;
CREATE POLICY "Equipment: Tech Select Assigned" ON public.equipment FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.equipment_id = id AND wo.assigned_to = auth.uid())
);
