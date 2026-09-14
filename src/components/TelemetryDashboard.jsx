import React, { useState, useMemo, useEffect } from 'react';
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

export default function TelemetryDashboard({ telemetryData }) {
  const [selectedInterno, setSelectedInterno] = useState('');
  const [selectedAlert, setSelectedAlert] = useState(null);

  const vehiclesList = useMemo(() => {
    return [...telemetryData].sort((a, b) => b.excesos - a.excesos);
  }, [telemetryData]);

  const selectedVehicleData = useMemo(() => {
    return telemetryData.find(v => v.interno === selectedInterno) || null;
  }, [telemetryData, selectedInterno]);

  // Si hay un vehículo seleccionado, calculamos el centro inicial del mapa
  const mapCenter = useMemo(() => {
    if (selectedVehicleData && selectedVehicleData.puntos.length > 0) {
      const midIndex = Math.floor(selectedVehicleData.puntos.length / 2);
      return [selectedVehicleData.puntos[midIndex].lat, selectedVehicleData.puntos[midIndex].lng];
    }
    return DEFAULT_MAP_CENTER;
  }, [selectedVehicleData]);

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
             <div className="mb-6 border-b border-slate-300/30 pb-4">
                <h3 className="text-2xl font-extrabold text-slate-100 drop-shadow-sm flex items-center">
                  <span className="w-4 h-4 bg-rose-500 rounded-full mr-3 shadow-sm animate-pulse"></span>
                  Alertas
                </h3>
                <p className="text-sm font-medium text-slate-400/80 mt-1">
                  {selectedVehicleData.excesos} registros de velocidad alta
                </p>
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
    </div>
  );
}
