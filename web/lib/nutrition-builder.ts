/**
 * Funções PURAS do construtor de nutrição do coach (item 20 do master TODO — biblioteca de
 * alimentos com busca rápida, refeições com dia da semana/horário/quantidade/macros,
 * substituições equivalentes, duplicação de refeição/dia, reordenação, metas nutricionais,
 * hidratação, visualização diária e tradução de erro de negócio das funções SQL de
 * `supabase/migrations/0008_nutrition_builder.sql`). Nenhuma função aqui toca banco — só
 * transforma dado já carregado.
 *
 * Espelha `lib/workout-builder.ts` na FORMA (mesmo estilo de filtro/validação/reordenação/
 * tradução de erro), mas de propósito NÃO importa nada de lá — nutrição fica autocontida, sem
 * nenhum risco de "tocar" a área congelada de treino desta sessão (ver comentário no topo de
 * `supabase/migrations/0008_nutrition_builder.sql`). `lib/repository.ts` (I/O) e os
 * componentes de `app/coach/alunos/[id]/nutricao/*` chamam estas funções; os testes
 * (`lib/nutrition-builder.test.ts`, `npx tsx --test lib/nutrition-builder.test.ts`) cobrem a
 * lógica sem precisar de banco.
 */

// ============================================================================
// Biblioteca de alimentos — busca rápida e filtros
// ============================================================================

export type FoodLite = {
  id: string;
  name: string;
  category: string | null;
  is_archived: boolean;
};

export type FoodFilters = {
  search?: string | null;
  category?: string | null;
  includeArchived?: boolean;
};

/** Sem acento/maiúscula, pra busca tolerante ("frango" encontra "Peito de frango"). */
function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Aplica busca por nome + filtro de categoria sobre uma lista já carregada — mesma decisão
 * de `filterExercises` em `lib/workout-builder.ts`. `includeArchived` (default false) esconde
 * alimentos arquivados; a lista completa continua vindo do banco (arquivar é reversível). */
export function filterFoods<T extends FoodLite>(foods: T[], filters: FoodFilters): T[] {
  const search = normalizeText(filters.search);
  return foods.filter((food) => {
    if (!filters.includeArchived && food.is_archived) return false;
    if (filters.category && food.category !== filters.category) return false;
    if (search && !normalizeText(food.name).includes(search)) return false;
    return true;
  });
}

/** Categorias distintas (ordenadas pt-BR) pra popular o `<select>` de filtro — derivado da
 * própria lista carregada, sem query extra. */
