// Convierte una carpeta de video (con video.json) en un MP4 vertical con audio.
//
//   node marketing/video-kit/render.cjs marketing/videos/<nombre>            → <nombre>.mp4
//   node marketing/video-kit/render.cjs marketing/videos/<nombre> --preview  → preview.jpg (cuadros sueltos)
//
// Requiere: Chromium + Playwright (ya instalados en el entorno), ffmpeg y python3 con numpy.
// El estilo vive en engine.html y audio.py; aquí no se decide nada de diseño.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KIT = __dirname;
const dir = path.resolve(process.argv[2] || '');
const preview = process.argv.includes('--preview');
const FPS = 30;
if (!fs.existsSync(path.join(dir, 'video.json'))) { console.error('Falta video.json en', dir); process.exit(1); }
const video = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
video.base = 'file://' + dir + '/';
const name = video.name || path.basename(dir);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => console.error('Error en la página:', e.message));
  await page.addInitScript((v) => { window.VIDEO = v; }, video);
  await page.goto('file://' + path.join(KIT, 'engine.html'));
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  const total = await page.evaluate(() => window.TOTAL);
  const cues = await page.evaluate(() => window.CUES);

  if (preview) {
    // Un cuadro a la mitad de cada escena, en una sola hoja
    const mids = []; let acc = 0;
    for (const s of video.scenes) { mids.push(acc + s.dur * 0.65); acc += s.dur; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evprev-'));
    const files = [];
    for (const [i, t] of mids.entries()) {
      await page.evaluate((x) => window.seek(x), t);
      const f = path.join(tmp, `p${i}.jpg`); await page.screenshot({ path: f, type: 'jpeg', quality: 80 }); files.push(f);
    }
    await browser.close();
    const cols = Math.min(6, files.length), rows = Math.ceil(files.length / cols);
    const args = ['-loglevel', 'error', '-y']; files.forEach((f) => args.push('-i', f));
    while (files.length < cols * rows) { args.push('-f', 'lavfi', '-i', 'color=c=0x050906:s=1080x1920'); files.push('pad'); }
    const layout = files.map((_, i) => `${(i % cols) ? (Array.from({ length: i % cols }, () => 'w0').join('+')) : '0'}_${Math.floor(i / cols) ? Array.from({ length: Math.floor(i / cols) }, () => 'h0').join('+') : '0'}`).join('|');
    args.push('-filter_complex', `${files.map((_, i) => `[${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout},scale=${cols * 300}:-1`, '-frames:v', '1', path.join(dir, 'preview.jpg'));
    execFileSync('ffmpeg', args);
    console.log('Vista previa:', path.join(dir, 'preview.jpg'));
    return;
  }

  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'evframes-'));
  const n = Math.round(total * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((x) => window.seek(x), i / FPS);
    await page.screenshot({ path: path.join(frames, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (i % 150 === 0) console.log(`cuadro ${i}/${n}`);
  }
  await browser.close();

  const cuesFile = path.join(frames, 'cues.json');
  fs.writeFileSync(cuesFile, JSON.stringify({ total, cues }));
  const wav = path.join(frames, 'audio.wav');
  execFileSync('python3', ['-I', path.join(KIT, 'audio.py'), cuesFile, wav], { stdio: 'inherit' });

  const out = path.join(dir, `${name}.mp4`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frames, 'f%05d.jpg'), '-i', wav,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
    '-af', 'loudnorm=I=-15:TP=-1.5:LRA=7', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log('Listo:', out);
})();
