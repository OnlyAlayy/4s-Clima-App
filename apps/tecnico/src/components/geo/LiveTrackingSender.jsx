import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@4s-clima/shared/supabase';
import { Radio, AlertTriangle, CheckCircle2, Pause, Play, Compass } from 'lucide-react';

const THROTTLE_INTERVAL_MS = 4000; // Emitir máximo cada 4 segundos para cuidar batería y datos
const MIN_DISTANCE_METERS = 3; // Ignorar micro-vibraciones menores a 3 metros si está detenido

/**
 * Componente emisor de Live Tracking para la PWA del técnico.
 * 
 * Características:
 * - Cero escrituras en PostgreSQL (transmisión 100% en memoria vía Supabase Realtime).
 * - Canales privados autenticados (tracking:wo-{orderId}).
 * - Throttling inteligente de 4 segundos para preservar la batería del smartphone.
 * - Manejo robusto de errores de permisos y desconexión sin bloquear el trabajo.
 * 
 * @param {string} orderId - ID de la orden de trabajo
 * @param {boolean} isActive - Solo transmite cuando la orden está en progreso ('in_progress')
 * @param {string} technicianName - Nombre del técnico para telemetría
 */
export default function LiveTrackingSender({ orderId, isActive = false, technicianName = 'Técnico' }) {
  const [gpsStatus, setGpsStatus] = useState('idle'); // 'idle' | 'starting' | 'active' | 'paused' | 'denied' | 'error'
  const [lastCoords, setLastCoords] = useState(null);
  const [lastSentTime, setLastSentTime] = useState(null);
  const [isPaused, setIsPaused] = useState(false);

  const channelRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);
  const lastPosRef = useRef(null);

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
    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }

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
      }
    });

    // 2. Iniciar observación de GPS del dispositivo con opciones óptimas
    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000,
    };

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
  };

  const handlePositionUpdate = (position) => {
    const { latitude, longitude, heading, speed, accuracy } = position.coords;
    const now = Date.now();

    setLastCoords({
      lat: latitude,
      lng: longitude,
      accuracy: Math.round(accuracy),
      speed: speed ? Math.round(speed * 3.6) : 0, // Convertir a km/h
    });

    // Filtro de Throttling de batería (máximo 1 envío cada THROTTLE_INTERVAL_MS)
    if (now - lastSentRef.current < THROTTLE_INTERVAL_MS) {
      return;
    }

    // Emitir mensaje por Realtime Broadcast en memoria
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'location_update',
        payload: {
          orderId,
          lat: latitude,
          lng: longitude,
          heading: heading || null,
          speed: speed ? Math.round(speed * 3.6) : 0,
          accuracy: Math.round(accuracy),
          timestamp: new Date().toISOString(),
          technicianName,
        },
      });

      lastSentRef.current = now;
      lastPosRef.current = { latitude, longitude };
      setLastSentTime(new Date());
      setGpsStatus('active');
    }
  };

  if (!isActive) return null;

  return (
    <div className="bg-slate-900 text-white rounded-xl p-3 my-3 shadow-md border border-slate-800">
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
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {gpsStatus === 'active'
                ? `Precisión ±${lastCoords?.accuracy || 0}m · ${lastCoords?.speed || 0} km/h`
                : gpsStatus === 'paused'
                ? 'Transmisión pausada'
                : gpsStatus === 'denied'
                ? 'Permiso de GPS no concedido'
                : 'Sincronizando con panel de control...'}
            </p>
          </div>
        </div>

        {/* Botón de Pausa / Reanudar para que el técnico tenga control */}
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
  );
}
