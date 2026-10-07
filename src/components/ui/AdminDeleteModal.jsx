import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { deleteCloudDataByDate } from '../../services/fleetService.js';
import ErrorBanner from './ErrorBanner.jsx';
import AvailableDatePicker from './AvailableDatePicker.jsx';

export default function AdminDeleteModal({ isOpen, onClose, availableDates = [], onDeleted }) {
  const [date, setDate] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (!date) {
      setError('Seleccione una fecha.');
      return;
    }
    const confirmMsg = `⚠️ PELIGRO: ¿Está absolutamente seguro de querer BORRAR TODOS los datos de la nube (Tareas, Planillas y Telemetría) para la fecha ${date}? Esta acción no se puede deshacer.`;
    if (!window.confirm(confirmMsg)) return;

    setIsDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteCloudDataByDate(date);
      setSuccess(`Los datos de la fecha ${date} fueron eliminados exitosamente de la nube.`);
      setDate('');
      if (onDeleted) onDeleted();
    } catch (err) {
      console.error(err);
      setError('Ocurrió un error al intentar borrar los datos.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        
        {/* Modal */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-[#0b0a15] border border-rose-500/30 rounded-3xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(244,63,94,0.15)]"
        >
          <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 blur-3xl rounded-full -mt-20 -mr-20"></div>
          </div>
          
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h2 className="text-2xl font-black text-rose-400 flex items-center gap-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              Administración
            </h2>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <div className="relative z-10 space-y-6">
            <p className="text-slate-300 text-sm">
              Use esta herramienta para <strong>eliminar permanentemente</strong> todos los registros de Tareas, Planillas y Telemetría de una fecha específica en la nube.
            </p>

            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
            
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl text-sm font-bold flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
                {success}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fecha a eliminar (Nube)</label>
              <div className="w-full">
                <AvailableDatePicker 
                  value={date}
                  onChange={setDate}
                  availableDates={availableDates}
                  placeholder="Seleccionar fecha a borrar"
                />
              </div>
            </div>

            <button 
              onClick={handleDelete}
              disabled={isDeleting || !date}
              className="w-full relative group overflow-hidden bg-rose-600 hover:bg-rose-500 text-white font-extrabold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(225,29,72,0.4)]"
            >
              {isDeleting ? 'Borrando datos en la nube...' : 'Eliminar datos de la nube'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
