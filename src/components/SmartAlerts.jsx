import React, { useMemo } from 'react';
import { SPEED_LIMIT_KMH, PUNCTUALITY_TOLERANCE_MIN } from '../constants/index.js';

export default function SmartAlerts({ allTrips = [], telemetryData = [] }) {
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
          message: `El vehículo #${worstSpeeder.interno} acumula ${worstSpeeder.excesos} infracciones por exceso de velocidad (> ${SPEED_LIMIT_KMH} km/h).`,
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
          message: `La ruta ${worstRoute.ruta} presenta un retraso promedio crítico de ${worstRoute.avgDelay.toFixed(0)} min por viaje.`,
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
          message: `${perfectDriver[0]} tiene un récord perfecto de puntualidad (0 retrasos en ${perfectDriver[1].puntos} marcaciones).`,
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        });
      }
    }
    
    return list;
  }, [allTrips, telemetryData]);

  if (alerts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {alerts.map(alert => {
        const colors = {
          danger: 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)]',
          warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.1)]',
          success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
        };
        return (
          <div key={alert.id} className={`glass-panel p-5 rounded-2xl border flex items-start gap-4 ${colors[alert.type]}`}>
            <div className={`p-2 rounded-xl bg-black/20 shrink-0`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {alert.icon}
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider opacity-80 mb-1">{alert.title}</h4>
              <p className="text-sm font-medium leading-relaxed opacity-90">{alert.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
