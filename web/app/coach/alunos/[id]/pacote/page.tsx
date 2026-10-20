import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import Icon from "@/components/ui/icon";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import {
  getClientContracts,
  getPublishedModules,
  type ClientConfirmation,
  type ClientContract,
} from "@/lib/onboarding/contracts";
import { getCoachServicePrices } from "@/lib/onboarding/prices";
import { BILLING_PERIOD_LABELS, MODULE_LABELS, PACKAGES, formatPriceBRL } from "@/lib/onboarding/packages";
import { getClient } from "@/lib/repository";
import { requireCoach } from "../../../require-coach";
import { deriveContractState, minEffectiveDate } from "./contract-logic";
import { formatDateBR, formatInstantBR } from "./format";
import PackageForm from "./package-form";
import VoidChangeButton from "./void-change-button";

export const metadata: Metadata = { title: "Pacote do aluno · Trackly" };

const CONFIRMATION: Record<ClientConfirmation, { label: string; tone: BadgeTone }> = {
  not_required: { label: "Confirmação não pedida", tone: "neutral" },
  pending: { label: "Aguardando o aluno", tone: "warning" },
  confirmed: { label: "Confirmada pelo aluno", tone: "success" },
  declined: { label: "Recusada pelo aluno", tone: "danger" },
};

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <h2 className="t-subtitle text-ink">{title}</h2>
        {hint && <p className="t-helper">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

function priceText(cents: number, period: ClientContract["billingPeriod"]) {
  return `${cents === 0 ? "Cortesia" : formatPriceBRL(cents)} · ${BILLING_PERIOD_LABELS[period] ?? period}`;
}

function confirmationText(c: ClientContract): string {
  const base = CONFIRMATION[c.clientConfirmation].label;
  return c.clientRespondedAt && (c.clientConfirmation === "confirmed" || c.clientConfirmation === "declined")
    ? `${base} em ${formatInstantBR(c.clientRespondedAt)}`
    : base;
}

function HistoryItem({ c, status }: { c: ClientContract; status: "current" | "scheduled" | "past" | "voided" }) {
  const statusBadge: Record<typeof status, { label: string; tone: BadgeTone }> = {
    current: { label: "Vigente", tone: "success" },
    scheduled: { label: "Agendada", tone: "accent" },
    past: { label: "Encerrado", tone: "neutral" },
    voided: { label: "Anulada", tone: "neutral" },
  };
  const s = statusBadge[status];
  const isChange = c.kind === "change";

  return (
    <li className={`flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 ${status === "voided" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="t-label text-ink-faint">{isChange ? "Mudança de pacote" : "Pacote inicial"}</span>
          <span className={`font-display text-base font-bold text-ink ${status === "voided" ? "line-through" : ""}`}>
            {isChange && c.previousPackage ? `${PACKAGES[c.previousPackage].label} → ` : ""}
            {PACKAGES[c.package].label}
          </span>
        </div>
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
      </div>

      <dl className="flex flex-col gap-1.5">
        {isChange && c.previousPriceCents != null && (
          <Detail label="Valor anterior">
            {priceText(c.previousPriceCents, c.previousBillingPeriod ?? c.billingPeriod)}
          </Detail>
        )}
        <Detail label={isChange ? "Novo valor" : "Valor contratado"}>
          {priceText(c.priceCents, c.billingPeriod)}
          <span className="text-ink-faint"> · {c.priceSource === "coach_default" ? "preço padrão" : "valor negociado"}</span>
        </Detail>
        <Detail label="Vigência">{`A partir de ${formatDateBR(c.effectiveFrom)}`}</Detail>
        {isChange && (
          <>
            <Detail label="Motivo">{c.changeReason ?? <span className="text-ink-faint">Não informado</span>}</Detail>
            <Detail label="Acordado com o aluno">{c.agreedWithClient ? "Sim" : "Não"}</Detail>
            <Detail label="Confirmação do aluno">
              <span className={c.clientConfirmation === "declined" ? "text-danger-text" : undefined}>{confirmationText(c)}</span>
            </Detail>
          </>
        )}
        <Detail label="Registrado em">{formatInstantBR(c.createdAt)}</Detail>
        {c.voidedAt && (
          <Detail label="Anulada em">
            {formatInstantBR(c.voidedAt)}
            {c.voidReason ? ` · ${c.voidReason}` : ""}
          </Detail>
        )}
      </dl>
    </li>
  );
}

/**
 * Pacote do aluno (V5, item 14): pacote e valor contratado vigentes, mudança agendada, histórico
 * contratual (append-only) e as ações explícitas "Definir pacote" (aluno legado) e "Registrar
 * mudança de pacote" — ambas com etapa de confirmação antes de gravar. Rota:
 * `/coach/alunos/[id]/pacote` (sem item no menu; o link vem do perfil do aluno).
 *
 * O contrato é só o ACORDO de serviço: não cria nem altera `subscriptions`/`payments` (cobranças
 * registradas mantêm o valor delas) e não tem relação com a mensalidade do coach ao Trackly.
 * Sem a migração 0022, a tela mostra um aviso em vez de quebrar.
 */
export default async function StudentPackagePage({ params }: PageProps<"/coach/alunos/[id]/pacote">) {
  const { id } = await params;
  await requireCoach();

  const client = await getClient(id);
  if (!client) notFound();

  const { available, contracts } = await getClientContracts(id);
  const today = todayInSaoPaulo();

  if (!available) {
    return (
      <Section title="Pacote do aluno">
        <Card variant="sunken" className="flex gap-3 text-sm text-ink-muted">
          <Icon name="info" size={18} className="mt-px shrink-0" />
          <p>
            O registro de pacotes ainda não está ativo neste ambiente. Quando estiver, você verá aqui o pacote e o valor
            contratado de {client.name}, com o histórico de mudanças.
          </p>
        </Card>
      </Section>
    );
  }

  const [defaults, published] = await Promise.all([
    getCoachServicePrices().then((r) => r.prices),
    contracts.length === 0 ? getPublishedModules(id) : Promise.resolve(null),
  ]);
  const { current, scheduled } = deriveContractState(contracts, today);

  const statusOf = (c: ClientContract) =>
    c.voidedAt ? "voided" : c.id === current?.id ? "current" : c.id === scheduled?.id ? "scheduled" : "past";

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Pacote do aluno"
        hint="O acordo de serviço com o aluno. Mudar o preço padrão nas Configurações nunca altera este contrato."
      >
        {current ? (
          <Card variant="raised" padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="t-label text-ink-faint">Pacote vigente</span>
                <span className="font-display text-2xl font-bold text-ink">{PACKAGES[current.package].label}</span>
                <span className="text-sm text-ink-muted">{PACKAGES[current.package].includes}</span>
              </div>
              <Badge tone={current.priceSource === "coach_default" ? "neutral" : "info"}>
                {current.priceSource === "coach_default" ? "Preço padrão" : "Valor negociado"}
              </Badge>
            </div>
            <dl className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
              <div className="flex flex-col gap-0.5 bg-surface-raised px-5 py-3">
                <dt className="text-xs text-ink-muted">Valor contratado</dt>
                <dd className="font-display text-lg font-bold tabular-nums text-ink">
                  {current.priceCents === 0 ? "Cortesia" : formatPriceBRL(current.priceCents)}
                  <span className="ml-1 text-sm font-normal text-ink-muted">
                    · {BILLING_PERIOD_LABELS[current.billingPeriod]}
                  </span>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 bg-surface-raised px-5 py-3">
                <dt className="text-xs text-ink-muted">Vigente desde</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink">{formatDateBR(current.effectiveFrom)}</dd>
              </div>
            </dl>
          </Card>
        ) : (
          <Card variant="outline" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="t-label text-ink-faint">Sem pacote definido</span>
              <p className="text-sm text-ink">
                {client.name} é um aluno anterior aos pacotes: hoje vê todos os módulos que você publicou.
              </p>
              <p className="t-helper">
                Ao definir o pacote, o que estiver fora dele passa a aparecer bloqueado para o aluno. Isso não altera
                cobranças já registradas nem a sua mensalidade do Trackly.
              </p>
              {published && (published.training || published.nutrition) && (
                <p className="t-helper">
                  Publicado hoje:{" "}
                  {(["training", "nutrition"] as const)
                    .filter((m) => published[m])
                    .map((m) => MODULE_LABELS[m])
                    .join(" e ")}
                  .
                </p>
              )}
            </div>
            <PackageForm
              mode="initial"
              clientId={id}
              studentName={client.name}
              defaults={defaults}
              published={published ?? { training: false, nutrition: false }}
              today={today}
            />
          </Card>
        )}
      </Section>

      {current && (
        <Section
          title="Mudança de pacote"
          hint="Toda mudança é registrada com o valor anterior, o novo valor, a vigência e o motivo. Nada muda sem a sua confirmação."
        >
          {scheduled ? (
            <Card className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="t-label text-ink-faint">Mudança agendada</span>
                  <span className="font-display text-base font-bold text-ink">
                    {PACKAGES[current.package].label} → {PACKAGES[scheduled.package].label}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {priceText(current.priceCents, current.billingPeriod)} → {priceText(scheduled.priceCents, scheduled.billingPeriod)}
                  </span>
                  <span className="text-sm text-ink-muted">Vigora a partir de {formatDateBR(scheduled.effectiveFrom)}</span>
                </div>
                <Badge tone={CONFIRMATION[scheduled.clientConfirmation].tone} dot>
                  {CONFIRMATION[scheduled.clientConfirmation].label}
                </Badge>
              </div>
              {scheduled.clientConfirmation === "declined" && (
                <p className="text-sm text-danger-text">
                  O aluno recusou esta mudança. Ela continua agendada até você decidir: anule se não for mais valer.
                </p>
              )}
              <VoidChangeButton clientId={id} contractId={scheduled.id} />
            </Card>
          ) : (
            <PackageForm
              mode="change"
              clientId={id}
              studentName={client.name}
              defaults={defaults}
              current={{
                package: current.package,
                priceCents: current.priceCents,
                billingPeriod: current.billingPeriod,
                effectiveFrom: current.effectiveFrom,
              }}
              today={today}
              minDate={minEffectiveDate(current, today)}
            />
          )}
        </Section>
      )}

      {contracts.length > 0 && (
        <Section title="Histórico contratual" hint="Registros nunca são editados. Mudanças anuladas continuam visíveis.">
          <Card padding="none" as="ul" className="overflow-hidden">
            {contracts.map((c) => (
              <HistoryItem key={c.id} c={c} status={statusOf(c)} />
            ))}
          </Card>
        </Section>
      )}

      <p className="flex gap-2 text-xs text-ink-faint">
        <Icon name="info" size={16} className="shrink-0" />
        <span>
          O pacote registra só o acordo de serviço. Cobranças já lançadas em Pagamentos mantêm o valor delas, e nada aqui
          tem relação com a sua mensalidade do Trackly.
        </span>
      </p>
    </div>
  );
}
