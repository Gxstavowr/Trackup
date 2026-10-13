import type { Viewport } from "next";
import Link from "next/link";
import NotificationBell from "../notification-bell";
import PortalNav from "./portal-nav";
import LegalLinks from "../legal-links";
import { requireClient } from "./require-client";
import Brand from "@/components/brand";

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
  themeColor: "#060606",
  viewportFit: "cover",
};

function initialOf(name: string): string {
  return (name.trim().charAt(0) || "A").toLocaleUpperCase("pt-BR");
}

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { client } = await requireClient();

  // `--portal-nav-h` = altura REAL da barra de abas (sem a área segura do iOS). É a fonte única:
  // a nav usa esse valor como altura das abas e o <main> reserva o mesmo espaço (+ safe area +
  // folga) no padding-bottom, então o último cartão/botão de toda tela fica acima da barra.
  // Barras de ação fixas dentro do portal (ex.: check-in) se posicionam com o mesmo valor.
  return (
    <div className="flex flex-1 flex-col [--portal-nav-h:4.25rem]">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-sunken">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center gap-2 px-4">
          <Link href="/portal" className="flex min-h-11 min-w-0 items-center">
            <Brand variant="compact" />
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell recipient="client" href="/portal/notificacoes" variant="shell" />
            <Link
              href="/portal/conta"
              aria-label="Minha conta"
              className="flex size-11 items-center justify-center rounded-full"
            >
              <span
                aria-hidden
                className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface-raised font-display text-sm font-bold text-brand"
              >
                {initialOf(client.name)}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col gap-6 px-4 pb-[calc(var(--portal-nav-h)+env(safe-area-inset-bottom)+2rem)] pt-6 md:pt-8">
        {children}
        <LegalLinks className="mt-auto pt-6" />
      </main>

      <PortalNav />
    </div>
  );
}
