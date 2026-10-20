"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Drawer, Icon, type IconName } from "@/components/ui";
import { NAV_ICON_SIZE, SIDEBAR_ITEM } from "./nav-styles";

/**
 * Navegação principal do coach (V5 — sidebar compacta escura, linguagem da referência).
 *
 * Destinos OPERACIONAIS, agrupados (sem repetir rota em lugar nenhum):
 *  - Rotina: Acompanhamento, Avaliações (com contador de pendentes), Alunos, Financeiro.
 *  - Planos: Treinos, Nutrição (bibliotecas/modelos — acesso claro, mas separado do dia a dia).
 * Área SECUNDÁRIA (rodapé da sidebar): Notificações, Configurações e a conta (nome + Sair) —
 * montada no `layout.tsx` com `CoachSettingsLink` + o sino (Server Component).
 *
 * Item ativo: fundo no tom do painel de conteúdo (o item "encosta" no painel), texto branco em
 * negrito, ícone amarelo e um filete amarelo vertical na borda direita da sidebar + `aria-current`
 * (nunca só cor). Alvos de 44px, ícones de 20px alinhados numa coluna fixa.
 *
 * Mobile (< md): barra inferior com 4 abas — Acompanhamento, Avaliações, Alunos e "Mais" (sheet
 * com Financeiro, Treinos, Nutrição, Configurações e Sair). Mesmo padrão do portal do aluno:
 * pílula atrás do ícone ativo + filete no topo. Seis abas num celular de 360-390px truncariam
 * os rótulos; as 3 tarefas diárias ficam a um toque. O `<main>` reserva a altura da barra.
 *
 * Client só pelo estado ativo (`usePathname`) — layouts não re-renderizam entre rotas irmãs.
 * Rotas aninhadas (ex.: /coach/alunos/[id]/treino) mantêm "Alunos" ativo via prefixo.
 */

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** `exact`: só ativo na própria rota (`/coach` não pode ficar ativo em `/coach/alunos`). */
  exact?: boolean;
};

const ROUTINE: NavItem[] = [
  { href: "/coach", label: "Acompanhamento", icon: "tracking", exact: true },
  { href: "/coach/avaliacoes", label: "Avaliações", icon: "checkin" },
  { href: "/coach/alunos", label: "Alunos", icon: "users" },
  { href: "/coach/financeiro", label: "Financeiro", icon: "wallet" },
];

const PLANS: NavItem[] = [
  { href: "/coach/treinos", label: "Treinos", icon: "workout" },
  { href: "/coach/nutricao", label: "Nutrição", icon: "nutrition" },
];

const SETTINGS: NavItem = { href: "/coach/configuracoes", label: "Configurações", icon: "settings" };

/** Só renderizado quando o servidor (layout) confirma que é o proprietário; não é controle de acesso. */
const OWNER: NavItem = { href: "/admin", label: "Painel do proprietário", icon: "privacy" };

/** Abas fixas do celular; o resto vai para a sheet "Mais". */
const MOBILE_TABS = ROUTINE.slice(0, 3);
const MOBILE_MORE: NavItem[] = [ROUTINE[3], ...PLANS, SETTINGS];

function sidebarItemClass(active: boolean): string {
  return `${SIDEBAR_ITEM} ${
    active
      ? "bg-canvas font-semibold text-ink [&>svg]:text-brand"
      : "text-ink-muted hover:bg-surface hover:text-ink"
  }`;
}

