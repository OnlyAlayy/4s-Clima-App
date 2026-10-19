import { useNavigate } from 'react-router-dom';
import { LogOut, User, Wifi, WifiOff, HardDrive, RefreshCw, Sun, Moon, Bell, BellRing, BellOff, CheckCircle2, AlertTriangle, Send } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { clearLocalDatabase, getPendingSyncCount } from '../services/offlineDb';
import { useDarkMode } from '../hooks/useDarkMode';
import { registerPushSubscription } from '../hooks/useRealtimeNotifications';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

/**
 * Página de perfil del técnico.
 * Muestra info del usuario, estado de conexión, datos offline y logout.
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { profile, logout } = useAuthStore();
  const { syncPendingData, isSyncing } = useWorkOrderStore();
  const isOnline = useOnlineStatus();
  const { isDark, toggleDarkMode } = useDarkMode();
  const [pendingCount, setPendingCount] = useState(0);

  // Estado de Web Push
  const [pushPermission, setPushPermission] = useState(() => {
    return 'Notification' in window ? Notification.permission : 'denied';
  });
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);

  useEffect(() => {
    getPendingSyncCount().then(setPendingCount);
    if ('Notification' in window) {
      setPushPermission(Notification.permission);
    }
  }, [isSyncing]);

  const handleLogout = async () => {
    try {
      await clearLocalDatabase();
    } catch (error) {
      console.warn('No se pudo limpiar la DB local:', error);
    } finally {
      await logout();
      navigate('/login', { replace: true });
    }
  };

  const handleSync = async () => {
    await syncPendingData();
    const count = await getPendingSyncCount();
    setPendingCount(count);
  };

  const handleEnablePush = async () => {
    if (!profile?.id) return;
    setIsRegisteringPush(true);
    try {
      await registerPushSubscription(profile.id);
      setPushPermission(Notification.permission);
      toast.success('¡Dispositivo vinculado con éxito para recibir alertas push!');
    } catch (err) {
      console.error('Error al registrar push:', err);
      setPushPermission('Notification' in window ? Notification.permission : 'denied');
      toast.error(err.message || 'Error al solicitar permisos de notificación');
    } finally {
      setIsRegisteringPush(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTestingPush(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification('4S Clima - Notificación de Prueba', {
          body: '¡Sonido y vibración verificados! Tu celular está listo para recibir órdenes.',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          vibrate: [200, 100, 200, 100, 200],
          data: '/perfil'
        });
        toast.success('¡Notificación enviada! Deberías escuchar y sentir la vibración en tu dispositivo.');
      } else {
        toast.error('Service Worker no disponible en este navegador');
      }
    } catch (err) {
      console.error('Error en prueba local:', err);
      toast.error('Error al disparar prueba: ' + err.message);
    } finally {
      setIsTestingPush(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Mi Perfil</h1>
      </div>

      <div className="space-y-4 animate-slide-up">
        {/* Avatar y datos */}
        <div className="card flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
            <User size={28} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-slate-900 dark:text-white font-semibold text-lg truncate">
              {profile?.name || 'Técnico'}
            </h2>
            <p className="text-gray-500 text-sm truncate">{profile?.email || ''}</p>
            {profile?.phone && (
              <p className="text-gray-500 text-xs">{profile.phone}</p>
            )}
          </div>
        </div>

        {/* Estado de conexión */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Estado del Sistema</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {isOnline ? (
                  <Wifi size={16} className="text-emerald-400 dark:text-emerald-500" />
                ) : (
                  <WifiOff size={16} className="text-red-400 dark:text-red-500" />
                )}
                <span className="text-gray-500 dark:text-gray-300">Conexión</span>
              </div>
              <span className={`text-sm font-medium ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                {isOnline ? 'En línea' : 'Sin conexión'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <HardDrive size={16} className="text-brand-400 dark:text-brand-500" />
                <span className="text-gray-500 dark:text-gray-300">Datos pendientes</span>
              </div>
              <span className={`text-sm font-medium ${pendingCount > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                {pendingCount} {pendingCount === 1 ? 'operación' : 'operaciones'}
              </span>
            </div>
          </div>

          {/* Botón sincronizar */}
          {pendingCount > 0 && isOnline && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="btn-secondary w-full mt-4 text-sm py-3"
            >
              {isSyncing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Sincronizar ahora
                </>
              )}
            </button>
          )}
        </div>

        {/* Apariencia */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Apariencia</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {isDark ? (
                <Moon size={16} className="text-brand-500" />
              ) : (
                <Sun size={16} className="text-amber-500" />
              )}
              <span className="text-gray-600 dark:text-gray-300">Modo Oscuro</span>
            </div>
            
            <button
              onClick={toggleDarkMode}
              className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out flex ${isDark ? 'bg-brand-500 justify-end' : 'bg-gray-200 justify-start'}`}
            >
              <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
            </button>
          </div>
        </div>

        {/* Notificaciones Push en este Dispositivo */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <Bell size={16} className="text-brand-500" /> Notificaciones Push
            </h3>
            {pushPermission === 'granted' ? (
              <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs flex items-center gap-1">
                <CheckCircle2 size={12} /> Activas y Suscriptas
              </span>
            ) : pushPermission === 'denied' ? (
              <span className="badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs flex items-center gap-1">
                <AlertTriangle size={12} /> Bloqueadas
              </span>
            ) : (
              <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs flex items-center gap-1">
                <BellOff size={12} /> Sin Activar
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
            Permite que el sistema te alerte con sonido y vibración en este celular cuando te asignen una orden de trabajo, incluso si la app está cerrada o la pantalla bloqueada.
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleEnablePush}
              disabled={isRegisteringPush}
              className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
            >
              {isRegisteringPush ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Vinculando dispositivo...
                </>
              ) : (
                <>
                  <BellRing size={15} />
                  {pushPermission === 'granted' ? 'Re-vincular / Actualizar este Celular' : 'Activar / Vincular este Celular'}
                </>
              )}
            </button>

            {pushPermission === 'granted' && (
              <button
                onClick={handleTestNotification}
                disabled={isTestingPush}
                className="btn-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200"
              >
                {isTestingPush ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    Enviando prueba...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Enviar Notificación de Prueba (Sonido / Vibración)
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Cerrar sesión */}
        <button
          onClick={handleLogout}
          className="btn-danger w-full"
        >
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>

      {/* Versión */}
      <p className="text-center text-gray-700 text-xs mt-8">
        4S Clima — Técnico v1.0.0
      </p>
    </div>
  );
}
