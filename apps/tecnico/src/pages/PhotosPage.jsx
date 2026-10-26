import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Camera, ArrowLeft, ChevronRight, X, Plus, RefreshCw, Check, Tag } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import imageCompression from 'browser-image-compression';
import { supabase } from '@4s-clima/shared/supabase';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { db } from '../services/offlineDb';
import toast from 'react-hot-toast';

const QUICK_TAGS = [
  'Unidad Interior',
  'Unidad Exterior',
  'Tablero Eléctrico',
  'Cañería',
  'Equipo 1',
  'Equipo 2',
  'Área de Trabajo',
  'Placa / Repuesto',
];

/**
 * Página de Evidencia Fotográfica con soporte Multi-Foto,
 * etiquetas por equipo/sector y flujo inteligente para Relevamiento/Diagnóstico.
 */
export default function PhotosPage({ step: propStep }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrder, fetchWorkOrder } = useWorkOrderStore();

  const step = propStep || (location.pathname.includes('fotos-antes') ? 'before' : 'after');
  const isBefore = step === 'before';

  // Colecciones de fotos dinámicas (1 a N fotos por tipo)
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [issuePhotos, setIssuePhotos] = useState([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState([]);

  // Modo Solo Relevamiento / Diagnóstico
  const [isSurveyOnly, setIsSurveyOnly] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (id && (!currentOrder || currentOrder.id !== id)) {
      fetchWorkOrder(id);
    }
  }, [id, currentOrder, fetchWorkOrder]);

  // Cargar fotos y configuración existentes de la orden
  useEffect(() => {
    if (!currentOrder) return;

    // Detectar si la orden ya es de relevamiento/diagnóstico
    const isSurvey = Boolean(
      currentOrder.is_survey_only ||
      currentOrder.type === 'survey' ||
      currentOrder.type === 'diagnostic' ||
      currentOrder.type === 'technical_visit' ||
      currentOrder.type === 'relevamiento' ||
      currentOrder.type === 'evaluacion'
    );
    setIsSurveyOnly(isSurvey);

    if (currentOrder.photos && currentOrder.photos.length > 0) {
      const bList = [];
      const aList = [];
      const iList = [];

      currentOrder.photos.forEach((p) => {
        const item = {
          id: p.id,
          preview: p.url || p.photo_url,
          caption: p.caption || p.notes || '',
          originalCaption: p.caption || p.notes || '',
          type: p.type,
          isExisting: true,
        };
        if (p.type === 'before') bList.push(item);
        else if (p.type === 'after') aList.push(item);
        else if (p.type === 'issue') iList.push(item);
      });

      setBeforePhotos(bList);
      setAfterPhotos(aList);
      setIssuePhotos(iList);
    }
  }, [currentOrder]);

  // Agregar una o más fotos capturadas
  const handleAddPhotos = (type, newItems) => {
    if (type === 'before') {
      setBeforePhotos((prev) => [...prev, ...newItems]);
    } else if (type === 'after') {
      setAfterPhotos((prev) => [...prev, ...newItems]);
    } else if (type === 'issue') {
      setIssuePhotos((prev) => [...prev, ...newItems]);
    }
  };

  // Actualizar etiqueta o nota de una foto
  const handleUpdateCaption = (type, photoId, newCaption) => {
    const updateList = (prev) =>
      prev.map((item) => (item.id === photoId ? { ...item, caption: newCaption } : item));

    if (type === 'before') setBeforePhotos(updateList);
    else if (type === 'after') setAfterPhotos(updateList);
    else if (type === 'issue') setIssuePhotos(updateList);
  };

  // Reemplazar archivo de una foto existente
  const handleReplacePhoto = (type, photoId, newFile, newPreview) => {
    const updateList = (prev) =>
      prev.map((item) =>
        item.id === photoId
          ? { ...item, file: newFile, preview: newPreview, isExisting: false }
          : item
      );

    if (type === 'before') setBeforePhotos(updateList);
    else if (type === 'after') setAfterPhotos(updateList);
    else if (type === 'issue') setIssuePhotos(updateList);
  };

  // Eliminar una foto de la grilla
  const handleRemovePhoto = (type, photoId) => {
    const removeAndClean = (prev) => {
      const target = prev.find((item) => item.id === photoId);
      if (target?.preview && target.preview.startsWith('blob:')) {
        URL.revokeObjectURL(target.preview);
      }
      if (target?.isExisting) {
        setDeletedPhotoIds((d) => [...d, target.id]);
      }
      return prev.filter((item) => item.id !== photoId);
    };

    if (type === 'before') setBeforePhotos(removeAndClean);
    else if (type === 'after') setAfterPhotos(removeAndClean);
    else if (type === 'issue') setIssuePhotos(removeAndClean);
  };

  // Validación:
  // - En 'before': Mínimo 1 foto obligatoria.
  // - En 'after': Si es solo relevamiento/diagnóstico, foto del después es OPCIONAL (canContinue = true).
  //               Si es mantenimiento o instalación, al menos 1 foto del después es obligatoria.
  const hasBefore = beforePhotos.length > 0;
  const hasAfter = afterPhotos.length > 0;
  const canContinue = isBefore ? hasBefore : isSurveyOnly || hasAfter;

  const handleSaveAndContinue = async () => {
    if (!canContinue) {
      toast.error(
        isBefore
          ? 'Es obligatorio cargar al menos 1 foto del estado inicial / relevamiento.'
          : 'Es obligatorio cargar al menos 1 foto del resultado final del trabajo.'
      );
      return;
    }

    setIsSaving(true);

    try {
      // 1. Manejar fotos eliminadas de la base de datos (si eran existentes)
      if (navigator.onLine && deletedPhotoIds.length > 0) {
        try {
          await supabase.from('photos').delete().in('id', deletedPhotoIds);
        } catch (delErr) {
          console.warn('Error al eliminar fotos desvinculadas:', delErr);
        }
      }

      // 2. Determinar fotos nuevas a subir en este paso
      const photosToUpload = isBefore
        ? beforePhotos.filter((p) => !p.isExisting && p.file)
        : [
            ...afterPhotos.filter((p) => !p.isExisting && p.file),
            ...issuePhotos.filter((p) => !p.isExisting && p.file),
          ];

      const recordsToInsert = [];

      for (let i = 0; i < photosToUpload.length; i++) {
        const item = photosToUpload[i];
        const fileName = `photos/${id}/${item.type}-${Date.now()}-${i}.jpg`;

        if (navigator.onLine) {
          const { error: uploadError } = await supabase.storage
            .from('work-orders')
            .upload(fileName, item.file, {
              contentType: item.file.type || 'image/jpeg',
              upsert: true,
            });

          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from('work-orders').getPublicUrl(fileName);

          recordsToInsert.push({
            work_order_id: id,
            type: item.type,
            url: publicUrl,
            photo_url: publicUrl,
            caption: item.caption?.trim() || null,
            notes: item.caption?.trim() || null,
          });
        } else {
          // Guardado local en IndexedDB para modo offline
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(item.file);
          });

          const tempId = `temp-photo-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`;

          await db.photos.add({
            id: tempId,
            work_order_id: id,
            type: item.type,
            url: base64,
            photo_url: base64,
            caption: item.caption?.trim() || null,
            notes: item.caption?.trim() || null,
            synced: false,
          });

          await db.pendingSync.add({
            table: 'photos',
            action: 'insert',
            recordId: tempId,
            data: {
              work_order_id: id,
              type: item.type,
              photo_blob: base64.split(',')[1],
              content_type: item.file.type || 'image/jpeg',
              caption: item.caption?.trim() || null,
              notes: item.caption?.trim() || null,
            },
            created_at: new Date().toISOString(),
          });
        }
      }

      // 3. Insertar registros en Supabase con tolerancia a columnas faltantes
      if (recordsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('photos').insert(recordsToInsert);

        if (insertError) {
          // Si falló por columna desconocida (ej. caption o notes aún no migradas), reintentar con esquema base
          if (
            insertError.code === '42703' ||
            insertError.message?.includes('column') ||
            insertError.message?.includes('caption')
          ) {
            console.warn('Reintentando inserción sin columna caption/notes...');
            const fallbackList = recordsToInsert.map((r) => ({
              work_order_id: r.work_order_id,
              type: r.type,
              url: r.url,
            }));
            const { error: retryError } = await supabase.from('photos').insert(fallbackList);
            if (retryError) throw retryError;
          } else {
            throw insertError;
          }
        }
      }

      // 4. Actualizar caption de fotos existentes que hayan cambiado de texto
      const existingToUpdate = (
        isBefore ? beforePhotos : [...afterPhotos, ...issuePhotos]
      ).filter((p) => p.isExisting && p.caption !== p.originalCaption);

      if (navigator.onLine && existingToUpdate.length > 0) {
        for (const p of existingToUpdate) {
          try {
            await supabase
              .from('photos')
              .update({
                caption: p.caption?.trim() || null,
                notes: p.caption?.trim() || null,
              })
              .eq('id', p.id);
          } catch (e) {
            console.warn('No se pudo actualizar caption de foto existente:', e);
          }
        }
      }

      // 5. Si estamos en el paso posterior y se activó "Solo relevamiento", actualizar la orden
      if (!isBefore) {
        if (navigator.onLine) {
          try {
            await supabase
              .from('work_orders')
              .update({ is_survey_only: isSurveyOnly })
              .eq('id', id);
          } catch (woErr) {
            console.warn('is_survey_only no disponible en work_orders:', woErr);
          }
        }
        try {
          await db.workOrders.update(id, { is_survey_only: isSurveyOnly });
        } catch (dbErr) {
          // ignore
        }
      }

      // 6. Actualizar Zustand Store local para reflejar fotos de inmediato
      const cur = useWorkOrderStore.getState().currentOrder;
      if (cur?.id === id) {
        const remainingExisting = (cur.photos || []).filter(
          (p) => !deletedPhotoIds.includes(p.id)
        );
        useWorkOrderStore.setState({
          currentOrder: {
            ...cur,
            is_survey_only: isSurveyOnly,
            photos: [...remainingExisting, ...recordsToInsert],
          },
        });
      }

      toast.success(
        isBefore
          ? 'Fotos del estado inicial guardadas'
          : isSurveyOnly && afterPhotos.length === 0
          ? 'Relevamiento registrado'
          : 'Fotos del trabajo guardadas'
      );

      // 7. Navegar al siguiente paso
      if (isBefore) {
        navigate(`/orden/${id}/checklist`);
      } else {
        navigate(`/orden/${id}/firma`);
      }
    } catch (err) {
      console.error('Error guardando evidencia fotográfica:', err);
      toast.error('Error al subir las fotos. Se continuará con copia local.');
      if (isBefore) {
        navigate(`/orden/${id}/checklist`);
      } else {
        navigate(`/orden/${id}/firma`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate(`/orden/${id}`, { replace: true });
    }
  };

  return (
    <div className="page-container pb-32">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center border border-gray-200 dark:border-slate-700 active:bg-gray-50 dark:active:bg-slate-800 transition-colors shadow-sm"
            aria-label="Volver"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {isBefore ? 'Fotos del Antes / Relevamiento' : 'Fotos del Después'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isBefore
                ? 'Paso 1: Registrá el estado inicial del lugar o de los equipos'
                : 'Paso 3: Registrá el resultado del servicio realizado'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 animate-slide-up">
        {isBefore ? (
          /* PASO 1 (ANTES): Múltiples fotos del estado inicial o relevamiento */
          <PhotoSection
            title="Fotos del Estado Inicial / Relevamiento"
            badgeText="Mínimo 1 foto requerida"
            badgeType="required"
            description="Fotografiá el lugar, ubicación general, equipos a intervenir, placas, estado de filtros y conexiones."
            type="before"
            photos={beforePhotos}
            onAddPhotos={handleAddPhotos}
            onUpdateCaption={handleUpdateCaption}
            onReplacePhoto={handleReplacePhoto}
            onRemovePhoto={handleRemovePhoto}
          />
        ) : (
          /* PASO 3 (DESPUÉS): Modo Relevamiento opcional + Múltiples fotos del después + fotos extra */
          <>
            {/* Toggle de Solo Relevamiento / Diagnóstico */}
            <div className="card p-4 border border-brand-200 dark:border-brand-900/40 bg-gradient-to-br from-brand-50/50 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-850 shadow-sm">
              <label className="flex items-start gap-3.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isSurveyOnly}
                  onChange={(e) => setIsSurveyOnly(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-slate-900 dark:text-white block">
                    Solo relevamiento / Diagnóstico (Sin intervención final)
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block leading-relaxed">
                    Activá esta opción si la visita fue únicamente de inspección o cotización previa y aún no se ejecutó la reparación o instalación en el equipo. Las fotos del después pasarán a ser opcionales.
                  </span>
                </div>
              </label>
            </div>

            {/* Sección Fotos del Después */}
            <PhotoSection
              title="Fotos del Después del Trabajo"
              badgeText={isSurveyOnly ? 'Opcional en relevamiento' : 'Mínimo 1 foto requerida'}
              badgeType={isSurveyOnly ? 'optional' : 'required'}
              description={
                isSurveyOnly
                  ? 'Opcional: Si no se intervino el equipo podés continuar sin foto final o cargar vistas del sector.'
                  : 'Mostrá el resultado final (equipos ensamblados, limpios, cañerías protegidas y en marcha).'
              }
              type="after"
              photos={afterPhotos}
              onAddPhotos={handleAddPhotos}
              onUpdateCaption={handleUpdateCaption}
              onReplacePhoto={handleReplacePhoto}
              onRemovePhoto={handleRemovePhoto}
            />

            {/* Sección Fotos Extra / Novedades / Incidencias */}
            <PhotoSection
              title="Fotos Extra / Novedades / Repuestos"
              badgeText="Opcional"
              badgeType="optional"
              description="Registrá repuestos cambiados, daños preexistentes, placas o detalles adicionales."
              type="issue"
              photos={issuePhotos}
              onAddPhotos={handleAddPhotos}
              onUpdateCaption={handleUpdateCaption}
              onReplacePhoto={handleReplacePhoto}
              onRemovePhoto={handleRemovePhoto}
            />
          </>
        )}
      </div>

      {/* Botón Inferior Fijo de Acción */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-gray-50 via-gray-50 dark:from-slate-950 dark:via-slate-950 to-transparent z-20 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          <button
            onClick={handleSaveAndContinue}
            disabled={isSaving || !canContinue}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
              canContinue
                ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-500/25 active:scale-[0.99]'
                : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-300 dark:border-slate-700'
            }`}
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Guardando fotos...</span>
              </>
            ) : (
              <>
                <span>
                  {isBefore
                    ? 'Guardar y Continuar al Checklist'
                    : isSurveyOnly && afterPhotos.length === 0
                    ? 'Continuar a Firma (Relevamiento)'
                    : 'Guardar y Continuar a Firma'}
                </span>
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Sección de fotos dinámica (Multi-Foto de 1 a N fotos)
 */
function PhotoSection({
  title,
  badgeText,
  badgeType = 'required',
  description,
  type,
  photos,
  onAddPhotos,
  onUpdateCaption,
  onReplacePhoto,
  onRemovePhoto,
}) {
  const fileInputRef = useRef(null);
  const [isOpeningCamera, setIsOpeningCamera] = useState(false);

  // Abrir cámara nativa o selector de archivos
  const handleOpenPicker = async () => {
    if (Capacitor.isNativePlatform()) {
      setIsOpeningCamera(true);
      try {
        const image = await CapCamera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          promptLabelHeader: 'Evidencia Fotográfica',
          promptLabelPhoto: 'Elegir de Galería',
          promptLabelPicture: 'Tomar Foto con Cámara',
          promptLabelCancel: 'Cancelar',
        });

        if (!image?.dataUrl) return;

        const res = await fetch(image.dataUrl);
        const blob = await res.blob();
        const file = new File(
          [blob],
          `${type}-${Date.now()}.${image.format || 'jpg'}`,
          { type: `image/${image.format || 'jpeg'}` }
        );

        const newItem = {
          id: `new-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          file,
          preview: image.dataUrl,
          caption: '',
          type,
          isExisting: false,
        };

        onAddPhotos(type, [newItem]);
      } catch (err) {
        if (
          err?.message?.includes('User cancelled') ||
          err?.message?.includes('cancelled')
        ) {
          return;
        }
        console.error('Error al capturar foto nativa:', err);
        toast.error('No se pudo abrir la cámara en el teléfono');
      } finally {
        setIsOpeningCamera(false);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  // Manejador en Web PWA con compresión de imágenes
  const handleWebChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems = [];
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
        newItems.push({
          id: `new-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          file: compressed,
          preview: previewUrl,
          caption: '',
          type,
          isExisting: false,
        });
      } catch (err) {
        console.error('Error comprimiendo foto web:', err);
        const previewUrl = URL.createObjectURL(file);
        newItems.push({
          id: `new-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          file,
          preview: previewUrl,
          caption: '',
          type,
          isExisting: false,
        });
      }
    }

    if (newItems.length > 0) {
      onAddPhotos(type, newItems);
    }
    // Limpiar input para permitir seleccionar la misma foto nuevamente si se desea
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="card p-4 space-y-3">
      {/* Cabecera de la sección */}
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>{title}</span>
            {photos.length > 0 && (
              <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded-full">
                {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
        <span
          className={`badge text-[10px] shrink-0 font-semibold px-2 py-0.5 rounded ${
            badgeType === 'required'
              ? photos.length > 0
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400'
          }`}
        >
          {photos.length > 0 && badgeType === 'required' ? (
            <span className="flex items-center gap-1">
              <Check size={11} /> Completo
            </span>
          ) : (
            badgeText
          )}
        </span>
      </div>

      {/* Grilla dinámica de fotos cargadas */}
      {photos.length > 0 && (
        <div className="space-y-4 pt-1">
          {photos.map((item, index) => (
            <PhotoItemCard
              key={item.id}
              item={item}
              index={index}
              type={type}
              onUpdateCaption={onUpdateCaption}
              onReplacePhoto={onReplacePhoto}
              onRemovePhoto={onRemovePhoto}
            />
          ))}
        </div>
      )}

      {/* Botón "+ Agregar foto" */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleOpenPicker}
          disabled={isOpeningCamera}
          className={`w-full py-3 px-4 rounded-xl border-2 border-dashed transition-all flex items-center justify-center gap-2 text-xs font-bold active:scale-[0.99] ${
            photos.length === 0
              ? 'border-brand-400 dark:border-brand-600/70 bg-brand-50/40 dark:bg-brand-950/20 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/30'
              : 'border-gray-300 dark:border-slate-700 hover:border-brand-400 bg-gray-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
          }`}
        >
          {isOpeningCamera ? (
            <>
              <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <span>Abriendo cámara...</span>
            </>
          ) : (
            <>
              <Plus size={16} className="text-brand-600 dark:text-brand-400" />
              <span>
                {photos.length === 0 ? 'Tomar primera foto' : 'Agregar otra foto a este bloque'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Input invisible para entorno Web PWA */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
        onChange={handleWebChange}
        className="hidden"
      />
    </div>
  );
}

/**
 * Tarjeta individual de una fotografía capturada con selector rápido de etiquetas y caption
 */
function PhotoItemCard({
  item,
  index,
  type,
  onUpdateCaption,
  onReplacePhoto,
  onRemovePhoto,
}) {
  const replaceInputRef = useRef(null);

  const handleRetake = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const image = await CapCamera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          promptLabelHeader: 'Reemplazar Foto',
          promptLabelPhoto: 'Elegir de Galería',
          promptLabelPicture: 'Tomar con Cámara',
          promptLabelCancel: 'Cancelar',
        });

        if (!image?.dataUrl) return;

        const res = await fetch(image.dataUrl);
        const blob = await res.blob();
        const file = new File(
          [blob],
          `${type}-${Date.now()}.${image.format || 'jpg'}`,
          { type: `image/${image.format || 'jpeg'}` }
        );

        onReplacePhoto(type, item.id, file, image.dataUrl);
      } catch (err) {
        if (!err?.message?.includes('cancelled')) {
          console.error(err);
        }
      }
    } else {
      replaceInputRef.current?.click();
    }
  };

  const handleReplaceWebChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const options = {
        maxSizeMB: 0.6,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
        fileType: 'image/jpeg',
      };
      const compressed = await imageCompression(file, options);
      const previewUrl = URL.createObjectURL(compressed);
      onReplacePhoto(type, item.id, compressed, previewUrl);
    } catch (err) {
      const previewUrl = URL.createObjectURL(file);
      onReplacePhoto(type, item.id, file, previewUrl);
    }
  };

  return (
    <div className="bg-gray-50/70 dark:bg-slate-900/60 rounded-xl p-3 border border-gray-200 dark:border-slate-800 space-y-2.5">
      {/* Vista previa y controles de imagen */}
      <div className="relative rounded-lg overflow-hidden aspect-video bg-black shadow-inner">
        <img
          src={item.preview}
          alt={`Foto ${index + 1}`}
          className="w-full h-full object-cover"
        />

        {/* Indicador de número de foto */}
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-bold text-white">
          Foto #{index + 1}
        </div>

        {/* Acciones flotantes */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRetake}
            className="px-2 py-1 bg-black/75 hover:bg-black/90 backdrop-blur-md rounded text-white text-[11px] font-semibold flex items-center gap-1 transition-transform active:scale-95 shadow"
            title="Cambiar imagen"
          >
            <RefreshCw size={11} />
            <span>Cambiar</span>
          </button>
          <button
            type="button"
            onClick={() => onRemovePhoto(type, item.id)}
            className="w-7 h-7 bg-black/75 hover:bg-red-600/90 backdrop-blur-md rounded flex items-center justify-center text-white active:scale-95 transition-colors shadow"
            title="Eliminar foto"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Selector rápido de etiquetas (Chips / Pills) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
          <Tag size={12} />
          <span>Etiqueta rápida (Equipo o Sector):</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_TAGS.map((tag) => {
            const isSelected = item.caption === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onUpdateCaption(type, item.id, isSelected ? '' : tag)}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors ${
                  isSelected
                    ? 'bg-brand-600 text-white font-semibold'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:border-brand-400'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input de texto para etiqueta o nota personalizada */}
      <div className="pt-0.5">
        <input
          type="text"
          value={item.caption || ''}
          onChange={(e) => onUpdateCaption(type, item.id, e.target.value)}
          placeholder="Nota o descripción (ej: Equipo 2 - Consultorio 4)"
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
          maxLength={80}
        />
      </div>

      {/* Input de reemplazo para entorno Web */}
      <input
        type="file"
        ref={replaceInputRef}
        accept="image/*"
        onChange={handleReplaceWebChange}
        className="hidden"
      />
    </div>
  );
}
