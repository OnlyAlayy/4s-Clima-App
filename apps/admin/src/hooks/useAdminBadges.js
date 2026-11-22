import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@4s-clima/shared/supabase';
import { getArgentinaDate } from '@4s-clima/shared';

/**
 * Hook dedicado para contadores en tiempo real (badges del Sidebar) y avisos sutiles (toasts).
 * Realiza consultas SELECT livianas ({ count: 'exact', head: true }) sin traer payloads innecesarios.
 * Se suscribe a postgres_changes en Realtime para leads, work_orders y technician_shifts.
 */
export function useAdminBadges() {
  const [badges, setBadges] = useState({
    leads: 0,
    workOrders: 0,
    attendance: 0,
  });

  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  // Disparar aviso visual no invasivo con auto-cierre
  const showToast = useCallback((notification) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({
      id: Date.now(),
      ...notification,
    });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 6500);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(null);
  }, []);

  // Carga paralela de contadores livianos
  const loadBadges = useCallback(async () => {
    try {
      const todayStr = getArgentinaDate(new Date());

      // 1. Leads nuevos / sin atender
      const leadsPromise = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .in('estado', ['pendiente', 'nuevo', 'new']);

      // 2. Órdenes para revisar o facturar:
      // a) Completadas sin facturar
      const unbilledOrdersPromise = supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .or('payment_status.is.null,payment_status.eq.unbilled');

      // b) Solicitudes QR pendientes
      const qrOrdersPromise = supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .ilike('observations', '%Solicitud QR%');

      // 3. Asistencia / Horas extras y anomalías pendientes:
      // a) Turnos con horas extras o rectificaciones pendientes
      const overtimeShiftsPromise = supabase
        .from('technician_shifts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .is('settlement_id', null)
        .or('overtime_approved.eq.false,custom_overtime_hours.gt.0');

      // b) Turnos abiertos anómalos de días anteriores
      const anomalousShiftsPromise = supabase
        .from('technician_shifts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .lt('shift_date', todayStr);

      const [
        leadsRes,
        unbilledRes,
        qrRes,
        otRes,
        anomRes
      ] = await Promise.all([
        leadsPromise,
        unbilledOrdersPromise,
        qrOrdersPromise,
        overtimeShiftsPromise,
        anomalousShiftsPromise,
      ]);

      const leadsCount = leadsRes?.count || 0;
      const workOrdersCount = (unbilledRes?.count || 0) + (qrRes?.count || 0);
      const attendanceCount = (otRes?.count || 0) + (anomRes?.count || 0);

      setBadges({
        leads: leadsCount,
        workOrders: workOrdersCount,
        attendance: attendanceCount,
      });
    } catch (err) {
      console.warn('[useAdminBadges] Error actualizando contadores:', err);
    }
  }, []);

  useEffect(() => {
    loadBadges();

    // Suscripción Realtime a las 3 tablas críticas
    const channel = supabase
      .channel('admin-sidebar-badges-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        (payload) => {
          loadBadges();
          if (payload.eventType === 'INSERT') {
            const row = payload.new || {};
            showToast({
              type: 'lead',
              title: 'Nuevo Lead Comercial',
              message: row.nombre
                ? `${row.nombre}${row.empresa ? ` · ${row.empresa}` : ''}`
                : 'Nueva consulta ingresada desde la web corporativa',
              link: '/leads',
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        (payload) => {
          loadBadges();
          if (payload.eventType === 'INSERT') {
            const row = payload.new || {};
            if (row.observations && row.observations.includes('Solicitud QR')) {
              showToast({
                type: 'order',
                title: 'Nueva Solicitud por QR',
                message: `Orden ${row.order_number || ''} ingresada por cliente`,
                link: `/ordenes/${row.id}`,
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const newRow = payload.new || {};
            const oldRow = payload.old || {};
            if (newRow.status === 'completed' && oldRow.status !== 'completed') {
              showToast({
                type: 'order',
                title: 'Orden Finalizada por Técnico',
                message: `Orden ${newRow.order_number || ''} completada, lista para revisar`,
                link: `/ordenes/${newRow.id}`,
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technician_shifts' },
        (payload) => {
          loadBadges();
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new || {};
            if (Number(row.custom_overtime_hours) > 0 || row.overtime_approved === false) {
              showToast({
                type: 'attendance',
                title: 'Horas Extras Registradas',
                message: `Jornada del ${row.shift_date || 'día'} con horas extras para revisar`,
                link: '/asistencia',
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [loadBadges, showToast]);

  return {
    badges,
    toast,
    dismissToast,
    refreshBadges: loadBadges,
  };
}
