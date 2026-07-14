import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { ChargerStation, FreshnessStatus } from '../types';

interface Props {
  station: ChargerStation;
}

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

function badgeFor(station: ChargerStation): { label: string; className: string } {
  // freshness viene de D1; si falta (semilla estática), derivar del campo legado
  const freshness: FreshnessStatus = station.freshness
    ?? (station.verification === 'verified' ? 'verified'
      : station.verification === 'error' ? 'flagged' : 'pending');

  switch (freshness) {
    case 'verified': {
      const ago = station.lastConfirmedAt ? ` ${timeAgo(station.lastConfirmedAt)}` : '';
      const count = (station.confirmCount ?? 0) > 1 ? ` · ${station.confirmCount} confirmaciones` : '';
      return { label: `✓ Confirmada${ago}${count}`, className: 'bg-green-100 text-green-700' };
    }
    case 'stale':
      return { label: '⏳ Sin confirmar recientemente', className: 'bg-amber-100 text-amber-700' };
    case 'flagged':
      return { label: '⚠ Reportada con problemas por la comunidad', className: 'bg-red-100 text-red-700' };
    default:
      return { label: 'Sin verificar', className: 'bg-gray-100 text-gray-500' };
  }
}

export default function StationVerification({ station }: Props) {
  const stationId = station.id;
  const { authToken, currentUser, loadDynamicStations } = useStore();
  const [submitting, setSubmitting] = useState<'confirm' | 'gps' | 'error' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const badge = badgeFor(station);

  async function submit(body: { status: 'verified' | 'error'; lat?: number; lng?: number }, kind: 'confirm' | 'gps' | 'error') {
    setSubmitting(kind);
    setErrorMsg(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/stations/${stationId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      const data = await res.json() as { applied?: boolean };
      setMessage(data.applied
        ? (body.status === 'verified'
          ? '¡Gracias! Tu confirmación ya está en el mapa.'
          : 'Gracias por el reporte — quedó registrado para la comunidad.')
        : 'Gracias — tu corrección fue enviada y un administrador la revisará antes de publicarla.');
      await loadDynamicStations();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al enviar');
    } finally {
      setSubmitting(null);
    }
  }

  function handleGpsCorrect() {
    if (!navigator.geolocation) {
      setErrorMsg('Tu dispositivo no soporta geolocalización');
      return;
    }
    setSubmitting('gps');
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (latitude < 13 || latitude > 18 || longitude < -93 || longitude > -88) {
          setErrorMsg('Ubicación fuera de Guatemala. Verifica que el GPS esté activo.');
          setSubmitting(null);
          return;
        }
        submit({ status: 'verified', lat: latitude, lng: longitude }, 'gps');
      },
      (err) => {
        setErrorMsg(err.code === 1
          ? 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.'
          : 'No se pudo obtener tu ubicación GPS.');
        setSubmitting(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <div className="px-4 py-3 border-b border-gray-100 space-y-2">
      <span className={`inline-block text-[10px] px-2 py-1 rounded-full font-medium ${badge.className}`}>
        {badge.label}
      </span>

      {currentUser ? (
        <div className="flex flex-col gap-1.5 pt-1">
          <p className="text-[10px] text-gray-400">¿Estás físicamente en esta estación?</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => submit({ status: 'verified' }, 'confirm')}
              disabled={submitting !== null}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {submitting === 'confirm' ? 'Enviando…' : '✓ Confirmar que está bien'}
            </button>
            <button
              onClick={handleGpsCorrect}
              disabled={submitting !== null}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {submitting === 'gps' ? 'Obteniendo GPS…' : '📍 Corregir con mi GPS'}
            </button>
            <button
              onClick={() => submit({ status: 'error' }, 'error')}
              disabled={submitting !== null}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {submitting === 'error' ? 'Enviando…' : '⚠ Reportar error'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-gray-400">Inicia sesión para confirmar o corregir la ubicación.</p>
      )}

      {message && <p className="text-[10px] text-green-600">{message}</p>}
      {errorMsg && <p className="text-[10px] text-red-600">{errorMsg}</p>}
    </div>
  );
}
