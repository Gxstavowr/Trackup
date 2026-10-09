/**
 * Funções PURAS do construtor de treino do coach (item 18 do master TODO — biblioteca,
 * busca/filtros, blocos de aquecimento/cardio/superset/circuito, reordenação, validação de
 * prescrição, tradução de erro de negócio das funções SQL de
 * `supabase/migrations/0007_training_builder.sql`). Nenhuma função aqui toca banco — só
 * transforma dado já carregado. `lib/repository.ts` (I/O) e os componentes de
 * `app/coach/alunos/[id]/treino/*` chamam estas funções; os testes
 * (`lib/workout-builder.test.ts`, `npx tsx --test lib/workout-builder.test.ts`) cobrem a
 * lógica sem precisar de banco — mesmo padrão de `lib/insights.ts`/`lib/evolution.ts`.
 */

import { sanitizeDbErrorMessage } from "./action-errors";

export type WorkoutBlockType = "warmup" | "normal" | "cardio";
export type WorkoutGroupKind = "superset" | "circuit";

// ============================================================================
// Biblioteca de exercícios — busca e filtros
// ============================================================================

export type ExerciseLite = {
  id: string;
  name: string;
  category: string;
  muscle_group: string | null;
  equipment: string | null;
  is_custom: boolean;
  is_archived: boolean;
};

export type ExerciseFilters = {
  search?: string | null;
  category?: string | null;
  muscleGroup?: string | null;
  equipment?: string | null;
  includeArchived?: boolean;
};

/** Sem acento/maiúscula, pra busca tolerante ("supino" encontra "Supino reto"). */
function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Aplica busca por nome + filtros de categoria/grupo muscular/equipamento sobre uma lista já
 * carregada. `includeArchived` (default false) esconde exercícios arquivados — mesmo assim a
 * lista completa continua vindo do banco (arquivar é reversível), só a UI padrão esconde.
 */
export function filterExercises<T extends ExerciseLite>(exercises: T[], filters: ExerciseFilters): T[] {
  const search = normalizeText(filters.search);
  return exercises.filter((ex) => {
    if (!filters.includeArchived && ex.is_archived) return false;
    if (filters.category && ex.category !== filters.category) return false;
    if (filters.muscleGroup && ex.muscle_group !== filters.muscleGroup) return false;
    if (filters.equipment && ex.equipment !== filters.equipment) return false;
    if (search && !normalizeText(ex.name).includes(search)) return false;
    return true;
  });
}

/** Valores distintos (ordenados pt-BR) pra popular os `<select>` de filtro — derivado da
 * própria lista carregada, sem query extra. */
export function distinctFilterOptions<T extends ExerciseLite>(
  exercises: T[]
): { categories: string[]; muscleGroups: string[]; equipment: string[] } {
  const categories = new Set<string>();
  const muscleGroups = new Set<string>();
  const equipment = new Set<string>();
  for (const ex of exercises) {
    if (ex.category) categories.add(ex.category);
    if (ex.muscle_group) muscleGroups.add(ex.muscle_group);
    if (ex.equipment) equipment.add(ex.equipment);
  }
  const sortPt = (a: string, b: string) => a.localeCompare(b, "pt-BR");
  return {
    categories: [...categories].sort(sortPt),
    muscleGroups: [...muscleGroups].sort(sortPt),
    equipment: [...equipment].sort(sortPt),
  };
}

// ============================================================================
// Blocos do dia — aquecimento/normal/cardio + agrupamento visual de superset/circuito
// ============================================================================

export type BlockExerciseLike = {
  id: string;
  sort_order: number;
  block_type: WorkoutBlockType;
  group_kind: WorkoutGroupKind | null;
  group_key: string | null;
};

export type RenderBlock<T> =
  | { kind: "single"; item: T }
  | { kind: "group"; groupKind: WorkoutGroupKind; groupKey: string; items: T[] };

