import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { ChargerStatus, MyStation } from '../../types';
import EditStationModal from '../EditStationModal';
import { Icon } from './shared';
import { timeAgo } from './ownerStatus';

// "Mis estaciones" (oct 2026): el dueño de un cargador ve los suyos, publica
// su estado al instante (activa / mantenimiento / fuera de servicio, con nota
// opcional), ve cuántos conductores pidieron usarlo y sugiere cambios (estos
// sí pasan por revisión del admin, como siempre).

const STATUS_OPTS: { value: ChargerStatus; label: string }[] = [
  { value: 'active', label: 'Activa' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'offline', label: 'Fuera de servicio' },
];

const APPROVAL_TEXT: Record<MyStation['approval'], string> = {
  active: 'Publicada',
  pending: 'En revisión',
  rejected: 'No aprobada',
};

export function MyStationsSection() {
  const { myStations } = useStore();
  if (!myStations || myStations.length === 0) return null;
  return (
    <>
      <div className="m-sect">Mis estaciones</div>
      <div className="m-mine-list">
        {myStations.map((s) => <MyStationCard key={s.id} s={s} />)}
      </div>
    </>
  );
}

function MyStationCard({ s }: { s: MyStation }) {
  const { publishStationStatus, stations, setContactAdminModalOpen, loadMyStations } = useStore();
  const [draft, setDraft] = useState<ChargerStatus | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const live = stations.find((x) => x.id === s.id) ?? null;

  async function publish(status: ChargerStatus, n: string) {
    setBusy(true); setMsg(null);
    try {
      await publishStationStatus(s.id, status, n);
      setDraft(null);
      setMsg('Listo, los conductores ya lo ven en el mapa.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  function pick(status: ChargerStatus) {
    setMsg(null);
    if (status === 'active') {
      if (s.status !== 'active') void publish('active', '');
      setDraft(null);
      return;
    }
    setDraft(status);
    setNote(status === s.status ? (s.statusNote ?? '') : '');
  }

  const shown = draft ?? s.status;
  return (
    <div className="m-mine">
      <div className="m-mine-h">
        <span className={`ic${s.type === 'residential' ? ' b' : ''}`}>{s.type === 'residential' ? Icon.house : Icon.pin}</span>
        <span className="t"><b>{s.name}</b><small>{s.zone}</small></span>
        <span className={`m-mine-ap ${s.approval}`}>{APPROVAL_TEXT[s.approval]}</span>
      </div>

      {s.approval === 'pending' && (
        <p className="m-mine-p">Un administrador la revisará pronto. Te avisaremos aquí cuando esté publicada.</p>
      )}
      {s.approval === 'rejected' && (
        <p className="m-mine-p">
          No se publicó en el mapa. <button type="button" className="m-linkbtn" onClick={() => setContactAdminModalOpen(true)}>Escríbenos</button> si crees que es un error.
        </p>
      )}

      {s.approval === 'active' && (
        <>
          <div className="m-mine-k">Estado de tu cargador</div>
          <div className="m-lights" role="group" aria-label="Estado de tu cargador">
            {STATUS_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`m-light ${o.value}`}
                aria-pressed={shown === o.value}
                disabled={busy}
                onClick={() => pick(o.value)}
              >
                <i />{o.label}
              </button>
            ))}
          </div>
          {draft && (
            <div className="m-mine-note">
              <input
                type="text"
                maxLength={140}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={draft === 'maintenance' ? 'Nota opcional, ej. "Vuelve el lunes"' : 'Nota opcional, ej. "Cambiando el cable"'}
                aria-label="Nota para los conductores"
              />
              <div className="m-mine-act">
                <button type="button" className="m-btn ghost" onClick={() => setDraft(null)} disabled={busy}>Cancelar</button>
                <button type="button" className={`m-btn primary pub ${draft}`} onClick={() => publish(draft, note)} disabled={busy}>
                  {busy ? 'Publicando…' : 'Publicar estado'}
                </button>
              </div>
            </div>
          )}
          {!draft && s.statusNote && s.status !== 'active' && <p className="m-mine-p">“{s.statusNote}”</p>}
          <p className="m-mine-s">
            {s.statusByOwner ? `Actualizado por ti ${timeAgo(s.statusUpdatedAt)}` : 'Toca el estado si tu cargador cambia; se publica al instante.'}
          </p>
          {msg && <p className="m-mine-msg">{msg}</p>}

          <div className="m-mine-stats">
            <span><b>{s.requests30d}</b>{s.requests30d === 1 ? ' conductor pidió usarla' : ' conductores pidieron usarla'} este mes</span>
            {s.requestsTotal > s.requests30d && <small>{s.requestsTotal} en total</small>}
          </div>
          {live && (
            <button type="button" className="m-linkbtn" onClick={() => setEditing(true)}>Sugerir cambios (horario, conectores, acceso…)</button>
          )}
        </>
      )}

      {editing && live && (
        <EditStationModal
          station={live}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); setMsg('Recibimos tus cambios; un administrador los revisará.'); void loadMyStations(); }}
        />
      )}
    </div>
  );
}

/** Recordatorio: "¿Tu cargador ya está activo?" (una vez por visita). */
export function StaleStatusSheetContent({ station, onDone }: { station: MyStation; onDone: () => void }) {
  const { publishStationStatus } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function answer(status: ChargerStatus, note: string) {
    setBusy(true); setErr(null);
    try {
      await publishStationStatus(station.id, status, note);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
      setBusy(false);
    }
  }
  const label = station.status === 'maintenance' ? 'en mantenimiento' : 'fuera de servicio';
  return (
    <>
      <div className="m-join-mark">{Icon.bolt}</div>
      <h3 className="m-join-h">¿Tu cargador ya está activo?</h3>
      <p className="s m-join-s">
        <b>{station.name}</b> aparece {label} desde {timeAgo(station.statusUpdatedAt)}. Avísanos para que los conductores vean la información correcta.
      </p>
      {err && <p className="m-mine-msg">{err}</p>}
      <button type="button" className="m-btn primary m-join-go" disabled={busy} onClick={() => answer('active', '')}>Sí, ya está activo</button>
      <button type="button" className="m-btn ghost m-join-alt" disabled={busy} onClick={() => answer(station.status, station.statusNote ?? '')}>
        Sigue {label}
      </button>
      <button type="button" className="m-cancel" onClick={onDone}>Ahora no</button>
    </>
  );
}
