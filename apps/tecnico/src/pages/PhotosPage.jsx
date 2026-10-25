import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Camera, ArrowLeft, ChevronRight, X, Check, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import imageCompression from 'browser-image-compression';
import { supabase } from '@4s-clima/shared/supabase';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { db } from '../services/offlineDb';
import toast from 'react-hot-toast';

/**
 * Página unificada de Evidencia Fotográfica.
 * Modos:
 * - 'before': Fotos obligatorias de cómo estaba todo ANTES del formulario / checklist.
 * - 'after': Fotos obligatorias del DESPUÉS + Foto extra opcional.
 */
export default function PhotosPage({ step: propStep }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrder, fetchWorkOrder } = useWorkOrderStore();

  // Determinar si estamos en el paso 'before' o 'after'
  const step = propStep || (location.pathname.includes('fotos-antes') ? 'before' : 'after');
  const isBefore = step === 'before';

  const [photos, setPhotos] = useState({
    before: null,
    after: null,
    issue: null,
  });

  const [previews, setPreviews] = useState({
    before: null,
    after: null,
    issue: null,
  });

  const [existingPhotos, setExistingPhotos] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (id && (!currentOrder || currentOrder.id !== id)) {
      fetchWorkOrder(id);
    }
  }, [id, currentOrder, fetchWorkOrder]);

  // Cargar fotos existentes de la orden
  useEffect(() => {
    if (currentOrder?.photos && currentOrder.photos.length > 0) {
      const existing = {};
      currentOrder.photos.forEach((p) => {
        if (p.type && (p.url || p.photo_url)) {
          existing[p.type] = p.url || p.photo_url;
        }
      });
      setExistingPhotos(existing);
    }
  }, [currentOrder]);

  const handlePhotoCaptured = (type, file, previewUrl) => {
    setPhotos((prev) => ({ ...prev, [type]: file }));
    setPreviews((prev) => ({ ...prev, [type]: previewUrl }));
  };

  const removePhoto = (type) => {
    setPhotos((prev) => ({ ...prev, [type]: null }));
    if (previews[type] && previews[type].startsWith('blob:')) {
      URL.revokeObjectURL(previews[type]);
    }
    setPreviews((prev) => ({ ...prev, [type]: null }));
  };

  // Validación estricta: NO existe "Saltar sin fotos"
  const canContinue = isBefore
    ? Boolean(photos.before || existingPhotos.before)
    : Boolean(photos.after || existingPhotos.after);

  const handleSaveAndContinue = async () => {
    if (!canContinue) {
      toast.error(
        isBefore
          ? 'Es obligatorio tomar la foto del estado inicial (Antes del trabajo).'
          : 'Es obligatorio tomar la foto del resultado final (Después del trabajo).'
      );
      return;
    }

    setIsSaving(true);

    try {
      const recordsToInsert = [];

      // Procesar cada foto capturada en esta sesión
      for (const [type, file] of Object.entries(photos)) {
        if (!file) continue;

        const fileName = `photos/${id}/${type}-${Date.now()}.jpg`;

        if (navigator.onLine) {
          const { error: uploadError } = await supabase.storage
            .from('work-orders')
            .upload(fileName, file, {
              contentType: file.type || 'image/jpeg',
              upsert: true,
            });

          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from('work-orders').getPublicUrl(fileName);

          recordsToInsert.push({
            work_order_id: id,
            type: type,
            url: publicUrl,
          });
        } else {
          // Guardado Offline
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });

          await db.photos.add({
            id: `temp-photo-${Date.now()}-${Math.random()}`,
            work_order_id: id,
            type: type,
            url: base64,
            synced: false,
          });

          await db.pendingSync.add({
            table: 'photos',
            action: 'insert',
            recordId: `photo-${id}-${type}`,
            data: {
              work_order_id: id,
              type: type,
              photo_blob: base64.split(',')[1],
              content_type: file.type || 'image/jpeg',
            },
            created_at: new Date().toISOString(),
          });
        }
      }

      // Si hay fotos online, insertar en tabla
      if (recordsToInsert.length > 0) {
        const { error } = await supabase.from('photos').insert(recordsToInsert);
        if (error) throw error;

        // Actualizar Zustand store
        const cur = useWorkOrderStore.getState().currentOrder;
        if (cur?.id === id) {
          useWorkOrderStore.setState({
            currentOrder: {
              ...cur,
              photos: [...(cur.photos || []), ...recordsToInsert],
            },
          });
        }
      }

      toast.success(isBefore ? '¡Fotos del antes guardadas!' : '¡Fotos del trabajo guardadas!');

      // Transición directa al siguiente paso obligatorio
      if (isBefore) {
        navigate(`/orden/${id}/checklist`);
      } else {
        navigate(`/orden/${id}/firma`);
      }
    } catch (err) {
      console.error('Error guardando fotos:', err);
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
    <div className="page-container pb-28">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center border border-gray-200 dark:border-slate-700 active:bg-gray-50 dark:active:bg-slate-800 transition-colors shadow-sm"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              {isBefore ? 'Fotos del Antes' : 'Fotos del Después'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isBefore
                ? 'Paso 1: Registrá cómo estaba el equipo antes de comenzar'
                : 'Paso 3: Registrá el resultado final del trabajo'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 animate-slide-up">
        {isBefore ? (
          /* PASO PREVIO AL CHECKLIST: Solo Fotos del Antes (Obligatorias) */
          <PhotoCard
            title="Antes del trabajo (Obligatoria)"
            description="Mostrá el estado inicial del equipo (filtros, gabinete, conexiones, suciedad)."
            type="before"
            preview={previews.before || existingPhotos.before}
            isNew={Boolean(previews.before)}
            onPhotoCaptured={handlePhotoCaptured}
            onRemove={removePhoto}
          />
        ) : (
          /* PASO POSTERIOR AL CHECKLIST: Fotos del Después (Obligatoria) + Foto Extra (Opcional) */
          <>
            <PhotoCard
              title="Después del trabajo (Obligatoria)"
              description="Mostrá el resultado final (filtros limpios, equipo armado y funcionando)."
              type="after"
              preview={previews.after || existingPhotos.after}
              isNew={Boolean(previews.after)}
              onPhotoCaptured={handlePhotoCaptured}
              onRemove={removePhoto}
            />

            <PhotoCard
              title="Foto Extra / Novedad (Opcional)"
              description="Registrá repuestos cambiados, roturas o detalles adicionales encontrados."
              type="issue"
              preview={previews.issue || existingPhotos.issue}
              isNew={Boolean(previews.issue)}
              onPhotoCaptured={handlePhotoCaptured}
              onRemove={removePhoto}
              isOptional
            />
          </>
        )}
      </div>

      {/* Botón Guardar y Continuar (NO existe 'Saltar sin fotos') */}
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
                Guardando fotos...
              </>
            ) : (
              <>
                <span>
                  {isBefore ? 'Guardar y Continuar al Checklist' : 'Guardar y Continuar a Firma'}
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
 * Tarjeta de captura fotográfica adaptativa.
 * En Android APK: invoca nativamente @capacitor/camera (cámara o galería nativa de Android).
 * En Web PWA: dispara el file picker con compresión automática.
 */
function PhotoCard({
  title,
  description,
  type,
  preview,
  isNew = false,
  isOptional = false,
  onPhotoCaptured,
  onRemove,
}) {
  const fileInputRef = useRef(null);
  const [isOpeningCamera, setIsOpeningCamera] = useState(false);

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

        // Convertir base64 dataUrl a File estándar
        const res = await fetch(image.dataUrl);
        const blob = await res.blob();
        const file = new File(
          [blob],
          `${type}-${Date.now()}.${image.format || 'jpg'}`,
          { type: `image/${image.format || 'jpeg'}` }
        );

        onPhotoCaptured(type, file, image.dataUrl);
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
      // Disparador en Web PWA
      fileInputRef.current?.click();
    }
  };

  const handleWebChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.8,
      };
      const compressed = await imageCompression(file, options);
      const previewUrl = URL.createObjectURL(compressed);
      onPhotoCaptured(type, compressed, previewUrl);
    } catch (err) {
      console.error('Error comprimiendo foto web:', err);
      const previewUrl = URL.createObjectURL(file);
      onPhotoCaptured(type, file, previewUrl);
    }
  };

  return (
    <div className="card overflow-hidden transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            {title}
            {isOptional && (
              <span className="text-[10px] text-gray-400 font-normal bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                Opcional
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
        {preview && (
          <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[11px] flex items-center gap-1 font-semibold shrink-0">
            <Check size={12} /> {isNew ? 'Capturada' : 'Cargada'}
          </span>
        )}
      </div>

      {preview ? (
        <div className="relative rounded-xl overflow-hidden aspect-video bg-black mt-3 shadow-inner">
          <img
            src={preview}
            alt={`Foto ${title}`}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenPicker}
              className="px-2.5 py-1.5 bg-black/70 hover:bg-black/90 backdrop-blur-md rounded-lg text-white text-xs font-semibold flex items-center gap-1 transition-transform active:scale-95 shadow-md"
            >
              <RefreshCw size={13} />
              <span>Cambiar</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(type)}
              className="w-8 h-8 bg-black/70 hover:bg-black/90 backdrop-blur-md rounded-lg flex items-center justify-center text-white active:scale-95 transition-transform shadow-md"
              title="Eliminar foto"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpenPicker}
          disabled={isOpeningCamera}
          className="w-full mt-3 h-36 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 bg-gray-50/70 dark:bg-slate-850/50 hover:bg-brand-50/20 transition-all flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 group active:scale-[0.99]"
        >
          {isOpeningCamera ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                Abriendo cámara...
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center text-brand-500 group-hover:scale-110 transition-transform">
                <Camera size={24} />
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-brand-600">
                Tocar para abrir cámara o galería
              </span>
            </div>
          )}
        </button>
      )}

      {/* Input de archivo invisible solo para entorno Web */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleWebChange}
        className="hidden"
      />
    </div>
  );
}
