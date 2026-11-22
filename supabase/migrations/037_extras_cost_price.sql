-- ==============================================================================
-- 4S Clima - Migración 037: Precio de Costo en Extras / Repuestos (Job Costing)
-- Permite registrar el costo real unitario de compra de materiales y repuestos
-- para el cálculo de rentabilidad real por orden de trabajo.
-- ==============================================================================

ALTER TABLE public.extras 
ADD COLUMN IF NOT EXISTS cost_price NUMERIC NULL DEFAULT 0 CHECK (cost_price IS NULL OR cost_price >= 0);

COMMENT ON COLUMN public.extras.cost_price IS 'Costo de compra unitario del repuesto/material cargado por administración para análisis de rentabilidad.';
