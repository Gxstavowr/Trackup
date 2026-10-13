import assert from "node:assert/strict";
import test from "node:test";
import {
  copyExerciseDetails,
  effectiveSubstituteIds,
  formatSetTargets,
  hasSetVariation,
  normalizeSetRows,
  normalizeSubstituteIds,
  parseRepsText,
  repsText,
  resolveSetTarget,
  variedFields,
  type SetPrescription,
  type UniformPrescriptionLike,
} from "./workout-prescription";
import { restSecondsForRound } from "./workout-session";
import { formatPrescription } from "./workout-format";

/**
 * Testes da prescrição por série e dos substitutos (migration 0020). Rodar (pasta `web/`):
 * `npx tsx --test lib/workout-prescription.test.ts`
 */

function row(set_number: number, patch: Partial<SetPrescription> = {}): SetPrescription {
  return { set_number, reps_min: null, reps_max: null, load: null, rir: null, rest_sec: null, ...patch };
}

function we(patch: Partial<UniformPrescriptionLike> = {}): UniformPrescriptionLike {
  return {
    sets: 3,
    reps: 10,
    reps_min: null,
    reps_max: null,
    suggested_load: 20,
    rir: 2,
    rest_sec: 90,
    set_prescriptions: [],
    ...patch,
  };
}

test("resolveSetTarget: sem overrides, toda série usa o uniforme (compatível com o antigo)", () => {
  const ex = we();
  for (const n of [1, 2, 3]) {
    assert.deepEqual(resolveSetTarget(ex, n), { setNumber: n, repsMin: 10, repsMax: 10, load: 20, rir: 2, restSec: 90 });
  }
  assert.equal(hasSetVariation(ex), false);
  assert.deepEqual(formatSetTargets(ex), []);
});

test("resolveSetTarget: faixa uniforme vira min/max; um lado só vira fixo", () => {
  assert.deepEqual(
    [resolveSetTarget(we({ reps: null, reps_min: 8, reps_max: 12 }), 1).repsMin, resolveSetTarget(we({ reps: null, reps_min: 8, reps_max: 12 }), 1).repsMax],
    [8, 12]
  );
  const t = resolveSetTarget(we({ reps: null, reps_min: 6, reps_max: null }), 2);
  assert.equal(t.repsMin, 6);
  assert.equal(t.repsMax, 6);
});

test("resolveSetTarget: pirâmide 12×20 / 10×22 / 8×24 com descanso só na última", () => {
  const ex = we({
    set_prescriptions: [
      row(1, { reps_min: 12, reps_max: 12, load: 20 }),
      row(2, { reps_min: 10, reps_max: 10, load: 22 }),
      row(3, { reps_min: 8, reps_max: 8, load: 24, rest_sec: 150 }),
    ],
  });
  assert.equal(resolveSetTarget(ex, 1).load, 20);
  assert.equal(resolveSetTarget(ex, 2).repsMin, 10);
  assert.equal(resolveSetTarget(ex, 3).load, 24);
  // Campo nulo no override cai no uniforme.
  assert.equal(resolveSetTarget(ex, 1).restSec, 90);
  assert.equal(resolveSetTarget(ex, 3).restSec, 150);
  assert.equal(resolveSetTarget(ex, 2).rir, 2);
  assert.equal(hasSetVariation(ex), true);
  assert.deepEqual(variedFields(ex), { reps: true, load: true, rir: false, rest: true });
  assert.deepEqual(formatSetTargets(ex), ["1ª 12 × 20 kg · 90 s", "2ª 10 × 22 kg · 90 s", "3ª 8 × 24 kg · 150 s"]);
});

test("override de reps com um lado só é reps fixas; override só de carga mantém reps uniformes", () => {
  const ex = we({ set_prescriptions: [row(1, { reps_max: 15 }), row(2, { load: 30 })] });
  assert.deepEqual([resolveSetTarget(ex, 1).repsMin, resolveSetTarget(ex, 1).repsMax], [15, 15]);
  assert.deepEqual([resolveSetTarget(ex, 2).repsMin, resolveSetTarget(ex, 2).load], [10, 30]);
});

test("linhas além do número de séries (ou vazias) não contam como variação", () => {
  assert.equal(hasSetVariation(we({ sets: 2, set_prescriptions: [row(3, { load: 50 })] })), false);
  assert.equal(hasSetVariation(we({ set_prescriptions: [row(1)] })), false);
  assert.equal(hasSetVariation(we({ sets: null, set_prescriptions: [row(1, { load: 50 })] })), false);
});

test("formatPrescription esconde o campo que varia e marca 'séries variadas'", () => {
  const base = { tempo: null, duration_sec: null };
  const uniform = formatPrescription({ ...we(), ...base });
  assert.deepEqual(uniform, ["3 × 10", "20 kg", "RIR 2", "descanso 90 s"]);
  const varied = formatPrescription({
    ...we({ set_prescriptions: [row(1, { reps_min: 12, reps_max: 12, load: 20 })] }),
    ...base,
  });
  assert.deepEqual(varied, ["3 séries variadas", "RIR 2", "descanso 90 s"]);
  const loadOnly = formatPrescription({ ...we({ set_prescriptions: [row(2, { load: 25 })] }), ...base });
  assert.deepEqual(loadOnly, ["3 × 10", "RIR 2", "descanso 90 s"]);
});

