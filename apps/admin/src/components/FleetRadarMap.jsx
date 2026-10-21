import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from '@4s-clima/shared/supabase';
import {
  calculateDistance,
  formatDistance,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  resolveOrderLocation,
  searchAddressCoordinates,
  calculateEtaMinutes,
  formatEta,
  evaluateSchedulePunctuality,
  isNearDestination,
  generateWhatsAppTrackingUrl,
} from '@4s-clima/shared';
import { WORK_ORDER_STATUS } from '@4s-clima/shared/constants';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  Navigation,
  Search,
  Users,
  MapPin,
  Clock,
  ExternalLink,
  RotateCcw,
  Building,
  CheckCircle2,
  Radio,
  X,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Compass,
  Battery,
  BatteryCharging,
  Share2,
  Car,
  Wrench,
} from 'lucide-react';

// Tiles OpenStreetMap estándar y limpios sin marcas de agua
const TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

/**
 * Generador de Icono Leaflet para el Técnico.
 */
function createTechIcon({ name, isSelected, status, isDimmed }) {
  const initials = (name || 'T')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isTraveling = status === WORK_ORDER_STATUS.TRAVELING;
  const isInProgress = status === WORK_ORDER_STATUS.IN_PROGRESS;

  let bg = '#475569'; // Gris (sin orden activa)
  let dotColor = '#94a3b8';
  if (isTraveling) {
    bg = '#4f46e5'; // Indigo (en viaje)
    dotColor = '#6366f1';
  } else if (isInProgress) {
    bg = '#059669'; // Esmeralda (en obra / en sitio)
    dotColor = '#10b981';
  } else if (status === WORK_ORDER_STATUS.PENDING) {
    bg = '#0284c7'; // Azul cielo (asignado)
    dotColor = '#38bdf8';
  }

  const opacity = isDimmed ? 'opacity: 0.25; filter: grayscale(80%);' : 'opacity: 1;';
  const ring = isSelected
    ? `<span style="position: absolute; inset: -5px; border-radius: 50%; background: ${bg}33; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
       <span style="position: absolute; inset: -3px; border-radius: 50%; border: 2px solid ${bg};"></span>`
    : '';

  return L.divIcon({
    className: 'custom-tech-marker',
    html: `
      <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; ${opacity}">
        ${ring}
        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${bg}; border: 2.5px solid #ffffff; box-shadow: 0 4px 8px -1px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; z-index: 2;">
          ${initials}
        </div>
        <span style="position: absolute; bottom: 0px; right: 0px; width: 10px; height: 10px; border-radius: 50%; background: ${dotColor}; border: 2px solid #ffffff; z-index: 3;"></span>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
  });
}

/**
 * Generador de Icono Leaflet para el Destino (Cliente / Sucursal).
 */
function createDestIcon({ isSelected, isDimmed }) {
  const opacity = isDimmed ? 'opacity: 0.2; filter: grayscale(90%);' : 'opacity: 1;';
  const color = isSelected ? '#0284c7' : '#dc2626';

  return L.divIcon({
    className: 'custom-dest-marker',
    html: `
      <div style="width: 30px; height: 38px; display: flex; align-items: flex-start; justify-content: center; cursor: pointer; transition: all 0.2s ease; ${opacity}">
        <svg viewBox="0 0 24 30" width="30" height="38" style="filter: drop-shadow(0 3px 5px rgba(0,0,0,0.35));">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 18 12 18s12-9 12-18c0-6.627-5.373-12-12-12z" fill="${color}"/>
          <circle cx="12" cy="11" r="5" fill="#FFFFFF"/>
          <circle cx="12" cy="11" r="2.8" fill="${color}"/>
        </svg>
      </div>
    `,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
  });
}

/**
 * Controlador de Cámara Leaflet: Encuadra fluidamente según el modo (Foco vs General).
 */
function MapCameraHandler({ selectedTech, activeTechsWithCoords, isFocusMode }) {
  const map = useMap();
  const lastTargetRef = useRef(null);

  useEffect(() => {
    if (!map) return;

    if (isFocusMode && selectedTech) {
      const targetKey = `${selectedTech.id}-${selectedTech.activeOrder?.id}`;
      if (lastTargetRef.current === targetKey) return;
      lastTargetRef.current = targetKey;

      const points = [];
      if (selectedTech.techCoords) points.push(selectedTech.techCoords);
      if (selectedTech.destCoords) points.push(selectedTech.destCoords);

      if (points.length === 2) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [70, 70], maxZoom: 15, animate: true, duration: 0.7 });
      } else if (points.length === 1) {
        map.setView(points[0], 15, { animate: true, duration: 0.6 });
      }
    } else if (!isFocusMode) {
      lastTargetRef.current = 'all';
      const allPoints = [];
      activeTechsWithCoords.forEach((t) => {
        if (t.techCoords) allPoints.push(t.techCoords);
        if (t.destCoords) allPoints.push(t.destCoords);
      });

      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13, animate: true, duration: 0.7 });
      } else {
        map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, { animate: true });
      }
    }
  }, [selectedTech, isFocusMode, activeTechsWithCoords, map]);

  return null;
}

export default function FleetRadarMap() {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();

  const [technicians, setTechnicians] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [liveLocations, setLiveLocations] = useState({}); // { [techId]: { lat, lng, speed, heading, timestamp } }
  const [isLoading, setIsLoading] = useState(true);

  // Estados de control del usuario
  const [filterMode, setFilterMode] = useState('active'); // 'active' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTechId, setSelectedTechId] = useState(null);

  // Cargar datos de técnicos y órdenes activas
  const loadFleetData = useCallback(async () => {
    try {
      // 1. Obtener todos los técnicos del sistema
      const { data: techs, error: techError } = await supabase
        .from('users')
        .select('id, name, email, phone, role, active')
        .eq('role', 'tecnico')
        .order('name');

      if (techError) throw techError;

      // 2. Obtener órdenes activas (viajando, en progreso o pendientes asignadas)
      const { data: orders, error: ordersError } = await supabase
        .from('work_orders')
        .select(`
          id,
          order_number,
          status,
          type,
          scheduled_date,
          scheduled_time,
          started_at,
          assigned_to,
          custom_address,
          custom_latitude,
          custom_longitude,
          is_custom_location,
          client:clients(id, name, address),
          plant:plants(id, name, address, latitude, longitude)
        `)
        .in('status', [
          WORK_ORDER_STATUS.TRAVELING,
          WORK_ORDER_STATUS.IN_PROGRESS,
          WORK_ORDER_STATUS.PENDING,
        ])
        .order('scheduled_date', { ascending: true });

      if (ordersError) throw ordersError;

      setTechnicians(techs || []);
      setActiveOrders(orders || []);
    } catch (err) {
      console.error('Error cargando datos del radar de flota:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFleetData();

    // Suscripción a cambios en órdenes de trabajo
    const ordersChannel = supabase
      .channel('radar-work-orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => loadFleetData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, [loadFleetData]);

  // Suscripción a canales de Realtime Broadcast para cada orden en viaje o en progreso
  useEffect(() => {
    const activeMovingOrders = activeOrders.filter(
      (o) =>
        o.status === WORK_ORDER_STATUS.TRAVELING ||
        o.status === WORK_ORDER_STATUS.IN_PROGRESS
    );

    const channels = activeMovingOrders.map((order) => {
      const channelName = `tracking:wo-${order.id}`;
      const ch = supabase.channel(channelName, {
        config: { private: true, broadcast: { ack: false, self: false } },
      });

      ch.on('broadcast', { event: 'location_update' }, (payload) => {
        if (payload?.payload && order.assigned_to) {
          const data = payload.payload;
          setLiveLocations((prev) => ({
            ...prev,
            [order.assigned_to]: {
              lat: Number(data.lat),
              lng: Number(data.lng),
              speed: data.speed || 0,
              heading: data.heading || null,
              battery: data.battery ?? null,
              batteryCharging: data.batteryCharging ?? false,
              incident: data.incident || null,
              timestamp: new Date(data.timestamp || Date.now()),
              orderId: order.id,
            },
          }));
        }
      });

      ch.subscribe();
      return ch;
    });

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [activeOrders]);

  // Consolidar mapa mental Técnico -> Orden Activa -> Coordenadas
  const consolidatedFleet = useMemo(() => {
    return technicians.map((tech) => {
      // Prioridad de orden: traveling > in_progress > pending más próxima
      const techOrders = activeOrders.filter((o) => o.assigned_to === tech.id);
      techOrders.sort((a, b) => {
        const priority = {
          [WORK_ORDER_STATUS.TRAVELING]: 3,
          [WORK_ORDER_STATUS.IN_PROGRESS]: 2,
          [WORK_ORDER_STATUS.PENDING]: 1,
        };
        return (priority[b.status] || 0) - (priority[a.status] || 0);
      });

      const activeOrder = techOrders[0] || null;

      // Ubicación de destino del cliente
      const locationInfo = activeOrder ? resolveOrderLocation(activeOrder) : null;
      const destCoords =
        locationInfo?.hasCoordinates && locationInfo.latitude && locationInfo.longitude
          ? [locationInfo.latitude, locationInfo.longitude]
          : null;

      // Ubicación del técnico:
      // Estricta regla de fidelidad: ÚNICAMENTE se posiciona al técnico si existe telemetría GPS REAL
      // emitida desde el dispositivo móvil por Supabase Realtime (nunca simular ni inventar coordenadas).
      const live = liveLocations[tech.id];
      const techCoords = live ? [Number(live.lat), Number(live.lng)] : null;

      // Distancia restante real (solo si tenemos ambos puntos verdaderos)
      const distanceMeters =
        techCoords && destCoords
          ? calculateDistance(techCoords[0], techCoords[1], destCoords[0], destCoords[1])
          : null;

      // ETA y Puntualidad
      const etaMinutes =
        distanceMeters !== null
          ? calculateEtaMinutes(distanceMeters, live?.speed)
          : null;

      const punctuality =
        activeOrder?.scheduled_date && activeOrder?.scheduled_time && etaMinutes !== null
          ? evaluateSchedulePunctuality(activeOrder.scheduled_date, activeOrder.scheduled_time, etaMinutes)
          : null;

      const isNear = isNearDestination(distanceMeters, 150);

      const estimatedArrivalTime =
        etaMinutes !== null
          ? new Date(Date.now() + etaMinutes * 60 * 1000).toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          : null;

      const hasActiveWork =
        activeOrder !== null &&
        (activeOrder.status === WORK_ORDER_STATUS.TRAVELING ||
          activeOrder.status === WORK_ORDER_STATUS.IN_PROGRESS ||
          activeOrder.status === WORK_ORDER_STATUS.PENDING);

      return {
        ...tech,
        activeOrder,
        locationInfo,
        destCoords,
        techCoords,
        liveTelemetry: live || null,
        distanceMeters,
        etaMinutes,
        punctuality,
        isNear,
        estimatedArrivalTime,
        hasActiveWork,
      };
    });
  }, [technicians, activeOrders, liveLocations]);

  // Filtrado de la lista por pestañas y búsqueda instantánea de doble criterio
  const filteredTechs = useMemo(() => {
    return consolidatedFleet.filter((tech) => {
      // 1. Filtro por Píldora
      if (filterMode === 'active' && !tech.hasActiveWork) {
        return false;
      }

      // 2. Buscador Instantáneo (Doble Criterio: Técnico O Cliente / Dirección / OT)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTech =
          tech.name?.toLowerCase().includes(q) ||
          tech.email?.toLowerCase().includes(q) ||
          tech.phone?.toLowerCase().includes(q);

        const clientName = tech.activeOrder?.client?.name?.toLowerCase() || '';
        const orderNumber = tech.activeOrder?.order_number?.toLowerCase() || '';
        const plantName = tech.activeOrder?.plant?.name?.toLowerCase() || '';
        const address = (
          tech.activeOrder?.custom_address ||
          tech.activeOrder?.plant?.address ||
          tech.activeOrder?.client?.address ||
          ''
        ).toLowerCase();

        const matchOrderOrClient =
          clientName.includes(q) ||
          orderNumber.includes(q) ||
          plantName.includes(q) ||
          address.includes(q);

        return matchTech || matchOrderOrClient;
      }

      return true;
    });
  }, [consolidatedFleet, filterMode, searchQuery]);

  // Conteos para las píldoras
  const activeCount = useMemo(
    () => consolidatedFleet.filter((t) => t.hasActiveWork).length,
    [consolidatedFleet]
  );
  const totalCount = consolidatedFleet.length;

  // Técnico seleccionado en Modo Foco
  const selectedTech = useMemo(
    () => consolidatedFleet.find((t) => t.id === selectedTechId) || null,
    [consolidatedFleet, selectedTechId]
  );

  const isFocusMode = selectedTech !== null;

  // Técnicos con al menos un punto geográfico válido
  const activeTechsWithCoords = useMemo(
    () => consolidatedFleet.filter((t) => t.techCoords || t.destCoords),
    [consolidatedFleet]
  );

  return (
    <div className="card p-0 overflow-hidden border border-gray-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm mt-8">
      {/* 1. Header Sobrio y Corporativo */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gray-50/60 dark:bg-slate-900/80">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Navigation size={18} className="text-brand-500" />
              Monitoreo de Flota y Destinos Activos
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Seleccioná un técnico para aislar su recorrido y visualizar el destino de su orden actual
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
            <Radio size={13} className="text-emerald-500 animate-pulse" />
            <span>{activeCount} técnicos en actividad</span>
          </div>

          <button
            onClick={loadFleetData}
            title="Refrescar datos de la flota"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* 2. Cuerpo Master-Detail (Desktop: 35% Lista, 65% Mapa) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
        {/* Columna Izquierda: Panel de Control y Búsqueda (35% -> col-span-4 / 5) */}
        <div className="lg:col-span-4 xl:col-span-4 border-r border-gray-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900">
          {/* Barra de Filtros y Búsqueda Instantánea */}
          <div className="p-3.5 border-b border-gray-100 dark:border-slate-800 space-y-2.5 bg-gray-50/30 dark:bg-slate-900/50">
            {/* Buscador de Doble Criterio */}
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Buscar técnico, cliente, dirección u OT..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Píldoras de Filtro (En Actividad por defecto) */}
            <div className="flex items-center gap-1.5 p-0.5 bg-gray-100 dark:bg-slate-800/80 rounded-lg">
              <button
                type="button"
                onClick={() => setFilterMode('active')}
                className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-semibold transition-all ${
                  filterMode === 'active'
                    ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                En Actividad ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-semibold transition-all ${
                  filterMode === 'all'
                    ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                Todos ({totalCount})
              </button>
            </div>
          </div>

          {/* Lista Compacta Scrolleable de Técnicos */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800/60 max-h-[500px] lg:max-h-[520px]">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-14 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredTechs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-xs space-y-1">
                <Users size={28} className="mx-auto opacity-30 mb-2" />
                <p className="font-semibold text-gray-600 dark:text-gray-400">
                  No se encontraron técnicos
                </p>
                <p>
                  {searchQuery
                    ? 'Probá modificando el término de búsqueda.'
                    : 'No hay técnicos con órdenes en actividad en este momento.'}
                </p>
              </div>
            ) : (
              filteredTechs.map((tech) => {
                const isSelected = selectedTechId === tech.id;
                const order = tech.activeOrder;
                const isTraveling = order?.status === WORK_ORDER_STATUS.TRAVELING;
                const isInProgress = order?.status === WORK_ORDER_STATUS.IN_PROGRESS;
                const isPending = order?.status === WORK_ORDER_STATUS.PENDING;

                // Color del dot indicador
                let dotClass = 'bg-gray-400 dark:bg-slate-600';
                let statusLabel = 'Disponible';
                let badgeClass =
                  'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300';

                if (isTraveling) {
                  dotClass = 'bg-indigo-500 animate-pulse';
                  statusLabel = 'En Camino';
                  badgeClass =
                    'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
                } else if (isInProgress) {
                  dotClass = 'bg-emerald-500';
                  statusLabel = 'En Sitio';
                  badgeClass =
                    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
                } else if (isPending) {
                  dotClass = 'bg-sky-500';
                  statusLabel = 'Asignado';
                  badgeClass =
                    'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-800';
                }

                // Resolver texto de destino
                const clientName = order?.client?.name || order?.plant?.name || null;
                const destinationDesc =
                  order?.plant?.address ||
                  order?.custom_address ||
                  order?.client?.address ||
                  'Destino en curso';

                return (
                  <button
                    key={tech.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedTechId(null); // Deseleccionar
                      } else {
                        setSelectedTechId(tech.id);
                      }
                    }}
                    className={`w-full text-left p-3.5 transition-all flex items-start gap-3 group ${
                      isSelected
                        ? 'bg-brand-50/70 dark:bg-brand-950/30 border-l-4 border-brand-500'
                        : 'hover:bg-gray-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Avatar e indicador de estado */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 border border-white dark:border-slate-800 shadow-xs">
                        {(tech.name || 'T')
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${dotClass}`}
                      />
                    </div>

                    {/* Información del técnico y su ruta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <span className="font-bold text-xs text-gray-900 dark:text-white truncate">
                          {tech.name}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${badgeClass}`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      {/* Relación Técnico -> Destino */}
                      {order ? (
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate flex items-center gap-1">
                            <span className="text-brand-500 shrink-0">➔</span>
                            <span className="font-semibold">{clientName || 'Cliente'}</span>
                            {destinationDesc && (
                              <span className="text-gray-400 dark:text-gray-500 truncate text-[10px]">
                                ({destinationDesc})
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-gray-400 font-mono">
                            <span>#{order.order_number || order.id?.slice(0, 8)}</span>
                            {tech.distanceMeters !== null ? (
                              <span className="text-brand-600 dark:text-brand-400 font-semibold font-sans flex items-center gap-1">
                                <span>• {formatDistance(tech.distanceMeters)}</span>
                                {tech.etaMinutes !== null && <span>({formatEta(tech.etaMinutes)})</span>}
                                {tech.isNear && (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                                    <MapPin size={10} className="shrink-0" /> Inmediaciones
                                  </span>
                                )}
                                {tech.punctuality?.status === 'delayed' && (
                                  <span className="text-amber-600 dark:text-amber-400 font-bold">
                                    +{tech.punctuality.delayMinutes >= 60 ? `${Math.floor(tech.punctuality.delayMinutes / 60)}h` : `${tech.punctuality.delayMinutes}m`}
                                  </span>
                                )}
                                {tech.punctuality?.status === 'rescheduled' && (
                                  <span className="text-slate-500 dark:text-slate-400 font-medium text-[9px]">
                                    ({tech.punctuality.label.replace('Pactada el ', '')})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-sans text-[10px]">
                                • GPS móvil pendiente
                              </span>
                            )}
                            {tech.liveTelemetry?.incident === 'traffic' && (
                              <span className="text-amber-600 dark:text-amber-400 font-sans flex items-center gap-0.5">
                                <Car size={10} /> Tránsito
                              </span>
                            )}
                            {tech.liveTelemetry?.incident === 'mechanical' && (
                              <span className="text-red-600 dark:text-red-400 font-sans flex items-center gap-0.5">
                                <Wrench size={10} /> Falla
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                          Sin destino asignado
                        </p>
                      )}
                    </div>

                    <ChevronRight
                      size={15}
                      className={`text-gray-400 shrink-0 self-center transition-transform ${
                        isSelected ? 'rotate-90 text-brand-500' : 'group-hover:translate-x-0.5'
                      }`}
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Columna Derecha: Mapa Interactivo Leaflet (65% -> col-span-8) */}
        <div className="lg:col-span-8 xl:col-span-8 relative min-h-[420px] lg:min-h-full bg-slate-100 dark:bg-slate-950">
          <MapContainer
            center={DEFAULT_MAP_CENTER}
            zoom={DEFAULT_MAP_ZOOM}
            scrollWheelZoom={true}
            className="w-full h-full min-h-[420px] lg:min-h-[580px] z-0"
          >
            <TileLayer
              url={TILES.url}
              attribution={TILES.attribution}
              className={isDark ? 'radar-dark-tiles' : ''}
            />

            <MapCameraHandler
              selectedTech={selectedTech}
              activeTechsWithCoords={activeTechsWithCoords}
              isFocusMode={isFocusMode}
            />

            {/* Marcadores de Todos los Técnicos o del Foco */}
            {consolidatedFleet.map((tech) => {
              const isSelected = selectedTechId === tech.id;
              const isDimmed = isFocusMode && !isSelected;

              // Renderizar marcador del Técnico si tiene coordenadas
              return (
                <React.Fragment key={tech.id}>
                  {tech.techCoords && (
                    <Marker
                      position={tech.techCoords}
                      icon={createTechIcon({
                        name: tech.name,
                        isSelected,
                        status: tech.activeOrder?.status,
                        isDimmed,
                      })}
                      eventHandlers={{
                        click: () => setSelectedTechId(tech.id),
                      }}
                    >
                      <Popup className="custom-popup">
                        <div className="text-xs p-1 space-y-1">
                          <p className="font-bold text-gray-900">{tech.name}</p>
                          <p className="text-gray-500 text-[10px]">{tech.phone || 'Sin teléfono'}</p>
                          {tech.activeOrder ? (
                            <p className="text-[11px] text-brand-600 font-medium">
                              Destino: {tech.activeOrder.client?.name || 'Cliente'}
                            </p>
                          ) : (
                            <p className="text-[10px] text-gray-400">Sin orden activa</p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Renderizar marcador de Destino si tiene orden y coordenadas */}
                  {tech.destCoords && (
                    <Marker
                      position={tech.destCoords}
                      icon={createDestIcon({ isSelected, isDimmed })}
                      eventHandlers={{
                        click: () => setSelectedTechId(tech.id),
                      }}
                    >
                      <Popup className="custom-popup">
                        <div className="text-xs p-1 space-y-1">
                          <p className="font-bold text-gray-900">
                            {tech.activeOrder?.client?.name || 'Destino'}
                          </p>
                          <p className="text-gray-500 text-[10px]">
                            {tech.locationInfo?.address || 'Dirección registrada'}
                          </p>
                          <p className="text-[11px] text-indigo-600 font-medium">
                            Asignado: {tech.name}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Polyline punteada que une Técnico con su Destino en Modo Foco */}
                  {isSelected && tech.techCoords && tech.destCoords && (
                    <Polyline
                      positions={[tech.techCoords, tech.destCoords]}
                      pathOptions={{
                        color: isDark ? '#38bdf8' : '#2563eb',
                        weight: 3.5,
                        dashArray: '7, 9',
                        opacity: 0.9,
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </MapContainer>

          {/* Tarjeta Flotante Superior en Modo Foco (Técnico -> Destino) */}
          {isFocusMode && selectedTech && (
            <div className="absolute top-3 left-3 right-3 z-[1000] pointer-events-auto animate-slide-down">
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-gray-200 dark:border-slate-700 rounded-xl p-3 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/40 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-300 font-bold text-sm shrink-0">
                    {(selectedTech.name || 'T')
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-gray-900 dark:text-white">
                        {selectedTech.name}
                      </span>
                      <span className="text-gray-400 text-xs">➔</span>
                      <span className="font-bold text-xs text-brand-600 dark:text-brand-400 truncate">
                        {selectedTech.activeOrder?.client?.name || 'Cliente'}
                      </span>
                      {selectedTech.activeOrder?.order_number && (
                        <span className="text-[10px] font-mono bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700">
                          #{selectedTech.activeOrder.order_number}
                        </span>
                      )}
                      {selectedTech.punctuality?.status === 'delayed' && (
                        <span className="badge bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[10px] py-0.2 font-semibold flex items-center gap-1">
                          <AlertCircle size={11} className="shrink-0 text-amber-600 dark:text-amber-400" />
                          <span>{selectedTech.punctuality.label}</span>
                        </span>
                      )}
                      {selectedTech.punctuality?.status === 'on_time' && (
                        <span className="badge bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] py-0.2 flex items-center gap-1">
                          <CheckCircle2 size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>En horario</span>
                        </span>
                      )}
                      {selectedTech.punctuality?.status === 'rescheduled' && (
                        <span className="badge bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] py-0.2 flex items-center gap-1">
                          <Clock size={11} className="shrink-0 text-slate-500 dark:text-slate-400" />
                          <span>{selectedTech.punctuality.label}</span>
                        </span>
                      )}
                      {selectedTech.isNear && (
                        <span className="badge bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] py-0.2 font-bold animate-pulse flex items-center gap-1">
                          <MapPin size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>En inmediaciones (&lt;150m)</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      <span className="truncate">{selectedTech.locationInfo?.address || 'Sin dirección cargada'}</span>
                      {selectedTech.distanceMeters !== null ? (
                        <span className="font-semibold text-brand-700 dark:text-brand-300">
                          • {formatDistance(selectedTech.distanceMeters)} ({formatEta(selectedTech.etaMinutes)}
                          {selectedTech.estimatedArrivalTime ? ` · ${selectedTech.estimatedArrivalTime} hs` : ''})
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          • GPS móvil pendiente
                        </span>
                      )}
                      {selectedTech.liveTelemetry?.battery !== null && selectedTech.liveTelemetry?.battery !== undefined && (
                        <span className="flex items-center gap-0.5 font-mono text-[10px] text-gray-400">
                          {selectedTech.liveTelemetry.batteryCharging ? (
                            <BatteryCharging size={12} className="text-emerald-500" />
                          ) : (
                            <Battery size={12} className="text-gray-400" />
                          )}
                          {selectedTech.liveTelemetry.battery}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Acciones de Modo Foco */}
                <div className="flex items-center gap-2 self-end md:self-auto shrink-0 flex-wrap">
                  {/* Botón de aviso rápido al Cliente por WhatsApp */}
                  {selectedTech.activeOrder && (
                    <a
                      href={generateWhatsAppTrackingUrl({
                        phone: selectedTech.activeOrder.client?.phone || selectedTech.activeOrder.plant?.contact_phone || '',
                        technicianName: selectedTech.name,
                        clientName: selectedTech.activeOrder.client?.name || selectedTech.activeOrder.plant?.name || '',
                        orderNumber: selectedTech.activeOrder.order_number,
                        address: selectedTech.locationInfo?.address,
                        distanceMeters: selectedTech.distanceMeters,
                        etaMinutes: selectedTech.etaMinutes,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                      title="Avisar llegada estimada al cliente por WhatsApp"
                    >
                      <Share2 size={12} />
                      <span>Avisar WhatsApp</span>
                    </a>
                  )}

                  {selectedTech.activeOrder && (
                    <button
                      type="button"
                      onClick={() => navigate(`/ordenes/${selectedTech.activeOrder.id}`)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <span>Ver Orden</span>
                      <ExternalLink size={13} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedTechId(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-700 transition-colors"
                  >
                    Ver toda la flota activa
                  </button>
                </div>
              </div>

              {/* Alerta de incidencia en ruta reportada por el técnico */}
              {selectedTech.liveTelemetry?.incident && (
                <div className="mt-1.5 bg-amber-50/90 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800/60 rounded-lg px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2 shadow-xs">
                  {selectedTech.liveTelemetry.incident === 'traffic' ? (
                    <Car size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Wrench size={14} className="shrink-0 text-red-500 dark:text-red-400" />
                  )}
                  <span>
                    <strong>Incidencia reportada por el técnico:</strong>{' '}
                    {selectedTech.liveTelemetry.incident === 'traffic'
                      ? 'Demorado por congestión vehicular pesada en ruta.'
                      : 'Reportó desperfecto técnico o mecánica en el vehículo.'}
                  </span>
                </div>
              )}

              {/* Alerta sutil si no hay coordenadas exactas */}
              {selectedTech.activeOrder && !selectedTech.destCoords && (
                <div className="mt-1.5 bg-amber-50/90 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800/60 rounded-lg px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2 shadow-xs">
                  <AlertCircle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    El destino no posee coordenadas GPS fijas guardadas. Se muestra la dirección
                    textual reportada en la orden.
                  </span>
                </div>
              )}

              {/* Aviso si el destino está en mapa pero el técnico aún no emitió señal GPS */}
              {selectedTech.activeOrder && selectedTech.destCoords && !selectedTech.techCoords && (
                <div className="mt-1.5 bg-slate-50/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2 shadow-xs">
                  <Navigation size={13} className="shrink-0 text-slate-500 dark:text-slate-400" />
                  <span>
                    Destino ubicado en el mapa. El pin del técnico se visualizará en tiempo real tan pronto su app móvil inicie viaje y emita señal GPS.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Badge discreto de estado de mapa cuando no hay foco */}
          {!isFocusMode && (
            <div className="absolute bottom-3 left-3 z-[1000] pointer-events-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs border border-gray-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-[10px] text-gray-500 dark:text-gray-400 shadow-xs flex items-center gap-1.5">
              <Compass size={12} className="text-gray-400" />
              <span>Hacé clic en cualquier técnico para aislar su recorrido</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
