import { useState } from 'react';

interface Props {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (rating: number) => void;
}

const PX: Record<string, number> = { sm: 10, md: 14, lg: 18 };

export default function StarRating({ value, size = 'md', onChange }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const px = PX[size] ?? 14;
  const display = hovered ?? value;

  return (
    <span className="inline-flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = display >= star - 0.5;
        return (
          <svg
            key={star}
            width={px}
            height={px}
            viewBox="0 0 24 24"
            fill={filled ? '#f59e0b' : 'none'}
            stroke={filled ? '#f59e0b' : '#d1d5db'}
            strokeWidth={1.5}
            style={onChange ? { cursor: 'pointer' } : undefined}
            onMouseEnter={onChange ? () => setHovered(star) : undefined}
            onMouseLeave={onChange ? () => setHovered(null) : undefined}
            onClick={onChange ? () => onChange(star) : undefined}
          >
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
          </svg>
        );
      })}
    </span>
  );
}
