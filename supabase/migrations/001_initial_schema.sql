-- ============================================
-- 4S Clima - Ecosistema Digital
-- Migración Inicial - Schema Completo
-- ============================================
-- Este script crea todas las tablas necesarias para el ecosistema.
-- Ejecutar en el SQL Editor de Supabase o mediante `supabase db push`.

-- ==========================================
-- 1. EXTENSIONES
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 2. TIPOS ENUM
-- ==========================================
CREATE TYPE user_role AS ENUM ('admin', 'tecnico');
CREATE TYPE work_order_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE work_order_type AS ENUM ('preventive', 'corrective', 'installation');
CREATE TYPE checklist_status AS ENUM ('ok', 'warning', 'fail', 'na');
CREATE TYPE photo_type AS ENUM ('before', 'after', 'issue');

-- ==========================================
-- 3. TABLA: users (extende auth.users de Supabase)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'tecnico',
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 4. TABLA: clients
-- ==========================================
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  cuit TEXT,
  address TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  contract_type TEXT, -- 'mensual', 'trimestral', 'eventual'
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 5. TABLA: plants (sucursales/plantas de un cliente)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.plants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  floor TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 6. TABLA: equipment (equipos de climatización)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plant_id UUID NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'split', 'central', 'chiller', 'vrv', 'fan_coil', 'roof_top'
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  capacity_btu INTEGER,
  refrigerant_type TEXT,
  install_date DATE,
  location_description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 7. TABLA: work_orders (órdenes de trabajo)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  plant_id UUID REFERENCES public.plants(id),
  equipment_id UUID REFERENCES public.equipment(id),
  assigned_to UUID REFERENCES public.users(id),
  status work_order_status NOT NULL DEFAULT 'pending',
  type work_order_type NOT NULL DEFAULT 'preventive',
  scheduled_date DATE,
  scheduled_time TIME,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  observations TEXT,
  synced BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 8. TABLA: checklist_items
-- ==========================================
CREATE TABLE IF NOT EXISTS public.checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  category TEXT,
  item_name TEXT NOT NULL,
  status checklist_status,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 9. TABLA: extras (repuestos y materiales adicionales)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.extras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unidad', -- 'unidad', 'kg', 'metro', 'litro', 'hora'
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  billed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 10. TABLA: photos
-- ==========================================
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  type photo_type NOT NULL DEFAULT 'after',
  caption TEXT,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 11. TABLA: signatures
-- ==========================================
CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_role TEXT,
  signature_url TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 12. ÍNDICES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_plants_client ON public.plants(client_id);
CREATE INDEX IF NOT EXISTS idx_equipment_plant ON public.equipment(plant_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned ON public.work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_client ON public.work_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON public.work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_scheduled ON public.work_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_checklist_items_wo ON public.checklist_items(work_order_id);
CREATE INDEX IF NOT EXISTS idx_extras_wo ON public.extras(work_order_id);
CREATE INDEX IF NOT EXISTS idx_extras_billed ON public.extras(billed);
CREATE INDEX IF NOT EXISTS idx_photos_wo ON public.photos(work_order_id);
CREATE INDEX IF NOT EXISTS idx_signatures_wo ON public.signatures(work_order_id);

-- ==========================================
-- 13. ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

-- Política: Los admins ven todo
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE POLICY "Admins full access" ON public.users
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (id = auth.uid());

-- Políticas permisivas para las demás tablas (los usuarios autenticados acceden)
-- En producción, refinar por rol y asignación
CREATE POLICY "Authenticated access" ON public.clients
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON public.plants
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON public.equipment
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON public.work_orders
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON public.checklist_items
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON public.extras
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON public.photos
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON public.signatures
  FOR ALL USING (auth.role() = 'authenticated');

-- ==========================================
-- 14. FUNCIONES Y TRIGGERS (updated_at automático)
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a tablas con updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.plants
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- 15. STORAGE BUCKETS
-- ==========================================
-- Crear bucket para archivos de órdenes de trabajo (fotos y firmas)
INSERT INTO storage.buckets (id, name, public)
VALUES ('work-orders', 'work-orders', true)
ON CONFLICT (id) DO NOTHING;

-- Política de storage: usuarios autenticados pueden subir
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'work-orders' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'work-orders');

-- ==========================================
-- 16. AUTO-CREAR PERFIL AL REGISTRAR USUARIO
-- ==========================================
-- Cuando se crea un usuario en auth.users (desde el panel de Supabase
-- o desde la app), se crea automáticamente su perfil en public.users.
-- El nombre y rol se toman del campo raw_user_meta_data del signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'tecnico'),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: se ejecuta cada vez que se crea un usuario en auth
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
