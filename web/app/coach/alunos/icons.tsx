import type { ReactNode } from "react";

/** Ícones de traço (mesmo estilo da navegação do coach) — só onde ajudam a escanear a lista. */
function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const LinkIcon = () => (
  <Icon>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

/** Acompanhamento (prancheta com check). */
export const TrackingIcon = () => (
  <Icon>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4h6v3H9zM9 14l2 2 4-4" />
  </Icon>
);

/** Financeiro (carteira). */
export const WalletIcon = () => (
  <Icon>
    <path d="M4 7a2 2 0 0 1 2-2h11v3" />
    <rect x="4" y="8" width="16" height="12" rx="2" />
    <path d="M16 14h.01" />
  </Icon>
);

export const FilterIcon = () => (
  <Icon>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
);
