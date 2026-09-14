import React, { useState, useMemo, useEffect } from 'react';
import { timeToMs, matchDate } from '../utils/dateUtils.js';
import { SPEED_LIMIT_KMH, PUNCTUALITY_TOLERANCE_MIN, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, MAP_TILE_URL, MAP_ATTRIBUTION, SPEEDING_MARKER_STYLE, ROUTE_POLYLINE_STYLE } from '../constants/index.js';
import SearchableSelect from './ui/SearchableSelect.jsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import Tilt from 'react-parallax-tilt';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyChartTheme() {
  ChartJS.defaults.color = getCSSVar('--chart-text') || '#cbd5e1';
  ChartJS.defaults.borderColor = getCSSVar('--chart-border') || 'rgba(255,255,255,0.1)';
}

applyChartTheme();

export default function IndividualDashboard({ allTrips, filters, setFilters, telemetryData = [] }) {
  useEffect(() => {
    applyChartTheme();
    const observer = new MutationObserver(applyChartTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const { ruta: filterRuta, conductor: filterConductor, interno: filterInterno, viajeIndex: selectedTripIndex } = filters;

  const updateFilter = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val, viajeIndex: key !== 'viajeIndex' ? '' : val }));
  };

  const filterOptions = useMemo(() => {
    const rutas = new Set();
    const conds = new Set();
    const internos = new Set();
    allTrips.forEach(t => {
      if (t.ruta) rutas.add(t.ruta);
      if (t.interno) internos.add(t.interno);
      t.conductoresArray.forEach(c => conds.add(c));
    });
    return {
      rutas: Array.from(rutas).sort(),
      conds: Array.from(conds).sort(),
      internos: Array.from(internos).sort()
    };
  }, [allTrips]);

  const filteredTrips = useMemo(() => {
    return allTrips.map((t, index) => ({ ...t, originalIndex: index })).filter(t => {
      if (filterRuta !== 'ALL' && t.ruta !== filterRuta) return false;
      if (filterInterno !== 'ALL' && t.interno !== filterInterno) return false;
      if (filterConductor !== 'ALL' && !t.conductoresArray.includes(filterConductor)) return false;
      return true;
    });
  }, [allTrips, filterRuta, filterConductor, filterInterno]);

  React.useEffect(() => {
    // If only one trip matches, auto-select it. Otherwise clear selection if current is invalid
    if (filteredTrips.length === 1 && selectedTripIndex === '') {
      setFilters(prev => ({ ...prev, viajeIndex: filteredTrips[0].originalIndex.toString() }));
    } else if (selectedTripIndex !== '' && !filteredTrips.find(t => t.originalIndex.toString() === selectedTripIndex)) {
      setFilters(prev => ({ ...prev, viajeIndex: '' }));
    }
  }, [filteredTrips, selectedTripIndex, setFilters]);

  const trip = selectedTripIndex !== '' ? allTrips[parseInt(selectedTripIndex)] : null;

  // Híbrido: Telemetría cruzada con el viaje actual
  const tripTelemetry = useMemo(() => {
    if (!trip || !telemetryData || telemetryData.length === 0) return null;
    
    // Find the vehicle's telemetry
    const vehTelemetry = telemetryData.find(td => td.interno === trip.interno);
    if (!vehTelemetry) return null;

    let pts = vehTelemetry.puntos;
    let crossReferenced = false;
    
    if (trip.fecha && trip.puntos && trip.puntos.length > 0) {
      const startMs = timeToMs(trip.puntos[0].hora_real);
      const endMs = timeToMs(trip.puntos[trip.puntos.length - 1].hora_real);

      const matchRango = pts.filter(p => {
        if (!matchDate(p.fecha, trip.fecha)) return false;
        if (!p.hora) return false;
        
        const pMs = timeToMs(p.hora);
        if (startMs <= endMs) {
          return pMs >= startMs && pMs <= endMs;
        } else {
          return true; // Fallback medianoche
        }
      });

      if (matchRango.length > 0) {
        pts = matchRango;
        crossReferenced = true;
      } else {
        const matchFecha = pts.filter(p => matchDate(p.fecha, trip.fecha));
        if (matchFecha.length > 0) {
          pts = matchFecha;
          crossReferenced = true;
        }
      }
    }

    const excesos = pts.filter(p => p.esExceso);
    
    return {
      crossReferenced,
      puntos: pts,
      excesos: excesos
    };
  }, [trip, telemetryData]);

  const teleMapCenter = useMemo(() => {
    if (tripTelemetry && tripTelemetry.puntos.length > 0) {
      const mid = Math.floor(tripTelemetry.puntos.length / 2);
      return [tripTelemetry.puntos[mid].lat, tripTelemetry.puntos[mid].lng];
    }
    return DEFAULT_MAP_CENTER;
  }, [tripTelemetry]);

  const chartData = useMemo(() => {
    if (!trip) return null;
    const labels = trip.puntos.map(p => p.puesto);
    const dataDif = trip.puntos.map(p => p.diferencia);
    const dataDist = trip.puntos.map(p => p.distancia);

    return {
      dif: {
        labels,
        datasets: [{
          label: 'Diferencia (min)',
          data: dataDif,
          backgroundColor: dataDif.map(d => d < -PUNCTUALITY_TOLERANCE_MIN ? 'rgba(16, 185, 129, 0.8)' : (d > PUNCTUALITY_TOLERANCE_MIN ? 'rgba(239, 68, 68, 0.8)' : 'rgba(203, 213, 225, 0.5)')),
          borderColor: dataDif.map(d => d < -PUNCTUALITY_TOLERANCE_MIN ? '#059669' : (d > PUNCTUALITY_TOLERANCE_MIN ? '#dc2626' : '#94a3b8')),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      dist: {
        labels,
        datasets: [{
          label: 'Distancia Acumulada (km)',
          data: dataDist,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#3b82f6',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3
        }]
      }
    };
  }, [trip]);

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleFont: { family: "'Outfit', sans-serif", size: 13 },
        bodyFont: { family: "'Outfit', sans-serif", size: 12 },
        padding: 12,
        cornerRadius: 8,
      }
    },
    scales: {
      x: { display: false },
      y: { border: { dash: [4, 4] }, grid: { color: '#f1f5f9' }, ticks: { font: { family: "'Outfit', sans-serif" } } }
    }
  };

  const InfoChip = ({ label, value, color = "blue" }) => {
    const statusColors = {
      blue: "from-blue-900/40 to-slate-800/40 border-blue-500/30 text-blue-300",
      green: "from-emerald-900/40 to-slate-800/40 border-emerald-500/30 text-emerald-300",
      red: "from-rose-900/40 to-slate-800/40 border-rose-500/30 text-rose-300",
      slate: "from-slate-800/50 to-slate-900/40 border-slate-500/30 text-slate-300",
    };
    return (
      <Tilt tiltMaxAngleX={10} tiltMaxAngleY={10} scale={1.05} transitionSpeed={2000}>
        <div className={`bg-gradient-to-br ${statusColors[color]} backdrop-blur-sm border p-4 rounded-[1.5rem] shadow-[0_8px_15px_rgba(0,0,0,0.02)] h-full`}>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">{label}</p>
          <p className="text-xl font-extrabold drop-shadow-sm">{value}</p>
        </div>
      </Tilt>
    );
  };

  return (
    <div className="space-y-8">
      {/* 3D Filters Container */}
      <div className="glass-panel p-8 rounded-[2.5rem] relative z-20">
        <div className="absolute top-0 left-10 w-24 h-1.5 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-b-xl opacity-80"></div>
        <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm mb-6">Explorador de Viajes</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="group">
            <SearchableSelect 
              label="Vehículo (N° Int)"
              value={filterInterno}
              onChange={(val) => updateFilter('interno', val)}
              options={[
                { value: 'ALL', label: 'Todos los vehículos' },
                ...filterOptions.internos.map(i => ({ value: i, label: i }))
              ]}
              placeholder="Todos los vehículos"
              theme="blue"
            />
          </div>

          <div className="group">
            <SearchableSelect 
              label="Ruta"
              value={filterRuta}
              onChange={(val) => updateFilter('ruta', val)}
              options={[
                { value: 'ALL', label: 'Todas las rutas' },
                ...filterOptions.rutas.map(r => ({ value: r, label: r }))
              ]}
              placeholder="Todas las rutas"
              theme="blue"
            />
          </div>

          <div className="group">
            <SearchableSelect 
              label="Conductor"
              value={filterConductor}
              onChange={(val) => updateFilter('conductor', val)}
              options={[
                { value: 'ALL', label: 'Todos los conductores' },
                ...filterOptions.conds.map(c => ({ value: c, label: c }))
              ]}
              placeholder="Todos los conductores"
              theme="blue"
            />
          </div>

          <div className="group">
            <SearchableSelect 
              label="Seleccionar Viaje"
              value={selectedTripIndex}
              onChange={(val) => updateFilter('viajeIndex', val)}
              options={[
                { value: '', label: 'Seleccione un viaje' },
                ...filteredTrips.map(t => ({ value: t.originalIndex.toString(), label: `${t.viaje} | ${t.ruta}` }))
              ]}
              placeholder="Seleccione un viaje"
              highlight={true}
              theme="blue"
            />
          </div>
        </div>
      </div>

      {!trip ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <svg className="w-20 h-20 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <p className="text-lg font-medium">Seleccione un viaje para ver el detalle en profundidad.</p>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* Trip Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <InfoChip label="Cód. Viaje" value={trip.viaje || '-'} color="slate" />
            <InfoChip label="Placa / Int" value={`${trip.placa || '-'} / ${trip.interno || '-'}`} color="slate" />
            <InfoChip label="Ruta" value={trip.ruta || '-'} color="blue" />
            <InfoChip label="Fecha" value={trip.fecha || '-'} color="slate" />
            <InfoChip label="Distancia" value={`${trip.totalDistancia || 0} km`} color="slate" />
            
            <InfoChip 
               label="Diferencia Total" 
               value={`${trip.totalDiferencia || 0} min`} 
               color={(trip.totalDiferencia || 0) < -PUNCTUALITY_TOLERANCE_MIN ? "green" : ((trip.totalDiferencia || 0) > PUNCTUALITY_TOLERANCE_MIN ? "red" : "slate")} 
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="glass-panel p-8 rounded-[2.5rem]">
                <div className="flex justify-between items-center mb-6 border-b border-slate-300/30 pb-4">
                    <div>
                        <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm">Diferencia (min)</h3>
                        <p className="text-sm font-medium text-slate-400/80">Por Puesto de Control</p>
                    </div>
                    <div className="flex gap-4 text-[11px] font-black uppercase tracking-wider">
                        <span className="flex items-center text-emerald-300 bg-emerald-900/40 px-3 py-1 rounded-lg border border-emerald-400/30"><span className="w-3 h-3 bg-emerald-400 inline-block mr-2 rounded-sm shadow-sm"></span> Antes (&lt; -{PUNCTUALITY_TOLERANCE_MIN})</span>
                        <span className="flex items-center text-blue-300 bg-blue-900/40 px-3 py-1 rounded-lg border border-blue-400/30"><span className="w-3 h-3 bg-blue-400 inline-block mr-2 rounded-sm shadow-sm"></span> A Tiempo</span>
                        <span className="flex items-center text-rose-300 bg-rose-900/40 px-3 py-1 rounded-lg border border-rose-400/30"><span className="w-3 h-3 bg-rose-400 inline-block mr-2 rounded-sm shadow-sm"></span> Tarde (&gt; {PUNCTUALITY_TOLERANCE_MIN})</span>
                    </div>
                </div>
                <Bar data={chartData.dif} options={chartOptions} />
            </div>
            
            <div className="glass-panel p-8 rounded-[2.5rem]">
                <div className="mb-6 border-b border-slate-300/30 pb-4">
                    <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm">Distancia (km)</h3>
                    <p className="text-sm font-medium text-slate-400/80">Acumulado del viaje</p>
                </div>
                <Line data={chartData.dist} options={chartOptions} />
            </div>
          </div>

          {/* 3D Glass Table */}
          <div className="glass-panel rounded-[2.5rem] overflow-hidden">
            <div className="p-8 border-b border-white/40 bg-slate-800/30 backdrop-blur-md">
              <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm">Registro Detallado</h3>
            </div>
            <div className="overflow-x-auto p-6">
              <table className="min-w-full text-sm text-left border-separate border-spacing-y-3">
                <thead>
                  <tr className="bg-white/10 text-slate-300 border-b border-white/20">
                    <th className="px-5 py-4 font-black uppercase tracking-widest rounded-tl-2xl border-b border-white/20">#</th>
                    <th className="px-5 py-4 font-black uppercase tracking-widest border-b border-white/20">Puesto</th>
                    <th className="px-5 py-4 font-black uppercase tracking-widest border-b border-white/20">H. Estimada</th>
                    <th className="px-5 py-4 font-black uppercase tracking-widest border-b border-white/20">H. Real</th>
                    <th className="px-5 py-4 font-black uppercase tracking-widest border-b border-white/20">Conductor</th>
                    <th className="px-5 py-4 font-black uppercase tracking-widest text-right border-b border-white/20">Dif (min)</th>
                    <th className="px-5 py-4 font-black uppercase tracking-widest text-right rounded-tr-2xl border-b border-white/20">Dist (km)</th>
                  </tr>
                </thead>
                <tbody>
                  {trip.puntos.map((p, idx) => {
                    const isBefore = p.diferencia < -PUNCTUALITY_TOLERANCE_MIN;
                    const isLate = p.diferencia > PUNCTUALITY_TOLERANCE_MIN;
                    
                    let bgClass = "bg-slate-800/40 hover:bg-slate-800/60 border-white/20";
                    let textClass = "text-slate-300 font-bold";
                    
                    if (isBefore) {
                        bgClass = "bg-emerald-900/40 hover:bg-emerald-900/60 border-emerald-500/30";
                        textClass = "text-emerald-400 font-black";
                    } else if (isLate) {
                        bgClass = "bg-rose-900/40 hover:bg-rose-900/60 border-rose-500/30";
                        textClass = "text-rose-400 font-black";
                    }

                    return (
                      <tr key={idx} className={`table-row-glass transition-all duration-300 hover:shadow-[0_8px_25px_rgba(31,38,135,0.1)] hover:-translate-y-0.5 group backdrop-blur-md ${bgClass}`}>
                        <td className="px-5 py-4 rounded-l-2xl font-bold text-slate-400/80">{p.orden}</td>
                        <td className="px-5 py-4 font-extrabold text-slate-100">{p.puesto}</td>
                        <td className="px-5 py-4 text-slate-400 font-medium whitespace-nowrap">{p.hora_est}</td>
                        <td className="px-5 py-4 text-slate-400 font-medium whitespace-nowrap">{p.hora_real}</td>
                        <td className="px-5 py-4 text-slate-200 font-semibold">{p.conductor}</td>
                        <td className={`px-5 py-4 text-right ${textClass}`}>
                          {p.diferencia > 0 ? `+${p.diferencia}` : p.diferencia}
                        </td>
                        <td className="px-5 py-4 rounded-r-2xl text-right text-slate-400 font-bold">{p.distancia}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Timeline Híbrido / Mini-Mapa GPS */}
          {tripTelemetry && (
            <div className="glass-panel p-8 rounded-[2.5rem] mt-8 relative overflow-hidden">
               <div className="absolute top-0 right-10 w-32 h-1.5 bg-gradient-to-l from-rose-500 to-indigo-600 rounded-b-xl opacity-80"></div>
               <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-300/30 pb-4">
                 <div>
                   <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm flex items-center">
                     <span className="w-4 h-4 bg-indigo-500 rounded-full mr-3 shadow-sm"></span>
                     Timeline Híbrido de Riesgo
                   </h3>
                   <p className="text-sm font-medium text-slate-400/80 mt-1">
                      Telemetría de velocidad &gt; {SPEED_LIMIT_KMH} km/h para el Vehículo #{trip.interno}
                     {tripTelemetry.crossReferenced ? ' (Sincronizado con fecha de este viaje)' : ' (Contexto Histórico)'}
                   </p>
                 </div>
                 {tripTelemetry.excesos.length > 0 && (
                   <div className="mt-4 md:mt-0 px-4 py-2 bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold rounded-xl flex items-center">
                      <svg className="w-5 h-5 mr-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                      {tripTelemetry.excesos.length} Infracciones (&gt; {SPEED_LIMIT_KMH} km/h)
                   </div>
                 )}
               </div>

               <div className="h-[350px] w-full rounded-[1.5rem] overflow-hidden shadow-inner border border-white/50 relative z-0">
                  <MapContainer 
                    key={`${trip.interno}-${trip.fecha || 'historico'}`} 
                    center={teleMapCenter} 
                    zoom={DEFAULT_MAP_ZOOM} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution={MAP_ATTRIBUTION}
                      url={MAP_TILE_URL}
                    />
                    
                    <Polyline 
                      positions={tripTelemetry.puntos.map(p => [p.lat, p.lng])} 
                      {...ROUTE_POLYLINE_STYLE}
                    />

                    {tripTelemetry.excesos.map((p, idx) => (
                      <CircleMarker 
                        key={idx}
                        center={[p.lat, p.lng]} 
                        pathOptions={SPEEDING_MARKER_STYLE} 
                        radius={SPEEDING_MARKER_STYLE.radius}
                      >
                        <Popup className="font-sans font-bold">
                          <div className="text-center">
                            <p className="text-rose-600 text-lg mb-1">{p.velocidad} km/h</p>
                            {p.fecha && <p className="text-xs text-slate-500">{p.fecha} {p.hora}</p>}
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
               </div>

               {/* Timeline Cronológico Vertical Removido a petición del usuario */}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