/**
 * Agrupa os exercícios de um dia (já em `sort_order`) em blocos pra exibição: itens
 * CONSECUTIVOS com o mesmo `group_key` viram um único bloco visual de superset/circuito;
 * qualquer outro item (aquecimento, normal solto, cardio) vira um bloco `single`. Decisão de
 * produto: um grupo só existe entre exercícios ADJACENTES na ordem — reordenar quebra o grupo
 * se afastar os membros, o que é o comportamento esperado (a UI de reordenar avisa disso).
 */
export function groupDayExercises<T extends BlockExerciseLike>(items: T[]): RenderBlock<T>[] {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const blocks: RenderBlock<T>[] = [];
  let i = 0;
  while (i < sorted.length) {
    const item = sorted[i];
    if (item.group_key && item.group_kind) {
      const groupKey = item.group_key;
      const groupKind = item.group_kind;
      const groupItems: T[] = [item];
      let j = i + 1;
      while (j < sorted.length && sorted[j].group_key === groupKey && sorted[j].group_kind === groupKind) {
        groupItems.push(sorted[j]);
        j++;
      }
      blocks.push({ kind: "group", groupKind, groupKey, items: groupItems });
      i = j;
    } else {
      blocks.push({ kind: "single", item });
      i++;
    }
  }
  return blocks;
}

export function blockTypeLabel(blockType: WorkoutBlockType): string {
  if (blockType === "warmup") return "Aquecimento";
  if (blockType === "cardio") return "Cardio";
  return "Normal";
}

export function groupKindLabel(groupKind: WorkoutGroupKind | null | undefined): string | null {
  if (groupKind === "superset") return "Superset";
  if (groupKind === "circuit") return "Circuito";
  return null;
}

// ============================================================================
// Validação de prescrição (usada pelos Server Actions antes de gravar)
// ============================================================================

export type WorkoutExerciseDraftInput = {
  exerciseId: string;
  blockType: WorkoutBlockType;
  sets?: number | null;
  reps?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  restSec?: number | null;
  rir?: number | null;
  tempo?: string | null;
  suggestedLoad?: number | null;
  durationSec?: number | null;
  groupKind?: WorkoutGroupKind | null;
  groupKey?: string | null;
  substituteExerciseId?: string | null;
};

/** `null` = válido; string = mensagem de erro pronta pra exibir. */
export function validateWorkoutExerciseInput(input: WorkoutExerciseDraftInput): string | null {
  if (!input.exerciseId) return "Selecione um exercício.";

  if (input.repsMin != null && input.repsMin < 0) return "Repetição mínima não pode ser negativa.";
  if (input.repsMax != null && input.repsMax < 0) return "Repetição máxima não pode ser negativa.";
  if (input.repsMin != null && input.repsMax != null && input.repsMax < input.repsMin) {
    return "A repetição máxima não pode ser menor que a mínima.";
  }
  if (input.rir != null && (input.rir < 0 || input.rir > 10)) return "RIR deve estar entre 0 e 10.";
  if (input.sets != null && input.sets < 0) return "Séries não pode ser negativo.";
  if (input.restSec != null && input.restSec < 0) return "Descanso não pode ser negativo.";
  if (input.suggestedLoad != null && input.suggestedLoad < 0) return "Carga sugerida não pode ser negativa.";
  if (input.durationSec != null && input.durationSec < 0) return "Duração não pode ser negativa.";
  if (input.tempo && input.tempo.length > 20) return "Cadência deve ter até 20 caracteres (ex.: 3-1-1-0).";

  const hasGroupKind = input.groupKind != null;
  const hasGroupKey = !!input.groupKey && input.groupKey.trim() !== "";
  if (hasGroupKind !== hasGroupKey) {
    return "Superset/circuito precisa de um tipo de grupo e de uma letra do grupo juntos.";
  }
  if (hasGroupKey && !/^[a-zA-Z0-9]{1,20}$/.test(input.groupKey!.trim())) {
    return "A letra do grupo deve ter até 20 caracteres alfanuméricos (ex.: A, A1).";
  }

  if (input.blockType === "cardio" && input.durationSec == null && input.sets == null) {
    return "Informe a duração (ou séries) do bloco de cardio.";
  }

  if (input.substituteExerciseId && input.substituteExerciseId === input.exerciseId) {
    return "O exercício substituto não pode ser o mesmo exercício prescrito.";
  }

  return null;
}

