import React, { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ 
  label,
  value, 
  onChange, 
  options = [], // [{ value, label }]
  placeholder = "Seleccione...",
  className = "",
  highlight = false,
  theme = "cyan" // "cyan" or "rose" or "blue"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedOption = options.find(opt => String(opt.value) === String(value));
  const displayValue = isOpen ? searchTerm : (selectedOption ? selectedOption.label : "");

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const themeClasses = {
    cyan: {
      border: highlight ? 'border-cyan-400/30' : 'border-white/10',
      ring: 'focus:ring-cyan-500/30',
      shadow: highlight ? 'shadow-[0_4px_15px_rgba(6,182,212,0.15)]' : 'shadow-sm',
      text: 'text-cyan-400',
      hover: 'hover:bg-cyan-500/20',
      labelFocus: 'group-focus-within:text-cyan-400'
    },
    blue: {
      border: highlight ? 'border-blue-300' : 'border-white/60',
      ring: 'focus:ring-blue-500/30',
      shadow: highlight ? 'shadow-[0_4px_15px_rgba(37,99,235,0.15)]' : 'shadow-sm',
      text: 'text-blue-600',
      hover: 'hover:bg-blue-500/20',
      labelFocus: 'group-focus-within:text-blue-700'
    },
    rose: {
      border: highlight ? 'border-rose-300' : 'border-white/10',
      ring: 'focus:ring-rose-500/30',
      shadow: highlight ? 'shadow-[0_4px_15px_rgba(225,29,72,0.15)]' : 'shadow-sm',
      text: 'text-rose-400',
      hover: 'hover:bg-rose-500/20',
      labelFocus: 'group-focus-within:text-rose-500'
    }
  };

  const t = themeClasses[theme] || themeClasses.cyan;

  return (
    <div className="relative w-full group" ref={dropdownRef}>
      {label && (
        <label className={`block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 transition-colors ${t.labelFocus}`}>
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          className={`w-full appearance-none bg-slate-800/70 backdrop-blur-md border ${t.border} ${t.shadow} text-slate-100 rounded-2xl px-5 py-3 outline-none transition-all focus:ring-4 ${t.ring} font-bold cursor-text ${className}`}
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onClick={() => {
            setIsOpen(true);
            setSearchTerm(""); // Clear search to show all on click
          }}
        />
        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
          <svg className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
          </svg>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                  className={`px-4 py-3 rounded-xl cursor-pointer font-semibold transition-colors ${
                    String(opt.value) === String(value)
                      ? 'bg-white/10 text-white' 
                      : `text-slate-300 ${t.hover} hover:text-white`
                  }`}
                >
                  {opt.label}
                </div>
              ))
            ) : (
              <div className="px-4 py-3 text-slate-500 font-medium text-sm text-center">
                No se encontraron resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
