import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBillingEvent,
  daysUntilSuspension,
  isBillingBlocked,
  normalizeDocument,
  normalizeEmail,
  resolveAccount,
  safeCheckoutUrl,
  type BillingSnapshot,
} from "./state";
import { secretMatches } from "./secret";

const T0 = new Date("2026-10-10T12:00:00Z");
const T1 = new Date("2026-10-11T12:00:00Z");
const snap = (status: BillingSnapshot["status"], paymentFailedAt: string | null = null, confirmationPending = false): BillingSnapshot => ({
  status,
  paymentFailedAt,
  confirmationPending,
});

test("cobranca_falhou: active -> overdue e marca a primeira falha", () => {
  assert.deepEqual(applyBillingEvent(snap("active"), "cobranca_falhou", T0), snap("overdue", T0.toISOString()));
});

test("falhas seguintes não mexem na data da primeira falha", () => {
  const prev = snap("overdue", T0.toISOString());
  assert.deepEqual(applyBillingEvent(prev, "cobranca_retentativa", T1), prev);
  assert.deepEqual(applyBillingEvent(prev, "assinatura_em_atraso", T1), prev);
});

test("retentativa/falha não desbloqueia suspenso nem cancelado", () => {
  assert.equal(applyBillingEvent(snap("suspended", T0.toISOString()), "cobranca_retentativa", T1)?.status, "suspended");
  assert.equal(applyBillingEvent(snap("cancelled"), "cobranca_falhou", T1)?.status, "cancelled");
});

test("assinatura_suspensa -> suspended, mantém a data da falha", () => {
  assert.deepEqual(
    applyBillingEvent(snap("overdue", T0.toISOString()), "assinatura_suspensa", T1),
    snap("suspended", T0.toISOString())
  );
});

test("pagamento depois de atraso/suspensão: active, limpa falha, pede confirmação", () => {
  for (const ev of ["cobranca_paga", "assinatura_ativada", "assinatura_reativada", "assinatura_renovada"]) {
    assert.deepEqual(applyBillingEvent(snap("suspended", T0.toISOString()), ev, T1), snap("active", null, true));
    assert.deepEqual(applyBillingEvent(snap("overdue", T0.toISOString()), ev, T1), snap("active", null, true));
  }
  assert.deepEqual(applyBillingEvent(snap("pending_first_payment"), "cobranca_paga", T1), snap("active", null, true));
});

test("renovação normal (já ativa ou sem linha) não mostra 'Pagamento confirmado'", () => {
  assert.deepEqual(applyBillingEvent(snap("active"), "assinatura_renovada", T1), snap("active"));
  assert.deepEqual(applyBillingEvent(null, "cobranca_paga", T1), snap("active"));
});

test("confirmação pendente sobrevive a outra renovação e cai se voltar a falhar", () => {
  assert.equal(applyBillingEvent(snap("active", null, true), "cobranca_paga", T1)?.confirmationPending, true);
  assert.equal(applyBillingEvent(snap("active", null, true), "cobranca_falhou", T1)?.confirmationPending, false);
});

test("assinatura_cancelada -> cancelled", () => {
  assert.equal(applyBillingEvent(snap("active"), "assinatura_cancelada", T1)?.status, "cancelled");
});

test("eventos só-registro não mudam estado", () => {
  for (const ev of ["assinatura_criada", "cobranca_gerada", "assinatura_plano_alterado", "mandato_ativado", "mandato_cancelado", "xyz"]) {
    assert.equal(applyBillingEvent(snap("active"), ev, T1), null);
  }
});

test("status verificado pela API manda sobre o nome do evento", () => {
  // corpo diz "paga", API diz que continua em atraso
  assert.deepEqual(
    applyBillingEvent(snap("overdue", T0.toISOString()), "cobranca_paga", T1, "overdue"),
    snap("overdue", T0.toISOString())
  );
  assert.deepEqual(applyBillingEvent(snap("active"), "cobranca_falhou", T1, "active"), snap("active"));
});

test("bloqueio só para suspenso/cancelado; sem assinatura nunca bloqueia", () => {
  assert.equal(isBillingBlocked(null), false);
  assert.equal(isBillingBlocked(undefined), false);
  assert.equal(isBillingBlocked("none"), false);
  assert.equal(isBillingBlocked("overdue"), false);
  assert.equal(isBillingBlocked("suspended"), true);
  assert.equal(isBillingBlocked("cancelled"), true);
});

test("dias até a suspensão: falha + 5 dias, arredonda pra cima, nunca negativo", () => {
  const failed = "2026-10-10T12:00:00Z";
  assert.equal(daysUntilSuspension(failed, new Date("2026-10-10T12:00:00Z")), 5);
  assert.equal(daysUntilSuspension(failed, new Date("2026-10-12T18:00:00Z")), 3);
  assert.equal(daysUntilSuspension(failed, new Date("2026-10-15T11:00:00Z")), 1);
  assert.equal(daysUntilSuspension(failed, new Date("2026-10-16T12:00:00Z")), 0);
  assert.equal(daysUntilSuspension(null, T0), null);
});

test("casamento webhook -> conta: token > e-mail > documento; ambíguo não casa", () => {
  assert.equal(resolveAccount({ byToken: "A", byEmail: ["B"], byDocument: ["C"] }), "A");
  assert.equal(resolveAccount({ byToken: null, byEmail: ["B", "B"], byDocument: ["C"] }), "B");
  assert.equal(resolveAccount({ byToken: null, byEmail: ["B", "D"], byDocument: ["C"] }), null);
  assert.equal(resolveAccount({ byToken: null, byEmail: [], byDocument: ["C"] }), "C");
  assert.equal(resolveAccount({ byToken: null, byEmail: [], byDocument: ["C", "E"] }), null);
  assert.equal(resolveAccount({ byToken: null, byEmail: [], byDocument: [] }), null);
});

test("normalização de e-mail e CPF/CNPJ", () => {
  assert.equal(normalizeEmail("  Coach@Example.COM "), "coach@example.com");
  assert.equal(normalizeEmail("sem-arroba"), null);
  assert.equal(normalizeDocument("123.456.789-09"), "12345678909");
  assert.equal(normalizeDocument("12.345.678/0001-95"), "12345678000195");
  assert.equal(normalizeDocument("123"), null);
  assert.equal(normalizeDocument(42), null);
});

test("segredo do webhook e link de checkout", () => {
  assert.equal(secretMatches("abc", "abc"), true);
  assert.equal(secretMatches("abd", "abc"), false);
  assert.equal(secretMatches("abc", undefined), false);
  assert.equal(secretMatches("", ""), false);
  assert.equal(safeCheckoutUrl("https://pay.example.com/x"), "https://pay.example.com/x");
  assert.equal(safeCheckoutUrl("http://pay.example.com/x"), null);
  assert.equal(safeCheckoutUrl("javascript:alert(1)"), null);
  assert.equal(safeCheckoutUrl(undefined), null);
});
