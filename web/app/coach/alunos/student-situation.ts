import type { EvaluationRow, EvaluationState } from "@/lib/evaluations";
import { formatBRL, formatDateShort } from "@/lib/finance/format";
import type { FinancePayment } from "@/lib/finance/queries";
import type { Client, ClientPaymentStatus } from "@/lib/repository";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { deriveOnboardingStage, type OnboardingStage, type OnboardingStatusRow } from "@/lib/onboarding/stage";
import { packageLabel, type ModuleId, type PackageId } from "@/lib/onboarding/packages";
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

/**
 * Estágios do cadastro novo (V5) que substituem o ciclo de avaliação enquanto o aluno ainda não
 * recebeu o protocolo. Cada um tem rótulo próprio: nunca "Pendente" genérico.
 */
export type OnboardingTrackingState =
  | "invite_failed"
  | "invite_accepted"
  | "account_created"
  | "questionnaire_pending"
  | "questionnaire_submitted"
  | "protocol_preparing"
  | "protocol_partial";

export type TrackingState =
  | EvaluationState
  | "invite_pending"
  | "invite_sent"
  | "paused"
  | OnboardingTrackingState;

/** Fila "Novos cadastros": cada aluno cai em no máximo um balde. */
export type NewSignupBucket = "invite_pending" | "awaiting_questionnaire" | "awaiting_protocol";

export const BUCKET_LABEL: Record<NewSignupBucket, string> = {
  awaiting_questionnaire: "Aguardando questionário",
  invite_pending: "Convite sem aceite",
  awaiting_protocol: "Aguardando protocolo",
};

export const BUCKET_ORDER: NewSignupBucket[] = ["awaiting_protocol", "awaiting_questionnaire", "invite_pending"];

/** Linha de `client_onboarding_status` (0022) com o que a lista precisa. Sem respostas. */
export type OnboardingRow = OnboardingStatusRow & {
  client_id: string;
  questionnaire_id: string | null;
  questionnaire_submitted_at: string | null;
};

/** Situação de cadastro de um aluno (serializável: datas em ISO). */
export type OnboardingInfo = {
  stage: OnboardingStage;
  bucket: NewSignupBucket | null;
  packageId: PackageId | null;
  packageLabel: string | null;
  /** Quando o questionário foi recebido. */
  receivedAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  missingModules: ModuleId[];
};

const BUCKET_BY_STAGE: Partial<Record<OnboardingStage, NewSignupBucket>> = {
  invite_not_sent: "invite_pending",
  invite_failed: "invite_pending",
  invite_sent: "invite_pending",
  invite_accepted: "awaiting_questionnaire",
  account_created: "awaiting_questionnaire",
  questionnaire_pending: "awaiting_questionnaire",
  questionnaire_submitted: "awaiting_protocol",
  protocol_preparing: "awaiting_protocol",
  protocol_partial: "awaiting_protocol",
};

/** Pura: linha da view -> situação de cadastro. `null` quando não há linha (view ausente). */
export function buildOnboardingInfo(row: OnboardingRow | null | undefined, now: Date = new Date()): OnboardingInfo | null {
  if (!row) return null;
  const info = deriveOnboardingStage(row, now);
  // Só entra na fila quem passa pelo cadastro novo (exige onboarding) ou já tem questionário.
  const inFlow = row.onboarding_required || row.questionnaire_status !== null;
  const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);
  return {
    stage: info.stage,
    bucket: inFlow ? (BUCKET_BY_STAGE[info.stage] ?? null) : null,
    packageId: row.package,
    packageLabel: row.package ? packageLabel(row.package) : null,
    receivedAt: iso(row.questionnaire_submitted_at),
    dueAt: info.dueAt ? info.dueAt.toISOString() : null,
    overdue: info.isOverdue,
    missingModules: info.missingModules,
  };
}

const DAY_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export function formatInstantDay(iso: string | null): string | null {
  return iso ? DAY_FMT.format(new Date(iso)) : null;
}

