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
} from './constants/index.js';

// Checklists predefinidos
export {
  CHECKLIST_TEMPLATES,
  getChecklistByEquipmentType,
} from './constants/checklists.js';

// Utilidades
export {
  formatDate,
  formatTime,
  formatDateTime,
  formatCurrency,
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
} from './utils/index.js';
