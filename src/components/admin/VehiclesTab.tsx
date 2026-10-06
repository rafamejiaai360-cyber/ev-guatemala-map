import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { ConnectorType, Vehicle } from '../../types';

const CONNECTORS: { value: ConnectorType; label: string }[] = [
  { value: 'CCS2', label: 'CCS2' },
  { value: 'Type2', label: 'Tipo 2' },
  { value: 'J1772', label: 'J1772' },
  { value: 'CHAdeMO', label: 'CHAdeMO' },
  { value: 'GBT', label: 'GB/T' },
  { value: 'CCS1', label: 'CCS1' },
];
const connLabel = (c: string) => CONNECTORS.find((x) => x.value === c)?.label ?? c;

interface Proposal {
  id: number;
  vehicleId: string | null;
  data: { brand?: string; model?: string; year?: string; range_km?: number; battery_kwh?: number | null; connectors?: string[] };
  source?: string;
  submittedBy?: string;
  submitterName?: string;
  createdAt: string;
}

// Pestaña "Vehículos" del panel de admin (oct 2026): revisar lo que proponen
// los usuarios y mantener el catálogo de "Mi vehículo" (datos, ficha
// verificada, fotos). Solo el admin sube fotos.
export default function VehiclesTab() {
  const { authToken, vehicleCatalog, loadVehicles } = useStore();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/vehicle-proposals', { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (alive) { if (Array.isArray(rows)) setProposals(rows as Proposal[]); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [authToken]);

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(null), 5000); }

  async function resolve(p: Proposal, action: 'approve' | 'reject', verified = false) {
    let note: string | undefined;
    if (action === 'reject') note = window.prompt('Motivo (opcional, lo verá quien lo propuso):') ?? undefined;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/vehicle-proposals/${p.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ verified, note }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error');
      setProposals((cur) => cur.filter((x) => x.id !== p.id));
      await loadVehicles();
      flash(action === 'approve' ? `${p.data.brand} ${p.data.model} publicado${verified ? ' como ficha verificada' : ''}` : 'Propuesta rechazada');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error procesando la propuesta');
    } finally {
      setBusy(null);
    }
  }

  const q = query.trim().toLowerCase();
  const catalog = vehicleCatalog.filter((v) => !q || `${v.brand} ${v.model} ${v.year}`.toLowerCase().includes(q));

  return (
    <div className="space-y-8">
      {msg && <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-2">✓ {msg}</div>}

      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Propuestas de usuarios</h3>
        <p className="text-xs text-gray-400 mb-3">Autos nuevos o correcciones. "Aprobar como verificada" solo si confirmaste el dato con una fuente oficial.</p>
        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Cargando…</p>
        ) : proposals.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-500">Sin propuestas pendientes</div>
        ) : (
          <div className="space-y-2">
            {proposals.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {p.data.brand} {p.data.model} <span className="text-gray-400 font-normal">{p.data.year}</span>
                      {p.vehicleId && <span className="ml-2 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">Corrección</span>}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {p.data.range_km} km
                      {p.data.battery_kwh != null && ` · ${p.data.battery_kwh} kWh`}
                      {' · '}{p.data.connectors?.length ? p.data.connectors.map(connLabel).join(', ') : 'conector sin indicar'}
                    </p>
                    {p.source && <p className="text-xs text-gray-500 mt-1 break-words">Fuente: {p.source}</p>}
                    <p className="text-[11px] text-gray-400 mt-1">Propuesto por {p.submitterName ?? p.submittedBy} · {new Date(p.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('es-GT')}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button disabled={busy === p.id} onClick={() => resolve(p, 'approve', true)} className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium disabled:opacity-50">Aprobar como verificada</button>
                  <button disabled={busy === p.id} onClick={() => resolve(p, 'approve')} className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-50">Aprobar</button>
                  <button disabled={busy === p.id} onClick={() => resolve(p, 'reject')} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium disabled:opacity-50">Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Catálogo de vehículos</h3>
            <p className="text-xs text-gray-400">Lo que ven los usuarios en "Mi vehículo". Aquí cargas fichas oficiales y fotos.</p>
          </div>
          <button onClick={() => setEditing('new')} className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium flex-shrink-0">+ Agregar</button>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar marca o modelo"
          className="w-full mb-2 px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-green-500" />
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {catalog.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="w-14 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center text-gray-400 text-[10px]">
                {v.image_url ? <img src={v.image_url} alt="" className="w-full h-full object-cover" /> : 'Sin foto'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {v.brand} {v.model} <span className="text-gray-400 font-normal">{v.year}</span>
                  {v.verified && <span className="ml-2 text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full">Verificada</span>}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {v.range_km} km{v.battery_kwh != null && ` · ${v.battery_kwh} kWh`} · {v.compatible_connectors?.length ? v.compatible_connectors.map(connLabel).join(', ') : 'conector sin confirmar'}
                </p>
              </div>
              <button onClick={() => setEditing(v)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 flex-shrink-0">Editar</button>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <VehicleEditor
          vehicle={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (name) => { setEditing(null); await loadVehicles(); flash(`${name} guardado`); }}
        />
      )}
    </div>
  );
}

// Reduce la foto en el navegador (máx. 900 px de ancho, JPEG) para que pese
// poco y cargue rápido en la lista.
async function resizeImage(file: File): Promise<{ base64: string; mime: string }> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 900 / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: dataUrl.split(',')[1], mime: 'image/jpeg' };
}

