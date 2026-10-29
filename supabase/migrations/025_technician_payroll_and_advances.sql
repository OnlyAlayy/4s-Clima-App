-- ==============================================================================
-- Migración 025: Módulo de Liquidaciones Mixtas, Obras, Módulos Walter y Adelantos
-- ==============================================================================
-- Resuelve la realidad comercial de 4S Clima:
-- 1. Liquidación por Horas (jornales, horas ordinarias y extras registradas vía GPS).
-- 2. Liquidación por Obra / Módulo / A Destajo (módulos tarifarios de Walter o precio alzado).
-- 3. Registro y control de Adelantos / Anticipos a cuenta de técnicos.
-- 4. Liquidaciones consolidadas (quincenales, mensuales o por cierre de obra).
-- ==============================================================================

-- 1. Nuevas columnas en public.work_orders para gestión de mano de obra
ALTER TABLE public.work_orders 
  ADD COLUMN IF NOT EXISTS labor_rate_type TEXT DEFAULT 'hourly' CHECK (labor_rate_type IN ('hourly', 'walter_module', 'flat_rate', 'percentage')),
  ADD COLUMN IF NOT EXISTS technician_payout NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending' CHECK (payout_status IN ('pending', 'advance_paid', 'settled'));

CREATE INDEX IF NOT EXISTS idx_work_orders_technician_payout 
  ON public.work_orders (assigned_to, payout_status, completed_at);

-- 2. Tabla public.technician_settlements (Liquidaciones consolidadas)
CREATE TABLE IF NOT EXISTS public.technician_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number TEXT NOT NULL UNIQUE,
  technician_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  settlement_type TEXT NOT NULL DEFAULT 'mixed' CHECK (settlement_type IN ('hourly', 'piecework', 'mixed')),
  
  -- Componente Horas
  total_regular_hours NUMERIC DEFAULT 0,
  hourly_rate_regular NUMERIC DEFAULT 0,
  total_overtime_hours NUMERIC DEFAULT 0,
  hourly_rate_overtime NUMERIC DEFAULT 0,
  hours_subtotal NUMERIC DEFAULT 0,
  
  -- Componente Obras / Módulos de Walter
  piecework_subtotal NUMERIC DEFAULT 0,
  
  -- Componente Deducción de Adelantos
  advances_subtotal NUMERIC DEFAULT 0,
  
  -- Totales
  gross_total NUMERIC NOT NULL DEFAULT 0,
  net_total NUMERIC NOT NULL DEFAULT 0,
  
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ NULL,
  payment_method TEXT NULL,
  payment_reference TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_technician_settlements_tech_period 
  ON public.technician_settlements (technician_id, period_start, period_end);

-- 3. Tabla public.technician_advances (Adelantos y Anticipos a Cuenta)
CREATE TABLE IF NOT EXISTS public.technician_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  work_order_id UUID NULL REFERENCES public.work_orders(id) ON DELETE SET NULL,
  advance_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'transferencia' CHECK (payment_method IN ('efectivo', 'transferencia', 'cheque', 'otro')),
  reference TEXT NULL,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'discounted', 'cancelled')),
  settlement_id UUID NULL REFERENCES public.technician_settlements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_technician_advances_tech_status 
  ON public.technician_advances (technician_id, status, advance_date);

-- 4. Tabla public.settlement_items (Desglose de órdenes incluidas en la liquidación)
CREATE TABLE IF NOT EXISTS public.settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.technician_settlements(id) ON DELETE CASCADE,
  work_order_id UUID NULL REFERENCES public.work_orders(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_items_settlement 
  ON public.settlement_items (settlement_id);

-- 5. Seguridad Row Level Security (RLS)
ALTER TABLE public.technician_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_items ENABLE ROW LEVEL SECURITY;

-- Políticas para technician_settlements
DROP POLICY IF EXISTS "Admin and Owner manage settlements" ON public.technician_settlements;
CREATE POLICY "Admin and Owner manage settlements"
  ON public.technician_settlements FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Tech can read own settlements" ON public.technician_settlements;
CREATE POLICY "Tech can read own settlements"
  ON public.technician_settlements FOR SELECT
  TO authenticated
  USING (auth.uid() = technician_id);

-- Políticas para technician_advances
DROP POLICY IF EXISTS "Admin and Owner manage advances" ON public.technician_advances;
CREATE POLICY "Admin and Owner manage advances"
  ON public.technician_advances FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Tech can read own advances" ON public.technician_advances;
CREATE POLICY "Tech can read own advances"
  ON public.technician_advances FOR SELECT
  TO authenticated
  USING (auth.uid() = technician_id);

-- Políticas para settlement_items
DROP POLICY IF EXISTS "Admin and Owner manage settlement items" ON public.settlement_items;
CREATE POLICY "Admin and Owner manage settlement items"
  ON public.settlement_items FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Tech can read own settlement items" ON public.settlement_items;
CREATE POLICY "Tech can read own settlement items"
  ON public.settlement_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.technician_settlements s
      WHERE s.id = settlement_items.settlement_id
        AND s.technician_id = auth.uid()
    )
  );

