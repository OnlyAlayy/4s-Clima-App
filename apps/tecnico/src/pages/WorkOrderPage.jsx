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
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-surface-dark-secondary flex items-center justify-center active:bg-surface-dark-tertiary transition-colors"
            aria-label="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white truncate">
              {wo.order_number || 'Orden de Trabajo'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`badge text-[10px] ${statusColors.bg} ${statusColors.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusColors.dot}`} />
                {getStatusLabel(wo.status)}
              </span>
              <span className="text-xs text-gray-500">
                {WORK_ORDER_TYPE_LABELS[wo.type]}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 animate-slide-up">
        {/* Programación */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-300">Programación</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500 text-xs">Fecha</span>
              <p className="text-white font-medium">{formatDate(wo.scheduled_date)}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Hora</span>
              <p className="text-white font-medium">{wo.scheduled_time || 'A confirmar'}</p>
            </div>
          </div>
        </div>

        {/* Cliente y planta */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-300">Cliente</h3>
          </div>
          <p className="text-white font-semibold text-base mb-2">
            {wo.client?.name || 'N/D'}
          </p>
          {wo.plant && (
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2 text-gray-400">
                <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  {wo.plant.name}
                  {wo.plant.address && ` — ${wo.plant.address}`}
                  {wo.plant.floor && `, Piso ${wo.plant.floor}`}
                </span>
              </div>
              {wo.plant.contact_phone && (
                <a
                  href={`tel:${wo.plant.contact_phone}`}
                  className="flex items-center gap-2 text-brand-400 active:text-brand-300"
                >
                  <Phone size={14} />
                  <span>{wo.plant.contact_name || 'Contacto'}: {wo.plant.contact_phone}</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Equipo */}
        {wo.equipment && (
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={16} className="text-brand-400" />
              <h3 className="text-sm font-semibold text-gray-300">Equipo</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Tipo</span>
                <span className="text-white font-medium">
                  {EQUIPMENT_TYPE_LABELS[wo.equipment.type] || wo.equipment.type}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Marca / Modelo</span>
                <span className="text-white font-medium">
                  {wo.equipment.brand} {wo.equipment.model}
                </span>
              </div>
              {wo.equipment.serial_number && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Hash size={12} /> Serie
                  </span>
                  <span className="text-white font-mono text-xs">
                    {wo.equipment.serial_number}
                  </span>
                </div>
              )}
              {wo.equipment.capacity_btu && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Thermometer size={12} /> Capacidad
                  </span>
                  <span className="text-white font-medium">
                    {wo.equipment.capacity_btu.toLocaleString()} BTU
                  </span>
                </div>
              )}
              {wo.equipment.location_description && (
                <p className="text-gray-500 text-xs mt-2 italic">
                  📍 {wo.equipment.location_description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Observaciones */}
        {wo.observations && (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Observaciones</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{wo.observations}</p>
          </div>
        )}
      </div>

      {/* Acciones fijas en el bottom */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-4 pt-2 bg-gradient-to-t from-surface-dark via-surface-dark to-transparent z-20">
        <div className="max-w-lg mx-auto">
          {/* Botón iniciar trabajo */}
          {isPending && (
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="btn-primary w-full text-base"
            >
              {isStarting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                className="btn-success w-full text-base"
              >
                <ClipboardCheck size={20} />
                Completar Checklist
                <ChevronRight size={18} />
              </button>
              
              <button
                onClick={() => navigate(`/orden/${id}/extras`)}
                className="btn-secondary w-full text-base bg-surface-dark-secondary hover:bg-surface-dark-tertiary border border-surface-dark-tertiary"
              >
                <Package size={20} className="text-gray-400" />
                Agregar Material Extra
                <ChevronRight size={18} className="text-gray-500 ml-auto" />
              </button>
            </div>
          )}

          {/* Orden completada */}
          {isCompleted && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 text-center">
              <p className="text-emerald-400 font-semibold">✅ Trabajo Finalizado</p>
              <p className="text-emerald-400/60 text-xs mt-1">
                Completado el {formatDate(wo.completed_at)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
