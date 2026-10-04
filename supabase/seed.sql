-- ============================================
-- 4S Clima - Datos de Prueba (Seed)
-- ============================================
-- Ejecutar después de la migración inicial para tener datos de demo.
-- NOTA: Los usuarios deben crearse primero en Supabase Auth.

-- ==========================================
-- CLIENTES DE EJEMPLO
-- ==========================================
INSERT INTO public.clients (id, name, cuit, address, contact_name, contact_phone, contract_type) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Sanatorio Mater Dei', '30-12345678-9', 'San Martín de Tours 2952, CABA', 'Carlos Méndez', '11-4567-8901', 'mensual'),
  ('c1000000-0000-0000-0000-000000000002', 'CEMIC', '30-23456789-0', 'Av. E. Galván 4102, CABA', 'Laura Giménez', '11-5678-9012', 'mensual'),
  ('c1000000-0000-0000-0000-000000000003', 'Televisión Pública', '30-34567890-1', 'Av. Figueroa Alcorta 2977, CABA', 'Roberto Paz', '11-6789-0123', 'trimestral'),
  ('c1000000-0000-0000-0000-000000000004', 'Estudio Jurídico Martinez & Asoc.', '30-45678901-2', 'Av. Córdoba 1432 Piso 5, CABA', 'Diego Martínez', '11-7890-1234', 'eventual');

-- ==========================================
-- PLANTAS
-- ==========================================
INSERT INTO public.plants (id, client_id, name, address, floor, contact_name, contact_phone, notes) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Sede Principal', 'San Martín de Tours 2952', 'PB', 'Carlos Méndez', '11-4567-8901', 'Acceso por cochera. Pedir llave del cuarto técnico.'),
  ('b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Anexo Cirugía', 'San Martín de Tours 2960', '2do', 'Ana Torres', '11-4567-8902', 'Sala de máquinas en subsuelo, sin señal de celular.'),
  ('b1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 'Sede Saavedra', 'Av. E. Galván 4102', NULL, 'Laura Giménez', '11-5678-9012', NULL),
  ('b1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000003', 'Edificio Principal', 'Av. Figueroa Alcorta 2977', NULL, 'Roberto Paz', '11-6789-0123', 'Entrar por seguridad con DNI. Equipos en terraza.'),
  ('b1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000004', 'Oficina Córdoba', 'Av. Córdoba 1432', '5to', 'Diego Martínez', '11-7890-1234', NULL);

-- ==========================================
-- EQUIPOS
-- ==========================================
INSERT INTO public.equipment (id, plant_id, type, brand, model, serial_number, capacity_btu, refrigerant_type, location_description) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'central', 'Carrier', '40RUS060', 'CR-2021-5423', 60000, 'R-410A', 'Sala de máquinas PB, al fondo del pasillo'),
  ('e1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'chiller', 'Trane', 'CGAM040', 'TR-2019-8812', 480000, 'R-134A', 'Terraza del edificio'),
  ('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 'split', 'Daikin', 'FTX35', 'DK-2022-1103', 12000, 'R-32', 'Quirófano 3, pared norte'),
  ('e1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000003', 'vrv', 'Daikin', 'RXYQ16', 'DK-2020-7741', 192000, 'R-410A', 'Condensadoras en terraza nivel 4'),
  ('e1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000004', 'roof_top', 'York', 'YCE120', 'YK-2018-3356', 120000, 'R-407C', 'Terraza, acceso por escalera de servicio'),
  ('e1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000005', 'split', 'Samsung', 'AR12', 'SM-2023-9901', 12000, 'R-32', 'Oficina principal, sobre la puerta');
