import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Package, Trash2, Zap } from 'lucide-react';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { supabase } from '@4s-clima/shared/supabase';
import { db } from '../services/offlineDb';
import { TECHNICAL_CAPACITY_OPTIONS, getTechnicalMaterialChips } from '@4s-clima/shared';

const UNIT_OPTIONS = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'metro', label: 'Metros (m)' },
  { value: 'litro', label: 'Litros (L)' },
  { value: 'hora', label: 'Horas (h)' },
];

export default function ExtrasPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrder, fetchWorkOrder } = useWorkOrderStore();

  const [extras, setExtras] = useState([]);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('unidad');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCapacity, setSelectedCapacity] = useState('3000');

  useEffect(() => {
    if (currentOrder && currentOrder.extras) {
      setExtras(currentOrder.extras);
    }
  }, [currentOrder]);

  const handleAddExtra = async (e) => {
    e.preventDefault();
    if (!description || !quantity) return;

    setIsSubmitting(true);
    const newExtra = {
      work_order_id: id,
      description,
      quantity: parseFloat(quantity),
      unit,
      unit_price: 0,
      billed: false,
    };

    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('extras')
          .insert([newExtra])
          .select('id, work_order_id, description, quantity, unit, created_at');

        if (error) throw error;
        if (data && data.length > 0) {
          setExtras((prev) => [...prev, data[0]]);
        }
      } else {
        const tempId = `temp-${Date.now()}`;
        const tempExtra = { ...newExtra, id: tempId, created_at: new Date().toISOString() };

        await db.extras.add({ ...tempExtra, synced: false });
        await db.pendingSync.add({
          table: 'extras',
          action: 'insert',
          data: newExtra,
          created_at: new Date().toISOString(),
        });

        setExtras((prev) => [...prev, tempExtra]);
      }

      setDescription('');
      setQuantity('');
      setUnit('unidad');
      fetchWorkOrder(id);
    } catch (err) {
      console.error('Error adding extra:', err);
      alert('Error al agregar el material. Intentá de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (extraId) => {
    if (!window.confirm('¿Eliminar este material?')) return;

    try {
      if (navigator.onLine) {
        if (!extraId.toString().startsWith('temp-')) {
          await supabase.from('extras').delete().eq('id', extraId);
        }
      }
      setExtras((prev) => prev.filter(e => e.id !== extraId));
      fetchWorkOrder(id);
    } catch (err) {
      console.error('Error deleting extra:', err);
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
    <div className="page-container flex flex-col min-h-screen">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center border border-gray-200 dark:border-slate-700 active:bg-gray-50 dark:active:bg-slate-800 transition-colors shadow-sm"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Relevamiento de Materiales</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Registrar insumos utilizados para cotización de Administración</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 animate-slide-up">
        {/* Selector Rápido de Materiales Oficiales (Sin Precios para el Técnico) */}
        <div className="card p-4 space-y-3 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800/80 border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Zap size={14} className="text-amber-500" /> Materiales Rápidos de Instalación
            </h2>
            <span className="text-[10px] text-gray-400 font-medium">Toque para autocompletar</span>
          </div>

          {/* Selector de Capacidad / Frigorías */}
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1.5">Capacidad:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {TECHNICAL_CAPACITY_OPTIONS.map((combo) => (
                <button
                  key={combo.key}
                  type="button"
                  onClick={() => setSelectedCapacity(combo.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all border
                    ${selectedCapacity === combo.key
                      ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-brand-300'
                    }`}
                >
                  {combo.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chips de Materiales Estándar */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {getTechnicalMaterialChips(selectedCapacity).map((chip) => (
              <button
                key={chip.desc}
                type="button"
                onClick={() => {
                  setDescription(chip.desc);
                  setUnit(chip.unit);
                  const qtyInput = document.getElementById('extra-quantity-input');
                  if (qtyInput) qtyInput.focus();
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all text-left
                  ${description === chip.desc
                    ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500 text-brand-700 dark:text-brand-300 font-bold'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-brand-300'
                  }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Formulario de Carga */}
        <div className="card">
          <form onSubmit={handleAddExtra} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Descripción del repuesto / material
              </label>
              <input
                type="text"
                className="input"
                placeholder="Ej: Metros de Caño, Gas R410A, Ménsula..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad</label>
                <input
                  id="extra-quantity-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input font-bold"
                  placeholder="Ej: 2.5"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Unidad</label>
                <select
                  className="select font-medium"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  {UNIT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="btn-primary w-full mt-2"
              disabled={isSubmitting || !description || !quantity}
            >
              <Plus size={18} />
              Agregar a la Orden
            </button>
          </form>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Cargados ({extras.length})
          </h2>
          {extras.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl">
              <Package size={32} className="text-gray-400 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No se agregaron materiales extra</p>
            </div>
          ) : (
            <div className="space-y-2">
              {extras.map((extra) => (
                <div key={extra.id} className="card py-3 px-4 flex items-center justify-between">
                  <div>
                    <p className="text-slate-900 dark:text-white font-medium text-sm">{extra.description}</p>
                    <p className="text-brand-500 dark:text-brand-400 text-xs font-mono mt-0.5 font-bold">
                      {extra.quantity} {UNIT_OPTIONS.find(u => u.value === extra.unit)?.label || extra.unit}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(extra.id)}
                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 mb-4">
        <button
          onClick={handleBack}
          className="btn-secondary w-full"
        >
          Volver a la orden
        </button>
      </div>
    </div>
  );
}
