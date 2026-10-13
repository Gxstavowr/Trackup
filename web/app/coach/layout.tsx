import Link from "next/link";
import LegalLinks from "../legal-links";
import { logout } from "@/lib/actions/logout";
import NotificationBell from "../notification-bell";
import CoachNav, { CoachSettingsLink } from "./coach-nav";
import { getPendingEvaluationsCount } from "./pending-evaluations";
import { requireCoach } from "./require-coach";
import Brand from "@/components/brand";
import { Icon } from "@/components/ui";
import { getCoachBilling, PAYMENT_METHOD_PATH } from "@/lib/billing/coach";
import { daysUntilSuspension, isBillingBlocked } from "@/lib/billing/state";
import { OverduePaymentNotice, PaymentConfirmedNotice } from "./billing-notices";

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
  // Assinatura do coach com o Trackly (SyncPay). Sem linha = null = nada muda.
  const billing = await getCoachBilling();

  const logoutForm = (
    <form action={logout}>
      <button
        type="submit"
        className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-brand md:hover:bg-surface"
      >
        {/* 22px = NAV_ICON_SIZE da navegação (constante de módulo client, não importável aqui) */}
        <Icon name="logout" size={22} className="shrink-0" />
        Sair
      </button>
    </form>
  );

  // Plano suspenso/cancelado: `requireCoach` já mandou tudo pra /coach/suspenso, exceto a própria
  // tela e "Minha assinatura" — que abrem numa casca mínima, sem a navegação do app.
  if (isBillingBlocked(billing?.status)) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-line bg-surface-sunken px-4 md:px-8">
          <Brand variant="compact" />
          <div className="ml-auto w-fit">{logoutForm}</div>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-12 pt-6 md:px-8 md:pt-10">
          <div className="mx-auto w-full max-w-4xl">
            {children}
            <LegalLinks className="mt-12" />
          </div>
        </main>
      </div>
    );
  }

  const pendingEvaluations = await getPendingEvaluationsCount();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface-sunken px-4 md:h-screen md:w-[var(--sidebar-w)] md:flex-col md:items-stretch md:gap-6 md:self-start md:border-b-0 md:border-r md:px-3 md:py-6">
        <Link href="/coach" className="flex min-h-11 items-center md:px-3">
          <Brand variant="compact" />
        </Link>

        <CoachNav variant="sidebar" pendingEvaluations={pendingEvaluations} />

        {/* Área secundária: no desktop, separada da navegação operacional; no mobile só o sino
            fica no topo (Configurações e Sair vão para a sheet "Mais"). */}
        <div className="ml-auto flex items-center gap-1 md:ml-0 md:mt-auto md:flex-col md:items-stretch md:gap-1.5 md:border-t md:border-line md:pt-3 md:[&>a]:gap-3 md:[&>a]:px-3 md:[&>a>svg]:size-[22px]">
          <p className="hidden truncate px-3 pb-1 text-xs text-ink-faint md:block">{coach.name}</p>
          <NotificationBell recipient="coach" href="/coach/notificacoes" variant="shell" />
          <div className="hidden md:flex md:flex-col md:gap-1.5">
            <CoachSettingsLink />
            {logoutForm}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pb-12 md:pt-10">
        <div className="mx-auto w-full max-w-4xl">
          {billing?.confirmationPending && billing.status === "active" && <PaymentConfirmedNotice />}
          {children}
          <LegalLinks className="mt-12" />
        </div>
      </main>

      {billing?.status === "overdue" && (
        <OverduePaymentNotice
          daysLeft={daysUntilSuspension(billing.paymentFailedAt, new Date())}
          paymentHref={PAYMENT_METHOD_PATH}
        />
      )}

      <CoachNav variant="bottom" pendingEvaluations={pendingEvaluations}>
        {logoutForm}
      </CoachNav>
    </div>
  );
}
