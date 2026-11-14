"""Mezcla con audio externo (voz narrada, música y efectos de ElevenLabs).

Uso: python3 -I mix.py cues.json video.json carpeta_del_video salida.wav

Se usa en lugar de audio.py cuando video.json trae un bloque "audio"
(ver README). render.cjs lo llama solo; el volumen final (-15 LUFS) lo
ajusta render.cjs como siempre.

- Voz: cada escena puede llevar "vo": [desde, hasta] (segundos dentro del
  archivo de voz) y "voAt" (cuándo empieza a hablar dentro de la escena).
- Música: suena de principio a fin y baja sola mientras habla la voz.
- Efectos: los cambios de escena, toques, ventanas y el cierre ya generan
  señales (cues); aquí se les asigna un archivo. Además cada escena puede
  pedir efectos propios con "sfx": [{"t": 1.2, "name": "stars"}].
"""
import json, os, subprocess, sys, wave
import numpy as np

SR = 48000
cues = json.load(open(sys.argv[1]))
video = json.load(open(sys.argv[2]))
base = sys.argv[3]
A = video['audio']
DUR = cues['total'] + 0.3
N = int(SR * DUR)


def load(rel):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', os.path.join(base, rel), '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def db(x): return 10 ** (x / 20)


def rms_active(x):
    m = np.abs(x).max(axis=1)
    act = x[m > m.max() * 0.05] if m.max() > 0 else x
    return np.sqrt(np.mean(act ** 2)) + 1e-9


def place(buf, start, sig, g=1.0):
    i = int(round(max(0, start) * SR))
    if i >= len(buf): return
    sig = sig[: len(buf) - i]
    buf[i:i + len(sig)] += sig * g


def fade(sig, a=0.015, b=0.015):
    sig = sig.copy(); na, nb = int(a * SR), int(b * SR)
    if na: sig[:na] *= np.linspace(0, 1, na)[:, None]
    if nb: sig[-nb:] *= np.linspace(1, 0, nb)[:, None]
    return sig


# ---------- Voz ----------
voice = np.zeros((N, 2))
if A.get('voice'):
    vsrc = load(A['voice']['file'])
    vsrc *= db(-18) / rms_active(vsrc)            # referencia: voz a -18 dBFS RMS
    acc = 0.0
    for s in video['scenes']:
        if s.get('vo'):
            a, b = s['vo']
            seg = fade(vsrc[int(a * SR):int(b * SR)])
            place(voice, acc + s.get('voAt', 0.3), seg, db(A['voice'].get('gain', 0)))
        acc += s['dur']

# ---------- Música (baja sola bajo la voz) ----------
music = np.zeros((N, 2))
if A.get('music'):
    M = A['music']
    msrc = load(M['file'])[int(M.get('offset', 0) * SR):]
    msrc *= db(-18) / rms_active(msrc)
    msrc = msrc[:N]
    place(music, 0, msrc, db(M.get('gain', -9)))
    fo = int(M.get('fadeOut', 1.8) * SR)
    music[N - fo:] *= np.linspace(1, 0, fo)[:, None]
    # envolvente de la voz (ataque rápido, salida lenta) → cuánto bajar la música
    env = np.abs(voice).max(axis=1)
    win = int(0.03 * SR); env = np.convolve(env, np.ones(win) / win, 'same')
    on = (env > db(-40)).astype(float)
    k_att, k_rel = 1 - np.exp(-1 / (0.06 * SR)), 1 - np.exp(-1 / (0.35 * SR))
    g = np.empty(N); acc_ = 0.0
    for i in range(N):
        acc_ += (k_att if on[i] > acc_ else k_rel) * (on[i] - acc_); g[i] = acc_
    music *= db(M.get('duck', -8) * g)[:, None]

# ---------- Efectos ----------
sfx = np.zeros((N, 2))
S = A.get('sfx', {})
cache = {}
def eff(name):
    f = S.get(name)
    if not f: return None
    if isinstance(f, dict): f, gain = f['file'], f.get('gain', 0)
    else: gain = 0
    if f not in cache:
        x = load(f); cache[f] = x * (db(-24) / rms_active(x))
    return cache[f] * db(gain + A.get('sfxGain', 0))

for c in cues['cues']:
    if c['type'] == 'section': continue
    x = eff(c['type'])
    if x is not None: place(sfx, c['t'] - (0.15 if c['type'] == 'whoosh' else 0), x)
acc = 0.0
for s in video['scenes']:
    for e in s.get('sfx', []):
        x = eff(e['name'])
        if x is not None: place(sfx, acc + e['t'], x)
    acc += s['dur']

mix = voice + music + sfx
peak = np.abs(mix).max()
if peak > 0.98: mix *= 0.98 / peak
with wave.open(sys.argv[4], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print('Mezcla lista:', sys.argv[4])
