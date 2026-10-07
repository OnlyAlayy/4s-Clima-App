-- Add active status column for soft deletes
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
