#!/usr/bin/env node
import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);
import {
  LICENCE_VERSION,
  LocalArchive,
  NODE_TOO_OLD_MESSAGE,
  SERVER_VERSION,
  accept,
  acceptance,
  claudeCodeSource,
  defaultDataDir,
  defaultVaultDir,
  health,
  nodeOk,
  notAcceptedMessage,
  projectSlug,
  readManifest,
  readSettings,
  snapshot,
  tightenPermissions,
  verify,
  writeHeartbeat,
  writeSettings,
  writeVerifyMark
} from "./chunks/chunk-S2LY5ZBZ.mjs";
import "./chunks/chunk-E6VJ2V3Q.mjs";
import "./chunks/chunk-4TWFJUN4.mjs";

// src/archive-cli.ts
import { spawn } from "child_process";
import * as fs3 from "fs";
import * as path3 from "path";

// src/dashboard.ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
function vaultTotals(vault2) {
  const recs = fs.existsSync(path.join(vault2, "manifest.jsonl")) ? readManifest(vault2) : [];
  const latest = /* @__PURE__ */ new Map();
  for (const r of recs) latest.set(`${r.source}:${r.path}`, r);
  const count = (kind) => new Set(recs.filter((r) => r.kind === kind).map((r) => r.path)).size;
  let bytesOnDisk = 0;
  const walk = (d) => {
    let es = [];
    try {
      es = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        try {
          bytesOnDisk += fs.statSync(p).size;
        } catch {
        }
      }
    }
  };
  walk(path.join(vault2, "blobs"));
  return {
    conversations: count("transcript"),
    subagentConversations: count("subagent-transcript"),
    fileVersions: count("file-history"),
    bytesKept: [...latest.values()].reduce((a, r) => a + (r.size || 0), 0),
    bytesOnDisk
  };
}
function recallCounts(archiveHome, now = Date.now()) {
  const p = path.join(archiveHome, "recall.jsonl");
  if (!fs.existsSync(p)) return null;
  const at = fs.readFileSync(p, "utf-8").split("\n").filter(Boolean).map((l) => {
    try {
      return Date.parse(JSON.parse(l).at);
    } catch {
      return NaN;
    }
  }).filter((t) => !Number.isNaN(t));
  if (!at.length) return null;
  return {
    last7: at.filter((t) => now - t < 7 * 864e5).length,
    last30: at.filter((t) => now - t < 30 * 864e5).length,
    since: new Date(Math.min(...at)).toISOString()
  };
}
var esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var num = (n) => n.toLocaleString("en-US");
var bytes = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;
var day = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
var ago = (iso) => {
  const ms = Date.now() - Date.parse(iso);
  return ms < 9e4 ? "just now" : ms < 90 * 6e4 ? `${Math.round(ms / 6e4)} min ago` : ms < 48 * 36e5 ? `${Math.round(ms / 36e5)} hours ago` : `${Math.round(ms / 864e5)} days ago`;
};
function renderDashboard(d) {
  const p = d.protected;
  const integ = d.integrity;
  const integState = !integ ? "amber" : integ.failures > 0 ? "red" : "green";
  const tile = (title, state, big, lines) => `
    <section class="tile ${state}"><h2>${esc(title)}</h2><p class="big">${big}</p>${lines.map((l) => `<p>${l}</p>`).join("")}</section>`;
  const tiles = [
    tile("Protected", p.lastCapture ? "green" : "amber", `${num(p.conversations)} <span>conversations</span>`, [
      `plus ${num(p.subagentConversations)} sub-agent conversations`,
      `${num(p.fileVersions)} saved versions of files Claude edited`,
      `${bytes(p.bytesKept)} kept as exact copies (${bytes(p.bytesOnDisk)} on disk, compressed)`,
      `Searchable now: ${num(p.searchableConversations)} conversations, ${num(p.searchableMessages)} messages`,
      p.lastCapture ? `Last capture: ${esc(ago(p.lastCapture))}` : "Not captured yet"
    ]),
    tile("Integrity", integState, integ ? `${num(integ.ok)} <span>of ${num(integ.records)} verified</span>` : "Not checked yet", integ ? [
      integ.failures > 0 ? `<b>${num(integ.failures)} saved versions do not match their fingerprint.</b> Run <code>archive.mjs verify</code>.` : "Every saved version re-derives to its SHA-256 fingerprint.",
      `Last check: ${esc(ago(integ.at))}`
    ] : ["The daily check runs after the first capture."]),
    tile("Time span", d.timeSpan.oldest ? "green" : "amber", d.timeSpan.oldest ? `${num(Math.max(1, Math.round(((d.timeSpan.newest ?? d.timeSpan.oldest) - d.timeSpan.oldest) / 864e5)))} <span>days of your work</span>` : "Nothing searchable yet", d.timeSpan.oldest ? [
      `From ${day(d.timeSpan.oldest)} to ${day(d.timeSpan.newest ?? d.timeSpan.oldest)} (oldest to newest searchable conversation)`,
      `${num(d.timeSpan.projects)} projects`
    ] : ["Conversations become searchable after the first capture."]),
    tile("Recall", d.recall ? "green" : "neutral", d.recall ? `${num(d.recall.last7)} <span>times this week</span>` : "Not measured yet", d.recall ? [
      `Your AI read from the archive ${num(d.recall.last30)} times in the last 30 days.`,
      `Counting since ${day(Date.parse(d.recall.since))}. Only the tool name and time are recorded, never what was asked.`
    ] : ["Counting starts the first time your AI searches the archive."]),
    tile("Summaries", d.summaries ? "green" : "neutral", `${num(d.summaries)} <span>written by your AI</span>`, [
      d.summaries ? "Summaries are added to search; they never replace the original conversation." : "Ask Claude: \u201Csummarise my five longest unsummarised sessions\u201D."
    ]),
    tile("Value", "neutral", "Not measured yet", ["We will only show time or cost saved once we can measure it on your own work."])
  ].join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rootz Archive dashboard</title>
<style>
:root { --bg:#f7f7f5; --card:#fff; --text:#1d1d1b; --muted:#66665f; --border:#e3e3dd; --green:#1f8a4c; --amber:#b26a00; --red:#c0362c; --accent:#5b5bd6; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e0f12; --card:#16181d; --text:#ececec; --muted:#9a9aa3; --border:#262931; --green:#4cc38a; --amber:#f0a73a; --red:#ff6b5e; --accent:#8f8ff0; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 32px 16px 24px; }
header h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -.01em; }
header p { margin: 0; color: var(--muted); }
.grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-top:24px; }
.tile { min-width:0; background:var(--card); border:1px solid var(--border); border-top:4px solid var(--border); border-radius:12px; padding:18px 20px; }
.tile.green { border-top-color: var(--green); } .tile.amber { border-top-color: var(--amber); } .tile.red { border-top-color: var(--red); }
.tile h2 { margin:0 0 6px; font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
.tile .big { font-size:30px; font-weight:700; margin:0 0 8px; line-height:1.15; overflow-wrap:anywhere; }
.tile .big span { font-size:15px; font-weight:500; color:var(--muted); }
.tile p { margin: 4px 0; color: var(--muted); overflow-wrap:anywhere; }
.tile p.big { color: var(--text); }
.tile.red .big, .tile.red b { color: var(--red); }
code { font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
footer { margin-top: 24px; color: var(--muted); font-size: 13px; text-align: center; }
</style></head>
<body><main>
<header><h1>Rootz Archive</h1><p>Your AI conversations, kept on this computer (${esc(d.host)}).</p></header>
<div class="grid">${tiles}</div>
<footer>Generated on this computer at ${esc(d.generatedAt.replace("T", " ").slice(0, 16))} UTC \xB7 Rootz Archive ${esc(d.version)} \xB7 nothing sent to Rootz</footer>
</main></body></html>
`;
}
function writeDashboard(html, archiveHome = process.env.ROOTZ_ARCHIVE_HOME || path.join(os.homedir(), ".rootz-archive")) {
  fs.mkdirSync(archiveHome, { recursive: true, mode: 448 });
  const file = path.join(archiveHome, "dashboard.html");
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, html, { mode: 384 });
  fs.renameSync(tmp, file);
  return file;
}

// src/launcher.ts
import * as fs2 from "fs";
import * as os2 from "os";
import * as path2 from "path";
import { pathToFileURL } from "url";
var launcherPath = () => path2.join(process.env.ROOTZ_ARCHIVE_HOME || path2.join(os2.homedir(), ".rootz-archive"), "bin", "archive-free-mcp.mjs");
function launcherSource(serverPath, version) {
  return [
    "#!/usr/bin/env node",
    `// Rootz Archive stable launcher. Written by the rootz-archive plugin (version ${version}) at session start; do not edit.`,
    "// Use it from other AI tools as an MCP stdio server:  node <this file>",
    "import { pathToFileURL } from 'url';",
    `await import(${JSON.stringify(pathToFileURL(serverPath).href)});`,
    ""
  ].join("\n");
}
function refreshLauncher(serverPath, version) {
  if (!fs2.existsSync(serverPath)) return null;
  const file = launcherPath();
  const src = launcherSource(serverPath, version);
  try {
    if (fs2.readFileSync(file, "utf-8") === src) return file;
  } catch {
  }
  fs2.mkdirSync(path2.dirname(file), { recursive: true, mode: 448 });
  const tmp = `${file}.tmp-${process.pid}`;
  fs2.writeFileSync(tmp, src, { mode: 448 });
  fs2.renameSync(tmp, file);
  return file;
}

