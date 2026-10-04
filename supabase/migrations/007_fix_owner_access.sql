-- ==========================================
-- 4S Clima - Security Patch & Structural Fixes
-- 007_fix_owner_access.sql
-- ==========================================

-- 1. Arreglar el bloqueo total del Dueño (Owner Lockout Bug)
-- La función is_admin() devolvía FALSE para los dueños. 
-- Como TODAS las políticas RLS de la app (clientes, órdenes, repuestos) usaban `is_admin()`, 
-- el Dueño (owner) quedaba completamente ciego y sin acceso a su propia aplicación.
-- Modificamos la función para que los dueños hereden todos los permisos de administrador automáticamente.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
$$ LANGUAGE sql SECURITY DEFINER;
