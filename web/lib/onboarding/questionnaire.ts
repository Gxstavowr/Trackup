import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayDateSP } from "@/lib/portal-today";
import { onboardingActionError } from "./errors";
import { isPackageId, sectionsFor, type PackageId, type QuestionnaireSection } from "./packages";
import {
  QUESTIONNAIRE_VERSION,
  mergeStoredAnswers,
  normalizeCurrentStep,
  normalizeSections,
  profileFieldsFrom,
  sanitizeAnswers,
  validateQuestionnaire,
  type AnswerMap,
  type AnswerValue,
  type FieldErrors,
} from "./questionnaire-catalog";

/**
 * Questionário inicial (V5, itens 9–11; plano §7) — leitura e escrita no servidor.
 *
 *  - Aluno: `getMyQuestionnaire`, `saveMyQuestionnaireDraft`, `submitMyQuestionnaire`. O aluno é
 *    derivado da SESSÃO (nunca de um id vindo do navegador) e as RPCs da 0022 também derivam de
 *    `auth.uid()`. As seções vêm do pacote VIGENTE lido no servidor (`get_my_service_package`),
 *    nunca do formulário. O servidor valida as obrigatórias com o catálogo antes de enviar.
 *  - Coach: `getClientQuestionnaire(clientId)` (único lugar que devolve `sensitive_answers` para o
 *    coach; RLS `onboarding_questionnaires_coach_read`) e `markQuestionnaireOpened`.
 *
 * Migração 0022 ainda não aplicada: toda leitura devolve `available: false` em vez de lançar,
 * e as escritas devolvem uma mensagem amigável.
 */

type DbError = { code?: string; message?: string } | null | undefined;

/** Tabela/coluna/função da 0022 ausente no banco (migração pendente). */
export function isMissingSchemaError(err: DbError): boolean {
  if (!err) return false;
  return (
    ["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(err.code ?? "") ||
    /does not exist|schema cache|could not find the (table|function|column)/i.test(err.message ?? "")
  );
}

const UNAVAILABLE_MESSAGE =
  "O questionário ainda não está disponível. Tente de novo mais tarde ou fale com seu coach.";

export type QuestionnaireRow = {
  id: string;
  catalog_version: string;
  package: PackageId | null;
  sections: QuestionnaireSection[];
  status: "draft" | "submitted";
  answers: AnswerMap;
  current_step: string | null;
  started_at: string;
  updated_at: string;
  submitted_at: string | null;
  protocol_due_at: string | null;
  coach_opened_at: string | null;
};

const ROW_COLUMNS =
  "id, catalog_version, package, sections, status, answers, sensitive_answers, current_step, started_at, updated_at, submitted_at, protocol_due_at, coach_opened_at";

type RawRow = Omit<QuestionnaireRow, "answers" | "sections" | "package"> & {
  package: string | null;
  sections: string[] | null;
  answers: unknown;
  sensitive_answers: unknown;
};

function toRow(raw: RawRow): QuestionnaireRow {
  return {
    ...raw,
    package: isPackageId(raw.package) ? raw.package : null,
    sections: normalizeSections(raw.sections),
    answers: mergeStoredAnswers(raw.answers, raw.sensitive_answers),
  };
}

export type MyQuestionnaire =
  | { available: false }
  | {
      available: true;
      clientId: string;
      onboardingRequired: boolean;
      /** Pacote vigente (null = sem contrato / legado). */
      package: PackageId | null;
      /** Seções que o aluno responde AGORA (do pacote vigente). */
      sections: QuestionnaireSection[];
      draft: QuestionnaireRow | null;
      /** Último questionário enviado (histórico imutável). */
      submitted: QuestionnaireRow | null;
      /** Planos publicados e ativos (para o estado "em preparação"). */
      published: { training: boolean; nutrition: boolean };
    };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentClient(supabase: Supabase): Promise<{ id: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
  return data ? { id: data.id as string } : null;
}

/** Pacote vigente do aluno logado (RPC da 0022). Erro/ausência → null (legado). */
async function myCurrentPackage(supabase: Supabase): Promise<PackageId | null> {
  const { data, error } = await supabase.rpc("get_my_service_package");
  if (error || !Array.isArray(data)) return null;
  const current = (data as { package: string; is_current: boolean }[]).find((r) => r.is_current);
  return current && isPackageId(current.package) ? current.package : null;
}

/** Questionário do aluno logado: rascunho, último enviado, pacote e planos publicados. */
export async function getMyQuestionnaire(): Promise<MyQuestionnaire> {
  try {
    const supabase = await createClient();
    const me = await currentClient(supabase);
    if (!me) return { available: false };

    const [flags, rows, pkg, status] = await Promise.all([
      supabase.from("clients").select("onboarding_required").eq("id", me.id).maybeSingle(),
      supabase
        .from("onboarding_questionnaires")
        .select(ROW_COLUMNS)
        .eq("client_id", me.id)
        .order("started_at", { ascending: false })
        .limit(20),
      myCurrentPackage(supabase),
      supabase
        .from("client_onboarding_status")
        .select("training_published, nutrition_published")
        .eq("client_id", me.id)
        .maybeSingle(),
    ]);

    if (flags.error || rows.error) return { available: false };

    const list = ((rows.data ?? []) as RawRow[]).map(toRow);
    const draft = list.find((r) => r.status === "draft") ?? null;
    const submitted =
      list
        .filter((r) => r.status === "submitted" && r.submitted_at)
        .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""))[0] ?? null;

    const st = status.error ? null : (status.data as { training_published?: boolean; nutrition_published?: boolean } | null);

    return {
      available: true,
      clientId: me.id,
      onboardingRequired: (flags.data as { onboarding_required?: boolean } | null)?.onboarding_required === true,
      package: pkg,
      sections: sectionsFor(pkg),
      draft,
      submitted,
      published: { training: st?.training_published === true, nutrition: st?.nutrition_published === true },
    };
  } catch {
    return { available: false };
  }
}

