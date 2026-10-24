import React from 'react';
import {
  AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';

// ── Línea de tiempo (30 fps) ───────────────────────────────────────────────
export const TOTAL = 1010;
const PHONE_IN = 100;
const PHONE_OUT = 880;

// Viaje simulado por la CA-1 Oriente: una captura real cada 2 cuadros.
const DRIVE_START = 300;
const DRIVE_N = 124;
const DRIVE_STEP = 2;
const ALERT_SHOT = 106;
export const ALERT_AT = DRIVE_START + (ALERT_SHOT - 1) * DRIVE_STEP; // 510
const DRIVE_END = DRIVE_START + (DRIVE_N - 1) * DRIVE_STEP; // 546

// Capturas reales de la app (390×844 CSS a 3x). Cada entrada: desde qué frame se ve.
const SCREENS: { from: number; src: string; cut?: boolean }[] = [
  { from: 0, src: '01_map.png' },
  { from: 190, src: '02_route_on.png' },
  { from: 252, src: '03_radius2.png' },
  ...Array.from({ length: DRIVE_N }, (_, i) => ({
    from: DRIVE_START + i * DRIVE_STEP, src: `drive/${String(i + 1).padStart(3, '0')}.jpg`, cut: i > 0,
  })),
  { from: 642, src: '05_station.png' },
];

// Toques del dedo, en coordenadas de la pantalla del teléfono (390×844).
const TAPS: { at: number; x: number; y: number }[] = [
  { at: 185, x: 357, y: 281 },   // botón modo ruta
  { at: 248, x: 168, y: 159 },   // 2 km
  { at: 638, x: 288, y: 85 },    // Ver
];

// Cámara: escala y punto de la pantalla que queda al centro (fx, fy en 390×844).
type Cam = { at: number; s: number; fx: number; fy: number };
const CAM: Cam[] = [
  { at: 0, s: 1, fx: 195, fy: 422 },
  { at: 140, s: 1, fx: 195, fy: 422 },
  { at: 162, s: 1.35, fx: 250, fy: 320 },
  { at: 194, s: 1.35, fx: 250, fy: 320 },
  { at: 212, s: 1.6, fx: 195, fy: 190 },
  { at: 280, s: 1.6, fx: 195, fy: 190 },
  { at: 300, s: 1, fx: 195, fy: 422 },
  { at: 404, s: 1, fx: 195, fy: 422 },
  { at: 422, s: 1.2, fx: 260, fy: 410 },
  { at: 494, s: 1.2, fx: 260, fy: 410 },
  { at: 508, s: 1, fx: 195, fy: 422 },
  { at: 516, s: 1, fx: 195, fy: 422 },
  { at: 534, s: 1.65, fx: 195, fy: 130 },
  { at: 640, s: 1.65, fx: 195, fy: 130 },
  { at: 660, s: 1.35, fx: 195, fy: 640 },
  { at: 712, s: 1.35, fx: 195, fy: 640 },
  { at: 732, s: 1, fx: 195, fy: 422 },
  { at: 880, s: 1, fx: 195, fy: 422 },
];

// Resaltados (anillo verde) en coordenadas de pantalla.
const RINGS: { from: number; to: number; x: number; y: number; w: number; h: number; r?: number }[] = [
  { from: 150, to: 192, x: 357, y: 281, w: 38, h: 38, r: 12 },
  { from: 222, to: 262, x: 168, y: 159, w: 41, h: 24, r: 10 },
  { from: 416, to: 500, x: 357, y: 365, w: 38, h: 38, r: 12 },
  { from: 516, to: 600, x: 195, y: 85, w: 370, h: 62, r: 22 },
  { from: 662, to: 716, x: 133, y: 712, w: 216, h: 40, r: 22 },
];

// Textos en pantalla. Cada línea entra palabra por palabra; `hi` = palabras en verde.
type Line = { text: string; delay: number; size?: number; hi?: string[]; muted?: boolean };
const CAPTIONS: { from: number; to: number; lines: Line[] }[] = [
  { from: 110, to: 198, lines: [
    { text: 'Antes de salir,', delay: 0 },
    { text: 'enciende el modo ruta.', delay: 20, hi: ['modo', 'ruta.'] },
  ] },
  { from: 204, to: 292, lines: [
    { text: 'Eliges a qué distancia', delay: 0 },
    { text: 'quieres que te avise.', delay: 18, hi: ['avise.'] },
  ] },
  { from: 300, to: 400, lines: [
    { text: 'Tú solo maneja.', delay: 4 },
    { text: 'El mapa te sigue.', delay: 30, hi: ['te', 'sigue.'] },
  ] },
  { from: 404, to: 504, lines: [
    { text: 'Y gira hacia', delay: 0 },
    { text: 'donde vas.', delay: 12, hi: ['donde', 'vas.'] },
  ] },
  { from: 512, to: 628, lines: [
    { text: '¿Una estación cerca?', delay: 0 },
    { text: 'Te avisa con un sonido.', delay: 30, hi: ['sonido.'] },
  ] },
  { from: 632, to: 716, lines: [
    { text: 'Cuando te detienes,', delay: 0 },
    { text: 'ves cómo llegar.', delay: 18, hi: ['cómo', 'llegar.'] },
  ] },
  { from: 720, to: 798, lines: [
    { text: 'Tu ubicación', delay: 0 },
    { text: 'no sale de tu teléfono.', delay: 14, hi: ['no', 'sale'] },
  ] },
  { from: 802, to: 878, lines: [
    { text: 'Déjala abierta', delay: 0, hi: ['abierta'] },
    { text: 'en el soporte del carro.', delay: 14 },
    { text: 'La pantalla no se apaga sola.', delay: 34, size: 56, muted: true },
  ] },
];

// Teléfono
const SW = 390, SH = 844;
const PHONE_W = 640;
const K = PHONE_W / SW;
const PHONE_H = SH * K;
const PHONE_LEFT = (1080 - PHONE_W) / 2;
const PHONE_TOP = 540;
const BEZEL = 16;

const GREEN = '#22c55e';
const FONT = "'Inter Display', 'Inter', sans-serif";
const ease = Easing.bezier(0.33, 0, 0.2, 1);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

function camAt(f: number) {
  let a = CAM[CAM.length - 1], b = a;
  for (let i = 0; i < CAM.length - 1; i++) {
    if (f >= CAM[i].at && f <= CAM[i + 1].at) { a = CAM[i]; b = CAM[i + 1]; break; }
  }
  const t = a === b ? 1 : interpolate(f, [a.at, b.at], [0, 1], { easing: ease, ...clamp });
  return { s: a.s + (b.s - a.s) * t, fx: a.fx + (b.fx - a.fx) * t, fy: a.fy + (b.fy - a.fy) * t };
}

export const ModoRuta: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#050a07', fontFamily: FONT, overflow: 'hidden' }}>
      <Glow />
      {frame < PHONE_IN + 14 && <Hook />}
      {frame >= PHONE_IN - 5 && frame < PHONE_OUT + 25 && <Phone />}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(5,10,7,0.96) 0%, rgba(5,10,7,0.85) 22%, rgba(5,10,7,0) 34%)', pointerEvents: 'none' }} />
      {CAPTIONS.map((c, i) => <Caption key={i} {...c} />)}
      <FastPill />
      <Badge from={726} to={798} kind="lock" label="Solo en tu teléfono" />
      <Badge from={808} to={878} kind="screen" label="Pantalla siempre encendida" />
      {frame >= PHONE_OUT - 5 && <EndCard />}
    </AbsoluteFill>
  );
};

