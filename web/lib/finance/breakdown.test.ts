import assert from "node:assert/strict";
import { test } from "node:test";
import { groupTotals, receiptsByMonth } from "./breakdown";

test("receiptsByMonth soma por mes e preenche zeros reais", () => {
  const out = receiptsByMonth(
    [
      { paidDate: "2026-09-02", amountCents: 100 },
      { paidDate: "2026-09-20", amountCents: 50 },
      { paidDate: "2026-07-01", amountCents: 7 },
      { paidDate: null, amountCents: 999 },
    ],
    "2026-09",
    3,
  );
  assert.deepEqual(out, [
    { month: "2026-07", cents: 7 },
    { month: "2026-08", cents: 0 },
    { month: "2026-09", cents: 150 },
  ]);
});

test("groupTotals ordena por valor", () => {
  const out = groupTotals(
    [
      { amountCents: 100, p: "A" },
      { amountCents: 300, p: "B" },
      { amountCents: 50, p: "A" },
    ],
    (i) => i.p,
  );
  assert.deepEqual(out, [
    { key: "B", count: 1, cents: 300 },
    { key: "A", count: 2, cents: 150 },
  ]);
});
