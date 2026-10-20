import assert from "node:assert/strict";
import { test } from "node:test";
import { isMissingSchemaError } from "./db-error";

test("tabela/view/função inexistente é 'missing'", () => {
  assert.equal(isMissingSchemaError({ code: "42P01" }), true);
  assert.equal(isMissingSchemaError({ code: "PGRST205" }), true);
  assert.equal(isMissingSchemaError({ code: "PGRST202" }), true);
  assert.equal(isMissingSchemaError({ message: 'relation "x" does not exist' }), true);
  assert.equal(isMissingSchemaError({ message: "Could not find the table 'public.x' in the schema cache" }), true);
});

test("outros erros não são 'missing'", () => {
  assert.equal(isMissingSchemaError({ code: "57014", message: "statement timeout" }), false);
  assert.equal(isMissingSchemaError({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingSchemaError({ message: "fetch failed" }), false);
  assert.equal(isMissingSchemaError(null), false);
  assert.equal(isMissingSchemaError(undefined), false);
});
