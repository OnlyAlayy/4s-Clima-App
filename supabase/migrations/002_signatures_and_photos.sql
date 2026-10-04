-- ==========================================
-- 1. TABLA: signatures
-- ==========================================
CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_role TEXT,
  signature_url TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

-- Políticas de Signatures
CREATE POLICY "Técnicos y admins pueden leer firmas" 
ON public.signatures FOR SELECT 
USING (true);

CREATE POLICY "Técnicos pueden insertar firmas" 
ON public.signatures FOR INSERT 
WITH CHECK (true);

-- ==========================================
-- 2. TABLA: photos (Para evidencia fotográfica)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  type photo_type NOT NULL,
  photo_url TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

-- Políticas de Photos
CREATE POLICY "Técnicos y admins pueden leer fotos" 
ON public.photos FOR SELECT 
USING (true);

CREATE POLICY "Técnicos pueden insertar fotos" 
ON public.photos FOR INSERT 
WITH CHECK (true);

-- ==========================================
-- 3. STORAGE BUCKET: work-orders
-- ==========================================
-- Nota: En Supabase local, los buckets se pueden crear con SQL. 
-- En producción puede requerir la consola, pero este SQL automatiza el proceso.

INSERT INTO storage.buckets (id, name, public) 
VALUES ('work-orders', 'work-orders', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage para el bucket "work-orders"
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'work-orders' );

CREATE POLICY "Auth Insert"
ON storage.objects FOR INSERT
WITH CHECK ( 
  bucket_id = 'work-orders' 
  AND auth.role() = 'authenticated'
);
