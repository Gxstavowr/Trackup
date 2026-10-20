import { notFound } from "next/navigation";
import {
  getClient,
  getSubscription,
  type PaymentStatus,
  type SubscriptionStatus,
} from "@/lib/repository";
import { requireCoach } from "../../../require-coach";
import { registerNextPaymentAction, markPaymentAsPaidAction } from "./actions";
import CreateSubscriptionForm from "./create-subscription-form";
import SubscriptionStatusControl from "./subscription-status-control";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { displayPaymentStatus } from "@/lib/finance/metrics";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";

const PERIOD_LABEL: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Ativa",
  paused: "Pausada",
  cancelled: "Cancelada",
};

const SUBSCRIPTION_STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  active: "success",
  paused: "warning",
  cancelled: "danger",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
  cancelled: "Cancelado",
  refunded: "Estornado",
};

const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  pending: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "neutral",
  refunded: "neutral",
};

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** `due_date`/`paid_date` chegam como `YYYY-MM-DD` (coluna `date`, sem hora/fuso) — parseia
 * como UTC meia-noite e formata também em UTC, pra não deslocar um dia conforme o fuso de
 * quem está vendo a tela (mesmo cuidado de `computeWeekInfo`/`computeNextDueDate`). */
function formatDateOnly(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Instante (timestamptz) -> data no fuso de São Paulo, `dd/mm/aaaa`. */
function formatInstant(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * Tela real "Pagamento do aluno" (próxima fatia do item 4 do TODO, espelhando
 * `/coach/alunos/[id]/treino` e `/nutricao` na estrutura). Rota:
 * `/coach/alunos/[id]/pagamento`. Link "Ver pagamento" + badge de status financeiro em
 * `app/coach/alunos/client-row.tsx`.
 *
 * Escopo deliberadamente mínimo (ver relatório da tarefa): fluxo 100% MANUAL, igual ao
 * protótipo estático hoje — o coach registra que recebeu, sem checkout nem webhook de
 * gateway nenhum (isso é o item 26/27, pendente da decisão do usuário sobre qual gateway
 * usar — "Tasks for Gustavo", fora de escopo aqui). Cancelar/reativar a assinatura existe
 * (`SubscriptionStatusControl`, conta no card "Cancelamentos" do Financeiro); sem pausar, sem
 * reembolso, sem cobrança por WhatsApp (item 28) e sem visão do aluno (item 26 — só o coach
 * mexe nesta tela).
 */
export default async function ClientPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCoach();

  const client = await getClient(id);
  if (!client) {
    // RLS: `getClient` devolve `null` tanto se o id não existe quanto se pertence a outra
    // conta — 404 é a resposta certa nos dois casos, sem vazar qual é o motivo.
    notFound();
  }

  const subscription = await getSubscription(id);
  // `pending` vencida aparece como "Atrasado" (derivado, igual ao Financeiro e à lista de alunos).
  const today = todayInSaoPaulo();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="t-subtitle text-ink">Assinatura</h2>

        {!subscription ? (
          <CreateSubscriptionForm clientId={id} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3 card px-4 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-ink">{subscription.plan_name}</span>
                  <Badge tone={SUBSCRIPTION_STATUS_TONE[subscription.status]} dot>{SUBSCRIPTION_STATUS_LABEL[subscription.status]}</Badge>
                </div>
                <span className="text-sm text-ink-muted">
                  {formatBRL(subscription.price_cents)} · {PERIOD_LABEL[subscription.period]}
                  {subscription.status === "cancelled" &&
                    subscription.cancelled_at &&
                    ` · cancelada em ${formatInstant(subscription.cancelled_at)}`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {subscription.status !== "cancelled" && (
                  <form action={registerNextPaymentAction}>
                    <input type="hidden" name="clientId" value={id} />
                    <button
                      type="submit"
                      className={buttonClass()}
                    >
                      Registrar próxima cobrança
                    </button>
                  </form>
                )}
                <SubscriptionStatusControl clientId={id} cancelled={subscription.status === "cancelled"} />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-medium text-ink">Cobranças</h3>

              {subscription.payments.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Nenhuma cobrança registrada ainda — use &quot;Registrar próxima cobrança&quot; acima.
                </p>
              ) : (
                <ul className="overflow-hidden card">
                  {subscription.payments.map((rawPayment) => {
                    const payment = {
                      ...rawPayment,
                      status: displayPaymentStatus(rawPayment.status, rawPayment.due_date, today),
                    };
                    return (
                    <li
                      key={payment.id}
                      className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-ink">{formatBRL(payment.amount_cents)}</span>
                        <span className="text-xs text-ink-faint">
                          Vencimento {formatDateOnly(payment.due_date)}
                          {payment.paid_date && ` · pago em ${formatDateOnly(payment.paid_date)}`}
                          {payment.method && ` · ${payment.method}`}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <Badge tone={PAYMENT_STATUS_TONE[payment.status]} dot>{PAYMENT_STATUS_LABEL[payment.status]}</Badge>

                        {(payment.status === "pending" || payment.status === "overdue") && (
                          <form action={markPaymentAsPaidAction} className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                            <input type="hidden" name="clientId" value={id} />
                            <input type="hidden" name="paymentId" value={payment.id} />
                            <select
                              name="method"
                              defaultValue=""
                              aria-label="Forma de pagamento"
                              className="min-h-11 rounded-md border border-line-control bg-surface-sunken px-2 py-1.5 text-xs text-ink outline-none focus:border-brand"
                            >
                              <option value="">Manual</option>
                              <option value="pix">Pix</option>
                              <option value="cartao">Cartão</option>
                              <option value="dinheiro">Dinheiro</option>
                              <option value="transferencia">Transferência</option>
                            </select>
                            <button
                              type="submit"
                              className={buttonClass({ variant: "secondary", className: "flex-1 sm:flex-none" })}
                            >
                              Marcar como pago
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
