import type { EvaluationRow, EvaluationState } from "@/lib/evaluations";
import { formatBRL, formatDateShort } from "@/lib/finance/format";
import type { FinancePayment } from "@/lib/finance/queries";
import type { Client, ClientPaymentStatus } from "@/lib/repository";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { SITUATION_META } from "@/lib/evaluation-situation";
import { formatDateOnlyShort, whatsappDigits } from "../avaliacoes/evaluation-ui";

/**
 * Situação de cada aluno na lista (`/coach/alunos`) — módulo PURO (sem I/O), usado pelo
 * servidor (monta as entradas) e pelo client (busca/filtro/ordenação).
 *
 * Três eixos que NUNCA se misturam na tela:
 *  1. dados do aluno (nome, idade, altura, objetivo);
 *  2. ACOMPANHAMENTO — `TrackingState`: o ciclo de avaliação (`EvaluationState`, mesma fonte
 *     de `/coach/avaliacoes`) + os estados que vêm antes/fora dele (convite, pausa);
 *  3. FINANCEIRO — `ClientPaymentStatus` (em dia / pendente / atrasado / sem assinatura).
 *
 * Prioridade ("necessidade de ação") é calculada aqui, em `tier` (1 = mais urgente), pra a
 * ordenação e o botão principal saírem da MESMA regra.
 */

export type TrackingState = EvaluationState | "invite_pending" | "invite_sent" | "paused";

/** Uma única ação principal por aluno — o botão preenchido/de destaque da linha. */
export type PrimaryAction =
  | "open_evaluation"
  | "continue_evaluation"
  | "finish_orientation"
  | "charge_checkin"
  | "charge_payment"
  | "copy_invite"
  | "view_tracking";

/** Rótulo do botão principal de cada `PrimaryAction` — usado pelo cabeçalho do perfil do aluno. */
export const PRIMARY_ACTION_LABEL: Record<PrimaryAction, string> = {
  open_evaluation: "Abrir avaliação",
  continue_evaluation: "Continuar avaliação",
  finish_orientation: "Finalizar avaliação",
  charge_checkin: "Cobrar check-in",
  charge_payment: "Cobrar pagamento",
  copy_invite: "Copiar link do convite",
  view_tracking: "Ver acompanhamento",
};

/** Nomes iguais aos de /coach e /coach/avaliacoes (`SITUATION_META`). */
export const TRACKING_LABEL: Record<TrackingState, string> = {
  pending: SITUATION_META.review_pending.label,
  in_progress: SITUATION_META.review_in_progress.label,
  draft: SITUATION_META.awaiting_orientation.label,
  awaiting_checkin: SITUATION_META.checkin_waiting.label,
  done: SITUATION_META.done.label,
  invite_pending: "Convite pendente",
  invite_sent: "Convite enviado",
  paused: "Acompanhamento pausado",
};

/** Ordem em que as situações aparecem no filtro (do que exige ação ao que não exige). */
export const TRACKING_FILTER_ORDER: TrackingState[] = [
  "pending",
  "in_progress",
  "draft",
  "awaiting_checkin",
  "done",
  "invite_pending",
  "invite_sent",
  "paused",
];

export const PAYMENT_FILTER_LABEL: Record<ClientPaymentStatus, string> = {
  atrasado: "Pagamento atrasado",
  pendente: "Pagamento pendente",
  em_dia: "Pagamento em dia",
  sem_assinatura: "Sem assinatura",
};

export const PAYMENT_FILTER_ORDER: ClientPaymentStatus[] = ["atrasado", "pendente", "em_dia", "sem_assinatura"];

export type StudentEntry = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  // Dados do aluno (podem faltar: o cadastro só pede nome; idade/altura/objetivo são opcionais).
  age: number | null;
  heightCm: number | null;
  objective: string | null;
  inviteUrl: string;
  // Acompanhamento
  tracking: {
    state: TrackingState;
    /** `awaiting_checkin` com check-in já marcado como atrasado. */
    late: boolean;
    weekNumber: number | null;
    nextAction: string;
  };
  // Financeiro (separado do acompanhamento)
  payment: {
    status: ClientPaymentStatus;
    detail: string;
    /** A cobrança mais antiga em atraso — alimenta o "Cobrar pagamento" via WhatsApp. */
    latePayment: FinancePayment | null;
  };
  // Prioridade
  primary: PrimaryAction;
  /** 1 = mais urgente. <= 4 significa "exige ação do coach agora". */
  tier: number;
  tierKey: number;
  needsAction: boolean;
  /** true quando o motivo da urgência é dinheiro/atraso (pinta a borda com a cor de atraso). */
  urgentLate: boolean;
  lastUpdate: { iso: string; relative: string; reason: string };
};

export const NEEDS_ACTION_MAX_TIER = 4;

export type ListGroup = "action" | "waiting" | "ok" | "paused";

