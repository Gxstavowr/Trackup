/**
 * Regras PURAS (sem I/O, sem "server-only") do check-in do aluno, compartilhadas entre o
 * formulário guiado (client) e o servidor (validação no envio / no rascunho):
 *
 *  1. Em qual PASSO do formulário cada pergunta do template do coach aparece.
 *  2. Normalização + validação de cada resposta pelo controle (catálogo `lib/checkin-catalog.ts`
 *     por `key`, senão o tipo do banco) e pelas condições de visibilidade.
 *
 * O schema NÃO tem categoria/seção nas perguntas (`checkin_questions`: key, label, type, unit,
 * step, tracks, required, active, sort_order — e `step` é o INCREMENTO de um campo `stepper`,
 * não o passo do formulário). Então o passo é decidido por esta regra simples e determinística:
 *
 *   a) `type = photos`            -> não é um campo: o passo 1 já tem o bloco de fotos.
 *   b) `tracks` (se preenchido) OU `key` reconhecidos abaixo -> passo da tabela.
 *   c) qualquer outra pergunta    -> herda o passo da pergunta ANTERIOR (na ordem `sort_order`),
 *                                    ou seja, perguntas novas do coach ficam agrupadas com a
 *                                    vizinha. O passo 1 é reservado a peso/medidas/fotos: uma
 *                                    desconhecida logo depois dele (ou a primeira de todas) vai
 *                                    pro passo 2 (Alimentação).
 *
 * Passos: 1 Peso e fotos · 2 Alimentação · 3 Treino · 4 Bem-estar · (Revisão, sempre por último).
 * Passo 2/3/4 sem nenhuma pergunta é omitido (o formulário renumera). O passo 1 sempre existe
 * (peso e as quatro fotos são obrigatórios).
 */

import {
  DEFAULT_CHECKIN_CONTEXT,
  MAX_TEXT_LENGTH,
  getCatalogQuestion,
  isQuestionVisible,
  specForQuestion,
  type CheckinContext,
} from "./checkin-catalog";

export type CheckinStepId = "body" | "food" | "training" | "wellbeing";

/**
 * Peso: obrigatório em TODO check-in (regra do produto, V3). O coach não consegue torná-lo
 * opcional (`question-actions.ts`) nem ocultá-lo por aluno (`metrics-settings.ts`), e se o
 * template da conta não tiver a pergunta, ela é acrescentada (`ensureWeightQuestion`).
 */
export const WEIGHT_QUESTION_KEY = "weight_kg";

/** `field` dos erros de envio ligados às fotos (o formulário leva o aluno até o bloco de fotos). */
export const CHECKIN_PHOTOS_FIELD = "photos";

/** Métricas que não podem ser ocultadas por aluno (hoje só o peso). */
export function isAlwaysTrackedMetric(key: string): boolean {
  return key === WEIGHT_QUESTION_KEY;
}

/** Rótulo/unidade da pergunta de peso quando o template não a tem. */
export const DEFAULT_WEIGHT_QUESTION = { label: "Peso atual", unit: "kg" } as const;

export const CHECKIN_STEPS: { id: CheckinStepId; title: string; hint: string }[] = [
  { id: "body", title: "Peso e fotos", hint: "Comece pelo peso e depois envie as quatro fotos. Os dois são obrigatórios." },
  { id: "food", title: "Alimentação", hint: "Como foi a sua semana de alimentação." },
  { id: "training", title: "Treino", hint: "Como foram os seus treinos e cardios." },
  { id: "wellbeing", title: "Bem-estar", hint: "Sono, energia e como você se sentiu." },
];

/** Forma mínima de pergunta que estas regras precisam (compatível com `CheckinQuestion`). */
export type QuestionLike = {
  key: string;
  label: string;
  type: string;
  unit?: string | null;
  tracks?: string | null;
  required: boolean;
};

// Chaves reais do template padrão / de `metrics` + sinônimos dos protótipos, e palavras de `tracks`.
const STEP_BY_TOKEN: Record<string, CheckinStepId> = {
  // corpo
  weight_kg: "body",
  weight: "body",
  peso: "body",
  waist_cm: "body",
  hip_cm: "body",
  body_fat_pct: "body",
  measures: "body",
  photos: "body",
  // alimentação
  adherence_pct: "food",
  adherence: "food",
  diet: "food",
  dieta: "food",
  water_l: "food",
  water: "food",
  agua: "food",
  hunger: "food",
  nutrition: "food",
  // treino
  workouts_count: "training",
  workouts: "training",
  treinos: "training",
  cardio_count: "training",
  cardio: "training",
  training: "training",
  // bem-estar
  sleep_h: "wellbeing",
  sleep: "wellbeing",
  sono: "wellbeing",
  energy: "wellbeing",
  stress: "wellbeing",
  emotional: "wellbeing",
  digestion: "wellbeing",
  notes: "wellbeing",
};

