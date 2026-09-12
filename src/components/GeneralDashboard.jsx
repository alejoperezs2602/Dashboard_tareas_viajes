import React, { useMemo, useState, useEffect } from 'react';
import { parseCustomDate } from '../utils/dateUtils.js';
import { PUNCTUALITY_TOLERANCE_MIN, RISK_DELAY_THRESHOLD, RISK_SPEED_THRESHOLD, TOP_N_DEFAULT } from '../constants/index.js';
import SmartAlerts from './SmartAlerts';
import SmartInsights from './SmartInsights';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Bar, Doughnut, Scatter } from 'react-chartjs-2';
import Tilt from 'react-parallax-tilt';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyChartTheme() {
  ChartJS.defaults.color = getCSSVar('--chart-text') || '#cbd5e1';
  ChartJS.defaults.borderColor = getCSSVar('--chart-border') || 'rgba(255,255,255,0.1)';
}

applyChartTheme();

export default function GeneralDashboard({ allTrips, onDrillDown, telemetryData = [] }) {
  useEffect(() => {
    applyChartTheme();
    const observer = new MutationObserver(applyChartTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const [vehiculoViewMode, setVehiculoViewMode] = useState('TOP10'); // TOP10, ALL, SINGLE
  const [selectedVehiculo, setSelectedVehiculo] = useState('');

  const stats = useMemo(() => {
    let totalDist = 0;
    let vehiculosMap = {};
    let allConductors = new Set();
    let efficiency = { antes: 0, tiempo: 0, tarde: 0 };
    let puestosStats = {};
    let viajesCriticos = [];

    allTrips.forEach((t, idx) => {
      totalDist += (t.totalDistancia || 0);
      
      let int = t.interno || "DESCONOCIDO";
      if (!vehiculosMap[int]) vehiculosMap[int] = { count: 0, rutas: {}, sumTarde: 0, sumAntes: 0 };
      vehiculosMap[int].count++;
      
      let netDif = t.totalDiferencia || 0;
      if (netDif > 0) vehiculosMap[int].sumTarde += netDif;
      else if (netDif < 0) vehiculosMap[int].sumAntes += netDif;

      if (netDif !== 0) {
        viajesCriticos.push({
          viaje: t.viaje,
          interno: int,
          ruta: t.ruta,
          fecha: t.fecha,
          netDif: netDif,
          originalIndex: idx
        });
      }
      
      let r = t.ruta || "DESCONOCIDA";
      vehiculosMap[int].rutas[r] = (vehiculosMap[int].rutas[r] || 0) + 1;

      t.conductoresArray.forEach(c => allConductors.add(c));
      t.puntos.forEach(p => {
        // Efficiency
        if (p.diferencia < -PUNCTUALITY_TOLERANCE_MIN) efficiency.antes++;
        else if (p.diferencia > PUNCTUALITY_TOLERANCE_MIN) efficiency.tarde++;
        else efficiency.tiempo++;

        // Puestos stats
        let name = p.puesto || "DESCONOCIDO";
        if (!puestosStats[name]) puestosStats[name] = { count: 0, tardeCount: 0, antesCount: 0, sumTarde: 0, sumAntes: 0 };
        puestosStats[name].count++;
        if (p.diferencia < -PUNCTUALITY_TOLERANCE_MIN) {
          puestosStats[name].antesCount++;
          puestosStats[name].sumAntes += p.diferencia;
        } else if (p.diferencia > PUNCTUALITY_TOLERANCE_MIN) {
          puestosStats[name].tardeCount++;
          puestosStats[name].sumTarde += p.diferencia;
        }
      });
    });

    let vehiculosSorted = Object.keys(vehiculosMap).map(k => ({
      interno: k,
      count: vehiculosMap[k].count,
      rutas: vehiculosMap[k].rutas
    })).sort((a, b) => b.count - a.count);

    let puestosArray = Object.keys(puestosStats).map(k => ({
      puesto: k,
      ...puestosStats[k]
    }));

    let vehiculosTarde = Object.keys(vehiculosMap)
      .map(k => ({ interno: k, val: vehiculosMap[k].sumTarde }))
      .filter(v => v.val > 0)
      .sort((a, b) => b.val - a.val)
      .slice(0, TOP_N_DEFAULT);
      
    let vehiculosAntes = Object.keys(vehiculosMap)
      .map(k => ({ interno: k, val: vehiculosMap[k].sumAntes }))
      .filter(v => v.val < 0)
      .sort((a, b) => a.val - b.val)
      .slice(0, TOP_N_DEFAULT);

    let topViajesTarde = viajesCriticos
      .filter(t => t.netDif > 0)
      .sort((a, b) => b.netDif - a.netDif)
      .slice(0, TOP_N_DEFAULT);
      
    let topViajesAntes = viajesCriticos
      .filter(t => t.netDif < 0)
      .sort((a, b) => a.netDif - b.netDif)
      .slice(0, TOP_N_DEFAULT);

    // Cross-reference with telemetry for Risk Matrix
    let riesgoData = [];
    if (telemetryData && telemetryData.length > 0) {
      Object.keys(vehiculosMap).forEach(k => {
        let teleData = telemetryData.find(td => td.interno === k);
        let excesos = teleData ? teleData.excesos : 0;
        let retrasoTotal = vehiculosMap[k].sumTarde; // X axis

        // Only add to risk matrix if it has some relevant data (either speeding or delays)
        if (retrasoTotal > 0 || excesos > 0) {
          riesgoData.push({
            interno: k,
            x: retrasoTotal, // Impuntualidad
            y: excesos       // Imprudencia
          });
        }
      });
    }

    return { totalDist, vehiculosSorted, vehiculosMap, allConductors, efficiency, puestosArray, vehiculosTarde, vehiculosAntes, topViajesTarde, topViajesAntes, riesgoData };
  }, [allTrips, telemetryData]);

  const [effViewMode, setEffViewMode] = useState('GLOBAL'); // GLOBAL, ANTES, TARDE
  const [critViewMode, setCritViewMode] = useState('TARDE'); // TARDE, ANTES

  let vehiculosChartData = [];
  if (vehiculoViewMode === 'TOP10') {
    vehiculosChartData = stats.vehiculosSorted.slice(0, TOP_N_DEFAULT);
  } else if (vehiculoViewMode === 'ALL') {
    vehiculosChartData = stats.vehiculosSorted;
  }

  const barData = {
    labels: vehiculosChartData.map(v => v.interno),
    datasets: [
      {
        label: 'Número de Viajes',
        data: vehiculosChartData.map(v => v.count),
        backgroundColor: 'rgba(59, 130, 246, 0.85)',
        borderColor: 'rgba(37, 99, 235, 1)',
        borderWidth: 1,
        borderRadius: 6,
        barThickness: 'flex',
        maxBarThickness: 40,
      },
    ],
  };

  const effData = {
    labels: [`Llegada Antes (< -${PUNCTUALITY_TOLERANCE_MIN} min)`, `A Tiempo (±${PUNCTUALITY_TOLERANCE_MIN} min)`, `Retraso (> ${PUNCTUALITY_TOLERANCE_MIN} min)`],
    datasets: [
      {
        data: [stats.efficiency.antes, stats.efficiency.tiempo, stats.efficiency.tarde],
        backgroundColor: ['#10b981', '#cbd5e1', '#ef4444'],
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };

  const scatterData = {
    datasets: [
      {
        label: 'Vehículos',
        data: stats.riesgoData,
        backgroundColor: (context) => {
          const point = context.raw;
          if (!point) return 'rgba(148, 163, 184, 0.6)';
          if (point.x > RISK_DELAY_THRESHOLD && point.y > RISK_SPEED_THRESHOLD) return 'rgba(225, 29, 72, 0.8)'; // Red - High Risk
          if (point.x > RISK_DELAY_THRESHOLD || point.y > RISK_SPEED_THRESHOLD) return 'rgba(245, 158, 11, 0.8)'; // Orange - Medium Risk
          return 'rgba(16, 185, 129, 0.8)'; // Green - Safe
        },
        borderColor: '#fff',
        borderWidth: 1,
        pointRadius: 8,
        pointHoverRadius: 12,
      }
    ]
  };

  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const pt = ctx.raw;
            return `Vehículo ${pt.interno}: Retraso ${pt.x}min, Excesos: ${pt.y}`;
          }
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'Impuntualidad (Minutos acumulados)' }, beginAtZero: true },
      y: { title: { display: true, text: 'Imprudencia (Excesos de Velocidad)' }, beginAtZero: true }
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (e, elements) => {
      if (elements.length > 0 && onDrillDown) {
        const dataIndex = elements[0].index;
        const internoClicked = vehiculosChartData[dataIndex].interno;
        onDrillDown(internoClicked);
      }
    },
    onHover: (event, chartElement) => {
      event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleFont: { family: "'Outfit', sans-serif", size: 13 },
        bodyFont: { family: "'Outfit', sans-serif", size: 12 },
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: "'Outfit', sans-serif" } } },
      y: { border: { dash: [4, 4] }, grid: { color: '#f1f5f9' }, ticks: { font: { family: "'Outfit', sans-serif" }, stepSize: 1 } }
    }
  };

  const doughnutOptions = {
    responsive: true,
    cutout: '70%',
    onClick: (e, elements) => {
      if (elements.length > 0) {
        const dataIndex = elements[0].index;
        if (dataIndex === 0) setEffViewMode('ANTES');
        else if (dataIndex === 2) setEffViewMode('TARDE');
        else setEffViewMode('GLOBAL'); // A Tiempo resets it or you can ignore
      }
    },
    onHover: (event, chartElement) => {
      event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
    },
    plugins: {
      legend: { position: 'bottom', labels: { font: { family: "'Outfit', sans-serif" }, padding: 20 } },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleFont: { family: "'Outfit', sans-serif", size: 13 },
        bodyFont: { family: "'Outfit', sans-serif", size: 12 },
        padding: 12,
        cornerRadius: 8,
      }
    }
  };

  const iconColorMap = {
    'bg-blue-400': 'text-blue-600',
    'bg-emerald-400': 'text-emerald-600',
    'bg-indigo-400': 'text-indigo-600',
    'bg-amber-400': 'text-amber-600',
    'bg-rose-400': 'text-rose-600',
  };

  const StatCard = ({ title, value, colorClass, iconPath }) => (
    <Tilt tiltMaxAngleX={5} tiltMaxAngleY={5} scale={1.02} transitionSpeed={2000} className="h-full">
      <div className="relative overflow-hidden glass-panel rounded-3xl p-6 group transition-all duration-500 h-full">
        <div className={`absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 rounded-full blur-3xl opacity-50 ${colorClass}`}></div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            <p className="text-xs font-bold text-slate-300/80 uppercase tracking-wider mb-2">{title}</p>
            <p className="text-4xl font-extrabold text-slate-100 drop-shadow-sm">{value}</p>
          </div>
          <div className={`p-4 rounded-2xl bg-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(255,255,255,0.1)] border border-white/20 ${iconColorMap[colorClass] || 'text-white'} backdrop-blur-md`}>
            <svg className="w-7 h-7 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d={iconPath}></path>
            </svg>
          </div>
        </div>
      </div>
    </Tilt>
  );

  const comparativo = useMemo(() => {
    if (allTrips.length < 2) return null;
    const sortedTrips = [...allTrips].sort((a, b) => parseCustomDate(a.fecha) - parseCustomDate(b.fecha));
    const mid = Math.floor(sortedTrips.length / 2);
    const p1 = sortedTrips.slice(0, mid);
    const p2 = sortedTrips.slice(mid);
    
    const getPunct = (arr) => {
      let a=0, t=0, d=0;
      arr.forEach(tr => tr.puntos.forEach(p => {
        if (p.diferencia < -PUNCTUALITY_TOLERANCE_MIN) a++;
        else if (p.diferencia > PUNCTUALITY_TOLERANCE_MIN) d++;
        else t++;
      }));
      return (a+t+d)>0 ? ((a+t)/(a+t+d)*100) : 0;
    };
    
    const p1Punct = getPunct(p1);
    const p2Punct = getPunct(p2);
    const diffPunct = p2Punct - p1Punct;
    
    return {
      p1Viajes: p1.length, p2Viajes: p2.length,
      diffViajes: p2.length - p1.length,
      p1Punct, p2Punct, diffPunct
    };
  }, [allTrips]);

  return (
    <div className="space-y-8">
      {/* Alertas Inteligentes */}
      <SmartAlerts allTrips={allTrips} telemetryData={telemetryData} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Viajes Registrados" 
          value={allTrips.length} 
          colorClass="bg-blue-400" 
          iconPath="M9 19V6l12-3v13M9 19c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2zm12-3c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2zM9 10l12-3"
        />
        <StatCard 
          title="Distancia Total (km)" 
          value={stats.totalDist.toFixed(1)} 
          colorClass="bg-emerald-400" 
          iconPath="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
        <StatCard 
          title="Vehículos Diferentes" 
          value={stats.vehiculosSorted.length} 
          colorClass="bg-indigo-400" 
          iconPath="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
        <StatCard 
          title="Conductores" 
          value={stats.allConductors.size} 
          colorClass="bg-rose-400" 
          iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </div>

      {/* Comparativo de Períodos */}
      {comparativo && (
        <div className="glass-panel p-6 rounded-3xl mt-6 flex flex-col md:flex-row items-center justify-between gap-6 border-l-4 border-l-cyan-400 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-400/10 blur-3xl rounded-full -mt-20 -mr-20 pointer-events-none"></div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center">
              <svg className="w-5 h-5 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              Tendencia Reciente (Segunda vs Primera mitad del período)
            </h3>
            <p className="text-slate-400 text-sm mt-1">Comparación automática basada en los datos actualmente filtrados.</p>
          </div>
          <div className="flex gap-8 relative z-10">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Volumen de Viajes</p>
              <div className="flex items-end gap-2 mt-1">
                <span className="text-2xl font-extrabold text-slate-200">{comparativo.p2Viajes}</span>
                <span className={`text-sm font-bold mb-1 ${comparativo.diffViajes >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {comparativo.diffViajes >= 0 ? '▲ +' : '▼ '}{comparativo.diffViajes}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Puntualidad</p>
              <div className="flex items-end gap-2 mt-1">
                <span className="text-2xl font-extrabold text-slate-200">{comparativo.p2Punct.toFixed(1)}%</span>
                <span className={`text-sm font-bold mb-1 ${comparativo.diffPunct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {comparativo.diffPunct >= 0 ? '▲ +' : '▼ '}{comparativo.diffPunct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Vehicles Panel */}
        <div className="glass-panel p-8 rounded-[2.5rem] flex flex-col h-[480px]">
          <div className="mb-4 border-b border-slate-300/30 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div>
                 <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm">Viajes por Vehículo</h3>
                 <p className="text-sm font-medium text-slate-400/80">Filtrado por N° Interno</p>
             </div>
             
             {/* Controls for Vehicles */}
             <div className="flex items-center gap-3">
                <select 
                   value={vehiculoViewMode}
                   onChange={(e) => {
                     setVehiculoViewMode(e.target.value);
                     if(e.target.value !== 'SINGLE') setSelectedVehiculo('');
                   }}
                   className="text-sm bg-slate-800/50 backdrop-blur-md border border-white/60 shadow-sm text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-4 focus:ring-blue-500/30 transition-all font-semibold"
                >
                   <option className="bg-slate-900 text-slate-100" value="TOP10">Top 10</option>
                   <option className="bg-slate-900 text-slate-100" value="ALL">Todos</option>
                   <option className="bg-slate-900 text-slate-100" value="SINGLE">Específico...</option>
                </select>

                {vehiculoViewMode === 'SINGLE' && (
                  <select 
                     value={selectedVehiculo}
                     onChange={(e) => setSelectedVehiculo(e.target.value)}
                     className="text-sm bg-slate-800/50 backdrop-blur-md border border-white/60 shadow-sm text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-4 focus:ring-blue-500/30 transition-all font-semibold"
                  >
                     <option className="bg-slate-900 text-slate-100" value="">Seleccione...</option>
                     {stats.vehiculosSorted.map(v => (
                       <option className="bg-slate-900 text-slate-100" key={v.interno} value={v.interno}>{v.interno}</option>
                     ))}
                  </select>
                )}
             </div>
          </div>

          <div className="flex-1 w-full min-h-0 relative">
             {vehiculoViewMode === 'SINGLE' ? (
                selectedVehiculo && stats.vehiculosMap[selectedVehiculo] ? (
                  <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar flex flex-col pt-4">
                     <div className="flex items-center gap-5 mb-8">
                        <div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-blue-400 to-indigo-600 text-white flex items-center justify-center shadow-[0_10px_25px_rgba(59,130,246,0.5),inset_0_2px_5px_rgba(255,255,255,0.4)] border border-blue-400/50">
                           <svg className="w-10 h-10 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                        </div>
                        <div>
                           <h4 className="text-4xl font-black text-slate-100 drop-shadow-sm">#{selectedVehiculo}</h4>
                           <p className="text-slate-400 font-bold mt-1 text-lg">{stats.vehiculosMap[selectedVehiculo].count} <span className="font-medium text-slate-300">viajes realizados</span></p>
                        </div>
                     </div>
                     <h5 className="text-xs font-black text-slate-400/80 uppercase tracking-widest mb-4">Rutas Operadas por este vehículo</h5>
                     <div className="space-y-3">
                        {Object.entries(stats.vehiculosMap[selectedVehiculo].rutas).map(([r, count]) => (
                          <div 
                            key={r}
                            onClick={() => onDrillDown && onDrillDown(selectedVehiculo, r)}
                            className="flex justify-between items-center p-4 rounded-2xl bg-slate-800/40 border border-white/10 cursor-pointer hover:bg-slate-700/60 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)] transition-all duration-300 group relative overflow-hidden"
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <span className="text-white font-extrabold tracking-wide text-lg group-hover:text-cyan-300 transition-colors pl-2">{r}</span>
                            <div className="flex items-center gap-4">
                              <span className="bg-white/10 px-4 py-1.5 rounded-xl text-sm font-black text-cyan-300 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-white/20 group-hover:bg-cyan-500/20 transition-colors">{count} {count===1?'viaje':'viajes'}</span>
                              <svg className="w-5 h-5 text-slate-400 group-hover:text-cyan-300 transition-colors transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"></path></svg>
                            </div>
                          </div>
                        ))}
                     </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400 font-semibold text-lg">
                     Seleccione un vehículo de la lista.
                  </div>
                )
             ) : (
                <Bar data={barData} options={chartOptions} />
             )}
          </div>
        </div>

        {/* Efficiency Panel */}
        <div className="glass-panel p-8 rounded-[2.5rem] flex flex-col h-[480px]">
          {effViewMode === 'GLOBAL' ? (
            <>
              <div className="mb-6 border-b border-slate-300/30 pb-4">
                 <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm">Eficiencia Global</h3>
                 <p className="text-sm font-medium text-slate-400/80">Clic en un color para ver detalles por puesto</p>
              </div>
              <div className="w-full max-w-sm mx-auto flex-1 flex items-center justify-center relative min-h-0">
                 <Doughnut data={effData} options={doughnutOptions} />
                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-[-20px]">
                    <span className="text-5xl font-black text-slate-100 drop-shadow-md">
                       {Math.round((stats.efficiency.antes + stats.efficiency.tiempo) / Math.max(1, (stats.efficiency.antes + stats.efficiency.tiempo + stats.efficiency.tarde)) * 100)}%
                    </span>
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-widest mt-1">Efectividad</span>
                 </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col h-full relative">
              <button 
                onClick={() => setEffViewMode('GLOBAL')}
                className="absolute top-0 right-0 p-2 text-slate-400 hover:text-slate-400 transition-colors z-10"
                title="Volver"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
              
              <div className="mb-6 border-b border-slate-300/30 pb-4 pr-8">
                 <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm flex items-center">
                   {effViewMode === 'TARDE' ? (
                     <><span className="w-4 h-4 bg-red-500 rounded-full mr-3 shadow-sm"></span>Top Puestos: Retrasos</>
                   ) : (
                     <><span className="w-4 h-4 bg-emerald-500 rounded-full mr-3 shadow-sm"></span>Top Puestos: Anticipados</>
                   )}
                 </h3>
                 <p className="text-sm font-medium text-slate-400/80 mt-1">Ordenado por frecuencia</p>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-3">
                  {stats.puestosArray
                    .filter(p => effViewMode === 'TARDE' ? p.tardeCount > 0 : p.antesCount > 0)
                    .sort((a, b) => effViewMode === 'TARDE' ? b.tardeCount - a.tardeCount : b.antesCount - a.antesCount)
                    .slice(0, TOP_N_DEFAULT)
                    .map((p, idx) => {
                      const count = effViewMode === 'TARDE' ? p.tardeCount : p.antesCount;
                      const sum = effViewMode === 'TARDE' ? p.sumTarde : p.sumAntes;
                      const avg = Math.round(sum / count);
                      const isLate = effViewMode === 'TARDE';
                      
                      return (
                        <div key={p.puesto} className="flex justify-between items-center p-4 rounded-2xl bg-slate-800/40 border border-white/10 hover:bg-slate-700/60 transition-colors group relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          <div className="flex items-center gap-3 pl-2">
                            <span className="text-xs font-black text-white/50 w-4">{idx + 1}.</span>
                            <span className="text-white font-extrabold tracking-wide text-lg group-hover:text-orange-300 transition-colors">{p.puesto}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-300 hidden sm:inline-block tracking-wider">Prom: <span className="text-white">{avg > 0 ? `+${avg}` : avg} min</span></span>
                            <span className={`px-3 py-1 rounded-xl text-sm font-black shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-white/10 ${isLate ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                              {count} veces
                            </span>
                          </div>
                        </div>
                      );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Risk Matrix (Cross-referenced with Telemetry) */}
      {stats.riesgoData.length > 0 && (
        <div className="glass-panel p-8 rounded-[2.5rem] mt-8 relative overflow-hidden">
           <div className="absolute top-0 right-10 w-32 h-1.5 bg-gradient-to-l from-rose-500 to-indigo-600 rounded-b-xl opacity-80"></div>
           <div className="mb-6 border-b border-slate-300/30 pb-4">
               <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm flex items-center">
                 <span className="w-4 h-4 bg-indigo-500 rounded-full mr-3 shadow-sm"></span>
                 Matriz de Riesgo Operacional
               </h3>
               <p className="text-sm font-medium text-slate-400/80 mt-1">Impuntualidad vs Imprudencia (Basado en Telemetría)</p>
           </div>
           
           <div className="h-[400px] w-full mt-4">
              <Scatter data={scatterData} options={scatterOptions} />
           </div>
           
           <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-slate-300/30">
              <div className="flex items-center text-xs font-bold text-slate-400"><span className="w-3 h-3 rounded-full bg-emerald-500 mr-2"></span>Operación Segura</div>
              <div className="flex items-center text-xs font-bold text-slate-400"><span className="w-3 h-3 rounded-full bg-amber-500 mr-2"></span>Riesgo Moderado</div>
              <div className="flex items-center text-xs font-bold text-slate-400"><span className="w-3 h-3 rounded-full bg-rose-600 mr-2"></span>Riesgo Crítico</div>
           </div>
        </div>
      )}

      {/* Critical Analysis Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Critical Vehicles */}
        <div className="glass-panel p-8 rounded-[2.5rem] flex flex-col h-[400px] relative">
          <div className="mb-6 border-b border-slate-300/30 pb-4 flex justify-between items-start">
             <div>
                 <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm flex items-center">
                   {critViewMode === 'TARDE' ? (
                     <><span className="w-4 h-4 bg-orange-500 rounded-full mr-3 shadow-sm"></span>Vehículos: Retraso</>
                   ) : (
                     <><span className="w-4 h-4 bg-emerald-500 rounded-full mr-3 shadow-sm"></span>Vehículos: Llegada Antes</>
                   )}
                 </h3>
                 <p className="text-sm font-medium text-slate-400/80 mt-1">Diferencia neta acumulada (min)</p>
             </div>
             
             {/* Toggle Button */}
             <div className="flex bg-slate-800/50 backdrop-blur-md rounded-xl p-1 border border-white/60 shadow-sm">
               <button 
                 onClick={() => setCritViewMode('TARDE')}
                 className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${critViewMode === 'TARDE' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-300 hover:text-slate-200'}`}
               >
                 Retrasos
               </button>
               <button 
                 onClick={() => setCritViewMode('ANTES')}
                 className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${critViewMode === 'ANTES' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-300 hover:text-slate-200'}`}
               >
                 Llegada Antes
               </button>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
             { (critViewMode === 'TARDE' ? stats.vehiculosTarde : stats.vehiculosAntes).length > 0 ? (
               <div className="space-y-3">
                  {(critViewMode === 'TARDE' ? stats.vehiculosTarde : stats.vehiculosAntes).map((v, idx) => (
                    <div 
                      key={v.interno} 
                      onClick={() => onDrillDown && onDrillDown(v.interno, 'ALL')}
                      className="flex justify-between items-center p-4 rounded-2xl bg-slate-800/40 border border-white/10 hover:bg-slate-700/60 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)] transition-all duration-300 cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white">{idx + 1}</div>
                        <div>
                          <span className="text-white font-extrabold block group-hover:text-cyan-300 transition-colors text-lg tracking-wide">Vehículo #{v.interno}</span>
                        </div>
                      </div>
                      <span className={`px-4 py-1.5 rounded-xl text-sm font-black shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-white/10 ${critViewMode === 'TARDE' ? 'bg-orange-500/20 text-orange-400 group-hover:bg-orange-500/30' : 'bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/30'} transition-colors`}>
                        {v.val > 0 ? `+${v.val}` : v.val} min
                      </span>
                    </div>
                  ))}
               </div>
             ) : (
               <div className="flex h-full items-center justify-center text-slate-400 font-semibold text-center">
                  No hay vehículos con {critViewMode === 'TARDE' ? 'retrasos' : 'anticipos'} acumulados.
               </div>
             )}
          </div>
        </div>

        {/* Columna Derecha: Top Viajes */}
        <div className="lg:col-span-1 flex flex-col gap-8 h-[500px]">
          <div className="glass-panel p-8 rounded-[2.5rem] flex flex-col h-full">
            <div className="mb-6 border-b border-slate-300/30 pb-4">
               <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm flex items-center">
                 {critViewMode === 'TARDE' ? (
                   <><span className="w-4 h-4 bg-orange-500 rounded-full mr-3 shadow-sm"></span>Viajes: Retraso</>
                 ) : (
                   <><span className="w-4 h-4 bg-emerald-500 rounded-full mr-3 shadow-sm"></span>Viajes: Llegada Antes</>
                 )}
               </h3>
               <p className="text-sm font-medium text-slate-300/80 mt-1">Viajes individuales más críticos</p>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
               { (critViewMode === 'TARDE' ? stats.topViajesTarde : stats.topViajesAntes).length > 0 ? (
                 <div className="space-y-3">
                    {(critViewMode === 'TARDE' ? stats.topViajesTarde : stats.topViajesAntes).map((t, idx) => (
                      <div 
                        key={`${t.viaje}-${idx}`}
                        onClick={() => {
                          if (onDrillDown) onDrillDown(t.interno, t.ruta);
                        }}
                        className="flex justify-between items-center p-4 rounded-2xl bg-slate-800/40 border border-white/10 hover:bg-slate-700/60 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)] transition-all duration-300 cursor-pointer group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white">{idx + 1}</div>
                          <div>
                            <span className="text-white font-extrabold block text-lg tracking-wide group-hover:text-cyan-300 transition-colors">{t.ruta}</span>
                            <span className="text-xs font-bold text-slate-300 mt-1 block">Viaje: <span className="text-white">{t.viaje}</span> | Vehículo: <span className="text-white">{t.interno}</span></span>
                          </div>
                        </div>
                        <span className={`px-4 py-1.5 rounded-xl text-sm font-black shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-white/10 ${critViewMode === 'TARDE' ? 'bg-orange-500/20 text-orange-400 group-hover:bg-orange-500/30' : 'bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/30'} transition-colors`}>
                          {t.netDif > 0 ? `+${t.netDif}` : t.netDif} min
                        </span>
                      </div>
                    ))}
                 </div>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                    <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <p className="font-bold">No hay registros críticos</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>
      {/* Síntesis de IA */}
      <SmartInsights allTrips={allTrips} telemetryData={telemetryData} />
    </div>
  );
}
