import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, ChevronRight, MapPin, Wrench, AlertCircle, ChevronDown } from 'lucide-react';
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

  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (profile?.id) {
      fetchWorkOrders(profile.id);

      const handleUpdate = () => {
        fetchWorkOrders(profile.id);
      };

      window.addEventListener('work_orders_updated', handleUpdate);
      return () => window.removeEventListener('work_orders_updated', handleUpdate);
    }
  }, [profile?.id, fetchWorkOrders]);

  // Agrupar OTs
  const inProgress = workOrders.filter(
    (wo) => wo.status === WORK_ORDER_STATUS.IN_PROGRESS
  );
  const pending = workOrders.filter(
    (wo) => wo.status === WORK_ORDER_STATUS.PENDING
  );
  
  const displayedPending = pending.slice(0, page * itemsPerPage);
  const hasMore = displayedPending.length < pending.length;

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
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{greeting()}</p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {profile?.name || 'Técnico'}
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 shadow-sm">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">En línea</span>
          </div>
        </div>
      </div>

      {/* Resumen del día */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card flex flex-col items-center py-5">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mb-3">
            <ClipboardList size={24} className="text-brand-600 dark:text-brand-400" />
          </div>
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{workOrders.length}</span>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1">Asignadas</span>
        </div>
        <div className="card flex flex-col items-center py-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-3">
            <Clock size={24} className="text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{inProgress.length}</span>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1">En Progreso</span>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-3xl" />
          ))}
        </div>
      )}

      {/* Sin órdenes */}
      {!isLoading && workOrders.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-5">
            <ClipboardList size={36} className="text-gray-500 dark:text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Sin trabajos pendientes</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No tenés órdenes de trabajo asignadas por ahora.
          </p>
        </div>
      )}

      {/* Órdenes en progreso */}
      {inProgress.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-bold text-brand-600 uppercase tracking-wider mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></div>
            En Progreso
          </h2>
          <div className="space-y-4">
            {inProgress.map((wo) => (
              <WorkOrderCard key={wo.id} order={wo} onClick={() => navigate(`/orden/${wo.id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Órdenes pendientes */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock size={16} className="text-amber-500" />
            Pendientes ({pending.length})
          </h2>
          <div className="space-y-4">
            {displayedPending.map((wo) => (
              <WorkOrderCard key={wo.id} order={wo} onClick={() => navigate(`/orden/${wo.id}`)} />
            ))}
          </div>
          
          {hasMore && (
            <button
              onClick={() => setPage(p => p + 1)}
              className="mt-6 w-full py-4 flex items-center justify-center gap-2 text-sm font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 rounded-2xl active:bg-brand-100 dark:active:bg-brand-900/50 transition-colors"
            >
              Cargar más órdenes
              <ChevronDown size={18} />
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Card de orden de trabajo.
 */
function WorkOrderCard({ order, onClick }) {
  const isProgress = order.status === WORK_ORDER_STATUS.IN_PROGRESS;
  return (
    <button
      onClick={onClick}
      className="card-pressable w-full text-left flex flex-col"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`badge ${isProgress ? 'bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-800' : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700'}`}>
              {getStatusLabel(order.status)}
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {WORK_ORDER_TYPE_LABELS[order.type] || order.type}
            </span>
          </div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white truncate">
            {order.client?.name || 'Cliente sin nombre'}
          </h3>
          <span className="text-xs font-mono font-medium text-gray-500 dark:text-gray-400 mt-0.5 block">
            {order.order_number}
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-4 mt-1">
        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
          <MapPin size={16} className="text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-1">{order.plant?.name || order.plant?.address || '-'}</span>
        </div>
        {order.equipment && (
          <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Wrench size={16} className="text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
            <span>{order.equipment.brand} {order.equipment.model}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-100/80 dark:border-slate-800">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
          <Clock size={16} className={isProgress ? "text-brand-500 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"} />
          <span>
            {formatDate(order.scheduled_date)}{order.scheduled_time ? ` • ${order.scheduled_time.slice(0, 5)} hs` : ''}
          </span>
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-brand-50 dark:group-hover:bg-brand-900/30 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
          <ChevronRight size={18} className="text-gray-500 dark:text-gray-400 group-hover:text-brand-600 dark:group-hover:text-brand-400" />
        </div>
      </div>

      {order.synced === false && (
        <div className="mt-4 pt-3 border-t border-amber-100 flex items-center gap-2 text-xs font-semibold text-amber-600 bg-amber-50 -mx-5 -mb-5 px-5 pb-4">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Pendiente de sincronización
        </div>
      )}
    </button>
  );
}