test("prévia (template/aluno): resumo não repete o uniforme que as linhas por série contradizem", () => {
  // Caso do bug da prévia de templates: 3×8 · descanso 90s acima de séries com reps/kg/descanso próprios.
  const ex = {
    ...we({
      reps: 8,
      set_prescriptions: [
        row(1, { reps_min: 12, reps_max: 12, load: 20, rest_sec: 60 }),
        row(2, { reps_min: 10, reps_max: 10, load: 22, rest_sec: 90 }),
        row(3, { reps_min: 8, reps_max: 8, load: 24, rest_sec: 120 }),
      ],
    }),
    tempo: null,
    duration_sec: null,
  };
  const summary = formatPrescription(ex);
  assert.deepEqual(summary, ["3 séries variadas", "RIR 2"]);
  assert.ok(!summary.some((p) => p.includes("×") || p.startsWith("descanso") || p.endsWith("kg")));
  assert.deepEqual(formatSetTargets(ex), ["1ª 12 × 20 kg · 60 s", "2ª 10 × 22 kg · 90 s", "3ª 8 × 24 kg · 120 s"]);
});

test("restSecondsForRound: solto usa o descanso da série; grupo usa o maior da rodada", () => {
  const a = we({ set_prescriptions: [row(1, { rest_sec: 60 }), row(2, { rest_sec: 120 })] });
  const b = we({ rest_sec: 75 });
  assert.equal(restSecondsForRound([a], 1), 60);
  assert.equal(restSecondsForRound([a], 2), 120);
  assert.equal(restSecondsForRound([a], 3), 90); // sem override -> uniforme
  assert.equal(restSecondsForRound([a, b], 1), 75);
  assert.equal(restSecondsForRound([a, b], 2), 120);
  assert.equal(restSecondsForRound([we({ rest_sec: null })], 1), null);
});

test("parseRepsText / repsText", () => {
  assert.deepEqual(parseRepsText(""), { min: null, max: null });
  assert.deepEqual(parseRepsText(" 12 "), { min: 12, max: 12 });
  assert.deepEqual(parseRepsText("8-10"), { min: 8, max: 10 });
  assert.deepEqual(parseRepsText("8–10"), { min: 8, max: 10 });
  assert.deepEqual(parseRepsText("8 a 10"), { min: 8, max: 10 });
  assert.equal(parseRepsText("10-8"), null);
  assert.equal(parseRepsText("doze"), null);
  assert.equal(parseRepsText("-3"), null);
  assert.equal(repsText(8, 10), "8-10");
  assert.equal(repsText(12, 12), "12");
  assert.equal(repsText(null, null), "");
});

test("normalizeSetRows: descarta vazias/fora do total/repetidas e ordena", () => {
  const result = normalizeSetRows(
    [row(3, { load: 24 }), row(1, { reps_min: 12, reps_max: 12 }), row(2), row(4, { load: 30 }), row(1, { load: 99 })],
    3
  );
  assert.ok("rows" in result);
  assert.deepEqual(
    result.rows.map((r) => [r.set_number, r.reps_min, r.load]),
    [
      [1, 12, null],
      [3, null, 24],
    ]
  );
  const none = normalizeSetRows([row(1, { load: 10 })], null);
  assert.ok("rows" in none);
  assert.equal(none.rows.length, 0);
});

test("normalizeSetRows: rejeita valores inválidos com mensagem da série", () => {
  assert.deepEqual(normalizeSetRows([row(2, { reps_min: 10, reps_max: 8 })], 3), {
    error: "Série 2: a repetição máxima não pode ser menor que a mínima.",
  });
  assert.deepEqual(normalizeSetRows([row(1, { rir: 11 })], 3), { error: "Série 1: RIR deve estar entre 0 e 10." });
  assert.deepEqual(normalizeSetRows([row(1, { load: -1 })], 3), { error: "Série 1: carga inválida." });
  assert.deepEqual(normalizeSetRows([row(1, { rest_sec: 4000 })], 3), {
    error: "Série 1: descanso deve estar entre 0 e 3600 s.",
  });
});

test("normalizeSubstituteIds: ordem preservada, sem vazio, repetido ou o próprio exercício", () => {
  assert.deepEqual(normalizeSubstituteIds(["b", "", "main", "a", "b", null, "c"], "main"), ["b", "a", "c"]);
  assert.deepEqual(normalizeSubstituteIds([], "main"), []);
});

test("effectiveSubstituteIds: tabela nova em ordem; vazia cai na coluna antiga", () => {
  assert.deepEqual(
    effectiveSubstituteIds(
      [
        { exercise_id: "y", sort_order: 1 },
        { exercise_id: "x", sort_order: 0 },
      ],
      "legacy"
    ),
    ["x", "y"]
  );
  assert.deepEqual(effectiveSubstituteIds([], "legacy"), ["legacy"]);
  assert.deepEqual(effectiveSubstituteIds([], null), []);
});

test("copyExerciseDetails: copia só a prescrição (sem ids de linha) e substitutos em ordem", () => {
  const sets = [
    { ...row(1, { reps_min: 12, reps_max: 12, load: 20 }), id: "s1", workout_exercise_id: "we1" },
    { ...row(2, { load: 22, rest_sec: 120 }), id: "s2", workout_exercise_id: "we1" },
  ];
  const copied = copyExerciseDetails(sets, [
    { exercise_id: "b", sort_order: 1 },
    { exercise_id: "a", sort_order: 0 },
  ]);
  assert.deepEqual(copied, {
    sets: [row(1, { reps_min: 12, reps_max: 12, load: 20 }), row(2, { load: 22, rest_sec: 120 })],
    substituteIds: ["a", "b"],
  });
  assert.ok(!("id" in copied.sets[0]));
});
