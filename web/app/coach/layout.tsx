import Link from "next/link";
import LegalLinks from "../legal-links";
import { logout } from "@/lib/actions/logout";
import NotificationBell from "../notification-bell";
import CoachNav, { CoachSettingsLink, OwnerPanelLink } from "./coach-nav";
import { createClient } from "@/lib/supabase/server";
import { isAdminUserId } from "@/lib/admin/auth";
import { NAV_ICON_SIZE, SIDEBAR_ITEM } from "./nav-styles";
import { getPendingEvaluationsCount } from "./pending-evaluations";
import { requireCoach } from "./require-coach";
import Brand from "@/components/brand";
import { Icon } from "@/components/ui";
import { getCoachBilling, PAYMENT_METHOD_PATH } from "@/lib/billing/coach";
import { daysUntilSuspension, isBillingBlocked } from "@/lib/billing/state";
import { OverduePaymentNotice, PaymentConfirmedNotice } from "./billing-notices";
import DemoBanner from "@/components/demo-banner";

/**
 * Casca de TODO o lado do coach (`/coach/*`): sidebar no desktop (o coach trabalha
 * desktop-first), barra compacta no topo + abas fixas no rodapé no mobile.
 *
 * V5 (referência docs/v5-referencia-vega.png): a sidebar e as barras ficam na MOLDURA preta
 * (`--paper`) e o conteúdo vive num PAINEL grafite (`bg-canvas`) com cantos grandes — os
 * cartões (`--surface`) aparecem um degrau mais escuros dentro dele.
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
        className={`${SIDEBAR_ITEM} w-full text-ink-muted hover:bg-surface-raised hover:text-ink md:hover:bg-surface`}
      >
        <Icon name="logout" size={NAV_ICON_SIZE} className="shrink-0" />
        Sair
      </button>
    </form>
  );

  // Plano suspenso/cancelado: `requireCoach` já mandou tudo pra /coach/suspenso, exceto a própria
  // tela e "Minha assinatura" — que abrem numa casca mínima, sem a navegação do app.
  if (isBillingBlocked(billing?.status)) {
    return (
      <>
      <DemoBanner area="coach" />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 bg-paper px-4 md:px-8">
          <Brand variant="compact" />
          <div className="ml-auto w-fit">{logoutForm}</div>
        </header>
        <main className="min-w-0 flex-1 rounded-t-[var(--radius-xl)] bg-canvas px-4 pb-12 pt-6 md:mx-3 md:px-8 md:pt-10">
          <div className="mx-auto w-full max-w-4xl">
            {children}
            <LegalLinks className="mt-12" />
          </div>
        </main>
      </div>
      </>
    );
  }

  const pendingEvaluations = await getPendingEvaluationsCount();
  // Proprietário: autorização no servidor; o cliente só recebe o boolean para exibir o atalho.
  const {
    data: { user: sessionUser },
  } = await (await createClient()).auth.getUser();
  const isAdmin = isAdminUserId(sessionUser?.id);

  return (
    <>
    <DemoBanner area="coach" />
    <div className="flex flex-1 flex-col bg-paper md:flex-row">
      <aside className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-paper px-4 md:h-screen md:w-[var(--sidebar-w)] md:flex-col md:items-stretch md:gap-7 md:self-start md:px-3 md:pb-4 md:pt-5">
        <Link
          href="/coach"
          aria-label="Trackly — Acompanhamento"
          className="flex min-h-11 items-center rounded-[10px] focus-visible:outline-2 focus-visible:outline-brand md:px-3"
        >
          <Brand variant="compact" />
        </Link>

        <CoachNav variant="sidebar" pendingEvaluations={pendingEvaluations} />

        {/* Área secundária: no desktop, rodapé da sidebar (notificações, configurações, conta); no
            mobile só o sino fica no topo (Configurações e Sair vão para a sheet "Mais"). */}
        <div className="ml-auto flex items-center gap-1 md:ml-0 md:mt-auto md:flex-col md:items-stretch md:gap-1 md:border-t md:border-line md:pt-3">
          <NotificationBell recipient="coach" href="/coach/notificacoes" variant="shell" />
          <div className="hidden md:flex md:flex-col md:gap-1">
            <CoachSettingsLink />
            {isAdmin && <OwnerPanelLink />}
          </div>
          <div className="mt-2 hidden items-center gap-2.5 rounded-[14px] border border-line bg-surface px-2.5 py-2 md:flex">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-raised font-display text-sm font-bold text-brand"
            >
              {(coach.name.trim().charAt(0) || "C").toLocaleUpperCase("pt-BR")}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{coach.name}</span>
            <form action={logout}>
              <button
                type="submit"
                aria-label="Sair da conta"
                title="Sair"
                className="flex size-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
              >
                <Icon name="logout" size={18} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Painel de conteúdo. Mobile: ocupa a largura toda, cantos arredondados no topo, e reserva a
          altura da barra inferior (+ área segura) para o último item nunca ficar atrás dela. */}
      <main className="min-w-0 flex-1 rounded-t-[var(--radius-xl)] bg-canvas px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 md:my-3 md:mr-3 md:min-h-[calc(100vh-1.5rem)] md:rounded-[var(--radius-xl)] md:px-8 md:pb-12 md:pt-9 xl:px-10">
        <div className="mx-auto w-full max-w-5xl">
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

      <CoachNav variant="bottom" pendingEvaluations={pendingEvaluations} isAdmin={isAdmin}>
        {logoutForm}
      </CoachNav>
    </div>
    </>
  );
}
