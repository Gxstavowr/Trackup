import assert from "node:assert/strict";
import test from "node:test";
import {
  decidePixEnroll,
  extractMandate,
  formatTaxDocument,
  isValidCnpj,
  isValidCpf,
  mandateStatusFromEvent,
  mergeMandateStatus,
  parseEnrollResponse,
  parsePhone,
  parseTaxDocument,
  statusAfterEnroll,
  ENROLL_GENERIC_ERROR,
  PIX_UNAVAILABLE_ERROR,
} from "./enroll";
import { appliesToCurrentSubscription } from "./state";

test("CPF: dígitos verificadores", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("52998224725"), true);
  assert.equal(isValidCpf("123.456.789-09"), true);
  assert.equal(isValidCpf("529.982.247-24"), false); // DV errado
  assert.equal(isValidCpf("111.111.111-11"), false); // repetido
  assert.equal(isValidCpf("1234567890"), false); // 10 dígitos
  assert.equal(isValidCpf(""), false);
});

test("CNPJ: dígitos verificadores", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-80"), false);
  assert.equal(isValidCnpj("00000000000000"), false);
});

test("parseTaxDocument / formatTaxDocument", () => {
  assert.equal(parseTaxDocument(" 529.982.247-25 "), "52998224725");
  assert.equal(parseTaxDocument("11222333000181"), "11222333000181");
  assert.equal(parseTaxDocument("529.982.247-24"), null);
  assert.equal(parseTaxDocument(52998224725), null);
  assert.equal(parseTaxDocument(null), null);
  assert.equal(formatTaxDocument("52998224725"), "529.982.247-25");
  assert.equal(formatTaxDocument("11222333000181"), "11.222.333/0001-81");
});

test("telefone opcional: vazio ok, 10/11 dígitos, +55 removido", () => {
  assert.equal(parsePhone(""), null);
  assert.equal(parsePhone(null), null);
  assert.equal(parsePhone("(11) 99999-9999"), "11999999999");
  assert.equal(parsePhone("+55 11 3333-4444"), "1133334444");
  assert.equal(parsePhone("9999-9999"), undefined);
  assert.equal(parsePhone("(01) 99999-9999"), undefined);
  assert.equal(parsePhone(42), undefined);
});

test("enroll 201 Pix Automático: token, status e mandato", () => {
  const r = parseEnrollResponse(201, {
    subscription_token: "c3d4e5f6-a7b8-9012-cdef-123456789012",
    status: "pending_first_payment",
    billing_method: "pix_automatico",
    payment: { mandate_id: "m-1", qr_code: "00020126abc", mandate_status: "CREATED" },
  });
  assert.deepEqual(r, {
    ok: true,
    subscriptionToken: "c3d4e5f6-a7b8-9012-cdef-123456789012",
    status: "pending_first_payment",
    billingMethod: "pix_automatico",
    mandate: { mandateId: "m-1", qrCode: "00020126abc", mandateStatus: "CREATED" },
  });
});

test("enroll 201 com QR nulo (processando) e envelope data", () => {
  const r = parseEnrollResponse(201, {
    data: { subscription_token: "t", status: "pending_first_payment", payment: { mandate_id: "m", qr_code: null, mandate_status: "CREATED" } },
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.mandate.qrCode, null);
    assert.equal(r.mandate.mandateStatus, "CREATED");
  }
});

test("enroll 201 sem token ou status desconhecido = erro genérico", () => {
  assert.deepEqual(parseEnrollResponse(201, { status: "active" }), { ok: false, message: ENROLL_GENERIC_ERROR });
  assert.deepEqual(parseEnrollResponse(201, { subscription_token: "t", status: "weird" }), {
    ok: false,
    message: ENROLL_GENERIC_ERROR,
  });
  assert.deepEqual(parseEnrollResponse(201, null), { ok: false, message: ENROLL_GENERIC_ERROR });
});

test("enroll 422: CPF recusado, mensagens pt-BR repassadas, inglês vira genérica", () => {
  const doc = parseEnrollResponse(422, {
    message: "Validation failed",
    errors: { document: ["O CPF informado é inválido. Verifique o dígito verificador."] },
  });
  assert.equal(doc.ok, false);
  if (!doc.ok) assert.match(doc.message, /CPF\/CNPJ/);

  const name = parseEnrollResponse(422, { message: "Validation failed", errors: { name: ["O nome é obrigatório."] } });
  assert.equal(name.ok, false);
  if (!name.ok) {
    assert.match(name.message, /O nome é obrigatório\./);
    assert.doesNotMatch(name.message, /Validation failed/);
  }

  const en = parseEnrollResponse(422, { message: "The email field must be valid." });
  assert.equal(en.ok, false);
  if (!en.ok) assert.equal(en.message, "A SyncPay recusou os dados informados. Confira e tente de novo.");
});

