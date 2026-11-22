import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, MapPin, Phone, Clock, Wrench, User,
  Camera, FileSignature, ClipboardCheck, Package, CheckCircle2,
  XCircle, AlertCircle, Edit3, Trash2, Calendar, Hash, Thermometer,
  ChevronDown, ChevronUp, ShieldCheck, Navigation, Wind, Box,
  PauseCircle, AlertTriangle, RotateCcw, History, TrendingUp, DollarSign,
  Percent, Check
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatDate, formatDateTime, formatTime, formatCurrency, getStatusLabel, getStatusColor, resolveOrderLocation } from '@4s-clima/shared';
import {
  WORK_ORDER_STATUS,
  WORK_ORDER_TYPE_LABELS,
  EQUIPMENT_TYPE_LABELS,
  TARGET_UNITS,
  TARGET_UNIT_LABELS,
  UNIT_SCOPES,
  UNIT_SCOPE_LABELS,
  HOLD_REASONS,
  HOLD_REASON_LABELS,
  VISIT_OUTCOMES,
  VISIT_OUTCOME_LABELS
} from '@4s-clima/shared/constants';
import LocationViewerMap from '../components/geo/LocationViewerMap';
import LiveTrackingViewer from '../components/geo/LiveTrackingViewer';
import { useAdminAuth } from '../App';

/**
 * Página de detalle completo de una Orden de Trabajo para el Admin.
 * Muestra: info del cliente/planta/equipo, timeline, checklist, fotos, firma, extras.
 */
