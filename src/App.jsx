import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './services/firebase.js';
import {
  upsertTrips,
  upsertPlanillas,
  upsertTelemetry,
  fetchHistoricalTrips,
  fetchHistoricalTelemetry,
  fetchAvailableDates,
  fetchUserRole,
  logUpload
} from './services/fleetService.js';
import LoginScreen from './components/ui/LoginScreen.jsx';
import { parseAllTrips } from './utils/excelParser';
import { parseTelemetry } from './utils/telemetryParser';
import { parsePlanillas } from './utils/planillasParser';
import { parseCustomDate } from './utils/dateUtils.js';
import { saveData, loadData, clearAllData } from './utils/storage.js';
import GeneralDashboard from './components/GeneralDashboard';
import IndividualDashboard from './components/IndividualDashboard';
import TelemetryDashboard from './components/TelemetryDashboard';
import { motion, AnimatePresence } from 'framer-motion';
import Tilt from 'react-parallax-tilt';
import LoadingSpinner from './components/ui/LoadingSpinner.jsx';
import SyncToast from './components/ui/SyncToast.jsx';
import ErrorBanner from './components/ui/ErrorBanner.jsx';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './constants/index.js';
import CommandPalette from './components/CommandPalette';
import CloudAuditModal from './components/ui/CloudAuditModal.jsx';
import AvailableDatePicker from './components/ui/AvailableDatePicker.jsx';
import ExcelReportModal from './components/ui/ExcelReportModal.jsx';

