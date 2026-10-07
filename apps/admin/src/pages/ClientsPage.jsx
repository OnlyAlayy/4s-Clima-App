import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, Phone, MapPin, Archive, ArchiveRestore } from 'lucide-react';
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

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 12; // Múltiplo de 1, 2, 3 y 4 para la grid

  useEffect(() => {
    setPage(1);
    loadClients(1);
  }, [search]);

  useEffect(() => {
    if (page > 1) {
      loadClients(page);
    }
  }, [page]);

  async function loadClients(pageNumber = 1) {
    setIsLoading(true);
    
    let query = supabase
      .from('clients')
      .select('*, plants(id)', { count: 'exact' })
      .order('name');

    if (search) {
      query = query.or(`name.ilike.%${search}%,cuit.ilike.%${search}%,address.ilike.%${search}%`);
    }

    const from = (pageNumber - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (!error) {
      setClients(data || []);
      if (count !== null) setTotalCount(count);
    }
    setIsLoading(false);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleToggleActive = async (client) => {
    const isActivating = client.active === false;
    const action = isActivating ? 'reactivar' : 'dar de baja';
    if (!confirm(`¿Estás seguro de que querés ${action} a ${client.name}?`)) return;
    
    await supabase.from('clients').update({ active: isActivating }).eq('id', client.id);
    loadClients(page);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">{totalCount} clientes registrados</p>
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
      ) : clients.length === 0 ? (
        <div className="text-center py-16 card">
          <Building2 size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No se encontraron clientes.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
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
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                  {client.name}
                  {client.active === false && (
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold uppercase">Baja</span>
                  )}
                </h3>
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
                <div className="mt-4 pt-3 border-t border-gray-50 flex justify-between items-center h-8">
                  <div>
                    {client.contract_type && (
                      <span className="badge bg-emerald-50 text-emerald-700">
                        {client.contract_type}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleActive(client);
                    }}
                    className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium ${
                      client.active !== false
                        ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                        : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                    }`}
                    title={client.active !== false ? "Dar de baja" : "Reactivar"}
                  >
                    {client.active !== false ? (
                      <>
                        <Archive size={14} /> 
                        <span className="sr-only">Baja</span>
                      </>
                    ) : (
                      <>
                        <ArchiveRestore size={14} />
                        <span className="sr-only">Activar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Controles de Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount}
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <button 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <CreateClientModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onCreated={() => {
          loadClients(page);
        }} 
      />
    </div>
  );
}
