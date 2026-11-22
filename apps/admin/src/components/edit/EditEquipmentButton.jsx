import { useState, useEffect } from 'react';
import { X, Settings2, Pencil, Wind, Box, QrCode } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { EQUIPMENT_TYPES, EQUIPMENT_TYPE_LABELS } from '@4s-clima/shared/constants';

const COMMON_REFRIGERANTS = ['R410A', 'R22', 'R32', 'R134a', 'R404A', 'R407C'];

/**
 * Componente autocontenido para editar equipamiento de climatización dual.
 * Permite gestionar la Unidad Interior (UI) y la Unidad Exterior (UE)
 * vinculadas bajo un único código QR.
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
  const [capacityBtu, setCapacityBtu] = useState('');
  const [capacityTrFg, setCapacityTrFg] = useState('');
  const [operationalStatus, setOperationalStatus] = useState('operativo');
  const [qrToken, setQrToken] = useState('');
  const [refrigerantType, setRefrigerantType] = useState('');
  const [notes, setNotes] = useState('');

  // Unidad Interior (UI)
  const [indoorModel, setIndoorModel] = useState('');
  const [indoorSerial, setIndoorSerial] = useState('');
  const [indoorLocation, setIndoorLocation] = useState('');

  // Unidad Exterior (UE)
  const [outdoorModel, setOutdoorModel] = useState('');
  const [outdoorSerial, setOutdoorSerial] = useState('');
  const [outdoorLocation, setOutdoorLocation] = useState('');

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
      setOperationalStatus(equipment.operational_status || 'operativo');
      setQrToken(equipment.qr_token || '');
      setCapacityBtu(
        equipment.capacity_btu !== null && equipment.capacity_btu !== undefined
          ? String(equipment.capacity_btu)
          : ''
      );
      setCapacityTrFg(equipment.capacity_tr_fg || '');
      setRefrigerantType(equipment.refrigerant_type || '');
      setNotes(equipment.notes || '');

      // Unidad Interior (con fallback a campos existentes)
      setIndoorModel(equipment.indoor_model || equipment.model || '');
      setIndoorSerial(equipment.indoor_serial || equipment.serial_number || '');
      setIndoorLocation(equipment.indoor_location || equipment.location_description || '');

      // Unidad Exterior
      setOutdoorModel(equipment.outdoor_model || '');
      setOutdoorSerial(equipment.outdoor_serial || '');
      setOutdoorLocation(equipment.outdoor_location || '');

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

    const fullPayload = {
      plant_id: plantId,
      type,
      brand: brand.trim(),
      model: indoorModel.trim() || outdoorModel.trim() || null,
      serial_number: indoorSerial.trim() || outdoorSerial.trim() || null,
      location_description: indoorLocation.trim() || outdoorLocation.trim() || null,
      indoor_model: indoorModel.trim() || null,
      indoor_serial: indoorSerial.trim() || null,
      indoor_location: indoorLocation.trim() || null,
      outdoor_model: outdoorModel.trim() || null,
      outdoor_serial: outdoorSerial.trim() || null,
      outdoor_location: outdoorLocation.trim() || null,
      capacity_btu: capacityBtu ? parseInt(capacityBtu, 10) : null,
      capacity_tr_fg: capacityTrFg.trim() || null,
      refrigerant_type: refrigerantType.trim() || null,
      operational_status: operationalStatus,
      qr_token: qrToken.trim() ? qrToken.trim().toUpperCase() : null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let { error: updateError } = await supabase
      .from('equipment')
      .update(fullPayload)
      .eq('id', equipment.id);

    // Fallback resiliente si la migración aún no corrió en la base remota
    if (updateError && updateError.message && (
      updateError.message.includes('indoor_') ||
      updateError.message.includes('outdoor_') ||
      updateError.message.includes('capacity_tr_fg')
    )) {
      console.warn('Columnas duales no detectadas en DB aún, reintentando update clásico:', updateError.message);
      const legacyPayload = {
        plant_id: plantId,
        type,
        brand: brand.trim(),
        model: indoorModel.trim() || outdoorModel.trim() || null,
        serial_number: indoorSerial.trim() || outdoorSerial.trim() || null,
        location_description: [
          indoorLocation ? `UI: ${indoorLocation}` : '',
          outdoorLocation ? `UE: ${outdoorLocation}` : ''
        ].filter(Boolean).join(' | ') || null,
        capacity_btu: capacityBtu ? parseInt(capacityBtu, 10) : null,
        refrigerant_type: refrigerantType.trim() || null,
        operational_status: operationalStatus,
        qr_token: qrToken.trim() ? qrToken.trim().toUpperCase() : null,
        notes: [
          notes ? notes : '',
          outdoorSerial ? `UE Serial: ${outdoorSerial}` : '',
          outdoorModel ? `UE Modelo: ${outdoorModel}` : ''
        ].filter(Boolean).join(' - ') || null,
        updated_at: new Date().toISOString(),
      };

      const resRetry = await supabase.from('equipment').update(legacyPayload).eq('id', equipment.id);
      updateError = resRetry.error;
    }

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
          title="Editar Ficha Dual (UI + UE)"
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
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated w-full max-w-2xl overflow-hidden flex flex-col animate-slide-up border border-transparent dark:border-slate-700 max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center">
                <Settings2 size={20} className="text-brand-500" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Editar Equipo Dual (1 QR = UI + UE)</h2>
                <p className="text-gray-500 dark:text-gray-400 text-xs">
                  Modificar especificaciones de Unidad Interior, Unidad Exterior o sucursal
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
            <div className="p-6 overflow-y-auto space-y-5">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {/* Banner de Identificación Única de QR */}
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl flex items-start gap-2.5">
                <QrCode size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-900 dark:text-blue-200">
                  <span className="font-bold">QR de Sistema (Pegar en Unidad Interior):</span> El token <span className="font-mono font-bold">{qrToken || equipment?.qr_token || 'S/T'}</span> vincula física y digitalmente a la Unidad Interior y a la Unidad Exterior bajo una misma hoja de vida.
                </div>
              </div>

              <form id={`edit-equip-form-${equipment?.id}`} onSubmit={handleSubmit} className="space-y-5">
                
                {/* 1. Datos Generales */}
                <div className="bg-gray-50 dark:bg-slate-850/60 p-4 rounded-xl border border-gray-200/80 dark:border-slate-700/60 space-y-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                    1. Datos Generales del Sistema
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Planta / Sucursal *
                      </label>
                      <select
                        className="select text-sm"
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
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Tipo de Equipo *
                      </label>
                      <select
                        className="select text-sm"
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Marca del Conjunto *
                      </label>
                      <input
                        type="text"
                        className="input text-sm"
                        placeholder="Ej: Carrier, Daikin"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Frigorías / TR (Capacidad)
                      </label>
                      <input
                        type="text"
                        className="input text-sm"
                        placeholder="Ej: 4.500 FG / 3 TR"
                        value={capacityTrFg}
                        onChange={(e) => setCapacityTrFg(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Capacidad (BTU)
                      </label>
                      <input
                        type="number"
                        className="input text-sm"
                        placeholder="Ej: 18000"
                        value={capacityBtu}
                        onChange={(e) => setCapacityBtu(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
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
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Estado Operativo
                      </label>
                      <select
                        className="select text-sm"
                        value={operationalStatus}
                        onChange={(e) => setOperationalStatus(e.target.value)}
                      >
                        <option value="operativo">Operativo (Normal)</option>
                        <option value="con_observaciones">Con Observaciones</option>
                        <option value="fuera_de_servicio">Fuera de Servicio</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Código Token QR
                      </label>
                      <input
                        type="text"
                        className="input font-mono text-sm uppercase"
                        placeholder="Ej: 4S-9F2A"
                        value={qrToken}
                        onChange={(e) => setQrToken(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Tarjetas Lado a Lado: UI vs UE */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Tarjeta Unidad Interior (Evaporadora - UI) */}
                  <div className="bg-sky-50/50 dark:bg-sky-950/20 p-4 rounded-xl border border-sky-200/80 dark:border-sky-800/50 space-y-3">
                    <div className="flex items-center gap-2 pb-1 border-b border-sky-200/50 dark:border-sky-800/40">
                      <Wind size={16} className="text-sky-600 dark:text-sky-400" />
                      <span className="text-xs font-bold uppercase tracking-wide text-sky-900 dark:text-sky-300">
                        Unidad Interior (UI - Evaporadora)
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Modelo UI
                      </label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="Ej: 40MCC-018"
                        value={indoorModel}
                        onChange={(e) => setIndoorModel(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        N° de Serie UI
                      </label>
                      <input
                        type="text"
                        className="input font-mono text-xs"
                        placeholder="Ej: SN-UI-883921"
                        value={indoorSerial}
                        onChange={(e) => setIndoorSerial(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Ubicación exacta UI
                      </label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="Ej: Consultorio 2 - Pared Norte"
                        value={indoorLocation}
                        onChange={(e) => setIndoorLocation(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Tarjeta Unidad Exterior (Condensadora - UE) */}
                  <div className="bg-amber-50/50 dark:bg-amber-950/20 p-4 rounded-xl border border-amber-200/80 dark:border-amber-800/50 space-y-3">
                    <div className="flex items-center gap-2 pb-1 border-b border-amber-200/50 dark:border-amber-800/40">
                      <Box size={16} className="text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-300">
                        Unidad Exterior (UE - Condensadora)
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Modelo UE
                      </label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="Ej: 38MCC-018"
                        value={outdoorModel}
                        onChange={(e) => setOutdoorModel(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        N° de Serie UE
                      </label>
                      <input
                        type="text"
                        className="input font-mono text-xs"
                        placeholder="Ej: SN-UE-992014"
                        value={outdoorSerial}
                        onChange={(e) => setOutdoorSerial(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Ubicación exacta UE
                      </label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="Ej: Terraza Piso 3 / Balcón Contrafrente"
                        value={outdoorLocation}
                        onChange={(e) => setOutdoorLocation(e.target.value)}
                      />
                    </div>
                  </div>

                </div>

                {/* Observaciones / Notas */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Observaciones / Notas
                  </label>
                  <textarea
                    className="input min-h-[60px] text-xs"
                    placeholder="Ej: Evaporadora con detalles estéticos, condensadora accesible por terraza..."
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
