import { useEffect } from 'react';
import { useWorkOrderStore } from '../stores/workOrderStore';

/**
 * Hook que sincroniza automáticamente los datos pendientes
 * cuando el dispositivo recupera la conexión a internet.
 * 
 * Se monta una sola vez en el layout principal.
 */
export function useBackgroundSync() {
  const syncPendingData = useWorkOrderStore((s) => s.syncPendingData);
  const isSyncing = useWorkOrderStore((s) => s.isSyncing);

  useEffect(() => {
    // Sincronizar al montar (por si hay datos pendientes de la sesión anterior)
    if (navigator.onLine) {
      syncPendingData();
    }

    // Escuchar evento de reconexión
    const handleOnline = () => {
      syncPendingData();
    };

    window.addEventListener('app:online', handleOnline);
    return () => window.removeEventListener('app:online', handleOnline);
  }, [syncPendingData]);

  return { isSyncing };
}
