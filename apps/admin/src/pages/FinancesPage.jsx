import { useEffect, useState } from 'react';
import { DollarSign, Check, AlertCircle, FileText, TrendingUp, Wallet } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatCurrency, formatDate } from '@4s-clima/shared/utils';

export default function FinancesPage() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('unbilled'); // 'unbilled' | 'pending' | 'paid' | 'all'

  useEffect(() => {
    loadFinances();
  }, [filter]);

  async function loadFinances() {
    setIsLoading(true);
    let query = supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(name),
        assigned:users!work_orders_assigned_to_fkey(name),
        extras(id, billed, unit_price, quantity)
      `)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (filter === 'unbilled') {
      query = query.eq('payment_status', 'unbilled');
    } else if (filter === 'pending') {
      query = query.eq('payment_status', 'pending');
    } else if (filter === 'paid') {
      query = query.eq('payment_status', 'paid');
    }

    const { data, error } = await query;
    if (!error) {
      setOrders(data || []);
    }
    setIsLoading(false);
  }

  const markAsFacturado = async (orderId) => {
    const amountStr = prompt('Ingrese el monto final a facturar por este trabajo (ej: 50000):');
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return alert('Monto inválido');

    const { error } = await supabase
      .from('work_orders')
      .update({ payment_status: 'pending', total_amount: amount })
      .eq('id', orderId);

    if (error) {
      console.error('Error al facturar:', error);
      alert('Error al guardar: ' + error.message + '. ¿Corriste el código SQL en Supabase?');
    } else {
      loadFinances();
    }
  };

  const markAsPagado = async (orderId) => {
    const { error } = await supabase
      .from('work_orders')
      .update({ payment_status: 'paid' })
      .eq('id', orderId);

    if (error) {
      console.error('Error al marcar pagado:', error);
      alert('Error: ' + error.message);
    } else {
      loadFinances();
    }
  };

  const moneyInStreet = orders
    .filter(o => o.payment_status === 'pending')
    .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

  const getStatusBadge = (status) => {
    switch(status) {
      case 'unbilled': return <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Sin Facturar</span>;
      case 'pending': return <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Esperando Pago</span>;
      case 'paid': return <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Pagado</span>;
      default: return <span className="badge bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400">Desconocido</span>;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finanzas y Cobranzas</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestión de facturación y seguimiento de pagos
          </p>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card p-6 border-l-4 border-amber-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Trabajos sin facturar</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {filter === 'all' || filter === 'unbilled' ? orders.filter(o => o.payment_status === 'unbilled').length : '?'}
              </h3>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl">
              <FileText className="text-amber-600 dark:text-amber-400" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-6 border-l-4 border-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Plata en la calle</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {formatCurrency(moneyInStreet)}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
              <TrendingUp className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-6 border-l-4 border-emerald-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Facturas Pagadas</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {filter === 'all' || filter === 'paid' ? orders.filter(o => o.payment_status === 'paid').length : '?'}
              </h3>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl">
              <Wallet className="text-emerald-600 dark:text-emerald-400" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {[
          { value: 'unbilled', label: 'Sin Facturar', color: 'amber' },
          { value: 'pending', label: 'Esperando Pago', color: 'blue' },
          { value: 'paid', label: 'Pagados', color: 'emerald' },
          { value: 'all', label: 'Todos', color: 'gray' },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${filter === value
                ? 'bg-brand-500 text-white'
                : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card p-0">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign size={40} className="text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-400 dark:text-slate-500">No hay registros financieros en esta categoría.</p>
          </div>
        ) : (
          <div className="table-container border-0">
            <table>
              <thead>
                <tr>
                  <th>N° Orden</th>
                  <th>Cliente</th>
                  <th>Técnico</th>
                  <th>Completada el</th>
                  <th>Estado Cobro</th>
                  <th>Total</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="font-mono text-xs text-gray-600 dark:text-gray-400">
                      {order.order_number || order.id?.slice(0, 8)}
                    </td>
                    <td className="font-medium text-gray-900 dark:text-white">
                      {order.client?.name || '-'}
                    </td>
                    <td className="text-gray-600 dark:text-gray-400 text-sm">
                      {order.assigned?.name || '-'}
                    </td>
                    <td className="text-gray-600 dark:text-gray-400 text-sm">
                      {order.completed_at ? formatDate(order.completed_at) : '-'}
                    </td>
                    <td>{getStatusBadge(order.payment_status)}</td>
                    <td className="font-semibold text-gray-900 dark:text-white">
                      {order.total_amount ? formatCurrency(order.total_amount) : '-'}
                    </td>
                    <td className="text-right">
                      {(!order.payment_status || order.payment_status === 'unbilled') && (
                        <button
                          onClick={() => markAsFacturado(order.id)}
                          className="btn-secondary text-xs px-3 py-1.5 border-brand-200 text-brand-700 hover:bg-brand-50"
                        >
                          Emitir Factura
                        </button>
                      )}
                      {order.payment_status === 'pending' && (
                        <button
                          onClick={() => markAsPagado(order.id)}
                          className="btn-success text-xs px-3 py-1.5"
                        >
                          <Check size={14} />
                          Marcar Pagado
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
