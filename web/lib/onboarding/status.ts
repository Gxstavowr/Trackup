import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMyServicePackage } from "./contracts";
import { isMissingSchemaError } from "./db-error";
import { moduleAccess, type ModuleAccess, type ModuleAccessInput } from "./module-access";
import { isPackageId, type ModuleId, type PackageId } from "./packages";
import { deriveOnboardingStage, type OnboardingStageInfo, type OnboardingStatusRow } from "./stage";

/**
 * Estado de onboarding lido da view `client_onboarding_status` (V5, plano §3.6 e §12).
 *
 *  - `getMyOnboardingStatus()`: o ALUNO logado (view com a RLS dele + `get_my_service_package`,
 *    porque para o aluno a view devolve `package` nulo). Degrada para "legado" (`legacy: true`)
 *    só se a migração 0022 não estiver aplicada; qualquer outro erro vira `error: true`.
 *  - `getOnboardingStatuses(filter)`: o COACH — uma linha por aluno da conta, já com o estágio
 *    derivado. A RLS limita aos alunos da conta; nunca devolve respostas do questionário.
 */

const STUDENT_COLUMNS =
  "client_id, onboarding_required, package, questionnaire_status, questionnaire_submitted_at, protocol_due_at, questionnaire_opened_at, training_published, nutrition_published";

export type MyOnboardingStatus = {
  /** `false` = view indisponível (0022 ausente) ou erro: tratar como legado. */
  available: boolean;
  /** `true` = falha real ao ler o plano (não é legado): a página deve avisar, não mostrar "vazio". */
  error: boolean;
  /** Sem pacote vigente: comportamento anterior ao V5, sem bloqueio de módulos. */
  legacy: boolean;
  package: PackageId | null;
  onboardingRequired: boolean;
  questionnaireStatus: "draft" | "submitted" | null;
  submittedAt: string | null;
  /** `protocol_due_at` real (envio + 3 dias, gravado pelo banco). */
  dueAt: string | null;
  published: Record<ModuleId, boolean>;
  /** Estágio derivado (para texto do aluno). */
  stage: OnboardingStageInfo;
  /** Entrada pronta para `moduleAccess` / `canUseModule`. */
  accessInput: ModuleAccessInput;
};

const LEGACY_ROW: OnboardingStatusRow = {
  has_account: true,
  onboarding_required: false,
  invite_status: "active",
  package: null,
  questionnaire_status: null,
  questionnaire_opened_at: null,
  protocol_due_at: null,
  training_published: false,
  nutrition_published: false,
  training_draft: false,
  nutrition_draft: false,
  invite_last_sent_at: null,
  invite_last_failed_at: null,
  invite_accepted_at: null,
};

function build(args: {
  available: boolean;
  error?: boolean;
  pkg: PackageId | null;
  onboardingRequired: boolean;
  questionnaireStatus: "draft" | "submitted" | null;
  submittedAt: string | null;
  dueAt: string | null;
  openedAt: string | null;
  published: Record<ModuleId, boolean>;
}): MyOnboardingStatus {
  const stage = deriveOnboardingStage({
    ...LEGACY_ROW,
    onboarding_required: args.onboardingRequired,
    package: args.pkg,
    questionnaire_status: args.questionnaireStatus,
    questionnaire_opened_at: args.openedAt,
    protocol_due_at: args.dueAt,
    training_published: args.published.training,
    nutrition_published: args.published.nutrition,
  });
  return {
    available: args.available,
    error: args.error === true,
    legacy: args.pkg === null,
    package: args.pkg,
    onboardingRequired: args.onboardingRequired,
    questionnaireStatus: args.questionnaireStatus,
    submittedAt: args.submittedAt,
    dueAt: args.dueAt,
    published: args.published,
    stage,
    accessInput: {
      package: args.pkg,
      published: args.published,
      questionnaireStatus: args.questionnaireStatus,
      dueAt: args.dueAt,
      onboardingRequired: args.onboardingRequired,
    },
  };
}

const NONE: Record<ModuleId, boolean> = { training: false, nutrition: false };

