/**
 * @4s-clima/shared
 * Módulo central compartido entre la PWA del técnico y el panel administrativo.
 * 
 * Exporta: cliente Supabase, constantes, utilidades.
 */

// Supabase
export { supabase } from './supabase/client.js';

// Constantes
export {
  WORK_ORDER_STATUS,
  WORK_ORDER_TYPES,
  CHECKLIST_STATUS,
  USER_ROLES,
  EQUIPMENT_TYPES,
  PHOTO_TYPES,
  EXTRA_UNITS,
  CHECKLIST_ORDER_STATUS,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_TYPE_LABELS,
  EQUIPMENT_TYPE_LABELS,
  CHECKLIST_STATUS_LABELS,
} from './constants/index.js';

// Checklists predefinidos
export {
  CHECKLIST_TEMPLATES,
  OFFICIAL_4S_CHECKLIST_TEMPLATES,
  getChecklistByEquipmentType,
} from './constants/checklists.js';

// Catálogo Técnico Sanitizado para Técnicos (Sin Precios ni Márgenes)
export {
  TECHNICAL_CAPACITY_OPTIONS,
  TECHNICAL_COMBOS_BY_CAPACITY,
  getTechnicalMaterialChips,
} from './constants/technicalMaterials.js';

// Catálogo Oficial y Motor Dinámico de Costos e Inflación (Hoja 1 de Walter - Administración)
export {
  INSTALLATION_COMBOS_BY_CAPACITY,
  CATALOG_CATEGORIES,
  OFFICIAL_MATERIALS_CATALOG,
  DEFAULT_PRICING_PARAMETERS,
  calculateCopperPipePrice,
  calculateArmoredPipePrice,
  calculateLaborPrice,
  calculateUninstallationPrice,
  buildCombosByCapacity,
  buildMaterialsCatalog,
  applyInflationAdjustment,
  findSuggestedPrice,
  calculateComboBudget,
} from './constants/materialsCatalog.js';

// Utilidades
export {
  formatDate,
  formatTime,
  formatDateTime,
  formatCurrency,
  roundCurrency,
  generateOrderNumber,
  getStatusLabel,
  getStatusColor,
  truncateText,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  resolveOrderLocation,
  calculateDistance,
  formatDistance,
  searchAddressCoordinates,
  calculateEtaMinutes,
  formatEta,
  calculateEstimatedArrival,
  evaluateSchedulePunctuality,
  isNearDestination,
  generateWhatsAppTrackingUrl,
} from './utils/index.js';