// src/archive-cli.ts
import { fileURLToPath } from "url";
import * as os3 from "os";
for (const k of ["log", "info", "warn", "debug"]) console[k] = (...a) => console.error(...a);
var out = (line) => process.stdout.write(line + "\n");
var cmd = process.argv[2];
var vault = defaultVaultDir();
var isHook = process.argv.includes("--hook");
function tightenArchiveHome() {
  try {
    tightenPermissions(process.env.ROOTZ_ARCHIVE_HOME || path3.join(os3.homedir(), ".rootz-archive"));
  } catch {
  }
}
if (!process.env.ROOTZ_ARCHIVE_DEBUG) {
  for (const k of ["log", "info", "debug"]) {
    const orig = console[k].bind(console);
    console[k] = (...a) => {
      if (!(typeof a[0] === "string" && /^\[(ArchiveDB|extractSubDirectory)\]/.test(a[0]))) orig(...a);
    };
  }
}
async function capture() {
  tightenArchiveHome();
  const st = readSettings();
  if (st.paused) return { paused: true };
  const r = snapshot([claudeCodeSource(void 0, st.excludeProjects)], vault);
  if (r.errors.includes("another snapshot is running")) return { skipped: true };
  const archive = await LocalArchive.open(defaultDataDir());
  try {
    const idx = await archive.indexProjects({ excludeProjects: st.excludeProjects });
    const s = archive.search.sync();
    writeHeartbeat(vault, r);
    const vm = (() => {
      try {
        return JSON.parse(fs3.readFileSync(path3.join(vault, "last-verify.json"), "utf-8"));
      } catch {
        return null;
      }
    })();
    if (!vm || Date.now() - Date.parse(vm.at) > 24 * 36e5) writeVerifyMark(vault, verify(vault));
    return { captured: r.captured, indexed: idx.filesIndexed, messages: idx.totalMessagesIndexed, ranked: s.messagesIndexed };
  } finally {
    archive.close();
  }
}
function backgroundCapture() {
  const child = spawn(process.execPath, [process.argv[1], "capture", "--hook"], { detached: true, stdio: "ignore" });
  child.unref();
}
async function main() {
  if (!nodeOk()) {
    const msg = `\u{1F7E0} ${NODE_TOO_OLD_MESSAGE()}`;
    if (cmd === "session-start") out(JSON.stringify({ systemMessage: msg }));
    else process.stderr.write(msg + "\n");
    return;
  }
  switch (cmd) {
    case "accept": {
      if (acceptance()) {
        out(`Rootz Archive licence ${LICENCE_VERSION} is already accepted.`);
        return;
      }
      const a = accept();
      backgroundCapture();
      out(`Rootz Archive licence ${a.version} accepted at ${a.acceptedAt}. Capture has started on this computer.`);
      return;
    }
    case "pause": {
      writeSettings({ ...readSettings(), paused: true });
      out("Rootz Archive capture is PAUSED. Search still works. Resume with /rootz-archive:resume.");
      return;
    }
    case "resume": {
      writeSettings({ ...readSettings(), paused: false });
      out("Rootz Archive capture RESUMED.");
      return;
    }
    case "exclude":
    case "include": {
      const slug = projectSlug(process.argv[3] || process.cwd());
      const st = readSettings();
      const set = new Set(st.excludeProjects);
      if (cmd === "exclude") set.add(slug);
      else set.delete(slug);
      writeSettings({ ...st, excludeProjects: [...set] });
      out(cmd === "exclude" ? `Rootz Archive will no longer capture project ${slug}. Copies already made are kept; delete them yourself if you need them gone (see FORMAT.md).` : `Rootz Archive will capture project ${slug} again.`);
      return;
    }
    case "settings": {
      out(JSON.stringify(readSettings()));
      return;
    }
  }
  if (cmd === "session-start" && acceptance()) {
    try {
      refreshLauncher(path3.join(path3.dirname(fileURLToPath(import.meta.url)), "server.mjs"), SERVER_VERSION);
    } catch {
    }
  }
  if (!acceptance() && (cmd === "capture" || cmd === "snapshot" || cmd === "session-start" || cmd === "health" || cmd === "dashboard")) {
    if (cmd === "session-start") out(JSON.stringify({ systemMessage: `\u{1F7E0} ${notAcceptedMessage()}` }));
    else if (cmd === "health") {
      out(`[NOT STARTED] ${notAcceptedMessage()}`);
      process.exitCode = 3;
    } else if (cmd === "capture" && !isHook || cmd === "dashboard") out(notAcceptedMessage());
    return;
  }
  switch (cmd) {
    case "capture": {
      const r = await capture();
      if (!isHook) {
        if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(r) + "\n");
        else out("paused" in r ? "Rootz Archive capture is paused (your choice). Resume with /rootz-archive:resume." : "skipped" in r ? "Rootz Archive: another capture is already running; it will finish on its own." : r.captured ? `Rootz Archive: saved ${r.captured} new or changed file(s) and indexed ${r.indexed} conversation(s) on this computer.` : "Rootz Archive: everything is already up to date on this computer (nothing new to save).");
      }
      return;
    }
    case "snapshot": {
      const st = readSettings();
      if (st.paused) return;
      const r = snapshot([claudeCodeSource(void 0, st.excludeProjects)], vault);
      if (!r.errors.includes("another snapshot is running")) writeHeartbeat(vault, r);
      return;
    }
    case "session-start": {
      if (readSettings().paused) {
        out(JSON.stringify({ systemMessage: "\u23F8 Rootz Archive capture is paused (your choice). Resume with /rootz-archive:resume." }));
        return;
      }
      const h = health(vault);
      const firstRun = h.headline.startsWith("Archive has not run yet");
      if (firstRun || h.state !== "green") backgroundCapture();
      const icon = { green: "\u{1F7E2}", amber: "\u{1F7E0}", red: "\u{1F534}" }[h.state];
      const line = firstRun ? '\u{1F7E2} Rootz Archive is setting up: keeping an exact copy of your Claude Code conversations on this computer. Ask Claude "is Rootz Archive working?" anytime.' : `${icon} Rootz Archive (this computer): ${h.headline}${h.state === "green" ? ` \xB7 ${h.details[0] ?? ""}` : " \u2014 capture restarted."}`;
      out(JSON.stringify({ systemMessage: line }));
      return;
    }
    case "health": {
      const h = health(vault);
      out(`[${h.state.toUpperCase()}] ${h.headline}
` + h.details.map((d) => `  ${d}`).join("\n"));
      process.exitCode = h.state === "green" ? 0 : h.state === "amber" ? 3 : 1;
      return;
    }
    case "search": {
      const li = process.argv.indexOf("--limit");
      const limit = li > -1 ? Number(process.argv[li + 1]) || 20 : 20;
      const q = process.argv.slice(3).filter((a, i, all) => a !== "--limit" && all[i - 1] !== "--limit").join(" ");
      const archive = await LocalArchive.open(defaultDataDir());
      try {
        archive.search.sync();
        const hits = q.trim() ? archive.search.search(q, { limit }) : [];
        process.stdout.write(JSON.stringify({ query: q, hits }) + "\n");
      } finally {
        archive.close();
      }
      return;
    }
    case "transcript": {
      const sid = process.argv[3] ?? "";
      const archive = await LocalArchive.open(defaultDataDir());
      try {
        const t = await archive.getTranscript(sid);
        process.stdout.write(JSON.stringify(t ? { sessionId: sid, source: t.source, messages: t.messages } : { sessionId: sid, error: "not found" }) + "\n");
      } finally {
        archive.close();
      }
      return;
    }
    case "dashboard": {
      const home = process.env.ROOTZ_ARCHIVE_HOME || path3.join(os3.homedir(), ".rootz-archive");
      const v = vaultTotals(vault);
      const hb = (() => {
        try {
          return JSON.parse(fs3.readFileSync(path3.join(vault, "heartbeat.json"), "utf-8"));
        } catch {
          return null;
        }
      })();
      const vm = (() => {
        try {
          return JSON.parse(fs3.readFileSync(path3.join(vault, "last-verify.json"), "utf-8"));
        } catch {
          return null;
        }
      })();
      const archive = await LocalArchive.open(defaultDataDir());
      let stats, span, summaries;
      try {
        stats = await archive.db.getSearchStats();
        archive.search.sync();
        summaries = archive.search.stats().summaries;
        span = await archive.timeSpan();
      } finally {
        archive.close();
      }
      const file = writeDashboard(renderDashboard({
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        host: os3.hostname(),
        version: SERVER_VERSION,
        protected: { ...v, searchableConversations: stats.totalSessions, searchableMessages: stats.totalMessages, lastCapture: hb?.at ?? null },
        integrity: vm ? { ok: vm.ok, records: vm.records, failures: vm.failures, at: vm.at } : null,
        timeSpan: span,
        recall: recallCounts(home),
        summaries
      }), home);
      const openIt = !process.argv.includes("--no-open");
      if (openIt) {
        const [c, a] = process.platform === "darwin" ? ["open", [file]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : ["xdg-open", [file]];
        try {
          spawn(c, a, { detached: true, stdio: "ignore" }).unref();
        } catch {
        }
      }
      out(`Rootz Archive dashboard written on this computer${openIt ? " and opened in your browser" : ""}: ${file}`);
      return;
    }
    case "verify": {
      const r = verify(vault);
      writeVerifyMark(vault, r);
      out(r.failures.length ? `VERIFY FAILED: ${r.failures.length} of ${r.records}` : `ok: ${r.ok}/${r.records} verified`);
      process.exitCode = r.failures.length ? 1 : 0;
      return;
    }
    default: {
      const usage = `Rootz Archive ${SERVER_VERSION}
usage: archive.mjs accept | pause | resume | exclude [dir] | include [dir] | settings | capture [--json] | snapshot | session-start | health | verify | search <words> [--limit N] | transcript <id> | dashboard [--no-open] | version
`;
      if (cmd === "version" || cmd === "--version") {
        out(SERVER_VERSION);
        return;
      }
      if (cmd === "help" || cmd === "--help" || cmd === "-h") {
        process.stdout.write(usage);
        return;
      }
      process.stderr.write(usage);
      process.exitCode = 2;
    }
  }
}
main().catch((e) => {
  if (isHook || cmd === "session-start") {
    process.stderr.write(`[archive] ${String(e)}
`);
    process.exitCode = 0;
  } else {
    console.error(e);
    process.exitCode = 1;
  }
});
