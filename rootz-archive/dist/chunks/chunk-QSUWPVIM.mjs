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
             'v2:' || COUNT(*) || ':' || MAX(p.rowid) || ':' || COALESCE(SUM(LENGTH(p.content)), 0) || ':' || COALESCE(MAX(p.timestamp), 0)
               || ':' || COALESCE((SELECT GROUP_CONCAT(c.content_hash, ',') FROM transcript_chunks c WHERE c.session_id = p.session_id), '') AS f
      FROM parsed_messages p GROUP BY p.session_id
    `).all();
    const known = new Map(this.db.prepare("SELECT session_id, fingerprint FROM synced_sessions").all().map((x) => [x.session_id, x.fingerprint]));
    const projectOf = this.archiveDb.prepare("SELECT project_slug FROM session_metadata WHERE session_id = ?");
    const msgs = this.archiveDb.prepare("SELECT content, role, MIN(timestamp) AS timestamp FROM parsed_messages WHERE session_id = ? GROUP BY role, content, timestamp");
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
    const limit = opts.limit ?? 10;
    params.push(limit * 5);
    const rows = this.db.prepare(`
      SELECT session_id, project, role, ts, kind, model,
             snippet(msg_fts, 0, '\xAB', '\xBB', ' \u2026 ', 24) AS snip, bm25(msg_fts) AS score
      FROM msg_fts WHERE ${where.join(" AND ")}
      ORDER BY score LIMIT ?
    `).all(...params);
    const now = Date.now();
    const seen = /* @__PURE__ */ new Set();
    return rows.map((r) => {
      const ageDays = r.ts ? Math.max(0, (now - r.ts) / 864e5) : 365;
      return { r, rank: -r.score * (1 + 0.5 / (1 + ageDays / 30)) };
    }).sort((a, b) => b.rank - a.rank).filter(({ r }) => {
      const k = `${r.session_id}|${r.snip}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, limit).map(({ r, rank }) => ({
      sessionId: r.session_id,
      projectSlug: r.project,
      role: r.role,
      timestamp: r.ts,
      snippet: r.snip,
      score: rank,
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
function restrictDbFiles(dataDir) {
  try {
    fs.chmodSync(dataDir, 448);
  } catch {
  }
  for (const f of ["archives.db", "archives.db-wal", "archives.db-shm", "search.db", "search.db-wal", "search.db-shm"]) {
    try {
      fs.chmodSync(path2.join(dataDir, f), 384);
    } catch {
    }
  }
}
var LocalArchive = class _LocalArchive {
  constructor(db, dataDir) {
    this.dataDir = dataDir;
    this.db = db;
    this.search = new SearchIndex(this.sql, dataDir, db);
  }
  db;
  search;
  static async open(dataDir = defaultDataDir()) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 448 });
    const db = new ArchiveDatabase(dataDir);
    await db.initialize();
    restrictDbFiles(dataDir);
    db.db.pragma("busy_timeout = 10000");
    return new _LocalArchive(db, dataDir);
  }
  close() {
    restrictDbFiles(this.dataDir);
    this.search.close();
    this.db.close();
  }
  /** Oldest and newest searchable conversation (ms) and the number of projects, for the dashboard. */
  async timeSpan() {
    const r = this.sql.prepare(
      "SELECT MIN(first_message_at) AS oldest, MAX(last_message_at) AS newest, COUNT(DISTINCT project_slug) AS projects FROM session_metadata"
    ).get();
    return { oldest: r.oldest ?? null, newest: r.newest ?? null, projects: r.projects ?? 0 };
  }
  /** Raw better-sqlite3 handle, for the few reads ArchiveDatabase has no method for. */
  get sql() {
    return this.db.db;
  }
  /**
   * Index Claude Code sessions into the archive, skipping projects the user excluded. Uses the exact-match projectFilter
   * of V6's indexLocalSessions, one project folder at a time, so no excluded folder is ever read.
   */
  async indexProjects(opts = {}) {
    const total = { filesScanned: 0, filesIndexed: 0, filesSkipped: 0, filesErrored: 0, totalMessagesIndexed: 0, errors: [] };
    const root = claudeProjectsDir();
    if (!fs.existsSync(root)) return total;
    const excluded = new Set(opts.excludeProjects ?? []);
    for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory() || excluded.has(dir.name)) continue;
      if (opts.projectFilter && !dir.name.includes(opts.projectFilter)) continue;
      const r = await this.db.indexLocalSessions({ projectFilter: dir.name, limit: opts.limit ?? 1e5, forceReindex: opts.forceReindex });
      total.filesScanned += r.filesScanned;
      total.filesIndexed += r.filesIndexed;
      total.filesSkipped += r.filesSkipped;
      total.filesErrored += r.filesErrored;
      total.totalMessagesIndexed += r.totalMessagesIndexed;
      total.errors.push(...r.errors);
    }
    return total;
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

