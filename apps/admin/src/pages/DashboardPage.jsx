import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ClipboardList, Users, Building2, DollarSign,
  TrendingUp, Clock, CheckCircle2, AlertCircle,
  AlertTriangle, PauseCircle, MessageSquare, FileText,
  ArrowRight, ShieldCheck, Calendar, Sparkles,
  ArrowUpRight, ArrowDownRight, Activity, Wrench
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ComposedChart
} from 'recharts';
import { supabase } from '@4s-clima/shared/supabase';
import {
  WORK_ORDER_STATUS,
  WORK_ORDER_TYPE_LABELS,
  WORK_ORDER_TYPES
} from '@4s-clima/shared/constants';
import {
  formatDate,
  formatCurrency,
  getStatusLabel,
  getStatusColor,
  getArgentinaDate
} from '@4s-clima/shared';
import { useDarkMode } from '../hooks/useDarkMode';
import FleetRadarMap from '../components/FleetRadarMap';

/**
 * Dashboard Ejecutivo de Administración 4S Clima.
 * Estructurado en 3 bloques estratégicos:
 * 1. Barra de Alertas Urgentes Clickeables (Pausadas, Atrasadas, Leads Nuevos, Técnicos en Jornada)
 * 2. 4 KPIs Ejecutivos de Alto Impacto (Facturación Mes, Pendiente de Cobro, Presupuestos por Aprobar, Obras y Abonos)
 * 3. Cuerpo Principal: Radar de Flota en Vivo, Trabajos del Día y Gráfico Financiero de Facturación vs. Costos
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const [isLoading, setIsLoading] = useState(true);

  // Bloque 1: Alertas Urgentes
  const [alerts, setAlerts] = useState({
    onHoldCount: 0,
    overdueCount: 0,
    newLeadsCount: 0,
    activeShiftsCount: 0,
  });

  // Bloque 2: KPIs Ejecutivos
  const [kpis, setKpis] = useState({
    currentMonthBilled: 0,
    prevMonthBilled: 0,
    billedGrowthPercent: 0,
    pendingCollectionTotal: 0,
    pendingCollectionCount: 0,
    pendingQuotesTotal: 0,
    pendingQuotesCount: 0,
    activeObrasCount: 0,
    activeAbonosCount: 0,
  });

  // Bloque 3: Datos de Soporte
  const [todayOrders, setTodayOrders] = useState([]);
  const [financialChartData, setFinancialChartData] = useState([]);

  useEffect(() => {
    loadDashboard();

    // Suscripción en tiempo real a cambios operativos y comerciales
    const channel = supabase
      .channel('dashboard-realtime-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'technician_shifts' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extras' }, () => loadDashboard())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadDashboard() {
    try {
      // 1. Fechas clave en zona horaria de Argentina (America/Argentina/Buenos_Aires UTC-3)
      const todayStr = getArgentinaDate(new Date()); // 'YYYY-MM-DD'
      const [currYear, currMonth] = todayStr.split('-').map(Number);
      const currentMonthStart = `${todayStr.slice(0, 7)}-01`;

      // Mes anterior
      const prevMonthDate = new Date(currYear, currMonth - 2, 1);
      const prevYearStr = String(prevMonthDate.getFullYear());
      const prevMonthNumStr = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
      const prevMonthStart = `${prevYearStr}-${prevMonthNumStr}-01`;

      // 6 meses atrás para el gráfico histórico
      const sixMonthsAgoDate = new Date(currYear, currMonth - 6, 1);
      const sixMonthsAgoStart = `${sixMonthsAgoDate.getFullYear()}-${String(sixMonthsAgoDate.getMonth() + 1).padStart(2, '0')}-01`;

      // 2. Ejecutar todas las consultas en paralelo con Promise.all
      const [
        { count: onHoldCount },
        { count: overdueCount },
        { count: newLeadsCount },
        { count: activeShiftsCount },
        { data: currentMonthOrders },
        { data: prevMonthOrders },
        { data: pendingCollectionOrders },
        { data: pendingQuotesData },
        { count: activeObrasCount },
        { count: activeAbonosCount },
        { data: todayOrdersData },
        { data: historyOrdersData }
      ] = await Promise.all([
        // 1. Órdenes en Pausa / Impedimento
        supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', WORK_ORDER_STATUS.ON_HOLD),

        // 2. Órdenes Atrasadas / Vencidas (scheduled_date < hoy y sin completar)
        supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .lt('scheduled_date', todayStr)
          .in('status', [
            WORK_ORDER_STATUS.PENDING,
            WORK_ORDER_STATUS.TRAVELING,
            WORK_ORDER_STATUS.IN_PROGRESS,
            WORK_ORDER_STATUS.ON_HOLD
          ]),

        // 3. Nuevos Leads sin contactar
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .in('estado', ['pendiente', 'nuevo', 'new']),

        // 4. Técnicos en Jornada Activa hoy (turno abierto sin check_out)
        supabase
          .from('technician_shifts')
          .select('id, technician_id', { count: 'exact', head: true })
          .is('check_out_at', null)
          .eq('status', 'active'),

        // 5. Facturación Mes Actual (órdenes completadas del mes)
        supabase
          .from('work_orders')
          .select('total_amount, status, scheduled_date, completed_at')
          .eq('status', WORK_ORDER_STATUS.COMPLETED)
          .gte('scheduled_date', currentMonthStart),

        // 6. Facturación Mes Anterior (comparativa porcentual)
        supabase
          .from('work_orders')
          .select('total_amount')
          .eq('status', WORK_ORDER_STATUS.COMPLETED)
          .gte('scheduled_date', prevMonthStart)
          .lt('scheduled_date', currentMonthStart),

        // 7. Pendiente de Cobro (completadas con total > 0 impagas, excluye abonos)
        supabase
          .from('work_orders')
          .select('total_amount, payment_status, is_subscription')
          .eq('status', WORK_ORDER_STATUS.COMPLETED)
          .gt('total_amount', 0)
          .neq('payment_status', 'paid')
          .neq('payment_status', 'abono')
          .neq('is_subscription', true),

        // 8. Presupuestos por Aprobar (draft y sent)
        supabase
          .from('quotes')
          .select('id, total, status')
          .in('status', ['draft', 'sent']),

        // 9. Obras Activas (tipo obra en curso)
        supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('type', WORK_ORDER_TYPES.OBRA)
          .in('status', [
            WORK_ORDER_STATUS.PENDING,
            WORK_ORDER_STATUS.TRAVELING,
            WORK_ORDER_STATUS.IN_PROGRESS,
            WORK_ORDER_STATUS.ON_HOLD
          ]),

        // 10. Abonos del Mes ejecutados o programados
        supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .or('is_subscription.eq.true,payment_status.eq.abono')
          .gte('scheduled_date', currentMonthStart),

        // 11. Trabajos Programados para Hoy
        supabase
          .from('work_orders')
          .select(`
            id,
            order_number,
            type,
            status,
            scheduled_date,
            scheduled_time,
            total_amount,
            is_subscription,
            client:clients(name),
            plant:plants(name, address),
            assigned:users!work_orders_assigned_to_fkey(name, phone)
          `)
          .eq('scheduled_date', todayStr)
          .order('scheduled_time', { ascending: true }),

        // 12. Historial de Órdenes con Extras para Gráfico Financiero de 6 meses
        supabase
          .from('work_orders')
          .select(`
            id,
            total_amount,
            scheduled_date,
            completed_at,
            status,
            extras(quantity, unit_price, cost_price)
          `)
          .gte('scheduled_date', sixMonthsAgoStart)
      ]);

      // 3. Procesar Alertas
      setAlerts({
        onHoldCount: onHoldCount || 0,
        overdueCount: overdueCount || 0,
        newLeadsCount: newLeadsCount || 0,
        activeShiftsCount: activeShiftsCount || 0,
      });

      // 4. Procesar KPIs Financieros
      const billedCurrent = (currentMonthOrders || []).reduce(
        (sum, wo) => sum + (Number(wo.total_amount) || 0),
        0
      );
      const billedPrev = (prevMonthOrders || []).reduce(
        (sum, wo) => sum + (Number(wo.total_amount) || 0),
        0
      );

      let billedGrowth = 0;
      if (billedPrev > 0) {
        billedGrowth = Math.round(((billedCurrent - billedPrev) / billedPrev) * 100);
      } else if (billedCurrent > 0) {
        billedGrowth = 100;
      }

      const pendingColTotal = (pendingCollectionOrders || []).reduce(
        (sum, wo) => sum + (Number(wo.total_amount) || 0),
        0
      );
      const pendingColCount = pendingCollectionOrders?.length || 0;

      const pendingQuotesTotal = (pendingQuotesData || []).reduce(
        (sum, q) => sum + (Number(q.total) || 0),
        0
      );
      const pendingQuotesCount = pendingQuotesData?.length || 0;

      setKpis({
        currentMonthBilled: billedCurrent,
        prevMonthBilled: billedPrev,
        billedGrowthPercent: billedGrowth,
        pendingCollectionTotal: pendingColTotal,
        pendingCollectionCount: pendingColCount,
        pendingQuotesTotal,
        pendingQuotesCount,
        activeObrasCount: activeObrasCount || 0,
        activeAbonosCount: activeAbonosCount || 0,
      });

      // 5. Trabajos de Hoy
      setTodayOrders(todayOrdersData || []);

      // 6. Generar estructura del Gráfico Financiero (6 meses históricos)
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const chartBuckets = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(currYear, currMonth - 1 - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const monthKey = `${y}-${m}`;
        chartBuckets.push({
          key: monthKey,
          name: `${monthNames[d.getMonth()]} ${y !== currYear ? "'" + String(y).slice(2) : ''}`,
          facturacion: 0,
          costos: 0,
          margen: 0,
        });
      }

      (historyOrdersData || []).forEach((wo) => {
        const orderDateStr = wo.completed_at || wo.scheduled_date;
        if (!orderDateStr) return;
        const bucketKey = orderDateStr.slice(0, 7);
        const bucket = chartBuckets.find((b) => b.key === bucketKey);
        if (!bucket) return;

        const rev = Number(wo.total_amount) || 0;
        if (wo.status === WORK_ORDER_STATUS.COMPLETED) {
          bucket.facturacion += rev;
        }

        // Costos directos de materiales/extras
        let orderCost = 0;
        (wo.extras || []).forEach((ex) => {
          const qty = Number(ex.quantity) || 1;
          const cost = Number(ex.cost_price) || (Number(ex.unit_price) * 0.5) || 0;
          orderCost += qty * cost;
        });

        // Estimación directa de mano de obra mínima si es completada
        if (wo.status === WORK_ORDER_STATUS.COMPLETED && rev > 0) {
          orderCost += Math.min(rev * 0.35, 15000);
        }

        bucket.costos += Math.round(orderCost);
      });

      // Calcular margen neto en cada bucket
      chartBuckets.forEach((b) => {
        b.margen = Math.max(0, b.facturacion - b.costos);
      });

      setFinancialChartData(chartBuckets);
    } catch (error) {
      console.error('Error cargando Dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Comprobar si hay alertas críticas activas
  const hasUrgentIssues = alerts.onHoldCount > 0 || alerts.overdueCount > 0 || alerts.newLeadsCount > 0;

  return (
    <div className="space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            Dashboard Ejecutivo
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Operaciones y Finanzas en Vivo — {formatDate(new Date())} (UTC-3)
          </p>
        </div>

        {/* Indicador de turno activo en cabecera */}
        <div className="flex items-center gap-2">
          <Link
            to="/asistencia"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-slate-850 hover:bg-gray-100 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-800 transition-all text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs"
          >
            <span className="relative flex h-2 w-2">
              {alerts.activeShiftsCount > 0 && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${alerts.activeShiftsCount > 0 ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            </span>
            <span>
              {alerts.activeShiftsCount === 1
                ? '1 Técnico en Jornada'
                : `${alerts.activeShiftsCount} Técnicos en Jornada`}
            </span>
          </Link>
        </div>
      </div>

      {/* =========================================================================
          BLOQUE 1: BARRA DE ALERTAS URGENTES (Clickeables)
      ========================================================================= */}
      <div className="rounded-2xl border border-gray-200/90 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${hasUrgentIssues ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Monitor de Alertas y Guardia
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* 1. Alerta: Órdenes en Pausa / Impedimento */}
            {alerts.onHoldCount > 0 ? (
              <button
                type="button"
                onClick={() => navigate('/ordenes?status=on_hold')}
                className="flex-1 sm:flex-initial inline-flex items-center justify-between sm:justify-start gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 text-xs font-bold transition-all hover:bg-amber-100 dark:hover:bg-amber-900/60 shadow-2xs active:scale-95 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <PauseCircle size={15} className="text-amber-600 dark:text-amber-400" />
                  <span>Órdenes en Pausa / Impedimento</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-md bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-[11px] font-black">
                  {alerts.onHoldCount}
                </span>
              </button>
            ) : null}

            {/* 2. Alerta: Órdenes Atrasadas / Vencidas */}
            {alerts.overdueCount > 0 ? (
              <button
                type="button"
                onClick={() => navigate('/ordenes?filter=overdue')}
                className="flex-1 sm:flex-initial inline-flex items-center justify-between sm:justify-start gap-2 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 text-xs font-bold transition-all hover:bg-rose-100 dark:hover:bg-rose-900/60 shadow-2xs active:scale-95 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <AlertCircle size={15} className="text-rose-600 dark:text-rose-400" />
                  <span>Órdenes Atrasadas</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-md bg-rose-200 dark:bg-rose-800 text-rose-900 dark:text-rose-100 text-[11px] font-black">
                  {alerts.overdueCount}
                </span>
              </button>
            ) : null}

            {/* 3. Alerta: Nuevos Leads sin contactar */}
            {alerts.newLeadsCount > 0 ? (
              <button
                type="button"
                onClick={() => navigate('/leads')}
                className="flex-1 sm:flex-initial inline-flex items-center justify-between sm:justify-start gap-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 text-xs font-bold transition-all hover:bg-blue-100 dark:hover:bg-blue-900/60 shadow-2xs active:scale-95 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <MessageSquare size={15} className="text-blue-600 dark:text-blue-400" />
                  <span>Leads sin contactar</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-md bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 text-[11px] font-black">
                  {alerts.newLeadsCount}
                </span>
              </button>
            ) : null}

            {/* Estado Neutro / Todo al Día */}
            {!hasUrgentIssues && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 text-xs font-medium">
                <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Operaciones al día: sin órdenes pausadas ni vencidas</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          BLOQUE 2: KPIS EJECUTIVOS (4 Tarjetas de Alto Impacto)
      ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Facturación del Mes */}
        <div className="card p-5 relative overflow-hidden border border-gray-200/90 dark:border-slate-800 shadow-sm transition-all hover:border-brand-500/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Facturación del Mes
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/60 shadow-2xs">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white">
              {formatCurrency(kpis.currentMonthBilled)}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
              {kpis.billedGrowthPercent >= 0 ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  <ArrowUpRight size={13} />
                  +{kpis.billedGrowthPercent}%
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800">
                  <ArrowDownRight size={13} />
                  {kpis.billedGrowthPercent}%
                </span>
              )}
              <span className="text-gray-400">vs. mes anterior</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Pendiente de Cobro */}
        <div
          onClick={() => navigate('/finanzas')}
          className="card p-5 relative overflow-hidden border border-gray-200/90 dark:border-slate-800 shadow-sm transition-all hover:border-amber-500/50 cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Pendiente de Cobro
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-100 dark:border-amber-800/60 shadow-2xs group-hover:scale-105 transition-transform">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono tracking-tight text-amber-600 dark:text-amber-400">
              {formatCurrency(kpis.pendingCollectionTotal)}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{kpis.pendingCollectionCount} {kpis.pendingCollectionCount === 1 ? 'orden impaga' : 'órdenes impagas'}</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold group-hover:underline flex items-center gap-0.5">
                Ver finanzas <ArrowRight size={12} />
              </span>
            </div>
          </div>
        </div>

        {/* KPI 3: Presupuestos por Aprobar */}
        <div
          onClick={() => navigate('/presupuestos')}
          className="card p-5 relative overflow-hidden border border-gray-200/90 dark:border-slate-800 shadow-sm transition-all hover:border-brand-500/50 cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Presupuestos por Aprobar
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-800/60 shadow-2xs group-hover:scale-105 transition-transform">
              <FileText size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono tracking-tight text-blue-600 dark:text-blue-400">
              {formatCurrency(kpis.pendingQuotesTotal)}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{kpis.pendingQuotesCount} {kpis.pendingQuotesCount === 1 ? 'propuesta activa' : 'propuestas activas'}</span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold group-hover:underline flex items-center gap-0.5">
                Ver cotizaciones <ArrowRight size={12} />
              </span>
            </div>
          </div>
        </div>

        {/* KPI 4: Obras Activas y Abonos del Mes */}
        <div
          onClick={() => navigate('/ordenes?type=obra')}
          className="card p-5 relative overflow-hidden border border-gray-200/90 dark:border-slate-800 shadow-sm transition-all hover:border-indigo-500/50 cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Obras y Abonos
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-800/60 shadow-2xs group-hover:scale-105 transition-transform">
              <Building2 size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black tracking-tight text-gray-900 dark:text-white flex items-baseline gap-2">
              <span>{kpis.activeObrasCount}</span>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                {kpis.activeObrasCount === 1 ? 'Obra en Curso' : 'Obras en Curso'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1 font-medium">
                <ShieldCheck size={14} className="text-emerald-500" />
                {kpis.activeAbonosCount} abonos este mes
              </span>
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold group-hover:underline flex items-center gap-0.5">
                Ver obras <ArrowRight size={12} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          BLOQUE 3: CUERPO PRINCIPAL (Mapa Radar, Trabajos del Día, Gráfico Financiero)
      ========================================================================= */}

      {/* 1. Radar de Flota y Asignaciones en Vivo */}
      <FleetRadarMap />

      {/* 2. Sección Equilibrada: Trabajos del Día + Gráfico Financiero */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Tabla de Trabajos Programados para Hoy (7 columnas) */}
        <div className="lg:col-span-7 card p-5 flex flex-col border border-gray-200/90 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Calendar size={18} className="text-brand-500" />
                Trabajos Programados para Hoy
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Órdenes del día en hora Argentina (UTC-3)
              </p>
            </div>
            <Link
              to="/ordenes?date=today"
              className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
            >
              Ver todas ({todayOrders.length}) <ArrowRight size={13} />
            </Link>
          </div>

          <div className="flex-1 overflow-x-auto">
            {todayOrders.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center p-6 text-center bg-gray-50/50 dark:bg-slate-850/50 rounded-xl border border-dashed border-gray-200 dark:border-slate-800">
                <Clock size={32} className="text-gray-400 mb-2" />
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  No hay órdenes programadas para la fecha de hoy
                </p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">
                  Las nuevas órdenes que se programen para hoy se sincronizarán aquí automáticamente en tiempo real.
                </p>
                <Link
                  to="/ordenes"
                  className="mt-4 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-brand-600 dark:text-brand-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 transition-colors shadow-2xs"
                >
                  Explorar todas las órdenes
                </Link>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800 text-gray-400 uppercase text-[10px] tracking-wider font-bold">
                    <th className="pb-2.5">Hora / Orden</th>
                    <th className="pb-2.5">Cliente</th>
                    <th className="pb-2.5">Técnico</th>
                    <th className="pb-2.5">Tipo</th>
                    <th className="pb-2.5 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800/60 font-medium">
                  {todayOrders.map((order) => {
                    const sc = getStatusColor(order.status);
                    const orderTypeLabel = WORK_ORDER_TYPE_LABELS[order.type] || order.type;
                    return (
                      <tr
                        key={order.id}
                        onClick={() => navigate(`/ordenes/${order.id}`)}
                        className="hover:bg-gray-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                      >
                        <td className="py-2.5">
                          <div className="font-mono font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                            <span className="text-brand-600 dark:text-brand-400">
                              {order.scheduled_time ? `${order.scheduled_time.slice(0, 5)} hs` : 'A conf.'}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-gray-400 group-hover:text-brand-500 transition-colors">
                            {order.order_number || order.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="font-bold text-gray-900 dark:text-white truncate max-w-[150px]">
                            {order.client?.name || '-'}
                          </div>
                          {order.plant?.name && (
                            <div className="text-[10px] text-gray-400 truncate max-w-[150px]">
                              {order.plant.name}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 text-gray-600 dark:text-gray-300">
                          {order.assigned?.name ? (
                            <span className="truncate block max-w-[120px]">{order.assigned.name}</span>
                          ) : (
                            <span className="text-amber-500 italic text-[11px]">Sin asignar</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            order.type === WORK_ORDER_TYPES.OBRA
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
                              : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700'
                          }`}>
                            {orderTypeLabel}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {getStatusLabel(order.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Gráfico Financiero de Facturación y Costos Directos (5 columnas) */}
        <div className="lg:col-span-5 card p-5 flex flex-col border border-gray-200/90 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-500" />
                Facturación vs. Costos
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Evolución de ingresos y rentabilidad neta (últimos 6 meses)
              </p>
            </div>
            <Link
              to="/finanzas"
              className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
            >
              Libro Mayor <ArrowRight size={13} />
            </Link>
          </div>

          <div className="flex-1 min-h-[240px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={financialChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? '#334155' : '#f1f5f9'}
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b' }}
                  tickFormatter={(val) => `$${Math.round(val / 1000)}k`}
                />
                <Tooltip
                  cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-lg text-xs space-y-1.5 font-medium">
                          <p className="font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-slate-800 pb-1">
                            {label}
                          </p>
                          <div className="flex justify-between gap-4 text-brand-600 dark:text-brand-400">
                            <span>Facturación:</span>
                            <span className="font-mono font-bold">{formatCurrency(data.facturacion)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-amber-600 dark:text-amber-400">
                            <span>Costos Directos:</span>
                            <span className="font-mono font-bold">{formatCurrency(data.costos)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400 border-t border-gray-100 dark:border-slate-800 pt-1">
                            <span>Margen Operativo:</span>
                            <span className="font-mono font-bold">{formatCurrency(data.margen)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                />
                <Bar
                  dataKey="facturacion"
                  name="Facturación"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="costos"
                  name="Costos"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Line
                  type="monotone"
                  dataKey="margen"
                  name="Margen Neto"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#10b981' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
