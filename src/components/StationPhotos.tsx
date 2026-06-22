import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getPhotos, uploadPhoto, deletePhoto, type PhotoItem } from '../utils/reviewsApi';
import { addMyPhoto, removeMyPhoto, isMyPhoto } from '../utils/myContributions';

interface Props {
  stationId: string;
  stationName?: string;
  padding?: string;
}

export default function StationPhotos({ stationId, stationName = '', padding = 'px-4 py-3' }: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    setPhotos([]);
    setLoading(true);
    getPhotos(stationId)
      .then(setPhotos)
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, [stationId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);

    // Optimistic local preview
    const localUrl = URL.createObjectURL(file);
    const tempId = `__temp_${Date.now()}`;
    setPhotos(prev => [...prev, { id: tempId, url: localUrl }]);

    try {
      const base64 = await readAsBase64(file);
      const result = await uploadPhoto({
        stationId,
        stationName,
        imageBase64: base64,
        mimeType: file.type || 'image/jpeg',
        filename: file.name || `photo_${Date.now()}.jpg`,
      });
      // Replace temp with real
      setPhotos(prev => prev.map(p => p.id === tempId ? { id: result.photoId, url: result.url } : p));
      addMyPhoto(result.photoId, stationId);
    } catch {
      // Remove temp on failure
      setPhotos(prev => prev.filter(p => p.id !== tempId));
    } finally {
      URL.revokeObjectURL(localUrl);
      setUploading(false);
    }
  }

  function handleDeleteClick(photoId: string) {
    if (confirmDelete === photoId) {
      performDelete(photoId);
    } else {
      setConfirmDelete(photoId);
      setTimeout(() => setConfirmDelete(c => c === photoId ? null : c), 3000);
    }
  }

  async function performDelete(photoId: string) {
    setDeleting(photoId);
    setConfirmDelete(null);
    try {
      await deletePhoto(photoId, stationId);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
      removeMyPhoto(photoId);
    } catch {
      // silently fail
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className={`${padding} border-b border-gray-100`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Fotos</p>

      {loading ? (
        <p className="text-[10px] text-gray-400">Cargando fotos...</p>
      ) : (
        <div className="flex items-start gap-2 overflow-x-auto pb-1">
          {photos.map((p) => {
            const mine = isMyPhoto(p.id);
            const confirming = confirmDelete === p.id;
            const isDeleting = deleting === p.id;
            return (
              <div key={p.id} className="relative flex-shrink-0">
                <img
                  src={p.url}
                  alt="Foto del cargador"
                  onClick={() => setLightbox(p.url)}
                  className={`w-16 h-16 object-cover rounded-lg cursor-pointer border border-gray-100 hover:opacity-85 transition-opacity ${isDeleting ? 'opacity-30' : p.id.startsWith('__temp_') ? 'opacity-60' : ''}`}
                />
                {mine && !p.id.startsWith('__temp_') && (
                  <button
                    onClick={() => handleDeleteClick(p.id)}
                    disabled={isDeleting}
                    title={confirming ? '¿Confirmar borrar?' : 'Borrar foto'}
                    className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow transition-all ${confirming ? 'bg-red-500 scale-110' : 'bg-gray-400 hover:bg-red-400'}`}
                  >
                    {confirming ? '!' : '×'}
                  </button>
                )}
              </div>
            );
          })}

          {/* Upload button */}
          <label className={`flex-shrink-0 w-16 h-16 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors gap-1 ${uploading ? 'border-green-300 bg-green-50 cursor-wait' : 'border-gray-200 hover:border-green-400 hover:bg-green-50'}`}>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleUpload} disabled={uploading} />
            {uploading ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#86efac" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
                <span className="text-[9px] text-green-500">Subiendo</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <span className="text-[9px] text-gray-400">Subir</span>
              </>
            )}
          </label>
        </div>
      )}

      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Foto ampliada"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