export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAdminAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner';
  const [order, setOrder] = useState(null);
  const [visits, setVisits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const [expandedPhoto, setExpandedPhoto] = useState(null);
  const [isProfitabilityOpen, setIsProfitabilityOpen] = useState(true);
  const [savingExtraCostId, setSavingExtraCostId] = useState(null);
  const [extraCostDrafts, setExtraCostDrafts] = useState({});

  useEffect(() => {
    loadOrder();
    loadTechnicians();

    const subscription = supabase
      .channel(`order-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `id=eq.${id}` }, () => loadOrder())
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, [id]);

  async function loadTechnicians() {
    const { data } = await supabase.from('users').select('id, name').eq('role', 'tecnico').neq('active', false);
    setTechnicians(data || []);
  }

  async function loadOrder() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        plant:plants(*),
        equipment:equipment(*),
        assigned:users!work_orders_assigned_to_fkey(id, name, phone, hourly_rate_regular, hourly_rate_overtime),
        checklist_items(*),
        photos(*),
        signatures(*),
        extras(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error loading order:', error);
      navigate('/ordenes');
      return;
    }
    setOrder(data);
    setEditData({
      scheduled_date: data.scheduled_date || '',
      scheduled_time: data.scheduled_time || '',
      assigned_to: data.assigned_to || '',
      observations: data.observations || '',
      target_unit: data.target_unit || 'both',
    });

    // Cargar historial cronológico de tramos y visitas (work_order_visits)
    try {
      const { data: visitsData, error: vErr } = await supabase
        .from('work_order_visits')
        .select(`
          id,
          work_order_id,
          technician_id,
          started_at,
          ended_at,
          outcome,
          reason_code,
          summary_notes,
          created_at,
          technician:users!technician_id(id, name, phone)
        `)
        .eq('work_order_id', id)
        .order('started_at', { ascending: false });

      if (!vErr && visitsData) {
        setVisits(visitsData);
      } else {
        setVisits([]);
      }
    } catch (vErr) {
      console.warn('Error cargando tramos de visita en admin:', vErr);
      setVisits([]);
    }

    setIsLoading(false);
  }

  const handleUpdateExtraCost = async (extraId, costValue) => {
    const cost = Math.max(0, parseFloat(costValue) || 0);
    setSavingExtraCostId(extraId);
    try {
      const { error } = await supabase
        .from('extras')
        .update({ cost_price: cost })
        .eq('id', extraId);

      if (error) {
        alert('Error al guardar el costo del material: ' + error.message);
      } else {
        setOrder((prev) => ({
          ...prev,
          extras: (prev.extras || []).map((e) => (e.id === extraId ? { ...e, cost_price: cost } : e)),
        }));
      }
    } catch (err) {
      console.error('Error updating cost_price:', err);
      alert('Error de conexión al actualizar costo.');
    } finally {
      setSavingExtraCostId(null);
    }
  };

  const handleResumeOrder = async () => {
    if (!window.confirm('¿Deseas reanudar y reabrir esta orden de trabajo? Su estado volverá a Pendiente para que el técnico asignado continúe el servicio.')) {
      return;
    }
    const updatePayload = {
      status: WORK_ORDER_STATUS.PENDING,
      hold_reason: null,
      hold_notes: null,
      paused_at: null,
      paused_by: null,
      travel_started_at: null,
      arrived_at: null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('work_orders')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      alert('Error reanudando la orden: ' + error.message);
      return;
    }

    if (order.assigned_to) {
      const clientName = order.client?.name || order.plant?.name || 'Cliente';
      const orderNumber = order.order_number || order.id?.slice(0, 8);
      supabase.functions.invoke('notify-assignment', {
        body: {
          type: 'assigned',
          technicianId: order.assigned_to,
          customMessage: `Orden #${orderNumber} (${clientName}) reanudada por administración. Ya podés continuar con el servicio.`,
          record: {
            ...order,
            ...updatePayload,
            clientName,
          }
        }
      }).catch((err) => console.warn('Error notificando reanudación:', err));
    }

    await loadOrder();
  };

  const handleSaveEdit = async () => {
    const previousTechId = order.assigned_to;
    const newTechId = editData.assigned_to;
    const isTechChanged = previousTechId && previousTechId !== newTechId;

    const updatePayload = {
      scheduled_date: editData.scheduled_date || null,
      scheduled_time: editData.scheduled_time || null,
      assigned_to: newTechId || null,
      observations: editData.observations || null,
      target_unit: editData.target_unit || 'both',
      updated_at: new Date().toISOString(),
    };

    // Si se reasigna a otro técnico (relevo en obra larga o cambio de guardia):
    if (isTechChanged) {
      // Si la orden estaba en viaje, en progreso o pausada, vuelve a pending
      if (
        order.status === WORK_ORDER_STATUS.TRAVELING ||
        order.status === WORK_ORDER_STATUS.IN_PROGRESS ||
        order.status === WORK_ORDER_STATUS.ON_HOLD
      ) {
        updatePayload.status = WORK_ORDER_STATUS.PENDING;
        updatePayload.travel_started_at = null;
        updatePayload.arrived_at = null;
        updatePayload.hold_reason = null;
        updatePayload.hold_notes = null;
        updatePayload.paused_at = null;
        updatePayload.paused_by = null;
      }

      // Cerrar cualquier visita activa del técnico saliente como 'reassigned'
      try {
        const nextTechName = technicians.find((t) => t.id === newTechId)?.name || 'otro técnico';
        await supabase
          .from('work_order_visits')
          .update({
            ended_at: new Date().toISOString(),
            outcome: 'reassigned',
            summary_notes: `Orden reasignada por administración al técnico ${nextTechName}. Avances y checklist preservados.`,
          })
          .eq('work_order_id', id)
          .eq('outcome', 'in_progress');
      } catch (vErr) {
        console.warn('Nota: error cerrando visita en reasignación:', vErr);
      }
    }

    const { error } = await supabase
      .from('work_orders')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      alert('Error al guardar: ' + error.message);
      return;
    }

    const clientName = order.client?.name || order.plant?.name || 'Cliente';
    const orderNumber = order.order_number || order.id?.slice(0, 8);

    // 1. Notificar al nuevo técnico si se asignó uno nuevo
    if (newTechId && newTechId !== previousTechId) {
      supabase.functions.invoke('notify-assignment', {
        body: {
          type: 'assigned',
          technicianId: newTechId,
          record: {
            ...order,
            ...updatePayload,
            assigned_to: newTechId,
            clientName,
          }
        }
      }).catch((err) => console.warn('Error notify new tech:', err));
    }

    // 2. Notificar y desasignar al técnico anterior si fue reemplazado o desasignado
    if (isTechChanged) {
      const unassignMsg = `Actualización Operativa: La orden #${orderNumber} (${clientName}) fue reasignada por administración. Ya no debes asistir a este destino.`;

      // Invocación a Edge Function para Web Push
      supabase.functions.invoke('notify-assignment', {
        body: {
          type: 'unassigned',
          technicianId: previousTechId,
          customMessage: unassignMsg,
          clientName,
          record: {
            id: order.id,
            order_number: orderNumber,
            assigned_to: previousTechId,
            clientName,
          }
        }
      }).catch((err) => console.warn('Error notify unassign:', err));

      // Broadcast en tiempo real al canal del técnico desasignado
      try {
        const alertChannel = supabase.channel(`tech_alerts_${previousTechId}`);
        alertChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            alertChannel.send({
              type: 'broadcast',
              event: 'order_status_changed',
              payload: {
                type: 'unassigned',
                orderId: order.id,
                orderNumber,
                clientName,
                message: unassignMsg,
              }
            }).then(() => {
              supabase.removeChannel(alertChannel);
            }).catch(() => {});
          }
        });
      } catch (bcErr) {
        console.warn('Error broadcast unassign:', bcErr);
      }
    }

    setIsEditing(false);
    loadOrder();
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Estás seguro de que querés eliminar esta orden? Esta acción no se puede deshacer.')) return;
    setIsDeleting(true);

    // Si la orden estaba asignada a un técnico, notificarle de inmediato antes de borrar
    const previousTechId = order.assigned_to;
    if (previousTechId) {
      const clientName = order.client?.name || order.plant?.name || 'Cliente';
      const orderNumber = order.order_number || order.id?.slice(0, 8);
      const cancelMsg = `Orden Cancelada: La orden #${orderNumber} (${clientName}) fue dada de baja por administración.`;

      // 1. Invocar Edge Function para Web Push
      supabase.functions.invoke('notify-assignment', {
        body: {
          type: 'cancelled',
          technicianId: previousTechId,
          customMessage: cancelMsg,
          clientName,
          record: {
            id: order.id,
            order_number: orderNumber,
            assigned_to: previousTechId,
            clientName,
          }
        }
      }).catch((err) => console.warn('Error notify cancel:', err));

      // 2. Broadcast en tiempo real al canal del técnico
      try {
        const alertChannel = supabase.channel(`tech_alerts_${previousTechId}`);
        alertChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            alertChannel.send({
              type: 'broadcast',
              event: 'order_status_changed',
              payload: {
                type: 'cancelled',
                orderId: order.id,
                orderNumber,
                clientName,
                message: cancelMsg,
              }
            }).then(() => {
              supabase.removeChannel(alertChannel);
            }).catch(() => {});
          }
        });
      } catch (bcErr) {
        console.warn('Error broadcast cancel:', bcErr);
      }
    }

    // Borrar dependencias primero
    await supabase.from('checklist_items').delete().eq('work_order_id', id);
    await supabase.from('extras').delete().eq('work_order_id', id);
    await supabase.from('photos').delete().eq('work_order_id', id);
    await supabase.from('signatures').delete().eq('work_order_id', id);

    const { error } = await supabase.from('work_orders').delete().eq('id', id);
    if (error) {
      alert('Error al eliminar: ' + error.message);
      setIsDeleting(false);
    } else {
      navigate('/ordenes');
    }
  };

  if (isLoading || !order) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 bg-gray-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        <div className="h-64 bg-gray-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
        <div className="h-48 bg-gray-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const sc = getStatusColor(order.status);
  const checklist = order.checklist_items || [];
  const photos = order.photos || [];
  const signatures = order.signatures || [];
  const extras = order.extras || [];
  const extrasTotal = extras.reduce((sum, e) => sum + (e.quantity * e.unit_price), 0);
  const loc = resolveOrderLocation(order);
  const isTraveling = order.status === WORK_ORDER_STATUS.TRAVELING;
  const isInProgress = order.status === WORK_ORDER_STATUS.IN_PROGRESS;
  const isSurveyOrder = Boolean(
    order.is_survey_only ||
    order.type === 'survey' ||
    order.type === 'diagnostic' ||
    order.type === 'technical_visit' ||
    order.type === 'relevamiento' ||
    order.type === 'evaluacion'
  );

  // --- ANÁLISIS DE RENTABILIDAD REAL (JOB COSTING) ---
  // Horas trabajadas (sumando tramos de visitas o fallback con started_at/arrived_at y completed_at)
  let totalHoursWorked = 0;
  if (visits && visits.length > 0) {
    let totalMs = 0;
    visits.forEach((v) => {
      if (v.started_at) {
        const start = new Date(v.started_at).getTime();
        const end = v.ended_at ? new Date(v.ended_at).getTime() : Date.now();
        if (end > start) totalMs += (end - start);
      }
    });
    totalHoursWorked = totalMs / 3600000;
  } else if (order.arrived_at || order.started_at) {
    const start = new Date(order.arrived_at || order.started_at).getTime();
    const end = order.completed_at ? new Date(order.completed_at).getTime() : Date.now();
    if (end > start) {
      totalHoursWorked = (end - start) / 3600000;
    }
  }

  // Costo Mano de Obra: si technician_payout > 0 se usa directo; sino horas × hourly_rate_regular (fallback 12000)
  const techHourlyRate = Number(order.assigned?.hourly_rate_regular) || 12000;
  let laborCost = 0;
  let laborCostDetail = '';
  if (Number(order.technician_payout) > 0) {
    laborCost = Number(order.technician_payout);
    laborCostDetail = 'Payout directo pactado';
  } else {
    laborCost = totalHoursWorked * techHourlyRate;
    laborCostDetail = `${totalHoursWorked.toFixed(1)} hs × ${formatCurrency(techHourlyRate)}/h`;
  }

  // Costo Materiales / Repuestos (suma de cost_price * quantity cargado por admin)
  const materialsCost = extras.reduce((sum, e) => {
    const qty = Number(e.quantity) || 1;
    const cp = Number(e.cost_price) || 0;
    return sum + (qty * cp);
  }, 0);

  // Ingreso Facturado / Estimado: work_order.total_amount si está facturada o suma de extras
  const isBilledOrPriced = Boolean(
    order.afip_voucher_number ||
    order.payment_status === 'pending' ||
    order.payment_status === 'paid' ||
    (order.total_amount && Number(order.total_amount) > 0)
  );
  const revenue = isBilledOrPriced && Number(order.total_amount) > 0
    ? Number(order.total_amount)
    : extrasTotal;
  const revenueLabel = isBilledOrPriced && Number(order.total_amount) > 0
    ? 'Ingreso Facturado'
    : 'Ingreso Estimado';

  // Margen Neto ($) y Margen (%)
  const totalDirectCosts = laborCost + materialsCost;
  const netMargin = revenue - totalDirectCosts;
  const marginPercent = revenue > 0 ? (netMargin / revenue) * 100 : 0;

  // Semáforo de Rentabilidad
  let marginBadge = {
    bg: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    label: 'Saludable / Rentable (≥ 20%)',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  };
  if (netMargin < 0 || marginPercent < 0) {
    marginBadge = {
      bg: 'bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      dot: 'bg-rose-500',
      label: 'Pérdida Operativa (< 0%)',
      textColor: 'text-rose-600 dark:text-rose-400',
    };
  } else if (marginPercent < 20) {
    marginBadge = {
      bg: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      dot: 'bg-amber-500',
      label: 'Margen Bajo (< 20%)',
      textColor: 'text-amber-600 dark:text-amber-400',
    };
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/ordenes')}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {order.order_number || 'Orden de Trabajo'}
              </h1>
              <span className={`badge ${sc.bg} ${sc.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                {getStatusLabel(order.status)}
              </span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
              {WORK_ORDER_TYPE_LABELS[order.type]} · Creada el {formatDate(order.created_at)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {order.status !== WORK_ORDER_STATUS.COMPLETED && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="btn-secondary text-sm"
            >
              <Edit3 size={16} />
              {isEditing ? 'Cancelar Edición' : 'Editar'}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800/50 dark:hover:bg-red-900/20"
          >
            <Trash2 size={16} />
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>

      {/* Banner de Alerta Operativa: Orden en Pausa / Impedimento */}
      {order.status === WORK_ORDER_STATUS.ON_HOLD && (
        <div className="card p-5 mb-6 bg-orange-50/80 dark:bg-orange-950/40 border-2 border-orange-300 dark:border-orange-800/80 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-orange-200/80 dark:border-orange-800/60">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-orange-950 dark:text-orange-100">
                    Orden en Pausa Operativa / Con Impedimento
                  </h3>
                  <span className="badge bg-orange-200 text-orange-900 dark:bg-orange-900/60 dark:text-orange-200 text-xs font-bold">
                    En Pausa
                  </span>
                </div>
                <p className="text-xs text-orange-800 dark:text-orange-300 mt-1">
                  Reportado por <strong>{order.assigned?.name || 'el técnico'}</strong> el {formatDateTime(order.paused_at || order.updated_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResumeOrder}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-sm"
              >
                <RotateCcw size={14} />
                <span>Reanudar / Reabrir Orden</span>
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200 bg-white/80 dark:bg-slate-900/80"
              >
                <User size={14} />
                <span>Reasignar a otro Técnico</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-xl border border-orange-200/60 dark:border-orange-800/40">
              <span className="text-gray-500 dark:text-gray-400 font-semibold block mb-1">Motivo Declarado</span>
              <p className="font-bold text-orange-900 dark:text-orange-200 text-sm">
                {HOLD_REASON_LABELS[order.hold_reason] || order.hold_reason || 'Sin clasificar'}
              </p>
            </div>

            <div className="md:col-span-2 bg-white/80 dark:bg-slate-900/60 p-3 rounded-xl border border-orange-200/60 dark:border-orange-800/40">
              <span className="text-gray-500 dark:text-gray-400 font-semibold block mb-1">Detalle del Impedimento / Notas del Técnico</span>
              <p className="text-gray-800 dark:text-gray-200 italic font-medium">
                "{order.hold_notes || 'Sin observaciones detalladas'}"
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Operativo (4 Fases) */}
      <div className="card p-6 mb-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <Clock size={16} className="text-brand-500" /> Timeline Operativo
        </h3>
        <div className="flex items-center gap-0">
          {[
            { label: 'Creada', date: order.created_at, icon: Calendar, done: true },
            {
              label: 'En Camino',
              date: order.travel_started_at,
              icon: Navigation,
              done: !!order.travel_started_at || isTraveling || isInProgress || order.status === WORK_ORDER_STATUS.COMPLETED
            },
            {
              label: 'En Planta',
              date: order.arrived_at || order.started_at,
              icon: Building2,
              done: !!(order.arrived_at || order.started_at) || isInProgress || order.status === WORK_ORDER_STATUS.COMPLETED
            },
            { label: 'Completada', date: order.completed_at, icon: CheckCircle2, done: !!order.completed_at },
          ].map((step, i, arr) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step.done
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-600'
                  }`}>
                  <step.icon size={18} />
                </div>
                <span className={`text-xs font-semibold mt-2 ${step.done ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600'}`}>
                  {step.label}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {step.date ? formatDateTime(step.date) : '—'}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 rounded ${step.done ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Radar de Live Tracking en Vivo (SOLO se muestra y escucha canal cuando la orden está en estado 'traveling') */}
      {isTraveling && (
        <div className="mb-6">
          <LiveTrackingViewer
            orderId={order.id}
            orderNumber={order.order_number}
            clientName={order.client?.name || order.plant?.name || ''}
            clientPhone={order.client?.phone || order.plant?.contact_phone || ''}
            scheduledDate={order.scheduled_date}
            scheduledTime={order.scheduled_time}
            destinationCoords={{ latitude: loc.latitude, longitude: loc.longitude }}
            destinationAddress={loc.address}
            technicianName={order.assigned?.name || 'Técnico'}
            isTraveling={true}
          />
        </div>
      )}

      {/* Si el técnico ya llegó a la planta (in_progress), avisar que el Live Tracking culminó y está trabajando en sitio */}
      {isInProgress && (
        <div className="card p-4 mb-6 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Building2 size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                El técnico ya se encuentra en el lugar
                <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-[10px]">
                  Trabajando en sitio
                </span>
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {order.arrived_at || order.started_at
                  ? `Llegada registrada: ${formatDateTime(order.arrived_at || order.started_at)}`
                  : 'Arribo a planta confirmado'} · Rastreo GPS desactivado para preservar batería.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Info + Edición */}
        <div className="lg:col-span-1 space-y-6">
          {/* Tarjeta de Rentabilidad de la Orden (Job Costing - Visible únicamente para rol admin / owner) */}
          {isAdmin && (
            <div className="card p-5 border border-gray-200 dark:border-slate-800 shadow-sm transition-all">
              <div
                onClick={() => setIsProfitabilityOpen(!isProfitabilityOpen)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-xs">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      Rentabilidad
                      <span className="text-[10px] normal-case font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Job Costing
                      </span>
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Margen neto y costos directos
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${marginBadge.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${marginBadge.dot}`} />
                    {marginPercent >= 0 ? `+${marginPercent.toFixed(1)}%` : `${marginPercent.toFixed(1)}%`}
                  </span>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                    aria-label="Colapsar rentabilidad"
                  >
                    {isProfitabilityOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {isProfitabilityOpen && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800/80 space-y-4">
                  {/* Grilla de Métricas Financieras */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Ingreso */}
                    <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        {revenueLabel}
                      </span>
                      <p className="text-base font-extrabold text-gray-900 dark:text-white mt-0.5 font-mono">
                        {formatCurrency(revenue)}
                      </p>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        {isBilledOrPriced ? 'Total facturado / acordado' : 'Suma de extras/repuestos'}
                      </span>
                    </div>

                    {/* Mano de Obra */}
                    <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Mano de Obra
                      </span>
                      <p className="text-base font-extrabold text-gray-900 dark:text-white mt-0.5 font-mono">
                        {formatCurrency(laborCost)}
                      </p>
                      <span className="text-[10px] text-gray-400 block mt-0.5 truncate" title={laborCostDetail}>
                        {laborCostDetail}
                      </span>
                    </div>

                    {/* Costo Materiales */}
                    <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Costo Materiales
                      </span>
                      <p className="text-base font-extrabold text-gray-900 dark:text-white mt-0.5 font-mono">
                        {formatCurrency(materialsCost)}
                      </p>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        {extras.length} {extras.length === 1 ? 'repuesto/extra' : 'repuestos/extras'}
                      </span>
                    </div>

                    {/* Margen Neto */}
                    <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                        Margen Neto
                      </span>
                      <p className={`text-base font-extrabold mt-0.5 font-mono ${marginBadge.textColor}`}>
                        {formatCurrency(netMargin)}
                      </p>
                      <span className="text-[10px] text-gray-400 block mt-0.5 font-medium truncate" title={marginBadge.label}>
                        {marginBadge.label}
                      </span>
                    </div>
                  </div>

                  {/* Barra Visual de Distribución de Costos */}
                  {revenue > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                        <span>Estructura de Costos</span>
                        <span className="font-bold">{marginPercent.toFixed(1)}% margen</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, (laborCost / revenue) * 100))}%` }}
                          className="bg-blue-500"
                          title={`Mano de obra: ${((laborCost / revenue) * 100).toFixed(1)}%`}
                        />
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, (materialsCost / revenue) * 100))}%` }}
                          className="bg-amber-500"
                          title={`Materiales: ${((materialsCost / revenue) * 100).toFixed(1)}%`}
                        />
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, (netMargin / revenue) * 100))}%` }}
                          className={netMargin >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}
                          title={`Margen neto: ${marginPercent.toFixed(1)}%`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 pt-0.5">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500" /> Mano Obra
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500" /> Repuestos
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Margen
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Datos Editables */}
          {isEditing ? (
            <div className="card p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <Edit3 size={16} className="text-brand-500" /> Editar Orden
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Fecha Programada</label>
                  <input type="date" className="input" value={editData.scheduled_date} onChange={(e) => setEditData({ ...editData, scheduled_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Hora</label>
                  <input type="time" className="input" value={editData.scheduled_time} onChange={(e) => setEditData({ ...editData, scheduled_time: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Técnico Asignado</label>
                  <select className="select" value={editData.assigned_to} onChange={(e) => setEditData({ ...editData, assigned_to: e.target.value })}>
                    <option value="">Sin asignar</option>
                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                {order.equipment_id && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Alcance sobre el Equipo
                    </label>
                    <select
                      className="select text-sm"
                      value={editData.target_unit || 'both'}
                      onChange={(e) => setEditData({ ...editData, target_unit: e.target.value })}
                    >
                      {Object.entries(TARGET_UNIT_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Observaciones</label>
                  <textarea className="input min-h-[80px]" value={editData.observations} onChange={(e) => setEditData({ ...editData, observations: e.target.value })} />
                </div>
                <button onClick={handleSaveEdit} className="btn-primary w-full">
                  <CheckCircle2 size={16} /> Guardar Cambios
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Cliente */}
              <div className="card p-6">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Building2 size={16} className="text-brand-500" /> Cliente
                </h3>
                <p className="font-bold text-gray-900 dark:text-white text-lg">{order.client?.name || '-'}</p>
                {order.client?.cuit && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">CUIT: {order.client.cuit}</p>}

                {/* Datos de la sede o destino eventual */}
                {loc.address && (
                  <div className="mt-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-2 border border-gray-100 dark:border-slate-800">
                    <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <MapPin size={14} className="mt-0.5 text-gray-400 shrink-0" />
                      <span>{loc.label}{loc.address && ` — ${loc.address}`}</span>
                    </div>
                    {order.plant?.contact_phone && (
                      <div className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400">
                        <Phone size={14} />
                        <span>{order.plant.contact_name || 'Contacto'}: {order.plant.contact_phone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Mapa de destino de la orden */}
                <div className="mt-4">
                  <LocationViewerMap
                    latitude={loc.latitude}
                    longitude={loc.longitude}
                    address={loc.address}
                    title={loc.label}
                    height="160px"
                  />
                </div>
              </div>

              {/* Programación */}
              <div className="card p-6">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Calendar size={16} className="text-brand-500" /> Programación
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase block mb-1">Fecha</span>
                    <p className="text-gray-900 dark:text-white font-bold">{formatDate(order.scheduled_date)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase block mb-1">Hora</span>
                    <p className="text-gray-900 dark:text-white font-bold">{order.scheduled_time ? `${order.scheduled_time.slice(0, 5)} hs` : 'A confirmar'}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase block mb-1">Técnico Asignado</span>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-sm font-bold">
                      {order.assigned?.name?.[0] || '?'}
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white">{order.assigned?.name || 'Sin asignar'}</span>
                  </div>
                </div>
              </div>

              {/* Equipo Dual (UI + UE) */}
              {order.equipment && (() => {
                const eq = order.equipment;
                const uiModel = eq.indoor_model || eq.model || 'S/D';
                const uiSerial = eq.indoor_serial || eq.serial_number || 'S/D';
                const uiLoc = eq.indoor_location || eq.location_description || 'No especificada';

                const ueModel = eq.outdoor_model || 'S/D';
                const ueSerial = eq.outdoor_serial || 'S/D';
                const ueLoc = eq.outdoor_location || 'No especificada';

                const targetLabel = TARGET_UNIT_LABELS[order.target_unit] || 'Ambas Unidades (UI + UE)';

                return (
                  <div className="card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <Wrench size={16} className="text-brand-500" /> Equipo Termomecánico
                      </h3>
                      {eq.qr_token && (
                        <span className="font-mono tabular-nums text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded">
                          {eq.qr_token}
                        </span>
                      )}
                    </div>

                    {/* Resumen del Sistema y Alcance */}
                    <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-200/70 dark:border-slate-700/60 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 dark:text-gray-400">Tipo / Marca:</span>
                        <span className="font-bold text-gray-900 dark:text-white">{EQUIPMENT_TYPE_LABELS[eq.type] || eq.type} · {eq.brand}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 dark:text-gray-400">Alcance Orden:</span>
                        <span className="font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/60 px-2 py-0.5 rounded border border-brand-200 dark:border-brand-800">
                          {targetLabel}
                        </span>
                      </div>
                      {(eq.capacity_tr_fg || eq.capacity_btu || eq.refrigerant_type) && (
                        <div className="flex justify-between items-center text-[11px] text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200/50 dark:border-slate-700/50">
                          <span>Parámetros:</span>
                          <span className="font-mono">
                            {[eq.capacity_tr_fg, eq.capacity_btu ? `${eq.capacity_btu.toLocaleString()} BTU` : '', eq.refrigerant_type].filter(Boolean).join(' | ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Ficha Unidad Interior */}
                    <div className="bg-sky-50/60 dark:bg-sky-950/20 p-3 rounded-xl border border-sky-200/70 dark:border-sky-800/50 space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-sky-900 dark:text-sky-300">
                        <Wind size={14} className="text-sky-600 dark:text-sky-400" />
                        <span>Unidad Interior (UI - Evaporadora)</span>
                      </div>
                      <div className="flex justify-between text-gray-700 dark:text-gray-300">
                        <span className="text-gray-500">Modelo:</span>
                        <span className="font-semibold">{uiModel}</span>
                      </div>
                      <div className="flex justify-between text-gray-700 dark:text-gray-300">
                        <span className="text-gray-500">N° Serie:</span>
                        <span className="font-mono font-semibold">{uiSerial}</span>
                      </div>
                      <div className="text-gray-600 dark:text-gray-400 text-[11px]">
                        <span className="text-gray-500">Ubicación:</span> {uiLoc}
                      </div>
                      {order.indoor_work_notes && (
                        <div className="mt-2 pt-1.5 border-t border-sky-200/50 dark:border-sky-800/40 text-[11px]">
                          <span className="font-bold text-sky-950 dark:text-sky-200 block mb-0.5">Detalle técnico UI:</span>
                          <p className="text-gray-800 dark:text-gray-200 italic">{order.indoor_work_notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Ficha Unidad Exterior */}
                    <div className="bg-amber-50/60 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200/70 dark:border-amber-800/50 space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300">
                        <Box size={14} className="text-amber-600 dark:text-amber-400" />
                        <span>Unidad Exterior (UE - Condensadora)</span>
                      </div>
                      <div className="flex justify-between text-gray-700 dark:text-gray-300">
                        <span className="text-gray-500">Modelo:</span>
                        <span className="font-semibold">{ueModel}</span>
                      </div>
                      <div className="flex justify-between text-gray-700 dark:text-gray-300">
                        <span className="text-gray-500">N° Serie:</span>
                        <span className="font-mono font-semibold">{ueSerial}</span>
                      </div>
                      <div className="text-gray-600 dark:text-gray-400 text-[11px]">
                        <span className="text-gray-500">Ubicación:</span> {ueLoc}
                      </div>
                      {order.outdoor_work_notes && (
                        <div className="mt-2 pt-1.5 border-t border-amber-200/50 dark:border-amber-800/40 text-[11px]">
                          <span className="font-bold text-amber-950 dark:text-amber-200 block mb-0.5">Detalle técnico UE:</span>
                          <p className="text-gray-800 dark:text-gray-200 italic">{order.outdoor_work_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Observaciones */}
              {order.observations && (
                <div className="card p-6">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-3">Observaciones</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">{order.observations}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Columna Derecha: Bitácora y Evidencia del Técnico */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bitácora de Tramos y Técnicos Intervinientes (work_order_visits) */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <History size={16} className="text-brand-500" /> Bitácora de Tramos y Técnicos Intervinientes
                {visits.length > 0 && (
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 normal-case">
                    ({visits.length} {visits.length === 1 ? 'tramo registrado' : 'tramos registrados'})
                  </span>
                )}
              </h3>
            </div>

            {visits.length === 0 ? (
              <div className="text-center py-6 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                <Clock size={28} className="mx-auto text-gray-400 mb-2" />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No hay tramos ni visitas de trabajo registradas para esta orden aún.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visits.map((v) => {
                  const isCurrentActive = v.outcome === 'in_progress';
                  let durationText = 'En curso';
                  if (v.started_at && v.ended_at) {
                    const startMs = new Date(v.started_at).getTime();
                    const endMs = new Date(v.ended_at).getTime();
                    const diffMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
                    const hours = Math.floor(diffMinutes / 60);
                    const minutes = diffMinutes % 60;
                    durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
                  }

                  return (
                    <div
                      key={v.id}
                      className={`p-4 rounded-xl border text-xs space-y-2 transition-all ${
                        isCurrentActive
                          ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/80 shadow-xs'
                          : v.outcome === 'blocked'
                          ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/80'
                          : 'bg-gray-50 dark:bg-slate-850 border-gray-200/80 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center font-bold text-gray-700 dark:text-gray-300 text-xs shadow-xs">
                            {v.technician?.name?.[0] || 'T'}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 dark:text-white text-sm">
                              {v.technician?.name || 'Técnico'}
                            </span>
                            {v.technician?.phone && (
                              <span className="text-gray-400 text-[11px] ml-1.5">
                                · {v.technician.phone}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-medium text-gray-500 dark:text-gray-400">
                            {durationText}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isCurrentActive
                                ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 animate-pulse'
                                : v.outcome === 'blocked'
                                ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-300'
                                : v.outcome === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300'
                                : v.outcome === 'partial_advance'
                                ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300'
                                : 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/50 dark:text-purple-300'
                            }`}
                          >
                            {VISIT_OUTCOME_LABELS[v.outcome] || v.outcome}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-gray-500 dark:text-gray-400 text-[11px] pt-1 border-t border-gray-200/50 dark:border-slate-800">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>Inicio: {formatDateTime(v.started_at)}</span>
                        </span>
                        {v.ended_at && (
                          <span>Fin: {formatDateTime(v.ended_at)}</span>
                        )}
                      </div>

                      {v.reason_code && (
                        <div className="text-[11px] text-orange-700 dark:text-orange-300 font-semibold bg-orange-100/60 dark:bg-orange-900/30 p-2 rounded-lg border border-orange-200/60 dark:border-orange-800/40">
                          Motivo de Bloqueo: {HOLD_REASON_LABELS[v.reason_code] || v.reason_code}
                        </div>
                      )}

                      {v.summary_notes && (
                        <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-lg border border-gray-200/60 dark:border-slate-800 text-[11px] text-gray-700 dark:text-gray-300 italic">
                          "{v.summary_notes}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Checklist */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <ClipboardCheck size={16} className="text-brand-500" /> Checklist del Técnico
                {order.checklist_status === 'submitted' && checklist.length > 0 && (
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 normal-case">
                    ({checklist.filter(c => c.status === 'ok').length}/{checklist.length} aprobados)
                  </span>
                )}
              </h3>
              {order.checklist_status === 'submitted' ? (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-1">
                  <ShieldCheck size={13} /> Enviado e Inmutable
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 flex items-center gap-1">
                  <Clock size={13} /> Modo Borrador
                </span>
              )}
            </div>

            {/* Si aún no ha sido enviado de forma definitiva por el técnico */}
            {order.checklist_status !== 'submitted' ? (
              <div className="p-6 text-center bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl space-y-2">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400 animate-pulse">
                  <Clock size={20} />
                </div>
                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Checklist en curso (Modo Borrador)
                </h4>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 max-w-md mx-auto">
                  El técnico está completando la inspección técnica en la locación. El informe detallado se habilitará en tiempo real una vez que el checklist sea enviado de forma definitiva.
                </p>
                {checklist.length > 0 && (
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-amber-100/80 dark:bg-amber-900/50 text-amber-900 dark:text-amber-300 rounded-lg">
                      Avance actual: {checklist.filter(c => c.status !== null).length} de {checklist.length} ítems respondidos
                    </span>
                  </div>
                )}
              </div>
            ) : checklist.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-600 text-sm text-center py-6">El checklist fue enviado pero no contiene ítems registrados.</p>
            ) : (
              <div className="space-y-3">
                {order.checklist_submitted_at && (
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between pb-1 border-b border-gray-100 dark:border-slate-800">
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">Certificado oficial sellado</span>
                    <span>Enviado: {formatDateTime(order.checklist_submitted_at)}</span>
                  </div>
                )}
                {/* Grupos clasificados por Alcance de Unidad (UI vs UE vs General) */}
                {(() => {
                  const sorted = [...checklist].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                  const indoorItems = sorted.filter(c => c.unit_scope === 'indoor');
                  const outdoorItems = sorted.filter(c => c.unit_scope === 'outdoor');
                  const generalItems = sorted.filter(c => c.unit_scope !== 'indoor' && c.unit_scope !== 'outdoor');

                  const renderItem = (item) => (
                    <div key={item.id} className="flex items-start gap-3 py-2 px-3 rounded-xl bg-gray-50/50 dark:bg-slate-800/30 border border-gray-100 dark:border-slate-800">
                      {item.status === 'ok' ? (
                        <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                      ) : item.status === 'fail' ? (
                        <XCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.item_name}</p>
                        {item.category && <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-semibold">{item.category}</span>}
                        {item.notes && (
                          <div className="mt-1.5 flex items-start gap-1.5 p-2 rounded-lg bg-gray-100/80 dark:bg-slate-700/50 border border-gray-200/80 dark:border-slate-700/80">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 shrink-0 mt-0.5">
                              Observación / Acción:
                            </span>
                            <span className="text-xs text-gray-800 dark:text-gray-200 font-medium break-words">
                              {item.notes}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${item.status === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          item.status === 'fail' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            item.status === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                        {item.status === 'ok' ? 'OK' : item.status === 'fail' ? 'FALLA' : item.status === 'warning' ? 'ATENCIÓN' : 'N/A'}
                      </span>
                    </div>
                  );

                  // Si ningún ítem tiene unit_scope específico, mostrar lista continua
                  if (indoorItems.length === 0 && outdoorItems.length === 0) {
                    return <div className="space-y-2">{sorted.map(renderItem)}</div>;
                  }

                  return (
                    <div className="space-y-4">
                      {/* Bloque Unidad Interior */}
                      {indoorItems.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 px-3 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800">
                            <Wind size={14} className="text-sky-600 dark:text-sky-400" />
                            <span>1. Unidad Interior (Evaporadora) — {indoorItems.length} puntos</span>
                          </div>
                          {indoorItems.map(renderItem)}
                        </div>
                      )}

                      {/* Bloque Unidad Exterior */}
                      {outdoorItems.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800">
                            <Box size={14} className="text-amber-600 dark:text-amber-400" />
                            <span>2. Unidad Exterior (Condensadora) — {outdoorItems.length} puntos</span>
                          </div>
                          {outdoorItems.map(renderItem)}
                        </div>
                      )}

                      {/* Bloque General */}
                      {generalItems.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                            <ClipboardCheck size={14} className="text-slate-500" />
                            <span>3. Protocolo General del Sistema — {generalItems.length} puntos</span>
                          </div>
                          {generalItems.map(renderItem)}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Fotos */}
          <div className="card p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Camera size={16} className="text-brand-500" /> Fotos y Evidencia
              {photos.length > 0 && (
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 normal-case">
                  ({photos.length} {photos.length === 1 ? 'foto' : 'fotos'})
                </span>
              )}
            </h3>
            {photos.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-600 text-sm text-center py-6">
                No se subieron fotos para esta orden.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {photos.map((photo) => {
                  const photoUrl = photo.url || photo.photo_url;
                  const caption = photo.caption || photo.notes;
                  const isBefore = photo.type === 'before';
                  const isIssue = photo.type === 'issue';
                  const label = isBefore
                    ? isSurveyOrder
                      ? 'Relevamiento / Inicial'
                      : 'Antes'
                    : isIssue
                    ? 'Incidencia / Detalle'
                    : 'Después';

                  const badgeClass = isBefore
                    ? 'bg-amber-500 text-white'
                    : isIssue
                    ? 'bg-rose-500 text-white'
                    : 'bg-emerald-500 text-white';

                  return (
                    <div
                      key={photo.id}
                      className="relative group cursor-pointer rounded-xl overflow-hidden border border-gray-100 dark:border-slate-800 aspect-square bg-gray-900 shadow-sm"
                      onClick={() => setExpandedPhoto(expandedPhoto === photo.id ? null : photo.id)}
                    >
                      <img
                        src={photoUrl}
                        alt={caption || label}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-2.5">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm inline-block ${badgeClass}`}>
                          {label}
                        </span>
                        {caption && (
                          <p className="text-white text-xs font-medium mt-1 truncate drop-shadow" title={caption}>
                            {caption}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Firma */}
          <div className="card p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileSignature size={16} className="text-brand-500" /> Firma del Cliente
            </h3>
            {signatures.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-600 text-sm text-center py-6">Todavía no se registró firma.</p>
            ) : (
              <div className="space-y-4">
                {signatures.map(sig => (
                  <div key={sig.id} className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4 border border-gray-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{sig.signer_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{sig.signer_role || 'Cliente'} · {formatDateTime(sig.signed_at)}</p>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
                      <img src={sig.signature_url} alt="Firma" className="max-h-24 mx-auto" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extras / Materiales */}
          <div className="card p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Package size={16} className="text-brand-500" /> Materiales y Extras
              {extras.length > 0 && (
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 normal-case">
                  ({extras.length} {extras.length === 1 ? 'ítem' : 'ítems'} · Venta: {formatCurrency(extrasTotal)}
                  {isAdmin && ` · Costo: ${formatCurrency(materialsCost)}`})
                </span>
              )}
            </h3>
            {extras.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-600 text-sm text-center py-6">No se registraron materiales extra.</p>
            ) : (
              <div className="table-container border-0">
                <table>
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Cant.</th>
                      {isAdmin && (
                        <th title="Costo unitario de compra para cálculo de rentabilidad real">
                          Costo Compra (Admin)
                        </th>
                      )}
                      <th>P. Venta</th>
                      <th>Total Venta</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extras.map((e) => (
                      <tr key={e.id}>
                        <td className="font-medium text-gray-900 dark:text-white">{e.description}</td>
                        <td className="text-gray-600 dark:text-gray-400">{e.quantity} {e.unit}</td>
                        {isAdmin && (
                          <td>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400 font-medium">$</span>
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={extraCostDrafts[e.id] !== undefined ? extraCostDrafts[e.id] : (e.cost_price ?? 0)}
                                onChange={(ev) => setExtraCostDrafts({ ...extraCostDrafts, [e.id]: ev.target.value })}
                                onBlur={(ev) => handleUpdateExtraCost(e.id, ev.target.value)}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter') {
                                    ev.currentTarget.blur();
                                  }
                                }}
                                className="w-24 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 shadow-xs"
                                placeholder="0"
                                title="Editar costo de compra (Enter o click afuera para guardar)"
                              />
                              {savingExtraCostId === e.id && (
                                <span className="text-[10px] text-brand-600 animate-pulse font-medium">Guardando...</span>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="text-gray-600 dark:text-gray-400">{formatCurrency(e.unit_price)}</td>
                        <td className="font-semibold text-gray-900 dark:text-white">{formatCurrency(e.quantity * e.unit_price)}</td>
                        <td>
                          {e.billed ? (
                            <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Facturado</span>
                          ) : (
                            <span className="badge bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Sin facturar</span>
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
      </div>

      {/* Modal de foto expandida */}
      {expandedPhoto && (() => {
        const p = photos.find((item) => item.id === expandedPhoto);
        const pUrl = p?.url || p?.photo_url;
        const pCaption = p?.caption || p?.notes;
        const isBefore = p?.type === 'before';
        const isIssue = p?.type === 'issue';
        const label = isBefore
          ? isSurveyOrder
            ? 'Relevamiento / Estado Inicial'
            : 'Antes del servicio'
          : isIssue
          ? 'Incidencia / Detalle'
          : 'Después del servicio';

        return (
          <div
            className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4"
            onClick={() => setExpandedPhoto(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={pUrl}
                alt="Foto expandida"
                className="max-w-full max-h-[75vh] rounded-xl object-contain shadow-2xl"
              />
              <div className="mt-3 flex items-center gap-2 flex-wrap justify-center">
                <span
                  className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded text-white ${
                    isBefore ? 'bg-amber-500' : isIssue ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                >
                  {label}
                </span>
                {pCaption && (
                  <span className="text-sm text-white font-medium bg-white/20 backdrop-blur-md px-3 py-0.5 rounded-lg">
                    {pCaption}
                  </span>
                )}
              </div>
              <button
                onClick={() => setExpandedPhoto(null)}
                className="mt-3 px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