const Glow: React.FC = () => {
  const frame = useCurrentFrame();
  const x = 540 + Math.sin(frame / 70) * 120;
  const y = 1150 + Math.cos(frame / 90) * 160;
  return (
    <AbsoluteFill style={{
      background: `radial-gradient(700px 700px at ${x}px ${y}px, rgba(34,197,94,0.22), rgba(34,197,94,0) 70%)`,
    }} />
  );
};

// ── 1. Gancho: carro en carretera ──────────────────────────────────────────
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18 } });
  const q1 = spring({ frame: frame - 8, fps, config: { damping: 15 } });
  const q2 = spring({ frame: frame - 42, fps, config: { damping: 14 } });
  const out = interpolate(frame, [92, 112], [1, 0], clamp);
  const drive = interpolate(frame, [88, 112], [0, 900], { ...clamp, easing: Easing.in(Easing.cubic) });
  const bob = Math.sin(frame / 3) * 2.5;
  const ROAD_Y = 1210;
  const dashOff = (frame * 26) % 160;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* Volcanes al fondo (parallax lento) */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <g transform={`translate(${-(frame * 1.2) % 1080}, 0)`} opacity={0.5 * enter}>
          {[0, 1080].map((ox) => (
            <path key={ox} transform={`translate(${ox},0)`}
              d={`M0 ${ROAD_Y - 40} L140 ${ROAD_Y - 150} L230 ${ROAD_Y - 90} L420 ${ROAD_Y - 330} L470 ${ROAD_Y - 330} L640 ${ROAD_Y - 120} L760 ${ROAD_Y - 210} L900 ${ROAD_Y - 80} L1080 ${ROAD_Y - 40} Z`}
              fill="#0d1f15" />
          ))}
        </g>
        <g transform={`translate(${-(frame * 4) % 1080}, 0)`} opacity={enter}>
          {[0, 1080].map((ox) => (
            <path key={ox} transform={`translate(${ox},0)`}
              d={`M0 ${ROAD_Y} Q180 ${ROAD_Y - 70} 360 ${ROAD_Y - 20} T720 ${ROAD_Y - 40} T1080 ${ROAD_Y} Z`}
              fill="#10291b" />
          ))}
        </g>
        <rect x={0} y={ROAD_Y} width={1080} height={10} fill="#1f2937" opacity={enter} />
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x={i * 160 - dashOff} y={ROAD_Y + 40} width={80} height={8} rx={4} fill="#374151" opacity={enter} />
        ))}
        {/* líneas de velocidad */}
        {[0, 1, 2].map((i) => {
          const x = 1080 - ((frame * 40 + i * 400) % 1400);
          return <rect key={i} x={x} y={1000 + i * 55} width={140} height={4} rx={2} fill="#e5e7eb" opacity={0.18 * enter} />;
        })}
      </svg>

      {/* Haz de los faros y polvo del camino */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="beam" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fef3c7" stopOpacity="0.35" />
            <stop offset="1" stopColor="#fef3c7" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M${850 + drive} ${ROAD_Y - 92 + bob} L${1180 + drive} ${ROAD_Y - 170} L${1180 + drive} ${ROAD_Y + 10} Z`}
          fill="url(#beam)" opacity={enter * (0.85 + Math.sin(frame / 2) * 0.05)} />
        {Array.from({ length: 14 }, (_, i) => {
          const x = 1100 - ((frame * (18 + (i % 4) * 6) + i * 97) % 1250);
          const y = ROAD_Y - 20 - ((i * 53) % 260);
          return <circle key={i} cx={x} cy={y} r={2 + (i % 3)} fill="#86efac" opacity={0.25 * enter} />;
        })}
      </svg>

      {/* Carro con batería adentro */}
      <div style={{
        position: 'absolute', left: 230 + drive, top: ROAD_Y - 238 + bob,
        transform: `scale(${1.05 + enter * 0.2})`, opacity: enter, transformOrigin: '50% 100%',
      }}>
        <CarSilhouette frame={frame} />
      </div>

      <div style={{ position: 'absolute', top: 360, left: 70, right: 70, textAlign: 'center' }}>
        <div style={{ color: '#fff', fontSize: 84, fontWeight: 800, letterSpacing: -2.5, opacity: q1, transform: `translateY(${(1 - q1) * 40}px)` }}>
          Vas por carretera.
        </div>
        <div style={{ color: '#fff', fontSize: 84, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1.08, marginTop: 24, opacity: q2, transform: `translateY(${(1 - q2) * 40}px)` }}>
          ¿Dónde cargas <span style={{ color: GREEN }}>en el camino?</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CarSilhouette: React.FC<{ frame: number }> = ({ frame }) => {
  const spin = frame * 24;
  const wheel = (cx: number) => (
    <g transform={`rotate(${spin} ${cx} 196)`}>
      <circle cx={cx} cy={196} r={44} fill="#0b0f0d" stroke="#e5e7eb" strokeWidth={9} />
      <circle cx={cx} cy={196} r={14} fill="#e5e7eb" />
      {[0, 72, 144, 216, 288].map((a) => (
        <rect key={a} x={cx - 3} y={160} width={6} height={22} rx={3} fill="#6b7280" transform={`rotate(${a} ${cx} 196)`} />
      ))}
    </g>
  );
  return (
    <svg width={620} height={250} viewBox="0 0 620 250">
      <path d="M28 190 L28 148 Q32 122 72 116 L178 104 Q232 52 300 46 L398 46 Q458 50 512 104 L568 116 Q598 122 600 152 L602 190 Z"
        fill="#0b1510" stroke="#e5e7eb" strokeWidth={9} strokeLinejoin="round" />
      <path d="M200 104 Q238 70 296 66 L332 66 L332 104 Z" fill="#16241c" />
      <path d="M350 66 L396 66 Q446 70 484 104 L350 104 Z" fill="#16241c" />
      {/* batería */}
      <g transform="translate(232 128)">
        <rect x={0} y={0} width={150} height={52} rx={12} fill="none" stroke="#e5e7eb" strokeWidth={6} />
        <rect x={152} y={16} width={10} height={20} rx={3} fill="#e5e7eb" />
        <clipPath id="batt"><rect x={8} y={8} width={88} height={36} rx={6} /></clipPath>
        <rect x={8} y={8} width={88} height={36} rx={6} fill={GREEN} />
        <rect x={((frame * 5) % 160) - 40} y={0} width={22} height={60} fill="#fff" opacity={0.35} clipPath="url(#batt)" transform="skewX(-20)" />
        <path d="M58 12 L46 30 L56 30 L52 42 L66 22 L56 22 Z" fill="#0b1510" />
      </g>
      <rect x={584} y={150} width={14} height={14} rx={4} fill="#fde68a" />
      {wheel(150)}
      {wheel(478)}
    </svg>
  );
};

// ── 2. Teléfono con las capturas reales ────────────────────────────────────
const Phone: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - PHONE_IN, fps, config: { damping: 20, mass: 0.9 } });
  const exit = interpolate(frame, [PHONE_OUT, PHONE_OUT + 18], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const { s, fx, fy } = camAt(frame);

  const cx = PHONE_LEFT + PHONE_W / 2;
  const cy = PHONE_TOP + PHONE_H / 2;
  const px = PHONE_LEFT + fx * K, py = PHONE_TOP + fy * K;
  const gx = cx, gy = cy + (s - 1) * 120;
  const tx = gx - cx - s * (px - cx);
  const ty = gy - cy - s * (py - cy);
  const yIn = (1 - enter) * 1400 + exit * 1500;
  // Vibración del teléfono al llegar el aviso.
  const sd = frame - ALERT_AT;
  const shake = sd >= 0 && sd < 16 ? Math.sin(sd * 2.4) * 10 * (1 - sd / 16) : 0;

  let idx = 0;
  SCREENS.forEach((sc, i) => { if (frame >= sc.from) idx = i; });
  const cur = SCREENS[idx];
  const prev = idx > 0 && !cur.cut ? SCREENS[idx - 1] : null;
  const fade = interpolate(frame, [cur.from, cur.from + 6], [0, 1], clamp);

  return (
    <div style={{
      position: 'absolute', left: PHONE_LEFT - BEZEL, top: PHONE_TOP - BEZEL,
      width: PHONE_W + BEZEL * 2, height: PHONE_H + BEZEL * 2,
      transformOrigin: `${PHONE_W / 2 + BEZEL}px ${PHONE_H / 2 + BEZEL}px`,
      transform: `translate(${tx + shake}px, ${ty + yIn}px) scale(${s})`,
      background: '#111', borderRadius: 78, padding: BEZEL, boxSizing: 'border-box',
      boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 0 2px #2a2a2a inset',
    }}>
      <div style={{ position: 'relative', width: PHONE_W, height: PHONE_H, borderRadius: 62, overflow: 'hidden', background: '#f2f2f7' }}>
        {prev && fade < 1 && <Img src={staticFile(prev.src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
        <Img src={staticFile(cur.src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: prev ? fade : 1 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: SH, transform: `scale(${K})`, transformOrigin: '0 0' }}>
          {frame >= DRIVE_START + 8 && frame < ALERT_AT && <RadarPulse x={195} y={422} start={DRIVE_START + 8} />}
          {frame >= ALERT_AT && frame < ALERT_AT + 60 && <SoundWaves x={34} y={85} start={ALERT_AT} />}
          {frame >= ALERT_AT && frame < ALERT_AT + 30 && <AlertFlash start={ALERT_AT} />}
          {RINGS.map((r, i) => frame >= r.from && frame < r.to && <Ring key={i} {...r} start={r.from} end={r.to} />)}
          {TAPS.map((t, i) => <Finger key={i} {...t} />)}
        </div>
      </div>
    </div>
  );
};

// Radar: ondas suaves desde tu ubicación mientras el modo ruta busca estaciones.
const RadarPulse: React.FC<{ x: number; y: number; start: number }> = ({ x, y, start }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {[0, 22, 44].map((d) => {
        const t = ((frame - start + d) % 66) / 66;
        const r = 14 + 150 * t;
        return (
          <div key={d} style={{
            position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%',
            border: `2px solid ${GREEN}`, background: 'rgba(34,197,94,0.06)', opacity: (1 - t) * 0.8,
          }} />
        );
      })}
    </>
  );
};

// Destello verde en el borde de la pantalla al llegar el aviso.
const AlertFlash: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const a = interpolate(frame - start, [0, 4, 30], [0, 1, 0], clamp);
  return <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 60px 18px rgba(34,197,94,${0.55 * a})` }} />;
};

