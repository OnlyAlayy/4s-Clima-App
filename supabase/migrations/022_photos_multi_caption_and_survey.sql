-- Migración 022: Soporte Multi-Foto con Etiquetas/Captions y Modo Solo Relevamiento/Diagnóstico
-- Permite guardar notas o etiquetas de sector/equipo por fotografía y marcar órdenes como solo relevamiento.

-- 1. Agregar columnas caption, notes y photo_url a la tabla public.photos si no existen
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. Agregar columna is_survey_only a la tabla public.work_orders
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS is_survey_only BOOLEAN DEFAULT false;

-- 3. Comentarios explicativos
COMMENT ON COLUMN public.photos.caption IS 'Etiqueta o descripción de equipo/sector de la fotografía (ej. Unidad Exterior, Tablero Eléctrico)';
COMMENT ON COLUMN public.work_orders.is_survey_only IS 'Indica si la orden es exclusivamente relevamiento o diagnóstico sin intervención posterior ni foto de después obligatoria';
