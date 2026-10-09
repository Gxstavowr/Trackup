"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BUTTON_GHOST,
  BUTTON_OUTLINE,
  BUTTON_PRIMARY,
  ChargeCheckinButton,
  OrientationReadyButton,
  evaluationHref,
} from "../avaliacoes/evaluation-ui";
import ChargeButton from "../financeiro/charge-button";
import { sendInviteAction } from "./actions";
import { CheckIcon, LinkIcon, TrackingIcon, WalletIcon } from "./icons";
import { PaymentStatusBadge, TrackingStatusBadge } from "./status-badges";
import { formatAge, formatHeight, type PrimaryAction, type StudentEntry } from "./student-situation";

const FINANCE_LATE_HREF = "/coach/financeiro#atrasados";

const PRIMARY_LABEL: Record<PrimaryAction, string> = {
  open_evaluation: "Abrir avaliação",
  continue_evaluation: "Continuar avaliação",
  finish_orientation: "Finalizar orientação",
  charge_checkin: "Cobrar check-in",
  charge_payment: "Cobrar pagamento",
  copy_invite: "Copiar link do convite",
  view_tracking: "Ver acompanhamento",
};

const PANEL = "flex flex-col gap-2 rounded-md border border-line p-3";
const PANEL_TITLE =
  "flex items-center gap-1.5 font-mono text-label uppercase tracking-widest text-ink-faint";
const FIELD_LABEL = "font-mono text-label uppercase tracking-wide text-ink-faint";

function Missing({ what, feminine = false }: { what: string; feminine?: boolean }) {
  const text = `${what} não informad${feminine ? "a" : "o"} no cadastro`;
  return (
    <span title={text} className="text-ink-faint">
      —<span className="sr-only"> ({text})</span>
    </span>
  );
}

function CopyInviteButton({ url, className }: { url: string; className: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard pode falhar (permissão negada, contexto não seguro etc.) — sem
      // feedback de erro dedicado, é um detalhe secundário da tela.
    }
  }

  return (
    <button type="button" onClick={copyLink} className={`${className} gap-2`}>
      {copied ? <CheckIcon /> : <LinkIcon />}
      <span aria-live="polite">{copied ? "Link copiado!" : "Copiar link do convite"}</span>
    </button>
  );
}

/**
 * Linha (cartão) de um aluno. Três áreas SEPARADAS, cada uma com o seu título:
 *  1. o aluno (nome, e-mail, idade, altura, objetivo);
 *  2. ACOMPANHAMENTO (situação, próxima ação, última atualização);
 *  3. FINANCEIRO (situação financeira).
 * E uma coluna de ação com UM botão principal (o mais forte visualmente): ele vem da mesma
 * regra que ordena a lista (`student-situation.ts`). Preenchido = exige ação do coach;
 * contorno/fantasma = nada urgente. Links de texto pequenos não existem mais aqui — o treino,
 * a nutrição e o pagamento do aluno ficam nas abas de `/coach/alunos/[id]`.
 */
