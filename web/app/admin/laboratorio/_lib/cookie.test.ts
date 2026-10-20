import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeLabCookie,
  encodeLabCookie,
  isLabProfileKey,
  isReservedDemoEmail,
  labEntryDestination,
  labProfileLabel,
  LAB_COOKIE_TTL_SECONDS,
} from "./cookie";

const SECRET = "s".repeat(40);
const OTHER = "o".repeat(40);
const ADMIN = "11111111-2222-4333-8444-555555555555";
const NOW = 1_800_000_000;

function make(now = NOW) {
  return encodeLabCookie({ adminUserId: ADMIN, profileKey: "coach_filled", adminRefreshToken: "rt-abc" }, SECRET, now);
}

test("ida e volta preserva admin, perfil e token", () => {
  const out = decodeLabCookie(make(), SECRET, NOW + 10);
  assert.ok(out);
  assert.equal(out.adminUserId, ADMIN);
  assert.equal(out.profileKey, "coach_filled");
  assert.equal(out.adminRefreshToken, "rt-abc");
  assert.equal(out.expiresAt, NOW + LAB_COOKIE_TTL_SECONDS);
});

test("o token não aparece em claro no cookie", () => {
  assert.equal(make().includes("rt-abc"), false);
  assert.equal(Buffer.from(make().split(".")[1], "base64url").toString().includes("rt-abc"), false);
});

test("segredo diferente invalida", () => {
  assert.equal(decodeLabCookie(make(), OTHER, NOW + 10), null);
});

test("vencido invalida", () => {
  assert.equal(decodeLabCookie(make(), SECRET, NOW + LAB_COOKIE_TTL_SECONDS), null);
});

test("emitido no futuro invalida", () => {
  assert.equal(decodeLabCookie(make(NOW + 3600), SECRET, NOW), null);
});

test("payload adulterado (outro admin ou perfil) invalida", () => {
  const [v, , vault, sig] = make().split(".");
  const forged = Buffer.from(
    JSON.stringify({ u: "99999999-2222-4333-8444-555555555555", p: "coach_filled", iat: NOW, exp: NOW + 60 })
  ).toString("base64url");
  assert.equal(decodeLabCookie([v, forged, vault, sig].join("."), SECRET, NOW + 10), null);
});

test("cofre adulterado invalida", () => {
  const parts = make().split(".");
  const raw = Buffer.from(parts[2], "base64url");
  raw[raw.length - 1] ^= 1;
  parts[2] = raw.toString("base64url");
  assert.equal(decodeLabCookie(parts.join("."), SECRET, NOW + 10), null);
});

test("lixo e vazio invalidam sem lançar", () => {
  for (const v of [null, undefined, "", "abc", "v1.a.b.c", "v2.a.b.c.d"]) {
    assert.equal(decodeLabCookie(v, SECRET, NOW), null);
  }
});

test("segredo curto recusado", () => {
  assert.throws(() => encodeLabCookie({ adminUserId: ADMIN, profileKey: "coach_filled", adminRefreshToken: "x" }, "curto", NOW));
  assert.equal(decodeLabCookie(make(), "curto", NOW + 1), null);
});

test("perfis: lista fechada", () => {
  assert.equal(isLabProfileKey("coach_filled"), true);
  assert.equal(isLabProfileKey("student_fresh"), true);
  assert.equal(isLabProfileKey("admin"), false);
  assert.equal(isLabProfileKey(undefined), false);
  assert.equal(labProfileLabel("coach_empty"), "Coach demo · Começar do zero");
});

test("e-mail demo só em domínio .test", () => {
  assert.equal(isReservedDemoEmail("coach.teste@trackly.test"), true);
  assert.equal(isReservedDemoEmail("alguem@gmail.com"), false);
  assert.equal(isReservedDemoEmail("x@trackly.test.com"), false);
  assert.equal(isReservedDemoEmail(null), false);
});

test("página-ponte: só aceita as áreas dos perfis", () => {
  assert.equal(labEntryDestination("/portal"), "/portal");
  assert.equal(labEntryDestination("/coach"), "/coach");
  for (const bad of ["/admin", "//evil.example", "https://evil.example/portal", "/portal/../admin", "", null, undefined, ["/portal"]]) {
    assert.equal(labEntryDestination(bad), null);
  }
});
