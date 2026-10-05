import { useState } from 'react';
import type { ChargerStation } from '../../types';
import { useStore } from '../../store/useStore';
import EditStationModal from '../EditStationModal';
import RequestUseModal from '../RequestUseModal';
import StationPhotos from '../StationPhotos';
import StationReviews from '../StationReviews';
import StationVerification from '../StationVerification';
import {
  ACCESS_LABEL, Icon, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL,
  connectorName, distanceKm, distanceLabel, formatKw, googleMapsUrl, levelName, stationType, wazeUrl,
} from './shared';

interface Props {
  station: ChargerStation;
  backLabel: string;
  onBack: () => void;
}

// Ficha completa de una estación en celular. Misma información y mismas
// reglas de privacidad que StationDetail.tsx (la vista de computadora):
// - `notes` de una residencial solo llega de la API si quien pregunta es admin.
// - quién dio de alta la estación solo se muestra a admins.
export default function StationScreen({ station, backLabel, onBack }: Props) {
  const { currentUser, userLocation, setAuthModalOpen, savedIds, toggleSaved, ratings } = useStore();
  const [showEdit, setShowEdit] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [showRequestUse, setShowRequestUse] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const t = stationType(station);
  const isResidential = t === 'residential';
  const saved = savedIds.includes(station.id);
  const dist = distanceLabel(distanceKm(station, userLocation));
  const rating = ratings[station.id];

  return (
    <>
      <div className="m-hero" style={{ ['--tint' as string]: isResidential ? 'var(--blue-soft)' : 'var(--green-soft)' }}>
        <div className="m-dbar">
          <button type="button" className="m-back" onClick={onBack}>{Icon.chevL}{backLabel}</button>
          <button
            type="button"
            className="m-save"
            aria-label={saved ? 'Quitar de guardadas' : 'Guardar estación'}
            aria-pressed={saved}
            onClick={() => toggleSaved(station.id)}
          >
            {Icon.star}
          </button>
        </div>
        <div className="m-eyebrow">
          <i style={{ background: TYPE_COLOR[t] }} />
          {TYPE_LABEL[t]}{dist && ` · ${dist}`}
        </div>
        <h2>{station.name}</h2>
        <p className="m-addr">
          {station.zone && !station.address.toLowerCase().includes(station.zone.toLowerCase())
            ? `${station.address} · ${station.zone}`
            : station.address}
        </p>
        <div className="m-pills">
          <span className={`m-pill ${station.status}`}>{STATUS_LABEL[station.status]}</span>
          <span className="m-pill soft">{ACCESS_LABEL[station.access] ?? station.access}</span>
          {station.network && <span className="m-pill soft">{station.network}</span>}
          {rating && rating.count > 0 && (
            <span className="m-pill soft">★ {rating.avg.toFixed(1).replace('.', ',')} · {rating.count} reseñas</span>
          )}
        </div>
        <div className="m-navs">
          <a className="m-nav" href={wazeUrl(station)} target="_blank" rel="noopener noreferrer">{Icon.nav}Waze</a>
          <a className="m-nav" href={googleMapsUrl(station, userLocation)} target="_blank" rel="noopener noreferrer">{Icon.pin}Google Maps</a>
        </div>
      </div>

      <div className="m-dbody">
        {isResidential && (
          <div className="m-box">
            <div className="k">Estación en una casa</div>
            <p className="m-note" style={{ margin: '0 0 10px' }}>
              Para usarla necesitas el permiso del dueño. Envía una solicitud y el administrador te pondrá en contacto.
            </p>
            {requestSent ? (
              <p className="m-note" style={{ color: 'var(--blue)', margin: 0 }}>Solicitud enviada. Un administrador te contactará pronto.</p>
            ) : (
              <button
                type="button"
                className="m-btn primary"
                style={{ width: '100%', background: 'var(--blue)' }}
                onClick={() => (currentUser ? setShowRequestUse(true) : setAuthModalOpen(true))}
              >
                {currentUser ? 'Solicitar uso de esta estación' : 'Ingresa para solicitar el uso'}
              </button>
            )}
          </div>
        )}

        <div className="m-box">
          <div className="k">Cargadores en esta estación ({station.connectors.length})</div>
          {station.connectors.map((c, i) => (
            <div className="m-conn" key={i}>
              <div>
                <b>{connectorName(c.type)}</b>
                <small>{c.power_kw ? `${formatKw(c.power_kw)} · ` : ''}{levelName(c)}</small>
              </div>
              <span className={`m-pill ${station.status}`}>{STATUS_LABEL[station.status]}</span>
            </div>
          ))}
        </div>

        <div className="m-box flush"><StationVerification station={station} /></div>
        <div className="m-box flush"><StationPhotos stationId={station.id} stationName={station.name} /></div>
        <div className="m-box flush"><StationReviews stationId={station.id} stationName={station.name} /></div>

        {station.notes && (
          isResidential ? (
            <div className="m-admin"><b>Solo admin · historial de verificación:</b> {station.notes}</div>
          ) : (
            <div className="m-box"><div className="k">Notas</div><p className="m-note" style={{ margin: 0 }}>{station.notes}</p></div>
          )
        )}

        {currentUser?.role === 'admin' && (station.createdByName || station.createdByEmail) && (
          <div className="m-admin">
            <b>Solo admin · dada de alta por:</b> {station.createdByName || 'Sin nombre'}
            {station.createdByEmail && <> · {station.createdByEmail}</>}
          </div>
        )}

        {currentUser && (
          <div className="m-box">
            <button type="button" className="m-linkbtn" onClick={() => { setEditMsg(null); setShowEdit(true); }}>
              {currentUser.role === 'admin' ? 'Editar estación' : 'Sugerir una corrección de datos'}
            </button>
            {editMsg && <p className="m-note" style={{ margin: '6px 0 0', color: 'var(--green)' }}>{editMsg}</p>}
          </div>
        )}
      </div>

      {showEdit && (
        <EditStationModal
          station={station}
          onClose={() => setShowEdit(false)}
          onSaved={(pending) => {
            setShowEdit(false);
            setEditMsg(pending
              ? 'Gracias. Tu propuesta fue enviada y un administrador la revisará antes de publicarla.'
              : 'Cambios guardados.');
          }}
        />
      )}
      {showRequestUse && (
        <RequestUseModal
          station={station}
          onClose={() => setShowRequestUse(false)}
          onSent={() => { setShowRequestUse(false); setRequestSent(true); }}
        />
      )}
    </>
  );
}
