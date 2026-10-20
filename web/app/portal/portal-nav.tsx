"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Icon from "@/components/ui/icon";
import { ICONS } from "./portal-ui";

/**
 * V2 (tarefa 28): Início · Treino · Nutrição · Progresso. Perfil/conta fica no avatar da barra
 * superior; check-in é contextual (cartão no Início). Aba ativa = cor + peso da fonte + pílula
 * atrás do ícone + filete no topo + `aria-current` (nunca só cor). Alvo ≥ 56px de altura.
 *
 * Barra de abas inferior do aluno (item 23: PRESERVAR a bottom tab bar, mobile-first). Mesmo
 * padrão visual do coach (`coach-nav.tsx`, variante `bottom`): 4 destinos, aba ativa em
 * champagne com filete no topo, área segura do iOS. Client só pelo estado ativo
 * (`usePathname`) — layouts não re-renderizam entre rotas irmãs.
 *
 * Altura: as abas medem `--portal-nav-h` menos o filete de 1px do topo (definido no layout,
 * que reserva o mesmo valor no padding do <main>) + `env(safe-area-inset-bottom)`.
 *
 * Diferente do coach, fica visível em TODOS os tamanhos (o aluno é mobile-first; no desktop a
 * barra continua embaixo, alinhada à coluna de conteúdo).
 */

type Tab = { href: string; label: string; exact?: boolean; icon: ReactNode; also?: string[] };

const TABS: Tab[] = [
  // O check-in não é aba: aparece como cartão contextual no Início (quando aberto) e a rota
  // /portal/checkin continua valendo — por isso o Início segue marcado como ativo nela.
  { href: "/portal", label: "Início", exact: true, icon: ICONS.home, also: ["/portal/checkin"] },
  { href: "/portal/treino", label: "Treino", icon: ICONS.workout },
  { href: "/portal/nutricao", label: "Nutrição", icon: ICONS.nutrition },
  { href: "/portal/progresso", label: "Progresso", icon: <Icon name="tracking" />, also: ["/portal/avaliacao"] },
];

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
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
                className={`relative flex h-[calc(var(--portal-nav-h)-1px)] flex-col items-center justify-center gap-1 px-1 pb-2 pt-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                  active ? "font-bold text-brand" : "font-medium text-ink-muted hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-brand-tint" : ""
                  }`}
                >
                  {tab.icon}
                </span>
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
