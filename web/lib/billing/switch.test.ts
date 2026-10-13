import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelSettled,
  deriveCurrentMethod,
  normalizeBillingMethod,
  otherMethod,
  parseCancelResponse,
  planSwitchTiming,
  shouldCancelOldSubscription,
  SWITCH_WINDOW_DAYS,
} from "./switch";
import { appliesToCurrentSubscription } from "./state";

const DAY = 24 * 60 * 60 * 1000;
const DUE = new Date("2026-11-10T12:00:00.000Z");
const at = (daysBeforeDue: number) => new Date(DUE.getTime() - daysBeforeDue * DAY);

// ---------------------------------------------------------------------------------------------
// Forma de pagamento atual
// ---------------------------------------------------------------------------------------------

test("billing_method da SyncPay -> forma do Trackly", () => {
  assert.equal(normalizeBillingMethod("pix_automatico"), "pix_automatico");
  assert.equal(normalizeBillingMethod("credit_card"), "credit_card");
  assert.equal(normalizeBillingMethod("qr_code"), null);
  assert.equal(normalizeBillingMethod(undefined), null);
  assert.equal(otherMethod("pix_automatico"), "credit_card");
  assert.equal(otherMethod("credit_card"), "pix_automatico");
});

test("forma atual: enroll de Pix do Trackly > billing_method do webhook > plan_token > cartão", () => {
  assert.equal(deriveCurrentMethod({ token: null, events: [], pixPlanToken: "p" }), null);
  assert.equal(
    deriveCurrentMethod({ token: "t", events: [{ event: "trackly_pix_enroll", payload: {} }], pixPlanToken: null }),
    "pix_automatico"
  );
  assert.equal(
    deriveCurrentMethod({
      token: "t",
      events: [{ event: "assinatura_ativada", payload: { plan: { billing_method: "credit_card" } } }],
      pixPlanToken: null,
    }),
    "credit_card"
  );
  assert.equal(
    deriveCurrentMethod({
      token: "t",
      events: [{ event: "cobranca_paga", payload: { plan: { billing_method: "pix_automatico" } } }],
      pixPlanToken: null,
    }),
    "pix_automatico"
  );
  assert.equal(
    deriveCurrentMethod({ token: "t", events: [{ event: "cobranca_paga", payload: { plan_token: "pix-plan" } }], pixPlanToken: "pix-plan" }),
    "pix_automatico"
  );
  // Sem pista nenhuma: o único outro caminho é o link hospedado (só cartão).
  assert.equal(deriveCurrentMethod({ token: "t", events: [{ event: "cobranca_paga", payload: {} }], pixPlanToken: "pix-plan" }), "credit_card");
});

// ---------------------------------------------------------------------------------------------
// Datas / janela da troca
// ---------------------------------------------------------------------------------------------

test("em atraso: troca na hora, nada a alinhar; próxima cobrança = hoje + 30", () => {
  const now = new Date("2026-10-13T15:00:00.000Z");
  const t = planSwitchTiming({ status: "overdue", nextChargeAt: DUE.toISOString(), now });
  assert.deepEqual(t, {
    kind: "now",
    reason: "overdue",
    currentCycleEndsAt: null,
    lostDays: 0,
    nextChargeAfterSwitch: new Date(now.getTime() + 30 * DAY).toISOString(),
  });
});

test("sem assinatura paga (none/pendente/suspensa/cancelada): troca indisponível", () => {
  for (const status of ["none", "pending_first_payment", "suspended", "cancelled", null] as const) {
    assert.deepEqual(planSwitchTiming({ status, nextChargeAt: DUE.toISOString(), now: at(5) }), { kind: "unavailable" });
  }
});

test("em dia e longe do vencimento: a troca só abre SWITCH_WINDOW_DAYS antes", () => {
  const t = planSwitchTiming({ status: "active", nextChargeAt: DUE.toISOString(), now: at(20) });
  assert.deepEqual(t, {
    kind: "too_early",
    opensAt: at(SWITCH_WINDOW_DAYS).toISOString(),
    closesAt: at(3).toISOString(),
    currentCycleEndsAt: DUE.toISOString(),
  });
});

test("dentro da janela: troca agora e mostra exatamente quantos dias do ciclo sobram", () => {
  const now = at(5);
  const t = planSwitchTiming({ status: "active", nextChargeAt: DUE.toISOString(), now });
  assert.deepEqual(t, {
    kind: "now",
    reason: "renewal_window",
    currentCycleEndsAt: DUE.toISOString(),
    lostDays: 5,
    nextChargeAfterSwitch: new Date(now.getTime() + 30 * DAY).toISOString(),
  });
  // Frações de dia arredondam pra cima (o coach vê o pior caso).
  const partial = planSwitchTiming({ status: "active", nextChargeAt: DUE.toISOString(), now: new Date(at(4).getTime() - 3600_000) });
  assert.equal(partial.kind === "now" && partial.lostDays, 5);
  // Abertura exata da janela.
  assert.equal(planSwitchTiming({ status: "active", nextChargeAt: DUE.toISOString(), now: at(SWITCH_WINDOW_DAYS) }).kind, "now");
});

