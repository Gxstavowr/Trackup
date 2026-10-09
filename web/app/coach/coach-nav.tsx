"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Navegação principal do coach: EXATAMENTE 4 destinos (Acompanhamento -> Avaliações -> Alunos
 * -> Financeiro — o fluxo do produto). Treino, Nutrição, Evolução, Fotos e Histórico NÃO são
 * itens daqui: vivem dentro do contexto do aluno (`/coach/alunos/[id]/...`). Configurações é
 * separado (`CoachSettingsLink`), fora do fluxo operacional.
 *
 * Componente client só pelo estado ativo (`usePathname`) — layouts não re-renderizam entre
 * rotas irmãs, então o destaque do item ativo não pode ser calculado no servidor.
 *
 * Duas variantes do MESMO conjunto de itens: `sidebar` (desktop, coluna vertical) e `bottom`
 * (mobile, barra de abas fixa no rodapé — alcance do polegar). O layout renderiza as duas e o
 * CSS mostra uma por breakpoint.
 */

type NavItem = {
  href: string;
  label: string;
  /** `exact`: só ativo na própria rota (`/coach` não pode ficar ativo em `/coach/alunos`). */
  exact?: boolean;
  icon: ReactNode;
};

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/coach",
    label: "Acompanhamento",
    exact: true,
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
  },
  {
    href: "/coach/avaliacoes",
    label: "Avaliações",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V3h6v1M9 13l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/coach/alunos",
    label: "Alunos",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.8c1.8.7 3 2.4 3 5.2" />
      </svg>
    ),
  },
  {
    href: "/coach/financeiro",
    label: "Financeiro",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M16.5 15h1" />
      </svg>
    ),
  },
];

function isActive(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Badge numérico — só aparece com contagem > 0 (sem contagem, o item fica limpo). */
function CountBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 text-[0.7rem] font-medium leading-5 text-on-accent ${className}`}
      aria-label={`${count} pendente${count > 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function CoachNav({
  variant,
  pendingEvaluations = 0,
}: {
  variant: "sidebar" | "bottom";
  /** Contagem de avaliações pendentes (hoje sempre 0 — ver `pending-evaluations.ts`). */
  pendingEvaluations?: number;
}) {
  const pathname = usePathname();

  if (variant === "bottom") {
    return (
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-sunken pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            const badge = item.href === "/coach/avaliacoes" ? pendingEvaluations : 0;
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[0.68rem] transition-colors ${
                    active ? "text-brand" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <span className="relative">
                    {item.icon}
                    <CountBadge count={badge} className="absolute -right-3 -top-2" />
                  </span>
                  <span className="max-w-full whitespace-nowrap">{item.label}</span>
                  {active && (
                    <span
                      className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand"
                      aria-hidden
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Navegação principal" className="hidden md:block">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
          const badge = item.href === "/coach/avaliacoes" ? pendingEvaluations : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors ${
                  active
                    ? "bg-brand-tint text-brand"
                    : "text-ink-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                <CountBadge count={badge} className="ml-auto" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Configurações — deliberadamente FORA da lista principal (não é fluxo operacional). Ícone
 * de ajustes no mobile (o texto fica no `aria-label`), ícone + texto no desktop.
 */
export function CoachSettingsLink() {
  const pathname = usePathname();
  const active = pathname === "/coach/configuracoes";

  return (
    <Link
      href="/coach/configuracoes"
      aria-label="Configurações"
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-md px-2.5 text-sm transition-colors md:justify-start ${
        active ? "bg-brand-tint text-brand" : "text-ink-muted hover:bg-surface hover:text-ink"
      }`}
    >
      <svg {...ICON_PROPS}>
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2" />
        <circle cx="9" cy="17" r="2" />
      </svg>
      <span className="hidden md:inline">Configurações</span>
    </Link>
  );
}
