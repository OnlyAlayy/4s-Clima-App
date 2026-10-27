-- Migración 023: Estándar Industrial de Activos y QR (Asset Management Standard)
-- Tokens cortos 4S-XXXX, estado operativo, auditoría técnica y funciones RPC seguras para portal público

-- 1. Identificación corta (qr_token) y columnas operativas en public.equipment
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS qr_token TEXT;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS operational_status TEXT DEFAULT 'operativo';
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS last_service_at TIMESTAMPTZ NULL;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS next_recommended_service_at DATE NULL;

-- 2. Función generadora de token corto alfanumérico limpio (evita 0, 1, I, O para máxima legibilidad)
CREATE OR REPLACE FUNCTION public.generate_equipment_qr_token()
RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
    v_exists BOOLEAN;
    v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    v_i INT;
BEGIN
    LOOP
        v_token := '4S-';
        FOR v_i IN 1..5 LOOP
            v_token := v_token || substr(v_chars, floor(random() * length(v_chars) + 1)::INT, 1);
        END LOOP;
        
        SELECT EXISTS(SELECT 1 FROM public.equipment WHERE qr_token = v_token) INTO v_exists;
        IF NOT v_exists THEN
            RETURN v_token;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3. Poblar equipos existentes que no tengan qr_token
UPDATE public.equipment 
SET qr_token = public.generate_equipment_qr_token() 
WHERE qr_token IS NULL OR qr_token = '';

-- Establecer default y crear índice único
ALTER TABLE public.equipment ALTER COLUMN qr_token SET DEFAULT public.generate_equipment_qr_token();
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_qr_token ON public.equipment(UPPER(qr_token));

-- 4. Constraint para operational_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_equipment_operational_status'
    ) THEN
        ALTER TABLE public.equipment 
        ADD CONSTRAINT check_equipment_operational_status 
        CHECK (operational_status IN ('operativo', 'con_observaciones', 'fuera_de_servicio'));
    END IF;
END $$;

-- 5. Asegurar equipment_id e índice en public.work_orders
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_equipment_id ON public.work_orders(equipment_id);

-- 6. Trigger para actualizar last_service_at y next_recommended_service_at al completar una orden
CREATE OR REPLACE FUNCTION public.trg_update_equipment_on_order_completed()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.equipment_id IS NOT NULL AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
        UPDATE public.equipment
        SET last_service_at = COALESCE(NEW.completed_at, NOW()),
            next_recommended_service_at = (COALESCE(NEW.completed_at, NOW())::DATE + INTERVAL '90 days')::DATE,
            updated_at = NOW()
        WHERE id = NEW.equipment_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_orders_equipment_completed ON public.work_orders;
CREATE TRIGGER trg_work_orders_equipment_completed
AFTER UPDATE OF status ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_update_equipment_on_order_completed();

-- 7. Función de búsqueda limpia de equipo (soporta URL, qr_token, serial_number y UUID)
CREATE OR REPLACE FUNCTION public.find_equipment_by_identifier(p_identifier TEXT)
RETURNS TABLE (
    equipment_id UUID
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC: get_equipment_public_summary(p_identifier TEXT)
CREATE OR REPLACE FUNCTION public.get_equipment_public_summary(p_identifier TEXT)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC: get_equipment_history_for_client(p_identifier TEXT, p_email TEXT)
CREATE OR REPLACE FUNCTION public.get_equipment_history_for_client(p_identifier TEXT, p_email TEXT)
RETURNS JSONB AS $$
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

    IF v_input_email = '' OR v_input_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El formato del correo electrónico ingresado no es válido.');
    END IF;

    -- Coincidencia directa o por dominio corporativo
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

    -- Obtener historial de work_orders cerradas/en curso EXCLUYENDO precios o costos
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', wo.id,
            'order_number', wo.order_number,
            'type', wo.type,
            'status', wo.status,
            'scheduled_date', wo.scheduled_date,
            'completed_at', wo.completed_at,
            'observations', wo.observations,
            'notes', wo.observations,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RPC: create_service_request_from_qr
CREATE OR REPLACE FUNCTION public.create_service_request_from_qr(
    p_identifier TEXT, 
    p_email TEXT, 
    p_contact_name TEXT, 
    p_issue_description TEXT, 
    p_urgency TEXT
)
RETURNS JSONB AS $$
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
    v_recent_count INT;
    v_order_number TEXT;
    v_order_id UUID;
    v_urgency_clean TEXT := LOWER(COALESCE(p_urgency, 'normal'));
    v_op_status TEXT;
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

    IF v_input_email = '' OR v_input_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El formato del correo electrónico ingresado no es válido.');
    END IF;

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

    -- Generar número de orden
    v_order_number := 'OT-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 4));

    -- Si la urgencia es detenido o urgente, actualizar estado del equipo
    IF v_urgency_clean IN ('equipo detenido', 'detenido', 'urgente') THEN
        v_op_status := CASE WHEN v_urgency_clean LIKE '%detenido%' THEN 'fuera_de_servicio' ELSE 'con_observaciones' END;
        UPDATE public.equipment
        SET operational_status = v_op_status, updated_at = NOW()
        WHERE id = v_eq.id;
    END IF;

    -- Insertar nueva orden de trabajo
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
        '[Solicitud QR Autogestión - Urgencia: ' || UPPER(COALESCE(p_urgency, 'NORMAL')) || '] Solicitante: ' || 
        COALESCE(p_contact_name, 'No especificado') || ' (' || v_input_email || '). Síntoma: ' || COALESCE(p_issue_description, 'Sin descripción'),
        NOW(),
        NOW()
    ) RETURNING id INTO v_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_number', v_order_number,
        'order_id', v_order_id,
        'message', 'Solicitud de asistencia registrada correctamente.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Permisos de ejecución para anon y authenticated
GRANT EXECUTE ON FUNCTION public.find_equipment_by_identifier(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipment_public_summary(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipment_history_for_client(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_request_from_qr(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