export function distinctFoodCategories<T extends FoodLite>(foods: T[]): string[] {
  const categories = new Set<string>();
  for (const food of foods) {
    if (food.category) categories.add(food.category);
  }
  return [...categories].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ============================================================================
// Dia da semana — visualização diária (1=segunda..7=domingo; null="todo dia")
// ============================================================================

export type WeekDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const WEEKDAY_LABELS: Record<WeekDay, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

export const WEEKDAY_OPTIONS: { value: WeekDay; label: string }[] = (
  [1, 2, 3, 4, 5, 6, 7] as WeekDay[]
).map((value) => ({ value, label: WEEKDAY_LABELS[value] }));

export function dayOfWeekLabel(day: number | null | undefined): string {
  if (day == null) return "Todo dia";
  return WEEKDAY_LABELS[day as WeekDay] ?? "Todo dia";
}

export type MealDayLike = { day_of_week: number | null; sort_order: number };

/**
 * Refeições visíveis num dia da semana escolhido, pra visualização diária (item 20): as do
 * dia exato + as marcadas "todo dia" (day_of_week null), juntas na mesma lista e ordenadas por
 * `sort_order` — mesma decisão de produto documentada na 0008 pra reordenação (refeição "todo
 * dia" e de um dia específico não compartilham ordem própria entre si, mas convivem na
 * visualização do dia).
 */
export function mealsForDay<T extends MealDayLike>(meals: T[], day: WeekDay): T[] {
  return meals
    .filter((m) => m.day_of_week === day || m.day_of_week == null)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Dias da semana (1..7) que têm ao menos uma refeição própria (sem contar "todo dia") —
 * usado pra destacar, na visualização diária, em quais dias há algo específico configurado. */
export function daysWithMeals<T extends MealDayLike>(meals: T[]): WeekDay[] {
  const days = new Set<WeekDay>();
  for (const m of meals) {
    if (m.day_of_week != null) days.add(m.day_of_week as WeekDay);
  }
  return [...days].sort((a, b) => a - b);
}

// ============================================================================
// Macros — soma e progresso em relação às metas do plano
// ============================================================================

export type Macros = {
  kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

export type MacroTotals = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

/** Soma macros de uma lista de itens com `macros` (refeição inteira, ou dia inteiro) —
 * ignora campos ausentes/nulos (conta como 0), nunca lança erro em dado incompleto. */
export function sumMacros(items: { macros: Macros }[]): MacroTotals {
  const totals: MacroTotals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const item of items) {
    totals.kcal += item.macros.kcal ?? 0;
    totals.protein_g += item.macros.protein_g ?? 0;
    totals.carbs_g += item.macros.carbs_g ?? 0;
    totals.fat_g += item.macros.fat_g ?? 0;
  }
  return totals;
}

export type NutritionTargets = {
  target_kcal?: number | null;
  target_protein_g?: number | null;
  target_carbs_g?: number | null;
  target_fat_g?: number | null;
};

export type MacroProgress = {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

/** Percentual (0-999, arredondado) do total atingido em relação à meta de cada macro —
 * `null` quando a meta daquele macro não foi definida (não faz sentido "progresso" sem meta).
 * Sem teto artificial em 100 — passar da meta é informação real (o coach decide o que fazer). */
export function macroProgress(totals: MacroTotals, targets: NutritionTargets): MacroProgress {
  const pct = (value: number, target: number | null | undefined): number | null => {
    if (target == null || target <= 0) return null;
    return Math.round((value / target) * 100);
  };
  return {
    kcal: pct(totals.kcal, targets.target_kcal),
    protein_g: pct(totals.protein_g, targets.target_protein_g),
    carbs_g: pct(totals.carbs_g, targets.target_carbs_g),
    fat_g: pct(totals.fat_g, targets.target_fat_g),
  };
}

// ============================================================================
// Validação (usada pelos Server Actions antes de gravar)
// ============================================================================

export type MealDraftInput = {
  name: string;
  time?: string | null;
  dayOfWeek?: number | null;
  notes?: string | null;
};

/** `null` = válido; string = mensagem de erro pronta pra exibir. */
export function validateMealInput(input: MealDraftInput): string | null {
  if (!input.name || !input.name.trim()) return "Informe o nome da refeição.";
  if (input.name.trim().length > 120) return "O nome da refeição deve ter até 120 caracteres.";
  if (input.dayOfWeek != null && (input.dayOfWeek < 1 || input.dayOfWeek > 7)) {
    return "Dia da semana inválido.";
  }
  if (input.time && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(input.time)) {
    return "Horário inválido (use HH:MM).";
  }
  return null;
}

export type MealItemDraftInput = {
  foodId: string;
  quantity?: number | null;
  unit?: string | null;
};

export function validateMealItemInput(input: MealItemDraftInput): string | null {
  if (!input.foodId) return "Selecione um alimento da biblioteca.";
  if (input.quantity != null && input.quantity < 0) return "Quantidade não pode ser negativa.";
  if (input.unit && input.unit.length > 20) return "Unidade deve ter até 20 caracteres.";
  return null;
}

export type SubstitutionDraftInput = {
  alternativeFoodId?: string | null;
  alternativeLabel?: string | null;
};

/** Substituição precisa de alimento da biblioteca OU rótulo livre (ex.: "2 fatias de pão
 * integral") — nunca as duas coisas vazias, senão não há o que oferecer como alternativa. */
export function validateSubstitutionInput(input: SubstitutionDraftInput): string | null {
  const hasFood = !!input.alternativeFoodId;
  const hasLabel = !!input.alternativeLabel && input.alternativeLabel.trim() !== "";
  if (!hasFood && !hasLabel) {
    return "Informe um alimento substituto ou descreva a alternativa.";
  }
  return null;
}

export type FoodEquivalenceDraftInput = {
  foodId: string;
  equivalentFoodId: string;
  factor?: number | null;
};

export function validateFoodEquivalenceInput(input: FoodEquivalenceDraftInput): string | null {
  if (!input.foodId || !input.equivalentFoodId) return "Selecione os dois alimentos da equivalência.";
  if (input.foodId === input.equivalentFoodId) return "Um alimento não pode ser equivalente a ele mesmo.";
  if (input.factor != null && input.factor <= 0) return "O fator de equivalência deve ser maior que zero.";
  return null;
}

export type NutritionGoalsDraftInput = {
  targetKcal?: number | null;
  targetProteinG?: number | null;
  targetCarbsG?: number | null;
  targetFatG?: number | null;
  targetWaterMl?: number | null;
};

export function validateNutritionGoalsInput(input: NutritionGoalsDraftInput): string | null {
  if (input.targetKcal != null && input.targetKcal < 0) return "Meta de calorias não pode ser negativa.";
  if (input.targetProteinG != null && input.targetProteinG < 0) return "Meta de proteína não pode ser negativa.";
  if (input.targetCarbsG != null && input.targetCarbsG < 0) return "Meta de carboidratos não pode ser negativa.";
  if (input.targetFatG != null && input.targetFatG < 0) return "Meta de gordura não pode ser negativa.";
  if (input.targetWaterMl != null && input.targetWaterMl < 0) return "Meta de água não pode ser negativa.";
  return null;
}

// ============================================================================
// Reordenação (setas ↑/↓ — sem drag-and-drop, mesma convenção do construtor de treino)
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

/** Ids em ordem, com `newId` inserido logo depois de `afterId`. Se `afterId` não existir, ou
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
  plan_not_found: "Plano de nutrição não encontrado.",
  client_required: "Selecione um aluno de destino.",
  client_not_found: "Aluno de destino não encontrado.",
  cross_account: "Esse aluno não pertence à sua conta.",
  draft_exists: "Este aluno já tem um rascunho em andamento — publique-o ou descarte antes de criar outro.",
  meal_not_found: "Refeição não encontrada.",
  same_day: "Escolha um dia de destino diferente do dia de origem.",
  day_empty: "Não há refeições no dia de origem para duplicar.",
  template_not_publishable: "Um template não pode ser publicado diretamente — aplique-o a um aluno primeiro.",
  already_published: "Este plano já está publicado.",
  plan_empty: "Adicione pelo menos um alimento antes de publicar.",
  order_mismatch: "A ordem enviada não bate com os itens atuais — recarregue a página e tente de novo.",
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

/** Reconhece texto técnico cru do Postgres/PostgREST (RLS, constraints, sintaxe) que nunca
 * deve chegar na tela do coach/aluno — ex.: um `clientId` forjado esbarrando na policy de RLS
 * de `meal_logs`/`water_logs` devolve "new row violates row-level security policy for table
 * ...", que não diz nada de útil pro usuário e ainda expõe nomes de tabela. */
const RAW_DB_ERROR_PATTERN =
  /row-level security|permission denied|violates|duplicate key|syntax error|invalid input syntax|null value in column|foreign key constraint|check constraint|unique constraint|pgrst\d|json object requested/i;

/**
 * Última camada antes de mostrar um erro de uma action pro usuário final: primeiro tenta o
 * código de negócio `trackly:<codigo>` (via `translateTracklyError`, já amigável); se o que
 * sobrar ainda parecer texto técnico cru de banco (RLS/constraint/sintaxe — item 25/37 do
 * TODO), troca pelo `fallback` contextual daquela ação. Nunca muda o comportamento de
 * segurança, só a mensagem exibida.
 */
export function toFriendlyActionError(message: string, fallback: string): string {
  const translated = translateTracklyError(message);
  return RAW_DB_ERROR_PATTERN.test(translated) ? fallback : translated;
}
