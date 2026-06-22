import { useState } from 'react';
import type { ChargerStation } from '../types';
import { postReview } from '../utils/reviewsApi';
import StarRating from './StarRating';

interface Props {
  station: ChargerStation;
  onSubmitted: () => void;
  onCancel: () => void;
}

export default function ReviewForm({ station, onSubmitted, onCancel }: Props) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) { setError('Selecciona una calificación (1-5 estrellas)'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await postReview({
        stationId: station.id,
        stationName: station.name,
        rating,
        text,
        author: author.trim() || 'Anónimo',
      });
      onSubmitted();
    } catch {
      setError('No se pudo enviar la reseña. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-green-50 border border-green-100 rounded-lg p-3 space-y-3">
      <div>
        <label className="text-[10px] text-gray-500 font-medium block mb-1.5">Calificación</label>
        <StarRating value={rating} size="lg" onChange={setRating} />
      </div>

      <div>
        <label className="text-[10px] text-gray-500 font-medium block mb-1">Comentario (opcional)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="¿Cómo fue tu experiencia?"
          rows={3}
          maxLength={500}
          className="w-full text-xs border border-gray-200 rounded-md p-2 focus:outline-none focus:border-green-400 bg-white resize-none leading-relaxed"
        />
      </div>

      <div>
        <label className="text-[10px] text-gray-500 font-medium block mb-1">Tu nombre (opcional)</label>
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Anónimo"
          maxLength={50}
          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-green-400 bg-white"
        />
      </div>

      {error && <p className="text-[10px] text-red-500">{error}</p>}

      <div className="flex gap-2 pt-0.5">
        <button
          type="submit"
          disabled={submitting || !rating}
          className="flex-1 text-xs bg-green-600 text-white rounded-md py-1.5 font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Enviando...' : 'Publicar reseña'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-500 hover:text-gray-700 px-3 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
