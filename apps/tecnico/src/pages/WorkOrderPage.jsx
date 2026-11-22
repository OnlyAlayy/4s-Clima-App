import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Phone, Clock, Wrench, Building2,
  ClipboardCheck, Play, ChevronRight, Thermometer, Hash, Package, Check, Navigation, Camera,
  User, QrCode, Wind, Box, PauseCircle, AlertTriangle, RotateCcw, History, X,
  Trash2, Plus, Image as ImageIcon
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { formatDate, formatTime, formatDateTime, getStatusLabel, getStatusColor, resolveOrderLocation } from '@4s-clima/shared';
import {
  WORK_ORDER_STATUS,
  WORK_ORDER_TYPE_LABELS,
  EQUIPMENT_TYPE_LABELS,
  TARGET_UNIT_LABELS,
  HOLD_REASONS,
  HOLD_REASON_LABELS,
  VISIT_OUTCOMES,
  VISIT_OUTCOME_LABELS
} from '@4s-clima/shared/constants';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import imageCompression from 'browser-image-compression';
import { db } from '../services/offlineDb';
import toast from 'react-hot-toast';
import LocationViewerMap from '../components/geo/LocationViewerMap';
import LiveTrackingSender from '../components/geo/LiveTrackingSender';
import nativeLocationTracker from '../services/nativeLocationTracker';

/**
 * Página de detalle de una Orden de Trabajo.
 * Muestra toda la info del cliente, planta, equipo y su historial clínico.
 * Botón para iniciar el trabajo y acceder al checklist.
 */
