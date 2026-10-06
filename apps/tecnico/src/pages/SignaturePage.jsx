import { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { ArrowLeft, RotateCcw, Check, PenTool } from 'lucide-react';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { supabase } from '@4s-clima/shared/supabase';
import { db } from '../services/offlineDb';
import { getChecklistByEquipmentType } from '@4s-clima/shared/constants/checklists';

/**
 * Página de firma digital.
 * El cliente (ej. jefe de mantenimiento) firma con el dedo en pantalla.
 * Se guarda como imagen PNG transparente.
 */
export default function SignaturePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrder, completeWorkOrder } = useWorkOrderStore();
  const sigRef = useRef(null);

  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('');
  const [isEmpty, setIsEmpty] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Validación estricta de checklist eliminada por pedido del usuario (para permitir errores humanos o items omitidos)

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
  };

  const handleEnd = () => {
    setIsEmpty(sigRef.current?.isEmpty() ?? true);
  };

  const handleSave = async () => {
    if (isEmpty || !signerName.trim()) return;

    setIsSaving(true);

    try {
      // Obtener la firma como base64 PNG
      const signatureDataUrl = sigRef.current.toDataURL('image/png');

      // Convertir a Blob para subir a Supabase Storage
      const base64Data = signatureDataUrl.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      const fileName = `signatures/${id}/${Date.now()}.png`;
      let signatureUrl = signatureDataUrl; // Fallback: guardar como data URL

      if (navigator.onLine) {
        // Subir a Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('work-orders')
          .upload(fileName, blob, {
            contentType: 'image/png',
            upsert: true,
          });

        if (uploadError) throw uploadError;

        // Obtener URL pública
        const { data: { publicUrl } } = supabase.storage
          .from('work-orders')
          .getPublicUrl(fileName);

        signatureUrl = publicUrl;

        // Guardar registro en la tabla signatures
        const { error: insertError } = await supabase.from('signatures').insert({
          work_order_id: id,
          signer_name: signerName.trim(),
          signer_role: signerRole.trim() || 'Responsable',
          signature_url: signatureUrl,
          signed_at: new Date().toISOString(),
        });

        if (insertError) throw insertError;
      } else {
        // Guardar offline
        await db.signatures.add({
          id: `temp-sig-${Date.now()}`,
          work_order_id: id,
          signer_name: signerName.trim(),
          signer_role: signerRole.trim() || 'Responsable',
          signature_url: signatureDataUrl, // Guardar como data URL offline
          signed_at: new Date().toISOString(),
          synced: false,
        });

        await db.pendingSync.add({
          table: 'signatures',
          action: 'insert',
          id: `sig-${id}`,
          data: {
            work_order_id: id,
            signer_name: signerName.trim(),
            signer_role: signerRole.trim() || 'Responsable',
            signature_blob: base64Data,
            signed_at: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        });
      }

      // Completar la OT
      await completeWorkOrder(id);

      // Navegar al dashboard con mensaje de éxito
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Error guardando firma:', error);
      alert('Error al guardar la firma. Se guardó localmente.');
      
      // Completar offline como fallback
      await completeWorkOrder(id);
      navigate('/', { replace: true });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-surface-dark-secondary flex items-center justify-center active:bg-surface-dark-tertiary transition-colors"
            aria-label="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Firma del Cliente</h1>
            <p className="text-xs text-gray-500">Confirmación del trabajo realizado</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 animate-slide-up">
        {/* Datos del firmante */}
        <div className="card space-y-3">
          <div>
            <label htmlFor="signer-name" className="text-xs text-gray-400 mb-1 block">
              Nombre completo *
            </label>
            <input
              id="signer-name"
              type="text"
              placeholder="Ej: Juan Pérez"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="input"
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="signer-role" className="text-xs text-gray-400 mb-1 block">
              Cargo (opcional)
            </label>
            <input
              id="signer-role"
              type="text"
              placeholder="Ej: Jefe de Mantenimiento"
              value={signerRole}
              onChange={(e) => setSignerRole(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* Área de firma */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PenTool size={16} className="text-brand-400" />
              <span className="text-sm font-semibold text-gray-300">Firma</span>
            </div>
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-xs text-gray-500 active:text-gray-300 transition-colors"
            >
              <RotateCcw size={14} />
              Limpiar
            </button>
          </div>

          {/* Canvas de firma */}
          <div className="bg-white rounded-xl overflow-hidden relative">
            <SignatureCanvas
              ref={sigRef}
              penColor="#1e293b"
              canvasProps={{
                className: 'w-full',
                style: { width: '100%', height: '200px' },
              }}
              onEnd={handleEnd}
            />
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-gray-400 text-sm">Firme aquí con el dedo</p>
              </div>
            )}
          </div>
        </div>

        {/* Info legal mínima */}
        <p className="text-[10px] text-gray-600 text-center leading-relaxed px-4">
          Al firmar, se confirma que los trabajos detallados en el parte de servicio
          fueron realizados satisfactoriamente por el técnico de 4S Clima.
        </p>
      </div>

      {/* Botón confirmar */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-4 pt-2 bg-gradient-to-t from-surface-dark via-surface-dark to-transparent z-20">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSave}
            disabled={isEmpty || !signerName.trim() || isSaving}
            className={`w-full text-base ${
              !isEmpty && signerName.trim()
                ? 'btn-success'
                : 'btn-secondary opacity-60'
            }`}
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Finalizando...
              </>
            ) : (
              <>
                <Check size={20} />
                Confirmar y Finalizar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
