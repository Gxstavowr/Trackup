import assert from "node:assert/strict";
import test from "node:test";
import {
  activeVersionAt,
  changesForWindow,
  diffNutrition,
  diffWorkout,
  evaluationWindows,
  hasAnyChange,
  type NutritionSnap,
  type PlanVersion,
  type WorkoutExerciseSnap,
  type WorkoutSnap,
} from "./evolution-plan-changes";

function ex(id: string, name: string, over: Partial<WorkoutExerciseSnap> = {}): WorkoutExerciseSnap {
  return { exerciseId: id, name, blockType: "normal", sets: 3, repsMin: 8, repsMax: 10, load: null, restSec: 60, durationSec: null, ...over };
}

const base: WorkoutSnap = {
  days: [
    { name: "Treino A", exercises: [ex("supino", "Supino reto"), ex("rosca", "Rosca direta")] },
    { name: "Treino B", exercises: [ex("esteira", "Esteira", { blockType: "cardio", sets: null, repsMin: null, repsMax: null, restSec: null, durationSec: 1200 })] },
  ],
};

test("treino: série, repetição, carga e descanso alterados", () => {
  const next: WorkoutSnap = {
    days: [
      { name: "Treino A", exercises: [ex("supino", "Supino reto", { sets: 4, repsMin: 10, repsMax: 12, load: 22.5, restSec: 90 }), ex("rosca", "Rosca direta")] },
      base.days[1],
    ],
  };
  const { training, cardio } = diffWorkout(base, next);
  assert.equal(training.length, 1);
  assert.match(training[0].text, /^Supino reto: séries 3 → 4; repetições 8–10 → 10–12; carga — → 22,5 kg; descanso 60 s → 90 s\.$/);
  assert.equal(cardio.length, 0);
});

test("treino: exercício novo, removido e dia novo", () => {
  const next: WorkoutSnap = {
    days: [
      { name: "Treino A", exercises: [ex("supino", "Supino reto"), ex("agacha", "Agachamento", { sets: 4, repsMin: 6, repsMax: 6 })] },
      base.days[1],
      { name: "Treino C", exercises: [ex("remada", "Remada")] },
    ],
  };
  const { training } = diffWorkout(base, next);
  const texts = training.map((l) => l.text);
  assert.ok(texts.includes("Novo exercício: Agachamento (4×6) em “Treino A”."));
  assert.ok(texts.includes("Exercício removido: Rosca direta (de “Treino A”)."));
  assert.ok(texts.includes("Dia “Treino C” adicionado (1 exercício)."));
  // Exercício de dia novo não repete linha própria.
  assert.ok(!texts.some((t) => t.includes("Remada")));
});

test("cardio: duração, adição e remoção ficam separados do treino", () => {
  const longer: WorkoutSnap = {
    days: [base.days[0], { name: "Treino B", exercises: [ex("esteira", "Esteira", { blockType: "cardio", durationSec: 1800, sets: null, repsMin: null, repsMax: null })] }],
  };
  const d = diffWorkout(base, longer);
  assert.deepEqual(d.training, []);
  assert.equal(d.cardio[0].text, "Esteira: duração 20 min → 30 min.");

  const none: WorkoutSnap = { days: [base.days[0], { name: "Treino B", exercises: [] }] };
  assert.match(diffWorkout(base, none).cardio[0].text, /^Cardio removido: Esteira/);
  assert.match(diffWorkout(none, base).cardio[0].text, /^Cardio adicionado: Esteira, 20 min/);
});

test("treino: mesmo exercício repetido no plano é casado por ocorrência", () => {
  const two: WorkoutSnap = { days: [{ name: "A", exercises: [ex("x", "Remada"), ex("x", "Remada")] }] };
  const one: WorkoutSnap = { days: [{ name: "A", exercises: [ex("x", "Remada")] }] };
  assert.equal(diffWorkout(two, one).training.length, 1);
  assert.equal(diffWorkout(two, two).training.length, 0);
});

const dietA: NutritionSnap = {
  targets: { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60, waterMl: 2500 },
  meals: [
    { name: "Café da manhã", time: "07:00:00", dayOfWeek: null, items: [{ key: "ovo", name: "Ovo", qty: "2 un" }, { key: "pao", name: "Pão", qty: "2 fatias" }] },
    { name: "Jantar", time: "20:00", dayOfWeek: null, items: [] },
  ],
};

test("nutrição: metas, horário, itens e refeições", () => {
  const dietB: NutritionSnap = {
    targets: { kcal: 2200, proteinG: 150, carbsG: 200, fatG: 60, waterMl: 3000 },
    meals: [
      { name: "Café da manhã", time: "08:00", dayOfWeek: null, items: [{ key: "ovo", name: "Ovo", qty: "3 un" }, { key: "fruta", name: "Banana", qty: "1 un" }] },
      { name: "Ceia", time: null, dayOfWeek: null, items: [{ key: "i", name: "Iogurte", qty: null }] },
    ],
  };
  const texts = diffNutrition(dietA, dietB).map((l) => l.text);
  assert.ok(texts.includes("Meta de calorias: 2.000 kcal → 2.200 kcal."));
  assert.ok(texts.includes("Meta de água: 2,5 L → 3 L."));
  assert.ok(texts.includes("Café da manhã: horário 07:00 → 08:00; Ovo: 2 un → 3 un; + Banana (1 un); − Pão."));
  assert.ok(texts.includes("Refeição adicionada: Ceia (1 item)."));
  assert.ok(texts.includes("Refeição removida: Jantar."));
  assert.ok(!texts.some((t) => t.includes("proteína")));
  assert.deepEqual(diffNutrition(dietA, dietA), []);
});

