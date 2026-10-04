import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { WORK_ORDER_TYPES, WORK_ORDER_TYPE_LABELS } from '@4s-clima/shared/constants';

export default function CreateWorkOrderModal({ isOpen, onClose, onCreated }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Opciones para los select
  const [clients, setClients] = useState([]);
  const [plants, setPlants] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  // Form state
  const [clientId, setClientId] = useState('');
  const [plantId, setPlantId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [type, setType] = useState(WORK_ORDER_TYPES.PREVENTIVE);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [observations, setObservations] = useState('');

  // Cargar datos iniciales (clientes y técnicos)
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
      resetForm();
    }
  }, [isOpen]);

  // Cargar plantas cuando cambia el cliente
  useEffect(() => {
    if (clientId) {
      loadPlants(clientId);
      setPlantId('');
      setEquipmentId('');
    } else {
      setPlants([]);
    }
  }, [clientId]);

  // Cargar equipos cuando cambia la planta
  useEffect(() => {
    if (plantId) {
      loadEquipment(plantId);
      setEquipmentId('');
    } else {
      setEquipment([]);
    }
  }, [plantId]);

  const loadInitialData = async () => {
    const [clientsRes, techRes] = await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('users').select('id, name').eq('role', 'tecnico').order('name')
    ]);
    if (clientsRes.data) setClients(clientsRes.data);
    if (techRes.data) setTechnicians(techRes.data);
  };

  const loadPlants = async (cId) => {
    const { data } = await supabase.from('plants').select('id, name').eq('client_id', cId).order('name');
    if (data) setPlants(data);
  };

  const loadEquipment = async (pId) => {
    const { data } = await supabase.from('equipment').select('id, type, brand, model, location_description').eq('plant_id', pId);
    if (data) setEquipment(data);
  };

  const resetForm = () => {
    setClientId('');
    setPlantId('');
    setEquipmentId('');
    setTechnicianId('');
    setType(WORK_ORDER_TYPES.PREVENTIVE);
    setDate(new Date().toISOString().split('T')[0]); // Hoy
    setTime('');
    setObservations('');
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clientId || !plantId || !technicianId || !date) {
      setError('Por favor completá los campos obligatorios.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Generar un número de orden aleatorio para MVP (ej: OT-20231024-XXXX)
    const randomHex = Math.random().toString(16).slice(2, 6).toUpperCase();
    const orderNumber = `OT-${date.replace(/-/g, '')}-${randomHex}`;

    const { error: insertError } = await supabase.from('work_orders').insert({
      order_number: orderNumber,
      client_id: clientId,
      plant_id: plantId,
      equipment_id: equipmentId || null,
      assigned_to: technicianId,
      type,
      scheduled_date: date,
      scheduled_time: time || null,
      observations,
      status: 'pending'
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
      <div className="bg-white rounded-2xl shadow-elevated w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Nueva Orden de Trabajo</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form id="create-ot-form" onSubmit={handleSubmit} className="space-y-5">
            {/* Cliente y Planta */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                  <option value="">Seleccionar cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Planta / Sucursal *</label>
                <select className="select" value={plantId} onChange={(e) => setPlantId(e.target.value)} disabled={!clientId} required>
                  <option value="">Seleccionar planta...</option>
                  {plants.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Equipo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Equipo a mantener (Opcional)</label>
              <select className="select" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} disabled={!plantId}>
                <option value="">Aplica a toda la planta / Múltiples equipos</option>
                {equipment.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.type.toUpperCase()} {e.brand} {e.model} - {e.location_description}
                  </option>
                ))}
              </select>
            </div>

            <hr className="border-gray-100" />

            {/* Técnico, Fecha y Hora */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Técnico Asignado *</label>
                <select className="select" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} required>
                  <option value="">Seleccionar técnico...</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Prog. *</label>
                <input 
                  type="date" 
                  className="input" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)}
                  required 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hora Prog. (Opcional)</label>
                <input 
                  type="time" 
                  className="input" 
                  value={time} 
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            {/* Tipo y Observaciones */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Tarea *</label>
                <select className="select" value={type} onChange={(e) => setType(e.target.value)} required>
                  {Object.entries(WORK_ORDER_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones para el técnico</label>
              <textarea 
                className="input min-h-[100px] resize-y" 
                placeholder="Ej: Pedir llave del subsuelo en recepción..."
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <button 
            type="button" 
            onClick={onClose} 
            className="btn-secondary"
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button 
            form="create-ot-form" 
            type="submit" 
            className="btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creando...' : 'Crear Orden'}
          </button>
        </div>
      </div>
    </div>
  );
}
