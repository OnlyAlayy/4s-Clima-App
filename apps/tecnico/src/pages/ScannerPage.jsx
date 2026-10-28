import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import {
  Camera,
  Search,
  QrCode,
  AlertCircle,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Link2,
  ChevronRight,
  Calendar,
  ExternalLink,
  User,
  Wrench,
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { EQUIPMENT_TYPE_LABELS, WORK_ORDER_TYPE_LABELS, getStatusColor, getStatusLabel } from '@4s-clima/shared';
import { useWorkOrderStore } from '../stores/workOrderStore';
import toast from 'react-hot-toast';

export default function ScannerPage() {
  const [mode, setMode] = useState('qr'); // 'qr' | 'manual'
  const [manualCode, setManualCode] = useState('');
  const [equipment, setEquipment] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const { workOrders, currentOrder, fetchWorkOrder } = useWorkOrderStore();

  useEffect(() => {
    if (mode === 'qr' && !equipment) {
      let scanner = null;
      try {
        scanner = new Html5QrcodeScanner(
          'qr-reader',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            rememberLastUsedCamera: true,
          },
          false
        );

        scanner.render(
          (decodedText) => {
            scanner.clear().catch(() => {});
            handleSearch(decodedText);
          },
          () => {
            // Ignorar errores continuos de escaneo
          }
        );
      } catch (err) {
        console.error('Error inicializando escáner QR:', err);
      }

      return () => {
        if (scanner) {
          scanner.clear().catch((e) => console.error('Error al limpiar scanner:', e));
        }
      };
    }
  }, [mode, equipment]);

  /**
   * Extrae el código limpio sea una URL pública o un código manual
   */
  const extractCleanIdentifier = (rawInput) => {
    if (!rawInput) return '';
    let text = rawInput.trim();

    // Si es una URL completa (ej: https://.../qr/4S-8F2A o http://localhost:5173/qr/EQ-123)
    if (text.includes('/qr/')) {
      const parts = text.split('/qr/');
      text = parts[parts.length - 1].split('?')[0].split('#')[0].trim();
    } else if (text.startsWith('http://') || text.startsWith('https://')) {
      try {
        const url = new URL(text);
        const pathSegments = url.pathname.split('/').filter(Boolean);
        text = pathSegments[pathSegments.length - 1] || text;
      } catch {
        // Fallback
      }
    }

    return text.replace(/\/+$/, '');
  };

  const handleSearch = async (rawCode) => {
    const cleanCode = extractCleanIdentifier(rawCode);
    if (!cleanCode) return;

    setIsLoading(true);
    setError('');
    setEquipment(null);
    setHistory([]);

    try {
      // 1. Detectar si el identificador es un UUID válido para evitar el error 22P02 de PostgreSQL
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode);

      let query = supabase
        .from('equipment')
        .select(`
          *,
          plant:plants(name, address, client_id),
          client:clients(name)
        `);

      if (isUuid) {
        query = query.or(`id.eq.${cleanCode},qr_token.eq.${cleanCode},serial_number.eq.${cleanCode}`);
      } else {
        query = query.or(`qr_token.ilike.${cleanCode},serial_number.ilike.${cleanCode}`);
      }

      const { data, error: fetchError } = await query.limit(1).maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError(`No se encontró ningún equipo asociado al código "${cleanCode}".`);
        return;
      }

      setEquipment(data);

      // 2. Cargar historial clínico de intervenciones de este equipo
      try {
        const { data: historyData } = await supabase
          .from('work_orders')
          .select(`
            id,
            order_number,
            type,
            status,
            scheduled_date,
            completed_at,
            observations,
            assigned:users(name),
            extras(description, quantity, unit),
            checklist_items(item_name, status, notes)
          `)
          .eq('equipment_id', data.id)
          .order('scheduled_date', { ascending: false })
          .limit(10);

        setHistory(historyData || []);
      } catch (histErr) {
        console.warn('No se pudo cargar historial de la unidad:', histErr);
      }
    } catch (err) {
      console.error('Error al buscar equipo:', err);
      setError('Hubo un error al consultar el equipo en la base de datos.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    handleSearch(manualCode);
  };

  // Buscar orden en curso del técnico
  const activeOrder =
    currentOrder?.status === 'in_progress' || currentOrder?.status === 'traveling'
      ? currentOrder
      : workOrders.find((w) => w.status === 'in_progress' || w.status === 'traveling');

  // Vincular este equipo a la orden en curso del técnico
  const handleLinkToActiveOrder = async () => {
    if (!activeOrder || !equipment) return;
    setIsLinking(true);

    try {
      const { error: linkErr } = await supabase
        .from('work_orders')
        .update({ equipment_id: equipment.id })
        .eq('id', activeOrder.id);

      if (linkErr) throw linkErr;

      await fetchWorkOrder(activeOrder.id);
      toast.success(`Equipo vinculado a la orden ${activeOrder.order_number}`);
      navigate(`/orden/${activeOrder.id}`);
    } catch (err) {
      console.error('Error vinculando equipo:', err);
      toast.error('No se pudo vincular el equipo a la orden.');
    } finally {
      setIsLinking(false);
    }
  };

  const getOperationalStatusBadge = (status) => {
    switch (status) {
      case 'fuera_de_servicio':
        return (
          <span className="badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-semibold text-xs flex items-center gap-1.5">
            <XCircle size={13} className="text-red-500" /> Fuera de Servicio
          </span>
        );
      case 'con_observaciones':
        return (
          <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold text-xs flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-amber-500" /> Con Observaciones
          </span>
        );
      case 'operativo':
      default:
        return (
          <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold text-xs flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-500" /> Operativo
          </span>
        );
    }
  };

  return (
    <div className="page-container h-full flex flex-col pb-24">
      {/* Header */}
      <div className="page-header">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Gestión de Activos y QR
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Escaneá el código QR o ingresá el código manual para ver ficha e historial.
        </p>
      </div>

      {/* Selector de modo */}
      <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl mb-4">
        <button
          onClick={() => {
            setMode('qr');
            setEquipment(null);
            setError('');
          }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            mode === 'qr'
              ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <Camera size={16} />
          <span>Escáner QR</span>
        </button>
        <button
          onClick={() => {
            setMode('manual');
            setEquipment(null);
            setError('');
          }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            mode === 'manual'
              ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <QrCode size={16} />
          <span>Manual / Serie</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col">
        {!equipment ? (
          <>
            {mode === 'qr' && (
              <div className="flex-1 flex flex-col">
                <div
                  id="qr-reader"
                  className="w-full rounded-2xl overflow-hidden shadow-sm border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
                <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-3">
                  Apuntá la cámara al código QR de la unidad de aire acondicionado
                </p>
              </div>
            )}

            {mode === 'manual' && (
              <form onSubmit={handleManualSubmit} className="flex-1 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                    Token QR, N° de Serie o Código
                  </label>
                  <div className="relative">
                    <Search
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                    <input
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="Ej: 4S-8F2A o SN-94821"
                      className="input w-full pl-10 h-12 uppercase font-mono font-medium"
                      autoFocus
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!manualCode.trim() || isLoading}
                  className="btn-primary w-full h-12 text-sm font-bold flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Buscando en inventario...</span>
                    </>
                  ) : (
                    <span>Buscar Unidad</span>
                  )}
                </button>
              </form>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 rounded-xl flex items-start gap-3 border border-red-100 dark:border-red-800">
                <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400 font-medium leading-relaxed">
                  {error}
                </p>
              </div>
            )}
          </>
        ) : (
          /* Ficha Técnica y Registro Clínico del Activo */
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3">
            {/* Tarjeta de Datos del Equipo */}
            <div className="card space-y-4 p-4 border border-gray-200 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Package size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                      {equipment.brand} {equipment.model}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 rounded border border-brand-200 dark:border-brand-800 tabular-nums">
                        {equipment.qr_token || 'SIN TOKEN'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {EQUIPMENT_TYPE_LABELS[equipment.type] || equipment.type}
                      </span>
                    </div>
                  </div>
                </div>
                <div>{getOperationalStatusBadge(equipment.operational_status)}</div>
              </div>

              {/* Especificaciones */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 dark:bg-slate-850 p-3 rounded-xl border border-gray-100 dark:border-slate-800">
                <div>
                  <span className="text-gray-400 block font-medium">N° de Serie:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {equipment.serial_number || 'N/D'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Capacidad:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {equipment.capacity_btu ? `${equipment.capacity_btu.toLocaleString()} BTU` : 'N/D'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Ubicación / Sector:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {equipment.location_description || 'Sin especificar'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Planta / Sucursal:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                    {equipment.plant?.name || 'N/D'}
                  </span>
                </div>
              </div>

              {/* Acción Rápida: Vincular a Orden Activa */}
              {activeOrder && activeOrder.equipment_id !== equipment.id && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 text-xs font-bold">
                    <Link2 size={15} className="text-indigo-600 dark:text-indigo-400" />
                    <span>Tenés la orden {activeOrder.order_number} en progreso</span>
                  </div>
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                    Podés vincular esta unidad a tu visita actual para que las fotos y checklist queden registrados bajo este equipo.
                  </p>
                  <button
                    onClick={handleLinkToActiveOrder}
                    disabled={isLinking}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    {isLinking ? 'Vinculando...' : 'Vincular a mi Orden en Curso'}
                  </button>
                </div>
              )}

              {activeOrder && activeOrder.equipment_id === equipment.id && (
                <button
                  onClick={() => navigate(`/orden/${activeOrder.id}`)}
                  className="w-full btn-primary py-2.5 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <span>Ir a la Orden en Curso ({activeOrder.order_number})</span>
                  <ChevronRight size={16} />
                </button>
              )}
            </div>

            {/* Historial Clínico de Intervenciones */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock size={15} className="text-brand-500" />
                  <span>Historial de Servicios ({history.length})</span>
                </h3>
                <span className="text-[10px] text-gray-400">Últimas visitas</span>
              </div>

              {history.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">
                  No se registran órdenes de trabajo previas para este equipo.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {history.map((wo) => {
                    const sc = getStatusColor(wo.status);
                    return (
                      <div
                        key={wo.id}
                        onClick={() => navigate(`/orden/${wo.id}`)}
                        className="p-3 bg-gray-50/70 dark:bg-slate-850 rounded-xl border border-gray-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-slate-700 transition-colors cursor-pointer space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                            {wo.order_number}
                          </span>
                          <span className={`badge text-[10px] py-0 px-1.5 ${sc.bg} ${sc.text}`}>
                            {getStatusLabel(wo.status)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} /> {wo.scheduled_date || 'Sin fecha'}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {WORK_ORDER_TYPE_LABELS[wo.type] || wo.type}
                          </span>
                        </div>

                        {/* Técnico responsable */}
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 text-[11px]">
                          <User size={12} className="text-gray-400 shrink-0" />
                          <span className="text-gray-500">Técnico:</span>
                          <span className="font-semibold">{wo.assigned?.name || 'Técnico anterior'}</span>
                        </div>

                        {/* Repuestos / Insumos */}
                        {wo.extras && wo.extras.length > 0 && (
                          <div className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded border border-amber-200/50 dark:border-amber-900/40">
                            <span className="font-semibold">Repuestos: </span>
                            <span>{wo.extras.map((e) => `${e.description} (${e.quantity} ${e.unit || 'un'})`).join(', ')}</span>
                          </div>
                        )}

                        {wo.observations && (
                          <p className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2 italic leading-relaxed">
                            "{wo.observations}"
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Botón para escanear otro equipo */}
            <button
              onClick={() => {
                setEquipment(null);
                setManualCode('');
                setHistory([]);
              }}
              className="btn-secondary w-full py-3 text-xs font-bold"
            >
              Escanear Otra Unidad
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
