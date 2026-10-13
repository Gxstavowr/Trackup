"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import Icon, { type IconName } from "@/components/ui/icon";
import {
  ChargeCheckinButton,
  OrientationReadyButton,
  evaluationHref,
} from "../avaliacoes/evaluation-ui";
import ChargeButton from "../financeiro/charge-button";
import { sendInviteAction } from "./actions";
import RowMenu from "./row-menu";
import { PaymentStatusBadge, TrackingStatusBadge } from "./status-badges";
import {
  PRIMARY_ACTION_LABEL,
  formatAge,
  formatHeight,
  type StudentEntry,
} from "./student-situation";

const FINANCE_LATE_HREF = "/coach/financeiro#atrasados";

/**
 * Colunas da tabela no desktop (>= 1280px), definidas na `<ul>` (`student-list.tsx`); cada linha
 * e o cabeçalho usam `subgrid`, então ficam alinhados entre si. A coluna de ação é `auto`: ela
 * cresce até o botão principal mais largo da lista caber inteiro (rótulo nunca cortado).
 */
export const LIST_GRID_XL =
  "xl:grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(9.5rem,1fr)_auto] xl:gap-x-4";

/** Linha/cabeçalho dentro da grade de `LIST_GRID_XL`. */
export const ROW_SUBGRID_XL = "xl:col-span-4 xl:grid-cols-subgrid";

/** Item do menu "Mais ações": mesma altura/alinhamento para link, botão e formulário. */
const MENU_ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm font-medium text-ink " +
  "transition-colors hover:bg-brand-tint hover:text-brand focus-visible:outline-2 focus-visible:outline-brand " +
  "active:translate-y-px";

function MenuLink({ href, icon, children }: { href: string; icon: IconName; children: ReactNode }) {
  return (
    <Link href={href} className={MENU_ITEM}>
      <Icon name={icon} size={18} className="shrink-0 text-ink-muted" />
      {children}
    </Link>
  );
}

function CopyInviteButton({
  url,
  className,
  iconInside = false,
  label = "Copiar link do convite",
  studentName,
}: {
  url: string;
  className: string;
  iconInside?: boolean;
  /** Rótulo visível (a linha usa o curto "Copiar convite"; o menu, o completo). */
  label?: string;
  studentName?: string;
}) {
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
    <button type="button" onClick={copyLink} className={className}>
      {iconInside && (
        <Icon name={copied ? "check" : "link"} size={18} className="shrink-0 text-ink-muted" />
      )}
      <span aria-live="polite">{copied ? "Link copiado!" : label}</span>
      {studentName && <span className="sr-only"> — {studentName}</span>}
    </button>
  );
}

