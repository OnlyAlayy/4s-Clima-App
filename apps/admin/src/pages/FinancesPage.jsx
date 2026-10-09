import { useEffect, useState } from 'react';
import { DollarSign, Check, AlertCircle, FileText, TrendingUp, Wallet, Download } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatCurrency, formatDate } from '@4s-clima/shared/utils';
import { generateInvoicePDF } from '../services/pdfService';

export default function FinancesPage() {
  const [orders, setOrders] = useState([]);
  const [allCompletedOrders, setAllCompletedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('unbilled'); // 'unbilled' | 'pending' | 'paid' | 'all'

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [basePrice, setBasePrice] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');

  useEffect(() => {
    loadFinances();
  }, [filter]);

  async function loadFinances() {
    setIsLoading(true);

    // Load ALL completed orders for the global KPIs
    const { data: allData } = await supabase
      .from('work_orders')
      .select('payment_status, total_amount')
      .eq('status', 'completed');
      
    if (allData) setAllCompletedOrders(allData);

    let query = supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(name),
        assigned:users!work_orders_assigned_to_fkey(name),
        extras(id, description, unit, billed, unit_price, quantity)
      `)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (filter === 'unbilled') {
      // En supabase si no hay payment_status es null o 'unbilled'
      query = query.or('payment_status.is.null,payment_status.eq.unbilled');
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

  const openFacturaModal = (order) => {
    // Calculamos el subtotal de extras reportados por el técnico
    const extrasTotal = (order.extras || []).reduce((sum, e) => sum + (e.quantity * e.unit_price), 0);
    
    setSelectedOrder(order);
    setBasePrice('');
    setInvoiceAmount(extrasTotal > 0 ? extrasTotal.toString() : '');
    setIsModalOpen(true);
  };

  // Autocalcular cuando cambia el precio base
  const handleBasePriceChange = (val) => {
    setBasePrice(val);
    const base = parseFloat(val) || 0;
    const extrasTotal = (selectedOrder?.extras || []).reduce((sum, e) => sum + (e.quantity * e.unit_price), 0);
    setInvoiceAmount((base + extrasTotal).toString());
  };

  const confirmFacturar = async () => {
    if (!selectedOrder) return;
    
    const amount = parseFloat(invoiceAmount);
    if (isNaN(amount) || amount <= 0) return alert('Por favor, ingresá un monto válido mayor a 0');

    try {
      // 1. Emitir factura en AFIP (llamando al Vercel Serverless Function)
      let afipMsg = '';
      let afipVoucherNumber = null;
      let afipCae = null;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
      
        const afipRes = await fetch('/api/invoice', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({ amount })
        });
        
        if (afipRes.ok) {
          const afipData = await afipRes.json();
          if (afipData.success) {
            afipVoucherNumber = afipData.voucher.number;
            afipCae = afipData.voucher.cae;
            afipMsg = `\n✅ Factura AFIP generada:\nNro: ${afipData.voucher.number}\nCAE: ${afipData.voucher.cae}`;
          }
        } else {
          console.warn('No se pudo emitir en AFIP (estás en local o hubo un error):', await afipRes.text());
        }
      } catch (err) {
        console.warn('No se pudo conectar con el endpoint de AFIP (ignorar en local).', err);
      }

      // 2. Guardar en la base de datos
      const updateData = { 
        payment_status: 'pending', 
        total_amount: amount 
      };

      if (afipVoucherNumber && afipCae) {
        updateData.afip_voucher_number = afipVoucherNumber.toString();
        updateData.afip_cae = afipCae.toString();
      }

      const { error } = await supabase
        .from('work_orders')
        .update(updateData)
        .eq('id', selectedOrder.id);

      if (error) {
        console.error('Error al facturar:', error);
        alert('Error al guardar: ' + error.message + '. ¿Corriste el código SQL en Supabase?');
      } else {
        alert('Factura guardada correctamente.' + afipMsg);
        setIsModalOpen(false);
        setSelectedOrder(null);
        loadFinances();
      }
    } catch (error) {
      alert('Error inesperado: ' + error.message);
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

  const anularFactura = async (order) => {
    const invoiceNumStr = window.prompt(`Ingresá el número de la Factura original que querés anular para la orden ${order.order_number || order.id?.slice(0, 8)}:`);
    if (!invoiceNumStr) return;
    
    const associatedInvoice = parseInt(invoiceNumStr, 10);
    if (isNaN(associatedInvoice) || associatedInvoice <= 0) return alert('Número de factura inválido.');
    
    const amount = Number(order.total_amount) || 0;
    if (amount <= 0) return alert('El monto de la orden es 0. No se puede generar una nota de crédito.');

    if (!window.confirm(`¿Estás seguro que querés emitir una NOTA DE CRÉDITO por $${amount} asociada a la factura Nro ${associatedInvoice}?`)) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const afipRes = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ amount, isCreditNote: true, associatedInvoice })
      });
      
      if (afipRes.ok) {
        const afipData = await afipRes.json();
        if (afipData.success) {
          alert(`✅ Nota de Crédito generada exitosamente!\nNro de Nota de Crédito: ${afipData.voucher.number}\nCAE: ${afipData.voucher.cae}`);
          
          // Opcional: Revertir el estado de pago a unbilled
          await supabase
            .from('work_orders')
            .update({ payment_status: 'unbilled', total_amount: 0, afip_voucher_number: null, afip_cae: null })
            .eq('id', order.id);
            
          loadFinances();
        } else {
          alert('Error de AFIP: ' + JSON.stringify(afipData));
        }
      } else {
        alert('Error al conectar con AFIP (puede ser por estar en local): ' + await afipRes.text());
      }
    } catch (err) {
      alert('Error inesperado: ' + err.message);
    }
  };

  const moneyInStreet = allCompletedOrders
    .filter(o => o.payment_status === 'pending')
    .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

  const totalPaid = allCompletedOrders
    .filter(o => o.payment_status === 'paid')
    .length;
    
  const totalUnbilled = allCompletedOrders
    .filter(o => !o.payment_status || o.payment_status === 'unbilled')
    .length;

  const getStatusBadge = (status) => {
    switch(status) {
      case 'unbilled': return <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Sin Facturar</span>;
      case 'pending': return <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Esperando Pago</span>;
      case 'paid': return <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Pagado</span>;
      default: return <span className="badge bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400">Desconocido</span>;
    }
  };

  const exportToCSV = () => {
    if (orders.length === 0) return alert('No hay datos para exportar.');
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Fecha,Nro Orden,Cliente,Tecnico,Factura AFIP,CAE,Estado,Total\n";

    orders.forEach(order => {
      const fecha = order.completed_at ? formatDate(order.completed_at) : '';
      const nroOrden = order.order_number || order.id?.slice(0, 8);
      const cliente = order.client?.name || '';
      const tecnico = order.assigned?.name || '';
      const factura = order.afip_voucher_number || 'Sin Factura';
      const cae = order.afip_cae || '';
      const estado = order.payment_status === 'paid' ? 'Pagado' : order.payment_status === 'pending' ? 'Esperando Pago' : 'Sin Facturar';
      const total = order.total_amount || 0;

      const row = `"${fecha}","${nroOrden}","${cliente}","${tecnico}","${factura}","${cae}","${estado}","${total}"`;
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Libro_IVA_Ventas_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPDF = async (order) => {
    try {
      const newTab = window.open('', '_blank');
      if (newTab) {
        newTab.document.title = "Generando Factura PDF...";
        newTab.document.body.innerHTML = "<div style='font-family: sans-serif; padding: 2rem;'>Generando Factura de 4S Clima...</div>";
      }
      
      const pdfBlobUrl = await generateInvoicePDF(order);
      
      if (newTab && pdfBlobUrl) {
        newTab.location.href = pdfBlobUrl;
      }
    } catch (err) {
      console.error("Error al descargar PDF:", err);
      alert("Hubo un error al generar la Factura PDF.");
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
        <button 
          onClick={exportToCSV}
          className="btn-secondary flex items-center gap-2"
        >
          <Download size={18} />
          Exportar Libro IVA
        </button>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card p-6 border-l-4 border-amber-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Trabajos sin facturar</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {totalUnbilled}
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
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pendiente de Cobro</p>
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
                {totalPaid}
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
                  <th>Factura AFIP</th>
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
                    <td className="text-sm">
                      {order.afip_voucher_number ? (
                        <div className="flex flex-col text-xs">
                          <span className="text-brand-600 dark:text-brand-400 font-medium">Nro: {order.afip_voucher_number}</span>
                          <span className="text-gray-500 dark:text-gray-400">CAE: {order.afip_cae}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-slate-500 italic text-xs">Sin Factura AFIP</span>
                      )}
                    </td>
                    <td className="text-right">
                      {(!order.payment_status || order.payment_status === 'unbilled') && (
                        <button
                          onClick={() => openFacturaModal(order)}
                          className="btn-secondary text-xs px-3 py-1.5 border-brand-200 text-brand-700 hover:bg-brand-50"
                        >
                          Emitir Factura
                        </button>
                      )}
                      {order.afip_voucher_number && (
                        <button
                          onClick={() => handleDownloadPDF(order)}
                          className="btn-secondary text-xs px-3 py-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30 ml-2"
                        >
                          Descargar PDF
                        </button>
                      )}
                      {(order.payment_status === 'pending' || order.payment_status === 'paid') && (
                        <button
                          onClick={() => anularFactura(order)}
                          className="btn-secondary text-xs px-3 py-1.5 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30 ml-2"
                        >
                          Anular
                        </button>
                      )}
                      {order.payment_status === 'pending' && (
                        <button
                          onClick={() => markAsPagado(order.id)}
                          className="btn-success text-xs px-3 py-1.5 ml-2"
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

      {/* Modal Profesional de Facturación */}
      {isModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Emitir Factura</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Orden {selectedOrder.order_number || selectedOrder.id.slice(0,8)} - {selectedOrder.client?.name}
              </p>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {/* Desglose de Extras */}
              {selectedOrder.extras && selectedOrder.extras.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Extras y Repuestos Reportados</h4>
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3 border border-gray-100 dark:border-slate-800">
                    {selectedOrder.extras.map(e => (
                      <div key={e.id} className="flex justify-between items-center text-sm">
                        <div className="flex-1">
                          <span className="font-medium text-gray-800 dark:text-gray-200">{e.description}</span>
                          <span className="text-gray-500 dark:text-gray-400 ml-2">
                            ({e.quantity} {e.unit} x {formatCurrency(e.unit_price)})
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(e.quantity * e.unit_price)}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-gray-200 dark:border-slate-700 pt-2 mt-2 flex justify-between font-bold">
                      <span className="text-gray-700 dark:text-gray-300">Subtotal Extras:</span>
                      <span className="text-gray-900 dark:text-white">
                        {formatCurrency(selectedOrder.extras.reduce((s, e) => s + (e.quantity * e.unit_price), 0))}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Servicio Base */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Servicio Base / Mano de Obra ($)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="number"
                    className="input pl-10"
                    placeholder="Ej: 50000"
                    value={basePrice}
                    onChange={(e) => handleBasePriceChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Total */}
              <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
                <label className="block text-sm font-bold text-brand-700 dark:text-brand-400 mb-2">
                  Total Final a Facturar ($)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" size={18} />
                  <input 
                    type="number"
                    className="input pl-10 text-lg font-bold border-brand-200 focus:border-brand-500 dark:border-brand-800/50 dark:bg-slate-900"
                    value={invoiceAmount}
                    onChange={(e) => setInvoiceAmount(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmFacturar()}
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="btn-secondary bg-white dark:bg-slate-800"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmFacturar}
                className="btn-primary"
                disabled={!invoiceAmount}
              >
                Confirmar Factura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
