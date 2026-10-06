import { useEffect, useState } from 'react';
import { Search, Plus, FileText, Download } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatDate, getStatusLabel, getStatusColor } from '@4s-clima/shared/utils';
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE_LABELS } from '@4s-clima/shared/constants';
import CreateWorkOrderModal from '../components/CreateWorkOrderModal';
import { generateWorkOrderPDF } from '../services/pdfService';

/**
 * Página de listado de Órdenes de Trabajo.
 * Filtrable por estado, tipo y búsqueda.
 */
export default function WorkOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(null); // Guarda el id de la orden descargando

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  async function loadOrders() {
    setIsLoading(true);
    let query = supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(name),
        plant:plants(name, address),
        assigned:users!work_orders_assigned_to_fkey(name),
        extras(id, billed)
      `)
      .order('scheduled_date', { ascending: false })
      .limit(100);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (!error) setOrders(data || []);
    setIsLoading(false);
  }

  const handleDownloadPDF = async (orderSummary) => {
    setIsDownloading(orderSummary.id);
    
    // Abrimos la pestaña sincrónicamente para evadir el bloqueador de pop-ups de Chrome
    const newTab = window.open('about:blank', '_blank');
    if (newTab) {
      newTab.document.title = "Generando PDF...";
      newTab.document.body.innerHTML = "<div style='font-family: sans-serif; padding: 2rem;'>Generando PDF de 4S Clima...</div>";
    }

    try {
      // Buscar la orden completa con todas sus relaciones para el PDF
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
      
      // Mostrar el PDF en la pestaña que abrimos
      if (newTab && pdfBlobUrl) {
        newTab.location.href = pdfBlobUrl;
      }
    } catch (err) {
      console.error("Error al descargar PDF:", err);
      if (newTab) newTab.close();
      alert("Hubo un error al generar el PDF.");
    } finally {
      setIsDownloading(null);
    }
  };

  const handleExportExcel = () => {
    if (filtered.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    // Cabeceras del CSV
    const headers = ['Nro Orden', 'Cliente', 'Planta', 'Tecnico', 'Tipo Trabajo', 'Estado', 'Extras Sin Facturar', 'Fecha Programada'];
    
    // Convertir a CSV (usando punto y coma para compatibilidad con Excel en español)
    const csvContent = [
      headers.join(';'),
      ...filtered.map(order => {
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
          // Prevenir CSV Injection (Formula Injection)
          if (/^[=\-+\@]/.test(strValue)) {
            strValue = "'" + strValue;
          }
          return `"${strValue.replace(/"/g, '""')}"`;
        }).join(';'); // Escapar comillas y separar por ;
      })
    ].join('\n');

    // Añadir BOM para que Excel detecte correctamente el UTF-8 y los acentos
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

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      o.order_number?.toLowerCase().includes(s) ||
      o.client?.name?.toLowerCase().includes(s) ||
      o.assigned?.name?.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Órdenes de Trabajo</h1>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} registros</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportExcel}
            className="btn-secondary"
          >
            Exportar Excel
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn-primary"
          >
            <Plus size={18} />
            Nueva Orden
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[250px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por N° orden, cliente o técnico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
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

      {/* Tabla */}
      <div className="card p-0">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">No se encontraron órdenes de trabajo.</p>
          </div>
        ) : (
          <div className="table-container border-0">
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
                {filtered.map((order) => {
                  const sc = getStatusColor(order.status);
                  const unbilledExtras = (order.extras || []).filter((e) => !e.billed).length;

                  return (
                    <tr key={order.id}>
                      <td className="font-mono text-xs text-gray-600">
                        {order.order_number || order.id?.slice(0, 8)}
                      </td>
                      <td className="font-medium text-gray-900">
                        {order.client?.name || '-'}
                      </td>
                      <td className="text-gray-600 text-xs">
                        {order.plant?.name || '-'}
                      </td>
                      <td className="text-gray-600">
                        {order.assigned?.name || '-'}
                      </td>
                      <td className="text-xs text-gray-500">
                        {WORK_ORDER_TYPE_LABELS[order.type] || order.type}
                      </td>
                      <td>
                        <span className={`badge ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td>
                        {unbilledExtras > 0 ? (
                          <span className="badge bg-red-100 text-red-700">
                            {unbilledExtras} sin facturar
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-gray-500 text-xs">
                        <div className="flex flex-col">
                          <span>{formatDate(order.scheduled_date)}</span>
                          {order.scheduled_time && (
                            <span className="text-gray-400 font-mono mt-0.5">{order.scheduled_time.slice(0, 5)} hs</span>
                          )}
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
        )}
      </div>

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
