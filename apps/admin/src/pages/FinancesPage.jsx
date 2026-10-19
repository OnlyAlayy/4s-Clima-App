import { useEffect, useState, useMemo } from 'react';
import { 
  DollarSign, Check, AlertCircle, FileText, TrendingUp, Wallet, Download,
  Search, Calendar, CreditCard, CheckSquare, Square, X, Filter, Building, Receipt, Layers,
  MessageCircle, Eye, ChevronRight
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatCurrency, formatDate } from '@4s-clima/shared/utils';
import { generateReceiptPDF, generateAccountStatementPDF, openAndDownloadPDF } from '../services/pdfService';
import { generateArcaInvoicePDF } from '../services/arcaInvoicePdf';
import Swal from 'sweetalert2';

export default function FinancesPage() {
  const [orders, setOrders] = useState([]);
  const [allCompletedOrders, setAllCompletedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('unbilled'); // 'unbilled' | 'pending' | 'paid' | 'accounts' | 'vouchers' | 'all'
  const [vouchers, setVouchers] = useState([]);

  // Cuentas Corrientes y Libro Mayor
  const [clientAccounts, setClientAccounts] = useState([]);
  const [selectedAccountForLedger, setSelectedAccountForLedger] = useState(null);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);

  // Búsqueda y Filtros de Período
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all'); // 'all' | 'this_month' | 'last_month' | 'last_90_days' | 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Selección múltiple para acciones en lote
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  // Modal de Facturación AFIP
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [batchOrdersToInvoice, setBatchOrdersToInvoice] = useState([]);
  const [basePrice, setBasePrice] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceConcept, setInvoiceConcept] = useState('');

  // Modal Enriquecido de Registro de Cobro ("Marcar Pagado" y Recibo X)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [ordersToPay, setOrdersToPay] = useState([]);
  const [collectedAmount, setCollectedAmount] = useState('');
  const [retentionsAmount, setRetentionsAmount] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [downloadReceiptPdf, setDownloadReceiptPdf] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('Transferencia Bancaria');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  useEffect(() => {
    // Al cambiar la pestaña principal, limpiamos selección
    setSelectedOrderIds([]);
    loadFinances();
  }, [filter]);

  async function loadFinances() {
    setIsLoading(true);

    // Cargar todas las órdenes completadas para KPIs globales
    const { data: allData } = await supabase
      .from('work_orders')
      .select('payment_status, total_amount')
      .eq('status', 'completed');
      
    if (allData) setAllCompletedOrders(allData);

    if (filter === 'accounts') {
      const { data: clientsData } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      const { data: allWos } = await supabase
        .from('work_orders')
        .select(`
          *,
          client:clients(name, cuit, address),
          plant:plants(name, address),
          extras(id, description, unit, billed, unit_price, quantity)
        `)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (clientsData && allWos) {
        const accountsMap = clientsData.map(client => {
          const clientWos = allWos.filter(w => w.client_id === client.id);
          const pendingWos = clientWos.filter(w => w.payment_status === 'pending');
          const paidWos = clientWos.filter(w => w.payment_status === 'paid');
          const billedWos = clientWos.filter(w => w.afip_voucher_number != null || w.payment_status === 'pending' || w.payment_status === 'paid');

          const totalBilled = billedWos.reduce((s, w) => s + (Number(w.total_amount) || 0), 0);
          const totalPaid = paidWos.reduce((s, w) => s + (Number(w.total_amount) || 0), 0);
          const currentDebt = pendingWos.reduce((s, w) => s + (Number(w.total_amount) || 0), 0);

          let maxOverdueDays = 0;
          let oldestPending = null;
          pendingWos.forEach(w => {
            const date = new Date(w.completed_at || w.created_at);
            const days = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
            if (days > maxOverdueDays) {
              maxOverdueDays = days;
              oldestPending = w;
            }
          });

          // Movimientos para el Libro Mayor
          const movements = [];
          billedWos.forEach(w => {
            movements.push({
              date: w.completed_at || w.created_at,
              voucherType: w.afip_voucher_number ? `Factura C N° ${w.afip_voucher_number}` : `OT ${w.order_number || w.id.slice(0, 8)}`,
              concept: `Servicio técnico OT ${w.order_number || w.id.slice(0, 8)}`,
              debit: Number(w.total_amount) || 0,
              credit: 0,
              order: w
            });
          });

          paidWos.forEach(w => {
            let recNum = 'REC-PAGO';
            const recMatch = (w.payment_method || '').match(/REC-[\w\d]+/i) || (w.observations || '').match(/Recibo:\s*(REC-[\w\d]+)/i);
            if (recMatch) recNum = recMatch[1] || recMatch[0];
            movements.push({
              date: w.completed_at || w.created_at,
              voucherType: recNum,
              concept: `Cobro ${w.payment_method || 'Transferencia'}`,
              debit: 0,
              credit: Number(w.total_amount) || 0,
              order: w
            });
          });

          movements.sort((a, b) => new Date(a.date) - new Date(b.date));
          let runningBalance = 0;
          movements.forEach(m => {
            runningBalance += (m.debit - m.credit);
            m.balance = runningBalance;
          });

          return {
            client,
            totalBilled,
            totalPaid,
            currentDebt,
            pendingWos,
            paidWos,
            billedWos,
            maxOverdueDays,
            oldestPending,
            isOverdue: maxOverdueDays > 30,
            movements
          };
        });

        setClientAccounts(accountsMap);
      }
      setOrders([]);
      setIsLoading(false);
      return;
    }

    if (filter === 'vouchers') {
      const { data, error } = await supabase
        .from('afip_vouchers')
        .select(`
          *,
          work_order:work_orders(
            order_number,
            type,
            client:clients(name, cuit, address),
            plant:plants(name, address),
            extras(id, description, unit, billed, unit_price, quantity)
          )
        `)
        .order('created_at', { ascending: false });
        
      if (!error) {
        setVouchers(data || []);
      } else {
        console.error("Error loading vouchers:", error);
        Swal.fire('Error al cargar comprobantes', error.message, 'error');
      }
      setOrders([]);
      setIsLoading(false);
      return;
    }

    let query = supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(name, cuit, address),
        plant:plants(name, address),
        assigned:users!work_orders_assigned_to_fkey(name),
        extras(id, description, unit, billed, unit_price, quantity)
      `)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (filter === 'unbilled') {
      query = query.or('payment_status.is.null,payment_status.eq.unbilled');
    } else if (filter === 'pending') {
      query = query.eq('payment_status', 'pending');
    } else if (filter === 'paid') {
      query = query.eq('payment_status', 'paid');
    }

    const { data, error } = await query;
    if (!error) {
      setOrders(data || []);
    } else {
      console.error("Error loading orders:", error);
      Swal.fire('Error al cargar órdenes', error.message, 'error');
    }
    setIsLoading(false);
  }

  // Helper de filtrado por período
  const filterByPeriod = (dateStr) => {
    if (!dateStr || periodFilter === 'all') return true;
    const date = new Date(dateStr);
    const now = new Date();

    if (periodFilter === 'this_month') {
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }
    if (periodFilter === 'last_month') {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return date.getFullYear() === prevMonth.getFullYear() && date.getMonth() === prevMonth.getMonth();
    }
    if (periodFilter === 'last_90_days') {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(now.getDate() - 90);
      return date >= ninetyDaysAgo;
    }
    if (periodFilter === 'custom') {
      if (customStartDate && new Date(dateStr) < new Date(customStartDate)) return false;
      if (customEndDate) {
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(dateStr) > end) return false;
      }
      return true;
    }
    return true;
  };

  // Órdenes filtradas en memoria por búsqueda y período
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const dateToUse = order.completed_at || order.created_at;
      if (!filterByPeriod(dateToUse)) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      const num = (order.order_number || order.id || '').toLowerCase();
      const client = (order.client?.name || '').toLowerCase();
      const cuit = (order.client?.cuit || '').toLowerCase();
      const tech = (order.assigned?.name || '').toLowerCase();
      const afip = (order.afip_voucher_number || '').toLowerCase();
      const method = (order.payment_method || '').toLowerCase();

      return num.includes(term) || client.includes(term) || cuit.includes(term) || tech.includes(term) || afip.includes(term) || method.includes(term);
    });
  }, [orders, periodFilter, customStartDate, customEndDate, searchTerm]);

  // Comprobantes filtrados por búsqueda y período
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(voucher => {
      if (!filterByPeriod(voucher.created_at)) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      const vNum = String(voucher.voucher_number || '').toLowerCase();
      const cae = String(voucher.cae || '').toLowerCase();
      const client = (voucher.work_order?.client?.name || '').toLowerCase();
      const cuit = (voucher.work_order?.client?.cuit || '').toLowerCase();
      const oNum = (voucher.work_order?.order_number || '').toLowerCase();

      return vNum.includes(term) || cae.includes(term) || client.includes(term) || cuit.includes(term) || oNum.includes(term);
    });
  }, [vouchers, periodFilter, customStartDate, customEndDate, searchTerm]);

  // Cuentas Corrientes filtradas por búsqueda
  const filteredAccounts = useMemo(() => {
    if (!searchTerm.trim()) return clientAccounts;
    const term = searchTerm.toLowerCase().trim();
    return clientAccounts.filter(acc => {
      const name = (acc.client.name || '').toLowerCase();
      const cuit = (acc.client.cuit || '').toLowerCase();
      const addr = (acc.client.address || '').toLowerCase();
      return name.includes(term) || cuit.includes(term) || addr.includes(term);
    });
  }, [clientAccounts, searchTerm]);

  // Manejo de Selección de Filas
  const handleToggleSelectAll = () => {
    if (selectedOrderIds.length === filteredOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map(o => o.id));
    }
  };

  const handleToggleSelectRow = (id) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Cálculo de órdenes seleccionadas
  const selectedOrdersList = useMemo(() => {
    return filteredOrders.filter(o => selectedOrderIds.includes(o.id));
  }, [filteredOrders, selectedOrderIds]);

  const pendingSelected = useMemo(() => {
    return selectedOrdersList.filter(o => o.payment_status === 'pending');
  }, [selectedOrdersList]);

  const unbilledSelected = useMemo(() => {
    return selectedOrdersList.filter(o => !o.payment_status || o.payment_status === 'unbilled');
  }, [selectedOrdersList]);

  // Verificar si las órdenes seleccionadas sin facturar pertenecen al mismo cliente para consolidar
  const uniqueClientsInUnbilled = useMemo(() => {
    return Array.from(new Set(unbilledSelected.map(o => o.client_id || o.client?.name)));
  }, [unbilledSelected]);

  const canConsolidateBilling = unbilledSelected.length > 1 && uniqueClientsInUnbilled.length === 1;

  // Modal Facturación Individual
  const openFacturaModal = (order) => {
    const extrasTotal = (order.extras || []).reduce((sum, e) => sum + (e.quantity * e.unit_price), 0);
    setSelectedOrder(order);
    setBatchOrdersToInvoice([]);
    setBasePrice('');
    setInvoiceAmount(extrasTotal > 0 ? extrasTotal.toString() : '');
    setInvoiceConcept(order.observations || 'Mantenimiento Preventivo y Correctivo de Climatización');
    setIsModalOpen(true);
  };

  // Modal Facturación en Lote (Consolidada)
  const openBatchFacturaModal = (batch) => {
    if (!batch || batch.length === 0) return;
    const allExtras = batch.flatMap(o => o.extras || []);
    const extrasTotal = allExtras.reduce((sum, e) => sum + (e.quantity * e.unit_price), 0);
    
    setSelectedOrder(batch[0]);
    setBatchOrdersToInvoice(batch);
    setBasePrice('');
    setInvoiceAmount(extrasTotal > 0 ? extrasTotal.toString() : '');
    setInvoiceConcept(`Servicio de Climatización - Lote de ${batch.length} OTs`);
    setIsModalOpen(true);
  };

  const handleBasePriceChange = (val) => {
    setBasePrice(val);
    const base = parseFloat(val) || 0;
    const activeExtras = batchOrdersToInvoice.length > 0
      ? batchOrdersToInvoice.flatMap(o => o.extras || [])
      : (selectedOrder?.extras || []);
    const extrasTotal = activeExtras.reduce((sum, e) => sum + (e.quantity * e.unit_price), 0);
    setInvoiceAmount((base + extrasTotal).toString());
  };

  const confirmFacturar = async () => {
    if (!selectedOrder) return;
    
    const netAmount = parseFloat(invoiceAmount);
    if (isNaN(netAmount) || netAmount <= 0) {
      return Swal.fire('Monto inválido', 'Por favor, ingresá un importe neto mayor a 0', 'warning');
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const afipRes = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ 
          netAmount, 
          amount: netAmount, 
          orderId: selectedOrder.id,
          observations: invoiceConcept 
        })
      });
      
      if (afipRes.ok) {
        const afipData = await afipRes.json();
        if (afipData.success) {
          const formattedNum = afipData.voucher.formatted_number || `A-00004-${String(afipData.voucher.number).padStart(8, '0')}`;
          const totalConIva = afipData.voucher.total_amount || Number((netAmount * 1.21).toFixed(2));
          const afipMsg = `
            <div class="text-left text-sm space-y-1.5 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p><strong>N° Comprobante:</strong> ${formattedNum}</p>
              <p><strong>CAE:</strong> ${afipData.voucher.cae}</p>
              <p><strong>Neto Gravado:</strong> $${netAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
              <p><strong>IVA (21%):</strong> $${(netAmount * 0.21).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
              <p class="text-indigo-600 dark:text-indigo-400 font-bold"><strong>Total c/IVA:</strong> $${totalConIva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            </div>
          `;

          // Si era facturación en lote, vinculamos el voucher a las órdenes secundarias también
          if (batchOrdersToInvoice.length > 1) {
            const secondaryOrders = batchOrdersToInvoice.filter(o => o.id !== selectedOrder.id);
            for (const secOrder of secondaryOrders) {
              await supabase.from('work_orders').update({
                payment_status: 'pending',
                total_amount: totalConIva,
                afip_voucher_number: formattedNum,
                afip_cae: afipData.voucher.cae.toString(),
                observations: secOrder.observations 
                  ? `${secOrder.observations}\n[Facturada en Lote con OT ${selectedOrder.order_number || selectedOrder.id.slice(0,8)} - Factura Nro ${formattedNum}]`
                  : `[Facturada en Lote con OT ${selectedOrder.order_number || selectedOrder.id.slice(0,8)} - Factura Nro ${formattedNum}]`
              }).eq('id', secOrder.id);
            }
          }
          
          Swal.fire({
            icon: 'success',
            title: batchOrdersToInvoice.length > 1 ? '¡Factura A de Lote Generada!' : '¡Factura A Generada!',
            html: afipMsg
          });
          
          setIsModalOpen(false);
          setSelectedOrder(null);
          setBatchOrdersToInvoice([]);
          setSelectedOrderIds([]);
          loadFinances();
        } else {
          return Swal.fire('Error de AFIP', 'El servidor respondió con error: ' + (afipData.error || JSON.stringify(afipData)), 'error');
        }
      } else {
        const errText = await afipRes.text();
        return Swal.fire('Error del servidor', `Status ${afipRes.status}: ${errText}`, 'error');
      }
    } catch (error) {
      Swal.fire('Error inesperado', error.message, 'error');
    }
  };

  // Abrir Modal Enriquecido de Cobro ("Marcar Pagado" y Recibo X)
  const openPaymentModal = (orderOrOrders) => {
    const list = Array.isArray(orderOrOrders) ? orderOrOrders : [orderOrOrders];
    if (list.length === 0) return;
    const total = list.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    setOrdersToPay(list);
    setCollectedAmount(total > 0 ? total.toString() : '');
    setRetentionsAmount('');
    setReceiptNumber(`REC-${String(Date.now()).slice(-6)}`);
    setDownloadReceiptPdf(true);
    setPaymentMethod('Transferencia Bancaria');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentReference('');
    setPaymentNotes('');
    setIsPaymentModalOpen(true);
  };

  // Confirmar Registro de Cobro y Emisión de Recibo X
  const handleConfirmPayment = async () => {
    if (ordersToPay.length === 0) return;
    setIsSubmittingPayment(true);

    try {
      const totalOriginal = ordersToPay.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
      const finalAmount = parseFloat(collectedAmount) || totalOriginal;
      const retAmount = parseFloat(retentionsAmount) || 0;
      const recNum = receiptNumber.trim() || `REC-${String(Date.now()).slice(-6)}`;
      const client = ordersToPay[0]?.client || {};

      for (const order of ordersToPay) {
        let newObs = order.observations || '';
        const paymentDetail = `[Cobro: ${paymentDate} | ${paymentMethod}${paymentReference ? ` | Ref: ${paymentReference}` : ''} | Recibo: ${recNum}${retAmount > 0 ? ` | Retenciones: $${retAmount}` : ''}${paymentNotes ? ` | Nota: ${paymentNotes}` : ''}]`;
        newObs = newObs ? `${newObs}\n${paymentDetail}` : paymentDetail;

        const { error } = await supabase
          .from('work_orders')
          .update({
            payment_status: 'paid',
            payment_method: `${paymentMethod} (${recNum})`,
            observations: newObs
          })
          .eq('id', order.id);

        if (error) {
          console.error(`Error actualizando orden ${order.id}:`, error);
        }
      }

      // Guardar en tabla payment_receipts si existe en Supabase
      try {
        await supabase.from('payment_receipts').insert({
          receipt_number: recNum,
          client_id: ordersToPay[0]?.client_id || null,
          payment_date: paymentDate,
          amount: finalAmount,
          retentions_amount: retAmount,
          payment_method: paymentMethod,
          payment_reference: paymentReference || null,
          notes: paymentNotes || null,
          work_order_ids: ordersToPay.map(o => o.id)
        });
      } catch (errReceipt) {
        console.warn('payment_receipts table not ready yet or optional:', errReceipt);
      }

      // Generar y descargar Recibo X PDF si está seleccionado
      if (downloadReceiptPdf) {
        try {
          await openAndDownloadPDF(generateReceiptPDF({
            receiptNumber: recNum,
            date: paymentDate,
            clientName: client.name || 'Cliente',
            clientCuit: client.cuit || '',
            clientAddress: client.address || '',
            totalAmount: finalAmount,
            orders: ordersToPay,
            paymentMethod,
            paymentReference,
            retentions: retAmount,
            notes: paymentNotes
          }));
        } catch (pdfErr) {
          console.error('Error generando Recibo X PDF:', pdfErr);
        }
      }

      Swal.fire({
        icon: 'success',
        title: '¡Cobro Registrado y Recibo X Emitido!',
        html: `Se registró el cobro por <strong>$${finalAmount.toLocaleString('es-AR')}</strong>.<br/>Comprobante: <strong>${recNum}</strong>`,
        confirmButtonText: 'Aceptar'
      });

      setIsPaymentModalOpen(false);
      setOrdersToPay([]);
      setSelectedOrderIds([]);
      loadFinances();
    } catch (err) {
      console.error('Error registrando cobro:', err);
      Swal.fire('Error', 'No se pudo registrar el cobro: ' + err.message, 'error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Anular Factura con Nota de Crédito
  const anularFactura = async (order) => {
    if (!order.afip_voucher_number) {
      await supabase
        .from('work_orders')
        .update({ payment_status: 'unbilled', total_amount: 0, afip_voucher_number: null, afip_cae: null })
        .eq('id', order.id);
        
      loadFinances();
      return;
    }

    const associatedInvoice = parseInt(order.afip_voucher_number, 10);
    if (isNaN(associatedInvoice) || associatedInvoice <= 0) {
      return Swal.fire('Error', 'Número de factura inválido.', 'error');
    }
    
    const amount = Number(order.total_amount) || 0;
    if (amount <= 0) {
      return Swal.fire('Error', 'El monto de la orden es 0.', 'error');
    }

    const result = await Swal.fire({
      title: '¿Confirmar Anulación?',
      html: `¿Estás seguro que querés emitir una <strong>Nota de Crédito</strong> en AFIP por <strong>$${amount}</strong> para anular la Factura Nro <strong>${associatedInvoice}</strong>?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, Anular Factura',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const afipRes = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ amount, isCreditNote: true, associatedInvoice, orderId: order.id })
      });
      
      if (afipRes.ok) {
        const afipData = await afipRes.json();
        if (afipData.success) {
          setOrders(prevOrders => prevOrders.filter(o => o.id !== order.id));
          loadFinances();
          
          Swal.fire({
            icon: 'success',
            title: '¡Nota de Crédito Generada!',
            html: `Nro: ${afipData.voucher.number}<br/>CAE: ${afipData.voucher.cae}`
          });
        } else {
          Swal.fire('Error de AFIP', JSON.stringify(afipData), 'error');
        }
      } else {
        Swal.fire('Error al conectar con AFIP', '', 'error');
      }
    } catch (err) {
      Swal.fire('Error inesperado', err.message, 'error');
    }
  };

  // KPIs Globales
  const moneyInStreet = allCompletedOrders
    .filter(o => o.payment_status === 'pending')
    .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

  const totalPaid = allCompletedOrders
    .filter(o => o.payment_status === 'paid')
    .length;
    
  const totalUnbilled = allCompletedOrders
    .filter(o => !o.payment_status || o.payment_status === 'unbilled')
    .length;

  const getStatusBadge = (status, paymentMethodName) => {
    switch(status) {
      case 'unbilled': 
        return <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">Sin Facturar</span>;
      case 'pending': 
        return <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">Esperando Pago</span>;
      case 'paid': 
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">Pagado</span>
            {paymentMethodName && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400 font-normal truncate max-w-[140px]" title={paymentMethodName}>
                💳 {paymentMethodName}
              </span>
            )}
          </div>
        );
      default: 
        return <span className="badge bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400 font-medium">Sin Estado</span>;
    }
  };

  // Exportar Libro IVA Digital / CSV
  const exportToCSV = () => {
    let rows = [];
    let fileName = '';

    if (filter === 'vouchers') {
      if (filteredVouchers.length === 0) return Swal.fire('Sin datos', 'No hay comprobantes para exportar en este período.', 'info');

      rows.push(["Fecha", "Tipo Comprobante", "Nro Comprobante", "CAE", "Nro Orden", "Cliente", "CUIT", "Total"]);

      filteredVouchers.forEach(v => {
        const fecha = v.created_at ? formatDate(v.created_at) : '';
        const tipo = v.voucher_type === 'credit_note' ? 'Nota de Credito C' : 'Factura C';
        const nro = v.voucher_number || '';
        const cae = v.cae || '';
        const nroOrden = v.work_order?.order_number || '';
        const cliente = v.work_order?.client?.name || '';
        const cuit = v.work_order?.client?.cuit || '';
        const total = (v.voucher_type === 'credit_note' ? -1 : 1) * (Number(v.amount) || 0);

        rows.push([fecha, tipo, nro, cae, nroOrden, cliente, cuit, total]);
      });

      fileName = `Libro_IVA_Comprobantes_${periodFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
    } else {
      if (filteredOrders.length === 0) return Swal.fire('Sin datos', 'No hay órdenes para exportar con los filtros seleccionados.', 'info');

      rows.push(["Fecha", "Nro Orden", "Cliente", "CUIT", "Tecnico", "Factura AFIP", "CAE", "Estado Cobro", "Metodo de Pago", "Total"]);

      filteredOrders.forEach(order => {
        const fecha = order.completed_at ? formatDate(order.completed_at) : '';
        const nroOrden = order.order_number || order.id?.slice(0, 8);
        const cliente = order.client?.name || '';
        const cuit = order.client?.cuit || '';
        const tecnico = order.assigned?.name || '';
        const factura = order.afip_voucher_number || 'Sin Factura';
        const cae = order.afip_cae || '';
        const estado = order.payment_status === 'paid' ? 'Pagado' : order.payment_status === 'pending' ? 'Esperando Pago' : 'Sin Facturar';
        const metodo = order.payment_method || '';
        const total = order.total_amount || 0;

        rows.push([fecha, nroOrden, cliente, cuit, tecnico, factura, cae, estado, metodo, total]);
      });

      fileName = `Libro_IVA_Ventas_${filter}_${periodFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
    }

    // Delimitador punto y coma (;) estándar para Excel en español (Argentina/Latam)
    const csvContent = rows.map(r => 
      r.map(val => {
        const str = String(val ?? '');
        return `"${str.replace(/"/g, '""')}"`;
      }).join(';')
    ).join('\r\n');

    // Byte Order Mark (BOM) UTF-8 para que Excel detecte tildes y caracteres especiales automáticamente
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 2000);
  };

  const handleDownloadPDF = async (order) => {
    try {
      await openAndDownloadPDF(generateArcaInvoicePDF(order));
    } catch (err) {
      console.error("Error al generar Factura A PDF:", err);
      Swal.fire("Error", "Hubo un problema al generar la Factura A PDF.", "error");
    }
  };

  const handleDownloadReceipt = async (order) => {
    let recNum = '00000001';
    const recMatch = (order.payment_method || '').match(/REC-[\w\d]+/i) || (order.observations || '').match(/Recibo:\s*(REC-[\w\d]+)/i);
    if (recMatch) {
      recNum = recMatch[1] || recMatch[0];
    } else if (order.afip_voucher_number) {
      recNum = `REC-${String(order.afip_voucher_number).padStart(8, '0')}`;
    }

    try {
      await openAndDownloadPDF(generateReceiptPDF({
        receiptNumber: recNum,
        date: order.completed_at || new Date(),
        clientName: order.client?.name,
        clientCuit: order.client?.cuit,
        clientAddress: order.client?.address,
        totalAmount: order.total_amount,
        orders: [order],
        paymentMethod: order.payment_method || 'Transferencia Bancaria',
        paymentReference: '',
        notes: ''
      }));
    } catch (err) {
      console.error("Error al generar Recibo PDF:", err);
      Swal.fire("Error", "Hubo un problema al generar el Recibo de Cobranza PDF.", "error");
    }
  };

  const handleDownloadAccountStatement = async (account) => {
    try {
      await openAndDownloadPDF(generateAccountStatementPDF(account.client, {
        movements: account.movements,
        currentDebt: account.currentDebt
      }));
    } catch (err) {
      console.error("Error al generar Estado de Cuenta:", err);
      Swal.fire("Error", "No se pudo generar el Estado de Cuenta PDF.", "error");
    }
  };

  const handleClaimWhatsApp = (client, debt, pendingCount, oldestOrder) => {
    const daysOverdue = oldestOrder 
      ? Math.max(0, Math.floor((new Date() - new Date(oldestOrder.completed_at || oldestOrder.created_at)) / (1000 * 60 * 60 * 24)) - 30)
      : 0;
    
    const text = `Hola ${client?.name || 'Cliente'}, les escribimos del área de Administración de 4S Clima para acercarles el estado de su cuenta corriente.\n\n` +
      `📌 Saldo pendiente al día: ${formatCurrency(debt)} (${pendingCount} ${pendingCount === 1 ? 'comprobante pendiente' : 'comprobantes pendientes'})\n` +
      (daysOverdue > 0 ? `⚠️ Plazo de pago vencido hace ${daysOverdue} días.\n\n` : `\n`) +
      `💳 Datos para transferencia bancaria:\n` +
      `• Banco: Galicia\n` +
      `• CUIT: 23-47738071-9\n` +
      `• Alias: CLIMA.4S.ADMIN\n` +
      `• CBU: 0070000000000000000000\n\n` +
      `Por favor remitirnos el comprobante una vez efectuada la transferencia. ¡Muchas gracias!`;

    const phone = (client?.contact_phone || '').replace(/\D/g, '');
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      navigator.clipboard.writeText(text);
      Swal.fire({
        icon: 'info',
        title: 'Mensaje de Cobranza Copiado',
        text: 'Copiamos el mensaje formal de cobranza a tu portapapeles con los datos de cuenta y saldo para que lo pegues en WhatsApp o Email.',
        confirmButtonText: 'Entendido'
      });
    }
  };

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finanzas y Cobranzas</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestión integral de facturación electrónica AFIP y seguimiento de cobranzas
          </p>
        </div>
        <button 
          onClick={exportToCSV}
          className="btn-secondary flex items-center gap-2 self-start sm:self-auto"
          title="Descargar reporte en formato CSV compatible con Libro IVA Digital"
        >
          <Download size={18} />
          Exportar Libro IVA
        </button>
      </div>

      {/* Dashboard Stats (KPIs) */}
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

      {/* Barra de Filtros y Búsqueda */}
      <div className="space-y-4 mb-6">
        {/* Pestañas de Estado */}
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'unbilled', label: 'Sin Facturar' },
            { value: 'pending', label: 'Esperando Pago' },
            { value: 'paid', label: 'Pagados' },
            { value: 'accounts', label: 'Cuentas Corrientes' },
            { value: 'vouchers', label: 'Comprobantes AFIP' },
            { value: 'all', label: 'Todos los Trabajos' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${filter === value
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Toolbar de Búsqueda Rápida y Selector de Período */}
        <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-gray-200 dark:border-slate-700 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Input de Búsqueda */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={18} />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente, N° orden, CUIT o comprobante..."
              className="w-full pl-10 pr-10 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Selector de Período */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs text-gray-600 dark:text-gray-300">
              <Calendar size={14} className="text-gray-400" />
              <span>Período:</span>
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="bg-transparent border-none text-gray-900 dark:text-white font-medium focus:outline-none text-xs cursor-pointer"
              >
                <option value="all" className="dark:bg-slate-800">Todos los períodos</option>
                <option value="this_month" className="dark:bg-slate-800">Mes actual</option>
                <option value="last_month" className="dark:bg-slate-800">Mes anterior</option>
                <option value="last_90_days" className="dark:bg-slate-800">Últimos 90 días</option>
                <option value="custom" className="dark:bg-slate-800">Rango personalizado</option>
              </select>
            </div>

            {/* Inputs de Rango Personalizado */}
            {periodFilter === 'custom' && (
              <div className="flex items-center gap-1.5 animate-fade-in">
                <input 
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs text-gray-900 dark:text-white"
                />
                <span className="text-gray-400 text-xs">-</span>
                <input 
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs text-gray-900 dark:text-white"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contenedor Principal de Tablas */}
      <div className="card p-0 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filter === 'accounts' ? (
          /* VISTA DE CUENTAS CORRIENTES POR CLIENTE */
          <div className="p-6 space-y-6">
            {/* KPIs Ejecutivos de Cuenta Corriente */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Deuda en la Calle</span>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {formatCurrency(clientAccounts.reduce((s, a) => s + a.currentDebt, 0))}
                </p>
                <span className="text-xs text-slate-400">Facturas emitidas pendientes de cobro</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Deuda Vencida en Mora</span>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {formatCurrency(clientAccounts.filter(a => a.isOverdue).reduce((s, a) => s + a.currentDebt, 0))}
                </p>
                <span className="text-xs text-slate-400">Facturas impagas con más de 30 días</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Clientes con Saldo Deudor</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {clientAccounts.filter(a => a.currentDebt > 0).length} de {clientAccounts.length}
                </p>
                <span className="text-xs text-slate-400">Empresas con comprobantes pendientes</span>
              </div>
            </div>

            {/* Tabla de Cuentas Corrientes */}
            <div className="table-container border rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr>
                    <th>Cliente / Empresa</th>
                    <th>CUIT</th>
                    <th>Total Facturado</th>
                    <th>Total Cobrado</th>
                    <th>Saldo Deudor</th>
                    <th>Estado de Pago</th>
                    <th className="text-right pr-6 min-w-[280px]">Acciones de Cobranza</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => (
                    <tr key={account.client.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td>
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900 dark:text-white text-sm">
                            {account.client.name}
                          </span>
                          <span className="text-xs text-gray-400 truncate max-w-xs">
                            {account.client.address || 'Sin domicilio registrado'}
                          </span>
                        </div>
                      </td>
                      <td className="font-mono text-xs text-gray-600 dark:text-gray-400">
                        {account.client.cuit || '-'}
                      </td>
                      <td className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                        {formatCurrency(account.totalBilled)}
                      </td>
                      <td className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatCurrency(account.totalPaid)}
                      </td>
                      <td>
                        <span className={`text-base font-bold ${account.currentDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {formatCurrency(account.currentDebt)}
                        </span>
                      </td>
                      <td>
                        {account.currentDebt === 0 ? (
                          <span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            ✓ Al Día
                          </span>
                        ) : account.isOverdue ? (
                          <span className="badge bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                            ⚠️ En Mora ({account.maxOverdueDays - 30}d vencida)
                          </span>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            ⏰ A Término ({30 - account.maxOverdueDays}d para vencer)
                          </span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap pr-6">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Ver Libro Mayor */}
                          <button
                            onClick={() => {
                              setSelectedAccountForLedger(account);
                              setIsLedgerModalOpen(true);
                            }}
                            className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 border-slate-200 dark:border-slate-700"
                            title="Ver movimientos históricos (Libro Mayor)"
                          >
                            <FileText size={13} />
                            Libro Mayor
                          </button>

                          {/* Descargar Estado de Cuenta PDF */}
                          <button
                            onClick={() => handleDownloadAccountStatement(account)}
                            className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400"
                            title="Descargar Estado de Cuenta Corriente en PDF"
                          >
                            <Download size={13} />
                            PDF
                          </button>

                          {/* Cobrar Saldo */}
                          {account.currentDebt > 0 && (
                            <button
                              onClick={() => openPaymentModal(account.pendingWos)}
                              className="btn-success text-xs px-2.5 py-1.5 flex items-center gap-1 shadow-sm"
                              title="Registrar cobro de facturas pendientes"
                            >
                              <Wallet size={13} />
                              Cobrar
                            </button>
                          )}

                          {/* Reclamar por WhatsApp */}
                          {account.currentDebt > 0 && (
                            <button
                              onClick={() => handleClaimWhatsApp(account.client, account.currentDebt, account.pendingWos.length, account.oldestPending)}
                              className="btn-secondary text-xs px-2 py-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
                              title="Enviar o copiar mensaje formal de cobranza para WhatsApp"
                            >
                              <MessageCircle size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <tr>
                      <td colSpan="7" className="text-center py-10 text-gray-400">
                        No se encontraron cuentas corrientes con los filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : filter === 'vouchers' ? (
          /* TABLA DE COMPROBANTES AFIP */
          <div className="table-container border-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[950px]">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>N° Orden</th>
                  <th>Cliente</th>
                  <th>Monto</th>
                  <th className="text-right pr-6 min-w-[140px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredVouchers.map((voucher) => (
                  <tr key={voucher.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(voucher.created_at)}
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className={`font-semibold text-sm ${voucher.voucher_type === 'credit_note' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                          {voucher.voucher_type === 'credit_note' ? 'Nota de Crédito C' : 'Factura C'} Nro {voucher.voucher_number}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">CAE: {voucher.cae}</span>
                      </div>
                    </td>
                    <td className="font-mono text-xs text-gray-600 dark:text-gray-400">
                      {voucher.work_order?.order_number || '-'}
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {voucher.work_order?.client?.name || '-'}
                        </span>
                        {voucher.work_order?.client?.cuit && (
                          <span className="text-xs text-gray-500 font-mono">CUIT: {voucher.work_order.client.cuit}</span>
                        )}
                      </div>
                    </td>
                    <td className={`font-bold text-sm ${voucher.voucher_type === 'credit_note' ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                      {voucher.voucher_type === 'credit_note' ? '-' : ''}{formatCurrency(voucher.amount)}
                    </td>
                    <td className="text-right whitespace-nowrap pr-6">
                      <button
                        onClick={() => handleDownloadPDF({
                          ...voucher.work_order,
                          client: voucher.work_order?.client,
                          plant: voucher.work_order?.plant,
                          extras: voucher.work_order?.extras,
                          afip_voucher_number: voucher.voucher_number,
                          afip_cae: voucher.cae,
                          total_amount: voucher.amount,
                          completed_at: voucher.created_at,
                          is_credit_note: voucher.voucher_type === 'credit_note'
                        })}
                        className="btn-secondary text-xs px-3 py-1.5 border-brand-200 text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-brand-400"
                      >
                        <Receipt size={14} />
                        Descargar PDF
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredVouchers.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-gray-500 dark:text-slate-400">
                      <Receipt size={36} className="mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                      No se encontraron comprobantes que coincidan con los filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : filteredOrders.length === 0 ? (
          /* ESTADO VACÍO */
          <div className="p-12 text-center">
            <DollarSign size={44} className="text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <h4 className="text-base font-semibold text-gray-700 dark:text-gray-300">No se encontraron registros</h4>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
              No hay órdenes en este estado o no coinciden con la búsqueda/período actual.
            </p>
          </div>
        ) : (
          /* TABLA PRINCIPAL DE ÓRDENES */
          <div className="table-container border-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[1250px]">
              <thead>
                <tr>
                  <th className="w-10 text-center">
                    <input 
                      type="checkbox"
                      checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                      onChange={handleToggleSelectAll}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 cursor-pointer"
                      title="Seleccionar todas"
                    />
                  </th>
                  <th>N° Orden</th>
                  <th>Cliente</th>
                  <th>Técnico</th>
                  <th>Completada el</th>
                  {filter === 'pending' && <th>Vencimiento / Mora</th>}
                  <th>Estado Cobro</th>
                  <th>Total</th>
                  <th>Factura AFIP</th>
                  <th className="text-right pr-6 min-w-[280px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const isSelected = selectedOrderIds.includes(order.id);

                  return (
                    <tr 
                      key={order.id}
                      className={`transition-colors ${isSelected ? 'bg-brand-50/40 dark:bg-brand-900/10' : 'hover:bg-gray-50/50 dark:hover:bg-slate-800/40'}`}
                    >
                      <td className="w-10 text-center">
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(order.id)}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 cursor-pointer"
                        />
                      </td>
                      <td className="font-mono text-xs text-gray-600 dark:text-gray-400">
                        {order.order_number || order.id?.slice(0, 8)}
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {order.client?.name || '-'}
                          </span>
                          {order.client?.cuit && (
                            <span className="text-[11px] text-gray-400 font-mono">CUIT: {order.client.cuit}</span>
                          )}
                        </div>
                      </td>
                      <td className="text-gray-600 dark:text-gray-400 text-sm">
                        {order.assigned?.name || '-'}
                      </td>
                      <td className="text-gray-600 dark:text-gray-400 text-sm">
                        {order.completed_at ? formatDate(order.completed_at) : '-'}
                      </td>
                      {filter === 'pending' && (
                        <td className="text-xs">
                          {(() => {
                            const days = Math.floor((new Date() - new Date(order.completed_at || order.created_at)) / (1000 * 60 * 60 * 24));
                            const isOver = days > 30;
                            if (isOver) {
                              return (
                                <span className="badge bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 font-semibold">
                                  ⚠️ Vencida ({days - 30}d)
                                </span>
                              );
                            } else if (days > 23) {
                              return (
                                <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                  ⏰ Vence en {30 - days}d
                                </span>
                              );
                            } else {
                              return (
                                <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                  ✓ A término ({30 - days}d)
                                </span>
                              );
                            }
                          })()}
                        </td>
                      )}
                      <td>{getStatusBadge(order.payment_status, order.payment_method)}</td>
                      <td className="font-semibold text-gray-900 dark:text-white text-sm">
                        {/* REGLA: Subtotal estimado para no facturadas se mantiene como '-' */}
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
                      <td className="text-right whitespace-nowrap pr-6">
                        <div className="flex items-center justify-end gap-1.5">
                          {(!order.payment_status || order.payment_status === 'unbilled') && (
                            <button
                              onClick={() => openFacturaModal(order)}
                              className="btn-secondary text-xs px-2.5 py-1.5 border-brand-200 text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-400 inline-flex items-center gap-1.5"
                              title="Emitir Factura Electrónica C"
                            >
                              <FileText size={13} />
                              Emitir Factura
                            </button>
                          )}
                          
                          {order.afip_voucher_number && (
                            <button
                              onClick={() => handleDownloadPDF(order)}
                              className="btn-secondary text-xs px-2.5 py-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30 inline-flex items-center gap-1.5"
                              title="Descargar Factura PDF"
                            >
                              <Download size={13} />
                              Factura PDF
                            </button>
                          )}

                          {order.payment_status === 'paid' && (
                            <button
                              onClick={() => handleDownloadReceipt(order)}
                              className="btn-secondary text-xs px-2.5 py-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30 inline-flex items-center gap-1.5"
                              title="Descargar Recibo Oficial de Cobranza (Recibo X)"
                            >
                              <Receipt size={13} />
                              Recibo X
                            </button>
                          )}

                          {order.payment_status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleClaimWhatsApp(order.client, order.total_amount, 1, order)}
                                className="btn-secondary text-xs px-2 py-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 inline-flex items-center"
                                title="Reclamar cobro formal por WhatsApp"
                              >
                                <MessageCircle size={14} />
                              </button>
                              <button
                                onClick={() => openPaymentModal(order)}
                                className="btn-success text-xs px-3 py-1.5 shadow-sm font-medium inline-flex items-center gap-1.5"
                                title="Registrar cobro y emitir Recibo X"
                              >
                                <Check size={14} />
                                Cobrar
                              </button>
                            </>
                          )}

                          {(order.payment_status === 'pending' || order.payment_status === 'paid') && (
                            <button
                              onClick={() => anularFactura(order)}
                              className="btn-secondary text-xs px-2.5 py-1.5 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                              title="Emitir Nota de Crédito en AFIP"
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BARRA FLOTANTE DE ACCIONES MASIVAS (BULK ACTIONS) */}
      {selectedOrderIds.length > 0 && filter !== 'vouchers' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-6 py-3.5 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-wrap items-center gap-4 animate-fade-in max-w-2xl w-[90%]">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">
              {selectedOrderIds.length}
            </span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {selectedOrderIds.length === 1 ? '1 orden seleccionada' : `${selectedOrderIds.length} órdenes seleccionadas`}
            </span>
          </div>

          <div className="h-4 w-px bg-gray-200 dark:bg-slate-700 hidden sm:block" />

          <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
            {/* Si hay órdenes pendientes seleccionadas: Registrar Cobro en Lote */}
            {pendingSelected.length > 0 && (
              <button
                onClick={() => openPaymentModal(pendingSelected)}
                className="btn-success text-xs px-3 py-2 flex items-center gap-1.5"
                title="Registrar cobro masivo para las órdenes seleccionadas"
              >
                <Wallet size={14} />
                Registrar Cobro ({pendingSelected.length})
              </button>
            )}

            {/* Si hay órdenes del mismo cliente sin facturar: Facturar Lote */}
            {canConsolidateBilling && (
              <button
                onClick={() => openBatchFacturaModal(unbilledSelected)}
                className="btn-primary text-xs px-3 py-2 flex items-center gap-1.5"
                title="Consolidar y emitir factura AFIP única por los trabajos de este cliente"
              >
                <Layers size={14} />
                Facturar Lote ({unbilledSelected.length})
              </button>
            )}

            <button
              onClick={() => setSelectedOrderIds([])}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1"
            >
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* MODAL ENRIQUECIDO DE REGISTRO DE COBRO ("MARCAR PAGADO") */}
      {isPaymentModalOpen && ordersToPay.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-800">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Wallet size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Registrar Cobro</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {ordersToPay.length === 1 
                      ? `Orden ${ordersToPay[0].order_number || ordersToPay[0].id.slice(0,8)} - ${ordersToPay[0].client?.name}`
                      : `${ordersToPay.length} órdenes seleccionadas`}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Resumen del Monto a Cobrar y Pago Parcial */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-800">
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Total a Cancelar:</span>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(ordersToPay.reduce((s, o) => s + (Number(o.total_amount) || 0), 0))}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">
                    Monto a Cobrar ($)
                  </label>
                  <input
                    type="number"
                    value={collectedAmount}
                    onChange={(e) => setCollectedAmount(e.target.value)}
                    placeholder="Monto a registrar..."
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700/60 rounded-lg text-sm font-bold text-emerald-700 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <span className="text-[10px] text-gray-400">Permite registrar cobro parcial</span>
                </div>
              </div>

              {/* Retenciones Impositivas y N° Recibo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    Retenciones (IIBB / Ganancias)
                  </label>
                  <input 
                    type="number"
                    placeholder="Ej: 2500 (Opcional)"
                    value={retentionsAmount}
                    onChange={(e) => setRetentionsAmount(e.target.value)}
                    className="w-full px-3.5 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    N° de Recibo X
                  </label>
                  <input 
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    className="w-full px-3.5 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Método de Pago */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                  Método de Pago
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    'Transferencia Bancaria',
                    'Efectivo',
                    'Cheque',
                    'Mercado Pago',
                    'Tarjeta Débito',
                    'Tarjeta Crédito'
                  ].map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all text-left truncate
                        ${paymentMethod === method
                          ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500 text-brand-700 dark:text-brand-300 font-bold shadow-sm'
                          : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                        }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha de Pago */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Fecha de Cobro
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Referencia / Comprobante */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  N° de Comprobante / Referencia (Opcional)
                </label>
                <input 
                  type="text"
                  placeholder="Ej: Transf. N° 849201 o N° de Cheque"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full px-3.5 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>

              {/* Notas Adicionales */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Notas de Cobro (Opcional)
                </label>
                <input 
                  type="text"
                  placeholder="Detalles sobre el pago o cuenta destino..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>

              {/* Checkbox Recibo X PDF */}
              <div className="pt-2 border-t border-gray-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={downloadReceiptPdf}
                    onChange={(e) => setDownloadReceiptPdf(e.target.checked)}
                    className="rounded text-brand-600 focus:ring-brand-500 border-gray-300"
                  />
                  <span>Generar y descargar Recibo Oficial de Cobranza (Recibo X) en PDF</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
              <button 
                onClick={() => setIsPaymentModalOpen(false)}
                className="btn-secondary bg-white dark:bg-slate-800"
                disabled={isSubmittingPayment}
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmPayment}
                className="btn-success px-5 flex items-center gap-1.5"
                disabled={isSubmittingPayment}
              >
                <Check size={16} />
                {isSubmittingPayment ? 'Registrando...' : 'Confirmar Cobro y Emitir Recibo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LIBRO MAYOR / CUENTA CORRIENTE DETALLADA */}
      {isLedgerModalOpen && selectedAccountForLedger && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-800 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 rounded-xl">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Cuenta Corriente — {selectedAccountForLedger.client.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedAccountForLedger.client.cuit ? `CUIT: ${selectedAccountForLedger.client.cuit}` : 'Sin CUIT'} · {selectedAccountForLedger.client.address || 'Sin domicilio registrado'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadAccountStatement(selectedAccountForLedger)}
                  className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 border-brand-200 text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-brand-400"
                  title="Descargar Estado de Cuenta PDF"
                >
                  <Download size={14} />
                  Descargar PDF
                </button>
                <button 
                  onClick={() => setIsLedgerModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Resumen Superior */}
            <div className="px-6 py-3 bg-gray-50/50 dark:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800 grid grid-cols-3 gap-4 text-center shrink-0">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Total Facturado</span>
                <p className="text-base font-bold text-gray-900 dark:text-white">
                  {formatCurrency(selectedAccountForLedger.totalBilled)}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Total Cobrado</span>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(selectedAccountForLedger.totalPaid)}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Saldo Deudor Actual</span>
                <p className={`text-base font-bold ${selectedAccountForLedger.currentDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {formatCurrency(selectedAccountForLedger.currentDebt)}
                </p>
              </div>
            </div>

            {/* Modal Body: Tabla de Movimientos */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="table-container border rounded-xl overflow-hidden">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Comprobante</th>
                      <th>Detalle / Concepto</th>
                      <th className="text-right">Debe (+)</th>
                      <th className="text-right">Haber (-)</th>
                      <th className="text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAccountForLedger.movements.map((m, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                        <td className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(m.date)}
                        </td>
                        <td className="font-medium text-xs text-gray-900 dark:text-white">
                          {m.voucherType}
                        </td>
                        <td className="text-xs text-gray-600 dark:text-gray-300">
                          {m.concept}
                        </td>
                        <td className="text-xs text-right font-medium text-gray-900 dark:text-white">
                          {m.debit > 0 ? formatCurrency(m.debit) : '-'}
                        </td>
                        <td className="text-xs text-right font-medium text-emerald-600 dark:text-emerald-400">
                          {m.credit > 0 ? formatCurrency(m.credit) : '-'}
                        </td>
                        <td className="text-xs text-right font-bold text-gray-900 dark:text-white">
                          {formatCurrency(m.balance)}
                        </td>
                      </tr>
                    ))}
                    {selectedAccountForLedger.movements.length === 0 && (
                      <tr>
                        <td colSpan="6" className="text-center py-8 text-gray-400">
                          Sin movimientos registrados en cuenta corriente.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center shrink-0">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {selectedAccountForLedger.movements.length} movimientos históricos registrados
              </div>
              <button 
                onClick={() => setIsLedgerModalOpen(false)}
                className="btn-secondary"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE FACTURACIÓN AFIP (FACTURA A - RESPONSABLE INSCRIPTO) */}
      {isModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-indigo-600 text-white flex items-center justify-center text-xs font-black">A</span>
                  {batchOrdersToInvoice.length > 1 ? 'Facturar Lote (Factura A)' : 'Emitir Factura A (ARCA / AFIP)'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {batchOrdersToInvoice.length > 1
                    ? `${batchOrdersToInvoice.length} órdenes de ${selectedOrder.client?.name}`
                    : `OT ${selectedOrder.order_number || selectedOrder.id.slice(0,8)} · ${selectedOrder.client?.name} (CUIT: ${selectedOrder.client?.cuit || 'Sin CUIT'})`}
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 max-h-[65vh] overflow-y-auto space-y-4">
              {/* Desglose de Extras */}
              {(() => {
                const activeExtras = batchOrdersToInvoice.length > 1
                  ? batchOrdersToInvoice.flatMap(o => o.extras || [])
                  : (selectedOrder.extras || []);

                if (activeExtras.length === 0) return null;

                return (
                  <div className="mb-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Extras y Repuestos Reportados
                    </h4>
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3.5 space-y-2 border border-gray-100 dark:border-slate-800">
                      {activeExtras.map(e => (
                        <div key={e.id} className="flex justify-between items-center text-xs">
                          <div className="flex-1 pr-2">
                            <span className="font-medium text-gray-800 dark:text-gray-200">{e.description}</span>
                            <span className="text-gray-400 dark:text-gray-500 ml-1.5">
                              ({e.quantity} {e.unit} x {formatCurrency(e.unit_price)})
                            </span>
                          </div>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(e.quantity * e.unit_price)}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-gray-200 dark:border-slate-700 pt-2 mt-1 flex justify-between font-bold text-xs">
                        <span className="text-gray-700 dark:text-gray-300">Subtotal Extras (Neto):</span>
                        <span className="text-gray-900 dark:text-white">
                          {formatCurrency(activeExtras.reduce((s, e) => s + (e.quantity * e.unit_price), 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Concepto / Observaciones en la Factura */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Concepto / Observaciones en Factura
                </label>
                <input 
                  type="text"
                  className="w-full px-3.5 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Ej: ACT MANT IPC JULIO 2.1% o Mantenimiento Preventivo"
                  value={invoiceConcept}
                  onChange={(e) => setInvoiceConcept(e.target.value)}
                />
              </div>

              {/* Servicio Base (Neto) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Mano de Obra / Servicio Base (Neto sin IVA) ($)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="Ej: 187305.41"
                    value={basePrice}
                    onChange={(e) => handleBasePriceChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Importe Neto Total */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Importe Neto a Facturar (Bruto sin IVA) ($)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full pl-9 pr-3 py-2 text-base font-semibold border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={invoiceAmount}
                    onChange={(e) => setInvoiceAmount(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmFacturar()}
                  />
                </div>
              </div>

              {/* Desglose Matemático en Tiempo Real (Neto + IVA 21% = Total) */}
              {(() => {
                const netNum = parseFloat(invoiceAmount) || 0;
                const ivaNum = Number((netNum * 0.21).toFixed(2));
                const totNum = Number((netNum + ivaNum).toFixed(2));

                return (
                  <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-600 dark:text-gray-400 font-medium">Bruto (Neto Gravado):</span>
                      <span className="font-semibold text-gray-900 dark:text-white font-mono">
                        ${netNum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-600 dark:text-gray-400 font-medium">IVA (21%):</span>
                      <span className="font-semibold text-gray-900 dark:text-white font-mono">
                        ${ivaNum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="border-t border-indigo-200 dark:border-indigo-800/80 pt-2 flex justify-between items-center">
                      <span className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Total a Facturar (c/IVA):</span>
                      <span className="text-lg font-black text-indigo-700 dark:text-indigo-300 font-mono">
                        ${totNum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                );
              })()}
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
                className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={!invoiceAmount || parseFloat(invoiceAmount) <= 0}
              >
                Confirmar Factura A
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
