import React, { useEffect, useState } from 'react';

export default function CommandPalette({ isOpen, onClose, actions }) {
  const [search, setSearch] = useState('');
  
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Direct navigation shortcuts when palette is closed and not typing in an input
      if (!isOpen && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT') {
        if (e.key === '1') actions.goToGeneral();
        if (e.key === '2') actions.goToVehicles();
        if (e.key === '3') actions.goToTelemetry();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, actions]);

  if (!isOpen) return null;

  const items = [
    { id: 'tab-gen', label: 'Ir a Dashboard General', action: actions.goToGeneral },
    { id: 'tab-veh', label: 'Ir a Vehículos Individuales', action: actions.goToVehicles },
    { id: 'tab-map', label: 'Ir a Mapa Telemetría GPS', action: actions.goToTelemetry },
    { id: 'action-pdf', label: 'Exportar Reporte PDF', action: actions.exportPDF },
    { id: 'action-theme', label: 'Alternar Tema Claro/Oscuro', action: actions.toggleTheme },
    { id: 'action-clear', label: 'Limpiar todos los datos', action: actions.clearData }
  ];

  const filteredItems = items.filter(item => item.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-slate-800/90 backdrop-blur-xl border border-white/10 overflow-hidden flex flex-col rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]" onClick={e => e.stopPropagation()}>
        
        <div className="flex items-center px-6 py-5 border-b border-white/5">
          <svg className="w-6 h-6 text-cyan-400 mr-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input 
            autoFocus
            type="text" 
            placeholder="Buscar comando o acción... (Esc para salir)" 
            className="flex-1 bg-transparent border-none outline-none text-slate-100 font-medium text-lg placeholder-slate-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filteredItems.length > 0) {
                filteredItems[0].action();
                onClose();
              }
            }}
          />
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {filteredItems.map(item => (
            <button 
              key={item.id}
              onClick={() => { item.action(); onClose(); }}
              className="w-full text-left px-6 py-4 text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-300 transition-colors flex items-center group"
            >
              <svg className="w-5 h-5 mr-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              <span className="font-bold text-sm tracking-wide">{item.label}</span>
            </button>
          ))}
          {filteredItems.length === 0 && (
             <p className="px-6 py-8 text-slate-500 text-center font-medium">No se encontraron comandos para "{search}"</p>
          )}
        </div>

        <div className="px-6 py-3 bg-black/40 border-t border-white/5 text-xs text-slate-500 font-medium flex justify-between items-center">
          <span>Navegación rápida sin abrir el menú: <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 mx-1 border border-slate-600">1</kbd> <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 mx-1 border border-slate-600">2</kbd> <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 mx-1 border border-slate-600">3</kbd></span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 mx-1 border border-slate-600">Ctrl/Cmd + K</kbd> para abrir</span>
        </div>

      </div>
    </div>
  );
}