test("janelas: partição pelo envio das avaliações, com folga e janela pendente", () => {
  const { windows, pending } = evaluationWindows([
    { weekNumber: 4, sentAt: "2026-09-21T12:00:00Z" },
    { weekNumber: 3, sentAt: "2026-09-14T12:00:00Z" },
    { weekNumber: 5, sentAt: null },
  ]);
  assert.deepEqual(windows.map((w) => w.weekNumber), [3, 4]);
  assert.equal(windows[0].from, null);
  assert.equal(windows[1].from, windows[0].to);
  assert.equal(windows[1].to, "2026-09-21T12:30:00.000Z");
  assert.equal(pending?.from, windows[1].to);
  assert.equal(pending?.to, null);
  assert.equal(evaluationWindows([]).pending, null);
});

const w1: PlanVersion<WorkoutSnap> = { id: "w1", name: "Plano 1", publishedAt: "2026-09-01T10:00:00Z", snap: base };
const w2: PlanVersion<WorkoutSnap> = {
  id: "w2",
  name: "Plano 2",
  publishedAt: "2026-09-16T10:00:00Z",
  snap: { days: [{ name: "Treino A", exercises: [ex("supino", "Supino reto", { sets: 4 }), ex("rosca", "Rosca direta")] }, base.days[1]] },
};
const n1: PlanVersion<NutritionSnap> = { id: "n1", name: "Dieta 1", publishedAt: "2026-09-01T10:00:00Z", snap: dietA };

const { windows } = evaluationWindows([
  { weekNumber: 1, sentAt: "2026-09-10T12:00:00Z" },
  { weekNumber: 2, sentAt: "2026-09-17T12:00:00Z" },
]);

test("avaliação: primeira janela mostra plano inicial, a seguinte mostra só o saldo", () => {
  const first = changesForWindow({ workout: [w1, w2], nutrition: [n1], window: windows[0] });
  assert.equal(first.training.status, "initial");
  assert.equal(first.training.version?.name, "Plano 1");
  assert.equal(first.nutrition.status, "initial");
  assert.equal(first.cardio.status, "initial");

  const second = changesForWindow({ workout: [w1, w2], nutrition: [n1], window: windows[1] });
  assert.equal(second.training.status, "changed");
  assert.equal(second.training.lines[0].text, "Supino reto: séries 3 → 4.");
  assert.equal(second.cardio.status, "unchanged");
  assert.equal(second.nutrition.status, "none");
  assert.equal(hasAnyChange(second), true);
});

test("avaliação: cada publicação cai em exatamente uma janela", () => {
  const all = [...windows];
  const pending = evaluationWindows([
    { weekNumber: 1, sentAt: "2026-09-10T12:00:00Z" },
    { weekNumber: 2, sentAt: "2026-09-17T12:00:00Z" },
  ]).pending!;
  const late: PlanVersion<WorkoutSnap> = { ...w2, id: "w3", publishedAt: "2026-09-25T10:00:00Z" };
  for (const v of [w1, w2, late]) {
    const hits = [...all, pending].filter((w) => changesForWindow({ workout: [v], nutrition: [], window: w }).training.status !== "none");
    assert.equal(hits.length, 1, v.id);
  }
});

test("avaliação: várias publicações na janela viram um saldo único; sem plano, nada", () => {
  const w2b: PlanVersion<WorkoutSnap> = { ...w2, id: "w2b", publishedAt: "2026-09-17T09:00:00Z", snap: w1.snap };
  const r = changesForWindow({ workout: [w1, w2, w2b], nutrition: [], window: windows[1] });
  assert.equal(r.training.publishCount, 2);
  assert.equal(r.training.status, "unchanged");
  const empty = changesForWindow({ workout: [], nutrition: [], window: windows[0] });
  assert.equal(hasAnyChange(empty), false);
});

test("cardio inicial só aparece se o primeiro treino tem cardio", () => {
  const noCardio: PlanVersion<WorkoutSnap> = { ...w1, snap: { days: [base.days[0]] } };
  const r = changesForWindow({ workout: [noCardio], nutrition: [], window: windows[0] });
  assert.equal(r.training.status, "initial");
  assert.equal(r.cardio.status, "none");
});

test("versão vigente num instante", () => {
  assert.equal(activeVersionAt([w1, w2], "2026-09-10T00:00:00Z")?.id, "w1");
  assert.equal(activeVersionAt([w1, w2], null)?.id, "w2");
  assert.equal(activeVersionAt([w1, w2], "2026-08-01T00:00:00Z"), null);
});
