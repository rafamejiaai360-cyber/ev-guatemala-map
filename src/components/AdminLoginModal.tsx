import { useState } from 'react';
import { useStore } from '../store/useStore';

export default function AdminLoginModal() {
  const { setAdminLoginOpen, setAdminAuthenticated } = useStore();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Contraseña incorrecta');
        setPassword('');
        return;
      }
      setAdminAuthenticated(true);
      setAdminLoginOpen(false);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setAdminLoginOpen(false); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
        <div className="px-6 pt-6 pb-2 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Acceso de administrador</h2>
          <p className="text-xs text-gray-500 mt-1">Ingresa la contraseña para gestionar estaciones</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            placeholder="Contraseña"
            autoFocus
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400 text-center tracking-widest"
          />
          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? 'Verificando…' : 'Entrar'}
          </button>
          <button
            type="button"
            onClick={() => setAdminLoginOpen(false)}
            className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cancelar
          </button>
        </form>
      </div>
    </div>
  );
}
