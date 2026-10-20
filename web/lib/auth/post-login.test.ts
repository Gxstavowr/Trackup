import { test } from "node:test";
import assert from "node:assert/strict";
import { postLoginDestination, safeInternalPath } from "./post-login";

test("admin vai para /admin por padrão, mesmo com perfil de coach", () => {
  assert.equal(postLoginDestination({ isAdmin: true, home: "/coach" }), "/admin");
  assert.equal(postLoginDestination({ isAdmin: true, home: null }), "/admin");
});
test("admin respeita next interno e seguro", () => {
  assert.equal(postLoginDestination({ isAdmin: true, home: "/coach", next: "/coach/alunos" }), "/coach/alunos");
  assert.equal(postLoginDestination({ isAdmin: true, home: "/coach", next: "/admin/coaches" }), "/admin/coaches");
});
test("next inseguro é ignorado", () => {
  for (const bad of ["//evil.com", "https://evil.com", "javascript:1", "/\\evil", "", null, undefined]) {
    assert.equal(postLoginDestination({ isAdmin: true, home: "/coach", next: bad }), "/admin");
  }
  assert.equal(safeInternalPath("/ok?x=1"), "/ok?x=1");
});
test("não-admin mantém o home e ignora next", () => {
  assert.equal(postLoginDestination({ isAdmin: false, home: "/coach", next: "/admin" }), "/coach");
  assert.equal(postLoginDestination({ isAdmin: false, home: "/portal" }), "/portal");
  assert.equal(postLoginDestination({ isAdmin: false, home: null }), null);
});
