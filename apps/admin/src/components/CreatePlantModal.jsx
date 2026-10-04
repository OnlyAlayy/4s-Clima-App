import { useState, useEffect } from 'react';
import { X, MapPin } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';

export default function CreatePlantModal({ isOpen, onClose, onCreated, clientId }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [floor, setFloor] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setName('');
    setAddress('');
    setFloor('');
    setContactName('');
    setContactPhone('');
    setNotes('');
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !clientId) return;

    setIsSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from('plants').insert({
      client_id: clientId,
      name,
      address: address || null,
      floor: floor || null,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      notes: notes || null
    });

    setIsSubmitting(false);

    if (insertError) {
      setError(insertError.message);
    } else {
      onCreated();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-elevated w-full max-w-lg overflow-hidden flex flex-col animate-slide-up">
        
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <MapPin size={20} className="text-brand-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">Nueva Planta</h2>
            <p className="text-gray-500 text-xs">Agregar sucursal o locación</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form id="create-plant-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Planta *</label>
              <input type="text" className="input" placeholder="Ej: Sede Saavedra" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                <input type="text" className="input" placeholder="Ej: Av. Balbín 456" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Piso / Dpto</label>
                <input type="text" className="input" placeholder="Ej: 2B" value={floor} onChange={(e) => setFloor(e.target.value)} />
              </div>
            </div>

            <hr className="border-gray-100 my-2" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contacto Local</label>
                <input type="text" className="input" placeholder="Ej: Portero Miguel" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input type="text" className="input" placeholder="Ej: 11-2233-4455" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas de Acceso</label>
              <textarea className="input min-h-[60px]" placeholder="Ej: Pedir llave en seguridad..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>Cancelar</button>
          <button form="create-plant-form" type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Crear Planta'}
          </button>
        </div>
      </div>
    </div>
  );
}
