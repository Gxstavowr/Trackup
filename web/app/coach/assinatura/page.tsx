import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Badge, Icon } from "@/components/ui";
import { coachCheckoutUrl, SUBSCRIPTION_PATH } from "@/lib/billing/coach";
import { formatTaxDocument } from "@/lib/billing/enroll";
import { computeSwitchTiming, readSwitchContext, retryPendingSwitchCancellation } from "@/lib/billing/method-switch";
import { currentPixView, getCoachIdentity, readBillingRow } from "@/lib/billing/pix";
import { BILLING_STATUS_LABEL } from "@/lib/billing/state";
import type { SwitchTiming } from "@/lib/billing/switch";
import { pixAutomaticoConfigured } from "@/lib/billing/syncpay";
import { requireCoach } from "../require-coach";
import PaymentMethodFlow, { type SwitchOffer, type SwitchTimingView } from "./payment-method";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const fmt = (iso: string) => dateFmt.format(new Date(iso));

/** Datas já formatadas no servidor (fuso de Brasília), pro componente cliente só exibir. */
function timingView(t: SwitchTiming): SwitchTimingView | null {
  switch (t.kind) {
    case "now":
      return {
        kind: "now",
        reason: t.reason,
        cycleEnds: t.currentCycleEndsAt ? fmt(t.currentCycleEndsAt) : null,
        lostDays: t.lostDays,
        nextCharge: fmt(t.nextChargeAfterSwitch),
      };
    case "too_early":
      return { kind: "too_early", opensAt: fmt(t.opensAt), closesAt: fmt(t.closesAt), cycleEnds: fmt(t.currentCycleEndsAt) };
    case "charge_in_progress":
      return { kind: "charge_in_progress", cycleEnds: fmt(t.currentCycleEndsAt) };
    default:
      return null;
  }
}

/**
 * "Assinar o Trackly / Forma de pagamento": o coach escolhe Pix Automático ou cartão recorrente.
 * Aberta também com o plano suspenso/em atraso (allow-list em `lib/billing/coach.ts`). Cada opção
 * só liga quando a configuração existe; sem ela aparece "Em breve".
 */
export default async function CoachPaymentMethodPage() {
  await requireCoach();
  const identity = await getCoachIdentity();
  if (!identity) redirect("/login");

  const row = await readBillingRow(identity.accountId);
  const status = row?.status ?? "none";
  const pixView = await currentPixView(identity.accountId);

  // Troca de forma de pagamento (assinatura ativa ou em atraso). As datas daqui são da linha
  // local; a ação confere de novo com a SyncPay antes de iniciar a troca.
  const ctx = await readSwitchContext(identity.accountId);
  let switchOffer: SwitchOffer | null = null;
  if (ctx.row?.token && ctx.currentMethod && (ctx.row.status === "active" || ctx.row.status === "overdue")) {
    const timing = timingView(await computeSwitchTiming(ctx.row, new Date(), false));
    if (timing) {
      switchOffer = {
        currentMethod: ctx.currentMethod,
        status: ctx.row.status,
        timing,
        pendingTo: ctx.openSwitch?.toMethod ?? null,
        pendingSince: ctx.openSwitch ? fmt(ctx.openSwitch.requestedAt) : null,
      };
    }
  }
  // Troca que já ativou mas cuja assinatura antiga ainda não foi cancelada: tenta de novo.
  after(async () => {
    try {
      await retryPendingSwitchCancellation(identity.accountId);
    } catch (err) {
      console.error("[billing] retentativa de cancelamento falhou:", (err as Error).message);
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href={SUBSCRIPTION_PATH}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <Icon name="chevron" size={16} className="rotate-180" /> Minha assinatura
        </Link>
        <span className="t-label text-ink-faint">Trackly · Assinatura</span>
        <h1 className="t-title text-ink">{status === "none" ? "Assinar o Trackly" : "Forma de pagamento"}</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Mensalidade do Trackly, cobrada pela SyncPay. Escolha como pagar: autorizando o Pix
          Automático no seu banco ou cadastrando um cartão. Dados de cartão e de banco ficam só
          na SyncPay — o Trackly não vê nem guarda.
        </p>
        {status !== "none" && (
          <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
            Situação atual:
            <Badge tone={status === "active" ? "success" : status === "pending_first_payment" ? "info" : "danger"} dot>
              {BILLING_STATUS_LABEL[status]}
            </Badge>
          </p>
        )}
      </header>

      <PaymentMethodFlow
        initialDocument={row?.document ? formatTaxDocument(row.document) : null}
        email={identity.email}
        pixAvailable={pixAutomaticoConfigured()}
        cardUrl={coachCheckoutUrl()}
        active={status === "active"}
        initialPix={pixView}
        switchOffer={switchOffer}
      />
    </div>
  );
}
