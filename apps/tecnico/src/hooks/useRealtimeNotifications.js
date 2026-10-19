import { useEffect } from 'react';
import { supabase } from '@4s-clima/shared/supabase';
import toast from 'react-hot-toast';

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Función exportada para suscribir o sincronizar la suscripción Web Push
 * vinculada al usuario logueado. Requiere ser llamada desde un gesto de usuario
 * si el permiso no está otorgado.
 */
export async function registerPushSubscription(userId) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Este navegador o dispositivo no soporta Notificaciones Push.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones no concedido.');
  }

  const registration = await navigator.serviceWorker.ready;
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error('Falta configurar VITE_VAPID_PUBLIC_KEY en .env');
  }

  // Obtener suscripción existente o crear una nueva
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
  }

  const subJSON = subscription.toJSON();
  if (!subJSON.endpoint || !subJSON.keys?.p256dh || !subJSON.keys?.auth) {
    throw new Error('No se pudo generar la clave de suscripción Web Push en el dispositivo.');
  }

  const { error: upsertError } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subJSON.endpoint,
    p256dh: subJSON.keys.p256dh,
    auth: subJSON.keys.auth,
    updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });

  if (upsertError) throw upsertError;

  return subscription;
}

export function useRealtimeNotifications(profile) {
  useEffect(() => {
    if (!profile || !profile.id) return;
    const userId = profile.id;

    // Sincronización silenciosa ÚNICAMENTE si el permiso YA FUE otorgado previamente por el usuario
    if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async (registration) => {
        try {
          const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
          if (!vapidPublicKey) return;

          let subscription = await registration.pushManager.getSubscription();
          if (!subscription) {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });
          }

          const subJSON = subscription.toJSON();
          if (subJSON.endpoint && subJSON.keys) {
            await supabase.from('push_subscriptions').upsert({
              user_id: userId,
              endpoint: subJSON.endpoint,
              p256dh: subJSON.keys.p256dh,
              auth: subJSON.keys.auth,
              updated_at: new Date().toISOString()
            }, { onConflict: 'endpoint' });
          }
        } catch (err) {
          console.warn('[useRealtimeNotifications] Verificación silenciosa de push:', err);
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
          console.log('[Realtime] Nueva orden recibida:', payload);
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
          console.log('[Realtime] Orden actualizada:', payload);
          const newOrder = payload.new;
          const oldOrder = payload.old;

          let title = '';
          let body = '';

          // Detectar reasignación a este técnico
          if (oldOrder && oldOrder.assigned_to && oldOrder.assigned_to !== userId) {
            title = 'Nueva Orden Asignada';
            body = `Se te reasignó la orden ${newOrder.order_number || 'N/D'}.`;
          }
          // Detectar cancelación
          else if (newOrder.status === 'cancelled' && (!oldOrder || oldOrder.status !== 'cancelled')) {
            title = 'Orden Cancelada';
            body = `La orden ${newOrder.order_number || 'N/D'} fue cancelada.`;
          }
          // Detectar cambio de fecha/hora
          else if (
            oldOrder && (
              (newOrder.scheduled_date && newOrder.scheduled_date !== oldOrder.scheduled_date) ||
              (newOrder.scheduled_time && newOrder.scheduled_time !== oldOrder.scheduled_time)
            )
          ) {
            title = 'Reprogramación';
            body = `La orden ${newOrder.order_number || 'N/D'} fue reprogramada.`;
          }

          if (title) {
            showNotification(title, body);
          }
          window.dispatchEvent(new CustomEvent('work_orders_updated'));
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
        try {
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
        } catch (e) {
          console.warn('[Realtime] Notificación de ventana falló:', e);
        }
      }
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);
}
