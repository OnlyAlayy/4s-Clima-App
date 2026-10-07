import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { Camera, Search, QrCode, AlertCircle, Package } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { EQUIPMENT_TYPE_LABELS } from '@4s-clima/shared/constants';

export default function ScannerPage() {
  const [mode, setMode] = useState('qr'); // 'qr' | 'manual'
  const [manualCode, setManualCode] = useState('');
  const [equipment, setEquipment] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === 'qr') {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          rememberLastUsedCamera: true
        },
        false
      );

      scanner.render(
        (decodedText) => {
          scanner.clear();
          handleSearch(decodedText);
        },
        (errorMessage) => {
          // ignore scan errors, they happen continuously
        }
      );

      return () => {
        scanner.clear().catch(e => console.error("Error clearing scanner", e));
      };
    }
  }, [mode]);

  const handleSearch = async (code) => {
    if (!code) return;
    setIsLoading(true);
    setError('');
    setEquipment(null);

    try {
      // Intentamos buscar por ID o por número de serie
      const { data, error } = await supabase
        .from('equipment')
        .select(`
          *,
          plant:plants(name, client_id),
          client:clients(name)
        `)
        .or(`id.eq.${code},serial_number.eq.${code}`)
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setError('No se encontró ningún equipo con ese código.');
        } else {
          throw error;
        }
      } else if (data) {
        setEquipment(data);
      }
    } catch (err) {
      console.error(err);
      setError('Hubo un error al buscar el equipo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    handleSearch(manualCode);
  };

  return (
    <div className="page-container h-full flex flex-col">
      <div className="page-header">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Buscar Equipo</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Escaneá el código QR o ingresá el código manual.
        </p>
      </div>

      <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl mb-6">
        <button
          onClick={() => { setMode('qr'); setEquipment(null); setError(''); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${mode === 'qr' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          <Camera size={18} />
          Escáner QR
        </button>
        <button
          onClick={() => { setMode('manual'); setEquipment(null); setError(''); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${mode === 'manual' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          <QrCode size={18} />
          Manual
        </button>
      </div>

      <div className="flex-1 flex flex-col">
        {!equipment ? (
          <>
            {mode === 'qr' && (
              <div className="flex-1 flex flex-col">
                <div id="qr-reader" className="w-full rounded-2xl overflow-hidden shadow-sm border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900"></div>
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
                  Apuntá la cámara al código QR del equipo
                </p>
              </div>
            )}

            {mode === 'manual' && (
              <form onSubmit={handleManualSubmit} className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Código de Equipo / Nro de Serie
                </label>
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Ej: EQ-12345"
                    className="input w-full pl-10 h-12"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualCode.trim() || isLoading}
                  className="btn-primary w-full h-12 mt-4"
                >
                  {isLoading ? 'Buscando...' : 'Buscar Equipo'}
                </button>
              </form>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 rounded-xl flex items-start gap-3 border border-red-100 dark:border-red-800">
                <AlertCircle size={20} className="text-red-500 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}
          </>
        ) : (
          <div className="card animate-in fade-in slide-in-from-bottom-4">
            <div className="w-12 h-12 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-full flex items-center justify-center mb-4">
              <Package size={24} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              {equipment.brand} {equipment.model}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 font-mono">{equipment.id}</p>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800">
                <span className="text-gray-500 dark:text-gray-400 text-sm">Tipo</span>
                <span className="font-medium text-gray-900 dark:text-white">{EQUIPMENT_TYPE_LABELS[equipment.type] || equipment.type}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800">
                <span className="text-gray-500 dark:text-gray-400 text-sm">N° Serie</span>
                <span className="font-medium text-gray-900 dark:text-white">{equipment.serial_number || '-'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800">
                <span className="text-gray-500 dark:text-gray-400 text-sm">Planta</span>
                <span className="font-medium text-gray-900 dark:text-white">{equipment.plant?.name || '-'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800">
                <span className="text-gray-500 dark:text-gray-400 text-sm">Ubicación</span>
                <span className="font-medium text-gray-900 dark:text-white">{equipment.location_description || '-'}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => { setEquipment(null); setManualCode(''); }}
                className="flex-1 btn-secondary"
              >
                Escanear Otro
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
