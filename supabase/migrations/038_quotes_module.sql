-- ==============================================================================
-- 4S Clima - Migración 038: Módulo de Cotizaciones y Presupuestos Formales
-- ==============================================================================

-- 1. Crear tabla public.quotes
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT NOT NULL UNIQUE,
  client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NULL,
  client_phone TEXT NULL,
  title TEXT NOT NULL,
  work_order_type TEXT NOT NULL DEFAULT 'corrective' CHECK (work_order_type IN ('preventive', 'corrective', 'installation', 'obra', 'survey', 'diagnostic')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  iva_rate NUMERIC NOT NULL DEFAULT 21 CHECK (iva_rate >= 0),
  iva_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  valid_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '15 days'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted')),
  notes TEXT NULL,
  converted_work_order_id UUID NULL REFERENCES public.work_orders(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Comentarios explicativos
COMMENT ON TABLE public.quotes IS 'Presupuestos y cotizaciones comerciales formales generados en 4S Clima.';
COMMENT ON COLUMN public.quotes.quote_number IS 'Identificador único correlativo del presupuesto (ej: PRES-2026-0001).';
COMMENT ON COLUMN public.quotes.items IS 'Arreglo JSONB de ítems presupuestados [{ description, quantity, unit_price, subtotal }].';
COMMENT ON COLUMN public.quotes.status IS 'Estado del presupuesto: draft, sent, approved, rejected, expired, converted.';

-- 2. Índices de aceleración
CREATE INDEX IF NOT EXISTS idx_quotes_quote_number ON public.quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON public.quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_lead_id ON public.quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON public.quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_converted_wo ON public.quotes(converted_work_order_id);

-- 3. Trigger para updated_at automático
DROP TRIGGER IF EXISTS trg_quotes_updated_at ON public.quotes;
CREATE TRIGGER trg_quotes_updated_at
BEFORE UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 4. Secuencia y Función para generación automática de quote_number si no se envía explícito
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year TEXT := to_char(CURRENT_DATE, 'YYYY');
  v_next_val BIGINT;
BEGIN
  IF NEW.quote_number IS NULL OR trim(NEW.quote_number) = '' THEN
    v_next_val := nextval('public.quote_number_seq');
    NEW.quote_number := 'PRES-' || v_year || '-' || lpad(v_next_val::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_number ON public.quotes;
CREATE TRIGGER trg_set_quote_number
BEFORE INSERT ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.generate_quote_number();

-- 5. Habilitar y blindar RLS (Exclusivo Admin y Owner)
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes: Admin and Owner Full Access" ON public.quotes;
CREATE POLICY "quotes: Admin and Owner Full Access"
ON public.quotes
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Permisos DML
GRANT ALL ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.quote_number_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.quote_number_seq TO service_role;
