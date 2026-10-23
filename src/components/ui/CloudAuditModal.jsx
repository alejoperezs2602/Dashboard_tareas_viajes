import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchCloudCoverage,
  inspectMonthCoverage,
  fetchUploadLogs,
  deleteCloudDataByDate
} from '../../services/fleetService.js';
import ErrorBanner from './ErrorBanner.jsx';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function formatDateTime(d) {
  if (!d || isNaN(d.getTime())) return 'Fecha desconocida';
  return d.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatHumanDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const monthIdx = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} de ${MONTH_NAMES[monthIdx] || m} de ${y}`;
}

export default function CloudAuditModal({
  isOpen,
  onClose,
  localCoverage = {},
  localDates = [],
  canUpload = false,
  canDelete = false,
  onSelectDateAndFetch,
  onDeleted
}) {
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'audit'
  const [cloudCoverage, setCloudCoverage] = useState({});
  const [isLoadingCoverage, setIsLoadingCoverage] = useState(false);
  const [isSyncingMonth, setIsSyncingMonth] = useState(false);
  const [selectedISO, setSelectedISO] = useState('');

  // Audit logs state
  const [uploadLogs, setUploadLogs] = useState([]);
  const [logsRestricted, setLogsRestricted] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilterType, setLogFilterType] = useState('ALL');
  const [logSearch, setLogSearch] = useState('');

  // Admin delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState({ error: null, success: null });

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const yearMonthKey = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = String(currentMonth.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [currentMonth]);

  // Load initial summary coverage & logs when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setFeedback({ error: null, success: null });

    let cancelled = false;
    async function loadInitial() {
      setIsLoadingCoverage(true);
      try {
        const cov = await fetchCloudCoverage();
        if (!cancelled) {
          setCloudCoverage(prev => ({ ...cov, ...prev }));
          // Default calendar month to most recent date with data if current month has none
          const allIsoDates = Object.keys(cov).sort();
          if (allIsoDates.length > 0) {
            const latestISO = allIsoDates[allIsoDates.length - 1];
            const [ly, lm] = latestISO.split('-').map(Number);
            if (ly && lm) {
              setCurrentMonth(new Date(ly, lm - 1, 1));
              setSelectedISO(prev => prev || latestISO);
            }
          }
        }
      } catch (err) {
        console.error('Error cargando cobertura:', err);
      } finally {
        if (!cancelled) setIsLoadingCoverage(false);
      }
    }

    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Automatically inspect the active month in detail so Tareas, Planillas, and GPS counts are exact
  useEffect(() => {
    if (!isOpen || !yearMonthKey) return;
    let cancelled = false;

    async function syncMonth() {
      setIsSyncingMonth(true);
      try {
        const detailed = await inspectMonthCoverage(yearMonthKey, canUpload);
        if (!cancelled && Object.keys(detailed).length > 0) {
          setCloudCoverage(prev => ({ ...prev, ...detailed }));
        }
      } catch (err) {
        console.warn('Error inspeccionando detalle del mes:', err);
      } finally {
        if (!cancelled) setIsSyncingMonth(false);
      }
    }

    syncMonth();
    return () => {
      cancelled = true;
    };
  }, [isOpen, yearMonthKey, canUpload]);

  // Load upload logs when switching to Audit tab (or on open)
  const refreshLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const { logs, restricted } = await fetchUploadLogs(100);
      setUploadLogs(logs);
      setLogsRestricted(restricted);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'audit') {
      refreshLogs();
    }
  }, [isOpen, activeTab]);

  // Merge cloud coverage with local session coverage
  const mergedCoverage = useMemo(() => {
    const map = { ...cloudCoverage };
    Object.entries(localCoverage).forEach(([iso, loc]) => {
      const existing = map[iso] || { fechaISO: iso };
      map[iso] = {
        ...existing,
        tieneViajes: Boolean(existing.tieneViajes || loc.tieneViajes),
        tienePlanillas: Boolean(existing.tienePlanillas || loc.tienePlanillas),
        tieneTelemetria: Boolean(existing.tieneTelemetria || loc.tieneTelemetria),
        viajesCount: existing.viajesCount ?? loc.viajesCount ?? null,
        planillasCount: existing.planillasCount ?? loc.planillasCount ?? null,
        excesosCount: existing.excesosCount ?? loc.excesosCount ?? null
      };
    });
    return map;
  }, [cloudCoverage, localCoverage]);

  // Calendar grid generation for currentMonth
  const calendarDays = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const firstDay = new Date(y, m, 1).getDay(); // 0 = Sun
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = mergedCoverage[iso] || null;
      const hasT = Boolean(info?.tieneViajes);
      const hasP = Boolean(info?.tienePlanillas);
      const hasG = Boolean(info?.tieneTelemetria);
      const hasAny = hasT || hasP || hasG;
      const isComplete = hasT && hasP && hasG;
      const isLocal = localDates.includes(iso);

      cells.push({
        day: d,
        iso,
        hasT,
        hasP,
        hasG,
        hasAny,
        isComplete,
        isLocal,
        info
      });
    }
    return cells;
  }, [currentMonth, mergedCoverage, localDates]);

  // Month summary KPIs
  const monthStats = useMemo(() => {
    let activeDays = 0;
    let completeDays = 0;
    let missingPlanillasDays = 0;
    let missingGpsDays = 0;

    calendarDays.forEach(c => {
      if (!c || !c.hasAny) return;
      activeDays++;
      if (c.isComplete) completeDays++;
      if (c.hasT && !c.hasP) missingPlanillasDays++;
      if (c.hasT && !c.hasG) missingGpsDays++;
    });

    return { activeDays, completeDays, missingPlanillasDays, missingGpsDays };
  }, [calendarDays]);

  const selectedDayCell = useMemo(() => {
    if (!selectedISO) return null;
    const info = mergedCoverage[selectedISO] || null;
    return {
      iso: selectedISO,
      hasT: Boolean(info?.tieneViajes),
      hasP: Boolean(info?.tienePlanillas),
      hasG: Boolean(info?.tieneTelemetria),
      hasAny: Boolean(info?.tieneViajes || info?.tienePlanillas || info?.tieneTelemetria),
      isComplete: Boolean(info?.tieneViajes && info?.tienePlanillas && info?.tieneTelemetria),
      isLocal: localDates.includes(selectedISO),
      viajesCount: info?.viajesCount,
      planillasCount: info?.planillasCount,
      excesosCount: info?.excesosCount
    };
  }, [selectedISO, mergedCoverage, localDates]);

  const filteredLogs = useMemo(() => {
    return uploadLogs.filter(item => {
      if (logFilterType !== 'ALL' && item.tipo !== logFilterType) return false;
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase();
        const matchUser = (item.usuario || '').toLowerCase().includes(q);
        const matchFile = (item.archivo || '').toLowerCase().includes(q);
        const matchDates = (item.fechasDatos || '').toLowerCase().includes(q);
        if (!matchUser && !matchFile && !matchDates) return false;
      }
      return true;
    });
  }, [uploadLogs, logFilterType, logSearch]);

  const handleDeleteDate = async (isoToDelete) => {
    if (!isoToDelete || !canDelete) return;
    const confirmMsg = `⚠️ PELIGRO: ¿Está seguro de BORRAR permanentemente todos los datos de la nube (Tareas, Planillas y Telemetría) para la fecha ${isoToDelete}? Esta acción no se puede deshacer.`;
    if (!window.confirm(confirmMsg)) return;

    setIsDeleting(true);
    setFeedback({ error: null, success: null });
    try {
      await deleteCloudDataByDate(isoToDelete);
      setCloudCoverage(prev => {
        const copy = { ...prev };
        delete copy[isoToDelete];
        return copy;
      });
      setFeedback({
        error: null,
        success: `Se eliminaron todos los registros en la nube de la fecha ${isoToDelete}.`
      });
      if (onDeleted) onDeleted();
    } catch (err) {
      console.error(err);
      setFeedback({ error: 'Ocurrió un error al intentar eliminar la fecha.', success: null });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="relative bg-[#0d0f1d] border border-white/15 rounded-[2.2rem] w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.65)]"
        >
          {/* Ambient Glows */}
          <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-500/15 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-500/15 blur-3xl rounded-full pointer-events-none" />

          {/* Modal Header */}
          <div className="px-6 sm:px-8 py-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  Cobertura en la Nube y Auditoría
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Control diario de archivos cargados (Tareas, Planillas y GPS) y registro de actividad por usuario.
              </p>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {/* Tab Switcher */}
              <div className="bg-slate-900/90 p-1 rounded-2xl border border-white/10 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('calendar')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                    activeTab === 'calendar'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Calendario de Cobertura
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                    activeTab === 'audit'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Auditoría de Cargas
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar relative z-10">
            {feedback.error && (
              <div className="mb-4">
                <ErrorBanner message={feedback.error} onDismiss={() => setFeedback({ error: null, success: null })} />
              </div>
            )}
            {feedback.success && (
              <div className="mb-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between">
                <span>{feedback.success}</span>
                <button onClick={() => setFeedback({ error: null, success: null })} className="text-emerald-200 hover:text-white">✕</button>
              </div>
            )}

            {activeTab === 'calendar' ? (
              <div className="space-y-6">
                {/* Summary KPI Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="p-4 rounded-2xl bg-slate-900/70 border border-white/10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Días con Operación</span>
                    <p className="text-2xl font-black text-white mt-1">{monthStats.activeDays}</p>
                    <span className="text-[11px] text-slate-400">En {MONTH_NAMES[currentMonth.getMonth()]}</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Cobertura Completa</span>
                    <p className="text-2xl font-black text-emerald-300 mt-1">{monthStats.completeDays}</p>
                    <span className="text-[11px] text-emerald-300/70">Tareas + Planillas + GPS</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Sin Planillas</span>
                    <p className="text-2xl font-black text-amber-300 mt-1">{monthStats.missingPlanillasDays}</p>
                    <span className="text-[11px] text-amber-300/70">Días con viajes sin cruzar</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30">
                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Sin Telemetría GPS</span>
                    <p className="text-2xl font-black text-rose-300 mt-1">{monthStats.missingGpsDays}</p>
                    <span className="text-[11px] text-rose-300/70">Días sin archivo de velocidad</span>
                  </div>
                </div>

                {/* Main Calendar + Day Inspector Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Monthly Matrix */}
                  <div className="lg:col-span-2 bg-slate-900/60 border border-white/10 rounded-3xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <h3 className="text-base sm:text-lg font-extrabold text-white min-w-[160px] text-center">
                          {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400">
                        {(isLoadingCoverage || isSyncingMonth) && (
                          <span className="text-cyan-400 flex items-center gap-1.5">
                            <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                            Verificando...
                          </span>
                        )}
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-cyan-400 inline-block" /> Tareas</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-400 inline-block" /> Planillas</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-400 inline-block" /> GPS</span>
                      </div>
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-1.5 text-center mb-2">
                      {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                        <div key={d} className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 py-1">
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-1.5">
                      {calendarDays.map((cell, idx) => {
                        if (!cell) {
                          return <div key={`empty-${idx}`} className="h-16 rounded-xl bg-slate-950/20" />;
                        }

                        const isSelected = selectedISO === cell.iso;
                        let borderClass = 'border-white/5 bg-slate-900/50 hover:bg-slate-800/70';
                        if (cell.isComplete) {
                          borderClass = 'border-emerald-500/40 bg-emerald-950/25 hover:bg-emerald-900/35';
                        } else if (cell.hasAny) {
                          borderClass = 'border-amber-500/40 bg-amber-950/25 hover:bg-amber-900/35';
                        }
                        if (isSelected) {
                          borderClass = 'border-cyan-400 bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.35)]';
                        }

                        return (
                          <button
                            key={cell.iso}
                            type="button"
                            onClick={() => setSelectedISO(cell.iso)}
                            className={`h-16 p-1.5 rounded-xl border transition-all flex flex-col justify-between text-left relative ${borderClass}`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className={`text-xs font-extrabold ${cell.hasAny ? 'text-white' : 'text-slate-500'}`}>
                                {cell.day}
                              </span>
                              {cell.isLocal && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,1)]"
                                  title="Cargado en pantalla"
                                />
                              )}
                            </div>

                            {/* 3 Data Badges: T (Tareas), P (Planillas), G (GPS) */}
                            <div className="flex items-center justify-center gap-1 w-full">
                              <span
                                className={`text-[9px] font-black px-1 py-0.5 rounded leading-none ${
                                  cell.hasT
                                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/40'
                                    : 'bg-slate-800/60 text-slate-600'
                                }`}
                                title="Tareas y Viajes"
                              >
                                T
                              </span>
                              <span
                                className={`text-[9px] font-black px-1 py-0.5 rounded leading-none ${
                                  cell.hasP
                                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/40'
                                    : 'bg-slate-800/60 text-slate-600'
                                }`}
                                title="Planillas Intermunicipales"
                              >
                                P
                              </span>
                              <span
                                className={`text-[9px] font-black px-1 py-0.5 rounded leading-none ${
                                  cell.hasG
                                    ? 'bg-rose-500/30 text-rose-300 border border-rose-400/40'
                                    : 'bg-slate-800/60 text-slate-600'
                                }`}
                                title="Telemetría GPS"
                              >
                                G
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Inspector Panel */}
                  <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 flex flex-col justify-between">
                    {selectedDayCell ? (
                      <div className="space-y-4">
                        <div className="pb-3 border-b border-white/10">
                          <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                            Diagnóstico de Fecha
                          </span>
                          <h4 className="text-lg font-extrabold text-white mt-0.5">
                            {formatHumanDate(selectedDayCell.iso)}
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">Código ISO: {selectedDayCell.iso}</p>
                        </div>

                        {/* Status checklist */}
                        <div className="space-y-2.5">
                          <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                            selectedDayCell.hasT
                              ? 'bg-cyan-950/30 border-cyan-500/30 text-cyan-200'
                              : 'bg-slate-800/40 border-white/5 text-slate-400'
                          }`}>
                            <div>
                              <p className="text-xs font-extrabold">1. Tareas y Viajes</p>
                              <p className="text-[11px] opacity-80">
                                {selectedDayCell.hasT
                                  ? selectedDayCell.viajesCount !== null
                                    ? `${selectedDayCell.viajesCount} viaje(s) en nube`
                                    : 'Cargado en nube'
                                  : 'Sin archivo cargado'}
                              </p>
                            </div>
                            <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                              selectedDayCell.hasT ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-500'
                            }`}>
                              {selectedDayCell.hasT ? '✓ Listo' : 'Pendiente'}
                            </span>
                          </div>

                          <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                            selectedDayCell.hasP
                              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                              : selectedDayCell.hasT
                              ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                              : 'bg-slate-800/40 border-white/5 text-slate-400'
                          }`}>
                            <div>
                              <p className="text-xs font-extrabold">2. Planillas Intermunicipales</p>
                              <p className="text-[11px] opacity-80">
                                {selectedDayCell.hasP
                                  ? selectedDayCell.planillasCount !== null
                                    ? `${selectedDayCell.planillasCount} viaje(s) con planilla`
                                    : 'Conductores cruzados'
                                  : selectedDayCell.hasT
                                  ? '⚠️ Falta subir planillas de este día'
                                  : 'Sin planillas'}
                              </p>
                            </div>
                            <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                              selectedDayCell.hasP
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : selectedDayCell.hasT
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-500'
                            }`}>
                              {selectedDayCell.hasP ? '✓ Cruzado' : 'Faltante'}
                            </span>
                          </div>

                          <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                            selectedDayCell.hasG
                              ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                              : 'bg-slate-800/40 border-white/5 text-slate-400'
                          }`}>
                            <div>
                              <p className="text-xs font-extrabold">3. Velocidad Excesiva (GPS)</p>
                              <p className="text-[11px] opacity-80">
                                {selectedDayCell.hasG
                                  ? selectedDayCell.excesosCount !== null
                                    ? `${selectedDayCell.excesosCount} exceso(s) registrados`
                                    : 'Telemetría disponible'
                                  : 'Sin reporte GPS'}
                              </p>
                            </div>
                            <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                              selectedDayCell.hasG ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-500'
                            }`}>
                              {selectedDayCell.hasG ? '✓ Listo' : 'Pendiente'}
                            </span>
                          </div>
                        </div>

                        {/* Actions for selected day */}
                        <div className="pt-3 space-y-2.5">
                          {selectedDayCell.hasAny && onSelectDateAndFetch && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectDateAndFetch(selectedDayCell.iso, selectedDayCell.iso);
                                onClose();
                              }}
                              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all"
                            >
                              Consultar este día en Dashboard
                            </button>
                          )}

                          {monthStats.activeDays > 0 && onSelectDateAndFetch && (
                            <button
                              type="button"
                              onClick={() => {
                                const y = currentMonth.getFullYear();
                                const m = String(currentMonth.getMonth() + 1).padStart(2, '0');
                                const lastDay = String(new Date(y, currentMonth.getMonth() + 1, 0).getDate()).padStart(2, '0');
                                onSelectDateAndFetch(`${y}-${m}-01`, `${y}-${m}-${lastDay}`);
                                onClose();
                              }}
                              className="w-full py-2.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-bold text-xs transition-all"
                            >
                              Consultar todo {MONTH_NAMES[currentMonth.getMonth()]}
                            </button>
                          )}

                          {canDelete && selectedDayCell.hasAny && (
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDeleteDate(selectedDayCell.iso)}
                              className="w-full py-2.5 px-4 rounded-2xl bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-500/40 font-bold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              {isDeleting ? 'Eliminando...' : 'Borrar este día de la nube'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-8">
                        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <p className="text-sm font-bold text-slate-300">Selecciona un día del calendario</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Verás el detalle de Tareas, Planillas y GPS o podrás cargarlo al instante.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* TAB 2: AUDITORÍA DE CARGAS */
              <div className="space-y-5">
                {/* Filter and Search Bar */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-white/10">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'ALL', label: 'Todos' },
                      { id: 'viajes', label: 'Tareas y Viajes' },
                      { id: 'planillas', label: 'Planillas' },
                      { id: 'telemetria', label: 'Velocidad GPS' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setLogFilterType(tab.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                          logFilterType === tab.id
                            ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]'
                            : 'bg-slate-800/80 text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={logSearch}
                      onChange={e => setLogSearch(e.target.value)}
                      placeholder="Buscar por usuario o archivo..."
                      className="bg-slate-800/90 border border-white/10 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white placeholder-slate-500 outline-none focus:border-indigo-400 w-full md:w-64"
                    />
                    <button
                      type="button"
                      onClick={refreshLogs}
                      disabled={isLoadingLogs}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10"
                      title="Actualizar bitácora"
                    >
                      <svg className={`w-4 h-4 ${isLoadingLogs ? 'animate-spin text-indigo-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                  </div>
                </div>

                {/* Logs Table */}
                {isLoadingLogs ? (
                  <div className="py-16 text-center text-slate-400 text-sm font-bold">
                    Cargando historial de auditoría...
                  </div>
                ) : logsRestricted ? (
                  <div className="p-8 rounded-3xl bg-amber-950/20 border border-amber-500/30 text-center space-y-2">
                    <p className="text-amber-300 font-extrabold text-base">
                      Bitácora de Auditoría reservada para Administradores
                    </p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Por políticas de seguridad en Firestore, la colección detallada de auditoría de usuarios solo puede ser consultada por cuentas con rol Administrador.
                    </p>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 text-sm font-semibold">
                    No se encontraron registros de carga con los filtros actuales.
                  </div>
                ) : (
                  <div className="overflow-x-auto bg-slate-900/50 rounded-3xl border border-white/10">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider font-black">
                          <th className="py-3.5 px-4">Tipo de Carga</th>
                          <th className="py-3.5 px-4">Archivo</th>
                          <th className="py-3.5 px-4">Registros</th>
                          <th className="py-3.5 px-4">Usuario Responsable</th>
                          <th className="py-3.5 px-4 text-right">Fecha y Hora</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredLogs.map(log => {
                          const badgeStyle =
                            log.tipo === 'viajes'
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                              : log.tipo === 'planillas'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/30';

                          const labelTipo =
                            log.tipo === 'viajes'
                              ? 'Tareas y Viajes'
                              : log.tipo === 'planillas'
                              ? 'Planillas'
                              : log.tipo === 'telemetria'
                              ? 'Velocidad GPS'
                              : log.tipo;

                          return (
                            <tr key={log.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span className={`px-2.5 py-1 rounded-lg font-extrabold border ${badgeStyle}`}>
                                  {labelTipo}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-bold text-slate-200">
                                <div className="truncate max-w-[240px]" title={log.archivo}>
                                  {log.archivo}
                                </div>
                                {log.fechasDatos && (
                                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                                    Datos: {log.fechasDatos}
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-extrabold text-white whitespace-nowrap">
                                {log.registros.toLocaleString('es-CO')}
                              </td>
                              <td className="py-3.5 px-4 text-slate-300 font-semibold whitespace-nowrap">
                                {log.usuario}
                              </td>
                              <td className="py-3.5 px-4 text-right text-slate-400 font-medium whitespace-nowrap">
                                {formatDateTime(log.fecha)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
