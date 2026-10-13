#!/usr/bin/env node
// Trackly — runner de migrations SQL (supabase/migrations/*.sql) contra o Postgres do Supabase.
//
// Uso (a partir de web/):
//   node scripts/migrate.mjs                         (= status)
//   node scripts/migrate.mjs status [--assume-through 0017]
//   node scripts/migrate.mjs baseline --through 0017
//   node scripts/migrate.mjs apply [--dry-run] [--assume-through 0017] [--through NNNN]
//
// Comandos
//   status    SÓ LEITURA. Lista o que já foi aplicado e o que está pendente. Não cria nada.
//   baseline  Registra 0001..N como aplicadas SEM rodar o SQL (as que já foram aplicadas à mão no
//             SQL Editor antes deste runner existir). Uma transação só.
//   apply     Roda as pendentes em ordem de nome. Cada arquivo roda NA SUA PRÓPRIA transação junto
//             com o registro no histórico: ou entra o arquivo inteiro + o registro, ou nada. Para no
//             primeiro erro (aquele arquivo é desfeito; os anteriores já ficaram aplicados).
//   apply --dry-run
//             Roda TODAS as pendentes numa única transação (cada uma enxerga o efeito das anteriores,
//             como no apply de verdade), inclusive a criação da tabela de histórico e os registros, e
//             no fim dá ROLLBACK. Serve pra validar o SQL contra o schema real. Nada fica gravado.
//
//   --assume-through NNNN
//             Só com `status` ou `apply --dry-run`: trata 0001..NNNN como aplicadas (sem gravar nada)
//             — útil antes do baseline existir. Recusado no apply de verdade.
//
// Histórico: trackly_meta.applied_migrations(filename, applied_at, checksum). O schema trackly_meta
// não é exposto pela API (anon/authenticated sem permissão nenhuma).
// Checksum: sha256 do arquivo com fim de linha normalizado (CRLF -> LF), pra não mudar com o
// autocrlf do git no Windows. Se um arquivo JÁ APLICADO mudou, baseline/apply se recusam a rodar.
//
// Arquivos com BEGIN/COMMIT/ROLLBACK próprios (linha solta) são recusados: o runner já controla a
// transação e um COMMIT interno gravaria de verdade até no --dry-run. As 0001–0017 (algumas têm
// begin/commit) entram pelo baseline, nunca pelo apply.
//
// Segredos: DATABASE_URL vem de web/.env.local (ou do ambiente) e NUNCA é impresso.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.resolve(ROOT, "..", "supabase", "migrations");
const HISTORY_TABLE = "trackly_meta.applied_migrations";
const LOCK_KEY = 74_201_018; // pg_advisory_lock: impede dois runners ao mesmo tempo

// ============================================================================
// .env.local (mesmo parser do seed-demo.mjs)
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

// ============================================================================
// Argumentos
// ============================================================================

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exit(1);
}

function parseNumberFlag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const raw = args[i + 1];
  if (!raw || !/^\d{1,4}$/.test(raw)) fail(`${name} precisa de um número de migration (ex.: ${name} 0017).`);
  args.splice(i, 2);
  return Number(raw);
}

const args = process.argv.slice(2);
const through = parseNumberFlag(args, "--through");
const assumeThrough = parseNumberFlag(args, "--assume-through");
const dryRunIdx = args.indexOf("--dry-run");
const dryRun = dryRunIdx !== -1;
if (dryRun) args.splice(dryRunIdx, 1);
const command = args.shift() ?? "status";
if (args.length > 0) fail(`argumento desconhecido: ${args.join(" ")}`);
if (!["status", "baseline", "apply"].includes(command)) fail(`comando desconhecido: ${command} (use status, baseline ou apply).`);
if (command === "baseline" && through === null) fail("baseline exige --through NNNN (ex.: --through 0017).");
if (command !== "baseline" && command !== "apply" && through !== null) fail("--through só vale com baseline ou apply.");
if (dryRun && command !== "apply") fail("--dry-run só vale com apply.");
if (assumeThrough !== null && !(command === "status" || (command === "apply" && dryRun))) {
  fail("--assume-through só vale com status ou apply --dry-run (nunca grava nada).");
}

// ============================================================================
// Arquivos
// ============================================================================

