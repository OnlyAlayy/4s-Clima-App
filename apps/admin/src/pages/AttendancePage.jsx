import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Calendar,
  Users,
  Download,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Search,
  ChevronRight,
  Sparkles,
  XCircle,
  HelpCircle,
  DollarSign,
  Calculator,
  Plus,
  FileText,
  CreditCard,
  Briefcase,
  TrendingDown,
  TrendingUp,
  Wallet,
  Receipt,
  Trash2,
  Eye,
  Check,
  X,
  Layers,
  Edit2,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { supabase } from '@4s-clima/shared/supabase';
import { formatCurrency, formatDate, formatLocalDate as formatLocalDateShared, formatTime } from '@4s-clima/shared/utils';
import { generateSettlementPDF, openAndDownloadPDF } from '../services/pdfService';

/**
 * Helper seguro para formatear fechas YYYY-MM-DD sin sufrir el desfase de -3 horas (UTC-3).
 */
const formatLocalDate = (dateStr) => {
  if (!dateStr) return '—';
  if (typeof dateStr === 'string') {
    const cleanDate = dateStr.split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [y, m, d] = parts;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }
  const d = new Date(typeof dateStr === 'string' && dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
};

/**
 * Formato 24 hs limpio en una sola línea (ej. 10:21 hs / 12:17 hs).
 */
const formatTime24 = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} hs`;
};

/**
 * Formato legible de horas y minutos Xh Ym (ej: 1.933 hs -> 1h 56m, < 1m, —).
 */
const formatDurationHuman = (hoursDecimal) => {
  if (hoursDecimal == null || isNaN(hoursDecimal) || hoursDecimal <= 0) {
    return '—';
  }
  const totalMinutes = Math.round(hoursDecimal * 60);
  if (totalMinutes < 1) {
    return '< 1m';
  }
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
};

/**
 * Panel Integral de Control de Asistencia, Liquidaciones Mixtas y Adelantos a Cuenta.
 * Gestiona el cómputo de horas laborales, el cruce con pagos por obra (Módulos Walter),
 * el registro de anticipos en pesos (ej. $500.000) y la emisión oficial de liquidaciones.
 */
export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState('shifts'); // 'shifts' | 'settlement' | 'advances'
  const [isLoading, setIsLoading] = useState(true);
  const [technicians, setTechnicians] = useState([]);

  // ==========================================
  // TAB 1: ASISTENCIA Y JORNADAS
  // ==========================================
  const [shifts, setShifts] = useState([]);
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(todayStr);
  const [periodPreset, setPeriodPreset] = useState('this_month'); // 'this_month' | 'first_half' | 'second_half' | 'prev_month' | 'custom'
  const [selectedTechId, setSelectedTechId] = useState('all');
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(8); // 8 o 9 hs estándar
  const [expectedStartHour, setExpectedStartHour] = useState('auto'); // 'auto' | 'free' | '8' | '8.5' | '9'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'completed' | 'anomalous'
  const [hideMicroShifts, setHideMicroShifts] = useState(true); // Ocultar pruebas < 1 min por defecto

  // ==========================================
  // TAB 2: LIQUIDACIÓN MIXTA Y SUELDOS
  // ==========================================
  const [settlementTechId, setSettlementTechId] = useState('');
  const [settlementStartDate, setSettlementStartDate] = useState(firstDayOfMonth);
  const [settlementEndDate, setSettlementEndDate] = useState(todayStr);
  const [hourlyRateRegular, setHourlyRateRegular] = useState(12000);
  const [hourlyRateOvertime, setHourlyRateOvertime] = useState(18000);
  const [settlementStandardHours, setSettlementStandardHours] = useState(8);
  const [isCalculatingPreview, setIsCalculatingPreview] = useState(false);
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);
  const [advanceDeductions, setAdvanceDeductions] = useState({});

  // Datos calculados para la vista previa de liquidación
  const [previewHours, setPreviewHours] = useState({ regular: 0, overtime: 0, subtotal: 0, shifts: [] });
  const [previewOrders, setPreviewOrders] = useState([]);
  const [previewAdvances, setPreviewAdvances] = useState([]);
  const [historicalSettlements, setHistoricalSettlements] = useState([]);
  const [selectedSettlementForDetail, setSelectedSettlementForDetail] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Modal para Marcar Liquidación como Pagada
  const [isPaySettlementModalOpen, setIsPaySettlementModalOpen] = useState(false);
  const [settlementToPay, setSettlementToPay] = useState(null);
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState('Transferencia Bancaria');
  const [settlementPaymentRef, setSettlementPaymentRef] = useState('');
  const [settlementPaymentNotes, setSettlementPaymentNotes] = useState('');

  // ==========================================
  // TAB 1 (MODAL): CIERRE / EDICIÓN / REGISTRO MANUAL DE TURNO
  // ==========================================
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftModalMode, setShiftModalMode] = useState('close'); // 'close' | 'edit' | 'manual'
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [shiftModalData, setShiftModalData] = useState({
    id: null,
    technician_id: '',
    technician_name: '',
    shift_date: todayStr,
    check_in_at: '',
    check_out_at: '',
    admin_notes: '',
    overtime_approved: true,
    custom_overtime_hours: '',
  });

  // ==========================================
  // TAB 3: ADELANTOS A CUENTA
  // ==========================================
  const [advances, setAdvances] = useState([]);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isSavingAdvance, setIsSavingAdvance] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    technician_id: '',
    amount: '',
    advance_date: todayStr,
    payment_method: 'transferencia',
    reference: '',
    notes: '',
  });

  // Cargar lista de técnicos
  useEffect(() => {
    async function loadTechs() {
      const { data } = await supabase
        .from('users')
        .select('id, name, email, hourly_rate_regular, hourly_rate_overtime')
        .eq('role', 'tecnico')
        .order('name');
      setTechnicians(data || []);
      if (data && data.length > 0 && !settlementTechId) {
        setSettlementTechId(data[0].id);
      }
    }
    loadTechs();
  }, []);

  // Sincronizar tarifas pactadas según el técnico seleccionado en liquidación
  useEffect(() => {
    if (!settlementTechId || technicians.length === 0) return;
    const tech = technicians.find((t) => t.id === settlementTechId);
    if (tech) {
      const reg = tech.hourly_rate_regular ? Number(tech.hourly_rate_regular) : 12000;
      const over = tech.hourly_rate_overtime
        ? Number(tech.hourly_rate_overtime)
        : Math.round(reg * 1.5);
      setHourlyRateRegular(reg);
      setHourlyRateOvertime(over);
    }
  }, [settlementTechId, technicians]);

  // Actualización silenciosa de las tarifas del técnico en segundo plano
  const updateTechnicianRatesSilently = useCallback(
    async (techId, regRate, overRate) => {
      if (!techId || !regRate || regRate <= 0) return;
      try {
        const payload = {
          hourly_rate_regular: Number(regRate),
          hourly_rate_overtime: overRate && overRate > 0 ? Number(overRate) : Math.round(Number(regRate) * 1.5),
        };
        await supabase
          .from('users')
          .update(payload)
          .eq('id', techId);

        // Actualizar en el estado local de técnicos para recordar la última tarifa
        setTechnicians((prev) =>
          prev.map((t) => (t.id === techId ? { ...t, ...payload } : t))
        );

        // Si es el técnico de la pestaña de liquidación, actualizar inputs
        if (settlementTechId === techId) {
          setHourlyRateRegular(payload.hourly_rate_regular);
          setHourlyRateOvertime(payload.hourly_rate_overtime);
        }

        // Actualizar también en shifts si ya están cargados
        setShifts((prev) =>
          prev.map((s) =>
            s.technician_id === techId
              ? { ...s, technician: { ...s.technician, ...payload } }
              : s
          )
        );
      } catch (e) {
        console.warn('No se pudo guardar la tarifa del técnico en segundo plano:', e);
      }
    },
    [settlementTechId]
  );

  // ==========================================
  // MODAL NATIVO: TARIFAS HORARIAS DE TÉCNICOS
  // ==========================================
  const [isRatesModalOpen, setIsRatesModalOpen] = useState(false);
  const [ratesModalTechId, setRatesModalTechId] = useState('');
  const [ratesModalRegular, setRatesModalRegular] = useState(12000);
  const [ratesModalOvertime, setRatesModalOvertime] = useState(18000);
  const [isSavingRates, setIsSavingRates] = useState(false);

  const handleOpenRatesModal = useCallback((techParam = null) => {
    if (technicians.length === 0) return;
    let target = techParam;
    if (!target || !target.id) {
      target =
        technicians.find((t) => t.id === selectedTechId) ||
        technicians.find((t) => t.id === settlementTechId) ||
        technicians[0];
    }
    const reg = target?.hourly_rate_regular ? Number(target.hourly_rate_regular) : 12000;
    const over = target?.hourly_rate_overtime ? Number(target.hourly_rate_overtime) : Math.round(reg * 1.5);

    setRatesModalTechId(target.id);
    setRatesModalRegular(reg);
    setRatesModalOvertime(over);
    setIsRatesModalOpen(true);
  }, [technicians, selectedTechId, settlementTechId]);

  const handleRatesTechChange = (newTechId) => {
    setRatesModalTechId(newTechId);
    const chosen = technicians.find((t) => t.id === newTechId);
    if (chosen) {
      const reg = chosen.hourly_rate_regular ? Number(chosen.hourly_rate_regular) : 12000;
      const over = chosen.hourly_rate_overtime ? Number(chosen.hourly_rate_overtime) : Math.round(reg * 1.5);
      setRatesModalRegular(reg);
      setRatesModalOvertime(over);
    }
  };

  const handleRatesRegularChange = (val) => {
    const num = val === '' ? '' : Number(val);
    setRatesModalRegular(num);
    if (num && num > 0) {
      setRatesModalOvertime(Math.round(num * 1.5));
    }
  };

  const handleSaveRatesModal = async (e) => {
    if (e) e.preventDefault();
    const regNum = Number(ratesModalRegular);
    const overNum = Number(ratesModalOvertime);

    if (!regNum || regNum <= 0) {
      Swal.fire('Tarifa requerida', 'Por favor ingresá una tarifa ordinaria válida mayor a 0.', 'warning');
      return;
    }

    setIsSavingRates(true);
    try {
      await updateTechnicianRatesSilently(
        ratesModalTechId,
        regNum,
        overNum > 0 ? overNum : Math.round(regNum * 1.5)
      );

      setIsRatesModalOpen(false);
      const chosenTech = technicians.find((t) => t.id === ratesModalTechId);
      Swal.fire({
        icon: 'success',
        title: 'Tarifas Actualizadas',
        text: `${chosenTech?.name || 'Técnico'}: Ordinaria $${regNum.toLocaleString('es-AR')} • Extra $${(overNum > 0 ? overNum : Math.round(regNum * 1.5)).toLocaleString('es-AR')}`,
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire('Error', 'No se pudieron actualizar las tarifas: ' + err.message, 'error');
    } finally {
      setIsSavingRates(false);
    }
  };

  // Cargar turnos de asistencia
  const loadShifts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email, phone, default_entry_time, hourly_rate_regular, hourly_rate_overtime');
      const usersMap = {};
      (usersData || []).forEach((u) => {
        usersMap[u.id] = u;
      });

      // Obtener primera orden del día para cada técnico (para detección inteligente de horario pactado con cliente)
      let ordersQuery = supabase
        .from('work_orders')
        .select('id, order_number, scheduled_date, scheduled_time, assigned_to')
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .not('scheduled_time', 'is', null)
        .order('scheduled_time', { ascending: true });

      if (selectedTechId !== 'all') {
        ordersQuery = ordersQuery.eq('assigned_to', selectedTechId);
      }

      const { data: ordersData } = await ordersQuery;
      const firstOrdersMap = {};
      (ordersData || []).forEach((ord) => {
        const key = `${ord.assigned_to}_${ord.scheduled_date}`;
        if (!firstOrdersMap[key]) {
          firstOrdersMap[key] = ord;
        }
      });

      let query = supabase
        .from('technician_shifts')
        .select('*')
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .order('shift_date', { ascending: false })
        .order('check_in_at', { ascending: false });

      if (selectedTechId !== 'all') {
        query = query.eq('technician_id', selectedTechId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const shiftsWithTech = (data || []).map((s) => ({
        ...s,
        technician: usersMap[s.technician_id] || { name: 'Técnico', email: '', default_entry_time: null },
        editor: s.edited_by ? usersMap[s.edited_by] : null,
        firstOrder: firstOrdersMap[`${s.technician_id}_${s.shift_date}`] || null,
      }));

      setShifts(shiftsWithTech);
    } catch (err) {
      console.error('Error cargando turnos de asistencia:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, selectedTechId]);

  // Cargar adelantos
  const loadAdvances = useCallback(async () => {
    try {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email');
      const usersMap = {};
      (usersData || []).forEach((u) => {
        usersMap[u.id] = u;
      });

      const { data, error } = await supabase
        .from('technician_advances')
        .select('*')
        .order('advance_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const advancesWithTech = (data || []).map((adv) => ({
        ...adv,
        technician: usersMap[adv.technician_id] || { name: 'Técnico', email: '' },
      }));

      setAdvances(advancesWithTech);
    } catch (err) {
      console.error('Error cargando adelantos:', err);
    }
  }, []);

  // Cargar liquidaciones históricas
  const loadSettlements = useCallback(async () => {
    try {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email');
      const usersMap = {};
      (usersData || []).forEach((u) => {
        usersMap[u.id] = u;
      });

      const { data, error } = await supabase
        .from('technician_settlements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const settlementsWithTech = (data || []).map((s) => ({
        ...s,
        technician: usersMap[s.technician_id] || { name: 'Técnico', email: '' },
      }));

      setHistoricalSettlements(settlementsWithTech);
    } catch (err) {
      console.error('Error cargando liquidaciones:', err);
    }
  }, []);

  useEffect(() => {
    loadShifts();
    loadAdvances();
    loadSettlements();

    const channel = supabase
      .channel('attendance-payroll-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technician_shifts' },
        () => loadShifts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technician_advances' },
        () => loadAdvances()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technician_settlements' },
        () => loadSettlements()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadShifts, loadAdvances, loadSettlements]);

  // Cómputo de horas para Tab 1
  const processedShifts = useMemo(() => {
    const now = new Date();

    return shifts.map((shift) => {
      const checkIn = new Date(shift.check_in_at);
      const checkOut = shift.check_out_at ? new Date(shift.check_out_at) : null;

      let durationMs = 0;
      let isOngoing = shift.status === 'active';

      if (checkOut) {
        durationMs = Math.max(0, checkOut.getTime() - checkIn.getTime());
      } else if (isOngoing) {
        durationMs = Math.max(0, now.getTime() - checkIn.getTime());
      }

      const totalHoursDecimal = durationMs / (1000 * 60 * 60);

      const isOvertimeApproved = shift.overtime_approved !== false;
      const hasCustomOvertime =
        shift.custom_overtime_hours !== null &&
        shift.custom_overtime_hours !== undefined &&
        shift.custom_overtime_hours !== '' &&
        !isNaN(Number(shift.custom_overtime_hours));

      let regularHours = 0;
      let rawOvertimeHours = 0;
      let overtimeHours = 0;

      if (totalHoursDecimal <= standardHoursPerDay) {
        regularHours = totalHoursDecimal;
        rawOvertimeHours = 0;
        if (hasCustomOvertime && isOvertimeApproved) {
          overtimeHours = Math.max(0, Number(shift.custom_overtime_hours));
        } else {
          overtimeHours = 0;
        }
      } else {
        regularHours = standardHoursPerDay;
        rawOvertimeHours = totalHoursDecimal - standardHoursPerDay;
        if (!isOvertimeApproved) {
          overtimeHours = 0;
        } else if (hasCustomOvertime) {
          overtimeHours = Math.max(0, Number(shift.custom_overtime_hours));
        } else {
          overtimeHours = rawOvertimeHours;
        }
      }

      const isOvertimeDismissed = !isOvertimeApproved && rawOvertimeHours > 0;

      const isAnomalous =
        (isOngoing && totalHoursDecimal > 12) ||
        (isOngoing && shift.shift_date < todayStr);

      // Determinación de horario designado
      let expectedTimeStr = null;
      let expectedSource = null;

      if (expectedStartHour === 'auto') {
        // Inteligente: Prevalece la 1ra Orden del día con hora asignada; si no, el horario habitual del técnico
        if (shift.firstOrder?.scheduled_time) {
          expectedTimeStr = shift.firstOrder.scheduled_time.slice(0, 5);
          expectedSource = `1ra OT ${shift.firstOrder.order_number || ''}`.trim();
        } else if (shift.technician?.default_entry_time) {
          expectedTimeStr = shift.technician.default_entry_time.slice(0, 5);
          expectedSource = 'Ficha Técnico';
        }
      } else if (expectedStartHour === 'free') {
        expectedTimeStr = null;
        expectedSource = null;
      } else {
        const numH = parseFloat(expectedStartHour);
        const hh = String(Math.floor(numH)).padStart(2, '0');
        const mm = String(Math.round((numH % 1) * 60)).padStart(2, '0');
        expectedTimeStr = `${hh}:${mm}`;
        expectedSource = 'Filtro Manual';
      }

      let isLateCheckIn = false;
      let delayMinutes = 0;
      let thresholdTimeStr = null;

      if (expectedTimeStr) {
        const [expH, expM] = expectedTimeStr.split(':').map(Number);
        const expDecimal = expH + (expM || 0) / 60;
        const thresholdHour = expDecimal + (15 / 60); // +15 min de tolerancia
        const checkInHour = checkIn.getHours() + checkIn.getMinutes() / 60;

        if (checkInHour > thresholdHour) {
          isLateCheckIn = true;
          delayMinutes = Math.round((checkInHour - expDecimal) * 60);
        }

        const thH = String(Math.floor(thresholdHour)).padStart(2, '0');
        const thM = String(Math.round((thresholdHour % 1) * 60)).padStart(2, '0');
        thresholdTimeStr = `${thH}:${thM}`;
      }

      return {
        ...shift,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        totalHoursDecimal,
        regularHours,
        overtimeHours,
        rawOvertimeHours,
        isOvertimeApproved,
        hasCustomOvertime,
        isOvertimeDismissed,
        isOngoing,
        isAnomalous,
        expectedTimeStr,
        expectedSource,
        isLateCheckIn,
        delayMinutes,
        thresholdTimeStr,
      };
    });
  }, [shifts, standardHoursPerDay, todayStr, expectedStartHour]);

  const filteredShifts = useMemo(() => {
    return processedShifts.filter((s) => {
      // Filtrar micro-fichajes menores a 1 minuto si está activo (excepto si están en curso)
      if (hideMicroShifts && !s.isOngoing && s.totalHoursDecimal < 1 / 60) {
        return false;
      }
      if (statusFilter === 'active') return s.isOngoing;
      if (statusFilter === 'completed') return !s.isOngoing;
      if (statusFilter === 'anomalous') return s.isAnomalous;
      return true;
    });
  }, [processedShifts, statusFilter, hideMicroShifts]);

  const stats = useMemo(() => {
    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;
    let anomalousCount = 0;
    let activeCount = 0;
    let relevantCount = 0;

    processedShifts.forEach((s) => {
      if (hideMicroShifts && !s.isOngoing && s.totalHoursDecimal < 1 / 60) {
        return;
      }
      relevantCount++;
      regularHours += s.regularHours;
      overtimeHours += s.overtimeHours;
      totalHours += s.regularHours + s.overtimeHours;
      if (s.isAnomalous) anomalousCount++;
      if (s.isOngoing) activeCount++;
    });

    return {
      totalHours,
      regularHours,
      overtimeHours,
      anomalousCount,
      activeCount,
      totalRecords: relevantCount,
    };
  }, [processedShifts, hideMicroShifts]);

  // Distribución automática de deducciones sobre adelantos en orden cronológico topeada al bruto disponible
  const autoDistributeDeductions = useCallback((advancesList, currentGross) => {
    let remainingGross = Math.max(0, currentGross);
    const newDeductions = {};

    // Orden cronológico estricto: del más antiguo al más nuevo
    const sorted = [...(advancesList || [])].sort((a, b) => {
      const da = new Date(a.advance_date || a.created_at).getTime();
      const db = new Date(b.advance_date || b.created_at).getTime();
      return da - db;
    });

    sorted.forEach((adv) => {
      const origAmount = Number(adv.amount) || 0;
      const deduction = Math.min(origAmount, Math.max(0, remainingGross));
      newDeductions[adv.id] = Math.round(deduction * 100) / 100;
      remainingGross = Math.max(0, remainingGross - deduction);
    });

    return newDeductions;
  }, []);

  // Cómputo en vivo para Liquidación Mixta (Tab 2)
  const calculateSettlementPreview = useCallback(async () => {
    if (!settlementTechId) return;
    setIsCalculatingPreview(true);

    try {
      // 1. Horas del período para el técnico seleccionado (solo turnos pendientes de liquidar)
      const { data: shiftsData } = await supabase
        .from('technician_shifts')
        .select('*')
        .eq('technician_id', settlementTechId)
        .gte('shift_date', settlementStartDate)
        .lte('shift_date', settlementEndDate)
        .eq('status', 'completed')
        .is('settlement_id', null);

      let regHs = 0;
      let overHs = 0;

      (shiftsData || []).forEach((s) => {
        if (s.check_in_at && s.check_out_at) {
          const inD = new Date(s.check_in_at);
          const outD = new Date(s.check_out_at);
          const durHs = Math.max(0, outD.getTime() - inD.getTime()) / (1000 * 60 * 60);

          const isApproved = s.overtime_approved !== false;
          const hasCustom =
            s.custom_overtime_hours !== null &&
            s.custom_overtime_hours !== undefined &&
            s.custom_overtime_hours !== '' &&
            !isNaN(Number(s.custom_overtime_hours));

          if (durHs <= standardHoursPerDay) {
            regHs += durHs;
            if (isApproved && hasCustom) {
              overHs += Math.max(0, Number(s.custom_overtime_hours));
            }
          } else {
            regHs += standardHoursPerDay;
            const rawOver = durHs - standardHoursPerDay;
            if (!isApproved) {
              // Horas extras desestimadas administrativamente
            } else if (hasCustom) {
              overHs += Math.max(0, Number(s.custom_overtime_hours));
            } else {
              overHs += rawOver;
            }
          }
        }
      });

      const roundedRegHs = Number(regHs.toFixed(2));
      const roundedOverHs = Number(overHs.toFixed(2));
      const hoursSubtotal = Math.round(((roundedRegHs * hourlyRateRegular) + (roundedOverHs * hourlyRateOvertime)) * 100) / 100;
      setPreviewHours({
        regular: roundedRegHs,
        overtime: roundedOverHs,
        subtotal: hoursSubtotal,
        shifts: shiftsData || [],
      });

      // 2. Órdenes por obra / módulos completados pendientes de pago (solo con pago pactado > 0)
      const { data: ordersData } = await supabase
        .from('work_orders')
        .select(`
          id,
          order_number,
          completed_at,
          scheduled_date,
          labor_rate_type,
          technician_payout,
          observations,
          client:clients(name)
        `)
        .eq('assigned_to', settlementTechId)
        .eq('status', 'completed')
        .eq('payout_status', 'pending');

      const validOrders = (ordersData || []).filter(
        (o) => Number(o.technician_payout || 0) > 0
      );
      setPreviewOrders(validOrders);
      const pieceworkSubtotal = Math.round(
        validOrders.reduce((acc, o) => acc + (Number(o.technician_payout) || 0), 0) * 100
      ) / 100;

      // 3. Adelantos pendientes de descuento para este técnico (cronológico ascendente)
      const { data: advancesData } = await supabase
        .from('technician_advances')
        .select('*')
        .eq('technician_id', settlementTechId)
        .eq('status', 'pending')
        .lte('advance_date', settlementEndDate)
        .order('advance_date', { ascending: true })
        .order('created_at', { ascending: true });

      const advList = advancesData || [];
      setPreviewAdvances(advList);

      const grossAvailable = Math.round((hoursSubtotal + pieceworkSubtotal) * 100) / 100;
      const initialDeductions = autoDistributeDeductions(advList, grossAvailable);
      setAdvanceDeductions(initialDeductions);
    } catch (err) {
      console.error('Error calculando vista previa de liquidación:', err);
    } finally {
      setIsCalculatingPreview(false);
    }
  }, [
    settlementTechId,
    settlementStartDate,
    settlementEndDate,
    hourlyRateRegular,
    hourlyRateOvertime,
    standardHoursPerDay,
    autoDistributeDeductions,
  ]);

  useEffect(() => {
    if (activeTab === 'settlement' && settlementTechId) {
      calculateSettlementPreview();
    }
  }, [activeTab, settlementTechId, settlementStartDate, settlementEndDate, calculateSettlementPreview]);

  const handleAutoAdjustDeductions = () => {
    const gross = (previewHours.subtotal || 0) +
      Math.round(previewOrders.reduce((acc, o) => acc + (Number(o.technician_payout) || 0), 0) * 100) / 100;
    const newDeductions = autoDistributeDeductions(previewAdvances, gross);
    setAdvanceDeductions(newDeductions);
  };

  const handleZeroDeductions = () => {
    const zeros = {};
    (previewAdvances || []).forEach((adv) => {
      zeros[adv.id] = 0;
    });
    setAdvanceDeductions(zeros);
  };

  const handleDeductionChange = (advId, origAmount, val) => {
    if (val === '') {
      setAdvanceDeductions((prev) => ({ ...prev, [advId]: '' }));
      return;
    }
    const num = Number(val);
    if (isNaN(num)) return;
    const clamped = Math.min(origAmount, Math.max(0, num));
    setAdvanceDeductions((prev) => ({ ...prev, [advId]: clamped }));
  };

  const handleDeductionBlur = (advId, origAmount) => {
    setAdvanceDeductions((prev) => {
      const current = prev[advId];
      if (current === '' || current === undefined || isNaN(Number(current))) {
        return { ...prev, [advId]: 0 };
      }
      const valid = Math.min(origAmount, Math.max(0, Math.round(Number(current) * 100) / 100));
      return { ...prev, [advId]: valid };
    });
  };

  // Totales de la liquidación en preparación
  const previewTotals = useMemo(() => {
    const hoursSub = previewHours.subtotal || 0;
    const pieceworkSub = Math.round(previewOrders.reduce((acc, o) => acc + (Number(o.technician_payout) || 0), 0) * 100) / 100;
    const gross = Math.round((hoursSub + pieceworkSub) * 100) / 100;

    let totalPendingAdvancesAmount = 0;
    let effectiveDeductionsSum = 0;

    (previewAdvances || []).forEach((adv) => {
      const origAmt = Number(adv.amount) || 0;
      totalPendingAdvancesAmount += origAmt;

      const userVal = advanceDeductions[adv.id];
      const parsedVal = (userVal === undefined || userVal === '') ? 0 : Number(userVal);
      const effDeduction = Math.min(origAmt, Math.max(0, isNaN(parsedVal) ? 0 : parsedVal));
      effectiveDeductionsSum += effDeduction;
    });

    totalPendingAdvancesAmount = Math.round(totalPendingAdvancesAmount * 100) / 100;
    effectiveDeductionsSum = Math.round(effectiveDeductionsSum * 100) / 100;

    // Saldo remanente de deuda total que queda para próximas liquidaciones
    const remainingDebtTotal = Math.max(0, Math.round((totalPendingAdvancesAmount - effectiveDeductionsSum) * 100) / 100);

    // Neto a pagar = Bruto - deducciones efectivas de hoy
    const rawNet = Math.round((gross - effectiveDeductionsSum) * 100) / 100;
    const net = Math.max(0, rawNet);

    const hasWorkToSettle = (previewHours.regular > 0 || previewHours.overtime > 0 || previewOrders.length > 0);

    return {
      hoursSubtotal: hoursSub,
      pieceworkSubtotal: pieceworkSub,
      grossTotal: gross,
      totalPendingAdvancesAmount,
      totalSelectedPending: totalPendingAdvancesAmount,
      advancesSubtotal: effectiveDeductionsSum,
      remainingDebtTotal,
      remainingAdvancesBalance: remainingDebtTotal,
      netTotal: net,
      hasWorkToSettle,
    };
  }, [previewHours, previewOrders, previewAdvances, advanceDeductions]);

  // Guardar Liquidación Oficial
  const handleSaveSettlement = async () => {
    if (!settlementTechId) {
      Swal.fire('Atención', 'Seleccioná un técnico para emitir la liquidación.', 'warning');
      return;
    }

    if (!previewTotals.hasWorkToSettle) {
      Swal.fire(
        'Sin Horas ni Obras',
        'No existen jornadas u órdenes de trabajo pendientes para liquidar en este período.',
        'warning'
      );
      return;
    }

    const techObj = technicians.find((t) => t.id === settlementTechId);
    const techName = techObj?.name || 'el técnico seleccionado';

    const confirmRes = await Swal.fire({
      title: '¿Emitir Liquidación Oficial?',
      html: `
        <div class="text-left text-sm space-y-2">
          <p>Técnico: <b>${techName}</b></p>
          <p>Período: <b>${formatLocalDate(settlementStartDate)} al ${formatLocalDate(settlementEndDate)}</b></p>
          <hr class="my-2"/>
          <p>Subtotal Horas: <b>${formatCurrency(previewTotals.hoursSubtotal)}</b></p>
          <p>Subtotal Obras: <b>${formatCurrency(previewTotals.pieceworkSubtotal)}</b></p>
          <p class="text-red-600 font-semibold">Adelantos a Deducir Hoy: <b>-${formatCurrency(previewTotals.advancesSubtotal)}</b></p>
          ${
            previewTotals.remainingDebtTotal > 0
              ? `<div class="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-900 mt-1">
                  De ${formatCurrency(previewTotals.totalPendingAdvancesAmount)} de deuda total — Quedan <b>${formatCurrency(previewTotals.remainingDebtTotal)}</b> pendientes para próxima liquidación.
                </div>`
              : ''
          }
          <p class="text-emerald-600 font-bold text-base mt-2">Total Neto a Pagar: ${formatCurrency(previewTotals.netTotal)}</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, Emitir y Consolidar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
    });

    if (!confirmRes.isConfirmed) return;

    setIsSubmittingSettlement(true);
    try {
      // Guardar tarifas silenciosamente para este técnico en users
      updateTechnicianRatesSilently(settlementTechId, hourlyRateRegular, hourlyRateOvertime);

      const now = new Date();
      const settlementNumber = `LIQ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`;

      // 1. Insertar en technician_settlements
      const { data: newSettlement, error: setErr } = await supabase
        .from('technician_settlements')
        .insert({
          settlement_number: settlementNumber,
          technician_id: settlementTechId,
          period_start: settlementStartDate,
          period_end: settlementEndDate,
          settlement_type: 'mixed',
          total_regular_hours: previewHours.regular,
          hourly_rate_regular: hourlyRateRegular,
          total_overtime_hours: previewHours.overtime,
          hourly_rate_overtime: hourlyRateOvertime,
          hours_subtotal: previewTotals.hoursSubtotal,
          piecework_subtotal: previewTotals.pieceworkSubtotal,
          advances_subtotal: previewTotals.advancesSubtotal,
          gross_total: previewTotals.grossTotal,
          net_total: previewTotals.netTotal,
          status: 'approved',
          notes: `Liquidación emitida para ${techName}. Deducción de anticipos por ${formatCurrency(previewTotals.advancesSubtotal)}.`,
        })
        .select()
        .single();

      if (setErr) throw setErr;

      // 1.5. Vincular jornadas liquidadas a esta liquidación (Evitar Doble Pago)
      const shiftIds = (previewHours.shifts || []).map((s) => s.id);
      if (shiftIds.length > 0) {
        const { error: shiftLinkErr } = await supabase
          .from('technician_shifts')
          .update({ settlement_id: newSettlement.id })
          .in('id', shiftIds);
        if (shiftLinkErr) {
          console.warn('Error vinculando turnos a la liquidación:', shiftLinkErr);
        }
      }

      // 2. Insertar ítems en settlement_items si hay órdenes
      if (previewOrders.length > 0) {
        const itemsToInsert = previewOrders.map((ord) => ({
          settlement_id: newSettlement.id,
          work_order_id: ord.id,
          description: `Servicio OT ${ord.order_number || ord.id.slice(0, 8)} (${ord.client?.name || 'Cliente'})`,
          amount: Number(ord.technician_payout) || 0,
        }));
        await supabase.from('settlement_items').insert(itemsToInsert);

        // 3. Marcar work_orders como liquidadas (settled)
        const orderIds = previewOrders.map((o) => o.id);
        await supabase
          .from('work_orders')
          .update({ payout_status: 'settled' })
          .in('id', orderIds);
      }

      // 4. Procesar adelantos (Deducción al 100% o Split de saldo remanente)
      const discountedAdvancesForPDF = [];

      for (const adv of previewAdvances) {
        const origAmount = Number(adv.amount) || 0;
        const userVal = advanceDeductions[adv.id];
        const parsedVal = (userVal === undefined || userVal === '') ? 0 : Number(userVal);
        let deductedAmount = Math.min(origAmount, Math.max(0, isNaN(parsedVal) ? 0 : parsedVal));
        deductedAmount = Math.round(deductedAmount * 100) / 100;
        const remainder = Math.round((origAmount - deductedAmount) * 100) / 100;

        if (deductedAmount <= 0) {
          // No se absorbe nada hoy de este adelanto; queda en pending para próximas liquidaciones
          continue;
        }

        discountedAdvancesForPDF.push({
          ...adv,
          amount: deductedAmount,
        });

        if (remainder <= 0) {
          // Descuento al 100%
          const { error: updErr } = await supabase
            .from('technician_advances')
            .update({
              status: 'discounted',
              settlement_id: newSettlement.id,
            })
            .eq('id', adv.id);
          if (updErr) throw updErr;
        } else {
          // Descuento parcial: actualizar registro original e insertar registro nuevo con saldo remanente
          const originalNotes = adv.notes ? `${adv.notes.trim()} ` : '';
          const partialNote = `${originalNotes}(Descuento parcial de adelanto original por $${origAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })})`;

          const { error: updErr } = await supabase
            .from('technician_advances')
            .update({
              amount: deductedAmount,
              status: 'discounted',
              settlement_id: newSettlement.id,
              notes: partialNote,
            })
            .eq('id', adv.id);
          if (updErr) throw updErr;

          const advDateStr = adv.advance_date ? formatLocalDate(adv.advance_date) : 'fecha anterior';
          const remNote = `Saldo pendiente de adelanto del ${advDateStr} ($${origAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })} - $${deductedAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })} descontados en liq. ${settlementNumber})`;

          const { error: insErr } = await supabase
            .from('technician_advances')
            .insert({
              technician_id: adv.technician_id,
              advance_date: adv.advance_date,
              amount: remainder,
              payment_method: adv.payment_method || 'transferencia',
              reference: adv.reference || null,
              status: 'pending',
              settlement_id: null,
              notes: remNote,
            });
          if (insErr) throw insErr;
        }
      }

      // Recargar datos
      await Promise.all([loadSettlements(), loadAdvances(), calculateSettlementPreview()]);

      // Ofrecer descarga del PDF
      const pdfRes = await Swal.fire({
        title: 'Liquidación Emitida con Éxito',
        text: `Comprobante ${settlementNumber} generado. ¿Deseas descargar el Recibo Oficial en PDF?`,
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'Descargar Recibo PDF',
        cancelButtonText: 'Cerrar',
        confirmButtonColor: '#16a34a',
      });

      if (pdfRes.isConfirmed) {
        await openAndDownloadPDF(
          generateSettlementPDF(newSettlement, techObj, previewOrders, discountedAdvancesForPDF)
        );
      }
    } catch (err) {
      console.error('Error emitiendo liquidación:', err);
      Swal.fire('Error', 'No se pudo guardar la liquidación: ' + err.message, 'error');
    } finally {
      setIsSubmittingSettlement(false);
    }
  };

  // Registrar Nuevo Adelanto (Tab 3)
  const handleCreateAdvance = async (e) => {
    e.preventDefault();
    if (!advanceForm.technician_id) {
      Swal.fire('Atención', 'Seleccioná un técnico destinatario del adelanto.', 'warning');
      return;
    }
    const numAmount = Number(advanceForm.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Swal.fire('Atención', 'Ingresá un monto válido en pesos mayor a 0.', 'warning');
      return;
    }

    setIsSavingAdvance(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('technician_advances').insert({
        technician_id: advanceForm.technician_id,
        amount: numAmount,
        advance_date: advanceForm.advance_date || todayStr,
        payment_method: advanceForm.payment_method,
        reference: advanceForm.reference.trim() || null,
        notes: advanceForm.notes.trim() || null,
        status: 'pending',
        created_by: user?.id || null,
      });

      if (error) throw error;

      Swal.fire({
        title: 'Adelanto Registrado',
        text: `Se registraron ${formatCurrency(numAmount)} para el técnico. Quedará pendiente de descuento en su próxima liquidación.`,
        icon: 'success',
        timer: 2500,
        showConfirmButton: false,
      });

      setAdvanceForm({
        technician_id: technicians[0]?.id || '',
        amount: '',
        advance_date: todayStr,
        payment_method: 'transferencia',
        reference: '',
        notes: '',
      });
      setIsAdvanceModalOpen(false);
      await loadAdvances();
    } catch (err) {
      console.error('Error registrando adelanto:', err);
      Swal.fire('Error', 'No se pudo registrar el adelanto: ' + err.message, 'error');
    } finally {
      setIsSavingAdvance(false);
    }
  };

  // Eliminar / Anular Adelanto
  const handleDeleteAdvance = async (advance) => {
    if (advance.status === 'discounted') {
      Swal.fire('No permitido', 'Este adelanto ya fue descontado en una liquidación emitida.', 'info');
      return;
    }

    const confirmRes = await Swal.fire({
      title: '¿Anular este adelanto?',
      text: `Se eliminará el adelanto de ${formatCurrency(advance.amount)} a nombre de ${advance.technician?.name}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });

    if (!confirmRes.isConfirmed) return;

    try {
      const { error } = await supabase
        .from('technician_advances')
        .delete()
        .eq('id', advance.id);

      if (error) throw error;
      Swal.fire('Anulado', 'El adelanto ha sido eliminado del sistema.', 'success');
      loadAdvances();
    } catch (err) {
      Swal.fire('Error', 'No se pudo anular: ' + err.message, 'error');
    }
  };

  // Marcar Liquidación como Pagada
  const handleMarkSettlementPaid = async () => {
    if (!settlementToPay) return;
    try {
      const { error } = await supabase
        .from('technician_settlements')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: settlementPaymentMethod,
          payment_reference: settlementPaymentRef.trim() || null,
          notes: settlementPaymentNotes.trim()
            ? `${settlementToPay.notes || ''}\nPago: ${settlementPaymentNotes.trim()}`
            : settlementToPay.notes,
        })
        .eq('id', settlementToPay.id);

      if (error) throw error;

      Swal.fire('Liquidación Pagada', 'El comprobante ha sido marcado como pagado exitosamente.', 'success');
      setIsPaySettlementModalOpen(false);
      setSettlementToPay(null);
      loadSettlements();
    } catch (err) {
      Swal.fire('Error', 'No se pudo actualizar el pago: ' + err.message, 'error');
    }
  };

  // Descargar PDF de Liquidación Existente
  const handleDownloadHistoricalSettlementPDF = async (settlement) => {
    try {
      // Cargar ítems y adelantos asociados
      const { data: items } = await supabase
        .from('settlement_items')
        .select('*')
        .eq('settlement_id', settlement.id);

      const { data: advs } = await supabase
        .from('technician_advances')
        .select('*')
        .eq('settlement_id', settlement.id);

      await openAndDownloadPDF(
        generateSettlementPDF(settlement, settlement.technician, items || [], advs || [])
      );
    } catch (err) {
      console.error('Error al descargar PDF:', err);
      Swal.fire('Error', 'No se pudo generar el documento PDF.', 'error');
    }
  };

  // Helpers para conversión datetime-local <-> ISO
  const toLocalDatetimeInput = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleOpenCloseShiftModal = (shift) => {
    const shiftDate = shift.shift_date;
    const checkIn = new Date(shift.check_in_at);
    const now = new Date();
    const diffHours = (now - checkIn) / (1000 * 60 * 60);

    // Sugerencia inteligente: Si es de día anterior o colgado >10h, sugerir 18:00 del mismo shift_date
    let suggestedOut = '';
    if (shiftDate < todayStr || diffHours > 10) {
      suggestedOut = `${shiftDate}T18:00`;
    } else {
      suggestedOut = toLocalDatetimeInput(now.toISOString());
    }

    setShiftModalMode('close');
    setShiftModalData({
      id: shift.id,
      technician_id: shift.technician_id,
      technician_name: shift.technician?.name || 'Técnico',
      shift_date: shiftDate,
      check_in_at: toLocalDatetimeInput(shift.check_in_at),
      check_out_at: suggestedOut,
      admin_notes: 'Cierre administrativo: jornada finalizada en horario habitual pactado.',
      overtime_approved: shift.overtime_approved !== false,
      custom_overtime_hours: shift.custom_overtime_hours !== null && shift.custom_overtime_hours !== undefined ? String(shift.custom_overtime_hours) : '',
    });
    setIsShiftModalOpen(true);
  };

  const handleOpenEditShiftModal = (shift) => {
    setShiftModalMode('edit');
    setShiftModalData({
      id: shift.id,
      technician_id: shift.technician_id,
      technician_name: shift.technician?.name || 'Técnico',
      shift_date: shift.shift_date,
      check_in_at: toLocalDatetimeInput(shift.check_in_at),
      check_out_at: toLocalDatetimeInput(shift.check_out_at),
      admin_notes: shift.admin_notes || '',
      overtime_approved: shift.overtime_approved !== false,
      custom_overtime_hours: shift.custom_overtime_hours !== null && shift.custom_overtime_hours !== undefined ? String(shift.custom_overtime_hours) : '',
    });
    setIsShiftModalOpen(true);
  };

  const handleOpenManualShiftModal = () => {
    const defaultTechId = selectedTechId !== 'all' ? selectedTechId : (technicians[0]?.id || '');
    setShiftModalMode('manual');
    setShiftModalData({
      id: null,
      technician_id: defaultTechId,
      technician_name: technicians.find((t) => t.id === defaultTechId)?.name || '',
      shift_date: todayStr,
      check_in_at: `${todayStr}T08:00`,
      check_out_at: `${todayStr}T18:00`,
      admin_notes: 'Jornada manual registrada por administración (falla de móvil / olvido de fichaje).',
      overtime_approved: true,
      custom_overtime_hours: '',
    });
    setIsShiftModalOpen(true);
  };

  const handleSaveShiftModal = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!shiftModalData.admin_notes || shiftModalData.admin_notes.trim().length < 5) {
      Swal.fire('Nota Obligatoria', 'Debes ingresar una nota administrativa explicando el motivo (mínimo 5 caracteres).', 'warning');
      return;
    }

    if (!shiftModalData.check_in_at) {
      Swal.fire('Ingreso Requerido', 'La fecha y hora de ingreso son obligatorias.', 'warning');
      return;
    }

    const inDate = new Date(shiftModalData.check_in_at);
    const outDate = shiftModalData.check_out_at ? new Date(shiftModalData.check_out_at) : null;

    if (outDate && outDate < inDate) {
      Swal.fire('Error Cronológico', 'La hora de egreso no puede ser anterior a la hora de ingreso.', 'error');
      return;
    }

    if ((shiftModalMode === 'manual' || shiftModalMode === 'close') && !outDate) {
      Swal.fire('Egreso Requerido', 'Debes especificar la hora de egreso.', 'warning');
      return;
    }

    setIsSavingShift(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const inIso = inDate.toISOString();
      const outIso = outDate ? outDate.toISOString() : null;
      const shiftDate = shiftModalData.check_in_at.split('T')[0];

      const customOt =
        shiftModalData.custom_overtime_hours !== '' &&
        shiftModalData.custom_overtime_hours !== null &&
        !isNaN(Number(shiftModalData.custom_overtime_hours))
          ? Number(shiftModalData.custom_overtime_hours)
          : null;

      const payload = {
        technician_id: shiftModalData.technician_id,
        shift_date: shiftDate,
        check_in_at: inIso,
        check_out_at: outIso,
        status: shiftModalMode === 'manual' ? 'completed' : (outIso ? 'completed' : 'active'),
        admin_notes: shiftModalData.admin_notes.trim(),
        edited_by: user?.id || null,
        edited_at: new Date().toISOString(),
        overtime_approved: Boolean(shiftModalData.overtime_approved),
        custom_overtime_hours: customOt,
      };

      if (shiftModalMode === 'manual') {
        const { error } = await supabase.from('technician_shifts').insert(payload);
        if (error) {
          if (error.message && (error.message.includes('overtime_approved') || error.message.includes('custom_overtime_hours'))) {
            delete payload.overtime_approved;
            delete payload.custom_overtime_hours;
            const { error: retryErr } = await supabase.from('technician_shifts').insert(payload);
            if (retryErr) throw retryErr;
          } else {
            throw error;
          }
        }
        Swal.fire('Éxito', 'Jornada manual registrada correctamente.', 'success');
      } else {
        const { error } = await supabase
          .from('technician_shifts')
          .update(payload)
          .eq('id', shiftModalData.id);

        if (error) {
          if (error.message && (error.message.includes('overtime_approved') || error.message.includes('custom_overtime_hours'))) {
            delete payload.overtime_approved;
            delete payload.custom_overtime_hours;
            const { error: retryErr } = await supabase.from('technician_shifts').update(payload).eq('id', shiftModalData.id);
            if (retryErr) throw retryErr;
          } else {
            throw error;
          }
        }
        Swal.fire(
          'Éxito',
          shiftModalMode === 'close'
            ? 'Turno cerrado administrativamente sin horas fantasmas.'
            : 'Horario y horas extras actualizados correctamente.',
          'success'
        );
      }

      setIsShiftModalOpen(false);
      loadShifts();
    } catch (err) {
      console.error('Error guardando jornada laboral:', err);
      Swal.fire('Error', 'No se pudo guardar la modificación: ' + err.message, 'error');
    } finally {
      setIsSavingShift(false);
    }
  };

  // Eliminar Jornada (Limpieza de pruebas y errores)
  const handleDeleteShift = async (shift) => {
    const techName = shift.technician?.name || 'Técnico';
    const dateFormatted = formatLocalDate(shift.shift_date);
    const durationText = formatDurationHuman(shift.totalHoursDecimal);

    const result = await Swal.fire({
      title: '¿Eliminar registro de jornada?',
      html: `
        <div class="text-left text-xs space-y-1.5 text-gray-600 dark:text-gray-300">
          <p>Técnico: <b>${techName}</b></p>
          <p>Fecha: <b>${dateFormatted}</b></p>
          <p>Duración: <b>${durationText}</b> (${shift.totalHoursDecimal.toFixed(2)} hs)</p>
          <p class="text-red-500 font-semibold mt-2">Esta acción borrará el registro de asistencia permanentemente.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });

    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from('technician_shifts')
          .delete()
          .eq('id', shift.id);

        if (error) throw error;

        Swal.fire('Eliminado', 'La jornada fue eliminada correctamente.', 'success');
        loadShifts();
      } catch (err) {
        console.error('Error eliminando jornada:', err);
        Swal.fire('Error', 'No se pudo eliminar la jornada: ' + err.message, 'error');
      }
    }
  };

  // Exportar a CSV (Tab 1)
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

    const sanitizeText = (val) => {
      if (!val) return '';
      const str = String(val).trim();
      if (/^[=+\-@]/.test(str)) {
        return `'${str}`;
      }
      return str;
    };

    const rows = filteredShifts.map((s) => [
      formatLocalDate(s.shift_date),
      `"${sanitizeText(s.technician?.name || 'Técnico')}"`,
      `"${sanitizeText(s.technician?.email || '')}"`,
      formatTime24(s.checkInDate),
      s.isOngoing ? 'En Curso' : formatTime24(s.checkOutDate),
      formatDurationHuman(s.regularHours),
      s.isOvertimeDismissed
        ? '0h 00m (Desestimada)'
        : formatDurationHuman(s.overtimeHours),
      formatDurationHuman(s.regularHours + s.overtimeHours),
      s.status === 'active' ? 'En Curso' : 'Completado',
      s.isAnomalous
        ? 'Anomalía (>12hs)'
        : s.isLateCheckIn
        ? `Ingreso Tardío (+${s.delayMinutes}m de ${s.expectedTimeStr} hs • ${s.expectedSource})`
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
    link.setAttribute('download', `asistencia_4s_clima_${startDate}_al_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Rango Rápido de Fechas
  const setQuickRange = (rangeType, target = 'shifts') => {
    const cur = new Date();
    let s = '';
    let e = '';

    if (rangeType === 'this_month') {
      s = new Date(cur.getFullYear(), cur.getMonth(), 1).toISOString().split('T')[0];
      e = cur.toISOString().split('T')[0];
    } else if (rangeType === 'first_half') {
      s = new Date(cur.getFullYear(), cur.getMonth(), 1).toISOString().split('T')[0];
      e = new Date(cur.getFullYear(), cur.getMonth(), 15).toISOString().split('T')[0];
    } else if (rangeType === 'second_half') {
      s = new Date(cur.getFullYear(), cur.getMonth(), 16).toISOString().split('T')[0];
      e = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (rangeType === 'prev_month') {
      s = new Date(cur.getFullYear(), cur.getMonth() - 1, 1).toISOString().split('T')[0];
      e = new Date(cur.getFullYear(), cur.getMonth(), 0).toISOString().split('T')[0];
    }

    if (target === 'shifts') {
      setStartDate(s);
      setEndDate(e);
      setPeriodPreset(rangeType);
    } else {
      setSettlementStartDate(s);
      setSettlementEndDate(e);
    }
  };

  const handlePeriodPresetChange = (preset) => {
    setPeriodPreset(preset);
    if (preset !== 'custom') {
      setQuickRange(preset, 'shifts');
    }
  };

  // KPIs de Adelantos (Tab 3)
  const advancesStats = useMemo(() => {
    let pendingSum = 0;
    let discountedSum = 0;
    let totalSum = 0;

    advances.forEach((a) => {
      const val = Number(a.amount) || 0;
      totalSum += val;
      if (a.status === 'pending') pendingSum += val;
      if (a.status === 'discounted') discountedSum += val;
    });

    return {
      pendingSum,
      discountedSum,
      totalSum,
      pendingCount: advances.filter((a) => a.status === 'pending').length,
    };
  }, [advances]);

  // Cálculos en vivo para el modal de turno
  const modalDurationHours = useMemo(() => {
    if (!shiftModalData.check_in_at || !shiftModalData.check_out_at) return 0;
    const inD = new Date(shiftModalData.check_in_at);
    const outD = new Date(shiftModalData.check_out_at);
    if (isNaN(inD.getTime()) || isNaN(outD.getTime()) || outD < inD) return 0;
    return (outD.getTime() - inD.getTime()) / (1000 * 60 * 60);
  }, [shiftModalData.check_in_at, shiftModalData.check_out_at]);

  const modalRawOvertimeHours = useMemo(() => {
    return modalDurationHours > standardHoursPerDay ? modalDurationHours - standardHoursPerDay : 0;
  }, [modalDurationHours, standardHoursPerDay]);

  return (
    <div className="space-y-6">
      {/* Header Principal con Acciones Rápidas */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <Clock size={26} className="text-brand-500 shrink-0" />
            <span className="truncate">Control de Asistencia, Liquidaciones y Adelantos</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-3xl">
            Auditoría de jornadas laborales, liquidación mixta (horas + obras) y deducción automática de anticipos a técnicos.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap sm:flex-nowrap justify-start sm:justify-end">
          {/* Botón rápido para configurar tarifas pactadas de los técnicos */}
          <button
            onClick={() => handleOpenRatesModal()}
            className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-medium border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-all active:scale-95 shadow-xs"
            title="Ver y configurar tarifas por hora ordinaria y extra de los técnicos"
          >
            <DollarSign size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span>Tarifas por Hora</span>
          </button>

          {activeTab === 'shifts' && (
            <>
              <button
                onClick={handleExportCSV}
                disabled={isLoading || filteredShifts.length === 0}
                className="btn-secondary flex items-center gap-1.5 py-2 px-3.5 text-xs font-medium rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50"
                title="Descargar archivo CSV compatible con Excel para auditoría"
              >
                <Download size={14} className="text-gray-500 dark:text-gray-400" />
                <span>Exportar Excel</span>
              </button>
              <button
                onClick={handleOpenManualShiftModal}
                className="btn-primary flex items-center gap-1.5 py-2 px-4 text-xs font-semibold rounded-xl shadow-sm hover:shadow transition-all active:scale-95"
                title="Cargar una jornada completa manual cuando el técnico no pudo fichar"
              >
                <Plus size={15} />
                <span>Registrar Jornada Manual</span>
              </button>
            </>
          )}

          {activeTab === 'advances' && (
            <button
              onClick={() => setIsAdvanceModalOpen(true)}
              className="btn-primary flex items-center gap-1.5 py-2 px-4 text-xs font-semibold rounded-xl shadow-sm hover:shadow transition-all active:scale-95"
              title="Registrar entrega de adelanto en pesos a un técnico"
            >
              <Plus size={15} />
              <span>Cargar Adelanto ($)</span>
            </button>
          )}
        </div>
      </div>

      {/* Navegación por Sub-Pestañas */}
      <div className="flex border-b border-gray-200 dark:border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab('shifts')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'shifts'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Clock size={16} />
          <span>Jornadas y Fichajes</span>
          <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">
            {stats.totalRecords}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('settlement')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'settlement'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Calculator size={16} />
          <span>Liquidación Mixta y Sueldos</span>
          {historicalSettlements.length > 0 && (
            <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold">
              {historicalSettlements.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('advances')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'advances'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <DollarSign size={16} />
          <span>Adelantos a Cuenta</span>
          {advancesStats.pendingCount > 0 && (
            <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-bold">
              {advancesStats.pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================= */}
      {/* PESTAÑA 1: JORNADAS Y ASISTENCIA                          */}
      {/* ========================================================= */}
      {activeTab === 'shifts' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4 flex flex-col justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Horas Totales
              </span>
              <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white font-mono tabular-nums">
                {formatDurationHuman(stats.totalHours)}
              </div>
              <span className="text-[11px] text-gray-400 mt-1">
                {stats.totalRecords} jornadas registradas
              </span>
            </div>

            <div className="card p-4 flex flex-col justify-between border-l-4 border-l-brand-500">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Horas Ordinarias
              </span>
              <div className="mt-2 text-2xl font-bold text-brand-600 dark:text-brand-400 font-mono tabular-nums">
                {formatDurationHuman(stats.regularHours)}
              </div>
              <span className="text-[11px] text-gray-400 mt-1">
                Base pactada: {standardHoursPerDay} hs / día
              </span>
            </div>

            <div className="card p-4 flex flex-col justify-between border-l-4 border-l-amber-500">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Horas Extras
              </span>
              <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                {formatDurationHuman(stats.overtimeHours)}
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

          {/* Barra Compacta Unificada de Filtros */}
          <div className="card p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Lado izquierdo: Período, Técnico y Jornada Base */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Selector de Período */}
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-brand-500 shrink-0" />
                <select
                  value={periodPreset}
                  onChange={(e) => handlePeriodPresetChange(e.target.value)}
                  className="py-1.5 px-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-medium"
                >
                  <option value="this_month">Este Mes</option>
                  <option value="first_half">1ra Quincena</option>
                  <option value="second_half">2da Quincena</option>
                  <option value="prev_month">Mes Anterior</option>
                  <option value="custom">Personalizado...</option>
                </select>
              </div>

              {/* Inputs de fecha inline solo si es Personalizado */}
              {periodPreset === 'custom' && (
                <div className="flex items-center gap-1 animate-in fade-in duration-150">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPeriodPreset('custom');
                    }}
                    className="py-1 px-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-[11px]"
                  />
                  <span className="text-gray-400 text-xs">a</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPeriodPreset('custom');
                    }}
                    className="py-1 px-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-[11px]"
                  />
                </div>
              )}

              {/* Selector de Técnico */}
              <select
                value={selectedTechId}
                onChange={(e) => setSelectedTechId(e.target.value)}
                className="py-1.5 px-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white max-w-[170px] truncate"
              >
                <option value="all">Todos los técnicos ({technicians.length})</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {/* Botón directo de tarifa si hay un técnico seleccionado */}
              {selectedTechId !== 'all' && (() => {
                const currentTech = technicians.find((t) => t.id === selectedTechId);
                if (!currentTech) return null;
                const reg = currentTech.hourly_rate_regular ? Number(currentTech.hourly_rate_regular) : 12000;
                const over = currentTech.hourly_rate_overtime ? Number(currentTech.hourly_rate_overtime) : Math.round(reg * 1.5);
                return (
                  <button
                    type="button"
                    onClick={() => handleOpenRatesModal(currentTech)}
                    className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors text-xs"
                    title="Hacé clic para ver o editar la tarifa por hora de este técnico"
                  >
                    <DollarSign size={13} className="text-emerald-600 dark:text-emerald-400" />
                    <span>${reg.toLocaleString('es-AR')}/h (${over.toLocaleString('es-AR')}/h extra)</span>
                    <Edit2 size={11} className="opacity-70 ml-0.5" />
                  </button>
                );
              })()}

              {/* Selector de Jornada Base */}
              <select
                value={standardHoursPerDay}
                onChange={(e) => setStandardHoursPerDay(Number(e.target.value))}
                className="py-1.5 px-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-medium"
                title="Jornada base diaria pactada"
              >
                <option value={8}>Base 8 hs</option>
                <option value={9}>Base 9 hs</option>
                <option value={6}>Base 6 hs</option>
              </select>

              {/* Selector de Horario de Entrada Esperado */}
              <select
                value={expectedStartHour}
                onChange={(e) => setExpectedStartHour(e.target.value)}
                className="py-1.5 px-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-medium text-xs"
                title="Modo de control de horario de ingreso"
              >
                <option value="auto">Auto (1ra OT / Ficha)</option>
                <option value="free">Entrada: Libre (Sin tope)</option>
                <option value="8">Entrada: 08:00 hs (+15m tol.)</option>
                <option value="8.5">Entrada: 08:30 hs (+15m tol.)</option>
                <option value="9">Entrada: 09:00 hs (+15m tol.)</option>
              </select>

              {/* Toggle Ocultar pruebas < 1m */}
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer select-none ml-1 pl-2 border-l border-gray-200 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={hideMicroShifts}
                  onChange={(e) => setHideMicroShifts(e.target.checked)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span>Ocultar pruebas (&lt;1m)</span>
              </label>
            </div>

            {/* Lado derecho: Píldoras de estado */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                Todos ({stats.totalRecords})
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

          {/* Tabla Principal de Fichajes */}
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
                    {filteredShifts.map((shift) => (
                      <tr
                        key={shift.id}
                        className={`hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                          shift.isAnomalous ? 'bg-red-50/30 dark:bg-red-950/20' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {formatLocalDate(shift.shift_date)}
                        </td>
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
                            <div className="flex flex-col min-w-0">
                              <span className="truncate max-w-[160px]">
                                {shift.technician?.name || 'Técnico'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenRatesModal(shift.technician)}
                                className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono text-left hover:underline flex items-center gap-0.5 mt-0.5"
                                title="Hacé clic para ver o editar las tarifas por hora pactadas para este técnico"
                              >
                                <span>${(shift.technician?.hourly_rate_regular ? Number(shift.technician.hourly_rate_regular) : 12000).toLocaleString('es-AR')}/h</span>
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono tabular-nums text-gray-700 dark:text-gray-300">
                          <span className="font-mono text-xs whitespace-nowrap">
                            {formatTime24(shift.checkInDate)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono tabular-nums">
                          {shift.isOngoing ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px] whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              En Curso
                            </span>
                          ) : (
                            <span className="font-mono text-xs whitespace-nowrap">
                              {formatTime24(shift.checkOutDate)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 font-medium whitespace-nowrap">
                          {formatDurationHuman(shift.regularHours)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          {shift.isOvertimeDismissed ? (
                            <div className="flex flex-col items-end">
                              <span
                                className="font-mono text-xs text-gray-400 line-through bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700"
                                title={`Desestimadas por administración (${formatDurationHuman(shift.rawOvertimeHours)} registradas)`}
                              >
                                {formatDurationHuman(shift.rawOvertimeHours)}
                              </span>
                              <span className="text-[9px] text-red-500 font-semibold uppercase tracking-wider mt-0.5">
                                Desestimadas
                              </span>
                            </div>
                          ) : shift.overtimeHours > 0 ? (
                            <div className="flex flex-col items-end">
                              <span
                                className="font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/50 whitespace-nowrap"
                                title={shift.hasCustomOvertime ? 'Ajustado manualmente por administración' : 'Calculado y aprobado automáticamente'}
                              >
                                +{formatDurationHuman(shift.overtimeHours)}
                              </span>
                              {shift.hasCustomOvertime && (
                                <span className="text-[9px] text-blue-500 dark:text-blue-400 font-semibold uppercase tracking-wider mt-0.5">
                                  Ajustado
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-gray-900 dark:text-white whitespace-nowrap">
                          {formatDurationHuman(shift.regularHours + shift.overtimeHours)}
                          {shift.isOvertimeDismissed && (
                            <span className="block text-[10px] text-gray-400 font-normal line-through">
                              {formatDurationHuman(shift.totalHoursDecimal)}
                            </span>
                          )}
                        </td>
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
                            {shift.isLateCheckIn ? (
                              <span 
                                className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40 font-medium whitespace-nowrap cursor-help"
                                title={`Horario designado: ${shift.expectedTimeStr} hs (${shift.expectedSource}) • Tolerancia: ${shift.thresholdTimeStr} hs • Demora: +${shift.delayMinutes} min`}
                              >
                                Ingreso tardío (+{shift.delayMinutes}m • {shift.expectedSource})
                              </span>
                            ) : shift.expectedTimeStr && !shift.isOngoing ? (
                              <span 
                                className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60 font-medium whitespace-nowrap cursor-help"
                                title={`Puntual para ${shift.expectedSource} (${shift.expectedTimeStr} hs)`}
                              >
                                A tiempo ({shift.expectedTimeStr} hs)
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {shift.status === 'active' && (
                              <button
                                onClick={() => handleOpenCloseShiftModal(shift)}
                                className="px-2 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-xs"
                                title="Finalizar turno administrativamente con horario sugerido o ajustado"
                              >
                                Cerrar
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditShiftModal(shift)}
                              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-gray-200 dark:border-slate-700"
                              title="Editar horario de ingreso o egreso de este turno"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteShift(shift)}
                              className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors border border-red-100 dark:border-red-900/40"
                              title="Eliminar registro de jornada"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          {shift.admin_notes && (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 max-w-[150px] mx-auto truncate" title={shift.admin_notes}>
                              Obs: {shift.admin_notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 2: LIQUIDACIÓN MIXTA Y SUELDOS                    */}
      {/* ========================================================= */}
      {activeTab === 'settlement' && (
        <div className="space-y-6">
          {/* Selector de Parámetros de Liquidación */}
          <div className="card p-5 space-y-4 border border-brand-100 dark:border-brand-900/40 bg-gradient-to-br from-white to-blue-50/20 dark:from-slate-900 dark:to-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="text-brand-500" size={18} />
                <span className="font-bold text-gray-900 dark:text-white text-sm">
                  Configurar Liquidación Mixta del Técnico
                </span>
              </div>

              {/* Atajos de Quincenas */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setQuickRange('first_half', 'settlement')}
                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  1ra Quincena
                </button>
                <button
                  onClick={() => setQuickRange('second_half', 'settlement')}
                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  2da Quincena
                </button>
                <button
                  onClick={() => setQuickRange('this_month', 'settlement')}
                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  Mes Completo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Técnico a Liquidar
                </label>
                <select
                  value={settlementTechId}
                  onChange={(e) => setSettlementTechId(e.target.value)}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold"
                >
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Desde
                </label>
                <input
                  type="date"
                  value={settlementStartDate}
                  onChange={(e) => setSettlementStartDate(e.target.value)}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Hasta
                </label>
                <input
                  type="date"
                  value={settlementEndDate}
                  onChange={(e) => setSettlementEndDate(e.target.value)}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Jornada Base Diaria
                </label>
                <select
                  value={standardHoursPerDay}
                  onChange={(e) => setStandardHoursPerDay(Number(e.target.value))}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-medium"
                >
                  <option value={8}>Base 8 hs / día</option>
                  <option value={9}>Base 9 hs / día</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Tarifa Hora Ordinaria ($/h)
                </label>
                <input
                  type="number"
                  value={hourlyRateRegular}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setHourlyRateRegular(val);
                    if (val > 0) {
                      setHourlyRateOvertime(Math.round(val * 1.5));
                    }
                  }}
                  onBlur={() => updateTechnicianRatesSilently(settlementTechId, hourlyRateRegular, hourlyRateOvertime)}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono"
                  placeholder="12000"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Tarifa Hora Extra ($/h)
                  </label>
                  <span className="text-[10px] text-gray-400 font-mono">1.5x</span>
                </div>
                <input
                  type="number"
                  value={hourlyRateOvertime}
                  onChange={(e) => setHourlyRateOvertime(Number(e.target.value))}
                  onBlur={() => updateTechnicianRatesSilently(settlementTechId, hourlyRateRegular, hourlyRateOvertime)}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono"
                  placeholder="18000"
                />
              </div>
            </div>
          </div>

          {/* Cómputo Consolidado y Vista Previa */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Card 1: Horas */}
            <div className="card p-4 border-l-4 border-l-blue-500">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                1. Subtotal Horas
              </span>
              <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono">
                {formatCurrency(previewTotals.hoursSubtotal)}
              </div>
              <span className="text-[11px] text-gray-500 mt-1 block">
                {formatDurationHuman(previewHours.regular)} ord. + {formatDurationHuman(previewHours.overtime)} extras
              </span>
            </div>

            {/* Card 2: Obras / Módulos Walter */}
            <div className="card p-4 border-l-4 border-l-purple-500">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                2. Subtotal Obras / Walter
              </span>
              <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400 font-mono">
                {formatCurrency(previewTotals.pieceworkSubtotal)}
              </div>
              <span className="text-[11px] text-gray-500 mt-1 block">
                {previewOrders.length} orden(es) de trabajo completadas
              </span>
            </div>

            {/* Card 3: Deducción de Adelantos */}
            <div className="card p-4 border-l-4 border-l-red-500 bg-red-50/20 dark:bg-red-950/20">
              <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">
                3. Adelantos a Descontar Hoy
              </span>
              <div className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400 font-mono">
                -{formatCurrency(previewTotals.advancesSubtotal)}
              </div>
              <span className="text-[11px] text-red-500 mt-1 block font-medium">
                {previewTotals.totalPendingAdvancesAmount > 0
                  ? `De ${formatCurrency(previewTotals.totalPendingAdvancesAmount)} de deuda total — Quedan ${formatCurrency(previewTotals.remainingDebtTotal)} pendientes`
                  : 'Sin adelantos pendientes'}
              </span>
            </div>

            {/* Card 4: Total Neto a Pagar */}
            <div
              className={`card p-4 border-l-4 flex flex-col justify-between ${
                previewTotals.netTotal === 0 && previewTotals.advancesSubtotal > 0
                  ? 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/30'
                  : 'border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/30'
              }`}
            >
              <div>
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    previewTotals.netTotal === 0 && previewTotals.advancesSubtotal > 0
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  4. TOTAL NETO A PAGAR
                </span>
                <div
                  className={`mt-2 text-2xl font-extrabold font-mono ${
                    previewTotals.netTotal === 0 && previewTotals.advancesSubtotal > 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {formatCurrency(previewTotals.netTotal)}
                </div>
                {previewTotals.netTotal === 0 && previewTotals.advancesSubtotal > 0 ? (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1 font-semibold leading-tight">
                    Cubierto por adelantos (Neto en mano: $ 0,00)
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1 font-semibold leading-tight">
                    Monto neto final a transferir o abonar
                  </p>
                )}
              </div>
              <button
                onClick={handleSaveSettlement}
                disabled={isSubmittingSettlement || isCalculatingPreview || !previewTotals.hasWorkToSettle}
                className={`mt-3 w-full py-2 px-3 rounded-xl text-xs font-bold text-white shadow-sm transition-all text-center flex items-center justify-center gap-1.5 ${
                  !previewTotals.hasWorkToSettle
                    ? 'bg-gray-400 cursor-not-allowed opacity-60'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
                title={
                  !previewTotals.hasWorkToSettle
                    ? 'No hay horas ni obras pendientes de liquidación para este período'
                    : 'Emitir Liquidación Oficial'
                }
              >
                <CheckCircle2 size={14} />
                <span>
                  {!previewTotals.hasWorkToSettle
                    ? 'Sin Horas ni Obras a Liquidar'
                    : 'Emitir Liquidación Oficial'}
                </span>
              </button>
            </div>
          </div>

          {/* Desglose en Dos Columnas: Obras Incluidas vs Adelantos Deducidos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Obras y Servicios del Técnico */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <Briefcase size={14} className="text-purple-500" />
                  <span>Obras y Módulos Walter Pendientes ({previewOrders.length})</span>
                </span>
                <span className="text-xs font-mono font-bold text-purple-600">
                  {formatCurrency(previewTotals.pieceworkSubtotal)}
                </span>
              </div>

              {previewOrders.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  No hay órdenes con mano de obra pendiente de liquidar para este período.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-64 overflow-y-auto pr-1">
                  {previewOrders.map((ord) => (
                    <div key={ord.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-gray-900 dark:text-white">
                          OT {ord.order_number || ord.id.slice(0, 8)}
                        </span>
                        <span className="text-gray-500 ml-2">
                          {ord.client?.name || 'Cliente'}
                        </span>
                        <span className="block text-[11px] text-gray-400">
                          {ord.completed_at ? formatLocalDate(ord.completed_at) : formatLocalDate(ord.scheduled_date)} • {ord.labor_rate_type || 'walter_module'}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                        {formatCurrency(ord.technician_payout || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Adelantos Pendientes del Técnico con Descuento Individual */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown size={14} className="text-red-500" />
                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                    Adelantos Pendientes del Técnico ({previewAdvances.length})
                  </span>
                </div>
                {previewAdvances.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAutoAdjustDeductions}
                      className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                      title="Reparte el descuento automáticamente desde el adelanto más viejo hasta cubrir el sueldo bruto"
                    >
                      Auto-ajustar al sueldo
                    </button>
                    <span className="text-gray-300 dark:text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={handleZeroDeductions}
                      className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:underline"
                      title="Pone todos los descuentos en $ 0 para no deducir adelantos en esta quincena"
                    >
                      No descontar ninguno ($ 0)
                    </button>
                  </div>
                )}
              </div>

              {previewAdvances.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  No hay adelantos pendientes de descuento para este técnico.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {previewAdvances.map((adv) => {
                    const origAmount = Number(adv.amount) || 0;
                    const customVal = advanceDeductions[adv.id];
                    const deductedAmount = customVal !== undefined && customVal !== '' 
                      ? Math.min(origAmount, Math.max(0, Number(customVal) || 0)) 
                      : 0;
                    const remainder = Math.max(0, Math.round((origAmount - deductedAmount) * 100) / 100);
                    const isDiscounting = deductedAmount > 0;

                    return (
                      <div
                        key={adv.id}
                        className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isDiscounting
                            ? 'bg-red-50/40 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 shadow-sm'
                            : 'bg-gray-50/40 dark:bg-slate-800/20 border-gray-100 dark:border-slate-800 opacity-60 hover:opacity-90'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-red-700 dark:text-red-400">
                              {formatLocalDate(adv.advance_date)}
                            </span>
                            <span className="text-gray-500 uppercase text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              {adv.payment_method}
                            </span>
                          </div>
                          <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5" title={adv.reference || adv.notes}>
                            {adv.reference || adv.notes || 'Anticipo a cuenta de haberes'}
                          </span>
                          <span className="block text-[10px] text-gray-400 mt-0.5">
                            Monto total: <strong className="font-mono text-gray-700 dark:text-gray-300">{formatCurrency(origAmount)}</strong>
                          </span>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="flex items-center gap-1.5">
                            <label className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">
                              Descontar hoy:
                            </label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-red-500 text-xs font-mono font-bold">$</span>
                              <input
                                type="number"
                                min="0"
                                max={origAmount}
                                step="1"
                                value={advanceDeductions[adv.id] !== undefined ? advanceDeductions[adv.id] : ''}
                                onChange={(e) => handleDeductionChange(adv.id, origAmount, e.target.value)}
                                onBlur={() => handleDeductionBlur(adv.id, origAmount)}
                                placeholder="0"
                                className="w-28 py-1 pl-5 pr-2 text-right font-mono font-bold text-xs rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 text-red-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                                title={`Monto a descontar hoy de este adelanto (máx: $${origAmount})`}
                              />
                            </div>
                          </div>

                          <div className="text-[10px] text-right font-medium">
                            {isDiscounting ? (
                              remainder > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400">
                                  Queda debiendo de este adelanto: {formatCurrency(remainder)}
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  100% absorbido
                                </span>
                              )
                            ) : (
                              <span className="text-gray-400">
                                No se descuenta hoy (Pasa entero: {formatCurrency(origAmount)})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Historial de Liquidaciones Emitidas */}
          <div className="card p-0 overflow-hidden space-y-3">
            <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-brand-500" />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                  Historial de Liquidaciones Oficiales Emitidas
                </h3>
              </div>
              <span className="text-xs text-gray-400">
                {historicalSettlements.length} comprobantes registrados
              </span>
            </div>

            {historicalSettlements.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-xs">
                Aún no se han emitido liquidaciones oficiales de sueldos o servicios.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50/80 dark:bg-slate-800/80 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-slate-800">
                      <th className="py-3 px-4">N° Comprobante</th>
                      <th className="py-3 px-4">Técnico</th>
                      <th className="py-3 px-4">Período</th>
                      <th className="py-3 px-4 text-right">Subtotal Horas</th>
                      <th className="py-3 px-4 text-right">Subtotal Obras</th>
                      <th className="py-3 px-4 text-right">Adelantos Deducidos</th>
                      <th className="py-3 px-4 text-right">Neto Percibido</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {historicalSettlements.map((set) => (
                      <tr key={set.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900 dark:text-white">
                          {set.settlement_number}
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                          {set.technician?.name || 'Técnico'}
                        </td>
                        <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                          {formatLocalDate(set.period_start)} al {formatLocalDate(set.period_end)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-gray-700 dark:text-gray-300">
                          {formatCurrency(set.hours_subtotal || 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-purple-600 dark:text-purple-400">
                          {formatCurrency(set.piecework_subtotal || 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-red-600 dark:text-red-400">
                          -{formatCurrency(set.advances_subtotal || 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(set.net_total || 0)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {set.status === 'paid' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 size={10} />
                              Pagada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              Aprobada
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleDownloadHistoricalSettlementPDF(set)}
                              className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300"
                              title="Descargar Recibo Oficial en PDF"
                            >
                              <Download size={13} />
                            </button>

                            {set.status !== 'paid' && (
                              <button
                                onClick={() => {
                                  setSettlementToPay(set);
                                  setIsPaySettlementModalOpen(true);
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px]"
                                title="Marcar liquidación como pagada"
                              >
                                Pagar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 3: ADELANTOS A CUENTA                             */}
      {/* ========================================================= */}
      {activeTab === 'advances' && (
        <div className="space-y-6">
          {/* KPI Cards de Adelantos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4 border-l-4 border-l-amber-500">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Adelantos Pendientes de Descuento
              </span>
              <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                {formatCurrency(advancesStats.pendingSum)}
              </div>
              <span className="text-[11px] text-gray-400 mt-1 block">
                {advancesStats.pendingCount} entregas pendientes de liquidación
              </span>
            </div>

            <div className="card p-4 border-l-4 border-l-emerald-500">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Adelantos Descontados
              </span>
              <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(advancesStats.discountedSum)}
              </div>
              <span className="text-[11px] text-gray-400 mt-1 block">
                Ya deducidos en liquidaciones cerradas
              </span>
            </div>

            <div className="card p-4 border-l-4 border-l-slate-500">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Total Histórico Entregado
              </span>
              <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white font-mono">
                {formatCurrency(advancesStats.totalSum)}
              </div>
              <span className="text-[11px] text-gray-400 mt-1 block">
                {advances.length} anticipos en pesos registrados
              </span>
            </div>
          </div>

          {/* Tabla de Adelantos */}
          <div className="card p-0 overflow-hidden space-y-3">
            <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-emerald-500" />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                  Libro Mayor de Anticipos y Adelantos en Pesos
                </h3>
              </div>
            </div>

            {advances.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-xs">
                No hay adelantos registrados en el sistema. Hacé clic en "Cargar Adelanto ($)" para registrar el primero.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50/80 dark:bg-slate-800/80 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-slate-800">
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Técnico</th>
                      <th className="py-3 px-4 text-right">Monto</th>
                      <th className="py-3 px-4">Medio de Pago</th>
                      <th className="py-3 px-4">Referencia / Comprobante</th>
                      <th className="py-3 px-4">Motivo / Notas</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {advances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {formatLocalDate(adv.advance_date)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                          {adv.technician?.name || 'Técnico'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatCurrency(adv.amount)}
                        </td>
                        <td className="py-3 px-4 capitalize text-gray-600 dark:text-gray-300">
                          {adv.payment_method}
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400 font-mono text-[11px]">
                          {adv.reference || '-'}
                        </td>
                        <td className="py-3 px-4 text-gray-500 max-w-xs truncate">
                          {adv.notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {adv.status === 'discounted' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <Check size={10} />
                              Descontado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {adv.status === 'pending' ? (
                            <button
                              onClick={() => handleDeleteAdvance(adv)}
                              className="p-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                              title="Anular adelanto"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL NATIVO: TARIFAS HORARIAS DE TÉCNICOS                */}
      {/* ========================================================= */}
      {isRatesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header del Modal */}
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <DollarSign size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">
                    Tarifas Horarias del Técnico
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Configuración de valor por hora ordinaria y extra
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRatesModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveRatesModal} className="p-6 space-y-5">
              {/* Selector de Técnico */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Técnico Asignado
                </label>
                <div className="relative">
                  <select
                    value={ratesModalTechId}
                    onChange={(e) => handleRatesTechChange(e.target.value)}
                    className="w-full py-2.5 px-3.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all cursor-pointer"
                  >
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.email || 'Sin email'})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Las tarifas configuradas se aplican al control de jornada y se precargan en liquidaciones.
                </p>
              </div>

              {/* Grid de Tarifas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Tarifa Ordinaria */}
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-800 dark:text-gray-200">
                      Hora Ordinaria ($/h)
                    </label>
                    <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/60 px-1.5 py-0.5 rounded">
                      Base (8 hs)
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-400 font-bold text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="100"
                      value={ratesModalRegular}
                      onChange={(e) => handleRatesRegularChange(e.target.value)}
                      placeholder="12000"
                      className="w-full py-2 pl-7 pr-3 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-mono font-bold text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1.5 block">
                    Valor por cada hora de jornada estándar.
                  </span>
                </div>

                {/* Tarifa Extra */}
                <div className="p-3.5 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-amber-900 dark:text-amber-200">
                      Hora Extra ($/h)
                    </label>
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
                      1.5x Auto
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-400 font-bold text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="100"
                      value={ratesModalOvertime}
                      onChange={(e) => setRatesModalOvertime(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="18000"
                      className="w-full py-2 pl-7 pr-3 rounded-lg border border-amber-200 dark:border-amber-800/80 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-mono font-bold text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1.5 block">
                    Calculado al 150% (editable a medida).
                  </span>
                </div>
              </div>

              {/* Ejemplo en vivo de Cómputo */}
              {ratesModalRegular > 0 && (
                <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs">
                  <div className="flex items-center justify-between font-medium text-blue-900 dark:text-blue-200">
                    <span>Simulación para 1 jornada de 10 hs (8h + 2h ext):</span>
                    <span className="font-mono font-bold text-sm text-blue-700 dark:text-blue-300">
                      ${(Number(ratesModalRegular) * 8 + Number(ratesModalOvertime || ratesModalRegular * 1.5) * 2).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="text-[11px] text-blue-700/80 dark:text-blue-400/80 mt-1">
                    8h ord (${(Number(ratesModalRegular) * 8).toLocaleString('es-AR')}) + 2h extras (${(Number(ratesModalOvertime || ratesModalRegular * 1.5) * 2).toLocaleString('es-AR')})
                  </div>
                </div>
              )}

              {/* Footer con Acciones */}
              <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRatesModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingRates}
                  className="py-2.5 px-5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingRates ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      <span>Guardar Tarifas</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: REGISTRAR NUEVO ADELANTO                           */}
      {/* ========================================================= */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="text-emerald-600" size={18} />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                  Registrar Entrega de Adelanto a Técnico
                </h3>
              </div>
              <button
                onClick={() => setIsAdvanceModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateAdvance} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Técnico Destinatario *
                </label>
                <select
                  required
                  value={advanceForm.technician_id}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, technician_id: e.target.value })}
                  className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                >
                  <option value="">Seleccionar técnico...</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Monto en Pesos ($ ARS) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="500000"
                    value={advanceForm.amount}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                    className="w-full py-2 pl-7 pr-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono text-sm font-bold"
                  />
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Ejemplo: $ 500.000 (se descontará automáticamente en la próxima liquidación).
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha de Entrega
                  </label>
                  <input
                    type="date"
                    required
                    value={advanceForm.advance_date}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, advance_date: e.target.value })}
                    className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={advanceForm.payment_method}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, payment_method: e.target.value })}
                    className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  >
                    <option value="transferencia">Transferencia Bancaria</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="cheque">Cheque</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Referencia / N° Transferencia (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Galicia Transf #88392"
                  value={advanceForm.reference}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, reference: e.target.value })}
                  className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Motivo / Observaciones
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Anticipo para compra de materiales / adelanto quincena"
                  value={advanceForm.notes}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, notes: e.target.value })}
                  className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="py-2 px-4 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingAdvance}
                  className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
                >
                  {isSavingAdvance ? 'Guardando...' : 'Registrar Adelanto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: MARCAR LIQUIDACIÓN COMO PAGADA                     */}
      {/* ========================================================= */}
      {isPaySettlementModalOpen && settlementToPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="text-brand-500" size={18} />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                  Registrar Pago de Liquidación {settlementToPay.settlement_number}
                </h3>
              </div>
              <button
                onClick={() => setIsPaySettlementModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <span className="text-gray-500 block text-[11px]">Monto Neto Liquidado a Pagar:</span>
                <span className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(settlementToPay.net_total)}
                </span>
                <span className="text-gray-600 dark:text-gray-400 block text-[11px] mt-1">
                  Técnico: {settlementToPay.technician?.name}
                </span>
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Medio de Pago
                </label>
                <select
                  value={settlementPaymentMethod}
                  onChange={(e) => setSettlementPaymentMethod(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                >
                  <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Referencia de Pago / N° Transferencia
                </label>
                <input
                  type="text"
                  placeholder="Ej: Transf. Banco Galicia Ref. #77218"
                  value={settlementPaymentRef}
                  onChange={(e) => setSettlementPaymentRef(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notas de Pago
                </label>
                <textarea
                  rows={2}
                  placeholder="Observaciones adicionales sobre el pago"
                  value={settlementPaymentNotes}
                  onChange={(e) => setSettlementPaymentNotes(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPaySettlementModalOpen(false)}
                  className="py-2 px-4 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleMarkSettlementPaid}
                  className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
                >
                  Confirmar Pago
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cierre / Edición / Registro Manual de Turno */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    shiftModalMode === 'close'
                      ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      : shiftModalMode === 'manual'
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                      : 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
                  }`}
                >
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">
                    {shiftModalMode === 'close'
                      ? 'Cierre Administrativo de Jornada'
                      : shiftModalMode === 'manual'
                      ? 'Registrar Jornada Manual'
                      : 'Editar Horario de Jornada'}
                  </h3>
                  <p className="text-gray-500 text-xs">
                    {shiftModalMode === 'close'
                      ? 'Asigna un horario de salida real para evitar horas extras erróneas.'
                      : shiftModalMode === 'manual'
                      ? 'Crea un turno completado para un técnico que no pudo fichar.'
                      : 'Rectifica la hora de ingreso o egreso antes de emitir la liquidación.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsShiftModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveShiftModal} className="p-5 space-y-4 text-xs">
              {/* Técnico */}
              {shiftModalMode === 'manual' ? (
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Técnico Responsable *
                  </label>
                  <select
                    value={shiftModalData.technician_id}
                    onChange={(e) =>
                      setShiftModalData({ ...shiftModalData, technician_id: e.target.value })
                    }
                    className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    required
                  >
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.email})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-bold tracking-wider">
                      Técnico
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {shiftModalData.technician_name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400 block text-[10px] uppercase font-bold tracking-wider">
                      Fecha Jornada
                    </span>
                    <span className="text-xs font-mono font-bold text-gray-800 dark:text-gray-200">
                      {formatLocalDate(shiftModalData.shift_date)}
                    </span>
                  </div>
                </div>
              )}

              {/* Horas Ingreso y Egreso */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha y Hora de Ingreso *
                  </label>
                  <input
                    type="datetime-local"
                    value={shiftModalData.check_in_at}
                    onChange={(e) => {
                      const newIn = e.target.value;
                      const newDate = newIn ? newIn.split('T')[0] : shiftModalData.shift_date;
                      setShiftModalData({
                        ...shiftModalData,
                        check_in_at: newIn,
                        shift_date: newDate,
                      });
                    }}
                    className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha y Hora de Egreso {shiftModalMode !== 'edit' && '*'}
                  </label>
                  <input
                    type="datetime-local"
                    value={shiftModalData.check_out_at}
                    onChange={(e) =>
                      setShiftModalData({ ...shiftModalData, check_out_at: e.target.value })
                    }
                    placeholder={shiftModalMode === 'edit' ? 'Dejar en blanco si sigue activa' : ''}
                    className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono"
                    required={shiftModalMode !== 'edit'}
                  />
                  {shiftModalMode === 'close' && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 block">
                      Horario sugerido calculado automáticamente. Puedes modificarlo libremente.
                    </span>
                  )}
                </div>
              </div>

              {/* Sección de Horas Extras y Duración */}
              {shiftModalData.check_out_at && modalDurationHours > 0 && (
                <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        Cómputo de Horas y Horas Extras
                      </span>
                      <span className="text-[11px] text-amber-800/80 dark:text-amber-300/80 block mt-0.5">
                        Duración: {formatDurationHuman(modalDurationHours)} • Base pactada: {standardHoursPerDay} hs • Reloj: {modalRawOvertimeHours > 0 ? `+${formatDurationHuman(modalRawOvertimeHours)} excedente` : 'Sin excedente'}
                      </span>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={shiftModalData.overtime_approved}
                        onChange={(e) =>
                          setShiftModalData({ ...shiftModalData, overtime_approved: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                        Aprobar Horas Extras
                      </span>
                    </label>
                  </div>

                  {!shiftModalData.overtime_approved ? (
                    <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-[11px] text-red-700 dark:text-red-300 font-medium">
                      Horas extras <b>desestimadas</b> para esta jornada. Se liquidarán 0 hs extras (se reconocen solo las horas ordinarias).
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="text-gray-700 dark:text-gray-300">
                        <span>Horas extras a liquidar: </span>
                        <b className="text-amber-700 dark:text-amber-300 font-mono">
                          +{formatDurationHuman(
                            shiftModalData.custom_overtime_hours !== '' &&
                            shiftModalData.custom_overtime_hours !== null &&
                            !isNaN(Number(shiftModalData.custom_overtime_hours))
                              ? Number(shiftModalData.custom_overtime_hours)
                              : modalRawOvertimeHours
                          )}
                        </b>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-gray-500 whitespace-nowrap">
                          Ajuste manual (opcional):
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max="24"
                          placeholder="Auto (reloj)"
                          value={shiftModalData.custom_overtime_hours}
                          onChange={(e) =>
                            setShiftModalData({ ...shiftModalData, custom_overtime_hours: e.target.value })
                          }
                          className="w-24 py-1 px-2 text-xs font-mono rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                          title="Ingresa horas decimales si acuerdas reconocer un monto diferente al reloj (ej: 1 o 1.5)"
                        />
                        <span className="text-[11px] text-gray-400">hs</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Nota Administrativa Obligatoria */}
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nota / Justificación Administrativa *
                </label>
                <textarea
                  rows={3}
                  value={shiftModalData.admin_notes}
                  onChange={(e) =>
                    setShiftModalData({ ...shiftModalData, admin_notes: e.target.value })
                  }
                  placeholder="Ej: Técnico olvidó fichar salida; se cierra a horario habitual 18:00 hs según acuerdo."
                  className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  required
                />
                <span className="text-[10px] text-gray-400 block mt-0.5">
                  Esta nota queda registrada en la auditoría del turno y respalda la liquidación de horas.
                </span>
              </div>

              {/* Botones de acción */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSavingShift}
                  onClick={() => setIsShiftModalOpen(false)}
                  className="py-2 px-4 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingShift}
                  className={`py-2 px-5 rounded-xl text-white font-bold shadow-sm transition-all flex items-center gap-1.5 ${
                    shiftModalMode === 'close'
                      ? 'bg-red-600 hover:bg-red-700'
                      : shiftModalMode === 'manual'
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-brand-600 hover:bg-brand-700'
                  }`}
                >
                  {isSavingShift ? (
                    <span>Guardando...</span>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>
                        {shiftModalMode === 'close'
                          ? 'Confirmar Cierre'
                          : shiftModalMode === 'manual'
                          ? 'Registrar Turno'
                          : 'Guardar Cambios'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