function lookupStep(question: QuestionLike): CheckinStepId | null {
  // Perguntas do catálogo do sistema (lib/checkin-catalog.ts) têm etapa fixa.
  const catalog = getCatalogQuestion(question.key);
  if (catalog) return catalog.stepId;
  const byTracks = question.tracks ? STEP_BY_TOKEN[question.tracks.trim().toLowerCase()] : undefined;
  if (byTracks) return byTracks;
  return STEP_BY_TOKEN[question.key.trim().toLowerCase()] ?? null;
}

export type CheckinStepGroup = {
  id: CheckinStepId;
  title: string;
  hint: string;
  questions: QuestionLike[];
};

/**
 * Distribui as perguntas (já ordenadas por `sort_order`) nos passos e devolve só os passos que
 * existem: o 1 sempre (fotos), os demais só se tiverem perguntas.
 */
export function buildCheckinSteps<T extends QuestionLike>(
  questions: T[]
): (Omit<CheckinStepGroup, "questions"> & { questions: T[] })[] {
  const buckets: Record<CheckinStepId, T[]> = { body: [], food: [], training: [], wellbeing: [] };
  let previous = null as CheckinStepId | null;

  for (const question of questions) {
    if (question.type === "photos") continue; // o bloco de fotos do passo 1 cobre
    // Herda o passo anterior; o passo 1 é reservado a peso/medidas/fotos, então pergunta
    // desconhecida depois dele começa o passo 2 (e a primeira de todas também vai pro 2).
    const inherited: CheckinStepId = previous === null || previous === "body" ? "food" : previous;
    const step: CheckinStepId = lookupStep(question) ?? inherited;
    buckets[step].push(question);
    previous = step;
  }

  // Observações (catálogo `pinLast`) fecham a etapa mesmo quando perguntas novas do sistema
  // foram acrescentadas depois dela no template (o upgrade não reordena o banco).
  const pinned = (q: T) => getCatalogQuestion(q.key)?.pinLast === true;
  return CHECKIN_STEPS.filter((s) => s.id === "body" || buckets[s.id].length > 0).map((s) => ({
    ...s,
    questions: [...buckets[s.id].filter((q) => !pinned(q)), ...buckets[s.id].filter(pinned)],
  }));
}

/**
 * Garante a pergunta de peso como OBRIGATÓRIA na lista: força `required = true` se ela existir e,
 * se faltar (template antigo/editado à mão), acrescenta uma criada por `make` no início — o
 * passo 1 (Peso e fotos) sempre começa por ela. Pura: não muda a lista recebida.
 */
export function ensureWeightQuestion<T extends QuestionLike>(questions: T[], make: () => T): T[] {
  let found = false;
  const list = questions.map((q) => {
    if (q.key !== WEIGHT_QUESTION_KEY) return q;
    found = true;
    return q.required ? q : { ...q, required: true };
  });
  return found ? list : [{ ...make(), required: true }, ...list];
}

// ---------------------------------------------------------------------------------------------
// Normalização e validação de respostas
// ---------------------------------------------------------------------------------------------

export { MAX_TEXT_LENGTH };
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_DATE = "1990-01-01";

export type AnswerCheck = { ok: true; value: string } | { ok: false; message: string };

/** "81,5" -> "81.5" (teclado numérico em pt-BR digita vírgula). Não valida — só troca. */
export function commaToDot(raw: string): string {
  return raw.trim().replace(",", ".");
}

/** Hoje em YYYY-MM-DD no fuso de São Paulo (limite das datas informadas pelo aluno). */
export function todayIsoSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

const fmt = (n: number) => String(n).replace(".", ",");

/**
 * Valida e normaliza UMA resposta (quem chama já sabe que a pergunta está visível). Vazio é
 * válido (vira `""`) salvo se a pergunta é obrigatória. O controle vem de `specForQuestion`
 * (catálogo do sistema por `key`; senão, o tipo do banco):
 *  - number: aceita vírgula, devolve com ponto; limites e casas decimais do catálogo (fora dele
 *    0–100000); peso 20–500 kg;
 *  - scale: inteiro 1–5;
 *  - choice/toggle: um dos valores das opções (Sim/Não gravados como yes/no);
 *  - multi: valores separados por vírgula, todos das opções, sem repetir (devolve na ordem do
 *    catálogo);
 *  - date: YYYY-MM-DD válida, de 1990 até hoje (São Paulo);
 *  - text: até o limite de caracteres (2000 por padrão).
 */
