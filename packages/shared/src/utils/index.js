/**
 * Utilidades compartidas del ecosistema 4S Clima.
 */

import {
  WORK_ORDER_STATUS,
  WORK_ORDER_STATUS_LABELS,
} from '../constants/index.js';

/**
 * Formatea una fecha ISO a formato argentino DD/MM/YYYY.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formatea una hora a formato HH:mm.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
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
    [WORK_ORDER_STATUS.IN_PROGRESS]: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-800 dark:text-blue-400',
      dot: 'bg-blue-500',
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
