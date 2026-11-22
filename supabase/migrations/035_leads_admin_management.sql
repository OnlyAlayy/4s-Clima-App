-- ========================================================
-- 4S Clima - Migración 035: Gestión de Leads Web y Permisos de Administración
-- ========================================================

-- 1. Crear tabla si no existe o asegurar estructura completa
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nombre TEXT NOT NULL,
  telefono TEXT NULL,
  email TEXT NULL,
  empresa TEXT NULL,
  sector TEXT NULL,
  servicio TEXT NULL,
  mensaje TEXT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  origen TEXT NULL DEFAULT 'web',
  notas TEXT NULL,
  converted_client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar columnas si la tabla ya existía previamente
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS empresa TEXT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sector TEXT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS servicio TEXT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS origen TEXT NULL DEFAULT 'web';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notas TEXT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Comentarios explicativos
COMMENT ON TABLE public.leads IS 'Consultas y prospectos comerciales originados desde la web corporativa de 4S Clima.';
COMMENT ON COLUMN public.leads.estado IS 'Estado del prospecto: pendiente, contactado, presupuestado, convertido, descartado.';
COMMENT ON COLUMN public.leads.notas IS 'Notas internas de seguimiento comercial registradas por el administrador.';
COMMENT ON COLUMN public.leads.converted_client_id IS 'ID del cliente en public.clients si este lead fue convertido.';

-- 2. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_leads_estado ON public.leads(estado);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_converted_client ON public.leads(converted_client_id) WHERE converted_client_id IS NOT NULL;

-- 3. Trigger para updated_at automático
DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 4. Habilitar y blindar RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores si existieran
DROP POLICY IF EXISTS "Public web forms can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Admins have full access to leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can select leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can update leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can delete leads" ON public.leads;
DROP POLICY IF EXISTS "Anyone can insert leads" ON public.leads;

-- Inserción pública: Permite al formulario web de la landing (rol anon o authenticated) insertar consultas
CREATE POLICY "Public web forms can insert leads"
ON public.leads
FOR INSERT
TO public
WITH CHECK (true);

-- Acceso total exclusivo para administradores y dueños (Owner)
CREATE POLICY "Admins have full access to leads"
ON public.leads
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Otorgar permisos DML
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT INSERT ON public.leads TO anon;
GRANT ALL ON public.leads TO service_role;

-- 5. Habilitar publicación Realtime para suscripciones en vivo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END;
$$;


-- Habilitar Realtime en public.leads para el badge y la tabla en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;