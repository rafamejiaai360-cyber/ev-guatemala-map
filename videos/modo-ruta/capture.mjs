// Captura pantallas reales de la app en modo ruta, simulando un viaje por la
// CA-1 Oriente (Cuilapa → Los Esclavos) con una geolocalización falsa.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const DIR = process.argv[2] || 'shots';
const PASS = process.argv[3] || 'final'; // 'warm' = solo precarga los cuadros del mapa
fs.mkdirSync(`${DIR}/drive`, { recursive: true });
const route = JSON.parse(fs.readFileSync('data/route.json', 'utf8'));
const stations = fs.readFileSync('data/stations.json', 'utf8');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'es-GT' });
await ctx.route('**/api/**', (r) => {
  const u = r.request().url();
  if (/\/api\/stations(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: stations });
  if (/\/api\/visits/.test(u)) return r.fulfill({ status: 204 });
  if (/\/api\/ratings/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const [lat0, lng0, h0] = route[0];
await ctx.addInitScript(([lat, lng, hd]) => {
  localStorage.setItem('ev_route_hint', '1');
  localStorage.setItem('ev_no_count', '1');
  localStorage.setItem('ev_route_radius', '1');
  let pos = { lat, lng, hd, speed: 0 };
  const watchers = new Map(); let nid = 1;
  const mk = () => ({ coords: { latitude: pos.lat, longitude: pos.lng, accuracy: 8, heading: pos.hd, speed: pos.speed, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() });
  const geo = {
    getCurrentPosition: (ok) => setTimeout(() => ok(mk()), 50),
    watchPosition: (ok) => { const id = nid++; watchers.set(id, ok); setTimeout(() => ok(mk()), 50); return id; },
    clearWatch: (id) => watchers.delete(id),
  };
  Object.defineProperty(navigator, 'geolocation', { get: () => geo });
  window.__push = (la, ln, h, sp) => { pos = { lat: la, lng: ln, hd: h, speed: sp }; watchers.forEach((f) => f(mk())); };
}, [lat0, lng0, h0]);

const page = await ctx.newPage();
const taps = {};
const box = async (name, loc) => { const b = await loc.boundingBox(); taps[name] = b && { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; return b; };
const shot = async (name, wait = 700) => { await page.waitForTimeout(wait); if (PASS !== 'warm') await page.screenshot({ path: `${DIR}/${name}.png` }); console.log('shot', name); };

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await shot('01_map', 500);

const btn = page.getByRole('button', { name: 'Encender modo ruta' });
await box('route_btn', btn);
await btn.tap();
await page.waitForTimeout(400);
await page.evaluate(([a, b, c]) => window.__push(a, b, c, 20), route[0]);
await shot('02_route_on', 1800);
const two = page.locator('.m-route-radii button', { hasText: '2 km' });
await box('radius2', two);
await two.tap();
await shot('03_radius2', 600);
await box('route_bar', page.locator('.m-route'));
await box('compass', page.locator('.m-compass'));

// Viaje: un cuadro por posición.
let alertAt = -1;
const last = Math.min(route.length - 1, 124);
for (let i = 1; i <= last; i++) {
  const [la, ln, hd] = route[i];
  await page.evaluate(([a, b, c]) => window.__push(a, b, c, 22), [la, ln, hd]);
  await page.waitForTimeout(PASS === 'warm' ? 120 : 330);
  if (alertAt < 0 && await page.locator('.m-route-alert').count()) {
    alertAt = i;
    await page.waitForTimeout(450); // termina la animación de entrada
    await box('alert', page.locator('.m-route-alert'));
    await box('alert_ver', page.locator('.m-route-alert-act button'));
    await box('alert_ir', page.locator('.m-route-alert-act a'));
    console.log('alert text', await page.locator('.m-route-alert').innerText());
  }
  if (PASS !== 'warm') await page.screenshot({ path: `${DIR}/drive/${String(i).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 88 });
}
taps.alertAt = alertAt; taps.driveFrames = last;
await box('compass_end', page.locator('.m-compass'));

// Abre la ficha desde el aviso ("Ver").
if (alertAt > 0) {
  await page.locator('.m-route-alert-act button').tap();
  await shot('05_station', 1200);
}
fs.writeFileSync(`${DIR}/taps.json`, JSON.stringify(taps, null, 1));
console.log(JSON.stringify(taps));
await browser.close();
