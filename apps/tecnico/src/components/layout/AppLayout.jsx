import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useBackgroundSync } from '../../hooks/useBackgroundSync';
import BottomNav from './BottomNav';

/**
 * Layout principal de la app del técnico.
 * Contiene la barra de navegación inferior y el outlet de las rutas.
 * Inicializa la auth y el sync en segundo plano.
 */
export default function AppLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const { isSyncing } = useBackgroundSync();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="min-h-screen bg-surface-dark relative">
      {/* Indicador de sincronización */}
      {isSyncing && (
        <div className="fixed top-0 left-0 right-0 z-[90] h-1 bg-brand-900">
          <div className="h-full bg-brand-500 animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Contenido de la página activa */}
      <main className="pb-20">
        <Outlet />
      </main>

      {/* Navegación inferior fija */}
      <BottomNav />
    </div>
  );
}
