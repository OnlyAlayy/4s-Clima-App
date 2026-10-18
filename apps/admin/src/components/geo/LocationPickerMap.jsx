import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search, Check, X, Compass, Maximize2, Minimize2 } from 'lucide-react';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, searchAddressCoordinates } from '@4s-clima/shared';
import { createDestinationIcon } from './leafletIcons';

// Subcomponente para capturar clicks en el mapa y mover el pin
function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Subcomponente para mover la cámara ÚNICAMENTE cuando hay una búsqueda explícita o botón GPS
function MapFlyController({ flyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (flyTarget && flyTarget.lat && flyTarget.lng) {
      // Conservar el zoom del usuario si ya está más cerca que 16, nunca hacer zoom-out indeseado
      const currentZoom = map.getZoom();
      const targetZoom = Math.max(currentZoom, 16);
      map.flyTo([flyTarget.lat, flyTarget.lng], targetZoom, {
        animate: true,
        duration: 0.8,
      });
    }
  }, [flyTarget, map]);
  return null;
}

// Subcomponente para recalcular el tamaño del mapa al abrir o maximizar (evita tiles grises)
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

/**
 * Componente interactivo de selección de coordenadas.
 * Incluye modo Pantalla Completa / Maximizado para marcar el pin con total comodidad y precisión.
 */