// Insignia grande sobre el teléfono (privacidad / pantalla encendida).
const Badge: React.FC<{ from: number; to: number; kind: 'lock' | 'screen'; label: string }> = ({ from, to, kind, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from || frame > to) return null;
  const p = spring({ frame: frame - from, fps, config: { damping: 11, stiffness: 140 } });
  const out = interpolate(frame, [to - 8, to], [1, 0], clamp);
  const glow = 0.5 + Math.sin((frame - from) / 7) * 0.2;
  const shackle = kind === 'lock' ? interpolate(frame - from, [10, 18], [-14, 0], { ...clamp, easing: Easing.out(Easing.back(3)) }) : 0;
  const rays = kind === 'screen' ? interpolate(frame - from, [8, 24], [0, 1], clamp) : 0;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 960, display: 'flex', flexDirection: 'column', alignItems: 'center',
      opacity: out * Math.min(1, p * 1.4), transform: `scale(${0.5 + 0.5 * p})`,
    }}>
      <div style={{
        width: 250, height: 250, borderRadius: '50%', background: 'rgba(5,10,7,0.82)', display: 'grid', placeItems: 'center',
        border: `4px solid ${GREEN}`, boxShadow: `0 0 ${60 * glow}px rgba(34,197,94,0.6), 0 30px 80px rgba(0,0,0,0.5)`,
      }}>
        <svg width={130} height={130} viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
          {kind === 'lock' ? (
            <>
              <path d={`M32 46 V34 a18 18 0 0 1 36 0 V46`} transform={`translate(0 ${shackle})`} />
              <rect x={22} y={46} width={56} height={42} rx={10} fill={GREEN} stroke="none" />
              <circle cx={50} cy={64} r={6} fill="#050a07" stroke="none" />
              <path d="M50 66 V76" stroke="#050a07" strokeWidth={6} />
            </>
          ) : (
            <>
              <rect x={32} y={14} width={36} height={72} rx={8} />
              <circle cx={50} cy={48} r={9} fill={GREEN} stroke="none" />
              {[-1, 1].map((side) => [0, 1, 2].map((k) => (
                <line key={`${side}${k}`} x1={50 + side * 26} y1={30 + k * 18} x2={50 + side * (26 + 12 * rays)} y2={30 + k * 18 - 4 + k * 4}
                  stroke={GREEN} strokeWidth={6} opacity={rays} />
              )))}
            </>
          )}
        </svg>
      </div>
      <div style={{
        marginTop: 26, color: '#fff', fontSize: 38, fontWeight: 700, padding: '12px 30px', borderRadius: 999,
        background: 'rgba(5,10,7,0.82)', border: '2px solid #1f2937',
      }}>{label}</div>
    </div>
  );
};

