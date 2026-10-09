import Link from "next/link";
import LegalLinks from "../legal-links";
import { logout } from "@/lib/actions/logout";
import NotificationBell from "../notification-bell";
import CoachNav, { CoachSettingsLink } from "./coach-nav";
import { getPendingEvaluationsCount } from "./pending-evaluations";
import { requireCoach } from "./require-coach";

/**
 * Casca de TODO o lado do coach (`/coach/*`): sidebar no desktop (o coach trabalha
 * desktop-first), barra compacta no topo + abas fixas no rodapé no mobile.
 *
 * Um único `<aside>` que muda de forma por breakpoint (topo horizontal -> coluna lateral),
 * em vez de dois blocos duplicados — assim o sino de notificações (Server Component que
 * consulta o banco) é renderizado e consultado UMA vez só. Só a lista de destinos aparece
 * duas vezes (`CoachNav` sidebar + bottom), e é um componente client barato.
 *
 * Guard de role: `requireCoach()` aqui, mas as páginas que expõem dado chamam também —
 * layouts não re-renderizam em navegação entre rotas irmãs, então só o layout não basta.
 */
export default async function CoachLayout({ children }: LayoutProps<"/coach">) {
  const { coach } = await requireCoach();
  const pendingEvaluations = await getPendingEvaluationsCount();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface-sunken px-4 md:h-screen md:w-[var(--sidebar-w)] md:flex-col md:items-stretch md:gap-6 md:self-start md:border-b-0 md:border-r md:px-3 md:py-6">
        <Link href="/coach" className="flex min-h-11 items-center md:px-3">
          <span className="flex items-baseline gap-2">
            <span className="font-display text-xl text-ink">Trackly</span>
            <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
              Coach
            </span>
          </span>
        </Link>

        <CoachNav variant="sidebar" pendingEvaluations={pendingEvaluations} />

        <div className="ml-auto flex items-center gap-1 md:ml-0 md:mt-auto md:flex-col md:items-stretch">
          <p className="hidden truncate border-t border-line px-3 pb-2 pt-4 text-xs text-ink-faint md:block">
            {coach.name}
          </p>
          <NotificationBell recipient="coach" href="/coach/notificacoes" variant="shell" />
          <CoachSettingsLink />
          <form action={logout}>
            <button
              type="submit"
              className="flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-md px-2.5 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-brand md:w-full md:justify-start"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="hidden md:block"
              >
                <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9" />
              </svg>
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">
        <div className="mx-auto w-full max-w-4xl">
          {children}
          <LegalLinks className="mt-12" />
        </div>
      </main>

      <CoachNav variant="bottom" pendingEvaluations={pendingEvaluations} />
    </div>
  );
}
