"use server";

import { coachCheckoutUrl } from "@/lib/billing/coach";
import { formatTaxDocument, parsePhone, parseTaxDocument } from "@/lib/billing/enroll";
import {
  abandonPendingSwitch,
  computeSwitchTiming,
  readSwitchContext,
  recordSwitchRequest,
} from "@/lib/billing/method-switch";
import {
  getCoachIdentity,
  pollPixAutomatico,
  saveBillingDocument,
  startPixAutomatico,
  startPixSwitch,
  type PixView,
} from "@/lib/billing/pix";
import { PAYMENT_METHOD_LABEL, type PaymentMethod, type SwitchTiming } from "@/lib/billing/switch";
import { pixAutomaticoConfigured } from "@/lib/billing/syncpay";

/**
 * Ações da tela "Assinar o Trackly / Forma de pagamento". A conta é SEMPRE a da sessão (nunca um
 * id vindo do navegador); CPF/telefone são revalidados aqui. Nada disso vai pro navegador além
 * do que a tela mostra (CPF formatado do próprio coach, QR de autorização).
 */

export type DocumentState =
  | null
  | { ok: true; document: string; phone: string | null }
  | { ok: false; error: string; field?: "document" | "phone" };

export async function saveBillingDocumentAction(_prev: DocumentState, formData: FormData): Promise<DocumentState> {
  const identity = await getCoachIdentity();
  if (!identity) return { ok: false, error: "Sua sessão expirou. Entre de novo." };

  const document = parseTaxDocument(formData.get("document"));
  if (!document) {
    return { ok: false, field: "document", error: "CPF inválido. Confira os números (ou informe um CNPJ válido)." };
  }
  const phone = parsePhone(formData.get("phone") ?? "");
  if (phone === undefined) {
    return { ok: false, field: "phone", error: "Telefone inválido. Use DDD + número, ex.: (11) 99999-9999." };
  }

  try {
    await saveBillingDocument(identity, document);
  } catch (err) {
    console.error("[billing] falha ao salvar CPF:", (err as Error).message);
    return { ok: false, error: "Não foi possível salvar agora. Tente de novo." };
  }
  return { ok: true, document: formatTaxDocument(document), phone };
}

export async function startPixAutomaticoAction(phone: string | null): Promise<PixView> {
  const identity = await getCoachIdentity();
  if (!identity) return { kind: "error", message: "Sua sessão expirou. Entre de novo." };
  if (!pixAutomaticoConfigured()) return { kind: "error", message: "O Pix Automático estará disponível em breve." };
  const parsed = parsePhone(phone ?? "");
  try {
    return await startPixAutomatico(identity, parsed ?? null);
  } catch (err) {
    console.error("[billing] falha ao iniciar Pix Automático:", (err as Error).message);
    return { kind: "error", message: "Não foi possível iniciar o Pix Automático agora. Tente de novo." };
  }
}

export async function pollPixAutomaticoAction(): Promise<PixView> {
  const identity = await getCoachIdentity();
  if (!identity) return { kind: "error", message: "Sua sessão expirou. Entre de novo." };
  try {
    return await pollPixAutomatico(identity);
  } catch (err) {
    console.error("[billing] falha ao consultar Pix Automático:", (err as Error).message);
    return { kind: "error", message: "Não foi possível consultar a SyncPay agora." };
  }
}

export type SwitchResult =
  | { kind: "error"; message: string }
  | { kind: "pix"; view: PixView }
  | { kind: "card"; url: string };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const fmt = (iso: string) => dateFmt.format(new Date(iso));

function timingError(timing: SwitchTiming, current: PaymentMethod | null): string {
  switch (timing.kind) {
    case "too_early":
      return `A troca abre em ${fmt(timing.opensAt)}, perto do vencimento de ${fmt(timing.currentCycleEndsAt)}, para você não pagar duas vezes pelo mesmo período.`;
    case "charge_in_progress":
      return `A cobrança do próximo ciclo já foi gerada${current ? ` no ${PAYMENT_METHOD_LABEL[current]}` : ""}. Depois que ela for confirmada, a troca abre de novo perto do vencimento seguinte.`;
    default:
      return "Não há assinatura ativa ou em atraso para trocar a forma de pagamento.";
  }
}

