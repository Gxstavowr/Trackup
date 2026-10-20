import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysToDate,
  centsToInput,
  deriveContractState,
  minEffectiveDate,
  modulesHiddenBy,
  modulesRemovedByChange,
  parsePriceToCents,
  validateChangeInput,
  validateInitialInput,
} from "./contract-logic";

const c = (id: string, effectiveFrom: string, extra: { voidedAt?: string | null; createdAt?: string } = {}) => ({
  id,
  effectiveFrom,
  createdAt: extra.createdAt ?? `${effectiveFrom}T12:00:00Z`,
  voidedAt: extra.voidedAt ?? null,
});

test("deriveContractState: vigente é o maior effective_from <= hoje, ignorando anulados", () => {
  const rows = [c("a", "2026-01-01"), c("b", "2026-05-01"), c("v", "2026-09-01", { voidedAt: "x" }), c("f", "2026-11-01")];
  const s = deriveContractState(rows, "2026-10-13");
  assert.equal(s.current?.id, "b");
  assert.equal(s.scheduled?.id, "f");
});

test("deriveContractState: mudança que vence hoje vira vigente; sem contrato = nulos", () => {
  const s = deriveContractState([c("a", "2026-01-01"), c("b", "2026-10-13")], "2026-10-13");
  assert.equal(s.current?.id, "b");
  assert.equal(s.scheduled, null);
  assert.deepEqual(deriveContractState([], "2026-10-13"), { current: null, scheduled: null });
});

test("minEffectiveDate: amanhã quando o vigente começou hoje", () => {
  assert.equal(minEffectiveDate({ effectiveFrom: "2026-10-13" }, "2026-10-13"), "2026-10-14");
  assert.equal(minEffectiveDate({ effectiveFrom: "2026-01-01" }, "2026-10-13"), "2026-10-13");
  assert.equal(minEffectiveDate(null, "2026-10-13"), "2026-10-13");
  assert.equal(addDaysToDate("2026-12-31", 1), "2027-01-01");
});

test("modulesHiddenBy: pacote Treino com dieta publicada esconde Nutrição", () => {
  assert.deepEqual(modulesHiddenBy("training", { training: true, nutrition: true }), ["nutrition"]);
  assert.deepEqual(modulesHiddenBy("nutrition", { training: true, nutrition: false }), ["training"]);
  assert.deepEqual(modulesHiddenBy("hybrid", { training: true, nutrition: true }), []);
  assert.deepEqual(modulesHiddenBy("training", { training: false, nutrition: false }), []);
});

test("modulesRemovedByChange", () => {
  assert.deepEqual(modulesRemovedByChange("hybrid", "training"), ["nutrition"]);
  assert.deepEqual(modulesRemovedByChange("training", "hybrid"), []);
  assert.deepEqual(modulesRemovedByChange("training", "nutrition"), ["training"]);
});

test("parsePriceToCents aceita formatos brasileiros e zero (cortesia)", () => {
  assert.equal(parsePriceToCents("249,90"), 24990);
  assert.equal(parsePriceToCents("1.234,56"), 123456);
  assert.equal(parsePriceToCents("R$ 150"), 15000);
  assert.equal(parsePriceToCents("150.5"), 15050);
  assert.equal(parsePriceToCents("0"), 0);
  assert.equal(parsePriceToCents(""), null);
  assert.equal(parsePriceToCents("-10"), null);
  assert.equal(parsePriceToCents("abc"), null);
  assert.equal(parsePriceToCents("1.2.3"), null);
  assert.equal(parsePriceToCents("100001"), null);
  assert.equal(centsToInput(24990), "249,90");
  assert.equal(centsToInput(null), "");
});

test("validateInitialInput", () => {
  assert.deepEqual(validateInitialInput({ package: "hybrid", price: "300", billingPeriod: "monthly" }), {
    ok: true,
    value: { package: "hybrid", priceCents: 30000, billingPeriod: "monthly" },
  });
  assert.equal(validateInitialInput({ package: "x", price: "300", billingPeriod: "monthly" }).ok, false);
  assert.equal(validateInitialInput({ package: "hybrid", price: "300", billingPeriod: "weekly" }).ok, false);
  assert.equal(validateInitialInput({ package: "hybrid", price: "", billingPeriod: "monthly" }).ok, false);
});

const current = { package: "training" as const, priceCents: 20000, billingPeriod: "monthly" as const, effectiveFrom: "2026-01-01" };
const base = { package: "hybrid", price: "300,00", billingPeriod: "monthly", effectiveFrom: "2026-11-01", reason: " upgrade ", agreedWithClient: "on" };

test("validateChangeInput: caminho feliz normaliza motivo e checkboxes", () => {
  const r = validateChangeInput(base, current, "2026-10-13");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.reason, "upgrade");
    assert.equal(r.value.agreedWithClient, true);
    assert.equal(r.value.requireClientConfirmation, false);
    assert.equal(r.value.priceCents, 30000);
  }
});

test("validateChangeInput: recusa retroativa, mesmo dia, sem mudança, motivo longo, sem contrato", () => {
  assert.equal(validateChangeInput({ ...base, effectiveFrom: "2026-10-12" }, current, "2026-10-13").ok, false);
  assert.equal(
    validateChangeInput({ ...base, effectiveFrom: "2026-10-13" }, { ...current, effectiveFrom: "2026-10-13" }, "2026-10-13").ok,
    false
  );
  assert.equal(validateChangeInput({ ...base, effectiveFrom: "2026-10-13" }, current, "2026-10-13").ok, true);
  assert.equal(validateChangeInput({ ...base, package: "training", price: "200" }, current, "2026-10-13").ok, false);
  assert.equal(validateChangeInput({ ...base, reason: "x".repeat(501) }, current, "2026-10-13").ok, false);
  assert.equal(validateChangeInput({ ...base, effectiveFrom: "" }, current, "2026-10-13").ok, false);
  assert.equal(validateChangeInput(base, null, "2026-10-13").ok, false);
});