function VehicleEditor({ vehicle, onClose, onSaved }: { vehicle: Vehicle | null; onClose: () => void; onSaved: (name: string) => void }) {
  const { authToken } = useStore();
  const [brand, setBrand] = useState(vehicle?.brand ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [year, setYear] = useState(vehicle?.year ?? String(new Date().getFullYear()));
  const [range, setRange] = useState(vehicle ? String(vehicle.range_km) : '');
  const [battery, setBattery] = useState(vehicle?.battery_kwh != null ? String(vehicle.battery_kwh) : '');
  const [connectors, setConnectors] = useState<ConnectorType[]>(vehicle?.compatible_connectors ?? []);
  const [adapterNote, setAdapterNote] = useState(vehicle?.adapter_note ?? '');
  const [verified, setVerified] = useState(!!vehicle?.verified);
  const [source, setSource] = useState(vehicle?.source ?? '');
  const [photo, setPhoto] = useState<{ base64: string; mime: string; preview: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const r = await resizeImage(file);
      setPhoto({ ...r, preview: `data:${r.mime};base64,${r.base64}` });
      setRemovePhoto(false);
    } catch {
      setError('No se pudo leer la imagen.');
    }
  }

  async function save(hide = false) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/vehicles/${vehicle?.id ?? 'new'}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          brand, model, year,
          range_km: Number(range),
          battery_kwh: battery === '' ? null : Number(battery.replace(',', '.')),
          connectors,
          adapter_note: adapterNote,
          verified,
          source,
          status: hide ? 'hidden' : 'visible',
          ...(photo ? { imageBase64: photo.base64, mimeType: photo.mime } : {}),
          ...(removePhoto ? { removePhoto: true } : {}),
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar');
      onSaved(`${brand} ${model}${hide ? ' (oculto)' : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-green-500';
  const label = 'block text-xs font-medium text-gray-600 mb-1';
  const currentPhoto = photo?.preview ?? (removePhoto ? undefined : vehicle?.image_url);

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 bg-black/50 overflow-y-auto overscroll-contain"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto p-5 space-y-3">
        <div className="flex justify-between items-start">
          <h2 className="text-base font-semibold text-gray-900">{vehicle ? `Editar ${vehicle.brand} ${vehicle.model}` : 'Agregar vehículo'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 text-xl leading-none">×</button>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-28 h-20 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center text-xs text-gray-400">
            {currentPhoto ? <img src={currentPhoto} alt="" className="w-full h-full object-cover" /> : 'Sin foto'}
          </div>
          <div className="space-y-1.5">
            <label className="inline-block text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium cursor-pointer">
              {currentPhoto ? 'Cambiar foto' : 'Subir foto'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </label>
            {currentPhoto && (
              <button type="button" onClick={() => { setPhoto(null); setRemovePhoto(true); }} className="block text-xs text-red-600">Quitar foto</button>
            )}
            <p className="text-[11px] text-gray-400 max-w-[220px]">Usa solo fotos propias o con permiso de la marca o agencia.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="ve-brand">Marca</label><input id="ve-brand" className={input} value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
          <div><label className={label} htmlFor="ve-model">Modelo</label><input id="ve-model" className={input} value={model} onChange={(e) => setModel(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={label} htmlFor="ve-year">Año</label><input id="ve-year" className={input} value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" /></div>
          <div><label className={label} htmlFor="ve-range">Autonomía (km)</label><input id="ve-range" className={input} value={range} onChange={(e) => setRange(e.target.value)} inputMode="numeric" /></div>
          <div><label className={label} htmlFor="ve-batt">Batería (kWh)</label><input id="ve-batt" className={input} value={battery} onChange={(e) => setBattery(e.target.value)} inputMode="decimal" /></div>
        </div>
        <div>
          <span className={label}>Conectores</span>
          <div className="flex flex-wrap gap-1.5">
            {CONNECTORS.map((c) => (
              <button key={c.value} type="button" aria-pressed={connectors.includes(c.value)}
                onClick={() => setConnectors((cur) => (cur.includes(c.value) ? cur.filter((x) => x !== c.value) : [...cur, c.value]))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium ${connectors.includes(c.value) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Vacío = sin confirmar (la app no filtra estaciones por compatibilidad con este auto).</p>
        </div>
        <div><label className={label} htmlFor="ve-note">Nota de adaptador (opcional)</label><input id="ve-note" className={input} value={adapterNote} onChange={(e) => setAdapterNote(e.target.value)} placeholder="Ej. Puerto GB/T, requiere adaptador" /></div>
        <div><label className={label} htmlFor="ve-src">Fuente</label><input id="ve-src" className={input} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ficha técnica de la agencia, enlace…" /></div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="accent-green-600 w-4 h-4" />
          Ficha verificada con fuente oficial
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button disabled={saving} onClick={() => save()} className="flex-1 py-2.5 rounded-full bg-green-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
          {vehicle && (
            <button disabled={saving} onClick={() => { if (window.confirm(`¿Ocultar ${vehicle.brand} ${vehicle.model} de la app?`)) save(true); }}
              className="px-4 py-2.5 rounded-full bg-red-50 text-red-600 text-sm font-semibold disabled:opacity-50">Ocultar</button>
          )}
        </div>
      </div>
    </div>
  );
}
