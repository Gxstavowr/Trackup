import type { Viewport } from "next";
import Link from "next/link";
import { logout } from "@/lib/actions/logout";
import NotificationBell from "../notification-bell";
import PortalNav from "./portal-nav";
import LegalLinks from "../legal-links";
import { ICONS } from "./portal-ui";
import { requireClient } from "./require-client";

/**
 * Casca de TODO o lado do aluno (`/portal/*`) — item 23. Mesma identidade dark do coach (tokens
 * de `globals.css`), mas a EXPERIÊNCIA é de aplicativo mobile: barra fixa compacta no topo
 * (marca + sino + sair) e abas fixas no rodapé, coluna única centrada (o aluno é mobile-first,
 * não há sidebar). Corrige o overflow horizontal do cabeçalho antigo: a barra é uma linha só
 * (`min-w-0`, ícones em vez de pílulas com texto) e nada nela quebra em 375px.
 *
 * Guard de role: `requireClient()` aqui e também em cada página (layouts não re-renderizam
 * entre rotas irmãs).
 */

/**
 * PWA/instalabilidade do portal (theme-color + viewport-fit=cover). `themeColor` colore a
 * barra de status/UI do navegador na cor do app (mesmo tom de `--paper` usado no manifest),
 * e `viewportFit: "cover"` estende o conteúdo por trás dos "safe areas" do iOS (notch/home
 * indicator) — necessário para o header/nav fixos deste layout não deixarem uma faixa preta
 * do sistema em iPhones com notch. Exportado como `viewport` (API de metadata do App Router;
 * `themeColor`/`viewport` dentro de `metadata` estão deprecados desde o Next 14), não como
 * `<meta>` manual.
 */
export const viewport: Viewport = {
  themeColor: "#0a0a09",
  viewportFit: "cover",
};

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  await requireClient();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-sunken">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center gap-2 px-4">
          <Link href="/portal" className="flex min-h-11 min-w-0 items-center">
            <span className="flex items-baseline gap-2">
              <span className="font-display text-xl text-ink">Trackly</span>
              <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
                Aluno
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell recipient="client" href="/portal/notificacoes" variant="shell" />
            <Link
              href="/meus-dados"
              aria-label="Privacidade e meus dados"
              className="flex h-11 min-w-11 items-center justify-center rounded-md px-2.5 text-ink-muted transition-colors hover:bg-surface hover:text-brand"
            >
              {ICONS.privacy}
            </Link>
            <form action={logout}>
              <button
                type="submit"
                aria-label="Sair"
                className="flex h-11 min-w-11 items-center justify-center gap-2.5 rounded-md px-2.5 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-brand"
              >
                {ICONS.logout}
                <span className="hidden md:inline">Sair</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col gap-6 px-4 pb-28 pt-6 md:pt-8">
        {children}
        <LegalLinks className="mt-auto pt-6" />
      </main>

      <PortalNav />
    </div>
  );
}
