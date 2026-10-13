import test from "node:test";
import assert from "node:assert/strict";
import {
  clientWantsNotification,
  DEFAULT_CLIENT_NOTIFICATION_PREFS,
  normalizeName,
  prefsFromCheckboxes,
  resolveClientNotificationPrefs,
  validateProfileInput,
} from "./student-profile";

/**
 * Testes do perfil editável do aluno (migration 0018). Rodar (pasta `web/`):
 * `npx --yes tsx --test lib/student-profile.test.ts`
 */

test("normalizeName apara e colapsa espaços e quebras de linha", () => {
  assert.equal(normalizeName("  Ana   Maria \n Souza  "), "Ana Maria Souza");
});

test("nome válido + telefone vazio vira null", () => {
  assert.deepEqual(validateProfileInput("  Ana  ", "   "), { ok: true, value: { name: "Ana", phone: null } });
  assert.deepEqual(validateProfileInput("Ana", undefined), { ok: true, value: { name: "Ana", phone: null } });
});

test("nome curto, longo, ausente ou com caractere de controle é recusado", () => {
  for (const bad of ["", " ", "A", "x".repeat(81), null, 42, "Ana\u0000"]) {
    const r = validateProfileInput(bad, "");
    assert.equal(r.ok, false, String(bad));
    if (!r.ok) assert.equal(r.field, "name");
  }
  assert.equal(validateProfileInput("x".repeat(80), "").ok, true);
});

test("telefones brasileiros e com DDI são aceitos (aparados)", () => {
  for (const ok of ["(11) 98765-4321", "11987654321", "+55 11 98765-4321", "1133334444", " 11.98765.4321 "]) {
    const r = validateProfileInput("Ana", ok);
    assert.equal(r.ok, true, ok);
    if (r.ok) assert.equal(r.value.phone, ok.trim());
  }
});

test("telefone com letras, poucos/muitos dígitos ou longo demais é recusado", () => {
  for (const bad of ["123", "11 9abc 99999", "1234567890123456", "+55 (11) 9 8765-4321 ramal", "1-".repeat(13) + "1"]) {
    const r = validateProfileInput("Ana", bad);
    assert.equal(r.ok, false, bad);
    if (!r.ok) assert.equal(r.field, "phone");
  }
});

test("preferências: sem linha = tudo ligado; valores não booleanos são ignorados", () => {
  assert.deepEqual(resolveClientNotificationPrefs(null), DEFAULT_CLIENT_NOTIFICATION_PREFS);
  assert.deepEqual(resolveClientNotificationPrefs({ workout_updated: false, nutrition_updated: "no" }), {
    orientation_ready: true,
    workout_updated: false,
    nutrition_updated: true,
  });
});

test("clientWantsNotification respeita só os eventos silenciáveis", () => {
  const prefs = { orientation_ready: false, workout_updated: true, nutrition_updated: false };
  assert.equal(clientWantsNotification(prefs, "orientation_ready"), false);
  assert.equal(clientWantsNotification(prefs, "workout_updated"), true);
  assert.equal(clientWantsNotification(prefs, "nutrition_updated"), false);
  assert.equal(clientWantsNotification(prefs, "checkin_reminder"), true);
});

test("prefsFromCheckboxes: marcado = 'on', ausente = desligado", () => {
  const form = new Map<string, string>([["workout_updated", "on"]]);
  assert.deepEqual(prefsFromCheckboxes((k) => form.get(k) ?? null), {
    orientation_ready: false,
    workout_updated: true,
    nutrition_updated: false,
  });
});
