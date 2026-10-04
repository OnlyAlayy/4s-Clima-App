-- Añadir columna 'notes' a la tabla equipment
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS notes TEXT;
