import { useEffect, useState, useMemo } from 'react';
import {
  DollarSign, Check, AlertCircle, Calculator, BookOpen, Package,
  Search, Copy, CheckCheck, RefreshCw, Layers, ShieldCheck, ArrowRight,
  Sliders, Save, RotateCcw, Wrench, Lock
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { formatCurrency, formatDate } from '@4s-clima/shared/utils';
import { useAdminAuth } from '../App';
import {
  INSTALLATION_COMBOS_BY_CAPACITY,
  CATALOG_CATEGORIES,
  OFFICIAL_MATERIALS_CATALOG,
  DEFAULT_PRICING_PARAMETERS,
  buildCombosByCapacity,
  buildMaterialsCatalog,
  calculateCopperPipePrice,
  calculateArmoredPipePrice,
  calculateLaborPrice,
  calculateUninstallationPrice,
  calculateComboBudget
} from '@4s-clima/shared';

/**
 * Página de Catálogo de Materiales y Cotizador por Frigorías.
 * Incluye:
 * 1. Cotizador interactivo por Frigorías (Hoja RESUMEN del Excel oficial).
 * 2. Catálogo completo de materiales e insumos oficiales (Hoja 1).
 * 3. Costos y Parámetros maestros de cálculo (Hoja 1).
 * 4. Gestión y seguimiento de extras reportados por técnicos en órdenes de trabajo.
 */
export default function ExtrasPage() {
  const { profile } = useAdminAuth();
  const isOwner = profile?.role === 'owner';

  const [activeTab, setActiveTab] = useState('cotizador'); // 'cotizador' | 'catalogo' | 'parametros' | 'reportados'

  // --- Estado para Motor Dinámico de Costos (Hoja 1) ---
  const [pricingParams, setPricingParams] = useState(() => {
    try {
      const saved = localStorage.getItem('4s_pricing_parameters');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Si contenía valores alterados de la prueba anterior (+5%), limpiamos para restaurar el original exacto del Excel
        if (parsed.copperPricePerKg !== 40000 || parsed.pipeMarginGM !== 1.40 || parsed.wasteFactor !== 0.05) {
          localStorage.removeItem('4s_pricing_parameters');
          return DEFAULT_PRICING_PARAMETERS;
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Error reading saved pricing parameters:', e);
    }
    return DEFAULT_PRICING_PARAMETERS;
  });

  const [isSavingParams, setIsSavingParams] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');
  const [supplierSection, setSupplierSection] = useState('copper'); // 'copper' | 'labor' | 'insulation' | 'hoses' | 'cables' | 'brackets'

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

  // --- Estado para Pestaña 4: Extras Reportados en OTs ---
  const [extras, setExtras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('unbilled'); // 'all' | 'unbilled' | 'billed'

  // Cargar parámetros remotos de Supabase si existen y están vigentes
  useEffect(() => {
    async function fetchRemoteParams() {
      try {
        const { data } = await supabase
          .from('pricing_parameters')
          .select('parameters')
          .eq('id', 'default')
          .maybeSingle();

        if (data?.parameters) {
          // Solo aplicar si no son datos alterados de test
          if (data.parameters.copperPricePerKg === 40000 && data.parameters.pipeMarginGM === 1.40) {
            setPricingParams(data.parameters);
            try {
              localStorage.setItem('4s_pricing_parameters', JSON.stringify(data.parameters));
            } catch (e) {}
          }
        }
      } catch (err) {
        // Fallback en localStorage
      }
    }
    fetchRemoteParams();
  }, []);

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

  // --- Generación Dinámica en base a los Parámetros Vivos de Hoja 1 ---
  const dynamicCombos = useMemo(() => {
    return buildCombosByCapacity(pricingParams);
  }, [pricingParams]);

  const dynamicCatalog = useMemo(() => {
    return buildMaterialsCatalog(pricingParams);
  }, [pricingParams]);

  // Cálculo en vivo del presupuesto (Hoja RESUMEN)
  const budget = useMemo(() => {
    return calculateComboBudget(selectedCapacity, quantities, dynamicCombos);
  }, [selectedCapacity, quantities, dynamicCombos]);

  const handleQuantityChange = (key, val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setQuantities((prev) => ({ ...prev, [key]: num }));
  };

  const handleCopyBudget = () => {
    const textLines = [
      `*PRESUPUESTO OFICIAL DE INSTALACIÓN — 4S CLIMA*`,
      `*Equipo:* ${budget.capacityLabel} (${budget.pipeSpecs})`,
      `---------------------------------------`,
      ...budget.lineItems
        .filter((it) => it.quantity > 0)
        .map(
          (it) =>
            `• ${it.label}: ${it.quantity} ${it.unit} x ${formatCurrency(it.unitPrice)} = ${formatCurrency(it.subtotalNeto)}`
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
    return dynamicCatalog.filter((item) => {
      const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchSearch =
        searchTerm === '' ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(searchTerm.toLowerCase())));
      return matchCategory && matchSearch;
    });
  }, [dynamicCatalog, searchTerm, selectedCategory]);

  // --- Handlers para el Motor de Parámetros ---
  const handleSaveParameters = async () => {
    if (!isOwner) {
      alert('Acceso Denegado: Solo el usuario con rol Propietario (Owner) puede modificar los parámetros de costos.');
      return;
    }
    setIsSavingParams(true);
    setSaveFeedback('');
    try {
      localStorage.setItem('4s_pricing_parameters', JSON.stringify(pricingParams));

      try {
        await supabase
          .from('pricing_parameters')
          .upsert({
            id: 'default',
            parameters: pricingParams,
            updated_at: new Date().toISOString(),
          });
      } catch (e) {
        console.warn('Supabase sync optional:', e);
      }

      setSaveFeedback('¡Parámetros de costos guardados exitosamente!');
      setTimeout(() => setSaveFeedback(''), 4000);
    } catch (err) {
      console.error('Error saving parameters:', err);
    } finally {
      setIsSavingParams(false);
    }
  };

  const handleResetToFactoryDefaults = () => {
    if (!isOwner) {
      alert('Acceso Denegado: Solo el usuario con rol Propietario (Owner) puede restablecer los parámetros.');
      return;
    }
    if (window.confirm('¿Restablecer todos los costos y parámetros a los valores oficiales de fábrica del Excel?')) {
      setPricingParams(DEFAULT_PRICING_PARAMETERS);
      try {
        localStorage.setItem('4s_pricing_parameters', JSON.stringify(DEFAULT_PRICING_PARAMETERS));
      } catch (e) {}
      setSaveFeedback('Valores oficiales de fábrica restablecidos con éxito.');
      setTimeout(() => setSaveFeedback(''), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
              Tarifario Oficial Vigente
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            Catálogo de Materiales y Cotizador por Frigorías
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Cálculo automático de materiales de instalación, mano de obra y costos de proveedores
          </p>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex flex-wrap bg-gray-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto border border-gray-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('cotizador')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all
              ${activeTab === 'cotizador'
                ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            <Calculator size={14} />
            Cotizador por Frigorías
          </button>
          <button
            onClick={() => setActiveTab('catalogo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all
              ${activeTab === 'catalogo'
                ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            <BookOpen size={14} />
            Catálogo ({dynamicCatalog.length})
          </button>
          <button
            onClick={() => setActiveTab('parametros')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all
              ${activeTab === 'parametros'
                ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            {isOwner ? <Sliders size={14} /> : <Lock size={13} className="text-amber-500" />}
            Costos y Parámetros (Hoja 1)
            {!isOwner && (
              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                Solo Lectura
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('reportados')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all relative
              ${activeTab === 'reportados'
                ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            <Package size={14} />
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
            <div className="mb-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Seleccionar Capacidad del Equipo (Frigorías / Hora)
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {Object.keys(dynamicCombos).map((capKey) => {
                const combo = dynamicCombos[capKey];
                const isSelected = selectedCapacity === capKey;
                return (
                  <button
                    key={capKey}
                    type="button"
                    onClick={() => setSelectedCapacity(capKey)}
                    className={`p-3 rounded-xl border text-left transition-all relative
                      ${isSelected
                        ? 'bg-brand-50/80 dark:bg-brand-900/30 border-brand-500 text-brand-900 dark:text-brand-100 shadow-sm ring-1 ring-brand-500'
                        : 'bg-white dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 hover:border-gray-300 text-gray-700 dark:text-gray-300'
                      }`}
                  >
                    <div className="font-bold text-sm text-gray-900 dark:text-white">
                      {combo.label}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                      {combo.pipeSpecs}
                    </div>
                    {isSelected && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tarjetas de Resumen Financiero */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 bg-gradient-to-br from-white to-gray-50 dark:from-slate-800 dark:to-slate-900">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
                Subtotal Neto (PRECIO + IVA)
              </span>
              <div className="text-2xl font-black text-gray-900 dark:text-white font-mono">
                {formatCurrency(budget.subtotalNeto)}
              </div>
              <span className="text-[11px] text-gray-400 mt-1 block">
                Base imponible sin impuestos
              </span>
            </div>

            <div className="card p-5 bg-gradient-to-br from-white to-gray-50 dark:from-slate-800 dark:to-slate-900">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-1">
                IVA (21% Factura A)
              </span>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                {formatCurrency(budget.ivaAmount)}
              </div>
              <span className="text-[11px] text-gray-400 mt-1 block">
                Alícuota general de servicios
              </span>
            </div>

            <div className="card p-5 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/30 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Total Final con IVA
                  </span>
                  <button
                    onClick={handleCopyBudget}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
                    title="Copiar cotización para WhatsApp"
                  >
                    {copiedQuote ? <CheckCheck size={13} /> : <Copy size={13} />}
                    {copiedQuote ? '¡Copiado!' : 'Copiar'}
                  </button>
                </div>
                <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  {formatCurrency(budget.totalConIva)}
                </div>
              </div>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-2 block font-medium">
                Monto facturable al cliente
              </span>
            </div>
          </div>

          {/* Tabla de Desglose Exacta de la Hoja RESUMEN */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                  Desglose de Materiales e Instalación — {budget.capacityLabel}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ajustá las cantidades necesarias para recalcular en tiempo real
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-semibold self-start sm:self-auto">
                Cañería sugerida: {budget.pipeSpecs}
              </span>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Ítem / Material de Instalación</th>
                    <th>Unidad</th>
                    <th className="w-28 text-center">Cantidad</th>
                    <th className="text-right">Precio Unit. (Neto)</th>
                    <th className="text-right">Subtotal Neto</th>
                    <th className="text-right">Total c/IVA (x1.21)</th>
                  </tr>
                </thead>
                <tbody>
                  {budget.lineItems.map((item) => {
                    let qtyKey = 'pipeMeters';
                    if (item.key === 'bracket') qtyKey = 'brackets';
                    else if (item.key === 'bracketLegs') qtyKey = 'bracketLegs';
                    else if (item.key === 'floorLegs') qtyKey = 'floorLegs';
                    else if (item.key === 'fixingKit') qtyKey = 'fixingKits';
                    else if (item.key === 'installationLabor') qtyKey = 'installationLabor';
                    else if (item.key === 'uninstallationLabor') qtyKey = 'uninstallation';

                    return (
                      <tr key={item.key}>
                        <td className="font-medium text-gray-900 dark:text-white text-sm">
                          {item.label}
                        </td>
                        <td className="text-xs text-gray-500 uppercase font-mono">
                          {item.unit}
                        </td>
                        <td className="text-center">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={quantities[qtyKey]}
                            onChange={(e) => handleQuantityChange(qtyKey, e.target.value)}
                            className="w-18 px-2 py-1 text-center font-bold text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </td>
                        <td className="text-right font-mono text-sm text-gray-600 dark:text-gray-300">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="text-right font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(item.subtotalNeto)}
                        </td>
                        <td className="text-right font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(item.subtotalNeto * 1.21)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: CATÁLOGO OFICIAL COMPLETO (HOJA 1 CON PRECIOS DINÁMICOS)      */}
      {/* ========================================================================= */}
      {activeTab === 'catalogo' && (
        <div className="space-y-4 animate-fade-in">
          {/* Barra de Filtros */}
          <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por nombre, medida (1/4, 3/8, 5/8...) o categoría..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">Todas las Categorías ({dynamicCatalog.length})</option>
              {Object.values(CATALOG_CATEGORIES).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {!isOwner && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                <Lock size={13} className="text-amber-500 shrink-0" />
                <span>Precios de catálogo fijados por Dirección</span>
              </div>
            )}
          </div>

          {/* Tabla de Catálogo Oficial */}
          <div className="card overflow-hidden">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Material / Servicio</th>
                    <th>Unidad</th>
                    <th className="text-right">Precio Neto (Sin IVA)</th>
                    <th className="text-right">IVA (21%)</th>
                    <th className="text-right">Precio Final c/IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((item) => {
                    const iva = Number((item.netPrice * 0.21).toFixed(2));
                    const total = Number((item.netPrice + iva).toFixed(2));

                    return (
                      <tr key={item.id}>
                        <td>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300">
                            {item.category}
                          </span>
                        </td>
                        <td className="font-medium text-gray-900 dark:text-white text-sm">
                          {item.name}
                        </td>
                        <td className="text-xs text-gray-500 uppercase font-mono">
                          {item.unit}
                        </td>
                        <td className="text-right font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(item.netPrice)}
                        </td>
                        <td className="text-right font-mono text-xs text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(iva)}
                        </td>
                        <td className="text-right font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(total)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCatalog.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400">
                        No se encontraron ítems en el catálogo con los filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 3: COSTOS Y PARÁMETROS (HOJA 1)                                   */}
      {/* ========================================================================= */}
      {activeTab === 'parametros' && (
        <div className="space-y-6 animate-fade-in">
          {/* Barra Superior de Control de Costos y Sincronización */}
          <div className="card p-4 bg-gray-50/70 dark:bg-slate-850 border border-gray-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Sliders className="text-brand-600 dark:text-brand-400" size={17} />
                Parámetros Maestros de Costos y Proveedores
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Al editar los costos del cobre, insumos de proveedores o mano de obra, los combos se recalculan automáticamente.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {isOwner ? (
                <>
                  <button
                    type="button"
                    onClick={handleResetToFactoryDefaults}
                    className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900"
                    title="Restablecer todos los costos a los valores del Excel original"
                  >
                    <RotateCcw size={13} />
                    Restablecer Valores de Fábrica
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveParameters}
                    disabled={isSavingParams}
                    className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white shadow-xs"
                  >
                    <Save size={14} />
                    {isSavingParams ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-xs font-semibold">
                  <Lock size={14} />
                  Solo el Propietario (Owner) puede modificar costos
                </div>
              )}
            </div>
          </div>

          {!isOwner && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-start sm:items-center gap-3 text-amber-900 dark:text-amber-300 animate-fade-in">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                <Lock size={16} />
              </div>
              <div className="flex-1 text-xs">
                <p className="font-bold uppercase tracking-wider text-[11px] text-amber-800 dark:text-amber-300">
                  Modo Solo Lectura — Separación de Deberes
                </p>
                <p className="text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                  Como Administrador tenés acceso a consultar la matriz de costos y parámetros maestros de proveedores, pero los campos se encuentran bloqueados. La modificación de márgenes GM y costos base está reservada exclusivamente al rol <strong>Propietario (Owner)</strong>.
                </p>
              </div>
            </div>
          )}

          {saveFeedback && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2 animate-fade-in">
              <Check size={15} />
              {saveFeedback}
            </div>
          )}

          {/* Grilla de Variables Maestras (Cobre y Márgenes GM) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Cobre por Kg */}
            <div className="card p-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                Precio Cobre x Kg (Base)
              </span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="500"
                  value={pricingParams.copperPricePerKg}
                  disabled={!isOwner}
                  readOnly={!isOwner}
                  onChange={(e) =>
                    setPricingParams({ ...pricingParams, copperPricePerKg: parseFloat(e.target.value) || 0 })
                  }
                  className={`w-full pl-8 pr-3 py-1.5 font-bold font-mono text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                    !isOwner
                      ? 'bg-gray-100 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white'
                  }`}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-gray-500 pt-1">
                <span>Dto: {(pricingParams.copperDiscount * 100).toFixed(0)}%</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                  Neto: ${((pricingParams.copperPricePerKg * (1 - pricingParams.copperDiscount))).toLocaleString('es-AR')}/kg
                </span>
              </div>
            </div>

            {/* Descuento Proveedor Cobre */}
            <div className="card p-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                % Descuento Proveedor Cobre
              </span>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={pricingParams.copperDiscount * 100}
                  disabled={!isOwner}
                  readOnly={!isOwner}
                  onChange={(e) =>
                    setPricingParams({ ...pricingParams, copperDiscount: (parseFloat(e.target.value) || 0) / 100 })
                  }
                  className={`w-full pl-3 pr-8 py-1.5 font-bold font-mono text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                    !isOwner
                      ? 'bg-gray-100 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white'
                  }`}
                />
              </div>
              <span className="text-[11px] text-gray-400 block pt-1">
                Celda C2 del Excel (10% comercial)
              </span>
            </div>

            {/* Margen GM Cañería Armada */}
            <div className="card p-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                GM Cañería (Multiplicador T16)
              </span>
              <div className="relative">
                <input
                  type="number"
                  step="0.05"
                  value={pricingParams.pipeMarginGM}
                  disabled={!isOwner}
                  readOnly={!isOwner}
                  onChange={(e) =>
                    setPricingParams({ ...pricingParams, pipeMarginGM: parseFloat(e.target.value) || 0 })
                  }
                  className={`w-full px-3 py-1.5 font-bold font-mono text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                    !isOwner
                      ? 'bg-gray-100 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white'
                  }`}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-gray-500 pt-1">
                <span>Margen: {((pricingParams.pipeMarginGM - 1) * 100).toFixed(0)}%</span>
                <span>Desperdicio: {(pricingParams.wasteFactor * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Margen GM Mano de Obra */}
            <div className="card p-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                GM Mano de Obra (Celda Z16)
              </span>
              <div className="relative">
                <input
                  type="number"
                  step="0.05"
                  value={pricingParams.laborMarginGM}
                  disabled={!isOwner}
                  readOnly={!isOwner}
                  onChange={(e) =>
                    setPricingParams({ ...pricingParams, laborMarginGM: parseFloat(e.target.value) || 0 })
                  }
                  className={`w-full px-3 py-1.5 font-bold font-mono text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                    !isOwner
                      ? 'bg-gray-100 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white'
                  }`}
                />
              </div>
              <span className="text-[11px] text-gray-400 block pt-1">
                Margen venta sobre instalador: {((pricingParams.laborMarginGM - 1) * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Subnavegación de Insumos Detallados */}
          <div className="card overflow-hidden">
            <div className="flex border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40 p-2 gap-1 overflow-x-auto">
              {[
                { id: 'copper', label: 'Caños de Cobre (Rollo 15m)' },
                { id: 'labor', label: 'Mano de Obra Base' },
                { id: 'insulation', label: 'Aislaciones Bellini' },
                { id: 'hoses', label: 'Mangueras Reld' },
                { id: 'cables', label: 'Cables y Cintas Reld' },
                { id: 'brackets', label: 'Ménsulas y Fijaciones' },
              ].map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSupplierSection(sec.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all
                    ${supplierSection === sec.id
                      ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                >
                  {sec.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* SECCIÓN 1: CAÑOS DE COBRE CALCULADOS */}
              {supplierSection === 'copper' && (
                <div className="space-y-4">
                  <div className="text-xs text-gray-500">
                    Fórmula automática Hoja 1: <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 font-mono font-bold text-gray-800 dark:text-gray-200">
                      (Neto Kg Cobre * Kg Rollo * 1.21) / 15m
                    </code>
                  </div>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Medida</th>
                          <th>Peso Rollo (15m)</th>
                          <th className="text-right">Precio Resultante x Metro (Neto)</th>
                          <th className="text-right">Precio Resultante c/IVA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(pricingParams.copperWeights).map(([size, kg]) => {
                          const price = calculateCopperPipePrice(pricingParams, size);
                          return (
                            <tr key={size}>
                              <td className="font-bold text-gray-900 dark:text-white">Caño {size}"</td>
                              <td>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={kg}
                                    disabled={!isOwner}
                                    readOnly={!isOwner}
                                    onChange={(e) => {
                                      const next = { ...pricingParams.copperWeights, [size]: parseFloat(e.target.value) || 0 };
                                      setPricingParams({ ...pricingParams, copperWeights: next });
                                    }}
                                    className={`w-20 px-2 py-1 text-xs font-mono font-bold border rounded ${
                                      !isOwner ? 'bg-gray-100 dark:bg-slate-800 text-gray-500 cursor-not-allowed' : 'bg-gray-50 dark:bg-slate-900'
                                    }`}
                                  />
                                  <span className="text-xs text-gray-400">kg</span>
                                </div>
                              </td>
                              <td className="text-right font-mono font-bold text-gray-900 dark:text-white">
                                {formatCurrency(price)}
                              </td>
                              <td className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(price * 1.21)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SECCIÓN 2: MANO DE OBRA BASE */}
              {supplierSection === 'labor' && (
                <div className="space-y-4">
                  <div className="text-xs text-gray-500">
                    El costo base del instalador se multiplica por el <strong>GM {pricingParams.laborMarginGM}</strong> para sacar el precio de venta. La desinstalación se calcula como el <strong>50%</strong>.
                  </div>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Capacidad</th>
                          <th>Costo Base Instalador</th>
                          <th className="text-right">Precio Venta (x GM {pricingParams.laborMarginGM})</th>
                          <th className="text-right">Desinstalación (50% M.O.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(pricingParams.baseLabor).map(([cap, base]) => {
                          const sale = calculateLaborPrice(pricingParams, cap);
                          const uninst = calculateUninstallationPrice(pricingParams, cap);
                          const label = dynamicCombos[cap]?.label || `${cap} FG`;

                          return (
                            <tr key={cap}>
                              <td className="font-bold text-gray-900 dark:text-white">{label}</td>
                              <td>
                                <div className="relative w-36">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                  <input
                                    type="number"
                                    step="5000"
                                    value={base}
                                    disabled={!isOwner}
                                    readOnly={!isOwner}
                                    onChange={(e) => {
                                      const next = { ...pricingParams.baseLabor, [cap]: parseFloat(e.target.value) || 0 };
                                      setPricingParams({ ...pricingParams, baseLabor: next });
                                    }}
                                    className={`w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border rounded ${
                                      !isOwner ? 'bg-gray-100 dark:bg-slate-800 text-gray-500 cursor-not-allowed' : 'bg-gray-50 dark:bg-slate-900'
                                    }`}
                                  />
                                </div>
                              </td>
                              <td className="text-right font-mono font-bold text-gray-900 dark:text-white">
                                {formatCurrency(sale)}
                              </td>
                              <td className="text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                {formatCurrency(uninst)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SECCIÓN 3: AISLACIONES BELLINI */}
              {supplierSection === 'insulation' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(pricingParams.insulationBellini).map(([size, price]) => (
                    <div key={size} className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800 space-y-1">
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        Aislación Bellini {size}" (x metro)
                      </span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                        <input
                          type="number"
                          step="10"
                          value={price}
                          disabled={!isOwner}
                          readOnly={!isOwner}
                          onChange={(e) => {
                            const next = { ...pricingParams.insulationBellini, [size]: parseFloat(e.target.value) || 0 };
                            setPricingParams({ ...pricingParams, insulationBellini: next });
                          }}
                          className={`w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border rounded ${
                            !isOwner ? 'bg-gray-100 dark:bg-slate-800 text-gray-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* SECCIÓN 4: MANGUERAS RELD */}
              {supplierSection === 'hoses' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(pricingParams.hosesReld).map(([size, price]) => (
                    <div key={size} className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800 space-y-1">
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        Manguera Reld {size}" (x metro)
                      </span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                        <input
                          type="number"
                          step="10"
                          value={price}
                          disabled={!isOwner}
                          readOnly={!isOwner}
                          onChange={(e) => {
                            const next = { ...pricingParams.hosesReld, [size]: parseFloat(e.target.value) || 0 };
                            setPricingParams({ ...pricingParams, hosesReld: next });
                          }}
                          className={`w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border rounded ${
                            !isOwner ? 'bg-gray-100 dark:bg-slate-800 text-gray-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* SECCIÓN 5: CABLES Y CINTAS RELD */}
              {supplierSection === 'cables' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Cables tipo Taller (x metro)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(pricingParams.cablesReld).map(([type, price]) => (
                      <div key={type} className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800 space-y-1">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Cable {type} mm</span>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            step="50"
                            value={price}
                            disabled={!isOwner}
                            readOnly={!isOwner}
                            onChange={(e) => {
                              const next = { ...pricingParams.cablesReld, [type]: parseFloat(e.target.value) || 0 };
                              setPricingParams({ ...pricingParams, cablesReld: next });
                            }}
                            className={`w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border rounded ${
                              !isOwner ? 'bg-gray-100 dark:bg-slate-800 text-gray-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900'
                            }`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 pt-2">Cintas de Caño Reld (x rollo)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { key: 'whiteWithAdhesive', label: 'Blanca c/adh.' },
                      { key: 'whiteWithoutAdhesive', label: 'Blanca s/adh.' },
                      { key: 'grayWithAdhesive', label: 'Gris c/adh.' },
                      { key: 'grayWithoutAdhesive', label: 'Gris s/adh.' },
                    ].map(({ key, label }) => (
                      <div key={key} className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800 space-y-1">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Cinta {label}</span>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            step="50"
                            value={pricingParams.tapesReld[key]}
                            disabled={!isOwner}
                            readOnly={!isOwner}
                            onChange={(e) => {
                              const next = { ...pricingParams.tapesReld, [key]: parseFloat(e.target.value) || 0 };
                              setPricingParams({ ...pricingParams, tapesReld: next });
                            }}
                            className={`w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border rounded ${
                              !isOwner ? 'bg-gray-100 dark:bg-slate-800 text-gray-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900'
                            }`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECCIÓN 6: MÉNSULAS Y FIJACIONES */}
              {supplierSection === 'brackets' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { key: 'bracket42', label: 'Ménsula 42cm' },
                    { key: 'bracket52', label: 'Ménsula 52cm' },
                    { key: 'bracket62', label: 'Ménsula 62cm' },
                    { key: 'bracket82', label: 'Ménsula 82cm' },
                    { key: 'bracketLeg', label: 'Pata Ménsula' },
                    { key: 'floorLeg', label: 'Pata Piso Estándar' },
                    { key: 'floorLeg5TR', label: 'Pata Piso 5 TR' },
                    { key: 'fixingKit', label: 'Kit Fijación' },
                  ].map(({ key, label }) => (
                    <div key={key} className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800 space-y-1">
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{label}</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                        <input
                          type="number"
                          step="100"
                          value={pricingParams.bracketsAndFixings[key]}
                          disabled={!isOwner}
                          readOnly={!isOwner}
                          onChange={(e) => {
                            const next = { ...pricingParams.bracketsAndFixings, [key]: parseFloat(e.target.value) || 0 };
                            setPricingParams({ ...pricingParams, bracketsAndFixings: next });
                          }}
                          className={`w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border rounded ${
                            !isOwner ? 'bg-gray-100 dark:bg-slate-800 text-gray-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 4: EXTRAS REPORTADOS POR TÉCNICOS EN LA CALLE    */}
      {/* ======================================================== */}
      {activeTab === 'reportados' && (
        <div className="space-y-4 animate-fade-in">
          {/* Card de Resumen de Pendientes */}
          <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-500/10 border-amber-500/30">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
                <AlertCircle size={22} />
              </div>
              <div>
                <span className="text-xs text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wider block">
                  Materiales reportados pendientes de facturar
                </span>
                <div className="text-xl font-black text-amber-900 dark:text-amber-100 font-mono">
                  {formatCurrency(totalUnbilled)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadExtras}
                className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
                title="Actualizar lista"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                Refrescar
              </button>
              {extras.filter((e) => !e.billed).length > 0 && (
                <button
                  onClick={markAllAsBilled}
                  className="btn-primary text-xs px-3 py-2 flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white"
                >
                  <Check size={14} />
                  Marcar todos como Facturados
                </button>
              )}
            </div>
          </div>

          {/* Filtros de Estado */}
          <div className="flex gap-2">
            {[
              { id: 'unbilled', label: 'Sin Facturar' },
              { id: 'billed', label: 'Facturados' },
              { id: 'all', label: 'Todos' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                  ${filter === f.id
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Tabla de Extras en OTs */}
          <div className="card overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400">Cargando extras...</div>
            ) : extras.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                No hay extras registrados con el filtro seleccionado.
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>OT</th>
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
