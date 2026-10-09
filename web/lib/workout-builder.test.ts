import assert from "node:assert/strict";
import test from "node:test";
import {
  blockTypeLabel,
  distinctFilterOptions,
  filterExercises,
  groupDayExercises,
  groupKindLabel,
  idsInOrder,
  insertIdAfter,
  moveItem,
  toFriendlyActionError,
  translateTracklyError,
  validateWorkoutExerciseInput,
  type ExerciseLite,
} from "./workout-builder";

/**
 * Testes das funções puras do construtor de treino (item 18). Rodar (pasta `web/`):
 * `npx tsx --test lib/workout-builder.test.ts`
 */

function exercise(over: Partial<ExerciseLite> & { id: string; name: string }): ExerciseLite {
  return {
    category: "Peito",
    muscle_group: null,
    equipment: null,
    is_custom: true,
    is_archived: false,
    ...over,
  };
}

test("filterExercises: busca por nome ignora acento e maiúscula", () => {
  const list = [
    exercise({ id: "1", name: "Supino reto" }),
    exercise({ id: "2", name: "Agachamento" }),
  ];
  const result = filterExercises(list, { search: "SUPINO" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});

test("filterExercises: filtra por categoria/grupo muscular/equipamento juntos", () => {
  const list = [
    exercise({ id: "1", name: "A", category: "Peito", muscle_group: "peitoral", equipment: "barra" }),
    exercise({ id: "2", name: "B", category: "Peito", muscle_group: "peitoral", equipment: "halteres" }),
    exercise({ id: "3", name: "C", category: "Costas", muscle_group: "dorsal", equipment: "barra" }),
  ];
  const result = filterExercises(list, { category: "Peito", equipment: "barra" });
  assert.deepEqual(result.map((e) => e.id), ["1"]);
});

test("filterExercises: esconde arquivado por padrão, mostra com includeArchived", () => {
  const list = [
    exercise({ id: "1", name: "Ativo" }),
    exercise({ id: "2", name: "Arquivado", is_archived: true }),
  ];
  assert.deepEqual(filterExercises(list, {}).map((e) => e.id), ["1"]);
  assert.deepEqual(
    filterExercises(list, { includeArchived: true }).map((e) => e.id),
    ["1", "2"]
  );
});

test("distinctFilterOptions: valores distintos, ordenados, sem nulos", () => {
  const list = [
    exercise({ id: "1", name: "A", category: "Pernas", muscle_group: "quadríceps", equipment: "barra" }),
    exercise({ id: "2", name: "B", category: "Costas", muscle_group: null, equipment: "barra" }),
    exercise({ id: "3", name: "C", category: "Pernas", muscle_group: "posterior", equipment: null }),
  ];
  const options = distinctFilterOptions(list);
  assert.deepEqual(options.categories, ["Costas", "Pernas"]);
  assert.deepEqual(options.muscleGroups, ["posterior", "quadríceps"]);
  assert.deepEqual(options.equipment, ["barra"]);
});

test("groupDayExercises: agrupa itens consecutivos com mesmo group_key em um bloco", () => {
  const items = [
    { id: "w1", sort_order: 0, block_type: "warmup" as const, group_kind: null, group_key: null },
    { id: "s1", sort_order: 1, block_type: "normal" as const, group_kind: "superset" as const, group_key: "A" },
    { id: "s2", sort_order: 2, block_type: "normal" as const, group_kind: "superset" as const, group_key: "A" },
    { id: "n1", sort_order: 3, block_type: "normal" as const, group_kind: null, group_key: null },
  ];
  const blocks = groupDayExercises(items);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].kind, "single");
  assert.equal(blocks[1].kind, "group");
  if (blocks[1].kind === "group") {
    assert.equal(blocks[1].groupKey, "A");
    assert.deepEqual(blocks[1].items.map((i) => i.id), ["s1", "s2"]);
  }
  assert.equal(blocks[2].kind, "single");
});

test("groupDayExercises: mesmo group_key NÃO consecutivo vira dois blocos (grupo é adjacência)", () => {
  const items = [
    { id: "s1", sort_order: 0, block_type: "normal" as const, group_kind: "circuit" as const, group_key: "A" },
    { id: "n1", sort_order: 1, block_type: "normal" as const, group_kind: null, group_key: null },
    { id: "s2", sort_order: 2, block_type: "normal" as const, group_kind: "circuit" as const, group_key: "A" },
  ];
  const blocks = groupDayExercises(items);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].kind, "group");
  assert.equal(blocks[2].kind, "group");
});

