"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { inputClass, labelClass, helperClass, selectClass, textareaClass } from "@/components/ui/field";
import Icon from "@/components/ui/icon";
import {
  BILLING_PERIOD_LABELS,
  MODULE_LABELS,
  PACKAGES,
  PACKAGE_IDS,
  formatPriceBRL,
  type BillingPeriod,
  type ModuleId,
  type PackageId,
} from "@/lib/onboarding/packages";
import { changeContractAction, setInitialContractAction, type PackageActionState } from "./actions";
import {
  BILLING_PERIODS,
  REASON_MAX,
  centsToInput,
  modulesHiddenBy,
  modulesRemovedByChange,
  validateChangeInput,
  validateInitialInput,
  type ChangeInput,
  type InitialInput,
} from "./contract-logic";
import { formatDateBR } from "./format";

type Defaults = Partial<Record<PackageId, { priceCents: number; billingPeriod: BillingPeriod }>>;
type CurrentContract = { package: PackageId; priceCents: number; billingPeriod: BillingPeriod; effectiveFrom: string };

type Props =
  | {
      mode: "initial";
      clientId: string;
      studentName: string;
      defaults: Defaults;
      published: Record<ModuleId, boolean>;
      today: string;
    }
  | {
      mode: "change";
      clientId: string;
      studentName: string;
      defaults: Defaults;
      current: CurrentContract;
      today: string;
      minDate: string;
    };

const moduleList = (mods: ModuleId[]) => mods.map((m) => MODULE_LABELS[m]).join(" e ");

function Notice({ tone, children }: { tone: "warning" | "info" | "danger" | "success"; children: ReactNode }) {
  const cls = {
    warning: "border-warning/40 bg-warning-tint text-ink",
    info: "border-line-strong bg-surface-sunken text-ink-muted",
    danger: "border-danger/40 bg-danger-tint text-danger-text",
    success: "border-success/40 bg-success-tint text-ink",
  }[tone];
  const icon = tone === "success" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`flex gap-2.5 rounded-md border px-3 py-2.5 text-sm ${cls}`}>
      <Icon name={icon} size={18} className={`mt-px shrink-0 ${tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : ""}`} />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

function ReviewRow({ label, before, after }: { label: string; before?: ReactNode; after: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium text-ink sm:justify-end sm:text-right">
        {before !== undefined && (
          <>
            <span className="font-normal text-ink-faint line-through decoration-ink-faint/60">{before}</span>
            <span aria-hidden className="text-ink-faint">→</span>
            <span className="sr-only">passa para</span>
          </>
        )}
        <span className="break-words">{after}</span>
      </dd>
    </div>
  );
}

/**
 * Formulário "Definir pacote" (aluno legado) e "Registrar mudança de pacote", com etapa de
 * confirmação explícita (antes e depois) antes de gravar. O valor vem pré-preenchido do preço
 * padrão do pacote escolhido, mas é editável. A validação é a mesma no servidor.
 */
