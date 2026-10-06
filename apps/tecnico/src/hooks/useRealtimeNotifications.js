import { useEffect } from 'react';
import { supabase } from '@4s-clima/shared/supabase';
import toast from 'react-hot-toast';

export function useRealtimeNotifications(profile) {
  useEffect(() => {
    // Si no hay perfil logueado, no suscribir
    if (!profile || !profile.id) return;

    // Solicitar permiso para notificaciones del navegador (si el navegador lo soporta)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const userId = profile.id;

    // Canal de Realtime exclusivo para este usuario
    const channel = supabase
      .channel(`work_orders_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'work_orders',
          filter: `assigned_to=eq.${userId}`
        },
        (payload) => {
          console.log('Nueva orden recibida por realtime:', payload);
          const newOrder = payload.new;

          // 1. Mostrar Toast en la app
          toast.success(
            `¡Nueva asignación!\nOT: ${newOrder.order_number || 'Pendiente'}`, 
            { 
              duration: 5000,
              icon: '🚀',
              style: {
                borderRadius: '16px',
                background: '#fff',
                color: '#1e293b',
                boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
                padding: '16px',
                fontWeight: '600'
              }
            }
          );

          // 2. Si tiene permisos, mostrar Notificación Nativa (sirve si minimizó la PWA pero el tab sigue abierto)
          if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('Nueva Orden de Trabajo', {
              body: `Te han asignado la OT ${newOrder.order_number || 'Pendiente'}.`,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              vibrate: [200, 100, 200]
            });

            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);
}
