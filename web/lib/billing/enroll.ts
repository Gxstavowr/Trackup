/**
 * Assinatura do coach — regras PURAS da tela "Forma de pagamento" (CPF, telefone, resposta do
 * enroll de Pix Automático da SyncPay). Sem I/O; testadas em `enroll.test.ts`.
 */
import { isSyncPayStatus, type BillingStatus, type SyncPayStatus } from "./state";

// ---------------------------------------------------------------------------------------------
// CPF / CNPJ / telefone
// ---------------------------------------------------------------------------------------------

function allSameDigit(d: string): boolean {
  return /^(\d)\1+$/.test(d);
}

/** CPF válido (11 dígitos + dígitos verificadores). Aceita com ou sem pontuação. */
export function isValidCpf(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 11 || allSameDigit(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

/** CNPJ válido (14 dígitos + dígitos verificadores). */
export function isValidCnpj(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 14 || allSameDigit(d)) return false;
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

/** CPF ou CNPJ válido -> só dígitos; inválido -> null. */
export function parseTaxDocument(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = value.replace(/\D/g, "");
  if (d.length === 11) return isValidCpf(d) ? d : null;
  if (d.length === 14) return isValidCnpj(d) ? d : null;
  return null;
}

/** 12345678909 -> 123.456.789-09; 14 dígitos -> 12.345.678/0001-95. Outros valores voltam como vieram. */
export function formatTaxDocument(digits: string): string {
  if (/^\d{11}$/.test(digits)) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (/^\d{14}$/.test(digits)) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return digits;
}

/**
 * Telefone opcional com DDD (10 ou 11 dígitos, formato da SyncPay). Vazio -> `null` (ok, sem
 * telefone); inválido -> `undefined`. Aceita +55 na frente.
 */
export function parsePhone(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  let d = value.replace(/\D/g, "");
  if (!d) return null;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return undefined;
  if (d.startsWith("0")) return undefined;
  return d;
}

// ---------------------------------------------------------------------------------------------
// Resposta do enroll (POST /subscription-plans/{plan}/enroll)
// ---------------------------------------------------------------------------------------------

export type MandateStatus = "CREATED" | "ACTIVE" | "CANCELLED";

export function isMandateStatus(v: unknown): v is MandateStatus {
  return v === "CREATED" || v === "ACTIVE" || v === "CANCELLED";
}

export type PixMandate = {
  mandateId: string | null;
  /** QR de autorização: string EMV ("00020126…", copia e cola). `null` enquanto processa. */
  qrCode: string | null;
  mandateStatus: MandateStatus | null;
};

export type EnrollResult =
  | { ok: true; subscriptionToken: string; status: SyncPayStatus; billingMethod: string | null; mandate: PixMandate }
  | { ok: false; message: string };

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export const ENROLL_GENERIC_ERROR =
  "Não foi possível iniciar o Pix Automático agora. Tente de novo em alguns minutos ou use o cartão.";
export const PIX_UNAVAILABLE_ERROR =
  "O Pix Automático ainda não está disponível para o Trackly. Use o cartão recorrente por enquanto.";

/** Todas as mensagens de erro que a SyncPay mandou (`message`, `error`, `errors.campo[]`). */
function errorMessages(body: unknown): string[] {
  const b = asObj(body);
  if (!b) return [];
  const out: string[] = [];
  const errors = asObj(b.errors);
  if (errors) {
    for (const list of Object.values(errors)) {
      if (Array.isArray(list)) {
        for (const m of list) if (str(m)) out.push(str(m)!);
      } else if (str(list)) {
        out.push(str(list)!);
      }
    }
  }
  for (const k of ["message", "error"]) if (str(b[k])) out.push(str(b[k])!);
  return out;
}

/** Só passa pro coach mensagem que parece escrita em português pela SyncPay (o resto vira genérica). */
function looksPortuguese(m: string): boolean {
  return /[ãõçáéíóúâêô]|\b(o|a|é|não|informado|inválido|obrigatório)\b/i.test(m) && !/validation failed/i.test(m);
}

/** Interpreta a resposta HTTP do enroll. Mensagens de erro sempre em pt-BR. */
export function parseEnrollResponse(httpStatus: number, body: unknown): EnrollResult {
  const messages = errorMessages(body);
  if (messages.some((m) => /pix autom[aá]tico/i.test(m) && /dispon[ií]vel|habilitad/i.test(m))) {
    return { ok: false, message: PIX_UNAVAILABLE_ERROR };
  }

  if (httpStatus === 201 || httpStatus === 200) {
    const b = asObj(body);
    const data = asObj(b?.data) ?? b; // tolera envelope { data: {...} }
    const token = str(data?.subscription_token);
    const status = data?.status;
    if (!token || !isSyncPayStatus(status)) return { ok: false, message: ENROLL_GENERIC_ERROR };
    const payment = asObj(data?.payment);
    return {
      ok: true,
      subscriptionToken: token,
      status,
      billingMethod: str(data?.billing_method),
      mandate: {
        mandateId: str(payment?.mandate_id),
        qrCode: str(payment?.qr_code),
        mandateStatus: isMandateStatus(payment?.mandate_status) ? payment.mandate_status : null,
      },
    };
  }

  if (httpStatus === 422) {
    const docError = asObj(asObj(body)?.errors)?.document;
    if (docError) return { ok: false, message: "A SyncPay recusou o CPF/CNPJ informado. Confira os números e tente de novo." };
    const pt = messages.filter(looksPortuguese);
    return { ok: false, message: pt.length ? `A SyncPay recusou os dados: ${pt.join(" ")}` : "A SyncPay recusou os dados informados. Confira e tente de novo." };
  }
  if (httpStatus === 404) {
    return { ok: false, message: "O plano de Pix Automático do Trackly não foi encontrado na SyncPay. Fale com o suporte do Trackly." };
  }
  return { ok: false, message: ENROLL_GENERIC_ERROR };
}

/**
 * Mandato do Pix Automático numa resposta de detalhe da assinatura, SE a SyncPay mandar (o
 * contrato documentado não traz; procuramos em `mandate`/`payment`/`pix_automatico`).
 */
export function extractMandate(data: unknown): Partial<PixMandate> | null {
  const d = asObj(data);
  if (!d) return null;
  for (const key of ["mandate", "payment", "pix_automatico"]) {
    const m = asObj(d[key]);
    if (!m) continue;
    const status = m.mandate_status ?? m.status;
    const found: Partial<PixMandate> = {};
    if (str(m.qr_code)) found.qrCode = str(m.qr_code);
    if (isMandateStatus(status)) found.mandateStatus = status;
    if (str(m.mandate_id) ?? str(m.id)) found.mandateId = str(m.mandate_id) ?? str(m.id);
    if (Object.keys(found).length) return found;
  }
  return null;
}

/**
 * Mandato só anda pra frente: CREATED -> ACTIVE -> CANCELLED (ou CREATED -> CANCELLED). Uma
 * consulta atrasada dizendo CREATED não desfaz um `mandato_ativado` já recebido.
 */
export function mergeMandateStatus(prev: MandateStatus | null, next: MandateStatus | null): MandateStatus | null {
  if (!next) return prev;
  const rank: Record<MandateStatus, number> = { CREATED: 0, ACTIVE: 1, CANCELLED: 2 };
  return !prev || rank[next] > rank[prev] ? next : prev;
}

/** Status do mandato que um webhook de mandato implica. */
export function mandateStatusFromEvent(event: string, payload: unknown): MandateStatus | null {
  const block = asObj(asObj(payload)?.mandate);
  if (isMandateStatus(block?.status)) return block.status;
  if (event === "mandato_ativado") return "ACTIVE";
  if (event === "mandato_cancelado") return "CANCELLED";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Decisões
// ---------------------------------------------------------------------------------------------

export type PixEnrollDecision = "already_active" | "reuse" | "enroll";

/**
 * Inscrever no Pix Automático ou reaproveitar o que já existe (nunca inscrever duas vezes).
 *  - assinatura ativa: nada a fazer;
 *  - já existe enroll de Pix do Trackly pro token atual, mandato não cancelado e assinatura não
 *    suspensa/cancelada: reaproveita (mesmo QR / mesmo token);
 *  - senão: novo enroll.
 */
export function decidePixEnroll(input: {
  status: BillingStatus | null;
  token: string | null;
  /** O token atual veio de um enroll de Pix feito pelo Trackly. */
  tokenIsOurPixEnroll: boolean;
  mandateStatus: MandateStatus | null;
}): PixEnrollDecision {
  if (input.status === "active") return "already_active";
  if (
    input.token &&
    input.tokenIsOurPixEnroll &&
    input.mandateStatus !== "CANCELLED" &&
    input.status !== "suspended" &&
    input.status !== "cancelled"
  ) {
    return "reuse";
  }
  return "enroll";
}

/**
 * Status local depois de um enroll novo. Só "sem assinatura"/"aguardando 1º pagamento" adotam o
 * status da SyncPay: quem está em atraso, suspenso ou cancelado continua assim até o pagamento
 * entrar (senão inscrever-se destravaria o plano sem pagar).
 */
export function statusAfterEnroll(prev: BillingStatus | null, enrolled: SyncPayStatus): BillingStatus {
  if (prev === null || prev === "none" || prev === "pending_first_payment") {
    return enrolled;
  }
  return prev;
}
