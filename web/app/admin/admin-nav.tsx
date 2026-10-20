"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui";

/**
 * Navegação PRÓPRIA do painel do proprietário — separada da do coach e da do aluno. Só decide o
 * item ativo (`usePathname`); quem garante o acesso é `requireAdmin()` no servidor (layout, cada
 * página e cada Server Action). Esconder/mostrar este menu não é controle de acesso.
 *
 * Desktop: coluna na sidebar (mesma linguagem do coach: item ativo com fundo do painel, ícone
 * amarelo e filete). Mobile: trilho horizontal de pílulas sob o cabeçalho, com rolagem só dentro
 * dele (a página nunca rola na horizontal).
 */

type Item = { href: string; label: string; icon: IconName; exact?: boolean };

const ITEMS: Item[] = [
  { href: "/admin", label: "Visão geral", icon: "chart", exact: true },
  { href: "/admin/assinaturas", label: "Assinaturas", icon: "wallet" },
  { href: "/admin/coaches", label: "Coaches", icon: "user" },
  { href: "/admin/alunos", label: "Onboarding", icon: "users" },
  { href: "/admin/preco", label: "Preço do Trackly", icon: "settings" },
];

/** Laboratório de demonstração (outro pacote) — separado visualmente das telas de negócio. */
const LAB: Item = { href: "/admin/laboratorio", label: "Laboratório", icon: "refresh" };
const COACH_HOME: Item = { href: "/coach", label: "Meu painel de coach", icon: "home" };

function isActive(pathname: string, item: Item): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const SIDEBAR_ITEM =
  "group relative flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors duration-150 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";

function SidebarLink({ item, pathname }: { item: Item; pathname: string }) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${SIDEBAR_ITEM} ${
        active ? "bg-canvas font-semibold text-ink [&>svg]:text-brand" : "text-ink-muted hover:bg-surface hover:text-ink"
      }`}
    >
      {active && (
        <span className="absolute -right-3 inset-y-1.5 w-[3px] rounded-l-full bg-brand tk-mark-in" aria-hidden />
      )}
      <Icon name={item.icon} size={20} strokeWidth={active ? 2 : 1.6} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function AdminNav({ variant, hasCoachProfile = false }: { variant: "sidebar" | "top"; hasCoachProfile?: boolean }) {
  const pathname = usePathname();
  const railRef = useRef<HTMLUListElement>(null);

  // Celular: o trilho rola sozinho até a pílula ativa (antes "Coaches"/"Laboratório" ficavam
  // cortadas na borda). Só mexe no scroll do trilho, nunca no da página.
  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !active) return;
    const offset = active.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
    const left = offset - (rail.clientWidth - active.offsetWidth) / 2;
    rail.scrollLeft = Math.max(0, left);
  }, [pathname]);

  if (variant === "top") {
    return (
      <nav aria-label="Painel do proprietário" className="min-w-0 md:hidden">
        <ul ref={railRef} className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[...ITEMS, LAB, ...(hasCoachProfile ? [COACH_HOME] : [])].map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
                    active
                      ? "bg-pill-active text-on-pill-active"
                      : item === LAB
                        ? "border border-brand/50 bg-brand-tint text-brand"
                        : "border border-line text-ink-muted hover:text-ink"
                  }`}
                >
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Painel do proprietário" className="hidden md:flex md:flex-col md:gap-5">
      <ul className="flex flex-col gap-1">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <SidebarLink item={item} pathname={pathname} />
          </li>
        ))}
      </ul>
      <div className="border-t border-line pt-3">
        <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">Demonstração</p>
        <div className="rounded-[12px] bg-brand-tint p-1 ring-1 ring-brand/30">
          <SidebarLink item={LAB} pathname={pathname} />
          <p className="px-3 pb-1.5 text-xs leading-snug text-ink-muted">Ver como coach ou aluno</p>
        </div>
      </div>
      {hasCoachProfile && (
        <div className="border-t border-line pt-3">
          <SidebarLink item={COACH_HOME} pathname={pathname} />
        </div>
      )}
    </nav>
  );
}
