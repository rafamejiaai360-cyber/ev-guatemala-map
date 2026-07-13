import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { VerificationStatus } from '../types';

interface Props {
  stationId: string;
  verification?: VerificationStatus;
}

const BADGE: Record<VerificationStatus, { label: string; className: string }> = {
  verified: { label: 'Ubicación verificada', className: 'bg-green-100 text-green-700' },
  error: { label: 'Ubicación reportada errónea', className: 'bg-red-100 text-red-700' },
  pending: { label: 'Ubicación sin verificar', className: 'bg-gray-100 text-gray-500' },
};

export default function StationVerification({ stationId, verification }: Props) {
  const { authToken, currentUser, loadDynamicStations } = useStore();
  const [submitting, setSubmitting] = useState<'confirm' | 'gps' | 'error' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const status = verification ?? 'pending';
  const badge = BADGE[status];

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
      setMessage(body.status === 'verified' ? '¡Gracias! Ubicación confirmada.' : 'Gracias, lo revisaremos.');
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
