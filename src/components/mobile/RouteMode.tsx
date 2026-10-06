import { useState } from 'react';
import { useStore, ROUTE_RADII } from '../../store/useStore';
import type { RouteAlert } from './routeEngine';
import { Icon, TYPE_LABEL, distanceKm, distanceLabel, stationType, wazeUrl } from './shared';

// Interfaz del modo ruta; la lógica (ubicación, sonido, avisos) vive en
// routeEngine.ts.

/** Barra "Modo ruta" (distancia de aviso + apagar), arriba del mapa. */
export function RouteModeBar() {
  const { routeMode, setRouteMode, routeRadiusKm, setRouteRadiusKm } = useStore();
  const [hint, setHint] = useState(() => { try { return localStorage.getItem('ev_route_hint') !== '1'; } catch { return true; } });
  if (!routeMode) return null;
  return (
    <div className="m-route m-glass" role="status">
      {hint && (
        <p className="m-route-hint">
          Te avisamos con un sonido al pasar cerca de una estación de las que ves en el mapa. Deja la app abierta en pantalla. Tu ubicación no sale de tu teléfono.
          <button type="button" onClick={() => { setHint(false); try { localStorage.setItem('ev_route_hint', '1'); } catch { /* */ } }}>Entendido</button>
        </p>
      )}
      <span className="m-route-dot" aria-hidden="true" />
      <span className="m-route-txt"><b>Modo ruta</b></span>
      <div className="m-route-radii" role="group" aria-label="Avisar a esta distancia" title="Avisar a esta distancia">
        {ROUTE_RADII.map((r) => (
          <button key={r} type="button" aria-pressed={routeRadiusKm === r} onClick={() => setRouteRadiusKm(r)}>{r} km</button>
        ))}
      </div>
      <button type="button" className="m-route-off" onClick={() => setRouteMode(false)}>Apagar</button>
    </div>
  );
}

/** Tarjeta de aviso "Estación a 800 m" (visible en cualquier pestaña). */
export function RouteAlertCard({ alert, onDismiss, onOpen }: { alert: RouteAlert | null; onDismiss: () => void; onOpen: (id: string) => void }) {
  const { userLocation } = useStore();
  if (!alert) return null;
  const st = alert.station;
  const km = distanceKm(st, userLocation) ?? alert.km;
  return (
    <div className="m-route-alert m-glass" role="alert">
      <div className="m-route-alert-ic" style={{ background: stationType(st) === 'residential' ? 'var(--blue)' : 'var(--green)' }}>{Icon.bolt}</div>
      <div className="m-route-alert-txt">
        <small>Estación {TYPE_LABEL[stationType(st)].toLowerCase()} a {st.approximate ? '≈ ' : ''}{distanceLabel(km)}</small>
        <b>{st.name}</b>
      </div>
      <div className="m-route-alert-act">
        <button type="button" onClick={() => { onOpen(st.id); onDismiss(); }}>Ver</button>
        {!st.approximate && <a href={wazeUrl(st)} target="_blank" rel="noopener noreferrer" className="go">Ir</a>}
      </div>
      <button type="button" className="m-route-alert-x" aria-label="Cerrar aviso" onClick={onDismiss}>×</button>
    </div>
  );
}
