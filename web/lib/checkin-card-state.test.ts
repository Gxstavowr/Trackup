import assert from "node:assert/strict";
import test from "node:test";
import { pickCheckinCardState, opensLabelFor } from "./checkin-card-state";

const open = { state: "open", closesLabel: "domingo" } as const;
const closed = { state: "closed", daysUntilOpen: 3 } as const;
const reminder = { state: "reminder" } as const;
const pending = { status: "pending", weekNumber: 4 };
const base = { released: true, instance: pending, questionCount: 8, window: open };

test("aluno novo sem protocolo: bloqueado", () => {
  assert.equal(pickCheckinCardState({ ...base, released: false }).kind, "locked");
});

test("sem instância: indisponível", () => {
  assert.equal(pickCheckinCardState({ ...base, instance: null }).kind, "unavailable");
});

test("janela sex–dom com perguntas: aberto", () => {
  assert.deepEqual(pickCheckinCardState(base), { kind: "open", weekNumber: 4, closesLabel: "domingo" });
});

test("antes da abertura: bloqueado até sexta com o prazo", () => {
  const s = pickCheckinCardState({ ...base, window: closed });
  assert.deepEqual(s, { kind: "before_open", weekNumber: 4, reminder: false, daysUntilOpen: 3, opensLabel: "Abre na sexta-feira · em 3 dias" });
});

test("quinta: abre amanhã", () => {
  const s = pickCheckinCardState({ ...base, window: reminder });
  assert.equal(s.kind, "before_open");
  assert.equal(s.kind === "before_open" && s.reminder, true);
  assert.equal(s.kind === "before_open" && s.opensLabel, "Abre amanhã, sexta-feira");
});

test("singular de dia", () => {
  assert.equal(opensLabelFor({ state: "closed", daysUntilOpen: 1 }), "Abre na sexta-feira · em 1 dia");
});

test("enviado e avaliado valem fora da janela", () => {
  assert.equal(pickCheckinCardState({ ...base, window: closed, instance: { status: "submitted", weekNumber: 4 } }).kind, "submitted");
  assert.equal(pickCheckinCardState({ ...base, window: closed, instance: { status: "reviewed", weekNumber: 4 } }).kind, "reviewed");
  assert.equal(pickCheckinCardState({ ...base, instance: { status: "reviewed", weekNumber: 4 } }).kind, "reviewed");
});

test("sem perguntas na janela: não configurado; enviado ignora perguntas", () => {
  assert.equal(pickCheckinCardState({ ...base, questionCount: 0 }).kind, "not_configured");
  assert.equal(pickCheckinCardState({ ...base, questionCount: 0, instance: { status: "submitted", weekNumber: 4 } }).kind, "submitted");
});
