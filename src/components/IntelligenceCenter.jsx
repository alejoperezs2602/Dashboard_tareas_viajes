import React, { useMemo, useState } from 'react';
import { SPEED_LIMIT_KMH, PUNCTUALITY_TOLERANCE_MIN } from '../constants/index.js';

export default function IntelligenceCenter({ allTrips = [], telemetryData = [] }) {
  // --- ALERTS LOGIC ---
  const alerts = useMemo(() => {
    const list = [];
    
    // 1. Worst Speeding Vehicle
    if (telemetryData.length > 0) {
      const worstSpeeder = [...telemetryData].sort((a, b) => b.excesos - a.excesos)[0];
      if (worstSpeeder && worstSpeeder.excesos > 0) {
        list.push({
          id: 'speed',
          type: 'danger',
          title: 'Alerta de Seguridad',
          message: `Vehículo #${worstSpeeder.interno} acumula ${worstSpeeder.excesos} excesos de velocidad (> ${SPEED_LIMIT_KMH} km/h).`,
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        });
      }
    }

    // 2. Route with highest delay average
    if (allTrips.length > 0) {
      const routeMap = {};
      allTrips.forEach(t => {
        if (!t.ruta) return;
        if (!routeMap[t.ruta]) routeMap[t.ruta] = { count: 0, delay: 0 };
        const delay = Math.max(0, t.totalDiferencia || 0);
        routeMap[t.ruta].count++;
        routeMap[t.ruta].delay += delay;
      });
      
      const worstRoute = Object.entries(routeMap)
        .map(([ruta, data]) => ({ ruta, avgDelay: data.delay / data.count }))
        .sort((a, b) => b.avgDelay - a.avgDelay)[0];
        
      if (worstRoute && worstRoute.avgDelay > PUNCTUALITY_TOLERANCE_MIN * 2) {
        list.push({
          id: 'route',
          type: 'warning',
          title: 'Atención Operativa',
          message: `La ruta ${worstRoute.ruta} presenta retraso crítico prom. de ${worstRoute.avgDelay.toFixed(0)} min/viaje.`,
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        });
      }
    }

    // 3. Perfect driver
    if (allTrips.length > 0) {
      const driverMap = {};
      allTrips.forEach(t => {
        t.puntos.forEach(p => {
          if (!p.conductor) return;
          if (!driverMap[p.conductor]) driverMap[p.conductor] = { puntos: 0, tarde: 0 };
          driverMap[p.conductor].puntos++;
          if (p.diferencia > PUNCTUALITY_TOLERANCE_MIN) driverMap[p.conductor].tarde++;
        });
      });
      
      const perfectDriver = Object.entries(driverMap)
        .find(([_, data]) => data.puntos > 10 && data.tarde === 0);
        
      if (perfectDriver) {
        list.push({
          id: 'driver',
          type: 'success',
          title: 'Conductor Destacado',
          message: `${perfectDriver[0]} tiene un récord perfecto (0 retrasos en ${perfectDriver[1].puntos} marcaciones).`,
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        });
      }
    }
    
    return list;
  }, [allTrips, telemetryData]);


  // --- INSIGHTS LOGIC ---
  const [insight, setInsight] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const generateInsight = () => {
    if (allTrips.length === 0) return;
    setIsGenerating(true);
    setInsight('');
    
    let totalPunctual = 0;
    let totalPoints = 0;
    let routeCounts = {};
    let driverSpeeding = {};
    let totalSpeeding = 0;

    allTrips.forEach(t => {
      if (t.ruta) routeCounts[t.ruta] = (routeCounts[t.ruta] || 0) + 1;
      t.puntos.forEach(p => {
        totalPoints++;
        if (Math.abs(p.diferencia) <= PUNCTUALITY_TOLERANCE_MIN) totalPunctual++;
      });
    });

    telemetryData.forEach(v => {
      totalSpeeding += v.excesos || 0;
      if (v.excesos > 0 && v.conductores.length > 0) {
        v.conductores.forEach(c => {
          driverSpeeding[c] = (driverSpeeding[c] || 0) + v.excesos;
        });
      }
    });

    const punctRate = totalPoints > 0 ? ((totalPunctual / totalPoints) * 100).toFixed(1) : 0;
    const topRoute = Object.entries(routeCounts).sort((a,b) => b[1]-a[1])[0];
    const topSpeeder = Object.entries(driverSpeeding).sort((a,b) => b[1]-a[1])[0];

    let text = `En el período analizado se han completado ${allTrips.length} viajes. `;
    if (topRoute) text += `La ruta de mayor tráfico fue ${topRoute[0]} con ${topRoute[1]} viajes. `;
    text += `La tasa de puntualidad global de la flota se sitúa en un ${punctRate}%. `;
    
    if (totalSpeeding > 0) {
      text += `En materia de seguridad operativa, se registraron ${totalSpeeding} incidentes por exceso de velocidad (> ${SPEED_LIMIT_KMH} km/h). `;
      if (topSpeeder) text += `Recomendamos especial seguimiento al conductor ${topSpeeder[0]}, quien concentra la mayor cantidad de estas alertas.`;
    } else {
      text += `Destacamos positivamente que no se han registrado incidentes de exceso de velocidad en la telemetría disponible.`;
    }

    let i = 0;
    const typeWriter = setInterval(() => {
      setInsight(prev => prev + text.charAt(i));
      i++;
      if (i >= text.length) {
        clearInterval(typeWriter);
        setIsGenerating(false);
      }
    }, 20);
  };

  if (allTrips.length === 0) return null;

  return (
    <div className="glass-panel p-6 md:p-8 rounded-[2.5rem] mt-8 mb-8 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/10 blur-3xl rounded-full -mt-20 -mr-20 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 blur-3xl rounded-full -mb-10 -ml-10 pointer-events-none"></div>

      <div className="relative z-10">
        <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm flex items-center mb-6">
          <svg className="w-6 h-6 mr-3 text-fuchsia-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Centro de Inteligencia
        </h3>

        {/* Top: Alerts Row */}
        {alerts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {alerts.map(alert => {
              const colors = {
                danger: 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)]',
                warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.1)]',
                success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
              };
              return (
                <div key={alert.id} className={`p-4 rounded-2xl border flex items-start gap-4 ${colors[alert.type]}`}>
                  <div className={`p-2 rounded-xl bg-black/20 shrink-0`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {alert.icon}
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider opacity-90 mb-1">{alert.title}</h4>
                    <p className="text-sm font-medium leading-relaxed opacity-90">{alert.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom: AI Synthesis */}
        <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row gap-6 items-start">
          <div className="flex-1 w-full min-h-[80px]">
            {insight ? (
              <p className="text-slate-300 font-medium leading-relaxed text-sm md:text-base">
                {insight}{isGenerating && <span className="animate-pulse font-bold text-fuchsia-400 ml-1">|</span>}
              </p>
            ) : (
              <p className="text-slate-500 italic text-sm md:text-base">Haz clic en "Generar Síntesis" para procesar todo el conjunto de datos y obtener un análisis en lenguaje natural de los hallazgos operativos.</p>
            )}
          </div>
          
          <button 
            onClick={generateInsight}
            disabled={isGenerating}
            className={`shrink-0 px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${isGenerating ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed' : 'bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30 active:scale-95 shadow-[0_2px_10px_rgba(192,38,211,0.2)]'}`}
          >
            {isGenerating ? 'Analizando...' : (insight ? 'Regenerar Síntesis' : 'Generar Síntesis')}
          </button>
        </div>

      </div>
    </div>
  );
}
