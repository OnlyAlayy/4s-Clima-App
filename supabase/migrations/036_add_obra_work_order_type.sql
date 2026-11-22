-- 1. Migración 036: Agregar 'obra' al ENUM de tipos de orden de trabajo
ALTER TYPE public.work_order_type ADD VALUE IF NOT EXISTS 'obra';

-- 2. Actualizar CHECK de estados en public.leads para soportar el flujo de LeadsPage.jsx
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_estado_check;

ALTER TABLE public.leads
ADD CONSTRAINT leads_estado_check
CHECK (estado = ANY (ARRAY[
  'pendiente'::text,
  'nuevo'::text,
  'contactado'::text,
  'presupuestado'::text,
  'convertido'::text,
  'descartado'::text,
  'archivado'::text
]));