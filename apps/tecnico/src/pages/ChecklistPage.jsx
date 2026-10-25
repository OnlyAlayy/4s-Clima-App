import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Check, AlertTriangle, X, Minus, ChevronRight,
  MessageSquare, Save, CheckCircle2, Lock, ShieldCheck
} from 'lucide-react';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { CHECKLIST_STATUS } from '@4s-clima/shared/constants';
import { getChecklistByEquipmentType } from '@4s-clima/shared/constants/checklists';
import { supabase } from '@4s-clima/shared/supabase';
import { db } from '../services/offlineDb';

/**
 * Página de checklist del técnico.
 * Soporta:
 * 1. Guardado parcial en modo borrador (draft) en cualquier momento.
 * 2. Cierre y envío definitivo (submitted) con validación del 100% y confirmación.
 * 3. Inmutabilidad en modo solo lectura una vez enviado.
 * 4. Carga de plantillas dinámicas si la orden tiene checklist_template_id, o fallback automático por tipo de equipo.
 */
export default function ChecklistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrder, fetchWorkOrder, isLoading } = useWorkOrderStore();
  const [items, setItems] = useState([]);
  const [expandedNotes, setExpandedNotes] = useState({});
  const [notes, setNotes] = useState({});
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [draftToast, setDraftToast] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Cargar orden si no está en Zustand (ej: tras recarga con F5)
  useEffect(() => {
    if (id && (!currentOrder || currentOrder.id !== id)) {
      fetchWorkOrder(id);
    }
  }, [id, currentOrder, fetchWorkOrder]);

  // ¿El checklist ya fue sellado y enviado?
  const isSubmitted = currentOrder?.checklist_status === 'submitted';

  // Forzar captura obligatoria de fotos del antes previa al formulario
  useEffect(() => {
    if (currentOrder && currentOrder.id === id && currentOrder.checklist_status !== 'submitted') {
      const hasBefore = currentOrder.photos?.some((p) => p.type === 'before');
      if (!hasBefore) {
        navigate(`/orden/${id}/fotos-antes`, { replace: true });
      }
    }
  }, [currentOrder, id, navigate]);

  // Inicializar checklist (usar existentes, plantilla dinámica o plantilla por defecto)
  useEffect(() => {
    if (!currentOrder || currentOrder.id !== id) return;

    // 1. Si ya tiene checklist_items guardados en la DB o caché, usarlos
    if (currentOrder.checklist_items && currentOrder.checklist_items.length > 0) {
      setItems(currentOrder.checklist_items);
      const existingNotes = {};
      currentOrder.checklist_items.forEach((item) => {
        if (item.notes) existingNotes[item.id] = item.notes;
      });
      setNotes(existingNotes);
      return;
    }

    // 2. Si no tiene ítems aún, generar desde plantilla
    async function generateInitialItems() {
      let template = null;

      // Buscar si la orden tiene asignada una plantilla dinámica en la base de datos
      if (currentOrder.checklist_template_id) {
        try {
          const { data: tpl } = await supabase
            .from('checklist_templates')
            .select('*')
            .eq('id', currentOrder.checklist_template_id)
            .single();

          if (tpl && (tpl.sections || tpl.categories)) {
            template = {
              name: tpl.name,
              categories: Array.isArray(tpl.sections) ? tpl.sections : tpl.categories || [],
            };
          }
        } catch (err) {
          console.warn('No se pudo cargar la plantilla dinámica, usando fallback:', err);
        }
      }

      // Si no hay plantilla específica en la orden, buscar por tipo de equipo en la DB
      if (!template && currentOrder.equipment?.type) {
        try {
          const { data: eqTpls } = await supabase
            .from('checklist_templates')
            .select('*')
            .eq('equipment_type', currentOrder.equipment.type)
            .eq('active', true)
            .limit(1);

          if (eqTpls && eqTpls.length > 0) {
            const tpl = eqTpls[0];
            template = {
              name: tpl.name,
              categories: Array.isArray(tpl.sections) ? tpl.sections : tpl.categories || [],
            };
          }
        } catch (err) {
          console.warn('No se pudo cargar plantilla por equipment_type:', err);
        }
      }

      // Si aún no hay plantilla, buscar la plantilla activa más reciente creada en el admin
      if (!template) {
        try {
          const { data: activeTpls } = await supabase
            .from('checklist_templates')
            .select('*')
            .eq('active', true)
            .order('name')
            .limit(1);

          if (activeTpls && activeTpls.length > 0) {
            const tpl = activeTpls[0];
            template = {
              name: tpl.name,
              categories: Array.isArray(tpl.sections) ? tpl.sections : tpl.categories || [],
            };
          }
        } catch (err) {
          console.warn('No se pudo cargar plantilla activa:', err);
        }
      }

      // Fallback local garantizado desde shared constants (100% offline-first)
      if (!template) {
        template = getChecklistByEquipmentType(currentOrder.equipment?.type);
      }

      if (template && (template.categories || template.sections)) {
        let sortOrder = 0;
        const generated = [];
        const cats = template.categories || template.sections || [];
        cats.forEach((cat) => {
          (cat.items || []).forEach((itemName) => {
            generated.push({
              id: crypto.randomUUID(),
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

    generateInitialItems();
  }, [currentOrder, id]);

  // Cambiar estado de un ítem (bloqueado si ya fue enviado)
  const toggleStatus = useCallback((itemId, newStatus) => {
    if (isSubmitted) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, status: item.status === newStatus ? null : newStatus }
          : item
      )
    );
  }, [isSubmitted]);

  // Actualizar nota de un ítem
  const updateNote = useCallback((itemId, note) => {
    if (isSubmitted) return;
    setNotes((prev) => ({ ...prev, [itemId]: note }));
  }, [isSubmitted]);

  // Placeholder dinámico según el tipo de pregunta
  const getDynamicPlaceholder = (itemName) => {
    if (!itemName) return 'Observación / acción...';
    const lower = itemName.toLowerCase();
    if (lower.includes('amper')) {
      return 'Ej: 8.5 A — Observación / acción';
    }
    if (lower.includes('volt')) {
      return 'Ej: 220 V — Observación / acción';
    }
    if (lower.includes('resultado')) {
      return 'Indicar resultado u observación / acción...';
    }
    return 'Observación / acción...';
  };

  // Determina si el campo de texto de notas debe mostrarse abierto
  const isNoteOpen = (item) => {
    if (expandedNotes[item.id] !== undefined) {
      return expandedNotes[item.id];
    }
    if (notes[item.id] && String(notes[item.id]).trim().length > 0) {
      return true;
    }
    const lower = (item.item_name || '').toLowerCase();
    if (lower.includes('amper') || lower.includes('volt') || lower.includes('resultado')) {
      return true;
    }
    return false;
  };

  const toggleNoteExpanded = (item) => {
    const currentOpen = isNoteOpen(item);
    setExpandedNotes((prev) => ({
      ...prev,
      [item.id]: !currentOpen,
    }));
  };

  // Construir datos consolidados
  const buildChecklistData = () => {
    return items.map((item) => ({
      ...item,
      notes: notes[item.id] !== undefined ? notes[item.id] : item.notes || null,
    }));
  };

  /**
   * 1. GUARDAR BORRADOR (DRAFT)
   * Permite guardar el progreso parcial en cualquier momento (ej: 4 de 15 ítems).
   * No bloquea ni exige el 100% respondido.
   */
  const handleSaveDraft = async () => {
    if (isSubmitted) return;
    setIsSavingDraft(true);
    const checklistData = buildChecklistData();

    try {
      if (navigator.onLine) {
        if (checklistData.length > 0) {
          const { error: upsertErr } = await supabase
            .from('checklist_items')
            .upsert(checklistData);
          if (upsertErr) throw upsertErr;
        }

        const { error: woErr } = await supabase
          .from('work_orders')
          .update({
            checklist_status: 'draft',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (woErr) throw woErr;
      } else {
        // Modo offline
        for (const item of checklistData) {
          await db.checklistItems.put({ ...item, synced: false });
        }
        await db.workOrders.update(id, { checklist_status: 'draft', synced: false });
        await db.pendingSync.add({
          table: 'checklist_items',
          action: 'upsert',
          recordId: id,
          data: checklistData,
          created_at: new Date().toISOString(),
        });
      }

      // Actualizar Zustand local
      const cur = useWorkOrderStore.getState().currentOrder;
      if (cur?.id === id) {
        useWorkOrderStore.setState({
          currentOrder: {
            ...cur,
            checklist_status: 'draft',
            checklist_items: checklistData,
          },
        });
      }

      // Mostrar feedback visual
      setDraftToast(true);
      setTimeout(() => setDraftToast(false), 2500);
    } catch (error) {
      console.error('Error guardando borrador:', error);
      alert('Hubo un error al guardar el borrador: ' + error.message);
    } finally {
      setIsSavingDraft(false);
    }
  };

  /**
   * 2. ENVIAR CHECKLIST FINAL (SUBMITTED)
   * Valida que el 100% esté respondido, pide confirmación,
   * sella la orden con checklist_status = 'submitted' y bloquea la edición.
   */
  const handleSubmitFinal = async () => {
    if (isSubmitted) {
      navigate(`/orden/${id}/fotos-despues`);
      return;
    }

    // Validación: buscar ítems sin responder
    const unanswered = items.filter((item) => item.status === null);
    if (unanswered.length > 0) {
      const firstMissing = unanswered[0];
      const el = document.getElementById(`checklist-item-${firstMissing.id}`);
      if (el) {
        const yOffset = -100;
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
        el.style.transition = 'all 0.3s ease';
        el.style.boxShadow = '0 0 0 2px rgba(239, 68, 68, 1), 0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        setTimeout(() => {
          el.style.boxShadow = '';
        }, 2000);
      }
      alert('Por favor, respondé todos los ítems antes de enviar el checklist final.');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleExecuteSubmitFinal = async () => {
    setShowConfirmModal(false);
    setIsSubmittingFinal(true);
    const checklistData = buildChecklistData();
    const now = new Date().toISOString();

    try {
      if (navigator.onLine) {
        if (checklistData.length > 0) {
          const { error: upsertErr } = await supabase
            .from('checklist_items')
            .upsert(checklistData);
          if (upsertErr) throw upsertErr;
        }

        const { error: woErr } = await supabase
          .from('work_orders')
          .update({
            checklist_status: 'submitted',
            checklist_submitted_at: now,
            updated_at: now,
          })
          .eq('id', id);
        if (woErr) throw woErr;
      } else {
        // Offline queue
        for (const item of checklistData) {
          await db.checklistItems.put({ ...item, synced: false });
        }
        await db.workOrders.update(id, {
          checklist_status: 'submitted',
          checklist_submitted_at: now,
          synced: false,
        });
        await db.pendingSync.add({
          table: 'checklist_items',
          action: 'upsert',
          recordId: id,
          data: checklistData,
          created_at: now,
        });
        await db.pendingSync.add({
          table: 'work_orders',
          action: 'update',
          recordId: id,
          data: { checklist_status: 'submitted', checklist_submitted_at: now },
          created_at: now,
        });
      }

      // Actualizar Zustand local
      const cur = useWorkOrderStore.getState().currentOrder;
      if (cur?.id === id) {
        useWorkOrderStore.setState({
          currentOrder: {
            ...cur,
            checklist_status: 'submitted',
            checklist_submitted_at: now,
            checklist_items: checklistData,
          },
        });
      }
      navigate(`/orden/${id}/fotos-despues`);
    } catch (error) {
      console.error('Error enviando checklist final:', error);
      alert('Error al enviar checklist: ' + error.message);
    } finally {
      setIsSubmittingFinal(false);
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
  const allDone = total > 0 && completed === total;

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate(`/orden/${id}`, { replace: true });
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-4 mt-2">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 flex items-center justify-center active:bg-gray-100 dark:active:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
            aria-label="Volver"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              Checklist
              {isSubmitted && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  Enviado
                </span>
              )}
            </h1>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {currentOrder?.client?.name} — {currentOrder?.equipment?.type}
            </p>
          </div>
          <span className="text-sm font-bold bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-800 shadow-sm">
            {completed}/{total}
          </span>
        </div>
        {/* Barra de progreso */}
        <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              allDone ? 'bg-emerald-500' : 'bg-brand-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Banner de inmutabilidad si ya fue enviado */}
      {isSubmitted && (
        <div className="mb-4 mt-2 p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-3 text-xs text-emerald-800 dark:text-emerald-300">
          <ShieldCheck size={20} className="shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div>
            <span className="font-bold block text-sm">Checklist Sellado e Inmutable</span>
            <span className="text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 block">
              Esta inspección ya fue enviada y sellada en el servidor. La edición se encuentra bloqueada en modo solo lectura.
            </span>
          </div>
        </div>
      )}

      {/* Toast de confirmación de borrador */}
      {draftToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg animate-fade-in flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>Borrador guardado ({completed}/{total} respondidos)</span>
        </div>
      )}

      {/* Leyenda rápida */}
      <div className="flex items-center justify-center gap-4 mb-6 mt-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700 shadow-sm" /> OK
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-amber-100 border border-amber-300 dark:bg-amber-950/40 dark:border-amber-700 shadow-sm" /> Observación
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-red-100 border border-red-300 dark:bg-red-950/40 dark:border-red-700 shadow-sm" /> Falla
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-gray-100 border border-gray-300 dark:bg-gray-800 dark:border-gray-700 shadow-sm" /> N/A
        </span>
      </div>

      {/* Checklist por categorías */}
      <div className="space-y-6 animate-slide-up pb-32">
        {Object.entries(categories).map(([catName, catItems]) => (
          <section key={catName}>
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
              <div className="w-1 h-3 bg-brand-500 rounded-full" />
              {catName}
            </h2>
            <div className="space-y-2.5">
              {catItems.map((item) => (
                <div key={item.id} id={`checklist-item-${item.id}`} className="space-y-1.5">
                  <div
                    className="checklist-row shadow-sm"
                    data-status={item.status}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block leading-snug">
                        {item.item_name}
                      </span>
                      {!isNoteOpen(item) && notes[item.id] && (
                        <span className="text-xs text-brand-600 dark:text-brand-400 font-semibold truncate block mt-0.5">
                          Nota: {notes[item.id]}
                        </span>
                      )}
                    </div>

                    {/* Botones de estado */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <StatusButton
                        icon={<Check size={16} />}
                        status={CHECKLIST_STATUS.OK}
                        active={item.status === CHECKLIST_STATUS.OK}
                        onClick={() => toggleStatus(item.id, CHECKLIST_STATUS.OK)}
                        color="emerald"
                        disabled={isSubmitted}
                        label="OK"
                      />
                      <StatusButton
                        icon={<AlertTriangle size={14} />}
                        status={CHECKLIST_STATUS.WARNING}
                        active={item.status === CHECKLIST_STATUS.WARNING}
                        onClick={() => toggleStatus(item.id, CHECKLIST_STATUS.WARNING)}
                        color="amber"
                        disabled={isSubmitted}
                        label="Observación"
                      />
                      <StatusButton
                        icon={<X size={16} />}
                        status={CHECKLIST_STATUS.FAIL}
                        active={item.status === CHECKLIST_STATUS.FAIL}
                        onClick={() => toggleStatus(item.id, CHECKLIST_STATUS.FAIL)}
                        color="red"
                        disabled={isSubmitted}
                        label="Falla"
                      />
                      <StatusButton
                        icon={<Minus size={14} />}
                        status={CHECKLIST_STATUS.NA}
                        active={item.status === CHECKLIST_STATUS.NA}
                        onClick={() => toggleStatus(item.id, CHECKLIST_STATUS.NA)}
                        color="gray"
                        disabled={isSubmitted}
                        label="N/A"
                      />
                      {/* Botón Nota / Observación */}
                      <button
                        type="button"
                        onClick={() => toggleNoteExpanded(item)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm border
                          ${notes[item.id] || isNoteOpen(item)
                            ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 border-brand-300 dark:border-brand-700'
                            : 'bg-white dark:bg-slate-900 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-slate-700 active:bg-gray-50 dark:active:bg-slate-800'
                          }`}
                        title="Observación / acción"
                        aria-label="Agregar observación / acción"
                      >
                        <MessageSquare size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Campo de texto de Observación / acción debajo de la pregunta */}
                  {isNoteOpen(item) && (
                    <div className="ml-3 mr-1 animate-fade-in">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          placeholder={getDynamicPlaceholder(item.item_name)}
                          value={notes[item.id] || ''}
                          onChange={(e) => updateNote(item.id, e.target.value)}
                          disabled={isSubmitted}
                          className="input text-xs py-2 pl-3 pr-8 w-full rounded-xl bg-gray-50/90 dark:bg-slate-800/60 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 transition-all font-medium text-slate-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                        {notes[item.id] && !isSubmitted && (
                          <button
                            type="button"
                            onClick={() => updateNote(item.id, '')}
                            className="absolute right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5"
                            title="Borrar texto"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Barra de acción inferior fija */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-gray-50 via-gray-50 dark:from-slate-950 dark:via-slate-950 to-transparent z-20 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          {isSubmitted ? (
            /* Modo ya enviado: solo navegación */
            <button
              onClick={() => navigate(`/orden/${id}/fotos-despues`)}
              className="w-full btn-primary text-base flex items-center justify-center gap-2 py-3"
            >
              <span>Continuar a Fotos del Después</span>
              <ChevronRight size={18} />
            </button>
          ) : (
            /* Modo editable: Guardar Borrador vs Enviar Checklist Final */
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSavingDraft || isSubmittingFinal}
                className="btn-secondary text-sm py-3 flex items-center justify-center gap-1.5 font-bold"
              >
                {isSavingDraft ? (
                  <>
                    <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} className="text-brand-500" />
                    <span>Guardar Borrador</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSubmitFinal}
                disabled={!allDone || isSubmittingFinal || isSavingDraft}
                className={`text-sm py-3 flex items-center justify-center gap-1.5 font-bold ${
                  allDone ? 'btn-success' : 'btn-secondary opacity-60'
                }`}
              >
                {isSubmittingFinal ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : allDone ? (
                  <>
                    <span>Enviar Checklist</span>
                    <ChevronRight size={16} />
                  </>
                ) : (
                  `Faltan (${total - completed})`
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmación para envío definitivo */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-up space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <ShieldCheck size={28} />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                ¿Enviar Checklist Final?
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                Una vez enviado, el checklist quedará <strong className="text-gray-700 dark:text-gray-200">sellado e inmutable</strong> en el servidor y no podrás modificar ninguna respuesta.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="btn-secondary flex-1 py-2.5 text-xs font-semibold"
              >
                Volver a revisar
              </button>
              <button
                type="button"
                id="btn-confirm-final-submit"
                onClick={handleExecuteSubmitFinal}
                disabled={isSubmittingFinal}
                className="btn-primary flex-1 py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isSubmittingFinal ? 'Enviando...' : 'Sí, Enviar y Sellar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Botón de estado individual del checklist con soporte para disabled.
 */
function StatusButton({ icon, active, onClick, color, disabled, label }) {
  const colorClasses = {
    emerald: active ? 'bg-emerald-500 text-slate-900 dark:text-slate-100 ring-2 ring-emerald-500/30' : 'bg-emerald-500/10 text-emerald-500/60',
    amber: active ? 'bg-amber-500 text-slate-900 dark:text-slate-100 ring-2 ring-amber-500/30' : 'bg-amber-500/10 text-amber-500/60',
    red: active ? 'bg-red-500 text-slate-900 dark:text-slate-100 ring-2 ring-red-500/30' : 'bg-red-500/10 text-red-500/60',
    gray: active ? 'bg-gray-500 text-slate-900 dark:text-slate-100 ring-2 ring-gray-500/30' : 'bg-gray-500/10 text-gray-500/60',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150
        active:scale-90 ${colorClasses[color]} ${disabled ? 'cursor-default opacity-80 active:scale-100' : ''}`}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}