// src/settings.ts
import * as fs2 from "fs";
import * as os2 from "os";
import * as path3 from "path";
var home = () => process.env.ROOTZ_ARCHIVE_HOME || path3.join(os2.homedir(), ".rootz-archive");
var file = () => path3.join(home(), "settings.json");
function readSettings() {
  try {
    const s = JSON.parse(fs2.readFileSync(file(), "utf-8"));
    return { paused: s.paused === true, excludeProjects: Array.isArray(s.excludeProjects) ? s.excludeProjects.filter((x) => typeof x === "string") : [] };
  } catch {
    return { paused: false, excludeProjects: [] };
  }
}
function writeSettings(s) {
  fs2.mkdirSync(home(), { recursive: true, mode: 448 });
  fs2.writeFileSync(file(), JSON.stringify(s, null, 2) + "\n", { mode: 384 });
}
var projectSlug = (p) => path3.resolve(p).replace(/[^A-Za-z0-9-]/g, "-");

// src/licence.ts
import * as fs3 from "fs";
import * as os3 from "os";
import * as path4 from "path";
var LICENCE_VERSION = "1.1";
var LICENCE_FILE = "LICENSE.md";
var file2 = () => path4.join(process.env.ROOTZ_ARCHIVE_HOME || path4.join(os3.homedir(), ".rootz-archive"), "licence-accepted.json");
function acceptance() {
  try {
    const a = JSON.parse(fs3.readFileSync(file2(), "utf-8"));
    return a.version === LICENCE_VERSION ? a : null;
  } catch {
    return null;
  }
}
function accept(now = /* @__PURE__ */ new Date(), method = "claude-code-command") {
  const a = { version: LICENCE_VERSION, acceptedAt: now.toISOString(), host: os3.hostname(), method };
  fs3.mkdirSync(path4.dirname(file2()), { recursive: true, mode: 448 });
  fs3.appendFileSync(path4.join(path4.dirname(file2()), "licence-acceptances.jsonl"), JSON.stringify(a) + "\n", { mode: 384 });
  fs3.writeFileSync(file2(), JSON.stringify(a), { mode: 384 });
  return a;
}
function acceptFromInstallSetting() {
  const v = (process.env.ROOTZ_ARCHIVE_ACCEPT_LICENCE ?? "").trim().toLowerCase();
  if (v !== "true" && v !== "1") return null;
  return acceptance() ?? accept(/* @__PURE__ */ new Date(), "claude-desktop-install-setting");
}
function previousVersion() {
  try {
    const v = JSON.parse(fs3.readFileSync(file2(), "utf-8")).version;
    return v && v !== LICENCE_VERSION ? String(v) : null;
  } catch {
    return null;
  }
}
function notAcceptedMessage(surface = process.env.ROOTZ_ARCHIVE_SURFACE) {
  const read = `The licence is ${LICENCE_FILE} in the Rootz Archive folder and on the Rootz Archive GitHub page (rootz-global/rootz-archive).`;
  const prev = previousVersion();
  if (prev) {
    const act = surface === "mcpb" ? 'tick "I accept the Rootz Archive Use Licence" again in Claude Desktop \u2192 Settings \u2192 Extensions \u2192 Rootz Archive' : surface === "vscode" ? 'click "Rootz Archive: accept to start" in the VS Code status bar' : "type /rootz-archive:accept in Claude Code";
    return `The Rootz Archive licence was updated (you accepted version ${prev}; it is now ${LICENCE_VERSION}), so archiving is paused until you accept the new version. Your archive is untouched. To continue, ${act}. ${read}`;
  }
  if (surface === "mcpb") return `Rootz Archive is installed but NOT archiving yet. To start, open Claude Desktop \u2192 Settings \u2192 Extensions \u2192 Rootz Archive, read the licence, tick "I accept the Rootz Archive Use Licence", and save. ${read}`;
  if (surface === "vscode") return `Rootz Archive is installed but NOT archiving yet. To start, click "Rootz Archive: accept to start" in the VS Code status bar. ${read}`;
  return `Rootz Archive is installed but NOT archiving yet. To start, type /rootz-archive:accept in Claude Code. ${read}`;
}
var NOT_ACCEPTED_MESSAGE = notAcceptedMessage("plugin");

// src/version.ts
var SERVER_VERSION = "0.7.4";
var MIN_NODE = "22.13";
function nodeOk(v = process.versions.node) {
  const [maj, min] = v.split(".").map(Number);
  return maj > 22 || maj === 22 && min >= 13;
}
var NODE_TOO_OLD_MESSAGE = (v = process.versions.node) => `Rootz Archive needs Node.js ${MIN_NODE} or newer (this computer has ${v}). Your conversations are NOT being archived. Install Node.js 22.13 or newer (see the plugin README), then start a new Claude Code session.`;

export {
  defaultDataDir,
  LocalArchive,
  readSettings,
  writeSettings,
  projectSlug,
  LICENCE_VERSION,
  acceptance,
  accept,
  acceptFromInstallSetting,
  notAcceptedMessage,
  SERVER_VERSION,
  nodeOk,
  NODE_TOO_OLD_MESSAGE
};
