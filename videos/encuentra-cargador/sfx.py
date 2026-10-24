# Efectos de sonido originales sintetizados (sin samples de terceros).
import numpy as np, wave
SR=48000; FPS=30; TOTAL=1285
N=int(TOTAL/FPS*SR)+SR
L=np.zeros(N); R=np.zeros(N)
rng=np.random.default_rng(7)
def t(sec): return np.arange(int(sec*SR))/SR
def add(sig, frame, gain=1.0, pan=0.0):
    i=int(frame/FPS*SR); n=min(len(sig), N-i)
    L[i:i+n]+=sig[:n]*gain*(1-max(pan,0)); R[i:i+n]+=sig[:n]*gain*(1+min(pan,0))
def env(n, a=0.003, d=0.1):
    x=np.arange(n)/SR; return np.minimum(x/a,1)*np.exp(-x/d)
def lowpass(x, k):
    # media móvil simple como filtro pasa-bajos
    return np.convolve(x, np.ones(k)/k, mode='same')
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
    shape=np.sin(np.pi*np.linspace(0,1,n))**1.6
    return out*shape*1.4
def swish(): return whoosh(0.28, True)*0.6
def chime(notes, gap=0.07, d=0.35):
    out=np.zeros(int((gap*len(notes)+1.2)*SR))
    for j,f in enumerate(notes):
        s=tone(f,1.2,d,0.003,(1,0.25,0.08)); i=int(j*gap*SR); out[i:i+len(s)]+=s
    return out
def ping(): return tone(1320,0.9,0.25,0.002,(1,0.15))*0.5
def beep(f): return tone(f,0.16,0.09,0.004,(1,0.5,0.25))
def chord():
    fs=[261.63,329.63,392.0,523.25]; x=t(2.2)
    s=sum(np.sin(2*np.pi*f*x)+0.3*np.sin(2*np.pi*2*f*x) for f in fs)
    e=np.minimum(x/0.08,1)*np.exp(-x/0.9); return s*e*0.25

# Gancho: batería baja
add(beep(880),38,0.35); add(beep(660),46,0.35)
# Teléfono entra / sale
add(whoosh(0.6,True),82,0.55); add(whoosh(0.6,False),1160,0.5)
# Punto azul: ubicación
add(ping(),122,0.35)
# Toques
for f in [282,340,392,448,535,570,660,950,1010,1065]: add(tap(),f,0.9)
# Cambios de pantalla
for f in [288,454,541,666]: add(swish(),f,0.5)
# Adaptador, confirmada, Waze/Google, guardar
add(chime([1318.5,1975.5]),682,0.28)
add(chime([1568.0]),772,0.22)
add(tap()*0.6,852,0.6); add(tap()*0.6,862,0.6)
add(chime([1046.5,1318.5,1568.0,2093.0],0.06),956,0.25)
# Cierre: logo
add(chord(),1171,0.55)

mix=np.stack([L,R],1)
mix=mix/np.max(np.abs(mix))*0.8
pcm=(mix*32767).astype('<i2')
with wave.open('out/sfx.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', len(pcm)/SR)