export function checkAnswer(
  question: QuestionLike,
  raw: string | undefined | null,
  ctx: CheckinContext = DEFAULT_CHECKIN_CONTEXT
): AnswerCheck {
  const trimmed = (raw ?? "").trim();
  const spec = specForQuestion(question, ctx);
  if (trimmed === "") {
    if (!question.required) return { ok: true, value: "" };
    return {
      ok: false,
      message:
        spec.input === "multi"
          ? "Marque pelo menos uma opção."
          : spec.input === "choice" || spec.input === "toggle" || spec.input === "scale"
            ? "Escolha uma opção para continuar."
            : "Esta pergunta é obrigatória.",
    };
  }

  switch (spec.input) {
    case "number": {
      const normalized = commaToDot(trimmed);
      if (!NUMBER_RE.test(normalized)) {
        return { ok: false, message: "Digite apenas números (ex.: 81,5)." };
      }
      const n = Number(normalized);
      if (question.key === WEIGHT_QUESTION_KEY && (n < 20 || n > 500)) {
        return { ok: false, message: "Informe o peso em quilos (entre 20 e 500)." };
      }
      const min = spec.min ?? 0;
      const max = spec.max ?? 100000;
      if (!Number.isFinite(n) || n < min || n > max) {
        return spec.catalog
          ? {
              ok: false,
              message: `Informe um valor entre ${fmt(min)} e ${fmt(max)}${spec.unit ? ` ${spec.unit}` : ""}.`,
            }
          : { ok: false, message: "Esse valor não parece correto." };
      }
      if (spec.step !== undefined) {
        const decimals = decimalsOf(spec.step);
        const given = normalized.includes(".") ? normalized.length - normalized.indexOf(".") - 1 : 0;
        if (decimals === 0 && given > 0) return { ok: false, message: "Use um número inteiro." };
        if (given > decimals) {
          return {
            ok: false,
            message: `Use no máximo ${decimals} casa${decimals === 1 ? "" : "s"} decima${decimals === 1 ? "l" : "is"}.`,
          };
        }
        if (spec.step === 0.5 && !Number.isInteger(n * 2)) {
          return { ok: false, message: "Use horas inteiras ou meia hora (ex.: 7 ou 7,5)." };
        }
      }
      return { ok: true, value: String(n) };
    }
    case "scale": {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return { ok: false, message: "Escolha um valor de 1 a 5." };
      }
      return { ok: true, value: String(n) };
    }
    case "toggle": {
      const v = trimmed.toLowerCase();
      if (v === "yes" || v === "sim" || v === "true") return { ok: true, value: "yes" };
      if (v === "no" || v === "não" || v === "nao" || v === "false") return { ok: true, value: "no" };
      return { ok: false, message: "Responda Sim ou Não." };
    }
    case "choice": {
      if (!spec.options.some((o) => o.value === trimmed)) {
        return { ok: false, message: "Escolha uma das opções." };
      }
      return { ok: true, value: trimmed };
    }
    case "multi": {
      const values = trimmed
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      const allowed = spec.options.map((o) => o.value);
      if (values.length === 0) {
        return question.required ? { ok: false, message: "Marque pelo menos uma opção." } : { ok: true, value: "" };
      }
      if (values.some((v) => !allowed.includes(v)) || new Set(values).size !== values.length) {
        return { ok: false, message: "Escolha entre as opções da lista." };
      }
      return { ok: true, value: allowed.filter((v) => values.includes(v)).join(",") };
    }
    case "date": {
      const m = ISO_DATE_RE.exec(trimmed);
      const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
      if (!m || !d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== trimmed) {
        return { ok: false, message: "Informe uma data válida." };
      }
      const today = ctx.today ?? todayIsoSaoPaulo();
      if (trimmed > today) return { ok: false, message: "A data não pode estar no futuro." };
      if (trimmed < MIN_DATE) return { ok: false, message: "Confira o ano dessa data." };
      return { ok: true, value: trimmed };
    }
    default: {
      if (trimmed.length > spec.maxLength) {
        return { ok: false, message: `Use no máximo ${spec.maxLength} caracteres.` };
      }
      return { ok: true, value: trimmed };
    }
  }
}

/**
 * Perguntas que o aluno vê com estas respostas (condições do catálogo: cardio, ciclo menstrual
 * pelo sexo do aluno, follow-ups de hormônios/estimulantes/peptídeos). Oculta = não obrigatória
 * e não enviada.
 */
export function visibleQuestions<T extends QuestionLike>(
  questions: T[],
  answers: Record<string, string>,
  ctx: CheckinContext = DEFAULT_CHECKIN_CONTEXT
): T[] {
  return questions.filter((q) => isQuestionVisible(q.key, answers, ctx));
}

export type SubmissionCheck =
  | { ok: true; answers: Record<string, string> }
  | { ok: false; message: string; field: string };

/**
 * Valida o envio inteiro contra as perguntas do template: só chaves de perguntas existentes E
 * visíveis (condições recalculadas a partir das próprias respostas + sexo do aluno — o resto é
 * descartado: o servidor nunca grava chave arbitrária nem resposta de pergunta oculta),
 * obrigatórias respondidas, tipos/opções/limites válidos. Devolve o mapa normalizado (só as
 * respondidas) ou o primeiro erro.
 */
export function checkSubmission(
  questions: QuestionLike[],
  raw: Record<string, string>,
  ctx: CheckinContext = DEFAULT_CHECKIN_CONTEXT
): SubmissionCheck {
  const answers: Record<string, string> = {};
  for (const question of questions) {
    if (question.type === "photos") continue;
    if (!isQuestionVisible(question.key, raw, ctx)) continue;
    const result = checkAnswer(question, raw[question.key], ctx);
    if (!result.ok) {
      return { ok: false, message: `${question.label}: ${result.message}`, field: question.key };
    }
    if (result.value !== "") answers[question.key] = result.value;
  }
  return { ok: true, answers };
}