export default function PackageForm(props: Props) {
  const isChange = props.mode === "change";
  const current = isChange ? props.current : null;
  const [state, formAction, pending] = useActionState<PackageActionState, FormData>(
    isChange ? changeContractAction : setInitialContractAction,
    null
  );

  const [open, setOpen] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | undefined>(undefined);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [pkg, setPkg] = useState<PackageId | "">("");
  const [price, setPrice] = useState("");
  const [period, setPeriod] = useState<BillingPeriod>(current?.billingPeriod ?? "monthly");
  const [effectiveFrom, setEffectiveFrom] = useState(isChange ? props.minDate : props.today);
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [askClient, setAskClient] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<InitialInput | ChangeInput | null>(null);

  const done = state?.ok === true && state.doneAt !== dismissedAt;

  function choosePackage(next: PackageId) {
    setPkg(next);
    const def = props.defaults[next];
    if (def) {
      setPrice(centsToInput(def.priceCents));
      setPeriod(def.billingPeriod);
    } else if (current && current.package === next) {
      setPrice(centsToInput(current.priceCents));
      setPeriod(current.billingPeriod);
    } else {
      setPrice("");
    }
  }

  function reset() {
    setStep("edit");
    setPkg("");
    setPrice("");
    setReason("");
    setAgreed(false);
    setAskClient(false);
    setLocalError(null);
    setReviewed(null);
    if (isChange) setEffectiveFrom(props.minDate);
  }

  function goReview() {
    const raw = { package: pkg, price, billingPeriod: period };
    const result = isChange
      ? validateChangeInput(
          { ...raw, effectiveFrom, reason, agreedWithClient: agreed, requireClientConfirmation: askClient },
          props.current,
          props.today
        )
      : validateInitialInput(raw);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    setLocalError(null);
    setReviewed(result.value);
    setStep("review");
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="success">
          {isChange ? "Mudança de pacote registrada. Ela aparece no histórico abaixo." : "Pacote definido. O histórico começa aqui."}
        </Notice>
        {isChange && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => {
              reset();
              setDismissedAt(state?.doneAt);
              setOpen(false);
            }}
          >
            Fechar
          </Button>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        variant={isChange ? "secondary" : "primary"}
        width="mobile"
        className="self-start"
        icon={isChange ? "refresh" : "plus"}
        onClick={() => {
          setOpen(true);
          setDismissedAt(state?.doneAt);
        }}
      >
        {isChange ? "Registrar mudança de pacote" : "Definir pacote"}
      </Button>
    );
  }

  const def = pkg ? props.defaults[pkg] : undefined;
  const dateHelper =
    isChange && props.minDate > props.today
      ? "O pacote atual começou hoje, então a mudança vale a partir de amanhã."
      : "Hoje ou uma data futura. Nunca retroativa.";

  // ---------- Etapa 2: confirmação explícita ----------
  if (step === "review" && reviewed) {
    const r = reviewed;
    const change = isChange ? (r as ChangeInput) : null;
    const lost = isChange
      ? modulesRemovedByChange(props.current.package, r.package)
      : modulesHiddenBy(r.package, props.published);
    const startsToday = change ? change.effectiveFrom === props.today : true;

    return (
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="clientId" value={props.clientId} />
        <input type="hidden" name="confirmed" value="yes" />
        <input type="hidden" name="package" value={r.package} />
        <input type="hidden" name="price" value={centsToInput(r.priceCents)} />
        <input type="hidden" name="billingPeriod" value={r.billingPeriod} />
        {change && (
          <>
            <input type="hidden" name="effectiveFrom" value={change.effectiveFrom} />
            <input type="hidden" name="reason" value={change.reason ?? ""} />
            {change.agreedWithClient && <input type="hidden" name="agreedWithClient" value="on" />}
            {change.requireClientConfirmation && <input type="hidden" name="requireClientConfirmation" value="on" />}
          </>
        )}

        <div className="flex flex-col gap-1">
          <h3 className="t-subtitle text-ink">{isChange ? "Confirme a mudança de pacote" : "Confirme o pacote"}</h3>
          <p className="t-helper">
            Revise com atenção. Depois de gravado, o registro fica no histórico de {props.studentName} e não é editado.
          </p>
        </div>

        <dl className="overflow-hidden rounded-[var(--radius-lg)] border border-line-strong bg-surface-raised">
          <ReviewRow
            label="Pacote"
            before={current ? PACKAGES[current.package].label : undefined}
            after={PACKAGES[r.package].label}
          />
          <ReviewRow
            label="Valor contratado"
            before={current ? formatPriceBRL(current.priceCents) : undefined}
            after={r.priceCents === 0 ? "Cortesia (R$ 0,00)" : formatPriceBRL(r.priceCents)}
          />
          <ReviewRow
            label="Período"
            before={current ? BILLING_PERIOD_LABELS[current.billingPeriod] : undefined}
            after={BILLING_PERIOD_LABELS[r.billingPeriod]}
          />
          <ReviewRow label="Vigência" after={startsToday ? `Hoje (${formatDateBR(props.today)})` : `A partir de ${formatDateBR(change!.effectiveFrom)}`} />
          {change && (
            <>
              <ReviewRow label="Motivo" after={change.reason ?? <span className="font-normal text-ink-faint">Não informado</span>} />
              <ReviewRow label="Discutido e acordado com o aluno" after={change.agreedWithClient ? "Sim" : "Não"} />
              <ReviewRow
                label="Confirmação do aluno no app"
                after={change.requireClientConfirmation ? "Será pedida" : "Não será pedida"}
              />
            </>
          )}
        </dl>

        {lost.length > 0 && (
          <Notice tone="warning">
            {isChange ? (
              <>
                <strong className="font-semibold">{moduleList(lost)}</strong> sai do pacote.{" "}
                {startsToday ? "A partir de hoje" : `A partir de ${formatDateBR(change!.effectiveFrom)}`}, o aluno deixa de
                ver esse módulo (fica com cadeado).
              </>
            ) : (
              <>
                {lost.map((m) => (m === "nutrition" ? "A dieta publicada" : "O treino publicado")).join(" e ")}{" "}
                <strong className="font-semibold">vai deixar de aparecer</strong> para o aluno assim que você confirmar,
                porque {lost.length > 1 ? "esses módulos não fazem" : `${MODULE_LABELS[lost[0]]} não faz`} parte do pacote{" "}
                {PACKAGES[r.package].label}. O plano não é apagado: volta a aparecer se o pacote passar a incluir o módulo.
              </>
            )}
          </Notice>
        )}
        {!isChange && lost.length === 0 && (
          <Notice tone="info">
            A partir de agora, o que estiver fora do pacote {PACKAGES[r.package].label} fica bloqueado para o aluno.
          </Notice>
        )}
        {change?.requireClientConfirmation && (
          <Notice tone="info">
            O aluno verá a mudança em Minha conta e poderá confirmar ou recusar. A resposta fica registrada, mas não
            impede a vigência. Se ele recusar, você decide se anula a mudança.
          </Notice>
        )}
        <Notice tone="info">
          Isso registra só o acordo de serviço. Não altera cobranças já registradas em Pagamentos e não tem relação com a
          sua mensalidade do Trackly.
        </Notice>

        {state?.error && <Notice tone="danger">{state.error}</Notice>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" width="mobile" onClick={() => setStep("edit")} disabled={pending}>
            Voltar e editar
          </Button>
          <Button type="submit" width="mobile" icon="check" pending={pending} pendingLabel="Gravando…">
            {isChange ? "Confirmar mudança" : "Confirmar pacote"}
          </Button>
        </div>
      </form>
    );
  }

  // ---------- Etapa 1: preenchimento ----------
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} mb-2`}>{isChange ? "Novo pacote" : "Pacote"}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PACKAGE_IDS.map((id) => {
            const selected = pkg === id;
            const isCurrent = current?.package === id;
            const price = props.defaults[id];
            return (
              <label
                key={id}
                className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-[var(--radius-lg)] border px-4 py-3 transition-colors has-[:focus-visible]:shadow-[var(--focus-ring)] ${
                  selected ? "border-brand bg-brand-tint" : "border-line-strong bg-surface-sunken hover:border-ink-faint"
                }`}
              >
                <input
                  type="radio"
                  name="package-choice"
                  value={id}
                  checked={selected}
                  onChange={() => choosePackage(id)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-2">
                  <span className={`font-display text-base font-bold ${selected ? "text-brand" : "text-ink"}`}>
                    {PACKAGES[id].label}
                  </span>
                  {isCurrent && <span className="text-xs text-ink-faint">atual</span>}
                </span>
                <span className="text-xs text-ink-muted">
                  {price
                    ? `Padrão: ${formatPriceBRL(price.priceCents)} · ${BILLING_PERIOD_LABELS[price.billingPeriod]}`
                    : "Sem preço padrão"}
                </span>
              </label>
            );
          })}
        </div>
        {pkg && <p className={helperClass}>{PACKAGES[pkg].includes}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span>{isChange ? "Novo valor (R$)" : "Valor contratado (R$)"}</span>
          <input
            className={inputClass}
            inputMode="decimal"
            autoComplete="off"
            placeholder="249,90"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <span className={helperClass}>
            {pkg
              ? def
                ? "Pré-preenchido com o preço padrão. Pode ajustar para o valor combinado com o aluno."
                : "Sem preço padrão para este pacote: digite o valor combinado."
              : "Escolha o pacote para preencher com o preço padrão."}
            {" "}Use 0 para cortesia.
          </span>
        </label>
        <label className={labelClass}>
          <span>Período de cobrança</span>
          <select className={selectClass} value={period} onChange={(e) => setPeriod(e.target.value as BillingPeriod)}>
            {BILLING_PERIODS.map((p) => (
              <option key={p} value={p}>
                {BILLING_PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isChange && (
        <>
          <label className={labelClass}>
            <span>Data de vigência</span>
            <input
              type="date"
              className={inputClass}
              min={props.minDate}
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            <span className={helperClass}>{dateHelper}</span>
          </label>

          <label className={labelClass}>
            <span>Motivo da mudança</span>
            <textarea
              className={textareaClass}
              maxLength={REASON_MAX}
              placeholder="Ex.: aluno quis incluir nutrição a partir do próximo mês."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <span className={helperClass}>
              Opcional, mas recomendado. {reason.length}/{REASON_MAX}
            </span>
          </label>

          <div className="flex flex-col gap-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Discutido e acordado com o aluno</span>
                <span className={helperClass}>Marque se vocês já conversaram e ele concordou com a mudança.</span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={askClient}
                onChange={(e) => setAskClient(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Pedir confirmação do aluno no app</span>
                <span className={helperClass}>
                  Ele recebe um aviso e confirma ou recusa em Minha conta. A resposta fica registrada, mas não segura a
                  vigência.
                </span>
              </span>
            </label>
          </div>
        </>
      )}

      {localError && <Notice tone="danger">{localError}</Notice>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className={buttonClass({ variant: "tertiary", width: "mobile" })}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancelar
        </button>
        <Button type="button" width="mobile" iconAfter="chevron" onClick={goReview}>
          Revisar antes de gravar
        </Button>
      </div>
    </div>
  );
}
