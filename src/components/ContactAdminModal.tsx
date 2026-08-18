import { useState } from 'react';
import { useStore } from '../store/useStore';

export default function ContactAdminModal() {
  const { setContactAdminModalOpen } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !email.includes('@')) { setError('Ingresa un email válido'); return; }
    const phoneDigits = phone.replace(/[^\d]/g, '').replace(/^502/, '');
    if (phone && !/^\d{8}$/.test(phoneDigits)) { setError('El teléfono debe tener 8 dígitos (ej. 5512-3456)'); return; }
    if (!message.trim()) { setError('Escribe tu mensaje'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/contact-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phoneDigits, message: message.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al enviar el mensaje');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar el mensaje');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setContactAdminModalOpen(false); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-gray-100">
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
            <span className="text-lg">📩</span>
          </div>
          <h2 className="text-base font-semibold text-gray-900">Contactar al administrador</h2>
          <p className="text-xs text-gray-400 mt-0.5">Patrocinios, consultas o cualquier otro motivo</p>
        </div>

        {success ? (
          <div className="px-6 py-6 text-center">
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              ✓ Mensaje enviado. Te contactaremos a {email} lo antes posible.
            </p>
            <button
              type="button"
              onClick={() => setContactAdminModalOpen(false)}
              className="w-full mt-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre <span className="font-normal text-gray-400">(opcional)</span></label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Tu nombre"
                autoFocus
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono <span className="font-normal text-gray-400">(opcional)</span></label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="5512-3456"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Cuéntanos en qué podemos ayudarte…"
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400 resize-none"
              />
            </div>
            {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? 'Enviando…' : 'Enviar mensaje'}
            </button>
            <button
              type="button"
              onClick={() => setContactAdminModalOpen(false)}
              className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
