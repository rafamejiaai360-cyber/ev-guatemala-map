// Verificación de identidad (oct 2026) — llamadas al Worker y preparación de
// fotos. Ver "Verificación de identidad" en worker/index.ts.

export type IdentityStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type IdentityKind = 'dpi_front' | 'dpi_back' | 'selfie' | 'car';

export interface MyIdentity {
  status: IdentityStatus;
  plate: string | null;
  note: string | null;
  pendingSince: string | null;
}

export interface IdentitySubmission {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  plate: string;
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  filesStatus: 'stored' | 'deleted' | 'expired';
  expiresAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  filesDeletedAt: string | null;
  createdAt: string;
}

function authHeaders(token: string | null, json = false): HeadersInit {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fail(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({})) as { error?: string };
  throw new Error(data.error || fallback);
}

export async function getMyIdentity(token: string | null): Promise<MyIdentity> {
  const res = await fetch('/api/identity/me', { headers: authHeaders(token) });
  if (!res.ok) return fail(res, 'No se pudo consultar tu verificación');
  return res.json();
}

export async function submitIdentity(
  token: string | null,
  data: { plate: string; acceptedTerms: boolean } & Record<IdentityKind, string>,
): Promise<{ status: IdentityStatus }> {
  const res = await fetch('/api/identity', { method: 'POST', headers: authHeaders(token, true), body: JSON.stringify(data) });
  if (!res.ok) return fail(res, 'No se pudo enviar la verificación');
  return res.json();
}

export async function listIdentity(token: string | null): Promise<IdentitySubmission[]> {
  const res = await fetch('/api/identity', { headers: authHeaders(token) });
  if (!res.ok) return fail(res, 'No se pudieron cargar las verificaciones');
  return res.json();
}

export async function fetchIdentityFile(token: string | null, id: string, kind: IdentityKind): Promise<Blob> {
  const res = await fetch(`/api/identity/${id}/file/${kind}`, { headers: authHeaders(token), cache: 'no-store' });
  if (!res.ok) return fail(res, 'No se pudo abrir la foto');
  return res.blob();
}

export async function identityAction(
  token: string | null, id: string, action: 'approve' | 'reject' | 'purge', body: { note?: string; plate?: string } = {},
): Promise<void> {
  const res = await fetch(`/api/identity/${id}/${action}`, { method: 'POST', headers: authHeaders(token, true), body: JSON.stringify(body) });
  if (!res.ok) return fail(res, 'No se pudo completar la acción');
}

// Convierte cualquier foto a JPEG reducido (máx. `maxSide` px por lado) en el
// navegador: pesa menos al subir y quita los datos ocultos de la foto
// (ubicación GPS, modelo del teléfono), que el canvas no copia. 1600 px
// mantiene legible el texto del DPI.
export async function photoToJpeg(file: File, maxSide = 1600): Promise<{ base64: string; preview: string }> {
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No se pudo leer esa foto. Prueba con otra (JPG o PNG).');
  }
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la foto');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  const preview = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: preview.split(',')[1], preview };
}
