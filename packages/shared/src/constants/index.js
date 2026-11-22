/**
 * Constantes globales del ecosistema 4S Clima.
 * Fuente de verdad única para estados, tipos y enumeraciones.
 */

/** Estados de una Orden de Trabajo */
export const WORK_ORDER_STATUS = {
  PENDING: 'pending',
  TRAVELING: 'traveling',
  IN_PROGRESS: 'in_progress',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/** Tipos de Orden de Trabajo */
export const WORK_ORDER_TYPES = {
  PREVENTIVE: 'preventive',
  CORRECTIVE: 'corrective',
  INSTALLATION: 'installation',
  OBRA: 'obra',
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
  COMERCIAL_LIVIANO: 'comercial_liviano',
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
  PROGRESS: 'progress',
};

/** Labels legibles para los tipos de foto */
export const PHOTO_TYPE_LABELS = {
  before: 'Antes',
  after: 'Después',
  issue: 'Incidencia / Detalle',
  progress: 'Avance',
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
  [WORK_ORDER_STATUS.TRAVELING]: 'En Camino',
  [WORK_ORDER_STATUS.IN_PROGRESS]: 'En Planta',
  [WORK_ORDER_STATUS.ON_HOLD]: 'En Pausa',
  [WORK_ORDER_STATUS.COMPLETED]: 'Completada',
  [WORK_ORDER_STATUS.CANCELLED]: 'Cancelada',
};

/** Labels legibles para los tipos de OT */
export const WORK_ORDER_TYPE_LABELS = {
  [WORK_ORDER_TYPES.PREVENTIVE]: 'Preventivo',
  [WORK_ORDER_TYPES.CORRECTIVE]: 'Correctivo',
  [WORK_ORDER_TYPES.INSTALLATION]: 'Instalación',
  [WORK_ORDER_TYPES.OBRA]: 'Obra',
  obra: 'Obra',
  OBRA: 'Obra',
  preventive: 'Preventivo',
  corrective: 'Correctivo',
  installation: 'Instalación',
};

/** Labels legibles para los tipos de equipo */
export const EQUIPMENT_TYPE_LABELS = {
  [EQUIPMENT_TYPES.SPLIT]: 'Split Residencial',
  [EQUIPMENT_TYPES.COMERCIAL_LIVIANO]: 'Comercial Liviano',
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

/** Estados del checklist en la orden de trabajo */
export const CHECKLIST_ORDER_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
};

/** Alcance sobre el equipo en la Orden de Trabajo */
export const TARGET_UNITS = {
  BOTH: 'both',
  INDOOR: 'indoor',
  OUTDOOR: 'outdoor',
};

export const TARGET_UNIT_LABELS = {
  [TARGET_UNITS.BOTH]: 'Ambas Unidades (UI + UE - Completo)',
  [TARGET_UNITS.INDOOR]: 'Solo Unidad Interior (Evaporadora)',
  [TARGET_UNITS.OUTDOOR]: 'Solo Unidad Exterior (Condensadora)',
};

/** Alcance de unidad en los ítems de checklist */
export const UNIT_SCOPES = {
  INDOOR: 'indoor',
  OUTDOOR: 'outdoor',
  GENERAL: 'general',
};

export const UNIT_SCOPE_LABELS = {
  [UNIT_SCOPES.INDOOR]: 'Unidad Interior (UI - Evaporadora)',
  [UNIT_SCOPES.OUTDOOR]: 'Unidad Exterior (UE - Condensadora)',
  [UNIT_SCOPES.GENERAL]: 'General / Sistema',
};

/** Motivos estandarizados de pausa / impedimento operativo */
export const HOLD_REASONS = {
  MISSING_PARTS: 'missing_parts',
  HUMAN_ERROR: 'human_error',
  CLIENT_ABSENT: 'client_absent',
  TIME_LIMIT: 'time_limit',
  TECHNICAL_COMPLEXITY: 'technical_complexity',
  OTHER: 'other',
};

export const HOLD_REASON_LABELS = {
  [HOLD_REASONS.MISSING_PARTS]: 'Falta de Repuestos / Materiales',
  [HOLD_REASONS.HUMAN_ERROR]: 'Error Operativo / Falla Humana',
  [HOLD_REASONS.CLIENT_ABSENT]: 'Cliente Ausente / Sin Acceso al Inmueble',
  [HOLD_REASONS.TIME_LIMIT]: 'Fin de Jornada / Límite de Horario',
  [HOLD_REASONS.TECHNICAL_COMPLEXITY]: 'Complejidad Imprevista / Requiere Especialista',
  [HOLD_REASONS.OTHER]: 'Otro Motivo / Bloqueo Técnico',
};

/** Resultados de un tramo o visita de trabajo (work_order_visits) */
export const VISIT_OUTCOMES = {
  IN_PROGRESS: 'in_progress',
  PARTIAL_ADVANCE: 'partial_advance',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  REASSIGNED: 'reassigned',
};

export const VISIT_OUTCOME_LABELS = {
  [VISIT_OUTCOMES.IN_PROGRESS]: 'En Curso',
  [VISIT_OUTCOMES.PARTIAL_ADVANCE]: 'Avance Parcial',
  [VISIT_OUTCOMES.BLOCKED]: 'Pausada / Con Impedimento',
  [VISIT_OUTCOMES.COMPLETED]: 'Completada / Finalizada',
  [VISIT_OUTCOMES.REASSIGNED]: 'Reasignada a otro Técnico',
};

