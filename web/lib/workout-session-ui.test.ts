import assert from "node:assert/strict";
import test from "node:test";
import { setKey } from "./workout-session";
import { cardioSummary, completionFlash, exerciseSegments, formatCardioDuration } from "./workout-session-ui";

/** `npx tsx --test lib/workout-session-ui.test.ts` */

const ex = (id: string, sets: number | null = 2, block_type: "normal" | "cardio" | "warmup" = "normal") => ({
  id,
  sets,
  block_type,
  name: `Ex ${id}`,
});
const keys = (...k: [string, number][]) => new Set(k.map(([id, n]) => setKey(id, n)));

test("exerciseSegments: estados done/current/partial/pending e pct", () => {
  const flat = [ex("a"), ex("b"), ex("c"), ex("d", null, "cardio")];
  const segs = exerciseSegments(flat, keys(["a", 1], ["a", 2], ["c", 1]), 1);
  assert.deepEqual(
    segs.map((s) => s.state),
    ["done", "current", "partial", "pending"]
  );
  assert.equal(segs[2].pct, 50);
  assert.equal(segs[3].total, 1);
});

test("exerciseSegments: exercício em foco já concluído segue done", () => {
  const segs = exerciseSegments([ex("a", 1)], keys(["a", 1]), 0);
  assert.equal(segs[0].state, "done");
  assert.equal(segs[0].pct, 100);
});

test("cardioSummary: sem cardio -> null", () => {
  assert.equal(cardioSummary([{ block_type: "normal", duration_sec: null }]), null);
});

test("cardioSummary: duração só quando todos os blocos informam", () => {
  const one = cardioSummary([{ block_type: "cardio", duration_sec: 1200 }]);
  assert.equal(one?.label, "Cardio · 20 min");
  const mixed = cardioSummary([
    { block_type: "cardio", duration_sec: 600 },
    { block_type: "cardio", duration_sec: null },
  ]);
  assert.equal(mixed?.totalSec, null);
  assert.equal(mixed?.label, "Cardio (2 blocos)");
  const two = cardioSummary([
    { block_type: "cardio", duration_sec: 600 },
    { block_type: "cardio", duration_sec: 300 },
  ]);
  assert.equal(two?.label, "Cardio (2 blocos) · 15 min");
});

test("formatCardioDuration", () => {
  assert.equal(formatCardioDuration(45), "45 s");
  assert.equal(formatCardioDuration(3900), "1 h 05 min");
  assert.equal(formatCardioDuration(3600), "1 h");
});

test("completionFlash: série comum, exercício concluído, treino completo e re-edição", () => {
  const flat = [ex("a", 2), ex("b", 1)];
  const before = keys();
  const s1 = keys(["a", 1]);
  assert.deepEqual(completionFlash({ flat, idx: 0, setNumber: 1, doneBefore: before, doneAfter: s1, nextIdx: 0 }), {
    kind: "set",
    text: "Série 1 de 2 registrada",
  });
  const s2 = keys(["a", 1], ["a", 2]);
  assert.deepEqual(completionFlash({ flat, idx: 0, setNumber: 2, doneBefore: s1, doneAfter: s2, nextIdx: 1 }), {
    kind: "exercise",
    text: "Ex a concluído · Próximo: Ex b",
  });
  const s3 = keys(["a", 1], ["a", 2], ["b", 1]);
  assert.equal(completionFlash({ flat, idx: 1, setNumber: 1, doneBefore: s2, doneAfter: s3, nextIdx: null })?.kind, "workout");
  assert.equal(completionFlash({ flat, idx: 0, setNumber: 1, doneBefore: s3, doneAfter: s3, nextIdx: null }), null);
});
