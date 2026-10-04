import { create } from 'zustand';
import { supabase } from '@4s-clima/shared/supabase';
import { WORK_ORDER_STATUS } from '@4s-clima/shared/constants';
import { db } from '../services/offlineDb';

/**
 * Store de órdenes de trabajo.
 * Maneja la carga desde Supabase y la sincronización offline con IndexedDB.
 */
export const useWorkOrderStore = create((set, get) => ({
  workOrders: [],
  currentOrder: null,
  isLoading: false,
  isSyncing: false,
  error: null,

  /**
   * Carga las órdenes de trabajo asignadas al técnico actual.
   * Si está offline, carga desde IndexedDB.
   */
  fetchWorkOrders: async (technicianId) => {
    set({ isLoading: true, error: null });
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('work_orders')
          .select(`
            *,
            client:clients(id, name),
            plant:plants(id, name, address),
            equipment:equipment(id, type, brand, model)
          `)
          .eq('assigned_to', technicianId)
          .in('status', [WORK_ORDER_STATUS.PENDING, WORK_ORDER_STATUS.IN_PROGRESS])
          .order('scheduled_date', { ascending: true });

        if (error) throw error;

        // Guardar en IndexedDB para offline
        await db.workOrders.bulkPut(data);
        set({ workOrders: data, isLoading: false });
      } else {
        // Modo offline: cargar desde IndexedDB
        const cached = await db.workOrders
          .where('assigned_to')
          .equals(technicianId)
          .toArray();
        set({ workOrders: cached, isLoading: false });
      }
    } catch (error) {
      console.error('Error cargando OTs:', error);
      // Fallback a IndexedDB en caso de error
      const cached = await db.workOrders.toArray();
      set({ workOrders: cached, isLoading: false, error: error.message });
    }
  },

  /**
   * Carga una orden de trabajo específica con todos sus datos relacionados.
   */
  fetchWorkOrder: async (orderId) => {
    set({ isLoading: true, error: null });
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('work_orders')
          .select(`
            *,
            client:clients(id, name, address, contact_name, contact_phone),
            plant:plants(id, name, address, floor, contact_name, contact_phone, notes),
            equipment:equipment(id, type, brand, model, serial_number, capacity_btu, refrigerant_type, location_description),
            checklist_items(*),
            extras(*),
            photos(*),
            signatures(*)
          `)
          .eq('id', orderId)
          .single();

        if (error) throw error;

        await db.workOrders.put(data);
        set({ currentOrder: data, isLoading: false });
      } else {
        const cached = await db.workOrders.get(orderId);
        set({ currentOrder: cached || null, isLoading: false });
      }
    } catch (error) {
      console.error('Error cargando OT:', error);
      const cached = await db.workOrders.get(orderId);
      set({ currentOrder: cached || null, isLoading: false, error: error.message });
    }
  },

  /**
   * Marca una OT como "en progreso" (el técnico llegó a la planta).
   */
  startWorkOrder: async (orderId) => {
    const now = new Date().toISOString();
    try {
      if (navigator.onLine) {
        const { error } = await supabase
          .from('work_orders')
          .update({
            status: WORK_ORDER_STATUS.IN_PROGRESS,
            started_at: now,
          })
          .eq('id', orderId);

        if (error) throw error;
      }

      // Actualizar local siempre
      await db.workOrders.update(orderId, {
        status: WORK_ORDER_STATUS.IN_PROGRESS,
        started_at: now,
        synced: navigator.onLine,
      });

      // Actualizar estado
      const currentOrder = get().currentOrder;
      if (currentOrder?.id === orderId) {
        set({
          currentOrder: {
            ...currentOrder,
            status: WORK_ORDER_STATUS.IN_PROGRESS,
            started_at: now,
          },
        });
      }

      get().refreshWorkOrders();
    } catch (error) {
      console.error('Error iniciando OT:', error);
      // Guardar para sync posterior
      await db.pendingSync.add({
        table: 'work_orders',
        action: 'update',
        id: orderId,
        data: { status: WORK_ORDER_STATUS.IN_PROGRESS, started_at: now },
        created_at: now,
      });
    }
  },

  /**
   * Completa una OT (después de la firma).
   */
  completeWorkOrder: async (orderId) => {
    const now = new Date().toISOString();
    try {
      if (navigator.onLine) {
        const { error } = await supabase
          .from('work_orders')
          .update({
            status: WORK_ORDER_STATUS.COMPLETED,
            completed_at: now,
          })
          .eq('id', orderId);

        if (error) throw error;
      }

      await db.workOrders.update(orderId, {
        status: WORK_ORDER_STATUS.COMPLETED,
        completed_at: now,
        synced: navigator.onLine,
      });

      const currentOrder = get().currentOrder;
      if (currentOrder?.id === orderId) {
        set({
          currentOrder: {
            ...currentOrder,
            status: WORK_ORDER_STATUS.COMPLETED,
            completed_at: now,
          },
        });
      }

      get().refreshWorkOrders();
    } catch (error) {
      console.error('Error completando OT:', error);
      await db.pendingSync.add({
        table: 'work_orders',
        action: 'update',
        id: orderId,
        data: { status: WORK_ORDER_STATUS.COMPLETED, completed_at: now },
        created_at: now,
      });
    }
  },

  /**
   * Refresca la lista desde el store actual.
   */
  refreshWorkOrders: () => {
    const workOrders = get().workOrders.map((wo) => {
      // Actualizar con datos de IndexedDB si existen
      return wo;
    });
    set({ workOrders });
  },

  /**
   * Sincroniza datos pendientes cuando vuelve la conexión.
   */
  syncPendingData: async () => {
    if (!navigator.onLine) return;
    if (get().isSyncing) return; // Prevenir race conditions
    
    set({ isSyncing: true });
    try {
      const pending = await db.pendingSync.toArray();
      
      for (const item of pending) {
        let error = null;
        let dataToUpsert = Array.isArray(item.data) ? [ ...item.data ] : { ...item.data };

        // Si son checklist items con IDs temporales, quitamos el ID para que Supabase genere UUIDs reales
        if (item.table === 'checklist_items' && Array.isArray(dataToUpsert)) {
          dataToUpsert = dataToUpsert.map(row => {
            if (row.id && row.id.toString().startsWith('temp-')) {
              const { id, ...rest } = row;
              return rest;
            }
            return row;
          });
        }

        // Subir imágenes pendientes a Storage antes de insertar en la BD
        if ((item.table === 'signatures' && dataToUpsert.signature_blob) || 
            (item.table === 'photos' && dataToUpsert.photo_blob)) {
          
          try {
            const isSignature = item.table === 'signatures';
            const blobKey = isSignature ? 'signature_blob' : 'photo_blob';
            const urlKey = isSignature ? 'signature_url' : 'url';
            
            // Decodificar base64 a Blob
            const base64Data = dataToUpsert[blobKey];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blobType = dataToUpsert.content_type || 'image/png';
            const blob = new Blob([byteArray], { type: blobType });

            // Armar nombre de archivo
            const prefix = isSignature ? 'signatures' : 'photos';
            const extension = blobType.includes('jpeg') || blobType.includes('jpg') ? 'jpg' : 'png';
            const fileName = `${prefix}/${dataToUpsert.work_order_id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

            // Subir a storage
            const { error: uploadError } = await supabase.storage
              .from('work-orders')
              .upload(fileName, blob, { contentType: blobType, upsert: true });

            if (uploadError) throw uploadError;

            // Obtener URL pública
            const { data: { publicUrl } } = supabase.storage
              .from('work-orders')
              .getPublicUrl(fileName);

            // Reemplazar blob con URL real para la base de datos
            dataToUpsert[urlKey] = publicUrl;
            delete dataToUpsert[blobKey];
            delete dataToUpsert.content_type;
          } catch (uploadErr) {
            console.error('Error subiendo imagen offline:', uploadErr);
            error = uploadErr;
            continue; // Saltar a la siguiente operación si falla la subida (reintentará en el futuro)
          }
        }

        if (item.action === 'insert' || item.action === 'upsert') {
          const res = await supabase.from(item.table).upsert(dataToUpsert);
          error = res.error;
        } else if (item.action === 'update') {
          const res = await supabase.from(item.table).update(dataToUpsert).eq('id', item.id);
          error = res.error;
        } else if (item.action === 'delete') {
          const res = await supabase.from(item.table).delete().eq('id', item.id);
          error = res.error;
        }

        if (!error) {
          await db.pendingSync.delete(item.id);
          // Marcar como sincronizado
          if (item.table === 'work_orders') {
            await db.workOrders.update(item.id, { synced: true });
          }
        } else {
          console.error(`Error sync ${item.table} (${item.action}):`, error);
          // Si el error es de PostgREST (el servidor rechazó la petición por RLS o validación),
          // eliminar el item para evitar envenenar la cola de sincronización para siempre.
          if (error.code || error.status >= 400) {
            console.warn(`Eliminando operación fallida permanentemente para evitar bucle tóxico:`, item.id);
            await db.pendingSync.delete(item.id);
          }
        }
      }
    } catch (error) {
      console.error('Error sincronizando:', error);
    } finally {
      set({ isSyncing: false });
    }
  },
}));
