import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import type { ChargerStation, StationType } from '../../types';
import { getMyContributionStationIds } from '../../utils/myContributions';
import FilterBar from '../FilterBar';
import VehicleSelector from '../VehicleSelector';
import StationScreen from './StationScreen';
import StationCard from './StationCard';
import {
  Icon, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL,
  connectorTypes, distanceKm, distanceLabel, formatKw, googleMapsUrl, maxKw, stationType,
} from './shared';
import './mobile.css';

const EVMap = lazy(() => import('../Map'));

type Tab = 'map' | 'activity' | 'saved' | 'profile';
const BACK_LABEL: Record<Tab, string> = { map: 'Mapa', activity: 'Actividad', saved: 'Guardadas', profile: 'Perfil' };

// Navegación de la app (oct 2026), la misma en celular y computadora: barra inferior con 4 pestañas y botón
// central "Aportar", Mapa/Lista arriba, tarjeta flotante al tocar un pin y
// ficha completa. En pantallas anchas (>= 1024 px) mobile.css acomoda todo en
// una columna a la izquierda y deja el mapa visible a la derecha.
export default function MobileShell() {
  const {
    stations, filteredStations, filters, setFilters, selectedVehicle,
    selectedStationId, setSelectedStationId, userLocation, ratings, savedIds,
    currentUser, isAdminAuthenticated, setAuthModalOpen, openAddStation,
    setProfileModalOpen, setContactAdminModalOpen, setScanModalOpen, logoutUser,
  } = useStore();

  const [tab, setTab] = useState<Tab>('map');
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailFrom, setDetailFrom] = useState<string>('Mapa');
  const [sheet, setSheet] = useState<'none' | 'aportar' | 'filters'>('none');
  const [query, setQuery] = useState('');

  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const detailStation = detailId ? byId.get(detailId) ?? null : null;
  const peekStation = selectedStationId ? byId.get(selectedStationId) ?? null : null;
  const isAdmin = isAdminAuthenticated || currentUser?.role === 'admin';

  function openDetail(id: string) {
    setDetailFrom(tab === 'map' ? (mode === 'list' ? 'Lista' : 'Mapa') : BACK_LABEL[tab]);
    setDetailId(id);
  }
  function goTab(next: Tab) {
    setDetailId(null);
    setTab(next);
  }
  function changeMode(next: 'map' | 'list') {
    setMode(next);
    if (next === 'list') setSelectedStationId(null);
  }
  function startAdd(type: StationType) {
    setSheet('none');
    if (!currentUser) { setAuthModalOpen(true); return; }
    openAddStation(type);
  }

  // Filtros rápidos (chips). Los avanzados (conector, nivel, vehículo) viven
  // en la hoja "Filtros", que reutiliza FilterBar y VehicleSelector.
  const advancedCount =
    filters.connectorTypes.length +
    (filters.level !== 'all' ? 1 : 0) +
    (filters.status !== 'all' && filters.status !== 'active' ? 1 : 0) +
    (selectedVehicle ? 1 : 0);
  const allPressed = filters.status === 'all' && filters.stationType === 'all';
  const activeCount = stations.filter((s) => s.status === 'active').length;

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filteredStations
      .filter((s) => !q || [s.name, s.zone, s.address, s.network].some((f) => (f ?? '').toLowerCase().includes(q)))
      .map((s) => ({ s, km: distanceKm(s, userLocation) }))
      .sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : a.s.name.localeCompare(b.s.name)));
  }, [filteredStations, query, userLocation]);

  return (
    <div className="m-shell" data-mode={mode}>
      {/* ---------- Pestaña Mapa ---------- */}
      <section className={`m-view m-view-map${tab === 'map' ? ' on' : ''}${tab === 'map' && detailStation ? ' pushed' : ''}`} aria-hidden={tab !== 'map'}>
        <div className="m-mapwrap">
          <Suspense fallback={<div className="m-empty-line" style={{ paddingTop: '45vh' }}>Cargando mapa…</div>}>
            <EVMap variant="mobile" />
          </Suspense>
        </div>

        <div className="m-list m-scroll">
          <label className="m-search">
            {Icon.search}
            <input
              id="m-search"
              type="search"
              placeholder="Buscar por nombre, zona o red"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="m-lhead">
            {listed.length} {listed.length === 1 ? 'estación' : 'estaciones'} · {userLocation ? 'ordenadas por cercanía' : 'ordenadas por nombre'}
          </div>
          {listed.map(({ s, km }) => (
            <StationCard key={s.id} station={s} km={km} rating={ratings[s.id]} onOpen={openDetail} />
          ))}
          {listed.length === 0 && <div className="m-empty-line">No hay estaciones con estos filtros.</div>}
        </div>

        <div className="m-topfade" />
        <div className="m-topbar">
          <div className="m-brand m-glass"><i>{Icon.bolt}</i>EV Guatemala</div>
          <button
            type="button"
            className="m-count m-glass"
            onClick={() => { setFilters({ status: 'active' }); changeMode('list'); }}
          >
            <i /><span><b>{activeCount}</b> activas</span>{Icon.chevR}
          </button>
        </div>
        <div className="m-mode m-glass" data-v={mode} role="group" aria-label="Vista">
          <button type="button" aria-pressed={mode === 'map'} onClick={() => changeMode('map')}>{Icon.map}Mapa</button>
          <button type="button" aria-pressed={mode === 'list'} onClick={() => changeMode('list')}>{Icon.list}Lista</button>
        </div>
        <div className="m-chips">
          <button type="button" className="m-chip m-glass" aria-pressed={allPressed}
            onClick={() => setFilters({ status: 'all', stationType: 'all' })}>Todas</button>
          <button type="button" className="m-chip m-glass" aria-pressed={filters.status === 'active'}
            onClick={() => setFilters({ status: filters.status === 'active' ? 'all' : 'active' })}>
            <i style={{ background: '#22c55e' }} />Activas
          </button>
          <button type="button" className="m-chip m-glass" aria-pressed={filters.stationType === 'public'}
            onClick={() => setFilters({ stationType: filters.stationType === 'public' ? 'all' : 'public' })}>Públicas</button>
          <button type="button" className="m-chip m-glass" aria-pressed={filters.stationType === 'residential'}
            onClick={() => setFilters({ stationType: filters.stationType === 'residential' ? 'all' : 'residential' })}>
            <i style={{ background: '#3b82f6' }} />Residenciales
          </button>
          <button type="button" className="m-chip m-glass" aria-pressed={advancedCount > 0} onClick={() => setSheet('filters')}>
            {Icon.sliders}Filtros{advancedCount > 0 && <span className="n">{advancedCount}</span>}
          </button>
        </div>

        <Peek
          station={mode === 'map' ? peekStation : null}
          onOpen={openDetail}
        />
      </section>

      {/* ---------- Pestaña Actividad ---------- */}
      <section className={`m-view${tab === 'activity' ? ' on' : ''}${tab === 'activity' && detailStation ? ' pushed' : ''}`} aria-hidden={tab !== 'activity'}>
        {tab === 'activity' && <ActivityTab onAportar={() => setSheet('aportar')} onOpen={openDetail} />}
      </section>

      {/* ---------- Pestaña Guardadas ---------- */}
      <section className={`m-view${tab === 'saved' ? ' on' : ''}${tab === 'saved' && detailStation ? ' pushed' : ''}`} aria-hidden={tab !== 'saved'}>
        <div className="m-screen m-scroll">
          <div className="m-lt">Guardadas</div>
          <p className="m-sub">Tus estaciones de siempre, a un toque</p>
          {savedIds.map((id) => byId.get(id)).filter((s): s is ChargerStation => !!s).map((s) => (
            <StationCard key={s.id} station={s} km={distanceKm(s, userLocation)} rating={ratings[s.id]} onOpen={openDetail} />
          ))}
          {savedIds.filter((id) => byId.has(id)).length === 0 && (
            <div className="m-empty">
              <div className="art">{Icon.star}</div>
              <b>Nada guardado todavía</b>
              <p>Abre una estación y toca la estrella para tenerla aquí.</p>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Pestaña Perfil ---------- */}
      <section className={`m-view${tab === 'profile' ? ' on' : ''}${tab === 'profile' && detailStation ? ' pushed' : ''}`} aria-hidden={tab !== 'profile'}>
        <div className="m-screen m-scroll">
          <div className="m-lt">Perfil</div>
          <p className="m-sub">{currentUser ? 'Tu cuenta' : 'Ingresa para aportar al mapa'}</p>
          {currentUser ? (
            <>
              <div className="m-me">
                <div className="m-avatar">{currentUser.name.charAt(0).toUpperCase()}</div>
                <div><b>{currentUser.name}</b><small>{currentUser.email}</small></div>
              </div>
              <div className="m-sect">Datos</div>
              <div className="m-glist">
                <div className="r">Nombre<span>{currentUser.name}</span></div>
                <div className="r">Teléfono<span>{currentUser.phone || 'Sin registrar'}</span></div>
                <div className="r">Correo<span>{currentUser.email}</span></div>
                <button type="button" className="r accent" onClick={() => setProfileModalOpen(true)}>Editar perfil</button>
              </div>
            </>
          ) : (
            <button type="button" className="m-cta" onClick={() => setAuthModalOpen(true)}>
              <span className="ic">{Icon.user}</span>
              <span><b>Ingresar o crear cuenta</b><small>Para proponer estaciones, confirmar y dejar reseñas</small></span>
              <span className="go">{Icon.chevR}</span>
            </button>
          )}
          {isAdmin && (
            <>
              <div className="m-sect">Administración</div>
              <div className="m-glist">
                <a className="r" href="/admin">Panel de administrador<span>›</span></a>
                <button type="button" className="r" onClick={() => setScanModalOpen(true)}>Explorar red de cargadores<span>›</span></button>
              </div>
            </>
          )}
          <div className="m-sect">Ayuda</div>
          <div className="m-glist">
            <button type="button" className="r" onClick={() => setContactAdminModalOpen(true)}>Contáctanos<span>›</span></button>
          </div>
          {currentUser && (
            <>
              <div className="m-sect">&nbsp;</div>
              <div className="m-glist">
                <button type="button" className="r danger" onClick={logoutUser}>Cerrar sesión</button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ---------- Ficha completa ---------- */}
      <div className={`m-detail m-scroll${detailStation ? ' on' : ''}`} aria-hidden={!detailStation}>
        {detailStation && (
          <StationScreen key={detailStation.id} station={detailStation} backLabel={detailFrom} onBack={() => setDetailId(null)} />
        )}
      </div>

      {/* ---------- Barra inferior ---------- */}
      <nav className="m-tabbar m-glass" role="tablist" aria-label="Secciones">
        <TabButton label="Mapa" icon={Icon.map} selected={tab === 'map'} onClick={() => goTab('map')} />
        <TabButton label="Actividad" icon={Icon.activity} selected={tab === 'activity'} onClick={() => goTab('activity')} />
        <div className="m-fabwrap">
          <button type="button" className="m-fab" aria-label="Aportar al mapa" onClick={() => setSheet('aportar')}>{Icon.plus}</button>
          <span>Aportar</span>
        </div>
        <TabButton label="Guardadas" icon={Icon.star} selected={tab === 'saved'} onClick={() => goTab('saved')} />
        <TabButton label="Perfil" icon={Icon.user} selected={tab === 'profile'} onClick={() => goTab('profile')} />
      </nav>

      {/* ---------- Hojas ---------- */}
      <div className={`m-scrim${sheet !== 'none' ? ' on' : ''}`} onClick={() => setSheet('none')} />
      <div className={`m-sheet m-scroll${sheet === 'aportar' ? ' on' : ''}`} role="dialog" aria-label="Aportar al mapa" aria-hidden={sheet !== 'aportar'}>
        <div className="grab" />
        <h3>Aportar al mapa</h3>
        <p className="s">
          {currentUser ? 'Ayuda a otros conductores con información real.' : 'Necesitas una cuenta gratuita para aportar. Te pediremos ingresar.'}
        </p>
        <div className="m-opts">
          <button type="button" className="m-cta" onClick={() => startAdd('public')}>
            <span className="ic">{Icon.pin}</span>
            <span><b>Estación pública</b><small>En un comercio, parqueo o gasolinera</small></span>
            <svg className="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
          </button>
          <button type="button" className="m-cta" onClick={() => startAdd('residential')}>
            <span className="ic b">{Icon.house}</span>
            <span><b>Mi cargador en casa</b><small>Compártelo con otros conductores</small></span>
            <svg className="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
          </button>
          <button type="button" className="m-cta" onClick={() => { setSheet('none'); goTab('map'); changeMode('list'); }}>
            <span className="ic n">{Icon.check}</span>
            <span><b>Confirmar una estación</b><small>Elige una y avisa si funciona o tiene un problema</small></span>
            <svg className="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
        <button type="button" className="m-cancel" onClick={() => setSheet('none')}>Cancelar</button>
      </div>
      <div className={`m-sheet m-scroll${sheet === 'filters' ? ' on' : ''}`} role="dialog" aria-label="Filtros" aria-hidden={sheet !== 'filters'}>
        <div className="grab" />
        <h3>Filtros</h3>
        <p className="s">Muestra solo las estaciones que te sirven.</p>
        <div className="m-filters">
          <div><div className="lbl">Mi vehículo</div><VehicleSelector /></div>
          <div><div className="lbl">Tipo, estado, nivel y conector</div><FilterBar /></div>
        </div>
        <button type="button" className="m-cancel" onClick={() => setSheet('none')}>Listo</button>
      </div>
    </div>
  );
}

function TabButton({ label, icon, selected, onClick }: { label: string; icon: ReactNode; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" role="tab" className="m-tab" aria-selected={selected} onClick={onClick}>
      {icon}{label}
    </button>
  );
}

function Peek({ station, onOpen }: { station: ChargerStation | null; onOpen: (id: string) => void }) {
  const { userLocation, ratings } = useStore();
  // Se conserva la última estación mientras la tarjeta baja, para que no se
  // vacíe de golpe antes de terminar la animación.
  const [last, setLast] = useState<ChargerStation | null>(station);
  if (station && station !== last) setLast(station);
  const s = station ?? last;
  if (!s) return <div className="m-peek m-glass" />;
  const t = stationType(s);
  const dist = distanceLabel(distanceKm(s, userLocation));
  const kw = maxKw(s);
  const rating = ratings[s.id];
  return (
    <div className={`m-peek m-glass${station ? ' on' : ''}`}>
      <div key={s.id} className="m-fade">
        <div className="m-eyebrow"><i style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}</div>
        <div className="m-phead">
          <div><h3>{s.name}</h3><p className="m-addr">{s.zone || s.address}</p></div>
          <span className={`m-pill ${s.status}`}>{STATUS_LABEL[s.status]}</span>
        </div>
        <div className="m-meta">
          {dist && <span><b>{dist}</b></span>}
          {kw > 0 && <span><b>{formatKw(kw)}</b> · {connectorTypes(s).join(', ')}</span>}
          {rating && rating.count > 0 && <span><b>★ {rating.avg.toFixed(1).replace('.', ',')}</b> ({rating.count})</span>}
        </div>
        <div className="m-actions">
          <a className="m-btn primary" href={googleMapsUrl(s, userLocation)} target="_blank" rel="noopener noreferrer">{Icon.nav}Cómo llegar</a>
          <button type="button" className="m-btn ghost" onClick={() => onOpen(s.id)}>Ver estación</button>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ onAportar, onOpen }: { onAportar: () => void; onOpen: (id: string) => void }) {
  const { stations, userLocation, ratings } = useStore();
  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);

  // Estaciones que necesitan que alguien confirme si funcionan: sin
  // confirmación reciente, nunca verificadas o reportadas por la comunidad.
  const toVerify = useMemo(() => stations
    .filter((s) => s.freshness ? s.freshness !== 'verified' : s.verification !== 'verified')
    .map((s) => ({ s, km: distanceKm(s, userLocation) }))
    .sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : a.s.name.localeCompare(b.s.name)))
    .slice(0, 5), [stations, userLocation]);

  const mine = useMemo(() => {
    const { reviews, photos } = getMyContributionStationIds();
    const ids = Array.from(new Set([...reviews, ...photos]));
    return ids.map((id) => ({
      s: byId.get(id),
      what: [reviews.includes(id) && 'Reseña', photos.includes(id) && 'Foto'].filter(Boolean).join(' y '),
    })).filter((x): x is { s: ChargerStation; what: string } => !!x.s);
  }, [byId]);

  return (
    <div className="m-screen m-scroll">
      <div className="m-lt">Actividad</div>
      <p className="m-sub">Tus aportes al mapa</p>
      <button type="button" className="m-cta" onClick={onAportar}>
        <span className="ic">{Icon.plus}</span>
        <span><b>Agregar una estación</b><small>¿Conoces un cargador que no está en el mapa?</small></span>
        <span className="go">{Icon.chevR}</span>
      </button>

      <div className="m-sect">Ayuda a verificar{userLocation ? ' cerca de ti' : ''}</div>
      {toVerify.length > 0
        ? toVerify.map(({ s, km }) => <StationCard key={s.id} station={s} km={km} rating={ratings[s.id]} onOpen={onOpen} />)
        : <div className="m-empty-line">Todas las estaciones están confirmadas. ¡Gracias!</div>}

      <div className="m-sect">Lo que has aportado</div>
      {mine.length > 0 ? (
        <div className="m-glist">
          {mine.map(({ s, what }) => (
            <button key={s.id} type="button" className="r" onClick={() => onOpen(s.id)}>{s.name}<span>{what}</span></button>
          ))}
        </div>
      ) : (
        <div className="m-empty">
          <div className="art">{Icon.clock}</div>
          <b>Aún no tienes aportes</b>
          <p>Cuando dejes una reseña o una foto desde este teléfono, aparecerá aquí.</p>
        </div>
      )}
    </div>
  );
}
