// Aviso de responsabilidad (oct 2026). La app solo pone en contacto a
// conductores y dueños de cargadores; no participa en sus acuerdos. Se
// muestra con una casilla obligatoria al registrarse, al pedir un cargador en
// casa, al verificar la identidad y al publicar un cargador en casa. El
// Worker guarda cada aceptación (terms_acceptances) con TERMS_VERSION — si
// cambias este texto o public/terminos.html, sube la versión allá también.

export const SITE_NAME = 'movilidadelectricagt.com';

const DRIVER_TEXT =
  `${SITE_NAME} es únicamente una plataforma de contacto entre conductores de vehículos eléctricos y propietarios de cargadores. ` +
  'No somos dueños ni operadores de los cargadores, no participamos en los acuerdos de precio, horario, forma de pago ni condiciones de uso, ' +
  'que establecen directamente el usuario y el propietario, y no nos hacemos responsables por daños, pérdidas, accidentes, incumplimientos ' +
  'ni cualquier otro inconveniente que surja de la comunicación o del encuentro entre ambas partes. La revisión de identidad que realizamos ' +
  'confirma únicamente los documentos presentados y no constituye una garantía sobre la conducta de ninguna persona.';

const HOST_TEXT =
  `${SITE_NAME} es únicamente una plataforma de contacto. Tú decides a quién le das acceso a tu cargador, y las condiciones de cada carga ` +
  '(precio, horario, forma de pago, reglas de tu casa) las acuerdas directamente con el conductor. No somos responsables por daños, pérdidas, ' +
  'accidentes, incumplimientos ni cualquier otro inconveniente que surja de la comunicación o del encuentro entre ambas partes. La revisión ' +
  'de identidad de los conductores confirma únicamente los documentos presentados y no garantiza su conducta.';

export function TermsLinks() {
  return (
    <>
      los <a href="/terminos.html" target="_blank" rel="noopener noreferrer" className="underline">Términos de uso</a>
      {' '}y la{' '}
      <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" className="underline">Política de privacidad</a>
    </>
  );
}

interface Props {
  variant: 'driver' | 'host';
  accepted: boolean;
  onChange: (accepted: boolean) => void;
}

// Recuadro con el aviso completo + casilla "Leí y acepto".
export default function TermsNotice({ variant, accepted, onChange }: Props) {
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 space-y-2">
      <p className="text-[11px] font-semibold text-amber-900">Aviso importante</p>
      <p className="text-[11px] leading-relaxed text-amber-900/90">{variant === 'host' ? HOST_TEXT : DRIVER_TEXT}</p>
      <label className="flex items-start gap-2 text-[11px] text-gray-800 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-green-600 w-4 h-4 mt-0.5 flex-shrink-0"
        />
        <span>Leí y acepto este aviso, <TermsLinks />.</span>
      </label>
    </div>
  );
}