/** Mantém só valores com forma de resposta (texto, número finito, lista de textos). */
function coerceRaw(raw: unknown): AnswerMap {
  const out: AnswerMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k.length > 60) continue;
    if (typeof v === "string") out[k] = v.slice(0, 5000);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (Array.isArray(v) && v.length <= 50 && v.every((x) => typeof x === "string")) {
      out[k] = (v as string[]).map((x) => x.slice(0, 200)) as AnswerValue;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      // Grade (matriz): { linha: coluna } — só textos curtos; o catálogo valida linhas e colunas.
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length > 60) continue;
      const grid: Record<string, string> = {};
      for (const [row, col] of entries) {
        if (row.length <= 60 && typeof col === "string") grid[row] = col.slice(0, 40);
      }
      out[k] = grid;
    }
  }
  return out;
}

export type SaveDraftResult = { ok: true } | { ok: false; error: string };

/**
 * Salva o rascunho no servidor (ao avançar/voltar de etapa). Aceita respostas parciais; inválidas
 * são descartadas pelo catálogo. `currentStep` só é gravado se for uma etapa das seções atuais.
 */
export async function saveMyQuestionnaireDraft(rawAnswers: unknown, currentStep: string | null): Promise<SaveDraftResult> {
  try {
    const supabase = await createClient();
    const me = await currentClient(supabase);
    if (!me) return { ok: false, error: "Sua sessão expirou. Entre de novo para continuar." };

    const sections = sectionsFor(await myCurrentPackage(supabase));
    const ctx = { today: todayDateSP() };
    const split = sanitizeAnswers(sections, coerceRaw(rawAnswers), ctx);
    const step = normalizeCurrentStep(sections, currentStep);

    const { error } = await supabase.rpc("save_my_onboarding_draft", {
      p_catalog_version: QUESTIONNAIRE_VERSION,
      p_sections: sections,
      p_answers: split.answers,
      p_sensitive_answers: split.sensitive_answers,
      p_current_step: step,
    });
    if (error) {
      if (isMissingSchemaError(error)) return { ok: false, error: UNAVAILABLE_MESSAGE };
      return { ok: false, error: onboardingActionError(new Error(error.message), "Não foi possível salvar seu progresso.") };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: onboardingActionError(err, "Não foi possível salvar seu progresso.") };
  }
}

export type SubmitResult =
  | { ok: true; submittedAt: string; protocolDueAt: string }
  | { ok: false; error: string; errors?: FieldErrors; stepId?: string; field?: string };

/**
 * Envio: valida TODAS as obrigatórias das seções do pacote vigente (catálogo), separa as sensíveis
 * e chama `submit_my_onboarding_questionnaire` — que grava, calcula `protocol_due_at` (envio + 3
 * dias, no banco), copia altura/nascimento/sexo para `clients` só onde estiver vazio, registra o
 * evento e avisa o coach.
 */
