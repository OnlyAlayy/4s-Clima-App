import { useState, useEffect } from 'react';

/**
 * Hook que detecta si el dispositivo está online u offline.
 * Retorna un boolean reactivo que se actualiza automáticamente.
 * 
 * Además, dispara la sincronización de datos pendientes al reconectar.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Disparar sync cuando vuelve la conexión
      window.dispatchEvent(new CustomEvent('app:online'));
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
