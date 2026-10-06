import { useState, useEffect } from 'react';
import { CloudOff, RefreshCw, CheckCircle2, ChevronUp, ChevronDown } from 'lucide-react';
import { db } from '../services/offlineDb';
import { useWorkOrderStore } from '../stores/workOrderStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function SyncStatusUI() {
  const [pendingItems, setPendingItems] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const { isSyncing, syncPendingData } = useWorkOrderStore();
  const isOnline = useOnlineStatus();

  const loadPending = async () => {
    try {
      const pending = await db.pendingSync.toArray();
      setPendingItems(pending);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadPending();
    const interval = setInterval(loadPending, 3000); // Check every 3s
    return () => clearInterval(interval);
  }, []);

  if (pendingItems.length === 0 && !isSyncing && isOnline) {
    return null; // Don't show anything if nothing is pending and we're online
  }

  const handleSync = async () => {
    if (!isOnline) {
      alert("Necesitas conexión a internet para sincronizar.");
      return;
    }
    await syncPendingData();
    loadPending();
  };

  const getTableName = (table) => {
    const names = {
      work_orders: 'Órdenes',
      checklist_items: 'Checklist',
      photos: 'Fotos',
      signatures: 'Firmas',
      extras: 'Extras'
    };
    return names[table] || table;
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50">
      {isOpen ? (
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200" onClick={() => setIsOpen(false)}>
            <div className="flex items-center gap-2">
              <CloudOff size={18} className="text-amber-500" />
              <h3 className="font-bold text-gray-800">Centro de Sincronización</h3>
            </div>
            <button className="p-1 text-gray-500 hover:bg-gray-200 rounded-lg">
              <ChevronDown size={20} />
            </button>
          </div>
          
          <div className="p-4 max-h-60 overflow-y-auto bg-white">
            {pendingItems.length === 0 ? (
              <div className="flex flex-col items-center py-4">
                <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
                <p className="text-sm text-gray-500 font-medium">Todo está sincronizado</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {pendingItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-800 capitalize">{getTableName(item.table)}</span>
                      <span className="text-xs text-gray-500">
                        {item.action === 'insert' ? 'Nuevo registro' : item.action === 'update' ? 'Actualización' : 'Eliminación'}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-gray-400">#{item.id?.toString().slice(0, 5)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={handleSync}
              disabled={isSyncing || !isOnline || pendingItems.length === 0}
              className="w-full btn-primary flex items-center justify-center gap-2 h-12"
            >
              <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? 'Sincronizando...' : !isOnline ? 'Sin Conexión' : 'Forzar Sincronización'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="ml-auto flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-full shadow-lg font-medium text-sm transition-transform active:scale-95"
        >
          <CloudOff size={16} />
          {pendingItems.length} pendientes
          <ChevronUp size={16} className="ml-1" />
        </button>
      )}
    </div>
  );
}