const SoundWaves: React.FC<{ x: number; y: number; start: number }> = ({ x, y, start }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {[0, 10, 20].map((d) => {
        const t = interpolate(frame - start - d, [0, 30], [0, 1], clamp);
        if (t <= 0 || t >= 1) return null;
        const r = 18 + 46 * t;
        return (
          <div key={d} style={{
            position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2,
            borderRadius: '50%', border: `3px solid ${GREEN}`, opacity: 1 - t,
          }} />
        );
      })}
    </>
  );
};

const Ring: React.FC<{ x: number; y: number; w: number; h: number; r?: number; start: number; end: number }> = ({ x, y, w, h, r = 16, start, end }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - start, fps, config: { damping: 12 } });
  const out = interpolate(frame, [end - 6, end], [1, 0], clamp);
  const pulse = 1 + Math.sin((frame - start) / 6) * 0.03;
  return (
    <div style={{
      position: 'absolute', left: x - w / 2 - 5, top: y - h / 2 - 5, width: w + 10, height: h + 10,
      borderRadius: r + 4, border: `3px solid ${GREEN}`, opacity: p * out,
      transform: `scale(${(0.8 + 0.2 * p) * pulse})`, boxShadow: `0 0 18px ${GREEN}`,
    }} />
  );
};

const Finger: React.FC<{ at: number; x: number; y: number }> = ({ at, x, y }) => {
  const frame = useCurrentFrame();
  const d = frame - at;
  if (d < -12 || d > 16) return null;
  const appear = interpolate(d, [-12, -4], [0, 1], clamp);
  const leave = interpolate(d, [6, 16], [1, 0], clamp);
  const press = d >= -1 && d <= 3 ? 0.82 : 1;
  const ox = interpolate(d, [-12, -2], [26, 0], { ...clamp, easing: ease });
  const oy = interpolate(d, [-12, -2], [40, 0], { ...clamp, easing: ease });
  const r = 18;
  const ripple = d >= 0 ? interpolate(d, [0, 14], [0, 1], { extrapolateRight: 'clamp' }) : 0;
  return (
    <>
      {d >= 0 && (
        <div style={{
          position: 'absolute', left: x - 34 * ripple, top: y - 34 * ripple, width: 68 * ripple, height: 68 * ripple,
          borderRadius: '50%', border: '2px solid rgba(255,255,255,0.9)', opacity: 1 - ripple,
          boxShadow: '0 0 10px rgba(0,0,0,0.25)',
        }} />
      )}
      <div style={{
        position: 'absolute', left: x - r + ox, top: y - r + oy, width: r * 2, height: r * 2, borderRadius: '50%',
        background: 'rgba(255,255,255,0.55)', border: '2px solid rgba(255,255,255,0.95)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)', opacity: appear * leave, transform: `scale(${press})`,
      }} />
    </>
  );
};

