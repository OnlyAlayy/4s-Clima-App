-- ========================================================
-- 4S Clima - Migración 021 (Con Realtime e Idempotencia)
-- Tabla y políticas RLS para persistencia de geolocalización en segundo plano
-- ========================================================

CREATE TABLE IF NOT EXISTS public.technician_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_order_id UUID NULL REFERENCES public.work_orders(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION NULL,
  speed DOUBLE PRECISION NULL,
  heading DOUBLE PRECISION NULL,
  battery_level INTEGER NULL,
  is_charging BOOLEAN NULL,
  platform TEXT DEFAULT 'android',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de alto rendimiento para consultas de flota y auditoría de rutas
CREATE INDEX IF NOT EXISTS idx_tech_locations_tech_time 
  ON public.technician_locations (technician_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_tech_locations_wo 
  ON public.technician_locations (work_order_id) 
  WHERE work_order_id IS NOT NULL;

-- Activar Row Level Security
ALTER TABLE public.technician_locations ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas por si ya existían
DROP POLICY IF EXISTS "Technicians can insert their own locations" ON public.technician_locations;
DROP POLICY IF EXISTS "Technicians can read their own locations" ON public.technician_locations;
DROP POLICY IF EXISTS "Admins can view all technician locations" ON public.technician_locations;

-- Política 1: Técnicos pueden registrar sus propias coordenadas
CREATE POLICY "Technicians can insert their own locations"
  ON public.technician_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = technician_id
  );

-- Política 2: Técnicos pueden consultar su propio historial
CREATE POLICY "Technicians can read their own locations"
  ON public.technician_locations
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
  );

-- Política 3: Administradores y propietarios pueden ver todas las ubicaciones
CREATE POLICY "Admins can view all technician locations"
  ON public.technician_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'owner')
    )
  );

-- Habilitar transmisión en tiempo real (Realtime) para el mapa del Dashboard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'technician_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_locations;
  END IF;
END $$;

COMMENT ON TABLE public.technician_locations IS 'Registro de telemetría GPS continua de técnicos en ruta para Android nativo y auditoría de flota';