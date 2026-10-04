import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, Phone, MapPin } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import CreateClientModal from '../components/CreateClientModal';

/**
 * Página de gestión de clientes.
 * CRUD básico de clientes con búsqueda.
 */
export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*, plants(id)')
      .order('name');

    if (!error) setClients(data || []);
    setIsLoading(false);
  }

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(s) ||
      c.cuit?.includes(s) ||
      c.address?.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} clientes registrados</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary"
        >
          <Plus size={18} />
          Nuevo Cliente
        </button>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-md mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, CUIT o dirección..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Grid de clientes */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-white rounded-2xl animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No se encontraron clientes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <div 
              key={client.id} 
              className="card-hover cursor-pointer"
              onClick={() => navigate(`/clientes/${client.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-brand-500" />
                </div>
                <span className="badge bg-gray-100 text-gray-600">
                  {client.plants?.length || 0} plantas
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{client.name}</h3>
              {client.cuit && (
                <p className="text-xs text-gray-500 mb-2">CUIT: {client.cuit}</p>
              )}
              {client.address && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <MapPin size={12} />
                  <span className="truncate">{client.address}</span>
                </div>
              )}
              {client.contact_phone && (
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                  <Phone size={12} />
                  <span>{client.contact_name}: {client.contact_phone}</span>
                </div>
              )}
              {client.contract_type && (
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <span className="badge bg-emerald-50 text-emerald-700">
                    {client.contract_type}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CreateClientModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onCreated={() => {
          loadClients(); // Recargar la lista
        }} 
      />
    </div>
  );
}
