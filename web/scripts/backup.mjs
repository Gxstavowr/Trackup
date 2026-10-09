// Trackly — backup próprio do banco + fotos (o plano grátis do Supabase não tem backup).
//
//   npm run backup                      -> gera um backup novo, criptografado
//   npm run backup -- --verify <arquivo> -> abre o arquivo e compara com o banco real
//
// O QUE ENTRA: todas as tabelas expostas pela API (descobertas sozinhas — tabela nova entra
// automaticamente), a lista de logins (auth.users: id, e-mail, datas — SEM hash de senha, que o
// Supabase não exporta pela API) e todos os arquivos de todos os buckets do Storage (fotos).
// O schema não entra: ele já está versionado em supabase/migrations.
//
// SEGURANÇA (LGPD): são dados de saúde. O arquivo é gzip + AES-256-GCM com chave derivada
// (scrypt) de BACKUP_PASSPHRASE. Sem a frase não dá pra abrir — guarde-a FORA deste computador
// (gerenciador de senhas). Os backups vão pra BACKUP_DIR (padrão: ~/TracklyBackups), fora do
// projeto e do git. Mantém os BACKUP_KEEP mais recentes (padrão 8) e apaga os mais antigos.
//
// Lê com a service role — só leitura, nada é alterado no banco.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    out[line.slice(0, line.indexOf("=")).trim()] = line.slice(line.indexOf("=") + 1).trim();
  }
  return out;
}

const env = { ...parseEnvFile(path.join(ROOT, ".env.local")), ...process.env };
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PASSPHRASE = env.BACKUP_PASSPHRASE;
const DIR = env.BACKUP_DIR || path.join(os.homedir(), "TracklyBackups");
const KEEP = Number(env.BACKUP_KEEP || 8);

if (!URL || !KEY || !PASSPHRASE) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e/ou BACKUP_PASSPHRASE em web/.env.local.");
  process.exit(1);
}

const admin = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const MAGIC = Buffer.from("TRKBKP1");

function encrypt(plain) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptSync(PASSPHRASE, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

function decrypt(buf) {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Arquivo não é um backup do Trackly.");
  let o = MAGIC.length;
  const salt = buf.subarray(o, (o += 16)), iv = buf.subarray(o, (o += 12)), tag = buf.subarray(o, (o += 16));
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(PASSPHRASE, salt, 32), iv);
  decipher.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([decipher.update(buf.subarray(o)), decipher.final()]));
  } catch {
    throw new Error("Não foi possível abrir: BACKUP_PASSPHRASE errada ou arquivo corrompido.");
  }
}

async function listTables() {
  const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`Não foi possível listar as tabelas (HTTP ${res.status}).`);
  const spec = await res.json();
  return Object.keys(spec.paths || {})
    .filter((p) => p !== "/" && !p.startsWith("/rpc/"))
    .map((p) => p.slice(1))
    .sort();
}

async function dumpTable(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function dumpAuthUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth.users: ${error.message}`);
    users.push(
      ...data.users.map((u) => ({
        id: u.id, email: u.email, phone: u.phone, created_at: u.created_at,
        email_confirmed_at: u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at,
        user_metadata: u.user_metadata, app_metadata: u.app_metadata,
      }))
    );
    if (data.users.length < 1000) return users;
  }
}

async function listObjects(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`Storage ${bucket}/${prefix}: ${error.message}`);
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) out.push(full);
      else out.push(...(await listObjects(bucket, full)));
    }
    if (data.length < 1000) return out;
  }
}

async function dumpStorage() {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw new Error(`Storage: ${error.message}`);
  const files = [];
  for (const b of buckets) {
    for (const p of await listObjects(b.name)) {
      const { data, error: dlError } = await admin.storage.from(b.name).download(p);
      if (dlError) throw new Error(`Storage ${b.name}/${p}: ${dlError.message}`);
      files.push({ bucket: b.name, path: p, type: data.type, base64: Buffer.from(await data.arrayBuffer()).toString("base64") });
    }
  }
  return { buckets: buckets.map((b) => ({ name: b.name, public: b.public })), files };
}

async function backup() {
  const started = new Date();
  const tables = {};
  for (const t of await listTables()) tables[t] = await dumpTable(t);
  const auth_users = await dumpAuthUsers();
  const storage = await dumpStorage();

  const payload = {
    format: "trackly-backup/v1",
    created_at: started.toISOString(),
    project: new globalThis.URL(URL).hostname,
    tables,
    auth_users,
    storage,
  };

  mkdirSync(DIR, { recursive: true });
  const name = `trackly-${started.toISOString().replace(/[:.]/g, "-").slice(0, 19)}.trkbkp`;
  const file = path.join(DIR, name);
  writeFileSync(file, encrypt(Buffer.from(JSON.stringify(payload))));

  const old = readdirSync(DIR).filter((f) => /^trackly-.*\.trkbkp$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) rmSync(path.join(DIR, f));

  const rowCount = Object.values(tables).reduce((n, r) => n + r.length, 0);
  console.log(`Backup salvo: ${file}`);
  console.log(`${Object.keys(tables).length} tabelas, ${rowCount} linhas, ${auth_users.length} logins, ${storage.files.length} arquivos.`);
  if (old.length) console.log(`Apagados ${old.length} backups antigos (mantendo os ${KEEP} mais recentes).`);
}

async function verify(file) {
  const data = JSON.parse(decrypt(readFileSync(file)).toString("utf8"));
  console.log(`Backup de ${data.created_at} (${data.project}) aberto com sucesso.\n`);
  console.log("TABELA | no backup | no banco agora");
  let diff = 0;
  for (const t of await listTables()) {
    const { count } = await admin.from(t).select("*", { count: "exact", head: true });
    const inBackup = data.tables[t]?.length;
    if (inBackup !== count) diff++;
    console.log(`${t} | ${inBackup ?? "AUSENTE"} | ${count}${inBackup !== count ? "  <- diferente" : ""}`);
  }
  const bad = data.storage.files.filter((f) => !Buffer.from(f.base64, "base64").length).length;
  console.log(`\nlogins: ${data.auth_users.length} | arquivos: ${data.storage.files.length} (${bad} vazios)`);
  console.log(diff ? `\n${diff} tabela(s) diferentes — normal se houve uso do app depois do backup.` : "\nTudo bate com o banco atual.");
}

const args = process.argv.slice(2);
const run = args[0] === "--verify" ? verify(args[1]) : backup();
run.catch((err) => {
  console.error(`ERRO: ${err.message}`);
  process.exit(1);
});
