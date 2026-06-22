import type { Review, RatingInfo } from '../types';

export type { Review, RatingInfo };

const BASE = '/api';

export async function getReviews(stationId: string): Promise<Review[]> {
  const res = await fetch(`${BASE}/reviews?stationId=${encodeURIComponent(stationId)}`);
  if (!res.ok) throw new Error('Error cargando reseñas');
  return res.json();
}

export async function postReview(data: {
  stationId: string;
  stationName: string;
  rating: number;
  text: string;
  author: string;
}): Promise<{ id: string; ok: boolean }> {
  const res = await fetch(`${BASE}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Error enviando reseña');
  return res.json();
}

export async function updateReview(id: string, data: { rating?: number; text?: string }): Promise<void> {
  const res = await fetch(`${BASE}/reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Error actualizando reseña');
}

export async function deleteReview(id: string): Promise<void> {
  const res = await fetch(`${BASE}/reviews/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Error eliminando reseña');
}

export async function getAllRatings(): Promise<Record<string, RatingInfo>> {
  const res = await fetch(`${BASE}/ratings`);
  if (!res.ok) return {};
  return res.json();
}

export interface PhotoItem {
  id: string;
  url: string;
}

export async function getPhotos(stationId: string): Promise<PhotoItem[]> {
  const res = await fetch(`${BASE}/photos?stationId=${encodeURIComponent(stationId)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function uploadPhoto(data: {
  stationId: string;
  stationName: string;
  imageBase64: string;
  mimeType: string;
  filename: string;
}): Promise<{ photoId: string; url: string }> {
  const res = await fetch(`${BASE}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Error subiendo foto');
  return res.json();
}

export async function deletePhoto(photoId: string, stationId: string): Promise<void> {
  const res = await fetch(
    `${BASE}/photos?photoId=${encodeURIComponent(photoId)}&stationId=${encodeURIComponent(stationId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error('Error eliminando foto');
}
