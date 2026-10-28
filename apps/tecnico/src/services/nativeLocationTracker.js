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
import { Geolocation } from '@capacitor/geolocation';
import { supabase } from '@4s-clima/shared/supabase';

// Lazy-register del plugin de geolocalización en background
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

class NativeLocationTracker {
  constructor() {
    this.activeWatcherId = null;
    this.webWatchId = null;
    this.wakeLockSentinel = null;
    this.isTrackingActive = false;
    this.isShiftActive = false;
    this.currentOrderId = null;
    this.currentTechnicianId = null;
    this.locationListeners = new Set();
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
   * Solicita permisos de ubicación al sistema operativo de forma híbrida:
   * - En Android APK: solicita permisos nativos vía @capacitor/geolocation (ACCESS_FINE_LOCATION, etc.)
   * - En Web PWA: no interrumpe el flujo web nativo
   */
  async requestPermissions() {
    if (this.isNativePlatform()) {
      try {
        const status = await Geolocation.requestPermissions();
        return status.location === 'granted';
      } catch (e) {
        console.warn('[LocationTracker] Error solicitando permisos nativos de GPS:', e);
        return false;
      }
    }
    return true;
  }

  /**
   * Obtiene la posición actual de forma híbrida e instantánea:
   * - En Android APK: usa Geolocation.getCurrentPosition() evitando el diálogo web de Chrome.
   * - En Web PWA: usa navigator.geolocation.getCurrentPosition()
   */
  async getCurrentPosition(options = { enableHighAccuracy: true, timeout: 10000 }) {
    if (this.isNativePlatform()) {
      try {
        await this.requestPermissions();
        const pos = await Geolocation.getCurrentPosition(options);
        const formatted = this._formatWebPosition(pos);
        formatted.isNative = true;
        return formatted;
      } catch (err) {
        console.warn('[LocationTracker] Error obteniendo posición nativa:', err);
        throw err;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(this._formatWebPosition(pos)),
          (err) => reject(err),
          options
        );
      });
    }

    throw new Error('Geolocalización no disponible en este dispositivo');
  }

  /**
   * Actualiza la orden activa en el tracker sin interrumpir el rastreo de jornada
   */
  setActiveOrderId(orderId) {
    this.currentOrderId = orderId || null;
  }

  /**
   * Declara si la jornada laboral del técnico está activa
   */
  setShiftActive(isActive, technicianId = null) {
    this.isShiftActive = !!isActive;
    if (technicianId) {
      this.currentTechnicianId = technicianId;
    }
  }

  /**
   * Inicia el rastreo continuo de geolocalización adaptativo (Web o Nativo)
   * 
   * @param {Object} config
   * @param {string} [config.orderId] - ID de la orden de trabajo en viaje
   * @param {string} [config.technicianId] - UUID del técnico en Supabase auth
   * @param {string} [config.clientName] - Nombre del cliente/planta de destino
   * @param {Function} [config.onLocationUpdate] - Callback con coords { lat, lng, speed, heading, accuracy }
   * @param {Function} [config.onError] - Callback en caso de fallo de GPS o permisos
   */
  async startTracking({
    orderId = null,
    technicianId = null,
    clientName = '',
    onLocationUpdate = null,
    onError = () => {},
  } = {}) {
    if (orderId !== undefined) {
      this.currentOrderId = orderId;
    }
    if (technicianId) {
      this.currentTechnicianId = technicianId;
    }
    if (onLocationUpdate && typeof onLocationUpdate === 'function') {
      this.locationListeners.add(onLocationUpdate);
    }

    if (this.isTrackingActive) {
      console.log('[LocationTracker] Rastreo ya activo en segundo plano. Contexto de orden actualizado:', this.currentOrderId);
      return;
    }

    this.isTrackingActive = true;

    // Helper interno para notificar a todos los listeners registrados
    const broadcastCoords = (coords) => {
      this.locationListeners.forEach((fn) => {
        try {
          fn(coords);
        } catch (e) {
          console.warn('[LocationTracker] Error en listener de ubicación:', e);
        }
      });
    };

    // ========================================================
    // CASO 1: ANDROID NATIVO (Capacitor Background Geolocation)
    // ========================================================
    if (this.isNativePlatform()) {
      console.log('[LocationTracker] Iniciando rastreo Nativo Android con Foreground Service...');
      try {
        // Solicitar permisos nativos explícitamente sin pasar por el WebView
        await this.requestPermissions();

        // Fix inicial instantáneo usando Geolocation nativo para feedback inmediato
        try {
          const initialPos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 });
          if (initialPos?.coords) {
            const initialCoords = this._formatWebPosition(initialPos);
            initialCoords.isNative = true;
            broadcastCoords(initialCoords);
            this._persistLocationToSupabase({ orderId: this.currentOrderId, technicianId: this.currentTechnicianId, coords: initialCoords });
          }
        } catch (e) {
          console.warn('[LocationTracker Nativo] Fix inicial omitido:', e);
        }

        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: '4S Clima: Jornada de Servicio Activa',
            backgroundMessage: clientName 
              ? `En servicio hacia ${clientName}. Ubicación transmitida en tiempo real.`
              : 'Transmitiendo telemetría GPS continua de jornada laboral.',
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

            // Notificar a todos los componentes React
            broadcastCoords(coords);

            // Persistir periódicamente en public.technician_locations
            await this._persistLocationToSupabase({
              orderId: this.currentOrderId,
              technicianId: this.currentTechnicianId,
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
          broadcastCoords(coords);
          this._persistLocationToSupabase({ orderId: this.currentOrderId, technicianId: this.currentTechnicianId, coords });
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
          broadcastCoords(coords);
          this._persistLocationToSupabase({ orderId: this.currentOrderId, technicianId: this.currentTechnicianId, coords });
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
   * Detiene el rastreo continuo y apaga los servicios de background.
   * Si force es false y la jornada laboral está activa, solo desvincula la orden
   * sin detener el envío global de coordenadas.
   */
  async stopTracking(force = false) {
    if (!force && this.isShiftActive) {
      console.log('[LocationTracker] Jornada laboral activa: se desvincula orden pero continúa el rastreo global de turno.');
      this.currentOrderId = null;
      return;
    }

    console.log('[LocationTracker] Deteniendo rastreo por completo (Fin de jornada / Logout)...');
    this.isTrackingActive = false;
    this.isShiftActive = false;
    this.currentOrderId = null;
    this.locationListeners.clear();

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
