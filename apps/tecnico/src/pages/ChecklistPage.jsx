import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, AlertTriangle, X, Minus, ChevronRight, MessageSquare } from 'lucide-react';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { CHECKLIST_STATUS } from '@4s-clima/shared/constants';
import { getChecklistByEquipmentType } from '@4s-clima/shared/constants/checklists';
import { supabase } from '@4s-clima/shared/supabase';
import { db } from '../services/offlineDb';

/**
 * Página de checklist del técnico.
 * Interfaz de botones grandes sin escribir.
 * El técnico toca OK / Atención / Falla para cada ítem.
 */
export default function ChecklistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrder } = useWorkOrderStore();
  const [items, setItems] = useState([]);
  const [expandedNote, setExpandedNote] = useState(null);
  const [notes, setNotes] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Inicializar checklist
  useEffect(() => {
    if (!currentOrder) return;

    // Si ya tiene checklist items de la DB, usarlos
    if (currentOrder.checklist_items?.length > 0) {
      setItems(currentOrder.checklist_items);
      const existingNotes = {};
      currentOrder.checklist_items.forEach((item) => {
        if (item.notes) existingNotes[item.id] = item.notes;
      });
      setNotes(existingNotes);
    } else {
      // Generar desde template según tipo de equipo
      const template = getChecklistByEquipmentType(currentOrder.equipment?.type);
      if (template) {
        let sortOrder = 0;
        const generated = [];
        template.categories.forEach((cat) => {
          cat.items.forEach((itemName) => {
            generated.push({
              id: `temp-${sortOrder}`,
              work_order_id: id,
              category: cat.name,
              item_name: itemName,
              status: null,
              notes: null,
              sort_order: sortOrder++,
            });
          });
        });
        setItems(generated);
      }
    }
  }, [currentOrder, id]);

  // Cambiar estado de un ítem
  const toggleStatus = useCallback((itemId, newStatus) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, status: item.status === newStatus ? null : newStatus }
          : item
      )
    );
  }, []);

  // Actualizar nota de un ítem
  const updateNote = useCallback((itemId, note) => {
    setNotes((prev) => ({ ...prev, [itemId]: note }));
  }, []);

  // Guardar y avanzar a firma
  const handleSave = async () => {
    // Validación: buscar ítems sin responder
    const unanswered = items.filter(item => item.status === null);
    
    if (unanswered.length > 0) {
      const firstMissing = unanswered[0];
      
      // Hacer scroll hacia el primer elemento faltante
      const el = document.getElementById(`checklist-item-${firstMissing.id}`);
      if (el) {
        // Obtenemos la barra superior para restarle al scroll
        const yOffset = -100; 
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        
        window.scrollTo({ top: y, behavior: 'smooth' });
        
        // Agregar una clase temporal para resaltarlo (usamos estilos inline para asegurar el efecto)
        el.style.transition = 'all 0.3s ease';
        el.style.boxShadow = '0 0 0 2px rgba(239, 68, 68, 1), 0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        
        setTimeout(() => {
          el.style.boxShadow = '';
        }, 2000);
      }
      
      alert('Por favor, completá todos los ítems del checklist antes de continuar.');
      return;
    }

    setIsSaving(true);

    const checklistData = items.map((item) => ({
      ...item,
      notes: notes[item.id] || item.notes || null,
    }));

    try {
      if (navigator.onLine) {
        if (checklistData.length > 0) {
          // Primero borramos los anteriores para evitar duplicados si el usuario va y vuelve de página
          await supabase.from('checklist_items').delete().eq('work_order_id', id);
          
          // Insertamos la versión actual
          const toInsert = checklistData.map(({ id: _id, ...rest }) => rest);
          const { error } = await supabase.from('checklist_items').insert(toInsert);
          
          if (error) throw error;
        }
      } else {
        // Guardar en IndexedDB para sync posterior
        for (const item of checklistData) {
          await db.checklistItems.put({ ...item, synced: false });
        }
        await db.pendingSync.add({
          table: 'checklist_items',
          action: 'upsert',
          id: id,
          data: checklistData,
          created_at: new Date().toISOString(),
        });
      }

      navigate(`/orden/${id}/fotos`);
    } catch (error) {
      console.error('Error guardando checklist:', error);
      alert('Error al guardar. Se guardó localmente para sincronizar después.');
      // Guardar offline como fallback
      for (const item of checklistData) {
        await db.checklistItems.put({ ...item, synced: false });
      }
      navigate(`/orden/${id}/fotos`);
    } finally {
      setIsSaving(false);
    }
  };

  // Agrupar ítems por categoría
  const categories = items.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Progreso
  const completed = items.filter((i) => i.status !== null).length;
  const total = items.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 100;
  const allDone = total === 0 || completed === total;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header bg-white/90 backdrop-blur-xl border-b border-gray-200">
        <div className="flex items-center gap-3 mb-4 mt-2">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:bg-gray-100 hover:bg-gray-50 transition-colors shadow-sm"
            aria-label="Volver"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Checklist</h1>
            <p className="text-xs font-semibold text-gray-500">
              {currentOrder?.client?.name} — {currentOrder?.equipment?.type}
            </p>
          </div>
          <span className="text-sm font-bold bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg border border-brand-200 shadow-sm">
            {completed}/{total}
          </span>
        </div>
        {/* Barra de progreso */}
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Leyenda rápida */}
      <div className="flex items-center justify-center gap-4 mb-6 mt-4 text-[11px] font-semibold text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-300 shadow-sm" /> OK
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-amber-100 border border-amber-300 shadow-sm" /> Atención
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-red-100 border border-red-300 shadow-sm" /> Falla
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-gray-100 border border-gray-300 shadow-sm" /> N/A
        </span>
      </div>

      {/* Checklist por categorías */}
      <div className="space-y-6 animate-slide-up pb-10">
        {Object.entries(categories).map(([catName, catItems]) => (
          <section key={catName}>
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
              <div className="w-1 h-3 bg-brand-500 rounded-full"></div>
              {catName}
            </h2>
            <div className="space-y-2.5">
              {catItems.map((item) => (
                <div key={item.id} id={`checklist-item-${item.id}`}>
                  <div
                    className="checklist-row shadow-sm"
                    data-status={item.status}
                  >
                    <span className="text-sm font-medium text-slate-800 flex-1 leading-snug">
                      {item.item_name}
                    </span>

                    {/* Botones de estado */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <StatusButton
                        icon={<Check size={16} />}
                        status={CHECKLIST_STATUS.OK}
                        active={item.status === CHECKLIST_STATUS.OK}
                        onClick={() => toggleStatus(item.id, CHECKLIST_STATUS.OK)}
                        color="emerald"
                      />
                      <StatusButton
                        icon={<AlertTriangle size={14} />}
                        status={CHECKLIST_STATUS.WARNING}
                        active={item.status === CHECKLIST_STATUS.WARNING}
                        onClick={() => toggleStatus(item.id, CHECKLIST_STATUS.WARNING)}
                        color="amber"
                      />
                      <StatusButton
                        icon={<X size={16} />}
                        status={CHECKLIST_STATUS.FAIL}
                        active={item.status === CHECKLIST_STATUS.FAIL}
                        onClick={() => toggleStatus(item.id, CHECKLIST_STATUS.FAIL)}
                        color="red"
                      />
                      <StatusButton
                        icon={<Minus size={14} />}
                        status={CHECKLIST_STATUS.NA}
                        active={item.status === CHECKLIST_STATUS.NA}
                        onClick={() => toggleStatus(item.id, CHECKLIST_STATUS.NA)}
                        color="gray"
                      />
                      {/* Nota */}
                      <button
                        onClick={() => setExpandedNote(expandedNote === item.id ? null : item.id)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-sm border
                          ${notes[item.id]
                            ? 'bg-brand-50 text-brand-600 border-brand-200'
                            : 'bg-white text-gray-400 border-gray-200 active:bg-gray-50'
                          }`}
                        aria-label="Agregar nota"
                      >
                        <MessageSquare size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Campo de nota expandible */}
                  {expandedNote === item.id && (
                    <div className="mt-2 ml-4 animate-fade-in pr-2">
                      <textarea
                        placeholder="Agregar observación..."
                        value={notes[item.id] || ''}
                        onChange={(e) => updateNote(item.id, e.target.value)}
                        className="input text-sm min-h-[60px] resize-none"
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Botón guardar y firmar */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-4 pt-2 bg-gradient-to-t from-surface-dark via-surface-dark to-transparent z-20">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSave}
            disabled={!allDone || isSaving}
            className={`w-full text-base ${allDone ? 'btn-success' : 'btn-secondary opacity-60'}`}
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Guardando...
              </>
            ) : allDone ? (
              <>
                Guardar y Fotografías
                <ChevronRight size={18} />
              </>
            ) : (
              `Completá todos los ítems (${completed}/${total})`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Botón de estado individual del checklist.
 */
function StatusButton({ icon, active, onClick, color }) {
  const colorClasses = {
    emerald: active ? 'bg-emerald-500 text-slate-900' : 'bg-emerald-500/10 text-emerald-500/50',
    amber: active ? 'bg-amber-500 text-slate-900' : 'bg-amber-500/10 text-amber-500/50',
    red: active ? 'bg-red-500 text-slate-900' : 'bg-red-500/10 text-red-500/50',
    gray: active ? 'bg-gray-500 text-slate-900' : 'bg-gray-500/10 text-gray-500/50',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150
        active:scale-90 ${colorClasses[color]}`}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}
