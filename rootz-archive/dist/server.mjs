#!/usr/bin/env node
import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);
import {
  LocalArchive,
  NODE_TOO_OLD_MESSAGE,
  SERVER_VERSION,
  acceptFromInstallSetting,
  acceptance,
  defaultDataDir,
  defaultVaultDir,
  health,
  nodeOk,
  notAcceptedMessage,
  readSettings
} from "./chunks/chunk-S2LY5ZBZ.mjs";
import "./chunks/chunk-E6VJ2V3Q.mjs";
import {
  McpServer,
  StdioServerTransport
} from "./chunks/chunk-L4DQGOBV.mjs";
import "./chunks/chunk-PMDUTFDN.mjs";
import "./chunks/chunk-4F5DKZYP.mjs";
import {
  external_exports
} from "./chunks/chunk-JUYGSETY.mjs";
import "./chunks/chunk-LS7ELLM2.mjs";
import "./chunks/chunk-QMADD65T.mjs";
import "./chunks/chunk-SYIV54HI.mjs";
import "./chunks/chunk-4TWFJUN4.mjs";

// src/tools.ts
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
var SERVER_NAME = "archive-free";
var SOURCE_LABEL = `Rootz Archive \xB7 this computer (${os.hostname().replace(/\.local$/, "")})`;
var text = (t, isError = false) => ({
  content: [{ type: "text", text: `${t}

\u2014 Source: ${SOURCE_LABEL}. Local archive only; not the Rootz Desktop/relay archive.` }],
  ...isError ? { isError } : {}
});
var TAG = "[Rootz Archive \xB7 this computer] ";
var date = (ms) => ms ? new Date(ms).toISOString().slice(0, 10) : "";
var shortPath = (f) => {
  const parts = f.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join("/") : parts.join("/");
};
var WRITE_TOOLS = /* @__PURE__ */ new Set(["add_summary", "index_local_sessions"]);
var UNGATED = /* @__PURE__ */ new Set(["archive_status"]);
var NOT_RECALL = /* @__PURE__ */ new Set(["archive_status", "get_archive_stats", "add_summary", "index_local_sessions"]);
function logRecall(tool) {
  if (NOT_RECALL.has(tool)) return;
  try {
    const home = process.env.ROOTZ_ARCHIVE_HOME || path.join(os.homedir(), ".rootz-archive");
    fs.appendFileSync(path.join(home, "recall.jsonl"), JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), tool }) + "\n", { mode: 384 });
  } catch {
  }
}
function createServer(source) {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  let archive;
  let db;
  let opening;
  const open = async () => {
    opening ??= typeof source === "function" ? source() : Promise.resolve(source);
    archive = await opening;
    db = archive.db;
  };
  const sessionNumberMap = /* @__PURE__ */ new Map();
  const reg = (name, config, cb) => {
    const write = WRITE_TOOLS.has(name);
    config.annotations = {
      title: name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
      readOnlyHint: !write,
      destructiveHint: false,
      idempotentHint: !write,
      openWorldHint: false
    };
    server.registerTool(name, config, async (...args) => {
      if (!UNGATED.has(name)) {
        if (!acceptance()) return text(notAcceptedMessage(), true);
        await open();
        logRecall(name);
      }
      return cb(...args);
    });
  };
  const resolveSessionId = (a) => a.sessionId || (a.sessionNumber !== void 0 ? sessionNumberMap.get(a.sessionNumber) ?? null : null);
  const sessionRef = {
    sessionId: external_exports.string().optional().describe("Session ID"),
    sessionNumber: external_exports.number().optional().describe("Session number from list_past_sessions output")
  };
  reg("search_conversations", {
    description: TAG + 'Ranked full-text search across your archived AI conversations and their summaries. Local and offline. Words are stemmed and ANDed; use "quotes" for an exact phrase.',
    inputSchema: {
      query: external_exports.string().describe('Words or "a phrase" to search for'),
      role: external_exports.enum(["human", "assistant", "summary"]).optional(),
      projectSlug: external_exports.string().optional(),
      limit: external_exports.number().optional().describe("Max results (default 10)")
    }
  }, async ({ query, role, projectSlug, limit }) => {
    archive.search.sync();
    const hits = archive.search.search(query, { role, projectSlug, limit: limit || 10 });
    if (hits.length > 0) {
      const body2 = hits.map((h, i) => {
        const icon = h.kind === "summary" ? "\u{1F4DD}" : h.role === "human" ? "\u{1F464}" : "\u{1F916}";
        const label = h.kind === "summary" ? `summary by ${h.model}` : h.role;
        return `${i + 1}. ${icon} ${label}${h.timestamp ? ` \xB7 ${date(h.timestamp)}` : ""}
   Session: ${h.sessionId}${h.projectSlug ? `
   Project: ${h.projectSlug}` : ""}
   ${h.snippet.replace(/\s+/g, " ")}`;
      }).join("\n\n");
      return text(`Found ${hits.length} ranked matches for "${query}" (best first):

${body2}`);
    }
    const results = role === "summary" ? [] : await db.searchMessages(query, { role, projectSlug, limit: limit || 10 });
    if (results.length === 0) return text(`No past conversations found matching "${query}".`);
    const body = results.map((m, i) => {
      const icon = m.role === "human" ? "\u{1F464}" : "\u{1F916}";
      const project = m.sessionMetadata?.projectSlug ? `
   Project: ${m.sessionMetadata.projectSlug}` : "";
      return `${i + 1}. ${icon} ${m.role}
   Session: ${m.sessionId}${project}
   "${m.content.substring(0, 150)}..."`;
    }).join("\n\n");
    return text(`No word matches; ${results.length} substring matches for "${query}" (newest first, unranked):

${body}`);
  });
  reg("next_unsummarised", {
    description: TAG + "Sessions that have no summary yet, longest first. Use it only when the user asks you to summarise past sessions; summarising is the user's choice, never on your own initiative.",
    inputSchema: {
      limit: external_exports.number().optional().describe("How many (default 5)"),
      model: external_exports.string().optional().describe("Only sessions not yet summarised by THIS model")
    }
  }, async ({ limit, model }) => {
    const rows = archive.search.unsummarised(limit || 5, model);
    if (rows.length === 0) return text(model ? `Every session already has a summary from ${model}.` : "Every session already has a summary.");
    return text(`${rows.length} sessions without a summary${model ? ` from ${model}` : ""}:

` + rows.map((r, i) => `${i + 1}. ${r.sessionId} \u2014 ${r.projectSlug || "no project"}, ${r.messages} messages${r.lastMessageAt ? `, last ${date(r.lastMessageAt)}` : ""}`).join("\n"));
  });
  reg("add_summary", {
    description: TAG + "Store a summary you wrote of one session, at the user's request, labelled with your model name. It is indexed for search and never replaces the original transcript. Write it for a future reader: what was decided, what was produced, what was left open.",
    inputSchema: {
      ...sessionRef,
      summary: external_exports.string().describe("The summary text (at least 40 characters)"),
      model: external_exports.string().describe('Your model name and version, e.g. "claude-opus-5-5"'),
      sourceMessages: external_exports.number().optional().describe("How many messages you actually read")
    }
  }, async (args) => {
    const sessionId = resolveSessionId(args);
    if (!sessionId) return text("Error: provide sessionId or sessionNumber.", true);
    try {
      const rec = await archive.search.addSummary({ sessionId, model: args.model, text: args.summary, sourceMessages: args.sourceMessages ?? 0 });
      return text(`Summary stored for ${rec.sessionId} (model ${rec.model}, ${rec.text.length} chars) and indexed for search; the original transcript is unchanged.`);
    } catch (e) {
      return text(`Not stored: ${e.message}`, true);
    }
  });
  reg("list_past_sessions", {
    description: TAG + "List past sessions, most recent first. Filter by topic text, project, or sessions with errors.",
    inputSchema: {
      query: external_exports.string().optional(),
      projectSlug: external_exports.string().optional(),
      hasErrors: external_exports.boolean().optional(),
      limit: external_exports.number().optional().describe("Max sessions (default 10)")
    }
  }, async ({ query, projectSlug, hasErrors, limit }) => {
    const n = limit || 10;
    let sessions;
    if (hasErrors) sessions = await db.getSessionsWithErrors(n);
    else if (projectSlug) sessions = await db.getProjectSessions(projectSlug, n);
    else if (query && query !== "*") {
      const q = query.toLowerCase();
      sessions = (await db.getAllSessions(1e3)).filter((s) => [s.summary || "", s.topics.join(" "), s.projectSlug || "", s.filesWritten.join(" "), s.filesRead.join(" ")].join(" ").toLowerCase().includes(q)).slice(0, n);
    } else sessions = await db.getAllSessions(n);
    sessionNumberMap.clear();
    if (sessions.length === 0) {
      return text(query ? `No sessions found matching "${query}".` : "No archived sessions found. Run index_local_sessions to capture your Claude Code sessions.");
    }
    sessions.forEach((s, i) => sessionNumberMap.set(i + 1, s.sessionId));
    const body = sessions.map((s, i) => {
      const summary = s.summary ? `   Summary: ${s.summary.substring(0, 120)}${s.summary.length > 120 ? "..." : ""}
` : "";
      const stats = [`${s.totalTurns} turns`, s.filesWritten.length ? `${s.filesWritten.length} files written` : "", s.toolsUsed.length ? `${s.toolsUsed.length} tools` : ""].filter(Boolean).join(" | ");
      const files = s.filesWritten.length ? `   Files: ${s.filesWritten.slice(0, 5).map(shortPath).join(", ")}
` : "";
      const topics = s.topics.length ? `   Topics: ${s.topics.slice(0, 5).join(", ")}
` : "";
      return `#${i + 1}. ${s.projectSlug}${s.hasErrors ? " [ERRORS]" : ""}
   Session: ${s.sessionId}
${summary}   ${stats}
${files}${topics}${s.lastMessageAt ? `   Date: ${date(s.lastMessageAt)}` : ""}`;
    }).join("\n\n");
    return text(`Found ${sessions.length} sessions (use #N with sessionNumber parameter):

${body}`);
  });
  reg("get_session_context", {
    description: TAG + "Summary of one session: files, tools, topics, git state, opening messages.",
    inputSchema: sessionRef
  }, async (args) => {
    const sessionId = resolveSessionId(args);
    if (!sessionId) return text("Error: provide sessionId or sessionNumber (from list_past_sessions output).", true);
    const s = await db.getSessionMetadata(sessionId);
    if (!s) return text(`Session "${sessionId}" not found in the local archive.`, true);
    const msgs = (await db.searchMessages("", { sessionId, limit: 5e3 })).sort((a, b) => a.turnIndex - b.turnIndex);
    const list = (xs) => xs.length ? xs.slice(0, 10).map((f) => f.split(/[\\/]/).pop() || f).join("\n  - ") : "none";
    const git = s.gitCommitHash ? `Git: ${s.gitBranch || "detached"}@${s.gitCommitHash}${s.gitDirty ? " (uncommitted changes)" : ""}` : "Git: not tracked";
    const recent = msgs.length ? msgs.slice(0, 5).map((m) => `  [${m.role === "human" ? "\u{1F464}" : "\u{1F916}"}] ${m.content.substring(0, 100)}...`).join("\n") : "no messages";
    return text(
      `Session: ${s.sessionId}
Project: ${s.projectSlug}
Turns: ${s.totalTurns}
Has Errors: ${s.hasErrors ? "Yes" : "No"}
${git}
` + (s.summary ? `
Summary: ${s.summary}
` : "") + archive.search.summaries(s.sessionId).slice(0, 3).map((x) => `
Summary (${x.model}, ${date(x.createdAt)}): ${x.text}
`).join("") + `
Files Written:
  - ${list(s.filesWritten)}

Files Read:
  - ${list(s.filesRead)}

Tools Used: ${s.toolsUsed.join(", ") || "none"}

Topics: ${s.topics.join(", ") || "not detected"}

Recent Messages:
${recent}`
    );
  });
  reg("get_full_transcript", {
    description: TAG + "Transcript of one session, paginated. States where the text came from: the archived copy, the live source file, or parsed messages only.",
    inputSchema: {
      ...sessionRef,
      format: external_exports.enum(["parsed", "jsonl"]).optional(),
      offset: external_exports.number().optional().describe("Start message (or JSONL line) index (default 0)"),
      limit: external_exports.number().optional().describe("Max messages (or JSONL lines) (default 50)")
    }
  }, async (args) => {
    const sessionId = resolveSessionId(args);
    if (!sessionId) return text("Error: provide sessionId or sessionNumber (from list_past_sessions output).", true);
    const t = await archive.getTranscript(sessionId);
    if (!t) return text(`No transcript found for session "${sessionId}".`, true);
    const sourceNote = {
      "archived-raw": "Source: archived copy in the local archive.",
      "live-source-file": "Source: the live Claude Code file on disk \u2014 NOT an archived copy; it can change or be deleted.",
      "parsed-only": "Source: parsed messages only \u2014 the raw transcript was not retained by this archive."
    }[t.source];
    if (args.format === "jsonl") {
      if (!t.jsonl) return text(`Session: ${sessionId}
${sourceNote}
Raw JSONL is not available for this session.`, true);
      const lines = t.jsonl.split("\n").filter(Boolean);
      const lo = args.offset ?? 0, n = args.limit ?? 50;
      const more2 = lo + n < lines.length ? `

More available: use offset=${lo + n}` : "";
      return text(`Session: ${sessionId} (${lines.length} JSONL lines)
${sourceNote}
Showing lines ${lo}-${Math.min(lo + n, lines.length) - 1}:

--- Raw JSONL ---

${lines.slice(lo, lo + n).join("\n")}${more2}`);
    }
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    const page = t.messages.slice(offset, offset + limit);
    const body = page.map((m, i) => {
      const icon = m.role === "human" ? "\u{1F464}" : m.role === "assistant" ? "\u{1F916}" : "\u{1F527}";
      return `${offset + i + 1}. ${icon} ${m.role}
${m.content.substring(0, 2e3)}${m.content.length > 2e3 ? "..." : ""}`;
    }).join("\n\n---\n\n");
    const more = offset + limit < t.messages.length ? `

More available: use offset=${offset + limit}` : "";
    return text(`Session: ${sessionId} (${t.messages.length} total messages)
${sourceNote}
Showing messages ${offset}-${offset + page.length - 1}:

${body}${more}`);
  });
  reg("get_project_context", {
    description: TAG + "Recent sessions for a project, to pick up where you left off.",
    inputSchema: { projectSlug: external_exports.string(), limit: external_exports.number().optional() }
  }, async ({ projectSlug, limit }) => {
    const ctx = await db.getRecentSessionsForContext(projectSlug, limit || 5);
    if (ctx.length === 0) return text(`No archived sessions found for project "${projectSlug}". Use list_projects to see project slugs.`);
    const body = ctx.map((s, i) => {
      const files = s.filesModified.length ? `
   Files: ${s.filesModified.slice(0, 3).join(", ")}${s.filesModified.length > 3 ? ` +${s.filesModified.length - 3}` : ""}` : "";
      return `${i + 1}. ${s.sessionId}
   ${s.summary || "No summary"}${files}
   "${s.messagePreview.substring(0, 150)}"`;
    }).join("\n\n");
    return text(`Project: ${projectSlug}
Recent Sessions (${ctx.length}):

${body}`);
  });
  reg("list_projects", {
    description: TAG + "Projects in the local archive, with session counts.",
    inputSchema: {}
  }, async () => {
    const rows = archive.listProjects();
    if (rows.length === 0) return text("No projects in the local archive yet. Run index_local_sessions.");
    return text(`${rows.length} projects:

` + rows.map((r) => `- ${r.projectSlug} \u2014 ${r.sessionCount} sessions${r.lastActive ? `, last ${date(r.lastActive)}` : ""}`).join("\n"));
  });
  reg("recall_facts", {
    description: TAG + "Facts extracted from past sessions (uses, depends_on, implements, decision, pattern, bug, fix, preference). Regex-extracted: treat as leads, not records.",
    inputSchema: {
      subject: external_exports.string().optional(),
      factType: external_exports.enum(["uses", "depends_on", "implements", "decision", "pattern", "bug", "fix", "preference"]).optional(),
      limit: external_exports.number().optional()
    }
  }, async ({ subject, factType, limit }) => {
    const facts = await db.queryFacts({ subject, factType, limit: limit || 20 });
    if (facts.length === 0) return text("No facts found.");
    return text(facts.map((f) => `- [${f.factType}] ${f.subject} ${f.predicate} ${f.object} (conf ${f.confidence.toFixed(2)}, session ${f.sourceSessionId})`).join("\n"));
  });
  reg("get_decisions", {
    description: TAG + "Decisions extracted from past sessions. Regex-extracted: verify against the transcript before relying on one.",
    inputSchema: { subject: external_exports.string().optional(), limit: external_exports.number().optional() }
  }, async ({ subject, limit }) => {
    const ds = await db.getDecisions({ subject, limit: limit || 20 });
    if (ds.length === 0) return text("No decisions found.");
    return text(ds.map((d) => `- ${d.object} (${d.subject}; session ${d.sourceSessionId}${d.extractedAt ? `, ${date(d.extractedAt)}` : ""})`).join("\n"));
  });
  reg("archive_status", {
    description: TAG + "Is Archive working? Plain-language health of capture on this computer: green / amber / red with the reason. Call it when the user asks whether their conversations are being kept.",
    inputSchema: {}
  }, async () => {
    if (!acceptance()) return text(`\u{1F7E0} ${notAcceptedMessage()}`);
    if (readSettings().paused) return text("\u23F8 Rootz Archive capture is paused (your choice). Search still works. Type /rootz-archive:resume to resume.");
    const h = health(process.env.ROOTZ_VAULT_DIR || defaultVaultDir());
    if (process.env.ROOTZ_ARCHIVE_SURFACE === "mcpb" && h.headline.startsWith("Archive has not run yet")) {
      return text("\u{1F7E2} Rootz Archive search is ready in Claude Desktop. Desktop does not capture by itself: ask me to run index_local_sessions to index your Claude Code conversations now, or install the Rootz Archive Claude Code plugin for continuous, exact-copy capture.");
    }
    const icon = { green: "\u{1F7E2}", amber: "\u{1F7E0}", red: "\u{1F534}" }[h.state];
    return text(`${icon} ${h.headline}

${h.details.map((d) => `- ${d}`).join("\n")}`, h.state === "red");
  });
  reg("get_archive_stats", {
    description: TAG + "What the archive holds, in plain words: what is kept as exact copies on this computer, and what is searchable now.",
    inputSchema: {}
  }, async () => {
    const s = await db.getSearchStats();
    archive.search.sync();
    const x = archive.search.stats();
    const h = health(process.env.ROOTZ_VAULT_DIR || defaultVaultDir());
    const kept = h.details.find((d) => d.includes("kept as exact copies"));
    const fmt = (k) => k.toLocaleString("en-US");
    return text(
      `Kept on this computer: ${kept ?? "nothing captured yet."}
Searchable now: ${fmt(s.totalSessions)} conversations (${fmt(s.totalMessages)} messages), mentioning ${fmt(s.uniqueFiles)} different files. Sub-agent conversations are kept as exact copies but are not searchable yet.
Summaries your AI has written: ${fmt(x.summaries)}${x.summaries ? ` (covering ${fmt(x.summarisedSessions)} conversations)` : ' (ask me to "summarise my longest unsummarised sessions")'}.

${SERVER_NAME} ${SERVER_VERSION}: local only. No account, no network.`
    );
  });
  reg("index_local_sessions", {
    description: TAG + "Capture: index Claude Code sessions from ~/.claude/projects into the local archive. Skips files unchanged since last run.",
    inputSchema: {
      projectFilter: external_exports.string().optional().describe("Only project folders containing this text"),
      limit: external_exports.number().optional().describe("Max files to index this run (default 50)"),
      forceReindex: external_exports.boolean().optional()
    }
  }, async ({ projectFilter, limit, forceReindex }) => {
    const st = readSettings();
    if (st.paused) return text("Rootz Archive capture is paused. Type /rootz-archive:resume to resume.", true);
    const r = await archive.indexProjects({ projectFilter, limit, forceReindex, excludeProjects: st.excludeProjects });
    archive.search.sync();
    return text(`Scanned ${r.filesScanned} files: ${r.filesIndexed} indexed, ${r.filesSkipped} unchanged, ${r.filesErrored} errors. ${r.totalMessagesIndexed} messages indexed.` + (r.errors.length ? `

Errors:
${r.errors.slice(0, 10).join("\n")}` : "") + `

The exact original files are kept separately (byte-for-byte) by Archive's capture; this index is for search.`);
  });
  return server;
}

// src/server.ts
for (const k of ["log", "info", "warn", "debug"]) {
  console[k] = (...a) => console.error(...a);
}
async function main() {
  if (!nodeOk()) {
    const server2 = new McpServer({ name: "archive-free", version: SERVER_VERSION });
    server2.registerTool(
      "archive_status",
      { description: "[Rootz Archive \xB7 this computer] Is Rootz Archive working?", inputSchema: {} },
      async () => ({ content: [{ type: "text", text: `\u{1F7E0} ${NODE_TOO_OLD_MESSAGE()}` }], isError: true })
    );
    await server2.connect(new StdioServerTransport());
    return;
  }
  try {
    acceptFromInstallSetting();
  } catch {
  }
  let opened;
  const server = createServer(async () => opened = await LocalArchive.open(defaultDataDir()));
  await server.connect(new StdioServerTransport());
  const shutdown = () => {
    try {
      opened?.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch((err) => {
  console.error("[archive-local] fatal:", err);
  process.exit(1);
});
