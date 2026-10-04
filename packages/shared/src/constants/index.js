/**
 * Constantes globales del ecosistema 4S Clima.
 * Fuente de verdad única para estados, tipos y enumeraciones.
 */

/** Estados de una Orden de Trabajo */
export const WORK_ORDER_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/** Tipos de Orden de Trabajo */
export const WORK_ORDER_TYPES = {
  PREVENTIVE: 'preventive',
  CORRECTIVE: 'corrective',
  INSTALLATION: 'installation',
};

/** Estados de un ítem del checklist */
export const CHECKLIST_STATUS = {
  OK: 'ok',
  WARNING: 'warning',
  FAIL: 'fail',
  NA: 'na',
};

/** Roles de usuario */
export const USER_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  TECHNICIAN: 'tecnico',
};

/** Tipos de equipo */
export const EQUIPMENT_TYPES = {
  SPLIT: 'split',
  CENTRAL: 'central',
  CHILLER: 'chiller',
  VRV: 'vrv',
  FAN_COIL: 'fan_coil',
  ROOF_TOP: 'roof_top',
};

/** Tipos de foto */
export const PHOTO_TYPES = {
  BEFORE: 'before',
  AFTER: 'after',
  ISSUE: 'issue',
};

/** Unidades para extras/repuestos */
export const EXTRA_UNITS = {
  UNIT: 'unidad',
  KG: 'kg',
  METER: 'metro',
  LITER: 'litro',
  HOUR: 'hora',
};

/** Labels legibles para los estados de OT */
export const WORK_ORDER_STATUS_LABELS = {
  [WORK_ORDER_STATUS.PENDING]: 'Pendiente',
  [WORK_ORDER_STATUS.IN_PROGRESS]: 'En Progreso',
  [WORK_ORDER_STATUS.COMPLETED]: 'Completada',
  [WORK_ORDER_STATUS.CANCELLED]: 'Cancelada',
};

/** Labels legibles para los tipos de OT */
export const WORK_ORDER_TYPE_LABELS = {
  [WORK_ORDER_TYPES.PREVENTIVE]: 'Preventivo',
  [WORK_ORDER_TYPES.CORRECTIVE]: 'Correctivo',
  [WORK_ORDER_TYPES.INSTALLATION]: 'Instalación',
};

/** Labels legibles para los tipos de equipo */
export const EQUIPMENT_TYPE_LABELS = {
  [EQUIPMENT_TYPES.SPLIT]: 'Split',
  [EQUIPMENT_TYPES.CENTRAL]: 'Central',
  [EQUIPMENT_TYPES.CHILLER]: 'Chiller',
  [EQUIPMENT_TYPES.VRV]: 'VRV/VRF',
  [EQUIPMENT_TYPES.FAN_COIL]: 'Fan Coil',
  [EQUIPMENT_TYPES.ROOF_TOP]: 'Roof Top',
};

/** Labels legibles para estados del checklist */
export const CHECKLIST_STATUS_LABELS = {
  [CHECKLIST_STATUS.OK]: 'OK',
  [CHECKLIST_STATUS.WARNING]: 'Atención',
  [CHECKLIST_STATUS.FAIL]: 'Falla',
  [CHECKLIST_STATUS.NA]: 'N/A',
};
