-- ==============================================================================
-- Migración 020: Hardening RLS para Parámetros de Precios y Seed Oficial
-- ==============================================================================
-- Estándar Industrial FSM:
-- 1. Un técnico jamás debe leer ni consultar precios de compra, costos ni márgenes.
--    Solo 'admin' y 'owner' tienen permiso de SELECT (public.is_admin()).
-- 2. Solo el 'owner' tiene permiso para INSERT, UPDATE o DELETE (public.is_owner()).
-- 3. Inserción de los parámetros oficiales de fábrica si la tabla se encuentra vacía.

ALTER TABLE public.pricing_parameters ENABLE ROW LEVEL SECURITY;

-- 1. Eliminar políticas permisivas anteriores
DROP POLICY IF EXISTS "Allow authenticated read pricing_parameters" ON public.pricing_parameters;
DROP POLICY IF EXISTS "Allow admin and owner read pricing_parameters" ON public.pricing_parameters;
DROP POLICY IF EXISTS "Allow owner manage pricing_parameters" ON public.pricing_parameters;

-- 2. Política SELECT estricta: Únicamente administradores y propietarios
CREATE POLICY "Allow admin and owner read pricing_parameters"
  ON public.pricing_parameters FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 3. Política ALL (INSERT/UPDATE/DELETE) estricta: Exclusivamente Propietario (Owner)
CREATE POLICY "Allow owner manage pricing_parameters"
  ON public.pricing_parameters FOR ALL
  TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

-- 4. Seed de parámetros maestros oficiales (Hoja 1 de Walter - SEP 26)
INSERT INTO public.pricing_parameters (id, parameters)
VALUES (
  'default',
  '{
    "copperPricePerKg": 40000.00,
    "copperDiscount": 0.10,
    "vatFactor": 1.21,
    "wasteFactor": 0.05,
    "pipeMarginGM": 1.40,
    "laborMarginGM": 1.70,
    "copperWeights": {
      "1/4": 1.93,
      "3/8": 3.00,
      "1/2": 4.20,
      "5/8": 5.40,
      "3/4": 6.40,
      "7/8": 8.00,
      "1 1/8": 11.567,
      "1 1/4": 12.902
    },
    "rigidPipes": {
      "3/8": 10367.28,
      "1/2": 14244.12,
      "3/4": 21997.80,
      "7/8": 25831.08
    },
    "insulationBellini": {
      "1/4": 670.82,
      "3/8": 905.08,
      "1/2": 1098.08,
      "5/8": 1277.76,
      "3/4": 1437.48,
      "7/8": 1732.96,
      "1 1/8": 2627.39,
      "1 1/4": 3026.69
    },
    "hosesReld": {
      "1/4": 437.36,
      "3/8": 461.00,
      "1/2": 705.00,
      "5/8": 1038.00,
      "3/4": 1415.00
    },
    "cablesReld": {
      "5x1.5": 3536.83,
      "5x2.5": 5125.81,
      "7x1.5": 4670.61,
      "7x2.5": 5984.00
    },
    "tapesReld": {
      "whiteWithAdhesive": 1377.59,
      "whiteWithoutAdhesive": 729.52,
      "grayWithAdhesive": 4456.19,
      "grayWithoutAdhesive": 2497.62
    },
    "bracketsAndFixings": {
      "bracket42": 16298.70,
      "bracket52": 19018.78,
      "bracket62": 23072.28,
      "bracket82": 67437.66,
      "bracketLeg": 6789.31,
      "floorLeg": 6461.40,
      "floorLeg5TR": 21907.05,
      "fixingKit": 2076.36
    },
    "baseLabor": {
      "3000": 155000.00,
      "4500": 190000.00,
      "5500": 255000.00,
      "6000": 235000.00,
      "8000": 430000.00,
      "12000_18000": 800000.00
    }
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
