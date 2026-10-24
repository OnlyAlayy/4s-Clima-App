import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { registerPushSubscription } from '../hooks/useRealtimeNotifications';
import toast from 'react-hot-toast';

export const NOTIFICATION_CHANNEL_ID = '4s_clima_alerts';

class HybridNotifications {
  constructor() {
    this.channelInitialized = false;
    this.actionListenerRegistered = false;
  }

  isNativePlatform() {
    return Capacitor.isNativePlatform();
  }

  /**
   * Obtiene el estado actual del permiso de notificaciones de forma adaptativa.
   * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unsupported'>}
   */
  async checkPermission() {
    if (this.isNativePlatform()) {
      try {
        const perm = await LocalNotifications.checkPermissions();
        return perm.display; // 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
      } catch (err) {
        console.warn('[HybridNotifications] Error al verificar permisos nativos:', err);
        return 'prompt';
      }
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission; // 'granted' | 'denied' | 'default'
    }

    return 'unsupported';
  }

  /**
   * Solicita el permiso de notificaciones:
   * - En Android APK: solicita POST_NOTIFICATIONS nativo y crea el canal de sonido/vibración.
   * - En Web PWA: solicita Notification.requestPermission() y registra PushManager + VAPID.
   */
  async requestPermission(userId) {
    if (this.isNativePlatform()) {
      try {
        const result = await LocalNotifications.requestPermissions();
        if (result.display === 'granted') {
          await this._ensureNativeChannel();
          this._registerActionListener();
        }
        return {
          status: result.display,
          isNative: true,
        };
      } catch (err) {
        console.error('[HybridNotifications] Error solicitando permisos nativos:', err);
        throw new Error('No se pudo solicitar el permiso de notificación en Android');
      }
    }

    // Flujo Web PWA estándar
    if (!userId) {
      throw new Error('Se requiere el ID de usuario para registrar la suscripción Web Push');
    }

    const sub = await registerPushSubscription(userId);
    return {
      status: typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'granted',
      isNative: false,
      subscription: sub,
    };
  }

  /**
   * Dispara una notificación inmediata de alta prioridad (sonido y vibración):
   * - En Android APK: genera una LocalNotification nativa con el canal de alta importancia.
   * - En Web PWA: usa ServiceWorker showNotification o Notification API de ventana.
   * Siempre emite un toast en pantalla para feedback inmediato dentro de la app.
   */
  async scheduleNotification({ title, body, data = {} }) {
    // 1. Toast visual dentro de la interfaz
    toast.success(`${title}\n${body}`, {
      duration: 5000,
      style: {
        borderRadius: '16px',
        background: '#ffffff',
        color: '#0f172a',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        padding: '16px',
        fontWeight: '600',
      },
    });

    // 2. Disparo Nativo en Android APK
    if (this.isNativePlatform()) {
      try {
        await this._ensureNativeChannel();
        const notificationId = Math.floor(Math.random() * 900000) + 100000;
        await LocalNotifications.schedule({
          notifications: [
            {
              id: notificationId,
              title: title || '4S Clima Técnico',
              body: body || '',
              channelId: NOTIFICATION_CHANNEL_ID,
              schedule: { at: new Date(Date.now() + 50) },
              smallIcon: 'ic_launcher_round',
              iconColor: '#2563eb',
              extra: data,
            },
          ],
        });
      } catch (e) {
        console.warn('[HybridNotifications] Falló schedule nativo:', e);
      }
      return;
    }

    // 3. Disparo Web PWA
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.showNotification) {
            reg.showNotification(title, {
              body,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              vibrate: [200, 100, 200, 100, 200],
              data,
            });
            return;
          }
        }

        const notif = new Notification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          vibrate: [200, 100, 200],
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (e) {
        console.warn('[HybridNotifications] Falló notificación web:', e);
      }
    }
  }

  /**
   * Crea o asegura el canal nativo de notificaciones de Android con sonido y vibración.
   */
  async _ensureNativeChannel() {
    if (this.channelInitialized || !this.isNativePlatform()) return;
    try {
      await LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNEL_ID,
        name: 'Alertas de Órdenes 4S Clima',
        description: 'Notificaciones prioritarias con sonido y vibración para asignación de órdenes',
        importance: 5, // NotificationManager.IMPORTANCE_HIGH
        visibility: 1, // NotificationCompat.VISIBILITY_PUBLIC
        vibration: true,
        lights: true,
        lightColor: '#2563eb',
      });
      this.channelInitialized = true;
    } catch (e) {
      console.warn('[HybridNotifications] Error al crear canal nativo:', e);
    }
  }

  /**
   * Escucha el clic sobre la notificación nativa para enfocar la app.
   */
  _registerActionListener() {
    if (this.actionListenerRegistered || !this.isNativePlatform()) return;
    try {
      LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
        console.log('[HybridNotifications] Usuario tocó la notificación nativa:', notification);
        window.focus();
        window.dispatchEvent(new CustomEvent('work_orders_updated'));
      });
      this.actionListenerRegistered = true;
    } catch (e) {
      console.warn('[HybridNotifications] Error registrando listener de clic:', e);
    }
  }
}

export const hybridNotifications = new HybridNotifications();
export default hybridNotifications;
