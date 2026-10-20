import test from "node:test";
import assert from "node:assert/strict";
import { buildOnboardingInfo, type OnboardingRow } from "./student-situation";

const base: OnboardingRow = {
  client_id: "c1",
  questionnaire_id: null,
  questionnaire_submitted_at: null,
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
};

test("convite sem conta cai em convite sem aceite, não em questionário", () => {
  const i = buildOnboardingInfo({ ...base, has_account: false, invite_status: "invited" });
  assert.equal(i?.bucket, "invite_pending");
});

test("conta criada sem questionário aguarda questionário", () => {
  assert.equal(buildOnboardingInfo(base)?.bucket, "awaiting_questionnaire");
});

test("questionário enviado aguarda protocolo, com prazo e atraso", () => {
  const row = {
    ...base,
    questionnaire_status: "submitted" as const,
    questionnaire_submitted_at: "2026-10-01T12:00:00Z",
    protocol_due_at: "2026-10-04T12:00:00Z",
  };
  const i = buildOnboardingInfo(row, new Date("2026-10-10T00:00:00Z"));
  assert.equal(i?.bucket, "awaiting_protocol");
  assert.equal(i?.overdue, true);
  assert.equal(i?.packageLabel, "Híbrido");
});

test("protocolo concluído e aluno legado ficam fora da fila", () => {
  const done = {
    ...base,
    questionnaire_status: "submitted" as const,
    protocol_due_at: "2026-10-04T12:00:00Z",
    training_published: true,
    nutrition_published: true,
  };
  assert.equal(buildOnboardingInfo(done)?.bucket, null);
  assert.equal(buildOnboardingInfo({ ...base, onboarding_required: false })?.bucket, null);
});
