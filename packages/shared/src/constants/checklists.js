/**
 * Templates de checklist por tipo de equipo.
 * Cada template define las categorías y los ítems que el técnico debe verificar.
 * 
 * Estos templates se usan para generar los checklist_items al crear una OT.
 */

import { EQUIPMENT_TYPES } from './index.js';

export const CHECKLIST_TEMPLATES = {
  [EQUIPMENT_TYPES.SPLIT]: {
    name: 'Mantenimiento Preventivo - Split',
    categories: [
      {
        name: 'Unidad Interior',
        items: [
          'Limpieza de filtros',
          'Limpieza de turbina',
          'Limpieza de bandeja de condensado',
          'Verificación de drenaje',
          'Control de temperatura de inyección',
          'Verificación de funcionamiento del control remoto',
        ],
      },
      {
        name: 'Unidad Exterior',
        items: [
          'Limpieza de serpentina condensadora',
          'Verificación de presiones de trabajo',
          'Control de consumo eléctrico',
          'Verificación de estado de ventilador',
          'Inspección de cañerías y aislación',
          'Verificación de soportes y vibraciones',
        ],
      },
      {
        name: 'Sistema Eléctrico',
        items: [
          'Verificación de tensión de alimentación',
          'Control de contactores y relés',
          'Revisión de cableado y borneras',
          'Verificación de puesta a tierra',
        ],
      },
    ],
  },

  [EQUIPMENT_TYPES.CENTRAL]: {
    name: 'Mantenimiento Preventivo - Equipo Central',
    categories: [
      {
        name: 'Unidad Evaporadora',
        items: [
          'Limpieza de filtros de aire',
          'Limpieza de serpentina evaporadora',
          'Verificación de bandeja de condensado',
          'Control de temperatura de inyección',
          'Verificación de caudal de aire',
          'Inspección de dampers',
        ],
      },
      {
        name: 'Unidad Condensadora',
        items: [
          'Limpieza de serpentina condensadora',
          'Verificación de presiones de trabajo',
          'Control de nivel de aceite del compresor',
          'Verificación de válvulas de servicio',
          'Control de recalentamiento y subenfriamiento',
          'Medición de consumo eléctrico',
        ],
      },
      {
        name: 'Ductos y Distribución',
        items: [
          'Inspección de ductos y juntas',
          'Verificación de difusores y rejillas',
          'Control de caudal en bocas',
          'Verificación de aislación térmica',
        ],
      },
      {
        name: 'Sistema Eléctrico y Control',
        items: [
          'Verificación de tablero eléctrico',
          'Control de contactores y protecciones',
          'Revisión de termostato/controlador',
          'Verificación de puesta a tierra',
          'Control de secuencia de arranque',
        ],
      },
    ],
  },

  [EQUIPMENT_TYPES.CHILLER]: {
    name: 'Mantenimiento Preventivo - Chiller',
    categories: [
      {
        name: 'Circuito de Refrigeración',
        items: [
          'Verificación de presiones de trabajo',
          'Control de temperatura de evaporación',
          'Control de temperatura de condensación',
          'Verificación de recalentamiento',
          'Verificación de subenfriamiento',
          'Control de nivel de aceite',
          'Análisis de aceite (si corresponde)',
        ],
      },
      {
        name: 'Circuito Hidráulico',
        items: [
          'Verificación de caudal de agua',
          'Control de temperaturas entrada/salida',
          'Verificación de presión diferencial',
          'Inspección de bombas de circulación',
          'Verificación de válvulas y filtros',
          'Control de nivel de agua en tanque',
        ],
      },
      {
        name: 'Torre de Enfriamiento',
        items: [
          'Limpieza de relleno',
          'Verificación de ventiladores',
          'Control de tratamiento de agua',
          'Inspección de bandejas',
          'Verificación de purga automática',
        ],
      },
      {
        name: 'Sistema Eléctrico y Control',
        items: [
          'Verificación de tablero de potencia',
          'Control de protecciones eléctricas',
          'Revisión de controlador/PLC',
          'Verificación de sensores y sondas',
          'Control de alarmas y seguridades',
        ],
      },
    ],
  },

  [EQUIPMENT_TYPES.VRV]: {
    name: 'Mantenimiento Preventivo - VRV/VRF',
    categories: [
      {
        name: 'Unidades Interiores',
        items: [
          'Limpieza de filtros de aire',
          'Limpieza de serpentinas',
          'Verificación de drenajes',
          'Control de funcionamiento de louvers',
          'Verificación de controles remotos',
          'Lectura de códigos de error',
        ],
      },
      {
        name: 'Unidad Exterior',
        items: [
          'Limpieza de serpentina condensadora',
          'Verificación de presiones de trabajo',
          'Control de consumo por compresor',
          'Verificación de válvulas de expansión',
          'Inspección de acumulador de líquido',
          'Control de nivel de aceite',
        ],
      },
      {
        name: 'Sistema de Control',
        items: [
          'Verificación de comunicación entre unidades',
          'Lectura de diagnósticos del sistema',
          'Control de direcciones de red',
          'Verificación de controlador centralizado',
          'Backup de configuración',
        ],
      },
    ],
  },

  [EQUIPMENT_TYPES.FAN_COIL]: {
    name: 'Mantenimiento Preventivo - Fan Coil',
    categories: [
      {
        name: 'General',
        items: [
          'Limpieza de filtros',
          'Limpieza de serpentina',
          'Verificación de bandeja de condensado',
          'Control de drenaje',
          'Verificación de velocidades del ventilador',
          'Control de válvula de 2/3 vías',
          'Verificación de termostato',
        ],
      },
    ],
  },

  [EQUIPMENT_TYPES.ROOF_TOP]: {
    name: 'Mantenimiento Preventivo - Roof Top',
    categories: [
      {
        name: 'Sección de Aire',
        items: [
          'Limpieza/cambio de filtros',
          'Limpieza de serpentina evaporadora',
          'Verificación de dampers de aire exterior',
          'Control de correas y poleas',
          'Verificación de motor del ventilador',
        ],
      },
      {
        name: 'Sección de Refrigeración',
        items: [
          'Limpieza de serpentina condensadora',
          'Verificación de presiones de trabajo',
          'Control de consumo eléctrico',
          'Verificación de estado del compresor',
          'Control de carga de refrigerante',
        ],
      },
      {
        name: 'Eléctrico y Control',
        items: [
          'Verificación de tablero eléctrico',
          'Control de contactores y relés',
          'Verificación de termostato/controlador',
          'Control de secuencia de operación',
        ],
      },
    ],
  },
};

/**
 * Obtiene el template de checklist para un tipo de equipo.
 * @param {string} equipmentType - Tipo de equipo (de EQUIPMENT_TYPES)
 * @returns {object|null} Template del checklist o null si no existe
 */
export function getChecklistByEquipmentType(equipmentType) {
  return CHECKLIST_TEMPLATES[equipmentType] || null;
}
