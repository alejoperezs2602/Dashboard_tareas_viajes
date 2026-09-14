import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { parseAllTrips } from './utils/excelParser';
import { parseTelemetry } from './utils/telemetryParser';
import { parseCustomDate } from './utils/dateUtils.js';
import { saveData, loadData, clearAllData } from './utils/storage.js';
import { generateReport } from './utils/pdfExport.js';
import GeneralDashboard from './components/GeneralDashboard';
import IndividualDashboard from './components/IndividualDashboard';
import TelemetryDashboard from './components/TelemetryDashboard';
import { motion, AnimatePresence } from 'framer-motion';
import Tilt from 'react-parallax-tilt';
import LoadingSpinner from './components/ui/LoadingSpinner.jsx';
import ErrorBanner from './components/ui/ErrorBanner.jsx';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './constants/index.js';
import CommandPalette from './components/CommandPalette';

function App() {
  const [allTrips, setAllTrips] = useState([]);
  const [telemetryData, setTelemetryData] = useState([]);
  const [activeTab, setActiveTab] = useState('general');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem('theme') === 'light';
  });

  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add('light-mode');
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.remove('light-mode');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLightMode]);

  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  // Lifted state for cross-tab navigation (drill-down)
  const [globalFilters, setGlobalFilters] = useState({
    ruta: 'ALL',
    conductor: 'ALL',
    interno: 'ALL',
    viajeIndex: ''
  });

  // Restore persisted data on mount
  useEffect(() => {
    async function restore() {
      const savedTrips = await loadData('allTrips');
      const savedTelemetry = await loadData('telemetryData');
      if (savedTrips && savedTrips.length > 0) {
        setAllTrips(savedTrips);
      }
      if (savedTelemetry && savedTelemetry.length > 0) {
        setTelemetryData(savedTelemetry);
      }
    }
    restore();
  }, []);

  // Helper to parse YYYY-MM-DD to local Date
  const parseLocalYMD = (ymdStr) => {
    if (!ymdStr) return null;
    const [y, m, d] = ymdStr.split('-');
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  };

  const filteredTrips = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return allTrips;
    
    const start = dateRange.start ? parseLocalYMD(dateRange.start) : new Date('2000-01-01T00:00:00');
    const end = dateRange.end ? parseLocalYMD(dateRange.end) : new Date('2100-01-01T00:00:00');
    end.setHours(23, 59, 59, 999);
    
    return allTrips.filter(t => {
      const d = parseCustomDate(t.fecha);
      if (!d) return true;
      return d >= start && d <= end;
    });
  }, [allTrips, dateRange]);

  const filteredTelemetry = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return telemetryData;
    
    const start = dateRange.start ? parseLocalYMD(dateRange.start) : new Date('2000-01-01T00:00:00');
    const end = dateRange.end ? parseLocalYMD(dateRange.end) : new Date('2100-01-01T00:00:00');
    end.setHours(23, 59, 59, 999);
    
    return telemetryData.map(veh => ({
      ...veh,
      puntos: veh.puntos.filter(p => {
        const d = parseCustomDate(p.fecha);
        if (!d) return true; // keep if no date
        return d >= start && d <= end;
      })
    })).filter(veh => veh.puntos.length > 0);
  }, [telemetryData, dateRange]);

  const handleDrillDown = (interno, ruta = 'ALL') => {
    setGlobalFilters({ ruta, conductor: 'ALL', interno, viajeIndex: '' });
    setActiveTab('individual');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`El archivo excede el límite de ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      setIsLoading(true);
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
        
        const trips = parseAllTrips(matrix);
        if (trips.length === 0) {
          setError("No se pudieron detectar viajes. Asegúrese de que las tablas terminen con 'TOTAL'.");
        } else {
          setAllTrips(trips);
          saveData('allTrips', trips);
          if (activeTab === 'telemetry') setActiveTab('general');
        }
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        setError("Ocurrió un error al procesar el archivo Excel de Tiempos.");
        setIsLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null; // reset
  };

  const handleTelemetryUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`El archivo excede el límite de ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      setIsLoading(true);
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const flatData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
        
        const parsed = parseTelemetry(flatData);
        if (parsed.length === 0) {
          setError("No se encontraron coordenadas GPS válidas. Revise las columnas (Latitud, Longitud, Velocidad).");
        } else {
          setTelemetryData(parsed);
          saveData('telemetryData', parsed);
          setActiveTab('telemetry');
        }
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        setError("Ocurrió un error al procesar el archivo Excel de Telemetría.");
        setIsLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null; // reset
  };

  const handleClearData = async () => {
    await clearAllData();
    setAllTrips([]);
    setTelemetryData([]);
    setActiveTab('general');
    setError('');
    setGlobalFilters({ ruta: 'ALL', conductor: 'ALL', interno: 'ALL', viajeIndex: '' });
  };

  const handleExportPDF = () => {
    if (allTrips.length === 0) {
      setError('No hay datos para exportar. Cargue un archivo primero.');
      return;
    }
    generateReport(allTrips, telemetryData);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const paletteActions = {
    goToGeneral: () => setActiveTab('general'),
    goToVehicles: () => setActiveTab('individual'),
    goToTelemetry: () => setActiveTab('telemetry'),
    exportPDF: () => handleExportPDF(),
    toggleTheme: () => setIsLightMode(!isLightMode),
    clearData: () => handleClearData()
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {isLoading && <LoadingSpinner />}
      {/* Liquid background blobs (Vivid Neon Tones) */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0 flex items-center justify-center">
        <div className="absolute top-10 -left-10 w-[500px] h-[500px] bg-cyan-500/40 rounded-full mix-blend-screen filter blur-[150px] opacity-80 animate-blob"></div>
        <div className="absolute top-0 -right-10 w-[500px] h-[500px] bg-fuchsia-600/40 rounded-full mix-blend-screen filter blur-[150px] opacity-80 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-20 left-1/4 w-[600px] h-[600px] bg-indigo-600/40 rounded-full mix-blend-screen filter blur-[150px] opacity-80 animate-blob animation-delay-4000"></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-10 space-y-8 relative z-10">
        {/* 3D Premium Header Card */}
        <Tilt tiltMaxAngleX={3} tiltMaxAngleY={3} scale={1.01} transitionSpeed={2000} gyroscope={true}>
          <div className="glass-panel p-10 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
            
            <div className="flex items-center gap-4 relative z-10">
                <div>
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">Dashboard de Viajes</h1>
                  <p className="text-slate-300 mt-2 font-medium text-lg">Inteligencia y estadísticas en tiempo real</p>
                </div>
                <button 
                  onClick={() => setIsLightMode(!isLightMode)}
                  className="ml-4 p-3 rounded-2xl glass-panel text-cyan-400 hover:text-cyan-300 transition-all hover:scale-110 active:scale-95"
                  aria-label="Toggle Theme"
                >
                  {isLightMode ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  )}
                </button>
            </div>
            
            <div className="relative z-10 w-full md:w-auto flex flex-col sm:flex-row gap-4">
                <label className="group relative flex items-center justify-center cursor-pointer bg-white/5 backdrop-blur-2xl text-white font-extrabold py-3 px-6 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.2),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-all hover:shadow-[0_0_40px_rgba(6,182,212,0.6),inset_0_1px_1px_rgba(255,255,255,0.4)] hover:-translate-y-1 active:translate-y-0 border border-cyan-400/30 hover:border-cyan-400/80 overflow-hidden text-sm">
                  <span className="absolute inset-0 bg-cyan-400/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></span>
                  <span className="mr-2 relative z-10">
                    <svg className="w-5 h-5 text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,0.8)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                  </span>
                  <span className="relative z-10 tracking-wide">Tareas y Viajes</span>
                  <input 
                    type="file" 
                    accept=".xlsx, .xls" 
                    onChange={handleFileUpload}
                    className="hidden" 
                  />
                </label>
                
                <label className="group relative flex items-center justify-center cursor-pointer bg-white/5 backdrop-blur-2xl text-white font-extrabold py-3 px-6 rounded-2xl shadow-[0_0_20px_rgba(244,63,94,0.2),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-all hover:shadow-[0_0_40px_rgba(244,63,94,0.6),inset_0_1px_1px_rgba(255,255,255,0.4)] hover:-translate-y-1 active:translate-y-0 border border-rose-400/30 hover:border-rose-400/80 overflow-hidden text-sm">
                  <span className="absolute inset-0 bg-rose-400/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></span>
                  <span className="mr-2 relative z-10">
                    <svg className="w-5 h-5 text-rose-300 drop-shadow-[0_0_8px_rgba(253,164,175,0.8)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                  </span>
                  <span className="relative z-10 tracking-wide">Velocidad Excesiva</span>
                  <input 
                    type="file" 
                    accept=".xlsx, .xls" 
                    onChange={handleTelemetryUpload}
                    className="hidden" 
                  />
                </label>
            </div>

            <div className="relative z-10 w-full md:w-auto flex flex-col sm:flex-row gap-3 mt-4 md:mt-0">
                {allTrips.length > 0 && (
                  <>
                    <button 
                      onClick={handleExportPDF}
                      className="group relative flex items-center justify-center bg-white/5 backdrop-blur-2xl text-white font-extrabold py-3 px-6 rounded-2xl shadow-[0_0_20px_rgba(255,255,255,0.05),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2),inset_0_1px_1px_rgba(255,255,255,0.4)] hover:-translate-y-1 active:translate-y-0 border border-white/20 hover:border-white/50 overflow-hidden text-sm"
                    >
                      <span className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></span>
                      <span className="mr-2 relative z-10">
                        <svg className="w-5 h-5 text-slate-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                        </svg>
                      </span>
                      <span className="relative z-10 tracking-wide">Exportar PDF</span>
                    </button>
                    <button 
                      onClick={handleClearData}
                      className="group relative flex items-center justify-center bg-rose-500/10 backdrop-blur-2xl text-white font-extrabold py-3 px-6 rounded-2xl shadow-[0_0_20px_rgba(244,63,94,0.1),inset_0_1px_1px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_40px_rgba(244,63,94,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:-translate-y-1 active:translate-y-0 border border-rose-500/30 hover:border-rose-400/80 overflow-hidden text-sm"
                    >
                      <span className="absolute inset-0 bg-rose-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></span>
                      <span className="mr-2 relative z-10">
                        <svg className="w-5 h-5 text-rose-300 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                      </span>
                      <span className="relative z-10 tracking-wide">Limpiar Datos</span>
                    </button>
                  </>
                )}
            </div>
          </div>
        </Tilt>

        <AnimatePresence>
          {error && (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          )}
        </AnimatePresence>

        {(allTrips.length === 0 && telemetryData.length === 0) ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center mt-20 text-center space-y-8"
          >
            <div className="glass-panel p-10 rounded-[2.5rem] max-w-2xl w-full relative overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-400/10 blur-3xl rounded-full -mt-20 -mr-20 pointer-events-none"></div>
              
              <h2 className="text-3xl font-extrabold text-slate-100 mb-2">Bienvenido al Centro de Control</h2>
              <p className="text-slate-400 text-lg mb-10">Sigue estos pasos para comenzar a visualizar los datos de tu flota.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                <div className="flex flex-col items-center p-4 bg-slate-800/40 rounded-2xl border border-white/5 relative">
                  <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-black text-xl mb-3 border border-blue-500/30">1</div>
                  <h3 className="font-bold text-slate-200 mb-2">Sube Tareas</h3>
                  <p className="text-sm text-slate-500">Carga el archivo de rutas (Tareas y Viajes) en la barra superior.</p>
                </div>
                <div className="flex flex-col items-center p-4 bg-slate-800/40 rounded-2xl border border-white/5 relative">
                  <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center font-black text-xl mb-3 border border-rose-500/30">2</div>
                  <h3 className="font-bold text-slate-200 mb-2">Sube GPS</h3>
                  <p className="text-sm text-slate-500">Carga el archivo de velocidad excesiva para análisis de seguridad.</p>
                </div>
                <div className="flex flex-col items-center p-4 bg-slate-800/40 rounded-2xl border border-white/5 relative">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center font-black text-xl mb-3 border border-emerald-500/30">3</div>
                  <h3 className="font-bold text-slate-200 mb-2">Explora</h3>
                  <p className="text-sm text-slate-500">Obtén alertas, puntajes y mapas interactivos automáticamente.</p>
                </div>
              </div>
              
              <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-slate-500 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                Privacidad total: Tus datos se procesan localmente y nunca salen de tu navegador.
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-8"
          >
            {/* Segmented Control Tabs (3D pill) */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-4">
              <div className="flex items-center gap-2 bg-slate-800/50 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 mb-4 md:mb-0 w-full md:w-auto">
                <span className="text-xs font-bold text-slate-400 uppercase">Filtro:</span>
                <input 
                  type="date" 
                  value={dateRange.start} 
                  onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent text-sm font-bold text-slate-200 outline-none cursor-pointer"
                />
                <span className="text-slate-500">-</span>
                <input 
                  type="date" 
                  value={dateRange.end} 
                  onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent text-sm font-bold text-slate-200 outline-none cursor-pointer"
                />
                <button 
                  onClick={() => {
                    // Find max date in allTrips
                    if (allTrips.length === 0) return;
                    let maxStr = allTrips[0].fecha;
                    let maxTime = 0;
                    
                    const firstDate = parseCustomDate(maxStr);
                    if (firstDate) maxTime = firstDate.getTime();
                    
                    allTrips.forEach(t => {
                      const d = parseCustomDate(t.fecha);
                      if (d) {
                        const tTime = d.getTime();
                        if (tTime > maxTime) {
                          maxTime = tTime;
                          maxStr = t.fecha;
                        }
                      }
                    });
                    
                    // Format to YYYY-MM-DD using local time
                    if (maxStr) {
                      try {
                        const d = parseCustomDate(maxStr);
                        if (d) {
                          const y = d.getFullYear();
                          const m = String(d.getMonth() + 1).padStart(2, '0');
                          const day = String(d.getDate()).padStart(2, '0');
                          const iso = `${y}-${m}-${day}`;
                          setDateRange({ start: iso, end: iso });
                        }
                      } catch(e) {
                        console.error("Error setting date range", e);
                      }
                    }
                  }}
                  className="ml-2 px-3 py-1 text-xs font-bold bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors"
                  title="Filtrar al último día con datos"
                >
                  Último Día
                </button>
                {(dateRange.start || dateRange.end) && (
                  <button onClick={() => setDateRange({start: '', end: ''})} className="ml-2 text-rose-400 hover:text-rose-300">
                    ✕
                  </button>
                )}
              </div>
              <div className="inner-depth p-2 rounded-full flex flex-wrap justify-center gap-2 backdrop-blur-2xl relative">
                {allTrips.length > 0 && (
                  <>
                    <button 
                      onClick={() => setActiveTab('general')}
                      className={`relative px-6 md:px-8 py-3 rounded-full text-xs md:text-sm font-extrabold transition-all duration-300 ease-out outline-none overflow-hidden z-10 tracking-wide ${
                        activeTab === 'general' 
                          ? 'text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.4)] border border-cyan-400/50' 
                          : 'text-slate-400 hover:text-cyan-200 border border-transparent'
                      }`}
                    >
                      {activeTab === 'general' && <motion.div layoutId="tabBackground" className="absolute inset-0 bg-cyan-400/10 backdrop-blur-md rounded-full -z-10"></motion.div>}
                      Estadísticas Generales
                    </button>
                    <button 
                      onClick={() => setActiveTab('individual')}
                      className={`relative px-6 md:px-8 py-3 rounded-full text-xs md:text-sm font-extrabold transition-all duration-300 ease-out outline-none overflow-hidden z-10 tracking-wide ${
                        activeTab === 'individual' 
                          ? 'text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.4)] border border-cyan-400/50' 
                          : 'text-slate-400 hover:text-cyan-200 border border-transparent'
                      }`}
                    >
                      {activeTab === 'individual' && <motion.div layoutId="tabBackground" className="absolute inset-0 bg-cyan-400/10 backdrop-blur-md rounded-full -z-10"></motion.div>}
                      Búsqueda Individualizada
                    </button>
                  </>
                )}
                {telemetryData.length > 0 && (
                  <button 
                    onClick={() => setActiveTab('telemetry')}
                    className={`relative px-6 md:px-8 py-3 rounded-full text-xs md:text-sm font-extrabold transition-all duration-300 ease-out outline-none overflow-hidden z-10 tracking-wide ${
                      activeTab === 'telemetry' 
                        ? 'text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.4)] border border-rose-400/50' 
                        : 'text-slate-400 hover:text-rose-200 border border-transparent'
                    }`}
                  >
                    {activeTab === 'telemetry' && <motion.div layoutId="tabBackground" className="absolute inset-0 bg-rose-400/10 backdrop-blur-md rounded-full -z-10"></motion.div>}
                    Mapa GPS Automotor
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.98 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeTab === 'general' && filteredTrips.length > 0 && (
                  <GeneralDashboard allTrips={filteredTrips} onDrillDown={handleDrillDown} telemetryData={filteredTelemetry} />
                )}
                {activeTab === 'individual' && filteredTrips.length > 0 && (
                  <IndividualDashboard 
                    allTrips={filteredTrips} 
                    filters={globalFilters} 
                    setFilters={setGlobalFilters} 
                    telemetryData={filteredTelemetry}
                  />
                )}
                {activeTab === 'telemetry' && filteredTelemetry.length > 0 && (
                  <TelemetryDashboard telemetryData={filteredTelemetry} />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <CommandPalette 
        isOpen={isPaletteOpen} 
        onClose={() => setIsPaletteOpen(false)} 
        actions={paletteActions} 
      />
    </div>
  );
}

export default App;
