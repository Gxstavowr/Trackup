/**
 * Respostas do check-in na tela de AVALIAÇÃO do coach (V3, tarefas 16/17) — módulo PURO (sem I/O),
 * usado pela semana atual e pela visão de uma semana passada.
 *
 *  - `formatAnswerForCoach`: ÚNICO ponto de formatação de resposta exibida ao coach. Usa o texto
 *    já formatado pelo servidor (`display`) — para chaves do catálogo, o servidor formata com
 *    `formatCheckinAnswer` (rótulo das opções, Sim/Não, data dd/mm/aaaa, unidade).
 *  - `isSensitiveAnswer`: respostas de saúde sensíveis (LGPD art. 11) — hormônios, estimulantes,
 *    peptídeos, dose, efeitos, exame de sangue, ciclo menstrual. Primeiro vale o flag `sensitive`
 *    do catálogo (`isSensitiveKey`); fragmentos de chave/rótulo ficam só como reserva para
 *    perguntas criadas pelo coach. Só aparecem na avaliação (bloco discreto "Informações
 *    sensíveis"); nunca geram conclusão automática.
 *  - `splitAnswers`: separa respostas comuns x sensíveis e tira as que já aparecem como métrica
 *    (peso, aderência, energia...) para nada ser mostrado duas vezes na mesma área.
 *  - `parseWeekParam`: valida `?semana=N`.
 */

import { isSensitiveKey } from "./checkin-catalog";

export type CoachAnswer = {
  key: string;
  label: string;
  /** Texto já formatado pelo servidor (tipo/unidade da pergunta). */
  display: string;
  /** Valor cru gravado em `checkin_answers.value` (quando disponível). */
  raw?: string;
};

/** Formatação de UMA resposta para o coach (ponto único de troca — ver cabeçalho). */
export function formatAnswerForCoach(answer: CoachAnswer): string {
  return answer.display;
}

/** Fragmentos de CHAVE que marcam pergunta sensível (chaves do catálogo V3 e variações). */
const SENSITIVE_KEY_PARTS = [
  "hormon",
  "stimulant",
  "estimulant",
  "peptide",
  "peptid",
  "dose",
  "dosage",
  "side_effect",
  "effects",
  "efeito",
  "blood",
  "exam",
  "menstru",
  "cycle",
  "ciclo",
  "steroid",
];

/** Fragmentos de RÓTULO (normalizado, sem acento) que marcam pergunta sensível. */
const SENSITIVE_LABEL_PARTS = [
  "hormon",
  "estimulant",
  "peptide",
  "peptid",
  "dose",
  "dosagem",
  "efeito",
  "exame de sangue",
  "exames de sangue",
  "ultimo exame",
  "menstrua",
  "ciclo menstrual",
  "anabolizante",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function isSensitiveAnswer(answer: Pick<CoachAnswer, "key" | "label">): boolean {
  // Catálogo do sistema primeiro (ex.: `substances_types`, rótulo "O que você usa?", não bate
  // com nenhum fragmento). Heurística abaixo: só reserva para perguntas personalizadas.
  if (isSensitiveKey(answer.key)) return true;
  const key = normalize(answer.key);
  if (SENSITIVE_KEY_PARTS.some((p) => key.includes(p))) return true;
  const label = normalize(answer.label);
  return SENSITIVE_LABEL_PARTS.some((p) => label.includes(p));
}

/**
 * Respostas comuns x sensíveis, na ordem original, sem as chaves de `shownAsMetric` (já exibidas
 * como métrica na mesma área). Respostas sensíveis nunca são escondidas por `shownAsMetric`.
 */
export function splitAnswers<T extends CoachAnswer>(
  answers: T[],
  shownAsMetric: Iterable<string> = []
): { regular: T[]; sensitive: T[] } {
  const hidden = new Set(shownAsMetric);
  const regular: T[] = [];
  const sensitive: T[] = [];
  for (const a of answers) {
    if (isSensitiveAnswer(a)) sensitive.push(a);
    else if (!hidden.has(a.key)) regular.push(a);
  }
  return { regular, sensitive };
}

/** `?semana=N` -> N (inteiro 1..1000) ou `null` se ausente/ inválido. */
export function parseWeekParam(param: string | string[] | undefined): number | null {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw === undefined || !/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 1000 ? n : null;
}
