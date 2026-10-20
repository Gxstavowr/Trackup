import assert from "node:assert/strict";
import test from "node:test";
import { onboardingActionError, onboardingErrorCode, translateOnboardingError } from "./errors";

test("extrai o código mesmo dentro de texto do PostgREST", () => {
  assert.equal(onboardingErrorCode("trackly:client_email_exists"), "client_email_exists");
  assert.equal(onboardingErrorCode("P0001: trackly:no_change"), "no_change");
  assert.equal(onboardingErrorCode("erro qualquer"), null);
});

test("traduz códigos conhecidos e ignora desconhecidos", () => {
  assert.match(translateOnboardingError("trackly:client_email_exists")!, /mesmo e-mail|esse e-mail/);
  assert.equal(translateOnboardingError("trackly:inexistente"), null);
  assert.equal(translateOnboardingError("nada"), null);
});

test("onboardingActionError cai no padrão de action-errors", () => {
  assert.match(onboardingActionError(new Error("trackly:retroactive_change"), "x"), /data passada/);
  assert.equal(onboardingActionError(new Error("duplicate key value violates unique constraint"), "Falha."), "Falha.");
  assert.equal(onboardingActionError(new Error("Mensagem de negócio"), "Falha."), "Mensagem de negócio");
  assert.equal(onboardingActionError("string", "Falha."), "Falha.");
});
