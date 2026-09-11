import React from 'react';

export default function GlassSelect({ label, value, onChange, options, highlight = false, className = '' }) {
  return (
    <div className="group">
      {label && (
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 transition-colors group-focus-within:text-cyan-400">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className={`w-full appearance-none bg-slate-800/50 backdrop-blur-md border shadow-sm text-slate-100 rounded-2xl px-5 py-3 outline-none transition-all focus:ring-4 font-semibold cursor-pointer ${
            highlight
              ? 'border-cyan-400/30 focus:ring-cyan-500/30 shadow-[0_4px_15px_rgba(6,182,212,0.15)] font-bold'
              : 'border-white/10 focus:ring-white/10'
          } ${className}`}
        >
          {options.map((opt, idx) => (
            <option 
              key={opt.value ?? idx} 
              value={opt.value} 
              className="bg-slate-900 text-slate-100"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-cyan-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
          </svg>
        </div>
      </div>
    </div>
  );
}
