import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import type { ConnectorType, Vehicle } from '../types';

const CONNECTORS: { value: ConnectorType; label: string }[] = [
  { value: 'CCS2', label: 'CCS2' },
  { value: 'Type2', label: 'Tipo 2' },
  { value: 'J1772', label: 'J1772' },
  { value: 'CHAdeMO', label: 'CHAdeMO' },
  { value: 'GBT', label: 'GB/T' },
  { value: 'CCS1', label: 'CCS1' },
];

interface Props {
  /** Si viene, la propuesta es una corrección de ese modelo (se precarga). */
  base?: Vehicle | null;
  onClose: () => void;
}

// Propuesta de vehículo por un usuario: auto nuevo o corrección de uno del
// catálogo. Va a revisión del admin (pestaña "Vehículos" del panel); las
// fotos no se piden aquí — solo el admin sube fotos.
export default function VehicleProposalModal({ base, onClose }: Props) {
  const { currentUser, authToken, setAuthModalOpen } = useStore();
  const [brand, setBrand] = useState(base?.brand ?? '');
  const [model, setModel] = useState(base?.model ?? '');
  const [year, setYear] = useState(base?.year ?? String(new Date().getFullYear()));
  const [range, setRange] = useState(base?.range_km ? String(base.range_km) : '');
  const [battery, setBattery] = useState(base?.battery_kwh != null ? String(base.battery_kwh) : '');
  const [connectors, setConnectors] = useState<ConnectorType[]>(base?.compatible_connectors ?? []);
  const [source, setSource] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function toggle(c: ConnectorType) {
    setConnectors((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await fetch('/api/vehicle-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          vehicleId: base?.id,
          brand, model, year,
          range_km: Number(range),
          battery_kwh: battery === '' ? null : Number(battery.replace(',', '.')),
          connectors,
          source,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar la propuesta.');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la propuesta.');
    } finally {
      setSending(false);
    }
  }

  const input = 'w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-green-500 bg-white';
  const label = 'block text-xs font-medium text-gray-600 mb-1';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto overscroll-contain"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{base ? `Corregir ${base.brand} ${base.model}` : 'Proponer un vehículo'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Un administrador lo revisa antes de publicarlo.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 p-1 text-xl leading-none">×</button>
        </div>

        {!currentUser ? (
          <div className="px-5 py-6 space-y-3 text-center">
            <p className="text-sm text-gray-700">Necesitas una cuenta gratuita para proponer vehículos.</p>
            <button type="button" onClick={() => { onClose(); setAuthModalOpen(true); }}
              className="w-full py-2.5 rounded-full bg-green-600 text-white text-sm font-semibold">Ingresar o crear cuenta</button>
          </div>
        ) : sent ? (
          <div className="px-5 py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 mx-auto flex items-center justify-center text-xl">✓</div>
            <p className="text-sm font-semibold text-gray-900">¡Gracias! Tu propuesta está en revisión.</p>
            <p className="text-xs text-gray-500">Puedes ver su estado en Actividad.</p>
            <button type="button" onClick={onClose} className="w-full py-2.5 rounded-full bg-gray-900 text-white text-sm font-semibold">Listo</button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label} htmlFor="vp-brand">Marca *</label>
                <input id="vp-brand" className={input} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="BYD" required maxLength={40} /></div>
              <div><label className={label} htmlFor="vp-model">Modelo *</label>
                <input id="vp-model" className={input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Seagull" required maxLength={60} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={label} htmlFor="vp-year">Año *</label>
                <input id="vp-year" className={input} value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" pattern="(19|20)[0-9]{2}" required /></div>
              <div><label className={label} htmlFor="vp-range">Autonomía (km) *</label>
                <input id="vp-range" className={input} value={range} onChange={(e) => setRange(e.target.value)} inputMode="numeric" required placeholder="380" /></div>
              <div><label className={label} htmlFor="vp-batt">Batería (kWh)</label>
                <input id="vp-batt" className={input} value={battery} onChange={(e) => setBattery(e.target.value)} inputMode="decimal" placeholder="45,1" /></div>
            </div>
            <div>
              <span className={label}>Conector de carga</span>
              <div className="flex flex-wrap gap-1.5">
                {CONNECTORS.map((c) => (
                  <button key={c.value} type="button" onClick={() => toggle(c.value)} aria-pressed={connectors.includes(c.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${connectors.includes(c.value) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Marca todos los que tenga tu auto (por ejemplo CCS2 y Tipo 2). Si no estás seguro, déjalo vacío.</p>
            </div>
            <div><label className={label} htmlFor="vp-src">¿De dónde sale el dato? (opcional)</label>
              <input id="vp-src" className={input} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Enlace a la ficha técnica o “lo confirmé en la agencia”" maxLength={500} /></div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={sending}
              className="w-full py-2.5 rounded-full bg-green-600 text-white text-sm font-semibold disabled:opacity-50">
              {sending ? 'Enviando…' : 'Enviar a revisión'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
