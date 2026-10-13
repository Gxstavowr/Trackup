import { Icon } from "@/components/ui";
import { formatBRL, formatMonthLabel } from "@/lib/finance/format";
import type { FinanceOverview } from "@/lib/finance/queries";
import { CARD, EYEBROW } from "./ui";

const HERO_NUMBER =
  "font-display font-extrabold tabular-nums leading-none tracking-tight text-[clamp(2.1rem,1.3rem+3vw,3.25rem)] break-words";
const MID_NUMBER =
  "font-display font-bold tabular-nums leading-tight tracking-tight text-[clamp(1.4rem,1.1rem+1vw,1.85rem)] break-words";
const SMALL_NUMBER =
  "font-display font-bold tabular-nums leading-tight text-[clamp(1.1rem,1rem+0.5vw,1.3rem)] break-words";

/** Números principais do mês: receita prevista e recebido, em amarelo da marca. */
function HeroStat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-3 p-5 md:p-6 ${CARD}`}>
      <dt className={EYEBROW}>{label}</dt>
      <dd className={`${HERO_NUMBER} text-brand`}>{value}</dd>
      <dd className="text-xs text-ink-muted">{caption}</dd>
    </div>
  );
}

function PendingStat({ value, caption }: { value: string; caption: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 p-5 ${CARD}`}>
      <dt className="flex items-center gap-2 t-label text-warning">
        <span aria-hidden className="size-2 rounded-full bg-warning" />
        Pendente · a receber
      </dt>
      <dd className={`${MID_NUMBER} text-ink`}>{value}</dd>
      <dd className="text-xs text-ink-muted">{caption}</dd>
    </div>
  );
}

function LateStat({ value, count }: { value: string; count: number }) {
  const has = count > 0;
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 p-5 ${CARD} ${has ? "border-danger/60 bg-danger-tint" : ""}`}
    >
      <dt className={`flex items-center gap-2 t-label ${has ? "font-bold text-danger-text" : "text-ink-faint"}`}>
        {has && <Icon name="alert" size={16} />}
        {has ? "Em atraso · ação necessária" : "Em atraso"}
      </dt>
      <dd className={`${MID_NUMBER} ${has ? "text-danger-text" : "text-ink"}`}>{value}</dd>
      <dd className={`text-xs ${has ? "text-ink" : "text-ink-muted"}`}>
        {has
          ? `${count} ${count === 1 ? "pagamento vencido e não pago" : "pagamentos vencidos e não pagos"}, de qualquer mês.`
          : "Nenhum pagamento em atraso hoje."}
      </dd>
    </div>
  );
}

function SecondaryStat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-surface p-4">
      <dt className={EYEBROW}>{label}</dt>
      <dd className={`${SMALL_NUMBER} text-ink`}>{value}</dd>
      <dd className="text-xs text-ink-faint">{caption}</dd>
    </div>
  );
}

/**
 * Topo da tela, em três níveis: (1) Recebido e Receita prevista do mês, os dois números que
 * importam, grandes e amarelos; (2) Pendente e Em atraso, o que exige ação (atraso em tom de
 * perigo, com ícone e texto); (3) a "base" de assinaturas (posição de hoje), pequena. Cada
 * número tem a definição em texto ao lado.
 */
export function MetricCards({ overview }: { overview: FinanceOverview }) {
  const { monthTotals, subscriptions, month, late, lateTotalCents } = overview;
  const monthLabel = formatMonthLabel(month);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HeroStat
          label="Recebido"
          value={formatBRL(monthTotals.receivedCents)}
          caption={`Pagamentos com recebimento em ${monthLabel}.`}
        />
        <HeroStat
          label="Receita prevista"
          value={formatBRL(monthTotals.forecastCents)}
          caption={`Cobranças registradas com vencimento em ${monthLabel}.`}
        />
      </dl>

      <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PendingStat
          value={formatBRL(monthTotals.toReceiveCents)}
          caption={`Pendentes ainda no prazo, com vencimento em ${monthLabel}.`}
        />
        <LateStat value={formatBRL(lateTotalCents)} count={late.length} />
      </dl>

      <div className="mt-2 flex flex-col gap-2">
        <h2 className={EYEBROW}>Base de assinaturas · situação de hoje</h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 xl:grid-cols-5 [&>div:last-child]:col-span-2 xl:[&>div:last-child]:col-span-1">
          <SecondaryStat label="MRR" value={formatBRL(subscriptions.mrrCents)} caption="Assinaturas ativas, por mês." />
          <SecondaryStat
            label="Ticket médio"
            value={subscriptions.averageTicketCents == null ? "—" : formatBRL(subscriptions.averageTicketCents)}
            caption="MRR ÷ assinaturas ativas."
          />
          <SecondaryStat
            label="Clientes ativos"
            value={String(subscriptions.activeCount)}
            caption="Com assinatura ativa."
          />
          <SecondaryStat
            label="Novos clientes"
            value={String(subscriptions.newInMonth)}
            caption={`Assinaturas criadas em ${monthLabel}.`}
          />
          <SecondaryStat
            label="Cancelamentos"
            value={String(subscriptions.cancelledInMonth)}
            caption={`Em ${monthLabel} · ${subscriptions.cancelledTotal} no total.`}
          />
        </dl>
        <p className="text-xs text-ink-faint">
          MRR, ticket médio e clientes ativos refletem hoje, não o mês escolhido. Novos clientes e
          cancelamentos seguem o mês escolhido acima.
        </p>
      </div>
    </div>
  );
}
