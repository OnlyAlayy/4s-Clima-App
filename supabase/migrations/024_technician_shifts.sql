-- ========================================================
-- 4S Clima - Migración 024
-- Sistema de Jornada Laboral (Check-in / Check-out) con Rastreo GPS por Turno
-- ========================================================

CREATE TABLE IF NOT EXISTS public.technician_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    technician_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    check_in_lat DOUBLE PRECISION NULL,
    check_in_lng DOUBLE PRECISION NULL,
    check_out_at TIMESTAMPTZ NULL,
    check_out_lat DOUBLE PRECISION NULL,
    check_out_lng DOUBLE PRECISION NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de alto rendimiento para búsquedas por técnico, estado y fecha de jornada
CREATE INDEX IF NOT EXISTS idx_technician_shifts_tech_status_date 
ON public.technician_shifts(technician_id, status, shift_date DESC);

CREATE INDEX IF NOT EXISTS idx_technician_shifts_shift_date 
ON public.technician_shifts(shift_date DESC);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.technician_shifts ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas previas idempotente
DROP POLICY IF EXISTS "Technicians can select own shifts" ON public.technician_shifts;
DROP POLICY IF EXISTS "Technicians can insert own shifts" ON public.technician_shifts;
DROP POLICY IF EXISTS "Technicians can update own shifts" ON public.technician_shifts;
DROP POLICY IF EXISTS "Admins have full access to shifts" ON public.technician_shifts;

-- Política 1: Técnicos pueden leer sus propios turnos (y administradores pueden ver todos)
CREATE POLICY "Technicians can select own shifts"
ON public.technician_shifts
FOR SELECT
TO authenticated
USING (auth.uid() = technician_id OR public.is_admin());

-- Política 2: Técnicos pueden registrar el ingreso (Check-in) de su turno
CREATE POLICY "Technicians can insert own shifts"
ON public.technician_shifts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = technician_id OR public.is_admin());

-- Política 3: Técnicos pueden actualizar su turno para finalizarlo (Check-out)
CREATE POLICY "Technicians can update own shifts"
ON public.technician_shifts
FOR UPDATE
TO authenticated
USING (auth.uid() = technician_id OR public.is_admin())
WITH CHECK (auth.uid() = technician_id OR public.is_admin());

-- Política 4: Administradores y propietarios tienen control y visualización total
CREATE POLICY "Admins have full access to shifts"
ON public.technician_shifts
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Agregar tabla a supabase_realtime para transmisión en vivo al Panel Admin
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'technician_shifts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_shifts;
    END IF;
END $$;

COMMENT ON TABLE public.technician_shifts IS 'Registro oficial de jornadas laborales (Check-in / Check-out) y control de horario de ingreso de técnicos';
