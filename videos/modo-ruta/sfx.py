# Efectos de sonido originales sintetizados (sin samples de terceros).
import numpy as np, wave
SR=48000; FPS=30; TOTAL=1010
N=int(TOTAL/FPS*SR)+SR
L=np.zeros(N); R=np.zeros(N)
rng=np.random.default_rng(7)
def t(sec): return np.arange(int(sec*SR))/SR
def add(sig, frame, gain=1.0, pan=0.0):
    i=int(frame/FPS*SR); n=min(len(sig), N-i)
    L[i:i+n]+=sig[:n]*gain*(1-max(pan,0)); R[i:i+n]+=sig[:n]*gain*(1+min(pan,0))
def env(n, a=0.003, d=0.1):
    x=np.arange(n)/SR; return np.minimum(x/a,1)*np.exp(-x/d)
def lowpass(x, k): return np.convolve(x, np.ones(k)/k, mode='same')
def tone(f, dur, d=0.15, a=0.004, harm=(1,0.3,0.1)):
    x=t(dur); s=sum(h*np.sin(2*np.pi*f*(i+1)*x) for i,h in enumerate(harm)); return s*env(len(x),a,d)
def tap():
    x=t(0.06); click=np.sin(2*np.pi*1700*x)*env(len(x),0.0008,0.012)
    thump=np.sin(2*np.pi*190*x)*env(len(x),0.001,0.02)
    noise=lowpass(rng.standard_normal(len(x)),6)*env(len(x),0.0005,0.006)
    return 0.5*click+0.6*thump+0.25*noise
def whoosh(dur=0.55, rise=True):
    n=int(dur*SR); w=rng.standard_normal(n)
    k=np.linspace(40,6,n) if rise else np.linspace(6,40,n)
    out=np.zeros(n); seg=2400
    for s in range(0,n,seg):
        kk=int(k[s]); out[s:s+seg]=lowpass(w[s:s+seg+kk],kk)[:len(out[s:s+seg])]
    return out*np.sin(np.pi*np.linspace(0,1,n))**1.6*1.4
def swish(): return whoosh(0.28, True)*0.6
def chime(notes, gap=0.07, d=0.35):
    out=np.zeros(int((gap*len(notes)+1.2)*SR))
    for j,f in enumerate(notes):
        s=tone(f,1.2,d,0.003,(1,0.25,0.08)); i=int(j*gap*SR); out[i:i+len(s)]+=s
    return out
def ping(): return tone(1320,0.9,0.25,0.002,(1,0.15))*0.5
def chord():
    fs=[261.63,329.63,392.0,523.25]; x=t(2.2)
    s=sum(np.sin(2*np.pi*f*x)+0.3*np.sin(2*np.pi*2*f*x) for f in fs)
    return s*np.minimum(x/0.08,1)*np.exp(-x/0.9)*0.25
def road(dur):
    # rumor de carretera: ruido grave con leve vaivén
    n=int(dur*SR); w=lowpass(lowpass(rng.standard_normal(n),60),30)
    x=np.arange(n)/SR; w*= (1+0.15*np.sin(2*np.pi*0.7*x))
    fade=np.minimum(np.minimum(x/0.4,1),np.minimum((dur-x)/0.6,1))
    return w/np.max(np.abs(w))*fade
def app_alert():
    # el mismo sonido que usa la app (routeEngine.ts): 880 Hz y 1320 Hz, 0,18 s entre notas
    out=np.zeros(int(0.8*SR))
    for j,f in enumerate([880,1320]):
        x=t(0.3); e=np.minimum(x/0.02,1)*np.exp(-np.maximum(x-0.02,0)/0.06)
        s=np.sin(2*np.pi*f*x)*e; i=int(j*0.18*SR); out[i:i+len(s)]+=s
    return out
def buzz():
    # vibración del teléfono: dos pulsos graves
    out=np.zeros(int(0.5*SR))
    for st in (0,0.2):
        x=t(0.12); s=np.sign(np.sin(2*np.pi*150*x))*0.3*lowpass(np.ones(len(x)),200)
        s=lowpass(s,20)*np.minimum(x/0.01,1)*np.minimum((0.12-x)/0.02,1); i=int(st*SR); out[i:i+len(s)]+=s
    return out

# ── Música original (sintetizada aquí, sin derechos de terceros) ─────────
BPM=96; BEAT=60/BPM
ML=np.zeros(N); MR=np.zeros(N)
def madd(sig, sec, gain=1.0, pan=0.0):
    i=int(sec*SR); n=min(len(sig), N-i)
    if n<=0: return
    ML[i:i+n]+=sig[:n]*gain*(1-max(pan,0)); MR[i:i+n]+=sig[:n]*gain*(1+min(pan,0))
def midi(m): return 440*2**((m-69)/12)
# La menor 7 · Fa maj7 · Do · Sol6 (2 compases de 4 tiempos c/u = 8 tiempos)
CH=[[57,60,64,67],[53,57,60,64],[48,55,60,64],[55,59,62,64]]
BASS=[45,41,36,43]
def pad(notes, dur):
    x=t(dur); s=np.zeros(len(x))
    for m in notes:
        f=midi(m)
        for det in (-0.004,0.004):
            ff=f*(1+det); s+=np.sin(2*np.pi*ff*x)+0.25*np.sin(2*np.pi*2*ff*x)+0.08*np.sin(2*np.pi*3*ff*x)
    e=np.minimum(x/0.6,1)*np.minimum((dur-x)/0.5,1)
    return lowpass(s,8)*e/len(notes)
