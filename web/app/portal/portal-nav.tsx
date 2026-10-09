"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ICONS } from "./portal-ui";

/**
 * Barra de abas inferior do aluno (item 23: PRESERVAR a bottom tab bar, mobile-first). Mesmo
 * padrão visual do coach (`coach-nav.tsx`, variante `bottom`): 4 destinos, aba ativa em
 * champagne com filete no topo, área segura do iOS. Client só pelo estado ativo
 * (`usePathname`) — layouts não re-renderizam entre rotas irmãs.
 *
 * Diferente do coach, fica visível em TODOS os tamanhos (o aluno é mobile-first; no desktop a
 * barra continua embaixo, alinhada à coluna de conteúdo).
 */

type Tab = { href: string; label: string; exact?: boolean; icon: ReactNode };

const TABS: Tab[] = [
  { href: "/portal", label: "Início", exact: true, icon: ICONS.home },
  { href: "/portal/treino", label: "Treino", icon: ICONS.workout },
  { href: "/portal/nutricao", label: "Nutrição", icon: ICONS.nutrition },
  { href: "/portal/checkin", label: "Check-in", icon: ICONS.checkin },
];

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export default function PortalNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-sunken pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <li key={tab.href} className="min-w-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[0.68rem] transition-colors ${
                  active ? "text-brand" : "text-ink-muted hover:text-ink"
                }`}
              >
                {tab.icon}
                <span className="max-w-full whitespace-nowrap">{tab.label}</span>
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
