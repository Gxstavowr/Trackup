"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import {
  createClientAction,
  getAddClientOptionsAction,
  recordInviteCopiedAction,
  resendInviteAction,
  type AddClientOptions,
  type CreateClientState,
} from "./actions";
import type { SendInviteResult } from "@/lib/onboarding/invites";
import {
  BILLING_PERIOD_LABELS,
  PACKAGE_IDS,
  PACKAGES,
  formatPriceBRL,
  type BillingPeriod,
  type PackageId,
} from "@/lib/onboarding/packages";
import { buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import Icon from "@/components/ui/icon";
import { inputClass, selectClass, labelClass, helperClass } from "@/components/ui/field";

const PERIODS: BillingPeriod[] = ["monthly", "quarterly", "semiannual", "annual"];
const PERIOD_SUFFIX: Record<BillingPeriod, string> = {
  monthly: "/mês",
  quarterly: "/trimestre",
  semiannual: "/semestre",
  annual: "/ano",
};

/**
 * "Adicionar aluno" (itens 7–8 do TODO V5): formulário compacto com nome, e-mail, telefone e pacote
 * (Treino / Nutrição / Híbrido) com o que cada um inclui e o preço das Configurações. Altura, idade,
 * peso e rotina ficam para o questionário inicial do próprio aluno. Ao concluir, o convite vai por
 * e-mail e a confirmação "Convite enviado para <e-mail>" só aparece se o envio deu certo.
 * Sem a migração 0022, o formulário mostra só os dados de contato (fluxo antigo: o coach copia o link).
 */
export default function AddClientForm() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass()}>
        + Adicionar aluno
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Adicionar aluno">
        {/* O conteúdo do Modal só é montado aberto: cada abertura começa do zero. */}
        <AddClientBody onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function AddClientBody({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<AddClientOptions | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getAddClientOptionsAction()
      .then((o) => alive && setOptions(o))
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (loadFailed) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="danger">Não foi possível carregar os pacotes e preços.</Notice>
        <button
          type="button"
          className={buttonClass({ variant: "secondary" })}
          onClick={() => {
            setLoadFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!options) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-md bg-surface-raised motion-reduce:animate-none" />
        ))}
      </div>
    );
  }
  return <ClientForm options={options} onClose={onClose} />;
}

