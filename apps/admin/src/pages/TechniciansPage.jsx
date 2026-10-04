import { useEffect, useState } from 'react';
import { Users, Phone, Mail, Wrench, Plus, KeyRound, Power, PowerOff } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import CreateTechnicianModal from '../components/CreateTechnicianModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { useAdminAuth } from '../App';

/**
 * Página de gestión de técnicos.
 * Muestra los técnicos activos con info de contacto y OTs asignadas.
 */
export default function TechniciansPage() {
  const { profile } = useAdminAuth();
  const isOwner = profile?.role === 'owner';

  const [technicians, setTechnicians] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState(null);

  useEffect(() => {
    loadTechnicians();
  }, []);

  async function loadTechnicians() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'tecnico')
      .order('name');

    if (!error) {
      // Cargar conteo de OTs para cada técnico
      const withStats = await Promise.all(
        (data || []).map(async (tech) => {
          const { count: activeOrders } = await supabase
            .from('work_orders')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', tech.id)
            .in('status', ['pending', 'in_progress']);

          const { count: completedOrders } = await supabase
            .from('work_orders')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', tech.id)
            .eq('status', 'completed');

          return {
            ...tech,
            activeOrders: activeOrders || 0,
            completedOrders: completedOrders || 0,
          };
        })
      );

      setTechnicians(withStats);
    }
    setIsLoading(false);
  }

  const toggleActiveStatus = async (tech) => {
    if (!isOwner) return;
    const newStatus = !tech.active;
    if (window.confirm(`¿Estás seguro de que querés ${newStatus ? 'activar' : 'desactivar'} a ${tech.name}?`)) {
      const { error } = await supabase
        .from('users')
        .update({ active: newStatus })
        .eq('id', tech.id);
      
      if (!error) {
        loadTechnicians();
      } else {
        alert('Error al cambiar el estado: ' + error.message);
      }
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Técnicos</h1>
          <p className="text-gray-500 text-sm mt-1">{technicians.length} técnicos registrados</p>
        </div>
        {isOwner && (
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="btn-primary"
          >
            <Plus size={18} />
            Nuevo Técnico
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 bg-white rounded-2xl animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : technicians.length === 0 ? (
        <div className="text-center py-16">
          <Users size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No hay técnicos registrados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {technicians.map((tech) => (
            <div key={tech.id} className={`card ${!tech.active ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${tech.active ? 'bg-gradient-to-br from-brand-500 to-brand-700' : 'bg-gray-300'}`}>
                  <span className="text-white font-bold text-lg">
                    {tech.name?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{tech.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${tech.active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    <span className="text-xs text-gray-500">
                      {tech.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contacto */}
              <div className="space-y-1.5 mb-4">
                {tech.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Mail size={12} />
                    <span className="truncate">{tech.email}</span>
                  </div>
                )}
                {tech.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Phone size={12} />
                    <span>{tech.phone}</span>
                  </div>
                )}
              </div>

              {/* Stats & Actions */}
              <div className="pt-3 border-t border-gray-100 flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex items-center gap-1.5 text-sm flex-1">
                    <Wrench size={14} className="text-amber-500" />
                    <span className="font-semibold text-gray-900">{tech.activeOrders}</span>
                    <span className="text-xs text-gray-500">activas</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm flex-1">
                    <Wrench size={14} className="text-emerald-500" />
                    <span className="font-semibold text-gray-900">{tech.completedOrders}</span>
                    <span className="text-xs text-gray-500">listas</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setPasswordModalUser(tech)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-medium rounded-lg transition-colors border border-gray-200"
                  >
                    <KeyRound size={14} />
                    Cambiar Clave
                  </button>
                  
                  {isOwner && (
                    <button 
                      onClick={() => toggleActiveStatus(tech)}
                      className={`flex-none p-1.5 rounded-lg border transition-colors ${tech.active ? 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200'}`}
                      title={tech.active ? "Desactivar técnico" : "Activar técnico"}
                    >
                      {tech.active ? <PowerOff size={16} /> : <Power size={16} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateTechnicianModal 
        isOpen={isCreateModalOpen} 
        isOwner={isOwner}
        onClose={() => setIsCreateModalOpen(false)} 
        onCreated={() => {
          loadTechnicians();
        }} 
      />

      <ChangePasswordModal
        isOpen={!!passwordModalUser}
        user={passwordModalUser}
        onClose={() => setPasswordModalUser(null)}
      />
    </div>
  );
}