function checksumOf(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

function numberOf(filename) {
  return Number(filename.slice(0, 4));
}

/** Linha solta de controle de transação. `begin` de PL/pgSQL não tem `;` e `end;` de função não
 * entra na lista, então corpos de função/DO não disparam o filtro. */
const TX_CONTROL = /^\s*(begin|commit|rollback|start\s+transaction)\s*(transaction|work)?\s*;/im;

function loadMigrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) fail(`pasta de migrations não encontrada: ${MIGRATIONS_DIR}`);
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/i.test(f))
    .sort()
    .map((filename) => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      return { filename, number: numberOf(filename), sql, checksum: checksumOf(sql) };
    });
}

// ============================================================================
// Banco
// ============================================================================

const env = { ...parseEnvFile(path.join(ROOT, ".env.local")), ...process.env };
if (!env.DATABASE_URL) fail("DATABASE_URL não definido em web/.env.local.");

async function connect() {
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    application_name: "trackly-migrate",
  });
  try {
    await client.connect();
  } catch (err) {
    // Só código + mensagem do driver: nunca a connection string.
    fail(`não foi possível conectar ao banco (${err.code ?? "sem código"}): ${err.message}`);
  }
  return client;
}

async function historyExists(client) {
  const { rows } = await client.query("select to_regclass($1) is not null as ok", [HISTORY_TABLE]);
  return rows[0].ok;
}

async function readHistory(client) {
  if (!(await historyExists(client))) return null;
  const { rows } = await client.query(
    `select filename, applied_at, checksum from ${HISTORY_TABLE} order by filename`
  );
  return rows;
}

/** Idempotente. Roda dentro da transação de quem chama. */
async function ensureHistoryTable(client) {
  await client.query(`
    create schema if not exists trackly_meta;
    create table if not exists ${HISTORY_TABLE} (
      filename text primary key,
      applied_at timestamptz not null default now(),
      checksum text
    );
    revoke all on schema trackly_meta from public, anon, authenticated;
    revoke all on all tables in schema trackly_meta from public, anon, authenticated;
  `);
}

function describePgError(err) {
  const parts = [`${err.code ?? ""} ${err.message}`.trim()];
  if (err.detail) parts.push(`detalhe: ${err.detail}`);
  if (err.hint) parts.push(`dica: ${err.hint}`);
  if (err.position) parts.push(`posição: ${err.position}`);
  if (err.where) parts.push(`onde: ${err.where}`);
  return parts.join("\n  ");
}

// ============================================================================
// Estado
// ============================================================================

function computeState(files, history) {
  const byName = new Map((history ?? []).map((h) => [h.filename, h]));
  const fileNames = new Set(files.map((f) => f.filename));
  const changed = [];
  const pending = [];
  const applied = [];
  for (const f of files) {
    const h = byName.get(f.filename);
    if (h) {
      applied.push({ ...f, appliedAt: h.applied_at, assumed: false });
      if (h.checksum && h.checksum !== f.checksum) changed.push(f.filename);
    } else if (assumeThrough !== null && f.number <= assumeThrough) {
      applied.push({ ...f, appliedAt: null, assumed: true });
    } else {
      pending.push(f);
    }
  }
  const missing = (history ?? []).filter((h) => !fileNames.has(h.filename)).map((h) => h.filename);
  return { applied, pending, changed, missing };
}

function printState(state, history) {
  if (history === null) console.log(`Histórico: ${HISTORY_TABLE} ainda não existe (rode o baseline).`);
  if (assumeThrough !== null) {
    console.log(`(--assume-through ${String(assumeThrough).padStart(4, "0")}: 0001..${String(assumeThrough).padStart(4, "0")} tratadas como aplicadas, sem gravar)`);
  }
  console.log(`Aplicadas: ${state.applied.length}`);
  for (const a of state.applied) {
    const when = a.assumed ? "assumida" : new Date(a.appliedAt).toISOString();
    console.log(`  [x] ${a.filename}  (${when})`);
  }
  console.log(`Pendentes: ${state.pending.length}`);
  for (const p of state.pending) console.log(`  [ ] ${p.filename}`);
  for (const c of state.changed) {
    console.warn(`AVISO: ${c} foi ALTERADA depois de aplicada (checksum diferente do histórico).`);
  }
  for (const m of state.missing) {
    console.warn(`AVISO: ${m} está no histórico mas o arquivo não existe mais.`);
  }
}

// ============================================================================
// Comandos
// ============================================================================

async function withLock(client, fn) {
  const { rows } = await client.query("select pg_try_advisory_lock($1) as ok", [LOCK_KEY]);
  if (!rows[0].ok) fail("outro runner de migration está rodando agora (advisory lock ocupado).");
  try {
    return await fn();
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
  }
}

