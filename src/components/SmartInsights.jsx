import React, { useState } from 'react';
import { SPEED_LIMIT_KMH, PUNCTUALITY_TOLERANCE_MIN } from '../constants/index.js';

export default function SmartInsights({ allTrips = [], telemetryData = [] }) {
  const [insight, setInsight] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const generateInsight = () => {
    if (allTrips.length === 0) return;
    setIsGenerating(true);
    setInsight('');
    
    // Calculate metrics
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

    // Typing effect
    let i = 0;
    const typeWriter = setInterval(() => {
      setInsight(prev => prev + text.charAt(i));
      i++;
      if (i >= text.length) {
        clearInterval(typeWriter);
        setIsGenerating(false);
      }
    }, 20); // 20ms per char
  };

  if (allTrips.length === 0) return null;

  return (
    <div className="glass-panel p-6 rounded-3xl mt-8 mb-8 border border-fuchsia-500/20 relative overflow-hidden shadow-[0_4px_30px_rgba(217,70,239,0.1)]">
      <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/10 blur-3xl rounded-full -mt-20 -mr-20 pointer-events-none"></div>
      
      <div className="flex flex-col md:flex-row items-start gap-6 relative z-10">
        <div className="p-4 bg-fuchsia-500/10 rounded-2xl shrink-0">
          <svg className="w-8 h-8 text-fuchsia-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        
        <div className="flex-1 w-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-100">Síntesis Operativa IA</h3>
            <button 
              onClick={generateInsight}
              disabled={isGenerating}
              className={`px-5 py-2 text-sm font-bold rounded-xl transition-all ${isGenerating ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed' : 'bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30 active:scale-95'}`}
            >
              {isGenerating ? 'Analizando...' : (insight ? 'Regenerar Síntesis' : 'Generar Síntesis')}
            </button>
          </div>
          
          <div className="min-h-[80px] p-5 bg-black/20 rounded-xl text-slate-300 font-medium leading-relaxed border border-white/5">
            {insight ? (
              <p>{insight}{isGenerating && <span className="animate-pulse font-bold text-fuchsia-400 ml-1">|</span>}</p>
            ) : (
              <p className="text-slate-500 italic">Haz clic en "Generar Síntesis" para procesar todo el conjunto de datos y obtener un análisis en lenguaje natural de los hallazgos operativos.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
