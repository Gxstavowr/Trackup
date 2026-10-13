"use client";

import { startTransition, useActionState, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, Button, Field, Icon, Input, Modal, Spinner, buttonClass, type IconName } from "@/components/ui";
import { cardClass } from "@/components/ui/card";
import type { PixView } from "@/lib/billing/pix";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/billing/switch";
import {
  confirmMethodSwitchAction,
  pollPixAutomaticoAction,
  saveBillingDocumentAction,
  startPixAutomaticoAction,
  type DocumentState,
} from "./actions";

/**
 * Fluxo da forma de pagamento: 1) CPF (e telefone opcional), 2) Pix Automático OU cartão
 * recorrente. CPF/telefone vivem só no estado do componente e no servidor — nada em
 * localStorage/sessionStorage.
 */

const POLL_MS = 4000;
const MAX_POLLS = 75; // ~5 minutos; depois o coach pede "Verificar de novo"

/** Janela da troca, com datas já formatadas no servidor (dd/mm/aaaa, fuso de Brasília). */
export type SwitchTimingView =
  | { kind: "now"; reason: "overdue" | "renewal_window" | "unknown_date"; cycleEnds: string | null; lostDays: number | null; nextCharge: string }
  | { kind: "too_early"; opensAt: string; closesAt: string; cycleEnds: string }
  | { kind: "charge_in_progress"; cycleEnds: string };

/** Assinatura ativa/em atraso: forma atual + o que acontece se trocar. */
export type SwitchOffer = {
  currentMethod: PaymentMethod;
  status: "active" | "overdue";
  timing: SwitchTimingView;
  /** Troca já pedida e ainda não concluída. */
  pendingTo: PaymentMethod | null;
  pendingSince: string | null;
};

type Props = {
  initialDocument: string | null;
  email: string;
  pixAvailable: boolean;
  cardUrl: string | null;
  active: boolean;
  initialPix: PixView | null;
  switchOffer: SwitchOffer | null;
};

