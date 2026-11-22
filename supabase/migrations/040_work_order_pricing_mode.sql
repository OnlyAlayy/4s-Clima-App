-- ==============================================================================
-- 4S Clima - Migración 040: Soporte para Órdenes en Abono Mensual
-- ==============================================================================

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS is_subscription BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.work_orders.is_subscription IS 'Indica si la orden de trabajo está cubierta por un abono o contrato mensual de mantenimiento, sin facturación individual.';

CREATE INDEX IF NOT EXISTS idx_work_orders_is_subscription ON public.work_orders(is_subscription);
