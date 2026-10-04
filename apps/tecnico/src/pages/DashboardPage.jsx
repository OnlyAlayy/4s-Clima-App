import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, ChevronRight, MapPin, Wrench, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { formatDate, formatTime, getStatusLabel, getStatusColor } from '@4s-clima/shared/utils';
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE_LABELS } from '@4s-clima/shared/constants';

/**
 * Dashboard del técnico - vista principal.
 * Muestra el saludo, resumen del día y lista de órdenes de trabajo asignadas.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { workOrders, isLoading, fetchWorkOrders } = useWorkOrderStore();

  useEffect(() => {
    if (profile?.id) {
      fetchWorkOrders(profile.id);
    }
  }, [profile?.id, fetchWorkOrders]);

  // Agrupar OTs
  const inProgress = workOrders.filter(
    (wo) => wo.status === WORK_ORDER_STATUS.IN_PROGRESS
  );
  const pending = workOrders.filter(
    (wo) => wo.status === WORK_ORDER_STATUS.PENDING
  );

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">{greeting()}</p>
            <h1 className="text-xl font-bold text-white">
              {profile?.name || 'Técnico'}
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-surface-dark-secondary rounded-full px-3 py-1.5 border border-white/10">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-soft" />
            <span className="text-xs text-gray-400">En línea</span>
          </div>
        </div>
      </div>

      {/* Resumen del día */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card flex flex-col items-center py-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-2">
            <ClipboardList size={20} className="text-blue-400" />
          </div>
          <span className="text-2xl font-bold text-white">{workOrders.length}</span>
          <span className="text-xs text-gray-500">Asignadas</span>
        </div>
        <div className="card flex flex-col items-center py-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-2">
            <Clock size={20} className="text-amber-400" />
          </div>
          <span className="text-2xl font-bold text-white">{inProgress.length}</span>
          <span className="text-xs text-gray-500">En Progreso</span>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Sin órdenes */}
      {!isLoading && workOrders.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-dark-secondary flex items-center justify-center mb-4">
            <ClipboardList size={32} className="text-gray-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-400">Sin trabajos pendientes</h3>
          <p className="text-sm text-gray-600 mt-1">
            No tenés órdenes de trabajo asignadas por ahora.
          </p>
        </div>
      )}

      {/* Órdenes en progreso */}
      {inProgress.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertCircle size={14} className="text-blue-400" />
            En Progreso
          </h2>
          <div className="space-y-3">
            {inProgress.map((wo) => (
              <WorkOrderCard key={wo.id} order={wo} onClick={() => navigate(`/orden/${wo.id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Órdenes pendientes */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock size={14} className="text-amber-400" />
            Pendientes
          </h2>
          <div className="space-y-3">
            {pending.map((wo) => (
              <WorkOrderCard key={wo.id} order={wo} onClick={() => navigate(`/orden/${wo.id}`)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Card de orden de trabajo.
 */
function WorkOrderCard({ order, onClick }) {
  const statusColors = getStatusColor(order.status);

  return (
    <button
      onClick={onClick}
      className="card-pressable w-full text-left animate-fade-in"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`badge ${statusColors.bg} ${statusColors.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusColors.dot}`} />
              {getStatusLabel(order.status)}
            </span>
            <span className="text-xs text-gray-500">
              {WORK_ORDER_TYPE_LABELS[order.type] || order.type}
            </span>
          </div>
          <h3 className="font-semibold text-white truncate">
            {order.client?.name || 'Cliente'}
          </h3>
        </div>
        <ChevronRight size={20} className="text-gray-600 mt-1 flex-shrink-0" />
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <MapPin size={12} />
          <span className="truncate">{order.plant?.name || order.plant?.address || '-'}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span>
            {formatDate(order.scheduled_date)}{order.scheduled_time ? ` a las ${order.scheduled_time.slice(0, 5)} hs` : ''}
          </span>
        </div>
      </div>

      {order.equipment && (
        <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
          <Wrench size={12} />
          <span>{order.equipment.brand} {order.equipment.model}</span>
        </div>
      )}

      {/* Indicador de no sincronizado */}
      {order.synced === false && (
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-500">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse-soft" />
          Pendiente de sincronización
        </div>
      )}
    </button>
  );
}