export default function LocationPickerMap({
  latitude,
  longitude,
  addressText = '',
  onChange,
  label = 'Geolocalización en Mapa',
}) {
  const [isOpen, setIsOpen] = useState(Boolean(latitude && longitude));
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchInput, setSearchInput] = useState(addressText);
  const [flyTarget, setFlyTarget] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(
    latitude && longitude ? [Number(latitude), Number(longitude)] : null
  );

  useEffect(() => {
    if (latitude && longitude) {
      setCurrentPosition([Number(latitude), Number(longitude)]);
    } else {
      setCurrentPosition(null);
    }
  }, [latitude, longitude]);

  useEffect(() => {
    setSearchInput(addressText);
  }, [addressText]);

  const handleSelectCoords = (lat, lng) => {
    const roundedLat = parseFloat(lat.toFixed(6));
    const roundedLng = parseFloat(lng.toFixed(6));
    setCurrentPosition([roundedLat, roundedLng]);
    onChange({ lat: roundedLat, lng: roundedLng });
    setSearchError(null);
  };

  const handleMarkerDrag = (e) => {
    const { lat, lng } = e.target.getLatLng();
    handleSelectCoords(lat, lng);
  };

  const handleSearchAddress = async (queryText) => {
    const query = (queryText || searchInput || addressText || '').trim();
    if (!query) {
      setSearchError('Ingresá una dirección para buscar en el mapa.');
      return;
    }
    setIsSearching(true);
    setSearchError(null);

    const result = await searchAddressCoordinates(query);
    setIsSearching(false);

    if (result) {
      handleSelectCoords(result.lat, result.lng);
      setFlyTarget({ lat: result.lat, lng: result.lng, t: Date.now() });
    } else {
      setSearchError('No se encontró la dirección exacta. Podés buscar en el mapa y hacer clic manualmente.');
    }
  };

  const handleUseCurrentGPS = () => {
    if (!navigator.geolocation) {
      setSearchError('Tu navegador no soporta geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleSelectCoords(pos.coords.latitude, pos.coords.longitude);
        setFlyTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() });
      },
      (err) => {
        setSearchError('No se pudo obtener tu ubicación actual: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleClear = () => {
    setCurrentPosition(null);
    onChange({ lat: null, lng: null });
    setSearchError(null);
  };

  const mapCenter = currentPosition || DEFAULT_MAP_CENTER;

  return (
    <>
      {/* Vista Compacta (dentro del modal) */}
      <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-gray-50 dark:bg-slate-900/40 my-3">
        {/* Header colapsable */}
        <div className="px-3.5 py-2.5 flex items-center justify-between bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-2">
            <MapPin size={16} className={currentPosition ? 'text-emerald-500' : 'text-gray-400'} />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
              {label}
            </span>
            {currentPosition && (
              <span className="badge bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] py-0.5 px-2">
                GPS ({currentPosition[0].toFixed(4)}, {currentPosition[1].toFixed(4)})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
          >
            {isOpen ? 'Ocultar Mapa' : currentPosition ? 'Ver / Modificar Pin' : '+ Asignar Pin en Mapa'}
          </button>
        </div>

        {/* Contenido compacto */}
        {isOpen && (
          <div className="p-3 space-y-2">
            {/* Barra de herramientas rápida */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {addressText && (
                  <button
                    type="button"
                    onClick={() => handleSearchAddress(addressText)}
                    disabled={isSearching}
                    className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1.5 bg-white dark:bg-slate-800"
                    title="Buscar la dirección escrita en el mapa"
                  >
                    <Search size={13} className="text-brand-500" />
                    {isSearching ? 'Buscando...' : 'Ubicar dirección'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleUseCurrentGPS}
                  className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1.5 bg-white dark:bg-slate-800"
                  title="Centrar en mi ubicación actual"
                >
                  <Compass size={13} className="text-blue-500" />
                  Mi GPS
                </button>

                {currentPosition && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="btn-secondary py-1 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                    title="Quitar coordenadas"
                  >
                    <X size={13} /> Quitar
                  </button>
                )}
              </div>

              {/* Botón para Agrandar a Pantalla Completa */}
              <button
                type="button"
                onClick={() => setIsMaximized(true)}
                className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-900/50 border-brand-200 dark:border-brand-800 font-bold ml-auto"
                title="Abrir mapa en pantalla completa para marcar con mayor comodidad"
              >
                <Maximize2 size={13} />
                <span>Agrandar Mapa</span>
              </button>
            </div>

            {searchError && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200/60 dark:border-amber-800/40">
                {searchError}
              </p>
            )}

            {/* Contenedor del Mapa Leaflet Compacto */}
            <div className="relative w-full h-64 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 shadow-inner z-0">
              <MapContainer
                center={mapCenter}
                zoom={currentPosition ? 16 : DEFAULT_MAP_ZOOM}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapClickHandler onLocationSelect={handleSelectCoords} />
                <MapFlyController flyTarget={flyTarget} />
                <MapResizeHandler />

                {currentPosition && (
                  <Marker
                    position={currentPosition}
                    icon={createDestinationIcon()}
                    draggable={true}
                    eventHandlers={{
                      dragend: handleMarkerDrag,
                    }}
                  />
                )}
              </MapContainer>

              <div className="absolute bottom-2 left-2 right-2 pointer-events-none z-[1000] flex justify-center">
                <span className="bg-black/75 backdrop-blur-sm text-white text-[11px] px-3 py-1 rounded-full shadow">
                  {currentPosition
                    ? 'Arrastrá el pin o hacé clic para moverlo.'
                    : 'Hacé clic para colocar el pin.'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Overlay de Pantalla Completa / Maximizado */}
      {isMaximized && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 md:p-6 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full h-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700 animate-slide-up">
            
            {/* Header del mapa maximizado */}
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/80 dark:bg-slate-800/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center">
                  <MapPin size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>Fijar Ubicación con Precisión</span>
                    {currentPosition && (
                      <span className="badge bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs py-0.5">
                        {currentPosition[0].toFixed(5)}, {currentPosition[1].toFixed(5)}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Hacé zoom, buscá calles y arrastrá el pin hasta la puerta o entrada exacta.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMaximized(false)}
                  className="btn-primary py-1.5 px-4 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-brand-500/20"
                >
                  <Check size={15} />
                  <span>Confirmar y Volver</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMaximized(false)}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg text-gray-500 transition-colors"
                  title="Cerrar vista grande"
                >
                  <Minimize2 size={18} />
                </button>
              </div>
            </div>

            {/* Barra de búsqueda y controles en pantalla grande */}
            <div className="px-5 py-2.5 bg-white dark:bg-slate-800/40 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[280px] max-w-md flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    className="input py-1.5 pl-9 pr-3 text-xs w-full"
                    placeholder="Escribí una calle, altura o localidad..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchAddress(searchInput);
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSearchAddress(searchInput)}
                  disabled={isSearching}
                  className="btn-secondary py-1.5 px-3 text-xs shrink-0"
                >
                  {isSearching ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleUseCurrentGPS}
                  className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                >
                  <Compass size={14} className="text-blue-500" />
                  <span>Mi GPS Actual</span>
                </button>

                {currentPosition && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="btn-secondary py-1.5 px-2.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                  >
                    <X size={14} />
                    <span>Quitar Pin</span>
                  </button>
                )}
              </div>
            </div>

            {searchError && (
              <div className="px-5 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/60 text-xs text-amber-700 dark:text-amber-300">
                {searchError}
              </div>
            )}

            {/* Mapa grande que ocupa todo el espacio */}
            <div className="relative flex-1 w-full z-0 bg-slate-100">
              <MapContainer
                center={mapCenter}
                zoom={currentPosition ? 17 : DEFAULT_MAP_ZOOM}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapClickHandler onLocationSelect={handleSelectCoords} />
                <MapFlyController flyTarget={flyTarget} />
                <MapResizeHandler />

                {currentPosition && (
                  <Marker
                    position={currentPosition}
                    icon={createDestinationIcon()}
                    draggable={true}
                    eventHandlers={{
                      dragend: handleMarkerDrag,
                    }}
                  />
                )}
              </MapContainer>

              {/* Guía flotante en pantalla grande */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none z-[1000]">
                <div className="bg-slate-900/85 backdrop-blur-md text-white text-xs px-4 py-2 rounded-xl shadow-xl flex items-center gap-2">
                  <MapPin size={14} className="text-emerald-400" />
                  <span>
                    {currentPosition
                      ? 'Podés arrastrar el pin con el mouse para ajustarlo con máxima precisión.'
                      : 'Hacé clic en cualquier punto del mapa para colocar el pin.'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
