import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Search, Phone, Mail, Building2, User, Clock,
  CheckCircle2, XCircle, AlertCircle, ArrowUpRight, FileText,
  StickyNote, UserPlus, RefreshCw, ExternalLink, Calendar,
  Filter, Sparkles, Send, Check, X, Download
} from 'lucide-react';
import Swal from 'sweetalert2';
import { supabase } from '@4s-clima/shared/supabase';
import { formatDate, formatTime, getArgentinaDate } from '@4s-clima/shared';
import { saveAndDownloadBlob } from '../services/downloadHelper';
import { useAdminAuth } from '../App';

// Constantes de estados de leads
export const LEAD_STATUS = {
  PENDING: 'pendiente',
  CONTACTED: 'contactado',
  BUDGETED: 'presupuestado',
  CONVERTED: 'convertido',
  DISCARDED: 'descartado',
};

export const LEAD_STATUS_LABELS = {
  pendiente: 'Nuevo / Sin atender',
  nuevo: 'Nuevo / Sin atender',
  new: 'Nuevo / Sin atender',
  contactado: 'Contactado',
  presupuestado: 'Presupuestado',
  convertido: 'Convertido',
  descartado: 'Descartado',
};

export const LEAD_STATUS_CONFIG = {
  pendiente: {
    label: 'Nuevo / Sin atender',
    bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
    dot: 'bg-amber-500',
  },
  nuevo: {
    label: 'Nuevo / Sin atender',
    bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
    dot: 'bg-amber-500',
  },
  contactado: {
    label: 'Contactado',
    bg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800/80',
    dot: 'bg-blue-500',
  },
  presupuestado: {
    label: 'Presupuestado',
    bg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800/80',
    dot: 'bg-purple-500',
  },
  convertido: {
    label: 'Convertido a Cliente',
    bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
    dot: 'bg-emerald-500',
  },
  descartado: {
    label: 'Descartado',
    bg: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-400 border-gray-200 dark:border-slate-700',
    dot: 'bg-gray-400',
  },
};

/**
 * Genera el enlace oficial a WhatsApp Web/App para contactar al lead en un clic.
 */
