import type { Vehicle } from '../types';

// Investigación web 6 oct 2026 (solo resúmenes de búsqueda: el entorno no
// pudo abrir los sitios .gt de los distribuidores). Regla: solo se cargan
// datos con fuente de Guatemala (distribuidor oficial o nota de lanzamiento
// local); lo que no se pudo confirmar queda marcado "PENDIENTE" para que
// Rafa lo verifique con las fichas técnicas de las agencias. Los conectores
// (`compatible_connectors`) NO se llenaron: ninguna fuente local los indica, y
// sin ese dato la app no filtra por compatibilidad (mejor no adivinar).
export const vehicles: Vehicle[] = [
  // ── Deepal (Changan Guatemala) ────────────────────────────────────────
  // PENDIENTE: changan.com.gt indica autonomía eléctrica de 475 km (WLTP) para
  // la versión 100 % eléctrica (Q365,000); aquí dice 520 km. Confirmar ficha.
  {
    id: 'deepal-s07-2025',
    brand: 'Deepal',
    model: 'S07',
    year: '2025',
    range_km: 520,
    battery_kwh: 80.1,
    compatible_connectors: ['GBT'],
    adapter_note: 'Puerto GB/T — hoy sin estaciones compatibles en esta red.',
  },
  // ── BYD (Grupo Cofiño) ───────────────────────────────────────────────
  // BYD entró a Guatemala en nov 2024 con Grupo Cofiño (Han, Tang, Seal,
  // Dolphin, Seagull, Yuan Plus…). Fuente: cnevpost.com, byd.com (nota GT).
  {
    id: 'byd-dolphin',
    brand: 'BYD',
    model: 'Dolphin',
    year: '2024',
    range_km: 340,
  },
  {
    id: 'byd-atto3',
    brand: 'BYD',
    // En Guatemala se vende con su nombre chino, Yuan Plus.
    model: 'Atto 3 (Yuan Plus)',
    year: '2025',
    range_km: 420,
  },
  {
    id: 'byd-seal',
    brand: 'BYD',
    model: 'Seal',
    year: '2025',
    range_km: 570,
  },
  // PENDIENTE: el Seal U no aparece en la línea de BYD Guatemala (allá su
  // equivalente es el Song Plus, que se vende como híbrido enchufable DM-i).
  // Confirmar si se elimina.
  {
    id: 'byd-seal-u',
    brand: 'BYD',
    model: 'Seal U',
    year: '2025',
    range_km: 482,
  },
  {
    id: 'byd-han',
    brand: 'BYD',
    model: 'Han',
    year: '2025',
    range_km: 605,
  },
  {
    id: 'byd-tang',
    brand: 'BYD',
    model: 'Tang EV',
    year: '2025',
    range_km: 400,
  },
  {
    // Lanzado en Guatemala por Grupo Cofiño (feb 2025): "hasta 380 km".
    // Fuente: emisorasunidas.com, lahora.gt, crnnoticias.com.
    id: 'byd-seagull',
    brand: 'BYD',
    model: 'Seagull',
    year: '2025',
    range_km: 380,
  },
  {
    // Lanzado en Guatemala (Yuan Pro GS 2025): batería 45,12 kWh, hasta 380 km.
    // Fuente: guatemala.com (lanzamiento local).
    id: 'byd-yuan-pro',
    brand: 'BYD',
    model: 'Yuan Pro',
    year: '2025',
    range_km: 380,
    battery_kwh: 45.12,
  },
  {
    // Lanzado en Guatemala (may 2025). 82,5 kWh y 456 km (WLTC) según la nota
    // de Grupo Cofiño (mismo distribuidor, lanzamiento en Panamá); hay
    // versiones con otra batería. Fuente: emisorasunidas.com, nexo.la.
    id: 'byd-sealion-7',
    brand: 'BYD',
    model: 'Sealion 7',
    year: '2025',
    range_km: 456,
    battery_kwh: 82.5,
  },
  // ── MG (distribuidor oficial: mgautos.gt / mgmotorguatemala.com) ─────
  {
    // Distribuidor GT: "autonomía de hasta 440 km". PENDIENTE confirmar la
    // batería (la página menciona 72 kWh; en otros mercados es 70 kWh).
    id: 'mg-zs-ev',
    brand: 'MG',
    model: 'ZS EV',
    year: '2025',
    range_km: 440,
  },
  {
    // Distribuidor GT: batería 70 kWh, 402 km WLTP (desde Q324,990).
    id: 'mg-marvel-r',
    brand: 'MG',
    model: 'Marvel R Electric',
    year: '2024',
    range_km: 402,
    battery_kwh: 70,
  },
  // ── Great Wall / ORA ─────────────────────────────────────────────────
  // PENDIENTE: no se encontró distribuidor ni venta en Guatemala.
  {
    id: 'ora-funky-cat',
    brand: 'ORA',
    model: 'Funky Cat (03)',
    year: '2024',
    range_km: 420,
  },
  // ── Chery ─────────────────────────────────────────────────────────────
  // PENDIENTE: no se encontró venta del Omoda E5 (EQ5) en Guatemala.
  {
    id: 'chery-omoda-eq5',
    brand: 'Chery',
    model: 'Omoda EQ5',
    year: '2024',
    range_km: 430,
  },
  // ── JETOUR (Grupo Los Tres) ───────────────────────────────────────────
  // PENDIENTE: en Guatemala el Dashing se anunció a gasolina; la versión
  // eléctrica estaba "planeada para 2025". Confirmar si ya se vende.
  {
    id: 'jetour-dashing-ev',
    brand: 'JETOUR',
    model: 'Dashing EV',
    year: '2025',
    range_km: 450,
  },
  // ── JAC (Motores JAC / Grupo Codaca) ─────────────────────────────────
  // Eléctricos lanzados en Guatemala en mayo 2023: E-JS1 (hasta 300 km) y
  // E-JS4 (hasta 400 km). Fuente: guatemala.com, emisorasunidas.com,
  // motoresjac.com.gt. PENDIENTE: el iEV7s no aparece en esa línea.
  {
    id: 'jac-e-js1',
    brand: 'JAC',
    model: 'E-JS1',
    year: '2023',
    range_km: 300,
  },
  {
    id: 'jac-e-js4',
    brand: 'JAC',
    model: 'E-JS4',
    year: '2023',
    range_km: 400,
  },
  {
    id: 'jac-iev7s',
    brand: 'JAC',
    model: 'iEV7s',
    year: '2024',
    range_km: 350,
  },
  // ── Tesla ────────────────────────────────────────────────────────────
  {
    id: 'tesla-model3',
    brand: 'Tesla',
    model: 'Model 3',
    year: '2024',
    battery_kwh: 75.0,
    range_km: 554,
    compatible_connectors: ['CCS2'],
    adapter_note: 'Suele requerir adaptador NACS→CCS2 (importación de EE. UU.).',
  },
  {
    id: 'tesla-model-y',
    brand: 'Tesla',
    model: 'Model Y',
    year: '2024',
    battery_kwh: 75.0,
    range_km: 533,
    compatible_connectors: ['CCS2'],
    adapter_note: 'Suele requerir adaptador NACS→CCS2 (importación de EE. UU.).',
  },
  // ── Hyundai ──────────────────────────────────────────────────────────
  {
    id: 'hyundai-ioniq5',
    brand: 'Hyundai',
    model: 'IONIQ 5',
    year: '2025',
    battery_kwh: 77.4,
    range_km: 481,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'hyundai-ioniq6',
    brand: 'Hyundai',
    model: 'IONIQ 6',
    year: '2025',
    battery_kwh: 77.4,
    range_km: 614,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'hyundai-kona-ev',
    brand: 'Hyundai',
    model: 'Kona Electric',
    year: '2024',
    battery_kwh: 65.4,
    range_km: 490,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  // ── KIA ──────────────────────────────────────────────────────────────
  {
    id: 'kia-ev6',
    brand: 'KIA',
    model: 'EV6',
    year: '2025',
    battery_kwh: 77.4,
    range_km: 528,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'kia-ev9',
    brand: 'KIA',
    model: 'EV9',
    year: '2024',
    battery_kwh: 99.8,
    range_km: 541,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'kia-niro-ev',
    brand: 'KIA',
    model: 'Niro EV',
    year: '2024',
    battery_kwh: 64.8,
    range_km: 460,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  // ── Nissan ───────────────────────────────────────────────────────────
  {
    id: 'nissan-leaf',
    brand: 'Nissan',
    model: 'Leaf',
    year: '2023',
    battery_kwh: 40.0,
    range_km: 270,
    compatible_connectors: ['CHAdeMO', 'J1772'],
  },
  // ── Audi ─────────────────────────────────────────────────────────────
  {
    id: 'audi-etron',
    brand: 'Audi',
    model: 'e-tron 55',
    year: '2024',
    battery_kwh: 95.0,
    range_km: 436,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'audi-q4-etron',
    brand: 'Audi',
    model: 'Q4 e-tron',
    year: '2024',
    battery_kwh: 82.0,
    range_km: 520,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  // ── BMW ──────────────────────────────────────────────────────────────
  {
    id: 'bmw-i4',
    brand: 'BMW',
    model: 'i4',
    year: '2025',
    battery_kwh: 83.9,
    range_km: 590,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'bmw-ix1',
    brand: 'BMW',
    model: 'iX1',
    year: '2024',
    battery_kwh: 64.7,
    range_km: 413,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'bmw-ix3',
    brand: 'BMW',
    model: 'iX3',
    year: '2024',
    battery_kwh: 80.0,
    range_km: 460,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  // ── Mercedes-Benz ────────────────────────────────────────────────────
  {
    id: 'mercedes-eqa',
    brand: 'Mercedes-Benz',
    model: 'EQA 250',
    year: '2024',
    battery_kwh: 66.5,
    range_km: 420,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'mercedes-eqb',
    brand: 'Mercedes-Benz',
    model: 'EQB 350',
    year: '2024',
    battery_kwh: 66.5,
    range_km: 419,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  // ── Volvo ────────────────────────────────────────────────────────────
  {
    id: 'volvo-xc40-recharge',
    brand: 'Volvo',
    model: 'XC40 Recharge',
    year: '2024',
    battery_kwh: 82.0,
    range_km: 418,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'volvo-c40',
    brand: 'Volvo',
    model: 'C40 Recharge',
    year: '2024',
    battery_kwh: 82.0,
    range_km: 437,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  // ── Porsche ──────────────────────────────────────────────────────────
  {
    id: 'porsche-taycan',
    brand: 'Porsche',
    model: 'Taycan',
    year: '2024',
    battery_kwh: 93.4,
    range_km: 484,
    compatible_connectors: ['CCS2', 'Type2'],
  },
  {
    id: 'porsche-cayenne-e',
    brand: 'Porsche',
    model: 'Cayenne E-Hybrid',
    year: '2024',
    battery_kwh: 25.9,
    range_km: 90,
    compatible_connectors: ['Type2', 'J1772'],
    adapter_note: 'Solo carga AC — confirma si tu puerto es Type2 o J1772.',
  },
];