async function cmdStatus(client, files) {
  const history = await readHistory(client);
  printState(computeState(files, history), history);
}

async function cmdBaseline(client, files) {
  await withLock(client, async () => {
    const history = await readHistory(client);
    const state = computeState(files, history);
    if (state.changed.length) fail("há migration aplicada com checksum alterado — resolva antes do baseline.");
    const toRecord = state.pending.filter((f) => f.number <= through);
    if (toRecord.length === 0) {
      console.log(`Nada a registrar: 0001..${String(through).padStart(4, "0")} já estão no histórico.`);
      return;
    }
    await client.query("begin");
    try {
      await ensureHistoryTable(client);
      for (const f of toRecord) {
        await client.query(
          `insert into ${HISTORY_TABLE} (filename, checksum) values ($1, $2)`,
          [f.filename, f.checksum]
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      fail(`baseline desfeito:\n  ${describePgError(err)}`);
    }
    console.log(`Baseline: ${toRecord.length} migration(s) registradas como aplicadas SEM rodar:`);
    for (const f of toRecord) console.log(`  [x] ${f.filename}`);
  });
}

async function cmdApply(client, files) {
  await withLock(client, async () => {
    const history = await readHistory(client);
    const state = computeState(files, history);
    printState(state, history);
    if (state.changed.length) fail("há migration aplicada com checksum alterado — nada foi executado.");
    if (through !== null) {
      const later = state.pending.filter((f) => f.number > through);
      state.pending = state.pending.filter((f) => f.number <= through);
      if (later.length) console.log(`--through ${String(through).padStart(4, "0")}: ficam para depois ${later.map((f) => f.filename).join(", ")}`);
    }
    if (state.pending.length === 0) {
      console.log("Nada pendente.");
      return;
    }
    const withTx = state.pending.filter((f) => TX_CONTROL.test(f.sql));
    if (withTx.length) {
      fail(
        `arquivo(s) com BEGIN/COMMIT/ROLLBACK próprio(s): ${withTx.map((f) => f.filename).join(", ")}. ` +
          "O runner controla a transação — remova essas linhas (ou registre o arquivo via baseline)."
      );
    }

    if (dryRun) {
      console.log("\n--dry-run: tudo numa transação, ROLLBACK no fim. Nada é gravado.");
      await client.query("begin");
      try {
        await client.query("set local lock_timeout = '15s'");
        await ensureHistoryTable(client);
        for (const f of state.pending) {
          const t0 = Date.now();
          try {
            await client.query(f.sql);
            await client.query(
              `insert into ${HISTORY_TABLE} (filename, checksum) values ($1, $2)`,
              [f.filename, f.checksum]
            );
          } catch (err) {
            console.error(`FALHOU (dry-run): ${f.filename}\n  ${describePgError(err)}`);
            throw err;
          }
          console.log(`  OK (dry-run) ${f.filename}  ${Date.now() - t0} ms`);
        }
      } catch {
        await client.query("rollback").catch(() => {});
        process.exitCode = 1;
        console.log("ROLLBACK feito. Nada foi gravado.");
        return;
      }
      await client.query("rollback");
      console.log(`ROLLBACK feito. ${state.pending.length} arquivo(s) validados; nada foi gravado.`);
      return;
    }

    console.log("");
    for (const f of state.pending) {
      const t0 = Date.now();
      await client.query("begin");
      try {
        await client.query("set local lock_timeout = '15s'");
        await ensureHistoryTable(client);
        await client.query(f.sql);
        await client.query(
          `insert into ${HISTORY_TABLE} (filename, checksum) values ($1, $2)`,
          [f.filename, f.checksum]
        );
        await client.query("commit");
      } catch (err) {
        await client.query("rollback").catch(() => {});
        console.error(`FALHOU: ${f.filename} (desfeita; as anteriores continuam aplicadas)\n  ${describePgError(err)}`);
        process.exitCode = 1;
        return;
      }
      console.log(`  Aplicada ${f.filename}  ${Date.now() - t0} ms`);
    }
    console.log("Todas as pendentes foram aplicadas.");
  });
}

// ============================================================================
// Main
// ============================================================================

const files = loadMigrationFiles();
const client = await connect();
try {
  if (command === "status") await cmdStatus(client, files);
  else if (command === "baseline") await cmdBaseline(client, files);
  else await cmdApply(client, files);
} finally {
  await client.end().catch(() => {});
}
