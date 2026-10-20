import assert from "node:assert/strict";
import test from "node:test";
import {
  COACH_STAGE_LABELS,
  coachStageLabel,
  deriveOnboardingStage,
  STUDENT_STAGE_LABELS,
  studentStageText,
  type OnboardingStage,
  type OnboardingStatusRow,
} from "./stage";

const NOW = new Date("2026-10-13T12:00:00Z");

const row = (over: Partial<OnboardingStatusRow> = {}): OnboardingStatusRow => ({
  has_account: true,
  onboarding_required: true,
  invite_status: "active",
  package: "hybrid",
  questionnaire_status: null,
  questionnaire_opened_at: null,
  protocol_due_at: null,
  training_published: false,
  nutrition_published: false,
  training_draft: false,
  nutrition_draft: false,
  invite_last_sent_at: null,
  invite_last_failed_at: null,
  invite_accepted_at: null,
  ...over,
});

const submitted = (over: Partial<OnboardingStatusRow> = {}) =>
  row({ questionnaire_status: "submitted", protocol_due_at: "2026-10-15T12:00:00Z", ...over });

const stageOf = (r: OnboardingStatusRow) => deriveOnboardingStage(r, NOW).stage;

test("convite: não enviado, enviado, aceito, falhou", () => {
  const noAccount = { has_account: false, invite_status: "pending" as const };
  assert.equal(stageOf(row(noAccount)), "invite_not_sent");
  assert.equal(stageOf(row({ ...noAccount, invite_last_sent_at: "2026-10-12T10:00:00Z" })), "invite_sent");
  assert.equal(stageOf(row({ ...noAccount, invite_status: "invited" })), "invite_sent");
  assert.equal(
    stageOf(row({ ...noAccount, invite_last_sent_at: "2026-10-12T10:00:00Z", invite_accepted_at: "2026-10-12T11:00:00Z" })),
    "invite_accepted",
  );
  assert.equal(stageOf(row({ ...noAccount, invite_last_failed_at: "2026-10-12T10:00:00Z" })), "invite_failed");
});

test("falha só vale se for posterior ao último envio", () => {
  const noAccount = { has_account: false, invite_status: "invited" as const };
  assert.equal(
    stageOf(row({ ...noAccount, invite_last_failed_at: "2026-10-12T10:00:00Z", invite_last_sent_at: "2026-10-12T11:00:00Z" })),
    "invite_sent",
  );
  assert.equal(
    stageOf(row({ ...noAccount, invite_last_sent_at: "2026-10-12T10:00:00Z", invite_last_failed_at: "2026-10-12T11:00:00Z" })),
    "invite_failed",
  );
});

test("legado e conta criada", () => {
  assert.equal(stageOf(row({ onboarding_required: false, package: null })), "legacy");
  assert.equal(stageOf(row()), "account_created");
});

test("convite pendente não se confunde com questionário pendente", () => {
  assert.equal(stageOf(row({ has_account: false, invite_status: "pending" })), "invite_not_sent");
  assert.equal(stageOf(row({ questionnaire_status: "draft" })), "questionnaire_pending");
});

test("questionário enviado não é protocolo pronto", () => {
  const r = deriveOnboardingStage(submitted(), NOW);
  assert.equal(r.stage, "questionnaire_submitted");
  assert.deepEqual(r.missingModules, ["training", "nutrition"]);
});

test("protocolo em preparação: aberto pelo coach ou com rascunho (rascunho não conta como publicado)", () => {
  assert.equal(stageOf(submitted({ questionnaire_opened_at: "2026-10-13T08:00:00Z" })), "protocol_preparing");
  assert.equal(stageOf(submitted({ training_draft: true })), "protocol_preparing");
  assert.equal(stageOf(submitted({ nutrition_draft: true })), "protocol_preparing");
});

test("híbrido parcial e concluído", () => {
  const partial = deriveOnboardingStage(submitted({ training_published: true }), NOW);
  assert.equal(partial.stage, "protocol_partial");
  assert.deepEqual(partial.missingModules, ["nutrition"]);
  assert.equal(stageOf(submitted({ nutrition_published: true })), "protocol_partial");
  const done = deriveOnboardingStage(submitted({ training_published: true, nutrition_published: true }), NOW);
  assert.equal(done.stage, "protocol_completed");
  assert.deepEqual(done.missingModules, []);
});

test("pacote de módulo único: concluído ao publicar o seu módulo; o outro não conta", () => {
  assert.equal(stageOf(submitted({ package: "training", training_published: true })), "protocol_completed");
  assert.equal(stageOf(submitted({ package: "training", nutrition_published: true })), "questionnaire_submitted");
  assert.equal(stageOf(submitted({ package: "nutrition", nutrition_published: true })), "protocol_completed");
  assert.equal(stageOf(submitted({ package: "nutrition" })), "questionnaire_submitted");
});

test("enviado sem pacote nunca vira concluído", () => {
  assert.equal(stageOf(submitted({ package: null, training_published: true })), "questionnaire_submitted");
});

test("prazo e atraso", () => {
  const ok = deriveOnboardingStage(submitted(), NOW);
  assert.equal(ok.dueAt?.toISOString(), "2026-10-15T12:00:00.000Z");
  assert.equal(ok.isOverdue, false);
  const late = deriveOnboardingStage(submitted({ protocol_due_at: "2026-10-12T12:00:00Z" }), NOW);
  assert.equal(late.isOverdue, true);
  const done = deriveOnboardingStage(
    submitted({ protocol_due_at: "2026-10-12T12:00:00Z", training_published: true, nutrition_published: true }),
    NOW,
  );
  assert.equal(done.isOverdue, false);
  assert.equal(deriveOnboardingStage(row(), NOW).dueAt, null);
});

test("todo estágio tem rótulo de coach específico e de aluno", () => {
  const all = Object.keys(COACH_STAGE_LABELS) as OnboardingStage[];
  assert.equal(all.length, 11);
  for (const s of all) {
    assert.ok(COACH_STAGE_LABELS[s].length > 0);
    assert.ok(STUDENT_STAGE_LABELS[s].length > 0);
    assert.notEqual(COACH_STAGE_LABELS[s].toLowerCase(), "pendente");
  }
  assert.equal(new Set(all.map((s) => COACH_STAGE_LABELS[s])).size, all.length);
  assert.equal(coachStageLabel({ stage: "invite_failed" }), "Falha ao enviar o convite");
});

test("texto do aluno: prazo, parcial e demais", () => {
  const preparing = deriveOnboardingStage(submitted({ questionnaire_opened_at: "2026-10-13T08:00:00Z" }), NOW);
  assert.equal(studentStageText(preparing, "hybrid"), "Seu protocolo está em preparação, previsto até 15/10");
  const partial = deriveOnboardingStage(submitted({ training_published: true }), NOW);
  assert.equal(studentStageText(partial, "hybrid"), "Treino pronto, Nutrição em preparação");
  const pending = deriveOnboardingStage(row({ questionnaire_status: "draft" }), NOW);
  assert.equal(studentStageText(pending, "hybrid"), "Continue seu questionário inicial");
});
