import React from 'react';

export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  
  return (
    <div role="alert" className="glass-panel p-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <svg className="w-6 h-6 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
        <p className="text-rose-300 font-bold text-sm">{message}</p>
      </div>
      {onDismiss && (
        <button 
          onClick={onDismiss}
          className="text-slate-400 hover:text-white transition-colors p-1"
          aria-label="Cerrar error"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      )}
    </div>
  );
}
