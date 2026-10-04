-- ==========================================
-- 4S Clima - Security Patch
-- Refinar Row Level Security (RLS)
-- ==========================================

-- 1. Eliminar políticas permisivas inseguras previas
DROP POLICY IF EXISTS "Authenticated access" ON public.clients;
DROP POLICY IF EXISTS "Authenticated access" ON public.plants;
DROP POLICY IF EXISTS "Authenticated access" ON public.equipment;
DROP POLICY IF EXISTS "Authenticated access" ON public.work_orders;
DROP POLICY IF EXISTS "Authenticated access" ON public.checklist_items;
DROP POLICY IF EXISTS "Authenticated access" ON public.extras;
DROP POLICY IF EXISTS "Authenticated access" ON public.photos;
DROP POLICY IF EXISTS "Authenticated access" ON public.signatures;

-- 2. Clientes (Clients)
-- Técnicos pueden leer. Admins pueden hacer todo.
CREATE POLICY "Clients: Select all" ON public.clients FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Clients: Admin All" ON public.clients FOR ALL USING (public.is_admin());

-- 3. Plantas (Plants)
-- Técnicos pueden leer. Admins pueden hacer todo.
CREATE POLICY "Plants: Select all" ON public.plants FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Plants: Admin All" ON public.plants FOR ALL USING (public.is_admin());

-- 4. Equipos (Equipment)
-- Técnicos pueden leer. Admins pueden hacer todo.
CREATE POLICY "Equipment: Select all" ON public.equipment FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Equipment: Admin All" ON public.equipment FOR ALL USING (public.is_admin());

-- 5. Órdenes de Trabajo (Work Orders)
-- Técnicos ven y actualizan SUS propias órdenes. Admins todo.
CREATE POLICY "WO: Tech Select Assigned" ON public.work_orders FOR SELECT USING (assigned_to = auth.uid());
CREATE POLICY "WO: Tech Update Assigned" ON public.work_orders FOR UPDATE USING (assigned_to = auth.uid());
CREATE POLICY "WO: Admin All" ON public.work_orders FOR ALL USING (public.is_admin());

-- 6. Checklist Items
-- Técnicos acceden solo si la OT les pertenece
CREATE POLICY "Checklist: Tech Access" ON public.checklist_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.work_orders wo 
    WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid()
  )
);
CREATE POLICY "Checklist: Admin All" ON public.checklist_items FOR ALL USING (public.is_admin());

-- 7. Extras
CREATE POLICY "Extras: Tech Access" ON public.extras FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.work_orders wo 
    WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid()
  )
);
CREATE POLICY "Extras: Admin All" ON public.extras FOR ALL USING (public.is_admin());

-- 8. Photos
CREATE POLICY "Photos: Tech Access" ON public.photos FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.work_orders wo 
    WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid()
  )
);
CREATE POLICY "Photos: Admin All" ON public.photos FOR ALL USING (public.is_admin());

-- 9. Signatures
CREATE POLICY "Signatures: Tech Access" ON public.signatures FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.work_orders wo 
    WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid()
  )
);
CREATE POLICY "Signatures: Admin All" ON public.signatures FOR ALL USING (public.is_admin());

-- 10. Asegurar el Storage (Evitar archivos maliciosos y abusos de tamaño)
-- Limitamos el bucket a solo imágenes de máximo 5MB (5242880 bytes)
UPDATE storage.buckets
SET 
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg']::text[]
WHERE id = 'work-orders';
