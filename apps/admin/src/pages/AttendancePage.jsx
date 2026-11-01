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
} from 'lucide-react';
import Swal from 'sweetalert2';
import { supabase } from '@4s-clima/shared/supabase';
import { formatCurrency, formatDate, formatTime } from '@4s-clima/shared/utils';
import { generateSettlementPDF, openAndDownloadPDF } from '../services/pdfService';

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
  const [selectedTechId, setSelectedTechId] = useState('all');
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(8); // 8 o 9 hs estándar
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'completed' | 'anomalous'

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

  // Datos calculados para la vista previa de liquidación
  const [previewHours, setPreviewHours] = useState({ regular: 0, overtime: 0, subtotal: 0 });
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
        .select('id, name, email')
        .eq('role', 'tecnico')
        .order('name');
      setTechnicians(data || []);
      if (data && data.length > 0 && !settlementTechId) {
        setSettlementTechId(data[0].id);
      }
    }
    loadTechs();
  }, []);

  // Cargar turnos de asistencia
  const loadShifts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email, phone');
      const usersMap = {};
      (usersData || []).forEach((u) => {
        usersMap[u.id] = u;
      });

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
          created_at
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

      const shiftsWithTech = (data || []).map((s) => ({
        ...s,
        technician: usersMap[s.technician_id] || { name: 'Técnico', email: '' },
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

      let regularHours = 0;
      let overtimeHours = 0;

      if (totalHoursDecimal <= standardHoursPerDay) {
        regularHours = totalHoursDecimal;
        overtimeHours = 0;
      } else {
        regularHours = standardHoursPerDay;
        overtimeHours = totalHoursDecimal - standardHoursPerDay;
      }

      const isAnomalous =
        (isOngoing && totalHoursDecimal > 12) ||
        (isOngoing && shift.shift_date < todayStr);

      const checkInHour = checkIn.getHours() + checkIn.getMinutes() / 60;
      const isLateCheckIn = checkInHour > 9.15;

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

  const filteredShifts = useMemo(() => {
    return processedShifts.filter((s) => {
      if (statusFilter === 'active') return s.isOngoing;
      if (statusFilter === 'completed') return !s.isOngoing;
      if (statusFilter === 'anomalous') return s.isAnomalous;
      return true;
    });
  }, [processedShifts, statusFilter]);

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

  // Cómputo en vivo para Liquidación Mixta (Tab 2)
  const calculateSettlementPreview = useCallback(async () => {
    if (!settlementTechId) return;
    setIsCalculatingPreview(true);

    try {
      // 1. Horas del período para el técnico seleccionado
      const { data: shiftsData } = await supabase
        .from('technician_shifts')
        .select('check_in_at, check_out_at, shift_date, status')
        .eq('technician_id', settlementTechId)
        .gte('shift_date', settlementStartDate)
        .lte('shift_date', settlementEndDate)
        .eq('status', 'completed');

      let regHs = 0;
      let overHs = 0;

      (shiftsData || []).forEach((s) => {
        if (s.check_in_at && s.check_out_at) {
          const inD = new Date(s.check_in_at);
          const outD = new Date(s.check_out_at);
          const durHs = Math.max(0, outD.getTime() - inD.getTime()) / (1000 * 60 * 60);
          if (durHs <= settlementStandardHours) {
            regHs += durHs;
          } else {
            regHs += settlementStandardHours;
            overHs += durHs - settlementStandardHours;
          }
        }
      });

      const hoursSubtotal = (regHs * hourlyRateRegular) + (overHs * hourlyRateOvertime);
      setPreviewHours({
        regular: Math.round(regHs * 100) / 100,
        overtime: Math.round(overHs * 100) / 100,
        subtotal: Math.round(hoursSubtotal),
      });

      // 2. Órdenes por obra / módulos completados pendientes de pago
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

      setPreviewOrders(ordersData || []);

      // 3. Adelantos pendientes de descuento para este técnico
      const { data: advancesData } = await supabase
        .from('technician_advances')
        .select('*')
        .eq('technician_id', settlementTechId)
        .eq('status', 'pending')
        .lte('advance_date', settlementEndDate)
        .order('advance_date', { ascending: false });

      setPreviewAdvances(advancesData || []);
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
    settlementStandardHours,
  ]);

  useEffect(() => {
    if (activeTab === 'settlement' && settlementTechId) {
      calculateSettlementPreview();
    }
  }, [activeTab, settlementTechId, settlementStartDate, settlementEndDate, calculateSettlementPreview]);

  // Totales de la liquidación en preparación
  const previewTotals = useMemo(() => {
    const hoursSub = previewHours.subtotal || 0;
    const pieceworkSub = previewOrders.reduce((acc, o) => acc + (Number(o.technician_payout) || 0), 0);
    const advancesSub = previewAdvances.reduce((acc, a) => acc + (Number(a.amount) || 0), 0);
    const gross = hoursSub + pieceworkSub;
    const net = gross - advancesSub;

    return {
      hoursSubtotal: hoursSub,
      pieceworkSubtotal: pieceworkSub,
      advancesSubtotal: advancesSub,
      grossTotal: gross,
      netTotal: net,
    };
  }, [previewHours, previewOrders, previewAdvances]);

  // Guardar Liquidación Oficial
  const handleSaveSettlement = async () => {
    if (!settlementTechId) {
      Swal.fire('Atención', 'Seleccioná un técnico para emitir la liquidación.', 'warning');
      return;
    }

    const techObj = technicians.find((t) => t.id === settlementTechId);
    const techName = techObj?.name || 'el técnico seleccionado';

    const confirmRes = await Swal.fire({
      title: '¿Emitir Liquidación Oficial?',
      html: `
        <div class="text-left text-sm space-y-2">
          <p>Técnico: <b>${techName}</b></p>
          <p>Período: <b>${formatDate(settlementStartDate)} al ${formatDate(settlementEndDate)}</b></p>
          <hr class="my-2"/>
          <p>Subtotal Horas: <b>${formatCurrency(previewTotals.hoursSubtotal)}</b></p>
          <p>Subtotal Obras: <b>${formatCurrency(previewTotals.pieceworkSubtotal)}</b></p>
          <p class="text-red-600">Menos Adelantos: <b>-${formatCurrency(previewTotals.advancesSubtotal)}</b></p>
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
          notes: `Liquidación emitida para ${techName}. Deducción de ${previewAdvances.length} adelanto(s).`,
        })
        .select()
        .single();

      if (setErr) throw setErr;

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

      // 4. Marcar adelantos como descontados (discounted) vinculando el settlement_id
      if (previewAdvances.length > 0) {
        const advIds = previewAdvances.map((a) => a.id);
        await supabase
          .from('technician_advances')
          .update({
            status: 'discounted',
            settlement_id: newSettlement.id,
          })
          .in('id', advIds);
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
          generateSettlementPDF(newSettlement, techObj, previewOrders, previewAdvances)
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

  // Forzar Cierre de Turno Anómalo (Tab 1)
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
      s.shift_date,
      `"${sanitizeText(s.technician?.name || 'Técnico')}"`,
      `"${sanitizeText(s.technician?.email || '')}"`,
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
    } else {
      setSettlementStartDate(s);
      setSettlementEndDate(e);
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

  return (
    <div className="space-y-6">
      {/* Header Principal con Acciones Rápidas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <Clock size={26} className="text-brand-500" />
            <span>Control de Asistencia, Liquidaciones y Adelantos</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Auditoría de jornadas laborales, liquidación mixta (horas + obras) y deducción automática de anticipos a técnicos.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsAdvanceModalOpen(true)}
            className="flex items-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 transition-all"
            title="Registrar entrega de adelanto en pesos a un técnico"
          >
            <DollarSign size={15} />
            <span>Cargar Adelanto ($)</span>
          </button>

          {activeTab === 'shifts' && (
            <button
              onClick={handleExportCSV}
              disabled={isLoading || filteredShifts.length === 0}
              className="btn-primary flex items-center gap-2 py-2.5 px-4 text-xs font-semibold shadow-sm active:scale-95 transition-all"
              title="Descargar archivo CSV compatible con Excel para auditoría"
            >
              <Download size={15} />
              <span>Exportar Excel (CSV)</span>
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
                  onClick={() => setQuickRange('this_month', 'shifts')}
                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  Este Mes
                </button>
                <button
                  onClick={() => setQuickRange('first_half', 'shifts')}
                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  1ra Quincena
                </button>
                <button
                  onClick={() => setQuickRange('second_half', 'shifts')}
                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  2da Quincena
                </button>
                <button
                  onClick={() => setQuickRange('prev_month', 'shifts')}
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
                          {formatDate(shift.shift_date)}
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
                            <span className="truncate max-w-[160px]">
                              {shift.technician?.name || 'Técnico'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono tabular-nums text-gray-700 dark:text-gray-300">
                          <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800">
                            {formatTime(shift.checkInDate)} hs
                          </span>
                        </td>
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
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 font-medium">
                          {shift.regularHours.toFixed(2)} hs
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          {shift.overtimeHours > 0 ? (
                            <span className="font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/50">
                              +{shift.overtimeHours.toFixed(2)} hs
                            </span>
                          ) : (
                            <span className="text-gray-400">0.00 hs</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-gray-900 dark:text-white">
                          {shift.totalHoursDecimal.toFixed(2)} hs
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
                            {shift.isLateCheckIn && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40 font-medium">
                                Ingreso tardío
                              </span>
                            )}
                          </div>
                        </td>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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
                  Tarifa Hora Ordinaria ($/h)
                </label>
                <input
                  type="number"
                  value={hourlyRateRegular}
                  onChange={(e) => setHourlyRateRegular(Number(e.target.value))}
                  className="w-full text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono"
                  placeholder="12000"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Tarifa Hora Extra ($/h)
                </label>
                <input
                  type="number"
                  value={hourlyRateOvertime}
                  onChange={(e) => setHourlyRateOvertime(Number(e.target.value))}
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
                {previewHours.regular} hs ord. + {previewHours.overtime} hs extras
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
                3. Adelantos a Deducir
              </span>
              <div className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400 font-mono">
                -{formatCurrency(previewTotals.advancesSubtotal)}
              </div>
              <span className="text-[11px] text-red-500 mt-1 block font-medium">
                {previewAdvances.length} anticipo(s) en pesos descontados
              </span>
            </div>

            {/* Card 4: Total Neto a Pagar */}
            <div className="card p-4 border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/30 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                  TOTAL NETO A LIQUIDAR
                </span>
                <div className="mt-2 text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 font-mono">
                  {formatCurrency(previewTotals.netTotal)}
                </div>
              </div>
              <button
                onClick={handleSaveSettlement}
                disabled={isSubmittingSettlement || isCalculatingPreview}
                className="mt-3 w-full py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all text-center flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                <span>Emitir Liquidación Oficial</span>
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
                          {ord.completed_at ? formatDate(ord.completed_at) : formatDate(ord.scheduled_date)} • {ord.labor_rate_type || 'walter_module'}
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

            {/* Adelantos Deducidos */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <TrendingDown size={14} className="text-red-500" />
                  <span>Adelantos a Deducir en esta Liquidación ({previewAdvances.length})</span>
                </span>
                <span className="text-xs font-mono font-bold text-red-600">
                  -{formatCurrency(previewTotals.advancesSubtotal)}
                </span>
              </div>

              {previewAdvances.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  No hay adelantos pendientes de descuento para este técnico.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-64 overflow-y-auto pr-1">
                  {previewAdvances.map((adv) => (
                    <div key={adv.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-red-700 dark:text-red-400">
                          {formatDate(adv.advance_date)}
                        </span>
                        <span className="text-gray-500 ml-2 uppercase text-[10px]">
                          [{adv.payment_method}]
                        </span>
                        <span className="block text-[11px] text-gray-400">
                          {adv.reference || adv.notes || 'Anticipo a cuenta de haberes'}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-red-600 dark:text-red-400">
                        -{formatCurrency(adv.amount)}
                      </span>
                    </div>
                  ))}
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
                          {formatDate(set.period_start)} al {formatDate(set.period_end)}
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
              <button
                onClick={() => setIsAdvanceModalOpen(true)}
                className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>Nuevo Adelanto</span>
              </button>
            </div>

            {advances.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-xs">
                No hay adelantos registrados en el sistema. Hacé clic en "Nuevo Adelanto" para cargar el primero.
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
                          {formatDate(adv.advance_date)}
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
    </div>
  );
}
