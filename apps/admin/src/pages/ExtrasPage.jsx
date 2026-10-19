import { useEffect, useState, useMemo } from 'react';
import {
  DollarSign, Check, AlertCircle, Calculator, BookOpen, Package,
  Search, Copy, CheckCheck, RefreshCw, Layers, ShieldCheck, ArrowRight
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatCurrency, formatDate } from '@4s-clima/shared/utils';
import {
  INSTALLATION_COMBOS_BY_CAPACITY,
  CATALOG_CATEGORIES,
  OFFICIAL_MATERIALS_CATALOG,
  calculateComboBudget
} from '@4s-clima/shared';

/**
 * Página de Extras, Tarifario y Cotizador Oficial ("MATERIALES INSTALACIÓN CAÑERIA - SEP 26").
 * Incluye:
 * 1. Cotizador interactivo por Frigorías (Hoja RESUMEN del Excel oficial).
 * 2. Catálogo completo de materiales e insumos oficiales (Hoja1 del Excel).
 * 3. Gestión y seguimiento de extras reportados por técnicos en órdenes de trabajo.
 */
export default function ExtrasPage() {
  const [activeTab, setActiveTab] = useState('cotizador'); // 'cotizador' | 'catalogo' | 'reportados'

  // --- Estado para Pestaña 1: Cotizador por Frigorías ---
  const [selectedCapacity, setSelectedCapacity] = useState('3000');
  const [quantities, setQuantities] = useState({
    pipeMeters: 3,
    brackets: 1,
    bracketLegs: 1,
    floorLegs: 0,
    fixingKits: 1,
    installationLabor: 1,
    uninstallation: 0,
  });
  const [copiedQuote, setCopiedQuote] = useState(false);

  // --- Estado para Pestaña 2: Catálogo de Materiales ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // --- Estado para Pestaña 3: Extras Reportados en OTs ---
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

  // Cálculo en vivo del presupuesto (Hoja RESUMEN)
  const budget = useMemo(() => {
    return calculateComboBudget(selectedCapacity, quantities);
  }, [selectedCapacity, quantities]);

  const handleQuantityChange = (key, val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setQuantities((prev) => ({ ...prev, [key]: num }));
  };

  const handleCopyBudget = () => {
    const textLines = [
      `*COTIZACIÓN OFICIAL 4S CLIMA*`,
      `*Capacidad:* ${budget.combo.label} (${budget.combo.pipeSpecs})`,
      `---------------------------------------`,
      ...budget.lines
        .filter((l) => l.quantity > 0)
        .map(
          (l) =>
            `• ${l.label}: ${l.quantity} ${l.unit} x ${formatCurrency(l.unitPrice)} = ${formatCurrency(l.totalNeto)}`
        ),
      `---------------------------------------`,
      `*Subtotal Neto:* ${formatCurrency(budget.subtotalNeto)}`,
      `*IVA (21%):* ${formatCurrency(budget.ivaAmount)}`,
      `*TOTAL FINAL:* ${formatCurrency(budget.totalConIva)}`,
    ];

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopiedQuote(true);
    setTimeout(() => setCopiedQuote(false), 2500);
  };

  // Filtrado de materiales en la Pestaña 2
  const filteredCatalog = useMemo(() => {
    return OFFICIAL_MATERIALS_CATALOG.filter((item) => {
      const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchSearch =
        searchTerm === '' ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(searchTerm.toLowerCase())));
      return matchCategory && matchSearch;
    });
  }, [searchTerm, selectedCategory]);

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
              Tarifario Oficial SEP 26
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            Catálogo de Extras y Cotizador
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Costos de instalación de cañería, insumos por metro y gestión de repuestos utilizados
          </p>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto border border-gray-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('cotizador')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all
              ${activeTab === 'cotizador'
                ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            <Calculator size={15} />
            Cotizador por Frigorías
          </button>
          <button
            onClick={() => setActiveTab('catalogo')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all
              ${activeTab === 'catalogo'
                ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            <BookOpen size={15} />
            Catálogo Oficial ({OFFICIAL_MATERIALS_CATALOG.length})
          </button>
          <button
            onClick={() => setActiveTab('reportados')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all relative
              ${activeTab === 'reportados'
                ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            <Package size={15} />
            Reportados por Técnicos
            {extras.filter((e) => !e.billed).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* PESTAÑA 1: COTIZADOR POR FRIGORÍAS (HOJA RESUMEN EXCEL)  */}
      {/* ======================================================== */}
      {activeTab === 'cotizador' && (
        <div className="space-y-6 animate-fade-in">
          {/* Selector de Capacidad */}
          <div className="card p-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
              Seleccionar Capacidad del Equipo (Frigorías / Hora)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {Object.entries(INSTALLATION_COMBOS_BY_CAPACITY).map(([key, combo]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedCapacity(key)}
                  className={`p-3 rounded-xl border text-left transition-all relative
                    ${selectedCapacity === key
                      ? 'bg-brand-50/80 dark:bg-brand-950/40 border-brand-500 ring-2 ring-brand-500/20 text-brand-900 dark:text-brand-200 shadow-sm font-bold'
                      : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-gray-300 hover:border-brand-300'
                    }`}
                >
                  <span className="text-sm block">{combo.label}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono block mt-0.5">
                    {combo.pipeSpecs}
                  </span>
                  {selectedCapacity === key && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tarjetas KPI de Resumen Económico */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800/80 border-slate-200 dark:border-slate-700">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Subtotal Neto (PRECIO + IVA)
              </span>
              <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                {formatCurrency(budget.subtotalNeto)}
              </p>
              <span className="text-[11px] text-gray-400">Base imponible sin impuestos</span>
            </div>

            <div className="card p-5 bg-gradient-to-br from-indigo-50/40 to-white dark:from-indigo-950/20 dark:to-slate-800/80 border-indigo-200/60 dark:border-indigo-900/40">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                IVA (21% Factura A)
              </span>
              <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {formatCurrency(budget.ivaAmount)}
              </p>
              <span className="text-[11px] text-indigo-500/70">Alícuota general de servicios</span>
            </div>

            <div className="card p-5 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-800/80 border-emerald-300 dark:border-emerald-800/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Total Final con IVA
                </span>
                <button
                  type="button"
                  onClick={handleCopyBudget}
                  className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 font-bold flex items-center gap-1 transition-all"
                  title="Copiar desglose"
                >
                  {copiedQuote ? <CheckCheck size={13} /> : <Copy size={13} />}
                  {copiedQuote ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                {formatCurrency(budget.totalConIva)}
              </p>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
                Monto facturable al cliente
              </span>
            </div>
          </div>

          {/* Tabla Interactiva de Cálculo */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">
                  Desglose de Materiales e Instalación — {budget.combo.label}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ajustá las cantidades necesarias para recalcular en tiempo real
                </p>
              </div>
              <div className="text-xs font-semibold px-3 py-1 rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                Cañería sugerida: {budget.combo.pipeSpecs}
              </div>
            </div>

            <div className="table-container border-0">
              <table>
                <thead>
                  <tr>
                    <th>Ítem / Material de Instalación</th>
                    <th>Unidad</th>
                    <th className="w-28 text-center">Cantidad</th>
                    <th className="text-right">Precio Unit. (Neto)</th>
                    <th className="text-right">Subtotal Neto</th>
                    <th className="text-right text-emerald-600 dark:text-emerald-400 font-bold">Total c/IVA (x1.21)</th>
                  </tr>
                </thead>
                <tbody>
                  {budget.lines.map((line) => {
                    const quantityMapKey = {
                      pipeMeter: 'pipeMeters',
                      bracket: 'brackets',
                      bracketLegs: 'bracketLegs',
                      floorLegs: 'floorLegs',
                      fixingKit: 'fixingKits',
                      installationLabor: 'installationLabor',
                      uninstallationLabor: 'uninstallation',
                    }[line.key];

                    return (
                      <tr key={line.key} className={line.quantity > 0 ? 'bg-brand-50/20 dark:bg-brand-950/10' : ''}>
                        <td className="font-medium text-gray-900 dark:text-white">
                          {line.label}
                        </td>
                        <td className="text-gray-500 text-xs uppercase font-mono">
                          {line.unit}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step={line.unit === 'metro' ? '0.5' : '1'}
                            value={quantities[quantityMapKey] ?? ''}
                            onChange={(e) => handleQuantityChange(quantityMapKey, e.target.value)}
                            className="w-24 px-2 py-1.5 text-center text-sm font-bold bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-gray-900 dark:text-white"
                          />
                        </td>
                        <td className="text-right text-sm text-gray-600 dark:text-gray-300 font-mono">
                          {formatCurrency(line.unitPrice)}
                        </td>
                        <td className="text-right text-sm font-semibold text-gray-900 dark:text-white font-mono">
                          {formatCurrency(line.totalNeto)}
                        </td>
                        <td className="text-right text-sm font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                          {formatCurrency(line.totalIva)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-slate-800/80 font-bold text-sm">
                    <td colSpan="4" className="text-right text-gray-700 dark:text-gray-300">
                      TOTALES GENERALES:
                    </td>
                    <td className="text-right text-gray-900 dark:text-white font-mono">
                      {formatCurrency(budget.subtotalNeto)}
                    </td>
                    <td className="text-right text-emerald-600 dark:text-emerald-400 font-mono text-base font-black">
                      {formatCurrency(budget.totalConIva)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 2: CATÁLOGO OFICIAL DE MATERIALES (HOJA1 EXCEL)  */}
      {/* ======================================================== */}
      {activeTab === 'catalogo' && (
        <div className="space-y-4 animate-fade-in">
          {/* Filtros y Búsqueda */}
          <div className="card p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por caño, aislación, medida..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-9 text-sm"
              />
            </div>

            <div className="flex gap-2 flex-wrap w-full md:w-auto">
              <select
                className="select text-xs"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">Todas las Categorías ({OFFICIAL_MATERIALS_CATALOG.length})</option>
                {Object.values(CATALOG_CATEGORIES).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabla de Catálogo */}
          <div className="card p-0 overflow-hidden">
            <div className="table-container border-0">
              <table>
                <thead>
                  <tr>
                    <th>Material / Insumo</th>
                    <th>Categoría</th>
                    <th>Unidad</th>
                    <th className="text-right">Precio Neto (+ IVA)</th>
                    <th className="text-right text-emerald-600 dark:text-emerald-400 font-bold">Precio Final c/IVA (21%)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-8 text-gray-400">
                        No se encontraron materiales que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredCatalog.map((item) => {
                      const finalWithIva = Number((item.netPrice * 1.21).toFixed(2));
                      return (
                        <tr key={item.id}>
                          <td className="font-semibold text-gray-900 dark:text-white">
                            {item.name}
                          </td>
                          <td>
                            <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px]">
                              {item.category}
                            </span>
                          </td>
                          <td className="text-gray-500 font-mono text-xs uppercase">
                            {item.unit}
                          </td>
                          <td className="text-right font-mono text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(item.netPrice)}
                          </td>
                          <td className="text-right font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(finalWithIva)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 3: REPORTADOS POR TÉCNICOS EN LA CALLE           */}
      {/* ======================================================== */}
      {activeTab === 'reportados' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Adicionales y Repuestos de Órdenes
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Materiales cargados desde la PWA por los técnicos en campo
              </p>
            </div>
            {filter === 'unbilled' && extras.some((e) => !e.billed) && (
              <button onClick={markAllAsBilled} className="btn-primary text-xs">
                <Check size={14} />
                Marcar todos como facturados
              </button>
            )}
          </div>

          {/* Banner de alerta si hay fugas sin facturar */}
          {totalUnbilled > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={20} className="text-red-500 dark:text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-red-800 dark:text-red-300">
                  {formatCurrency(totalUnbilled)} en extras sin facturar
                </p>
                <p className="text-red-600 dark:text-red-400/80 text-sm">
                  Facturá estos adicionales antes de que queden en el olvido.
                </p>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="flex gap-2">
            {[
              { value: 'unbilled', label: 'Sin Facturar', color: 'red' },
              { value: 'billed', label: 'Facturados', color: 'emerald' },
              { value: 'all', label: 'Todos', color: 'gray' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all
                  ${filter === value
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tabla de extras reportados */}
          <div className="card p-0">
            {isLoading ? (
              <div className="p-8 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : extras.length === 0 ? (
              <div className="p-12 text-center">
                <DollarSign size={40} className="text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-gray-400 dark:text-slate-500 text-sm">No hay extras registrados con este filtro.</p>
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
                      <th>P. Unit. (Neto)</th>
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
                          className={!extra.billed ? 'bg-red-50/50 dark:bg-red-900/10' : ''}
                        >
                          <td className="font-medium text-gray-900 dark:text-white">
                            {extra.description}
                          </td>
                          <td className="font-mono text-xs text-gray-500 dark:text-gray-400">
                            {extra.work_order?.order_number || '-'}
                          </td>
                          <td className="text-gray-600 dark:text-gray-300 text-sm">
                            {extra.work_order?.client?.name || '-'}
                          </td>
                          <td className="text-gray-600 dark:text-gray-300 text-sm">
                            {extra.work_order?.assigned?.name || '-'}
                          </td>
                          <td className="text-gray-900 dark:text-white font-medium">
                            {extra.quantity} {extra.unit}
                          </td>
                          <td className="text-gray-600 dark:text-gray-300 text-sm font-mono">
                            {formatCurrency(extra.unit_price)}
                          </td>
                          <td className="font-semibold text-gray-900 dark:text-white font-mono">
                            {formatCurrency(total)}
                          </td>
                          <td>
                            {extra.billed ? (
                              <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                Facturado
                              </span>
                            ) : (
                              <span className="badge bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
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
      )}
    </div>
  );
}