export default function ClientRow({ entry }: { entry: StudentEntry }) {
  const { tracking, payment, primary } = entry;
  const age = formatAge(entry.age);
  const height = formatHeight(entry.heightCm);
  const isInviteState = tracking.state === "invite_pending" || tracking.state === "invite_sent";
  const chargeIsPrimary = primary === "charge_payment";

  const primaryClass = entry.needsAction
    ? BUTTON_PRIMARY
    : primary === "view_tracking"
      ? BUTTON_GHOST
      : BUTTON_OUTLINE;

  const accent = !entry.needsAction
    ? "border-l-transparent"
    : entry.urgentLate
      ? "border-l-late"
      : "border-l-brand";

  const clientRef = { id: entry.id, name: entry.name, phone: entry.phone };

  function renderPrimary() {
    switch (primary) {
      case "open_evaluation":
      case "continue_evaluation":
      case "finish_orientation":
        return (
          <Link href={evaluationHref(entry.id)} className={primaryClass}>
            {PRIMARY_LABEL[primary]}
            <span className="sr-only"> — {entry.name}</span>
          </Link>
        );
      case "charge_checkin":
        return (
          <ChargeCheckinButton
            client={clientRef}
            weekNumber={tracking.weekNumber ?? 1}
            late={tracking.late}
            className={primaryClass}
          />
        );
      case "charge_payment":
        return payment.latePayment ? (
          <ChargeButton payment={payment.latePayment} className={primaryClass} />
        ) : (
          <Link href={FINANCE_LATE_HREF} className={primaryClass}>
            {PRIMARY_LABEL.charge_payment}
            <span className="sr-only"> — {entry.name} (abre o Financeiro)</span>
          </Link>
        );
      case "copy_invite":
        return <CopyInviteButton url={entry.inviteUrl} className={primaryClass} />;
      case "view_tracking":
        return (
          <Link href={`/coach/alunos/${entry.id}`} className={primaryClass}>
            {PRIMARY_LABEL.view_tracking}
            <span className="sr-only"> — {entry.name}</span>
          </Link>
        );
    }
  }

  return (
    <li
      className={`flex flex-col gap-4 rounded-lg border border-l-4 border-line bg-surface p-4 shadow-[var(--surface-raised-shadow)] lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:grid-rows-[auto_1fr] lg:gap-x-5 ${accent}`}
    >
      {/* 1. O ALUNO */}
      <div className="flex min-w-0 flex-col gap-2 lg:col-start-1 lg:row-start-1">
          <div className="flex min-w-0 flex-col">
            <Link
              href={`/coach/alunos/${entry.id}`}
              className="inline-flex min-h-11 w-fit max-w-full items-center truncate text-base font-medium text-ink hover:text-brand"
            >
              {entry.name}
            </Link>
            <span className="break-all text-sm text-ink-muted">{entry.email || "sem e-mail"}</span>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex flex-col">
              <dt className={FIELD_LABEL}>Idade</dt>
              <dd className="text-ink">{age ?? <Missing what="Idade" feminine />}</dd>
            </div>
            <div className="flex flex-col">
              <dt className={FIELD_LABEL}>Altura</dt>
              <dd className="text-ink">{height ?? <Missing what="Altura" feminine />}</dd>
            </div>
            <div className="flex min-w-0 max-w-full flex-col">
              <dt className={FIELD_LABEL}>Objetivo</dt>
              <dd className="line-clamp-2 break-words text-ink" title={entry.objective ?? undefined}>
                {entry.objective ?? <Missing what="Objetivo" />}
              </dd>
            </div>
          </dl>
      </div>

      {/* Ação: UM botão principal + (só convite) o passo seguinte, com peso menor. No celular vem logo
          depois do aluno, antes dos detalhes; no desktop fica na coluna da direita. */}
      <div className="flex flex-col gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:justify-center lg:border-l lg:border-line lg:pl-5">
        <span className="hidden font-mono text-label uppercase tracking-widest text-ink-faint lg:block">
          Ação principal
        </span>
        {renderPrimary()}

        {isInviteState && (
          <>
            {primary !== "copy_invite" && <CopyInviteButton url={entry.inviteUrl} className={BUTTON_GHOST} />}
            <form action={sendInviteAction} className="contents">
              <input type="hidden" name="clientId" value={entry.id} />
              <button type="submit" className={BUTTON_GHOST}>
                {tracking.state === "invite_sent" ? "Reenviar convite" : "Marcar como enviado"}
              </button>
            </form>
          </>
        )}
      </div>

      {/* 2 e 3: detalhes do acompanhamento e do financeiro */}
      <div className="@container min-w-0 lg:col-start-1 lg:row-start-2">
        <div className="grid gap-3 @lg:grid-cols-2">
          {/* 2. ACOMPANHAMENTO — nunca traz status financeiro */}
          <section aria-label={`Acompanhamento de ${entry.name}`} className={PANEL}>
            <h3 className={PANEL_TITLE}>
              <TrackingIcon />
              Acompanhamento
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <TrackingStatusBadge state={tracking.state} late={tracking.late} />
              {tracking.weekNumber !== null && !isInviteState && tracking.state !== "paused" && (
                <span className="text-xs text-ink-faint">Semana {tracking.weekNumber}</span>
              )}
            </div>
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex flex-col">
                <dt className={FIELD_LABEL}>Próxima ação</dt>
                <dd className={tracking.late ? "text-late-text" : "text-ink"}>{tracking.nextAction}</dd>
              </div>
              <div className="flex flex-col">
                <dt className={FIELD_LABEL}>Última atualização</dt>
                <dd className="text-ink-muted">
                  {entry.lastUpdate.relative} · {entry.lastUpdate.reason}
                </dd>
              </div>
            </dl>
            {tracking.state === "done" && (
              // Ciclo concluído nesta semana: ponto de apoio pra avisar o aluno pelo WhatsApp
              // que a orientação já está disponível (item 28 do TODO) — nunca automático.
              <div className="mt-1">
                <OrientationReadyButton
                  client={clientRef}
                  weekNumber={tracking.weekNumber ?? 1}
                  className={BUTTON_OUTLINE}
                />
              </div>
            )}
          </section>

          {/* 3. FINANCEIRO — área própria, com o vocabulário próprio de pagamento */}
          <section aria-label={`Financeiro de ${entry.name}`} className={PANEL}>
            <h3 className={PANEL_TITLE}>
              <WalletIcon />
              Financeiro
            </h3>
            <div>
              <PaymentStatusBadge status={payment.status} />
            </div>
            <p className={`text-sm ${payment.status === "atrasado" ? "text-late-text" : "text-ink-muted"}`}>
              {payment.detail}
            </p>
            {payment.status === "atrasado" && !chargeIsPrimary && (
              // Aqui só quando a ação principal da linha é OUTRA — e com peso menor (contorno).
              <div className="mt-1">
                {payment.latePayment ? (
                  <ChargeButton payment={payment.latePayment} className={BUTTON_OUTLINE} />
                ) : (
                  <Link href={FINANCE_LATE_HREF} className={BUTTON_OUTLINE}>
                    Cobrar pagamento
                    <span className="sr-only"> — {entry.name} (abre o Financeiro)</span>
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </li>
  );
}
