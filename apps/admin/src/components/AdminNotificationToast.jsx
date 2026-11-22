import { useNavigate } from 'react-router-dom';
import { MessageSquare, ClipboardList, Clock, ArrowRight, X } from 'lucide-react';

/**
 * Componente Toast no invasivo para notificaciones en vivo en el panel admin.
 * Diseñado para PC de escritorio: posicionado arriba a la derecha, con estilo glassmorphism dark/light.
 */
export default function AdminNotificationToast({ toast, onDismiss }) {
  const navigate = useNavigate();
  if (!toast) return null;

  const getIcon = () => {
    switch (toast.type) {
      case 'lead':
        return <MessageSquare size={18} className="text-amber-500" />;
      case 'order':
        return <ClipboardList size={18} className="text-blue-500" />;
      case 'attendance':
        return <Clock size={18} className="text-rose-500" />;
      default:
        return <MessageSquare size={18} className="text-brand-500" />;
    }
  };

  const getIconBg = () => {
    switch (toast.type) {
      case 'lead':
        return 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/80';
      case 'order':
        return 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/80';
      case 'attendance':
        return 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/80';
      default:
        return 'bg-brand-50 dark:bg-brand-950/60 border-brand-200 dark:border-brand-800/80';
    }
  };

  const handleAction = () => {
    if (toast.link) {
      navigate(toast.link);
    }
    onDismiss();
  };

  return (
    <div
      role="alert"
      className="fixed top-5 right-5 z-50 max-w-sm w-full animate-slide-in select-none shadow-2xl"
    >
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-4 border border-gray-200/90 dark:border-slate-800 flex items-start gap-3 transition-all hover:border-brand-500/50">
        <div className={`p-2 rounded-xl border shrink-0 ${getIconBg()}`}>
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center justify-between gap-1">
            <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
              {toast.title}
            </h4>
            <span className="text-[10px] text-gray-400 font-mono">Ahora</span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
            {toast.message}
          </p>

          {toast.link && (
            <button
              type="button"
              onClick={handleAction}
              className="mt-2 text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 group cursor-pointer"
            >
              <span>Ver en el sistema</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg transition-colors shrink-0 cursor-pointer"
          title="Cerrar notificación"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
