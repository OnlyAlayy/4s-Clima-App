-- Migración 028 (Verificada): Arquitectura Dual de Equipos Termomecánicos (UI + UE)

-- 1. Ampliar public.equipment con columnas específicas para ambas unidades
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS indoor_model TEXT;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS indoor_serial TEXT;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS indoor_location TEXT;

ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS outdoor_model TEXT;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS outdoor_serial TEXT;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS outdoor_location TEXT;

ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS refrigerant_type TEXT;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS capacity_tr_fg TEXT;

-- Retrocompatibilidad: poblar indoor_* con los datos históricos existentes
UPDATE public.equipment
SET indoor_model = COALESCE(indoor_model, model),
    indoor_serial = COALESCE(indoor_serial, serial_number),
    indoor_location = COALESCE(indoor_location, location_description)
WHERE indoor_model IS NULL OR indoor_serial IS NULL OR indoor_location IS NULL;

-- Índices de búsqueda para números de serie de ambas unidades
CREATE INDEX IF NOT EXISTS idx_equipment_indoor_serial ON public.equipment(UPPER(indoor_serial));
CREATE INDEX IF NOT EXISTS idx_equipment_outdoor_serial ON public.equipment(UPPER(outdoor_serial));

-- 2. Ampliar public.work_orders con alcance de unidad y notas técnicas desglosadas
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS target_unit TEXT DEFAULT 'both';
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS indoor_work_notes TEXT;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS outdoor_work_notes TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_work_orders_target_unit'
    ) THEN
        ALTER TABLE public.work_orders 
        ADD CONSTRAINT check_work_orders_target_unit 
        CHECK (target_unit IN ('both', 'indoor', 'outdoor'));
    END IF;
END $$;

-- 3. Ampliar public.checklist_items con unit_scope (indoor / outdoor / general)
ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS unit_scope TEXT DEFAULT 'general';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_checklist_items_unit_scope'
    ) THEN
        ALTER TABLE public.checklist_items 
        ADD CONSTRAINT check_checklist_items_unit_scope 
        CHECK (unit_scope IN ('indoor', 'outdoor', 'general'));
    END IF;
END $$;

-- 4. Actualizar función de búsqueda para soportar indoor_serial y outdoor_serial
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
           OR UPPER(COALESCE(e.qr_token, '')) = v_clean
           OR UPPER(COALESCE(e.serial_number, '')) = v_clean
           OR UPPER(COALESCE(e.indoor_serial, '')) = v_clean
           OR UPPER(COALESCE(e.outdoor_serial, '')) = v_clean
        LIMIT 1;
    ELSE
        RETURN QUERY
        SELECT e.id
        FROM public.equipment e
        WHERE UPPER(COALESCE(e.qr_token, '')) = v_clean
           OR UPPER(COALESCE(e.serial_number, '')) = v_clean
           OR UPPER(COALESCE(e.indoor_serial, '')) = v_clean
           OR UPPER(COALESCE(e.outdoor_serial, '')) = v_clean
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Actualizar RPC: get_equipment_public_summary para exponer datos duales (UI + UE)
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
        'capacity_tr_fg', v_eq.capacity_tr_fg,
        'refrigerant_type', v_eq.refrigerant_type,
        'serial_number', v_eq.serial_number,
        'location_description', v_eq.location_description,
        'location_in_plant', v_eq.location_description,
        'indoor_model', COALESCE(v_eq.indoor_model, v_eq.model),
        'indoor_serial', COALESCE(v_eq.indoor_serial, v_eq.serial_number),
        'indoor_location', COALESCE(v_eq.indoor_location, v_eq.location_description),
        'outdoor_model', v_eq.outdoor_model,
        'outdoor_serial', v_eq.outdoor_serial,
        'outdoor_location', v_eq.outdoor_location,
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

-- 6. Actualizar RPC: get_equipment_history_for_client con trazabilidad UI y UE
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

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', wo.id,
            'order_number', wo.order_number,
            'type', wo.type,
            'status', wo.status,
            'target_unit', COALESCE(wo.target_unit, 'both'),
            'scheduled_date', wo.scheduled_date,
            'completed_at', wo.completed_at,
            'observations', wo.observations,
            'indoor_work_notes', wo.indoor_work_notes,
            'outdoor_work_notes', wo.outdoor_work_notes,
            'checklist_items', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'item_name', ci.item_name,
                        'status', ci.status,
                        'notes', ci.notes,
                        'unit_scope', COALESCE(ci.unit_scope, 'general')
                    ) ORDER BY ci.sort_order ASC
                ), '[]'::jsonb)
                FROM public.checklist_items ci
                WHERE ci.work_order_id = wo.id
            )
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
            'capacity_tr_fg', v_eq.capacity_tr_fg,
            'refrigerant_type', v_eq.refrigerant_type,
            'install_date', v_eq.install_date,
            'location_description', v_eq.location_description,
            'indoor_model', COALESCE(v_eq.indoor_model, v_eq.model),
            'indoor_serial', COALESCE(v_eq.indoor_serial, v_eq.serial_number),
            'indoor_location', COALESCE(v_eq.indoor_location, v_eq.location_description),
            'outdoor_model', v_eq.outdoor_model,
            'outdoor_serial', v_eq.outdoor_serial,
            'outdoor_location', v_eq.outdoor_location,
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

-- 7. Asegurar permisos de ejecución para el Portal QR Público y apps
GRANT EXECUTE ON FUNCTION public.find_equipment_by_identifier(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipment_public_summary(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipment_history_for_client(TEXT, TEXT) TO anon, authenticated;