// ============================================================================
// Reordenação (setas ↑/↓ — sem drag-and-drop, mesma convenção de coach/treino.html V11)
// ============================================================================

/** Troca o item do `index` com o vizinho na `direction` dada; devolve a MESMA referência de
 * array se o movimento não é possível (já é o primeiro/último) — chamador testa por `===`. */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const copy = items.slice();
  const tmp = copy[index];
  copy[index] = copy[target];
  copy[target] = tmp;
  return copy;
}

export function idsInOrder<T extends { id: string }>(items: T[]): string[] {
  return items.map((item) => item.id);
}

/** Ids em ordem, com `newId` inserido logo depois de `afterId` (usado ao duplicar exercício —
 * a cópia entra logo após o original, não no fim da lista). Se `afterId` não existir, ou
 * `newId` já estiver na lista antes daqui, a lista volta como veio, com `newId` no fim. */
export function insertIdAfter(orderedIds: string[], afterId: string, newId: string): string[] {
  const withoutNew = orderedIds.filter((id) => id !== newId);
  const idx = withoutNew.indexOf(afterId);
  if (idx === -1) return [...withoutNew, newId];
  const result = withoutNew.slice();
  result.splice(idx + 1, 0, newId);
  return result;
}

// ============================================================================
// Tradução dos erros de negócio das funções SQL (`raise exception 'trackly:<codigo>'`)
// ============================================================================

const TRACKLY_ERROR_MESSAGES: Record<string, string> = {
  plan_not_found: "Plano de treino não encontrado.",
  client_required: "Selecione um aluno de destino.",
  client_not_found: "Aluno de destino não encontrado.",
  cross_account: "Esse aluno não pertence à sua conta.",
  draft_exists: "Este aluno já tem um rascunho em andamento — publique-o ou descarte antes de criar outro.",
  day_not_found: "Dia de treino não encontrado.",
  template_not_publishable: "Um template não pode ser publicado diretamente — aplique-o a um aluno primeiro.",
  already_published: "Este plano já está publicado.",
  plan_empty: "Adicione pelo menos um exercício antes de publicar.",
  order_mismatch: "A ordem enviada não bate com os itens atuais — recarregue a página e tente de novo.",
  not_coach: "Sessão de coach inválida.",
  invalid_items: "Lista de exercícios inválida.",
};

/**
 * Extrai o código `trackly:<codigo>` de uma mensagem de erro do Postgres (via
 * `raise exception`) e devolve a tradução em português; se não reconhecer o padrão, devolve a
 * mensagem original (fallback honesto, nunca esconde um erro real).
 */
export function translateTracklyError(message: string): string {
  const match = /trackly:([a-z_]+)/i.exec(message);
  if (!match) return message;
  return TRACKLY_ERROR_MESSAGES[match[1]] ?? message;
}

/**
 * Última camada antes de mostrar um erro de uma action pro usuário final: primeiro tenta o
 * código de negócio `trackly:<codigo>` (via `translateTracklyError`, já amigável); se o que
 * sobrar ainda parecer texto técnico cru de banco (RLS/constraint/sintaxe — item 25/37 do
 * TODO, ex.: um `clientId` forjado esbarrando na policy de RLS de `workout_sessions`/
 * `workout_logs`), troca pelo `fallback` contextual daquela ação. Nunca muda o comportamento
 * de segurança, só a mensagem exibida.
 */
export function toFriendlyActionError(message: string, fallback: string): string {
  return sanitizeDbErrorMessage(translateTracklyError(message), fallback);
}
