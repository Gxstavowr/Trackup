#!/usr/bin/env node
// Trackly — upgrade IDEMPOTENTE do template de check-in das contas existentes (V3, tarefa 6).
//
// Acrescenta ao template PADRÃO de cada conta as perguntas do sistema que faltam, pelo catálogo
// em lib/checkin-catalog.ts (a MESMA lista que o cadastro de coach novo usa). Regras:
//  - template padrão = o template MAIS ANTIGO da conta (created_at, desempate por id). Não existe
//    flag no banco; é o mesmo critério que o app inteiro usa para montar o formulário do aluno
//    (`getTemplateWithQuestions`), a configuração de perguntas e a avaliação. Outros templates da
//    conta (personalizações) são pulados e só listados.
//  - só INSERE perguntas cuja `key` não existe no template (ativa OU arquivada) — nunca altera,
//    reordena, reativa nem apaga as existentes; as novas entram depois da maior sort_order.
//  - rodar de novo não insere nada (0 inserts). Respostas antigas não são tocadas.
//  - conta sem template: só avisa (não cria).
//
// Uso (a partir de web/):
//   node scripts/upgrade-checkin-template.mjs                       # dry-run, todas as contas
//   node scripts/upgrade-checkin-template.mjs --account <uuid>      # dry-run, uma conta
//   node scripts/upgrade-checkin-template.mjs --coach-email <email> # dry-run, conta desse coach
//   ... --apply                                                     # grava de verdade
//
// Usa a service role de web/.env.local (mesmo carregamento de scripts/seed-demo.mjs). O catálogo
// é importado direto do .ts (Node 22.18+/24 remove os tipos sozinho).

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const { missingCatalogQuestions, CHECKIN_CATALOG } = await import(
  pathToFileURL(path.join(ROOT, "lib", "checkin-catalog.ts")).href
);

// ============================================================================
// Argumentos
// ============================================================================

const argv = process.argv.slice(2);
function argValue(name) {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith("--")) {
    console.error(`Faltou o valor de ${name}.`);
    process.exit(1);
  }
  return v;
}
const APPLY = argv.includes("--apply");
const ONLY_ACCOUNT = argValue("--account");
const COACH_EMAIL = argValue("--coach-email");

// ============================================================================
// .env.local (mesmo parser de seed-demo.mjs)
// ============================================================================

function parseEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...parseEnvFile(path.join(ROOT, ".env.local")), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY em web/.env.local.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fail(message, error) {
  console.error(`ERRO: ${message}${error ? ` — ${error.message ?? error}` : ""}`);
  process.exit(1);
}

// ============================================================================
// Contas-alvo
// ============================================================================

async function resolveAccounts() {
  if (COACH_EMAIL) {
    const { data, error } = await admin
      .from("coach_users")
      .select("account_id, email")
      .ilike("email", COACH_EMAIL);
    if (error) fail("não foi possível buscar o coach", error);
    if (!data || data.length === 0) fail(`nenhum coach com o e-mail ${COACH_EMAIL}`);
    const ids = [...new Set(data.map((r) => r.account_id))];
    console.log(`Coach ${COACH_EMAIL} -> account_id ${ids.join(", ")}`);
    return ids;
  }
  if (ONLY_ACCOUNT) return [ONLY_ACCOUNT];
  const { data, error } = await admin.from("accounts").select("id").order("created_at", { ascending: true });
  if (error) fail("não foi possível listar as contas", error);
  return (data ?? []).map((r) => r.id);
}

async function coachEmails(accountId) {
  const { data } = await admin.from("coach_users").select("email").eq("account_id", accountId);
  return (data ?? []).map((r) => r.email).join(", ") || "(sem coach)";
}

// ============================================================================
// Upgrade de uma conta
// ============================================================================

async function upgradeAccount(accountId) {
  const { data: templates, error: tplError } = await admin
    .from("checkin_templates")
    .select("id, name, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (tplError) fail(`conta ${accountId}: não foi possível ler os templates`, tplError);

  const header = `Conta ${accountId} [${await coachEmails(accountId)}]`;
  if (!templates || templates.length === 0) {
    console.log(`${header}\n  sem template de check-in — pulada (nada a fazer).`);
    return { inserted: 0, missing: 0 };
  }
  const [defaultTpl, ...others] = templates;

  const loadKeys = async () => {
    const { data, error } = await admin
      .from("checkin_questions")
      .select("key, sort_order, active")
      .eq("template_id", defaultTpl.id);
    if (error) fail(`conta ${accountId}: não foi possível ler as perguntas`, error);
    return data ?? [];
  };

  const existing = await loadKeys();
  const missing = missingCatalogQuestions(existing);
  console.log(
    `${header}\n  template padrão ${defaultTpl.id} ("${defaultTpl.name}") — ${existing.length} perguntas` +
      ` (${existing.filter((q) => q.active).length} ativas); faltam ${missing.length} do catálogo` +
      (missing.length ? `: ${missing.map((r) => r.key).join(", ")}` : "")
  );
  for (const t of others) {
    console.log(`  template ${t.id} ("${t.name}") não é o padrão — pulado.`);
  }
  if (missing.length === 0 || !APPLY) return { inserted: 0, missing: missing.length };

  // Relê logo antes de gravar (outro processo/coach pode ter mexido) e recalcula.
  const fresh = missingCatalogQuestions(await loadKeys());
  if (fresh.length === 0) return { inserted: 0, missing: 0 };
  const { data: inserted, error: insError } = await admin
    .from("checkin_questions")
    .insert(fresh.map((row) => ({ ...row, template_id: defaultTpl.id, active: true })))
    .select("key");
  if (insError) fail(`conta ${accountId}: insert recusado (nada foi contornado)`, insError);
  console.log(`  inseridas ${inserted?.length ?? 0}: ${(inserted ?? []).map((r) => r.key).join(", ")}`);

  // Conferência: nenhuma chave duplicada no template.
  const after = await loadKeys();
  const counts = new Map();
  for (const q of after) counts.set(q.key, (counts.get(q.key) ?? 0) + 1);
  const dupes = [...counts].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupes.length) console.log(`  ATENÇÃO: chaves duplicadas no template: ${dupes.join(", ")}`);
  return { inserted: inserted?.length ?? 0, missing: fresh.length };
}

// ============================================================================
// Main
// ============================================================================

console.log(
  `Upgrade do template de check-in — ${APPLY ? "APPLY (grava)" : "DRY-RUN (não grava nada; use --apply)"}` +
    ` — catálogo com ${CHECKIN_CATALOG.length} perguntas do sistema`
);
const accounts = await resolveAccounts();
let totalInserted = 0;
let totalMissing = 0;
for (const accountId of accounts) {
  const r = await upgradeAccount(accountId);
  totalInserted += r.inserted;
  totalMissing += r.missing;
}
console.log(
  `\nResumo: ${accounts.length} conta(s); ${totalMissing} pergunta(s) faltando; ${totalInserted} inserida(s).`
);
