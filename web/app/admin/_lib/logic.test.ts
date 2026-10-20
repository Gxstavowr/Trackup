import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentPrice,
  explicitMethod,
  isIdInAllowlist,
  normalizeOverview,
  parseAdminAllowlist,
  parseDateOnly,
  parseBillingStatusFilter,
  parsePeriodKey,
  parseReaisToCents,
  resolvePeriod,
} from "./logic";

const A = "3f2b8c1e-1d2a-4b5c-9d8e-7f6a5b4c3d2e";
const B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("allowlist: vazia ou ausente = ninguém é admin", () => {
  assert.equal(parseAdminAllowlist(undefined).size, 0);
  assert.equal(parseAdminAllowlist("").size, 0);
  assert.equal(parseAdminAllowlist(" , ,").size, 0);
  assert.equal(isIdInAllowlist(A, parseAdminAllowlist(undefined)), false);
});

test("allowlist: separa por vírgula, ignora espaços/caixa e descarta lixo", () => {
  const set = parseAdminAllowlist(` ${A.toUpperCase()} ,${B}, *, true, not-a-uuid`);
  assert.equal(set.size, 2);
  assert.equal(isIdInAllowlist(A, set), true);
  assert.equal(isIdInAllowlist(B.toUpperCase(), set), true);
  assert.equal(isIdInAllowlist("*", set), false);
  assert.equal(isIdInAllowlist("", set), false);
  assert.equal(isIdInAllowlist(null, set), false);
  assert.equal(isIdInAllowlist("3f2b8c1e-1d2a-4b5c-9d8e-000000000000", set), false);
});

test("período: mês civil inteiro em São Paulo, meio-aberto", () => {
  // 01/10/2026 01:00 UTC ainda é 30/09 22h em SP -> mês = setembro
  const p = resolvePeriod("mes", new Date("2026-10-01T01:00:00Z"));
  assert.equal(p.from, "2026-09-01T03:00:00.000Z");
  assert.equal(p.to, "2026-10-01T03:00:00.000Z");
  assert.match(p.label, /setembro de 2026/);

  const prev = resolvePeriod("anterior", new Date("2026-01-15T12:00:00Z"));
  assert.equal(prev.from, "2025-12-01T03:00:00.000Z");
  assert.equal(prev.to, "2026-01-01T03:00:00.000Z");
});

test("período: chave inválida cai em 'mes'", () => {
  assert.equal(parsePeriodKey(undefined), "mes");
  assert.equal(parsePeriodKey("xpto"), "mes");
  assert.equal(parsePeriodKey(["anterior"]), "anterior");
});

test("overview: sem preço o MRR é null, mesmo que venha número", () => {
  const o = normalizeOverview({ platform_price_cents: null, mrr_expected_cents: 5000, coaches_total: 3 });
  assert.equal(o.platformPriceCents, null);
  assert.equal(o.mrrExpectedCents, null);
  assert.equal(o.coachesTotal, 3);
});

test("overview: contagens ausentes = 0, status e pacotes completos", () => {
  const o = normalizeOverview({
    platform_price_cents: 14990,
    mrr_expected_cents: 29980,
    billing_by_status: { active: 2, suspended: "1", bogus: 9 },
    students_by_package: { hybrid: 4, legacy: 10 },
  });
  assert.equal(o.mrrExpectedCents, 29980);
  assert.deepEqual(o.billingByStatus, {
    none: 0,
    pending_first_payment: 0,
    active: 2,
    overdue: 0,
    suspended: 1,
    cancelled: 0,
  });
  assert.deepEqual(o.studentsByPackage, { training: 0, nutrition: 0, hybrid: 4, legacy: 10 });
  assert.equal(o.paidEventsInPeriod, 0);
  assert.equal(o.billingLastUpdate, null);
});

test("overview: lixo não vira número", () => {
  const o = normalizeOverview("nada");
  assert.equal(o.coachesTotal, 0);
  assert.equal(o.platformPriceCents, null);
  const neg = normalizeOverview({ coaches_total: -4, platform_price_cents: "abc" });
  assert.equal(neg.coachesTotal, 0);
  assert.equal(neg.platformPriceCents, null);
});

test("preço: reais -> centavos", () => {
  assert.equal(parseReaisToCents("149,90"), 14990);
  assert.equal(parseReaisToCents("R$ 1.234,56"), 123456);
  assert.equal(parseReaisToCents("99.5"), 9950);
  assert.equal(parseReaisToCents("0"), null);
  assert.equal(parseReaisToCents("-10"), null);
  assert.equal(parseReaisToCents("abc"), null);
  assert.equal(parseReaisToCents("1.2.3"), null);
  assert.equal(parseReaisToCents("100001"), null); // acima do teto do banco
});

test("data: só YYYY-MM-DD válida", () => {
  assert.equal(parseDateOnly("2026-10-01"), "2026-10-01");
  assert.equal(parseDateOnly("2026-02-30"), null);
  assert.equal(parseDateOnly("01/10/2026"), null);
});

test("preço vigente: maior vigência <= hoje", () => {
  const rows = [
    { effectiveFrom: "2026-01-01", cents: 1 },
    { effectiveFrom: "2026-09-01", cents: 2 },
    { effectiveFrom: "2026-12-01", cents: 3 },
  ];
  assert.equal(currentPrice(rows, "2026-10-13")?.cents, 2);
  assert.equal(currentPrice(rows, "2025-12-31"), null);
});

test("forma de pagamento: só com sinal explícito", () => {
  assert.equal(explicitMethod([]), null);
  assert.equal(explicitMethod([{ event: "cobranca_paga", payload: {} }]), null);
  assert.equal(explicitMethod([{ event: "trackly_pix_enroll", payload: {} }]), "pix_automatico");
  assert.equal(
    explicitMethod([{ event: "assinatura_ativada", payload: { plan: { billing_method: "credit_card" } } }]),
    "credit_card"
  );
});

test("filtro de status", () => {
  assert.equal(parseBillingStatusFilter("active"), "active");
  assert.equal(parseBillingStatusFilter("x"), "all");
});