-- 6. Integración en Supabase Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_settlements;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_advances;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 7. Función RPC de cálculo automático para vista previa de liquidación
CREATE OR REPLACE FUNCTION public.get_technician_payroll_preview(
  p_technician_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_hourly_rate NUMERIC DEFAULT 0,
  p_overtime_rate NUMERIC DEFAULT 0,
  p_standard_hours NUMERIC DEFAULT 8
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_rec RECORD;
  v_total_reg NUMERIC := 0;
  v_total_over NUMERIC := 0;
  v_hours_dur NUMERIC := 0;
  v_orders_subtotal NUMERIC := 0;
  v_advances_subtotal NUMERIC := 0;
  v_orders_json JSONB := '[]'::jsonb;
  v_advances_json JSONB := '[]'::jsonb;
BEGIN
  -- Validar permisos: solo admin/owner
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access Denied: Admin privileges required.';
  END IF;

  -- 1. Calcular Horas desde technician_shifts
  FOR v_rec IN 
    SELECT check_in_at, check_out_at
    FROM public.technician_shifts
    WHERE technician_id = p_technician_id
      AND shift_date BETWEEN p_start_date AND p_end_date
      AND status = 'completed'
  LOOP
    IF v_rec.check_out_at IS NOT NULL THEN
      v_hours_dur := EXTRACT(EPOCH FROM (v_rec.check_out_at - v_rec.check_in_at)) / 3600.0;
      IF v_hours_dur <= p_standard_hours THEN
        v_total_reg := v_total_reg + v_hours_dur;
      ELSE
        v_total_reg := v_total_reg + p_standard_hours;
        v_total_over := v_total_over + (v_hours_dur - p_standard_hours);
      END IF;
    END IF;
  END LOOP;

  -- 2. Sumar Mano de Obra de Órdenes completadas pendientes de liquidar
  SELECT 
    COALESCE(SUM(technician_payout), 0),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'order_number', order_number,
        'completed_at', completed_at,
        'labor_rate_type', labor_rate_type,
        'technician_payout', technician_payout,
        'observations', observations
      )
    ), '[]'::jsonb)
  INTO v_orders_subtotal, v_orders_json
  FROM public.work_orders
  WHERE assigned_to = p_technician_id
    AND status = 'completed'
    AND payout_status = 'pending'
    AND completed_at::date BETWEEN p_start_date AND p_end_date;

  -- 3. Sumar Adelantos otorgados pendientes de descuento
  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'advance_date', advance_date,
        'amount', amount,
        'payment_method', payment_method,
        'reference', reference,
        'notes', notes
      )
    ), '[]'::jsonb)
  INTO v_advances_subtotal, v_advances_json
  FROM public.technician_advances
  WHERE technician_id = p_technician_id
    AND status = 'pending'
    AND advance_date BETWEEN p_start_date AND p_end_date;

  -- 4. Construir resultado final consolidado
  RETURN jsonb_build_object(
    'technician_id', p_technician_id,
    'period_start', p_start_date,
    'period_end', p_end_date,
    'regular_hours', ROUND(v_total_reg, 2),
    'overtime_hours', ROUND(v_total_over, 2),
    'hourly_rate_regular', p_hourly_rate,
    'hourly_rate_overtime', p_overtime_rate,
    'hours_subtotal', ROUND((v_total_reg * p_hourly_rate) + (v_total_over * p_overtime_rate), 2),
    'piecework_subtotal', ROUND(v_orders_subtotal, 2),
    'advances_subtotal', ROUND(v_advances_subtotal, 2),
    'gross_total', ROUND((v_total_reg * p_hourly_rate) + (v_total_over * p_overtime_rate) + v_orders_subtotal, 2),
    'net_total', ROUND(((v_total_reg * p_hourly_rate) + (v_total_over * p_overtime_rate) + v_orders_subtotal) - v_advances_subtotal, 2),
    'orders', v_orders_json,
    'advances', v_advances_json
  );
END;
$$;
