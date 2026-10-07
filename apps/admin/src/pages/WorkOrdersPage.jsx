import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, FileText, Download, LayoutList, LayoutGrid } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatDate, getStatusLabel, getStatusColor } from '@4s-clima/shared/utils';
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE_LABELS } from '@4s-clima/shared/constants';
import CreateWorkOrderModal from '../components/CreateWorkOrderModal';
import { generateWorkOrderPDF } from '../services/pdfService';
import WorkOrdersKanban from '../components/WorkOrdersKanban';

/**
 * Página de listado de Órdenes de Trabajo.
 * Filtrable por estado, tipo y búsqueda. Soporta vista de Lista y Tablero Kanban.
 */
export default function WorkOrdersPage() {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'kanban'
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('this_week'); // 'all' | 'today' | 'this_week' | 'this_month'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(null); // Guarda el id de la orden descargando

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;

  // Efecto principal de carga (se dispara al cambiar filtros, pagina o modo de vista)
  useEffect(() => {
    loadOrders(page);
  }, [page, statusFilter, search, dateFilter, viewMode]);

  // Efecto para Reset de página cuando cambian los filtros
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, dateFilter, viewMode]);

  useEffect(() => {
    // Suscripción en tiempo real a cambios en órdenes de trabajo
    const subscription = supabase
      .channel('work_orders_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => {
          loadOrders(page);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [page, statusFilter, search, dateFilter, viewMode]);

  async function loadOrders(pageNumber = 1) {
    setIsLoading(true);
    let query = supabase
      .from('work_orders')
      .select(`
        *,
        client:clients!inner(name),
        plant:plants(name, address),
        assigned:users!work_orders_assigned_to_fkey!inner(name),
        extras(id, billed)
      `, { count: 'exact' })
      .order('scheduled_date', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (search) {
      // Workaround para OR en tablas unidas: buscar IDs primero
      const { data: clients } = await supabase.from('clients').select('id').ilike('name', `%${search}%`);
      const { data: techs } = await supabase.from('users').select('id').eq('role', 'tecnico').ilike('name', `%${search}%`);
      
      const clientIds = clients?.map(c => c.id) || [];
      const techIds = techs?.map(t => t.id) || [];
      
      let orString = `order_number.ilike.%${search}%`;
      if (clientIds.length > 0) orString += `,client_id.in.(${clientIds.join(',')})`;
      if (techIds.length > 0) orString += `,assigned_to.in.(${techIds.join(',')})`;
      
      query = query.or(orString);
    }

    if (dateFilter !== 'all') {
      const today = new Date();
      if (dateFilter === 'today') {
        const todayStr = today.toISOString().split('T')[0];
        query = query.eq('scheduled_date', todayStr);
      } else if (dateFilter === 'this_week') {
        // Ultimos 7 dias y proximos 7 dias
        const start = new Date(today);
        start.setDate(today.getDate() - 7);
        const end = new Date(today);
        end.setDate(today.getDate() + 7);
        query = query.gte('scheduled_date', start.toISOString().split('T')[0]);
        query = query.lte('scheduled_date', end.toISOString().split('T')[0]);
      } else if (dateFilter === 'this_month') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        query = query.gte('scheduled_date', firstDay.toISOString().split('T')[0]);
        query = query.lte('scheduled_date', lastDay.toISOString().split('T')[0]);
      }
    }

    // Paginación: Solo si estamos en modo lista
    if (viewMode === 'list') {
      const from = (pageNumber - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);
    } else {
      // En modo Kanban, traemos hasta 500 registros para evitar sobrecarga, pero sin paginación
      query = query.limit(500);
    }

    const { data, count, error } = await query;
    if (!error) {
      setOrders(data || []);
      if (count !== null) setTotalCount(count);
    }
    setIsLoading(false);
  }

  const handleDownloadPDF = async (orderSummary) => {
    setIsDownloading(orderSummary.id);
    const newTab = window.open('about:blank', '_blank');
    if (newTab) {
      newTab.document.title = "Generando PDF...";
      newTab.document.body.innerHTML = "<div style='font-family: sans-serif; padding: 2rem;'>Generando PDF de 4S Clima...</div>";
    }

    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          client:clients(*),
          plant:plants(*),
          equipment:equipment(*),
          assigned:users!work_orders_assigned_to_fkey(*),
          checklist_items(*),
          photos(*),
          signatures(*)
        `)
        .eq('id', orderSummary.id)
        .single();

      if (error) throw error;
      const pdfBlobUrl = await generateWorkOrderPDF(data);
      if (newTab && pdfBlobUrl) newTab.location.href = pdfBlobUrl;
    } catch (err) {
      console.error("Error al descargar PDF:", err);
      if (newTab) newTab.close();
      alert("Hubo un error al generar el PDF.");
    } finally {
      setIsDownloading(null);
    }
  };

  const handleExportExcel = async () => {
    // Para exportar, traemos TODO lo que coincida con los filtros (sin paginación)
    let query = supabase
      .from('work_orders')
      .select(`
        *,
        client:clients!inner(name),
        plant:plants(name, address),
        assigned:users!work_orders_assigned_to_fkey!inner(name),
        extras(id, billed)
      `)
      .order('scheduled_date', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (search) {
      const { data: clients } = await supabase.from('clients').select('id').ilike('name', `%${search}%`);
      const { data: techs } = await supabase.from('users').select('id').eq('role', 'tecnico').ilike('name', `%${search}%`);
      
      const clientIds = clients?.map(c => c.id) || [];
      const techIds = techs?.map(t => t.id) || [];
      
      let orString = `order_number.ilike.%${search}%`;
      if (clientIds.length > 0) orString += `,client_id.in.(${clientIds.join(',')})`;
      if (techIds.length > 0) orString += `,assigned_to.in.(${techIds.join(',')})`;
      
      query = query.or(orString);
    }

    const { data: allData, error } = await query;
    if (error || !allData || allData.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    const headers = ['Nro Orden', 'Cliente', 'Planta', 'Tecnico', 'Tipo Trabajo', 'Estado', 'Extras Sin Facturar', 'Fecha Programada'];
    const csvContent = [
      headers.join(';'),
      ...allData.map(order => {
        const unbilledExtras = (order.extras || []).filter((e) => !e.billed).length;
        return [
          order.order_number || order.id?.slice(0, 8),
          order.client?.name || 'N/D',
          order.plant?.name || 'N/D',
          order.assigned?.name || 'N/D',
          WORK_ORDER_TYPE_LABELS[order.type] || order.type,
          getStatusLabel(order.status),
          unbilledExtras,
          formatDate(order.scheduled_date)
        ].map(value => {
          let strValue = String(value);
          if (/^[=\-+\@]/.test(strValue)) strValue = "'" + strValue;
          return `"${strValue.replace(/"/g, '""')}"`;
        }).join(';');
      })
    ].join('\n');

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ordenes_4SClima_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Órdenes de Trabajo</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{totalCount} registros en total</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExportExcel} className="btn-secondary">
            Exportar Excel
          </button>
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus size={18} />
            Nueva Orden
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-1 flex items-center gap-1 shadow-sm">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
            title="Vista de Lista"
          >
            <LayoutList size={18} />
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
            title="Vista de Tablero (Kanban)"
          >
            <LayoutGrid size={18} />
          </button>
        </div>
        
        <div className="relative flex-1 min-w-[250px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por N° orden, cliente o técnico..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchParams(e.target.value ? { search: e.target.value } : {});
            }}
            className="input pl-10"
          />
        </div>
        
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="select w-auto"
        >
          <option value="today">Hoy</option>
          <option value="this_week">Esta Semana</option>
          <option value="this_month">Este Mes</option>
          <option value="all">Todas las fechas</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="select w-auto"
        >
          <option value="all">Todos los estados</option>
          <option value={WORK_ORDER_STATUS.PENDING}>Pendientes</option>
          <option value={WORK_ORDER_STATUS.IN_PROGRESS}>En Progreso</option>
          <option value={WORK_ORDER_STATUS.COMPLETED}>Completadas</option>
          <option value={WORK_ORDER_STATUS.CANCELLED}>Canceladas</option>
        </select>
      </div>

        {isLoading ? (
          <div className="p-8 space-y-3 card">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center card">
            <FileText size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">No se encontraron órdenes de trabajo.</p>
          </div>
        ) : viewMode === 'kanban' ? (
          <WorkOrdersKanban initialOrders={orders} onOrderUpdated={() => loadOrders(page)} />
        ) : (
          <div className="card p-0">
            <div className="table-container border-0 border-b border-gray-100">
              <table>
                <thead>
                  <tr>
                    <th>N° Orden</th>
                    <th>Cliente</th>
                    <th>Planta</th>
                    <th>Técnico</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Extras</th>
                    <th>Fecha</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const sc = getStatusColor(order.status);
                    const unbilledExtras = (order.extras || []).filter((e) => !e.billed).length;
                    return (
                      <tr key={order.id}>
                        <td className="font-mono text-xs text-gray-600 dark:text-gray-400">
                          {order.order_number || order.id?.slice(0, 8)}
                        </td>
                        <td className="font-medium text-gray-900 dark:text-white">{order.client?.name || '-'}</td>
                        <td className="text-gray-600 dark:text-gray-400 text-xs">{order.plant?.name || '-'}</td>
                        <td className="text-gray-600 dark:text-gray-400">{order.assigned?.name || '-'}</td>
                        <td className="text-xs text-gray-500 dark:text-gray-400">{WORK_ORDER_TYPE_LABELS[order.type] || order.type}</td>
                        <td>
                          <span className={`badge ${sc.bg} ${sc.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {getStatusLabel(order.status)}
                          </span>
                        </td>
                        <td>
                          {unbilledExtras > 0 ? (
                            <span className="badge bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{unbilledExtras} sin facturar</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                          )}
                        </td>
                        <td className="text-gray-500 dark:text-gray-400 text-xs">
                          <div className="flex flex-col">
                            <span>{formatDate(order.scheduled_date)}</span>
                            {order.scheduled_time && <span className="text-gray-400 dark:text-gray-500 font-mono mt-0.5">{order.scheduled_time.slice(0, 5)} hs</span>}
                          </div>
                        </td>
                        <td className="text-right">
                          {order.status === WORK_ORDER_STATUS.COMPLETED && (
                            <button
                              onClick={() => handleDownloadPDF(order)}
                              disabled={isDownloading === order.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-600 text-xs font-semibold rounded-lg transition-colors border border-brand-200"
                              title="Descargar Remito PDF"
                            >
                              {isDownloading === order.id ? (
                                <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Download size={14} />
                              )}
                              PDF
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Controles de Paginación */}
            {totalPages > 1 && (
              <div className="px-6 py-4 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/50 rounded-b-2xl border-t border-gray-100 dark:border-slate-800">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount}
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Anterior
                  </button>
                  <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      <CreateWorkOrderModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onCreated={() => {
          loadOrders(); // Recargar la lista
        }} 
      />
    </div>
  );
}
