import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { loadPhotosForStation, savePhoto } from '../utils/photoDb';
import type { StationPhoto } from '../utils/photoDb';

interface Props {
  stationId: string;
  padding?: string;
}

export default function StationPhotos({ stationId, padding = 'px-4 py-3' }: Props) {
  const [photos, setPhotos] = useState<StationPhoto[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    loadPhotosForStation(stationId).then(setPhotos);
  }, [stationId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const photo: StationPhoto = {
        id: `${stationId}_${Date.now()}`,
        stationId,
        dataUrl,
        timestamp: Date.now(),
      };
      await savePhoto(photo);
      setPhotos((prev) => [...prev, photo]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className={`${padding} border-b border-gray-100`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Fotos</p>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {photos.map((p) => (
          <img
            key={p.id}
            src={p.dataUrl}
            alt="Foto del cargador"
            onClick={() => setLightbox(p.dataUrl)}
            className="w-16 h-16 object-cover rounded-lg cursor-pointer flex-shrink-0 hover:opacity-85 transition-opacity border border-gray-100"
          />
        ))}
        <label className="flex-shrink-0 w-16 h-16 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors gap-1">
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleUpload} />
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          <span className="text-[9px] text-gray-400">Subir</span>
        </label>
      </div>

      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Foto ampliada"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
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
