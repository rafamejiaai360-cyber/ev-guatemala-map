// Insignia azul de "identidad revisada" (oct 2026): el usuario pasó la
// verificación con DPI, selfie y placa. Por ahora se muestra en el panel de
// admin y en el Perfil del propio usuario, no en vistas públicas.
// Misma insignia en verde = "ficha verificada" de un vehículo (nov 2026).
export default function VerifiedBadge({ size = 16, className = '', color = '#2563eb', label = 'Identidad revisada' }: { size?: number; className?: string; color?: string; label?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={className}
      style={{ display: 'inline-flex', flexShrink: 0, verticalAlign: '-0.15em' }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill={color}
          d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z"
        />
        <path fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="m7.8 12.3 2.8 2.8 5.6-5.8" />
      </svg>
    </span>
  );
}