/** Dados cadastrais (só o que existe), sem o e-mail — que tem linha própria. */
function profileLine(entry: StudentEntry): string | null {
  const parts = [formatAge(entry.age), formatHeight(entry.heightCm), entry.objective].filter(
    (p): p is string => Boolean(p)
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Rótulo de bloco visível só no cartão (no desktop o cabeçalho da tabela já nomeia a coluna). */
function CardLabel({ children }: { children: ReactNode }) {
  return <span className="t-label text-ink-faint xl:sr-only">{children}</span>;
}

/**
 * Linha de um aluno. Mesma marcação em três formatos:
 *  - < 640px: cartão empilhado (nome + atualização; e-mail e dados em linhas próprias; blocos
 *    "Acompanhamento" e "Financeiro" um sob o outro; botão principal largo + menu "⋯");
 *  - 640–1279px: cartão com os dois blocos lado a lado e as ações alinhadas à direita;
 *  - >= 1280px: linha de tabela (Aluno | Acompanhamento | Financeiro | Ação) em `subgrid`.
 *
 * Acompanhamento e financeiro são dois blocos/selos distintos (nunca misturados). UMA ação
 * principal (a "próxima ação", mesma regra que ordena a lista — `student-situation.ts`); as
 * demais ficam no menu "Mais ações". Preenchido (destaque da marca) só quando é trabalho do
 * coach (avaliação); cobranças e convites usam botão de contorno.
 */
export default function ClientRow({ entry }: { entry: StudentEntry }) {
  const { tracking, payment, primary } = entry;
  const isInviteState = tracking.state === "invite_pending" || tracking.state === "invite_sent";
  const chargeIsPrimary = primary === "charge_payment";
  const label = PRIMARY_ACTION_LABEL[primary];

  const variant = entry.tier === 1 ? "primary" : "secondary";
  // O botão base já é `whitespace-nowrap`: o rótulo nunca quebra nem é cortado — é a coluna
  // (auto, no desktop) / o flex (cartão) que se ajusta à largura dele.
  const primaryClass = buttonClass({ variant, size: "sm", className: "w-full" });

  const accent = !entry.needsAction
    ? "border-l-transparent"
    : entry.urgentLate
      ? "border-l-late"
      : "border-l-brand";

  const clientRef = { id: entry.id, name: entry.name, phone: entry.phone };
  const profile = `/coach/alunos/${entry.id}`;

  function renderPrimary() {
    switch (primary) {
      case "open_evaluation":
      case "continue_evaluation":
      case "finish_orientation":
        return (
          <Link href={evaluationHref(entry.id)} className={primaryClass}>
            {label}
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
            {label}
            <span className="sr-only"> — {entry.name} (abre o Financeiro)</span>
          </Link>
        );
      case "copy_invite":
        return (
          <CopyInviteButton
            url={entry.inviteUrl}
            label="Copiar convite"
            studentName={entry.name}
            className={primaryClass}
          />
        );
      case "view_tracking":
        return (
          <Link href={profile} className={primaryClass}>
            {label}
            <span className="sr-only"> — {entry.name}</span>
          </Link>
        );
    }
  }

  const updateTitle = `${entry.lastUpdate.reason} · ${entry.lastUpdate.relative}`;
  const showWeek = tracking.weekNumber !== null && !isInviteState && tracking.state !== "paused";
  const details = profileLine(entry);

  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 rounded-lg border border-l-4 border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong sm:grid-cols-2 xl:items-center xl:gap-y-0 ${ROW_SUBGRID_XL} ${accent}`}
    >
      {/* ALUNO: nome, e-mail e dados cadastrais em linhas separadas (secundárias, discretas) */}
      <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-0.5">
        <Link
          href={profile}
          title={entry.name}
          className="-my-1.5 w-fit max-w-full break-words py-1.5 text-base font-semibold leading-snug text-ink hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          {entry.name}
        </Link>
        {entry.email ? (
          // Tabela (xl): uma linha com reticências e o e-mail inteiro no `title`. Cartão: quebra
          // de preferência antes do "@" (<wbr>), nunca no meio do usuário/domínio se couber. São
          // dois spans porque o Chrome quebra no <wbr> mesmo com `white-space: nowrap` — na tabela
          // o e-mail vai sem o <wbr>. Só um deles fica visível (o outro é `display: none`).
          <>
            <span
              className="block max-w-full text-[0.8125rem] leading-snug text-ink-muted [overflow-wrap:anywhere] xl:hidden"
              title={entry.email}
            >
              {emailWithBreak(entry.email)}
            </span>
            <span
              className="hidden min-w-0 max-w-full truncate text-[0.8125rem] leading-snug text-ink-muted xl:block"
              title={entry.email}
            >
              {entry.email}
            </span>
          </>
        ) : (
          <span className="text-[0.8125rem] leading-snug text-ink-faint">Sem e-mail no cadastro</span>
        )}
        {details && (
          <span className="break-words text-xs leading-snug text-ink-faint" title={details}>
            {details}
          </span>
        )}
      </div>

      {/* Última atualização no cartão (canto superior direito); no desktop fica no acompanhamento */}
      <span
        className="col-start-2 row-start-1 whitespace-nowrap text-right text-xs text-ink-faint xl:hidden"
        title={updateTitle}
      >
        {entry.lastUpdate.relative}
      </span>

      {/* ACOMPANHAMENTO */}
      <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1 sm:col-start-1 sm:row-start-2 xl:col-start-2 xl:row-start-1">
        <CardLabel>Acompanhamento</CardLabel>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <TrackingStatusBadge state={tracking.state} late={tracking.late} />
          {showWeek && (
            <span className="whitespace-nowrap text-xs text-ink-faint">Sem. {tracking.weekNumber}</span>
          )}
        </div>
        <p
          className={`line-clamp-2 text-[0.8125rem] leading-snug ${
            tracking.late ? "text-late-text" : "text-ink-muted"
          }`}
          title={tracking.nextAction}
        >
          <span className="sr-only">Próxima ação: </span>
          {tracking.nextAction}
        </p>
        <span className="hidden text-xs text-ink-faint xl:block" title={updateTitle}>
          Atualização: {entry.lastUpdate.relative}
        </span>
      </div>

      {/* FINANCEIRO */}
      <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-2 xl:col-start-3 xl:row-start-1">
        <CardLabel>Financeiro</CardLabel>
        <div className="flex">
          <PaymentStatusBadge status={payment.status} />
        </div>
        <p
          className={`line-clamp-2 text-[0.8125rem] leading-snug ${
            payment.status === "atrasado" ? "text-late-text" : "text-ink-muted"
          }`}
          title={payment.detail}
        >
          {payment.detail}
        </p>
      </div>

      {/* AÇÃO: uma principal (destacada) + menu "⋯" com as secundárias */}
      <div className="col-span-2 flex items-start gap-2 border-t border-line pt-3 sm:justify-end xl:col-span-1 xl:col-start-4 xl:row-start-1 xl:items-center xl:border-t-0 xl:pt-0">
        <div className="min-w-0 flex-1 sm:min-w-44 sm:flex-none xl:flex-1 [&>div]:items-stretch [&_button:disabled]:w-full [&_p]:text-center">
          {renderPrimary()}
        </div>
        <RowMenu label={`Mais ações — ${entry.name}`}>
          <MenuLink href={profile} icon="user">
            Abrir perfil do aluno
          </MenuLink>
          {primary !== "copy_invite" && isInviteState && (
            <CopyInviteButton url={entry.inviteUrl} iconInside className={MENU_ITEM} />
          )}
          {isInviteState && (
            <form action={sendInviteAction} className="contents">
              <input type="hidden" name="clientId" value={entry.id} />
              <button type="submit" className={MENU_ITEM}>
                <Icon name="check" size={18} className="shrink-0 text-ink-muted" />
                {tracking.state === "invite_sent" ? "Reenviar convite" : "Marcar como enviado"}
              </button>
            </form>
          )}
          {payment.status === "atrasado" &&
            !chargeIsPrimary &&
            (payment.latePayment ? (
              <ChargeButton payment={payment.latePayment} className={MENU_ITEM} />
            ) : (
              <Link href={FINANCE_LATE_HREF} className={MENU_ITEM}>
                <Icon name="wallet" size={18} className="shrink-0 text-ink-muted" />
                Cobrar pagamento
                <span className="sr-only"> — {entry.name} (abre o Financeiro)</span>
              </Link>
            ))}
          {tracking.state === "awaiting_checkin" && primary !== "charge_checkin" && (
            // Indisponível como principal (aluno sem telefone): fica aqui, desabilitada, com a explicação.
            <ChargeCheckinButton
              client={clientRef}
              weekNumber={tracking.weekNumber ?? 1}
              late={tracking.late}
              className={MENU_ITEM}
            />
          )}
          {tracking.state === "done" && (
            // Ciclo concluído: ponto de apoio pra avisar o aluno pelo WhatsApp (item 28 do TODO) — nunca automático.
            <OrientationReadyButton
              client={clientRef}
              weekNumber={tracking.weekNumber ?? 1}
              className={MENU_ITEM}
            />
          )}
          <MenuLink href={`${profile}/treino`} icon="workout">
            Treino
          </MenuLink>
          <MenuLink href={`${profile}/nutricao`} icon="nutrition">
            Nutrição
          </MenuLink>
          <MenuLink href={`${profile}/pagamento`} icon="wallet">
            Pagamentos
          </MenuLink>
        </RowMenu>
      </div>
    </li>
  );
}

/** E-mail com um ponto de quebra opcional antes do "@" (cartão estreito quebra ali, não no meio). */
function emailWithBreak(email: string): ReactNode {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  return (
    <>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </>
  );
}