test("cobrança do próximo ciclo já gerada (billing_advance_days) ou pendente: espera", () => {
  assert.deepEqual(planSwitchTiming({ status: "active", nextChargeAt: DUE.toISOString(), now: at(3) }), {
    kind: "charge_in_progress",
    currentCycleEndsAt: DUE.toISOString(),
  });
  assert.equal(planSwitchTiming({ status: "active", nextChargeAt: DUE.toISOString(), now: at(-1) }).kind, "charge_in_progress");
  assert.equal(
    planSwitchTiming({ status: "active", nextChargeAt: DUE.toISOString(), now: at(5), pendingChargeExists: true }).kind,
    "charge_in_progress"
  );
});

test("usa billing_advance_days e periodicity_days do plano quando a SyncPay informa", () => {
  const now = at(1);
  const t = planSwitchTiming({ status: "active", nextChargeAt: DUE.toISOString(), now, advanceDays: 0, periodicityDays: 31 });
  assert.equal(t.kind, "now");
  assert.equal(t.kind === "now" && t.lostDays, 1);
  assert.equal(t.kind === "now" && t.nextChargeAfterSwitch, new Date(now.getTime() + 31 * DAY).toISOString());
  // Janela nunca fica vazia: no mínimo 1 dia antes da geração da cobrança.
  const narrow = planSwitchTiming({ status: "active", nextChargeAt: DUE.toISOString(), now: at(10.5), advanceDays: 10, windowDays: 2 });
  assert.equal(narrow.kind, "now");
});

test("vencimento desconhecido: deixa trocar, mas sem prometer dias", () => {
  const t = planSwitchTiming({ status: "active", nextChargeAt: null, now: at(5) });
  assert.equal(t.kind, "now");
  assert.equal(t.kind === "now" && t.reason, "unknown_date");
  assert.equal(t.kind === "now" && t.lostDays, null);
  assert.equal(planSwitchTiming({ status: "active", nextChargeAt: "lixo", now: at(5) }).kind, "now");
});

// ---------------------------------------------------------------------------------------------
// Cancelar a antiga só depois da nova ativa
// ---------------------------------------------------------------------------------------------

test("cancela a antiga só com pedido de troca, nova diferente e CONFIRMADA ativa, uma vez", () => {
  const base = { switchFromToken: "old", oldToken: "old", newToken: "new", newStatusVerified: "active" as const, alreadyCancelled: false };
  assert.equal(shouldCancelOldSubscription(base), true);
  assert.equal(shouldCancelOldSubscription({ ...base, newStatusVerified: "pending_first_payment" }), false);
  assert.equal(shouldCancelOldSubscription({ ...base, newStatusVerified: "overdue" }), false);
  assert.equal(shouldCancelOldSubscription({ ...base, newStatusVerified: null }), false);
  assert.equal(shouldCancelOldSubscription({ ...base, alreadyCancelled: true }), false);
  assert.equal(shouldCancelOldSubscription({ ...base, switchFromToken: null }), false);
  assert.equal(shouldCancelOldSubscription({ ...base, switchFromToken: "other" }), false);
  // Nunca a própria assinatura nova/atual.
  assert.equal(shouldCancelOldSubscription({ ...base, newToken: "old" }), false);
  assert.equal(shouldCancelOldSubscription({ ...base, oldToken: null }), false);
});

test("resposta do cancelamento: 200/404 resolvem; 422/5xx tentam de novo (salvo se já está cancelada)", () => {
  assert.equal(parseCancelResponse(200), "cancelled");
  assert.equal(parseCancelResponse(404), "not_found");
  assert.equal(parseCancelResponse(422), "rejected");
  assert.equal(parseCancelResponse(500), "error");
  assert.equal(parseCancelResponse(0), "error");
  assert.equal(cancelSettled("cancelled", null), true);
  assert.equal(cancelSettled("not_found", null), true);
  assert.equal(cancelSettled("rejected", "cancelled"), true);
  assert.equal(cancelSettled("rejected", "active"), false);
  assert.equal(cancelSettled("error", null), false);
});

test("assinatura da qual o coach trocou nunca volta a ser a atual (nem com 'pago' atrasado)", () => {
  assert.equal(appliesToCurrentSubscription("new", "old", "active", true), false);
  assert.equal(appliesToCurrentSubscription("new", "old", "cancelled", true), false);
  // Sem pedido de troca: regra de sempre (só entra se deixar a conta ativa).
  assert.equal(appliesToCurrentSubscription("new", "old", "active", false), true);
  // A própria assinatura atual sempre aplica.
  assert.equal(appliesToCurrentSubscription("old", "old", "overdue", true), true);
});