function toISODateKey(d) {
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function summarizeDatesLabel(isoSet) {
  const arr = Array.from(isoSet).filter(Boolean).sort();
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  return `${arr[0]} a ${arr[arr.length - 1]} (${arr.length} días)`;
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [allTrips, setAllTrips] = useState([]);
  const [planillasMap, setPlanillasMap] = useState(null); // null = not uploaded yet

  const loadedPlanillasCount = useMemo(() => {
    if (planillasMap) return planillasMap.size;
    return allTrips.filter(t => t.planilla && t.planilla.conductor).length;
  }, [allTrips, planillasMap]);

  const [telemetryData, setTelemetryData] = useState([]);
  const [activeTab, setActiveTab] = useState('general');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isCloudAuditOpen, setIsCloudAuditOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Procesando archivo...');
  const [loadingSubMessage, setLoadingSubMessage] = useState('Esto puede tomar unos segundos');
  const [syncStatus, setSyncStatus] = useState({ isSyncing: false, message: '', subMessage: '' });
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const uploadMenuRef = useRef(null);

  const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem('theme') === 'light';
  });

  // Close floating upload menu on click outside
  useEffect(() => {
    function handleOutside(e) {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target)) {
        setIsUploadMenuOpen(false);
      }
    }
    if (isUploadMenuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isUploadMenuOpen]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  // Rol del usuario (usuarios/{uid}.rol). Sin rol asignado => 'visor'
  const [userRole, setUserRole] = useState('visor');
  const canUpload = userRole === 'admin' || userRole === 'operador';
  const canDelete = userRole === 'admin';
  const uploader = currentUser ? { uid: currentUser.uid, email: currentUser.email } : null;

  useEffect(() => {
    if (!currentUser) {
      setUserRole('visor');
      return;
    }
    let cancelled = false;
    fetchUserRole(currentUser.uid, currentUser.email).then(r => { if (!cancelled) setUserRole(r); });
    return () => { cancelled = true; };
  }, [currentUser]);

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
  const [availableDates, setAvailableDates] = useState([]);

  const refreshAvailableDates = () => {
    if (authChecked && currentUser) {
      fetchAvailableDates()
        .then(dates => setAvailableDates(dates))
        .catch(err => console.error("Error fetching dates:", err));
    }
  };

  // Fetch available dates when auth is ready
  useEffect(() => {
    refreshAvailableDates();
  }, [authChecked, currentUser]);

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
      const savedPlanillas = await loadData('planillasMap');

      if (savedTrips && savedTrips.length > 0) {
        setAllTrips(savedTrips);
      }
      if (savedTelemetry && savedTelemetry.length > 0) {
        setTelemetryData(savedTelemetry);
      }
      if (savedPlanillas) {
        setPlanillasMap(new Map(savedPlanillas));
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

    const startYMD = dateRange.start || dateRange.end;
    const endYMD = dateRange.end || dateRange.start;

    const start = parseLocalYMD(startYMD);
    const end = parseLocalYMD(endYMD);
    end.setHours(23, 59, 59, 999);

    return allTrips.filter(t => {
      const d = parseCustomDate(t.fecha);
      if (!d) return false;
      return d >= start && d <= end;
    });
  }, [allTrips, dateRange]);

  const validatedTrips = useMemo(() => {
    const diasConPlanilla = new Set();

    const tienePlanilla = (t) => {
      const id = String(t.viaje).trim();
      return (t.planilla && t.planilla.conductor) || (planillasMap && planillasMap.has(id));
    };

    const getConductor = (t) => {
      const id = String(t.viaje).trim();
      if (planillasMap && planillasMap.has(id)) return planillasMap.get(id);
      if (t.planilla && t.planilla.conductor) return t.planilla.conductor;
      return null;
    };

    filteredTrips.forEach(t => {
      if (tienePlanilla(t)) {
        const iso = toISODateKey(parseCustomDate(t.fecha));
        if (iso) diasConPlanilla.add(iso);
      }
    });

    return filteredTrips.filter(t => {
      const iso = toISODateKey(parseCustomDate(t.fecha));
      if (!iso) return true;

      const diaTienePlanilla = diasConPlanilla.has(iso);
      if (diaTienePlanilla && !tienePlanilla(t)) {
        return false;
      }
      return true;
    }).map(t => {
      const conductorFromPlanilla = getConductor(t);
      if (conductorFromPlanilla) {
        return {
          ...t,
          conductoresArray: [conductorFromPlanilla],
          puntos: t.puntos.map(p => ({
            ...p,
            conductor: conductorFromPlanilla
          }))
        };
      }
      return t;
    });
  }, [filteredTrips, planillasMap]);

  // Calculate which dates are completely missing Planillas
  const diasSinPlanillas = useMemo(() => {
    if (filteredTrips.length === 0) return [];

    const tienePlanilla = (t) => {
      const id = String(t.viaje).trim();
      return (t.planilla && t.planilla.conductor) || (planillasMap && planillasMap.has(id));
    };

    const diasTotales = new Set();
    const diasCon = new Set();

    filteredTrips.forEach(t => {
      const iso = toISODateKey(parseCustomDate(t.fecha));
      if (iso) {
        diasTotales.add(iso);
        if (tienePlanilla(t)) diasCon.add(iso);
      }
    });

    return [...diasTotales].filter(iso => !diasCon.has(iso)).sort();
  }, [filteredTrips, planillasMap]);

  // Extraer fechas y cobertura detallada que ya están descargadas en la sesión (bóveda local)
  const { localDates, localCoverage } = useMemo(() => {
    const dates = new Set();
    const cov = {};

    const ensure = (iso) => {
      if (!cov[iso]) {
        cov[iso] = {
          fechaISO: iso,
          tieneViajes: false,
          tienePlanillas: false,
          tieneTelemetria: false,
          viajesCount: 0,
          planillasCount: 0,
          excesosCount: 0
        };
      }
      return cov[iso];
    };

    allTrips.forEach(t => {
      const iso = toISODateKey(parseCustomDate(t.fecha));
      if (iso) {
        dates.add(iso);
        const entry = ensure(iso);
        entry.tieneViajes = true;
        entry.viajesCount++;
        const id = String(t.viaje ?? '').trim();
        if ((t.planilla && t.planilla.conductor) || (planillasMap && planillasMap.has(id))) {
          entry.tienePlanillas = true;
          entry.planillasCount++;
        }
      }
    });

    telemetryData.forEach(v => {
      v.puntos.forEach(p => {
        const iso = toISODateKey(parseCustomDate(p.fecha));
        if (iso) {
          dates.add(iso);
          const entry = ensure(iso);
          entry.tieneTelemetria = true;
          if (p.esExceso) entry.excesosCount++;
        }
      });
    });

    return { localDates: Array.from(dates), localCoverage: cov };
  }, [allTrips, telemetryData, planillasMap]);

  const filteredTelemetry = useMemo(() => {
    let start, end;

    if (!dateRange.start && !dateRange.end) {
      if (telemetryData.length === 0) return telemetryData;
    } else {
      const startYMD = dateRange.start || dateRange.end;
      const endYMD = dateRange.end || dateRange.start;

      start = parseLocalYMD(startYMD);
      end = parseLocalYMD(endYMD);
      end.setHours(23, 59, 59, 999);
    }

    return telemetryData.map(veh => {
      const filteredPuntos = veh.puntos.filter(p => {
        if (!p.esExceso) return false;

        if (start && end) {
          const d = parseCustomDate(p.fecha);
          if (!d) return false;
          if (d < start || d > end) return false;
        }
        return true;
      });

      let excesos = 0;
      const conductoresSet = new Set();

      filteredPuntos.forEach(p => {
        if (p.esExceso) excesos++;
        if (p.conductor) conductoresSet.add(p.conductor);
      });

      return {
        ...veh,
        puntos: filteredPuntos,
        excesos: excesos,
        conductores: Array.from(conductoresSet)
      };
    }).filter(veh => veh.excesos > 0);
  }, [telemetryData, dateRange]);

  const handleDrillDown = (interno, ruta = 'ALL') => {
    setGlobalFilters({ ruta, conductor: 'ALL', interno, viajeIndex: '' });
    setActiveTab('individual');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploadMenuOpen(false);
    if (!canUpload) {
      setError('Tu rol (visor) no permite subir archivos.');
      e.target.value = null;
      return;
    }

    setError('');
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`El archivo excede el límite de ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = function(ev) {
      setIsLoading(true);
      setLoadingMessage('Procesando archivo local...');
      setLoadingSubMessage('Parseando Excel...');

      setTimeout(() => {
        try {
          const data = new Uint8Array(ev.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });
          const trips = parseAllTrips(matrix);

          if (trips.length === 0) {
            setError("No se pudieron detectar viajes. Asegúrese de que las tablas terminen con 'TOTAL'.");
            setIsLoading(false);
          } else {
            setAllTrips(trips);
            saveData('allTrips', trips);
            if (activeTab === 'telemetry') setActiveTab('general');

            setIsLoading(false);

            const datesSet = new Set();
            trips.forEach(t => {
              const iso = toISODateKey(parseCustomDate(t.fecha));
              if (iso) datesSet.add(iso);
            });
            const fechasDatos = summarizeDatesLabel(datesSet);

            setSyncStatus({ isSyncing: true, message: 'Guardando en la nube...', subMessage: 'Iniciando sincronización' });
            upsertTrips(trips, (processed, total) => {
              setSyncStatus({ isSyncing: true, message: 'Guardando en la nube...', subMessage: `${processed} de ${total} viajes guardados.` });
            }, uploader).then(() => {
              logUpload(uploader, { tipo: 'viajes', archivo: file.name, registros: trips.length, fechasDatos });
              refreshAvailableDates();
              setSyncStatus({ isSyncing: false, message: '', subMessage: '' });
            }).catch(err => {
              console.error("Error sync trips:", err);
              setSyncStatus({ isSyncing: false, message: '', subMessage: '' });
            });
          }
        } catch (err) {
          console.error(err);
          setError("Ocurrió un error al procesar el archivo Excel de Tiempos.");
          setIsLoading(false);
        }
      }, 50);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  const handleTelemetryUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploadMenuOpen(false);
    if (!canUpload) {
      setError('Tu rol (visor) no permite subir archivos.');
      e.target.value = null;
      return;
    }

    setError('');
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`El archivo excede el límite de ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = function(ev) {
      setIsLoading(true);
      setLoadingMessage('Procesando archivo local...');
      setLoadingSubMessage('Parseando telemetría...');

      setTimeout(() => {
        try {
          const data = new Uint8Array(ev.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          const flatData = XLSX.utils.sheet_to_json(worksheet, { raw: true });
          const parsed = parseTelemetry(flatData);

          if (parsed.length === 0) {
            setError("No se encontraron coordenadas GPS válidas. Revise las columnas (Latitud, Longitud, Velocidad).");
            setIsLoading(false);
          } else {
            setTelemetryData(parsed);
            saveData('telemetryData', parsed);
            setActiveTab('telemetry');

            setIsLoading(false);

            const datesSet = new Set();
            parsed.forEach(v => (v.puntos || []).forEach(p => {
              const iso = toISODateKey(parseCustomDate(p.fecha));
              if (iso) datesSet.add(iso);
            }));
            const fechasDatos = summarizeDatesLabel(datesSet);

            setSyncStatus({ isSyncing: true, message: 'Subiendo telemetría...', subMessage: 'Iniciando sincronización' });
            upsertTelemetry(parsed, (processed, total) => {
              setSyncStatus({ isSyncing: true, message: 'Subiendo telemetría...', subMessage: `${processed} de ${total} vehículos combinados.` });
            }, uploader).then(() => {
              logUpload(uploader, { tipo: 'telemetria', archivo: file.name, registros: parsed.length, fechasDatos });
              refreshAvailableDates();
              setSyncStatus({ isSyncing: false, message: '', subMessage: '' });
            }).catch(err => {
              console.error("Error sync telemetry:", err);
              setSyncStatus({ isSyncing: false, message: '', subMessage: '' });
            });
          }
        } catch (err) {
          console.error(err);
          setError("Ocurrió un error al procesar el archivo Excel de Telemetría.");
          setIsLoading(false);
        }
      }, 50);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  const handlePlanillasUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploadMenuOpen(false);
    if (!canUpload) {
      setError('Tu rol (visor) no permite subir archivos.');
      e.target.value = null;
      return;
    }

    setError('');
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`El archivo excede el límite de ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = function(ev) {
      setIsLoading(true);
      setLoadingMessage('Procesando archivo local...');
      setLoadingSubMessage('Parseando Planillas...');

      setTimeout(() => {
        try {
          const data = new Uint8Array(ev.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const flatData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

          const parsed = parsePlanillas(flatData);
          if (parsed.size === 0) {
            setError('No se encontraron registros en Planillas Intermunicipales. Verifique que el archivo tenga la columna "Viaje".');
            setIsLoading(false);
          } else {
            setPlanillasMap(parsed);
            saveData('planillasMap', Array.from(parsed.entries()));

            setIsLoading(false);

            const datesSet = new Set();
            allTrips.forEach(t => {
              if (parsed.has(String(t.viaje ?? '').trim())) {
                const iso = toISODateKey(parseCustomDate(t.fecha));
                if (iso) datesSet.add(iso);
              }
            });
            const fechasDatos = summarizeDatesLabel(datesSet);

            setSyncStatus({ isSyncing: true, message: 'Subiendo planillas...', subMessage: 'Iniciando sincronización' });
            upsertPlanillas(parsed, (processed, total) => {
              setSyncStatus({ isSyncing: true, message: 'Subiendo planillas...', subMessage: `${processed} de ${total} sincronizadas.` });
            }, uploader, allTrips).then(() => {
              logUpload(uploader, { tipo: 'planillas', archivo: file.name, registros: parsed.size, fechasDatos });
              refreshAvailableDates();
              setSyncStatus({ isSyncing: false, message: '', subMessage: '' });
            }).catch(err => {
              console.error("Error sync planillas:", err);
              setSyncStatus({ isSyncing: false, message: '', subMessage: '' });
            });
          }
        } catch (err) {
          console.error(err);
          setError('Ocurrió un error al procesar el archivo de Planillas Intermunicipales.');
          setIsLoading(false);
        }
      }, 50);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  const handleClearData = async () => {
    await clearAllData();
    setAllTrips([]);
    setTelemetryData([]);
    setPlanillasMap(null);
    setActiveTab('general');
    setError('');
    setGlobalFilters({ ruta: 'ALL', conductor: 'ALL', interno: 'ALL', viajeIndex: '' });
  };

  const executeFetchCloud = async (startParam, endParam) => {
    const s = startParam !== undefined ? startParam : dateRange.start;
    const e = endParam !== undefined ? endParam : dateRange.end;

    if (!s && !e) {
      setError('Por favor, selecciona una fecha inicial o final para consultar.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Consultando Base de Datos...');
    setLoadingSubMessage('Descargando historial de la nube...');
    setError('');

    try {
      const startISO = s || e || '2000-01-01';
      const endISO = e || s || '2100-01-01';

      const fetchedTrips = await fetchHistoricalTrips(startISO, endISO);
      const fetchedTelemetry = await fetchHistoricalTelemetry(startISO, endISO);

      if (fetchedTrips.length === 0 && fetchedTelemetry.length === 0) {
        setError('No se encontraron registros para este rango de fechas en la nube.');
      } else {
        setAllTrips(prev => {
          const map = new Map();
          prev.forEach(t => map.set(t.viaje, t));
          fetchedTrips.forEach(t => map.set(t.viaje, t));
          const merged = Array.from(map.values());
          saveData('allTrips', merged);
          return merged;
        });

        setTelemetryData(prev => {
          const byVeh = new Map();
          const add = (list) => list.forEach(v => {
            if (!byVeh.has(v.interno)) {
              byVeh.set(v.interno, { ...v, puntos: [...v.puntos] });
            } else {
              byVeh.get(v.interno).puntos.push(...v.puntos);
            }
          });

          add(prev);
          add(fetchedTelemetry);

          const merged = Array.from(byVeh.values()).map(v => {
            const uniq = new Map();
            v.puntos.forEach(p => uniq.set(`${p.fecha}_${p.hora}_${p.lat}_${p.lng}`, p));

            const puntos = Array.from(uniq.values());
            puntos.sort((a, b) => {
              if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
              return (a.hora_real || a.hora).localeCompare(b.hora_real || b.hora);
            });
            const puntosConIndex = puntos.map((p, i) => ({ ...p, index: i }));

            return {
              ...v,
              puntos: puntosConIndex,
              excesos: puntosConIndex.filter(p => p.esExceso).length
            };
          });

          saveData('telemetryData', merged);
          return merged;
        });

        setSyncStatus({ isSyncing: true, message: 'Descarga exitosa', subMessage: 'Mostrando historial' });
        setTimeout(() => setSyncStatus({ isSyncing: false }), 3000);
      }
    } catch (err) {
      console.error(err);
      setError('Ocurrió un error al conectar con Firebase.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchCloud = () => executeFetchCloud(dateRange.start, dateRange.end);

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
    openCloudAudit: canDelete ? () => setIsCloudAuditOpen(true) : undefined,
    exportExcel: () => setIsExcelModalOpen(true),
    toggleTheme: () => setIsLightMode(!isLightMode),
    clearData: () => handleClearData()
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0a15]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  const totalTelemetryAlerts = telemetryData.reduce((acc, v) => acc + (v.excesos || 0), 0);

  return (
    <>
      <SyncToast {...syncStatus} />
      <div className="relative min-h-screen overflow-hidden">
        {isLoading && <LoadingSpinner message={loadingMessage} subMessage={loadingSubMessage} />}
        {/* Liquid background blobs (Vivid Neon Tones) */}
        <div className="fixed inset-0 w-full h-full pointer-events-none z-0 flex items-center justify-center">
          <div className="absolute top-10 -left-10 w-[500px] h-[500px] bg-cyan-500/40 rounded-full mix-blend-screen filter blur-[150px] opacity-80 animate-blob"></div>
          <div className="absolute top-0 -right-10 w-[500px] h-[500px] bg-fuchsia-600/40 rounded-full mix-blend-screen filter blur-[150px] opacity-80 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-20 left-1/4 w-[600px] h-[600px] bg-indigo-600/40 rounded-full mix-blend-screen filter blur-[150px] opacity-80 animate-blob animation-delay-4000"></div>
        </div>

        <div className="max-w-7xl mx-auto p-4 md:p-10 space-y-8 relative z-10">
          {/* 3D Premium Header Card (Reorganized & Clean) */}
          <Tilt tiltMaxAngleX={2} tiltMaxAngleY={2} scale={1.005} transitionSpeed={2000} gyroscope={true} className="relative z-40">
            <div className="glass-panel p-7 md:p-9 rounded-[2.5rem] flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative">
              {/* Brand + User Info */}
              <div className="flex flex-col gap-3 relative z-10">
                <div className="flex items-center gap-3.5">
                  <div>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                      Dashboard de Viajes
                    </h1>
                    <p className="text-slate-300 mt-1 font-medium text-sm md:text-base">
                      Inteligencia y estadísticas operativas en tiempo real
                    </p>
                  </div>
                  <button
                    onClick={() => setIsLightMode(!isLightMode)}
                    className="ml-2 p-2.5 rounded-2xl glass-panel text-cyan-400 hover:text-cyan-300 transition-all hover:scale-110 active:scale-95"
                    aria-label="Cambiar tema"
                    title="Alternar modo claro / oscuro"
                  >
                    {isLightMode ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-full flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-xs font-bold text-emerald-300">{currentUser.email}</span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-slate-200">
                      {userRole}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      await clearAllData();
                      signOut(auth);
                    }}
                    className="text-xs font-bold text-slate-400 hover:text-white transition-colors underline"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </div>

              {/* Clean Unified Action Toolbar */}
              <div className="relative z-20 w-full lg:w-auto flex flex-wrap items-center gap-2.5">
                {/* 1. Unified Upload Popover Button (Tareas + Planillas + GPS) */}
                {canUpload && (
                  <div className="relative" ref={uploadMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsUploadMenuOpen(prev => !prev)}
                      className="group relative flex items-center gap-3 cursor-pointer bg-white/5 backdrop-blur-2xl text-white font-extrabold py-3 px-5 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.18),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-all hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:-translate-y-0.5 border border-cyan-400/35 hover:border-cyan-400/70 text-sm"
                    >
                      <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span className="tracking-wide">Cargar Archivos</span>
                      <div className="flex items-center gap-1.5 pl-1 border-l border-white/15">
                        <span
                          title={`Tareas y Viajes (${allTrips.length})`}
                          className={`w-2 h-2 rounded-full ${allTrips.length > 0 ? 'bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.9)]' : 'bg-slate-600'}`}
                        />
                        <span
                          title={`Planillas Intermunicipales (${loadedPlanillasCount})`}
                          className={`w-2 h-2 rounded-full ${loadedPlanillasCount > 0 ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]' : 'bg-slate-600'}`}
                        />
                        <span
                          title={`Velocidad Excesiva GPS (${totalTelemetryAlerts})`}
                          className={`w-2 h-2 rounded-full ${telemetryData.length > 0 ? 'bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.9)]' : 'bg-slate-600'}`}
                        />
                      </div>
                      <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isUploadMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    <AnimatePresence>
                      {isUploadMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.97 }}
                          className="absolute left-0 lg:left-auto lg:right-0 mt-2.5 w-80 bg-[#111326]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-4 shadow-[0_25px_60px_rgba(0,0,0,0.65)] z-[120] space-y-2.5"
                        >
                          <div className="px-2 pb-1.5 border-b border-white/10 flex items-center justify-between">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                              Subir Reportes Operativos
                            </span>
                            <span className="text-[10px] font-bold text-cyan-400">.xlsx / .xls</span>
                          </div>

                          {/* Opción 1: Tareas y Viajes */}
                          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/70 hover:bg-cyan-500/15 border border-cyan-500/25 hover:border-cyan-400/60 cursor-pointer transition-all group">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center border border-cyan-400/30">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-xs font-extrabold text-white group-hover:text-cyan-200">
                                  1. Tareas y Viajes
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {allTrips.length > 0 ? `${allTrips.length} viajes en memoria` : 'Tiempos y puestos de control'}
                                </p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${allTrips.length > 0 ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>
                              {allTrips.length > 0 ? '✓ Listo' : 'Subir'}
                            </span>
                            <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                          </label>

                          {/* Opción 2: Planillas Intermunicipales */}
                          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/70 hover:bg-emerald-500/15 border border-emerald-500/25 hover:border-emerald-400/60 cursor-pointer transition-all group">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center border border-emerald-400/30">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-xs font-extrabold text-white group-hover:text-emerald-200">
                                  2. Planillas Intermunicipales
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {loadedPlanillasCount > 0 ? `${loadedPlanillasCount} planillas cruzadas` : 'Cruce oficial de conductores'}
                                </p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${loadedPlanillasCount > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                              {loadedPlanillasCount > 0 ? '✓ Listo' : 'Subir'}
                            </span>
                            <input type="file" accept=".xlsx, .xls" onChange={handlePlanillasUpload} className="hidden" />
                          </label>

                          {/* Opción 3: Velocidad Excesiva GPS */}
                          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/70 hover:bg-rose-500/15 border border-rose-500/25 hover:border-rose-400/60 cursor-pointer transition-all group">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-300 flex items-center justify-center border border-rose-400/30">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-xs font-extrabold text-white group-hover:text-rose-200">
                                  3. Velocidad Excesiva (GPS)
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {telemetryData.length > 0 ? `${telemetryData.length} vehículos con alertas` : 'Coordenadas y alertas > 85 km/h'}
                                </p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${telemetryData.length > 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-400'}`}>
                              {telemetryData.length > 0 ? '✓ Listo' : 'Subir'}
                            </span>
                            <input type="file" accept=".xlsx, .xls" onChange={handleTelemetryUpload} className="hidden" />
                          </label>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* 2. Cobertura en la Nube y Auditoría (Solo Admin) */}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setIsCloudAuditOpen(true)}
                    className="group relative flex items-center justify-center gap-2 bg-indigo-500/10 backdrop-blur-2xl text-indigo-200 font-extrabold py-3 px-5 rounded-2xl shadow-[0_0_20px_rgba(99,102,241,0.15),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 border border-indigo-400/35 hover:border-indigo-400/80 text-sm"
                  >
                    <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="tracking-wide">Cobertura y Auditoría</span>
                  </button>
                )}

                {/* 3. Reportes Excel + Compact Clear Button */}
                {(allTrips.length > 0 || telemetryData.length > 0) && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsExcelModalOpen(true)}
                      className="group relative flex items-center justify-center gap-2 bg-emerald-500/10 backdrop-blur-2xl text-emerald-300 font-extrabold py-3 px-5 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.15),inset_0_1px_1px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_35px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 border border-emerald-500/35 hover:border-emerald-400/80 text-sm"
                    >
                      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="tracking-wide">Reportes Excel</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleClearData}
                      className="p-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-rose-500/30 hover:border-rose-400/70 transition-all hover:-translate-y-0.5"
                      title="Limpiar datos cargados en pantalla"
                      aria-label="Limpiar datos en pantalla"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
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

          {/* ALWAYS VISIBLE FILTERS AND TABS */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-center gap-4 relative z-30 my-4">
            <div className="flex flex-wrap items-center justify-center gap-2 bg-slate-800/50 backdrop-blur-md px-3 sm:px-4 py-3 sm:py-2 rounded-2xl border border-white/10 w-full lg:w-auto relative">
              <span className="text-xs font-bold text-slate-400 uppercase w-full sm:w-auto text-center sm:text-left">Filtro:</span>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
                <AvailableDatePicker
                  value={dateRange.start}
                  onChange={val => setDateRange(prev => ({ ...prev, start: val }))}
                  availableDates={availableDates}
                  localDates={localDates}
                  placeholder="Desde"
                />
                <span className="text-slate-500">-</span>
                <AvailableDatePicker
                  value={dateRange.end}
                  onChange={val => setDateRange(prev => ({ ...prev, end: val }))}
                  availableDates={availableDates}
                  localDates={localDates}
                  placeholder="Hasta"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-center mt-2 sm:mt-0">
                <button
                  onClick={() => {
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

                    if (maxStr) {
                      const iso = toISODateKey(parseCustomDate(maxStr));
                      if (iso) setDateRange({ start: iso, end: iso });
                    }
                  }}
                  className="sm:ml-2 px-3 py-2 sm:py-1 text-xs font-bold bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors whitespace-nowrap"
                  title="Filtrar al último día con datos"
                >
                  Último Día
                </button>

                <button
                  onClick={handleFetchCloud}
                  className="px-4 py-2 sm:py-1.5 text-xs font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg hover:bg-emerald-500/30 hover:-translate-y-0.5 transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] flex items-center gap-1 whitespace-nowrap"
                  title="Descargar datos de la nube"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>
                  Consultar Nube
                </button>

                {(dateRange.start || dateRange.end) && (
                  <button onClick={() => setDateRange({ start: '', end: '' })} className="px-2 text-rose-400 hover:text-rose-300" aria-label="Limpiar filtro">
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="inner-depth p-2 rounded-3xl sm:rounded-full flex flex-wrap justify-center gap-2 backdrop-blur-2xl relative">
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

          <AnimatePresence>
            {diasSinPlanillas.length > 0 && allTrips.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="relative z-10 w-full mb-4 flex justify-center"
              >
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-6 py-3 rounded-2xl flex items-center gap-3 shadow-[0_0_15px_rgba(245,158,11,0.05)] max-w-4xl backdrop-blur-md">
                  <svg className="w-6 h-6 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                  <div className="text-sm">
                    <span className="font-bold block mb-0.5">Planillas no cargadas</span>
                    <span className="opacity-90">No se encontraron planillas intermunicipales para las fechas: <strong>{diasSinPlanillas.join(', ')}</strong>. Se muestran todos los viajes de esos días con los conductores por defecto.</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {(allTrips.length === 0 && telemetryData.length === 0) ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center mt-12 text-center"
            >
              <div className="glass-panel p-8 md:p-12 rounded-[2.5rem] max-w-4xl w-full relative overflow-hidden border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
                {/* Efectos de luz decorativos */}
                <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/10 blur-3xl rounded-full pointer-events-none"></div>
                <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none"></div>

                {/* Encabezado */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 text-xs font-extrabold uppercase tracking-widest mb-4">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  Centro de Control e Inteligencia Operativa
                </div>

                <h2 className="text-3xl md:text-4xl font-extrabold text-slate-100 tracking-tight mb-3">
                  Bienvenido al Panel de Control de Flota
                </h2>
                <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
                  Consulta el historial almacenado en la nube o carga nuevos reportes operativos para analizar tiempos, recorridos y seguridad vial.
                </p>

                {/* Pasos principales */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10 text-left">
                  {/* Paso 1: Consultar Nube */}
                  <div className="group flex flex-col justify-between p-6 bg-slate-800/40 hover:bg-slate-800/60 rounded-3xl border border-white/10 hover:border-emerald-400/40 transition-all duration-300">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-11 h-11 bg-emerald-500/15 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400/80 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                          Opción A · Nube
                        </span>
                      </div>
                      <h3 className="font-extrabold text-slate-100 text-lg mb-2">1. Consulta el Historial</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        {canDelete ? (
                          <>Abre <strong className="text-slate-200">Cobertura y Auditoría</strong> para ver el calendario del mes o elige fechas arriba y pulsa <strong className="text-slate-200">Consultar Nube</strong>.</>
                        ) : (
                          <>Elige un rango de fechas en la barra superior (los días con <span className="text-emerald-400 font-bold">punto verde</span> tienen datos) y pulsa <strong className="text-slate-200">Consultar Nube</strong>.</>
                        )}
                      </p>
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => setIsCloudAuditOpen(true)}
                        className="mt-4 pt-3 border-t border-white/5 text-xs font-bold text-emerald-300 hover:text-emerald-200 flex items-center justify-between w-full"
                      >
                        <span>{availableDates.length > 0 ? `${availableDates.length} fecha(s) en nube` : 'Ver calendario de cobertura'}</span>
                        <span>→</span>
                      </button>
                    ) : (
                      <div className="mt-4 pt-3 border-t border-white/5 text-xs font-bold text-emerald-300/90 flex items-center gap-1.5">
                        <span>{availableDates.length > 0 ? `${availableDates.length} fecha(s) disponibles en nube` : 'Sincronizado con la nube'}</span>
                      </div>
                    )}
                  </div>

                  {/* Paso 2: Cargar Archivos */}
                  <div className="group flex flex-col justify-between p-6 bg-slate-800/40 hover:bg-slate-800/60 rounded-3xl border border-white/10 hover:border-cyan-400/40 transition-all duration-300">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-11 h-11 bg-cyan-500/15 text-cyan-400 rounded-2xl flex items-center justify-center border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400/80 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">
                          Opción B · Carga
                        </span>
                      </div>
                      <h3 className="font-extrabold text-slate-100 text-lg mb-2">2. Sube Datos Operativos</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        Desde <strong className="text-slate-200">Cargar Archivos</strong> sube <em>Tareas y Viajes</em>, <em>Planillas Intermunicipales</em> y <em>Velocidad Excesiva (GPS)</em>.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/5 text-xs font-bold text-cyan-300/90">
                      {canUpload ? 'Guardado automático en la nube' : 'Disponible para rol Operador / Admin'}
                    </div>
                  </div>

                  {/* Paso 3: Analizar y Exportar */}
                  <div className="group flex flex-col justify-between p-6 bg-slate-800/40 hover:bg-slate-800/60 rounded-3xl border border-white/10 hover:border-indigo-400/40 transition-all duration-300">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-11 h-11 bg-indigo-500/15 text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-400/80 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                          Paso Final
                        </span>
                      </div>
                      <h3 className="font-extrabold text-slate-100 text-lg mb-2">3. Analiza y Reproduce</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        Usa el nuevo <strong className="text-slate-200">Reproductor Interactivo del Viaje</strong>, mapas GPS cruzados con planillas y reportes en <strong className="text-slate-200">Excel (.xlsx)</strong>.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/5 text-xs font-bold text-indigo-300/90">
                      Reportes y simulación en un clic
                    </div>
                  </div>
                </div>

                {/* Pie informativo */}
                <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-400 text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Respaldo seguro en la nube corporativa y memoria caché local para consultas rápidas.</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span>Atajo rápido:</span>
                    <kbd className="px-2 py-0.5 text-[11px] font-bold bg-slate-800 text-slate-200 rounded border border-white/15">Ctrl + K</kbd>
                  </div>
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
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 0.98 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  {activeTab === 'general' && validatedTrips.length > 0 && (
                    <GeneralDashboard allTrips={validatedTrips} onDrillDown={handleDrillDown} telemetryData={filteredTelemetry} />
                  )}
                  {activeTab === 'individual' && validatedTrips.length > 0 && (
                    <IndividualDashboard
                      allTrips={validatedTrips}
                      filters={globalFilters}
                      setFilters={setGlobalFilters}
                      telemetryData={filteredTelemetry}
                    />
                  )}
                  {activeTab === 'telemetry' && filteredTelemetry.length > 0 && (
                    <TelemetryDashboard
                      telemetryData={filteredTelemetry}
                      allTrips={validatedTrips}
                      rawTrips={filteredTrips}
                      planillasMap={planillasMap}
                    />
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
        <CloudAuditModal
          isOpen={isCloudAuditOpen}
          onClose={() => setIsCloudAuditOpen(false)}
          localCoverage={localCoverage}
          localDates={localDates}
          canUpload={canUpload}
          canDelete={canDelete}
          onSelectDateAndFetch={(startISO, endISO) => {
            setDateRange({ start: startISO, end: endISO });
            executeFetchCloud(startISO, endISO);
          }}
          onDeleted={() => refreshAvailableDates()}
        />
        <ExcelReportModal
          isOpen={isExcelModalOpen}
          onClose={() => setIsExcelModalOpen(false)}
          trips={validatedTrips}
          telemetry={filteredTelemetry}
          planillasMap={planillasMap}
          dateRange={dateRange}
          diasSinPlanillas={diasSinPlanillas}
          currentUser={currentUser}
        />
      </div>
    </>
  );
}

export default App;