/** Módulo do protocolo a abrir primeiro ("Preparar protocolo"): o primeiro ainda não publicado. */
export function firstMissingModuleSegment(info: OnboardingInfo): "treino" | "nutricao" | null {
  const m = info.missingModules[0];
  return m === "training" ? "treino" : m === "nutrition" ? "nutricao" : null;
}

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
  invite_pending: "Convite não enviado",
  invite_sent: "Convite enviado",
  paused: "Acompanhamento pausado",
  invite_failed: "Falha no envio do convite",
  invite_accepted: "Convite aceito",
  account_created: "Aguardando questionário",
  questionnaire_pending: "Respondendo questionário",
  questionnaire_submitted: "Questionário recebido",
  protocol_preparing: "Protocolo em preparação",
  protocol_partial: "Protocolo parcial",
};

/** Ordem em que as situações aparecem no filtro (do que exige ação ao que não exige). */
export const TRACKING_FILTER_ORDER: TrackingState[] = [
  "questionnaire_submitted",
  "protocol_preparing",
  "protocol_partial",
  "pending",
  "in_progress",
  "draft",
  "awaiting_checkin",
  "done",
  "account_created",
  "questionnaire_pending",
  "invite_accepted",
  "invite_pending",
  "invite_sent",
  "invite_failed",
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
  /** Cadastro novo (V5): estágio, pacote, recebimento e prazo. `null` sem a view (migração pendente). */
  onboarding: OnboardingInfo | null;
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

const ONBOARDING_TRACKING: Partial<Record<OnboardingStage, OnboardingTrackingState>> = {
  invite_failed: "invite_failed",
  invite_accepted: "invite_accepted",
  account_created: "account_created",
  questionnaire_pending: "questionnaire_pending",
  questionnaire_submitted: "questionnaire_submitted",
  protocol_preparing: "protocol_preparing",
  protocol_partial: "protocol_partial",
};

function trackingStateOf(client: Client, evaluation: EvaluationRow | null, onboarding: OnboardingInfo | null): TrackingState {
  if (client.status === "paused") return "paused";
  const onb = onboarding?.bucket ? ONBOARDING_TRACKING[onboarding.stage] : undefined;
  if (onb) return onb;
  if (client.invite_status === "pending") return "invite_pending";
  if (client.invite_status === "invited") return "invite_sent";
  return evaluation?.state ?? "awaiting_checkin";
}

function protocolText(o: OnboardingInfo | null): string {
  const parts = [
    o?.packageLabel ? `Pacote ${o.packageLabel}` : null,
    o?.receivedAt ? `recebido em ${formatInstantDay(o.receivedAt)}` : null,
    o?.dueAt ? `${o.overdue ? "prazo vencido em" : "prazo"} ${formatInstantDay(o.dueAt)}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function nextActionText(state: TrackingState, evaluation: EvaluationRow | null, onboarding: OnboardingInfo | null): string {
  const week = evaluation?.weekNumber;
  switch (state) {
    case "questionnaire_submitted":
      return `Abrir o questionário e montar o protocolo. ${protocolText(onboarding)}`.trim();
    case "protocol_preparing":
      return `Concluir e publicar o protocolo. ${protocolText(onboarding)}`.trim();
    case "protocol_partial":
      return `Publicar o módulo que falta. ${protocolText(onboarding)}`.trim();
    case "questionnaire_pending":
      return "O aluno está respondendo o questionário inicial";
    case "account_created":
      return "Conta criada: aguardando o aluno responder o questionário inicial";
    case "invite_accepted":
      return "Convite aceito: aguardando o aluno confirmar o e-mail";
    case "invite_failed":
      return "O envio do convite falhou: reenvie ou copie o link";
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
function lastUpdateOf(
  client: Client,
  evaluation: EvaluationRow | null,
  onboarding: OnboardingInfo | null
): StudentEntry["lastUpdate"] {
  const candidates: { iso: string | null | undefined; reason: string }[] = [
    { iso: onboarding?.receivedAt, reason: "Questionário recebido" },
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
  /** Linha de `client_onboarding_status` do aluno; ausente = comportamento anterior à V5. */
  onboardingRow?: OnboardingRow | null;
}): StudentEntry {
  const { client, evaluation, paymentStatus, latePayment, inviteUrl } = input;
  const onboarding = buildOnboardingInfo(input.onboardingRow);
  const state = trackingStateOf(client, evaluation, onboarding);
  const paymentLate = paymentStatus === "atrasado";
  const protocolWaiting =
    state === "questionnaire_submitted" || state === "protocol_preparing" || state === "protocol_partial";
  const late =
    (state === "awaiting_checkin" && (evaluation?.late ?? false)) || (protocolWaiting && onboarding?.overdue === true);

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
  if (protocolWaiting) {
    // Protocolo a montar: trabalho do coach, mais urgente primeiro pelo prazo. O botão da lista
    // abre o perfil; "Abrir questionário"/"Preparar protocolo" ficam na fila "Novos cadastros".
    tier = 1;
    primary = "view_tracking";
    tierKey = Date.parse(onboarding?.dueAt ?? "") || 0;
  } else if (state === "pending" || state === "in_progress" || state === "draft") {
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
    if (state === "invite_failed") candidates.push({ tier: 4, action: "copy_invite", ok: true, key: 0 });
    if (state === "invite_accepted" || state === "account_created" || state === "questionnaire_pending")
      candidates.push({ tier: 6, action: "view_tracking", ok: true, key: 0 });
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
      nextAction: nextActionText(state, evaluation, onboarding),
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
    lastUpdate: lastUpdateOf(client, evaluation, onboarding),
    onboarding,
  };
}

// ----------------------------------------------------------------------------
// Busca / filtro / ordenação (client)
// ----------------------------------------------------------------------------

export type SortKey = "urgency" | "name" | "updated";

export type ListView = "all" | "new";

export type ListControls = {
  /** "new" = aba "Novos cadastros" (fila de onboarding). */
  view: ListView;
  /** Filtro dentro de "Novos cadastros". */
  newFilter: NewSignupBucket | "all";
  query: string;
  tracking: TrackingState | "all";
  payment: ClientPaymentStatus | "all";
  onlyNeedsAction: boolean;
  sort: SortKey;
};

export const DEFAULT_CONTROLS: ListControls = {
  view: "all",
  newFilter: "all",
  query: "",
  tracking: "all",
  payment: "all",
  onlyNeedsAction: false,
  sort: "urgency",
};

export function hasActiveFilters(c: ListControls): boolean {
  return (
    c.query.trim() !== "" ||
    c.tracking !== "all" ||
    c.payment !== "all" ||
    c.onlyNeedsAction ||
    c.newFilter !== "all"
  );
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
  const inQueue = controls.view === "new";
  const filtered = entries.filter((e) => {
    if (inQueue) {
      const bucket = e.onboarding?.bucket ?? null;
      if (!bucket) return false;
      if (controls.newFilter !== "all" && bucket !== controls.newFilter) return false;
    }
    if (controls.tracking !== "all" && e.tracking.state !== controls.tracking) return false;
    if (controls.payment !== "all" && e.payment.status !== controls.payment) return false;
    if (controls.onlyNeedsAction && !e.needsAction) return false;
    if (q) {
      const haystack = normalize([e.name, e.email ?? "", e.objective ?? ""].join(" "));
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  if (inQueue) {
    // Fila: protocolo a montar primeiro (prazo mais próximo no topo), depois quem falta responder.
    const rank = (e: StudentEntry) => BUCKET_ORDER.indexOf(e.onboarding?.bucket ?? "invite_pending");
    const due = (e: StudentEntry) => Date.parse(e.onboarding?.dueAt ?? "") || Number.MAX_SAFE_INTEGER;
    return filtered.sort((a, b) => rank(a) - rank(b) || due(a) - due(b) || byName(a, b));
  }

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

/** Quantos alunos há em cada balde da fila "Novos cadastros". */
export function countBuckets(entries: StudentEntry[]): Record<NewSignupBucket | "total", number> {
  const out = { awaiting_protocol: 0, awaiting_questionnaire: 0, invite_pending: 0, total: 0 };
  for (const e of entries) {
    const b = e.onboarding?.bucket;
    if (!b) continue;
    out[b] += 1;
    out.total += 1;
  }
  return out;
}
