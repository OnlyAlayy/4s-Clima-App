import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from '@4s-clima/shared/supabase';
import { calculateDistance, formatDistance, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, searchAddressCoordinates } from '@4s-clima/shared';
import { Radio, Navigation, Clock, Activity, AlertCircle, ShieldCheck } from 'lucide-react';
import { createDestinationIcon, createTechnicianIcon } from './leafletIcons';

// Subcomponente para ajustar automáticamente la cámara abarcando destino y técnico solo la primera vez
function AutoFitBounds({ destination, techPosition }) {
  const map = useMap();
  const hasFittedBothRef = useRef(false);
  const hasFittedDestRef = useRef(false);
  const prevDestKeyRef = useRef(null);

  const destKey = destination ? `${destination[0]},${destination[1]}` : null;

  useEffect(() => {
    // Si cambia el destino (por ejemplo al cambiar de orden), reseteamos los flags
    if (prevDestKeyRef.current !== destKey) {
      prevDestKeyRef.current = destKey;
      hasFittedBothRef.current = false;
      hasFittedDestRef.current = false;
    }

    // 1. Encuadre inicial cuando tenemos ambos puntos (destino y técnico)
    if (destination && techPosition && !hasFittedBothRef.current) {
      const bounds = L.latLngBounds([destination, techPosition]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      hasFittedBothRef.current = true;
    } 
    // 2. Si solo tenemos el destino al inicio y todavía no llegó el técnico
    else if (destination && !techPosition && !hasFittedDestRef.current && !hasFittedBothRef.current) {
      map.setView(destination, 15);
      hasFittedDestRef.current = true;
    }
  }, [destination, techPosition, destKey, map]);

  return null;
}

/**
 * Componente visor de Live Tracking para el detalle de la orden en el Panel Admin.
 * 
 * Props:
 * - orderId: string
 * - destinationCoords: { latitude, longitude } | null
 * - destinationAddress: string
 * - technicianName: string
 * - isTraveling: boolean (activo únicamente durante el viaje hacia el cliente)
 * - isOrderInProgress: boolean (compatibilidad hacia atrás)
 */
export default function LiveTrackingViewer({
  orderId,
  destinationCoords,
  destinationAddress,
  technicianName = 'Técnico',
  isTraveling = false,
  isOrderInProgress = false,
}) {
  const [techLocation, setTechLocation] = useState(null); // { lat, lng, speed, heading, accuracy, timestamp }
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'listening' | 'idle'
  const [lastPingSecondsAgo, setLastPingSecondsAgo] = useState(null);
  const [geocodedDest, setGeocodedDest] = useState(null);

  const isListening = isTraveling || isOrderInProgress;

  // Si no hay coordenadas precisas pero sí dirección en texto, geocodificar automáticamente
  useEffect(() => {
    if (destinationCoords?.latitude && destinationCoords?.longitude) {
      setGeocodedDest(null);
      return;
    }
    if (destinationAddress) {
      let isMounted = true;
      searchAddressCoordinates(destinationAddress).then((res) => {
        if (isMounted && res?.lat && res?.lng) {
          setGeocodedDest([res.lat, res.lng]);
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [destinationCoords?.latitude, destinationCoords?.longitude, destinationAddress]);

  const destPos =
    destinationCoords?.latitude && destinationCoords?.longitude
      ? [Number(destinationCoords.latitude), Number(destinationCoords.longitude)]
      : geocodedDest;

  const techPos = techLocation ? [techLocation.lat, techLocation.lng] : null;

  useEffect(() => {
    if (!orderId || !isListening) {
      setConnectionStatus('idle');
      return;
    }

    setConnectionStatus('connecting');

    // Suscripción al canal privado de Supabase Realtime
    const channelName = `tracking:wo-${orderId}`;
    const channel = supabase.channel(channelName, {
      config: {
        private: true,
        broadcast: { ack: false, self: false },
      },
    });

    channel
      .on('broadcast', { event: 'location_update' }, (payload) => {
        if (payload?.payload) {
          const data = payload.payload;
          setTechLocation({
            lat: data.lat,
            lng: data.lng,
            speed: data.speed || 0,
            heading: data.heading,
            accuracy: data.accuracy || 0,
            timestamp: new Date(data.timestamp || Date.now()),
          });
          setConnectionStatus('listening');
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('listening');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, isListening]);

  // Contador de segundos desde el último ping
  useEffect(() => {
    if (!techLocation) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - techLocation.timestamp.getTime()) / 1000);
      setLastPingSecondsAgo(diff);
    }, 1000);
    return () => clearInterval(interval);
  }, [techLocation]);

  // Distancia restante calculada en tiempo real
  const remainingDistanceMeters =
    destPos && techPos ? calculateDistance(techPos[0], techPos[1], destPos[0], destPos[1]) : null;

  const mapCenter = techPos || destPos || DEFAULT_MAP_CENTER;

  return (
    <div className="card p-0 overflow-hidden border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-elevated">
      {/* Header con estatus del Live Tracking */}
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            {techLocation && lastPingSecondsAgo < 15 ? (
              <>
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span className="absolute w-5 h-5 rounded-full bg-emerald-500/40 animate-ping"></span>
              </>
            ) : (
              <span className="w-3 h-3 rounded-full bg-amber-400"></span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>Radar en Vivo: {technicianName}</span>
              <span className="badge bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] py-0.5">
                Canal Seguro RLS
              </span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {techLocation
                ? `Última señal recibida hace ${lastPingSecondsAgo !== null ? `${lastPingSecondsAgo}s` : 'instantes'}`
                : isListening
                ? 'Esperando emisión de GPS en vivo desde el vehículo del técnico...'
                : 'El técnico no se encuentra en viaje (el radar solo se activa durante el traslado)'}
            </p>
          </div>
        </div>

        {remainingDistanceMeters !== null && (
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">
              Distancia al Destino
            </span>
            <span className="text-base font-extrabold text-brand-600 dark:text-brand-400">
              {formatDistance(remainingDistanceMeters)}
            </span>
          </div>
        )}
      </div>

      {/* Mapa interactivo */}
      <div className="relative w-full h-72 z-0">
        <MapContainer
          center={mapCenter}
          zoom={DEFAULT_MAP_ZOOM}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <AutoFitBounds destination={destPos} techPosition={techPos} />

          {/* Pin de Destino */}
          {destPos && (
            <Marker position={destPos} icon={createDestinationIcon('Destino')}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold text-gray-900">Destino de la Orden</p>
                  <p className="text-gray-600">{destinationAddress || 'Sin dirección exacta'}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Pin en Vivo del Técnico */}
          {techPos && (
            <Marker position={techPos} icon={createTechnicianIcon(techLocation?.heading)}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold text-blue-700">{technicianName} (En Vivo)</p>
                  <p className="text-gray-600">Velocidad: {techLocation?.speed || 0} km/h</p>
                  <p className="text-gray-500">Precisión: ±{techLocation?.accuracy || 0} m</p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Telemetría superpuesta */}
        {techLocation && (
          <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-lg border border-gray-200/80 dark:border-slate-700 text-xs flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
              <Activity size={14} className="text-emerald-500" />
              <span>
                Velocidad: <strong>{techLocation.speed} km/h</strong>
              </span>
            </div>
            <div className="h-3 w-px bg-gray-200 dark:bg-slate-700"></div>
            <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
              <Navigation size={14} className="text-blue-500" />
              <span>
                Precisión GPS: <strong>±{techLocation.accuracy}m</strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
