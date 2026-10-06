import { useNavigate } from 'react-router-dom';
import { LogOut, User, Wifi, WifiOff, HardDrive, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { clearLocalDatabase, getPendingSyncCount } from '../services/offlineDb';
import { useState, useEffect } from 'react';

/**
 * Página de perfil del técnico.
 * Muestra info del usuario, estado de conexión, datos offline y logout.
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { profile, logout } = useAuthStore();
  const { syncPendingData, isSyncing } = useWorkOrderStore();
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getPendingSyncCount().then(setPendingCount);
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

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="text-lg font-bold text-slate-900">Mi Perfil</h1>
      </div>

      <div className="space-y-4 animate-slide-up">
        {/* Avatar y datos */}
        <div className="card flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
            <User size={28} className="text-slate-900" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-slate-900 font-semibold text-lg truncate">
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
          <h3 className="text-sm font-semibold text-gray-600 mb-3">Estado del Sistema</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {isOnline ? (
                  <Wifi size={16} className="text-emerald-400" />
                ) : (
                  <WifiOff size={16} className="text-red-400" />
                )}
                <span className="text-gray-500">Conexión</span>
              </div>
              <span className={`text-sm font-medium ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                {isOnline ? 'En línea' : 'Sin conexión'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <HardDrive size={16} className="text-brand-400" />
                <span className="text-gray-500">Datos pendientes</span>
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
