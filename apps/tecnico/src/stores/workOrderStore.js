import { create } from 'zustand';
import { supabase } from '@4s-clima/shared/supabase';
import { WORK_ORDER_STATUS } from '@4s-clima/shared/constants';
import { db } from '../services/offlineDb';
import nativeLocationTracker from '../services/nativeLocationTracker';
import { useShiftStore } from './shiftStore';

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
            id,
            order_number,
            client_id,
            plant_id,
            equipment_id,
            assigned_to,
            status,
            type,
            scheduled_date,
            scheduled_time,
            started_at,
            completed_at,
            observations,
            synced,
            created_at,
            updated_at,
            custom_address,
            custom_latitude,
            custom_longitude,
            is_custom_location,
            checklist_status,
            checklist_submitted_at,
            checklist_template_id,
            travel_started_at,
            arrived_at,
            is_survey_only,
            target_unit,
            indoor_work_notes,
            outdoor_work_notes,
            hold_reason,
            hold_notes,
            paused_at,
            paused_by,
            client:clients(id, name),
            plant:plants(id, name, address, latitude, longitude),
            equipment:equipment(*)
          `)
          .eq('assigned_to', technicianId)
          .in('status', [WORK_ORDER_STATUS.PENDING, WORK_ORDER_STATUS.TRAVELING, WORK_ORDER_STATUS.IN_PROGRESS, WORK_ORDER_STATUS.ON_HOLD])
          .order('scheduled_date', { ascending: true });

        if (error) throw error;

        // Sincronizar Dexie: eliminar órdenes locales que ya no pertenezcan al técnico o hayan sido canceladas/desasignadas
        try {
          const currentIds = new Set(data.map((o) => o.id));
          const cachedOrders = await db.workOrders
            .where('assigned_to')
            .equals(technicianId)
            .toArray();

          for (const cached of cachedOrders) {
            if (!currentIds.has(cached.id)) {
              await db.workOrders.delete(cached.id);
            }
          }
        } catch (syncErr) {
          console.warn('Error sincronizando eliminación en Dexie:', syncErr);
        }

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
      // Fallback seguro a IndexedDB en caso de error (filtrando por el técnico actual)
      const cached = await db.workOrders
        .where('assigned_to')
        .equals(technicianId)
        .toArray();
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
            id,
            order_number,
            client_id,
            plant_id,
            equipment_id,
            assigned_to,
            status,
            type,
            scheduled_date,
            scheduled_time,
            started_at,
            completed_at,
            observations,
            synced,
            created_at,
            updated_at,
            custom_address,
            custom_latitude,
            custom_longitude,
            is_custom_location,
            checklist_status,
            checklist_submitted_at,
            checklist_template_id,
            travel_started_at,
            arrived_at,
            is_survey_only,
            target_unit,
            indoor_work_notes,
            outdoor_work_notes,
            hold_reason,
            hold_notes,
            paused_at,
            paused_by,
            client:clients(id, name, address, contact_name, contact_phone),
            plant:plants(id, name, address, floor, contact_name, contact_phone, notes, latitude, longitude),
            equipment:equipment(*),
            checklist_items(*),
            extras(id, work_order_id, description, quantity, unit, created_at),
            photos(*),
            signatures(*)
          `)
          .eq('id', orderId)
          .single();

        if (error) throw error;

        // Cargar historial de tramos y visitas de la orden
        try {
          const { data: visitsData, error: visitsError } = await supabase
            .from('work_order_visits')
            .select(`
              id,
              work_order_id,
              technician_id,
              started_at,
              ended_at,
              outcome,
              reason_code,
              summary_notes,
              created_at,
              technician:users!technician_id(id, name)
            `)
            .eq('work_order_id', orderId)
            .order('started_at', { ascending: false });

          if (!visitsError && visitsData) {
            data.visits = visitsData;
          } else {
            data.visits = [];
          }
        } catch (vErr) {
          console.warn('Nota: no se pudo cargar historial de tramos de visita:', vErr);
          data.visits = [];
        }

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
   * Inicia el viaje hacia el cliente (estado 'traveling').
   * Enciende el Live Tracking GPS estilo delivery.
   */
  startTravel: async (orderId) => {
    // Salvaguarda: Verificar que la jornada laboral esté activa antes de viajar
    try {
      const shiftState = useShiftStore.getState();
      if (!shiftState.activeShift) {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData?.session?.user?.id;
        if (currentUserId) {
          console.log('[WorkOrderStore] No hay jornada activa al iniciar viaje. Iniciando turno automáticamente...');
          await shiftState.checkIn(currentUserId);
        }
      }
    } catch (shiftErr) {
      console.warn('[WorkOrderStore] Advertencia al auto-iniciar jornada para viaje:', shiftErr);
    }

    const now = new Date().toISOString();
    try {
      if (navigator.onLine) {
        const updatePayload = {
          status: WORK_ORDER_STATUS.TRAVELING,
          travel_started_at: now,
        };
        const { error } = await supabase
          .from('work_orders')
          .update(updatePayload)
          .eq('id', orderId);

        // Si la columna travel_started_at aún no fue migrada en DB, fallback con solo status
        if (error && error.message?.includes('travel_started_at')) {
          const retry = await supabase
            .from('work_orders')
            .update({ status: WORK_ORDER_STATUS.TRAVELING })
            .eq('id', orderId);
          if (retry.error) throw retry.error;
        } else if (error) {
          throw error;
        }
      }

      // Actualizar local en IndexedDB siempre
      await db.workOrders.update(orderId, {
        status: WORK_ORDER_STATUS.TRAVELING,
        travel_started_at: now,
        synced: navigator.onLine,
      });

      // Actualizar estado en store
      const currentOrder = get().currentOrder;
      if (currentOrder?.id === orderId) {
        set({
          currentOrder: {
            ...currentOrder,
            status: WORK_ORDER_STATUS.TRAVELING,
            travel_started_at: now,
          },
        });
      }

      get().refreshWorkOrders();
    } catch (error) {
      console.error('Error iniciando viaje de OT:', error);
      await db.pendingSync.add({
        table: 'work_orders',
        action: 'update',
        recordId: orderId,
        data: { status: WORK_ORDER_STATUS.TRAVELING, travel_started_at: now },
        created_at: now,
      });
    }
  },

  /**
   * Registra la llegada a la planta del cliente (estado 'in_progress').
   * Apaga el Live Tracking GPS para preservar batería e inicia el trabajo en sitio.
   */
  arriveAtPlant: async (orderId) => {
    // Salvaguarda: Verificar que la jornada laboral esté activa al ingresar a planta
    try {
      const shiftState = useShiftStore.getState();
      if (!shiftState.activeShift) {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData?.session?.user?.id;
        if (currentUserId) {
          console.log('[WorkOrderStore] No hay jornada activa al ingresar a planta. Iniciando turno automáticamente...');
          await shiftState.checkIn(currentUserId);
        }
      }
    } catch (shiftErr) {
      console.warn('[WorkOrderStore] Advertencia al auto-iniciar jornada para planta:', shiftErr);
    }

    const now = new Date().toISOString();
    try {
      if (navigator.onLine) {
        const updatePayload = {
          status: WORK_ORDER_STATUS.IN_PROGRESS,
          started_at: now,
          arrived_at: now,
          hold_reason: null,
          hold_notes: null,
          paused_at: null,
          paused_by: null,
        };
        const { error } = await supabase
          .from('work_orders')
          .update(updatePayload)
          .eq('id', orderId);

        // Si alguna columna aún no fue migrada en DB, fallback con columnas base
        if (error) {
          const retry = await supabase
            .from('work_orders')
            .update({
              status: WORK_ORDER_STATUS.IN_PROGRESS,
              started_at: now,
            })
            .eq('id', orderId);
          if (retry.error) throw retry.error;
        }

        // Registrar apertura de tramo / visita en work_order_visits si no hay una activa
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const currentUserId = sessionData?.session?.user?.id;
          if (currentUserId) {
            const { data: openVisits } = await supabase
              .from('work_order_visits')
              .select('id')
              .eq('work_order_id', orderId)
              .eq('outcome', 'in_progress')
              .limit(1);

            if (!openVisits || openVisits.length === 0) {
              await supabase.from('work_order_visits').insert({
                work_order_id: orderId,
                technician_id: currentUserId,
                started_at: now,
                outcome: 'in_progress',
              });
            }
          }
        } catch (vErr) {
          console.warn('Nota: no se pudo registrar tramo en work_order_visits:', vErr);
        }
      }

      // Actualizar local en IndexedDB siempre
      await db.workOrders.update(orderId, {
        status: WORK_ORDER_STATUS.IN_PROGRESS,
        started_at: now,
        arrived_at: now,
        hold_reason: null,
        hold_notes: null,
        paused_at: null,
        paused_by: null,
        synced: navigator.onLine,
      });

      // Actualizar estado en store
      const currentOrder = get().currentOrder;
      if (currentOrder?.id === orderId) {
        set({
          currentOrder: {
            ...currentOrder,
            status: WORK_ORDER_STATUS.IN_PROGRESS,
            started_at: now,
            arrived_at: now,
            hold_reason: null,
            hold_notes: null,
            paused_at: null,
            paused_by: null,
          },
        });
      }

      get().refreshWorkOrders();
    } catch (error) {
      console.error('Error registrando llegada a planta:', error);
      await db.pendingSync.add({
        table: 'work_orders',
        action: 'update',
        recordId: orderId,
        data: { status: WORK_ORDER_STATUS.IN_PROGRESS, started_at: now, arrived_at: now },
        created_at: now,
      });
    }
  },

  /**
   * Alias de compatibilidad hacia arriveAtPlant.
   */
  startWorkOrder: async (orderId) => {
    return get().arriveAtPlant(orderId);
  },

  /**
   * Registra un Avance Parcial (Fin de jornada en obras largas / relevo de técnicos).
   * Cierra el tramo activo con outcome 'partial_advance', devuelve la orden a 'pending'
   * para reanudar al día siguiente, mantiene el checklist en draft y limpia el GPS.
   */
  registerPartialAdvance: async (orderId, summaryNotes = '') => {
    const now = new Date().toISOString();
    try {
      if (navigator.onLine) {
        // 1. Cerrar tramo/visita activa
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const currentUserId = sessionData?.session?.user?.id;
          if (currentUserId) {
            await supabase
              .from('work_order_visits')
              .update({
                ended_at: now,
                outcome: 'partial_advance',
                summary_notes: summaryNotes || 'Avance parcial registrado al cierre de jornada',
              })
              .eq('work_order_id', orderId)
              .eq('outcome', 'in_progress');
          }
        } catch (vErr) {
          console.warn('Nota: error cerrando visita en avance parcial:', vErr);
        }

        // 2. Pasar orden a 'pending', limpiar travel_started_at y arrived_at, conservar checklist draft
        const updatePayload = {
          status: WORK_ORDER_STATUS.PENDING,
          travel_started_at: null,
          arrived_at: null,
          updated_at: now,
        };
        const { error } = await supabase
          .from('work_orders')
          .update(updatePayload)
          .eq('id', orderId);

        if (error) throw error;
      }

      // Desvincular orden en tracker GPS
      try {
        nativeLocationTracker.setActiveOrderId(null);
      } catch (e) { }

      // Actualizar IndexedDB
      await db.workOrders.update(orderId, {
        status: WORK_ORDER_STATUS.PENDING,
        travel_started_at: null,
        arrived_at: null,
        synced: navigator.onLine,
      });

      // Actualizar Zustand store
      const currentOrder = get().currentOrder;
      if (currentOrder?.id === orderId) {
        set({
          currentOrder: {
            ...currentOrder,
            status: WORK_ORDER_STATUS.PENDING,
            travel_started_at: null,
            arrived_at: null,
          },
        });
      }

      get().refreshWorkOrders();
      return true;
    } catch (error) {
      console.error('Error registrando avance parcial:', error);
      throw error;
    }
  },

  /**
   * Pausa la Orden de Trabajo por impedimento operativo (falta de repuestos, cliente ausente, fallo humano, etc.).
   * Cierra el tramo activo con outcome 'blocked', guarda motivo y explicación, pasa la orden a 'on_hold'
   * y desvincula el GPS de la orden.
   */
  pauseWorkOrder: async (orderId, { holdReason, holdNotes }) => {
    const now = new Date().toISOString();
    try {
      let currentUserId = null;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        currentUserId = sessionData?.session?.user?.id;
      } catch (e) { }

      if (navigator.onLine) {
        // 1. Cerrar tramo activo como 'blocked'
        try {
          if (currentUserId) {
            await supabase
              .from('work_order_visits')
              .update({
                ended_at: now,
                outcome: 'blocked',
                reason_code: holdReason,
                summary_notes: holdNotes,
              })
              .eq('work_order_id', orderId)
              .eq('outcome', 'in_progress');
          }
        } catch (vErr) {
          console.warn('Nota: error cerrando visita en pausa:', vErr);
        }

        // 2. Actualizar work_orders con estado on_hold y metadata
        const updatePayload = {
          status: WORK_ORDER_STATUS.ON_HOLD,
          hold_reason: holdReason,
          hold_notes: holdNotes,
          paused_at: now,
          paused_by: currentUserId || null,
          travel_started_at: null,
          arrived_at: null,
          updated_at: now,
        };

        const { error } = await supabase
          .from('work_orders')
          .update(updatePayload)
          .eq('id', orderId);

        if (error) throw error;
      }

      // Desvincular orden en tracker GPS
      try {
        nativeLocationTracker.setActiveOrderId(null);
      } catch (e) { }

      // Actualizar IndexedDB
      await db.workOrders.update(orderId, {
        status: WORK_ORDER_STATUS.ON_HOLD,
        hold_reason: holdReason,
        hold_notes: holdNotes,
        paused_at: now,
        paused_by: currentUserId || null,
        travel_started_at: null,
        arrived_at: null,
        synced: navigator.onLine,
      });

      // Actualizar Zustand store
      const currentOrder = get().currentOrder;
      if (currentOrder?.id === orderId) {
        set({
          currentOrder: {
            ...currentOrder,
            status: WORK_ORDER_STATUS.ON_HOLD,
            hold_reason: holdReason,
            hold_notes: holdNotes,
            paused_at: now,
            paused_by: currentUserId || null,
            travel_started_at: null,
            arrived_at: null,
          },
        });
      }

      get().refreshWorkOrders();
      return true;
    } catch (error) {
      console.error('Error reportando pausa / impedimento:', error);
      throw error;
    }
  },

  /**
   * Completa una OT (después de la firma).
   */
  completeWorkOrder: async (orderId) => {
    const now = new Date().toISOString();
    try {
      if (navigator.onLine) {
        // Cerrar tramo activo como 'completed'
        try {
          await supabase
            .from('work_order_visits')
            .update({
              ended_at: now,
              outcome: 'completed',
            })
            .eq('work_order_id', orderId)
            .eq('outcome', 'in_progress');
        } catch (vErr) {
          console.warn('Nota: error cerrando visita en completeWorkOrder:', vErr);
        }

        const { error } = await supabase
          .from('work_orders')
          .update({
            status: WORK_ORDER_STATUS.COMPLETED,
            completed_at: now,
          })
          .eq('id', orderId);

        if (error) throw error;
      }

      // Desvincular orden en tracker GPS
      try {
        nativeLocationTracker.setActiveOrderId(null);
      } catch (e) { }

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
        recordId: orderId,
        data: { status: WORK_ORDER_STATUS.COMPLETED, completed_at: now },
        created_at: now,
      });
    }
  },

  /**
   * Refresca la lista desde el store actual.
   */
  /**
   * Elimina de inmediato una orden desasignada o cancelada de IndexedDB y del estado de Zustand.
   * Si la orden era la activa (currentOrder), limpia el estado y desvincula el rastreo GPS.
   */
  removeWorkOrder: async (orderId) => {
    try {
      await db.workOrders.delete(orderId);
    } catch (e) {
      console.warn('Error eliminando orden de Dexie:', e);
    }

    const current = get().currentOrder;
    const isCurrent = current?.id === orderId;

    if (isCurrent) {
      try {
        nativeLocationTracker.setActiveOrderId(null);
      } catch (e) { }
    }

    set((state) => ({
      workOrders: state.workOrders.filter((o) => o.id !== orderId),
      currentOrder: isCurrent ? null : current,
    }));

    return isCurrent;
  },

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
        let dataToUpsert = Array.isArray(item.data) ? [...item.data] : { ...item.data };

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
            if (item.table === 'photos') {
              dataToUpsert.photo_url = publicUrl;
            }
            delete dataToUpsert[blobKey];
            delete dataToUpsert.content_type;
          } catch (uploadErr) {
            console.error('Error subiendo imagen offline:', uploadErr);
            error = uploadErr;
          }
        }

        if (!error) {
          if (item.action === 'insert' || item.action === 'upsert') {
            const res = await supabase.from(item.table).upsert(dataToUpsert);
            error = res.error;
            // Tolerancia a columnas aún no migradas en Supabase (ej. caption / notes / is_survey_only)
            if (error && (error.code === '42703' || error.message?.includes('column'))) {
              console.warn(`Reintentando sync ${item.table} con campos mínimos:`, error.message);
              const sanitized = { ...dataToUpsert };
              delete sanitized.caption;
              delete sanitized.notes;
              delete sanitized.photo_url;
              delete sanitized.is_survey_only;
              const retryRes = await supabase.from(item.table).upsert(sanitized);
              error = retryRes.error;
            }
          } else if (item.action === 'update') {
            const res = await supabase.from(item.table).update(dataToUpsert).eq('id', item.recordId);
            error = res.error;
            if (error && (error.code === '42703' || error.message?.includes('column'))) {
              console.warn(`Reintentando update ${item.table} con campos mínimos:`, error.message);
              const sanitized = { ...dataToUpsert };
              delete sanitized.caption;
              delete sanitized.notes;
              delete sanitized.photo_url;
              delete sanitized.is_survey_only;
              const retryRes = await supabase.from(item.table).update(sanitized).eq('id', item.recordId);
              error = retryRes.error;
            }
          } else if (item.action === 'delete') {
            const res = await supabase.from(item.table).delete().eq('id', item.recordId);
            error = res.error;
          }
        }

        if (!error) {
          await db.pendingSync.delete(item.id);
          // Marcar como sincronizado
          if (item.table === 'work_orders') {
            await db.workOrders.update(item.recordId, { synced: true });
          }
        } else {
          console.error(`Error sync ${item.table} (${item.action}):`, error);
          const currentRetries = (item.retry_count || 0) + 1;
          if (currentRetries < 3) {
            console.warn(`Reintentando operacion (${currentRetries}/3) para pendingSync:`, item.id);
            await db.pendingSync.update(item.id, {
              retry_count: currentRetries,
              last_error: error.message || String(error)
            });
          } else {
            console.warn(`Alcanzado maximo de 3 reintentos. Moviendo operacion fallida a failedSyncLog:`, item.id);
            await db.failedSyncLog.add({
              ...item,
              id: undefined, // Let Dexie auto-increment
              error: error,
              retry_count: currentRetries,
              failed_at: new Date().toISOString()
            });
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