export default function WorkOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    currentOrder,
    isLoading,
    fetchWorkOrder,
    startTravel,
    arriveAtPlant,
    registerPartialAdvance,
    pauseWorkOrder,
  } = useWorkOrderStore();
  const [isStarting, setIsStarting] = useState(false);
  const [techLocation, setTechLocation] = useState(null);
  const [equipmentHistory, setEquipmentHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Estados para modal de Avance Parcial
  const [isPartialModalOpen, setIsPartialModalOpen] = useState(false);
  const [partialNotes, setPartialNotes] = useState('');
  const [partialPhotos, setPartialPhotos] = useState([]);
  const [isSubmittingPartial, setIsSubmittingPartial] = useState(false);
  const partialFileInputRef = useRef(null);

  // Estados para modal de Pausa / Impedimento
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [selectedHoldReason, setSelectedHoldReason] = useState(HOLD_REASONS.MISSING_PARTS);
  const [holdNotesInput, setHoldNotesInput] = useState('');
  const [holdPhotos, setHoldPhotos] = useState([]);
  const [isSubmittingHold, setIsSubmittingHold] = useState(false);
  const holdFileInputRef = useRef(null);

  // Acordeón de tramos/visitas
  const [isVisitsExpanded, setIsVisitsExpanded] = useState(true);

  // Procesar fotos adjuntadas en Web
  const handleAddPhotos = async (files, setTargetPhotos) => {
    if (!files || files.length === 0) return;
    const processed = [];
    for (const file of files) {
      try {
        const options = {
          maxSizeMB: 0.6,
          maxWidthOrHeight: 1280,
          useWebWorker: true,
          fileType: 'image/jpeg',
          initialQuality: 0.82,
        };
        const compressed = await imageCompression(file, options);
        const previewUrl = URL.createObjectURL(compressed);
        processed.push({
          id: `progress-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          file: compressed,
          preview: previewUrl,
          caption: '',
        });
      } catch (e) {
        console.warn('Error comprimiendo foto:', e);
        processed.push({
          id: `progress-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          file,
          preview: URL.createObjectURL(file),
          caption: '',
        });
      }
    }
    setTargetPhotos((prev) => [...prev, ...processed]);
  };

  // Abrir cámara nativa en Capacitor
  const handleNativeCamera = async (setTargetPhotos) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const image = await CapCamera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          promptLabelHeader: 'Foto de Avance de Obra',
          promptLabelPhoto: 'Elegir de Galería',
          promptLabelPicture: 'Tomar Foto con Cámara',
          promptLabelCancel: 'Cancelar',
        });
        if (!image?.dataUrl) return;
        const res = await fetch(image.dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `progress-${Date.now()}.${image.format || 'jpg'}`, {
          type: `image/${image.format || 'jpeg'}`,
        });
        setTargetPhotos((prev) => [
          ...prev,
          {
            id: `progress-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            file,
            preview: image.dataUrl,
            caption: '',
          },
        ]);
      } catch (err) {
        if (!err?.message?.includes('cancelled')) {
          console.error('Error abriendo cámara nativa:', err);
          toast.error('No se pudo abrir la cámara.');
        }
      }
    }
  };

  // Subir fotos de avance a Supabase Storage y registrar en public.photos / IndexedDB
  const uploadProgressPhotos = async (photosList, defaultNote, activeVisitId) => {
    if (!photosList || photosList.length === 0) return;

    let currentUserId = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      currentUserId = sessionData?.session?.user?.id || null;
    } catch (e) { }

    for (let i = 0; i < photosList.length; i++) {
      const item = photosList[i];
      const randomId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : (Math.random().toString(36).substring(2) + Date.now().toString(36));
      const fileName = `photos/${id}/progress-${Date.now()}-${randomId}-${i}.jpg`;
      const noteText = item.caption?.trim() || defaultNote || 'Avance de obra';

      if (navigator.onLine) {
        const { error: uploadError } = await supabase.storage
          .from('work-orders')
          .upload(fileName, item.file, {
            contentType: item.file.type || 'image/jpeg',
            upsert: true,
          });

        if (uploadError) {
          console.error('Error subiendo foto de avance:', uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('work-orders')
          .getPublicUrl(fileName);

        const payload = {
          work_order_id: id,
          visit_id: activeVisitId || null,
          type: 'progress',
          url: publicUrl,
          photo_url: publicUrl,
          caption: noteText,
          notes: noteText,
          created_by: currentUserId,
        };

        const { error: insertError } = await supabase.from('photos').insert(payload);
        if (insertError) {
          console.warn('Error insertando foto con visit_id/created_by, usando fallback:', insertError.message);
          await supabase.from('photos').insert({
            work_order_id: id,
            type: 'progress',
            url: publicUrl,
            photo_url: publicUrl,
            caption: noteText,
          });
        }
      } else {
        // Modo offline: almacenar localmente en Dexie
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(item.file);
        });

        const tempId = `temp-progress-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`;

        await db.photos.add({
          id: tempId,
          work_order_id: id,
          type: 'progress',
          url: base64,
          photo_url: base64,
          caption: noteText,
          notes: noteText,
          synced: false,
        });

        await db.pendingSync.add({
          table: 'photos',
          action: 'insert',
          recordId: tempId,
          data: {
            work_order_id: id,
            visit_id: activeVisitId || null,
            type: 'progress',
            photo_blob: base64.split(',')[1],
            content_type: item.file.type || 'image/jpeg',
            caption: noteText,
            notes: noteText,
            created_by: currentUserId,
          },
          created_at: new Date().toISOString(),
        });
      }
    }
  };

  useEffect(() => {
    fetchWorkOrder(id);
  }, [id, fetchWorkOrder]);

  const handleRegisterPartialAdvance = async (e) => {
    e.preventDefault();
    if (!partialNotes.trim()) {
      alert('Por favor ingresá un breve resumen del avance realizado en la jornada.');
      return;
    }

    const isObra = wo.type === 'obra' || wo.type === 'OBRA';
    if (isObra && partialPhotos.length === 0) {
      const confirmProceed = window.confirm(
        'Atención: En órdenes de tipo Obra se solicita registrar fotos del avance del día para la bitácora cronológica.\n\n¿Deseas confirmar el avance sin fotos de todas formas?'
      );
      if (!confirmProceed) return;
    }

    setIsSubmittingPartial(true);
    try {
      // 1. Obtener ID de la visita activa
      let activeVisitId = null;
      try {
        const { data: vData } = await supabase
          .from('work_order_visits')
          .select('id')
          .eq('work_order_id', id)
          .eq('outcome', 'in_progress')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        activeVisitId = vData?.id || null;
      } catch (errV) {
        console.warn('No se pudo recuperar visit_id activo:', errV);
      }

      // 2. Subir fotos de avance adjuntadas
      if (partialPhotos.length > 0) {
        await uploadProgressPhotos(partialPhotos, partialNotes.trim(), activeVisitId);
      }

      // 3. Registrar avance parcial en store
      await registerPartialAdvance(id, partialNotes.trim());
      setIsPartialModalOpen(false);
      setPartialNotes('');
      setPartialPhotos([]);
      toast.success('Avance y fotos registradas exitosamente');
      await fetchWorkOrder(id);
    } catch (err) {
      alert('Error registrando avance: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSubmittingPartial(false);
    }
  };

  const handlePauseWorkOrder = async (e) => {
    e.preventDefault();
    if (!holdNotesInput.trim()) {
      alert('Por favor ingresá una explicación detallada del impedimento o motivo de la pausa.');
      return;
    }

    const isObra = wo.type === 'obra' || wo.type === 'OBRA';
    if (isObra && holdPhotos.length === 0) {
      const confirmProceed = window.confirm(
        'Atención: En órdenes de tipo Obra se recomienda adjuntar fotos del estado/avance antes de pausar.\n\n¿Deseas pausar sin fotos de todas formas?'
      );
      if (!confirmProceed) return;
    }

    setIsSubmittingHold(true);
    try {
      // 1. Obtener ID de la visita activa
      let activeVisitId = null;
      try {
        const { data: vData } = await supabase
          .from('work_order_visits')
          .select('id')
          .eq('work_order_id', id)
          .eq('outcome', 'in_progress')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        activeVisitId = vData?.id || null;
      } catch (errV) {
        console.warn('No se pudo recuperar visit_id activo:', errV);
      }

      // 2. Subir fotos de pausa adjuntadas
      if (holdPhotos.length > 0) {
        await uploadProgressPhotos(holdPhotos, holdNotesInput.trim(), activeVisitId);
      }

      await pauseWorkOrder(id, {
        holdReason: selectedHoldReason,
        holdNotes: holdNotesInput.trim(),
      });
      setIsHoldModalOpen(false);
      setHoldNotesInput('');
      setHoldPhotos([]);
      toast.success('Orden pausada correctamente');
      await fetchWorkOrder(id);
    } catch (err) {
      alert('Error al pausar la orden: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSubmittingHold(false);
    }
  };

  // Cargar historial de las últimas 3 intervenciones del equipo
  useEffect(() => {
    if (currentOrder?.equipment?.id) {
      const loadHistory = async () => {
        setIsLoadingHistory(true);
        try {
          const { data, error } = await supabase
            .from('work_orders')
            .select(`
              id,
              order_number,
              type,
              status,
              target_unit,
              scheduled_date,
              completed_at,
              observations,
              indoor_work_notes,
              outdoor_work_notes,
              assigned:users(name),
              extras(description, quantity, unit),
              checklist_items(item_name, status, notes, unit_scope)
            `)
            .eq('equipment_id', currentOrder.equipment.id)
            .neq('id', currentOrder.id)
            .order('scheduled_date', { ascending: false })
            .limit(3);

          if (!error && data) {
            setEquipmentHistory(data);
          }
        } catch (err) {
          console.warn('Error cargando historial de intervenciones del equipo:', err);
        } finally {
          setIsLoadingHistory(false);
        }
      };
      loadHistory();
    } else {
      setEquipmentHistory([]);
    }
  }, [currentOrder?.equipment?.id, currentOrder?.id]);

  const handleStartTravel = async () => {
    setIsStarting(true);
    try {
      await nativeLocationTracker.requestPermissions();
    } catch (e) {
      console.warn('GPS permission prompt note:', e);
    }
    await startTravel(id);
    await fetchWorkOrder(id);
    setIsStarting(false);
  };

  const handleArriveAtPlant = async () => {
    setIsStarting(true);
    await arriveAtPlant(id);
    await fetchWorkOrder(id);
    setIsStarting(false);
  };

  if (isLoading || !currentOrder) {
    return (
      <div className="page-container">
        <div className="space-y-4 pt-16">
          <div className="skeleton h-8 w-48 rounded-xl" />
          <div className="skeleton h-32 rounded-2xl" />
          <div className="skeleton h-32 rounded-2xl" />
          <div className="skeleton h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  const wo = currentOrder;
  const statusColors = getStatusColor(wo.status);
  const isPending = !wo.status || wo.status === WORK_ORDER_STATUS.PENDING || wo.status === 'unassigned';
  const isTraveling = wo.status === WORK_ORDER_STATUS.TRAVELING;
  const isInProgress = wo.status === WORK_ORDER_STATUS.IN_PROGRESS;
  const isOnHold = wo.status === WORK_ORDER_STATUS.ON_HOLD;
  const isCompleted = wo.status === WORK_ORDER_STATUS.COMPLETED;
  const loc = resolveOrderLocation(wo);

  // Verificación del flujo ordenado de evidencia
  const isSurveyOrDiagnostic = Boolean(
    wo.is_survey_only ||
    wo.type === 'survey' ||
    wo.type === 'diagnostic' ||
    wo.type === 'technical_visit' ||
    wo.type === 'relevamiento' ||
    wo.type === 'evaluacion'
  );

  const hasBeforePhoto = wo.photos?.some((p) => p.type === 'before');
  const hasAfterPhoto = wo.photos?.some((p) => p.type === 'after');
  const isChecklistSubmitted = wo.checklist_status === 'submitted';

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header bg-gray-50/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-800 active:bg-gray-100 dark:active:bg-slate-700 transition-colors shadow-sm"
            aria-label="Volver"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {wo.order_number || 'Orden de Trabajo'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`badge text-[10px] shadow-sm border ${isTraveling
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800 animate-pulse'
                  : isInProgress
                    ? 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-800'
                    : isOnHold
                      ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'
                      : isCompleted
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                        : 'bg-white text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700'
                }`}>
                {getStatusLabel(wo.status)}
              </span>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {WORK_ORDER_TYPE_LABELS[wo.type?.toLowerCase()] || WORK_ORDER_TYPE_LABELS[wo.type] || (wo.type ? wo.type.charAt(0).toUpperCase() + wo.type.slice(1) : '')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 animate-slide-up">
        {/* Banner prominente si la orden está en pausa / impedimento */}
        {isOnHold && (
          <div className="p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 space-y-2.5 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-800 dark:text-orange-300">
                    Orden en Pausa Operativa
                  </span>
                  {wo.paused_at && (
                    <span className="text-[10px] text-orange-600/80 dark:text-orange-400/80">
                      · {formatDateTime(wo.paused_at)}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-orange-950 dark:text-orange-100 mt-0.5">
                  Motivo: {HOLD_REASON_LABELS[wo.hold_reason] || wo.hold_reason || 'Impedimento técnico'}
                </p>
                {wo.hold_notes && (
                  <p className="text-xs text-orange-900/90 dark:text-orange-200/90 mt-1.5 bg-white/70 dark:bg-slate-900/50 p-2.5 rounded-xl border border-orange-200/60 dark:border-orange-800/40 italic">
                    "{wo.hold_notes}"
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Programación */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-slate-800">
            <Clock size={18} className="text-brand-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Programación</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide block mb-1">Fecha</span>
              <p className="text-slate-900 dark:text-white font-bold">{formatDate(wo.scheduled_date)}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide block mb-1">Hora</span>
              <p className="text-slate-900 dark:text-white font-bold">{wo.scheduled_time ? `${wo.scheduled_time.slice(0, 5)} hs` : 'A confirmar'}</p>
            </div>
          </div>
        </div>

        {/* Cliente y planta */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-slate-800">
            <Building2 size={18} className="text-brand-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Cliente</h3>
          </div>
          <p className="text-slate-900 dark:text-white font-bold text-lg mb-3">
            {wo.client?.name || 'N/D'}
          </p>
          {/* Información de la ubicación y contacto */}
          {loc.address && (
            <div className="space-y-3 text-sm bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 border border-gray-100 dark:border-slate-800 mb-3">
              <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300 font-medium">
                <MapPin size={16} className="mt-0.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                <span>
                  {loc.label}
                  {loc.address && ` — ${loc.address}`}
                  {loc.floor && `, Piso ${loc.floor}`}
                </span>
              </div>
              {wo.plant?.contact_phone && (
                <a
                  href={`tel:${wo.plant.contact_phone}`}
                  className="flex items-center gap-2 text-brand-600 dark:text-brand-400 font-semibold hover:text-brand-700 dark:hover:text-brand-300 active:text-brand-800"
                >
                  <Phone size={16} />
                  <span>{wo.plant.contact_name || 'Contacto'}: {wo.plant.contact_phone}</span>
                </a>
              )}
            </div>
          )}

          {/* Visor de mapa con destino y técnico en vivo (ambos visibles en viaje) */}
          <LocationViewerMap
            latitude={loc.latitude}
            longitude={loc.longitude}
            address={loc.address}
            title={loc.label}
            height={isTraveling ? "260px" : "180px"}
            currentLocation={isTraveling ? techLocation : null}
          />

          {/* Radar emisor de Live Tracking: SOLO ACTIVO MIENTRAS VIAJA (traveling) */}
          <LiveTrackingSender
            orderId={wo.id}
            isActive={isTraveling}
            technicianName="Técnico"
            destinationCoords={{ latitude: loc.latitude, longitude: loc.longitude }}
            clientName={wo.client?.name || wo.plant?.name || ''}
            onLocationUpdate={(coords) => setTechLocation(coords)}
          />

          {/* Banner informativo de estado de viaje / en sitio */}
          {isTraveling && (
            <div className="mt-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-3 text-xs text-indigo-900 dark:text-indigo-200 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Navigation size={16} className="text-indigo-600 dark:text-indigo-400 animate-pulse shrink-0" />
                <span>
                  <strong>Viaje en curso:</strong> Tu ubicación se transmite en tiempo real al panel central.
                </span>
              </div>
              {loc.address && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    loc.latitude && loc.longitude ? `${loc.latitude},${loc.longitude}` : loc.address
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-[11px] shrink-0 transition-colors shadow-sm"
                >
                  Abrir GPS
                </a>
              )}
            </div>
          )}

          {isInProgress && (
            <div className="mt-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-2.5 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
              <Check size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                <strong>En sitio (Planta):</strong> GPS apagado para ahorrar batería y datos.
              </span>
            </div>
          )}
        </div>

        {/* Equipo y Ficha Clínica */}
        {wo.equipment ? (
          <div className="card space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Wrench size={18} className="text-brand-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Ficha del Equipo
                </h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">
                {wo.equipment.refrigerant_type || 'Gas N/D'}
              </span>
            </div>

            {/* Datos Técnicos Duales (UI + UE) */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-1 border-b border-gray-100 dark:border-slate-800">
                <span className="text-gray-500 dark:text-gray-400 font-medium">Alcance de esta Orden:</span>
                <span className="font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 rounded border border-brand-200 dark:border-brand-800">
                  {TARGET_UNIT_LABELS[wo.target_unit] || 'Ambas Unidades (UI + UE)'}
                </span>
              </div>

              {/* Fichas Hermanadas UI + UE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Unidad Interior */}
                <div className="bg-sky-50/70 dark:bg-sky-950/20 p-2.5 rounded-xl border border-sky-200/80 dark:border-sky-800/50 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-sky-900 dark:text-sky-300">
                    <Wind size={13} className="text-sky-600 dark:text-sky-400" />
                    <span>Unidad Interior (UI - Evaporadora)</span>
                  </div>
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500">Modelo:</span>
                    <span className="font-semibold">{wo.equipment.indoor_model || wo.equipment.model || 'S/D'}</span>
                  </div>
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500">N° Serie:</span>
                    <span className="font-mono font-bold">{wo.equipment.indoor_serial || wo.equipment.serial_number || 'S/D'}</span>
                  </div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-400 pt-0.5 border-t border-sky-200/40 dark:border-sky-800/30 flex items-start gap-1">
                    <MapPin size={12} className="text-sky-500 shrink-0 mt-0.5" />
                    <span>{wo.equipment.indoor_location || wo.equipment.location_description || 'En sector asignado'}</span>
                  </div>
                </div>

                {/* Unidad Exterior */}
                <div className="bg-amber-50/70 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-200/80 dark:border-amber-800/50 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300">
                    <Box size={13} className="text-amber-600 dark:text-amber-400" />
                    <span>Unidad Exterior (UE - Condensadora)</span>
                  </div>
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500">Modelo:</span>
                    <span className="font-semibold">{wo.equipment.outdoor_model || 'S/D'}</span>
                  </div>
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500">N° Serie:</span>
                    <span className="font-mono font-bold">{wo.equipment.outdoor_serial || 'S/D'}</span>
                  </div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-400 pt-0.5 border-t border-amber-200/40 dark:border-amber-800/30 flex items-start gap-1">
                    <MapPin size={12} className="text-amber-500 shrink-0 mt-0.5" />
                    <span>{wo.equipment.outdoor_location || 'Terraza / Balcón / Exterior'}</span>
                  </div>
                </div>
              </div>

              {(wo.equipment.capacity_tr_fg || wo.equipment.capacity_btu || wo.equipment.refrigerant_type) && (
                <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 pt-1">
                  <span>Capacidad / Gas:</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {[wo.equipment.capacity_tr_fg, wo.equipment.capacity_btu ? `${wo.equipment.capacity_btu.toLocaleString()} BTU` : '', wo.equipment.refrigerant_type].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}
            </div>

            {/* Historial Clínico de las Últimas 3 Intervenciones */}
            <div className="pt-3 border-t border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Clock size={14} className="text-brand-500" />
                  <span>Últimos Mantenimientos Realizados</span>
                </span>
                <span className="text-[10px] text-gray-400 font-medium">
                  {equipmentHistory.length > 0 ? `${equipmentHistory.length} visitas previas` : 'Sin historial'}
                </span>
              </div>

              {isLoadingHistory ? (
                <div className="space-y-2 py-1">
                  <div className="h-16 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                  <div className="h-16 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                </div>
              ) : equipmentHistory.length === 0 ? (
                <div className="p-3 bg-gray-50 dark:bg-slate-850 rounded-xl text-center border border-gray-100 dark:border-slate-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Primer servicio técnico registrado para esta unidad en el sistema.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {equipmentHistory.map((prevWo) => {
                    const prevExtras = prevWo.extras || [];
                    const checklistNotes = (prevWo.checklist_items || []).filter(
                      (item) => item.notes && item.notes.trim().length > 0
                    );

                    return (
                      <div
                        key={prevWo.id}
                        className="p-3 rounded-xl bg-gray-50 dark:bg-slate-850 border border-gray-100 dark:border-slate-800 space-y-2 text-xs"
                      >
                        {/* Cabecera de la visita anterior */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {prevWo.order_number}
                            </span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-600 dark:text-gray-400 font-medium">
                              {formatDate(prevWo.scheduled_date || prevWo.completed_at)}
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-1.5 py-0.5 rounded border border-brand-200 dark:border-brand-800">
                            {WORK_ORDER_TYPE_LABELS[prevWo.type?.toLowerCase()] || WORK_ORDER_TYPE_LABELS[prevWo.type] || (prevWo.type ? prevWo.type.charAt(0).toUpperCase() + prevWo.type.slice(1) : '')}
                          </span>
                        </div>

                        {/* Técnico que intervino */}
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 text-[11px]">
                          <User size={13} className="text-gray-400 shrink-0" />
                          <span className="text-gray-500">Técnico anterior:</span>
                          <span className="font-semibold">{prevWo.assigned?.name || 'Técnico asignado'}</span>
                        </div>

                        {/* Repuestos / Insumos cambiados */}
                        {prevExtras.length > 0 ? (
                          <div className="bg-amber-50/70 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200">
                            <span className="font-bold block mb-0.5">Repuestos utilizados:</span>
                            <ul className="list-disc list-inside space-y-0.5 text-amber-800 dark:text-amber-300">
                              {prevExtras.map((ex, i) => (
                                <li key={i}>
                                  {ex.description} ({ex.quantity} {ex.unit || 'un'})
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic">
                            Sin repuestos adicionales cargados.
                          </p>
                        )}

                        {/* Parámetros de checklist relevantes */}
                        {checklistNotes.length > 0 && (
                          <div className="bg-blue-50/60 dark:bg-blue-950/30 p-2 rounded-lg border border-blue-200/50 dark:border-blue-900/40 text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
                            <span className="font-bold block">Mediciones técnicas registradas:</span>
                            <div className="space-y-0.5 text-blue-800 dark:text-blue-300">
                              {checklistNotes.slice(0, 3).map((item, i) => (
                                <div key={i} className="flex justify-between">
                                  <span>{item.item_name}:</span>
                                  <span className="font-semibold font-mono">{item.notes}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Observaciones */}
                        {prevWo.observations && (
                          <p className="text-[11px] text-gray-600 dark:text-gray-400 bg-white/70 dark:bg-slate-900/50 p-2 rounded-lg border border-gray-100 dark:border-slate-800 italic">
                            "{prevWo.observations}"
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card border-dashed border-2 border-gray-200 dark:border-slate-700 bg-gray-50/40 dark:bg-slate-900/30 text-center p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto">
              <QrCode size={20} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Unidad No Vinculada
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                Escaneá el código QR del equipo físico en la planta para vincularlo a esta orden y acceder a su historial técnico completo.
              </p>
            </div>
            <button
              onClick={() => navigate('/scanner')}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <QrCode size={14} />
              <span>Escanear QR del Equipo</span>
            </button>
          </div>
        )}

        {/* Observaciones */}
        {wo.observations && (
          <div className="card">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2 pb-2 border-b border-gray-100 dark:border-slate-800">Observaciones</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed font-medium">{wo.observations}</p>
          </div>
        )}

        {/* Bitácora de Tramos y Visitas Previas (work_order_visits) */}
        {wo.visits && wo.visits.length > 0 && (
          <div className="card space-y-3">
            <div
              onClick={() => setIsVisitsExpanded(!isVisitsExpanded)}
              className="flex items-center justify-between cursor-pointer pb-2 border-b border-gray-100 dark:border-slate-800 select-none"
            >
              <div className="flex items-center gap-2">
                <History size={16} className="text-brand-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Bitácora de Tramos y Visitas ({wo.visits.length})
                </h3>
              </div>
              <span className="text-xs text-brand-600 dark:text-brand-400 font-semibold">
                {isVisitsExpanded ? 'Ocultar' : 'Ver detalle'}
              </span>
            </div>

            {isVisitsExpanded && (
              <div className="space-y-2.5 pt-1">
                {wo.visits.map((v) => {
                  const isCurrentActive = v.outcome === 'in_progress';
                  return (
                    <div
                      key={v.id}
                      className={`p-3 rounded-xl text-xs space-y-1.5 border transition-all ${
                        isCurrentActive
                          ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                          : v.outcome === 'blocked'
                          ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
                          : 'bg-gray-50/80 dark:bg-slate-850 border-gray-200/70 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                          <User size={13} className="text-gray-400" />
                          <span>{v.technician?.name || 'Técnico'}</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isCurrentActive
                              ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300'
                              : v.outcome === 'blocked'
                              ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-300'
                              : v.outcome === 'completed'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-slate-700 dark:text-gray-200'
                          }`}
                        >
                          {VISIT_OUTCOME_LABELS[v.outcome] || v.outcome}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          <span>Inicio: {formatDateTime(v.started_at)}</span>
                        </span>
                        {v.ended_at && (
                          <span>Fin: {formatTime(v.ended_at)}</span>
                        )}
                      </div>

                      {v.reason_code && (
                        <div className="text-[11px] font-semibold text-orange-700 dark:text-orange-400">
                          Motivo: {HOLD_REASON_LABELS[v.reason_code] || v.reason_code}
                        </div>
                      )}

                      {v.summary_notes && (
                        <p className="text-[11px] text-gray-700 dark:text-gray-300 bg-white/60 dark:bg-slate-900/40 p-2 rounded-lg border border-gray-100 dark:border-slate-800 italic">
                          "{v.summary_notes}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Acciones fijas en el bottom */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-4 bg-gradient-to-t from-gray-50 via-gray-50 dark:from-slate-950 dark:via-slate-950 to-transparent z-20 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          {/* PASO 1: Iniciar Viaje (Pasa a traveling y enciende el GPS) */}
          {isPending && (
            <button
              onClick={handleStartTravel}
              disabled={isStarting}
              className="btn-primary w-full shadow-lg shadow-indigo-500/25 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white flex items-center justify-center gap-2"
            >
              {isStarting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  Iniciando viaje...
                </>
              ) : (
                <>
                  <Navigation size={20} />
                  Iniciar Viaje (En Camino)
                </>
              )}
            </button>
          )}

          {/* PASO 2: Llegada a Planta (Pasa a in_progress y apaga el GPS) */}
          {isTraveling && (
            <button
              onClick={handleArriveAtPlant}
              disabled={isStarting}
              className="btn-primary w-full shadow-lg shadow-brand-500/25 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white flex items-center justify-center gap-2"
            >
              {isStarting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  Registrando llegada...
                </>
              ) : (
                <>
                  <Building2 size={20} />
                  Llegada a Planta (En Sitio)
                </>
              )}
            </button>
          )}

          {/* PASO 3: En progreso (Flujo ordenado: Fotos Antes -> Checklist -> Fotos Después -> Firma) */}
          {isInProgress && (
            <div className="space-y-2.5">
              {!hasBeforePhoto ? (
                /* 1. Obligatorio tomar fotos de inicio o relevamiento */
                <button
                  onClick={() => navigate(`/orden/${id}/fotos-antes`)}
                  className="btn-primary w-full shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 py-3.5 text-sm font-bold"
                >
                  <Camera size={18} />
                  <span>
                    {isSurveyOrDiagnostic
                      ? '1. Tomar Fotos de Relevamiento (Obligatorio)'
                      : '1. Tomar Fotos del Antes (Obligatorio)'}
                  </span>
                  <ChevronRight size={18} />
                </button>
              ) : !isChecklistSubmitted ? (
                /* 2. Completar checklist una vez tomadas las fotos iniciales */
                <button
                  onClick={() => navigate(`/orden/${id}/checklist`)}
                  className="btn-success w-full shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 py-3.5 text-sm font-bold"
                >
                  <ClipboardCheck size={18} />
                  <span>2. Completar Checklist</span>
                  <ChevronRight size={18} />
                </button>
              ) : !hasAfterPhoto && !isSurveyOrDiagnostic ? (
                /* 3. Tomar fotos del después (Obligatorio para preventivos / instalaciones) */
                <button
                  onClick={() => navigate(`/orden/${id}/fotos-despues`)}
                  className="btn-primary w-full shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 py-3.5 text-sm font-bold"
                >
                  <Camera size={18} />
                  <span>3. Tomar Fotos del Después (Obligatorio)</span>
                  <ChevronRight size={18} />
                </button>
              ) : (
                /* 4. Pasar a firma del cliente (Habilitado directamente si es relevamiento o si ya cargó fotos después) */
                <div className="space-y-2">
                  <button
                    onClick={() => navigate(`/orden/${id}/firma`)}
                    className="btn-success w-full shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 py-3.5 text-sm font-bold"
                  >
                    <Check size={18} />
                    <span>
                      {isSurveyOrDiagnostic
                        ? '3. Firma del Cliente (Finalizar Relevamiento)'
                        : '4. Firma del Cliente (Finalizar)'}
                    </span>
                    <ChevronRight size={18} />
                  </button>

                  {/* En modo relevamiento sin fotos posteriores, dar acceso secundario opcional a agregarlas */}
                  {isSurveyOrDiagnostic && !hasAfterPhoto && (
                    <button
                      onClick={() => navigate(`/orden/${id}/fotos-despues`)}
                      className="w-full py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Camera size={14} />
                      <span>Agregar fotos del estado final (Opcional)</span>
                    </button>
                  )}
                </div>
              )}

              {/* Botón secundario para materiales y repuestos */}
              <button
                onClick={() => navigate(`/orden/${id}/extras`)}
                className="btn-secondary w-full py-2.5 text-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <Package size={16} />
                  <span>Relevar Materiales / Insumos</span>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>

              {/* Botones de gestión operativa de jornada: Avance Parcial y Pausar Orden */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsPartialModalOpen(true)}
                  className="py-2.5 px-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 flex items-center justify-center gap-1.5 transition-colors shadow-xs active:scale-95"
                >
                  <Clock size={14} className="shrink-0" />
                  <span>Avance Parcial</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsHoldModalOpen(true)}
                  className="py-2.5 px-3 rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50/80 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 text-xs font-semibold hover:bg-orange-100 dark:hover:bg-orange-900/50 flex items-center justify-center gap-1.5 transition-colors shadow-xs active:scale-95"
                >
                  <PauseCircle size={14} className="shrink-0" />
                  <span>Pausar Orden</span>
                </button>
              </div>
            </div>
          )}

          {/* PASO 4: Orden pausada / impedimento */}
          {isOnHold && (
            <div className="space-y-2">
              <button
                onClick={handleArriveAtPlant}
                disabled={isStarting}
                className="btn-primary w-full shadow-lg shadow-brand-500/25 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white flex items-center justify-center gap-2 py-3.5 text-sm font-bold"
              >
                {isStarting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                    <span>Reanudando...</span>
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    <span>Reanudar Trabajo en Sitio</span>
                  </>
                )}
              </button>
              <button
                onClick={handleStartTravel}
                disabled={isStarting}
                className="w-full py-2.5 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Navigation size={14} />
                <span>Iniciar Viaje a Planta (En Camino)</span>
              </button>
            </div>
          )}

          {/* PASO 5: Orden completada */}
          {isCompleted && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4 text-center shadow-sm">
              <p className="text-emerald-700 font-bold flex items-center justify-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Check size={14} />
                </span>
                Trabajo Finalizado
              </p>
              <p className="text-emerald-600/80 font-medium text-xs mt-1.5">
                Completado el {formatDate(wo.completed_at)}
              </p>
            </div>
          )}

          {/* Fallback si el estado es desconocido */}
          {!isPending && !isTraveling && !isInProgress && !isCompleted && !isOnHold && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-center shadow-sm">
              <p className="text-amber-700 font-bold mb-2">Estado detectado: "{wo.status || 'ninguno'}"</p>
              <button
                onClick={handleArriveAtPlant}
                disabled={isStarting}
                className="btn-primary w-full shadow-lg shadow-amber-500/20"
              >
                Forzar Inicio de Trabajo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Registrar Avance Parcial (Fin de Jornada en Obras Largas) */}
      {isPartialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-slate-800 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Clock size={18} />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Registrar Avance Parcial
                </h3>
              </div>
              <button
                onClick={() => setIsPartialModalOpen(false)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Aviso especial si es tipo Obra */}
            {(wo.type === 'obra' || wo.type === 'OBRA') && (
              <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-start gap-2.5 text-xs text-indigo-950 dark:text-indigo-200">
                <Camera size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Orden de Obra:</strong> Es fundamental registrar fotos del avance del día para armar la bitácora fotográfica cronológica con el cliente.
                </p>
              </div>
            )}

            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Utilizá esta opción al finalizar tu jornada o cuando debas retirarte de la obra sin cerrarla definitivamente. Tu avance quedará registrado en la bitácora para que vos u otro técnico continúen mañana.
            </p>

            <form onSubmit={handleRegisterPartialAdvance} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                  Detalle del Avance Realizado *
                </label>
                <textarea
                  value={partialNotes}
                  onChange={(e) => setPartialNotes(e.target.value)}
                  placeholder="Ej: Se instalaron 15 mts de cañería en piso 2, presurizado con nitrógeno en 250 PSI. Queda pendiente conexionado eléctrico..."
                  rows={3}
                  required
                  className="w-full rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-3 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Bloque de Registro Fotográfico de Avance */}
              <div className="space-y-2 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide flex items-center gap-1.5">
                    <Camera size={14} className="text-blue-500" />
                    Fotos del Avance ({partialPhotos.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (Capacitor.isNativePlatform()) {
                        handleNativeCamera(setPartialPhotos);
                      } else {
                        partialFileInputRef.current?.click();
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 flex items-center gap-1 transition-colors"
                  >
                    <Plus size={13} /> Tomar / Adjuntar
                  </button>
                  <input
                    ref={partialFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleAddPhotos(files, setPartialPhotos);
                      e.target.value = '';
                    }}
                  />
                </div>

                {partialPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 pt-1 max-h-48 overflow-y-auto pr-1">
                    {partialPhotos.map((photo) => (
                      <div key={photo.id} className="relative rounded-xl overflow-hidden aspect-square border border-gray-200 dark:border-slate-700 bg-black group shadow-xs">
                        <img src={photo.preview} alt="Avance" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setPartialPhotos((prev) => prev.filter((p) => p.id !== photo.id))}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md hover:bg-rose-700"
                        >
                          <Trash2 size={12} />
                        </button>
                        <input
                          type="text"
                          placeholder="Nota (opc.)"
                          value={photo.caption}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPartialPhotos((prev) => prev.map((p) => p.id === photo.id ? { ...p, caption: val } : p));
                          }}
                          className="absolute bottom-0 inset-x-0 bg-black/75 text-[10px] text-white px-1.5 py-1 focus:outline-hidden placeholder-gray-400"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                    Sin fotos adjuntas aún. Podés tomar fotos con la cámara o adjuntar desde la galería.
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsPartialModalOpen(false)}
                  disabled={isSubmittingPartial}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPartial || !partialNotes.trim()}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50 shadow-md shadow-blue-500/20"
                >
                  {isSubmittingPartial ? 'Guardando...' : 'Cerrar Jornada (Parcial)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reportar Impedimento / Pausar Orden */}
      {isHoldModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-slate-800 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                  <PauseCircle size={18} />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Reportar Impedimento / Pausa
                </h3>
              </div>
              <button
                onClick={() => setIsHoldModalOpen(false)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Aviso especial si es tipo Obra */}
            {(wo.type === 'obra' || wo.type === 'OBRA') && (
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
                <Camera size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Atención Obra:</strong> Se recomienda registrar fotos de la situación o motivo de la pausa para que administración y el cliente vean el estado actual.
                </p>
              </div>
            )}

            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Si no podés continuar por falta de repuestos, cliente ausente, fallo técnico u otro imprevisto, pausá la orden. Esto alertará de inmediato a Administración para gestionar una solución o relevo.
            </p>

            <form onSubmit={handlePauseWorkOrder} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                  Motivo Principal *
                </label>
                <select
                  value={selectedHoldReason}
                  onChange={(e) => setSelectedHoldReason(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-3 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand-500 font-medium"
                >
                  {Object.entries(HOLD_REASONS).map(([key, value]) => (
                    <option key={value} value={value}>
                      {HOLD_REASON_LABELS[value] || value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                  Explicación Técnica / Motivo Detallado *
                </label>
                <textarea
                  value={holdNotesInput}
                  onChange={(e) => setHoldNotesInput(e.target.value)}
                  placeholder="Detallá claramente qué ocurrió (ej: Se requiere contactor de 24V y relay térmico que no estaban en inventario...)"
                  rows={3}
                  required
                  className="w-full rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-3 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Bloque de Registro Fotográfico en Pausa */}
              <div className="space-y-2 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide flex items-center gap-1.5">
                    <Camera size={14} className="text-orange-500" />
                    Fotos del Impedimento / Avance ({holdPhotos.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (Capacitor.isNativePlatform()) {
                        handleNativeCamera(setHoldPhotos);
                      } else {
                        holdFileInputRef.current?.click();
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 flex items-center gap-1 transition-colors"
                  >
                    <Plus size={13} /> Tomar / Adjuntar
                  </button>
                  <input
                    ref={holdFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleAddPhotos(files, setHoldPhotos);
                      e.target.value = '';
                    }}
                  />
                </div>

                {holdPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 pt-1 max-h-48 overflow-y-auto pr-1">
                    {holdPhotos.map((photo) => (
                      <div key={photo.id} className="relative rounded-xl overflow-hidden aspect-square border border-gray-200 dark:border-slate-700 bg-black group shadow-xs">
                        <img src={photo.preview} alt="Impedimento" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setHoldPhotos((prev) => prev.filter((p) => p.id !== photo.id))}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md hover:bg-rose-700"
                        >
                          <Trash2 size={12} />
                        </button>
                        <input
                          type="text"
                          placeholder="Nota (opc.)"
                          value={photo.caption}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHoldPhotos((prev) => prev.map((p) => p.id === photo.id ? { ...p, caption: val } : p));
                          }}
                          className="absolute bottom-0 inset-x-0 bg-black/75 text-[10px] text-white px-1.5 py-1 focus:outline-hidden placeholder-gray-400"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                    Sin fotos adjuntas aún.
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsHoldModalOpen(false)}
                  disabled={isSubmittingHold}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHold || !holdNotesInput.trim()}
                  className="flex-1 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-colors disabled:opacity-50 shadow-md shadow-orange-500/20"
                >
                  {isSubmittingHold ? 'Pausando...' : 'Pausar Orden'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
