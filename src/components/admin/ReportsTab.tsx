import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { ChargerStatus } from '../../types';
import { stationKind } from '../../utils/stationKind';
import { ADMIN_STATUS_OPTIONS } from '../../utils/stationStatus';

// Pestaña "Reportes" del panel (oct 2026, a pedido de Rafa): lo que los
// usuarios contestaron en "¿Cómo encontraste el punto de carga?". Un reporte
// nunca cambia la estación sola: el admin investiga (llama o va al lugar),
// elige el estado, escribe una nota opcional visible para usuarios y marca
// los reportes como revisados (evento report_resolved; nada se borra).

interface Report {
  id: number;
  kind: string;
  comment: string | null;
  email: string | null;
  name: string | null;
  anon: boolean;
  createdAt: string;
}
interface StationReports {
  id: string;
  name: string;
  type: string;
  access: string;
  zone: string;
  status: ChargerStatus;
  statusNote: string | null;
  statusUpdatedAt: string | null;
  statusSource: string | null;
  lastConfirmedAt: string | null;
  reports: Report[];
}

const KIND_LABEL: Record<string, { label: string; cls: string }> = {
  partial: { label: '⚠️ Funciona a medias', cls: 'bg-amber-50 text-amber-700' },
  broken: { label: '❌ No funciona', cls: 'bg-red-50 text-red-600' },
  blocked: { label: '🚫 No pude usarla', cls: 'bg-orange-50 text-orange-700' },
  gone: { label: '🗑️ Ya no existe', cls: 'bg-gray-100 text-gray-600' },
};


const KIND_NAME: Record<string, string> = { public: 'Pública', 'semi-public': 'Semi-pública', residential: 'Residencial' };

function sqlDate(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z');
}
// Fecha y hora de Guatemala
function fmt(s: string): string {
  return sqlDate(s).toLocaleString('es-GT', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Guatemala',
  });
}
function ago(s: string | null): string {
  if (!s) return 'nunca';
  const days = Math.floor((Date.now() - sqlDate(s).getTime()) / 86_400_000);
  return days <= 0 ? 'hoy' : days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

export default function ReportsTab() {
  const { authToken, loadDynamicStations } = useStore();
  const [rows, setRows] = useState<StationReports[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function fetchRows(): Promise<StationReports[]> {
    const res = await fetch('/api/reports', { headers: { Authorization: `Bearer ${authToken}` } });
    const data = await res.json().catch(() => ({})) as StationReports[] | { error?: string };
    if (!res.ok || !Array.isArray(data)) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
    return data;
  }
  async function reload() {
    try { setRows(await fetchRows()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); }
  }
  useEffect(() => {
    let alive = true;
    fetchRows()
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo cargar'); });
    return () => { alive = false; };
  }, [authToken]);

  async function resolve(s: StationReports, status: ChargerStatus, note: string) {
    const res = await fetch(`/api/stations/${encodeURIComponent(s.id)}/reports/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ status, note }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
    const label = ADMIN_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
    setMsg(`"${s.name}" revisada: ${label}`);
    setTimeout(() => setMsg(null), 5000);
    await reload();
    void loadDynamicStations();
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <p className="text-sm text-gray-400">Cargando reportes…</p>;

  return (
    <div className="space-y-3">
      {msg && <p className="text-xs text-green-700 bg-green-50 rounded-xl px-3 py-2">✓ {msg}</p>}
      {rows.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center">
          <p className="text-sm text-gray-700 font-medium">No hay reportes sin revisar</p>
          <p className="text-xs text-gray-400 mt-1">Cuando un usuario diga que una estación funciona a medias, no funciona, no pudo usarla o ya no existe, aparecerá aquí y te llegará un aviso a Telegram.</p>
        </div>
      )}
      {rows.map((s) => <StationReportCard key={s.id} s={s} onResolve={resolve} />)}
    </div>
  );
}

function StationReportCard({ s, onResolve }: {
  s: StationReports;
  onResolve: (s: StationReports, status: ChargerStatus, note: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<ChargerStatus>(s.status);
  const [note, setNote] = useState(s.statusNote ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const counts = s.reports.reduce<Record<string, number>>((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }), {});
  const kind = stationKind({ type: s.type as 'public' | 'residential', access: s.access as 'public' });

  async function submit() {
    setBusy(true); setErr(null);
    try { await onResolve(s, status, status === 'active' ? '' : note); }
    catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo guardar'); setBusy(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{s.name}</div>
          <div className="text-xs text-gray-400">{KIND_NAME[kind]} · {s.zone} · {s.id}</div>
          <div className="text-xs text-gray-500 mt-1">
            Estado actual: <b>{ADMIN_STATUS_OPTIONS.find((o) => o.value === s.status)?.label ?? s.status}</b>
            {s.statusNote ? ` — “${s.statusNote}”` : ''} · Última carga confirmada: {ago(s.lastConfirmedAt)}
          </div>
        </div>
        <span className="text-xs font-semibold bg-red-50 text-red-600 rounded-full px-2.5 py-1 flex-shrink-0">
          {s.reports.length} sin revisar
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(counts).map(([k, n]) => (
          <span key={k} className={`text-xs rounded-full px-2.5 py-1 ${KIND_LABEL[k]?.cls ?? 'bg-gray-100 text-gray-600'}`}>
            {KIND_LABEL[k]?.label ?? k} · {n}
          </span>
        ))}
      </div>

      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
        {s.reports.map((r) => (
          <li key={r.id} className="px-3 py-2 text-xs">
            <div className="flex flex-wrap justify-between gap-x-3">
              <span className="font-medium text-gray-800">{KIND_LABEL[r.kind]?.label ?? r.kind}</span>
              <span className="text-gray-400">{fmt(r.createdAt)}</span>
            </div>
            <div className="text-gray-500">
              {r.anon ? 'Visitante sin cuenta' : `${r.name ?? ''} ${r.email ? `(${r.email})` : ''}`}
            </div>
            {r.comment && <div className="text-gray-700 mt-0.5">“{r.comment}”</div>}
          </li>
        ))}
      </ul>

      <div className="grid gap-2 sm:grid-cols-[220px_1fr]">
        <div>
          <label htmlFor={`rs-status-${s.id}`} className="block text-xs font-medium text-gray-700 mb-1">Estado tras revisar</label>
          <select id={`rs-status-${s.id}`} value={status} onChange={(e) => setStatus(e.target.value as ChargerStatus)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2">
            {ADMIN_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`rs-note-${s.id}`} className="block text-xs font-medium text-gray-700 mb-1">
            Nota para usuarios (opcional, máx. 140)
          </label>
          <input id={`rs-note-${s.id}`} type="text" maxLength={140} value={status === 'active' ? '' : note}
            disabled={status === 'active'} onChange={(e) => setNote(e.target.value)}
            placeholder={status === 'active' ? 'Activa no lleva nota' : 'Ej.: "CCS2 dañado, Tipo 2 funciona"'}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2" />
        </div>
      </div>
      {status === 'gone' && (
        <p className="text-xs text-amber-700">La estación saldrá del mapa. Queda guardada y puedes volver a ponerle otro estado desde la pestaña Estaciones.</p>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex justify-end">
        <button type="button" disabled={busy} onClick={submit}
          className="text-sm font-medium px-4 py-2 rounded-xl bg-green-600 text-white disabled:opacity-50">
          {busy ? 'Guardando…' : 'Guardar estado y marcar como revisado'}
        </button>
      </div>
    </div>
  );
}
