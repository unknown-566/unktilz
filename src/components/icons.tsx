import type { Category } from '../registry';

const base = {
  'aria-hidden': true,
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function CategoryIcon({ category }: { category: Category }) {
  switch (category) {
    case 'audio':
      return (
        <svg {...base}>
          <path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2" />
        </svg>
      );
    case 'video':
      return (
        <svg {...base}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M10 9l5 3-5 3z" />
        </svg>
      );
    case 'image':
      return (
        <svg {...base}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 16l-5-5-9 9" />
        </svg>
      );
    case 'pdf':
      return (
        <svg {...base}>
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case 'minecraft':
      return (
        <svg {...base}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
        </svg>
      );
    case 'calc':
      return (
        <svg {...base}>
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 20v-2M20 14h-2" />
        </svg>
      );
    default:
      return (
        <svg {...base}>
          <path d="M9 4c-2 0-3 1-3 3v2c0 1.5-1 3-2 3 1 0 2 1.5 2 3v2c0 2 1 3 3 3" />
          <path d="M15 4c2 0 3 1 3 3v2c0 1.5 1 3 2 3-1 0-2 1.5-2 3v2c0 2-1 3-3 3" />
        </svg>
      );
  }
}

export const LayersIcon = () => (
  <svg {...base}>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);

export const DownloadIcon = ({ size = 18 }: { size?: number }) => (
  <svg {...base} width={size} height={size}>
    <path d="M12 4v11" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);

export const CopyIcon = ({ size = 18 }: { size?: number }) => (
  <svg {...base} width={size} height={size}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </svg>
);

export const UploadIcon = () => (
  <svg {...base} width={32} height={32} strokeWidth={1.6}>
    <path d="M12 16V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
);

export const SearchIcon = () => (
  <svg {...base} width={18} height={18} strokeWidth={2} style={{ color: 'var(--muted)', flex: 'none' }}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const SwapIcon = ({ rotate }: { rotate: number }) => (
  <svg {...base} width={18} height={18} style={{ transform: `rotate(${rotate}deg)` }}>
    <path d="M4 8h14" />
    <path d="M14 4l4 4-4 4" />
    <path d="M20 16H6" />
    <path d="M10 12l-4 4 4 4" />
  </svg>
);
