import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SyncToast({ isSyncing, message, subMessage }) {
  return (
    <AnimatePresence>
      {isSyncing && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 999999 }}
          className="flex items-center gap-4 glass-panel px-6 py-4 rounded-2xl shadow-[0_10px_40px_rgba(16,185,129,0.4)] border border-emerald-500/50 bg-slate-900/95 backdrop-blur-2xl"
        >
          <div className="relative w-8 h-8 flex-shrink-0">
            <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-2 border-transparent border-t-emerald-500 rounded-full animate-spin"></div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-wide">{message}</span>
            <span className="text-xs font-medium text-slate-400">{subMessage}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
