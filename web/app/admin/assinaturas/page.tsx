import { Badge, Segmented } from "@/components/ui";
import { UpdatedAtStrip } from "@/components/viz";
import { requireAdmin } from "@/lib/admin/auth";
import { listRecentBillingEvents, listSubscriptions, type AdminBillingEvent, type AdminSubscription } from "@/lib/admin/billing";
import { BILLING_STATUSES, daysUntilSuspension } from "@/lib/billing/state";
import { PAYMENT_METHOD_LABEL } from "@/lib/billing/switch";
import {
  ADMIN_BILLING_STATUS_LABEL,
  billingEventLabel,
  billingEventTone,
  parseBillingStatusFilter,
} from "../_lib/logic";
import { formatDate, formatDateTime } from "../_lib/format";
import { PageHeader, StatusBadge, Unavailable } from "../_components/parts";

/**
 * Assinaturas do coach com o Trackly (item 23): espelho de `coach_billing_subscriptions` e dos
 * últimos `coach_billing_events` — sem payload, token, CPF/CNPJ ou e-mail do assinante. Forma de
 * pagamento e próxima cobrança só aparecem quando há dado confiável.
 */
export default async function AdminSubscriptionsPage({ searchParams }: PageProps<"/admin/assinaturas">) {
  await requireAdmin();
  const params = await searchParams;
  const filter = parseBillingStatusFilter(params.status);

  const [subs, events] = await Promise.all([listSubscriptions(), listRecentBillingEvents(25)]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Assinaturas" />

      {!subs.ok ? (
        <Unavailable what="Assinaturas" />
      ) : (
        <section aria-labelledby="lista-assinaturas" className="flex flex-col gap-4">
          <h2 id="lista-assinaturas" className="sr-only">
            Lista de assinaturas
          </h2>
          <Segmented
            label="Filtrar por estado"
            size="sm"
            value={filter}
            items={[
              { id: "all", label: "Todas", href: "/admin/assinaturas", count: subs.data.rows.length },
              ...BILLING_STATUSES.filter((st) => st !== "none").map((st) => ({
                id: st,
                label: ADMIN_BILLING_STATUS_LABEL[st],
                href: `/admin/assinaturas?status=${st}`,
                count: subs.data.countsByStatus[st],
              })),
            ]}
          />
          <UpdatedAtStrip at={subs.readAt} title="Assinaturas">
            <span className="text-xs text-ink-faint">
              último registro alterado em {subs.data.lastUpdate ? formatDateTime(subs.data.lastUpdate) : "—"}
            </span>
          </UpdatedAtStrip>
          <SubscriptionTable
            rows={filter === "all" ? subs.data.rows : subs.data.rows.filter((r) => r.status === filter)}
            readAt={subs.readAt}
          />
          {subs.data.accountsWithoutRow > 0 && (
            <p className="text-xs text-ink-faint">
              {subs.data.accountsWithoutRow === 1
                ? "1 coach ainda não iniciou a assinatura"
                : `${subs.data.accountsWithoutRow} coaches ainda não iniciaram a assinatura`}{" "}
              (sem registro = acesso liberado, comportamento atual).
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="eventos-titulo" id="eventos" className="flex scroll-mt-6 flex-col gap-3">
        <div>
          <h2 id="eventos-titulo" className="t-subtitle text-ink">
            Últimos eventos de cobrança
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Registros recebidos da SyncPay e ações internas da assinatura. O conteúdo bruto não é exibido.
            A integração só deve ser considerada validada em produção após um pagamento real confirmado.
          </p>
        </div>
        {events.ok ? <EventList rows={events.data} /> : <Unavailable what="Eventos de cobrança" />}
      </section>
    </div>
  );
}

function SubscriptionTable({ rows, readAt }: { rows: AdminSubscription[]; readAt: string }) {
  if (rows.length === 0) {
    return <p className="card p-5 text-sm text-ink-faint">Nenhuma assinatura neste estado.</p>;
  }
  const now = new Date(readAt);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const daysLeft = r.status === "overdue" ? daysUntilSuspension(r.paymentFailedAt, now) : null;
        return (
          <li key={r.accountId} className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{r.accountName}</p>
              <p className="truncate text-xs text-ink-faint">{r.coachName ?? "Coach não identificado"}</p>
            </div>
            <div className="flex flex-col gap-1">
              <StatusBadge status={r.status} />
              {daysLeft !== null && (
                <span className="text-xs text-warning">
                  {daysLeft === 0 ? "suspende a qualquer momento" : `suspende em ${daysLeft} d`}
                </span>
              )}
            </div>
            <dl className="contents text-xs">
              <div className="min-w-0">
                <dt className="text-ink-faint">Forma de pagamento</dt>
                <dd className="font-semibold text-ink">{r.method ? PAYMENT_METHOD_LABEL[r.method] : "Não informada"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink-faint">Próxima cobrança</dt>
                <dd className="font-semibold tabular-nums text-ink">{r.nextChargeAt ? formatDate(r.nextChargeAt) : "—"}</dd>
                <dd className="text-ink-faint">atualizado {formatDateTime(r.updatedAt)}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

const TONE_DOT = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-ink-faint",
} as const;

function EventList({ rows }: { rows: AdminBillingEvent[] }) {
  if (rows.length === 0) {
    return <p className="card p-5 text-sm text-ink-faint">Nenhum evento de cobrança recebido até agora.</p>;
  }
  return (
    <ul className="card flex flex-col divide-y divide-line px-4 md:px-5">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-3">
          <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE_DOT[billingEventTone(e.event)]}`} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{billingEventLabel(e.event)}</span>
            <span className="block truncate text-xs text-ink-faint">{e.accountName ?? "Conta não identificada"}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={e.applied ? "success" : "neutral"}>{e.applied ? "Aplicado" : "Só registrado"}</Badge>
            {e.verified && <Badge tone="info">Confirmado na API</Badge>}
          </span>
          <time dateTime={e.occurredAt ?? e.receivedAt} className="w-full text-xs tabular-nums text-ink-muted sm:w-auto">
            {formatDateTime(e.occurredAt ?? e.receivedAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
