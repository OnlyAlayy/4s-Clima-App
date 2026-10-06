import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Phone, Clock, Wrench, Building2,
  ClipboardCheck, Play, ChevronRight, Thermometer, Hash, Package
} from 'lucide-react';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { formatDate, getStatusLabel, getStatusColor } from '@4s-clima/shared/utils';
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE_LABELS, EQUIPMENT_TYPE_LABELS } from '@4s-clima/shared/constants';

/**
 * Página de detalle de una Orden de Trabajo.
 * Muestra toda la info del cliente, planta, equipo.
 * Botón para iniciar el trabajo y acceder al checklist.
 */
export default function WorkOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrder, isLoading, fetchWorkOrder, startWorkOrder } = useWorkOrderStore();
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    fetchWorkOrder(id);
  }, [id, fetchWorkOrder]);

  const handleStart = async () => {
    setIsStarting(true);
    await startWorkOrder(id);
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
  const isInProgress = wo.status === WORK_ORDER_STATUS.IN_PROGRESS;
  const isPending = wo.status === WORK_ORDER_STATUS.PENDING;
  const isCompleted = wo.status === WORK_ORDER_STATUS.COMPLETED;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header bg-gray-50/90 backdrop-blur-xl border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm"
            aria-label="Volver"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">
              {wo.order_number || 'Orden de Trabajo'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`badge text-[10px] shadow-sm border ${
                wo.status === WORK_ORDER_STATUS.IN_PROGRESS 
                  ? 'bg-brand-50 text-brand-700 border-brand-200' 
                  : wo.status === WORK_ORDER_STATUS.COMPLETED
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}>
                {getStatusLabel(wo.status)}
              </span>
              <span className="text-xs font-semibold text-gray-500">
                {WORK_ORDER_TYPE_LABELS[wo.type]}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 animate-slide-up">
        {/* Programación */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
            <Clock size={18} className="text-brand-500" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Programación</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Fecha</span>
              <p className="text-slate-900 font-bold">{formatDate(wo.scheduled_date)}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Hora</span>
              <p className="text-slate-900 font-bold">{wo.scheduled_time ? `${wo.scheduled_time.slice(0, 5)} hs` : 'A confirmar'}</p>
            </div>
          </div>
        </div>

        {/* Cliente y planta */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
            <Building2 size={18} className="text-brand-500" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Cliente</h3>
          </div>
          <p className="text-slate-900 font-bold text-lg mb-3">
            {wo.client?.name || 'N/D'}
          </p>
          {wo.plant && (
            <div className="space-y-3 text-sm bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-start gap-2 text-gray-600 font-medium">
                <MapPin size={16} className="mt-0.5 flex-shrink-0 text-gray-500" />
                <span>
                  {wo.plant.name}
                  {wo.plant.address && ` — ${wo.plant.address}`}
                  {wo.plant.floor && `, Piso ${wo.plant.floor}`}
                </span>
              </div>
              {wo.plant.contact_phone && (
                <a
                  href={`tel:${wo.plant.contact_phone}`}
                  className="flex items-center gap-2 text-brand-600 font-semibold hover:text-brand-700 active:text-brand-800"
                >
                  <Phone size={16} />
                  <span>{wo.plant.contact_name || 'Contacto'}: {wo.plant.contact_phone}</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Equipo */}
        {wo.equipment && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <Wrench size={18} className="text-brand-500" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Equipo</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Tipo</span>
                <span className="text-slate-900 font-bold">
                  {EQUIPMENT_TYPE_LABELS[wo.equipment.type] || wo.equipment.type}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Marca / Modelo</span>
                <span className="text-slate-900 font-bold">
                  {wo.equipment.brand} {wo.equipment.model}
                </span>
              </div>
              {wo.equipment.serial_number && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium flex items-center gap-1.5">
                    <Hash size={14} className="text-gray-500" /> Serie
                  </span>
                  <span className="text-slate-900 font-mono font-bold bg-gray-100 px-2 py-0.5 rounded-md text-xs border border-gray-200">
                    {wo.equipment.serial_number}
                  </span>
                </div>
              )}
              {wo.equipment.capacity_btu && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium flex items-center gap-1.5">
                    <Thermometer size={14} className="text-gray-500" /> Capacidad
                  </span>
                  <span className="text-slate-900 font-bold">
                    {wo.equipment.capacity_btu.toLocaleString()} BTU
                  </span>
                </div>
              )}
              {wo.equipment.location_description && (
                <div className="mt-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex items-start gap-2">
                  <span className="text-lg">📍</span>
                  <p className="text-blue-800 text-xs font-semibold leading-relaxed mt-0.5">
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
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2 pb-2 border-b border-gray-100">Observaciones</h3>
            <p className="text-gray-600 text-sm leading-relaxed font-medium">{wo.observations}</p>
          </div>
        )}
      </div>

      {/* Acciones fijas en el bottom */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent z-20">
        <div className="max-w-lg mx-auto">
          {/* Botón iniciar trabajo */}
          {isPending && (
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="btn-primary w-full shadow-lg shadow-brand-500/20"
            >
              {isStarting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <Play size={20} />
                  Llegada a Planta
                </>
              )}
            </button>
          )}

          {/* Botón ir al checklist */}
          {isInProgress && (
            <div className="space-y-3">
              <button
                onClick={() => navigate(`/orden/${id}/checklist`)}
                className="btn-success w-full shadow-lg shadow-emerald-500/20"
              >
                <ClipboardCheck size={20} />
                Completar Checklist
                <ChevronRight size={18} />
              </button>
              
              <button
                onClick={() => navigate(`/orden/${id}/extras`)}
                className="btn-secondary w-full"
              >
                <Package size={20} className="text-gray-500" />
                Agregar Material Extra
                <ChevronRight size={18} className="text-gray-500 ml-auto" />
              </button>
            </div>
          )}

          {/* Orden completada */}
          {isCompleted && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4 text-center shadow-sm">
              <p className="text-emerald-700 font-bold flex items-center justify-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs">✓</span> 
                Trabajo Finalizado
              </p>
              <p className="text-emerald-600/80 font-medium text-xs mt-1.5">
                Completado el {formatDate(wo.completed_at)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
