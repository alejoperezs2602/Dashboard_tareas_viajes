import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import Tilt from 'react-parallax-tilt';
import { SPEED_LIMIT_KMH, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, MAP_TILE_URL, MAP_ATTRIBUTION, SPEEDING_MARKER_STYLE, ROUTE_POLYLINE_STYLE } from '../constants/index.js';
import SearchableSelect from './ui/SearchableSelect.jsx';

function MapController({ targetPoint }) {
  const map = useMap();
  useEffect(() => {
    if (targetPoint) {
      map.flyTo(targetPoint, 18, { duration: 1.5 });
    }
  }, [targetPoint, map]);
  return null;
}

export default function TelemetryDashboard({ telemetryData, allTrips = [] }) {
  const [selectedInterno, setSelectedInterno] = useState('');
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const reportRef = useRef(null);

  const vehiclesList = useMemo(() => {
    return [...telemetryData].sort((a, b) => b.excesos - a.excesos);
  }, [telemetryData]);

  const selectedVehicleData = useMemo(() => {
    return telemetryData.find(v => v.interno === selectedInterno) || null;
  }, [telemetryData, selectedInterno]);

  const reportData = useMemo(() => {
    if (!selectedVehicleData || selectedVehicleData.excesos === 0) return [];
    
    // Enrich each alert with the corresponding trip from allTrips
    return selectedVehicleData.puntos.filter(p => p.esExceso).map(alert => {
      let matchedTripLabel = 'Sin viaje registrado';
      if (allTrips.length > 0) {
        // Match by internal number and date
        const possibleTrips = allTrips.filter(t => 
          String(t.interno) === String(selectedVehicleData.interno) && 
          t.fecha === alert.fecha
        );
        if (possibleTrips.length > 0) {
          // If there are multiple trips in a day, ideally we'd check if alert.hora is within hora_est/hora_real.
          // For now, we take the first matching trip on that date.
          matchedTripLabel = `${possibleTrips[0].viaje} | ${possibleTrips[0].ruta}`;
        }
      }
      return { ...alert, viajeStr: matchedTripLabel };
    });
  }, [selectedVehicleData, allTrips]);

  // Si hay un vehículo seleccionado, calculamos el centro inicial del mapa
  const mapCenter = useMemo(() => {
    if (selectedVehicleData && selectedVehicleData.puntos.length > 0) {
      const midIndex = Math.floor(selectedVehicleData.puntos.length / 2);
      return [selectedVehicleData.puntos[midIndex].lat, selectedVehicleData.puntos[midIndex].lng];
    }
    return DEFAULT_MAP_CENTER;
  }, [selectedVehicleData]);

  const handleDownloadReport = async () => {
    if (!reportRef.current) return;
    setIsGenerating(true);
    
    try {
      // Usamos html-to-image en lugar de html2canvas porque Tailwind v4 
      // usa colores "oklch" de forma nativa, lo cual rompe a html2canvas.
      const htmlToImage = await import('html-to-image');

      const dataUrl = await htmlToImage.toPng(reportRef.current, {
        pixelRatio: 2, // Alta resolución
        backgroundColor: '#0f172a', 
        style: {
          visibility: 'visible', // Forzamos a que sea visible en el render
          transform: 'none'
        }
      });
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Reporte_Velocidad_Vehiculo_${selectedInterno}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error generating report:", err);
      alert(`Hubo un error al generar el reporte de imagen: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Filters and Summary */}
      <div className="glass-panel p-8 rounded-[2.5rem] relative z-20">
        <div className="absolute top-0 left-10 w-24 h-1.5 bg-gradient-to-r from-red-400 to-rose-600 rounded-b-xl opacity-80"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm">Mapa de Telemetría</h3>
            <p className="text-sm font-medium text-slate-400/80">Identificador visual de excesos de velocidad (&gt; {SPEED_LIMIT_KMH} km/h)</p>
          </div>
          
          <div className="w-full md:w-64">
            <SearchableSelect 
              label="Vehículo (N° Int)"
              value={selectedInterno}
              onChange={(val) => {
                setSelectedInterno(val);
                setSelectedAlert(null);
              }}
              options={[
                { value: '', label: 'Seleccione un vehículo...' },
                ...vehiclesList.map(v => ({
                  value: v.interno,
                  label: `${v.interno} (${v.excesos} excesos)`
                }))
              ]}
              placeholder="Seleccione un vehículo..."
              highlight={true}
              theme="rose"
            />
          </div>
        </div>
      </div>

      {!selectedVehicleData ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <svg className="w-20 h-20 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          <p className="text-lg font-medium">Seleccione un vehículo para cargar el mapa de ruta.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Alertas Panel */}
          <div className="lg:col-span-1 glass-panel p-8 rounded-[2.5rem] flex flex-col h-[600px]">
             <div className="mb-6 border-b border-slate-300/30 pb-4 flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm flex items-center">
                    <span className="w-4 h-4 bg-rose-500 rounded-full mr-3 shadow-sm animate-pulse"></span>
                    Alertas
                  </h3>
                  <p className="text-sm font-medium text-slate-400/80 mt-1">
                    {selectedVehicleData.excesos} registros de velocidad alta
                  </p>
                </div>
                
                {selectedVehicleData.excesos > 0 && (
                  <button 
                    onClick={handleDownloadReport}
                    disabled={isGenerating}
                    className="p-2 rounded-xl bg-slate-800 border border-slate-600 hover:bg-rose-500 hover:border-rose-400 hover:text-white transition-all text-slate-300 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed group"
                    title="Descargar Reporte"
                  >
                    {isGenerating ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    )}
                  </button>
                )}
             </div>
             
             <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {selectedVehicleData.excesos > 0 ? (
                  <div className="space-y-3">
                    {selectedVehicleData.puntos.filter(p => p.esExceso).map((p, idx) => {
                      const isSelected = selectedAlert && selectedAlert[0] === p.lat && selectedAlert[1] === p.lng;
                      return (
                        <div 
                          key={idx} 
                          onClick={() => setSelectedAlert([p.lat, p.lng])}
                          className={`flex justify-between items-center p-4 rounded-2xl border transition-all duration-300 group relative overflow-hidden cursor-pointer ${
                            isSelected 
                              ? 'bg-rose-500/20 border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)]' 
                              : 'bg-slate-800/40 border-white/10 hover:bg-slate-700/60 hover:shadow-[0_8px_20px_rgba(244,63,94,0.15)]'
                          }`}
                        >
                          <div className={`absolute left-0 top-0 bottom-0 w-1 shadow-[0_0_10px_rgba(244,63,94,0.8)] ${isSelected ? 'bg-white' : 'bg-rose-500'}`}></div>
                          <div className="pl-3">
                            <span className={`${isSelected ? 'text-white drop-shadow-md' : 'text-rose-400'} font-black block text-xl tracking-wide transition-colors`}>{p.velocidad} km/h</span>
                            <span className="text-xs font-bold text-slate-300 mt-1 block">Cond: <span className="text-white">{p.conductor}</span></span>
                            <span className="text-[10px] font-bold text-rose-300/70">{p.fecha} - {p.hora}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] font-bold text-slate-400 block tracking-wider">Lat: {p.lat.toFixed(4)}</span>
                            <span className="text-[11px] font-bold text-slate-400 block tracking-wider">Lng: {p.lng.toFixed(4)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-emerald-500 font-bold text-center">
                    <div className="flex flex-col items-center">
                      <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      No hay excesos de velocidad registrados para este vehículo.
                    </div>
                  </div>
                )}
             </div>
          </div>

          {/* Map Panel */}
          <div className="lg:col-span-2 glass-panel p-2 rounded-[2.5rem] relative overflow-hidden h-[600px] shadow-[0_20px_40px_rgba(0,0,0,0.1)]">
            <MapContainer 
              key={selectedInterno} // Para forzar re-render cuando cambia el centro fuertemente
              center={mapCenter} 
              zoom={DEFAULT_MAP_ZOOM} 
              style={{ height: '100%', width: '100%', borderRadius: '2.2rem', zIndex: 0 }}
            >
              <MapController targetPoint={selectedAlert} />
              
              <TileLayer
                attribution={MAP_ATTRIBUTION}
                url={MAP_TILE_URL}
              />
              
              {/* Ruta principal */}
              <Polyline 
                positions={selectedVehicleData.puntos.map(p => [p.lat, p.lng])} 
                {...ROUTE_POLYLINE_STYLE}
              />

              {/* Puntos de exceso de velocidad */}
              {selectedVehicleData.puntos.filter(p => p.esExceso).map((p, idx) => {
                const isSelected = selectedAlert && selectedAlert[0] === p.lat && selectedAlert[1] === p.lng;
                
                return (
                  <CircleMarker 
                    key={idx}
                    center={[p.lat, p.lng]} 
                    pathOptions={{
                      ...SPEEDING_MARKER_STYLE,
                      fillColor: isSelected ? '#ffffff' : SPEEDING_MARKER_STYLE.fillColor,
                      color: isSelected ? '#ffffff' : SPEEDING_MARKER_STYLE.color,
                    }} 
                    radius={isSelected ? SPEEDING_MARKER_STYLE.radius * 1.5 : SPEEDING_MARKER_STYLE.radius}
                  >
                    <Popup className="font-sans font-bold">
                      <div className="text-center">
                        <p className="text-rose-600 text-lg mb-1">{p.velocidad} km/h</p>
                        <p className="text-xs text-slate-500">Conductor: {p.conductor}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
          
        </div>
      )}

      {/* Hidden Report for Export */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
        <div ref={reportRef} className="w-[800px] bg-slate-900 p-10 rounded-3xl border border-slate-700 flex flex-col gap-6 text-slate-100">
          <div className="border-b border-slate-700 pb-6 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center">
                <span className="w-5 h-5 bg-rose-500 rounded-full mr-3 shadow-[0_0_15px_rgba(244,63,94,0.6)]"></span>
                Reporte de Velocidad
              </h1>
              <p className="text-slate-400 mt-2 font-medium">Historial de alertas - Vehículo <span className="text-rose-400 font-bold">{selectedInterno}</span></p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-white">{selectedVehicleData?.excesos || 0}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Total Excesos</p>
            </div>
          </div>

          <div className="flex-1 bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
            {reportData.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="pb-3 font-bold uppercase">Fecha y Hora</th>
                    <th className="pb-3 font-bold uppercase">Velocidad</th>
                    <th className="pb-3 font-bold uppercase">Conductor</th>
                    <th className="pb-3 font-bold uppercase text-right">Viaje / Ruta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {reportData.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 text-slate-300 font-medium">
                        {p.fecha} <br/><span className="text-xs text-slate-500">{p.hora}</span>
                      </td>
                      <td className="py-3">
                        <span className="text-rose-400 font-black">{p.velocidad} km/h</span>
                      </td>
                      <td className="py-3 text-slate-300">
                        {p.conductor}
                      </td>
                      <td className="py-3 text-right">
                        <span className="bg-slate-700/50 text-slate-300 text-xs px-2 py-1 rounded-lg border border-slate-600">
                          {p.viajeStr}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-center text-slate-500 font-medium py-10">Sin alertas registradas para este vehículo.</p>
            )}
          </div>
          
          <div className="text-center text-xs font-bold text-slate-600 uppercase tracking-widest mt-2">
            Generado automáticamente por SOTRAPPAL - {new Date().toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}
