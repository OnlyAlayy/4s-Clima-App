import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Phone, Clock, Wrench, Building2,
  ClipboardCheck, Play, ChevronRight, Thermometer, Hash, Package, Check, Navigation, Camera
} from 'lucide-react';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { formatDate, getStatusLabel, getStatusColor, resolveOrderLocation } from '@4s-clima/shared';
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE_LABELS, EQUIPMENT_TYPE_LABELS } from '@4s-clima/shared/constants';
import LocationViewerMap from '../components/geo/LocationViewerMap';
import LiveTrackingSender from '../components/geo/LiveTrackingSender';
import nativeLocationTracker from '../services/nativeLocationTracker';

/**
 * Página de detalle de una Orden de Trabajo.
 * Muestra toda la info del cliente, planta, equipo.
 * Botón para iniciar el trabajo y acceder al checklist.
 */
export default function WorkOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrder, isLoading, fetchWorkOrder, startTravel, arriveAtPlant } = useWorkOrderStore();
  const [isStarting, setIsStarting] = useState(false);
  const [techLocation, setTechLocation] = useState(null);

  useEffect(() => {
    fetchWorkOrder(id);
  }, [id, fetchWorkOrder]);

  const handleStartTravel = async () => {
    setIsStarting(true);
    try {
      await nativeLocationTracker.requestPermissions();
    } catch (e) {
      console.warn('GPS permission prompt note:', e);
    }
    await startTravel(id);
    await fetchWorkOrder(id);
    setIsStarting(false);
  };

  const handleArriveAtPlant = async () => {
    setIsStarting(true);
    await arriveAtPlant(id);
    await fetchWorkOrder(id);
    setIsStarting(false);
  };

  if (isLoading || !currentOrder) {
    return (
      <div className="page-container">
        <div className="space-y-4 pt-16">
          <div className="skeleton h-8 w-48 rounded-xl" />
          <div className="skeleton h-32 rounded-2xl" />
          <div className="skeleton h-32 rounded-2xl" />
          <div className="skeleton h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  const wo = currentOrder;
  const statusColors = getStatusColor(wo.status);
  const isPending = !wo.status || wo.status === WORK_ORDER_STATUS.PENDING || wo.status === 'unassigned';
  const isTraveling = wo.status === WORK_ORDER_STATUS.TRAVELING;
  const isInProgress = wo.status === WORK_ORDER_STATUS.IN_PROGRESS;
  const isCompleted = wo.status === WORK_ORDER_STATUS.COMPLETED;
  const loc = resolveOrderLocation(wo);

  // Verificación del flujo ordenado de evidencia
  const isSurveyOrDiagnostic = Boolean(
    wo.is_survey_only ||
    wo.type === 'survey' ||
    wo.type === 'diagnostic' ||
    wo.type === 'technical_visit' ||
    wo.type === 'relevamiento' ||
    wo.type === 'evaluacion'
  );

  const hasBeforePhoto = wo.photos?.some((p) => p.type === 'before');
  const hasAfterPhoto = wo.photos?.some((p) => p.type === 'after');
  const isChecklistSubmitted = wo.checklist_status === 'submitted';

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header bg-gray-50/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-800 active:bg-gray-100 dark:active:bg-slate-700 transition-colors shadow-sm"
            aria-label="Volver"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {wo.order_number || 'Orden de Trabajo'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`badge text-[10px] shadow-sm border ${isTraveling
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800 animate-pulse'
                  : isInProgress
                    ? 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-800'
                    : isCompleted
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : 'bg-white text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700'
                }`}>
                {getStatusLabel(wo.status)}
              </span>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {WORK_ORDER_TYPE_LABELS[wo.type]}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 animate-slide-up">
        {/* Programación */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-slate-800">
            <Clock size={18} className="text-brand-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Programación</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide block mb-1">Fecha</span>
              <p className="text-slate-900 dark:text-white font-bold">{formatDate(wo.scheduled_date)}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide block mb-1">Hora</span>
              <p className="text-slate-900 dark:text-white font-bold">{wo.scheduled_time ? `${wo.scheduled_time.slice(0, 5)} hs` : 'A confirmar'}</p>
            </div>
          </div>
        </div>

        {/* Cliente y planta */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-slate-800">
            <Building2 size={18} className="text-brand-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Cliente</h3>
          </div>
          <p className="text-slate-900 dark:text-white font-bold text-lg mb-3">
            {wo.client?.name || 'N/D'}
          </p>
          {/* Información de la ubicación y contacto */}
          {loc.address && (
            <div className="space-y-3 text-sm bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 border border-gray-100 dark:border-slate-800 mb-3">
              <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300 font-medium">
                <MapPin size={16} className="mt-0.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                <span>
                  {loc.label}
                  {loc.address && ` — ${loc.address}`}
                  {loc.floor && `, Piso ${loc.floor}`}
                </span>
              </div>
              {wo.plant?.contact_phone && (
                <a
                  href={`tel:${wo.plant.contact_phone}`}
                  className="flex items-center gap-2 text-brand-600 dark:text-brand-400 font-semibold hover:text-brand-700 dark:hover:text-brand-300 active:text-brand-800"
                >
                  <Phone size={16} />
                  <span>{wo.plant.contact_name || 'Contacto'}: {wo.plant.contact_phone}</span>
                </a>
              )}
            </div>
          )}

          {/* Visor de mapa con destino y técnico en vivo (ambos visibles en viaje) */}
          <LocationViewerMap
            latitude={loc.latitude}
            longitude={loc.longitude}
            address={loc.address}
            title={loc.label}
            height={isTraveling ? "260px" : "180px"}
            currentLocation={isTraveling ? techLocation : null}
          />

          {/* Radar emisor de Live Tracking: SOLO ACTIVO MIENTRAS VIAJA (traveling) */}
          <LiveTrackingSender
            orderId={wo.id}
            isActive={isTraveling}
            technicianName="Técnico"
            destinationCoords={{ latitude: loc.latitude, longitude: loc.longitude }}
            clientName={wo.client?.name || wo.plant?.name || ''}
            onLocationUpdate={(coords) => setTechLocation(coords)}
          />

          {/* Banner informativo de estado de viaje / en sitio */}
          {isTraveling && (
            <div className="mt-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-3 text-xs text-indigo-900 dark:text-indigo-200 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Navigation size={16} className="text-indigo-600 dark:text-indigo-400 animate-pulse shrink-0" />
                <span>
                  <strong>Viaje en curso:</strong> Tu ubicación se transmite en tiempo real al panel central.
                </span>
              </div>
              {loc.address && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    loc.latitude && loc.longitude ? `${loc.latitude},${loc.longitude}` : loc.address
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-[11px] shrink-0 transition-colors shadow-sm"
                >
                  Abrir GPS
                </a>
              )}
            </div>
          )}

          {isInProgress && (
            <div className="mt-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-2.5 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
              <Check size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                <strong>En sitio (Planta):</strong> GPS apagado para ahorrar batería y datos.
              </span>
            </div>
          )}
        </div>

        {/* Equipo */}
        {wo.equipment && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-slate-800">
              <Wrench size={18} className="text-brand-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Equipo</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400 font-medium">Tipo</span>
                <span className="text-slate-900 dark:text-white font-bold">
                  {EQUIPMENT_TYPE_LABELS[wo.equipment.type] || wo.equipment.type}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400 font-medium">Marca / Modelo</span>
                <span className="text-slate-900 dark:text-white font-bold">
                  {wo.equipment.brand} {wo.equipment.model}
                </span>
              </div>
              {wo.equipment.serial_number && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
                    <Hash size={14} className="text-gray-500 dark:text-gray-400" /> Serie
                  </span>
                  <span className="text-slate-900 dark:text-white font-mono font-bold bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-xs border border-gray-200 dark:border-slate-700">
                    {wo.equipment.serial_number}
                  </span>
                </div>
              )}
              {wo.equipment.capacity_btu && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
                    <Thermometer size={14} className="text-gray-500 dark:text-gray-400" /> Capacidad
                  </span>
                  <span className="text-slate-900 dark:text-white font-bold">
                    {wo.equipment.capacity_btu.toLocaleString()} BTU
                  </span>
                </div>
              )}
              {wo.equipment.location_description && (
                <div className="mt-3 bg-blue-50/50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800/50 flex items-start gap-2">
                  <MapPin size={18} className="text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-blue-800 dark:text-blue-300 text-xs font-semibold leading-relaxed mt-0.5">
                    {wo.equipment.location_description}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Observaciones */}
        {wo.observations && (
          <div className="card">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2 pb-2 border-b border-gray-100 dark:border-slate-800">Observaciones</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed font-medium">{wo.observations}</p>
          </div>
        )}
      </div>

      {/* Acciones fijas en el bottom */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-4 bg-gradient-to-t from-gray-50 via-gray-50 dark:from-slate-950 dark:via-slate-950 to-transparent z-20 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          {/* PASO 1: Iniciar Viaje (Pasa a traveling y enciende el GPS) */}
          {isPending && (
            <button
              onClick={handleStartTravel}
              disabled={isStarting}
              className="btn-primary w-full shadow-lg shadow-indigo-500/25 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white flex items-center justify-center gap-2"
            >
              {isStarting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  Iniciando viaje...
                </>
              ) : (
                <>
                  <Navigation size={20} />
                  Iniciar Viaje (En Camino)
                </>
              )}
            </button>
          )}

          {/* PASO 2: Llegada a Planta (Pasa a in_progress y apaga el GPS) */}
          {isTraveling && (
            <button
              onClick={handleArriveAtPlant}
              disabled={isStarting}
              className="btn-primary w-full shadow-lg shadow-brand-500/25 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white flex items-center justify-center gap-2"
            >
              {isStarting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  Registrando llegada...
                </>
              ) : (
                <>
                  <Building2 size={20} />
                  Llegada a Planta (En Sitio)
                </>
              )}
            </button>
          )}

          {/* PASO 3: En progreso (Flujo ordenado: Fotos Antes -> Checklist -> Fotos Después -> Firma) */}
          {isInProgress && (
            <div className="space-y-2.5">
              {!hasBeforePhoto ? (
                /* 1. Obligatorio tomar fotos de inicio o relevamiento */
                <button
                  onClick={() => navigate(`/orden/${id}/fotos-antes`)}
                  className="btn-primary w-full shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 py-3.5 text-sm font-bold"
                >
                  <Camera size={18} />
                  <span>
                    {isSurveyOrDiagnostic
                      ? '1. Tomar Fotos de Relevamiento (Obligatorio)'
                      : '1. Tomar Fotos del Antes (Obligatorio)'}
                  </span>
                  <ChevronRight size={18} />
                </button>
              ) : !isChecklistSubmitted ? (
                /* 2. Completar checklist una vez tomadas las fotos iniciales */
                <button
                  onClick={() => navigate(`/orden/${id}/checklist`)}
                  className="btn-success w-full shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 py-3.5 text-sm font-bold"
                >
                  <ClipboardCheck size={18} />
                  <span>2. Completar Checklist</span>
                  <ChevronRight size={18} />
                </button>
              ) : !hasAfterPhoto && !isSurveyOrDiagnostic ? (
                /* 3. Tomar fotos del después (Obligatorio para preventivos / instalaciones) */
                <button
                  onClick={() => navigate(`/orden/${id}/fotos-despues`)}
                  className="btn-primary w-full shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 py-3.5 text-sm font-bold"
                >
                  <Camera size={18} />
                  <span>3. Tomar Fotos del Después (Obligatorio)</span>
                  <ChevronRight size={18} />
                </button>
              ) : (
                /* 4. Pasar a firma del cliente (Habilitado directamente si es relevamiento o si ya cargó fotos después) */
                <div className="space-y-2">
                  <button
                    onClick={() => navigate(`/orden/${id}/firma`)}
                    className="btn-success w-full shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 py-3.5 text-sm font-bold"
                  >
                    <Check size={18} />
                    <span>
                      {isSurveyOrDiagnostic
                        ? '3. Firma del Cliente (Finalizar Relevamiento)'
                        : '4. Firma del Cliente (Finalizar)'}
                    </span>
                    <ChevronRight size={18} />
                  </button>

                  {/* En modo relevamiento sin fotos posteriores, dar acceso secundario opcional a agregarlas */}
                  {isSurveyOrDiagnostic && !hasAfterPhoto && (
                    <button
                      onClick={() => navigate(`/orden/${id}/fotos-despues`)}
                      className="w-full py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Camera size={14} />
                      <span>Agregar fotos del estado final (Opcional)</span>
                    </button>
                  )}
                </div>
              )}

              {/* Botón secundario para materiales y repuestos */}
              <button
                onClick={() => navigate(`/orden/${id}/extras`)}
                className="btn-secondary w-full py-2.5 text-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <Package size={16} />
                  <span>Relevar Materiales / Insumos</span>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            </div>
          )}

          {/* PASO 4: Orden completada */}
          {isCompleted && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4 text-center shadow-sm">
              <p className="text-emerald-700 font-bold flex items-center justify-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Check size={14} />
                </span>
                Trabajo Finalizado
              </p>
              <p className="text-emerald-600/80 font-medium text-xs mt-1.5">
                Completado el {formatDate(wo.completed_at)}
              </p>
            </div>
          )}

          {/* Fallback si el estado es desconocido */}
          {!isPending && !isTraveling && !isInProgress && !isCompleted && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-center shadow-sm">
              <p className="text-amber-700 font-bold mb-2">Estado detectado: "{wo.status || 'ninguno'}"</p>
              <button
                onClick={handleArriveAtPlant}
                disabled={isStarting}
                className="btn-primary w-full shadow-lg shadow-amber-500/20"
              >
                Forzar Inicio de Trabajo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