// Aviso honesto: el viaje está acelerado.
const FastPill: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < DRIVE_START || frame > DRIVE_END + 10) return null;
  const a = interpolate(frame, [DRIVE_START, DRIVE_START + 10, DRIVE_END, DRIVE_END + 10], [0, 1, 1, 0], clamp);
  return (
    <div style={{
      position: 'absolute', top: 452, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: a,
    }}>
      <div style={{
        color: '#cbd5e1', fontSize: 28, fontWeight: 600, padding: '10px 24px', borderRadius: 999,
        border: '2px solid #1f2937', background: 'rgba(5,10,7,0.7)', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ color: GREEN, letterSpacing: -6 }}>▶▶</span> Viaje acelerado · CA-1 Oriente
      </div>
    </div>
  );
};

// ── Textos ─────────────────────────────────────────────────────────────────
const Caption: React.FC<{ from: number; to: number; lines: Line[] }> = ({ from, to, lines }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from || frame > to) return null;
  const out = interpolate(frame, [to - 8, to], [1, 0], clamp);
  return (
    <div style={{
      position: 'absolute', top: 150, left: 70, right: 70, display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 14, opacity: out, transform: `translateY(${(1 - out) * -20}px)`,
    }}>
      {lines.map((ln, li) => (
        <div key={li} style={{
          fontSize: ln.size ?? 84, fontWeight: ln.muted ? 600 : 800, letterSpacing: ln.muted ? -1 : -2.5,
          lineHeight: 1.08, textAlign: 'center', color: ln.muted ? '#cbd5e1' : '#fff',
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.26em',
        }}>
          {ln.text.split(' ').map((w, wi) => {
            const p = spring({ frame: frame - from - ln.delay - wi * 3, fps, config: { damping: 15, stiffness: 160 } });
            const hi = ln.hi?.includes(w);
            return (
              <span key={wi} style={{
                display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 30}px) scale(${0.9 + 0.1 * p})`,
                color: hi ? GREEN : undefined,
              }}>{w}</span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ── Cierre ─────────────────────────────────────────────────────────────────
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - PHONE_OUT;
  const a = spring({ frame: f - 6, fps, config: { damping: 14 } });
  const b = spring({ frame: f - 18, fps, config: { damping: 16 } });
  const c = spring({ frame: f - 38, fps, config: { damping: 16 } });
  const d = spring({ frame: f - 56, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 80, textAlign: 'center' }}>
      {Array.from({ length: 22 }, (_, i) => {
        const life = ((f * (1.2 + (i % 5) * 0.25) + i * 37) % 260) / 260;
        return (
          <div key={i} style={{
            position: 'absolute', left: (i * 149) % 1040 + 20, top: 1900 - life * 1900,
            width: 6 + (i % 3) * 3, height: 6 + (i % 3) * 3, borderRadius: '50%', background: GREEN,
            opacity: Math.sin(life * Math.PI) * 0.35 * a,
          }} />
        );
      })}
      <div style={{ position: 'relative', width: 210, height: 210, borderRadius: 52, overflow: 'hidden', opacity: a, transform: `scale(${0.6 + 0.4 * a})`, boxShadow: '0 20px 60px rgba(34,197,94,0.35)' }}>
        <Img src={staticFile('icon-512.png')} style={{ width: 210, height: 210 }} />
        <div style={{
          position: 'absolute', top: -40, bottom: -40, width: 60, left: interpolate(f, [20, 44], [-120, 300], clamp),
          background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.55), rgba(255,255,255,0))', transform: 'skewX(-20deg)',
        }} />
      </div>
      <div style={{ color: '#fff', fontSize: 96, fontWeight: 800, letterSpacing: -3, marginTop: 48, opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>
        EV Guatemala
      </div>
      <div style={{ color: '#cbd5e1', fontSize: 50, fontWeight: 600, lineHeight: 1.25, marginTop: 26, opacity: c, transform: `translateY(${(1 - c) * 30}px)` }}>
        Modo ruta: tú manejas,<br />la app te avisa.
      </div>
      <div style={{ color: GREEN, fontSize: 44, fontWeight: 700, lineHeight: 1.3, marginTop: 90, opacity: d, transform: `translateY(${(1 - d) * 30}px)` }}>
        Pruébalo en tu próximo viaje.
      </div>
      <div style={{
        marginTop: 70, color: '#e5e7eb', fontSize: 42, fontWeight: 600, opacity: d,
        border: '2px solid #1f2937', borderRadius: 999, padding: '18px 40px',
      }}>
        www.movilidadelectricagt.com
      </div>
    </AbsoluteFill>
  );
};
