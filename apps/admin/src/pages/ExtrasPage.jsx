import { useEffect, useState } from 'react';
import { DollarSign, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatCurrency, formatDate } from '@4s-clima/shared/utils';

/**
 * Página de Extras / Adicionales.
 * "Fuga de dinero" — muestra repuestos y materiales usados por técnicos
 * que aún no fueron facturados al cliente.
 * Los extras sin facturar se muestran en ROJO para acción inmediata.
 */
export default function ExtrasPage() {
  const [extras, setExtras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('unbilled'); // 'all' | 'unbilled' | 'billed'

  useEffect(() => {
    loadExtras();
  }, [filter]);

  async function loadExtras() {
    setIsLoading(true);
    let query = supabase
      .from('extras')
      .select(`
        *,
        work_order:work_orders(
          order_number,
          client:clients(name),
          assigned:users!work_orders_assigned_to_fkey(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (filter === 'unbilled') {
      query = query.eq('billed', false);
    } else if (filter === 'billed') {
      query = query.eq('billed', true);
    }

    const { data, error } = await query;
    if (!error) setExtras(data || []);
    setIsLoading(false);
  }

  async function markAsBilled(extraId) {
    const { error } = await supabase
      .from('extras')
      .update({ billed: true })
      .eq('id', extraId);

    if (!error) {
      setExtras((prev) =>
        prev.map((e) => (e.id === extraId ? { ...e, billed: true } : e))
      );
    }
  }

  async function markAllAsBilled() {
    const unbilledIds = extras.filter((e) => !e.billed).map((e) => e.id);
    if (unbilledIds.length === 0) return;

    if (!window.confirm(`¿Marcar ${unbilledIds.length} extras como facturados?`)) return;

    const { error } = await supabase
      .from('extras')
      .update({ billed: true })
      .in('id', unbilledIds);

    if (!error) {
      setExtras((prev) => prev.map((e) => ({ ...e, billed: true })));
    }
  }

  const totalUnbilled = extras
    .filter((e) => !e.billed)
    .reduce((sum, e) => sum + (e.quantity || 0) * (e.unit_price || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Adicionales</h1>
          <p className="text-gray-500 text-sm mt-1">
            Repuestos y materiales extra utilizados por los técnicos
          </p>
        </div>
        {filter === 'unbilled' && extras.some((e) => !e.billed) && (
          <button onClick={markAllAsBilled} className="btn-primary">
            <Check size={16} />
            Marcar todos como facturados
          </button>
        )}
      </div>

      {/* Banner de alerta */}
      {totalUnbilled > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={20} className="text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-red-800">
              {formatCurrency(totalUnbilled)} en extras sin facturar
            </p>
            <p className="text-red-600 text-sm">
              Facturá estos adicionales antes de que queden en el olvido.
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {[
          { value: 'unbilled', label: 'Sin Facturar', color: 'red' },
          { value: 'billed', label: 'Facturados', color: 'emerald' },
          { value: 'all', label: 'Todos', color: 'gray' },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${filter === value
                ? 'bg-brand-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="card p-0">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : extras.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">No hay extras registrados.</p>
          </div>
        ) : (
          <div className="table-container border-0">
            <table>
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th>N° Orden</th>
                  <th>Cliente</th>
                  <th>Técnico</th>
                  <th>Cant.</th>
                  <th>P. Unit.</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {extras.map((extra) => {
                  const total = (extra.quantity || 0) * (extra.unit_price || 0);
                  return (
                    <tr
                      key={extra.id}
                      className={!extra.billed ? 'bg-red-50/50' : ''}
                    >
                      <td className="font-medium text-gray-900">
                        {extra.description}
                      </td>
                      <td className="font-mono text-xs text-gray-500">
                        {extra.work_order?.order_number || '-'}
                      </td>
                      <td className="text-gray-600 text-sm">
                        {extra.work_order?.client?.name || '-'}
                      </td>
                      <td className="text-gray-600 text-sm">
                        {extra.work_order?.assigned?.name || '-'}
                      </td>
                      <td className="text-gray-900 font-medium">
                        {extra.quantity} {extra.unit}
                      </td>
                      <td className="text-gray-600 text-sm">
                        {formatCurrency(extra.unit_price)}
                      </td>
                      <td className="font-semibold text-gray-900">
                        {formatCurrency(total)}
                      </td>
                      <td>
                        {extra.billed ? (
                          <span className="badge bg-emerald-100 text-emerald-700">
                            Facturado
                          </span>
                        ) : (
                          <span className="badge bg-red-100 text-red-700">
                            Sin facturar
                          </span>
                        )}
                      </td>
                      <td>
                        {!extra.billed && (
                          <button
                            onClick={() => markAsBilled(extra.id)}
                            className="btn-success text-xs px-3 py-1.5"
                          >
                            <Check size={14} />
                            Facturar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
