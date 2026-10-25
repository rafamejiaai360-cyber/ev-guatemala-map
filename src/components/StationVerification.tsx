import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { ChargerStation } from '../types';

interface Props {
  station: ChargerStation;
}

// "¿Cómo encontraste el punto de carga?" (oct 2026, a pedido de Rafa).
// Reportar es de un toque y no exige cuenta. Un reporte NUNCA cambia el estado
// de la estación: llega al admin (Telegram + pestaña "Reportes" del panel),
// que investiga y decide. Mientras haya reportes sin revisar la ficha muestra
// una nota discreta; antes, 2 reportes la marcaban en rojo sola (ya no).
const OPTIONS: { kind: string; label: string }[] = [
  { kind: 'ok', label: '✅ Cargué bien' },
  { kind: 'partial', label: '⚠️ Funciona a medias' },
  { kind: 'broken', label: '❌ No funciona' },
  { kind: 'blocked', label: '🚫 No pude usarla' },
  { kind: 'gone', label: '🗑️ Ya no existe' },
];

// "hace 3 días", "hace 2 meses" — a partir del timestamp UTC de D1
function timeAgo(sqlUtc: string): string {
  const then = Date.parse(sqlUtc.replace(' ', 'T') + (sqlUtc.endsWith('Z') ? '' : 'Z'));
  if (isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  if (days < 60) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return `hace ${months} meses`;
}

function confirmedLabel(station: ChargerStation): string | null {
  if (!station.lastConfirmedAt) return null;
  const count = (station.confirmCount ?? 0) > 1 ? ` · ${station.confirmCount} confirmaciones` : '';
  return `✓ Confirmada ${timeAgo(station.lastConfirmedAt)}${count}`;
}

export default function StationVerification({ station }: Props) {
  const { authToken, currentUser, loadDynamicStations } = useStore();
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<{ kind: string; reportId: number; token: string } | null>(null);
  const [detail, setDetail] = useState('');
  const [detailSent, setDetailSent] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  async function report(kind: string) {
    setSending(kind); setErrorMsg(null);
    try {
      const res = await fetch(`/api/stations/${encodeURIComponent(station.id)}/report`, {
        method: 'POST', headers, body: JSON.stringify({ kind }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; reportId?: number; token?: string };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setSent({ kind, reportId: data.reportId!, token: data.token! });
      void loadDynamicStations();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setSending(null);
    }
  }

  async function sendDetail() {
    if (!sent || !detail.trim()) return;
    setSending('detail'); setErrorMsg(null);
    try {
      const res = await fetch(`/api/stations/${encodeURIComponent(station.id)}/report`, {
        method: 'POST', headers,
        body: JSON.stringify({ reportId: sent.reportId, token: sent.token, comment: detail.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setDetailSent(true);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setSending(null);
    }
  }

  // Corrección de ubicación con GPS (solo con cuenta): sigue pasando por
  // moderación como siempre (POST /verify con lat/lng).
  function handleGpsCorrect() {
    if (!navigator.geolocation) { setErrorMsg('Tu dispositivo no soporta geolocalización'); return; }
    setGpsBusy(true); setErrorMsg(null); setMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        if (latitude < 13 || latitude > 18 || longitude < -93 || longitude > -88) {
          setErrorMsg('Ubicación fuera de Guatemala. Verifica que el GPS esté activo.');
          setGpsBusy(false);
          return;
        }
        try {
          const res = await fetch(`/api/stations/${encodeURIComponent(station.id)}/verify`, {
            method: 'POST', headers, body: JSON.stringify({ status: 'verified', lat: latitude, lng: longitude }),
          });
          const data = await res.json().catch(() => ({})) as { error?: string; applied?: boolean };
          if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
          setMessage(data.applied
            ? 'Ubicación corregida.'
            : 'Gracias. Tu corrección de ubicación la revisará un administrador antes de publicarla.');
          if (data.applied) void loadDynamicStations();
        } catch (e) {
          setErrorMsg(e instanceof Error ? e.message : 'Error al enviar');
        } finally {
          setGpsBusy(false);
        }
      },
      (err) => {
        setErrorMsg(err.code === 1
          ? 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.'
          : 'No se pudo obtener tu ubicación GPS.');
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const confirmed = confirmedLabel(station);
  const stale = station.freshness === 'stale';

  return (
    <div className="m-report">
      {(station.openReports ?? 0) > 0 && (
        <div className="m-report-note">
          <b>Hay reportes recientes</b>
          <small>Estamos verificando el estado de esta estación.</small>
        </div>
      )}

      <p className="m-report-q">¿Cómo encontraste el punto de carga?</p>

      {!sent ? (
        <div className="m-report-opts">
          {OPTIONS.map((o) => (
            <button
              key={o.kind}
              type="button"
              disabled={sending !== null}
              onClick={() => report(o.kind)}
            >
              {sending === o.kind ? 'Enviando…' : o.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="m-report-done">
          <p>
            {sent.kind === 'ok'
              ? '¡Gracias! Ayudas a que otros conductores sepan que funciona.'
              : 'Gracias. Tu reporte le llegó al administrador, que lo va a revisar.'}
          </p>
          {sent.kind !== 'ok' && !detailSent && (
            <>
              <textarea
                id={`report-detail-${station.id}`}
                rows={2}
                maxLength={280}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder='¿Quieres agregar un detalle? Opcional. Ej.: "el conector CCS2 está quebrado"'
              />
              <button type="button" className="m-btn ghost" disabled={!detail.trim() || sending !== null} onClick={sendDetail}>
                {sending === 'detail' ? 'Enviando…' : 'Enviar detalle'}
              </button>
            </>
          )}
          {detailSent && <p>Detalle enviado.</p>}
        </div>
      )}

      <div className="m-report-foot">
        {confirmed && <span className="ok">{confirmed}</span>}
        {!confirmed && <span>{stale ? 'Sin confirmar recientemente' : 'Nadie la ha confirmado todavía'}</span>}
        {currentUser && (
          <button type="button" onClick={handleGpsCorrect} disabled={gpsBusy}>
            {gpsBusy ? 'Obteniendo GPS…' : '📍 Corregir ubicación con mi GPS'}
          </button>
        )}
      </div>

      {message && <p className="m-report-msg">{message}</p>}
      {errorMsg && <p className="m-report-msg err">{errorMsg}</p>}
    </div>
  );
}
