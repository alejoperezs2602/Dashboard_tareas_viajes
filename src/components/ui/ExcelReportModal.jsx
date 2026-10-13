import React, { useState, useMemo, useEffect } from 'react';
import { exportExcelReport } from '../../utils/excelExport.js';
import { parseCustomDate } from '../../utils/dateUtils.js';

export default function ExcelReportModal({
  isOpen,
  onClose,
  trips = [],
  telemetry = [],
  planillasMap = null,
  dateRange = { start: '', end: '' },
  diasSinPlanillas = [],
  currentUser = null,
}) {
  const [reportes, setReportes] = useState({
    conductores: true,
    kilometraje: true,
    excesos: true,
  });

  const [filtroTipo, setFiltroTipo] = useState('ALL'); // 'ALL' | 'vehiculo' | 'conductor'
  const [selectedVehiculo, setSelectedVehiculo] = useState('ALL');
  const [selectedConductor, setSelectedConductor] = useState('ALL');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setGenerationError('');
      setIsGenerating(false);
    }
  }, [isOpen]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isGenerating) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isGenerating, onClose]);

  // Listas de vehículos y conductores únicos
  const { listaVehiculos, listaConductores } = useMemo(() => {
    const vehSet = new Set();
    const condSet = new Set();

    trips.forEach((t) => {
      if (t.interno) vehSet.add(String(t.interno).trim());
      if (t.conductoresArray && t.conductoresArray.length) {
        t.conductoresArray.forEach((c) => { if (c) condSet.add(String(c).trim().toUpperCase()); });
      }
    });

    telemetry.forEach((v) => {
      if (v.interno) vehSet.add(String(v.interno).trim());
    });

    const sortVeh = (a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    };

    return {
      listaVehiculos: [...vehSet].sort(sortVeh),
      listaConductores: [...condSet].sort(),
    };
  }, [trips, telemetry]);

  // Período formateado para mostrar en el modal
  const periodoTexto = useMemo(() => {
    const formatYMD = (ymd) => {
      if (!ymd) return '';
      const [y, m, d] = ymd.split('-');
      return `${d}/${m}/${y}`;
    };

    if (dateRange.start && dateRange.end) {
      return dateRange.start === dateRange.end
        ? formatYMD(dateRange.start)
        : `${formatYMD(dateRange.start)} al ${formatYMD(dateRange.end)}`;
    }
    if (dateRange.start) return `Desde el ${formatYMD(dateRange.start)}`;
    if (dateRange.end) return `Hasta el ${formatYMD(dateRange.end)}`;

    // Si no hay filtro, calcular mínimo y máximo de los viajes
    const fechas = trips
      .map((t) => parseCustomDate(t.fecha))
      .filter(Boolean)
      .map((d) => d.getTime());

    if (fechas.length) {
      const min = new Date(Math.min(...fechas));
      const max = new Date(Math.max(...fechas));
      const fmt = (d) =>
        d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return min.getTime() === max.getTime() ? fmt(min) : `${fmt(min)} al ${fmt(max)}`;
    }

    return 'Todos los datos en memoria';
  }, [dateRange, trips]);

  const toggleReporte = (key) => {
    setReportes((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Al menos uno debe quedar seleccionado
      if (!next.conductores && !next.kilometraje && !next.excesos) return prev;
      return next;
    });
  };

  const handleDownload = async () => {
    try {
      setIsGenerating(true);
      setGenerationError('');

      const filtros = {};
      if (filtroTipo === 'vehiculo' && selectedVehiculo !== 'ALL') {
        filtros.vehiculo = selectedVehiculo;
      } else if (filtroTipo === 'conductor' && selectedConductor !== 'ALL') {
        filtros.conductor = selectedConductor;
      }

      await exportExcelReport({
        trips,
        telemetry,
        planillasMap,
        dateRange,
        reportes,
        filtros,
        usuario: currentUser?.email || 'Usuario',
        diasSinPlanillas,
      });

      setIsGenerating(false);
      onClose();
    } catch (err) {
      console.error('Error al generar Excel:', err);
      setGenerationError(err.message || 'Error al compilar el libro Excel. Intenta de nuevo.');
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn"
      onClick={() => { if (!isGenerating) onClose(); }}
    >
      <div
        className="glass-panel w-full max-w-xl rounded-3xl p-6 sm:p-8 border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] relative overflow-hidden bg-slate-900/90 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow de fondo */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 blur-3xl rounded-full -mt-24 -mr-24 pointer-events-none" />

        {/* Encabezado */}
        <div className="flex items-start justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">Reportes en Excel (.xlsx)</h2>
              <p className="text-xs text-slate-400 font-medium">Libro corporativo con portada, gráficos y detalle agrupado</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Cerrar modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info del período */}
        <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-4 mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Período:</span>
            <span className="text-sm font-extrabold text-cyan-400">{periodoTexto}</span>
          </div>
          <span className="text-xs text-slate-400">
            {trips.length} viajes · {telemetry.length} vehículos GPS
          </span>
        </div>

        {/* Selección de Reportes */}
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-2.5">
            Reportes a incluir en el libro:
          </label>
          <div className="space-y-2.5">
            {/* Opción 1: Viajes por conductor */}
            <label
              className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                reportes.conductores
                  ? 'bg-indigo-500/10 border-indigo-500/40 text-slate-100 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                  : 'bg-slate-800/30 border-white/5 text-slate-400 hover:border-white/20'
              }`}
            >
              <input
                type="checkbox"
                checked={reportes.conductores}
                onChange={() => toggleReporte('conductores')}
                className="mt-1 w-4 h-4 rounded text-indigo-500 focus:ring-indigo-400 cursor-pointer accent-indigo-500"
              />
              <div className="flex-1 text-xs">
                <span className="font-extrabold text-sm text-indigo-300 block">1. Cantidad de viajes por conductor</span>
                <span className="opacity-80">
                  Cruza con las planillas para contabilizar viajes oficiales, días trabajados y promedio diario.
                </span>
              </div>
            </label>

            {/* Opción 2: Kilometraje */}
            <label
              className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                reportes.kilometraje
                  ? 'bg-cyan-500/10 border-cyan-500/40 text-slate-100 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                  : 'bg-slate-800/30 border-white/5 text-slate-400 hover:border-white/20'
              }`}
            >
              <input
                type="checkbox"
                checked={reportes.kilometraje}
                onChange={() => toggleReporte('kilometraje')}
                className="mt-1 w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 cursor-pointer accent-cyan-500"
              />
              <div className="flex-1 text-xs">
                <span className="font-extrabold text-sm text-cyan-300 block">2. Total kilometraje</span>
                <span className="opacity-80">
                  Consolidado de la flota y desglose individual por vehículo, día a día y viaje a viaje.
                </span>
              </div>
            </label>

            {/* Opción 3: Excesos de velocidad */}
            <label
              className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                reportes.excesos
                  ? 'bg-rose-500/10 border-rose-500/40 text-slate-100 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                  : 'bg-slate-800/30 border-white/5 text-slate-400 hover:border-white/20'
              }`}
            >
              <input
                type="checkbox"
                checked={reportes.excesos}
                onChange={() => toggleReporte('excesos')}
                className="mt-1 w-4 h-4 rounded text-rose-500 focus:ring-rose-400 cursor-pointer accent-rose-500"
              />
              <div className="flex-1 text-xs">
                <span className="font-extrabold text-sm text-rose-300 block">3. Excesos de velocidad (&gt; 85 km/h)</span>
                <span className="opacity-80">
                  Eventos agrupados por vehículo con clasificación (Leve / Moderado / Grave) y enlace al mapa.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Filtro Opcional: Individual o Todos */}
        <div className="mb-6 p-4 rounded-2xl bg-slate-800/40 border border-white/5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">
              Alcance de la exportación:
            </label>
            <div className="inline-flex rounded-xl bg-slate-900/60 p-1 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => { setFiltroTipo('ALL'); }}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  filtroTipo === 'ALL'
                    ? 'bg-emerald-500/20 text-emerald-300 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Toda la flota
              </button>
              <button
                type="button"
                onClick={() => { setFiltroTipo('vehiculo'); }}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  filtroTipo === 'vehiculo'
                    ? 'bg-cyan-500/20 text-cyan-300 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Por Vehículo
              </button>
              <button
                type="button"
                onClick={() => { setFiltroTipo('conductor'); }}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  filtroTipo === 'conductor'
                    ? 'bg-indigo-500/20 text-indigo-300 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Por Conductor
              </button>
            </div>
          </div>

          {/* Selector dinámico si aplica */}
          {filtroTipo === 'vehiculo' && (
            <div className="mt-2">
              <label className="block text-xs text-slate-400 mb-1">Selecciona el vehículo (interno):</label>
              <select
                value={selectedVehiculo}
                onChange={(e) => setSelectedVehiculo(e.target.value)}
                className="w-full bg-slate-900/80 border border-cyan-500/40 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                <option value="ALL">-- Todos los vehículos --</option>
                {listaVehiculos.map((v) => (
                  <option key={v} value={v}>
                    Interno #{v}
                  </option>
                ))}
              </select>
            </div>
          )}

          {filtroTipo === 'conductor' && (
            <div className="mt-2">
              <label className="block text-xs text-slate-400 mb-1">Selecciona el conductor:</label>
              <select
                value={selectedConductor}
                onChange={(e) => setSelectedConductor(e.target.value)}
                className="w-full bg-slate-900/80 border border-indigo-500/40 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="ALL">-- Todos los conductores --</option>
                {listaConductores.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Error si ocurre durante la generación */}
        {generationError && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold">
            {generationError}
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-300 font-bold text-sm hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isGenerating || trips.length === 0}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:shadow-[0_0_35px_rgba(16,185,129,0.6)] transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Generando Libro Excel...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Descargar Excel (.xlsx)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