test("blockTypeLabel / groupKindLabel", () => {
  assert.equal(blockTypeLabel("warmup"), "Aquecimento");
  assert.equal(blockTypeLabel("cardio"), "Cardio");
  assert.equal(blockTypeLabel("normal"), "Normal");
  assert.equal(groupKindLabel("superset"), "Superset");
  assert.equal(groupKindLabel("circuit"), "Circuito");
  assert.equal(groupKindLabel(null), null);
});

test("validateWorkoutExerciseInput: faixa de reps invertida falha", () => {
  const error = validateWorkoutExerciseInput({
    exerciseId: "ex1",
    blockType: "normal",
    repsMin: 12,
    repsMax: 8,
  });
  assert.ok(error && /máxima/.test(error));
});

test("validateWorkoutExerciseInput: grupo precisa de tipo + letra juntos", () => {
  assert.ok(
    validateWorkoutExerciseInput({ exerciseId: "ex1", blockType: "normal", groupKind: "superset" })
  );
  assert.ok(
    validateWorkoutExerciseInput({ exerciseId: "ex1", blockType: "normal", groupKey: "A" })
  );
  assert.equal(
    validateWorkoutExerciseInput({
      exerciseId: "ex1",
      blockType: "normal",
      groupKind: "superset",
      groupKey: "A",
    }),
    null
  );
});

test("validateWorkoutExerciseInput: cardio exige duração ou séries", () => {
  assert.ok(validateWorkoutExerciseInput({ exerciseId: "ex1", blockType: "cardio" }));
  assert.equal(
    validateWorkoutExerciseInput({ exerciseId: "ex1", blockType: "cardio", durationSec: 600 }),
    null
  );
});

test("validateWorkoutExerciseInput: substituto não pode ser o próprio exercício", () => {
  const error = validateWorkoutExerciseInput({
    exerciseId: "ex1",
    blockType: "normal",
    substituteExerciseId: "ex1",
  });
  assert.ok(error && /substituto/.test(error));
});

test("validateWorkoutExerciseInput: prescrição simples válida", () => {
  const error = validateWorkoutExerciseInput({
    exerciseId: "ex1",
    blockType: "normal",
    sets: 3,
    reps: 10,
    rir: 2,
    restSec: 60,
  });
  assert.equal(error, null);
});

test("moveItem: troca com vizinho, não sai dos limites", () => {
  const items = ["a", "b", "c"];
  assert.deepEqual(moveItem(items, 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(items, 2, 1), items); // já é o último, mesma referência
  assert.equal(moveItem(items, 2, 1), items);
  assert.deepEqual(moveItem(items, 0, -1), items);
});

test("idsInOrder / insertIdAfter", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(idsInOrder(items), ["a", "b", "c"]);
  assert.deepEqual(insertIdAfter(["a", "b", "c"], "a", "new"), ["a", "new", "b", "c"]);
  assert.deepEqual(insertIdAfter(["a", "b", "c"], "c", "new"), ["a", "b", "c", "new"]);
  // afterId inexistente: cai no fim, sem perder itens
  assert.deepEqual(insertIdAfter(["a", "b"], "zzz", "new"), ["a", "b", "new"]);
});

test("translateTracklyError: traduz código conhecido, preserva desconhecido", () => {
  assert.equal(
    translateTracklyError("new row violates trackly:draft_exists constraint"),
    "Este aluno já tem um rascunho em andamento — publique-o ou descarte antes de criar outro."
  );
  assert.equal(translateTracklyError("connection refused"), "connection refused");
});

// ----------------------------------------------------------------------------
// toFriendlyActionError — item 25/37: nunca vazar texto cru de RLS/constraint pro usuário
// ----------------------------------------------------------------------------

test("toFriendlyActionError: clientId forjado esbarrando em RLS vira mensagem amigável", () => {
  const raw =
    'new row violates row-level security policy for table "workout_sessions"';
  assert.equal(toFriendlyActionError(raw, "Não foi possível iniciar o treino."), "Não foi possível iniciar o treino.");
});

test("toFriendlyActionError: duplicate key / constraint cru também vira o fallback", () => {
  assert.equal(
    toFriendlyActionError("duplicate key value violates unique constraint \"workout_logs_pkey\"", "Não foi possível registrar a série."),
    "Não foi possível registrar a série."
  );
});

test("toFriendlyActionError: código trackly: conhecido continua traduzido normalmente", () => {
  assert.equal(
    toFriendlyActionError("trackly:draft_exists", "Não foi possível criar o rascunho."),
    "Este aluno já tem um rascunho em andamento — publique-o ou descarte antes de criar outro."
  );
});

test("toFriendlyActionError: mensagem já amigável (sem termos técnicos) passa direto", () => {
  assert.equal(
    toFriendlyActionError("Dia de treino não encontrado: ", "Não foi possível editar o dia de treino."),
    "Dia de treino não encontrado: "
  );
});
