#!/usr/bin/env node
import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);
import {
  ArchiveDatabase,
  Database
} from "./chunk-E6VJ2V3Q.mjs";

// src/archive.ts
import * as fs from "fs";
import * as os from "os";
import * as path2 from "path";
import * as zlib from "zlib";

// src/search.ts
import * as path from "path";
var SearchIndex = class {
  constructor(archiveDb, dataDir, v6) {
    this.archiveDb = archiveDb;
    this.v6 = v6;
    this.db = new Database(path.join(dataDir, "search.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 10000");
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS msg_fts USING fts5(
        content, session_id UNINDEXED, project UNINDEXED, role UNINDEXED, ts UNINDEXED,
        kind UNINDEXED, model UNINDEXED, tokenize = 'porter unicode61'
      );
      CREATE TABLE IF NOT EXISTS synced_sessions (session_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
    `);
  }
  db;
  close() {
    this.db.close();
  }
  /** Bring the index in step with archives.db. Returns sessions rebuilt. */
  sync() {
    const t0 = Date.now();
    const current = this.archiveDb.prepare(`
      SELECT p.session_id AS s,
             COUNT(*) || ':' || MAX(p.rowid) || ':' || COALESCE(SUM(LENGTH(p.content)), 0) || ':' || COALESCE(MAX(p.timestamp), 0)
               || ':' || COALESCE((SELECT GROUP_CONCAT(c.content_hash, ',') FROM transcript_chunks c WHERE c.session_id = p.session_id), '') AS f
      FROM parsed_messages p GROUP BY p.session_id
    `).all();
    const known = new Map(this.db.prepare("SELECT session_id, fingerprint FROM synced_sessions").all().map((x) => [x.session_id, x.fingerprint]));
    const projectOf = this.archiveDb.prepare("SELECT project_slug FROM session_metadata WHERE session_id = ?");
    const msgs = this.archiveDb.prepare("SELECT content, role, timestamp FROM parsed_messages WHERE session_id = ?");
    const del = this.db.prepare("DELETE FROM msg_fts WHERE session_id = ? AND kind = 'message'");
    const ins = this.db.prepare("INSERT INTO msg_fts (content, session_id, project, role, ts, kind, model) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const mark = this.db.prepare("INSERT OR REPLACE INTO synced_sessions (session_id, fingerprint) VALUES (?, ?)");
    let rebuilt = 0;
    let indexed = 0;
    const tx = this.db.transaction((rows) => {
      for (const c of rows) {
        if (known.get(c.s) === c.f) continue;
        del.run(c.s);
        const project = projectOf.get(c.s)?.project_slug ?? "";
        for (const m of msgs.iterate(c.s)) {
          if (!m.content) continue;
          ins.run(m.content, c.s, project, m.role, m.timestamp, "message", null);
          indexed++;
        }
        mark.run(c.s, c.f);
        rebuilt++;
      }
    });
    tx(current);
    return { sessionsRebuilt: rebuilt, messagesIndexed: indexed, ms: Date.now() - t0 };
  }
  /**
   * Ranked search. Plain words are ANDed and stemmed; "quoted phrases" stay phrases.
   * User text is tokenised here and every token quoted, so FTS5 syntax in a query cannot error or inject.
   */
  search(query, opts = {}) {
    const match = toMatchExpression(query);
    if (!match) return [];
    const where = ["msg_fts MATCH ?"];
    const params = [match];
    if (opts.projectSlug) {
      where.push("project = ?");
      params.push(opts.projectSlug);
    }
    if (opts.role) {
      where.push("role = ?");
      params.push(opts.role);
    }
    if (opts.kind) {
      where.push("kind = ?");
      params.push(opts.kind);
    }
    params.push(opts.limit ?? 10);
    const rows = this.db.prepare(`
      SELECT session_id, project, role, ts, kind, model,
             snippet(msg_fts, 0, '\xAB', '\xBB', ' \u2026 ', 24) AS snip, bm25(msg_fts) AS score
      FROM msg_fts WHERE ${where.join(" AND ")}
      ORDER BY score LIMIT ?
    `).all(...params);
    return rows.map((r) => ({
      sessionId: r.session_id,
      projectSlug: r.project,
      role: r.role,
      timestamp: r.ts,
      snippet: r.snip,
      score: -r.score,
      kind: r.kind,
      ...r.model ? { model: r.model } : {}
    }));
  }
  /** Sessions with no summary yet (or none from `model`), longest first: the most value per summary. */
  unsummarised(limit = 5, model) {
    const done = new Set(this.sessionSummaries().filter((x) => !model || x.model === model).map((x) => x.sessionId));
    const rows = this.archiveDb.prepare(`
      SELECT p.session_id AS sessionId, COALESCE(m.project_slug, '') AS projectSlug, COUNT(*) AS messages,
             m.last_message_at AS lastMessageAt
      FROM parsed_messages p LEFT JOIN session_metadata m ON m.session_id = p.session_id
      GROUP BY p.session_id ORDER BY messages DESC
    `).all();
    return rows.filter((r) => !done.has(r.sessionId)).slice(0, limit);
  }
  /** All V6 session-level summaries, with the model recovered from the id where Archive wrote it. */
  sessionSummaries(sessionId) {
    const rows = this.archiveDb.prepare(
      "SELECT id, summary, session_ids, created_at FROM summary_hierarchy WHERE level = 'session'" + (sessionId ? " AND session_ids LIKE ?" : "") + " ORDER BY created_at DESC"
    ).all(...sessionId ? [`%${sessionId}%`] : []);
    const out = [];
    for (const r of rows) {
      let ids = [];
      try {
        ids = JSON.parse(r.session_ids);
      } catch {
      }
      const m = /^sum_session_.+?__(.+)__\d+$/.exec(r.id);
      for (const sid of ids) {
        if (sessionId && sid !== sessionId) continue;
        out.push({ sessionId: sid, model: m ? decodeURIComponent(m[1]) : "unknown", createdAt: r.created_at, text: r.summary, sourceMessages: 0 });
      }
    }
    return out;
  }
  async addSummary(s) {
    const body = s.text.trim();
    if (body.length < 40) throw new Error("summary too short (min 40 chars) \u2014 write what the session decided and produced");
    const model = s.model.trim();
    if (!model) throw new Error("model is required \u2014 summaries are readings by a specific model");
    const span = this.archiveDb.prepare("SELECT MIN(timestamp) AS a, MAX(timestamp) AS b, COUNT(*) AS n FROM parsed_messages WHERE session_id = ?").get(s.sessionId);
    if (!span.n) throw new Error(`unknown session ${s.sessionId}`);
    const meta = await this.v6.getSessionMetadata(s.sessionId);
    const createdAt = s.createdAt ?? Date.now();
    const text = `[Summary by ${model}, ${new Date(createdAt).toISOString().slice(0, 10)}, from ${s.sourceMessages || "unstated"} messages read]
${body}`;
    await this.v6.upsertSummary({
      id: `sum_session_${s.sessionId}__${encodeURIComponent(model)}__${createdAt}`,
      level: "session",
      projectSlug: meta?.projectSlug ?? "",
      periodStart: span.a ?? createdAt,
      periodEnd: span.b ?? createdAt,
      summary: text,
      keyTopics: meta?.topics ?? [],
      keyDecisions: [],
      sessionIds: [s.sessionId]
    });
    this.db.prepare("INSERT INTO msg_fts (content, session_id, project, role, ts, kind, model) VALUES (?, ?, ?, ?, ?, ?, ?)").run(text, s.sessionId, meta?.projectSlug ?? "", "summary", createdAt, "summary", model);
    return { sessionId: s.sessionId, model, createdAt, text, sourceMessages: s.sourceMessages };
  }
  summaries(sessionId) {
    return this.sessionSummaries(sessionId);
  }
  stats() {
    const g = (sql) => this.db.prepare(sql).get().n;
    return {
      indexedMessages: g("SELECT COUNT(*) AS n FROM msg_fts WHERE kind = 'message'"),
      summaries: this.sessionSummaries().length,
      summarisedSessions: new Set(this.sessionSummaries().map((x) => x.sessionId)).size
    };
  }
};
function toMatchExpression(q) {
  const parts = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while (m = re.exec(q)) {
    const raw = (m[1] ?? m[2]).replace(/"/g, "");
    const tokens = raw.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
    if (tokens.length === 0) continue;
    parts.push(m[1] ? `"${tokens.join(" ")}"` : tokens.map((t) => `"${t}"`).join(" "));
  }
  return parts.join(" ");
}

// src/archive.ts
function defaultDataDir() {
  return process.env.ROOTZ_ARCHIVE_DIR || path2.join(process.env.APPDATA || process.env.HOME || os.homedir(), ".rootz-desktop");
}
function claudeProjectsDir() {
  return path2.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), ".claude", "projects");
}
var LocalArchive = class _LocalArchive {
  db;
  search;
  constructor(db, dataDir) {
    this.db = db;
    this.search = new SearchIndex(this.sql, dataDir, db);
  }
  static async open(dataDir = defaultDataDir()) {
    const db = new ArchiveDatabase(dataDir);
    await db.initialize();
    db.db.pragma("busy_timeout = 10000");
    return new _LocalArchive(db, dataDir);
  }
  close() {
    this.search.close();
    this.db.close();
  }
  /** Raw better-sqlite3 handle, for the few reads ArchiveDatabase has no method for. */
  get sql() {
    return this.db.db;
  }
  listProjects() {
    return this.sql.prepare(`
      SELECT project_slug AS projectSlug, COUNT(*) AS sessionCount,
             MAX(COALESCE(last_message_at, updated_at)) AS lastActive
      FROM session_metadata
      WHERE project_slug IS NOT NULL AND project_slug != ''
      GROUP BY project_slug
      ORDER BY lastActive DESC
    `).all();
  }
  async getTranscript(sessionId) {
    const chunks = this.sql.prepare(
      "SELECT chunk_index, compressed_content FROM transcript_chunks WHERE session_id = ? ORDER BY chunk_index ASC"
    ).all(sessionId);
    const withRaw = chunks.filter((c) => c.compressed_content);
    if (withRaw.length > 0 && withRaw.length === chunks.length) {
      const parts = withRaw.map((c) => zlib.gunzipSync(Buffer.from(c.compressed_content, "base64")).toString("utf-8"));
      const jsonl = parts.join("\n");
      return { sessionId, source: "archived-raw", chunkCount: chunks.length, jsonl, messages: parseJsonl(jsonl) };
    }
    const live = findSourceFile(sessionId);
    if (live) {
      const jsonl = fs.readFileSync(live, "utf-8");
      return { sessionId, source: "live-source-file", chunkCount: chunks.length, jsonl, messages: parseJsonl(jsonl) };
    }
    const parsed = await this.db.searchMessages("", { sessionId, limit: 1e5 });
    if (parsed.length === 0) return null;
    parsed.sort((a, b) => a.turnIndex - b.turnIndex);
    return {
      sessionId,
      source: "parsed-only",
      chunkCount: chunks.length,
      messages: parsed.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp }))
    };
  }
};
function findSourceFile(sessionId) {
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) return null;
  const root = claudeProjectsDir();
  if (!fs.existsSync(root)) return null;
  for (const dir of fs.readdirSync(root)) {
    const candidate = path2.join(root, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b) => {
      if (typeof b === "string") return b;
      if (b && typeof b === "object") {
        const block = b;
        if (typeof block.text === "string") return block.text;
        if (block.type === "tool_use") return `[tool_use ${String(block.name)}]`;
        if (block.type === "tool_result") return `[tool_result] ${contentToText(block.content)}`;
      }
      return "";
    }).filter(Boolean).join("\n");
  }
  return "";
}
function parseJsonl(jsonl) {
  const out = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = entry.message;
    if (!msg) continue;
    const text = contentToText(msg.content);
    if (!text) continue;
    const ts = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : void 0;
    out.push({ role: msg.role === "user" ? "human" : msg.role || String(entry.type), content: text, timestamp: ts });
  }
  return out;
}

// src/vault.ts
import * as crypto from "crypto";
import * as fs2 from "fs";
import * as os2 from "os";
import * as path3 from "path";
import * as zlib2 from "zlib";
var MANIFEST_VERSION = 1;
function defaultVaultDir() {
  return process.env.ROOTZ_VAULT_DIR || path3.join(os2.homedir(), ".rootz-archive", "vault");
}
function claudeCodeSource(home = os2.homedir()) {
  return {
    name: "claude-code",
    root: path3.join(home, ".claude"),
    classify: (rel) => {
      const r = rel.split(path3.sep).join("/");
      if (r.startsWith("projects/")) {
        if (r.includes("/subagents/") && r.endsWith(".jsonl")) return "subagent-transcript";
        if (r.includes("/tool-results/")) return "tool-result";
        if (r.includes("/memory/")) return "memory";
        if (r.endsWith(".jsonl")) return "transcript";
        return "other";
      }
      if (r.startsWith("file-history/")) return "file-history";
      if (r === "history.jsonl") return "prompt-history";
      return null;
    }
  };
}
var sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
function* walk(dir) {
  let entries;
  try {
    entries = fs2.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path3.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}
function blobPath(vault, hash) {
  return path3.join(vault, "blobs", hash.slice(0, 2), hash);
}
function putBlob(vault, bytes) {
  const h = sha(bytes);
  const p = blobPath(vault, h);
  if (!fs2.existsSync(p)) {
    fs2.mkdirSync(path3.dirname(p), { recursive: true });
    const tmp = `${p}.tmp-${process.pid}`;
    fs2.writeFileSync(tmp, zlib2.gzipSync(bytes));
    fs2.renameSync(tmp, p);
  }
  return h;
}
function readBlob(vault, hash) {
  return zlib2.gunzipSync(fs2.readFileSync(blobPath(vault, hash)));
}
function readManifest(vault) {
  const p = path3.join(vault, "manifest.jsonl");
  if (!fs2.existsSync(p)) return [];
  return fs2.readFileSync(p, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
function loadState(vault) {
  const p = path3.join(vault, "state.json");
  try {
    return JSON.parse(fs2.readFileSync(p, "utf-8"));
  } catch {
  }
  const s = {};
  for (const r of readManifest(vault)) s[`${r.source}:${r.path}`] = { sha256: r.sha256, size: r.size, mtimeMs: r.mtimeMs };
  return s;
}
function snapshot(sources, vault = defaultVaultDir(), now = () => /* @__PURE__ */ new Date()) {
  fs2.mkdirSync(vault, { recursive: true });
  const lockPath = path3.join(vault, ".lock");
  let lock;
  try {
    lock = fs2.openSync(lockPath, "wx");
  } catch {
    const age = Date.now() - fs2.statSync(lockPath).mtimeMs;
    if (age < 30 * 6e4) return { scanned: 0, captured: 0, appended: 0, whole: 0, unchanged: 0, bytesStored: 0, errors: ["another snapshot is running"] };
    fs2.rmSync(lockPath);
    lock = fs2.openSync(lockPath, "wx");
  }
  const res = { scanned: 0, captured: 0, appended: 0, whole: 0, unchanged: 0, bytesStored: 0, errors: [] };
  const state = loadState(vault);
  const manifest = fs2.openSync(path3.join(vault, "manifest.jsonl"), "a");
  try {
    for (const src of sources) {
      for (const abs of walk(src.root)) {
        const rel = path3.relative(src.root, abs);
        const kind = src.classify(rel);
        if (!kind) continue;
        res.scanned++;
        try {
          const st = fs2.statSync(abs);
          const key = `${src.name}:${rel}`;
          const prev = state[key];
          if (prev && prev.size === st.size && prev.mtimeMs === Math.floor(st.mtimeMs)) {
            res.unchanged++;
            continue;
          }
          const bytes = fs2.readFileSync(abs);
          const full = sha(bytes);
          if (prev && prev.sha256 === full) {
            state[key] = { ...prev, mtimeMs: Math.floor(st.mtimeMs) };
            res.unchanged++;
            continue;
          }
          let blob;
          let base = null;
          let baseSize = 0;
          if (prev && bytes.length > prev.size && sha(bytes.subarray(0, prev.size)) === prev.sha256) {
            blob = putBlob(vault, bytes.subarray(prev.size));
            base = prev.sha256;
            baseSize = prev.size;
            res.appended++;
            res.bytesStored += bytes.length - prev.size;
          } else {
            blob = putBlob(vault, bytes);
            res.whole++;
            res.bytesStored += bytes.length;
          }
          const rec = {
            v: MANIFEST_VERSION,
            scheme: "rootz-archive-vault/1",
            capturedAt: now().toISOString(),
            host: os2.hostname(),
            source: src.name,
            kind,
            path: rel.split(path3.sep).join("/"),
            size: bytes.length,
            mtimeMs: Math.floor(st.mtimeMs),
            sha256: full,
            blob,
            base,
            baseSize
          };
          fs2.writeSync(manifest, JSON.stringify(rec) + "\n");
          state[key] = { sha256: full, size: bytes.length, mtimeMs: rec.mtimeMs };
          res.captured++;
        } catch (e) {
          res.errors.push(`${rel}: ${e.message}`);
        }
      }
    }
  } finally {
    fs2.closeSync(manifest);
    fs2.writeFileSync(path3.join(vault, "state.json.tmp"), JSON.stringify(state));
    fs2.renameSync(path3.join(vault, "state.json.tmp"), path3.join(vault, "state.json"));
    fs2.closeSync(lock);
    fs2.rmSync(lockPath, { force: true });
  }
  return res;
}
function reconstruct(vault, rec, bySha) {
  const parts = [];
  let r = rec;
  for (let guard = 0; r; guard++) {
    if (guard > 1e5) throw new Error("tail chain too long or cyclic");
    parts.unshift(readBlob(vault, r.blob));
    if (!r.base) break;
    const next = bySha.get(r.base);
    if (!next) throw new Error(`missing base version ${r.base}`);
    if (next.size !== r.baseSize) throw new Error(`base size mismatch for ${r.path}`);
    r = next;
  }
  return Buffer.concat(parts);
}
function verify(vault = defaultVaultDir()) {
  const recs = readManifest(vault);
  const bySha = /* @__PURE__ */ new Map();
  for (const r of recs) bySha.set(r.sha256, r);
  const out = { records: recs.length, ok: 0, failures: [] };
  for (const r of recs) {
    try {
      const bytes = reconstruct(vault, r, bySha);
      if (bytes.length !== r.size) throw new Error(`size ${bytes.length} != recorded ${r.size}`);
      if (sha(bytes) !== r.sha256) throw new Error("sha256 mismatch");
      out.ok++;
    } catch (e) {
      out.failures.push({ path: r.path, sha256: r.sha256, error: e.message });
    }
  }
  return out;
}
function writeHeartbeat(vault, r, at = /* @__PURE__ */ new Date()) {
  const hb = { at: at.toISOString(), captured: r.captured, errors: r.errors.slice(0, 5) };
  fs2.writeFileSync(path3.join(vault, "heartbeat.json"), JSON.stringify(hb));
}
function writeVerifyMark(vault, r, at = /* @__PURE__ */ new Date()) {
  const m = { at: at.toISOString(), records: r.records, ok: r.ok, failures: r.failures.length };
  fs2.writeFileSync(path3.join(vault, "last-verify.json"), JSON.stringify(m));
}
var readJson = (p) => {
  try {
    return JSON.parse(fs2.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
};
var ago = (ms) => ms < 9e4 ? "just now" : ms < 90 * 6e4 ? `${Math.round(ms / 6e4)} min ago` : ms < 48 * 36e5 ? `${Math.round(ms / 36e5)} hours ago` : `${Math.round(ms / 864e5)} days ago`;
function health(vault = defaultVaultDir(), now = Date.now(), staleAfterMs = 30 * 6e4) {
  const details = [];
  const hb = readJson(path3.join(vault, "heartbeat.json"));
  const vm = readJson(path3.join(vault, "last-verify.json"));
  const recs = fs2.existsSync(path3.join(vault, "manifest.jsonl")) ? readManifest(vault) : [];
  const conversations = new Set(recs.filter((r) => r.kind === "transcript" || r.kind === "subagent-transcript").map((r) => r.path)).size;
  const files = new Set(recs.filter((r) => r.kind === "file-history").map((r) => r.path)).size;
  if (!hb) return { state: "amber", headline: "Archive has not run yet on this computer.", details: [`Vault: ${vault}`] };
  const age = now - Date.parse(hb.at);
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  details.push(`${n(conversations, "conversation", "conversations")} and ${n(files, "AI-edited file", "AI-edited files")} captured (${n(recs.length, "saved version", "saved versions")}).`);
  details.push(`Last capture run: ${ago(age)} (${hb.at}).`);
  if (vm) details.push(`Last integrity check: ${vm.ok} of ${vm.records} verified, ${ago(now - Date.parse(vm.at))}.`);
  else details.push("Integrity has not been checked yet.");
  if (vm && vm.failures > 0) {
    return { state: "red", headline: `${vm.failures} of ${vm.records} saved versions do not match their fingerprint.`, details: [...details, "Run: vault.mjs verify \u2014 for the list."] };
  }
  if (hb.errors.length) {
    return { state: "amber", headline: `Last capture had ${hb.errors.length} problem(s).`, details: [...details, ...hb.errors.map((e) => `Problem: ${e}`)] };
  }
  if (age > staleAfterMs) {
    return { state: "amber", headline: `Not captured for ${ago(age).replace(" ago", "")}: the background capture has not run.`, details };
  }
  return { state: "green", headline: `Captured \xB7 last capture ${ago(age)}`, details };
}

// src/licence.ts
import * as fs3 from "fs";
import * as os3 from "os";
import * as path4 from "path";
var LICENCE_VERSION = "1.1";
var LICENCE_FILE = "LICENSE.md";
var file = () => path4.join(process.env.ROOTZ_ARCHIVE_HOME || path4.join(os3.homedir(), ".rootz-archive"), "licence-accepted.json");
function acceptance() {
  try {
    const a = JSON.parse(fs3.readFileSync(file(), "utf-8"));
    return a.version === LICENCE_VERSION ? a : null;
  } catch {
    return null;
  }
}
function accept(now = /* @__PURE__ */ new Date()) {
  const a = { version: LICENCE_VERSION, acceptedAt: now.toISOString(), host: os3.hostname() };
  fs3.mkdirSync(path4.dirname(file()), { recursive: true });
  fs3.appendFileSync(path4.join(path4.dirname(file()), "licence-acceptances.jsonl"), JSON.stringify(a) + "\n");
  fs3.writeFileSync(file(), JSON.stringify(a));
  return a;
}
var NOT_ACCEPTED_MESSAGE = `Rootz Archive is installed but NOT archiving yet. To start, read the licence (${LICENCE_FILE} in the Rootz Archive plugin folder) and type /rootz-archive:accept to accept it.`;

// src/version.ts
var SERVER_VERSION = "0.4.6";
var MIN_NODE = "22.13";
function nodeOk(v = process.versions.node) {
  const [maj, min] = v.split(".").map(Number);
  return maj > 22 || maj === 22 && min >= 13;
}
var NODE_TOO_OLD_MESSAGE = (v = process.versions.node) => `Rootz Archive needs Node.js ${MIN_NODE} or newer (this computer has ${v}). Your conversations are NOT being archived. Install Node.js 22.13 or newer (see the plugin README), then start a new Claude Code session.`;

export {
  defaultDataDir,
  LocalArchive,
  defaultVaultDir,
  claudeCodeSource,
  snapshot,
  verify,
  writeHeartbeat,
  writeVerifyMark,
  health,
  LICENCE_VERSION,
  LICENCE_FILE,
  acceptance,
  accept,
  NOT_ACCEPTED_MESSAGE,
  SERVER_VERSION,
  nodeOk,
  NODE_TOO_OLD_MESSAGE
};