function ClientForm({ options, onClose }: { options: AddClientOptions; onClose: () => void }) {
  const [state, action, pending] = useActionState<CreateClientState, FormData>(createClientAction, null);
  const [pkg, setPkg] = useState<PackageId | null>(null);
  const v5 = options.flow === "v5";

  if (state?.status === "created") return <CreatedView state={state} onClose={onClose} />;

  const missingPrice = v5 && pkg !== null && options.prices[pkg] === null;

  return (
    <form
      // onSubmit (e não `action={...}`): o React 19 limpa o formulário após uma `action`, e um erro
      // de validação faria o coach redigitar tudo.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-4"
    >
      <label className={labelClass}>
        Nome
        <input name="name" type="text" required minLength={2} maxLength={80} autoComplete="off" className={inputClass} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span>
            E-mail {!v5 && <span className={helperClass}>(opcional)</span>}
          </span>
          <input
            name="email"
            type="email"
            required={v5}
            maxLength={320}
            autoComplete="off"
            inputMode="email"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span>
            Telefone <span className={helperClass}>(opcional)</span>
          </span>
          <input name="phone" type="tel" maxLength={25} autoComplete="off" inputMode="tel" className={inputClass} />
        </label>
      </div>

      {v5 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-ink">Pacote</legend>
          {PACKAGE_IDS.map((id) => {
            const price = options.prices[id];
            return (
              <label
                key={id}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-line-control bg-surface-sunken p-3 transition-colors hover:border-ink-faint has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:focus-visible]:shadow-[var(--focus-ring)]"
              >
                <input
                  type="radio"
                  name="package"
                  value={id}
                  required
                  checked={pkg === id}
                  onChange={() => setPkg(id)}
                  className="mt-1 size-4 shrink-0 accent-[var(--brand)]"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold text-ink">{PACKAGES[id].label}</span>
                    {price ? (
                      <span className="text-sm font-semibold text-ink tabular-nums">
                        {formatPriceBRL(price.priceCents)}
                        <span className="font-normal text-ink-muted">{PERIOD_SUFFIX[price.billingPeriod]}</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-warning">Preço não configurado</span>
                    )}
                  </span>
                  <span className="text-xs text-ink-muted">{PACKAGES[id].includes}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <Notice tone="info">
          Os pacotes e o envio do convite por e-mail ficam disponíveis após a atualização do sistema. Por
          enquanto, o aluno é criado e você envia o link do convite.
        </Notice>
      )}

      {missingPrice && pkg && (
        <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-tint p-3">
          <p className="text-sm text-ink">
            Defina o valor do pacote <strong>{PACKAGES[pkg].label}</strong> para concluir o convite.
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <label className={labelClass}>
              Valor (R$)
              <input name="price" type="text" inputMode="decimal" required placeholder="ex.: 250,00" className={inputClass} />
            </label>
            <label className={labelClass}>
              Período
              <select name="billingPeriod" defaultValue="monthly" className={selectClass}>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {BILLING_PERIOD_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="saveAsDefault" defaultChecked className="size-4 accent-[var(--brand)]" />
            Salvar como preço padrão do pacote
          </label>
        </div>
      )}

      {v5 && options.isDemo && (
        <p className={helperClass}>Conta de demonstração: o convite é simulado e nenhum e-mail é enviado.</p>
      )}

      {state?.status === "error" && <Notice tone="danger">{state.error}</Notice>}
      {state?.status === "duplicate" && <DuplicateView state={state} canResend={v5} />}

      <div className="mt-1 flex gap-3">
        <button type="button" onClick={onClose} className={buttonClass({ variant: "secondary", className: "flex-1" })}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={buttonClass({ className: "flex-1" })}>
          {pending ? (v5 ? "Enviando…" : "Criando…") : v5 ? "Criar e enviar convite" : "Criar aluno"}
        </button>
      </div>
    </form>
  );
}

function DuplicateView({
  state,
  canResend,
}: {
  state: Extract<NonNullable<CreateClientState>, { status: "duplicate" }>;
  canResend: boolean;
}) {
  const existing = state.existing;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-tint p-3" role="status">
      <p className="text-sm text-ink">{state.error} Não criamos um cadastro duplicado.</p>
      {existing && (
        <>
          <p className="text-xs text-ink-muted">
            {existing.inviteStatus === "active"
              ? "Esse aluno já ativou a conta."
              : canResend
                ? "O convite dele ainda está pendente: você pode retomá-lo reenviando o convite."
                : "O convite dele ainda está pendente: copie o link e envie ao aluno."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/coach/alunos/${existing.id}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
              Abrir aluno
            </Link>
          </div>
          {existing.inviteStatus !== "active" && <InviteFollowUp clientId={existing.id} inviteUrl={existing.inviteUrl} canResend={canResend} />}
        </>
      )}
    </div>
  );
}

function CreatedView({
  state,
  onClose,
}: {
  state: Extract<NonNullable<CreateClientState>, { status: "created" }>;
  onClose: () => void;
}) {
  const { invite } = state;
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      {invite === null ? (
        <Notice tone="success">
          {state.name} foi adicionado. Copie o link do convite e envie ao aluno.
        </Notice>
      ) : invite.ok ? (
        <SendResult result={invite} />
      ) : (
        <Notice tone="danger">
          {state.name} foi adicionado, mas o convite não foi enviado. {invite.error}
        </Notice>
      )}

      {(invite === null || !invite.ok) && (
        <InviteFollowUp clientId={state.clientId} inviteUrl={state.inviteUrl} canResend={invite !== null && !(!invite.ok && invite.unavailable)} />
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/coach/alunos/${state.clientId}`} className={buttonClass({ variant: "secondary", className: "flex-1" })}>
          Abrir perfil do aluno
        </Link>
        <button type="button" onClick={onClose} className={buttonClass({ className: "flex-1" })}>
          Concluir
        </button>
      </div>
    </div>
  );
}

/** Resultado de um envio: só fala em "enviado" quando o envio deu certo. */
function SendResult({ result }: { result: SendInviteResult }) {
  if (!result.ok) return <Notice tone="danger">{result.error}</Notice>;
  if (result.simulated) {
    return (
      <Notice tone="info">
        Convite simulado para <strong className="break-all">{result.sentTo}</strong>. Conta de demonstração: nenhum
        e-mail foi enviado.
      </Notice>
    );
  }
  return (
    <Notice tone="success">
      Convite enviado para <strong className="break-all">{result.sentTo}</strong>.
    </Notice>
  );
}

/** Reenviar (retomar convite pendente) + copiar o link `/convite?id=`. */
function InviteFollowUp({
  clientId,
  inviteUrl,
  canResend = true,
}: {
  clientId: string;
  inviteUrl: string;
  canResend?: boolean;
}) {
  const [result, setResult] = useState<SendInviteResult | null>(null);
  const [sending, startSending] = useTransition();
  const [copied, setCopied] = useState(false);
  const resendAvailable = canResend && !(result && !result.ok && result.unavailable);

  function resend() {
    startSending(async () => {
      try {
        setResult(await resendInviteAction(clientId));
      } catch {
        setResult({ ok: false, error: "Não foi possível reenviar o convite. Tente novamente." });
      }
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      recordInviteCopiedAction(clientId).catch(() => {});
    } catch {
      // Clipboard indisponível (permissão/contexto inseguro): o link continua visível abaixo.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {result && <SendResult result={result} />}
      <div className="flex flex-wrap gap-2">
        {resendAvailable && !result?.ok && (
          <button type="button" onClick={resend} disabled={sending} className={buttonClass({ size: "sm" })}>
            <Icon name="refresh" size={16} />
            {sending ? "Enviando…" : "Reenviar convite"}
          </button>
        )}
        <button type="button" onClick={copy} className={buttonClass({ variant: "secondary", size: "sm" })}>
          <Icon name={copied ? "check" : "link"} size={16} />
          <span aria-live="polite">{copied ? "Link copiado!" : "Copiar link do convite"}</span>
        </button>
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "success" | "danger" | "info"; children: ReactNode }) {
  const cls =
    tone === "success"
      ? "border-success/40 bg-success-tint text-ink"
      : tone === "danger"
        ? "border-coral/30 bg-coral-tint text-coral-text"
        : "border-line bg-surface-raised text-ink-muted";
  const icon = tone === "success" ? "check-circle" : tone === "danger" ? "alert" : "info";
  return (
    <p className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${cls}`}>
      <Icon name={icon} size={16} className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
