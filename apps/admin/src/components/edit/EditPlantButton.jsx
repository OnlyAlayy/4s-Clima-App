import { useState, useEffect } from 'react';
import { X, MapPin, Pencil } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import LocationPickerMap from '../geo/LocationPickerMap';

/**
 * Componente autocontenido para editar sucursales/plantas.
 * Integra LocationPickerMap para actualizar o cargar coordenadas GPS por primera vez.
 */
export default function EditPlantButton({
  plant,
  onSuccess,
  variant = 'icon', // 'icon' | 'button'
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state pre-cargado
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [floor, setFloor] = useState('');
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen && plant) {
      setName(plant.name || '');
      setAddress(plant.address || '');
      setFloor(plant.floor || '');
      setCoords({
        lat: plant.latitude !== null && plant.latitude !== undefined ? Number(plant.latitude) : null,
        lng: plant.longitude !== null && plant.longitude !== undefined ? Number(plant.longitude) : null,
      });
      setContactName(plant.contact_name || '');
      setContactPhone(plant.contact_phone || '');
      setNotes(plant.notes || '');
      setError(null);
    }
  }, [isOpen, plant]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre de la planta es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('plants')
      .update({
        name: name.trim(),
        address: address.trim() || null,
        floor: floor.trim() || null,
        latitude: coords.lat,
        longitude: coords.lng,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plant.id);

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
          className={`p-1 text-gray-400 hover:text-brand-600 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors ${className}`}
          title="Editar Planta / Coordenadas"
          aria-label="Editar Planta"
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
          <span>Editar Planta</span>
        </button>
      )}

      {/* Modal Encapsulado */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => !isSubmitting && setIsOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated w-full max-w-lg overflow-hidden flex flex-col animate-slide-up border border-transparent dark:border-slate-700 max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                <MapPin size={20} className="text-brand-500" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Editar Planta</h2>
                <p className="text-gray-500 dark:text-gray-400 text-xs">
                  Modificar datos de la sucursal y geolocalización GPS
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

              <form id={`edit-plant-form-${plant?.id}`} onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nombre de la Planta *
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej: Sede Saavedra"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Dirección
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: Av. Balbín 456"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Piso / Dpto
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: 2B"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                    />
                  </div>
                </div>

                {/* Mapa Interactivo con pantalla completa y búsqueda */}
                <LocationPickerMap
                  latitude={coords.lat}
                  longitude={coords.lng}
                  addressText={address}
                  onChange={({ lat, lng }) => setCoords({ lat, lng })}
                  label="Ubicación GPS de la Planta"
                />

                <hr className="border-gray-100 dark:border-slate-700 my-2" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Contacto Local
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: Portero Miguel"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: 11-2233-4455"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notas de Acceso
                  </label>
                  <textarea
                    className="input min-h-[60px]"
                    placeholder="Ej: Pedir llave en seguridad..."
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
                form={`edit-plant-form-${plant?.id}`}
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
