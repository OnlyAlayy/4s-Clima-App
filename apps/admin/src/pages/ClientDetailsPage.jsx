import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, MapPin, Phone, Mail, FileText, Settings2, Plus, Box, DollarSign } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { EQUIPMENT_TYPE_LABELS } from '@4s-clima/shared/constants';
import CreatePlantModal from '../components/CreatePlantModal';
import CreateEquipmentModal from '../components/CreateEquipmentModal';

export default function ClientDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [client, setClient] = useState(null);
  const [plants, setPlants] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isPlantModalOpen, setIsPlantModalOpen] = useState(false);
  const [isEquipModalOpen, setIsEquipModalOpen] = useState(false);

  useEffect(() => {
    loadClientData();
  }, [id]);

  async function loadClientData() {
    setIsLoading(true);
    
    // Cargar datos del cliente
    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();
      
    setClient(clientData);

    if (clientData) {
      // Cargar Plantas
      const { data: plantsData } = await supabase
        .from('plants')
        .select('*')
        .eq('client_id', id)
        .order('name');
      
      setPlants(plantsData || []);

      if (plantsData && plantsData.length > 0) {
        const plantIds = plantsData.map(p => p.id);
        const { data: equipData } = await supabase
          .from('equipment')
          .select('*, plant:plants(name)')
          .in('plant_id', plantIds)
          .order('plant_id');
        
        setEquipment(equipData || []);
      } else {
        setEquipment([]);
      }

      // Cargar Estado de Cuenta (Trabajos Pendientes de Cobro)
      const { data: debtData } = await supabase
        .from('work_orders')
        .select('total_amount, payment_status')
        .eq('client_id', id)
        .eq('payment_status', 'pending');
        
      if (debtData) {
        const totalDebt = debtData.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
        setClient(prev => ({ ...prev, total_debt: totalDebt }));
      }

    }
    
    setIsLoading(false);
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6"></div>
        <div className="h-64 bg-white rounded-2xl animate-pulse"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-xl font-bold text-gray-900">Cliente no encontrado</h2>
        <button onClick={() => navigate('/clientes')} className="mt-4 btn-primary">Volver a Clientes</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <button 
          onClick={() => navigate('/clientes')}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{client.name}</h1>
            {client.active === false && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-xs font-semibold">Dado de baja</span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {client.cuit ? `CUIT: ${client.cuit}` : 'Sin CUIT'} 
            {client.contract_type && <span className="ml-2 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-xs uppercase font-semibold">{client.contract_type}</span>}
          </p>
        </div>
      </div>
      
      {/* Botones de acción del cliente */}
      <div className="flex justify-end gap-3 mb-6">
        <button 
          onClick={async () => {
            const newStatus = client.active === false ? true : false;
            const { data, error } = await supabase.from('clients').update({ active: newStatus }).eq('id', client.id).select();
            console.log('Update result:', data, error);
            if (error) {
              alert('Error de base de datos: ' + error.message);
            } else {
              loadClientData();
            }
          }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            client.active !== false 
              ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' 
              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
          }`}
        >
          {client.active !== false ? 'Dar de baja' : 'Reactivar cliente'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Info del cliente */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 size={18} className="text-brand-500" />
              Datos Generales
            </h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2 text-gray-600">
                <MapPin size={16} className="mt-0.5 shrink-0" />
                <span>{client.address || 'Dirección no especificada'}</span>
              </div>
              <div className="flex items-start gap-2 text-gray-600">
                <FileText size={16} className="mt-0.5 shrink-0" />
                <span>{client.contact_name || 'Sin nombre de contacto'}</span>
              </div>
              <div className="flex items-start gap-2 text-gray-600">
                <Phone size={16} className="mt-0.5 shrink-0" />
                <span>{client.contact_phone || 'Sin teléfono'}</span>
              </div>
              {client.contact_email && (
                <div className="flex items-start gap-2 text-gray-600">
                  <Mail size={16} className="mt-0.5 shrink-0" />
                  <span>{client.contact_email}</span>
                </div>
              )}
            </div>

            {client.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Notas</h3>
                <p className="text-sm text-gray-600">{client.notes}</p>
              </div>
            )}
          </div>

          {/* Estado de Cuenta */}
          <div className="card space-y-4 border-l-4 border-l-brand-500 bg-brand-50/30">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <DollarSign size={18} className="text-brand-500" />
              Estado de Cuenta
            </h2>
            <div className="space-y-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total adeudado:</p>
              <p className={`text-2xl font-bold ${client.total_debt > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                ${(client.total_debt || 0).toLocaleString('es-AR')}
              </p>
              {client.total_debt > 0 && (
                <p className="text-xs text-red-500 dark:text-red-400 font-medium">Hay trabajos pendientes de cobro.</p>
              )}
            </div>
          </div>
        </div>

        {/* Listados de Plantas y Equipos */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* PLANTAS */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <MapPin size={18} className="text-brand-500" />
                Plantas / Sucursales ({plants.length})
              </h2>
              <button onClick={() => setIsPlantModalOpen(true)} className="btn-secondary py-1.5 px-3 text-xs">
                <Plus size={14} /> Nueva Planta
              </button>
            </div>
            
            {plants.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-gray-500 text-sm">No hay plantas registradas para este cliente.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {plants.map(plant => (
                  <div key={plant.id} className="p-3 border border-gray-100 rounded-xl hover:border-brand-200 transition-colors bg-gray-50">
                    <h3 className="font-semibold text-gray-900 text-sm mb-1">{plant.name}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={10} /> {plant.address || 'Sin dirección'}</p>
                    {plant.contact_name && <p className="text-xs text-gray-500 mt-1">Ref: {plant.contact_name} ({plant.contact_phone})</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* EQUIPOS */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Settings2 size={18} className="text-brand-500" />
                Equipamiento Inventariado ({equipment.length})
              </h2>
              <button 
                onClick={() => setIsEquipModalOpen(true)} 
                className="btn-secondary py-1.5 px-3 text-xs"
                disabled={plants.length === 0}
                title={plants.length === 0 ? "Debe crear una planta primero" : ""}
              >
                <Plus size={14} /> Nuevo Equipo
              </button>
            </div>

            {equipment.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Box size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No hay equipos registrados.</p>
                {plants.length === 0 && <p className="text-xs text-gray-400 mt-1">Creá una planta primero.</p>}
              </div>
            ) : (
              <div className="table-container border-0 mt-2">
                <table>
                  <thead>
                    <tr>
                      <th>Planta</th>
                      <th>Tipo</th>
                      <th>Marca / Modelo</th>
                      <th>Capacidad</th>
                      <th>Serie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.map(eq => (
                      <tr key={eq.id}>
                        <td className="text-xs font-medium text-gray-700">{eq.plant?.name}</td>
                        <td className="text-xs text-gray-500">{EQUIPMENT_TYPE_LABELS[eq.type] || eq.type}</td>
                        <td className="text-xs text-gray-900">{eq.brand} {eq.model}</td>
                        <td className="text-xs text-gray-500">{eq.capacity_btu ? `${eq.capacity_btu} BTU` : '-'}</td>
                        <td className="text-xs text-gray-500 font-mono">{eq.serial_number || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>

      <CreatePlantModal 
        isOpen={isPlantModalOpen} 
        onClose={() => setIsPlantModalOpen(false)} 
        clientId={id}
        onCreated={loadClientData}
      />
      
      <CreateEquipmentModal 
        isOpen={isEquipModalOpen} 
        onClose={() => setIsEquipModalOpen(false)} 
        clientId={id}
        plants={plants}
        onCreated={loadClientData}
      />
    </div>
  );
}