/**
 * "Trocar forma de pagamento" confirmado pelo coach. Confere de novo (com a SyncPay) se a troca
 * pode acontecer agora; registra o pedido; Pix: inscreve e devolve o QR; cartão: devolve o link
 * do checkout. A assinatura atual NÃO é tocada aqui — só é cancelada quando a nova estiver ativa.
 */
export async function confirmMethodSwitchAction(target: PaymentMethod, phone: string | null): Promise<SwitchResult> {
  const identity = await getCoachIdentity();
  if (!identity) return { kind: "error", message: "Sua sessão expirou. Entre de novo." };
  if (target !== "pix_automatico" && target !== "credit_card") return { kind: "error", message: "Forma de pagamento inválida." };

  try {
    const ctx = await readSwitchContext(identity.accountId);
    const row = ctx.row;
    if (!row?.token || (row.status !== "active" && row.status !== "overdue")) {
      return { kind: "error", message: "Não há assinatura ativa ou em atraso para trocar a forma de pagamento." };
    }
    // Mesmo método só faz sentido no cartão em atraso ("pagar com outro cartão").
    if (ctx.currentMethod === target && !(target === "credit_card" && row.status === "overdue")) {
      return { kind: "error", message: `${PAYMENT_METHOD_LABEL[target]} já é a sua forma de pagamento.` };
    }
    const parsedPhone = parsePhone(phone ?? "") ?? null;

    if (target === "pix_automatico") {
      if (!pixAutomaticoConfigured()) return { kind: "error", message: "O Pix Automático estará disponível em breve." };
      // Troca pra Pix já iniciada: só mostra o QR de novo (sem nova conferência de datas).
      if (ctx.openSwitch?.toMethod === "pix_automatico" && ctx.openSwitch.newToken) {
        const view = await startPixSwitch(identity, parsedPhone, { fromMethod: ctx.currentMethod, oldNextChargeAt: row.nextChargeAt, lostDays: null });
        return view.kind === "error" ? view : { kind: "pix", view };
      }
    }

    let timing: SwitchTiming;
    try {
      timing = await computeSwitchTiming(row);
    } catch (err) {
      console.error("[billing] consulta da assinatura (troca) falhou:", (err as Error).message);
      return { kind: "error", message: "Não conseguimos confirmar suas datas com a SyncPay agora. Tente de novo em alguns minutos." };
    }
    if (timing.kind !== "now") return { kind: "error", message: timingError(timing, ctx.currentMethod) };
    const meta = { fromMethod: ctx.currentMethod, oldNextChargeAt: timing.currentCycleEndsAt, lostDays: timing.lostDays };

    if (target === "pix_automatico") {
      const view = await startPixSwitch(identity, parsedPhone, meta);
      return view.kind === "error" ? view : { kind: "pix", view };
    }

    const url = coachCheckoutUrl();
    if (!url) return { kind: "error", message: "O cartão recorrente estará disponível em breve." };
    // Desistiu de uma troca pra Pix ainda não paga: a inscrição pendente não pode começar a cobrar.
    if (ctx.openSwitch?.toMethod === "pix_automatico" && ctx.openSwitch.newToken) {
      await abandonPendingSwitch(ctx.openSwitch.newToken);
    }
    await recordSwitchRequest(identity.accountId, row.token, {
      to_method: "credit_card",
      from_method: meta.fromMethod,
      old_next_charge_at: meta.oldNextChargeAt,
      lost_days: meta.lostDays,
      new_token: null,
    });
    return { kind: "card", url };
  } catch (err) {
    console.error("[billing] falha na troca de forma de pagamento:", (err as Error).message);
    return { kind: "error", message: "Não foi possível iniciar a troca agora. Tente de novo." };
  }
}