function getWhatsAppUrl(phone, name = '') {
  if (!phone) return null;
  let clean = phone.replace(/\D/g, '');
  if (!clean) return null;

  if (clean.startsWith('0')) clean = clean.slice(1);
  if (!clean.startsWith('54')) {
    if (clean.length === 10) {
      clean = '549' + clean;
    } else {
      clean = '54' + clean;
    }
  } else if (clean.startsWith('54') && !clean.startsWith('549') && clean.length === 12) {
    clean = '549' + clean.slice(2);
  }

  const firstName = name.trim().split(' ')[0] || '';
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';
  const text = encodeURIComponent(`${greeting}, te contacto desde 4S Clima respecto a tu consulta enviada a través de nuestra web corporativa.`);
  return `https://wa.me/${clean}?text=${text}`;
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const { profile } = useAdminAuth();

  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal de Notas Internas
  const [notesModalLead, setNotesModalLead] = useState(null);
  const [internalNotes, setInternalNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Modal de Conversión a Cliente
  const [convertModalLead, setConvertModalLead] = useState(null);
  const [clientForm, setClientForm] = useState({
    name: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    cuit: '',
    address: '',
    contractType: 'eventual',
    notes: '',
  });
  const [isConverting, setIsConverting] = useState(false);

  // Carga de leads desde Supabase
  const loadLeads = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (err) {
      console.error('[LeadsPage] Error al cargar consultas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();

    // Suscripción en tiempo real a la tabla public.leads
    const channel = supabase
      .channel('leads_admin_feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => {
          loadLeads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Actualización rápida de estado
  const handleStatusChange = async (lead, newStatus) => {
    // Si se selecciona 'convertido' pero aún no se dio de alta el cliente en la base:
    if (newStatus === 'convertido') {
      if (!lead.converted_client_id) {
        // Abre el modal para obligar a rellenar y verificar todos los datos requeridos
        handleOpenConvert(lead);
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('leads')
        .update({
          estado: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id);

      if (error) throw error;

      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, estado: newStatus } : l))
      );

      const toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1800,
        timerProgressBar: true,
      });
      toast.fire({
        icon: 'success',
        title: `Estado actualizado a "${LEAD_STATUS_LABELS[newStatus] || newStatus}"`,
      });
    } catch (err) {
      Swal.fire('Error', 'No se pudo actualizar el estado: ' + err.message, 'error');
    }
  };

  // Abrir modal de notas internas
  const handleOpenNotes = (lead) => {
    setNotesModalLead(lead);
    setInternalNotes(lead.notas || '');
  };

  const handleSaveNotes = async (e) => {
    e.preventDefault();
    if (!notesModalLead) return;
    setIsSavingNotes(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          notas: internalNotes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', notesModalLead.id);

      if (error) throw error;

      setLeads((prev) =>
        prev.map((l) =>
          l.id === notesModalLead.id ? { ...l, notas: internalNotes.trim() || null } : l
        )
      );
      setNotesModalLead(null);

      Swal.fire({
        icon: 'success',
        title: 'Notas Guardadas',
        text: 'Los comentarios internos de seguimiento quedaron registrados.',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire('Error', 'No se pudieron guardar las notas: ' + err.message, 'error');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Abrir modal de conversión en cliente
  const handleOpenConvert = (lead) => {
    setConvertModalLead(lead);
    setClientForm({
      name: lead.empresa || lead.nombre || '',
      contactName: lead.nombre || '',
      contactPhone: lead.telefono || '',
      contactEmail: lead.email || '',
      cuit: '',
      address: '',
      contractType: 'eventual',
      notes: [
        lead.sector ? `Sector/Rubro: ${lead.sector}` : null,
        lead.mensaje ? `Consulta web original: "${lead.mensaje}"` : null,
        lead.notas ? `Notas comerciales previas: ${lead.notas}` : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
    });
  };

  const handleConfirmConvert = async (e) => {
    e.preventDefault();
    if (!convertModalLead) return;

    const trimmedName = clientForm.name?.trim();
    const trimmedContactName = clientForm.contactName?.trim();
    const trimmedContactPhone = clientForm.contactPhone?.trim();
    const trimmedContactEmail = clientForm.contactEmail?.trim();
    const trimmedAddress = clientForm.address?.trim();

    if (!trimmedName) {
      Swal.fire('Dato Obligatorio', 'El Nombre de Empresa o Razón Social es requerido para dar de alta al cliente.', 'warning');
      return;
    }
    if (!trimmedContactName) {
      Swal.fire('Dato Obligatorio', 'La Persona de Contacto es requerida para dar de alta al cliente.', 'warning');
      return;
    }
    if (!trimmedContactPhone) {
      Swal.fire('Dato Obligatorio', 'El Teléfono de contacto es requerido para dar de alta al cliente.', 'warning');
      return;
    }
    if (!trimmedContactEmail) {
      Swal.fire('Dato Obligatorio', 'El Email de contacto es requerido para dar de alta al cliente.', 'warning');
      return;
    }
    if (!trimmedAddress) {
      Swal.fire('Dato Obligatorio', 'La Dirección / Domicilio es requerida para registrar la planta y coordinar servicios técnicos.', 'warning');
      return;
    }

    setIsConverting(true);
    try {
      // 1. Insertar en public.clients
      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .insert({
          name: trimmedName,
          contact_name: trimmedContactName,
          contact_phone: trimmedContactPhone,
          contact_email: trimmedContactEmail,
          cuit: clientForm.cuit?.trim() || null,
          address: trimmedAddress,
          contract_type: clientForm.contractType || 'eventual',
          notes: clientForm.notes?.trim() || null,
          active: true,
        })
        .select()
        .single();

      if (clientErr) throw clientErr;

      // 2. Dar de alta automáticamente la Sede Principal en public.plants
      if (newClient && trimmedAddress) {
        await supabase.from('plants').insert({
          client_id: newClient.id,
          name: 'Sede Principal',
          address: trimmedAddress,
          contact_name: trimmedContactName,
          contact_phone: trimmedContactPhone,
          active: true,
        });
      }

      // 3. Marcar lead como 'convertido' y ligar ID
      const { error: leadErr } = await supabase
        .from('leads')
        .update({
          estado: LEAD_STATUS.CONVERTED,
          converted_client_id: newClient.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', convertModalLead.id);

      if (leadErr) {
        console.warn('[LeadsPage] Cliente creado pero no se pudo actualizar el lead:', leadErr);
      }

      setLeads((prev) =>
        prev.map((l) =>
          l.id === convertModalLead.id
            ? { ...l, estado: LEAD_STATUS.CONVERTED, converted_client_id: newClient.id }
            : l
        )
      );

      setConvertModalLead(null);

      const result = await Swal.fire({
        icon: 'success',
        title: '¡Lead Convertido a Cliente!',
        html: `Se creó exitosamente el registro de <b>${newClient.name}</b> en el directorio comercial y se registró su Sede Principal.`,
        showCancelButton: true,
        confirmButtonText: 'Ver Ficha del Cliente',
        cancelButtonText: 'Seguir en Leads',
        confirmButtonColor: '#2563eb',
      });

      if (result.isConfirmed) {
        navigate(`/clientes/${newClient.id}`);
      }
    } catch (err) {
      Swal.fire('Error', 'No se pudo convertir el lead en cliente: ' + err.message, 'error');
    } finally {
      setIsConverting(false);
    }
  };

  // KPIs calculados
  const stats = useMemo(() => {
    const total = leads.length;
    const pending = leads.filter((l) => ['pendiente', 'nuevo', 'new'].includes(l.estado)).length;
    const inProgress = leads.filter((l) => ['contactado', 'presupuestado'].includes(l.estado)).length;
    const converted = leads.filter((l) => l.estado === 'convertido').length;
    return { total, pending, inProgress, converted };
  }, [leads]);

  // Filtrado de leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Filtro de estado
      if (statusFilter !== 'all') {
        if (statusFilter === 'pendiente') {
          if (!['pendiente', 'nuevo', 'new'].includes(lead.estado)) return false;
        } else if (lead.estado !== statusFilter) {
          return false;
        }
      }

      // Filtro de búsqueda textual
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = lead.nombre?.toLowerCase().includes(q);
        const matchEmpresa = lead.empresa?.toLowerCase().includes(q) || lead.sector?.toLowerCase().includes(q);
        const matchPhone = lead.telefono?.toLowerCase().includes(q);
        const matchEmail = lead.email?.toLowerCase().includes(q);
        const matchMsg = lead.mensaje?.toLowerCase().includes(q);
        if (!matchName && !matchEmpresa && !matchPhone && !matchEmail && !matchMsg) {
          return false;
        }
      }

      return true;
    });
  }, [leads, statusFilter, search]);

  // Exportación a Excel (CSV con formato latinoamericano y UTF-8 BOM)
  const handleExportExcel = async () => {
    if (filteredLeads.length === 0) {
      Swal.fire('Atención', 'No hay consultas para exportar en el listado actual.', 'info');
      return;
    }

    const headers = [
      'Fecha',
      'Hora',
      'Nombre / Contacto',
      'Empresa / Razón Social',
      'Sector / Rubro',
      'Teléfono',
      'Email',
      'Servicio Solicitado',
      'Estado',
      'Origen',
      'Mensaje de Consulta',
      'Notas Comerciales (Seguimiento)'
    ];

    const rows = filteredLeads.map((lead) => {
      const fecha = lead.created_at ? formatDate(lead.created_at) : '-';
      const hora = lead.created_at ? formatTime(lead.created_at) : '-';
      const estadoLabel = LEAD_STATUS_LABELS[lead.estado] || lead.estado;

      return [
        fecha,
        hora,
        lead.nombre || 'N/D',
        lead.empresa || '',
        lead.sector || '',
        lead.telefono || '',
        lead.email || '',
        lead.servicio || 'General',
        estadoLabel,
        lead.origen || 'Web',
        lead.mensaje ? lead.mensaje.replace(/[\r\n]+/g, ' ') : '',
        lead.notas ? lead.notas.replace(/[\r\n]+/g, ' ') : ''
      ].map((val) => {
        let str = String(val ?? '');
        if (/^[=\-+\@]/.test(str)) str = "'" + str;
        return `"${str.replace(/"/g, '""')}"`;
      }).join(';');
    });

    const csvContent = [headers.join(';'), ...rows].join('\r\n');
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]); // UTF-8 BOM para apertura directa y limpia en Excel
    const fileName = `Consultas_Web_4SClima_${getArgentinaDate()}.csv`;
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8' });

    await saveAndDownloadBlob(blob, fileName, [
      {
        description: 'Planilla de Excel (CSV)',
        accept: { 'text/csv': ['.csv'] },
      },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-500/10 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              <MessageSquare size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Consultas Web & Leads
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                Seguimiento comercial de prospectos y pedidos de presupuesto recibidos desde la web oficial.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredLeads.length === 0}
            className="btn-secondary flex items-center gap-2 text-xs"
            title="Exportar consultas a planilla Excel"
          >
            <Download size={14} className="text-emerald-500" />
            <span>Exportar Excel</span>
          </button>

          <button
            type="button"
            onClick={loadLeads}
            disabled={isLoading}
            className="btn-secondary flex items-center gap-2 text-xs"
            title="Refrescar listado"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 sm:p-5 flex items-center gap-4 border border-gray-100 dark:border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <MessageSquare size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Total Consultas
            </p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-0.5">
              {stats.total}
            </p>
          </div>
        </div>

        <div className="card p-4 sm:p-5 flex items-center gap-4 border border-gray-100 dark:border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Nuevas sin atender
            </p>
            <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
              {stats.pending}
            </p>
          </div>
        </div>

        <div className="card p-4 sm:p-5 flex items-center gap-4 border border-gray-100 dark:border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Clock size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              En Seguimiento
            </p>
            <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">
              {stats.inProgress}
            </p>
          </div>
        </div>

        <div className="card p-4 sm:p-5 flex items-center gap-4 border border-gray-100 dark:border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Convertidas a Cliente
            </p>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {stats.converted}
            </p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        {/* Buscador */}
        <div className="relative flex-1 min-w-[260px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, empresa, rubro, teléfono o mensaje..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 text-xs sm:text-sm"
          />
        </div>

        {/* Pills de Estado */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-gray-100 dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'pendiente', label: 'Nuevos' },
            { id: 'contactado', label: 'Contactados' },
            { id: 'presupuestado', label: 'Presupuestados' },
            { id: 'convertido', label: 'Convertidos' },
            { id: 'descartado', label: 'Descartados' },
          ].map((pill) => {
            const isActive = statusFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-xs border border-gray-200 dark:border-slate-700'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido / Listado */}
      {isLoading ? (
        <div className="p-8 space-y-3 card border border-gray-100 dark:border-slate-800">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-slate-800/60 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="p-12 text-center card border border-gray-100 dark:border-slate-800">
          <MessageSquare size={44} className="text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-700 dark:text-gray-300">
            No se encontraron consultas
          </h3>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            {search || statusFilter !== 'all'
              ? 'Probá ajustando el término de búsqueda o cambiando el filtro de estado.'
              : 'Cuando los usuarios completen el formulario de contacto en la web corporativa, aparecerán automáticamente aquí en tiempo real.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredLeads.map((lead) => {
            const stConf = LEAD_STATUS_CONFIG[lead.estado] || LEAD_STATUS_CONFIG.pendiente;
            const waUrl = getWhatsAppUrl(lead.telefono, lead.nombre);
            const isUnread = ['pendiente', 'nuevo', 'new'].includes(lead.estado);

            return (
              <div
                key={lead.id}
                className={`card p-5 border transition-all duration-200 hover:shadow-md ${
                  isUnread
                    ? 'border-amber-200 dark:border-amber-900/60 bg-gradient-to-r from-amber-500/[0.03] to-transparent'
                    : 'border-gray-100 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Columna Izquierda: Información Principal y Contacto */}
                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">
                        {lead.nombre || 'Consulta Anónima'}
                      </h3>

                      {(lead.empresa || lead.sector) && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-xs font-medium">
                          <Building2 size={12} className="text-gray-400" />
                          <span>{lead.empresa || lead.sector}</span>
                        </span>
                      )}

                      <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                        {lead.origen || 'Web'}
                      </span>

                      {/* Fecha y Hora en Formato Local Argentina */}
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 ml-auto lg:ml-0 font-medium">
                        <Calendar size={13} />
                        <span>{formatDate(lead.created_at)}</span>
                        <span>·</span>
                        <Clock size={13} />
                        <span>{formatTime(lead.created_at)} hs</span>
                      </span>
                    </div>

                    {/* Vías de contacto */}
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      {lead.telefono ? (
                        <a
                          href={`tel:${lead.telefono}`}
                          className="inline-flex items-center gap-1.5 text-brand-600 dark:text-brand-400 font-semibold hover:underline"
                        >
                          <Phone size={13} />
                          <span>{lead.telefono}</span>
                        </a>
                      ) : (
                        <span className="text-gray-400 flex items-center gap-1">
                          <Phone size={13} /> S/Teléfono
                        </span>
                      )}

                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 font-medium hover:underline"
                        >
                          <Mail size={13} />
                          <span>{lead.email}</span>
                        </a>
                      ) : (
                        <span className="text-gray-400 flex items-center gap-1">
                          <Mail size={13} /> S/Email
                        </span>
                      )}

                      {lead.servicio && (
                        <span className="text-gray-500 dark:text-gray-400">
                          Servicio: <strong className="text-gray-700 dark:text-gray-200">{lead.servicio}</strong>
                        </span>
                      )}
                    </div>

                    {/* Mensaje de la consulta */}
                    <div className="p-3.5 bg-gray-50 dark:bg-slate-900/80 rounded-2xl border border-gray-100 dark:border-slate-800 text-xs sm:text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                      <p className="font-medium text-gray-400 text-[11px] uppercase tracking-wider mb-1">
                        Mensaje recibido:
                      </p>
                      {lead.mensaje || 'Sin mensaje de consulta ingresado.'}
                    </div>

                    {/* Comentarios internos de seguimiento si existen */}
                    {lead.notas && (
                      <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200">
                        <span className="font-bold flex items-center gap-1.5 mb-1 text-blue-700 dark:text-blue-300">
                          <StickyNote size={13} /> Notas Comerciales (Walter):
                        </span>
                        <p className="whitespace-pre-wrap leading-relaxed">{lead.notas}</p>
                      </div>
                    )}
                  </div>

                  {/* Columna Derecha: Estados y Acciones Rápidas */}
                  <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-gray-100 dark:border-slate-800 shrink-0">
                    {/* Selector de Estado Rápido */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        Estado:
                      </span>
                      <select
                        value={lead.estado}
                        onChange={(e) => handleStatusChange(lead, e.target.value)}
                        className={`text-xs font-bold py-1.5 px-3 rounded-xl border transition-all ${stConf.bg}`}
                      >
                        <option value="pendiente">Nuevo / Sin atender</option>
                        <option value="contactado">Contactado</option>
                        <option value="presupuestado">Presupuestado</option>
                        <option value="convertido">Convertido a Cliente</option>
                        <option value="descartado">Descartado</option>
                      </select>
                    </div>

                    {/* Botonera de Acciones Rápidas */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* WhatsApp Button */}
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-600/20"
                          title="Contactar al lead por WhatsApp en un clic"
                        >
                          <Send size={13} />
                          <span>WhatsApp</span>
                        </a>
                      )}

                      {/* Botón Notas Internas */}
                      <button
                        type="button"
                        onClick={() => handleOpenNotes(lead)}
                        className="px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/60 text-xs font-semibold transition-all flex items-center gap-1.5"
                        title="Anotar seguimiento o comentarios internos"
                      >
                        <StickyNote size={13} className="text-amber-500" />
                        <span>{lead.notas ? 'Editar Notas' : 'Anotar'}</span>
                      </button>

                      {/* Convertir en Cliente */}
                      {lead.converted_client_id ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/clientes/${lead.converted_client_id}`)}
                          className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5"
                          title="Ver ficha del cliente en el sistema"
                        >
                          <CheckCircle2 size={13} className="text-emerald-600" />
                          <span>Ver Cliente</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenConvert(lead)}
                          className="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-brand-500/20"
                          title="Dar de alta como cliente oficial en 4S Clima"
                        >
                          <UserPlus size={13} />
                          <span>Convertir a Cliente</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Notas Internas de Seguimiento */}
      {notesModalLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                  <StickyNote size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Notas de Seguimiento Comercial
                </h3>
              </div>
              <button
                onClick={() => setNotesModalLead(null)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Lead: <strong className="text-gray-900 dark:text-white">{notesModalLead.nombre}</strong>{' '}
              {notesModalLead.empresa ? `(${notesModalLead.empresa})` : ''}
            </p>

            <form onSubmit={handleSaveNotes} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                  Comentarios y Acuerdos *
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Ej: Se lo contactó el 19/11 por WhatsApp. Pide cotización para mantenimiento de 8 splits y 1 central de 15TR..."
                  rows={5}
                  required
                  className="w-full rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-3 text-xs text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setNotesModalLead(null)}
                  disabled={isSavingNotes}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingNotes}
                  className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isSavingNotes ? 'Guardando...' : 'Guardar Notas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Convertir en Cliente */}
      {convertModalLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-950/60 text-brand-600 flex items-center justify-center">
                  <UserPlus size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Convertir Lead a Cliente Oficial
                </h3>
              </div>
              <button
                onClick={() => setConvertModalLead(null)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                Para registrar el prospecto como <b>Cliente Oficial</b> y habilitar órdenes de trabajo, es obligatorio completar y verificar los campos marcados con asterisco (<span className="text-red-500 font-bold">*</span>).
              </span>
            </div>

            <form onSubmit={handleConfirmConvert} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                  Nombre de Empresa / Razón Social <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  placeholder="Ej: Logística Central S.A."
                  required
                  className="input text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                    Persona de Contacto <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={clientForm.contactName}
                    onChange={(e) => setClientForm({ ...clientForm, contactName: e.target.value })}
                    placeholder="Ej: Juan Pérez"
                    required
                    className="input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                    Teléfono <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={clientForm.contactPhone}
                    onChange={(e) => setClientForm({ ...clientForm, contactPhone: e.target.value })}
                    placeholder="Ej: 11 2345-6789"
                    required
                    className="input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                    Email de Contacto <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={clientForm.contactEmail}
                    onChange={(e) => setClientForm({ ...clientForm, contactEmail: e.target.value })}
                    placeholder="contacto@empresa.com"
                    required
                    className="input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                    CUIT (Opcional)
                  </label>
                  <input
                    type="text"
                    value={clientForm.cuit}
                    onChange={(e) => setClientForm({ ...clientForm, cuit: e.target.value })}
                    placeholder="30-..."
                    className="input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                  Dirección / Domicilio Legal o Planta Principal <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={clientForm.address}
                  onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                  placeholder="Ej: Av. del Libertador 4500, CABA"
                  required
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                  Tipo de Contrato
                </label>
                <select
                  value={clientForm.contractType}
                  onChange={(e) => setClientForm({ ...clientForm, contractType: e.target.value })}
                  className="select text-xs"
                >
                  <option value="eventual">Eventual / Por Trabajo</option>
                  <option value="monthly">Abono Mensual</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                  Notas / Resumen de la Consulta Web
                </label>
                <textarea
                  value={clientForm.notes}
                  onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-3 text-xs text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConvertModalLead(null)}
                  disabled={isConverting}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isConverting}
                  className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors disabled:opacity-50 shadow-md shadow-brand-500/20"
                >
                  {isConverting ? 'Creando Cliente...' : 'Confirmar Alta de Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
