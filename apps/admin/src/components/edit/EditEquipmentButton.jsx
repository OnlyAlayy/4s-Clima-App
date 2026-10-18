import { useState, useEffect } from 'react';
import { X, Settings2, Pencil } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { EQUIPMENT_TYPES, EQUIPMENT_TYPE_LABELS } from '@4s-clima/shared/constants';

const COMMON_REFRIGERANTS = ['R410A', 'R22', 'R32', 'R134a', 'R404A', 'R407C'];

/**
 * Componente autocontenido para editar equipamiento de climatización.
 * Permite cambiar la planta asociada (plant_id), tipo, marca, modelo,
 * serie, capacidad BTU, refrigerante y ubicación física.
 */
export default function EditEquipmentButton({
  equipment,
  plants = [],
  onSuccess,
  variant = 'icon', // 'icon' | 'button'
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form states pre-cargados
  const [plantId, setPlantId] = useState('');
  const [type, setType] = useState(EQUIPMENT_TYPES.SPLIT);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [capacityBtu, setCapacityBtu] = useState('');
  const [refrigerantType, setRefrigerantType] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [notes, setNotes] = useState('');

  // Fallback si plants no viene por props: cargarlas desde Supabase
  const [localPlants, setLocalPlants] = useState(plants);

  useEffect(() => {
    if (plants && plants.length > 0) {
      setLocalPlants(plants);
    }
  }, [plants]);

  useEffect(() => {
    if (isOpen && equipment) {
      setPlantId(equipment.plant_id || (plants[0]?.id || ''));
      setType(equipment.type || EQUIPMENT_TYPES.SPLIT);
      setBrand(equipment.brand || '');
      setModel(equipment.model || '');
      setSerialNumber(equipment.serial_number || '');
      setCapacityBtu(
        equipment.capacity_btu !== null && equipment.capacity_btu !== undefined
          ? String(equipment.capacity_btu)
          : ''
      );
      setRefrigerantType(equipment.refrigerant_type || '');
      setLocationDescription(equipment.location_description || '');
      setNotes(equipment.notes || '');
      setError(null);

      // Si no nos pasaron lista de plantas, intentar recuperarlas
      if ((!plants || plants.length === 0) && equipment.plant_id) {
        supabase
          .from('plants')
          .select('client_id')
          .eq('id', equipment.plant_id)
          .single()
          .then(({ data }) => {
            if (data?.client_id) {
              supabase
                .from('plants')
                .select('id, name')
                .eq('client_id', data.client_id)
                .order('name')
                .then(({ data: fetchedPlants }) => {
                  if (fetchedPlants) setLocalPlants(fetchedPlants);
                });
            }
          });
      }
    }
  }, [isOpen, equipment, plants]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!plantId || !brand.trim()) {
      setError('La planta y la marca son obligatorias.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('equipment')
      .update({
        plant_id: plantId,
        type,
        brand: brand.trim(),
        model: model.trim() || null,
        serial_number: serialNumber.trim() || null,
        capacity_btu: capacityBtu ? parseInt(capacityBtu, 10) : null,
        refrigerant_type: refrigerantType.trim() || null,
        location_description: locationDescription.trim() || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', equipment.id);

    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setIsOpen(false);
      onSuccess?.();
    }
  };

  return (
    <>
      {/* Botón Disparador (Trigger) */}
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className={`p-1.5 text-gray-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors ${className}`}
          title="Editar Equipo"
          aria-label="Editar Equipo"
        >
          <Pencil size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className={`btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5 ${className}`}
        >
          <Pencil size={13} />
          <span>Editar Equipo</span>
        </button>
      )}

      {/* Modal Encapsulado */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => !isSubmitting && setIsOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated w-full max-w-xl overflow-hidden flex flex-col animate-slide-up border border-transparent dark:border-slate-700 max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                <Settings2 size={20} className="text-brand-500" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Editar Equipo</h2>
                <p className="text-gray-500 dark:text-gray-400 text-xs">
                  Modificar especificaciones o reasignar a otra sucursal
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-6 overflow-y-auto">
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <form id={`edit-equip-form-${equipment?.id}`} onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Planta / Sucursal *
                    </label>
                    <select
                      className="select"
                      value={plantId}
                      onChange={(e) => setPlantId(e.target.value)}
                      required
                    >
                      {localPlants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tipo de Equipo *
                    </label>
                    <select
                      className="select"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      {Object.values(EQUIPMENT_TYPES).map((t) => (
                        <option key={t} value={t}>
                          {EQUIPMENT_TYPE_LABELS[t] || t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Marca *
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: Carrier, Daikin"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Modelo
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: 40MCC"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Número de Serie
                    </label>
                    <input
                      type="text"
                      className="input font-mono text-sm"
                      placeholder="Ej: SN-928374"
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Capacidad (BTU)
                    </label>
                    <input
                      type="number"
                      className="input"
                      placeholder="Ej: 18000"
                      value={capacityBtu}
                      onChange={(e) => setCapacityBtu(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tipo de Refrigerante
                    </label>
                    <input
                      type="text"
                      list="refrigerants-list"
                      className="input font-mono text-sm"
                      placeholder="Ej: R410A, R22"
                      value={refrigerantType}
                      onChange={(e) => setRefrigerantType(e.target.value)}
                    />
                    <datalist id="refrigerants-list">
                      {COMMON_REFRIGERANTS.map((gas) => (
                        <option key={gas} value={gas} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Ubicación Física
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: Azotea Torre B, Sala de Servidores"
                      value={locationDescription}
                      onChange={(e) => setLocationDescription(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Observaciones / Notas
                  </label>
                  <textarea
                    className="input min-h-[60px]"
                    placeholder="Ej: Evaporadora con detalles estéticos..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn-secondary"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                form={`edit-equip-form-${equipment?.id}`}
                type="submit"
                className="btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
