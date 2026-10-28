import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Calendar,
  Users,
  Download,
  AlertTriangle,
  CheckCircle2,
  Filter,
  ArrowUpDown,
  Search,
  ChevronRight,
  Sparkles,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';

/**
 * Panel de Control de Asistencia, Horas Trabajadas y Liquidación de Sueldos.
 * Permite auditar jornadas laborales, cómputo de horas ordinarias vs. extras,
 * detección de turnos con anomalías (>12hs o sin check-out) y exportación a Excel (CSV).
 */
export default function AttendancePage() {
  const [shifts, setShifts] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(todayStr);
  const [selectedTechId, setSelectedTechId] = useState('all');
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(8); // 8 o 9 hs estándar
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'completed' | 'anomalous'

  // Cargar técnicos para el selector
  useEffect(() => {
    async function loadTechs() {
      const { data } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('role', 'tecnico')
        .order('name');
      setTechnicians(data || []);
    }
    loadTechs();
  }, []);

  // Cargar turnos según rango de fechas
  const loadShifts = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('technician_shifts')
        .select(`
          id,
          technician_id,
          shift_date,
          check_in_at,
          check_in_lat,
          check_in_lng,
          check_out_at,
          check_out_lat,
          check_out_lng,
          status,
          created_at,
          technician:users(id, name, email, phone)
        `)
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .order('shift_date', { ascending: false })
        .order('check_in_at', { ascending: false });

      if (selectedTechId !== 'all') {
        query = query.eq('technician_id', selectedTechId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setShifts(data || []);
    } catch (err) {
      console.error('Error cargando turnos de asistencia:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, selectedTechId]);

  useEffect(() => {
    loadShifts();

    // Suscripción Realtime para actualizar si un técnico ficha
    const channel = supabase
      .channel('attendance-shifts-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technician_shifts' },
        () => loadShifts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadShifts]);

  // Cómputo de horas y clasificación de turnos
  const processedShifts = useMemo(() => {
    const now = new Date();

    return shifts.map((shift) => {
      const checkIn = new Date(shift.check_in_at);
      const checkOut = shift.check_out_at ? new Date(shift.check_out_at) : null;

      // Duración en milisegundos
      let durationMs = 0;
      let isOngoing = shift.status === 'active';

      if (checkOut) {
        durationMs = Math.max(0, checkOut.getTime() - checkIn.getTime());
      } else if (isOngoing) {
        durationMs = Math.max(0, now.getTime() - checkIn.getTime());
      }

      const totalHoursDecimal = durationMs / (1000 * 60 * 60);

      // Cómputo de horas ordinarias vs. extras
      let regularHours = 0;
      let overtimeHours = 0;

      if (totalHoursDecimal <= standardHoursPerDay) {
        regularHours = totalHoursDecimal;
        overtimeHours = 0;
      } else {
        regularHours = standardHoursPerDay;
        overtimeHours = totalHoursDecimal - standardHoursPerDay;
      }

      // Detección de anomalías (>12 horas o turno abierto de días anteriores)
      const isAnomalous =
        (isOngoing && totalHoursDecimal > 12) ||
        (isOngoing && shift.shift_date < todayStr);

      // Ingreso tardío (después de las 09:00 hs de la mañana en hora local)
      const checkInHour = checkIn.getHours() + checkIn.getMinutes() / 60;
      const isLateCheckIn = checkInHour > 9.15; // posterior a 09:09 hs

      return {
        ...shift,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        totalHoursDecimal,
        regularHours,
        overtimeHours,
        isOngoing,
        isAnomalous,
        isLateCheckIn,
      };
    });
  }, [shifts, standardHoursPerDay, todayStr]);

  // Filtrado final por estado
  const filteredShifts = useMemo(() => {
    return processedShifts.filter((s) => {
      if (statusFilter === 'active') return s.isOngoing;
      if (statusFilter === 'completed') return !s.isOngoing;
      if (statusFilter === 'anomalous') return s.isAnomalous;
      return true;
    });
  }, [processedShifts, statusFilter]);

  // KPIs Totales del período
  const stats = useMemo(() => {
    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;
    let anomalousCount = 0;
    let activeCount = 0;

    processedShifts.forEach((s) => {
      totalHours += s.totalHoursDecimal;
      regularHours += s.regularHours;
      overtimeHours += s.overtimeHours;
      if (s.isAnomalous) anomalousCount++;
      if (s.isOngoing) activeCount++;
    });

    return {
      totalHours,
      regularHours,
      overtimeHours,
      anomalousCount,
      activeCount,
      totalRecords: processedShifts.length,
    };
  }, [processedShifts]);

  // Formateadores
  const formatTime = (date) => {
    if (!date) return '--:--';
    return date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const formatHours = (hoursDec) => {
    if (!hoursDec || isNaN(hoursDec)) return '0.00 hs';
    return `${hoursDec.toFixed(2)} hs`;
  };

  // Cierre administrativo forzado de turno anómalo
  const handleForceCloseShift = async (shiftId) => {
    if (!window.confirm('¿Confirmas el cierre administrativo forzado de este turno?')) {
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('technician_shifts')
        .update({
          status: 'completed',
          check_out_at: nowIso,
        })
        .eq('id', shiftId);

      if (error) throw error;
      loadShifts();
    } catch (err) {
      alert('Error cerrando turno: ' + err.message);
    }
  };

  // Exportar a Excel (CSV con BOM UTF-8 para apertura limpia directa en Excel)
  const handleExportCSV = () => {
    if (filteredShifts.length === 0) {
      alert('No hay registros de asistencia para exportar en el rango seleccionado.');
      return;
    }

    const headers = [
      'Fecha',
      'Técnico',
      'Email Técnico',
      'Hora Ingreso',
      'Hora Egreso',
      'Horas Ordinarias',
      'Horas Extras',
      'Total Horas',
      'Estado',
      'Observación / Anomalía',
      'Latitud Ingreso',
      'Longitud Ingreso',
      'Latitud Egreso',
      'Longitud Egreso',
    ];

    const rows = filteredShifts.map((s) => [
      s.shift_date,
      `"${s.technician?.name || 'Técnico'}"`,
      `"${s.technician?.email || ''}"`,
      formatTime(s.checkInDate),
      formatTime(s.checkOutDate),
      s.regularHours.toFixed(2),
      s.overtimeHours.toFixed(2),
      s.totalHoursDecimal.toFixed(2),
      s.status === 'active' ? 'En Curso' : 'Completado',
      s.isAnomalous
        ? 'Anomalía (>12hs)'
        : s.isLateCheckIn
        ? 'Ingreso Tardío (>09:00)'
        : 'Normal',
      s.check_in_lat || '',
      s.check_in_lng || '',
      s.check_out_lat || '',
      s.check_out_lng || '',
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `asistencia_4s_clima_${startDate}_al_${endDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Accesos rápidos de rango
  const setQuickRange = (rangeType) => {
    const cur = new Date();
    if (rangeType === 'this_month') {
      const f = new Date(cur.getFullYear(), cur.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      setStartDate(f);
      setEndDate(cur.toISOString().split('T')[0]);
    } else if (rangeType === 'first_half') {
      const f = new Date(cur.getFullYear(), cur.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      const t = new Date(cur.getFullYear(), cur.getMonth(), 15)
        .toISOString()
        .split('T')[0];
      setStartDate(f);
      setEndDate(t);
    } else if (rangeType === 'second_half') {
      const f = new Date(cur.getFullYear(), cur.getMonth(), 16)
        .toISOString()
        .split('T')[0];
      const l = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];
      setStartDate(f);
      setEndDate(l);
    } else if (rangeType === 'prev_month') {
      const f = new Date(cur.getFullYear(), cur.getMonth() - 1, 1)
        .toISOString()
        .split('T')[0];
      const l = new Date(cur.getFullYear(), cur.getMonth(), 0)
        .toISOString()
        .split('T')[0];
      setStartDate(f);
      setEndDate(l);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <Clock size={26} className="text-brand-500" />
            <span>Control de Asistencia y Liquidación de Horas</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Registro oficial de jornadas laborales, cómputo automático de horas ordinarias vs. extras y auditoría horaria.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={isLoading || filteredShifts.length === 0}
          className="btn-primary self-start md:self-auto flex items-center gap-2 py-2.5 px-4 text-xs font-semibold shadow-sm active:scale-95 transition-all"
          title="Descargar archivo CSV compatible con Excel para liquidación de haberes"
        >
          <Download size={15} />
          <span>Exportar a Excel (CSV)</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Horas Totales
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white font-mono tabular-nums">
              {stats.totalHours.toFixed(1)}
            </span>
            <span className="text-xs text-gray-400">hs</span>
          </div>
          <span className="text-[11px] text-gray-400 mt-1">
            {stats.totalRecords} jornadas registradas
          </span>
        </div>

        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-brand-500">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Horas Ordinarias
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand-600 dark:text-brand-400 font-mono tabular-nums">
              {stats.regularHours.toFixed(1)}
            </span>
            <span className="text-xs text-gray-400">hs</span>
          </div>
          <span className="text-[11px] text-gray-400 mt-1">
            Base pactada: {standardHoursPerDay} hs / día
          </span>
        </div>

        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-amber-500">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Horas Extras
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {stats.overtimeHours.toFixed(1)}
            </span>
            <span className="text-xs text-gray-400">hs</span>
          </div>
          <span className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
            Excedente a liquidar
          </span>
        </div>

        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-red-500">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Turnos con Anomalía
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-600 dark:text-red-400 font-mono tabular-nums">
              {stats.anomalousCount}
            </span>
            <span className="text-xs text-gray-400">turnos</span>
          </div>
          <span className="text-[11px] text-red-500 dark:text-red-400 mt-1">
            {stats.anomalousCount > 0 ? 'Sin check-out o >12 hs' : 'Sin desvíos detectados'}
          </span>
        </div>
      </div>

      {/* Barra de Filtros y Rango de Fechas */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
            <Filter size={14} className="text-brand-500" />
            <span>Filtros de Período y Parámetros</span>
          </div>

          {/* Accesos rápidos de fechas */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setQuickRange('this_month')}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 text-gray-700 dark:text-gray-300 transition-colors"
            >
              Este Mes
            </button>
            <button
              onClick={() => setQuickRange('first_half')}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 text-gray-700 dark:text-gray-300 transition-colors"
            >
              1ra Quincena
            </button>
            <button
              onClick={() => setQuickRange('second_half')}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 text-gray-700 dark:text-gray-300 transition-colors"
            >
              2da Quincena
            </button>
            <button
              onClick={() => setQuickRange('prev_month')}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 text-gray-700 dark:text-gray-300 transition-colors"
            >
              Mes Anterior
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Fecha Desde
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Fecha Hasta
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Técnico
            </label>
            <select
              value={selectedTechId}
              onChange={(e) => setSelectedTechId(e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            >
              <option value="all">Todos los técnicos ({technicians.length})</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Jornada Estándar Base
            </label>
            <select
              value={standardHoursPerDay}
              onChange={(e) => setStandardHoursPerDay(Number(e.target.value))}
              className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono tabular-nums"
            >
              <option value={8}>8 horas / día (44hs sem.)</option>
              <option value={9}>9 horas / día (45hs sem.)</option>
              <option value={6}>6 horas / día (Part-time)</option>
            </select>
          </div>
        </div>

        {/* Filtro secundario por estado del turno */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-slate-800">
          <span className="text-xs text-gray-400">Mostrar:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              Todos ({processedShifts.length})
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                statusFilter === 'completed'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              Finalizados ({processedShifts.filter((s) => !s.isOngoing).length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                statusFilter === 'active'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
              }`}
            >
              En Curso ({stats.activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('anomalous')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                statusFilter === 'anomalous'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100'
              }`}
            >
              Anomalías ({stats.anomalousCount})
            </button>
          </div>
        </div>
      </div>

      {/* Tabla Principal */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredShifts.length === 0 ? (
          <div className="p-12 text-center text-gray-400 dark:text-gray-500 space-y-2">
            <Clock size={36} className="mx-auto opacity-30" />
            <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
              No se registran jornadas en el período seleccionado
            </p>
            <p className="text-xs">
              Modificá el rango de fechas o el técnico seleccionado para ver registros anteriores.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-slate-800/80 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-slate-800">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Técnico</th>
                  <th className="py-3 px-4 text-center">Ingreso</th>
                  <th className="py-3 px-4 text-center">Egreso</th>
                  <th className="py-3 px-4 text-right">Ordinarias</th>
                  <th className="py-3 px-4 text-right">Extras</th>
                  <th className="py-3 px-4 text-right">Total Horas</th>
                  <th className="py-3 px-4">Estado / Diagnóstico</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-xs">
                {filteredShifts.map((shift) => {
                  return (
                    <tr
                      key={shift.id}
                      className={`hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        shift.isAnomalous
                          ? 'bg-red-50/30 dark:bg-red-950/20'
                          : ''
                      }`}
                    >
                      {/* Fecha */}
                      <td className="py-3.5 px-4 font-mono font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        {formatDate(shift.shift_date)}
                      </td>

                      {/* Técnico */}
                      <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-200 shrink-0">
                            {(shift.technician?.name || 'T')
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </div>
                          <span className="truncate max-w-[160px]">
                            {shift.technician?.name || 'Técnico'}
                          </span>
                        </div>
                      </td>

                      {/* Hora Ingreso */}
                      <td className="py-3.5 px-4 text-center font-mono tabular-nums text-gray-700 dark:text-gray-300">
                        <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800">
                          {formatTime(shift.checkInDate)} hs
                        </span>
                      </td>

                      {/* Hora Egreso */}
                      <td className="py-3.5 px-4 text-center font-mono tabular-nums">
                        {shift.isOngoing ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            En Curso
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300">
                            {formatTime(shift.checkOutDate)} hs
                          </span>
                        )}
                      </td>

                      {/* Horas Ordinarias */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 font-medium">
                        {shift.regularHours.toFixed(2)} hs
                      </td>

                      {/* Horas Extras */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {shift.overtimeHours > 0 ? (
                          <span className="font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/50">
                            +{shift.overtimeHours.toFixed(2)} hs
                          </span>
                        ) : (
                          <span className="text-gray-400">0.00 hs</span>
                        )}
                      </td>

                      {/* Horas Totales */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-gray-900 dark:text-white">
                        {shift.totalHoursDecimal.toFixed(2)} hs
                      </td>

                      {/* Estado / Diagnóstico */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {shift.isAnomalous ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800">
                              <AlertTriangle size={11} className="shrink-0" />
                              <span>Sin Check-out (&gt;12hs)</span>
                            </span>
                          ) : shift.isOngoing ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <span>Jornada Activa</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <CheckCircle2 size={11} className="text-emerald-500" />
                              <span>Completado</span>
                            </span>
                          )}

                          {shift.isLateCheckIn && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40 font-medium">
                              Ingreso tardío
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-center">
                        {shift.isAnomalous ? (
                          <button
                            onClick={() => handleForceCloseShift(shift.id)}
                            className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-xs"
                            title="Finalizar turno administrativamente ahora"
                          >
                            Cerrar Turno
                          </button>
                        ) : (
                          <span className="text-gray-300 dark:text-slate-600 text-xs">—</span>
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
