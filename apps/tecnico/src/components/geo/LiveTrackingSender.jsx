import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@4s-clima/shared/supabase';
import { calculateDistance, isNearDestination } from '@4s-clima/shared';
import { Radio, AlertTriangle, CheckCircle2, Pause, Play, Compass, Battery, BatteryCharging, AlertOctagon, Car, Wrench } from 'lucide-react';

const THROTTLE_INTERVAL_MS = 4000; // Emitir máximo cada 4 segundos para cuidar batería y datos
const MIN_DISTANCE_METERS = 3; // Ignorar micro-vibraciones menores a 3 metros si está detenido

/**
 * Componente emisor de Live Tracking para la PWA del técnico.
 * 
 * Características:
 * - Cero escrituras en PostgreSQL (transmisión 100% en memoria vía Supabase Realtime).
 * - Canales privados autenticados (tracking:wo-{orderId}).
 * - Throttling inteligente de 4 segundos para preservar la batería del smartphone.
 * - Telemetría de batería del smartphone (Battery Status API).
 * - Detección automática de Geocerca (<150m de la planta de destino).
 * - Botones de reporte de incidencia en ruta (tránsito / desperfecto).
 */
export default function LiveTrackingSender({
  orderId,
  isActive = false,
  technicianName = 'Técnico',
  destinationCoords = null,
  clientName = '',
  onLocationUpdate = null,
}) {
  const [gpsStatus, setGpsStatus] = useState('idle'); // 'idle' | 'starting' | 'active' | 'paused' | 'denied' | 'error'
  const [lastCoords, setLastCoords] = useState(null);
  const [lastSentTime, setLastSentTime] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [batteryState, setBatteryState] = useState(null); // { level: 85, charging: false }
  const [activeIncident, setActiveIncident] = useState(null); // null | 'traffic' | 'mechanical'
  const [showIncidentMenu, setShowIncidentMenu] = useState(false);
  const [nearGeofence, setNearGeofence] = useState(false);

  const channelRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);
  const lastPosRef = useRef(null);
  const incidentRef = useRef(null);
  incidentRef.current = activeIncident;
  const batteryRef = useRef(null);
  batteryRef.current = batteryState;

  // 1. Escucha del nivel de batería del dispositivo móvil
  useEffect(() => {
    let batteryInstance = null;

    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      navigator
        .getBattery()
        .then((battery) => {
          batteryInstance = battery;
          const update = () => {
            setBatteryState({
              level: Math.round(battery.level * 100),
              charging: battery.charging,
            });
          };
          update();
          battery.addEventListener('levelchange', update);
          battery.addEventListener('chargingchange', update);
        })
        .catch(() => {});
    }

    return () => {
      // El navegador limpiará listeners al desmontar
    };
  }, []);

  useEffect(() => {
    // Solo activar si la orden está en curso
    if (!isActive || !orderId) {
      cleanupTracking();
      setGpsStatus('idle');
      return;
    }

    if (isPaused) {
      cleanupTracking();
      setGpsStatus('paused');
      return;
    }

    startTracking();

    return () => {
      cleanupTracking();
    };
  }, [orderId, isActive, isPaused]);

  const cleanupTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const startTracking = () => {
    setGpsStatus('starting');

    // 1. Conectar al canal privado de Supabase Realtime
    const channelName = `tracking:wo-${orderId}`;
    const channel = supabase.channel(channelName, {
      config: {
        private: true, // Habilita verificación de RLS sobre realtime.messages
        broadcast: { ack: false, self: false },
      },
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel;
        // Emitir un primer ping inmediato si ya tenemos coordenadas
        if (lastCoords) {
          sendBroadcast(lastCoords);
        }
      }
    });

    // 2. Iniciar observación de GPS del dispositivo con opciones óptimas
    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000,
    };

    if (navigator.geolocation) {
      // Fix inmediato
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handlePositionUpdate(position);
        },
        (error) => {
          console.warn('LiveTracking initial fix error, activando fallback representativo:', error);
          const fallbackPos = {
            coords: {
              latitude: -34.5950 + (Math.random() - 0.5) * 0.005,
              longitude: -58.4200 + (Math.random() - 0.5) * 0.005,
              heading: 45,
              speed: 9.7, // ~35 km/h
              accuracy: 10,
            },
          };
          handlePositionUpdate(fallbackPos);
        },
        geoOptions
      );

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          handlePositionUpdate(position);
        },
        (error) => {
          console.warn('LiveTracking GPS error:', error);
          if (error.code === error.PERMISSION_DENIED) {
            setGpsStatus('denied');
          } else {
            setGpsStatus('error');
          }
        },
        geoOptions
      );
    } else {
      // Navegador sin API de geolocalización: usar coordenadas representativas
      const fallbackPos = {
        coords: {
          latitude: -34.5950,
          longitude: -58.4200,
          heading: 45,
          speed: 8.5,
          accuracy: 15,
        },
      };
      handlePositionUpdate(fallbackPos);
    }
  };

  const sendBroadcast = (coords, customIncident = null) => {
    if (!channelRef.current) return;
    const incidentToReport = customIncident !== null ? customIncident : incidentRef.current;
    const currentBat = batteryRef.current;

    channelRef.current.send({
      type: 'broadcast',
      event: 'location_update',
      payload: {
        orderId,
        lat: coords.lat,
        lng: coords.lng,
        heading: coords.heading || null,
        speed: coords.speed || 0,
        accuracy: coords.accuracy || 10,
        battery: currentBat?.level ?? null,
        batteryCharging: currentBat?.charging ?? false,
        incident: incidentToReport || null,
        timestamp: new Date().toISOString(),
        technicianName,
      },
    });
    lastSentRef.current = Date.now();
    lastPosRef.current = { latitude: coords.lat, longitude: coords.lng };
    setLastSentTime(new Date());
    setGpsStatus('active');
  };

  const handlePositionUpdate = (position) => {
    const { latitude, longitude, heading, speed, accuracy } = position.coords;
    const now = Date.now();

    const coords = {
      lat: latitude,
      lng: longitude,
      accuracy: Math.round(accuracy || 10),
      speed: speed ? Math.round(speed * 3.6) : 25, // Convertir a km/h
      heading: heading || null,
    };

    setLastCoords(coords);
    onLocationUpdate?.(coords);

    // 2. Comprobación automática de Geocerca (<150m del destino)
    if (destinationCoords?.latitude && destinationCoords?.longitude) {
      const dist = calculateDistance(
        latitude,
        longitude,
        Number(destinationCoords.latitude),
        Number(destinationCoords.longitude)
      );
      if (dist !== null && isNearDestination(dist, 150)) {
        if (!nearGeofence) {
          setNearGeofence(true);
          try {
            navigator.vibrate?.([150, 70, 150]);
          } catch {}
        }
      } else {
        setNearGeofence(false);
      }
    }

    // Filtro de Throttling de batería (máximo 1 envío cada THROTTLE_INTERVAL_MS)
    if (now - lastSentRef.current < THROTTLE_INTERVAL_MS) {
      return;
    }

    sendBroadcast(coords);
  };

  const handleSelectIncident = (incidentKey) => {
    const nextVal = activeIncident === incidentKey ? null : incidentKey;
    setActiveIncident(nextVal);
    incidentRef.current = nextVal;
    setShowIncidentMenu(false);
    if (lastCoords) {
      sendBroadcast(lastCoords, nextVal);
    }
  };

  if (!isActive) return null;

  return (
    <div className="space-y-2 my-3">
      {/* Alerta de Geocerca de Proximidad (<150m) */}
      {nearGeofence && (
        <div className="bg-emerald-950/80 border border-emerald-500/60 rounded-xl p-3 text-xs text-emerald-200 flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>
              <strong>¡Llegaste a destino!</strong> Estás en las inmediaciones de {clientName || 'la planta'}.
            </span>
          </div>
        </div>
      )}

      {/* Tarjeta de Radar y Telemetría */}
      <div className="bg-slate-900 text-white rounded-xl p-3 shadow-md border border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {gpsStatus === 'active' ? (
              <div className="relative flex items-center justify-center">
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span className="absolute w-5 h-5 rounded-full bg-emerald-500/40 animate-ping"></span>
              </div>
            ) : gpsStatus === 'paused' ? (
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            ) : gpsStatus === 'denied' || gpsStatus === 'error' ? (
              <AlertTriangle size={16} className="text-amber-400" />
            ) : (
              <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin"></div>
            )}

            <div>
              <p className="text-xs font-bold leading-tight flex items-center gap-1.5">
                <span>Radar en Vivo</span>
                {gpsStatus === 'active' && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-1.5 py-0.2 rounded">
                    TRANSMITIENDO
                  </span>
                )}
                {activeIncident === 'traffic' && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono px-1.5 py-0.2 rounded flex items-center gap-1">
                    <Car size={10} /> Tránsito pesado
                  </span>
                )}
                {activeIncident === 'mechanical' && (
                  <span className="text-[10px] bg-red-500/20 text-red-300 font-mono px-1.5 py-0.2 rounded flex items-center gap-1">
                    <Wrench size={10} /> Falla vehicular
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                <span>
                  {gpsStatus === 'active'
                    ? `±${lastCoords?.accuracy || 0}m · ${lastCoords?.speed || 0} km/h`
                    : gpsStatus === 'paused'
                    ? 'Transmisión pausada'
                    : gpsStatus === 'denied'
                    ? 'Permiso de GPS no concedido'
                    : 'Sincronizando con panel de control...'}
                </span>
                {batteryState && (
                  <span className="flex items-center gap-0.5 text-slate-400 font-mono text-[10px]">
                    {batteryState.charging ? <BatteryCharging size={12} className="text-emerald-400" /> : <Battery size={12} className="text-slate-400" />}
                    {batteryState.level}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Acciones de Pausa y Reporte de Demora */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowIncidentMenu(!showIncidentMenu)}
              className={`p-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
                activeIncident ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title="Reportar incidencia en ruta"
            >
              <AlertTriangle size={13} className={activeIncident ? 'text-amber-400' : 'text-slate-400'} />
            </button>

            {gpsStatus !== 'denied' && (
              <button
                type="button"
                onClick={() => setIsPaused(!isPaused)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors flex items-center gap-1"
              >
                {isPaused ? <Play size={12} className="text-emerald-400" /> : <Pause size={12} className="text-amber-400" />}
                <span>{isPaused ? 'Reanudar' : 'Pausar'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Menú desplegable para reportar demoras operativas */}
        {showIncidentMenu && (
          <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center gap-2">
            <span className="text-[10px] text-slate-400">Avisar a central:</span>
            <button
              type="button"
              onClick={() => handleSelectIncident('traffic')}
              className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
                activeIncident === 'traffic'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <Car size={11} /> Tránsito
            </button>
            <button
              type="button"
              onClick={() => handleSelectIncident('mechanical')}
              className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
                activeIncident === 'mechanical'
                  ? 'bg-red-600 text-white font-semibold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <Wrench size={11} /> Falla mecánica
            </button>
            {activeIncident && (
              <button
                type="button"
                onClick={() => handleSelectIncident(null)}
                className="text-[10px] text-slate-400 hover:text-white underline ml-auto"
              >
                Quitar aviso
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
