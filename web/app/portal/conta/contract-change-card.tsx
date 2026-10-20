"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { BILLING_PERIOD_LABELS, PACKAGES, formatPriceBRL, type BillingPeriod, type PackageId } from "@/lib/onboarding/packages";

export type ContractResponseState = { ok?: boolean; accepted?: boolean; error?: string } | null;

type Terms = { package: PackageId; priceCents: number; billingPeriod: BillingPeriod };

function formatDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : date;
}

function priceText(t: Terms): string {
  return `${t.priceCents === 0 ? "Cortesia" : formatPriceBRL(t.priceCents)} · ${BILLING_PERIOD_LABELS[t.billingPeriod]}`;
}

/**
 * Cartão "Mudança no seu pacote" (V5, item 14): o coach registrou uma mudança e pediu a confirmação
 * do aluno. O aluno confirma ou recusa; a resposta fica registrada para o coach, mas não segura a
 * vigência (decisão adotada). Recusar não anula a mudança: o coach decide.
 * O id do contrato vai no formulário, mas a RPC só aceita contratos do próprio aluno (auth.uid()).
 */
export default function ContractChangeCard({
  contractId,
  current,
  next,
  effectiveFrom,
  startsToday,
  respondAction,
}: {
  contractId: string;
  current: Terms | null;
  next: Terms;
  effectiveFrom: string;
  startsToday: boolean;
  respondAction: (prev: ContractResponseState, formData: FormData) => Promise<ContractResponseState>;
}) {
  const [state, formAction, pending] = useActionState(respondAction, null);
  const [confirmDecline, setConfirmDecline] = useState(false);

  if (state?.ok) {
    return (
      <div className="card flex gap-3 px-4 py-4 text-sm text-ink" role="status">
        <Icon name="check" size={18} className="mt-px shrink-0 text-success" />
        <p>
          {state.accepted
            ? "Pronto, sua confirmação foi registrada. Seu coach vai ver."
            : "Sua recusa foi registrada e seu coach vai ver. Converse com ele para combinarem o que fazer."}
        </p>
      </div>
    );
  }

  const when = startsToday ? "a partir de hoje" : `a partir de ${formatDate(effectiveFrom)}`;

  return (
    <form action={formAction} className="card flex flex-col gap-4 overflow-hidden px-4 py-4">
      <input type="hidden" name="contractId" value={contractId} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="t-label text-ink-faint">Mudança no seu pacote</span>
          <span className="font-display text-base font-bold text-ink">
            {current ? `${PACKAGES[current.package].label} → ` : ""}
            {PACKAGES[next.package].label}
          </span>
        </div>
        <Badge tone="warning" dot>
          Aguardando você
        </Badge>
      </div>

      <dl className="flex flex-col gap-1.5 text-sm">
        {current && (
          <div className="flex flex-wrap justify-between gap-x-4">
            <dt className="text-ink-muted">Hoje</dt>
            <dd className="text-ink">{priceText(current)}</dd>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-x-4">
          <dt className="text-ink-muted">Novo</dt>
          <dd className="font-medium text-ink">{priceText(next)}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-4">
          <dt className="text-ink-muted">Vale</dt>
          <dd className="text-ink">{when}</dd>
        </div>
      </dl>
      <p className="text-xs text-ink-muted">{PACKAGES[next.package].includes}</p>
      <p className="text-xs text-ink-muted">
        Seu coach registrou esta mudança e pediu sua confirmação. Ela vale {when}; sua resposta fica registrada para ele.
        Se não concordar, recuse e converse com seu coach.
      </p>

      {state?.error && (
        <p role="alert" className="text-sm text-danger-text">
          {state.error}
        </p>
      )}

      {confirmDecline ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink">Recusar esta mudança? Sua resposta fica registrada para o seu coach.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="tertiary" width="mobile" onClick={() => setConfirmDecline(false)} disabled={pending}>
              Voltar
            </Button>
            <Button type="submit" name="decision" value="decline" variant="danger" width="mobile" pending={pending}>
              Recusar mudança
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" width="mobile" onClick={() => setConfirmDecline(true)} disabled={pending}>
            Recusar
          </Button>
          <Button type="submit" name="decision" value="accept" width="mobile" icon="check" pending={pending}>
            Confirmar mudança
          </Button>
        </div>
      )}
    </form>
  );
}
