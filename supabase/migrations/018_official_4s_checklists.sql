-- ==============================================================================
-- 4S Clima - Migración 018: Carga de Fichas Técnicas Oficiales 4S Clima
-- 018_official_4s_checklists.sql
-- ==============================================================================
-- 1. Desactiva plantillas de checklist genéricas o previas (active = false).
-- 2. Inserta las 3 plantillas oficiales de Visita Técnica divididas por rango de frigorías:
--    - Ficha 1: Residencial · 3.000 a 6.000 FG · Departamentos y casas (equipment_type: 'split')
--    - Ficha 2: Comercial Liviano · 12.000 a 18.000 FG · Locales, oficinas y estaciones de servicio (equipment_type: 'comercial_liviano')
--    - Ficha 3: Equipos Centrales · Más de 18.000 FG · Comerciales e Industriales (equipment_type: 'central')
-- ==============================================================================

-- 1. Desactivar plantillas anteriores
UPDATE public.checklist_templates
SET active = false,
    updated_at = now()
WHERE active = true;

-- 2. Insertar Ficha 1 (Residencial · 3.000 a 6.000 FG)
INSERT INTO public.checklist_templates (
  name,
  description,
  equipment_type,
  active,
  sections,
  created_at,
  updated_at
) VALUES (
  'Residencial · 3.000 a 6.000 FG · Departamentos y casas',
  'Ficha oficial 4S Clima para equipos residenciales split de 3.000 a 6.000 FG (Departamentos y casas).',
  'split',
  true,
  '[
    {
      "name": "A. REVISIÓN PREVIA A LA INTERVENCIÓN",
      "items": [
        "Equipo sin daños visibles y con accesorios/componentes principales completos.",
        "Modelo, capacidad, tensión y refrigerante identificados y acordes al equipo/pedido.",
        "Ubicación, fijaciones, nivelación y soporte adecuados; acceso de mantenimiento disponible.",
        "Espacios de ventilación libres, sin obstrucciones ni recirculación de aire.",
        "Alimentación eléctrica disponible y compatible con placa del equipo.",
        "Protecciones eléctricas, puesta a tierra y cableado verificables/adecuados.",
        "Tuberías/interconexiones dentro de límites del fabricante, aisladas y sin daños visibles.",
        "Drenaje de condensado previsto con pendiente y descarga segura.",
        "Acceso y condiciones de trabajo seguros; permisos/requisitos del edificio verificados si aplica.",
        "Consumo Eléctrico en Amperes (Revisión Previa)",
        "Tensión Volt (Revisión Previa)",
        "Resultado previo (Se puede intervenir / Con observaciones / No se puede intervenir)"
      ]
    },
    {
      "name": "B. REVISIÓN POSTERIOR A LA INTERVENCIÓN",
      "items": [
        "Unidad interior y exterior correctamente fijadas, niveladas y con espacios libres.",
        "Interconexiones frigoríficas realizadas según especificación; aislación continua y protegida.",
        "Prueba de hermeticidad y vacío realizadas según procedimiento del fabricante, cuando corresponda.",
        "Conexiones eléctricas firmes; protecciones y puesta a tierra verificadas.",
        "Drenaje probado; evacúa correctamente y no presenta pérdidas ni goteos.",
        "Perforaciones, pasamuros, sellados y terminaciones completadas.",
        "Unidad probada en frío y calor cuando corresponda; sin alarmas ni ruidos/vibraciones anormales.",
        "Control remoto/comandos operativos y funcionamiento básico verificado.",
        "Filtros, uso básico y limpieza explicados al usuario/cliente.",
        "Área de trabajo limpia; observaciones y pendientes comunicados.",
        "Consumo Eléctrico en Amperes (Revisión Posterior)",
        "Tensión Volt (Revisión Posterior)",
        "RESULTADO FINAL (Apto para Start Up o entrega / Apto con observaciones / No apto: requiere correcciones)"
      ]
    }
  ]'::jsonb,
  now(),
  now()
);

