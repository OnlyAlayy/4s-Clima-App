/**
 * 4S Clima - Adaptador Híbrido Inteligente de Geolocalización (Web PWA vs. Android Nativo)
 * apps/tecnico/src/services/nativeLocationTracker.js
 * 
 * Estrategia de aislamiento:
 * 1. En Web / PWA (isNativePlatform === false):
 *    - Usa 100% APIs web estándar (navigator.geolocation + Screen Wake Lock API).
 *    - Cero dependencias nativas en ejecución. Preserva compatibilidad total PWA.
 * 
 * 2. En Android Nativo (.apk con Capacitor / isNativePlatform === true):
 *    - Utiliza @capacitor-community/background-geolocation con servicio Foreground de Android.
 *    - Mantiene una notificación persistente oficial ("4S Clima Técnico: Ruta Activa")
 *      que impide que el sistema operativo mate el proceso cuando el técnico apaga la pantalla
 *      o abre otra app (Waze / Google Maps / WhatsApp).
 *    - Persiste telemetría GPS en tiempo real en la tabla public.technician_locations de Supabase.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@4s-clima/shared/supabase';

// Lazy-register del plugin de geolocalización en background
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

class NativeLocationTracker {
  constructor() {
    this.activeWatcherId = null;
    this.webWatchId = null;
    this.wakeLockSentinel = null;
    this.isTrackingActive = false;
    this.lastDbPersistTime = 0;
    this.DB_PERSIST_THROTTLE_MS = 5000; // Máximo 1 inserción en BD cada 5 segundos
  }

  /**
   * Retorna true si la app se ejecuta empaquetada como Android nativo (.apk)
   */
  isNativePlatform() {
    return Capacitor.isNativePlatform();
  }

  /**
   * Inicia el rastreo continuo de geolocalización adaptativo (Web o Nativo)
   * 
   * @param {Object} config
   * @param {string} config.orderId - ID de la orden de trabajo en viaje
   * @param {string} [config.technicianId] - UUID del técnico en Supabase auth
   * @param {string} [config.clientName] - Nombre del cliente/planta de destino
   * @param {Function} config.onLocationUpdate - Callback con coords { lat, lng, speed, heading, accuracy }
   * @param {Function} [config.onError] - Callback en caso de fallo de GPS o permisos
   */
  async startTracking({
    orderId,
    technicianId = null,
    clientName = '',
    onLocationUpdate = () => {},
    onError = () => {},
  }) {
    if (this.isTrackingActive) {
      console.log('[LocationTracker] Ya hay un rastreador activo.');
      return;
    }

    this.isTrackingActive = true;

    // ========================================================
    // CASO 1: ANDROID NATIVO (Capacitor Background Geolocation)
    // ========================================================
    if (this.isNativePlatform()) {
      console.log('[LocationTracker] Iniciando rastreo Nativo Android con Foreground Service...');
      try {
        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: '4S Clima Técnico: Ruta Activa',
            backgroundMessage: clientName 
              ? `En viaje hacia ${clientName}. Ubicación transmitida en tiempo real.`
              : 'Transmitiendo telemetría GPS al centro operativo 4S Clima.',
            requestPermissions: true,
            stale: false,
            distanceFilter: 3, // Metros mínimos de desplazamiento para reportar
          },
          async (location, error) => {
            if (error) {
              console.warn('[LocationTracker Nativo] Error de ubicación:', error);
              onError(error);
              return;
            }

            if (!location) return;

            const coords = {
              latitude: location.latitude,
              longitude: location.longitude,
              lat: location.latitude,
              lng: location.longitude,
              accuracy: Math.round(location.accuracy || 10),
              speed: location.speed ? Math.round(location.speed * 3.6) : 0, // km/h
              heading: location.bearing || null,
              altitude: location.altitude || null,
              timestamp: new Date(location.time || Date.now()).toISOString(),
              isNative: true,
            };

            // Notificar a la UI (mapa y componentes React)
            onLocationUpdate(coords);

            // Persistir periódicamente en public.technician_locations
            await this._persistLocationToSupabase({
              orderId,
              technicianId,
              coords,
            });
          }
        );

        this.activeWatcherId = watcherId;
        console.log('[LocationTracker] Watcher nativo registrado con ID:', watcherId);
      } catch (err) {
        console.error('[LocationTracker] Error al inicializar servicio nativo:', err);
        this.isTrackingActive = false;
        onError(err);
      }
      return;
    }

    // ========================================================
    // CASO 2: WEB PWA (navigator.geolocation + Screen Wake Lock)
    // ========================================================
    console.log('[LocationTracker] Iniciando rastreo Web PWA estándar...');
    
    // 1. Activar Screen Wake Lock si el navegador lo soporta (evita bloqueo con pantalla encendida)
    this._requestWebWakeLock();

    // 2. Iniciar observación HTML5 Geolocation API
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      const geoOptions = {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      };

      // Fix inicial rápido
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = this._formatWebPosition(pos);
          onLocationUpdate(coords);
          this._persistLocationToSupabase({ orderId, technicianId, coords });
        },
        (err) => {
          console.warn('[LocationTracker PWA] Error en fix inicial:', err);
        },
        geoOptions
      );

      // Watcher continuo
      this.webWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = this._formatWebPosition(pos);
          onLocationUpdate(coords);
          this._persistLocationToSupabase({ orderId, technicianId, coords });
        },
        (err) => {
          console.warn('[LocationTracker PWA] Error en watchPosition:', err);
          onError(err);
        },
        geoOptions
      );
    } else {
      console.warn('[LocationTracker PWA] El navegador no soporta Geolocation API.');
      onError(new Error('Geolocation no disponible en este navegador'));
    }
  }

  /**
   * Detiene el rastreo continuo y apaga los servicios de background
   */
  async stopTracking() {
    console.log('[LocationTracker] Deteniendo rastreo...');
    this.isTrackingActive = false;

    // Detener watcher nativo
    if (this.activeWatcherId) {
      try {
        await BackgroundGeolocation.removeWatcher({ id: this.activeWatcherId });
        console.log('[LocationTracker] Watcher nativo liberado.');
      } catch (e) {
        console.warn('[LocationTracker] Error al liberar watcher nativo:', e);
      }
      this.activeWatcherId = null;
    }

    // Detener watcher web
    if (this.webWatchId !== null && typeof navigator !== 'undefined') {
      navigator.geolocation?.clearWatch(this.webWatchId);
      this.webWatchId = null;
    }

    // Liberar Wake Lock web
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch {}
      this.wakeLockSentinel = null;
    }
  }

  /**
   * Formatea un GeolocationPosition estándar del navegador
   */
  _formatWebPosition(position) {
    const { latitude, longitude, heading, speed, accuracy, altitude } = position.coords;
    return {
      latitude,
      longitude,
      lat: latitude,
      lng: longitude,
      accuracy: Math.round(accuracy || 10),
      speed: speed ? Math.round(speed * 3.6) : 0,
      heading: heading || null,
      altitude: altitude || null,
      timestamp: new Date(position.timestamp || Date.now()).toISOString(),
      isNative: false,
    };
  }

  /**
   * Solicita bloqueo de pantalla encendida para PWA en navegadores compatibles
   */
  async _requestWebWakeLock() {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        this.wakeLockSentinel = await navigator.wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
      }
    } catch (e) {
      // Ignorar si el usuario cambió de pestaña o el navegador lo denegó
    }
  }

  /**
   * Persiste la coordenada en la tabla public.technician_locations con throttling
   */
  async _persistLocationToSupabase({ orderId, technicianId, coords }) {
    const now = Date.now();
    if (now - this.lastDbPersistTime < this.DB_PERSIST_THROTTLE_MS) {
      return;
    }
    this.lastDbPersistTime = now;

    try {
      // Determinar ID del técnico si no fue provisto
      let techId = technicianId;
      if (!techId) {
        const { data } = await supabase.auth.getSession();
        techId = data?.session?.user?.id;
      }

      if (!techId) return;

      await supabase.from('technician_locations').insert({
        technician_id: techId,
        work_order_id: orderId || null,
        latitude: coords.lat,
        longitude: coords.lng,
        accuracy: coords.accuracy || null,
        speed: coords.speed || 0,
        heading: coords.heading || null,
        platform: coords.isNative ? 'android' : 'pwa',
        recorded_at: coords.timestamp || new Date().toISOString(),
      });
    } catch (e) {
      // La persistencia en BD no debe bloquear la UI si hay corte de red momentáneo
      console.warn('[LocationTracker] Nota: punto GPS no persistido en BD (offline/red):', e?.message);
    }
  }
}

export const nativeLocationTracker = new NativeLocationTracker();
export default nativeLocationTracker;
