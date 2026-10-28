import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Wifi, WifiOff, HardDrive, RefreshCw, Sun, Moon, Bell, BellRing, BellOff, CheckCircle2, AlertTriangle, Send, MapPin, Play, Square, Clock } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '../stores/authStore';
import { useShiftStore } from '../stores/shiftStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { clearLocalDatabase, getPendingSyncCount } from '../services/offlineDb';
import { useDarkMode } from '../hooks/useDarkMode';
import hybridNotifications from '../services/hybridNotifications';
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

  // Estado de Notificaciones Híbridas (Web Push vs Android Nativo)
  const isNative = Capacitor.isNativePlatform();
  const [pushPermission, setPushPermission] = useState('prompt');
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);

  // Estado de Jornada Laboral y Rastreo GPS
  const { activeShift, todayShift, isActionLoading: isShiftActionLoading, checkIn, checkOut } = useShiftStore();

  const formatShiftTime = (isoString) => {
    if (!isoString) return '--:--';
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} hs`;
  };

  const handleCheckIn = async () => {
    if (!profile?.id) return;
    try {
      await checkIn(profile.id);
      toast.success('Jornada laboral iniciada. Rastreo GPS activo.');
    } catch (err) {
      toast.error('Error al iniciar jornada: ' + (err.message || 'Verifique permisos de ubicación'));
    }
  };

  const handleCheckOut = async () => {
    try {
      await checkOut();
      toast.success('Jornada laboral finalizada. Rastreo GPS detenido.');
    } catch (err) {
      toast.error('Error al finalizar jornada: ' + (err.message || 'Error de red'));
    }
  };

  useEffect(() => {
    getPendingSyncCount().then(setPendingCount);
    hybridNotifications.checkPermission().then((status) => {
      setPushPermission(status);
    });
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
      const res = await hybridNotifications.requestPermission(profile.id);
      setPushPermission(res.status);
      toast.success('¡Notificaciones activadas!');
    } catch (err) {
      console.error('Error al registrar notificaciones:', err);
      const current = await hybridNotifications.checkPermission();
      setPushPermission(current);
      toast.error(err.message || 'Error al solicitar permisos de notificación');
    } finally {
      setIsRegisteringPush(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTestingPush(true);
    try {
      await hybridNotifications.scheduleNotification({
        title: '4S Clima - Notificación de Prueba',
        body: '¡Sonido y vibración verificados! Tu celular está listo para recibir órdenes.',
        data: { url: '/perfil' }
      });
      toast.success('¡Notificación enviada! Deberías escuchar y sentir la vibración en tu dispositivo.');
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

        {/* Jornada Laboral y Ubicación */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                activeShift
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                <MapPin size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Jornada Laboral y Ubicación
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {activeShift ? (
                    <span>Inicio de jornada: <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{formatShiftTime(activeShift.check_in_at)}</strong></span>
                  ) : todayShift?.status === 'completed' ? (
                    <span>Jornada de hoy completada ({formatShiftTime(todayShift.check_in_at)} - {formatShiftTime(todayShift.check_out_at)})</span>
                  ) : (
                    'Rastreo GPS continuo durante tu horario de servicio'
                  )}
                </p>
              </div>
            </div>

            {activeShift ? (
              <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs flex items-center gap-1 font-semibold uppercase tracking-wide">
                <CheckCircle2 size={13} /> EN JORNADA (GPS ACTIVO)
              </span>
            ) : (
              <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs flex items-center gap-1 font-medium uppercase tracking-wide">
                FUERA DE TURNO
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {activeShift ? (
              <button
                onClick={handleCheckOut}
                disabled={isShiftActionLoading}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 transition-colors disabled:opacity-50"
              >
                {isShiftActionLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                    Finalizando...
                  </>
                ) : (
                  <>
                    <Square size={14} className="fill-current" />
                    Finalizar Jornada Laboral
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={isShiftActionLoading}
                className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
              >
                {isShiftActionLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Iniciando jornada...
                  </>
                ) : (
                  <>
                    <Play size={14} className="fill-current" />
                    Iniciar Jornada y Activar Ubicación
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Notificaciones */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400">
                <Bell size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Notificaciones
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {pushPermission === 'granted' ? 'Alertas de órdenes activadas' : 'Alertas de nuevas órdenes y cambios'}
                </p>
              </div>
            </div>

            {pushPermission === 'granted' ? (
              <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs flex items-center gap-1 font-semibold">
                <CheckCircle2 size={13} /> Activas
              </span>
            ) : pushPermission === 'denied' ? (
              <span className="badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs flex items-center gap-1 font-semibold">
                <AlertTriangle size={13} /> Bloqueadas
              </span>
            ) : (
              <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs flex items-center gap-1 font-medium">
                <BellOff size={13} /> Inactivas
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {pushPermission !== 'granted' ? (
              <button
                onClick={handleEnablePush}
                disabled={isRegisteringPush}
                className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
              >
                {isRegisteringPush ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Activando...
                  </>
                ) : (
                  <>
                    <BellRing size={15} />
                    Activar notificaciones
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleTestNotification}
                disabled={isTestingPush}
                className="btn-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200"
              >
                {isTestingPush ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    Probando...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Enviar notificación de prueba
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