export default function PaymentMethodFlow({ initialDocument, email, pixAvailable, cardUrl, active, initialPix, switchOffer }: Props) {
  const [docState, docAction, docPending] = useActionState<DocumentState, FormData>(saveBillingDocumentAction, null);
  const [editing, setEditing] = useState(!initialDocument);
  const [lastSaved, setLastSaved] = useState<DocumentState>(null);
  if (docState !== lastSaved) {
    // Salvou com sucesso: sai do modo edição (ajuste de estado durante o render, sem efeito).
    setLastSaved(docState);
    if (docState?.ok) setEditing(false);
  }
  const document = docState?.ok ? docState.document : initialDocument;
  const phone = docState?.ok ? docState.phone : null;
  const confirmed = !!document && !editing;

  const [pix, setPix] = useState<PixView | null>(initialPix);
  const [pixError, setPixError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const showPix = (view: PixView) => {
    setPix(view);
    // No celular o painel do QR fica abaixo dos cartões: leva o coach até ele.
    window.requestAnimationFrame(() =>
      window.document.getElementById("pix-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  // Troca de forma de pagamento: qual opção está com a confirmação aberta.
  const [switchTarget, setSwitchTarget] = useState<PaymentMethod | null>(null);
  const current = switchOffer?.currentMethod ?? null;
  const switchingToPix = !!switchOffer && current !== "pix_automatico";

  const startPix = () => {
    setStarting(true);
    setPixError(null);
    startTransition(async () => {
      // Durante uma troca pra Pix, "gerar de novo" passa pela mesma ação da troca.
      const result = switchingToPix
        ? await confirmMethodSwitchAction("pix_automatico", phone)
        : await startPixAutomaticoAction(phone).then((view) => (view.kind === "error" ? view : { kind: "pix" as const, view }));
      setStarting(false);
      if (result.kind === "error") setPixError(result.message);
      else if (result.kind === "pix") showPix(result.view);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Passo 1: CPF */}
      <section className={`${cardClass} flex flex-col gap-4 p-5 md:p-6`}>
        <StepTitle n={1} title="Seus dados para a cobrança" />
        {confirmed ? (
          <div className="flex items-start gap-3">
            <Icon name="check-circle" size={20} className="mt-0.5 shrink-0 text-success" />
            <p className="min-w-0 flex-1 break-words text-sm text-ink">
              CPF <span className="font-semibold tabular-nums">{document}</span>
              {email && (
                <>
                  {" "}
                  · e-mail <span className="font-semibold">{email}</span>
                </>
              )}
            </p>
            <Button variant="tertiary" size="sm" onClick={() => setEditing(true)}>
              Alterar
            </Button>
          </div>
        ) : (
          <form action={docAction} className="flex max-w-xl flex-col gap-4">
            <p className="text-sm text-ink-muted">
              A SyncPay exige o CPF de quem paga. Ele fica guardado só para identificar o seu
              pagamento e liberar o plano automaticamente.
            </p>
            <Field label="CPF" helper="Só números ou com pontuação. CNPJ também é aceito.">
              <Input
                name="document"
                defaultValue={document ?? ""}
                required
                inputMode="numeric"
                autoComplete="off"
                maxLength={18}
                placeholder="000.000.000-00"
                aria-invalid={docState?.ok === false && docState.field === "document" ? true : undefined}
              />
            </Field>
            <Field label="Celular (opcional)" helper="Com DDD. Usado pela SyncPay só para avisos de cobrança.">
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                maxLength={20}
                placeholder="(11) 99999-9999"
                aria-invalid={docState?.ok === false && docState.field === "phone" ? true : undefined}
              />
            </Field>
            {docState?.ok === false && (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger-text">
                {docState.error}
              </p>
            )}
            <Button type="submit" pending={docPending} pendingLabel="Salvando…" width="mobile" className="self-start">
              Confirmar CPF
            </Button>
          </form>
        )}
      </section>

      {/* Passo 2: forma de pagamento */}
      <section className="flex flex-col gap-4">
        <StepTitle n={2} title={switchOffer ? "Forma de pagamento" : "Como você quer pagar"} />
        {switchOffer && <CurrentMethodSummary offer={switchOffer} />}
        {!confirmed && <p className="text-sm text-ink-muted">Confirme o CPF acima para escolher a forma de pagamento.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <OptionCard
            icon="refresh"
            title="Pix Automático"
            text="Você autoriza uma vez no app do seu banco e a SyncPay debita a mensalidade todo mês. Sem cartão."
            soon={!pixAvailable}
            current={current === "pix_automatico"}
          >
            {pixAvailable && switchingToPix && switchOffer ? (
              <SwitchControls
                target="pix_automatico"
                offer={switchOffer}
                disabled={!confirmed}
                label={pix ? "Mostrar QR Code de novo" : "Trocar para Pix Automático"}
                onOpen={() => (pix ? startPix() : setSwitchTarget("pix_automatico"))}
                pending={starting}
              />
            ) : pixAvailable &&
              (active ? (
                <p className="text-sm text-ink-muted">Sua assinatura já está em dia.</p>
              ) : (
                <Button
                  onClick={startPix}
                  pending={starting}
                  pendingLabel="Gerando QR Code…"
                  disabled={!confirmed}
                  width="full"
                  variant={pix ? "secondary" : "primary"}
                >
                  {pix ? "Mostrar QR Code de novo" : "Autorizar com Pix Automático"}
                </Button>
              ))}
            {pixError && (
              <p role="alert" className="text-sm text-danger-text">
                {pixError}
              </p>
            )}
          </OptionCard>

          <OptionCard
            icon="wallet"
            title="Cartão recorrente"
            text="Você cadastra o cartão na página segura da SyncPay e a mensalidade é cobrada nele todo mês."
            soon={!cardUrl}
            current={current === "credit_card"}
          >
            {cardUrl && switchOffer && (current !== "credit_card" || switchOffer.status === "overdue") ? (
              <SwitchControls
                target="credit_card"
                offer={switchOffer}
                disabled={!confirmed}
                label={current === "credit_card" ? "Pagar com outro cartão" : "Trocar para cartão recorrente"}
                onOpen={() => setSwitchTarget("credit_card")}
                pending={false}
              />
            ) : cardUrl && switchOffer && active ? (
              <p className="text-sm text-ink-muted">Sua assinatura já está em dia.</p>
            ) : cardUrl && (
              <>
                {confirmed && (
                  <p className="rounded-md border border-brand/40 bg-brand-tint px-3 py-2 text-sm text-ink">
                    Use o mesmo CPF (<span className="font-semibold tabular-nums">{document}</span>)
                    {email && (
                      <>
                        {" "}
                        e e-mail (<span className="font-semibold">{email}</span>)
                      </>
                    )}{" "}
                    no pagamento para a liberação ser automática.
                  </p>
                )}
                {confirmed ? (
                  <a
                    href={cardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass({ variant: "secondary", width: "full" })}
                  >
                    Cadastrar cartão na SyncPay <Icon name="link" size={16} />
                  </a>
                ) : (
                  <Button variant="secondary" width="full" disabled>
                    Cadastrar cartão na SyncPay
                  </Button>
                )}
              </>
            )}
          </OptionCard>
        </div>
      </section>

      {switchOffer && switchTarget && (
        <SwitchConfirmModal
          target={switchTarget}
          offer={switchOffer}
          document={document}
          email={email}
          phone={phone}
          onClose={() => setSwitchTarget(null)}
          onPix={(view) => {
            setSwitchTarget(null);
            showPix(view);
          }}
        />
      )}

      {pix && (
        <div id="pix-panel" className="scroll-mt-20">
          <PixPanel initial={pix} onRestart={startPix} restarting={starting} />
        </div>
      )}
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 t-subtitle text-ink">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-on-accent">
        {n}
      </span>
      {title}
    </h2>
  );
}

function OptionCard({
  icon,
  title,
  text,
  soon,
  current = false,
  children,
}: {
  icon: IconName;
  title: string;
  text: string;
  soon: boolean;
  /** É a forma de pagamento da assinatura atual. */
  current?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className={`${cardClass} flex flex-col gap-4 p-5 md:p-6 ${soon ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icon name={icon} size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {soon && <Badge tone="neutral">Em breve</Badge>}
            {current && (
              <Badge tone="success" dot>
                Forma atual
              </Badge>
            )}
          </div>
          <p className="text-sm text-ink-muted">{text}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-3">{children}</div>
    </article>
  );
}

/** QR de autorização + acompanhamento (consulta a cada poucos segundos, com limite). */
function PixPanel({
  initial,
  onRestart,
  restarting,
}: {
  initial: PixView;
  onRestart: () => void;
  restarting: boolean;
}) {
  const [view, setView] = useState<PixView>(initial);
  const [polls, setPolls] = useState(0);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setView(initial);
    setPolls(0);
  }

  const done = view.kind === "active" || (view.kind === "pending" && view.mandateStatus === "ACTIVE");
  const switching = initial.kind === "pending" && !!initial.switching;
  const cancelled = view.kind === "pending" && view.mandateStatus === "CANCELLED";
  const polling = view.kind === "pending" && !done && !cancelled && polls < MAX_POLLS;

  useEffect(() => {
    if (!polling) return;
    const id = window.setTimeout(() => {
      startTransition(async () => {
        const next = await pollPixAutomaticoAction();
        // Erro momentâneo na consulta: mantém o QR na tela e tenta de novo.
        if (next.kind !== "error") setView(next);
        setPolls((p) => p + 1);
      });
    }, POLL_MS);
    return () => window.clearTimeout(id);
  }, [polling, polls]);

  if (view.kind === "error") return null;

  if (done) {
    const paid = view.kind === "active";
    return (
      <section role="status" className={`${cardClass} flex flex-col items-start gap-4 p-5 md:p-6`}>
        <span className="flex size-12 items-center justify-center rounded-full bg-success-tint text-success">
          <Icon name="check-circle" size={24} />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="t-subtitle text-ink">{paid ? "Assinatura ativa!" : "Pix Automático autorizado!"}</h2>
          <p className="text-sm text-ink-muted">
            {paid
              ? switching
                ? "Pagamento confirmado pela SyncPay. O Pix Automático agora é a sua forma de pagamento e a assinatura anterior é cancelada automaticamente — você não paga as duas."
                : "Pagamento confirmado pela SyncPay. As próximas mensalidades serão debitadas automaticamente."
              : switching
                ? "Assim que a SyncPay confirmar a primeira cobrança no Pix Automático, a assinatura anterior é cancelada automaticamente. Até lá, ela continua valendo."
                : "A SyncPay vai debitar a mensalidade automaticamente. Assim que a primeira cobrança for confirmada, o plano é liberado sozinho — você não precisa fazer mais nada."}
          </p>
        </div>
        <Link href="/coach" className={buttonClass({ variant: "primary", width: "mobile" })}>
          Ir para o Trackly <Icon name="arrow-right" size={16} />
        </Link>
      </section>
    );
  }

  return (
    <section className={`${cardClass} flex flex-col gap-5 p-5 md:p-6`} aria-live="polite">
      <div>
        <h2 className="t-subtitle text-ink">Autorize o Pix Automático no seu banco</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Uma única autorização: depois disso a SyncPay debita a mensalidade do Trackly todo mês.
        </p>
      </div>

      {cancelled ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger-text">
            A autorização foi cancelada ou recusada no banco. Gere um novo QR Code para tentar de novo.
          </p>
          <Button onClick={onRestart} pending={restarting} pendingLabel="Gerando…">
            Gerar novo QR Code
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex size-64 shrink-0 items-center justify-center self-center rounded-lg bg-white p-3 md:self-start">
            {view.qrImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL gerada no servidor
              <img src={view.qrImage} alt="QR Code de autorização do Pix Automático" width={232} height={232} />
            ) : (
              <span className="flex flex-col items-center gap-2 text-center text-sm text-neutral-600">
                <Spinner size={24} />
                Gerando o QR Code…
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink">
              <li>Abra o app do seu banco e entre na área Pix.</li>
              <li>Escolha ler QR Code (ou Pix Copia e Cola) e use o código desta tela.</li>
              <li>Confira o valor e a recorrência mensal e autorize o débito automático.</li>
            </ol>
            {view.copyCode && <CopyCode code={view.copyCode} />}
            {polling ? (
              <p className="flex items-center gap-2 text-sm text-ink-muted">
                <Spinner size={14} /> Aguardando a autorização no banco… esta tela atualiza sozinha.
              </p>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-ink-muted">
                  Ainda não recebemos a confirmação. Se você já autorizou, ela pode levar alguns
                  minutos.
                </p>
                <Button variant="secondary" size="sm" icon="refresh" onClick={() => setPolls(0)}>
                  Verificar de novo
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="t-label text-ink-faint">Pix Copia e Cola</span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={code}
          aria-label="Código Pix Copia e Cola"
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 w-full min-w-0 rounded-md border border-line-control bg-surface-sunken px-3 font-mono text-xs text-ink"
        />
        <Button variant="secondary" icon={copied ? "check" : undefined} onClick={copy} className="shrink-0">
          {copied ? "Copiado" : "Copiar código"}
        </Button>
      </div>
    </div>
  );
}

function CurrentMethodSummary({ offer }: { offer: SwitchOffer }) {
  const t = offer.timing;
  return (
    <div className={`${cardClass} flex flex-col gap-2 p-4 text-sm`}>
      <p className="flex flex-wrap items-center gap-2 text-ink">
        Forma de pagamento atual:
        <span className="font-semibold">{PAYMENT_METHOD_LABEL[offer.currentMethod]}</span>
      </p>
      {t.cycleEnds && offer.status === "active" && (
        <p className="text-ink-muted">
          Ciclo atual pago até <span className="font-semibold tabular-nums text-ink">{t.cycleEnds}</span>.
        </p>
      )}
      {offer.pendingTo && (
        <p className="rounded-md border border-brand/40 bg-brand-tint px-3 py-2 text-ink">
          Troca para {PAYMENT_METHOD_LABEL[offer.pendingTo]} iniciada em {offer.pendingSince}. Quando o primeiro
          pagamento for confirmado, a assinatura atual ({PAYMENT_METHOD_LABEL[offer.currentMethod]}) é cancelada
          automaticamente. Até lá, ela continua valendo.
        </p>
      )}
    </div>
  );
}

/** Botão "Trocar para …" + quando a troca abre (assinatura em dia, longe do vencimento). */
function SwitchControls({
  target,
  offer,
  disabled,
  label,
  onOpen,
  pending,
}: {
  target: PaymentMethod;
  offer: SwitchOffer;
  disabled: boolean;
  label: string;
  onOpen: () => void;
  pending: boolean;
}) {
  const t = offer.timing;
  return (
    <>
      {t.kind === "too_early" && (
        <p className="text-sm text-ink-muted">
          A troca para {PAYMENT_METHOD_LABEL[target]} abre em <span className="font-semibold text-ink">{t.opensAt}</span>{" "}
          (até {t.closesAt}), perto do vencimento de {t.cycleEnds} — assim você não paga duas vezes pelo mesmo período.
        </p>
      )}
      {t.kind === "charge_in_progress" && (
        <p className="text-sm text-ink-muted">
          A cobrança do próximo ciclo já foi gerada no {PAYMENT_METHOD_LABEL[offer.currentMethod]}. Depois que ela for
          confirmada, a troca abre de novo perto do vencimento seguinte.
        </p>
      )}
      <Button
        variant="secondary"
        width="full"
        onClick={onOpen}
        pending={pending}
        pendingLabel="Gerando QR Code…"
        disabled={disabled || t.kind !== "now"}
      >
        {label}
      </Button>
    </>
  );
}

/** Confirmação da troca: o que acontece com as datas e com a assinatura atual, ANTES de iniciar. */
function SwitchConfirmModal({
  target,
  offer,
  document,
  email,
  phone,
  onClose,
  onPix,
}: {
  target: PaymentMethod;
  offer: SwitchOffer;
  document: string | null;
  email: string;
  phone: string | null;
  onClose: () => void;
  onPix: (view: PixView) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const t = offer.timing;
  const from = PAYMENT_METHOD_LABEL[offer.currentMethod];
  const to = PAYMENT_METHOD_LABEL[target];
  const sameMethod = offer.currentMethod === target;

  const confirm = () => {
    setPending(true);
    setError(null);
    startTransition(async () => {
      const result = await confirmMethodSwitchAction(target, phone);
      setPending(false);
      if (result.kind === "error") setError(result.message);
      else if (result.kind === "pix") onPix(result.view);
      else setCardUrl(result.url);
    });
  };

  return (
    <Modal open onClose={onClose} title={sameMethod ? "Pagar com outro cartão" : `Trocar para ${to}`}>
      <div className="flex flex-col gap-4 text-sm">
        {!sameMethod && (
          <p className="flex flex-wrap items-center gap-2 text-ink">
            <span className="font-semibold">{from}</span>
            <Icon name="arrow-right" size={16} className="text-ink-muted" />
            <span className="font-semibold">{to}</span>
          </p>
        )}

        {t.kind === "now" && (
          <ul className="flex list-disc flex-col gap-2 pl-5 text-ink">
            {t.reason === "overdue" ? (
              <li>
                A mensalidade em aberto é paga no {to} assim que você concluir. A próxima cobrança fica para{" "}
                <span className="font-semibold tabular-nums">{t.nextCharge}</span> (se concluir hoje).
              </li>
            ) : (
              <>
                <li>
                  {t.cycleEnds && (
                    <>
                      Seu ciclo atual está pago até <span className="font-semibold tabular-nums">{t.cycleEnds}</span>.{" "}
                    </>
                  )}
                  O {to} cobra a mensalidade no momento em que você concluir, e a próxima cobrança passa a ser em{" "}
                  <span className="font-semibold tabular-nums">{t.nextCharge}</span> (se concluir hoje).
                </li>
                {t.lostDays !== null && t.lostDays > 0 && (
                  <li>
                    A SyncPay não permite começar a nova forma numa data futura: {t.lostDays === 1 ? "o" : "os"}{" "}
                    <span className="font-semibold">
                      {t.lostDays} {t.lostDays === 1 ? "dia que falta" : "dias que faltam"}
                    </span>{" "}
                    do ciclo atual não {t.lostDays === 1 ? "é devolvido" : "são devolvidos"}. Por isso a troca só abre
                    perto do vencimento.
                  </li>
                )}
                {t.lostDays === null && (
                  <li>
                    Não conseguimos confirmar a data do seu vencimento atual; a nova forma começa um ciclo novo a partir
                    do pagamento.
                  </li>
                )}
              </>
            )}
            <li>
              Quando a SyncPay confirmar o primeiro pagamento no {to}, o Trackly cancela automaticamente a assinatura{" "}
              {sameMethod ? "no cartão anterior" : `no ${from}`} — você não paga as duas.
            </li>
            <li>Se você não concluir, nada muda: a forma atual continua valendo.</li>
          </ul>
        )}

        {target === "credit_card" && document && (
          <p className="rounded-md border border-brand/40 bg-brand-tint px-3 py-2 text-ink">
            Use o mesmo CPF (<span className="font-semibold tabular-nums">{document}</span>)
            {email && (
              <>
                {" "}
                e e-mail (<span className="font-semibold">{email}</span>)
              </>
            )}{" "}
            na página da SyncPay para a troca ser reconhecida.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-danger-text">
            {error}
          </p>
        )}

        {cardUrl ? (
          <div className="flex flex-col gap-2">
            <p className="text-ink">Troca registrada. Cadastre o cartão na página segura da SyncPay:</p>
            <a
              href={cardUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className={buttonClass({ variant: "primary", width: "full" })}
            >
              Cadastrar cartão na SyncPay <Icon name="link" size={16} />
            </a>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="tertiary" onClick={onClose} disabled={pending}>
              Voltar
            </Button>
            <Button onClick={confirm} pending={pending} pendingLabel="Confirmando…" disabled={t.kind !== "now"}>
              {sameMethod ? "Continuar" : "Confirmar troca"}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