/** Grupo da lista (ordenada por urgência). Quem tem ação disponível nunca cai em "Em dia". */
export function groupOf(e: StudentEntry): ListGroup {
  if (e.tier <= NEEDS_ACTION_MAX_TIER) return "action";
  if (e.tier <= 6) return "waiting";
  return e.tier === 9 ? "paused" : "ok";
}

export const GROUP_LABEL: Record<ListGroup, string> = {
  action: "Precisam da sua ação",
  waiting: "Aguardando o aluno",
  ok: "Em dia",
  paused: "Pausados",
};

function trackingStateOf(client: Client, evaluation: EvaluationRow | null): TrackingState {
  if (client.status === "paused") return "paused";
  if (client.invite_status === "pending") return "invite_pending";
  if (client.invite_status === "invited") return "invite_sent";
  return evaluation?.state ?? "awaiting_checkin";
}

function nextActionText(state: TrackingState, evaluation: EvaluationRow | null): string {
  const week = evaluation?.weekNumber;
  switch (state) {
    case "pending":
      return `Abrir e avaliar o check-in da semana ${week}`;
    case "in_progress":
      return "Terminar a avaliação e escrever a orientação";
    case "draft":
      return "Finalizar e enviar a orientação ao aluno";
    case "awaiting_checkin":
      if (!evaluation) return "Aguardar o aluno enviar o primeiro check-in";
      return evaluation.late
        ? `Cobrar o check-in atrasado (previsto até ${formatDateOnlyShort(evaluation.periodEnd)})`
        : `Aguardar o check-in da semana ${week} (até ${formatDateOnlyShort(evaluation.periodEnd)})`;
    case "done":
      return "Nenhuma pendência de acompanhamento";
    case "invite_pending":
      return "Enviar o link de convite ao aluno";
    case "invite_sent":
      return "Aguardar o aluno aceitar o convite";
    case "paused":
      return "Acompanhamento pausado — nenhuma ação";
  }
}

function paymentDetailText(status: ClientPaymentStatus, late: FinancePayment | null): string {
  switch (status) {
    case "atrasado":
      if (!late) return "Há cobrança vencida — veja os detalhes no Financeiro";
      return `${formatBRL(late.amountCents)} · venceu em ${formatDateShort(late.dueDate)} · ${late.daysLate} ${
        late.daysLate === 1 ? "dia" : "dias"
      } de atraso`;
    case "pendente":
      return "Há uma cobrança a vencer";
    case "em_dia":
      return "Nenhuma cobrança em aberto";
    case "sem_assinatura":
      return "Nenhuma assinatura cadastrada";
  }
}

/** Última movimentação conhecida do aluno: o instante mais recente entre check-in, avaliação, convite e cadastro. */
function lastUpdateOf(client: Client, evaluation: EvaluationRow | null): StudentEntry["lastUpdate"] {
  const candidates: { iso: string | null | undefined; reason: string }[] = [
    { iso: evaluation?.reviewedAt, reason: "Orientação enviada" },
    { iso: evaluation?.reviewOpenedAt, reason: "Avaliação aberta" },
    { iso: evaluation?.submittedAt, reason: "Check-in enviado" },
    { iso: client.activated_at, reason: "Convite aceito" },
    { iso: client.invited_at, reason: "Convite enviado" },
    { iso: client.created_at, reason: "Aluno cadastrado" },
  ];
  let best: { iso: string; reason: string } | null = null;
  for (const c of candidates) {
    if (!c.iso) continue;
    if (!best || Date.parse(c.iso) > Date.parse(best.iso)) best = { iso: c.iso, reason: c.reason };
  }
  const chosen = best ?? { iso: client.created_at, reason: "Aluno cadastrado" };
  return { iso: chosen.iso, relative: formatRelativeTime(chosen.iso), reason: chosen.reason };
}

