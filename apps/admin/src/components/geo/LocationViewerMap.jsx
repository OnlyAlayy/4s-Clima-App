import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { createDestinationIcon } from './leafletIcons';

/**
 * Componente visor de ubicación de solo lectura con fallback automático.
 * 
 * Props:
 * - latitude: number|null
 * - longitude: number|null
 * - address: string
 * - title: string (nombre de planta o cliente)
 * - height: string (default "180px")
 */
export default function LocationViewerMap({
  latitude,
  longitude,
  address,
  title = 'Destino',
  height = '180px',
}) {
  const hasCoordinates = Boolean(latitude && longitude);
  const position = hasCoordinates ? [Number(latitude), Number(longitude)] : null;

  const mapsUrl = hasCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : address
    ? `https://maps.google.com/?q=${encodeURIComponent(address)}`
    : null;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      {hasCoordinates ? (
        <div className="relative w-full" style={{ height }}>
          <MapContainer
            center={position}
            zoom={15}
            scrollWheelZoom={false}
            dragging={!L.Browser.mobile} // Bloquea arrastre en mobile para no atrapar el scroll
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={position} icon={createDestinationIcon(title)}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold text-gray-900">{title}</p>
                  <p className="text-gray-600 mt-0.5">{address || 'Destino de la orden'}</p>
                </div>
              </Popup>
            </Marker>
          </MapContainer>

          {/* Botón flotante para abrir en Google Maps / Waze */}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2 right-2 z-[1000] bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm px-2.5 py-1.5 rounded-lg shadow-md border border-gray-200 dark:border-slate-700 text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1.5 hover:bg-white transition-all"
            >
              <Navigation size={13} />
              <span>Navegar GPS</span>
              <ExternalLink size={11} className="text-gray-400" />
            </a>
          )}
        </div>
      ) : (
        /* Fallback limpio para órdenes viejas o sin coordenadas cargadas */
        <div className="p-4 bg-gray-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin size={16} className="text-gray-500 dark:text-gray-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {address || 'Sin dirección cargada'}
              </p>
            </div>
          </div>

          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary py-1.5 px-3 text-xs shrink-0 flex items-center gap-1.5"
            >
              <Navigation size={13} className="text-blue-500" />
              <span>Google Maps</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
