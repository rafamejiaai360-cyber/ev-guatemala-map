import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { getMyIdentity, photoToJpeg, submitIdentity, type IdentityKind, type MyIdentity } from '../utils/identityApi';
import TermsNotice from './TermsNotice';

interface Props {
  onClose: () => void;
}

const SLOTS: { kind: IdentityKind; label: string; hint: string }[] = [
  { kind: 'dpi_front', label: 'DPI · frente', hint: 'Que se lea bien, sin reflejos' },
  { kind: 'dpi_back', label: 'DPI · reverso', hint: 'El lado de atrás completo' },
  { kind: 'selfie', label: 'Selfie con tu DPI', hint: 'Sostén el DPI junto a tu cara' },
  { kind: 'car', label: 'Tu carro con la placa', hint: 'Que se vea la placa completa' },
];

type Photos = Partial<Record<IdentityKind, { base64: string; preview: string }>>;

// Verificación de identidad (oct 2026): una sola vez por cuenta, requisito
// para pedir un cargador en casa. Las fotos del DPI solo las ve el admin y se
// borran de la app en máximo 7 días; al dueño solo le llega el nombre, la foto
// del carro y la placa. Ver "Verificación de identidad" en worker/index.ts.
export default function IdentityVerifyModal({ onClose }: Props) {
  const { authToken, loadCurrentUser } = useStore();
  const [info, setInfo] = useState<MyIdentity | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resubmit, setResubmit] = useState(false);
  const [photos, setPhotos] = useState<Photos>({});
  const [busySlot, setBusySlot] = useState<IdentityKind | null>(null);
  const [plate, setPlate] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyIdentity(authToken)
      .then((r) => {
        if (!alive) return;
        setInfo(r);
        // Si el admin la resolvió después de abrir la app, actualiza la cuenta
        // para que la ficha muestre ya el botón correcto.
        if (r.status !== useStore.getState().currentUser?.identityStatus) loadCurrentUser();
      })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : 'No se pudo cargar'); });
    return () => { alive = false; };
  }, [authToken, loadCurrentUser]);

  async function pick(kind: IdentityKind, file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusySlot(kind);
    try {
      const p = await photoToJpeg(file);
      setPhotos((cur) => ({ ...cur, [kind]: p }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la foto');
    } finally {
      setBusySlot(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const missing = SLOTS.find((s) => !photos[s.kind]);
    if (missing) { setError(`Falta la foto: ${missing.label}`); return; }
    if (!plate.trim()) { setError('Escribe la placa de tu carro'); return; }
    if (!accepted) { setError('Debes aceptar el aviso para continuar'); return; }
    setSubmitting(true);
    try {
      await submitIdentity(authToken, {
        plate: plate.trim(),
        acceptedTerms: true,
        dpi_front: photos.dpi_front!.base64,
        dpi_back: photos.dpi_back!.base64,
        selfie: photos.selfie!.base64,
        car: photos.car!.base64,
      });
      setPhotos({});
      setSent(true);
      await loadCurrentUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setSubmitting(false);
    }
  }

  const status = info?.status;
  const showForm = !sent && info && (status === 'none' || status === 'rejected' || (status === 'verified' && resubmit)) && !info.pendingSince;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center p-4 bg-black/50 overflow-y-auto overscroll-contain"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto p-5 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Verifica tu identidad</h2>
            <p className="text-xs text-gray-500 mt-0.5">Se hace una sola vez. Protege a los dueños que abren su casa para que cargues.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-gray-400 text-xl leading-none">×</button>
        </div>

        {!info && !loadError && <p className="text-sm text-gray-400 py-6 text-center">Cargando…</p>}
        {loadError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{loadError}</p>}

        {sent && (
          <div className="rounded-xl bg-green-50 p-4 text-sm text-green-800 space-y-1">
            <p className="font-semibold">¡Listo! Recibimos tus fotos.</p>
            <p className="text-xs">Un administrador las revisará pronto. Cuando tu identidad esté revisada podrás solicitar cargadores en casa.</p>
          </div>
        )}

        {!sent && info?.pendingSince && (
          <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900 space-y-1">
            <p className="font-semibold">Tu verificación está en revisión</p>
            <p className="text-xs">Un administrador la revisará pronto. Si no se revisa en 7 días, tendrás que enviarla otra vez.</p>
          </div>
        )}

        {!sent && status === 'verified' && !resubmit && !info?.pendingSince && (
          <div className="rounded-xl bg-green-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-green-800">✓ Identidad revisada</p>
            {info?.plate && <p className="text-xs text-green-800">Placa registrada: <b>{info.plate}</b></p>}
            <button type="button" onClick={() => setResubmit(true)} className="text-xs text-green-700 underline">
              Cambié de carro: enviar mis datos de nuevo
            </button>
          </div>
        )}

        {showForm && (
          <form onSubmit={submit} className="space-y-4">
            {status === 'rejected' && info?.note && (
              <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
                <b>Tu verificación anterior no se aprobó:</b> {info.note} Puedes enviarla de nuevo.
              </p>
            )}
            {info?.note && status === 'none' && (
              <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{info.note}</p>
            )}

            <ul className="text-xs text-gray-600 space-y-1.5">
              <li>🔒 Tu DPI y tu selfie <b>solo los ve el administrador</b>. El dueño del cargador nunca los ve.</li>
              <li>🗑️ Se borran de la app en <b>máximo 7 días</b>.</li>
              <li>🚗 El dueño solo verá tu nombre, la foto de tu carro y tu placa, para reconocerte cuando llegues.</li>
            </ul>

            <div className="grid grid-cols-2 gap-2.5">
              {SLOTS.map((s) => {
                const p = photos[s.kind];
                return (
                  <label key={s.kind} className="block cursor-pointer">
                    <div className={`aspect-[4/3] rounded-xl overflow-hidden flex items-center justify-center text-center ${p ? 'bg-gray-100' : 'bg-gray-50 border border-dashed border-gray-300'}`}>
                      {busySlot === s.kind ? (
                        <span className="text-[11px] text-gray-400">Procesando…</span>
                      ) : p ? (
                        <img src={p.preview} alt={s.label} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-gray-500 px-2">
                          <span className="block text-xl leading-none mb-1">📷</span>
                          Tomar o elegir foto
                        </span>
                      )}
                    </div>
                    <span className="block text-xs font-medium text-gray-800 mt-1">{s.label}{p && ' ✓'}</span>
                    <span className="block text-[10px] text-gray-400">{p ? 'Toca para cambiarla' : s.hint}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { pick(s.kind, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="idv-plate">Placa de tu carro</label>
              <input
                id="idv-plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="ej. P-123ABC"
                autoCapitalize="characters"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-400 uppercase"
              />
            </div>

            <TermsNotice variant="driver" accepted={accepted} onChange={setAccepted} />

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={submitting || busySlot !== null}
              className="w-full py-2.5 rounded-full bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? 'Enviando…' : 'Enviar para revisión'}
            </button>
          </form>
        )}

        {!showForm && (
          <button type="button" onClick={onClose} className="w-full py-2.5 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold">
            Cerrar
          </button>
        )}
      </div>
    </div>
  );
}
