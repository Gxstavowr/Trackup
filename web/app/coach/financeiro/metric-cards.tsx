import { formatBRL, formatMonthLabel } from "@/lib/finance/format";
import type { FinanceOverview } from "@/lib/finance/queries";
import { CARD, EYEBROW } from "./ui";

const HERO_NUMBER =
  "font-display tabular-nums leading-none text-[clamp(1.9rem,1.2rem+2.4vw,2.75rem)] break-words";
const SECONDARY_NUMBER =
  "font-display tabular-nums leading-tight text-[clamp(1.25rem,1.05rem+0.7vw,1.5rem)] break-words";

function HeroStat({
  label,
  value,
  caption,
  tone = "default",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "default" | "late";
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-3 p-5 ${CARD} ${tone === "late" ? "border-late/40" : ""}`}>
      <dt className={EYEBROW}>{label}</dt>
      <dd className={`${HERO_NUMBER} ${tone === "late" ? "text-late" : "text-ink"}`}>{value}</dd>
      <dd className="text-xs text-ink-muted">{caption}</dd>
    </div>
  );
}

function SecondaryStat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-surface p-4">
      <dt className={EYEBROW}>{label}</dt>
      <dd className={`${SECONDARY_NUMBER} text-ink`}>{value}</dd>
      <dd className="text-xs text-ink-faint">{caption}</dd>
    </div>
  );
}

/**
 * Topo da tela: quatro números grandes (Fraunces) do mês selecionado e, abaixo, a "base" de
 * assinaturas (posição de hoje). Cada número tem a definição em texto ao lado — o coach não
 * precisa adivinhar de onde vem.
 */
export function MetricCards({ overview }: { overview: FinanceOverview }) {
  const { monthTotals, subscriptions, month, late, lateTotalCents } = overview;
  const monthLabel = formatMonthLabel(month);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HeroStat
          label="Receita prevista"
          value={formatBRL(monthTotals.forecastCents)}
          caption={`Cobranças registradas com vencimento em ${monthLabel}.`}
        />
        <HeroStat
          label="Recebido"
          value={formatBRL(monthTotals.receivedCents)}
          caption={`Pagamentos com recebimento em ${monthLabel}.`}
        />
        <HeroStat
          label="A receber"
          value={formatBRL(monthTotals.toReceiveCents)}
          caption={`Pendentes ainda no prazo, com vencimento em ${monthLabel}.`}
        />
        <HeroStat
          label="Atrasados"
          tone={late.length > 0 ? "late" : "default"}
          value={formatBRL(lateTotalCents)}
          caption={
            late.length === 0
              ? "Nenhum pagamento em atraso hoje."
              : `${late.length} ${late.length === 1 ? "pagamento vencido e não pago" : "pagamentos vencidos e não pagos"}, de qualquer mês.`
          }
        />
      </dl>

      <div className="flex flex-col gap-2">
        <h2 className={EYEBROW}>Base de assinaturas · situação de hoje</h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 md:grid-cols-5 [&>div:last-child]:col-span-2 md:[&>div:last-child]:col-span-1">
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
