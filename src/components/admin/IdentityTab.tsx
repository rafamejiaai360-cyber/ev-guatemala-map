import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  fetchIdentityFile, identityAction, listIdentity,
  type IdentityKind, type IdentitySubmission,
} from '../../utils/identityApi';
import { makeZip } from '../../utils/zip';

const KINDS: { kind: IdentityKind; label: string; file: string }[] = [
  { kind: 'dpi_front', label: 'DPI frente', file: '1-DPI-frente' },
  { kind: 'dpi_back', label: 'DPI reverso', file: '2-DPI-reverso' },
  { kind: 'selfie', label: 'Selfie con DPI', file: '3-selfie-con-DPI' },
  { kind: 'car', label: 'Carro y placa', file: '4-carro-placa' },
];

const STATUS: Record<IdentitySubmission['status'], { label: string; cls: string }> = {
  pending: { label: 'Por revisar', cls: 'bg-amber-50 text-amber-700' },
  verified: { label: 'Aprobada', cls: 'bg-green-50 text-green-700' },
  rejected: { label: 'Rechazada', cls: 'bg-red-50 text-red-600' },
  expired: { label: 'Venció sin revisar', cls: 'bg-gray-100 text-gray-500' },
};

function sqlDate(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z');
}
function fmt(s: string): string {
  return sqlDate(s).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysLeft(s: string): number {
  return Math.max(0, Math.ceil((sqlDate(s).getTime() - Date.now()) / 86_400_000));
}
function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'usuario';
}