export async function submitMyQuestionnaire(rawAnswers: unknown): Promise<SubmitResult> {
  try {
    const supabase = await createClient();
    const me = await currentClient(supabase);
    if (!me) return { ok: false, error: "Sua sessão expirou. Entre de novo para continuar." };

    const sections = sectionsFor(await myCurrentPackage(supabase));
    const ctx = { today: todayDateSP() };
    const raw = coerceRaw(rawAnswers);

    const check = validateQuestionnaire(sections, raw, ctx);
    if (!check.ok) {
      return {
        ok: false,
        error: "Algumas respostas obrigatórias estão faltando ou precisam de ajuste.",
        errors: check.errors,
        stepId: check.firstStepId,
        field: check.firstKey,
      };
    }

    const split = sanitizeAnswers(sections, raw, ctx);
    const profile = profileFieldsFrom({ ...split.answers, ...split.sensitive_answers });

    const { data, error } = await supabase.rpc("submit_my_onboarding_questionnaire", {
      p_catalog_version: QUESTIONNAIRE_VERSION,
      p_sections: sections,
      p_answers: split.answers,
      p_sensitive_answers: split.sensitive_answers,
      p_height_cm: profile.heightCm,
      p_birth_date: profile.birthDate,
      p_gender: profile.gender,
    });
    if (error) {
      if (isMissingSchemaError(error)) return { ok: false, error: UNAVAILABLE_MESSAGE };
      return { ok: false, error: onboardingActionError(new Error(error.message), "Não foi possível enviar o questionário.") };
    }
    const row = (Array.isArray(data) ? data[0] : data) as { submitted_at?: string; protocol_due_at?: string } | null;
    if (!row?.submitted_at || !row.protocol_due_at) {
      return { ok: false, error: "Não foi possível confirmar o envio. Recarregue a página para conferir." };
    }
    return { ok: true, submittedAt: row.submitted_at, protocolDueAt: row.protocol_due_at };
  } catch (err) {
    return { ok: false, error: onboardingActionError(err, "Não foi possível enviar o questionário.") };
  }
}

export type ClientQuestionnaire =
  | { available: false }
  | {
      available: true;
      /** Último enviado (com respostas sensíveis) ou null. */
      submitted: QuestionnaireRow | null;
      /** Rascunho em andamento — o coach vê só que existe e onde parou, não as respostas. */
      draft: Pick<QuestionnaireRow, "id" | "current_step" | "started_at" | "updated_at"> | null;
      /** Envios anteriores (mais recente primeiro), sem respostas. */
      history: Pick<QuestionnaireRow, "id" | "catalog_version" | "submitted_at" | "protocol_due_at">[];
    };

/**
 * Questionário de um aluno, para o COACH (seção "Questionário inicial" do perfil). Único ponto em
 * que o coach recebe `sensitive_answers`. Exige sessão de coach; a RLS limita aos alunos da conta.
 * Não marca como aberto — quem exibe chama `markQuestionnaireOpened` explicitamente.
 */
export async function getClientQuestionnaire(clientId: string): Promise<ClientQuestionnaire> {
  if (typeof clientId !== "string" || !/^[0-9a-f-]{36}$/i.test(clientId)) return { available: false };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { available: false };
    const { data: coach } = await supabase.from("coach_users").select("id").eq("id", user.id).maybeSingle();
    if (!coach) return { available: false };

    const { data, error } = await supabase
      .from("onboarding_questionnaires")
      .select(ROW_COLUMNS)
      .eq("client_id", clientId)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) return { available: false };

    const list = ((data ?? []) as RawRow[]).map(toRow);
    const draftRow = list.find((r) => r.status === "draft");
    const submittedList = list
      .filter((r) => r.status === "submitted" && r.submitted_at)
      .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));

    return {
      available: true,
      submitted: submittedList[0] ?? null,
      draft: draftRow
        ? { id: draftRow.id, current_step: draftRow.current_step, started_at: draftRow.started_at, updated_at: draftRow.updated_at }
        : null,
      history: submittedList.map((r) => ({
        id: r.id,
        catalog_version: r.catalog_version,
        submitted_at: r.submitted_at,
        protocol_due_at: r.protocol_due_at,
      })),
    };
  } catch {
    return { available: false };
  }
}

/**
 * Coach abriu o questionário enviado (1ª vez): distingue "questionário enviado" de "protocolo em
 * preparação". Idempotente no banco. Nunca lança: devolve se deu certo.
 */
export async function markQuestionnaireOpened(questionnaireId: string): Promise<boolean> {
  if (typeof questionnaireId !== "string" || !/^[0-9a-f-]{36}$/i.test(questionnaireId)) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_onboarding_questionnaire_opened", {
      p_questionnaire_id: questionnaireId,
    });
    return !error;
  } catch {
    return false;
  }
}
