import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, Image as ImageIcon, ChevronRight, X, Upload } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { supabase } from '@4s-clima/shared/supabase';
import { db } from '../services/offlineDb';

/**
 * Página para tomar y subir evidencia fotográfica.
 */
export default function PhotosPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Guardamos un objeto File para cada tipo de foto (before, after, issue)
  const [photos, setPhotos] = useState({
    before: null,
    after: null,
    issue: null,
  });
  
  // URLs locales para previsualización
  const [previews, setPreviews] = useState({
    before: null,
    after: null,
    issue: null,
  });

  const [isSaving, setIsSaving] = useState(false);

  // Manejar captura de imagen
  const handlePhotoCapture = async (type, e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Compress image to ensure it stays well under the 5MB Supabase limit
    const compressedFile = await compressImage(file, 1200);

    // Guardar archivo
    setPhotos(prev => ({ ...prev, [type]: compressedFile }));
    
    // Crear preview local
    const previewUrl = URL.createObjectURL(compressedFile);
    setPreviews(prev => ({ ...prev, [type]: previewUrl }));
  };

  // Helper de compresión usando browser-image-compression
  const compressImage = async (file) => {
    const options = {
      maxSizeMB: 0.5, // Max 500KB per photo
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      fileType: 'image/jpeg',
      initialQuality: 0.8,
    };
    try {
      const compressedFile = await imageCompression(file, options);
      return compressedFile;
    } catch (error) {
      console.error('Error comprimiendo imagen:', error);
      return file; // Si falla, devolvemos el original
    }
  };

  const removePhoto = (type) => {
    setPhotos(prev => ({ ...prev, [type]: null }));
    if (previews[type]) {
      URL.revokeObjectURL(previews[type]); // Limpiar memoria
    }
    setPreviews(prev => ({ ...prev, [type]: null }));
  };

  const handleSaveAndContinue = async () => {
    setIsSaving(true);
    
    try {
      const uploadPromises = [];
      const recordsToInsert = [];

      // Procesar cada foto
      for (const [type, file] of Object.entries(photos)) {
        if (!file) continue;

        const fileName = `photos/${id}/${type}-${Date.now()}.jpg`;
        
        if (navigator.onLine) {
          // Subir a storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('work-orders')
            .upload(fileName, file, {
              contentType: file.type,
              upsert: true
            });

          if (uploadError) throw uploadError;

          // Obtener URL pública
          const { data: { publicUrl } } = supabase.storage
            .from('work-orders')
            .getPublicUrl(fileName);

          recordsToInsert.push({
            work_order_id: id,
            type: type,
            url: publicUrl,
          });
        } else {
          // Guardado Offline: Convertir a base64
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });
          
          await db.photos.add({
            id: `temp-photo-${Date.now()}-${Math.random()}`,
            work_order_id: id,
            type: type,
            url: base64, // URL local temporal
            synced: false
          });

          // Solo guardamos en pendingSync si logramos base64
          await db.pendingSync.add({
            table: 'photos',
            action: 'insert',
            id: `photo-${id}-${type}`,
            data: {
              work_order_id: id,
              type: type,
              photo_blob: base64.split(',')[1], // enviar solo base64 sin el data:image/...
              content_type: file.type
            },
            created_at: new Date().toISOString()
          });
        }
      }

      // Si hay fotos online, las insertamos en la tabla
      if (recordsToInsert.length > 0) {
        const { error } = await supabase.from('photos').insert(recordsToInsert);
        if (error) throw error;
      }

      // Ir a la firma digital
      navigate(`/orden/${id}/firma`);
    } catch (err) {
      console.error('Error guardando fotos:', err);
      alert('Hubo un error al guardar las fotos. Se guardaron localmente.');
      navigate(`/orden/${id}/firma`);
    } finally {
      setIsSaving(false);
    }
  };

  // Validamos si tiene al menos una foto (antes o después) para dejarlo avanzar,
  // o si simplemente quiere saltearlo (lo dejamos si no cargó nada, 
  // pero idealmente sugerimos que cargue).
  const hasAnyPhoto = photos.before || photos.after || photos.issue;

  return (
    <div className="page-container pb-24">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center border border-gray-200 dark:border-slate-700 active:bg-gray-50 dark:active:bg-slate-800 transition-colors shadow-sm"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Evidencia</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Documentá el trabajo realizado</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 animate-slide-up">
        
        {/* Antes */}
        <PhotoUploader 
          title="Antes del trabajo" 
          description="Mostrá el estado inicial del equipo (ej: filtros sucios)"
          type="before"
          preview={previews.before}
          onCapture={handlePhotoCapture}
          onRemove={removePhoto}
        />

        {/* Después */}
        <PhotoUploader 
          title="Después del trabajo" 
          description="Mostrá el resultado final (ej: filtros limpios, equipo armado)"
          type="after"
          preview={previews.after}
          onCapture={handlePhotoCapture}
          onRemove={removePhoto}
        />

        {/* Problema */}
        <PhotoUploader 
          title="Problema (Opcional)" 
          description="Registrá repuestos rotos, fugas o daños encontrados"
          type="issue"
          preview={previews.issue}
          onCapture={handlePhotoCapture}
          onRemove={removePhoto}
        />

      </div>

      {/* Botón confirmar */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-4 pt-2 bg-gradient-to-t from-gray-50 via-gray-50 dark:from-slate-950 dark:via-slate-950 to-transparent z-20 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          <button
            onClick={handleSaveAndContinue}
            disabled={isSaving}
            className={`w-full text-base ${hasAnyPhoto ? 'btn-primary' : 'btn-secondary'}`}
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                {hasAnyPhoto ? 'Guardar y Continuar' : 'Saltar sin fotos'}
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoUploader({ title, description, type, preview, onCapture, onRemove }) {
  return (
    <div className="card overflow-hidden">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-600">{title}</h3>
        <p className="text-xs text-gray-500">{description}</p>
      </div>

      {preview ? (
        <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
          <img 
            src={preview} 
            alt={`Foto ${title}`} 
            className="w-full h-full object-cover"
          />
          <button 
            onClick={() => onRemove(type)}
            className="absolute top-2 right-2 w-8 h-8 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 active:scale-95 transition-transform"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="relative h-32 rounded-xl border-2 border-dashed border-gray-700 hover:border-brand-500/50 bg-white transition-colors group">
          {/* El input file invisible superpuesto */}
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            onChange={(e) => onCapture(type, e)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-gray-500 group-hover:text-brand-400 transition-colors">
            <Camera size={28} className="mb-2" />
            <span className="text-sm font-medium">Tocar para abrir cámara</span>
          </div>
        </div>
      )}
    </div>
  );
}