/** Estado do aluno logado. `clientId` é só uma chave de cache; o aluno vem da sessão (RLS). */
export const getMyOnboardingStatus = cache(async (clientId?: string): Promise<MyOnboardingStatus> => {
  void clientId;
  const legacy = (error = false) =>
    build({
      available: false,
      error,
      pkg: null,
      onboardingRequired: false,
      questionnaireStatus: null,
      submittedAt: null,
      dueAt: null,
      openedAt: null,
      published: NONE,
    });
  try {
    const supabase = await createClient();
    const [viewRes, pkg] = await Promise.all([
      supabase.from("client_onboarding_status").select(STUDENT_COLUMNS).limit(1).maybeSingle(),
      getMyServicePackage(),
    ]);
    if (viewRes.error) {
      if (isMissingSchemaError(viewRes.error)) return legacy();
      console.error("getMyOnboardingStatus falhou:", viewRes.error.code);
      return legacy(true);
    }
    // A view existe, então a função também (0022): `available: false` aqui é falha real, não legado.
    if (!pkg.available) return legacy(true);
    const row = viewRes.data as {
      onboarding_required: boolean | null;
      questionnaire_status: "draft" | "submitted" | null;
      questionnaire_submitted_at: string | null;
      protocol_due_at: string | null;
      questionnaire_opened_at: string | null;
      training_published: boolean | null;
      nutrition_published: boolean | null;
    } | null;
    if (!row) return legacy();
    return build({
      available: true,
      pkg: pkg.current?.package ?? null,
      onboardingRequired: row.onboarding_required === true,
      questionnaireStatus: row.questionnaire_status,
      submittedAt: row.questionnaire_submitted_at,
      dueAt: row.protocol_due_at,
      openedAt: row.questionnaire_opened_at,
      published: { training: row.training_published === true, nutrition: row.nutrition_published === true },
    });
  } catch (err) {
    console.error("getMyOnboardingStatus falhou:", err);
    return legacy(true);
  }
});

/** Acesso do aluno a um módulo; legado (sem pacote) = comportamento atual (`null`). */
export function accessForModule(status: MyOnboardingStatus, module: ModuleId): ModuleAccess | null {
  if (status.legacy) return null;
  return moduleAccess(status.accessInput, module);
}

/**
 * Aluno que acabou de ter o protocolo concluído? Usa a notificação `protocol_ready` (a única fonte
 * do evento que o aluno consegue ler) criada nos últimos `days` dias. Sem gravar nada, sem
 * armazenamento no navegador. Erros viram `false`.
 */
export async function hasRecentProtocolReady(days = 3): Promise<boolean> {
  try {
    const supabase = await createClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("notifications")
      .select("id")
      .eq("recipient", "client")
      .eq("event_type", "protocol_ready")
      .gte("created_at", since)
      .limit(1);
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------------------------

export type OnboardingStatusFilter = {
  /** Só estes alunos (ids). Omitido = todos os visíveis ao coach. */
  clientIds?: string[];
  /** Só estes estágios derivados (filtro em código; o estágio não existe no banco). */
  stages?: OnboardingStageInfo["stage"][];
  /** Máximo de linhas lidas (padrão 500). */
  limit?: number;
};

export type CoachOnboardingStatus = {
  clientId: string;
  name: string;
  package: PackageId | null;
  onboardingRequired: boolean;
  hasAccount: boolean;
  questionnaireSubmittedAt: string | null;
  protocolDueAt: string | null;
  protocolCompletedAt: string | null;
  info: OnboardingStageInfo;
};

const COACH_COLUMNS =
  "client_id, name, has_account, onboarding_required, invite_status, package, questionnaire_status, questionnaire_submitted_at, questionnaire_opened_at, protocol_due_at, protocol_completed_at, training_published, nutrition_published, training_draft, nutrition_draft, invite_last_sent_at, invite_last_failed_at, invite_accepted_at";

/**
 * Estágio de onboarding dos alunos do COACH logado. Devolve `{ available: false }` se a view não
 * existe (0022 pendente) ou falha, para a tela cair no comportamento antigo. Ordem: nome.
 */
export async function getOnboardingStatuses(
  filter: OnboardingStatusFilter = {}
): Promise<{ available: boolean; rows: CoachOnboardingStatus[] }> {
  try {
    const supabase = await createClient();
    let query = supabase.from("client_onboarding_status").select(COACH_COLUMNS).order("name").limit(filter.limit ?? 500);
    if (filter.clientIds) {
      if (filter.clientIds.length === 0) return { available: true, rows: [] };
      query = query.in("client_id", filter.clientIds);
    }
    const { data, error } = await query;
    if (error) {
      if (!isMissingSchemaError(error)) console.error("getOnboardingStatuses falhou:", error.code);
      return { available: false, rows: [] };
    }
    const now = new Date();
    let rows = ((data ?? []) as unknown as (OnboardingStatusRow & {
      client_id: string;
      name: string;
      questionnaire_submitted_at: string | null;
      protocol_completed_at: string | null;
    })[]).map((r): CoachOnboardingStatus => ({
      clientId: r.client_id,
      name: r.name,
      package: isPackageId(r.package) ? r.package : null,
      onboardingRequired: r.onboarding_required,
      hasAccount: r.has_account,
      questionnaireSubmittedAt: r.questionnaire_submitted_at,
      protocolDueAt: r.protocol_due_at ? String(r.protocol_due_at) : null,
      protocolCompletedAt: r.protocol_completed_at,
      info: deriveOnboardingStage({ ...r, package: isPackageId(r.package) ? r.package : null }, now),
    }));
    if (filter.stages) {
      const set = new Set(filter.stages);
      rows = rows.filter((r) => set.has(r.info.stage));
    }
    return { available: true, rows };
  } catch (err) {
    console.error("getOnboardingStatuses falhou:", err);
    return { available: false, rows: [] };
  }
}
