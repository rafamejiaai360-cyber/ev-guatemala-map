import { useState } from 'react';
import { useStore } from '../store/useStore';

export default function ProfileModal() {
  const { currentUser, setProfileModalOpen, updateProfile, changePassword } = useStore();
  const [name, setName] = useState(currentUser?.name ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  if (!currentUser) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!name.trim()) { setError('El nombre es requerido'); return; }
    const phoneDigits = phone.replace(/[^\d]/g, '').replace(/^502/, '');
    if (!/^\d{8}$/.test(phoneDigits)) { setError('El teléfono debe tener 8 dígitos (ej. 5512-3456)'); return; }
    setLoading(true);
    try {
      await updateProfile(name.trim(), phoneDigits);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (!currentPassword || !newPassword) { setPasswordError('Completa todos los campos'); return; }
    if (newPassword.length < 6) { setPasswordError('La nueva contraseña debe tener al menos 6 caracteres'); return; }
    if (newPassword !== confirmNewPassword) { setPasswordError('Las contraseñas no coinciden'); return; }
    setPasswordLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Error al cambiar la contraseña');
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setProfileModalOpen(false); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-gray-100">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-white text-lg font-semibold ${currentUser.role === 'admin' ? 'bg-green-600' : 'bg-blue-500'}`}>
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-base font-semibold text-gray-900">Mi perfil</h2>
          {currentUser.role === 'admin' && (
            <span className="inline-block mt-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Admin</span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre y apellido</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setSuccess(false); }}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={currentUser.email}
              disabled
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 text-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input
              type="tel"
              value={phone}
              onChange={e => { setPhone(e.target.value); setSuccess(false); }}
              placeholder="5512-3456"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
            />
            <p className="text-[10px] text-gray-400 mt-1">Nunca se muestra públicamente en el mapa.</p>
          </div>

          {currentUser.subscriptionEnd && (
            <p className="text-[11px] text-green-600 font-medium">
              Suscripción activa hasta {new Date(currentUser.subscriptionEnd).toLocaleDateString('es-GT')}
            </p>
          )}

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">✓ Perfil actualizado</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>

        <div className="px-6 pb-5">
          <button
            type="button"
            onClick={() => { setShowPasswordForm(o => !o); setPasswordError(null); setPasswordSuccess(false); }}
            className="w-full py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
          >
            {showPasswordForm ? 'Cancelar cambio de contraseña' : 'Cambiar contraseña'}
          </button>

          {showPasswordForm && (
            <form onSubmit={handlePasswordSubmit} className="space-y-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña actual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => { setCurrentPassword(e.target.value); setPasswordError(null); setPasswordSuccess(false); }}
                  placeholder="••••••••"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nueva contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setPasswordError(null); setPasswordSuccess(false); }}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar nueva contraseña</label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={e => { setConfirmNewPassword(e.target.value); setPasswordError(null); setPasswordSuccess(false); }}
                  placeholder="Repite la nueva contraseña"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>
              {passwordError && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{passwordError}</p>}
              {passwordSuccess && <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">✓ Contraseña actualizada</p>}
              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {passwordLoading ? 'Guardando…' : 'Actualizar contraseña'}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => setProfileModalOpen(false)}
            className="w-full mt-3 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
