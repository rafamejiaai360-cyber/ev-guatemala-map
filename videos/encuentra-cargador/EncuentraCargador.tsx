import React from 'react';
import {
  AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';

// ── Línea de tiempo (30 fps) ───────────────────────────────────────────────
export const TOTAL = 1125;
const PHONE_IN = 90;
const PHONE_OUT = 1005;

// Capturas reales de la app (390×844 CSS a 3x). Cada entrada: desde qué frame se ve.
const SCREENS: { from: number; src: string }[] = [
  { from: 0, src: '01_map.png' },
  { from: 288, src: '02_filters.png' },
  { from: 318, src: '03_search.png' },
  { from: 346, src: '04_picked.png' },
  { from: 398, src: '05_dc.png' },
  { from: 454, src: '06_map_filtered.png' },
  { from: 558, src: '07_card.png' },
  { from: 666, src: '08_detail.png' },
  { from: 796, src: '09_saved.png' },
  { from: 856, src: '11_guardadas.png' },
  { from: 911, src: '12_perfil.png' },
];

// Toques del dedo, en coordenadas de la pantalla del teléfono (390×844).
const TAPS: { at: number; x: number; y: number }[] = [
  { at: 282, x: 318, y: 112 },   // Filtros
  { at: 340, x: 195, y: 414 },   // Hyundai IONIQ 5
  { at: 392, x: 303, y: 721 },   // Rápida (DC)
  { at: 448, x: 240, y: 798 },   // Ver 19 estaciones
  { at: 552, x: 159, y: 514 },   // pin
  { at: 660, x: 306, y: 712 },   // Ver estación
  { at: 790, x: 355, y: 33 },    // Guardar ⭐
  { at: 850, x: 268, y: 800 },   // pestaña Guardadas
  { at: 905, x: 341, y: 800 },   // pestaña Perfil
];

// Cámara: escala y punto de la pantalla que queda al centro (fx, fy en 390×844).
type Cam = { at: number; s: number; fx: number; fy: number };
const CAM: Cam[] = [
  { at: 0, s: 1, fx: 195, fy: 422 },
  { at: 230, s: 1, fx: 195, fy: 422 },
  { at: 250, s: 1.12, fx: 195, fy: 470 },
  { at: 275, s: 1, fx: 195, fy: 422 },
  { at: 370, s: 1, fx: 195, fy: 422 },
  { at: 388, s: 1.3, fx: 195, fy: 700 },
  { at: 440, s: 1.3, fx: 195, fy: 700 },
  { at: 458, s: 1, fx: 195, fy: 422 },
  { at: 556, s: 1, fx: 195, fy: 422 },
  { at: 575, s: 1.25, fx: 195, fy: 640 },
  { at: 650, s: 1.25, fx: 195, fy: 640 },
  { at: 672, s: 1.75, fx: 195, fy: 175 },
  { at: 775, s: 1.75, fx: 195, fy: 175 },
  { at: 785, s: 1.5, fx: 250, fy: 140 },
  { at: 815, s: 1.5, fx: 250, fy: 140 },
  { at: 835, s: 1, fx: 195, fy: 422 },
  { at: 912, s: 1, fx: 195, fy: 422 },
  { at: 932, s: 1.5, fx: 195, fy: 670 },
  { at: 1005, s: 1.5, fx: 195, fy: 670 },
];

// Textos en pantalla. Cada línea entra palabra por palabra; `hi` = palabras en verde.
type Line = { text: string; delay: number; size?: number; hi?: string[]; muted?: boolean };
const CAPTIONS: { from: number; to: number; lines: Line[] }[] = [
  { from: 96, to: 180, lines: [
    { text: 'Abres el mapa.', delay: 0 },
    { text: 'Ya sabe dónde estás.', delay: 30, hi: ['dónde', 'estás.'] },
  ] },
  { from: 184, to: 272, lines: [
    { text: '53 estaciones.', delay: 0, hi: ['53'] },
    { text: 'Pero no todas le sirven a tu carro.', delay: 26, size: 64, muted: true },
  ] },
  { from: 276, to: 378, lines: [
    { text: 'Le dices qué carro tienes…', delay: 4, hi: ['carro'] },
  ] },
  { from: 382, to: 464, lines: [
    { text: '…y que vas con prisa.', delay: 0, hi: ['prisa.'] },
  ] },
  { from: 468, to: 542, lines: [
    { text: 'Solo quedan las que', delay: 0 },
    { text: 'sí te sirven.', delay: 10, hi: ['sí', 'te', 'sirven.'] },
  ] },
  { from: 562, to: 648, lines: [
    { text: 'A 1,1 km.', delay: 0, hi: ['1,1', 'km.'] },
    { text: 'Carga rápida de 150 kW.', delay: 22, size: 64, muted: true },
  ] },
  { from: 670, to: 782, lines: [
    { text: '¿Waze o Google Maps?', delay: 0 },
    { text: 'Tú eliges cómo llegar.', delay: 34, hi: ['Tú', 'eliges'] },
  ] },
  { from: 786, to: 902, lines: [
    { text: 'La guardas', delay: 6 },
    { text: 'para la próxima.', delay: 14, hi: ['próxima.'] },
  ] },
  { from: 906, to: 1004, lines: [
    { text: 'Tu carro queda en tu cuenta.', delay: 0, hi: ['tu', 'cuenta.'] },
    { text: 'No lo vuelves a buscar.', delay: 30, size: 64, muted: true },
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

function camAt(f: number) {
  let a = CAM[0], b = CAM[CAM.length - 1];
  for (let i = 0; i < CAM.length - 1; i++) {
    if (f >= CAM[i].at && f <= CAM[i + 1].at) { a = CAM[i]; b = CAM[i + 1]; break; }
    if (f > CAM[CAM.length - 1].at) { a = b; }
  }
  const t = a === b ? 1 : interpolate(f, [a.at, b.at], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return { s: a.s + (b.s - a.s) * t, fx: a.fx + (b.fx - a.fx) * t, fy: a.fy + (b.fy - a.fy) * t };
}

export const EncuentraCargador: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#050a07', fontFamily: FONT, overflow: 'hidden' }}>
      <Glow />
      {frame < PHONE_IN + 10 && <Hook />}
      {frame >= PHONE_IN - 5 && frame < PHONE_OUT + 25 && <Phone />}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(5,10,7,0.96) 0%, rgba(5,10,7,0.85) 22%, rgba(5,10,7,0) 34%)', pointerEvents: 'none' }} />
      {CAPTIONS.map((c, i) => <Caption key={i} {...c} />)}
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

// ── 1. Gancho: batería bajando ─────────────────────────────────────────────
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pct = Math.round(interpolate(frame, [6, 40], [34, 18], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }));
  const fill = pct / 100;
  const color = pct > 25 ? '#eab308' : '#ef4444';
  const enter = spring({ frame, fps, config: { damping: 18 } });
  const q = spring({ frame: frame - 44, fps, config: { damping: 14 } });
  const out = interpolate(frame, [84, 100], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const blink = pct === 18 ? (Math.floor(frame / 8) % 2 === 0 ? 1 : 0.55) : 1;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, transform: `translateY(${(1 - out) * -120}px)` }}>
      <div style={{ transform: `scale(${0.85 + enter * 0.15})`, opacity: enter, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', opacity: blink }}>
          <div style={{ width: 420, height: 190, border: '12px solid #e5e7eb', borderRadius: 40, padding: 12, boxSizing: 'border-box' }}>
            <div style={{ width: `${fill * 100}%`, height: '100%', background: color, borderRadius: 22 }} />
          </div>
          <div style={{ width: 26, height: 80, background: '#e5e7eb', borderRadius: '0 14px 14px 0', marginLeft: 8 }} />
        </div>
        <div style={{ color: '#fff', fontSize: 150, fontWeight: 800, marginTop: 40, letterSpacing: -4 }}>
          {pct}<span style={{ fontSize: 90, color: '#9ca3af' }}> %</span>
        </div>
        <div style={{ color: '#9ca3af', fontSize: 44, fontWeight: 500, marginTop: -6 }}>Zona 10 · 6:40 p.m.</div>
        <div style={{
          color: '#fff', fontSize: 82, fontWeight: 800, marginTop: 90, letterSpacing: -2, textAlign: 'center',
          opacity: q, transform: `translateY(${(1 - q) * 40}px)`,
        }}>
          ¿Y ahora <span style={{ color: GREEN }}>dónde cargo?</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── 2. Teléfono con las capturas reales ────────────────────────────────────
const Phone: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - PHONE_IN, fps, config: { damping: 20, mass: 0.9 } });
  const exit = interpolate(frame, [PHONE_OUT, PHONE_OUT + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const { s, fx, fy } = camAt(frame);

  // El punto (fx, fy) de la pantalla queda en la posición en que estaría el
  // centro del teléfono sin zoom, desplazado hacia abajo si se acerca.
  const cx = PHONE_LEFT + PHONE_W / 2;
  const cy = PHONE_TOP + PHONE_H / 2;
  const px = PHONE_LEFT + fx * K, py = PHONE_TOP + fy * K;
  const gx = cx, gy = cy + (s - 1) * 120;
  const tx = gx - cx - s * (px - cx);
  const ty = gy - cy - s * (py - cy);
  const yIn = (1 - enter) * 1400 + exit * 1500;

  let idx = 0;
  SCREENS.forEach((sc, i) => { if (frame >= sc.from) idx = i; });
  const cur = SCREENS[idx];
  const prev = idx > 0 ? SCREENS[idx - 1] : null;
  const fade = interpolate(frame, [cur.from, cur.from + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute', left: PHONE_LEFT - BEZEL, top: PHONE_TOP - BEZEL,
      width: PHONE_W + BEZEL * 2, height: PHONE_H + BEZEL * 2,
      transformOrigin: `${PHONE_W / 2 + BEZEL}px ${PHONE_H / 2 + BEZEL}px`,
      transform: `translate(${tx}px, ${ty + yIn}px) scale(${s})`,
      background: '#111', borderRadius: 78, padding: BEZEL, boxSizing: 'border-box',
      boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 0 2px #2a2a2a inset',
    }}>
      <div style={{ position: 'relative', width: PHONE_W, height: PHONE_H, borderRadius: 62, overflow: 'hidden', background: '#f2f2f7' }}>
        {prev && fade < 1 && <Img src={staticFile(prev.src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
        <Img src={staticFile(cur.src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: prev ? fade : 1 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: SH, transform: `scale(${K})`, transformOrigin: '0 0' }}>
          {frame < 288 && <LocationPulse x={195} y={422} start={PHONE_IN + 30} />}
          {frame >= 690 && frame < 790 && (
            <>
              <Ring x={104.5} y={210.5} w={172} h={42} start={690} />
              <Ring x={285.5} y={210.5} w={172} h={42} start={700} />
            </>
          )}
          {TAPS.map((t, i) => <Finger key={i} {...t} />)}
        </div>
      </div>
    </div>
  );
};

const LocationPulse: React.FC<{ x: number; y: number; start: number }> = ({ x, y, start }) => {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const rings = [0, 20, 40].map((d) => {
    const t = ((frame - start + d) % 60) / 60;
    return (
      <div key={d} style={{
        position: 'absolute', left: x - 50 * t, top: y - 50 * t, width: 100 * t, height: 100 * t,
        borderRadius: '50%', border: '2px solid #3b82f6', opacity: 1 - t,
      }} />
    );
  });
  return <>{rings}</>;
};

const Ring: React.FC<{ x: number; y: number; w: number; h: number; start: number }> = ({ x, y, w, h, start }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - start, fps, config: { damping: 12 } });
  const pulse = 1 + Math.sin((frame - start) / 6) * 0.03;
  return (
    <div style={{
      position: 'absolute', left: x - w / 2 - 4, top: y - h / 2 - 4, width: w + 8, height: h + 8,
      borderRadius: 16, border: `3px solid ${GREEN}`, opacity: p,
      transform: `scale(${(0.8 + 0.2 * p) * pulse})`, boxShadow: `0 0 18px ${GREEN}`,
    }} />
  );
};

const Finger: React.FC<{ at: number; x: number; y: number }> = ({ at, x, y }) => {
  const frame = useCurrentFrame();
  const d = frame - at;
  if (d < -12 || d > 16) return null;
  const appear = interpolate(d, [-12, -4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const leave = interpolate(d, [6, 16], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const press = d >= -1 && d <= 3 ? 0.82 : 1;
  const ox = interpolate(d, [-12, -2], [26, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const oy = interpolate(d, [-12, -2], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
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

// ── Textos ─────────────────────────────────────────────────────────────────
const Caption: React.FC<{ from: number; to: number; lines: Line[] }> = ({ from, to, lines }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from || frame > to) return null;
  const out = interpolate(frame, [to - 8, to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
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
  const c = spring({ frame: f - 40, fps, config: { damping: 16 } });
  const d = spring({ frame: f - 58, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 80, textAlign: 'center' }}>
      <Img src={staticFile('icon-512.png')} style={{
        width: 210, height: 210, borderRadius: 52, opacity: a, transform: `scale(${0.6 + 0.4 * a})`,
        boxShadow: '0 20px 60px rgba(34,197,94,0.35)',
      }} />
      <div style={{ color: '#fff', fontSize: 96, fontWeight: 800, letterSpacing: -3, marginTop: 48, opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>
        EV Guatemala
      </div>
      <div style={{ color: '#cbd5e1', fontSize: 50, fontWeight: 600, lineHeight: 1.25, marginTop: 26, opacity: c, transform: `translateY(${(1 - c) * 30}px)` }}>
        Los cargadores de Guatemala,<br />en un solo mapa.
      </div>
      <div style={{ color: GREEN, fontSize: 44, fontWeight: 700, lineHeight: 1.3, marginTop: 90, opacity: d, transform: `translateY(${(1 - d) * 30}px)` }}>
        ¿Conoces uno que no aparece?<br />Agrégalo tú.
      </div>
      <div style={{
        marginTop: 70, color: '#9ca3af', fontSize: 30, fontWeight: 500, opacity: d,
        border: '2px solid #1f2937', borderRadius: 999, padding: '16px 34px',
      }}>
        ev-guatemala-map.rafamejia-ai360.workers.dev
      </div>
    </AbsoluteFill>
  );
};