def pluck(m, d=0.35):
    x=t(0.6); f=midi(m)
    return (np.sin(2*np.pi*f*x)+0.4*np.sin(2*np.pi*2*f*x)*np.exp(-x/0.05))*np.minimum(x/0.003,1)*np.exp(-x/d)
def kick():
    x=t(0.35); f=45+90*np.exp(-x/0.03); ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-x/0.12)
def hat():
    x=t(0.06); w=rng.standard_normal(len(x)); w=w-lowpass(w,4)
    return w*np.exp(-x/0.015)
def bassn(m, dur):
    x=t(dur); f=midi(m)
    return (np.sin(2*np.pi*f*x)+0.2*np.sin(2*np.pi*2*f*x))*np.minimum(x/0.01,1)*np.minimum((dur-x)/0.05,1)
START=3.3           # entra con el teléfono
DRUMS=10.0          # ritmo desde que empieza el viaje
END=29.3            # termina antes del acorde final
bar=0; sec=START
while sec<END:
    k=bar%4; dur=8*BEAT
    madd(pad(CH[k], dur+0.4), sec, 0.55)
    for b8 in range(16):
        st=sec+b8*BEAT/2
        if st>=END: break
        if st>=6.5:   # arpegio suave
            madd(pluck(CH[k][[0,2,1,3,2,1,3,0][b8%8]]+12, 0.25), st, 0.16, pan=0.3 if b8%2 else -0.3)
        if st>=DRUMS:
            if b8%2==0: madd(bassn(BASS[k], BEAT/2*0.9), st, 0.35)
            if b8%4==0: madd(kick(), st, 0.55)
            if b8%2==1: madd(hat(), st, 0.10, pan=0.2)
    bar+=1; sec+=dur
# Volumen de la música: entra suave, baja durante el aviso y sale al final.
tt=np.arange(N)/SR
vol=np.interp(tt,[0,START,START+1.5,16.8,17.0,18.6,19.6,28.6,29.6,99],[0,0,1,1,0.25,0.25,1,1,0,0])
ML*=vol; MR*=vol
# Cola final: acorde de Do que se desvanece sobre el logo
madd(pad([48,52,55,60,64],4.3),29.4,0.5)

# ── Efectos ────────────────────────────────────────────────────────────
def ev_whine(dur):
    # zumbido del motor eléctrico: tono que sube suave
    x=t(dur); f=320+260*(x/dur)
    ph=2*np.pi*np.cumsum(f)/SR
    s=np.sin(ph)+0.3*np.sin(2*ph)+0.1*np.sin(3*ph)
    return s*np.minimum(x/0.5,1)*np.minimum((dur-x)/0.5,1)*0.4
def glint():
    out=np.zeros(int(0.9*SR))
    for j,f in enumerate([2093,2637,3136]):
        s=tone(f,0.6,0.18,0.002,(1,0.1)); i=int(j*0.045*SR); out[i:i+len(s)]+=s
    return out
def bloop():
    x=t(0.12); f=520+380*(x/0.12); ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.minimum(x/0.004,1)*np.exp(-x/0.04)
def lock_click():
    out=np.zeros(int(0.3*SR)); c=tap()
    out[:len(c)]+=c; i=int(0.09*SR); out[i:i+len(c)]+=c*0.8
    return out
def power_on():
    x=t(0.7); f=300+900*(x/0.7)**2; ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.minimum(x/0.02,1)*np.exp(-x/0.35)*0.6

# Gancho: carretera + motor eléctrico + el carro se va
add(road(3.9),0,0.35)
add(ev_whine(3.4),0,0.18)
add(whoosh(0.7,False),88,0.5)
# Teléfono entra / sale
add(whoosh(0.6,True),96,0.55); add(whoosh(0.6,False),878,0.5)
# Toques
for f in [185,248,638]: add(tap(),f,0.9)
add(ping(),188,0.35)                 # modo ruta encendido
add(tone(1600,0.1,0.03),252,0.25)    # cambia a 2 km
for f in [190,252,642]: add(swish(),f,0.4)
# Cada frase nueva: un "pop" muy suave
for f in [110,204,300,404,512,632,720,802]: add(bloop(),f,0.12)
# Acercamientos de cámara
for f in [140,194,280,404,494,516,640,712]: add(whoosh(0.45,True),f,0.22)
# Resaltados
for f in [150,222,416,516,662]: add(glint(),f,0.12)
# Viaje: rumor de carretera + el mapa gira
add(road(8.6),296,0.18)
add(whoosh(0.9,True),410,0.25)
# Aviso de estación: sonido real de la app + vibración
add(app_alert(),510,0.55); add(buzz(),510,0.35)
# Privacidad / pantalla encendida
add(lock_click(),736,0.7)
add(power_on(),812,0.35)
# Cierre: brillo del logo + acorde
add(glint(),900,0.18)
add(chord(),886,0.55)

L=L+ML*0.55; R=R+MR*0.55
mix=np.stack([L,R],1)
mix=mix/np.max(np.abs(mix))*0.8
pcm=(mix*32767).astype('<i2')
import os; os.makedirs('out',exist_ok=True)
with wave.open('out/sfx.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', len(pcm)/SR)
