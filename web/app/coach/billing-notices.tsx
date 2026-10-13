"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Icon, Modal, buttonClass } from "@/components/ui";
import { acknowledgePaymentConfirmation } from "./billing-actions";

/**
 * Avisos da assinatura do coach com o Trackly (estilo Netflix), montados pela casca do coach.
 *
 * `OverduePaymentNotice`: modal "Seu pagamento não foi aprovado" toda vez que o coach entra ou
 * navega pela área com a assinatura em atraso. "Lembrar depois" silencia até fechar o navegador
 * (sessionStorage guarda SÓ um flag booleano — nada pessoal ou financeiro).
 */

const DISMISS_KEY = "trackly:billing-notice-dismissed";

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // storage bloqueado (aba privada etc.): o aviso só volta na próxima navegação
  }
}

function daysLeftText(daysLeft: number | null): string {
  if (daysLeft === null) return "Atualize a forma de pagamento para evitar a suspensão do seu plano.";
  if (daysLeft <= 0) return "Seu plano pode ser suspenso a qualquer momento.";
  if (daysLeft === 1) return "Falta 1 dia para o seu plano ser suspenso.";
  return `Faltam ${daysLeft} dias para o seu plano ser suspenso.`;
}

export function OverduePaymentNotice({
  daysLeft,
  paymentHref,
}: {
  daysLeft: number | null;
  /** Tela "Forma de pagamento" (Pix Automático ou cartão). */
  paymentHref: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Reabre a cada navegação (o layout não remonta entre rotas irmãs), salvo "Lembrar depois".
  useEffect(() => {
    // Na própria tela de pagamento o aviso só atrapalharia.
    if (readDismissed() || pathname === paymentHref) return;
    const id = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(id);
  }, [pathname, paymentHref]);

  const remindLater = () => {
    writeDismissed();
    setOpen(false);
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Seu pagamento não foi aprovado">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-tint text-danger-text">
            <Icon name="alert" size={20} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm text-ink">
              Não conseguimos cobrar a mensalidade do Trackly. Seus alunos e dados continuam
              intactos.
            </p>
            <p className="text-sm font-semibold text-danger-text">{daysLeftText(daysLeft)}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="tertiary" onClick={remindLater}>
            Lembrar depois
          </Button>
          <Link href={paymentHref} className={buttonClass({ variant: "primary" })} onClick={() => setOpen(false)}>
            Pagar agora <Icon name="arrow-right" size={16} />
          </Link>
        </div>
      </div>
    </Modal>
  );
}

/** "Pagamento confirmado" uma única vez: limpa o flag no servidor assim que aparece. */
export function PaymentConfirmedNotice() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    void acknowledgePaymentConfirmation();
  }, []);

  if (!visible) return null;
  return (
    <div
      role="status"
      className="mb-6 flex items-center gap-3 rounded-md border border-success/40 bg-success-tint px-4 py-3 text-sm text-ink"
    >
      <Icon name="check-circle" size={20} className="shrink-0 text-success" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Pagamento confirmado.</span> Sua assinatura do Trackly está
        em dia.
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Fechar aviso"
        className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
