-- ========================================================
-- 4S Clima - Migración 039
-- Soporte para Fotos de Avance Parcial y Bitácora de Visitas/Jornadas
-- ========================================================

-- 1. Si existe el ENUM photo_type, agregar 'progress'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'photo_type') THEN
    BEGIN
      ALTER TYPE public.photo_type ADD VALUE IF NOT EXISTS 'progress';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END;
  END IF;
END $$;

-- 2. Limpieza de CHECK constraints restrictivos en columna type de public.photos (si existen)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.photos'::regclass 
      AND contype = 'c' 
      AND pg_get_constraintdef(oid) ILIKE '%type%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.photos DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- 3. Agregar columna visit_id a public.photos (vincula la foto a la visita/tramo específico)
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES public.work_order_visits(id) ON DELETE SET NULL;

-- 4. Agregar columna created_by a public.photos si no existe (identifica el técnico que tomó la foto)
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 5. Índices para alto rendimiento
CREATE INDEX IF NOT EXISTS idx_photos_visit_id ON public.photos(visit_id);
CREATE INDEX IF NOT EXISTS idx_photos_type ON public.photos(type);
CREATE INDEX IF NOT EXISTS idx_photos_created_by ON public.photos(created_by);

COMMENT ON COLUMN public.photos.visit_id IS 'ID de la visita o tramo operativo (work_order_visits) al que pertenece la foto de avance';
COMMENT ON COLUMN public.photos.created_by IS 'Técnico o usuario que capturó y subió la fotografía';