/** Filete amarelo da seção ativa — na borda direita da sidebar, encostado no painel. */
function ActiveBar() {
  return (
    <span
      className="absolute -right-3 inset-y-1.5 w-[3px] rounded-l-full bg-brand tk-mark-in"
      aria-hidden
    />
  );
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
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold leading-5 tabular-nums text-on-accent ${className}`}
      aria-label={`${count} pendente${count > 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SidebarLink({ item, pathname, badge = 0 }: { item: NavItem; pathname: string; badge?: number }) {
  const active = isActive(pathname, item);
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={sidebarItemClass(active)}>
      {active && <ActiveBar />}
      <Icon name={item.icon} size={NAV_ICON_SIZE} strokeWidth={active ? 2 : 1.6} className="shrink-0" />
      <span className="truncate">{item.label}</span>
      <CountBadge count={badge} className="ml-auto" />
    </Link>
  );
}

export default function CoachNav({
  variant,
  pendingEvaluations = 0,
  isAdmin = false,
  children,
}: {
  variant: "sidebar" | "bottom";
  /** Avaliações aguardando o coach (contagem real — ver `pending-evaluations.ts`). */
  pendingEvaluations?: number;
  /** Proprietário (checado no servidor): mostra "Painel do proprietário" na sheet "Mais". */
  isAdmin?: boolean;
  /** Só na variante `bottom`: ação extra no fim da sheet "Mais" (ex.: form de Sair). */
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreItems = isAdmin ? [...MOBILE_MORE, OWNER] : MOBILE_MORE;
  const badgeFor = (href: string) => (href === "/coach/avaliacoes" ? pendingEvaluations : 0);

  if (variant === "bottom") {
    const moreActive = MOBILE_MORE.some((item) => isActive(pathname, item));
    const tabBase =
      "relative flex min-h-16 w-full flex-col items-center justify-center gap-1 px-0.5 pb-2 pt-2.5 text-[0.6875rem] min-[400px]:text-xs transition-colors " +
      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";
    const pill = (active: boolean) =>
      `relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-brand-tint" : ""}`;
    const topBar = (
      <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand" aria-hidden />
    );

    return (
      <>
        <nav
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          {/* Colunas desiguais: "Acompanhamento" precisa de ~95px a 11px; "Mais" cabe em bem menos.
              Com 4 colunas iguais o rótulo vazava da aba em telas de 375px. */}
          <ul className="grid grid-cols-[1.3fr_1fr_1fr_0.8fr]">
            {MOBILE_TABS.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href} className="min-w-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`${tabBase} ${active ? "font-bold text-brand" : "font-medium text-ink-muted hover:text-ink"}`}
                  >
                    <span className={pill(active)}>
                      <Icon name={item.icon} size={NAV_ICON_SIZE} strokeWidth={active ? 2.1 : 1.75} />
                      <CountBadge count={badgeFor(item.href)} className="absolute -right-2.5 -top-1.5" />
                    </span>
                    <span className="max-w-full whitespace-nowrap tracking-tight">{item.label}</span>
                    {active && topBar}
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
                className={`${tabBase} ${moreActive ? "font-bold text-brand" : "font-medium text-ink-muted hover:text-ink"}`}
              >
                <span className={pill(moreActive)}>
                  <Icon name="more" size={NAV_ICON_SIZE} strokeWidth={moreActive ? 2.4 : 1.75} />
                </span>
                <span>Mais</span>
                {moreActive && topBar}
              </button>
            </li>
          </ul>
        </nav>

        <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais">
          <ul className="flex flex-col gap-1">
            {moreItems.map((item, i) => {
              const active = isActive(pathname, item);
              // Mesmos grupos da sidebar: rotina (Financeiro) · Planos · Conta.
              const group = i === 1 ? "Planos" : item === SETTINGS ? "Conta" : null;
              return (
                <li key={item.href} className={group ? "mt-2 border-t border-line pt-3" : ""}>
                  {group && (
                    <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                      {group}
                    </p>
                  )}
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`tk-press flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-base transition-colors ${
                      active ? "bg-brand-tint font-semibold text-brand" : "text-ink hover:bg-surface-raised"
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
    <nav aria-label="Navegação principal" className="hidden md:flex md:flex-col md:gap-5">
      <ul className="flex flex-col gap-1">
        {ROUTINE.map((item) => (
          <li key={item.href}>
            <SidebarLink item={item} pathname={pathname} badge={badgeFor(item.href)} />
          </li>
        ))}
      </ul>
      <div className="border-t border-line pt-4">
        <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Planos
        </p>
        <ul className="flex flex-col gap-1">
          {PLANS.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} pathname={pathname} />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** Painel do proprietário — só montado no layout para admin (desktop). */
export function OwnerPanelLink() {
  return (
    <Link href={OWNER.href} className={`${SIDEBAR_ITEM} text-ink-muted hover:bg-surface hover:text-ink`}>
      <Icon name={OWNER.icon} size={NAV_ICON_SIZE} strokeWidth={1.6} className="shrink-0" />
      <span className="truncate">{OWNER.label}</span>
    </Link>
  );
}

/** Configurações — área secundária da sidebar (desktop). No mobile vive na sheet "Mais". */
export function CoachSettingsLink() {
  const pathname = usePathname();
  return <SidebarLink item={SETTINGS} pathname={pathname} />;
}
