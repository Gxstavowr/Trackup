"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Drawer, Icon, type IconName } from "@/components/ui";

/**
 * Navegação principal do coach — 6 destinos OPERACIONAIS, na ordem do fluxo de trabalho:
 * Acompanhamento, Avaliações, Alunos, Treinos, Nutrição, Financeiro. Configurações e
 * Notificações ficam numa área SECUNDÁRIA separada (rodapé da sidebar no desktop; topo/sheet
 * "Mais" no mobile).
 *
 * Padrão responsivo:
 *  - md+ (>= 768px): sidebar com os 6 itens + área secundária (notificações, configurações, sair).
 *  - < md: barra inferior com 4 abas — Acompanhamento, Avaliações, Alunos e "Mais". "Mais" abre
 *    uma sheet (Drawer) com Treinos, Nutrição, Financeiro, Configurações e Sair. Seis abas num
 *    celular de 360-390px dariam ~60px por alvo (rótulos truncados); 4 abas mantêm alvos largos
 *    e as 3 tarefas diárias a um toque. Notificações continuam no topo (sino com contador).
 *
 * Componente client só pelo estado ativo (`usePathname`) — layouts não re-renderizam entre
 * rotas irmãs, então o destaque do item ativo não pode ser calculado no servidor. Rotas aninhadas
 * (ex.: /coach/alunos/[id]/treino) mantêm "Alunos" ativo via prefixo.
 */

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** `exact`: só ativo na própria rota (`/coach` não pode ficar ativo em `/coach/alunos`). */
  exact?: boolean;
};

const PRIMARY: NavItem[] = [
  { href: "/coach", label: "Acompanhamento", icon: "tracking", exact: true },
  { href: "/coach/avaliacoes", label: "Avaliações", icon: "checkin" },
  { href: "/coach/alunos", label: "Alunos", icon: "users" },
];

const MORE: NavItem[] = [
  { href: "/coach/treinos", label: "Treinos", icon: "workout" },
  { href: "/coach/nutricao", label: "Nutrição", icon: "nutrition" },
  { href: "/coach/financeiro", label: "Financeiro", icon: "wallet" },
];

const SETTINGS: NavItem = { href: "/coach/configuracoes", label: "Configurações", icon: "settings" };

const ALL_OPERATIONAL = [...PRIMARY, ...MORE];

/** Tamanho dos ícones da navegação (sidebar, abas inferiores e sheet "Mais"). */
const NAV_ICON_SIZE = 22;

/**
 * Item da sidebar (desktop): mesma área clicável (44px de altura, padding e espaço ícone-rótulo)
 * para os destinos principais e para Configurações — o rótulo fica centralizado na altura do ícone.
 */
const SIDEBAR_ITEM = "relative flex min-h-11 items-center gap-3 rounded-md px-3 transition-colors";

function sidebarItemClass(active: boolean): string {
  return `${SIDEBAR_ITEM} ${
    active ? "bg-brand-tint font-semibold text-brand" : "text-ink-muted hover:bg-surface hover:text-ink"
  }`;
}

/** Indicador da seção ativa (barra amarela à esquerda). */
function ActiveBar() {
  return <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-brand" aria-hidden />;
}

function isActive(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Badge numérico — só aparece com contagem > 0 (sem contagem, o item fica limpo). */
function CountBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 text-xs font-medium leading-5 text-on-accent ${className}`}
      aria-label={`${count} pendente${count > 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function CoachNav({
  variant,
  pendingEvaluations = 0,
  children,
}: {
  variant: "sidebar" | "bottom";
  /** Contagem de avaliações pendentes (hoje sempre 0 — ver `pending-evaluations.ts`). */
  pendingEvaluations?: number;
  /** Só na variante `bottom`: ação extra no fim da sheet "Mais" (ex.: form de Sair). */
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  if (variant === "bottom") {
    const moreActive = [...MORE, SETTINGS].some((item) => isActive(pathname, item));
    const tabBase =
      "relative flex min-h-14 w-full flex-col items-center justify-center gap-1 px-0.5 pb-1.5 pt-2 text-[0.6875rem] min-[400px]:text-xs transition-colors";

    return (
      <>
        <nav
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-sunken pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <ul className="grid grid-cols-4">
            {PRIMARY.map((item) => {
              const active = isActive(pathname, item);
              const badge = item.href === "/coach/avaliacoes" ? pendingEvaluations : 0;
              return (
                <li key={item.href} className="min-w-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`${tabBase} ${
                      active ? "font-semibold text-brand" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <span className="relative">
                      <Icon name={item.icon} size={NAV_ICON_SIZE} strokeWidth={active ? 2.1 : 1.75} />
                      <CountBadge count={badge} className="absolute -right-3 -top-2" />
                    </span>
                    <span className="max-w-full whitespace-nowrap tracking-tight">{item.label}</span>
                    {active && (
                      <span
                        className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-brand"
                        aria-hidden
                      />
                    )}
                  </Link>
                </li>
              );
            })}
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-current={moreActive ? "page" : undefined}
                className={`${tabBase} ${
                  moreActive ? "font-semibold text-brand" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Icon name="more" size={NAV_ICON_SIZE} strokeWidth={moreActive ? 2.4 : 1.75} />
                <span>Mais</span>
                {moreActive && (
                  <span
                    className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-brand"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          </ul>
        </nav>

        <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais">
          <ul className="flex flex-col gap-1">
            {[...MORE, SETTINGS].map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-md px-3 text-base transition-colors ${
                      active
                        ? "bg-brand-tint font-semibold text-brand"
                        : "text-ink hover:bg-surface-raised"
                    }`}
                  >
                    <Icon name={item.icon} size={NAV_ICON_SIZE} className="shrink-0" />
                    <span>{item.label}</span>
                    {active && <Icon name="check" size={16} className="ml-auto" />}
                  </Link>
                </li>
              );
            })}
          </ul>
          {children && <div className="mt-3 border-t border-line pt-3">{children}</div>}
        </Drawer>
      </>
    );
  }

  return (
    <nav aria-label="Navegação principal" className="hidden md:block">
      <ul className="flex flex-col gap-1.5">
        {ALL_OPERATIONAL.map((item) => {
          const active = isActive(pathname, item);
          const badge = item.href === "/coach/avaliacoes" ? pendingEvaluations : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${sidebarItemClass(active)} text-[0.9375rem]`}
              >
                {active && <ActiveBar />}
                <Icon name={item.icon} size={NAV_ICON_SIZE} strokeWidth={active ? 2 : 1.75} className="shrink-0" />
                <span className="truncate leading-5">{item.label}</span>
                <CountBadge count={badge} className="ml-auto" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Configurações — área secundária da sidebar (desktop). No mobile vive na sheet "Mais". */
export function CoachSettingsLink() {
  const pathname = usePathname();
  const active = isActive(pathname, SETTINGS);

  return (
    <Link
      href={SETTINGS.href}
      aria-current={active ? "page" : undefined}
      className={`${sidebarItemClass(active)} text-sm`}
    >
      {active && <ActiveBar />}
      <Icon name={SETTINGS.icon} size={NAV_ICON_SIZE} strokeWidth={active ? 2 : 1.75} className="shrink-0" />
      <span className="truncate leading-5">{SETTINGS.label}</span>
    </Link>
  );
}