-- 3. Insertar Ficha 2 (Comercial Liviano · 12.000 a 18.000 FG)
INSERT INTO public.checklist_templates (
  name,
  description,
  equipment_type,
  active,
  sections,
  created_at,
  updated_at
) VALUES (
  'Comercial Liviano · 12.000 a 18.000 FG · Locales, oficinas y estaciones de servicio',
  'Ficha oficial 4S Clima para equipos comerciales livianos de 12.000 a 18.000 FG (Locales, oficinas y estaciones de servicio).',
  'comercial_liviano',
  true,
  '[
    {
      "name": "A. REVISIÓN PREVIA A LA INTERVENCIÓN",
      "items": [
        "Recepción y estado del equipo: Unidad sin daños visibles de transporte (golpes, aletas dobladas, fugas de aceite) y con accesorios completos.",
        "Placa de identificación: Modelo, N.º de serie, capacidad, tensión/fases y refrigerante identificados y coincidentes con el pedido.",
        "Emplazamiento y soportes: Ubicación de unidades adecuada, nivelada, sobre soportes o losa aptos para el peso y con espacio para mantenimiento.",
        "Ventilación y entorno: Espacios libres sin obstrucciones ni riesgo de recirculación de aire caliente en unidad exterior.",
        "Suministro eléctrico y protecciones: Alimentación eléctrica independiente desde tablero propio, con cableado y protecciones dimensionados.",
        "Dispositivos de protección (Trifásicos): Protector de secuencia y falta de fase previsto/instalado según corresponda.",
        "Tuberías y recorridos: Interconexiones frigoríficas dentro de límites de longitud/desnivel del fabricante, sin tensiones mecánicas.",
        "Drenaje de condensado: Pendiente y trazado continuo previsto sin riesgo de goteo o molestia a terceros.",
        "Entornos especiales / Estaciones de servicio: Distancias de seguridad respecto a zonas clasificadas, surtidores y venteros verificadas.",
        "Seguridad y coordinación: Permisos de trabajo, EPP y horarios coordinados para no interferir con la operación comercial del local.",
        "Consumo Eléctrico en Amperes (Revisión Previa)",
        "Tensión Volt (Revisión Previa)",
        "Resultado previo (Se puede intervenir / Con observaciones / No se puede intervenir)"
      ]
    },
    {
      "name": "B. REVISIÓN POSTERIOR A LA INTERVENCIÓN",
      "items": [
        "Fijación y protecciones: Unidades firmemente aseguradas, con antivibradores y protección física/anti-vandalismo o anticorrosiva si aplica.",
        "Interconexiones y aislación: Cañerías ejecutadas según especificación, con aislación térmica continua y protegida de la intemperie/UV.",
        "Hermeticidad y vacío: Prueba de presión/hermeticidad con nitrógeno y vacío realizados respetando el procedimiento del fabricante.",
        "Conexiones eléctricas y control: Bornes atornillados; cable de comando/termostato separado de potencia e instalado correctamente.",
        "Drenaje probado: Evacuación de condensado probada con agua; funciona correctamente, sin filtraciones ni desbordes.",
        "Conductos y aire (si aplica): Ductos aislados y sellados, rejillas y difusores montados y retorno libre de obstrucciones.",
        "Sellados y terminaciones: Perforaciones, pasamuros y sellados exteriores correctamente finalizados.",
        "Prueba de funcionamiento: Equipo probado en frío/calor; parámetros eléctricos normales, sin ruidos, vibraciones ni alarmas.",
        "Control y mandos: Comando cableado / control remoto totalmente operativo y configurado.",
        "Capacitación y entrega: Uso del equipo, limpieza de filtros y mantenimientos explicados al encargado; sitio limpio.",
        "Consumo Eléctrico en Amperes (Revisión Posterior)",
        "Tensión Volt (Revisión Posterior)",
        "RESULTADO FINAL (Apto para Start Up o entrega / Apto con observaciones / No apto: requiere correcciones)"
      ]
    }
  ]'::jsonb,
  now(),
  now()
);

