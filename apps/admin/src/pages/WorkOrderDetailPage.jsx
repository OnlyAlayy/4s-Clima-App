import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, MapPin, Phone, Clock, Wrench, User,
  Camera, FileSignature, ClipboardCheck, Package, CheckCircle2,
  XCircle, AlertCircle, Edit3, Trash2, Calendar, Hash, Thermometer,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatDate, formatDateTime, formatCurrency, getStatusLabel, getStatusColor } from '@4s-clima/shared/utils';
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE_LABELS, EQUIPMENT_TYPE_LABELS } from '@4s-clima/shared/constants';

/**
 * Página de detalle completo de una Orden de Trabajo para el Admin.
 * Muestra: info del cliente/planta/equipo, timeline, checklist, fotos, firma, extras.
 */
export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const [expandedPhoto, setExpandedPhoto] = useState(null);

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
    const { data } = await supabase.from('users').select('id, name').eq('role', 'tecnico').eq('active', true);
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
        assigned:users!work_orders_assigned_to_fkey(id, name, phone),
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
    });
    setIsLoading(false);
  }

  const handleSaveEdit = async () => {
    const { error } = await supabase
      .from('work_orders')
      .update({
        scheduled_date: editData.scheduled_date || null,
        scheduled_time: editData.scheduled_time || null,
        assigned_to: editData.assigned_to || null,
        observations: editData.observations || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      setIsEditing(false);
      loadOrder();
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Estás seguro de que querés eliminar esta orden? Esta acción no se puede deshacer.')) return;
    setIsDeleting(true);

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

      {/* Timeline */}
      <div className="card p-6 mb-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <Clock size={16} className="text-brand-500" /> Timeline
        </h3>
        <div className="flex items-center gap-0">
          {[
            { label: 'Creada', date: order.created_at, icon: Calendar, done: true },
            { label: 'Iniciada', date: order.started_at, icon: Clock, done: !!order.started_at },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Info + Edición */}
        <div className="lg:col-span-1 space-y-6">
          {/* Datos Editables */}
          {isEditing ? (
            <div className="card p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <Edit3 size={16} className="text-brand-500" /> Editar Orden
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Fecha Programada</label>
                  <input type="date" className="input" value={editData.scheduled_date} onChange={(e) => setEditData({...editData, scheduled_date: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Hora</label>
                  <input type="time" className="input" value={editData.scheduled_time} onChange={(e) => setEditData({...editData, scheduled_time: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Técnico Asignado</label>
                  <select className="select" value={editData.assigned_to} onChange={(e) => setEditData({...editData, assigned_to: e.target.value})}>
                    <option value="">Sin asignar</option>
                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Observaciones</label>
                  <textarea className="input min-h-[80px]" value={editData.observations} onChange={(e) => setEditData({...editData, observations: e.target.value})} />
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
                {order.plant && (
                  <div className="mt-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-2 border border-gray-100 dark:border-slate-800">
                    <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <MapPin size={14} className="mt-0.5 text-gray-400" />
                      <span>{order.plant.name}{order.plant.address && ` — ${order.plant.address}`}</span>
                    </div>
                    {order.plant.contact_phone && (
                      <div className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400">
                        <Phone size={14} />
                        <span>{order.plant.contact_name || 'Contacto'}: {order.plant.contact_phone}</span>
                      </div>
                    )}
                  </div>
                )}
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
                    <p className="text-gray-900 dark:text-white font-bold">{order.scheduled_time ? `${order.scheduled_time.slice(0,5)} hs` : 'A confirmar'}</p>
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

              {/* Equipo */}
              {order.equipment && (
                <div className="card p-6">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Wrench size={16} className="text-brand-500" /> Equipo
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Tipo</span><span className="font-bold text-gray-900 dark:text-white">{EQUIPMENT_TYPE_LABELS[order.equipment.type] || order.equipment.type}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Marca/Modelo</span><span className="font-bold text-gray-900 dark:text-white">{order.equipment.brand} {order.equipment.model}</span></div>
                    {order.equipment.serial_number && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">N° Serie</span><span className="font-mono text-xs bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded text-gray-900 dark:text-white">{order.equipment.serial_number}</span></div>}
                    {order.equipment.capacity_btu && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Capacidad</span><span className="font-bold text-gray-900 dark:text-white">{order.equipment.capacity_btu.toLocaleString()} BTU</span></div>}
                  </div>
                </div>
              )}

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

        {/* Columna Derecha: Evidencia del Técnico */}
        <div className="lg:col-span-2 space-y-6">
          {/* Checklist */}
          <div className="card p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <ClipboardCheck size={16} className="text-brand-500" /> Checklist del Técnico
              {checklist.length > 0 && (
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 normal-case">
                  ({checklist.filter(c => c.status === 'ok').length}/{checklist.length} completados)
                </span>
              )}
            </h3>
            {checklist.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-600 text-sm text-center py-6">El técnico aún no completó el checklist.</p>
            ) : (
              <div className="space-y-2">
                {checklist.sort((a, b) => a.sort_order - b.sort_order).map(item => (
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
                      {item.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">"{item.notes}"</p>}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      item.status === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      item.status === 'fail' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {item.status === 'ok' ? 'OK' : item.status === 'fail' ? 'FALLA' : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fotos */}
          <div className="card p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Camera size={16} className="text-brand-500" /> Fotos
              {photos.length > 0 && <span className="text-xs font-medium text-gray-500 dark:text-gray-400 normal-case">({photos.length} fotos)</span>}
            </h3>
            {photos.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-600 text-sm text-center py-6">No se subieron fotos para esta orden.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map(photo => (
                  <div
                    key={photo.id}
                    className="relative group cursor-pointer rounded-xl overflow-hidden border border-gray-100 dark:border-slate-800 aspect-square"
                    onClick={() => setExpandedPhoto(expandedPhoto === photo.id ? null : photo.id)}
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || 'Foto'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        photo.type === 'before' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                      }`}>
                        {photo.type === 'before' ? 'Antes' : 'Después'}
                      </span>
                      {photo.caption && <p className="text-white text-xs mt-1 truncate">{photo.caption}</p>}
                    </div>
                  </div>
                ))}
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
              {extras.length > 0 && <span className="text-xs font-medium text-gray-500 dark:text-gray-400 normal-case">({extras.length} items · {formatCurrency(extrasTotal)})</span>}
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
                      <th>P. Unit.</th>
                      <th>Total</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extras.map(e => (
                      <tr key={e.id}>
                        <td className="font-medium text-gray-900 dark:text-white">{e.description}</td>
                        <td className="text-gray-600 dark:text-gray-400">{e.quantity} {e.unit}</td>
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
      {expandedPhoto && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedPhoto(null)}
        >
          <img
            src={photos.find(p => p.id === expandedPhoto)?.url}
            alt="Foto expandida"
            className="max-w-full max-h-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
