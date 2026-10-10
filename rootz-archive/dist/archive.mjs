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
  readSettings,
  snapshot,
  tightenPermissions,
  verify,
  writeHeartbeat,
  writeSettings,
  writeVerifyMark
} from "./chunks/chunk-K6WABS5I.mjs";
import "./chunks/chunk-E6VJ2V3Q.mjs";
import "./chunks/chunk-4TWFJUN4.mjs";

// src/archive-cli.ts
import { spawn } from "child_process";
import * as fs2 from "fs";
import * as path2 from "path";

// src/launcher.ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
var launcherPath = () => path.join(process.env.ROOTZ_ARCHIVE_HOME || path.join(os.homedir(), ".rootz-archive"), "bin", "archive-free-mcp.mjs");
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
  if (!fs.existsSync(serverPath)) return null;
  const file = launcherPath();
  const src = launcherSource(serverPath, version);
  try {
    if (fs.readFileSync(file, "utf-8") === src) return file;
  } catch {
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 448 });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, src, { mode: 448 });
  fs.renameSync(tmp, file);
  return file;
}

// src/archive-cli.ts
import { fileURLToPath } from "url";
import * as os2 from "os";
for (const k of ["log", "info", "warn", "debug"]) console[k] = (...a) => console.error(...a);
var out = (line) => process.stdout.write(line + "\n");
var cmd = process.argv[2];
var vault = defaultVaultDir();
var isHook = process.argv.includes("--hook");
function tightenArchiveHome() {
  try {
    tightenPermissions(process.env.ROOTZ_ARCHIVE_HOME || path2.join(os2.homedir(), ".rootz-archive"));
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
        return JSON.parse(fs2.readFileSync(path2.join(vault, "last-verify.json"), "utf-8"));
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
      refreshLauncher(path2.join(path2.dirname(fileURLToPath(import.meta.url)), "server.mjs"), SERVER_VERSION);
    } catch {
    }
  }
  if (!acceptance() && (cmd === "capture" || cmd === "snapshot" || cmd === "session-start" || cmd === "health")) {
    if (cmd === "session-start") out(JSON.stringify({ systemMessage: `\u{1F7E0} ${notAcceptedMessage()}` }));
    else if (cmd === "health") {
      out(`[NOT STARTED] ${notAcceptedMessage()}`);
      process.exitCode = 3;
    } else if (cmd === "capture" && !isHook) out(notAcceptedMessage());
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
    case "verify": {
      const r = verify(vault);
      writeVerifyMark(vault, r);
      out(r.failures.length ? `VERIFY FAILED: ${r.failures.length} of ${r.records}` : `ok: ${r.ok}/${r.records} verified`);
      process.exitCode = r.failures.length ? 1 : 0;
      return;
    }
    default: {
      const usage = `Rootz Archive ${SERVER_VERSION}
usage: archive.mjs accept | pause | resume | exclude [dir] | include [dir] | settings | capture [--json] | snapshot | session-start | health | verify | search <words> [--limit N] | transcript <id> | version
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
