-- ==========================================
-- 4S Clima - Security Patch & Structural Fixes
-- 006_auth_fixes.sql
-- ==========================================

-- 1. Agregar el rol 'owner' al ENUM para que pueda existir en la BD.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner';

-- 2. Reparar Vulnerabilidad Crítica de Escalada de Privilegios en el Registro (Auth Spoofing)
-- El trigger anterior confiaba ciegamente en `raw_user_meta_data->>'role'`. 
-- Esto permitía que un atacante hiciera signUp enviando {"role":"admin"} en la metadata y 
-- obtuviera permisos de administrador automáticamente.
-- Ahora, FORZAMOS a que cualquier usuario auto-registrado nazca como 'tecnico'.
-- La Edge Function (que es la forma oficial de crear admins) luego hace un UPDATE seguro a 'admin'.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'tecnico'::user_role, -- <-- CORRECCIÓN: Ignoramos la metadata del cliente malicioso
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
