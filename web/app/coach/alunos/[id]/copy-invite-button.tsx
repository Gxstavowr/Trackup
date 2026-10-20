"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckIcon, LinkIcon } from "../icons";
import { getInviteStatusAction, recordInviteCopiedAction, resendInviteAction } from "../actions";
import type { InviteStatusInfo, SendInviteResult } from "@/lib/onboarding/invites";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";

type AvailableStatus = Extract<InviteStatusInfo, { available: true }>;

function clientIdFromUrl(url: string): string | null {
  try {
    return new URL(url, "http://local").searchParams.get("id");
  } catch {
    return null;
  }
}

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DATE_FMT.format(d);
}

function toneOf(stage: AvailableStatus["stage"]): BadgeTone {
  if (stage === "invite_failed") return "danger";
  if (stage === "invite_not_sent") return "warning";
  if (stage === "invite_sent" || stage === "invite_accepted") return "info";
  return "neutral";
}

/**
 * "Copiar link do convite" do cabeçalho do perfil (mesma ação e rótulo da lista de Alunos). Com o
 * fluxo V5 disponível (migração 0022), mostra também a situação do convite (enviado para quem e
 * quando, falha, aceito) e o botão de enviar/reenviar por e-mail — que só diz "enviado" se deu certo.
 * Sem a 0022, continua sendo só o botão de copiar, como antes.
 */
export default function CopyInviteButton({ url, className }: { url: string; className: string }) {
  const clientId = clientIdFromUrl(url);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<AvailableStatus | null>(null);
  const [result, setResult] = useState<SendInviteResult | null>(null);
  const [sending, startSending] = useTransition();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    getInviteStatusAction(clientId)
      .then((s) => {
        if (alive && s?.available) setStatus(s);
      })
      .catch(() => {
        // Situação do convite é complementar: sem ela, o botão de copiar continua funcionando.
      });
    return () => {
      alive = false;
    };
  }, [clientId, reload]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (clientId && status) recordInviteCopiedAction(clientId).catch(() => {});
    } catch {
      // Clipboard pode falhar (permissão negada, contexto não seguro etc.) — sem feedback de
      // erro dedicado, é um detalhe secundário da tela.
    }
  }

  function send() {
    if (!clientId) return;
    startSending(async () => {
      try {
        setResult(await resendInviteAction(clientId));
      } catch {
        setResult({ ok: false, error: "Não foi possível enviar o convite. Tente novamente." });
      }
      setReload((n) => n + 1);
    });
  }

  const copyButton = (
    <button type="button" onClick={copyLink} className={`${className} gap-2`}>
      {copied ? <CheckIcon /> : <LinkIcon />}
      <span aria-live="polite">{copied ? "Link copiado!" : "Copiar link do convite"}</span>
    </button>
  );

  if (!status) return copyButton;

  const sentAt = formatWhen(status.lastSentAt);
  const failedAt = formatWhen(status.lastFailedAt);
  const neverSent = status.stage === "invite_not_sent";

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      {copyButton}
      <div className="flex flex-col gap-1 text-xs text-ink-muted sm:items-end sm:text-right">
        <Badge tone={toneOf(status.stage)} dot>
          {status.label}
        </Badge>
        {status.stage === "invite_failed" && failedAt && <span>Última tentativa falhou em {failedAt}.</span>}
        {sentAt && status.stage !== "invite_failed" && (
          <span className="break-all">
            {status.lastSentSimulated ? "Simulado (demonstração)" : "Enviado"}
            {status.lastSentTo ? ` para ${status.lastSentTo}` : ""} em {sentAt}.
          </span>
        )}
        {!status.email && !status.hasAccount && <span>Cadastre o e-mail do aluno para enviar o convite.</span>}
      </div>
      {result && (
        <p
          role="status"
          className={`max-w-72 break-words text-xs sm:text-right ${result.ok ? "text-success" : "text-coral-text"}`}
        >
          {result.ok
            ? result.simulated
              ? `Convite simulado para ${result.sentTo} (demonstração, nenhum e-mail enviado).`
              : `Convite enviado para ${result.sentTo}.`
            : result.error}
        </p>
      )}
      {status.canResend && (
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className={buttonClass({ variant: "tertiary", size: "sm", width: "mobile" })}
        >
          {sending ? "Enviando…" : neverSent ? "Enviar convite por e-mail" : "Reenviar convite"}
        </button>
      )}
    </div>
  );
}
