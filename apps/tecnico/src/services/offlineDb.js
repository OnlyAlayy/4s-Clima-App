import Dexie from 'dexie';

/**
 * Base de datos IndexedDB para modo offline.
 * Usa Dexie.js como wrapper amigable sobre IndexedDB.
 * 
 * Esta DB actúa como caché local de Supabase.
 * Cuando el técnico no tiene conexión, los datos se guardan acá
 * y se sincronizan automáticamente cuando vuelve la señal.
 */
export const db = new Dexie('4sClimaDB');

db.version(1).stores({
  // Órdenes de trabajo cacheadas
  workOrders: 'id, assigned_to, status, scheduled_date, synced',
  
  // Ítems de checklist
  checklistItems: 'id, work_order_id, status, synced',
  
  // Extras / repuestos usados
  extras: 'id, work_order_id, synced',
  
  // Fotos tomadas (se guardan como blobs)
  photos: 'id, work_order_id, synced',
  
  // Firmas
  signatures: 'id, work_order_id, synced',
  
  // Cola de sincronización pendiente
  // Cada registro representa una operación que debe enviarse a Supabase
  pendingSync: '++id, table, action, created_at',
});

/**
 * Limpia toda la base de datos local.
 * Útil al cerrar sesión.
 */
export async function clearLocalDatabase() {
  await db.workOrders.clear();
  await db.checklistItems.clear();
  await db.extras.clear();
  await db.photos.clear();
  await db.signatures.clear();
  await db.pendingSync.clear();
}

/**
 * Obtiene la cantidad de operaciones pendientes de sincronización.
 * @returns {Promise<number>}
 */
export async function getPendingSyncCount() {
  return await db.pendingSync.count();
}
