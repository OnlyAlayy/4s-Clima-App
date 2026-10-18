-- ========================================================
-- 4S Clima - Migración 016
-- Incorporación del estado operativo 'traveling' (En Camino)
-- ========================================================

-- 1. Agregar 'traveling' al ENUM de estados de work_order_status
-- Se inserta lógicamente después de 'pending' y antes de 'in_progress'
ALTER TYPE public.work_order_status ADD VALUE IF NOT EXISTS 'traveling' AFTER 'pending';

-- 2. Agregar columnas de auditoría de tiempos en work_orders
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS travel_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.work_orders.travel_started_at IS 'Fecha y hora en que el técnico inició el viaje hacia el cliente';
COMMENT ON COLUMN public.work_orders.arrived_at IS 'Fecha y hora en que el técnico arribó a la planta del cliente';
