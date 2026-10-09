import { useState } from 'react';
import type { ChargerStation } from '../types';
import { useStore } from '../store/useStore';
import { requestStationUse } from '../utils/stationRequestsApi';
import TermsNotice from './TermsNotice';

interface Props {
  station: ChargerStation;
  onClose: () => void;
  onSent: () => void;
}

export default function RequestUseModal({ station, onClose, onSent }: Props) {
  const { authToken, currentUser } = useStore();
  // Se llena con los datos de la cuenta (verificada); se pueden ajustar.
  const [name, setName] = useState(currentUser?.name ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [vehicle, setVehicle] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [preferredDate, setPreferredDate] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Nombre y teléfono son requeridos');
      return;
    }
    if (!accepted) {
      setError('Debes aceptar el aviso para enviar la solicitud');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await requestStationUse({
        stationId: station.id,
        name: name.trim(),
        phone: phone.trim(),
        vehicle: vehicle.trim(),
        preferredDate,
        message: message.trim(),
        acceptedTerms: true,
      }, authToken);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-[9999] p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3 my-auto">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Solicitar uso de esta estación</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Tu solicitud llega primero a un administrador, quien contacta al dueño para coordinar contigo.
          </p>
          {currentUser?.identityStatus === 'verified' && (
            <p className="text-[11px] text-green-700 mt-1.5">
              ✓ Identidad revisada{currentUser.identityPlate ? ` · Placa ${currentUser.identityPlate}` : ''}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-1">Tu nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre completo"
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-1">Teléfono</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5512-3456"
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-1">Vehículo (opcional)</label>
            <input
              type="text"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              placeholder="ej. Deepal S07"
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-1">Fecha deseada (opcional)</label>
            <input
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-1">Mensaje (opcional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Cuéntanos brevemente qué necesitas"
              rows={3}
              maxLength={500}
              className="w-full text-xs border border-gray-200 rounded-md p-2 focus:outline-none focus:border-blue-400 bg-white resize-none leading-relaxed"
            />
          </div>

          <TermsNotice variant="driver" accepted={accepted} onChange={setAccepted} />

          {error && <p className="text-[10px] text-red-500">{error}</p>}

          <div className="flex gap-2 pt-0.5">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 text-xs bg-blue-600 text-white rounded-md py-1.5 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enviando...' : 'Enviar solicitud'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
