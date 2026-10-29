-- ==============================================================================
-- Migración 026: Auditoría Integral y Blindaje de Seguridad Industrial (AppSec)
-- ==============================================================================
-- Controles Implementados:
-- 1. SEC-01: Inmutabilidad de Roles y Prevención de Escalada Vertical en public.users.
-- 2. SEC-02: Protección Antifraude y Prevención de IDOR / Modificación de Precios en public.work_orders.
-- 3. SEC-03: Hardening de search_path en todas las Funciones SECURITY DEFINER (Previene Hijacking).
-- 4. SEC-04: Sanitización, Límites de Longitud y Rate-Limit Estricto en el Portal QR.
-- 5. SEC-05: Restricción de Tipos de Archivo y Extensiones Seguras en Supabase Storage.
-- ==============================================================================

-- 1. SEC-01: Prevención de Escalada Vertical de Roles en public.users
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.role IS DISTINCT FROM NEW.role) AND NOT public.is_owner() THEN
    RAISE EXCEPTION 'Access Denied: Only owners can modify user roles.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unauthorized_role_change ON public.users;
CREATE TRIGGER trg_prevent_unauthorized_role_change
BEFORE UPDATE OF role ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_unauthorized_role_change();

-- 2. SEC-02: Protección Antifraude en public.work_orders (IDOR y Modificación Financiera)
CREATE OR REPLACE FUNCTION public.prevent_tech_financial_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    -- El técnico no puede reasignar la orden a otro técnico
    IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
      RAISE EXCEPTION 'Access Denied: Technicians cannot reassign work orders.';
    END IF;

    -- El técnico no puede alterar campos comerciales o de facturación
    IF (OLD.total_amount IS DISTINCT FROM NEW.total_amount) OR
       (OLD.payment_status IS DISTINCT FROM NEW.payment_status) OR
       (OLD.payment_method IS DISTINCT FROM NEW.payment_method) OR
       (OLD.afip_voucher_number IS DISTINCT FROM NEW.afip_voucher_number) OR
       (OLD.afip_cae IS DISTINCT FROM NEW.afip_cae) THEN
      RAISE EXCEPTION 'Access Denied: Technicians cannot alter financial or billing data.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tech_financial_tampering ON public.work_orders;
CREATE TRIGGER trg_prevent_tech_financial_tampering
BEFORE UPDATE ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_tech_financial_tampering();

-- 3. SEC-03: Hardening de search_path en Funciones de Inmutabilidad
CREATE OR REPLACE FUNCTION public.prevent_completed_wo_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  wo_status public.work_order_status;
BEGIN
  IF public.is_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'work_orders' THEN
    wo_status := OLD.status;
  ELSIF TG_TABLE_NAME IN ('checklist_items', 'extras', 'photos', 'signatures') THEN
    SELECT status INTO wo_status FROM public.work_orders WHERE id = COALESCE(OLD.work_order_id, NEW.work_order_id);
  END IF;

  IF wo_status = 'completed' THEN
    RAISE EXCEPTION 'Record Locked: Cannot modify or delete items of a completed work order.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. SEC-04: Hardening de Funciones RPC del Portal Público de Equipos y QR
