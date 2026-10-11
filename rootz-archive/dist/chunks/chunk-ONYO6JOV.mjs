#!/usr/bin/env node
import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);

// src/vault.ts
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
var MANIFEST_VERSION = 1;
function defaultVaultDir() {
  return process.env.ROOTZ_VAULT_DIR || path.join(os.homedir(), ".rootz-archive", "vault");
}
function claudeCodeSource(home = os.homedir(), excludeProjects = []) {
  const excluded = new Set(excludeProjects);
  return {
    name: "claude-code",
    root: path.join(home, ".claude"),
    classify: (rel) => {
      const r = rel.split(path.sep).join("/");
      if (r.startsWith("projects/")) {
        if (excluded.has(r.split("/")[1])) return null;
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
function tightenPermissions(dir) {
  if (process.platform === "win32" || !fs.existsSync(dir)) return;
  const fix = (p, want) => {
    try {
      if ((fs.lstatSync(p).mode & 511) !== want) fs.chmodSync(p, want);
    } catch {
    }
  };
  const walk2 = (d) => {
    fix(d, 448);
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk2(p);
      else if (e.isFile()) fix(p, 384);
    }
  };
  walk2(dir);
}
var sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}
function blobPath(vault, hash) {
  return path.join(vault, "blobs", hash.slice(0, 2), hash);
}
function putBlob(vault, bytes) {
  const h = sha(bytes);
  const p = blobPath(vault, h);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 448 });
    const tmp = `${p}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, zlib.gzipSync(bytes), { mode: 384 });
    fs.renameSync(tmp, p);
  }
  return h;
}
function readBlob(vault, hash) {
  return zlib.gunzipSync(fs.readFileSync(blobPath(vault, hash)));
}
function readManifest(vault) {
  const p = path.join(vault, "manifest.jsonl");
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
function loadState(vault) {
  const p = path.join(vault, "state.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
  }
  const s = {};
  for (const r of readManifest(vault)) s[`${r.source}:${r.path}`] = { sha256: r.sha256, size: r.size, mtimeMs: r.mtimeMs };
  return s;
}
function snapshot(sources, vault = defaultVaultDir(), now = () => /* @__PURE__ */ new Date()) {
  fs.mkdirSync(vault, { recursive: true, mode: 448 });
  tightenPermissions(vault);
  const lockPath = path.join(vault, ".lock");
  let lock;
  try {
    lock = fs.openSync(lockPath, "wx", 384);
  } catch {
    const age = Date.now() - fs.statSync(lockPath).mtimeMs;
    if (age < 30 * 6e4) return { scanned: 0, captured: 0, appended: 0, whole: 0, unchanged: 0, bytesStored: 0, errors: ["another snapshot is running"] };
    fs.rmSync(lockPath);
    lock = fs.openSync(lockPath, "wx", 384);
  }
  const res = { scanned: 0, captured: 0, appended: 0, whole: 0, unchanged: 0, bytesStored: 0, errors: [] };
  const state = loadState(vault);
  const manifest = fs.openSync(path.join(vault, "manifest.jsonl"), "a", 384);
  try {
    for (const src of sources) {
      for (const abs of walk(src.root)) {
        const rel = path.relative(src.root, abs);
        const kind = src.classify(rel);
        if (!kind) continue;
        res.scanned++;
        try {
          const st = fs.statSync(abs);
          const key = `${src.name}:${rel}`;
          const prev = state[key];
          if (prev && prev.size === st.size && prev.mtimeMs === Math.floor(st.mtimeMs)) {
            res.unchanged++;
            continue;
          }
          const bytes = fs.readFileSync(abs);
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
            host: os.hostname(),
            source: src.name,
            kind,
            path: rel.split(path.sep).join("/"),
            size: bytes.length,
            mtimeMs: Math.floor(st.mtimeMs),
            sha256: full,
            blob,
            base,
            baseSize
          };
          fs.writeSync(manifest, JSON.stringify(rec) + "\n");
          state[key] = { sha256: full, size: bytes.length, mtimeMs: rec.mtimeMs };
          res.captured++;
        } catch (e) {
          res.errors.push(`${rel}: ${e.message}`);
        }
      }
    }
  } finally {
    fs.closeSync(manifest);
    fs.writeFileSync(path.join(vault, "state.json.tmp"), JSON.stringify(state), { mode: 384 });
    fs.renameSync(path.join(vault, "state.json.tmp"), path.join(vault, "state.json"));
    fs.closeSync(lock);
    fs.rmSync(lockPath, { force: true });
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
  fs.writeFileSync(path.join(vault, "heartbeat.json"), JSON.stringify(hb), { mode: 384 });
}
function writeVerifyMark(vault, r, at = /* @__PURE__ */ new Date()) {
  const m = { at: at.toISOString(), records: r.records, ok: r.ok, failures: r.failures.length };
  fs.writeFileSync(path.join(vault, "last-verify.json"), JSON.stringify(m), { mode: 384 });
}
var readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
};
var ago = (ms) => ms < 9e4 ? "just now" : ms < 90 * 6e4 ? `${Math.round(ms / 6e4)} min ago` : ms < 48 * 36e5 ? `${Math.round(ms / 36e5)} hours ago` : `${Math.round(ms / 864e5)} days ago`;
function health(vault = defaultVaultDir(), now = Date.now(), staleAfterMs = 30 * 6e4) {
  const details = [];
  const hb = readJson(path.join(vault, "heartbeat.json"));
  const vm = readJson(path.join(vault, "last-verify.json"));
  const recs = fs.existsSync(path.join(vault, "manifest.jsonl")) ? readManifest(vault) : [];
  const conversations = new Set(recs.filter((r) => r.kind === "transcript").map((r) => r.path)).size;
  const subagents = new Set(recs.filter((r) => r.kind === "subagent-transcript").map((r) => r.path)).size;
  const files = new Set(recs.filter((r) => r.kind === "file-history").map((r) => r.path)).size;
  if (!hb) return { state: "amber", headline: "Archive has not run yet on this computer.", details: [`Vault: ${vault}`] };
  const age = now - Date.parse(hb.at);
  const n = (k, one, many) => `${k.toLocaleString("en-US")} ${k === 1 ? one : many}`;
  details.push(`${n(conversations, "conversation", "conversations")}${subagents ? ` (plus ${n(subagents, "sub-agent conversation", "sub-agent conversations")})` : ""} and ${n(files, "saved version", "saved versions")} of files Claude edited, kept as exact copies.`);
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

export {
  defaultVaultDir,
  claudeCodeSource,
  tightenPermissions,
  readManifest,
  snapshot,
  reconstruct,
  verify,
  writeHeartbeat,
  writeVerifyMark,
  health
};
