import React from 'react';

export default function LoadingSpinner({ message = 'Procesando archivo...' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-panel p-10 rounded-[2.5rem] flex flex-col items-center gap-6 shadow-[0_0_60px_rgba(6,182,212,0.3)]">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-cyan-400/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-transparent border-t-cyan-400 rounded-full animate-spin"></div>
        </div>
        <p className="text-white font-extrabold text-lg tracking-wide">{message}</p>
        <p className="text-slate-400 text-sm font-medium">Esto puede tomar unos segundos</p>
      </div>
    </div>
  );
}
