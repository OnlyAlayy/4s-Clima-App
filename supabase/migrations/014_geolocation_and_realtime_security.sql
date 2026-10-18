-- ============================================
-- 4S Clima - Migración de Geolocalización y Seguridad Realtime
-- 014_geolocation_and_realtime_security.sql
-- ============================================
-- 1. Campos de geolocalización no destructivos (NULLABLE)
-- 2. Soporte para clientes permanentes (plants) y eventuales (work_orders)
-- 3. Políticas RLS para canales privados en Supabase Realtime (Live Tracking)

-- ============================================
-- 1. TABLA: plants (Sucursales permanentes)
-- ============================================
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NULL;

COMMENT ON COLUMN public.plants.latitude IS 'Latitud GPS fija de la planta/sucursal';
COMMENT ON COLUMN public.plants.longitude IS 'Longitud GPS fija de la planta/sucursal';

-- Índice para consultas geográficas o cálculo de distancias
CREATE INDEX IF NOT EXISTS idx_plants_coords 
  ON public.plants (latitude, longitude) 
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================
-- 2. TABLA: work_orders (Órdenes de trabajo)
-- ============================================
-- Para órdenes en clientes eventuales (de 1 sola vez) o destinos atípicos sin crear sucursal permanente:
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS custom_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS custom_latitude DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS custom_longitude DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS is_custom_location BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.work_orders.custom_address IS 'Dirección específica para órdenes eventuales sin planta permanente';
COMMENT ON COLUMN public.work_orders.custom_latitude IS 'Latitud específica para órdenes eventuales';
COMMENT ON COLUMN public.work_orders.custom_longitude IS 'Longitud específica para órdenes eventuales';
COMMENT ON COLUMN public.work_orders.is_custom_location IS 'Flag que indica si la orden usa ubicación eventual en lugar de la planta';

-- Índice para consultas de coordenadas en órdenes eventuales
CREATE INDEX IF NOT EXISTS idx_work_orders_custom_coords 
  ON public.work_orders (custom_latitude, custom_longitude) 
  WHERE custom_latitude IS NOT NULL AND custom_longitude IS NOT NULL;

-- ============================================
-- 3. SEGURIDAD EN SUPABASE REALTIME (Canales Privados)
-- ============================================
-- En Supabase Realtime v2, al suscribirse a canales privados (config: { private: true }),
-- el servidor de WebSockets valida las políticas RLS sobre la tabla `realtime.messages`.
--
-- Canal utilizado: 'tracking:wo-<work_order_id>'
-- Regla de acceso:
--   - Rol 'admin' / 'owner': Puede escuchar (SELECT) y emitir (INSERT) en cualquier orden.
--   - Rol 'tecnico': Solo puede escuchar y emitir en el canal de la orden que tiene asignada (`assigned_to = auth.uid()`).
-- ============================================

DO $$
BEGIN
  -- Verificar si el schema realtime y la tabla messages existen (disponible en Supabase Realtime Authorization)
  -- Nota: realtime.messages ya tiene RLS habilitado por defecto y es propiedad de supabase_realtime_admin.
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'realtime' AND table_name = 'messages'
  ) THEN
    -- Eliminar política anterior si existiera
    DROP POLICY IF EXISTS "Tracking Realtime: Assigned Tech and Admin" ON realtime.messages;

    -- Crear la política de autorización estricta
    CREATE POLICY "Tracking Realtime: Assigned Tech and Admin"
    ON realtime.messages
    FOR ALL
    TO authenticated
    USING (
      -- Validar si el mensaje pertenece al topic de Live Tracking: 'tracking:wo-<id>'
      topic LIKE 'tracking:wo-%' AND EXISTS (
        SELECT 1 FROM public.work_orders wo
        WHERE ('tracking:wo-' || wo.id::text) = realtime.messages.topic
          AND (
            wo.assigned_to = auth.uid()
            OR public.is_admin()
          )
      )
    );
  END IF;
END $$;
