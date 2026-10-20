/**
 * Estágio do onboarding (V5, plano §4) — derivado, nunca gravado. Recebe uma linha da view
 * `client_onboarding_status` (0022) e devolve o estágio, o prazo e os módulos que faltam publicar.
 * Garantias: convite pendente (sem conta) não se confunde com questionário pendente (com conta), e
 * questionário enviado não se confunde com protocolo pronto (exige plano publicado, rascunho não conta).
 */
import { modulesOf, MODULE_LABELS, type ModuleId, type PackageId } from "./packages";

export type OnboardingStage =
  | "invite_not_sent"
  | "invite_failed"
  | "invite_accepted"
  | "invite_sent"
  | "legacy"
  | "account_created"
  | "questionnaire_pending"
  | "questionnaire_submitted"
  | "protocol_preparing"
  | "protocol_partial"
  | "protocol_completed";

/** Subconjunto da view usado na derivação. Datas chegam como ISO (PostgREST) ou Date. */
export type OnboardingStatusRow = {
  has_account: boolean;
  onboarding_required: boolean;
  invite_status: "pending" | "invited" | "active";
  package: PackageId | null;
  questionnaire_status: "draft" | "submitted" | null;
  questionnaire_opened_at: string | Date | null;
  protocol_due_at: string | Date | null;
  training_published: boolean;
  nutrition_published: boolean;
  training_draft: boolean;
  nutrition_draft: boolean;
  invite_last_sent_at: string | Date | null;
  invite_last_failed_at: string | Date | null;
  invite_accepted_at: string | Date | null;
};

export type OnboardingStageInfo = {
  stage: OnboardingStage;
  dueAt: Date | null;
  isOverdue: boolean;
  /** Módulos do pacote ainda sem plano publicado (vazio em legado e em protocolo concluído). */
  missingModules: ModuleId[];
};

function ms(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(t) ? null : t;
}

function pendingModules(row: OnboardingStatusRow): ModuleId[] {
  const published: Record<ModuleId, boolean> = {
    training: row.training_published,
    nutrition: row.nutrition_published,
  };
  return modulesOf(row.package).filter((m) => !published[m]);
}

function stageOf(row: OnboardingStatusRow, missing: ModuleId[]): OnboardingStage {
  if (!row.has_account) {
    const sent = ms(row.invite_last_sent_at);
    const failed = ms(row.invite_last_failed_at);
    if (failed !== null && (sent === null || failed > sent)) return "invite_failed";
    if (ms(row.invite_accepted_at) !== null) return "invite_accepted";
    if (sent !== null || row.invite_status === "invited") return "invite_sent";
    return "invite_not_sent";
  }

  if (row.questionnaire_status === "draft") return "questionnaire_pending";
  if (row.questionnaire_status === null) return row.onboarding_required ? "account_created" : "legacy";

  // Questionário enviado. Sem pacote não há o que "concluir": nunca vira protocol_completed.
  const total = modulesOf(row.package).length;
  if (total > 0 && missing.length === 0) return "protocol_completed";
  if (total > 1 && missing.length === 1) return "protocol_partial";

  const touched = ms(row.questionnaire_opened_at) !== null || row.training_draft || row.nutrition_draft;
  return touched ? "protocol_preparing" : "questionnaire_submitted";
}

export function deriveOnboardingStage(row: OnboardingStatusRow, now: Date = new Date()): OnboardingStageInfo {
  const missingModules = pendingModules(row);
  const stage = stageOf(row, missingModules);
  const due = ms(row.protocol_due_at);
  const dueAt = due === null ? null : new Date(due);
  const isOverdue = due !== null && stage !== "protocol_completed" && now.getTime() > due;
  return {
    stage,
    dueAt,
    isOverdue,
    missingModules: stage === "protocol_completed" ? [] : missingModules,
  };
}

/** Rótulo curto para o coach — sempre específico, nunca "Pendente" genérico. */
export const COACH_STAGE_LABELS: Readonly<Record<OnboardingStage, string>> = {
  invite_not_sent: "Convite não enviado",
  invite_failed: "Falha ao enviar o convite",
  invite_accepted: "Convite aceito, aguardando confirmação do e-mail",
  invite_sent: "Convite enviado, aguardando o aluno",
  legacy: "Aluno anterior ao novo cadastro",
  account_created: "Conta criada, questionário não iniciado",
  questionnaire_pending: "Respondendo o questionário",
  questionnaire_submitted: "Questionário enviado, protocolo a montar",
  protocol_preparing: "Protocolo em preparação",
  protocol_partial: "Protocolo parcialmente publicado",
  protocol_completed: "Protocolo publicado",
};

/** Etapa do aluno, em texto que ele precisa saber (sem jargão interno). */
export const STUDENT_STAGE_LABELS: Readonly<Record<OnboardingStage, string>> = {
  invite_not_sent: "Aguardando seu convite",
  invite_failed: "Aguardando seu convite",
  invite_accepted: "Confirme seu e-mail para entrar",
  invite_sent: "Aceite o convite para começar",
  legacy: "Tudo pronto",
  account_created: "Responda o questionário inicial",
  questionnaire_pending: "Continue seu questionário inicial",
  questionnaire_submitted: "Questionário enviado",
  protocol_preparing: "Seu protocolo está em preparação",
  protocol_partial: "Parte do seu protocolo já está pronta",
  protocol_completed: "Seu protocolo está pronto",
};

export function coachStageLabel(info: Pick<OnboardingStageInfo, "stage">): string {
  return COACH_STAGE_LABELS[info.stage];
}

function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
}

/** Texto do aluno com prazo e módulos, ex.: "Treino pronto, Nutrição em preparação". */
export function studentStageText(info: OnboardingStageInfo, pkg: PackageId | null): string {
  const base = STUDENT_STAGE_LABELS[info.stage];
  if (info.stage === "protocol_partial") {
    const ready = modulesOf(pkg).filter((m) => !info.missingModules.includes(m));
    const readyText = ready.map((m) => `${MODULE_LABELS[m]} ${m === "nutrition" ? "pronta" : "pronto"}`).join(", ");
    const waitText = info.missingModules.map((m) => `${MODULE_LABELS[m]} em preparação`).join(", ");
    return [readyText, waitText].filter(Boolean).join(", ");
  }
  if ((info.stage === "protocol_preparing" || info.stage === "questionnaire_submitted") && info.dueAt) {
    return `${base}, previsto até ${formatDay(info.dueAt)}`;
  }
  return base;
}
