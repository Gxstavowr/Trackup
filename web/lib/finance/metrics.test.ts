import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSubscriptions, type SubscriptionFact } from "./metrics";

const sub = (over: Partial<SubscriptionFact>): SubscriptionFact => ({
  price_cents: 20000,
  period: "monthly",
  status: "active",
  created_at: "2026-09-01T12:00:00Z",
  cancelled_at: null,
  ...over,
});

test("cancelamentos contam no mês do cancelamento (fuso de São Paulo) e no total", () => {
  const subs = [
    sub({}),
    sub({ status: "cancelled", cancelled_at: "2026-10-05T15:00:00Z" }),
    // 01/11 00:30 UTC = 31/10 21:30 em SP -> outubro
    sub({ status: "cancelled", cancelled_at: "2026-11-01T00:30:00Z" }),
    sub({ status: "cancelled", cancelled_at: "2026-09-20T12:00:00Z" }),
    // cancelada antes da migration 0016: só no total
    sub({ status: "cancelled", cancelled_at: null }),
  ];
  const oct = summarizeSubscriptions(subs, "2026-10");
  assert.equal(oct.cancelledInMonth, 2);
  assert.equal(oct.cancelledTotal, 4);
  assert.equal(summarizeSubscriptions(subs, "2026-09").cancelledInMonth, 1);
  assert.equal(summarizeSubscriptions(subs, "2026-11").cancelledInMonth, 0);
  // cancelada não entra no MRR nem nos ativos
  assert.equal(oct.activeCount, 1);
  assert.equal(oct.mrrCents, 20000);
});
