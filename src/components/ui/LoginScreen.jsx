import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase.js';
import ErrorBanner from './ErrorBanner.jsx';
import { clearAllData } from '../../utils/storage.js';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await clearAllData();
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Correo o contraseña incorrectos.');
      } else {
        setError('Ocurrió un error al iniciar sesión.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full glass-panel p-8 rounded-[2rem] flex flex-col gap-6 relative overflow-hidden">
        {/* Blob decorativo */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-amber-400/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="text-center relative z-10">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-amber-400 mb-2">
            Dashboard Sotraurabá
          </h1>
          <p className="text-slate-400 text-sm font-medium">Control de Flotas e Inteligencia</p>
        </div>

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <form onSubmit={handleLogin} className="flex flex-col gap-4 relative z-10">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Correo Electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-slate-800/50 backdrop-blur-md border border-white/10 text-slate-100 rounded-2xl px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
              placeholder="usuario@sotrauraba.com.co"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-slate-800/50 backdrop-blur-md border border-white/10 text-slate-100 rounded-2xl px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full group relative flex items-center justify-center cursor-pointer bg-emerald-500/10 text-emerald-400 font-extrabold py-3 px-6 rounded-2xl transition-all hover:bg-emerald-500/20 hover:-translate-y-1 active:translate-y-0 border border-emerald-500/30 overflow-hidden text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Iniciando sesión...' : 'Ingresar al Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
