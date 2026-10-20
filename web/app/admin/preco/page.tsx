import { Badge } from "@/components/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { listPlatformPrices } from "@/lib/admin/billing";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { currentPrice } from "../_lib/logic";
import { formatCents, formatDateOnly, formatDateTime } from "../_lib/format";
import { PageHeader, Unavailable } from "../_components/parts";
import PriceForm from "./price-form";

/**
 * Preço da mensalidade do Trackly (item 23: "configuração centralizada e explícita, sem inventar
 * preço"). Append-only com vigência; cada cadastro vai para `admin_audit_events`. Este valor só
 * alimenta o MRR previsto do painel — não muda o que a SyncPay cobra.
 */
export default async function AdminPricePage() {
  await requireAdmin();
  const prices = await listPlatformPrices();
  const today = todayInSaoPaulo();
  const current = prices.ok ? currentPrice(prices.data, today) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Preço do Trackly" />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="preco-vigente" className="card @container min-w-0 p-4 md:p-5">
          <h2 id="preco-vigente" className="text-sm font-semibold text-ink">
            Mensalidade vigente do coach
          </h2>
          {!prices.ok ? (
            <p className="mt-3 text-sm text-ink-faint">Indisponível no momento.</p>
          ) : current ? (
            <>
              <p className="t-stat mt-3 text-[clamp(1.05rem,11cqi,2rem)] text-ink">{formatCents(current.amountCents)}</p>
              <p className="mt-1 text-xs text-ink-muted">desde {formatDateOnly(current.effectiveFrom)}</p>
            </>
          ) : (
            <>
              <p className="t-stat mt-3 text-[clamp(1.05rem,11cqi,2rem)] text-ink-faint">—</p>
              <p className="mt-1 text-xs text-ink-muted">
                Preço não configurado. Enquanto isso, o MRR previsto aparece como pendente.
              </p>
            </>
          )}
          <p className="mt-4 rounded-[var(--radius-md)] bg-surface-raised p-3 text-xs text-ink-muted">
            Este valor serve só para o cálculo do MRR previsto neste painel. O valor efetivamente cobrado de
            cada coach é o do plano configurado na SyncPay; alterar aqui não muda nenhuma assinatura.
          </p>
        </section>

        <section aria-labelledby="novo-preco" className="card min-w-0 p-4 md:p-5">
          <h2 id="novo-preco" className="text-sm font-semibold text-ink">
            Registrar novo preço
          </h2>
          <p className="mb-4 mt-1 text-xs text-ink-muted">
            O preço anterior fica no histórico. Use uma data futura para programar um reajuste.
          </p>
          <PriceForm defaultDate={today} />
        </section>
      </div>

      <section aria-labelledby="historico-preco" className="flex flex-col gap-3">
        <h2 id="historico-preco" className="t-subtitle text-ink">
          Histórico
        </h2>
        {!prices.ok ? (
          <Unavailable what="Histórico de preços" />
        ) : prices.data.length === 0 ? (
          <p className="card p-5 text-sm text-ink-faint">Nenhum preço registrado.</p>
        ) : (
          <ul className="card flex flex-col divide-y divide-line px-4 md:px-5">
            {prices.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="font-display text-base font-bold tabular-nums text-ink">{formatCents(p.amountCents)}</span>
                <span className="text-sm text-ink-muted">a partir de {formatDateOnly(p.effectiveFrom)}</span>
                {current?.id === p.id && <Badge tone="success">Vigente</Badge>}
                {p.effectiveFrom > today && <Badge tone="info">Programado</Badge>}
                <span className="w-full text-xs text-ink-faint sm:ml-auto sm:w-auto">
                  registrado {formatDateTime(p.createdAt)}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
