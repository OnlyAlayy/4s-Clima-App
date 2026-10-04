import { useEffect, useState } from 'react';
import {
  ClipboardList, Users, Building2, DollarSign,
  TrendingUp, Clock, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { WORK_ORDER_STATUS } from '@4s-clima/shared/constants';
import { formatDate, formatCurrency, getStatusLabel, getStatusColor } from '@4s-clima/shared/utils';

/**
 * Dashboard administrativo.
 * Vista general con KPIs, trabajos recientes y extras pendientes de facturar.
 */
export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    completedToday: 0,
    inProgress: 0,
    unbilledExtras: 0,
    unbilledTotal: 0,
    totalClients: 0,
    totalTechnicians: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboard();

    // Suscripción en tiempo real a cambios en work_orders
    const channel = supabase
      .channel('dashboard-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => loadDashboard()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'extras' },
        () => loadDashboard()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadDashboard() {
    try {
      const startOfLocalDay = new Date();
      startOfLocalDay.setHours(0, 0, 0, 0);
      const startOfLocalDayUTC = startOfLocalDay.toISOString();

      // Contar OTs
      const [
        { count: totalOrders },
        { count: completedToday },
        { count: inProgress },
        { data: unbilledExtrasData },
        { count: totalClients },
        { count: totalTechnicians },
        { data: recent },
      ] = await Promise.all([
        supabase.from('work_orders').select('*', { count: 'exact', head: true }),
        supabase.from('work_orders').select('*', { count: 'exact', head: true })
          .eq('status', WORK_ORDER_STATUS.COMPLETED)
          .gte('completed_at', startOfLocalDayUTC),
        supabase.from('work_orders').select('*', { count: 'exact', head: true })
          .eq('status', WORK_ORDER_STATUS.IN_PROGRESS),
        supabase.from('extras').select('quantity, unit_price')
          .eq('billed', false),
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true })
          .eq('role', 'tecnico'),
        supabase.from('work_orders')
          .select(`
            *,
            client:clients(name),
            assigned:users!work_orders_assigned_to_fkey(name)
          `)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      const unbilledTotal = (unbilledExtrasData || []).reduce(
        (sum, e) => sum + (e.quantity || 0) * (e.unit_price || 0),
        0
      );

      setStats({
        totalOrders: totalOrders || 0,
        completedToday: completedToday || 0,
        inProgress: inProgress || 0,
        unbilledExtras: unbilledExtrasData?.length || 0,
        unbilledTotal,
        totalClients: totalClients || 0,
        totalTechnicians: totalTechnicians || 0,
      });

      setRecentOrders(recent || []);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Resumen general del día — {formatDate(new Date())}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="stat-card">
          <div className="stat-icon bg-blue-50">
            <ClipboardList size={22} className="text-blue-500" />
          </div>
          <div>
            <div className="stat-value">{stats.totalOrders}</div>
            <div className="stat-label">Órdenes Totales</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-emerald-50">
            <CheckCircle2 size={22} className="text-emerald-500" />
          </div>
          <div>
            <div className="stat-value">{stats.completedToday}</div>
            <div className="stat-label">Completadas Hoy</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-amber-50">
            <Clock size={22} className="text-amber-500" />
          </div>
          <div>
            <div className="stat-value">{stats.inProgress}</div>
            <div className="stat-label">En Progreso</div>
          </div>
        </div>

        <div className="stat-card border-red-200 bg-red-50/30">
          <div className="stat-icon bg-red-100">
            <DollarSign size={22} className="text-red-500" />
          </div>
          <div>
            <div className="stat-value text-red-600">
              {stats.unbilledExtras}
            </div>
            <div className="stat-label text-red-500">
              Extras Sin Facturar
            </div>
            {stats.unbilledTotal > 0 && (
              <div className="text-xs font-semibold text-red-600 mt-0.5">
                {formatCurrency(stats.unbilledTotal)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="stat-card">
          <div className="stat-icon bg-purple-50">
            <Building2 size={22} className="text-purple-500" />
          </div>
          <div>
            <div className="stat-value">{stats.totalClients}</div>
            <div className="stat-label">Clientes Activos</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-cyan-50">
            <Users size={22} className="text-cyan-500" />
          </div>
          <div>
            <div className="stat-value">{stats.totalTechnicians}</div>
            <div className="stat-label">Técnicos</div>
          </div>
        </div>
      </div>

      {/* Trabajos recientes */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Trabajos Recientes</h2>
          <a href="/ordenes" className="text-sm text-brand-500 hover:text-brand-600 font-medium">
            Ver todos →
          </a>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            No hay órdenes de trabajo aún.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Cliente</th>
                  <th>Técnico</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const sc = getStatusColor(order.status);
                  return (
                    <tr key={order.id}>
                      <td className="font-mono text-xs text-gray-600">
                        {order.order_number || order.id?.slice(0, 8)}
                      </td>
                      <td className="font-medium text-gray-900">
                        {order.client?.name || '-'}
                      </td>
                      <td className="text-gray-600">
                        {order.assigned?.name || '-'}
                      </td>
                      <td>
                        <span className={`badge ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td className="text-gray-500 text-xs">
                        {formatDate(order.scheduled_date)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
