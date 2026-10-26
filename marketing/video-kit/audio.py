"""Música y efectos de los videos de EV Guatemala (estilo: marketing/estilo-videos.md).

Uso: python3 -I audio.py cues.json salida.wav
cues.json lo genera render.cjs a partir de las escenas (cambios de escena,
toques, ventanas que entran, pulsos, cierre). Todo se sintetiza aquí: no hay
pistas de terceros, así que no hay problemas de derechos de autor.

Sonido acordado: electrónico, oscuro y parejo (tipo "tech" minimalista), sin
voz. Bombo suave constante en las escenas con teléfono; en el gancho y el
cierre solo colchón + pulso. Efectos discretos. El volumen final (-15 LUFS)
lo ajusta render.cjs.
"""
import json, sys, wave
import numpy as np

SR = 44100
cfg = json.load(open(sys.argv[1]))
DUR = cfg['total'] + 0.5
N = int(SR * DUR)
rng = np.random.default_rng(5)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2))

def t_(d): return np.arange(int(d * SR)) / SR
def add(buf, start, sig, g=1.0, pan=0.0):
    i = int(max(0, start) * SR)
    if i >= N: return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    buf[i:i + len(sig), 0] += sig * g * l; buf[i:i + len(sig), 1] += sig * g * r
def lowpass(x, cut):
    cut = np.broadcast_to(np.asarray(cut, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * cut / SR); y = np.empty_like(x); acc = 0.0
    for k in range(len(x)): acc += a[k] * (x[k] - acc); y[k] = acc
    return y
def hz(n): return 440 * 2 ** ((n - 69) / 12)

# Secciones: dónde hay batería
sections = sorted([c for c in cfg['cues'] if c['type'] == 'section'], key=lambda c: c['t'])
def kind_at(t):
    k = 'phone'
    for c in sections:
        if c['t'] <= t + 1e-6: k = c['kind']
    return k

# ---------- Música: 104 BPM, La menor — Fa — Do — Sol ----------
BEAT = 60 / 104; BAR = 4 * BEAT
CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOT = [33, 29, 36, 31]

pad = np.zeros(N)
for b in range(int(DUR / BAR) + 1):
    st = b * BAR; tt = t_(BAR + .4)
    for n in CH[b % 4]:
        f = hz(n)
        s = (np.sin(2 * np.pi * f * tt) + .5 * np.sin(2 * np.pi * f * 2.003 * tt) + .25 * np.sin(2 * np.pi * f * 3 * tt)) * .07
        s *= np.minimum(1, tt / .5) * np.minimum(1, (BAR + .4 - tt) / .5)
        i = int(st * SR); s = s[: max(0, N - i)]; pad[i:i + len(s)] += s
pad = lowpass(pad, 900)

def kick():
    t = t_(.4); f = 42 + 80 * np.exp(-t / .035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .16)
def hat():
    t = t_(.05); n = rng.standard_normal(len(t)); n = n - lowpass(n, 7000)
    return n * np.exp(-t / .012)
def pluck(f):
    t = t_(.3)
    return (np.sin(2 * np.pi * f * t) + .4 * np.sin(4 * np.pi * f * t + 1)) * np.exp(-t / .09) * np.minimum(1, t / .003)

duck = np.ones(N); bass = np.zeros(N)
step = BEAT / 4; i16 = 0
while i16 * step < DUR:
    t = i16 * step; b = int(t / BAR); k = kind_at(t)
    drums = k == 'phone'
    # bajo pulsante en corcheas (siempre), más presente con batería
    if i16 % 2 == 0:
        tb = t_(step * 1.8); f = hz(ROOT[b % 4] + 12)
        sig = (np.sin(2 * np.pi * f * tb) + .3 * np.sin(4 * np.pi * f * tb)) * np.exp(-tb / .14) * np.minimum(1, tb / .004)
        add(music, t, sig, .17 if drums else .10)
    # arpegio filtrado en semicorcheas
    n = CH[b % 4][[0, 2, 1, 2][i16 % 4]] + 24
    add(music, t, pluck(hz(n)), .035 if drums else .045, pan=.4 if i16 % 2 else -.4)
    if drums and i16 % 4 == 0:
        add(music, t, kick(), .55)
        j = int(t * SR); L = int(.32 * SR); L = min(L, N - j)
        if L > 0: duck[j:j + L] = np.minimum(duck[j:j + L], 1 - .6 * np.exp(-np.arange(L) / SR / .1))
    if drums and i16 % 4 == 2: add(music, t, hat(), .06, pan=.15)
    if drums and i16 % 2 == 1: add(music, t, hat(), .025, pan=-.15)
    i16 += 1

music[:, 0] += pad * duck; music[:, 1] += pad * duck
tt = np.arange(N) / SR
music *= (np.minimum(1, tt / 1.2) * np.clip((DUR - .5 - tt) / 2.2, 0, 1))[:, None]

# ---------- Efectos ----------
def whoosh(d=.7):
    t = t_(d); n = rng.standard_normal(len(t))
    cut = 250 + 2600 * np.sin(np.pi * t / d) ** 2
    x = lowpass(n, cut); x = x - lowpass(x, 180)
    return x * np.sin(np.pi * t / d) ** 2 * 1.1
def tap():
    t = t_(.04)
    return np.sin(2 * np.pi * 2100 * t) * np.exp(-t / .006) * .8 + rng.standard_normal(len(t)) * np.exp(-t / .0015) * .25
def swish():
    t = t_(.35); n = rng.standard_normal(len(t)); x = lowpass(n, 1800 + 2500 * t / .35); x = x - lowpass(x, 400)
    return x * np.sin(np.pi * t / .35) ** 2 * .9
def pop():
    t = t_(.1); f = 520 + 520 * (1 - np.exp(-t / .02))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .035) * np.minimum(1, t / .002)
def bell(f, d=1.4, dec=.5):
    t = t_(d)
    return (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * f * 2.756 * t) * np.exp(-t / .12)) * np.exp(-t / dec) * np.minimum(1, t / .003)
def boop():
    t = t_(.25); f = 320 + 380 * (1 - np.exp(-t / .03))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .08)

for c in cfg['cues']:
    t, ty = c['t'], c['type']
    if ty == 'whoosh': add(sfx, t - .2, whoosh(), .22)
    elif ty == 'tap': add(sfx, t, tap(), .32)
    elif ty == 'swish': add(sfx, t, swish(), .2)
    elif ty == 'pop': add(sfx, t, pop(), .22)
    elif ty == 'boop': add(sfx, t, boop(), .28)
    elif ty == 'success':
        for k, n in enumerate([76, 83]): add(sfx, t + k * .12, bell(hz(n), 1.0, .3), .12, pan=-.2 + .4 * k)
    elif ty == 'notify':
        for k, n in enumerate([81, 76]): add(sfx, t + k * .13, bell(hz(n), .8, .25), .11)
    elif ty == 'chime':
        for k, n in enumerate([69, 76, 81]): add(sfx, t + k * .16, bell(hz(n)), .13, pan=-.25 + .25 * k)

mix = music * .8 + sfx
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix /= np.max(np.abs(mix)) / .9
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('Audio listo:', sys.argv[2])
