import { AlertTriangle, X } from 'lucide-react';

/**
 * Modal de confirmación estilizado para PWA/APK Móvil.
 * Reemplaza los window.confirm nativos para evitar el header "https://localhost dice:" en Android.
 */
export default function ConfirmModal({
  isOpen,
  title = '¿Estás seguro?',
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  confirmVariant = 'danger', // 'danger' | 'warning' | 'primary'
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const btnClasses = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20',
    primary: 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-500/20',
  }[confirmVariant] || 'bg-rose-600 hover:bg-rose-700 text-white';

  const iconClasses = {
    danger: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
    warning: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
    primary: 'bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400',
  }[confirmVariant] || 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-slate-800 space-y-4 animate-scale-up">
        <div className="flex items-start justify-between gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${iconClasses}`}>
            <AlertTriangle size={20} />
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-1 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-md ${btnClasses}`}
          >
            {isLoading ? 'Procesando...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
