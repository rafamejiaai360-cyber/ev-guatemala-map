/** Precio de la carga en quetzales por kWh (oct 2026). Opcional.
 *  En la API: ausente/null = no informado, 0 = gratis. */

/** Texto para mostrar: "Gratis" o "Q3.50 por kWh". */
export function formatPrice(price: number): string {
  return price === 0 ? 'Gratis' : `Q${price.toFixed(2)} por kWh`;
}

/** Valor del formulario → número para la API (null = vacío). `undefined`
 *  si lo escrito no es un precio válido. */
export function parsePriceInput(value: string): number | null | undefined {
  const v = value.trim().replace(',', '.').replace(/^Q\s*/i, '');
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 100) / 100;
}

export function priceToInput(price: number | null | undefined): string {
  return price == null ? '' : String(price);
}

export const PRICE_ERROR = 'El precio por kWh debe ser un número entre 0 y 100 quetzales';
