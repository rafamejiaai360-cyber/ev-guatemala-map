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

export async function getAllRatings(): Promise<Record<string, RatingInfo>> {
  const res = await fetch(`${BASE}/ratings`);
  if (!res.ok) return {};
  return res.json();
}
