import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  Wrench, 
  Building2, 
  Send, 
  FileText, 
  Lock,
  ArrowRight,
  Wind,
  Box,
  MapPin,
  Tag
} from 'lucide-react';
import { supabase } from '@4s-clima/shared/supabase';
import { EQUIPMENT_TYPE_LABELS, WORK_ORDER_TYPE_LABELS, TARGET_UNIT_LABELS } from '@4s-clima/shared/constants';
import { formatDate } from '@4s-clima/shared/utils';

const STATUS_CONFIG = {
  operativo: {
    label: 'OPERATIVO',
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    icon: CheckCircle2
  },
  con_observaciones: {
    label: 'CON OBSERVACIONES',
    bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
    dot: 'bg-amber-500',
    icon: AlertTriangle
  },
  fuera_de_servicio: {
    label: 'FUERA DE SERVICIO',
    bg: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800',
    dot: 'bg-red-500',
    icon: AlertOctagon
  }
};

export default function PublicEquipmentPortalPage() {
  const { code } = useParams();

  // Estados de carga e identificación pública
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [summary, setSummary] = useState(null);

  // Estados de desbloqueo corporativo
  const [emailInput, setEmailInput] = useState('');
  const [isValidatingEmail, setIsValidatingEmail] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockedData, setUnlockedData] = useState(null);

  // Estados de solicitud de asistencia técnica
  const [contactName, setContactName] = useState('');
  const [urgency, setUrgency] = useState('normal');
  const [issueDescription, setIssueDescription] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(null);
  const [ticketError, setTicketError] = useState(null);

  useEffect(() => {
    if (code) {
      loadPublicSummary(code);
    }
  }, [code]);

  async function loadPublicSummary(identifier) {
    setIsLoadingSummary(true);
    setSummaryError(null);

    try {
      const cleanIdentifier = identifier.trim();
      const { data, error } = await supabase.rpc('get_equipment_public_summary', {
        p_identifier: cleanIdentifier
      });

      if (error) {
        throw error;
      }

      if (!data) {
        setSummaryError('No se encontró ningún equipo registrado con el identificador o token escaneado.');
      } else {
        setSummary(data);
      }
    } catch (err) {
      console.error('Error cargando resumen público del equipo:', err);
      setSummaryError('No se pudo consultar el registro del equipo. Verifique el código QR o intente nuevamente.');
    } finally {
      setIsLoadingSummary(false);
    }
  }

  async function handleUnlockHistory(e) {
    e.preventDefault();
    if (!emailInput.trim()) return;

    setIsValidatingEmail(true);
    setValidationError(null);

    try {
      const { data, error } = await supabase.rpc('get_equipment_history_for_client', {
        p_identifier: code.trim(),
        p_email: emailInput.trim().toLowerCase()
      });

      if (error) {
        throw error;
      }

      if (!data || data.success === false) {
        setValidationError(data?.error || 'El correo ingresado no coincide con el cliente o dominio corporativo autorizado para este activo.');
      } else {
        setUnlockedData(data);
        setIsUnlocked(true);
      }
    } catch (err) {
      console.error('Error validando correo corporativo:', err);
      setValidationError(err.message || 'Error al validar credenciales corporativas.');
    } finally {
      setIsValidatingEmail(false);
    }
  }

  async function handleSubmitServiceRequest(e) {
    e.preventDefault();
    if (!contactName.trim() || !issueDescription.trim()) return;

    setIsSubmittingTicket(true);
    setTicketError(null);
    setTicketSuccess(null);

    try {
      const { data, error } = await supabase.rpc('create_service_request_from_qr', {
        p_identifier: code.trim(),
        p_email: emailInput.trim().toLowerCase(),
        p_contact_name: contactName.trim(),
        p_issue_description: issueDescription.trim(),
        p_urgency: urgency
      });

      if (error) {
        throw error;
      }

      setTicketSuccess(data);
      setIssueDescription('');

      // Recargar datos actualizados del equipo e historial
      const { data: refreshed } = await supabase.rpc('get_equipment_history_for_client', {
        p_identifier: code.trim(),
        p_email: emailInput.trim().toLowerCase()
      });
      if (refreshed) {
        setUnlockedData(refreshed);
      }
    } catch (err) {
      console.error('Error creando solicitud de servicio:', err);
      setTicketError(err.message || 'No se pudo crear la solicitud de servicio.');
    } finally {
      setIsSubmittingTicket(false);
    }
  }

  const currentStatusKey = (unlockedData?.equipment?.operational_status || summary?.operational_status || 'operativo').toLowerCase();
  const statusCfg = STATUS_CONFIG[currentStatusKey] || STATUS_CONFIG.operativo;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Barra Superior Corporativa */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-sm tracking-wider">
              4S
            </div>
            <div>
              <span className="font-bold text-sm tracking-wide text-white block">4S CLIMA S.A.</span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider block">PORTAL INDUSTRIAL DE ACTIVOS</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
              {summary?.qr_token || code}
            </span>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Estado de Carga */}
        {isLoadingSummary && (
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-8 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-300 font-medium">Consultando activo en red 4S Clima...</p>
          </div>
        )}

        {/* Error de Identificación */}
        {!isLoadingSummary && summaryError && (
          <div className="bg-red-950/40 border border-red-800/80 rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-900/60 text-red-400 flex items-center justify-center mx-auto">
              <AlertOctagon size={24} />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Activo No Encontrado</h2>
              <p className="text-sm text-red-200">{summaryError}</p>
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Código escaneado: <span className="font-mono text-white">{code}</span>. Si este equipo pertenece a una instalación de 4S Clima, comuníquese con mesa de ayuda.
            </p>
          </div>
        )}

        {/* Ficha Técnica Pública Inmediata */}
        {!isLoadingSummary && summary && (
          <div className="space-y-6">
            {/* Tarjeta Técnica Principal */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-6">
              {/* Encabezado del Equipo */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-700/80 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded-md bg-blue-950 text-blue-300 border border-blue-800 font-bold tabular-nums">
                      {summary.qr_token || 'S/TOKEN'}
                    </span>
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                      {EQUIPMENT_TYPE_LABELS[summary.equipment_type] || summary.equipment_type || 'Unidad de Climatización'}
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">
                    {summary.brand} {summary.model || ''}
                  </h1>
                  <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <Building2 size={14} className="text-slate-500" />
                    <span>{summary.plant_name || 'Instalación asignada'}</span>
                    {summary.client_name_masked && (
                      <span className="text-slate-500 font-mono">({summary.client_name_masked})</span>
                    )}
                  </p>
                </div>

                {/* Badge de Estado Operativo */}
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold tracking-wide uppercase ${statusCfg.bg}`}>
                  <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
                  <StatusIcon size={14} />
                  <span>{statusCfg.label}</span>
                </div>
              </div>

              {/* Desglose Arquitectura Dual: UI y UE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Unidad Interior */}
                <div className="p-3.5 bg-slate-900/80 rounded-xl border border-sky-800/40 space-y-2">
                  <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs border-b border-sky-800/50 pb-1.5">
                    <Wind size={15} className="text-sky-400" />
                    <span>Unidad Interior (UI - Evaporadora)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Modelo UI:</span>
                    <span className="font-bold text-slate-100">
                      {summary.indoor_model || summary.model || 'N/D'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">N° Serie UI:</span>
                    <span className="font-mono font-bold text-white">
                      {summary.indoor_serial || summary.serial_number || 'N/D'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Ubicación UI:</span>
                    <span className="text-slate-300 flex items-center gap-1">
                      <MapPin size={11} className="text-sky-400 shrink-0" />
                      {summary.indoor_location || summary.location_description || summary.location_in_plant || 'Sin especificar'}
                    </span>
                  </div>
                </div>

                {/* Unidad Exterior */}
                <div className="p-3.5 bg-slate-900/80 rounded-xl border border-amber-800/40 space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs border-b border-amber-800/50 pb-1.5">
                    <Box size={15} className="text-amber-400" />
                    <span>Unidad Exterior (UE - Condensadora)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Modelo UE:</span>
                    <span className="font-bold text-slate-100">
                      {summary.outdoor_model || 'No especificado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">N° Serie UE:</span>
                    <span className="font-mono font-bold text-white">
                      {summary.outdoor_serial || 'No especificado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Ubicación UE:</span>
                    <span className="text-slate-300 flex items-center gap-1">
                      <MapPin size={11} className="text-amber-400 shrink-0" />
                      {summary.outdoor_location || 'No especificada'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grilla de Metadatos del Equipo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-1">
                <div className="space-y-1">
                  <span className="text-slate-400 block font-medium">Refrigerante</span>
                  <span className="text-slate-100 font-semibold block">
                    {summary.refrigerant_type || 'N/D'}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 block font-medium">Capacidad</span>
                  <span className="text-slate-100 font-semibold block tabular-nums">
                    {summary.capacity_tr_fg || (summary.capacity_btu ? `${summary.capacity_btu.toLocaleString('es-AR')} BTU` : 'Estándar')}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 block font-medium">Último Service</span>
                  <span className="font-mono text-slate-100 font-semibold block tabular-nums">
                    {summary.last_service_at ? formatDate(summary.last_service_at) : 'Sin registro'}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 block font-medium">Próximo Sugerido</span>
                  <span className="font-mono text-slate-100 font-semibold block tabular-nums">
                    {summary.next_recommended_service_at ? formatDate(summary.next_recommended_service_at) : 'A programar'}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-2 border-t border-slate-700/60">
                <Tag size={13} className="text-blue-400 shrink-0" />
                <span>QR de Sistema (Pegar en Unidad Interior) — Ficha compartida UI + UE.</span>
              </div>
            </div>

            {/* Bloque de Acceso / Desbloqueo Corporativo */}
            {!isUnlocked ? (
              <div className="bg-slate-800/50 border border-slate-700/80 rounded-2xl p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-900 text-blue-400 border border-slate-700 shrink-0">
                    <Lock size={20} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-white">
                      Historial Clínico y Solicitud Directa
                    </h2>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Ingresá tu correo corporativo registrado para consultar el historial técnico detallado de intervenciones o solicitar asistencia sobre esta unidad.
                    </p>
                  </div>
                </div>

                {validationError && (
                  <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-200">
                    {validationError}
                  </div>
                )}

                <form onSubmit={handleUnlockHistory} className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="nombre@tuempresa.com"
                      maxLength={120}
                      required
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={isValidatingEmail}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isValidatingEmail ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Validando...</span>
                        </>
                      ) : (
                        <>
                          <span>Acceder</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    El sistema valida la coincidencia con el cliente o dominio corporativo autorizado para este equipo.
                  </p>
                </form>
              </div>
            ) : (
              /* Vista Desbloqueada: Historial + Formulario de Solicitud */
              <div className="space-y-6">
                {/* Banner de Validación Exitosa */}
                <div className="bg-blue-950/40 border border-blue-800/70 rounded-xl p-4 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-blue-200">
                    <ShieldCheck size={16} className="text-blue-400 shrink-0" />
                    <span>Acceso validado para corporativo: <strong className="text-white font-mono">{emailInput}</strong></span>
                  </div>
                  <button
                    onClick={() => {
                      setIsUnlocked(false);
                      setUnlockedData(null);
                    }}
                    className="text-slate-400 hover:text-white underline text-[11px]"
                  >
                    Cerrar sesión
                  </button>
                </div>

                {/* Formulario de Solicitud de Asistencia */}
                <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                      <Wrench size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Solicitar Asistencia Técnica para este Equipo</h2>
                      <p className="text-xs text-slate-400">Genera una orden de servicio directa vinculada a este activo.</p>
                    </div>
                  </div>

                  {ticketSuccess && (
                    <div className="p-4 bg-emerald-950/50 border border-emerald-800 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                        <CheckCircle2 size={16} />
                        <span>Solicitud registrada exitosamente</span>
                      </div>
                      <p className="text-xs text-emerald-200">
                        Número de Orden Generado: <strong className="font-mono text-white text-sm">{ticketSuccess.order_number}</strong>
                      </p>
                      <p className="text-[11px] text-emerald-300">
                        Nuestro equipo técnico ha recibido la solicitud y se pondrá en contacto a la brevedad.
                      </p>
                    </div>
                  )}

                  {ticketError && (
                    <div className="p-4 bg-red-950/50 border border-red-800 rounded-xl text-xs text-red-200">
                      {ticketError}
                    </div>
                  )}

                  <form onSubmit={handleSubmitServiceRequest} className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Nombre del Solicitante *
                        </label>
                        <input
                          type="text"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          placeholder="Ej: Ing. Martín Gómez"
                          maxLength={100}
                          required
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Nivel de Urgencia *
                        </label>
                        <select
                          value={urgency}
                          onChange={(e) => setUrgency(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="normal">Normal - Mantenimiento / Revisión</option>
                          <option value="urgente">Urgente - Falla de rendimiento / Ruidos</option>
                          <option value="equipo_detenido">Crítico - Equipo totalmente detenido</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Descripción del Síntoma o Falla *
                      </label>
                      <textarea
                        value={issueDescription}
                        onChange={(e) => setIssueDescription(e.target.value)}
                        placeholder="Describa el comportamiento anormal observado, códigos de error en display o sector afectado..."
                        rows={3}
                        maxLength={1500}
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={isSubmittingTicket}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {isSubmittingTicket ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Enviando solicitud...</span>
                          </>
                        ) : (
                          <>
                            <Send size={16} />
                            <span>Registrar Solicitud de Service</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Línea de Tiempo del Historial Técnico */}
                <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <FileText size={18} className="text-blue-400" />
                      <span>Historial Técnico y de Intervenciones ({unlockedData?.history?.length || 0})</span>
                    </h2>
                    <span className="text-[11px] text-slate-400">Sin datos de facturación</span>
                  </div>

                  {(!unlockedData?.history || unlockedData.history.length === 0) ? (
                    <div className="py-8 text-center text-slate-400 text-xs bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
                      No se registran visitas u órdenes de trabajo previas archivadas para este equipo.
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-700">
                      {unlockedData.history.map((item, idx) => (
                        <div key={idx} className="relative space-y-1.5">
                          {/* Punto en la línea de tiempo */}
                          <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-slate-900" />

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-white tabular-nums">
                              {item.order_number}
                            </span>
                            <div className="flex items-center gap-2 text-[11px]">
                              {item.target_unit && (
                                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-bold text-[10px]">
                                  {TARGET_UNIT_LABELS[item.target_unit] || item.target_unit}
                                </span>
                              )}
                              <span className="text-slate-400 font-mono tabular-nums">
                                {formatDate(item.completed_at || item.scheduled_date)}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-medium uppercase text-[10px]">
                                {WORK_ORDER_TYPE_LABELS[item.type?.toLowerCase()] || WORK_ORDER_TYPE_LABELS[item.type] || (item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : '')}
                              </span>
                              <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                                item.status === 'completed'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-amber-950 text-amber-400 border border-amber-800'
                              }`}>
                                {item.status === 'completed' ? 'Completado' : item.status}
                              </span>
                            </div>
                          </div>

                          {/* Notas técnicas por unidad */}
                          {item.indoor_work_notes && (
                            <div className="text-xs p-2.5 rounded-lg bg-slate-900/80 border border-sky-800/40 text-slate-200 space-y-0.5">
                              <span className="text-sky-400 font-bold block text-[10px] uppercase flex items-center gap-1">
                                <Wind size={12} /> [UI - Evaporadora]:
                              </span>
                              <p className="text-slate-300 leading-relaxed">{item.indoor_work_notes}</p>
                            </div>
                          )}

                          {item.outdoor_work_notes && (
                            <div className="text-xs p-2.5 rounded-lg bg-slate-900/80 border border-amber-800/40 text-slate-200 space-y-0.5">
                              <span className="text-amber-400 font-bold block text-[10px] uppercase flex items-center gap-1">
                                <Box size={12} /> [UE - Condensadora]:
                              </span>
                              <p className="text-slate-300 leading-relaxed">{item.outdoor_work_notes}</p>
                            </div>
                          )}

                          {item.technical_diagnostic && (
                            <p className="text-xs text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                              <strong className="text-slate-400 block text-[10px] uppercase font-bold mb-0.5">Diagnóstico Técnico:</strong>
                              {item.technical_diagnostic}
                            </p>
                          )}

                          {item.notes && !item.technical_diagnostic && !item.indoor_work_notes && !item.outdoor_work_notes && (
                            <p className="text-xs text-slate-300 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Pie de Página */}
      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        <p>4S Clima S.A. — Sistema Industrial de Gestión de Activos y Mantenimiento HVAC</p>
      </footer>
    </div>
  );
}
