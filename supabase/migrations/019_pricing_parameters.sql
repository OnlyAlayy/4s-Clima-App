-- Migration 019: Parametric pricing and inflation tracking (Hoja 1 de Walter)
CREATE TABLE IF NOT EXISTS public.pricing_parameters (
  id TEXT PRIMARY KEY DEFAULT 'default',
  parameters JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.pricing_parameters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pricing_parameters' AND policyname = 'Allow authenticated read pricing_parameters'
  ) THEN
    CREATE POLICY "Allow authenticated read pricing_parameters"
      ON public.pricing_parameters FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pricing_parameters' AND policyname = 'Allow admin manage pricing_parameters'
  ) THEN
    CREATE POLICY "Allow admin manage pricing_parameters"
      ON public.pricing_parameters FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid() AND users.role = 'admin'
        )
      );
  END IF;
END $$;
