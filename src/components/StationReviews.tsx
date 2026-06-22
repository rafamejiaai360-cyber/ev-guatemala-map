import { useState, useEffect } from 'react';
import { getReviews, postReview, updateReview, deleteReview } from '../utils/reviewsApi';
import type { Review } from '../types';
import { useStore } from '../store/useStore';
import { addMyReview, removeMyReview, isMyReview } from '../utils/myContributions';
import StarRating from './StarRating';

interface Props {
  stationId: string;
  stationName: string;
  compact?: boolean;
  padding?: string;
}

export default function StationReviews({ stationId, stationName, compact = false, padding = 'px-4 py-3' }: Props) {
  const { ratings, loadRatings } = useStore();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // New review form
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editText, setEditText] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const ratingInfo = ratings[stationId];

  useEffect(() => {
    setLoading(true);
    setReviews([]);
    setShowForm(false);
    setRating(0);
    setText('');
    setAuthor('');
    setEditingId(null);
    setConfirmDeleteId(null);
    getReviews(stationId)
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [stationId]);

  // ── Post new review ──────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) { setError('Selecciona una calificación'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const result = await postReview({ stationId, stationName, rating, text, author: author.trim() || 'Anónimo' });
      addMyReview(result.id, stationId);
      setShowForm(false);
      setRating(0);
      setText('');
      setAuthor('');
      const updated = await getReviews(stationId);
      setReviews(updated);
      loadRatings();
    } catch {
      setError('No se pudo enviar. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Edit review ───────────────────────────────────────────────────────────────

  function startEdit(r: Review) {
    setEditingId(r.id);
    setEditRating(r.rating);
    setEditText(r.text);
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleEditSubmit(e: React.FormEvent, reviewId: string) {
    e.preventDefault();
    if (!editRating) return;
    setEditSubmitting(true);
    try {
      await updateReview(reviewId, { rating: editRating, text: editText });
      setReviews(prev => prev.map(r =>
        r.id === reviewId ? { ...r, rating: editRating, text: editText } : r
      ));
      setEditingId(null);
      loadRatings();
    } catch {
      // silently fail
    } finally {
      setEditSubmitting(false);
    }
  }

  // ── Delete review ─────────────────────────────────────────────────────────────

  function handleDeleteClick(reviewId: string) {
    if (confirmDeleteId === reviewId) {
      performDelete(reviewId);
    } else {
      setConfirmDeleteId(reviewId);
      setTimeout(() => setConfirmDeleteId(c => c === reviewId ? null : c), 3000);
    }
  }

  async function performDelete(reviewId: string) {
    setDeletingId(reviewId);
    setConfirmDeleteId(null);
    try {
      await deleteReview(reviewId);
      setReviews(prev => prev.filter(r => r.id !== reviewId));
      removeMyReview(reviewId);
      loadRatings();
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const displayed = compact ? reviews.slice(0, 3) : reviews;

  return (
    <div className={padding}>
      {/* Header: title + avg rating + add button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Reseñas</p>
          {ratingInfo && (
            <span className="flex items-center gap-1">
              <StarRating value={ratingInfo.avg} size="sm" />
              <span className="text-xs font-semibold text-gray-700">{ratingInfo.avg.toFixed(1)}</span>
              <span className="text-[10px] text-gray-400">({ratingInfo.count})</span>
            </span>
          )}
        </div>
        {!showForm && !editingId && (
          <button
            onClick={() => setShowForm(true)}
            className="text-[10px] text-green-600 hover:text-green-700 font-semibold transition-colors"
          >
            + Dejar reseña
          </button>
        )}
      </div>

      {/* New review form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-green-50 border border-green-100 rounded-lg p-3 space-y-2 mb-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Calificación</label>
            <StarRating value={rating} size="md" onChange={setRating} />
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="¿Cómo fue tu experiencia? (opcional)"
            rows={2}
            maxLength={500}
            className="w-full text-xs border border-gray-200 rounded-md p-2 focus:outline-none focus:border-green-400 bg-white resize-none"
          />
          <input
            type="text"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="Tu nombre (opcional)"
            maxLength={50}
            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-green-400 bg-white"
          />
          {error && <p className="text-[10px] text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !rating}
              className="flex-1 text-xs bg-green-600 text-white rounded-md py-1.5 font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Enviando...' : 'Publicar reseña'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Reviews list */}
      {loading ? (
        <p className="text-xs text-gray-400 text-center py-3">Cargando reseñas...</p>
      ) : displayed.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">Sé el primero en opinar</p>
      ) : (
        <ul className="space-y-2.5">
          {displayed.map((r) => {
            const mine = isMyReview(r.id);
            const isEditing = editingId === r.id;
            const isDeleting = deletingId === r.id;
            const confirmingDelete = confirmDeleteId === r.id;

            return (
              <li
                key={r.id}
                className={`border-b border-gray-50 pb-2.5 last:border-0 last:pb-0 transition-opacity ${isDeleting ? 'opacity-30' : ''}`}
              >
                {isEditing ? (
                  /* ── Inline edit form ── */
                  <form onSubmit={e => handleEditSubmit(e, r.id)} className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 space-y-2">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Calificación</label>
                      <StarRating value={editRating} size="md" onChange={setEditRating} />
                    </div>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={2}
                      maxLength={500}
                      className="w-full text-xs border border-gray-200 rounded-md p-2 focus:outline-none focus:border-amber-400 bg-white resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={editSubmitting || !editRating}
                        className="flex-1 text-xs bg-amber-500 text-white rounded-md py-1.5 font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                      >
                        {editSubmitting ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                      <button type="button" onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 px-3">
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  /* ── Review display ── */
                  <>
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <StarRating value={r.rating} size="sm" />
                        <span className="text-[10px] font-medium text-gray-700">{r.author}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-gray-400">
                          {new Date(r.date).toLocaleDateString('es-GT')}
                        </span>
                        {mine && (
                          <>
                            <button
                              onClick={() => startEdit(r)}
                              className="text-[10px] text-blue-400 hover:text-blue-600 transition-colors"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteClick(r.id)}
                              className={`text-[10px] transition-colors font-medium ${confirmingDelete ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}
                            >
                              {confirmingDelete ? '¿Borrar?' : 'Borrar'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {r.text && <p className="text-xs text-gray-600 leading-relaxed">{r.text}</p>}
                  </>
                )}
              </li>
            );
          })}
          {compact && reviews.length > 3 && (
            <li className="text-[10px] text-gray-400 text-center pt-1">
              +{reviews.length - 3} reseña{reviews.length - 3 !== 1 ? 's' : ''} más
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