test("Pix Automático não habilitado pro seller vira mensagem própria", () => {
  for (const status of [422, 400, 403]) {
    assert.deepEqual(
      parseEnrollResponse(status, { message: "Pix Automático não está disponível para este seller" }),
      { ok: false, message: PIX_UNAVAILABLE_ERROR }
    );
  }
  assert.deepEqual(
    parseEnrollResponse(422, { errors: { plan: ["Pix Automático não está disponível para este seller"] } }),
    { ok: false, message: PIX_UNAVAILABLE_ERROR }
  );
});

test("enroll 404 / 5xx / sem resposta", () => {
  const nf = parseEnrollResponse(404, { error: "Plan not found" });
  assert.equal(nf.ok, false);
  if (!nf.ok) assert.match(nf.message, /plano/);
  assert.deepEqual(parseEnrollResponse(500, null), { ok: false, message: ENROLL_GENERIC_ERROR });
  assert.deepEqual(parseEnrollResponse(0, null), { ok: false, message: ENROLL_GENERIC_ERROR });
});

test("mandato no detalhe (se vier) e nos webhooks", () => {
  assert.equal(extractMandate({ status: "active", plan: {} }), null);
  assert.deepEqual(extractMandate({ mandate: { id: "m", status: "ACTIVE" } }), { mandateStatus: "ACTIVE", mandateId: "m" });
  assert.deepEqual(extractMandate({ payment: { qr_code: "000201", mandate_status: "CREATED" } }), {
    qrCode: "000201",
    mandateStatus: "CREATED",
  });
  assert.equal(mandateStatusFromEvent("mandato_ativado", {}), "ACTIVE");
  assert.equal(mandateStatusFromEvent("mandato_cancelado", null), "CANCELLED");
  assert.equal(mandateStatusFromEvent("mandato_ativado", { mandate: { status: "CANCELLED" } }), "CANCELLED");
  assert.equal(mandateStatusFromEvent("cobranca_paga", {}), null);
});

test("mandato só avança (consulta atrasada não desfaz mandato_ativado)", () => {
  assert.equal(mergeMandateStatus(null, "CREATED"), "CREATED");
  assert.equal(mergeMandateStatus("CREATED", "ACTIVE"), "ACTIVE");
  assert.equal(mergeMandateStatus("ACTIVE", "CREATED"), "ACTIVE");
  assert.equal(mergeMandateStatus("ACTIVE", "CANCELLED"), "CANCELLED");
  assert.equal(mergeMandateStatus("CANCELLED", "ACTIVE"), "CANCELLED");
  assert.equal(mergeMandateStatus("ACTIVE", null), "ACTIVE");
});

test("não inscreve duas vezes: reaproveita o enroll de Pix em andamento", () => {
  const base = { token: "t", tokenIsOurPixEnroll: true, mandateStatus: "CREATED" as const };
  assert.equal(decidePixEnroll({ ...base, status: "pending_first_payment" }), "reuse");
  assert.equal(decidePixEnroll({ ...base, status: "overdue" }), "reuse");
  assert.equal(decidePixEnroll({ ...base, status: "active" }), "already_active");
  // mandato cancelado, assinatura suspensa/cancelada ou token que não é Pix do Trackly: novo enroll
  assert.equal(decidePixEnroll({ ...base, status: "pending_first_payment", mandateStatus: "CANCELLED" }), "enroll");
  assert.equal(decidePixEnroll({ ...base, status: "suspended" }), "enroll");
  assert.equal(decidePixEnroll({ ...base, status: "cancelled" }), "enroll");
  assert.equal(decidePixEnroll({ ...base, status: "overdue", tokenIsOurPixEnroll: false }), "enroll");
  assert.equal(decidePixEnroll({ status: "none", token: null, tokenIsOurPixEnroll: false, mandateStatus: null }), "enroll");
  assert.equal(decidePixEnroll({ status: null, token: null, tokenIsOurPixEnroll: false, mandateStatus: null }), "enroll");
});

test("status depois do enroll: nunca destrava atraso/suspensão/cancelamento", () => {
  assert.equal(statusAfterEnroll(null, "pending_first_payment"), "pending_first_payment");
  assert.equal(statusAfterEnroll("none", "pending_first_payment"), "pending_first_payment");
  assert.equal(statusAfterEnroll("overdue", "pending_first_payment"), "overdue");
  assert.equal(statusAfterEnroll("suspended", "pending_first_payment"), "suspended");
  assert.equal(statusAfterEnroll("cancelled", "pending_first_payment"), "cancelled");
});

test("evento de outra assinatura da conta só vale se ativar", () => {
  assert.equal(appliesToCurrentSubscription(null, "new", "suspended"), true);
  assert.equal(appliesToCurrentSubscription("a", "a", "suspended"), true);
  assert.equal(appliesToCurrentSubscription("a", null, "overdue"), true);
  assert.equal(appliesToCurrentSubscription("pix", "card", "suspended"), false);
  assert.equal(appliesToCurrentSubscription("pix", "card", "cancelled"), false);
  assert.equal(appliesToCurrentSubscription("pix", "card", "active"), true);
});
