import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AvailableDatePicker({ value, onChange, availableDates = [], localDates = [], placeholder = 'Seleccionar fecha' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  
  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Initialize to the year/month of the currently selected value, or today's date if empty.
  const initialDate = value ? new Date(value + 'T12:00:00Z') : new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));

  // Handle month navigation
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  // Generate calendar grid
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay(); // 0 = Sunday

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const handleSelect = (day) => {
    if (!day) return;
    const y = currentMonth.getFullYear();
    const m = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const isoDate = `${y}-${m}-${d}`;
    onChange(isoDate);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-slate-900/50 backdrop-blur-md border border-white/10 text-sm font-bold text-slate-200 px-3 sm:px-4 py-2 rounded-xl outline-none hover:bg-slate-800 transition-colors flex items-center justify-between min-w-[120px] sm:min-w-[140px]"
      >
        <span>{value || placeholder}</span>
        <svg className="w-4 h-4 text-slate-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full mt-2 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-0 z-[100] bg-[#141525] border border-cyan-500/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-4 w-[280px] sm:w-72 backdrop-blur-xl"
          >
              <div className="flex justify-between items-center mb-4">
                <button type="button" onClick={prevMonth} className="text-slate-400 hover:text-white p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <div className="text-slate-100 font-extrabold text-sm">
                  {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </div>
                <button type="button" onClick={nextMonth} className="text-slate-400 hover:text-white p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map(d => (
                  <div key={d} className="text-xs font-bold text-slate-500">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days.map((d, i) => {
                  if (!d) return <div key={`empty-${i}`} className="p-2"></div>;
                  
                  const y = currentMonth.getFullYear();
                  const m = String(currentMonth.getMonth() + 1).padStart(2, '0');
                  const dayStr = String(d).padStart(2, '0');
                  const isoDate = `${y}-${m}-${dayStr}`;
                  
                  const hasCloudData = availableDates.includes(isoDate);
                  const hasLocalData = localDates.includes(isoDate);
                  const isSelected = value === isoDate;

                  return (
                    <button
                      key={isoDate}
                      type="button"
                      onClick={() => handleSelect(d)}
                      className={`relative p-2 text-sm font-medium rounded-lg transition-all ${
                        isSelected 
                          ? 'bg-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.5)]' 
                          : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {d}
                      
                      {/* Punto Cyan si está en bóveda local */}
                      {hasLocalData && !isSelected && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_5px_rgba(34,211,238,1)]"></div>
                      )}
                      
                      {/* Punto Verde si está en nube pero NO en bóveda local */}
                      {hasCloudData && !hasLocalData && !isSelected && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full shadow-[0_0_5px_rgba(52,211,153,1)]"></div>
                      )}
                      
                      {/* Punto Blanco si está seleccionado y tiene algún dato */}
                      {(hasCloudData || hasLocalData) && isSelected && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full"></div>
                      )}
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
                 <div className="flex items-center justify-between">
                   <button onClick={() => { onChange(''); setIsOpen(false); }} className="text-xs font-bold text-slate-500 hover:text-white">Borrar Selección</button>
                   <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_5px_rgba(52,211,153,1)]"></div>
                      En Nube
                   </div>
                 </div>
                 <div className="flex items-center justify-end gap-1.5 text-xs text-slate-400">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_5px_rgba(34,211,238,1)]"></div>
                    Descargado
                 </div>
              </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
