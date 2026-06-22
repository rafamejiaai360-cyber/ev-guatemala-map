const MY_REVIEWS_KEY = 'ev_gt_my_reviews';
const MY_PHOTOS_KEY = 'ev_gt_my_photos';

type IdMap = Record<string, string>; // id → stationId

function load(key: string): IdMap {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; }
}
function save(key: string, map: IdMap) {
  localStorage.setItem(key, JSON.stringify(map));
}

export function addMyReview(reviewId: string, stationId: string) {
  const m = load(MY_REVIEWS_KEY);
  m[reviewId] = stationId;
  save(MY_REVIEWS_KEY, m);
}
export function removeMyReview(reviewId: string) {
  const m = load(MY_REVIEWS_KEY);
  delete m[reviewId];
  save(MY_REVIEWS_KEY, m);
}
export function isMyReview(reviewId: string): boolean {
  return reviewId in load(MY_REVIEWS_KEY);
}

export function addMyPhoto(photoId: string, stationId: string) {
  const m = load(MY_PHOTOS_KEY);
  m[photoId] = stationId;
  save(MY_PHOTOS_KEY, m);
}
export function removeMyPhoto(photoId: string) {
  const m = load(MY_PHOTOS_KEY);
  delete m[photoId];
  save(MY_PHOTOS_KEY, m);
}
export function isMyPhoto(photoId: string): boolean {
  return photoId in load(MY_PHOTOS_KEY);
}
