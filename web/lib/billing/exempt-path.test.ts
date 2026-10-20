import { test } from "node:test";
import assert from "node:assert/strict";
import { isBillingExemptRoute } from "./exempt-path";

test("páginas liberadas com plano suspenso", () => {
  assert.equal(isBillingExemptRoute({ path: "/coach/suspenso" }), true);
  assert.equal(isBillingExemptRoute({ path: "/coach/assinatura" }), true);
  assert.equal(isBillingExemptRoute({ path: "/coach/assinatura?x=1" }), true);
  assert.equal(isBillingExemptRoute({ path: "/coach/configuracoes?secao=assinatura" }), true);
});

test("demais rotas do coach não são liberadas", () => {
  assert.equal(isBillingExemptRoute({ path: "/coach" }), false);
  assert.equal(isBillingExemptRoute({ path: "/coach/configuracoes" }), false);
  assert.equal(isBillingExemptRoute({ path: "/coach/configuracoes?secao=perfil" }), false);
  assert.equal(isBillingExemptRoute({ path: "/coach/suspenso/../alunos" }), false);
  assert.equal(isBillingExemptRoute({ path: "/coach/assinatura/extra" }), false);
});

test("sem header, header vazio ou valor estranho: não libera", () => {
  assert.equal(isBillingExemptRoute({ path: null }), false);
  assert.equal(isBillingExemptRoute({ path: undefined }), false);
  assert.equal(isBillingExemptRoute({ path: "" }), false);
  assert.equal(isBillingExemptRoute({ path: "coach/suspenso" }), false);
  assert.equal(isBillingExemptRoute({ path: "//evil.example/coach/suspenso" }), false);
  assert.equal(isBillingExemptRoute({ path: "http://evil.example/coach/suspenso" }), false);
});

test("Server Action nunca usa a exceção, mesmo vinda de página liberada", () => {
  assert.equal(isBillingExemptRoute({ path: "/coach/suspenso", isServerAction: true }), false);
  assert.equal(isBillingExemptRoute({ path: "/coach/assinatura", isServerAction: true }), false);
  assert.equal(
    isBillingExemptRoute({ path: "/coach/configuracoes?secao=assinatura", isServerAction: true }),
    false
  );
});
