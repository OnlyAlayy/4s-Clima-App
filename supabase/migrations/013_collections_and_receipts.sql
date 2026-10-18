-- ==============================================================================
-- Migración 013: Gestión de Cobranzas, Recibos Oficiales (Recibo X) y Cuentas Corrientes
-- ==============================================================================

-- 1. Tabla de Recibos Oficiales de Cobranza
CREATE TABLE IF NOT EXISTS public.payment_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(12, 2) NOT NULL,
    retentions_amount NUMERIC(12, 2) DEFAULT 0,
    payment_method VARCHAR(100) NOT NULL,
    payment_reference VARCHAR(255),
    notes TEXT,
    work_order_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- 2. Habilitar Seguridad RLS
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Acceso RLS (Solo administradores y propietarios)
CREATE POLICY "Admins and Owners have full access to payment_receipts"
    ON public.payment_receipts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'owner')
        )
    );

-- 4. Índice para búsquedas rápidas por cliente y fecha
CREATE INDEX IF NOT EXISTS idx_payment_receipts_client_id ON public.payment_receipts(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_date ON public.payment_receipts(payment_date DESC);