CREATE OR REPLACE FUNCTION public.find_equipment_by_identifier(p_identifier TEXT)
RETURNS TABLE (
    equipment_id UUID
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean TEXT := UPPER(TRIM(p_identifier));
    v_is_uuid BOOLEAN;
BEGIN
    IF v_clean LIKE '%/QR/%' THEN
        v_clean := substring(v_clean from '/QR/([^/?#]+)');
    END IF;

    v_is_uuid := p_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    IF v_is_uuid THEN
        RETURN QUERY
        SELECT e.id
        FROM public.equipment e
        WHERE e.id = p_identifier::uuid
           OR UPPER(e.qr_token) = v_clean
           OR UPPER(COALESCE(e.serial_number, '')) = v_clean
        LIMIT 1;
    ELSE
        RETURN QUERY
        SELECT e.id
        FROM public.equipment e
        WHERE UPPER(e.qr_token) = v_clean
           OR UPPER(COALESCE(e.serial_number, '')) = v_clean
        LIMIT 1;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_equipment_public_summary(p_identifier TEXT)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_found_id UUID;
    v_eq RECORD;
    v_plant RECORD;
    v_client RECORD;
BEGIN
    SELECT equipment_id INTO v_found_id FROM public.find_equipment_by_identifier(p_identifier);

    IF v_found_id IS NULL THEN
        RETURN jsonb_build_object('found', false, 'error', 'Equipo no encontrado');
    END IF;

    SELECT * INTO v_eq FROM public.equipment WHERE id = v_found_id;
    SELECT * INTO v_plant FROM public.plants WHERE id = v_eq.plant_id;
    SELECT * INTO v_client FROM public.clients WHERE id = v_plant.client_id;

    RETURN jsonb_build_object(
        'found', true,
        'id', v_eq.id,
        'qr_token', v_eq.qr_token,
        'brand', v_eq.brand,
        'model', v_eq.model,
        'type', v_eq.type,
        'equipment_type', v_eq.type,
        'capacity_btu', v_eq.capacity_btu,
        'refrigerant_type', v_eq.refrigerant_type,
        'serial_number', v_eq.serial_number,
        'location_description', v_eq.location_description,
        'location_in_plant', v_eq.location_description,
        'operational_status', COALESCE(v_eq.operational_status, 'operativo'),
        'last_service_at', v_eq.last_service_at,
        'next_recommended_service_at', v_eq.next_recommended_service_at,
        'plant_name', v_plant.name,
        'client_name_masked', CASE 
            WHEN length(v_client.name) > 4 THEN substring(v_client.name from 1 for 3) || '***'
            ELSE '***'
        END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_equipment_history_for_client(p_identifier TEXT, p_email TEXT)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_found_id UUID;
    v_eq RECORD;
    v_plant RECORD;
    v_client RECORD;
    v_client_email TEXT;
    v_input_email TEXT;
    v_client_domain TEXT;
    v_input_domain TEXT;
    v_is_authorized BOOLEAN := false;
    v_history JSONB;
BEGIN
    SELECT equipment_id INTO v_found_id FROM public.find_equipment_by_identifier(p_identifier);
    IF v_found_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Equipo no encontrado.');
    END IF;

    SELECT * INTO v_eq FROM public.equipment WHERE id = v_found_id;
    SELECT * INTO v_plant FROM public.plants WHERE id = v_eq.plant_id;
    SELECT * INTO v_client FROM public.clients WHERE id = v_plant.client_id;

    v_input_email := LOWER(TRIM(p_email));
    v_client_email := LOWER(TRIM(COALESCE(v_client.contact_email, '')));

    IF v_input_email = '' OR v_input_email NOT LIKE '%@%.%' OR length(v_input_email) > 120 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El formato del correo electrónico ingresado no es válido.');
    END IF;

    -- Validación estricta de correo titular o dominio corporativo
    IF v_client_email <> '' AND v_client_email = v_input_email THEN
        v_is_authorized := true;
    ELSE
        v_client_domain := split_part(v_client_email, '@', 2);
        v_input_domain := split_part(v_input_email, '@', 2);

        IF v_client_domain <> '' 
           AND v_client_domain = v_input_domain 
           AND v_client_domain NOT IN ('gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.ar', 'icloud.com', 'live.com', 'proton.me', 'protonmail.com') THEN
            v_is_authorized := true;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'El correo no coincide con el cliente titular o dominio corporativo asociado a esta unidad.'
        );
    END IF;

    -- Obtener historial de work_orders cerradas/en curso EXCLUYENDO precios, costos o márgenes
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', wo.id,
            'order_number', wo.order_number,
            'type', wo.type,
            'status', wo.status,
            'scheduled_date', wo.scheduled_date,
            'completed_at', wo.completed_at,
            'observations', wo.observations,
            'technical_diagnostic', wo.observations
        ) ORDER BY COALESCE(wo.completed_at, wo.scheduled_date::timestamptz, wo.created_at) DESC
    ), '[]'::jsonb) INTO v_history
    FROM public.work_orders wo
    WHERE wo.equipment_id = v_eq.id;

    RETURN jsonb_build_object(
        'success', true,
        'equipment', jsonb_build_object(
            'id', v_eq.id,
            'qr_token', v_eq.qr_token,
            'brand', v_eq.brand,
            'model', v_eq.model,
            'type', v_eq.type,
            'serial_number', v_eq.serial_number,
            'capacity_btu', v_eq.capacity_btu,
            'refrigerant_type', v_eq.refrigerant_type,
            'install_date', v_eq.install_date,
            'location_description', v_eq.location_description,
            'operational_status', COALESCE(v_eq.operational_status, 'operativo'),
            'last_service_at', v_eq.last_service_at,
            'next_recommended_service_at', v_eq.next_recommended_service_at,
            'plant_name', v_plant.name,
            'plant_address', v_plant.address,
            'client_name', v_client.name
        ),
        'history', v_history
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_service_request_from_qr(
    p_identifier TEXT, 
    p_email TEXT, 
    p_contact_name TEXT, 
    p_issue_description TEXT, 
    p_urgency TEXT
)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_found_id UUID;
    v_eq RECORD;
    v_plant RECORD;
    v_client RECORD;
    v_client_email TEXT;
    v_input_email TEXT;
    v_clean_contact TEXT;
    v_clean_issue TEXT;
    v_client_domain TEXT;
    v_input_domain TEXT;
    v_is_authorized BOOLEAN := false;
    v_recent_count INT;
    v_order_number TEXT;
    v_order_id UUID;
    v_urgency_clean TEXT := LOWER(COALESCE(p_urgency, 'normal'));
    v_op_status TEXT;
BEGIN
    -- Sanitizar y limitar longitud de parámetros de entrada
    v_clean_contact := TRIM(SUBSTRING(COALESCE(p_contact_name, '') FROM 1 FOR 100));
    v_clean_issue := TRIM(SUBSTRING(COALESCE(p_issue_description, '') FROM 1 FOR 1500));
    v_input_email := LOWER(TRIM(COALESCE(p_email, '')));

    IF v_clean_contact = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El nombre del solicitante es requerido.');
    END IF;

    IF v_clean_issue = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del síntoma o falla es requerida.');
    END IF;

    IF v_input_email = '' OR v_input_email NOT LIKE '%@%.%' OR length(v_input_email) > 120 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El formato del correo electrónico ingresado no es válido.');
    END IF;

    SELECT equipment_id INTO v_found_id FROM public.find_equipment_by_identifier(p_identifier);
    IF v_found_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Equipo no encontrado.');
    END IF;

    SELECT * INTO v_eq FROM public.equipment WHERE id = v_found_id;
    SELECT * INTO v_plant FROM public.plants WHERE id = v_eq.plant_id;
    SELECT * INTO v_client FROM public.clients WHERE id = v_plant.client_id;

    v_client_email := LOWER(TRIM(COALESCE(v_client.contact_email, '')));

    IF v_client_email <> '' AND v_client_email = v_input_email THEN
        v_is_authorized := true;
    ELSE
        v_client_domain := split_part(v_client_email, '@', 2);
        v_input_domain := split_part(v_input_email, '@', 2);

        IF v_client_domain <> '' 
           AND v_client_domain = v_input_domain 
           AND v_client_domain NOT IN ('gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.ar', 'icloud.com', 'live.com', 'proton.me', 'protonmail.com') THEN
            v_is_authorized := true;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'El correo no corresponde al cliente titular o dominio corporativo asociado a este equipo.'
        );
    END IF;

    -- Anti-duplicados / Rate limit: 15 minutos para el mismo equipment_id
    SELECT COUNT(*) INTO v_recent_count
    FROM public.work_orders
    WHERE equipment_id = v_eq.id
      AND status IN ('pending', 'unassigned')
      AND created_at > (NOW() - INTERVAL '15 minutes');

    IF v_recent_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Ya existe una solicitud pendiente registrada recientemente para este equipo. Nuestro equipo técnico la está procesando.'
        );
    END IF;

    -- Generar número de orden seguro
    v_order_number := 'OT-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 4));

    -- Actualizar estado si es urgente o detenido
    IF v_urgency_clean IN ('equipo detenido', 'detenido', 'urgente', 'critico') THEN
        v_op_status := CASE WHEN v_urgency_clean LIKE '%detenido%' OR v_urgency_clean LIKE '%critico%' THEN 'fuera_de_servicio' ELSE 'con_observaciones' END;
        UPDATE public.equipment
        SET operational_status = v_op_status, updated_at = NOW()
        WHERE id = v_eq.id;
    END IF;

    -- Insertar nueva orden vinculada
    INSERT INTO public.work_orders (
        order_number,
        client_id,
        plant_id,
        equipment_id,
        type,
        status,
        scheduled_date,
        observations,
        created_at,
        updated_at
    ) VALUES (
        v_order_number,
        v_client.id,
        v_plant.id,
        v_eq.id,
        'corrective',
        'pending',
        CURRENT_DATE,
        '[SOLICITUD QR] Contacto: ' || v_clean_contact || ' (' || v_input_email || ') - Urgencia: ' || UPPER(v_urgency_clean) || ' - Falla: ' || v_clean_issue,
        NOW(),
        NOW()
    ) RETURNING id INTO v_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'message', 'Solicitud registrada correctamente. El equipo técnico ha sido notificado.'
    );
END;
$$;

-- 5. SEC-05: Restricción de Tipos de Archivo y Extensiones en Storage
DROP POLICY IF EXISTS "Auth Insert" ON storage.objects;
CREATE POLICY "Auth Insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( 
  bucket_id = 'work-orders' 
  AND auth.role() = 'authenticated'
  AND (LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf'))
);

