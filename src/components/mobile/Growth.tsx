import type { JoinContext } from '../../store/useStore';
import { Icon } from './shared';

// Crecimiento de la comunidad (oct 2026): invitación a crear cuenta en el
// momento útil (JoinSheet) y página "Comparte tu cargador" para que más dueños
// publiquen su cargador en casa (HostSheet). Solo promete lo que la app ya
// hace hoy.

const JOIN_COPY: Record<JoinContext, { title: string; text: string }> = {
  save: {
    title: 'Guardada en este teléfono',
    text: 'Crea tu cuenta gratis para sumarte a la comunidad y aportar al mapa.',
  },
  aportar: {
    title: 'Crea tu cuenta gratis',
    text: 'Para aportar al mapa necesitas una cuenta. Toma menos de un minuto.',
  },
  browse: {
    title: 'Únete a la comunidad EV de Guatemala',
    text: 'Entre todos mantenemos el mapa al día. Tu aporte ayuda a otros conductores.',
  },
};

const JOIN_BENEFITS: { icon: keyof typeof Icon; b: string; s: string }[] = [
  { icon: 'house', b: 'Comparte tu cargador en casa', s: 'Aparece en el mapa para quien lo necesite' },
  { icon: 'pin', b: 'Propón estaciones nuevas', s: 'Y corrige las que tengan datos viejos' },
  { icon: 'check', b: 'Confirma y deja reseñas', s: 'Avisa si una estación funciona o tiene un problema' },
];

export function JoinSheetContent({ ctx, onRegister, onLogin, onClose }: {
  ctx: JoinContext; onRegister: () => void; onLogin: () => void; onClose: () => void;
}) {
  const copy = JOIN_COPY[ctx];
  return (
    <>
      <div className="m-join-mark">{Icon.bolt}</div>
      <h3 className="m-join-h">{copy.title}</h3>
      <p className="s m-join-s">{copy.text}</p>
      <ul className="m-benefits">
        {JOIN_BENEFITS.map((x) => (
          <li key={x.b}><span className={`ic${x.icon === 'house' ? ' b' : ''}`}>{Icon[x.icon]}</span><span><b>{x.b}</b><small>{x.s}</small></span></li>
        ))}
      </ul>
      <button type="button" className="m-btn primary m-join-go" onClick={onRegister}>Crear cuenta gratis</button>
      <button type="button" className="m-btn ghost m-join-alt" onClick={onLogin}>Ya tengo cuenta</button>
      <button type="button" className="m-cancel" onClick={onClose}>Ahora no</button>
    </>
  );
}

const HOST_POINTS: { b: string; s: string }[] = [
  { b: 'Ayudas a que más gente maneje eléctrico', s: 'Un cargador cerca es lo que muchos necesitan para animarse.' },
  { b: 'Tú decides el acceso', s: 'Privado, compartido o público. Los conductores te piden permiso desde la app con "Solicitar uso".' },
  { b: 'Tu privacidad está protegida', s: 'Tu correo y teléfono nunca se muestran en el mapa. Puedes usar un nombre de referencia, no el tuyo.' },
  { b: 'Revisado antes de publicarse', s: 'Un administrador revisa cada estación para que el mapa sea confiable.' },
];

export function HostSheetContent({ onStart, onClose }: { onStart: () => void; onClose: () => void }) {
  return (
    <>
      <div className="m-join-mark b">{Icon.house}</div>
      <h3 className="m-join-h">Comparte tu cargador en casa</h3>
      <p className="s m-join-s">Las estaciones residenciales son lo que hace único a este mapa. Registrar la tuya toma un par de minutos.</p>
      <ul className="m-benefits">
        {HOST_POINTS.map((x, i) => (
          <li key={x.b}><span className="ic n">{i + 1}</span><span><b>{x.b}</b><small>{x.s}</small></span></li>
        ))}
      </ul>
      <button type="button" className="m-btn primary m-join-go" onClick={onStart}>Registrar mi cargador</button>
      <button type="button" className="m-cancel" onClick={onClose}>Ahora no</button>
    </>
  );
}

/** Tarjeta para invitar a compartir el cargador (Perfil, Actividad). */
export function HostPromo({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="m-cta m-host-promo" onClick={onOpen}>
      <span className="ic b">{Icon.house}</span>
      <span><b>¿Tienes cargador en casa?</b><small>Compártelo y aparece en el mapa</small></span>
      <svg className="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
    </button>
  );
}
