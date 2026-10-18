import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ClipboardList, Check, AlertCircle, Edit2, Layers, Tag } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { EQUIPMENT_TYPES, EQUIPMENT_TYPE_LABELS } from '@4s-clima/shared/constants';

/**
 * Modal aislado para gestionar y crear plantillas de checklist dinámicas.
 * Permite a la oficina técnica diseñar formularios personalizados por tipo de equipo o genéricos.
 */
export default function ChecklistTemplatesModal({ isOpen, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [equipmentType, setEquipmentType] = useState('');
  const [sections, setSections] = useState([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [newItemNames, setNewItemNames] = useState({});

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      resetForm();
    }
  }, [isOpen]);

  async function loadTemplates() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('checklist_templates')
      .select('*')
      .order('name');

    if (!error) {
      setTemplates(data || []);
    }
    setIsLoading(false);
  }

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setEquipmentType('');
    setSections([]);
    setNewSectionName('');
    setNewItemNames({});
    setIsEditing(false);
    setError(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setIsEditing(true);
    setSections([
      { name: 'Inspección General', items: ['Verificación de estado físico', 'Revisión de conexiones'] }
    ]);
  };

  const handleStartEdit = (tpl) => {
    setEditingId(tpl.id);
    setName(tpl.name || '');
    setDescription(tpl.description || '');
    setEquipmentType(tpl.equipment_type || '');
    setSections(Array.isArray(tpl.sections) ? JSON.parse(JSON.stringify(tpl.sections)) : []);
    setIsEditing(true);
    setError(null);
  };

  const handleAddSection = () => {
    if (!newSectionName.trim()) return;
    setSections([...sections, { name: newSectionName.trim(), items: [] }]);
    setNewSectionName('');
  };

  const handleRemoveSection = (secIndex) => {
    setSections(sections.filter((_, i) => i !== secIndex));
  };

  const handleAddItem = (secIndex) => {
    const itemText = (newItemNames[secIndex] || '').trim();
    if (!itemText) return;
    const updated = [...sections];
    updated[secIndex].items.push(itemText);
    setSections(updated);
    setNewItemNames({ ...newItemNames, [secIndex]: '' });
  };

  const handleRemoveItem = (secIndex, itemIndex) => {
    const updated = [...sections];
    updated[secIndex].items = updated[secIndex].items.filter((_, i) => i !== itemIndex);
    setSections(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre de la plantilla es obligatorio.');
      return;
    }
    if (sections.length === 0 || sections.every((s) => s.items.length === 0)) {
      setError('Debes agregar al menos una categoría con ítems a inspeccionar.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      equipment_type: equipmentType || null,
      sections,
      updated_at: new Date().toISOString(),
    };

    let resultError = null;
    if (editingId) {
      const { error: updateErr } = await supabase
        .from('checklist_templates')
        .update(payload)
        .eq('id', editingId);
      resultError = updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from('checklist_templates')
        .insert(payload);
      resultError = insertErr;
    }

    setIsSubmitting(false);

    if (resultError) {
      setError(resultError.message);
    } else {
      resetForm();
      loadTemplates();
    }
  };

  const handleToggleActive = async (tpl) => {
    const { error: toggleErr } = await supabase
      .from('checklist_templates')
      .update({ active: !tpl.active, updated_at: new Date().toISOString() })
      .eq('id', tpl.id);

    if (!toggleErr) {
      loadTemplates();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up border border-transparent dark:border-slate-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
              <ClipboardList size={20} className="text-brand-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Plantillas de Checklist</h2>
              <p className="text-gray-500 dark:text-gray-400 text-xs">
                {isEditing ? 'Constructor de formulario técnico' : 'Formularios personalizados y protocolos de inspección'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isEditing ? (
            /* List View */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  {templates.length} plantillas registradas en base de datos
                </span>
                <button onClick={handleStartCreate} className="btn-primary py-2 px-3 text-xs inline-flex items-center gap-1.5">
                  <Plus size={15} /> Nueva Plantilla
                </button>
              </div>

              {isLoading ? (
                <div className="py-12 text-center text-gray-400 text-sm">Cargando plantillas...</div>
              ) : templates.length === 0 ? (
                <div className="p-12 text-center bg-gray-50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700">
                  <Layers size={36} className="text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                  <h3 className="font-semibold text-gray-700 dark:text-slate-300">No hay plantillas personalizadas</h3>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
                    El sistema utiliza actualmente las plantillas predefinidas según el tipo de equipo. Podés crear una para auditorías o trabajos especiales.
                  </p>
                  <button onClick={handleStartCreate} className="btn-primary mt-4 py-2 px-4 text-xs">
                    Crear la primera plantilla
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="p-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 hover:border-brand-200 transition-colors flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">{tpl.name}</h4>
                          <span
                            className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                              tpl.active
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-slate-400'
                            }`}
                          >
                            {tpl.active ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>
                        {tpl.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">
                            {tpl.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                          <Tag size={12} />
                          <span>
                            {tpl.equipment_type
                              ? `Aplica a: ${EQUIPMENT_TYPE_LABELS[tpl.equipment_type] || tpl.equipment_type}`
                              : 'General (Cualquier equipo)'}
                          </span>
                          <span>•</span>
                          <span>
                            {(tpl.sections || []).reduce((acc, s) => acc + (s.items?.length || 0), 0)} tareas
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                        <button
                          onClick={() => handleToggleActive(tpl)}
                          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium"
                        >
                          {tpl.active ? 'Desactivar' : 'Reactivar'}
                        </button>
                        <button
                          onClick={() => handleStartEdit(tpl)}
                          className="btn-secondary py-1 px-2.5 text-xs inline-flex items-center gap-1"
                        >
                          <Edit2 size={12} /> Modificar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Builder / Editor View */
            <form id="template-builder-form" onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Nombre de la Plantilla *
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej: Auditoría Pre-Start Up"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Tipo de Equipo Asociado (Opcional)
                  </label>
                  <select
                    className="select"
                    value={equipmentType}
                    onChange={(e) => setEquipmentType(e.target.value)}
                  >
                    <option value="">General / Para cualquier equipo</option>
                    {Object.values(EQUIPMENT_TYPES).map((t) => (
                      <option key={t} value={t}>
                        {EQUIPMENT_TYPE_LABELS[t] || t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Descripción o Instrucciones
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ej: Protocolo de verificación obligatoria para equipos de precisión"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <hr className="border-gray-100 dark:border-slate-700" />

              {/* Sections & Items Builder */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Layers size={16} className="text-brand-500" /> Categorías y Puntos de Inspección
                  </h3>
                </div>

                {/* Agregar nueva categoría */}
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    className="input"
                    placeholder="Nueva categoría (ej: Tablero Eléctrico, Serpentina, Drenajes)..."
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSection();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddSection}
                    className="btn-secondary whitespace-nowrap text-xs px-3"
                  >
                    <Plus size={14} /> Añadir Categoría
                  </button>
                </div>

                {/* Lista de categorías */}
                <div className="space-y-4">
                  {sections.map((section, sIndex) => (
                    <div
                      key={sIndex}
                      className="p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-900/40"
                    >
                      <div className="flex items-center justify-between pb-2 mb-3 border-b border-gray-200 dark:border-slate-800">
                        <span className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-brand-500" />
                          {section.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSection(sIndex)}
                          className="text-red-500 hover:text-red-700 text-xs inline-flex items-center gap-1"
                        >
                          <Trash2 size={13} /> Eliminar categoría
                        </button>
                      </div>

                      {/* Ítems de la categoría */}
                      <div className="space-y-2 mb-3 pl-2">
                        {section.items.map((item, iIndex) => (
                          <div
                            key={iIndex}
                            className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-xs text-gray-700 dark:text-gray-300"
                          >
                            <span>{item}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(sIndex, iIndex)}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Input para agregar ítem a esta sección */}
                      <div className="flex gap-2 pl-2">
                        <input
                          type="text"
                          className="input py-1 text-xs"
                          placeholder="Nuevo punto de verificación (ej: Medición de temperatura)..."
                          value={newItemNames[sIndex] || ''}
                          onChange={(e) =>
                            setNewItemNames({ ...newItemNames, [sIndex]: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddItem(sIndex);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddItem(sIndex)}
                          className="btn-primary py-1 px-3 text-xs"
                        >
                          + Ítem
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 flex justify-between items-center rounded-b-2xl">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={resetForm}
                className="btn-secondary text-xs"
                disabled={isSubmitting}
              >
                Volver a la lista
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-secondary text-xs"
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  form="template-builder-form"
                  type="submit"
                  className="btn-primary text-xs"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Crear Plantilla'}
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button type="button" onClick={onClose} className="btn-secondary text-xs">
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
