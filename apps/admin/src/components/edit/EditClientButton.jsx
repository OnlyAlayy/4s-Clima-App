import { useState, useEffect } from 'react';
import { X, Building2, Pencil } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';

/**
 * Componente autocontenido para editar clientes.
 * Encapsula el botón disparador (trigger) y su propio modal.
 */
export default function EditClientButton({
  client,
  onSuccess,
  variant = 'button', // 'button' | 'icon'
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [cuit, setCuit] = useState('');
  const [address, setAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contractType, setContractType] = useState('eventual');
  const [notes, setNotes] = useState('');

  // Pre-cargar valores actuales al abrir
  useEffect(() => {
    if (isOpen && client) {
      setName(client.name || '');
      setCuit(client.cuit || '');
      setAddress(client.address || '');
      setContactName(client.contact_name || '');
      setContactPhone(client.contact_phone || '');
      setContactEmail(client.contact_email || '');
      setContractType(client.contract_type || 'eventual');
      setNotes(client.notes || '');
      setError(null);
    }
  }, [isOpen, client]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre o razón social es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('clients')
      .update({
        name: name.trim(),
        cuit: cuit.trim() || null,
        address: address.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        contract_type: contractType,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id);

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
          title="Editar Cliente"
          aria-label="Editar Cliente"
        >
          <Pencil size={15} />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className={`px-3 py-2 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 transition-colors inline-flex items-center gap-1.5 border border-gray-200 dark:border-slate-600 ${className}`}
        >
          <Pencil size={14} />
          <span>Editar Cliente</span>
        </button>
      )}

      {/* Modal Encapsulado */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => !isSubmitting && setIsOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up border border-transparent dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                <Building2 size={20} className="text-brand-500" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Editar Cliente</h2>
                <p className="text-gray-500 dark:text-gray-400 text-xs">
                  Modificar datos fiscales y de contacto de {client?.name}
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
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <form id={`edit-client-form-${client?.id}`} onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Nombre / Razón Social *
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: Sanatorio Mater Dei"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      CUIT (Opcional)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: 30-12345678-9"
                      value={cuit}
                      onChange={(e) => setCuit(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Dirección Legal / Fiscal
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej: Av. Santa Fe 1234, CABA"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                <hr className="border-gray-100 dark:border-slate-700" />
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                  Contacto Principal
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Nombre
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej: Carlos"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      className="input"
                      placeholder="Ej: 11-1234-5678"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      className="input"
                      placeholder="contacto@empresa.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>
                </div>

                <hr className="border-gray-100 dark:border-slate-700" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tipo de Contrato
                    </label>
                    <select
                      className="select"
                      value={contractType}
                      onChange={(e) => setContractType(e.target.value)}
                    >
                      <option value="eventual">Eventual (Por llamado)</option>
                      <option value="mensual">Abono Mensual</option>
                      <option value="trimestral">Abono Trimestral</option>
                      <option value="anual">Abono Anual</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notas Administrativas
                  </label>
                  <textarea
                    className="input min-h-[80px] resize-y"
                    placeholder="Condiciones de pago especiales, etc..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 flex justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn-secondary"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                form={`edit-client-form-${client?.id}`}
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
