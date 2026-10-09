import assert from "node:assert/strict";
import test from "node:test";
import {
  daysWithMeals,
  dayOfWeekLabel,
  distinctFoodCategories,
  filterFoods,
  idsInOrder,
  insertIdAfter,
  macroProgress,
  mealsForDay,
  moveItem,
  sumMacros,
  toFriendlyActionError,
  translateTracklyError,
  validateFoodEquivalenceInput,
  validateMealInput,
  validateMealItemInput,
  validateNutritionGoalsInput,
  validateSubstitutionInput,
  type FoodLite,
} from "./nutrition-builder";

/**
 * Testes das funções puras do construtor de nutrição (item 20). Rodar (pasta `web/`):
 * `npx tsx --test lib/nutrition-builder.test.ts`
 */

function food(over: Partial<FoodLite> & { id: string; name: string }): FoodLite {
  return { category: "Proteína", is_archived: false, ...over };
}

// ----------------------------------------------------------------------------
// Biblioteca de alimentos
// ----------------------------------------------------------------------------

test("filterFoods: busca por nome ignora acento e maiúscula", () => {
  const list = [food({ id: "1", name: "Peito de frango" }), food({ id: "2", name: "Arroz" })];
  const result = filterFoods(list, { search: "FRANGO" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});

test("filterFoods: busca ignora acento (café -> cafe)", () => {
  const list = [food({ id: "1", name: "Café" })];
  assert.equal(filterFoods(list, { search: "cafe" }).length, 1);
});

test("filterFoods: filtra por categoria", () => {
  const list = [
    food({ id: "1", name: "Frango", category: "Proteína" }),
    food({ id: "2", name: "Arroz", category: "Carboidrato" }),
  ];
  const result = filterFoods(list, { category: "Carboidrato" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "2");
});

test("filterFoods: esconde arquivado por padrão", () => {
  const list = [food({ id: "1", name: "Frango", is_archived: true }), food({ id: "2", name: "Arroz" })];
  assert.equal(filterFoods(list, {}).length, 1);
  assert.equal(filterFoods(list, { includeArchived: true }).length, 2);
});

test("filterFoods: sem filtro nenhum devolve tudo (não-arquivado)", () => {
  const list = [food({ id: "1", name: "Frango" }), food({ id: "2", name: "Arroz" })];
  assert.equal(filterFoods(list, {}).length, 2);
});

test("distinctFoodCategories: valores únicos, ordenados pt-BR, sem null", () => {
  const list = [
    food({ id: "1", name: "A", category: "Vegetal" }),
    food({ id: "2", name: "B", category: "Álcool" }),
    food({ id: "3", name: "C", category: null }),
    food({ id: "4", name: "D", category: "Vegetal" }),
  ];
  const categories = distinctFoodCategories(list);
  assert.deepEqual(categories, ["Álcool", "Vegetal"]);
});

// ----------------------------------------------------------------------------
// Dia da semana
// ----------------------------------------------------------------------------

test("dayOfWeekLabel: null é 'Todo dia'", () => {
  assert.equal(dayOfWeekLabel(null), "Todo dia");
  assert.equal(dayOfWeekLabel(undefined), "Todo dia");
});

test("dayOfWeekLabel: 1..7 mapeiam segunda..domingo", () => {
  assert.equal(dayOfWeekLabel(1), "Segunda");
  assert.equal(dayOfWeekLabel(7), "Domingo");
});

test("mealsForDay: inclui o dia exato + 'todo dia', ordenado por sort_order", () => {
  const meals = [
    { id: "a", day_of_week: 2, sort_order: 1 },
    { id: "b", day_of_week: null, sort_order: 0 },
    { id: "c", day_of_week: 3, sort_order: 0 },
  ];
  const result = mealsForDay(meals, 2);
  assert.deepEqual(result.map((m) => m.id), ["b", "a"]);
});

test("mealsForDay: dia sem refeição própria só mostra 'todo dia'", () => {
  const meals = [
    { id: "a", day_of_week: 2, sort_order: 0 },
    { id: "b", day_of_week: null, sort_order: 0 },
  ];
  const result = mealsForDay(meals, 5);
  assert.deepEqual(result.map((m) => m.id), ["b"]);
});

test("daysWithMeals: só conta dias específicos, não 'todo dia', ordenado e sem duplicata", () => {
  const meals = [
    { day_of_week: 3, sort_order: 0 },
    { day_of_week: null, sort_order: 0 },
    { day_of_week: 1, sort_order: 0 },
    { day_of_week: 3, sort_order: 1 },
  ];
  assert.deepEqual(daysWithMeals(meals), [1, 3]);
});

// ----------------------------------------------------------------------------
// Macros
// ----------------------------------------------------------------------------

test("sumMacros: soma ignorando campos ausentes", () => {
  const totals = sumMacros([
    { macros: { kcal: 100, protein_g: 10 } },
    { macros: { kcal: 50, carbs_g: 20 } },
    { macros: {} },
  ]);
  assert.deepEqual(totals, { kcal: 150, protein_g: 10, carbs_g: 20, fat_g: 0 });
});

test("sumMacros: lista vazia soma zero", () => {
  assert.deepEqual(sumMacros([]), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
});

test("macroProgress: percentual arredondado por macro", () => {
  const totals = { kcal: 1500, protein_g: 75, carbs_g: 100, fat_g: 40 };
  const progress = macroProgress(totals, { target_kcal: 2000, target_protein_g: 150 });
  assert.equal(progress.kcal, 75);
  assert.equal(progress.protein_g, 50);
  assert.equal(progress.carbs_g, null);
  assert.equal(progress.fat_g, null);
});

test("macroProgress: meta zero ou ausente vira null (não divide por zero)", () => {
  const totals = { kcal: 100, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const progress = macroProgress(totals, { target_kcal: 0 });
  assert.equal(progress.kcal, null);
});

test("macroProgress: pode passar de 100% sem teto artificial", () => {
  const totals = { kcal: 2500, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const progress = macroProgress(totals, { target_kcal: 2000 });
  assert.equal(progress.kcal, 125);
});

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------

test("validateMealInput: nome vazio é inválido", () => {
  assert.match(validateMealInput({ name: "" }) ?? "", /nome/i);
  assert.match(validateMealInput({ name: "   " }) ?? "", /nome/i);
});

test("validateMealInput: nome válido, sem outros campos, passa", () => {
  assert.equal(validateMealInput({ name: "Café da manhã" }), null);
});

test("validateMealInput: dia da semana fora de 1..7 é inválido", () => {
  assert.match(validateMealInput({ name: "Almoço", dayOfWeek: 0 }) ?? "", /dia/i);
  assert.match(validateMealInput({ name: "Almoço", dayOfWeek: 8 }) ?? "", /dia/i);
  assert.equal(validateMealInput({ name: "Almoço", dayOfWeek: 1 }), null);
  assert.equal(validateMealInput({ name: "Almoço", dayOfWeek: null }), null);
});

test("validateMealInput: horário precisa ser HH:MM", () => {
  assert.match(validateMealInput({ name: "Almoço", time: "25:99" }) ?? "", /horário/i);
  assert.equal(validateMealInput({ name: "Almoço", time: "12:30" }), null);
  assert.equal(validateMealInput({ name: "Almoço", time: null }), null);
});

test("validateMealItemInput: exige alimento selecionado", () => {
  assert.match(validateMealItemInput({ foodId: "" }) ?? "", /alimento/i);
  assert.equal(validateMealItemInput({ foodId: "food-1" }), null);
});

test("validateMealItemInput: quantidade negativa é inválida", () => {
  assert.match(validateMealItemInput({ foodId: "food-1", quantity: -1 }) ?? "", /quantidade/i);
  assert.equal(validateMealItemInput({ foodId: "food-1", quantity: 0 }), null);
});

test("validateSubstitutionInput: precisa de alimento OU rótulo, nunca os dois vazios", () => {
  assert.match(validateSubstitutionInput({}) ?? "", /informe/i);
  assert.equal(validateSubstitutionInput({ alternativeFoodId: "food-2" }), null);
  assert.equal(validateSubstitutionInput({ alternativeLabel: "Pão integral" }), null);
  assert.match(validateSubstitutionInput({ alternativeLabel: "   " }) ?? "", /informe/i);
});

test("validateFoodEquivalenceInput: exige os dois alimentos e não permite igual a si mesmo", () => {
  assert.match(validateFoodEquivalenceInput({ foodId: "a", equivalentFoodId: "" }) ?? "", /selecione/i);
  assert.match(validateFoodEquivalenceInput({ foodId: "a", equivalentFoodId: "a" }) ?? "", /mesmo/i);
  assert.equal(validateFoodEquivalenceInput({ foodId: "a", equivalentFoodId: "b" }), null);
});

test("validateFoodEquivalenceInput: fator precisa ser maior que zero", () => {
  assert.match(validateFoodEquivalenceInput({ foodId: "a", equivalentFoodId: "b", factor: 0 }) ?? "", /fator/i);
  assert.match(validateFoodEquivalenceInput({ foodId: "a", equivalentFoodId: "b", factor: -2 }) ?? "", /fator/i);
  assert.equal(validateFoodEquivalenceInput({ foodId: "a", equivalentFoodId: "b", factor: 1.5 }), null);
});

test("validateNutritionGoalsInput: nenhuma meta é inválida por padrão", () => {
  assert.equal(validateNutritionGoalsInput({}), null);
});

test("validateNutritionGoalsInput: metas negativas são inválidas", () => {
  assert.match(validateNutritionGoalsInput({ targetKcal: -1 }) ?? "", /calorias/i);
  assert.match(validateNutritionGoalsInput({ targetProteinG: -1 }) ?? "", /proteína/i);
  assert.match(validateNutritionGoalsInput({ targetCarbsG: -1 }) ?? "", /carboidratos/i);
  assert.match(validateNutritionGoalsInput({ targetFatG: -1 }) ?? "", /gordura/i);
  assert.match(validateNutritionGoalsInput({ targetWaterMl: -1 }) ?? "", /água/i);
});

// ----------------------------------------------------------------------------
// Reordenação
// ----------------------------------------------------------------------------

test("moveItem: troca com o vizinho na direção dada", () => {
  const result = moveItem(["a", "b", "c"], 0, 1);
  assert.deepEqual(result, ["b", "a", "c"]);
});

test("moveItem: no limite, devolve a MESMA referência (===)", () => {
  const items = ["a", "b", "c"];
  assert.equal(moveItem(items, 0, -1), items);
  assert.equal(moveItem(items, 2, 1), items);
});

test("idsInOrder: extrai ids na ordem dada", () => {
  assert.deepEqual(idsInOrder([{ id: "x" }, { id: "y" }]), ["x", "y"]);
});

test("insertIdAfter: insere logo depois do id de referência", () => {
  const result = insertIdAfter(["a", "b", "c"], "a", "new");
  assert.deepEqual(result, ["a", "new", "b", "c"]);
});

test("insertIdAfter: remove ocorrência antiga de newId antes de reinserir", () => {
  const result = insertIdAfter(["a", "new", "b"], "b", "new");
  assert.deepEqual(result, ["a", "b", "new"]);
});

test("insertIdAfter: afterId inexistente cai no fim", () => {
  const result = insertIdAfter(["a", "b"], "z", "new");
  assert.deepEqual(result, ["a", "b", "new"]);
});

// ----------------------------------------------------------------------------
// Tradução de erro
// ----------------------------------------------------------------------------

test("translateTracklyError: traduz códigos conhecidos", () => {
  assert.equal(translateTracklyError("trackly:plan_not_found"), "Plano de nutrição não encontrado.");
  assert.equal(translateTracklyError("trackly:day_empty"), "Não há refeições no dia de origem para duplicar.");
  assert.match(translateTracklyError("trackly:draft_exists"), /rascunho em andamento/);
});

test("translateTracklyError: código desconhecido devolve a mensagem original", () => {
  const msg = "trackly:algo_novo_desconhecido";
  assert.equal(translateTracklyError(msg), msg);
});

test("translateTracklyError: mensagem sem o padrão trackly: devolve como veio", () => {
  const msg = "duplicate key value violates unique constraint";
  assert.equal(translateTracklyError(msg), msg);
});

// ----------------------------------------------------------------------------
// toFriendlyActionError — item 25/37: nunca vazar texto cru de RLS/constraint pro usuário
// ----------------------------------------------------------------------------

test("toFriendlyActionError: clientId forjado esbarrando em RLS vira mensagem amigável", () => {
  const raw = 'new row violates row-level security policy for table "meal_logs"';
  assert.equal(toFriendlyActionError(raw, "Não foi possível registrar a refeição."), "Não foi possível registrar a refeição.");
});

test("toFriendlyActionError: duplicate key / constraint cru também vira o fallback", () => {
  assert.equal(
    toFriendlyActionError("duplicate key value violates unique constraint \"water_logs_pkey\"", "Não foi possível registrar a água."),
    "Não foi possível registrar a água."
  );
});

test("toFriendlyActionError: código trackly: conhecido continua traduzido normalmente", () => {
  assert.equal(
    toFriendlyActionError("trackly:plan_not_found", "Não foi possível salvar."),
    "Plano de nutrição não encontrado."
  );
});

test("toFriendlyActionError: mensagem já amigável (sem termos técnicos) passa direto", () => {
  assert.equal(
    toFriendlyActionError("Refeição não encontrada: ", "Não foi possível editar a refeição."),
    "Refeição não encontrada: "
  );
});
