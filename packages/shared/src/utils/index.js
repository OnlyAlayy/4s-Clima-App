/**
 * Utilidades compartidas del ecosistema 4S Clima.
 */

import {
  WORK_ORDER_STATUS,
  WORK_ORDER_STATUS_LABELS,
} from '../constants/index.js';

/**
 * Formatea una fecha ISO o string YYYY-MM-DD a formato argentino DD/MM/YYYY sin desfase UTC.
 * Cuando recibe una fecha sin hora (YYYY-MM-DD), la formatea directamente separando año, mes y día
 * para evitar que new Date("YYYY-MM-DD") la interprete como UTC medianoche y en Argentina (UTC-3)
 * se desplace al día anterior a las 21:00 hs.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) return '-';

  if (typeof date === 'string') {
    const trimmed = date.trim();
    // 1. Formato estricto YYYY-MM-DD (ej: "2026-11-22")
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-');
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }

    // 2. Formato con medianoche UTC (ej: "2026-11-22T00:00:00" o "2026-11-22T00:00:00.000Z")
    if (/^\d{4}-\d{2}-\d{2}[T ]00:00:00/.test(trimmed)) {
      const cleanDate = trimmed.split(/[T ]/)[0];
      const [y, m, d] = cleanDate.split('-');
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }

    // 3. Cadena que contiene fecha sin hora explícita
    const cleanDate = trimmed.split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [y, m, d] = parts;
      if (!trimmed.includes(':')) {
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
      }
    }
  }

  // Para objetos Date o strings con hora específica no medianoche:
  let d;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    d = new Date(`${date.trim()}T12:00:00`);
  } else {
    d = date instanceof Date ? date : new Date(date);
  }

  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

/**
 * Helper para formatear cadenas YYYY-MM-DD sin sufrir el corrimiento UTC-3.
 * @param {string|Date} dateStr
 * @returns {string}
 */
export function formatLocalDate(dateStr) {
  return formatDate(dateStr);
}

/**
 * Retorna la fecha en formato YYYY-MM-DD en la zona horaria de Argentina (America/Argentina/Buenos_Aires).
 * Evita el desfasaje a mañana generado por toISOString() entre las 21:00 y las 23:59 hs UTC-3.
 * @param {Date|string|number} [date]
 * @returns {string}
 */
export function getArgentinaDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/**
 * Formatea una hora a formato HH:mm en zona horaria argentina.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '-' : d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

/**
 * Formatea fecha y hora completa.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
  if (!date) return '-';
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Formatea un número como moneda ARS ($ 1.500,00).
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '$ 0,00';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Redondeo contable estricto a 2 decimales para prevención de errores IEEE 754.
 * Cumple con validaciones de ARCA/AFIP: ImpTotal = ImpNeto + ImpIVA.
 * @param {number|string} value
 * @returns {number}
 */
export function roundCurrency(value) {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Genera un número de orden de trabajo con formato OT-YYYYMMDD-XXXX.
 * @returns {string}
 */
export function generateOrderNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `OT-${datePart}-${randomPart}`;
}

/**
 * Obtiene el label en español para un estado de OT.
 * @param {string} status
 * @returns {string}
 */
export function getStatusLabel(status) {
  return WORK_ORDER_STATUS_LABELS[status] || status;
}

/**
 * Devuelve las clases CSS de color para un estado de OT.
 * @param {string} status
 * @returns {{ bg: string, text: string, dot: string }}
 */
export function getStatusColor(status) {
  const colors = {
    [WORK_ORDER_STATUS.PENDING]: {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-800 dark:text-amber-400',
      dot: 'bg-amber-500',
    },
    [WORK_ORDER_STATUS.TRAVELING]: {
      bg: 'bg-indigo-100 dark:bg-indigo-900/30',
      text: 'text-indigo-800 dark:text-indigo-300',
      dot: 'bg-indigo-500 animate-pulse',
    },
    [WORK_ORDER_STATUS.IN_PROGRESS]: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-800 dark:text-blue-400',
      dot: 'bg-blue-500',
    },
    [WORK_ORDER_STATUS.ON_HOLD]: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      text: 'text-orange-800 dark:text-orange-300',
      dot: 'bg-orange-500',
    },
    [WORK_ORDER_STATUS.COMPLETED]: {
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
      text: 'text-emerald-800 dark:text-emerald-400',
      dot: 'bg-emerald-500',
    },
    [WORK_ORDER_STATUS.CANCELLED]: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-800 dark:text-red-400',
      dot: 'bg-red-500',
    },
  };
  return colors[status] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-800 dark:text-gray-300', dot: 'bg-gray-500' };
}

/**
 * Trunca texto a una longitud máxima con ellipsis.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateText(text, maxLength = 50) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export * from './geo.js';
