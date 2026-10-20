import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from '@4s-clima/shared/supabase';
import {
  calculateDistance,
  formatDistance,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  searchAddressCoordinates,
  calculateEtaMinutes,
  formatEta,
  evaluateSchedulePunctuality,
  isNearDestination,
  generateWhatsAppTrackingUrl,
} from '@4s-clima/shared';
import {
  Radio,
  Navigation,
  Clock,
  Activity,
  AlertCircle,
  ShieldCheck,
  Battery,
  BatteryCharging,
  Share2,
  CheckCircle2,
  Car,
  Wrench,
  ExternalLink,
} from 'lucide-react';
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
 * Componente visor de Live Tracking de Grado Enterprise para el detalle de la orden.
 * 
 * Capacidades:
 * - Telemetría en vivo vía Supabase Realtime (Canal Privado tracking:wo-{orderId}).
 * - Polyline punteada de trayectoria directa técnico -> destino.
 * - ETA Dinámico y hora proyectada de arribo.
 * - Evaluación de puntualidad (En horario vs. Demorado).
 * - Detección de Geocerca (<150m de la planta de destino).
 * - Telemetría de batería y reporte de incidencias en ruta.
 * - Despacho de aviso por WhatsApp al cliente en un clic.
 */
export default function LiveTrackingViewer({
  orderId,
  orderNumber = '',
  clientName = '',
  clientPhone = '',
  scheduledDate = null,
  scheduledTime = null,
  destinationCoords,
  destinationAddress,
  technicianName = 'Técnico',
  isTraveling = false,
  isOrderInProgress = false,
}) {
  const [techLocation, setTechLocation] = useState(null); // { lat, lng, speed, heading, accuracy, battery, incident, timestamp }
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
            lat: Number(data.lat),
            lng: Number(data.lng),
            speed: data.speed || 0,
            heading: data.heading,
            accuracy: data.accuracy || 0,
            battery: data.battery ?? null,
            batteryCharging: data.batteryCharging ?? false,
            incident: data.incident || null,
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

  // Cálculos operativos en vivo: distancia, ETA, puntualidad y geocerca
  const remainingDistanceMeters =
    destPos && techPos ? calculateDistance(techPos[0], techPos[1], destPos[0], destPos[1]) : null;

  const etaMinutes =
    remainingDistanceMeters !== null
      ? calculateEtaMinutes(remainingDistanceMeters, techLocation?.speed)
      : null;

  const punctuality =
    scheduledDate && scheduledTime && etaMinutes !== null
      ? evaluateSchedulePunctuality(scheduledDate, scheduledTime, etaMinutes)
      : null;

  const isNear = isNearDestination(remainingDistanceMeters, 150);

  const estimatedArrivalTime =
    etaMinutes !== null
      ? new Date(Date.now() + etaMinutes * 60 * 1000).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  const whatsappUrl = generateWhatsAppTrackingUrl({
    phone: clientPhone,
    technicianName,
    clientName,
    orderNumber,
    address: destinationAddress,
    distanceMeters: remainingDistanceMeters,
    etaMinutes,
  });

  const mapCenter = techPos || destPos || DEFAULT_MAP_CENTER;

  return (
    <div className="card p-0 overflow-hidden border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-elevated">
      {/* 1. Header con estatus del Live Tracking y métricas de arribo */}
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex items-center justify-center shrink-0">
            {techLocation && (lastPingSecondsAgo === null || lastPingSecondsAgo < 20) ? (
              <>
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span className="absolute w-5 h-5 rounded-full bg-emerald-500/40 animate-ping"></span>
              </>
            ) : (
              <span className="w-3 h-3 rounded-full bg-amber-400"></span>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
              <span>Radar en Vivo: {technicianName}</span>
              <span className="badge bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] py-0.5">
                Canal Seguro RLS
              </span>
              {punctuality && punctuality.status === 'delayed' && (
                <span className="badge bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[10px] py-0.5 font-bold">
                  ⚠️ {punctuality.label}
                </span>
              )}
              {punctuality && punctuality.status === 'on_time' && (
                <span className="badge bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] py-0.5">
                  ✓ {punctuality.label}
                </span>
              )}
              {isNear && (
                <span className="badge bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] py-0.5 animate-pulse font-bold">
                  📍 En Inmediaciones (&lt;150m)
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {techLocation
                ? `Última señal recibida hace ${lastPingSecondsAgo !== null ? `${lastPingSecondsAgo}s` : 'instantes'}`
                : isListening
                ? 'Esperando emisión de GPS en vivo desde el dispositivo del técnico...'
                : 'El técnico no se encuentra en viaje (el radar solo se activa durante el traslado)'}
            </p>
          </div>
        </div>

        {/* Métricas de Distancia y Acciones de Despacho */}
        <div className="flex items-center gap-4 self-end md:self-auto shrink-0">
          {remainingDistanceMeters !== null && (
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">
                Distancia y Arribo
              </span>
              <div className="flex items-center gap-1.5 justify-end">
                <span className="text-base font-extrabold text-brand-600 dark:text-brand-400">
                  {formatDistance(remainingDistanceMeters)}
                </span>
                {etaMinutes !== null && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    ({formatEta(etaMinutes)}{estimatedArrivalTime ? ` · ${estimatedArrivalTime} hs` : ''})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Botón de aviso rápido al Cliente por WhatsApp */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
            title="Avisar llegada estimada al contacto del cliente por WhatsApp"
          >
            <Share2 size={13} />
            <span>Avisar Arribo</span>
          </a>
        </div>
      </div>

      {/* Alerta de incidencia en ruta reportada por el técnico */}
      {techLocation?.incident && (
        <div className="bg-amber-50 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-800/80 px-5 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          {techLocation.incident === 'traffic' ? (
            <Car size={15} className="text-amber-600 shrink-0" />
          ) : (
            <Wrench size={15} className="text-red-500 shrink-0" />
          )}
          <span>
            <strong>Aviso del técnico en ruta:</strong>{' '}
            {techLocation.incident === 'traffic'
              ? 'Reportó congestión vehicular pesada en el trayecto.'
              : 'Reportó desperfecto técnico o mecánica en el móvil.'}
          </span>
        </div>
      )}

      {/* 2. Mapa interactivo Leaflet */}
      <div className="relative w-full h-80 z-0 bg-slate-100 dark:bg-slate-950">
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

          {/* Trayectoria directa punteada entre el técnico y el destino */}
          {techPos && destPos && (
            <Polyline
              positions={[techPos, destPos]}
              pathOptions={{
                color: '#2563eb',
                weight: 3.5,
                dashArray: '7, 9',
                opacity: 0.9,
              }}
            />
          )}

          {/* Pin de Destino */}
          {destPos && (
            <Marker position={destPos} icon={createDestinationIcon('Destino')}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold text-gray-900">{clientName || 'Destino de la Orden'}</p>
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
                  {techLocation?.battery !== null && (
                    <p className="text-gray-500">Batería: {techLocation.battery}%</p>
                  )}
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* 3. Telemetría superpuesta en esquina inferior */}
        {techLocation && (
          <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-lg border border-gray-200/80 dark:border-slate-700 text-xs flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
              <Activity size={14} className="text-emerald-500" />
              <span>
                Velocidad: <strong>{techLocation.speed} km/h</strong>
              </span>
            </div>

            <div className="h-3 w-px bg-gray-200 dark:bg-slate-700 hidden sm:block"></div>

            <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
              <Navigation size={14} className="text-blue-500" />
              <span>
                Precisión: <strong>±{techLocation.accuracy}m</strong>
              </span>
            </div>

            {techLocation.battery !== null && (
              <>
                <div className="h-3 w-px bg-gray-200 dark:bg-slate-700 hidden sm:block"></div>
                <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                  {techLocation.batteryCharging ? (
                    <BatteryCharging size={14} className="text-emerald-500" />
                  ) : (
                    <Battery size={14} className="text-slate-400" />
                  )}
                  <span>
                    Batería: <strong>{techLocation.battery}%</strong>
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
