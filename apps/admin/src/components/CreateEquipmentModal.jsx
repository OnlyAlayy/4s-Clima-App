import { useState, useEffect } from 'react';
import { X, Settings2 } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { EQUIPMENT_TYPES, EQUIPMENT_TYPE_LABELS } from '@4s-clima/shared/constants';

export default function CreateEquipmentModal({ isOpen, onClose, onCreated, clientId, plants }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [plantId, setPlantId] = useState('');
  const [type, setType] = useState(EQUIPMENT_TYPES.SPLIT);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [capacityBtu, setCapacityBtu] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      resetForm();
      if (plants && plants.length > 0) {
        setPlantId(plants[0].id);
      }
    }
  }, [isOpen, plants]);

  const resetForm = () => {
    setPlantId('');
    setType(EQUIPMENT_TYPES.SPLIT);
    setBrand('');
    setModel('');
    setSerialNumber('');
    setCapacityBtu('');
    setLocationDescription('');
    setNotes('');
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!plantId || !brand) return;

    setIsSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from('equipment').insert({
      plant_id: plantId,
      type,
      brand,
      model: model || null,
      serial_number: serialNumber || null,
      capacity_btu: capacityBtu ? parseInt(capacityBtu, 10) : null,
      location_description: locationDescription || null,
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
      <div className="bg-white rounded-2xl shadow-elevated w-full max-w-xl overflow-hidden flex flex-col animate-slide-up">
        
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <Settings2 size={20} className="text-brand-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">Nuevo Equipo</h2>
            <p className="text-gray-500 text-xs">Añadir aire acondicionado al inventario</p>
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

          <form id="create-equip-form" onSubmit={handleSubmit} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Planta / Sucursal *</label>
                <select className="select" value={plantId} onChange={(e) => setPlantId(e.target.value)} required>
                  {plants.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Equipo *</label>
                <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                  {Object.values(EQUIPMENT_TYPES).map(t => (
                    <option key={t} value={t}>{EQUIPMENT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marca *</label>
                <input type="text" className="input" placeholder="Ej: Carrier, Daikin" value={brand} onChange={(e) => setBrand(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                <input type="text" className="input" placeholder="Ej: 40MCC" value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de Serie</label>
                <input type="text" className="input font-mono text-sm" placeholder="Ej: SN-928374" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacidad (BTU)</label>
                <input type="number" className="input" placeholder="Ej: 18000" value={capacityBtu} onChange={(e) => setCapacityBtu(e.target.value)} />
              </div>
            </div>

            <hr className="border-gray-100 my-2" />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación Física</label>
              <input type="text" className="input" placeholder="Ej: Azotea Torre B, Sala de Servidores" value={locationDescription} onChange={(e) => setLocationDescription(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
              <textarea className="input min-h-[60px]" placeholder="Ej: Evaporadora con detalles estéticos..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>Cancelar</button>
          <button form="create-equip-form" type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Crear Equipo'}
          </button>
        </div>
      </div>
    </div>
  );
}