-- 4. Insertar Ficha 3 (Equipos Centrales · Más de 18.000 FG)
INSERT INTO public.checklist_templates (
  name,
  description,
  equipment_type,
  active,
  sections,
  created_at,
  updated_at
) VALUES (
  'Equipos Centrales · Más de 18.000 FG · Comerciales e Industriales',
  'Ficha oficial 4S Clima para equipos centrales mayores a 18.000 FG (Comerciales e Industriales).',
  'central',
  true,
  '[
    {
      "name": "A. REVISIÓN PREVIA A LA INTERVENCIÓN",
      "items": [
        "Recepción e izaje: Equipo sin daños de transporte; plan de izaje (grúa, aparejos, barras distanciadoras) definido e inspeccionado.",
        "Placa de identificación y componentes: Modelo, serie, capacidad, tensión y componentes coincidentes con especificación técnica.",
        "Base estructural y antivibradores: Roof, curb o estructura calculada para peso en operación; antivibradores listos para montaje.",
        "Emplazamiento y accesos: Nivelación adecuada, accesos seguros para mantenimiento (escaleras, pasarelas, líneas de vida en cubierta).",
        "Espacio y recirculación: Distancias mínimas del fabricante respetadas; libre de barreras que causen recirculación de aire de condensación.",
        "Acometida eléctrica y protecciones: Tablero principal con seccionador a la vista, protecciones dimensionadas, secuencia/falta de fase y tierra.",
        "Circuito hidráulico / primario (si aplica): Bombas montadas con sentido de giro, filtro en retorno, flujostato, vaso de expansión y manómetros.",
        "Tuberías / Conductos (Previa): Límites de longitud/desnivel respetados; conductos de impulsión/retorno sellados y soportados sin tensión.",
        "Drenaje e imprevistos: Red de condensado prevista con pendiente, sifón adecuado a la presión del ventilador y descarga segura.",
        "Documentación previa: Planos conforme a obra y esquemas eléctricos disponibles en sitio.",
        "Consumo Eléctrico en Amperes (Revisión Previa)",
        "Tensión Volt (Revisión Previa)",
        "Resultado previo (Se puede intervenir / Con observaciones / No se puede intervenir)"
      ]
    },
    {
      "name": "B. REVISIÓN POSTERIOR A LA INTERVENCIÓN",
      "items": [
        "Anclaje y antivibración: Equipo asegurado sobre antivibradores ajustados y con conexiones flexibles montadas en tuberías/ductos.",
        "Interconexiones y aislamiento: Cañerías/ductos aislados térmicamente; trazados exteriores protegidos UV y con cable calefactor (si aplica).",
        "Hermeticidad, vacío o barrido: Prueba de nitrógeno/vacío completada; o circuito hidráulico lavado, purgado y probado a presión.",
        "Conexiones eléctricas y potencia: Torques de ajuste verificados; arrancadores de bombas/compresores y enclavamientos de flujo operativos.",
        "Drenaje probado: Trampa de agua/sifón cargado y probado; drenaje evacúa libremente sin filtraciones.",
        "Sistema de aire y filtros: Filtros de aire limpios e instalados; dampers de aire exterior/retorno ajustados.",
        "Control, BMS y sensores: Sensores de temperatura/presión, cableado de comunicación y señales al BMS/supervisión probados (si aplica).",
        "Arranque y parámetros: Prueba de marcha realizada; presiones, temperaturas, sentido de giro y consumos eléctricos dentro de norma.",
        "Documentación final: Esquemas eléctricos definitivos y protocolos de prueba completados y entregados.",
        "Limpieza y recepción: Área de trabajo limpia, sin restos de obra; pendientes comunicados formalmente.",
        "Consumo Eléctrico en Amperes (Revisión Posterior)",
        "Tensión Volt (Revisión Posterior)",
        "RESULTADO FINAL (Apto para Start Up o entrega / Apto con observaciones / No apto: requiere correcciones)"
      ]
    }
  ]'::jsonb,
  now(),
  now()
);
