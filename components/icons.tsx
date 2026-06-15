// Lightweight inline icons (no external icon dependency).
// All use currentColor so they inherit text color.

type P = { className?: string };
const base = (className?: string) => ({
  className,
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: "false" as const,
});

export const Phone = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
  </svg>
);

export const Mail = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);

export const MapPin = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const Check = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ChevronDown = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ChevronLeft = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const ChevronRight = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const ArrowRight = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

export const Star = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
  </svg>
);

export const Camera = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

export const Clock = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

export const Shield = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const Dollar = ({ className }: P) => (
  <svg {...base(className)}>
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

export const Car = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M19 17h2v-3.28a2 2 0 0 0-.59-1.42l-1.33-1.33-1.4-3.5A2 2 0 0 0 15.83 6H8.17a2 2 0 0 0-1.85 1.25l-1.4 3.5-1.33 1.33A2 2 0 0 0 3 13.72V17h2" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
    <path d="M5 11h14" />
  </svg>
);

export const Gift = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8S13 3 16.5 3a2.5 2.5 0 0 1 0 5" />
  </svg>
);

export const Menu = ({ className }: P) => (
  <svg {...base(className)}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

export const X = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const Calendar = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export const Sparkles = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);

export const Quote = ({ className }: P) => (
  <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M7.5 6C5 6 3 8 3 10.5S5 15 7.5 15c0 2-1 3.5-3 4.5l.8 1.5C8.7 19.6 11 16.7 11 12.5 11 8.9 9.5 6 7.5 6Zm10 0C15 6 13 8 13 10.5s2 4.5 4.5 4.5c0 2-1 3.5-3 4.5l.8 1.5C18.7 19.6 21 16.7 21 12.5 21 8.9 19.5 6 17.5 6Z" />
  </svg>
);

export const Upload = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5" />
    <path d="M12 3v12" />
  </svg>
);

export const Trash = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);

export const Search = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const ExternalLink = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

export const Facebook = ({ className }: P) => (
  <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
  </svg>
);

export const Instagram = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
  </svg>
);

export const Lock = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const Tag = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
    <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const Bolt = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);

export const Banknote = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

export const Users = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const Handshake = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m11 17 2 2a1 1 0 0 0 1.41 0l3.3-3.3a2 2 0 0 0 .27-2.5" />
    <path d="m21 3-3.5 3.5-2-2-4 4a2 2 0 0 0 0 2.83l.5.5a2 2 0 0 0 2.83 0L18 12" />
    <path d="M3 6l3.5-3.5 5 5" />
    <path d="m3 6 3 3" />
  </svg>
);

export const MapleLeaf = ({ className }: P) => (
  <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 2l1.3 3.3 2.5-1.6-.6 3 3-.4-1.9 2.4 2.7 1.5-2.9.9 1.6 2.6-3.2-.6.2 2.2-2-1.4-.5 4.6h-1.6l-.5-4.6-2 1.4.2-2.2-3.2.6 1.6-2.6-2.9-.9 2.7-1.5L4.8 6.3l3 .4-.6-3 2.5 1.6L12 2Z" />
  </svg>
);
