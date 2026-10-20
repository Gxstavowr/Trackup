import assert from "node:assert/strict";
import test from "node:test";
import { canUseModule, moduleAccess, type ModuleAccessInput } from "./module-access";

const none = { training: false, nutrition: false };
const base: ModuleAccessInput = {
  package: "hybrid",
  published: none,
  questionnaireStatus: null,
  onboardingRequired: true,
  now: new Date("2026-10-13T12:00:00Z"),
};

test("legado: publicado = available, senão empty", () => {
  const legacy = { ...base, package: null, onboardingRequired: false };
  assert.equal(moduleAccess({ ...legacy, published: { training: true, nutrition: false } }, "training").state, "available");
  assert.equal(moduleAccess(legacy, "training").state, "empty");
  assert.equal(moduleAccess(legacy, "nutrition").state, "empty");
});

test("módulo fora do pacote é not_contracted, mesmo com plano publicado", () => {
  const input = { ...base, package: "training" as const, published: { training: true, nutrition: true } };
  assert.equal(moduleAccess(input, "nutrition").state, "not_contracted");
  assert.equal(moduleAccess(input, "training").state, "available");
  assert.equal(moduleAccess({ ...input, package: "nutrition" }, "training").state, "not_contracted");
});

test("contratado e publicado é available", () => {
  const input = { ...base, published: { training: true, nutrition: false } };
  assert.equal(moduleAccess(input, "training").state, "available");
  assert.equal(canUseModule(input, "training"), true);
  assert.equal(canUseModule(input, "nutrition"), false);
});

test("contratado, não publicado, sem questionário enviado: awaiting_questionnaire", () => {
  assert.equal(moduleAccess(base, "training").state, "awaiting_questionnaire");
  assert.equal(moduleAccess({ ...base, questionnaireStatus: "draft" }, "nutrition").state, "awaiting_questionnaire");
});

test("contratado, não publicado, questionário enviado: preparing com prazo", () => {
  const input = { ...base, questionnaireStatus: "submitted" as const, dueAt: "2026-10-15T12:00:00Z" };
  const r = moduleAccess(input, "training");
  assert.equal(r.state, "preparing");
  assert.equal(r.dueAt?.toISOString(), "2026-10-15T12:00:00.000Z");
  assert.equal(r.isOverdue, false);
});

test("preparing vencido marca isOverdue; sem prazo nunca vence", () => {
  const submitted = { ...base, questionnaireStatus: "submitted" as const };
  assert.equal(moduleAccess({ ...submitted, dueAt: "2026-10-12T12:00:00Z" }, "training").isOverdue, true);
  assert.equal(moduleAccess({ ...submitted, dueAt: null }, "training").isOverdue, false);
});

test("híbrido: um módulo publicado, o outro em preparação", () => {
  const input = {
    ...base,
    questionnaireStatus: "submitted" as const,
    dueAt: "2026-10-15T12:00:00Z",
    published: { training: true, nutrition: false },
  };
  assert.equal(moduleAccess(input, "training").state, "available");
  assert.equal(moduleAccess(input, "nutrition").state, "preparing");
});

test("legado que recebeu pacote depois não espera questionário", () => {
  const input = { ...base, onboardingRequired: false };
  assert.equal(moduleAccess(input, "training").state, "preparing");
  assert.equal(moduleAccess(input, "training").dueAt, null);
});

test("estados sem preparing não carregam prazo", () => {
  const r = moduleAccess({ ...base, package: "training" }, "nutrition");
  assert.deepEqual(r, { state: "not_contracted", dueAt: null, isOverdue: false });
});