export function buildStudentEntry(input: {
  client: Client;
  evaluation: EvaluationRow | null;
  paymentStatus: ClientPaymentStatus;
  latePayment: FinancePayment | null;
  inviteUrl: string;
}): StudentEntry {
  const { client, evaluation, paymentStatus, latePayment, inviteUrl } = input;
  const state = trackingStateOf(client, evaluation);
  const paymentLate = paymentStatus === "atrasado";
  const late = state === "awaiting_checkin" && (evaluation?.late ?? false);

  // Regra ÚNICA de prioridade (menor tier = mais urgente) e do botão principal:
  //  1 avaliação que o coach precisa fazer (pendente / em avaliação / rascunho)
  //  2 check-in atrasado (cobrar o aluno)
  //  3 pagamento atrasado (cobrar o pagamento)
  //  4 convite ainda não enviado
  //  5 aguardando o check-in do aluno (no prazo)
  //  6 convite enviado, aguardando aceite
  //  8 ciclo concluído / 9 pausado — nada a fazer, só consultar
  // Ações por WhatsApp só valem com telefone válido; sem ele a ação é pulada na escolha da
  // principal (continua no menu "Mais ações", desabilitada, com a explicação).
  const canWhatsapp = whatsappDigits(client.phone) !== null;
  const canChargePayment = canWhatsapp || latePayment === null; // sem detalhes -> link pro Financeiro
  let tier: number;
  let primary: PrimaryAction;
  let tierKey = 0;
  let urgentTier = 0;
  const lateKey = Date.parse(`${evaluation?.periodEnd}T00:00:00Z`) || 0;
  if (state === "pending" || state === "in_progress" || state === "draft") {
    tier = 1;
    primary =
      state === "pending" ? "open_evaluation" : state === "in_progress" ? "continue_evaluation" : "finish_orientation";
    tierKey = Date.parse(evaluation?.submittedAt ?? "") || 0;
  } else {
    // Candidatas em ordem de prioridade; a principal é a primeira DISPONÍVEL.
    const candidates: { tier: number; action: PrimaryAction; ok: boolean; key: number }[] = [];
    if (late) candidates.push({ tier: 2, action: "charge_checkin", ok: canWhatsapp, key: lateKey });
    if (paymentLate)
      candidates.push({ tier: 3, action: "charge_payment", ok: canChargePayment, key: -(latePayment?.daysLate ?? 0) });
    if (state === "invite_pending") candidates.push({ tier: 4, action: "copy_invite", ok: true, key: 0 });
    if (state === "awaiting_checkin" && !late)
      candidates.push({ tier: 5, action: "charge_checkin", ok: canWhatsapp, key: 0 });
    if (state === "invite_sent") candidates.push({ tier: 6, action: "copy_invite", ok: true, key: 0 });
    const chosen = candidates.find((c) => c.ok);
    if (chosen) {
      tier = chosen.tier;
      primary = chosen.action;
      tierKey = chosen.key;
    } else {
      // Nada disponível: abre o acompanhamento. A urgência (se houver) continua valendo na ordem.
      primary = "view_tracking";
      tier = candidates[0]?.tier ?? (state === "paused" ? 9 : 8);
      tierKey = candidates[0]?.key ?? 0;
    }
  }
  urgentTier = tier;

  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    age: client.age,
    heightCm: client.height_cm,
    objective: client.objective?.trim() || null,
    inviteUrl,
    tracking: {
      state,
      late,
      weekNumber: evaluation?.weekNumber ?? null,
      nextAction: nextActionText(state, evaluation),
    },
    payment: {
      status: paymentStatus,
      detail: paymentDetailText(paymentStatus, latePayment),
      latePayment,
    },
    primary,
    tier,
    tierKey,
    needsAction: tier <= NEEDS_ACTION_MAX_TIER,
    urgentLate: urgentTier === 2 || urgentTier === 3,
    lastUpdate: lastUpdateOf(client, evaluation),
  };
}

// ----------------------------------------------------------------------------
// Busca / filtro / ordenação (client)
// ----------------------------------------------------------------------------

export type SortKey = "urgency" | "name" | "updated";

export type ListControls = {
  query: string;
  tracking: TrackingState | "all";
  payment: ClientPaymentStatus | "all";
  onlyNeedsAction: boolean;
  sort: SortKey;
};

export const DEFAULT_CONTROLS: ListControls = {
  query: "",
  tracking: "all",
  payment: "all",
  onlyNeedsAction: false,
  sort: "urgency",
};

export function hasActiveFilters(c: ListControls): boolean {
  return c.query.trim() !== "" || c.tracking !== "all" || c.payment !== "all" || c.onlyNeedsAction;
}

/** minúsculas + sem acento, pra "joao" achar "João". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function byName(a: StudentEntry, b: StudentEntry): number {
  return a.name.localeCompare(b.name, "pt-BR");
}

export function filterAndSort(entries: StudentEntry[], controls: ListControls): StudentEntry[] {
  const q = normalize(controls.query.trim());
  const filtered = entries.filter((e) => {
    if (controls.tracking !== "all" && e.tracking.state !== controls.tracking) return false;
    if (controls.payment !== "all" && e.payment.status !== controls.payment) return false;
    if (controls.onlyNeedsAction && !e.needsAction) return false;
    if (q) {
      const haystack = normalize([e.name, e.email ?? "", e.objective ?? ""].join(" "));
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (controls.sort === "name") return byName(a, b);
    if (controls.sort === "updated") {
      const diff = Date.parse(b.lastUpdate.iso) - Date.parse(a.lastUpdate.iso);
      return diff !== 0 ? diff : byName(a, b);
    }
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tierKey !== b.tierKey) return a.tierKey - b.tierKey;
    return byName(a, b);
  });
}

/** Idade -> "29 anos". */
export function formatAge(age: number | null): string | null {
  return age == null ? null : `${age} ${age === 1 ? "ano" : "anos"}`;
}

/** 178 -> "1,78 m". */
export function formatHeight(heightCm: number | null): string | null {
  return heightCm == null ? null : `${(heightCm / 100).toFixed(2).replace(".", ",")} m`;
}
