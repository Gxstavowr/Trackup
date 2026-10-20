"use client";

import { useActionState } from "react";
import { Badge, Field, Input, Select, SubmitButton } from "@/components/ui";
import {
  BILLING_PERIOD_LABELS,
  PACKAGES,
  PACKAGE_IDS,
  formatPriceBRL,
  type BillingPeriod,
  type PackageId,
} from "@/lib/onboarding/packages";
import { saveServicePriceAction, type ServicePriceState } from "./service-prices-actions";

export type ServicePriceView = { priceCents: number; billingPeriod: BillingPeriod };

const PERIODS = Object.keys(BILLING_PERIOD_LABELS) as BillingPeriod[];

function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PackagePriceForm({ pkg, current }: { pkg: PackageId; current: ServicePriceView | undefined }) {
  const [state, action] = useActionState<ServicePriceState, FormData>(saveServicePriceAction, null);
  const def = PACKAGES[pkg];
  return (
    <form action={action} className="flex flex-col gap-4 rounded-md border border-line p-4">
      <input type="hidden" name="package" value={pkg} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{def.label}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">{def.includes}</p>
        </div>
        {current ? (
          <Badge tone="success" dot>
            {formatPriceBRL(current.priceCents)} · {BILLING_PERIOD_LABELS[current.billingPeriod]}
          </Badge>
        ) : (
          <Badge tone="neutral">Ainda sem preço</Badge>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Preço (R$)">
          <Input
            name="price"
            inputMode="decimal"
            required
            placeholder="0,00"
            defaultValue={current ? centsToInput(current.priceCents) : ""}
            autoComplete="off"
          />
        </Field>
        <Field label="Período de cobrança">
          <Select name="period" defaultValue={current?.billingPeriod ?? "monthly"}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {BILLING_PERIOD_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger-text">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="tk-fade rounded-md border border-success/30 bg-success-tint px-3 py-2 text-sm text-success">
          {state.ok}
        </p>
      )}
      <SubmitButton variant="secondary" width="mobile" className="self-start">
        {current ? "Alterar preço padrão" : "Definir preço padrão"}
      </SubmitButton>
    </form>
  );
}

/** Pacotes e preços padrão do coach (Configurações). `prices === null` = tabela indisponível. */
export default function ServicePricesSection({
  prices,
}: {
  prices: Partial<Record<PackageId, ServicePriceView>> | null;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 md:p-6">
      <div>
        <h2 className="t-subtitle text-ink">Pacotes e preços</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          O preço padrão de cada pacote já vem preenchido ao convidar um aluno novo; você pode ajustar caso a caso.
        </p>
      </div>
      <ul className="flex max-w-2xl flex-col gap-1 text-sm text-ink-muted">
        <li>Mudar o preço padrão não altera alunos já contratados: cada um mantém o valor combinado.</li>
        <li>Isto é o que você cobra dos seus alunos. Não tem relação com a mensalidade do Trackly.</li>
      </ul>
      {prices === null ? (
        <p role="status" className="rounded-md border border-line px-3 py-2 text-sm text-ink-muted">
          Os preços padrão ainda não estão disponíveis nesta conta. Tente novamente mais tarde.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {PACKAGE_IDS.map((id) => (
            <PackagePriceForm key={id} pkg={id} current={prices[id]} />
          ))}
        </div>
      )}
    </section>
  );
}
