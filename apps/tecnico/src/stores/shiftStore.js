import { create } from 'zustand';
import { supabase } from '@4s-clima/shared/supabase';
import { nativeLocationTracker } from '../services/nativeLocationTracker';

export const useShiftStore = create((set, get) => ({
  activeShift: null,
  todayShift: null,
  isLoading: true,
  isActionLoading: false,
  error: null,

  /**
   * Inicializa la comprobación de jornada laboral para el técnico.
   * Si detecta un turno 'active', restaura automáticamente el servicio
   * de geolocalización continua en segundo plano.
   */
  initShift: async (technicianId) => {
    if (!technicianId) {
      set({ activeShift: null, todayShift: null, isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const todayStr = new Date().toISOString().slice(0, 10);

      // 1. Consultar si hay algún turno activo hoy o el último registrado
      const { data, error } = await supabase
        .from('technician_shifts')
        .select('*')
        .eq('technician_id', technicianId)
        .order('check_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data && data.status === 'active') {
        set({ activeShift: data, todayShift: data, isLoading: false });
        nativeLocationTracker.setShiftActive(true, technicianId);
        // Encender watcher global de fondo
        nativeLocationTracker.startTracking({
          technicianId,
          clientName: 'Jornada Laboral',
        });
      } else {
        const isToday = data && (data.shift_date === todayStr || data.check_in_at?.startsWith(todayStr));
        set({
          activeShift: null,
          todayShift: isToday ? data : null,
          isLoading: false,
        });
        nativeLocationTracker.setShiftActive(false);
      }
    } catch (err) {
      console.warn('[ShiftStore] Error inicializando jornada:', err);
      set({ isLoading: false, error: err.message });
    }
  },

  /**
   * Registra el inicio de jornada (Check-in) y activa el rastreo continuo
   */
  checkIn: async (technicianId) => {
    if (!technicianId) throw new Error('ID de técnico no válido');

    set({ isActionLoading: true, error: null });

    try {
      // 1. Permisos y Coordenadas iniciales
      let initialLat = null;
      let initialLng = null;

      try {
        await nativeLocationTracker.requestPermissions();
        const pos = await nativeLocationTracker.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 6000,
        });
        if (pos) {
          initialLat = pos.lat || pos.latitude;
          initialLng = pos.lng || pos.longitude;
        }
      } catch (geoErr) {
        console.warn('[ShiftStore] No se pudo obtener fix inicial para check-in:', geoErr);
      }

      const todayStr = new Date().toISOString().slice(0, 10);

      // 2. Insertar turno en public.technician_shifts
      const { data, error } = await supabase
        .from('technician_shifts')
        .insert({
          technician_id: technicianId,
          shift_date: todayStr,
          check_in_at: new Date().toISOString(),
          check_in_lat: initialLat,
          check_in_lng: initialLng,
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // 3. Activar rastreo continuo en el tracker
      set({ activeShift: data, todayShift: data, isActionLoading: false });
      nativeLocationTracker.setShiftActive(true, technicianId);
      await nativeLocationTracker.startTracking({
        technicianId,
        clientName: 'Jornada Laboral',
      });

      return data;
    } catch (err) {
      console.error('[ShiftStore] Error al realizar check-in:', err);
      set({ isActionLoading: false, error: err.message });
      throw err;
    }
  },

  /**
   * Finaliza la jornada laboral (Check-out) y detiene el rastreo continuo
   */
  checkOut: async () => {
    const { activeShift } = get();
    if (!activeShift?.id) {
      console.warn('[ShiftStore] No hay turno activo para finalizar');
      return null;
    }

    set({ isActionLoading: true, error: null });

    try {
      // 1. Obtener última coordenada de egreso
      let finalLat = null;
      let finalLng = null;

      try {
        const pos = await nativeLocationTracker.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 5000,
        });
        if (pos) {
          finalLat = pos.lat || pos.latitude;
          finalLng = pos.lng || pos.longitude;
        }
      } catch (geoErr) {
        console.warn('[ShiftStore] No se pudo obtener fix final para check-out:', geoErr);
      }

      // 2. Actualizar registro en public.technician_shifts
      const { data, error } = await supabase
        .from('technician_shifts')
        .update({
          check_out_at: new Date().toISOString(),
          check_out_lat: finalLat,
          check_out_lng: finalLng,
          status: 'completed',
        })
        .eq('id', activeShift.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // 3. Detener tracker GPS por completo
      await nativeLocationTracker.stopTracking(true);
      nativeLocationTracker.setShiftActive(false);

      set({ activeShift: null, todayShift: data, isActionLoading: false });
      return data;
    } catch (err) {
      console.error('[ShiftStore] Error al realizar check-out:', err);
      set({ isActionLoading: false, error: err.message });
      throw err;
    }
  },
}));