// Pestaña "Identidad" del panel (oct 2026): revisar las verificaciones de
// los conductores (DPI, selfie con DPI, carro con placa), aprobarlas o
// rechazarlas y "Descargar y borrar": baja las 4 fotos en un .zip para
// guardarlas en la nube privada del admin y borra las del DPI de la app. Si
// no se descargan, la app las borra sola a los 7 días.
export default function IdentityTab() {
  const { authToken } = useStore();
  const [rows, setRows] = useState<IdentitySubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await listIdentity(authToken));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    }
  }
  useEffect(() => {
    let alive = true;
    listIdentity(authToken)
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo cargar'); });
    return () => { alive = false; };
  }, [authToken]);

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(null), 6000); }

  if (error) return <p className="text-xs text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>;
  if (!rows) return <p className="text-sm text-gray-400 py-6 text-center">Cargando…</p>;

  const pending = rows.filter((r) => r.status === 'pending');
  const stored = rows.filter((r) => r.status !== 'pending' && r.filesStatus === 'stored');
  const history = rows.filter((r) => r.status !== 'pending' && r.filesStatus !== 'stored');

  return (
    <div className="space-y-8">
      {msg && <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-2">✓ {msg}</div>}

      <div className="text-xs text-gray-600 bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-1">
        <p><b>Cómo guardar las fotos de forma segura:</b> usa "Descargar y borrar" y guarda el .zip en tu carpeta privada de iCloud (con la Protección avanzada de datos activada).</p>
        <p>Nunca dentro de la carpeta del proyecto del mapa. Si no las descargas, la app borra las fotos del DPI sola a los 7 días.</p>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Por revisar ({pending.length})</h3>
        <p className="text-xs text-gray-400 mb-3">Compara la cara de la selfie con la del DPI, y la placa escrita con la de la foto del carro.</p>
        {pending.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-500">Sin verificaciones pendientes</div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => <SubmissionCard key={r.id} row={r} defaultOpen onChanged={load} flash={flash} />)}
          </div>
        )}
      </section>

      {stored.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Resueltas, con fotos aún en la app ({stored.length})</h3>
          <p className="text-xs text-gray-400 mb-3">Descárgalas a tu nube y bórralas de la app.</p>
          <div className="space-y-3">
            {stored.map((r) => <SubmissionCard key={r.id} row={r} onChanged={load} flash={flash} />)}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Historial</h3>
          <p className="text-xs text-gray-400 mb-3">Las fotos del DPI ya no están en la app. Solo queda el registro.</p>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {history.map((r) => (
              <div key={r.id} className="px-3 py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 truncate">{r.name ?? r.email} <span className="text-gray-400">· {r.plate}</span></p>
                  <p className="text-[11px] text-gray-400 truncate">
                    Enviada el {fmt(r.createdAt)}
                    {r.filesDeletedAt && ` · fotos ${r.filesStatus === 'deleted' ? 'descargadas y borradas' : 'borradas por vencimiento'} el ${fmt(r.filesDeletedAt)}`}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SubmissionCard({ row, defaultOpen = false, onChanged, flash }: {
  row: IdentitySubmission; defaultOpen?: boolean; onChanged: () => Promise<void>; flash: (t: string) => void;
}) {
  const { authToken } = useStore();
  const [open, setOpen] = useState(defaultOpen);
  const [urls, setUrls] = useState<Partial<Record<IdentityKind, string>>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [plate, setPlate] = useState(row.plate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const created = useRef<string[]>([]);
  const filesHere = row.filesStatus === 'stored';

  // Las fotos se piden con la sesión del admin (no son enlaces públicos) y se
  // muestran desde la memoria del navegador; se liberan al cerrar la pestaña.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const kinds = KINDS.filter((k) => filesHere || k.kind === 'car');
    Promise.all(kinds.map(async (k) => [k.kind, URL.createObjectURL(await fetchIdentityFile(authToken, row.id, k.kind))] as const))
      .then((pairs) => {
        created.current.push(...pairs.map(([, u]) => u));
        if (alive) setUrls(Object.fromEntries(pairs));
      })
      .catch((e) => { if (alive) setPhotoError(e instanceof Error ? e.message : 'No se pudieron cargar las fotos'); });
    return () => { alive = false; };
  }, [open, authToken, row.id, filesHere]);
  useEffect(() => () => { created.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  async function run(action: 'approve' | 'reject', body: { note?: string; plate?: string }, done: string) {
    setBusy(true);
    setError(null);
    try {
      await identityAction(authToken, row.id, action, body);
      flash(done);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar');
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    const note = window.prompt(
      'Motivo del rechazo (lo verá el usuario):',
      'Las fotos no se ven claras o no coinciden. Envíalas de nuevo, por favor.',
    );
    if (note === null) return;
    run('reject', { note }, `Verificación de ${row.name ?? row.email} rechazada`);
  }

  async function downloadAndDelete() {
    setBusy(true);
    setError(null);
    try {
      const files = await Promise.all(KINDS.map(async (k) => ({
        name: `${k.file}${k.kind === 'car' ? `-${row.plate}` : ''}.jpg`,
        blob: await fetchIdentityFile(authToken, row.id, k.kind),
      })));
      const zip = await makeZip(files);
      const zipName = `verificacion-identidad-${slug(row.name ?? row.email)}-${new Date().toISOString().slice(0, 10)}.zip`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zip);
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);

      const ok = window.confirm(
        `Se descargó "${zipName}".\n\n` +
        'Revisa que el archivo abra bien y guárdalo en tu carpeta privada de iCloud.\n\n' +
        '¿Borrar ahora de la app las fotos del DPI y la selfie? (La foto del carro se queda.)',
      );
      if (!ok) { setBusy(false); return; }
      await identityAction(authToken, row.id, 'purge');
      flash(`Fotos del DPI de ${row.name ?? row.email} borradas de la app`);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar');
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {row.name ?? 'Sin nombre'}
            <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS[row.status].cls}`}>{STATUS[row.status].label}</span>
          </p>
          <p className="text-xs text-gray-600 mt-0.5 break-all">{row.email}{row.phone && ` · ${row.phone}`}</p>
          <p className="text-xs text-gray-600 mt-0.5">Placa: <b>{row.plate}</b> · Enviada el {fmt(row.createdAt)}</p>
          {filesHere && (
            <p className="text-[11px] text-amber-700 mt-1">
              Las fotos del DPI se borran solas el {fmt(row.expiresAt)} (en {daysLeft(row.expiresAt)} día{daysLeft(row.expiresAt) === 1 ? '' : 's'}).
            </p>
          )}
          {row.reviewNote && <p className="text-[11px] text-gray-500 mt-1">Motivo: {row.reviewNote}</p>}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs px-2.5 py-1.5 h-fit rounded-lg border border-gray-200 text-gray-700 flex-shrink-0">
          {open ? 'Ocultar fotos' : 'Ver fotos'}
        </button>
      </div>

      {open && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {KINDS.filter((k) => filesHere || k.kind === 'car').map((k) => (
            <button key={k.kind} type="button" onClick={() => urls[k.kind] && setZoom(urls[k.kind]!)} className="text-left">
              <div className="aspect-[4/3] rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-[11px] text-gray-400">
                {urls[k.kind] ? <img src={urls[k.kind]} alt={k.label} className="w-full h-full object-cover" /> : photoError ? '—' : 'Cargando…'}
              </div>
              <span className="block text-[11px] text-gray-600 mt-1">{k.label}</span>
            </button>
          ))}
          {photoError && <p className="col-span-full text-xs text-red-600">{photoError}</p>}
        </div>
      )}

      {row.status === 'pending' && (
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1" htmlFor={`plate-${row.id}`}>Placa (corrígela si no coincide con la foto)</label>
          <input id={`plate-${row.id}`} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
            className="w-40 px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-green-500 uppercase" />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {row.status === 'pending' && (
          <>
            <button disabled={busy} onClick={() => run('approve', { plate }, `Identidad de ${row.name ?? row.email} aprobada`)}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium disabled:opacity-50">Aprobar</button>
            <button disabled={busy} onClick={reject}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium disabled:opacity-50">Rechazar</button>
          </>
        )}
        {filesHere && (
          <button disabled={busy} onClick={downloadAndDelete}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-50">
            {busy ? 'Procesando…' : 'Descargar y borrar'}
          </button>
        )}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
