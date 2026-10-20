import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Navigation, ExternalLink, Activity } from 'lucide-react';
import { searchAddressCoordinates, calculateDistance, formatDistance } from '@4s-clima/shared';
import { createDestinationIcon, createTechnicianIcon } from './leafletIcons';

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
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
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
 * Componente visor de ubicación interactivo para la PWA del técnico con soporte dual:
 * Muestra tanto la ubicación en vivo del técnico como el destino del cliente.
 */
export default function LocationViewerMap({
  latitude,
  longitude,
  address,
  title = 'Destino',
  height = '180px',
  currentLocation = null, // { lat, lng, heading, speed }
}) {
  const [geocodedPos, setGeocodedPos] = useState(null);

  // Si no hay coordenadas precisas pero sí dirección en texto, geocodificar con OpenStreetMap
  useEffect(() => {
    if (latitude && longitude) {
      setGeocodedPos(null);
      return;
    }
    if (address && address.trim().length >= 3) {
      let isMounted = true;
      searchAddressCoordinates(address).then((res) => {
        if (isMounted && res?.lat && res?.lng) {
          setGeocodedPos([res.lat, res.lng]);
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [latitude, longitude, address]);

  const hasExplicitCoords = Boolean(latitude && longitude);
  const position = hasExplicitCoords ? [Number(latitude), Number(longitude)] : geocodedPos;
  const techPos = currentLocation?.lat && currentLocation?.lng ? [currentLocation.lat, currentLocation.lng] : null;
  const hasCoordinates = Boolean(position);

  const mapsUrl = hasExplicitCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : position
    ? `https://www.google.com/maps/search/?api=1&query=${position[0]},${position[1]}`
    : address
    ? `https://maps.google.com/?q=${encodeURIComponent(address)}`
    : null;

  const distanceMeters =
    position && techPos ? calculateDistance(techPos[0], techPos[1], position[0], position[1]) : null;

  const mapCenter = techPos || position;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm my-3">
      {hasCoordinates ? (
        <div className="relative w-full" style={{ height }}>
          <MapContainer
            center={mapCenter}
            zoom={15}
            scrollWheelZoom={false}
            dragging={true}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <AutoFitBounds destination={position} techPosition={techPos} />

            {/* Pin de Destino */}
            <Marker position={position} icon={createDestinationIcon(title)}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold text-gray-900">{title}</p>
                  <p className="text-gray-600 mt-0.5">{address || 'Destino de la orden'}</p>
                </div>
              </Popup>
            </Marker>

            {/* Pin de la ubicación del técnico en vivo */}
            {techPos && (
              <Marker position={techPos} icon={createTechnicianIcon(currentLocation?.heading)}>
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold text-blue-700">Tu Ubicación (En Vivo)</p>
                    <p className="text-gray-600">Velocidad: {currentLocation?.speed || 0} km/h</p>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>

          {/* Distancia restante calculada */}
          {distanceMeters !== null && (
            <div className="absolute bottom-2 left-2 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-2.5 py-1 rounded-lg shadow-md border border-gray-200/80 dark:border-slate-700 text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
              <Navigation size={12} className="text-indigo-600 dark:text-indigo-400" />
              <span>A {formatDistance(distanceMeters)} del destino</span>
            </div>
          )}

          {/* Botón flotante para abrir en Google Maps / Waze en el celular */}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2 right-2 z-[1000] bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-md border border-gray-200 dark:border-slate-700 text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Navigation size={13} className="text-blue-500" />
              <span>Abrir Navegación GPS</span>
              <ExternalLink size={11} className="text-gray-400" />
            </a>
          )}
        </div>
      ) : (
        /* Fallback para órdenes sin coordenadas */
        <div className="p-3 bg-gray-50/70 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <MapPin size={16} className="text-gray-500 dark:text-gray-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{address || 'Sin dirección registrada'}</p>
            </div>
          </div>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-1.5 px-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0"
            >
              <Navigation size={12} />
              <span>Google Maps</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
