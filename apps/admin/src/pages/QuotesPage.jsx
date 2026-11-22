import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Plus, Search, Filter, Download, MessageCircle,
  ArrowRight, CheckCircle2, Clock, XCircle, AlertTriangle,
  Building2, Phone, Mail, Calendar, Trash2, Edit3, Eye,
  ChevronDown, Layers, DollarSign, TrendingUp, Sparkles, X, Check
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatDate, formatCurrency, roundCurrency } from '@4s-clima/shared/utils';
import { WORK_ORDER_TYPES, WORK_ORDER_TYPE_LABELS } from '@4s-clima/shared/constants';
import { generateQuotePDF, openAndDownloadPDF } from '../services/pdfService';
import { useAdminAuth } from '../App';
import Swal from 'sweetalert2';

export const QUOTE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CONVERTED: 'converted',
};

export const QUOTE_STATUS_LABELS = {
  draft: 'Borrador',
  sent: 'Enviado',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  expired: 'Vencido',
  converted: 'Convertido en OT',
};

export const QUOTE_STATUS_COLORS = {
  draft: {
    bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
  sent: {
    bg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  approved: {
    bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  rejected: {
    bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    dot: 'bg-rose-500',
  },
  expired: {
    bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  converted: {
    bg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    dot: 'bg-purple-500',
  },
};

export default function QuotesPage() {
  const navigate = useNavigate();
  const { profile } = useAdminAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner';

  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [sourceType, setSourceType] = useState('client'); // 'client' | 'lead' | 'manual'
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [title, setTitle] = useState('');
  const [workOrderType, setWorkOrderType] = useState('corrective');
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [ivaRate, setIvaRate] = useState(21);
  const [items, setItems] = useState([
    { id: 1, description: '', quantity: 1, unit_price: '', subtotal: 0 }
  ]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [quotesRes, clientsRes, leadsRes] = await Promise.all([
        supabase
          .from('quotes')
          .select(`
            *,
            client:clients(id, name, cuit, contact_phone, contact_email),
            lead:leads(id, nombre, empresa, telefono, email),
            converted_wo:work_orders(id, order_number)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('clients')
          .select('id, name, contact_name, contact_phone, contact_email')
          .neq('active', false)
          .order('name'),
        supabase
          .from('leads')
          .select('id, nombre, empresa, telefono, email, estado')
          .order('created_at', { ascending: false })
      ]);

      if (quotesRes.data) setQuotes(quotesRes.data);
      if (clientsRes.data) setClients(clientsRes.data);
      if (leadsRes.data) setLeads(leadsRes.data);
    } catch (err) {
      console.error('Error al cargar datos de cotizaciones:', err);
      Swal.fire('Error', 'No se pudieron cargar los presupuestos.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // KPIs
  const kpiStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthQuotes = quotes.filter((q) => {
      const d = new Date(q.created_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalCotizadoMes = monthQuotes.reduce((acc, q) => acc + (Number(q.total) || 0), 0);
    const pendientes = quotes.filter((q) => q.status === 'draft' || q.status === 'sent').length;
    const aprobadosOConvertidos = quotes.filter((q) => q.status === 'approved' || q.status === 'converted').length;
    const totalQuotesCount = quotes.length;
    const tasaConversion = totalQuotesCount > 0 ? (aprobadosOConvertidos / totalQuotesCount) * 100 : 0;

    return {
      totalCotizadoMes,
      pendientes,
      aprobadosOConvertidos,
      tasaConversion: tasaConversion.toFixed(1),
    };
  }, [quotes]);

  // Filtro de lista
  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      const num = String(q.quote_number || '').toLowerCase();
      const cli = String(q.client_name || '').toLowerCase();
      const tit = String(q.title || '').toLowerCase();
      const phone = String(q.client_phone || '').toLowerCase();
      const email = String(q.client_email || '').toLowerCase();

      return (
        num.includes(term) ||
        cli.includes(term) ||
        tit.includes(term) ||
        phone.includes(term) ||
        email.includes(term)
      );
    });
  }, [quotes, statusFilter, searchTerm]);

  // Selección de origen al crear
  const handleClientSelect = (clientId) => {
    setSelectedClientId(clientId);
    const c = clients.find((item) => item.id === clientId);
    if (c) {
      setClientName(c.name || '');
      setClientEmail(c.contact_email || '');
      setClientPhone(c.contact_phone || '');
    }
  };

  const handleLeadSelect = (leadId) => {
    setSelectedLeadId(leadId);
    const l = leads.find((item) => item.id === leadId);
    if (l) {
      setClientName(l.empresa || l.nombre || '');
      setClientEmail(l.email || '');
      setClientPhone(l.telefono || '');
    }
  };

  // Constructor de ítems dinámico
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: Date.now(), description: '', quantity: 1, unit_price: '', subtotal: 0 },
    ]);
  };

  const handleRemoveItem = (idx) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateItem = (idx, field, val) => {
    setItems((prev) => {
      const next = [...prev];
      const current = { ...next[idx], [field]: val };
      const q = Math.max(0, parseFloat(current.quantity) || 0);
      const p = Math.max(0, parseFloat(current.unit_price) || 0);
      current.subtotal = roundCurrency(q * p);
      next[idx] = current;
      return next;
    });
  };

  // Cálculos de totales en vivo
  const subtotal = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
  }, [items]);

  const ivaAmount = useMemo(() => {
    if (ivaRate <= 0) return 0;
    return roundCurrency(subtotal * (ivaRate / 100));
  }, [subtotal, ivaRate]);

  const total = useMemo(() => {
    return roundCurrency(subtotal + ivaAmount);
  }, [subtotal, ivaAmount]);

  // Abrir Modal de Creación
  const handleOpenCreate = () => {
    setEditingQuoteId(null);
    setSourceType('client');
    setSelectedClientId('');
    setSelectedLeadId('');
    setClientName('');
    setClientEmail('');
    setClientPhone('');
    setTitle('');
    setWorkOrderType('corrective');
    const d = new Date();
    d.setDate(d.getDate() + 15);
    setValidUntil(d.toISOString().split('T')[0]);
    setNotes('');
    setIvaRate(21);
    setItems([{ id: 1, description: '', quantity: 1, unit_price: '', subtotal: 0 }]);
    setIsModalOpen(true);
  };

  // Abrir Modal de Edición
  const handleOpenEdit = (quote) => {
    if (quote.status === 'converted') {
      return Swal.fire('No editable', 'Este presupuesto ya fue convertido en Orden de Trabajo y se encuentra cerrado.', 'info');
    }
    setEditingQuoteId(quote.id);
    setSelectedClientId(quote.client_id || '');
    setSelectedLeadId(quote.lead_id || '');
    setSourceType(quote.client_id ? 'client' : (quote.lead_id ? 'lead' : 'manual'));
    setClientName(quote.client_name || '');
    setClientEmail(quote.client_email || '');
    setClientPhone(quote.client_phone || '');
    setTitle(quote.title || '');
    setWorkOrderType(quote.work_order_type || 'corrective');
    setValidUntil(quote.valid_until || '');
    setNotes(quote.notes || '');
    setIvaRate(Number(quote.iva_rate) || 21);

    const loadedItems = Array.isArray(quote.items) && quote.items.length > 0
      ? quote.items.map((it, idx) => ({
          id: idx + 1,
          description: it.description || '',
          quantity: it.quantity || 1,
          unit_price: it.unit_price || '',
          subtotal: it.subtotal || (Number(it.quantity || 1) * Number(it.unit_price || 0))
        }))
      : [{ id: 1, description: '', quantity: 1, unit_price: '', subtotal: 0 }];
    setItems(loadedItems);
    setIsModalOpen(true);
  };

  // Guardar Presupuesto (Crear / Actualizar)
  const handleSubmitQuote = async (e) => {
    e.preventDefault();
    if (!clientName.trim()) {
      return Swal.fire('Datos incompletos', 'Por favor ingresá el nombre o razón social del cliente.', 'warning');
    }
    if (!title.trim()) {
      return Swal.fire('Datos incompletos', 'Por favor ingresá un título o asunto del presupuesto.', 'warning');
    }
    if (items.some((it) => !it.description.trim() || Number(it.quantity) <= 0)) {
      return Swal.fire('Ítems incompletos', 'Cada ítem debe contar con una descripción y cantidad válida.', 'warning');
    }

    setIsSubmitting(true);
    try {
      const formattedItems = items.map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity) || 1,
        unit_price: roundCurrency(Number(it.unit_price) || 0),
        subtotal: roundCurrency(Number(it.subtotal) || 0),
      }));

      const payload = {
        client_id: sourceType === 'client' && selectedClientId ? selectedClientId : null,
        lead_id: sourceType === 'lead' && selectedLeadId ? selectedLeadId : null,
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        client_phone: clientPhone.trim() || null,
        title: title.trim(),
        work_order_type: workOrderType,
        items: formattedItems,
        subtotal,
        iva_rate: ivaRate,
        iva_amount: ivaAmount,
        total,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (!editingQuoteId) {
        payload.created_by = profile?.id || null;
        payload.status = 'draft';
        const { error } = await supabase.from('quotes').insert(payload);
        if (error) throw error;
        Swal.fire('Presupuesto Creado', 'El presupuesto comercial fue generado exitosamente.', 'success');
      } else {
        const { error } = await supabase.from('quotes').update(payload).eq('id', editingQuoteId);
        if (error) throw error;
        Swal.fire('Presupuesto Actualizado', 'Los cambios han sido guardados.', 'success');
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      console.error('Error guardando presupuesto:', err);
      Swal.fire('Error', 'No se pudo guardar el presupuesto: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Descarga PDF
  const handleDownloadPDF = async (quote) => {
    try {
      await openAndDownloadPDF(generateQuotePDF(quote));
    } catch (err) {
      console.error('Error generando PDF de presupuesto:', err);
      Swal.fire('Error', 'No se pudo generar el documento PDF.', 'error');
    }
  };

  // Enviar por WhatsApp
  const handleSendWhatsApp = async (quote) => {
    const cleanPhone = String(quote.client_phone || '').replace(/\D/g, '');
    const validUntilStr = quote.valid_until ? formatDate(quote.valid_until) : '15 días corridos';

    const msg =
      `Hola *${quote.client_name}*, les escribimos de *4S Clima* para acercarles el Presupuesto Oficial N° *${quote.quote_number}* por el servicio de *${quote.title}*.\n\n` +
      `• *Total Cotizado:* ${formatCurrency(quote.total)} (IVA ${quote.iva_rate}%)\n` +
      `• *Validez comercial:* hasta el ${validUntilStr}\n\n` +
      `Adjuntamos el detalle completo. Quedamos a su entera disposición para coordinar la ejecución del servicio.\n` +
      `Muchas gracias.\n` +
      `_4S Clima - Instalaciones y Mantenimiento Térmico Industrial_`;

    if (quote.status === 'draft') {
      await supabase
        .from('quotes')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', quote.id);
      setQuotes((prev) =>
        prev.map((q) => (q.id === quote.id ? { ...q, status: 'sent' } : q))
      );
    }

    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    } else {
      navigator.clipboard.writeText(msg);
      Swal.fire({
        icon: 'info',
        title: 'Mensaje Copiado al Portapapeles',
        text: 'El cliente no tiene teléfono cargado. Copiamos el mensaje para que lo pegues en WhatsApp o Email.',
        confirmButtonText: 'Entendido',
      });
    }
  };

  // Cambiar Estado Rápido
  const handleStatusChange = async (quoteId, nextStatus) => {
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', quoteId);

      if (error) throw error;
      setQuotes((prev) =>
        prev.map((q) => (q.id === quoteId ? { ...q, status: nextStatus } : q))
      );
    } catch (err) {
      console.error('Error actualizando estado:', err);
      Swal.fire('Error', 'No se pudo cambiar el estado: ' + err.message, 'error');
    }
  };

  // Convertir en Orden de Trabajo (1 clic)
  const handleConvertToWorkOrder = async (quote) => {
    if (quote.status === 'converted' && quote.converted_work_order_id) {
      navigate(`/ordenes/${quote.converted_work_order_id}`);
      return;
    }

    const result = await Swal.fire({
      title: '¿Convertir Presupuesto en Orden de Trabajo?',
      html: `
        <div class="text-left text-xs space-y-2">
          <p>Se ejecutará la conversión comercial directa de <strong>${quote.quote_number}</strong> (${formatCurrency(quote.total)}):</p>
          <ul class="list-disc pl-5 text-gray-600 dark:text-gray-300 space-y-1">
            <li>Se creará una nueva <strong>Orden de Trabajo Pendiente</strong> en el sistema.</li>
            <li>${!quote.client_id ? 'Se creará automáticamente el <strong>Cliente Oficial</strong> en base al contacto.' : 'Se vinculará al cliente actual.'}</li>
            <li>Los ítems presupuestados se migrarán automáticamente como <strong>Materiales/Extras</strong> de la orden.</li>
            <li>El presupuesto pasará a estado <strong>Convertido</strong>.</li>
          </ul>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, Convertir a OT',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
    });

    if (!result.isConfirmed) return;

    Swal.fire({
      title: 'Creando Orden de Trabajo...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      let targetClientId = quote.client_id;

      // 1. Si no tiene cliente oficial asociado, se da de alta automáticamente
      if (!targetClientId) {
        const { data: newClient, error: clientErr } = await supabase
          .from('clients')
          .insert({
            name: quote.client_name,
            contact_name: quote.client_name,
            contact_phone: quote.client_phone || null,
            contact_email: quote.client_email || null,
            address: 'A coordinar',
            active: true,
          })
          .select()
          .single();

        if (clientErr) throw new Error('Error al dar de alta el cliente: ' + clientErr.message);
        targetClientId = newClient.id;

        // Si venía de un lead, actualizar estado de lead
        if (quote.lead_id) {
          await supabase
            .from('leads')
            .update({
              estado: 'convertido',
              converted_client_id: targetClientId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', quote.lead_id);
        }
      }

      // 2. Generar número de OT
      const randomHex = Math.random().toString(16).slice(2, 6).toUpperCase();
      const orderNumber = `OT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomHex}`;

      // 3. Crear Orden de Trabajo en public.work_orders
      const { data: newWo, error: woErr } = await supabase
        .from('work_orders')
        .insert({
          order_number: orderNumber,
          client_id: targetClientId,
          type: quote.work_order_type || 'corrective',
          scheduled_date: new Date().toISOString().split('T')[0],
          status: 'pending',
          checklist_status: 'draft',
          total_amount: quote.total,
          observations: `[Generada desde Presupuesto Oficial ${quote.quote_number}]\nProyecto: ${quote.title}${quote.notes ? `\nCondiciones: ${quote.notes}` : ''}`,
          is_custom_location: false,
        })
        .select()
        .single();

      if (woErr) throw new Error('Error al generar la orden de trabajo: ' + woErr.message);

      // 4. Copiar ítems presupuestados como extras en public.extras
      const itemsList = Array.isArray(quote.items) ? quote.items : [];
      if (itemsList.length > 0) {
        const extrasPayload = itemsList.map((it) => ({
          work_order_id: newWo.id,
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          cost_price: 0,
          billed: false,
          unit: 'u',
        }));
        await supabase.from('extras').insert(extrasPayload);
      }

      // 5. Marcar presupuesto como convertido
      await supabase
        .from('quotes')
        .update({
          status: 'converted',
          client_id: targetClientId,
          converted_work_order_id: newWo.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quote.id);

      await loadData();

      Swal.fire({
        icon: 'success',
        title: '¡Orden de Trabajo Creada!',
        html: `Se generó la orden <strong>${orderNumber}</strong> vinculada al presupuesto <strong>${quote.quote_number}</strong>.`,
        showCancelButton: true,
        confirmButtonText: 'Ir al Detalle de la Orden',
        cancelButtonText: 'Permanecer en Presupuestos',
        confirmButtonColor: '#16a34a',
      }).then((res) => {
        if (res.isConfirmed) {
          navigate(`/ordenes/${newWo.id}`);
        }
      });
    } catch (err) {
      console.error('Error al convertir presupuesto:', err);
      Swal.fire('Error', err.message || 'No se pudo convertir el presupuesto.', 'error');
    }
  };

  // Eliminar Presupuesto
  const handleDeleteQuote = async (quote) => {
    if (quote.status === 'converted') {
      return Swal.fire('No permitido', 'No se puede eliminar un presupuesto ya convertido en orden de trabajo.', 'warning');
    }

    const res = await Swal.fire({
      title: '¿Eliminar presupuesto?',
      text: `Se borrará el presupuesto ${quote.quote_number}. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });

    if (res.isConfirmed) {
      const { error } = await supabase.from('quotes').delete().eq('id', quote.id);
      if (!error) {
        setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
        Swal.fire('Eliminado', 'El presupuesto fue dado de baja.', 'success');
      } else {
        Swal.fire('Error', 'No se pudo eliminar: ' + error.message, 'error');
      }
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <FileText className="text-brand-500" size={26} />
            Presupuestos y Cotizaciones
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gestión comercial de cotizaciones formales, exportación de PDF y conversión a órdenes de trabajo
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus size={18} />
          Nuevo Presupuesto
        </button>
      </div>

      {/* Tarjetas Superiores de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 border-l-4 border-l-brand-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Total Cotizado (Mes)
            </p>
            <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {formatCurrency(kpiStats.totalCotizadoMes)}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Emisiones del mes en curso</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
            <DollarSign size={22} />
          </div>
        </div>

        <div className="card p-5 border-l-4 border-l-blue-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Pendientes Respuesta
            </p>
            <h3 className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
              {kpiStats.pendientes}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">En borrador o enviados</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Clock size={22} />
          </div>
        </div>

        <div className="card p-5 border-l-4 border-l-emerald-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Aprobados / OTs
            </p>
            <h3 className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              {kpiStats.aprobadosOConvertidos}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Aprobados o convertidos</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div className="card p-5 border-l-4 border-l-purple-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Tasa de Conversión
            </p>
            <h3 className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">
              {kpiStats.tasaConversion}%
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Efectividad comercial global</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <TrendingUp size={22} />
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por N°, cliente, obra..."
            className="input pl-10 text-xs w-full"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1 shrink-0">
            <Filter size={14} /> Estado:
          </span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'draft', label: 'Borrador' },
            { id: 'sent', label: 'Enviados' },
            { id: 'approved', label: 'Aprobados' },
            { id: 'converted', label: 'Convertidos a OT' },
            { id: 'rejected', label: 'Rechazados' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista / Tabla de Presupuestos */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-gray-400">Cargando presupuestos comerciales...</p>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FileText size={36} className="mx-auto text-gray-300 dark:text-gray-600" />
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">
              No se encontraron presupuestos
            </h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              {searchTerm || statusFilter !== 'all'
                ? 'Probá ajustando los términos de búsqueda o filtros de estado.'
                : 'Creá tu primer presupuesto comercial formal haciendo clic en "Nuevo Presupuesto".'}
            </p>
          </div>
        ) : (
          <div className="table-container border-0">
            <table>
              <thead>
                <tr>
                  <th>Presupuesto</th>
                  <th>Cliente / Contacto</th>
                  <th>Tipo / Título</th>
                  <th>Total Cotizado</th>
                  <th>Validez</th>
                  <th>Estado</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((q) => {
                  const sc = QUOTE_STATUS_COLORS[q.status] || QUOTE_STATUS_COLORS.draft;
                  const isExpired =
                    q.valid_until &&
                    new Date(q.valid_until) < new Date() &&
                    q.status !== 'approved' &&
                    q.status !== 'converted';

                  return (
                    <tr key={q.id}>
                      {/* Presupuesto */}
                      <td>
                        <span className="font-mono font-bold text-gray-900 dark:text-white text-xs block">
                          {q.quote_number}
                        </span>
                        <span className="text-[11px] text-gray-400 block mt-0.5">
                          {formatDate(q.created_at)}
                        </span>
                      </td>

                      {/* Cliente */}
                      <td>
                        <span className="font-bold text-gray-900 dark:text-white text-xs block">
                          {q.client_name}
                        </span>
                        {(q.client_phone || q.client_email) && (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-0.5">
                            {[q.client_phone, q.client_email].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </td>

                      {/* Obra / Tipo */}
                      <td>
                        <span className="font-semibold text-gray-900 dark:text-white text-xs block truncate max-w-[220px]" title={q.title}>
                          {q.title}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 block mt-0.5">
                          {WORK_ORDER_TYPE_LABELS[q.work_order_type] || q.work_order_type}
                        </span>
                      </td>

                      {/* Total */}
                      <td>
                        <span className="font-mono font-extrabold text-gray-900 dark:text-white text-sm block">
                          {formatCurrency(q.total)}
                        </span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">
                          {Number(q.iva_rate) > 0 ? `Incluye IVA (${q.iva_rate}%)` : 'Sin IVA discriminado'}
                        </span>
                      </td>

                      {/* Validez */}
                      <td>
                        <span
                          className={`text-xs font-medium block ${
                            isExpired ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {q.valid_until ? formatDate(q.valid_until) : '15 días'}
                        </span>
                        {isExpired && (
                          <span className="text-[10px] text-rose-500 block">Vencido</span>
                        )}
                      </td>

                      {/* Estado con selector */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className={`badge border ${sc.bg} flex items-center gap-1.5`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {QUOTE_STATUS_LABELS[q.status] || q.status}
                          </span>
                        </div>
                      </td>

                      {/* Acciones */}
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Descargar PDF */}
                          <button
                            onClick={() => handleDownloadPDF(q)}
                            className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                            title="Descargar Presupuesto en PDF Membretado"
                          >
                            <Download size={16} />
                          </button>

                          {/* Enviar WhatsApp */}
                          <button
                            onClick={() => handleSendWhatsApp(q)}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                            title="Enviar resumen comercial por WhatsApp"
                          >
                            <MessageCircle size={16} />
                          </button>

                          {/* Convertir en OT o Ver OT */}
                          {q.status === 'converted' ? (
                            <button
                              onClick={() => q.converted_work_order_id && navigate(`/ordenes/${q.converted_work_order_id}`)}
                              className="px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-[11px] font-bold flex items-center gap-1 hover:bg-purple-100 transition-colors"
                              title="Ver Orden de Trabajo vinculada"
                            >
                              <span>Ver OT</span>
                              <ArrowRight size={13} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleConvertToWorkOrder(q)}
                              className="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-xs"
                              title="Convertir este presupuesto en una Orden de Trabajo oficial"
                            >
                              <span>Convertir OT</span>
                              <ArrowRight size={13} />
                            </button>
                          )}

                          {/* Menú de cambio de estado rápido */}
                          {q.status !== 'converted' && (
                            <div className="relative group">
                              <button
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800"
                                title="Cambiar estado comercial"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-lg p-1 z-20 hidden group-hover:block animate-fade-in text-xs">
                                {q.status !== 'sent' && (
                                  <button
                                    onClick={() => handleStatusChange(q.id, 'sent')}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 text-blue-600 font-medium"
                                  >
                                    Marcar Enviado
                                  </button>
                                )}
                                {q.status !== 'approved' && (
                                  <button
                                    onClick={() => handleStatusChange(q.id, 'approved')}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 text-emerald-600 font-medium"
                                  >
                                    Marcar Aprobado
                                  </button>
                                )}
                                {q.status !== 'rejected' && (
                                  <button
                                    onClick={() => handleStatusChange(q.id, 'rejected')}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 text-rose-600 font-medium"
                                  >
                                    Marcar Rechazado
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Editar */}
                          {q.status !== 'converted' && (
                            <button
                              onClick={() => handleOpenEdit(q)}
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                              title="Editar Presupuesto"
                            >
                              <Edit3 size={15} />
                            </button>
                          )}

                          {/* Eliminar */}
                          {q.status !== 'converted' && (
                            <button
                              onClick={() => handleDeleteQuote(q)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              title="Eliminar Presupuesto"
                            >
                              <Trash2 size={15} />
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

      {/* MODAL: Crear / Editar Presupuesto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-slate-800 space-y-5 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {editingQuoteId ? 'Editar Presupuesto' : 'Nuevo Presupuesto Comercial'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Completá los datos del cliente, ítems y validez del presupuesto
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitQuote} className="space-y-4">
              {/* Origen del Cliente */}
              {!editingQuoteId && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Origen del Destinatario
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: 'client', label: 'Cliente Registrado' },
                      { id: 'lead', label: 'Consulta Web / Lead' },
                      { id: 'manual', label: 'Datos Manuales' },
                    ].map((tab) => (
                      <button
                        type="button"
                        key={tab.id}
                        onClick={() => {
                          setSourceType(tab.id);
                          if (tab.id === 'manual') {
                            setSelectedClientId('');
                            setSelectedLeadId('');
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          sourceType === tab.id
                            ? 'bg-brand-600 text-white shadow-xs'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selector si es Cliente o Lead */}
              {!editingQuoteId && sourceType === 'client' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Seleccionar Cliente
                  </label>
                  <select
                    className="select text-xs w-full"
                    value={selectedClientId}
                    onChange={(e) => handleClientSelect(e.target.value)}
                  >
                    <option value="">Seleccionar cliente de la lista...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.contact_phone ? `(${c.contact_phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!editingQuoteId && sourceType === 'lead' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Seleccionar Consulta Web / Lead
                  </label>
                  <select
                    className="select text-xs w-full"
                    value={selectedLeadId}
                    onChange={(e) => handleLeadSelect(e.target.value)}
                  >
                    <option value="">Seleccionar lead de la lista...</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.empresa || l.nombre} - {l.servicio || 'Consulta'} ({l.telefono || l.email || 'S/D'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Ficha de Contacto */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Cliente / Razón Social <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ej. Distribuidora Sur S.A."
                    className="input text-xs w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Teléfono de Contacto
                  </label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="Ej. 11 2345-6789"
                    className="input text-xs w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Email de Contacto
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="contacto@empresa.com"
                    className="input text-xs w-full"
                  />
                </div>
              </div>

              {/* Obra, Tipo y Validez */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Título / Obra / Proyecto <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej. Instalación VRF Piso 2"
                    className="input text-xs w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Tipo de Trabajo
                  </label>
                  <select
                    className="select text-xs w-full"
                    value={workOrderType}
                    onChange={(e) => setWorkOrderType(e.target.value)}
                  >
                    <option value="corrective">Correctivo / Reparación</option>
                    <option value="preventive">Mantenimiento Preventivo</option>
                    <option value="installation">Instalación Termomecánica</option>
                    <option value="obra">Obra Integral / Montaje</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Válido Hasta
                  </label>
                  <input
                    type="date"
                    required
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="input text-xs w-full"
                  />
                </div>
              </div>

              {/* Constructor Dinámico de Ítems */}
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Ítems y Materiales del Presupuesto
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                  >
                    <Plus size={14} /> Agregar Ítem
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {items.map((it, idx) => (
                    <div
                      key={it.id || idx}
                      className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700"
                    >
                      <span className="text-xs font-bold text-gray-400 w-5 text-center">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="Descripción del trabajo, material o equipo..."
                        value={it.description}
                        onChange={(e) => handleUpdateItem(idx, 'description', e.target.value)}
                        className="input text-xs flex-1"
                      />
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Cant."
                        value={it.quantity}
                        onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                        className="input text-xs w-16 text-center"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          placeholder="P. Unit"
                          value={it.unit_price}
                          onChange={(e) => handleUpdateItem(idx, 'unit_price', e.target.value)}
                          className="input pl-6 text-xs w-full font-mono"
                        />
                      </div>
                      <span className="text-xs font-mono font-bold text-gray-900 dark:text-white w-24 text-right">
                        {formatCurrency(it.subtotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={items.length <= 1}
                        className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30"
                        title="Quitar ítem"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales y Selector de IVA */}
              <div className="p-4 bg-gray-50 dark:bg-slate-800/70 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Subtotal Neto:</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white">
                    {formatCurrency(subtotal)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Alícuota IVA:</span>
                    <select
                      value={ivaRate}
                      onChange={(e) => setIvaRate(Number(e.target.value))}
                      className="select text-xs py-0.5 px-2 font-semibold"
                    >
                      <option value="21">21% (General AFIP)</option>
                      <option value="0">0% (Sin IVA / Monotributo)</option>
                    </select>
                  </div>
                  <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">
                    +{formatCurrency(ivaAmount)}
                  </span>
                </div>

                <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-sm font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">
                    Total Presupuestado:
                  </span>
                  <span className="text-lg font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {/* Notas y Condiciones */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Condiciones Comerciales y Observaciones
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. Forma de pago 50% anticipo y 50% contra entrega. No incluye andamiaje para altura > 4m."
                  rows={2}
                  className="input text-xs w-full resize-none"
                />
              </div>

              {/* Botones de acción del Modal */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="btn-secondary text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary text-xs"
                >
                  {isSubmitting ? 'Guardando...' : editingQuoteId ? 'Guardar Cambios' : 'Generar Presupuesto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
