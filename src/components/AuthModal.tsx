import { useState } from 'react';
import { useStore } from '../store/useStore';

type Tab = 'login' | 'register' | 'forgot';

export default function AuthModal() {
  const { setAuthModalOpen, loginUser, registerUser } = useStore();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function reset() { setError(null); setSuccess(null); }

  function switchTab(t: Tab) { setTab(t); reset(); }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (!email || !password) { setError('Completa todos los campos'); return; }
    setLoading(true);
    try {
      await loginUser(email, password);
      setAuthModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (!name.trim()) { setError('El nombre es requerido'); return; }
    if (!email) { setError('El email es requerido'); return; }
    const phoneDigits = phone.replace(/[^\d]/g, '').replace(/^502/, '');
    if (!/^\d{8}$/.test(phoneDigits)) { setError('El teléfono debe tener 8 dígitos (ej. 5512-3456)'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true);
    try {
      await registerUser(email, password, name.trim(), phoneDigits);
      setAuthModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  }

  function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    reset();
    setSuccess('Para recuperar tu contraseña, contacta al administrador del sistema. Esta función estará disponible próximamente con envío de correo automático.');
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setAuthModalOpen(false); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-gray-100">
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
            <span className="text-lg">⚡</span>
          </div>
          <h2 className="text-base font-semibold text-gray-900">EV Guatemala</h2>
          <p className="text-xs text-gray-400 mt-0.5">Plataforma de cargadores eléctricos</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === t
                  ? 'text-green-700 border-b-2 border-green-500 bg-green-50/50'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'login' ? 'Iniciar sesión' : 'Registrarse'}
            </button>
          ))}
        </div>

        <div className="px-6 py-5">

          {/* Login */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); reset(); }}
                  placeholder="tu@email.com"
                  autoFocus
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); reset(); }}
                  placeholder="••••••••"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {loading ? 'Entrando…' : 'Iniciar sesión'}
              </button>
              <button
                type="button"
                onClick={() => switchTab('forgot')}
                className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          )}

          {/* Register */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre y apellido</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); reset(); }}
                  placeholder="ej. María López"
                  autoFocus
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); reset(); }}
                  placeholder="tu@email.com"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); reset(); }}
                  placeholder="5512-3456"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">Nunca se muestra públicamente en el mapa.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); reset(); }}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar contraseña</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); reset(); }}
                  placeholder="Repite la contraseña"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {loading ? 'Creando cuenta…' : 'Crear cuenta'}
              </button>
            </form>
          )}

          {/* Forgot password */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-3">
              <p className="text-xs text-gray-500">
                Ingresa tu email y te enviaremos instrucciones para recuperar tu contraseña.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); reset(); }}
                  placeholder="tu@email.com"
                  autoFocus
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
              {success && <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{success}</p>}
              {!success && (
                <button
                  type="submit"
                  className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Enviar instrucciones
                </button>
              )}
              <button
                type="button"
                onClick={() => switchTab('login')}
                className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
              >
                ← Volver a iniciar sesión
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => setAuthModalOpen(false)}
            className="w-full mt-3 py-2 text-xs text-gray-300 hover:text-gray-500 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
