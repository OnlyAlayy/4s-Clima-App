import { useEffect } from 'react';
import { supabase } from '@4s-clima/shared/supabase';
import toast from 'react-hot-toast';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useRealtimeNotifications(profile) {
  useEffect(() => {
    if (!profile || !profile.id) return;
    const userId = profile.id;

    // Solicitar permiso para notificaciones
    if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(async (permission) => {
        if (permission === 'granted' && 'serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
            
            // Suscribirse al Push Service del navegador (FCM/Apple)
            const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!vapidPublicKey) {
               console.warn("Falta VITE_VAPID_PUBLIC_KEY en .env");
               return;
            }

            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });

            // Parsear la suscripción y guardarla en Supabase
            const subJSON = subscription.toJSON();
            
            const { error: upsertError } = await supabase.from('push_subscriptions').upsert({
              user_id: userId,
              endpoint: subJSON.endpoint,
              p256dh: subJSON.keys.p256dh,
              auth: subJSON.keys.auth
            }, { onConflict: 'endpoint' });
            
            if (upsertError) throw upsertError;

            console.log("Web Push Subscription registrada en DB");
          } catch (err) {
            console.error('Error registrando Web Push:', err);
            toast.error("Error registrando notificaciones: " + err.message);
          }
        }
      });
    }

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
          showNotification(
            'Nueva Orden de Trabajo',
            `¡Nueva asignación! OT: ${newOrder.order_number || 'Pendiente'}`
          );
          window.dispatchEvent(new CustomEvent('work_orders_updated'));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'work_orders',
          filter: `assigned_to=eq.${userId}`
        },
        (payload) => {
          console.log('Orden actualizada por realtime:', payload);
          const newOrder = payload.new;
          const oldOrder = payload.old;
          
          if (!oldOrder) return; // Si no hay old (a veces supabase no manda old si no hay REPLICA IDENTITY FULL, pero por defecto envia el id)
          
          let title = '';
          let body = '';

          // Detectar cancelación
          if (newOrder.status === 'cancelled' && oldOrder.status !== 'cancelled') {
            title = 'Orden Cancelada';
            body = `La orden ${newOrder.order_number || 'N/D'} fue cancelada.`;
          }
          // Detectar cambio de fecha/hora
          else if (
            (newOrder.scheduled_date && newOrder.scheduled_date !== oldOrder.scheduled_date) ||
            (newOrder.scheduled_time && newOrder.scheduled_time !== oldOrder.scheduled_time)
          ) {
            title = 'Reprogramación';
            body = `La orden ${newOrder.order_number || 'N/D'} fue reprogramada.`;
          }

          if (title) {
            showNotification(title, body);
            window.dispatchEvent(new CustomEvent('work_orders_updated'));
          }
        }
      )
      .subscribe();

    function showNotification(title, body) {
      toast.success(`${title}\n${body}`, { 
        duration: 5000,
        style: {
          borderRadius: '16px',
          background: '#fff',
          color: '#1e293b',
          boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
          padding: '16px',
          fontWeight: '600'
        }
      });

      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body,
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);
}
