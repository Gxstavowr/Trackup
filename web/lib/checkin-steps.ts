/**
 * Regras PURAS (sem I/O, sem "server-only") do check-in do aluno, compartilhadas entre o
 * formulário guiado (client) e o servidor (validação no envio / no rascunho):
 *
 *  1. Em qual PASSO do formulário cada pergunta do template do coach aparece.
 *  2. Normalização + validação de cada resposta por tipo (number / scale / text).
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
 * (as fotos são opcionais, mas o passo é o "primeiro passo" do check-in).
 */

export type CheckinStepId = "body" | "food" | "training" | "wellbeing";

export const CHECKIN_STEPS: { id: CheckinStepId; title: string; hint: string }[] = [
  { id: "body", title: "Peso e fotos", hint: "Comece pelo peso. As fotos são opcionais, mas ajudam muito o seu coach." },
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
): (CheckinStepGroup & { questions: T[] })[] {
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

  return CHECKIN_STEPS.filter((s) => s.id === "body" || buckets[s.id].length > 0).map((s) => ({
    ...s,
    questions: buckets[s.id],
  }));
}

// ---------------------------------------------------------------------------------------------
// Normalização e validação de respostas
// ---------------------------------------------------------------------------------------------

export const MAX_TEXT_LENGTH = 2000;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export type AnswerCheck = { ok: true; value: string } | { ok: false; message: string };

/** "81,5" -> "81.5" (teclado numérico em pt-BR digita vírgula). Não valida — só troca. */
export function commaToDot(raw: string): string {
  return raw.trim().replace(",", ".");
}

/**
 * Valida e normaliza UMA resposta pelo tipo da pergunta. Vazio é válido (vira `""`) salvo se a
 * pergunta é obrigatória. `number`: aceita vírgula, devolve string com ponto; `scale`: inteiro
 * 1–5; os demais tipos (text e qualquer tipo que o formulário ainda não renderiza de forma
 * própria) são texto livre até `MAX_TEXT_LENGTH`.
 */
export function checkAnswer(question: QuestionLike, raw: string | undefined | null): AnswerCheck {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") {
    return question.required
      ? { ok: false, message: "Esta pergunta é obrigatória." }
      : { ok: true, value: "" };
  }

  if (question.type === "number") {
    const normalized = commaToDot(trimmed);
    if (!NUMBER_RE.test(normalized)) {
      return { ok: false, message: "Digite apenas números (ex.: 81,5)." };
    }
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return { ok: false, message: "Esse valor não parece correto." };
    }
    if (question.key === "weight_kg" && (n < 20 || n > 500)) {
      return { ok: false, message: "Informe o peso em quilos (entre 20 e 500)." };
    }
    return { ok: true, value: String(n) };
  }

  if (question.type === "scale") {
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { ok: false, message: "Escolha um valor de 1 a 5." };
    }
    return { ok: true, value: String(n) };
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return { ok: false, message: `Use no máximo ${MAX_TEXT_LENGTH} caracteres.` };
  }
  return { ok: true, value: trimmed };
}

export type SubmissionCheck =
  | { ok: true; answers: Record<string, string> }
  | { ok: false; message: string; field: string };

/**
 * Valida o envio inteiro contra as perguntas do template: só chaves de perguntas existentes
 * (o resto é descartado — o servidor nunca grava chave arbitrária), obrigatórias respondidas,
 * tipos válidos. Devolve o mapa normalizado (só as respondidas) ou o primeiro erro.
 */
export function checkSubmission(
  questions: QuestionLike[],
  raw: Record<string, string>
): SubmissionCheck {
  const answers: Record<string, string> = {};
  for (const question of questions) {
    if (question.type === "photos") continue;
    const result = checkAnswer(question, raw[question.key]);
    if (!result.ok) {
      return { ok: false, message: `${question.label}: ${result.message}`, field: question.key };
    }
    if (result.value !== "") answers[question.key] = result.value;
  }
  return { ok: true, answers };
}
