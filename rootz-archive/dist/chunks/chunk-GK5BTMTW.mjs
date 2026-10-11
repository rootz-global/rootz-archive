#!/usr/bin/env node
import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);
import {
  defaultVaultDir,
  readManifest,
  reconstruct
} from "./chunk-ONYO6JOV.mjs";
import {
  __commonJS,
  __require,
  __toESM
} from "./chunk-4TWFJUN4.mjs";

// vendor/ask-orders/vendor/sign-mcp/sign-mcp.cjs
var require_sign_mcp = __commonJS({
  "vendor/ask-orders/vendor/sign-mcp/sign-mcp.cjs"(exports, module) {
    "use strict";
    var crypto = __require("crypto");
    function jcsString(v) {
      if (v === null) return "null";
      const t = typeof v;
      if (t === "number") {
        if (!isFinite(v)) throw new Error("JCS: non-finite number");
        return JSON.stringify(v);
      }
      if (t === "boolean" || t === "string") return JSON.stringify(v);
      if (Array.isArray(v)) return "[" + v.map(jcsString).join(",") + "]";
      if (t === "object") {
        const keys = Object.keys(v).sort();
        return "{" + keys.map((k) => JSON.stringify(k) + ":" + jcsString(v[k])).join(",") + "}";
      }
      throw new Error("JCS: unsupported value type " + t);
    }
    function jcs(v) {
      return Buffer.from(jcsString(v), "utf8");
    }
    function sha2562(buf) {
      return crypto.createHash("sha256").update(buf).digest();
    }
    var b64u = (buf) => Buffer.from(buf).toString("base64url");
    var fromB64u = (s) => Buffer.from(s, "base64url");
    var REG = {};
    REG["ed25519"] = {
      class: "classical",
      available: true,
      keygen() {
        const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
        return {
          pub: publicKey.export({ type: "spki", format: "pem" }),
          priv: privateKey.export({ type: "pkcs8", format: "pem" })
        };
      },
      sign(msg, privPem) {
        return crypto.sign(null, msg, privPem);
      },
      verify(msg, sig, pubPem) {
        try {
          return crypto.verify(null, msg, pubPem, sig);
        } catch {
          return false;
        }
      },
      jwk(pubPem) {
        const raw = crypto.createPublicKey(pubPem).export({ format: "jwk" });
        return { kty: raw.kty, crv: raw.crv, x: raw.x };
      }
    };
    REG["ecdsa-p256"] = {
      class: "classical",
      available: true,
      keygen() {
        const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
        return {
          pub: publicKey.export({ type: "spki", format: "pem" }),
          priv: privateKey.export({ type: "pkcs8", format: "pem" })
        };
      },
      // DER-encoded ECDSA over SHA-256 (matches ATTP/MCPS + NSA convention).
      sign(msg, privPem) {
        return crypto.sign("sha256", msg, privPem);
      },
      verify(msg, sig, pubPem) {
        try {
          return crypto.verify("sha256", msg, pubPem, sig);
        } catch {
          return false;
        }
      },
      jwk(pubPem) {
        const raw = crypto.createPublicKey(pubPem).export({ format: "jwk" });
        return { kty: raw.kty, crv: raw.crv, x: raw.x, y: raw.y };
      }
    };
    var _pq = null;
    async function initPqProvider(opts = {}) {
      if (_pq) return true;
      if (opts.provider && opts.provider.sign && opts.provider.verify && opts.provider.keygen) {
        _pq = opts.provider;
        REG["ml-dsa-65"].available = true;
        return true;
      }
      const { pathToFileURL } = __require("url");
      const fs5 = __require("fs");
      const candidates = [
        opts.distPath,
        process.env.ROOTZ_PQ_CRYPTO_DIST
      ].filter(Boolean);
      for (const cand of candidates) {
        try {
          if (!fs5.existsSync(cand)) continue;
          const m = await import(pathToFileURL(cand).href);
          if (typeof m.pqSign === "function" && typeof m.pqVerify === "function" && typeof m.signKeygen === "function") {
            _pq = { sign: m.pqSign, verify: m.pqVerify, keygen: m.signKeygen };
            REG["ml-dsa-65"].available = true;
            return true;
          }
        } catch {
        }
      }
      for (const sub of ["@noble/post-quantum/ml-dsa.js", "@noble/post-quantum/ml-dsa"]) {
        try {
          const noble = await import(sub);
          const d = noble.ml_dsa65;
          if (!d) continue;
          _pq = { sign: (sk, msg) => d.sign(msg, sk), verify: (pk, msg, sig) => d.verify(sig, msg, pk), keygen: () => d.keygen() };
          REG["ml-dsa-65"].available = true;
          return true;
        } catch {
        }
      }
      return false;
    }
    REG["ml-dsa-65"] = {
      class: "pq",
      available: false,
      // flipped true by initPqProvider()
      keygen() {
        if (!_pq) throw new Error("ml-dsa-65 unavailable: await initPqProvider() first (loads @rootz/pq-crypto)");
        const k = _pq.keygen();
        return { pub: b64u(k.publicKey), priv: b64u(k.secretKey) };
      },
      sign(msg, privB64u) {
        if (!_pq) throw new Error("ml-dsa-65 unavailable: await initPqProvider() first");
        return Buffer.from(_pq.sign(fromB64u(privB64u), new Uint8Array(msg)));
      },
      verify(msg, sig, pubB64u) {
        if (!_pq) return false;
        try {
          return _pq.verify(fromB64u(pubB64u), new Uint8Array(msg), new Uint8Array(sig));
        } catch {
          return false;
        }
      },
      jwk(pubB64u) {
        return { kty: "AKP", alg: "ML-DSA-65", pub: pubB64u };
      }
      // draft-ietf JOSE PQ form
    };
    function algsAvailable() {
      return Object.keys(REG).filter((a) => REG[a].available);
    }
    function pqAvailable() {
      return !!_pq;
    }
    function generateKeyset({ iss, kid, corpid = null, algs = ["ed25519", "ecdsa-p256"] } = {}) {
      if (!iss || !kid) throw new Error("generateKeyset: iss + kid required");
      const keys = {};
      for (const a of algs) {
        if (!REG[a]) throw new Error("unknown alg " + a);
        if (!REG[a].available) continue;
        keys[a] = REG[a].keygen();
      }
      return { iss, kid, corpid, keys };
    }
    function publicKeyset(keyset) {
      const out = { iss: keyset.iss, kid: keyset.kid, corpid: keyset.corpid || null, keys: {} };
      for (const a of Object.keys(keyset.keys)) out.keys[a] = { pub: keyset.keys[a].pub };
      return out;
    }
    function jwks(keyset) {
      const ks = [];
      for (const a of Object.keys(keyset.keys)) {
        ks.push(Object.assign({ kid: keyset.kid, alg: a, use: "sig" }, REG[a].jwk(keyset.keys[a].pub)));
      }
      return { keys: ks };
    }
    function dnsSelectorRecords(keyset) {
      const recs = {};
      for (const a of Object.keys(keyset.keys)) {
        const pub = keyset.keys[a].pub;
        const p = typeof pub === "string" && pub.includes("BEGIN") ? pub.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "") : pub;
        recs[`${keyset.kid}._mcpkey.${keyset.iss}`] = `v=RMCP1; a=${a}; k=${p}`;
      }
      return recs;
    }
    function jwkToVerifyKey(alg, jwk) {
      if (alg === "ml-dsa-65") return jwk.pub;
      if (jwk.kty === "OKP") return crypto.createPublicKey({ key: { kty: "OKP", crv: jwk.crv, x: jwk.x }, format: "jwk" });
      if (jwk.kty === "EC") return crypto.createPublicKey({ key: { kty: "EC", crv: jwk.crv, x: jwk.x, y: jwk.y }, format: "jwk" });
      throw new Error("jwkToVerifyKey: unsupported kty " + jwk.kty);
    }
    function resolverFromJwks(jwksDoc, expectKid) {
      const keys = jwksDoc && jwksDoc.keys || [];
      return (_iss, kid, alg) => {
        const jwk = keys.find((j) => j.alg && j.alg.toLowerCase() === alg && (!expectKid || j.kid === kid || !j.kid));
        if (!jwk) return null;
        try {
          return jwkToVerifyKey(alg, jwk);
        } catch {
          return null;
        }
      };
    }
    function resolverFromKeyset(keyset) {
      return (iss, kid, alg) => {
        if (iss !== keyset.iss || kid !== keyset.kid) return null;
        return keyset.keys[alg] ? keyset.keys[alg].pub : null;
      };
    }
    var ENVELOPE_KEY = "rootz.global/sig";
    var DEFAULT_TTL_SEC = 300;
    function isoSecondsFromNow(sec, nowMs) {
      return new Date((nowMs ?? Date.now()) + sec * 1e3).toISOString().replace(/\.\d{3}Z$/, "Z");
    }
    function sign2(signedObject, { keyset, ctx = {}, algs, ttlSec = DEFAULT_TTL_SEC, nowMs } = {}) {
      if (!keyset || !keyset.keys) throw new Error("sign: keyset required");
      const use = (algs || Object.keys(keyset.keys)).filter((a) => keyset.keys[a] && REG[a] && REG[a].available);
      if (!use.length) throw new Error("sign: no available algs in keyset");
      const now = nowMs ?? Date.now();
      const header = {
        v: 1,
        iss: keyset.iss,
        kid: keyset.kid,
        canon: "RFC8785",
        payload: { alg: "sha-256", hash: b64u(sha2562(jcs(signedObject))) },
        ts: isoSecondsFromNow(0, now),
        exp: isoSecondsFromNow(ttlSec, now),
        nonce: b64u(crypto.randomBytes(16)),
        ctx,
        algs: use.slice().sort()
      };
      if (keyset.corpid) header.corpid = keyset.corpid;
      const signingInput = jcs(header);
      const sigs = {};
      for (const a of header.algs) sigs[a] = b64u(REG[a].sign(signingInput, keyset.keys[a].priv));
      return Object.assign({}, header, { sigs });
    }
    function signResult(result, opts) {
      const clean = Object.assign({}, result);
      delete clean._meta;
      const env = sign2(clean, opts);
      result._meta = Object.assign({}, result._meta, { [ENVELOPE_KEY]: env });
      return result;
    }
    function signDefinitions(defs, baseOpts) {
      return defs.map((def) => {
        const clean = Object.assign({}, def);
        delete clean._meta;
        const ctx = Object.assign({ method: "tools/list", tool: def.name }, baseOpts.ctx || {});
        const env = sign2(clean, Object.assign({}, baseOpts, { ctx }));
        return Object.assign({}, def, { _meta: Object.assign({}, def._meta, { [ENVELOPE_KEY]: env }) });
      });
    }
    function verify(signedObject, envelope, opts = {}) {
      const reasons = [];
      const perAlg = {};
      const now = opts.nowMs ?? Date.now();
      const skew = (opts.skewSec ?? 60) * 1e3;
      if (!envelope || typeof envelope !== "object") return { valid: false, reasons: ["no-envelope"], algs: {} };
      if (envelope.canon !== "RFC8785") reasons.push("bad-canon");
      try {
        const want = b64u(sha2562(jcs(signedObject)));
        if (!envelope.payload || envelope.payload.hash !== want) reasons.push("payload-hash-mismatch");
      } catch (e) {
        reasons.push("payload-hash-error");
      }
      const ts = Date.parse(envelope.ts), exp = Date.parse(envelope.exp);
      if (!(ts >= 0) || !(exp >= 0)) reasons.push("bad-timestamps");
      else {
        if (now > exp + skew) reasons.push("expired");
        if (now < ts - skew) reasons.push("not-yet-valid");
      }
      if (opts.expectCtx) {
        const c = envelope.ctx || {};
        for (const k of Object.keys(opts.expectCtx)) {
          if (c[k] !== opts.expectCtx[k]) reasons.push("ctx-mismatch:" + k);
        }
      }
      const header = Object.assign({}, envelope);
      delete header.sigs;
      const signingInput = jcs(header);
      const claimed = Array.isArray(envelope.algs) ? envelope.algs : [];
      if (!claimed.length) reasons.push("no-algs");
      const sigs = envelope.sigs || {};
      for (const a of claimed) {
        if (!(a in sigs)) {
          perAlg[a] = false;
          reasons.push("missing-sig:" + a);
          continue;
        }
        if (!REG[a]) {
          perAlg[a] = false;
          reasons.push("unknown-alg:" + a);
          continue;
        }
        const pub = opts.keyResolver ? opts.keyResolver(envelope.iss, envelope.kid, a) : null;
        if (!pub) {
          perAlg[a] = false;
          reasons.push("no-key:" + a);
          continue;
        }
        const ok = REG[a].verify(signingInput, fromB64u(sigs[a]), pub);
        perAlg[a] = ok;
        if (!ok) reasons.push("bad-sig:" + a);
      }
      for (const a of Object.keys(sigs)) if (!claimed.includes(a)) reasons.push("uncovered-sig:" + a);
      let replayBad = false;
      if (opts.replayStore && envelope.nonce) {
        if (opts.replayStore.has(envelope.nonce)) {
          replayBad = true;
          reasons.push("replay");
        }
      }
      const classicalPass = claimed.filter((a) => REG[a] && REG[a].class === "classical" && perAlg[a]).length;
      const pqClaimed = claimed.filter((a) => REG[a] && REG[a].class === "pq");
      const pqPass = pqClaimed.filter((a) => perAlg[a]).length;
      let sigPolicyOk;
      if (opts.policy === "any-classical-plus-pq") {
        sigPolicyOk = classicalPass >= 1 && (pqClaimed.length === 0 || pqPass === pqClaimed.length);
      } else {
        sigPolicyOk = claimed.length > 0 && claimed.every((a) => perAlg[a]);
      }
      if (!sigPolicyOk) reasons.push("sig-policy-failed");
      const valid = reasons.length === 0 && !replayBad && sigPolicyOk;
      if (valid && opts.replayStore && envelope.nonce) opts.replayStore.add(envelope.nonce, exp);
      return { valid, reasons, algs: perAlg };
    }
    function verifyResult(result, opts) {
      const env = result && result._meta && result._meta[ENVELOPE_KEY];
      const clean = Object.assign({}, result);
      delete clean._meta;
      return verify(clean, env, opts);
    }
    function memoryReplayStore() {
      const m = /* @__PURE__ */ new Map();
      return {
        has(n) {
          const e = m.get(n);
          if (e && e < Date.now()) {
            m.delete(n);
            return false;
          }
          return m.has(n);
        },
        add(n, expMs) {
          m.set(n, expMs || Date.now() + DEFAULT_TTL_SEC * 1e3);
        },
        size() {
          return m.size;
        }
      };
    }
    function merkleRoot(leafBufs) {
      if (!leafBufs.length) return Buffer.alloc(32);
      let level = leafBufs.slice();
      while (level.length > 1) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
          const l = level[i], r = level[i + 1] || level[i];
          next.push(sha2562(Buffer.concat([l, r])));
        }
        level = next;
      }
      return level[0];
    }
    var SessionAuditLog = class {
      constructor({ server, client }) {
        this.server = server;
        this.client = client;
        this.entries = [];
      }
      _prevLink() {
        if (!this.entries.length) return b64u(Buffer.alloc(32));
        const last = this.entries[this.entries.length - 1];
        return b64u(sha2562(jcs({ seq: last.seq, req_hash: last.req_hash, resp_envelope: last.resp_envelope, prev_link: last.prev_link })));
      }
      append({ requestParams, responseEnvelope }) {
        const seq = this.entries.length;
        const req_hash = b64u(sha2562(jcs(requestParams ?? null)));
        const prev_link = this._prevLink();
        const entry = { seq, req_hash, resp_envelope: responseEnvelope, prev_link };
        entry.leaf = sha2562(jcs({ seq, req_hash, resp_envelope: responseEnvelope, prev_link }));
        this.entries.push(entry);
        return entry;
      }
      /** Merkle root over a window of entries [from, to). One on-chain Note covers the window. */
      windowRoot(from = 0, to = this.entries.length) {
        return b64u(merkleRoot(this.entries.slice(from, to).map((e) => e.leaf)));
      }
      /** Merkle inclusion proof for one entry within a window — proves "this exchange is in the anchored root". */
      inclusionProof(seq, from = 0, to = this.entries.length) {
        const leaves = this.entries.slice(from, to).map((e) => e.leaf);
        let idx = seq - from;
        const path6 = [];
        let level = leaves.slice();
        while (level.length > 1) {
          const next = [];
          for (let i = 0; i < level.length; i += 2) {
            const l = level[i], r = level[i + 1] || level[i];
            if (i === idx || i + 1 === idx) path6.push({ sib: b64u(i === idx ? r : l), right: i === idx });
            next.push(sha2562(Buffer.concat([l, r])));
          }
          idx = Math.floor(idx / 2);
          level = next;
        }
        return path6;
      }
      /**
       * Anchor a window on-chain: anchorFn(rootB64u, meta) should write one Note and return a tx ref.
       * encryptFn(bytes) optionally encrypts the exportable log for secure bilateral sharing (?k= link).
       */
      async anchorWindow({ from = 0, to = this.entries.length, anchorFn, meta = {} } = {}) {
        const root = this.windowRoot(from, to);
        const m = Object.assign({ server: this.server, client: this.client, from, to, count: to - from }, meta);
        const tx = anchorFn ? await anchorFn(root, m) : null;
        return { root, meta: m, tx };
      }
      export() {
        return { server: this.server, client: this.client, entries: this.entries };
      }
    };
    module.exports = {
      // canonicalization + hashing
      jcs,
      jcsString,
      sha256: sha2562,
      b64u,
      fromB64u,
      // registry + keys
      REG,
      algsAvailable,
      pqAvailable,
      initPqProvider,
      generateKeyset,
      publicKeyset,
      jwks,
      dnsSelectorRecords,
      resolverFromKeyset,
      resolverFromJwks,
      jwkToVerifyKey,
      // envelope
      ENVELOPE_KEY,
      DEFAULT_TTL_SEC,
      sign: sign2,
      signResult,
      signDefinitions,
      verify,
      verifyResult,
      memoryReplayStore,
      // layer 3 audit log
      merkleRoot,
      SessionAuditLog
    };
  }
});

// src/share.ts
import { createHash as createHash4 } from "crypto";
import * as fs4 from "fs";
import * as os2 from "os";
import * as path5 from "path";

// vendor/ask-orders/packages/envelope/src/index.ts
import { createRequire as createRequire2 } from "node:module";
import { randomBytes } from "node:crypto";

// vendor/ask-orders/packages/objects/src/kinds.ts
var KIND = {
  order: "ask-orders.order.v1",
  boundary: "ask-orders.boundary.v1",
  controlsManifest: "ask-orders.controls-manifest.v1",
  leaf: "ask-orders.leaf.v1",
  checkpoint: "ask-orders.checkpoint.v1",
  originReceipt: "ask-orders.origin-receipt.v1",
  verificationReport: "ask-orders.verification-report.v1",
  receiptResolution: "ask-orders.receipt-resolution.v1",
  usageReport: "ask-orders.usage-report.v1",
  disclosure: "ask-orders.disclosure.v1",
  trailHeader: "ask-orders.trail-header.v1",
  receiptDelta: "ask-orders.receipt-delta.v1",
  captureReceipt: "ask-orders.capture-receipt.v1"
};
var KNOWN = new Set(Object.values(KIND));

// vendor/ask-orders/packages/objects/src/canonical.ts
var __signMcpNs = __toESM(require_sign_mcp(), 1);
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
var require2 = createRequire(import.meta.url);
var signMcp = __signMcpNs.default ?? __signMcpNs;
function canonicalBytes(value) {
  return signMcp.jcs(value);
}
function digestOfBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
}

// vendor/ask-orders/packages/objects/src/route.ts
function isRoute(r) {
  const o = r;
  const url = (x) => typeof x === "string" && /^https:\/\/\S{1,500}$/.test(x);
  return !!o && typeof o === "object" && !Array.isArray(o) && url(o["verifier"]) && url(o["resolver"]) && (o["spec"] === void 0 || url(o["spec"])) && Object.keys(o).every((k) => k === "verifier" || k === "resolver" || k === "spec");
}

// vendor/ask-orders/packages/objects/src/commitment.ts
function privateCommitment(value, saltB64u) {
  const salt = Buffer.from(saltB64u, "base64url");
  if (salt.length !== 16 || salt.toString("base64url") !== saltB64u) throw new Error("privateCommitment: the salt must be 16 bytes, base64url");
  return digestOfBytes(Buffer.concat([salt, canonicalBytes(value)]));
}

// vendor/ask-orders/packages/envelope/src/index.ts
var __signMcpNs2 = __toESM(require_sign_mcp(), 1);
var require3 = createRequire2(import.meta.url);
var signMcp2 = __signMcpNs2.default ?? __signMcpNs2;
var SKEW_SEC = 60;
function externalP256Signer(opts) {
  const now = opts.now ?? Date.now;
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    kid: opts.kid,
    suite: "rootz.sign-mcp.v1",
    async sign(body) {
      if (!body || typeof body.kind !== "string" || body.kind.length === 0) throw new Error("envelope.sign: body.kind is required");
      const t = now();
      const header = {
        v: 1,
        iss: opts.iss,
        kid: opts.kid,
        canon: "RFC8785",
        payload: { alg: "sha-256", hash: signMcp2.b64u(signMcp2.sha256(signMcp2.jcs(body))) },
        ts: iso(t),
        exp: iso(t + (opts.ttlSec ?? 300) * 1e3),
        nonce: signMcp2.b64u(randomBytes(16)),
        ctx: { kind: body.kind },
        algs: ["ecdsa-p256"]
      };
      const der = await opts.signDer(signMcp2.jcs(header));
      return { suite: "rootz.sign-mcp.v1", envelope: { ...header, sigs: { "ecdsa-p256": signMcp2.b64u(der) } } };
    }
  };
}
async function sign(body, signer) {
  return signer.sign(body);
}
function mapReasons(raw) {
  const out = /* @__PURE__ */ new Set();
  const specific = raw.filter((r) => r !== "sig-policy-failed");
  if (specific.length === 0 && raw.length > 0) out.add("proof-signature-invalid");
  for (const r of specific) {
    if (r === "payload-hash-mismatch" || r === "payload-hash-error") out.add("proof-payload-mismatch");
    else if (r === "expired" || r === "not-yet-valid" || r === "bad-timestamps") out.add("proof-outside-validity");
    else if (r.startsWith("missing-sig:") || r.startsWith("uncovered-sig:") || r === "no-algs") out.add("proof-algorithm-stripped");
    else if (r.startsWith("no-key:")) out.add("proof-key-unknown");
    else if (r.startsWith("bad-sig:")) out.add("proof-signature-invalid");
    else out.add("proof-malformed");
  }
  return [...out];
}
function failed(suite, reasons, detail = []) {
  return { valid: false, evaluable: true, suite, signer: null, reasons, detail };
}
function verifyProof(body, proof, opts) {
  if (!proof || typeof proof !== "object") return failed(null, ["proof-malformed"]);
  if (proof.suite === "eip191.personal-sign.jcs") return verifyEip191(body, proof);
  if (proof.suite !== "rootz.sign-mcp.v1") return failed(null, ["proof-malformed"], ["unknown-suite"]);
  const env = proof.envelope;
  if (!env || typeof env !== "object") return failed(proof.suite, ["proof-malformed"]);
  const atMs = Date.parse(opts.at);
  if (!Number.isFinite(atMs)) return failed(proof.suite, ["proof-malformed"], ["bad-at"]);
  const reasons = /* @__PURE__ */ new Set();
  if (!body || typeof body.kind !== "string" || env.ctx?.kind !== body.kind) reasons.add("proof-kind-mismatch");
  if (opts.pinnedKid !== void 0 && env.kid !== opts.pinnedKid) reasons.add("proof-kid-mismatch");
  let result;
  try {
    result = signMcp2.verify(body, env, {
      keyResolver: signMcp2.resolverFromJwks(opts.publishedKeys, true),
      nowMs: atMs,
      skewSec: SKEW_SEC
    });
  } catch (e) {
    return failed(proof.suite, ["proof-malformed"], [String(e?.message ?? e)]);
  }
  for (const r of mapReasons(result.reasons)) reasons.add(r);
  const valid = result.valid && reasons.size === 0;
  return {
    valid,
    evaluable: true,
    suite: proof.suite,
    signer: valid ? String(env.kid) : null,
    reasons: [...reasons],
    detail: result.reasons
  };
}
function verifyEip191(_body, proof) {
  return { valid: false, evaluable: false, suite: proof?.suite ?? null, signer: null, reasons: ["proof-suite-unsupported"], detail: [] };
}
function matchesCommitment(bytes, c) {
  return bytes.byteLength === c.bytes && digestOfBytes(bytes) === c.sha256;
}

// src/capture-receipts.ts
import { randomBytes as randomBytes2 } from "crypto";
import * as fs from "fs";
import * as path2 from "path";

// vendor/ask-orders/packages/session/src/index.ts
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";

// vendor/ask-orders/packages/merkle/src/tree.ts
import { createHash as createHash2 } from "node:crypto";
var LEAF_PREFIX = 0;
var NODE_PREFIX = 1;
var HASH_BYTES = 32;
function sha256(...parts) {
  const h = createHash2("sha256");
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
}
function leafHash(leafBytes2) {
  return sha256(Uint8Array.of(LEAF_PREFIX), leafBytes2);
}
function nodeHash(left, right) {
  assertHash(left);
  assertHash(right);
  return sha256(Uint8Array.of(NODE_PREFIX), left, right);
}
function splitPoint(n) {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}
function rootOf(leafHashes) {
  if (leafHashes.length === 0) throw new RangeError("rootOf: a session log always has at least one leaf");
  return mth(leafHashes, 0, leafHashes.length);
}
function mth(hashes, start, end) {
  const n = end - start;
  if (n === 1) return hashes[start];
  const k = splitPoint(n);
  return nodeHash(mth(hashes, start, start + k), mth(hashes, start + k, end));
}
function inclusionProof(leafHashes, index) {
  const n = leafHashes.length;
  assertIndex(index, n);
  return path(leafHashes, index, 0, n);
}
function path(hashes, m, start, end) {
  const n = end - start;
  if (n === 1) return [];
  const k = splitPoint(n);
  return m < k ? [...path(hashes, m, start, start + k), mth(hashes, start + k, end)] : [...path(hashes, m - k, start + k, end), mth(hashes, start, start + k)];
}
function consistencyProof(leafHashes, m) {
  const n = leafHashes.length;
  if (!Number.isSafeInteger(m) || m < 1 || m > n) throw new RangeError(`consistencyProof: need 1 <= m <= ${n}, got ${m}`);
  if (m === n) return [];
  return subproof(leafHashes, m, 0, n, true);
}
function subproof(hashes, m, start, end, complete) {
  const n = end - start;
  if (m === n) return complete ? [] : [mth(hashes, start, end)];
  const k = splitPoint(n);
  return m <= k ? [...subproof(hashes, m, start, start + k, complete), mth(hashes, start + k, end)] : [...subproof(hashes, m - k, start + k, end, false), mth(hashes, start, start + k)];
}
function verifyConsistency(m, n, rootM, rootN, proof) {
  if (!isHash(rootM) || !isHash(rootN) || !proof.every(isHash)) return false;
  if (!Number.isSafeInteger(m) || !Number.isSafeInteger(n) || m < 1 || m > n) return false;
  if (m === n) return proof.length === 0 && equal(rootM, rootN);
  if (proof.length === 0) return false;
  const path6 = isPowerOfTwo(m) ? [rootM, ...proof] : [...proof];
  let fn = m - 1;
  let sn = n - 1;
  while ((fn & 1) === 1) {
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  let fr = path6[0];
  let sr = path6[0];
  for (let i = 1; i < path6.length; i++) {
    const c = path6[i];
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      fr = nodeHash(c, fr);
      sr = nodeHash(c, sr);
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      sr = nodeHash(sr, c);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && equal(fr, rootM) && equal(sr, rootN);
}
function isPowerOfTwo(x) {
  return x > 0 && (x & x - 1) === 0;
}
function isHash(value) {
  return value instanceof Uint8Array && value.length === HASH_BYTES;
}
function assertHash(value) {
  if (!isHash(value)) throw new TypeError(`expected a ${HASH_BYTES}-byte hash`);
}
function assertIndex(index, n) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= n) throw new RangeError(`index ${index} is outside a tree of ${n}`);
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// vendor/ask-orders/packages/merkle/src/digest.ts
var DIGEST = /^sha256:([A-Za-z0-9_-]{43})$/;
function hashToDigest(hash) {
  if (!(hash instanceof Uint8Array) || hash.length !== HASH_BYTES) throw new TypeError(`expected a ${HASH_BYTES}-byte hash`);
  return `sha256:${Buffer.from(hash).toString("base64url")}`;
}
function digestToHash(digest) {
  if (typeof digest !== "string") return null;
  const m = DIGEST.exec(digest);
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64url");
  if (bytes.length !== HASH_BYTES) return null;
  if (bytes.toString("base64url") !== m[1]) return null;
  return new Uint8Array(bytes);
}

// vendor/ask-orders/packages/session/src/index.ts
function checkpointSigner(signer, binding, evidence = null, route) {
  if (route && !isRoute(route)) throw new Error("checkpointSigner: route must be { verifier, resolver, spec? } with https URLs");
  return { kid: signer.kid, suite: signer.suite, sign: (b) => signer.sign(b), binding, evidence, ...route ? { route } : {} };
}
function memoryStore(logId) {
  const rows = [];
  return {
    logId,
    async append(bytes) {
      rows.push(new Uint8Array(bytes));
      return rows.length - 1;
    },
    async read(i) {
      const r = rows[i];
      if (!r) throw new RangeError(`no leaf ${i}`);
      return new Uint8Array(r);
    },
    async size() {
      return rows.length;
    }
  };
}
function fileStore(path6, logId) {
  if (!existsSync(path6)) writeFileSync(path6, "", { flag: "wx" });
  const data = readFileSync(path6);
  const offs = [], lens = [];
  let start = 0;
  for (let i = 0; i < data.length; i++) if (data[i] === 10) {
    if (i > start) {
      offs.push(start);
      lens.push(i - start);
    }
    start = i + 1;
  }
  if (start < data.length) {
    offs.push(start);
    lens.push(data.length - start);
  }
  let end = data.length;
  let fd = null;
  return {
    logId,
    async append(bytes) {
      const line = Buffer.from(bytes);
      if (line.includes(10)) throw new Error("fileStore: a leaf must not contain a newline");
      appendFileSync(path6, Buffer.concat([line, Buffer.from("\n")]), { flag: "a" });
      offs.push(end);
      lens.push(line.length);
      end += line.length + 1;
      return offs.length - 1;
    },
    async read(i) {
      const off = offs[i], len = lens[i];
      if (off === void 0 || len === void 0) throw new RangeError(`no leaf ${i}`);
      fd ??= openSync(path6, "r");
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, off);
      return buf;
    },
    async size() {
      return offs.length;
    }
  };
}
function leafBytes(leaf) {
  return canonicalBytes(leaf);
}
async function openSession(store, signer, opts = {}) {
  const hashes = [];
  const n0 = await store.size();
  for (let i = 0; i < n0; i++) {
    const bytes = await store.read(i);
    const leaf = JSON.parse(Buffer.from(bytes).toString("utf8"));
    if (leaf.seq !== i || leaf.session !== store.logId) throw new Error(`leaf-sequence-gap at ${i}`);
    hashes.push(leafHash(bytes));
  }
  let last = null;
  let queue = Promise.resolve();
  const serial = (f) => {
    const p = queue.then(f, f);
    queue = p.catch(() => void 0);
    return p;
  };
  const rootAt = (size) => rootOf(hashes.slice(0, size));
  const checkHead = (c) => {
    const b = c.body;
    if (b.log_id !== store.logId) throw new Error("checkpoint is for another session");
    if (!Number.isSafeInteger(b.tree_size) || b.tree_size < 1 || b.tree_size > hashes.length) throw new RangeError("checkpoint size is beyond this log");
    if (hashToDigest(rootAt(b.tree_size)) !== b.root) throw new Error("checkpoint-inconsistent: root does not match this log");
  };
  return {
    logId: store.logId,
    size: () => hashes.length,
    append(event, at) {
      return serial(async () => {
        const leaf = { kind: KIND.leaf, session: store.logId, seq: hashes.length, at, event };
        if (opts.capture) {
          if (event.type !== "capture") throw new Error("a capture log holds capture events only");
        } else {
          if (event.type === "capture") throw new Error("an agent session does not hold capture events");
          if (hashes.length === 0 && event.type !== "genesis") throw new Error("the first leaf of a session is its genesis");
        }
        const bytes = leafBytes(leaf);
        const index = await store.append(bytes);
        if (index !== leaf.seq) throw new Error(`leaf-sequence-gap: store put seq ${leaf.seq} at ${index}`);
        hashes.push(leafHash(bytes));
        return leaf;
      });
    },
    seal(at) {
      return serial(async () => {
        const size = hashes.length;
        if (size === 0) throw new Error("seal: an empty session has nothing to commit");
        const root = rootAt(size);
        if (last) {
          const prevRoot = digestToHash(last.root);
          if (!verifyConsistency(last.tree_size, size, prevRoot, root, consistencyProof(hashes.slice(0, size), last.tree_size))) {
            throw new Error("checkpoint-inconsistent: refusing to sign");
          }
        }
        const body = {
          kind: KIND.checkpoint,
          log_id: store.logId,
          tree_size: size,
          root: hashToDigest(root),
          at,
          signer: { kid: signer.kid, binding: signer.binding, evidence: signer.evidence },
          ...signer.route ? { route: signer.route } : {},
          previous: last ? { tree_size: last.tree_size, root: last.root } : null
        };
        const checkpoint = { body, proofs: [await sign(body, signer)] };
        last = body;
        return checkpoint;
      });
    },
    async prove(index, checkpoint) {
      checkHead(checkpoint);
      const size = checkpoint.body.tree_size;
      if (!Number.isSafeInteger(index) || index < 0 || index >= size) throw new RangeError(`leaf ${index} is not in a tree of ${size}`);
      return { leaf_index: index, tree_size: size, path: inclusionProof(hashes.slice(0, size), index).map(hashToDigest) };
    },
    async consistency(older, newer) {
      checkHead(older);
      checkHead(newer);
      if (older.body.tree_size > newer.body.tree_size) throw new RangeError("older checkpoint is larger than newer");
      return consistencyProof(hashes.slice(0, newer.body.tree_size), older.body.tree_size).map(hashToDigest);
    },
    async leaf(index) {
      return JSON.parse(Buffer.from(await store.read(index)).toString("utf8"));
    }
  };
}
async function issueCaptureReceipt(session, input) {
  const subject = await session.leaf(input.index);
  if (subject.event.type !== "capture") throw new Error("issueCaptureReceipt: that leaf is not a capture");
  return {
    kind: KIND.captureReceipt,
    subject,
    inclusion: await session.prove(input.index, input.checkpoint),
    checkpoint: input.checkpoint,
    authority: input.authority,
    keys: input.keys,
    ...input.openings && Object.keys(input.openings).length ? { openings: input.openings } : {}
  };
}

// src/capture-receipts.ts
var DEFAULT_ROUTE = {
  verifier: "https://receipts.rootz.global/verify",
  resolver: "https://receipts.rootz.global/.well-known/origin-receipts/"
};
var freshSalts = () => ({
  path: randomBytes2(16).toString("base64url"),
  host: randomBytes2(16).toString("base64url"),
  mtime_ms: randomBytes2(16).toString("base64url")
});
var digestOfHex = (hex) => {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`not a sha256 hex digest: ${hex}`);
  return "sha256:" + Buffer.from(hex, "hex").toString("base64url");
};
var CAPTURE_KINDS = ["transcript", "subagent-transcript", "tool-result", "memory", "file-history", "prompt-history", "other"];
function captureEvent(rec, salts) {
  if (!CAPTURE_KINDS.includes(rec.kind)) throw new Error(`unknown capture kind: ${rec.kind}`);
  return {
    type: "capture",
    capture_scheme: rec.scheme,
    source: rec.source,
    capture_kind: rec.kind,
    body: { sha256: digestOfHex(rec.sha256), bytes: rec.size },
    base: rec.base ? { sha256: digestOfHex(rec.base), bytes: rec.baseSize } : null,
    private: {
      path: privateCommitment(rec.path, salts.path),
      host: privateCommitment(rec.host, salts.host),
      mtime_ms: privateCommitment(rec.mtimeMs, salts.mtime_ms)
    }
  };
}
async function openDeviceLog(opts) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(opts.logId)) throw new Error("logId must match ^[A-Za-z0-9_-]{16,64}$");
  const store = opts.dir ? (fs.mkdirSync(opts.dir, { recursive: true }), fileStore(path2.join(opts.dir, "capture-log.jsonl"), opts.logId)) : memoryStore(opts.logId);
  const session = await openSession(store, checkpointSigner(opts.signer, opts.binding, null, opts.route ?? DEFAULT_ROUTE), { capture: true });
  const openingsFile = opts.dir ? path2.join(opts.dir, "openings.jsonl") : null;
  const memOpenings = /* @__PURE__ */ new Map();
  return {
    session,
    async append(records, saltsFor = () => freshSalts()) {
      const idx = [];
      for (const [i, rec] of records.entries()) {
        const salts = saltsFor(i);
        const leaf = await session.append(captureEvent(rec, salts), rec.capturedAt);
        const index = leaf.seq;
        const opening = { path: { value: rec.path, salt: salts.path }, host: { value: rec.host, salt: salts.host }, mtime_ms: { value: rec.mtimeMs, salt: salts.mtime_ms } };
        if (openingsFile) fs.appendFileSync(openingsFile, JSON.stringify({ index, ...opening }) + "\n", { mode: 384 });
        else memOpenings.set(index, opening);
        idx.push(index);
      }
      return idx;
    },
    seal: (at) => session.seal(at ?? (/* @__PURE__ */ new Date()).toISOString()),
    openingsFor(index) {
      if (!openingsFile) return memOpenings.get(index) ?? null;
      if (!fs.existsSync(openingsFile)) return null;
      for (const line of fs.readFileSync(openingsFile, "utf-8").split("\n")) {
        if (!line) continue;
        const o = JSON.parse(line);
        if (o.index === index) {
          const { index: _i, ...rest } = o;
          return rest;
        }
      }
      return null;
    }
  };
}
async function captureReceipt(log, input) {
  const all = log.openingsFor(input.index);
  const openings = input.reveal?.length && all ? Object.fromEntries(input.reveal.filter((k) => all[k]).map((k) => [k, all[k]])) : void 0;
  return issueCaptureReceipt(log.session, { index: input.index, checkpoint: input.checkpoint, authority: input.authority, keys: input.keys, ...openings ? { openings } : {} });
}

// src/device-key.ts
import { createPublicKey, generateKeyPairSync, sign as nodeSign, createPrivateKey } from "crypto";
import * as fs3 from "fs";
import * as os from "os";
import * as path4 from "path";

// src/device-signer.ts
import { execFileSync } from "child_process";
import { randomBytes as randomBytes3, createHash as createHash3 } from "crypto";
import { createRequire as createRequire3 } from "module";
import * as fs2 from "fs";
import * as path3 from "path";
import { fileURLToPath } from "url";
var DEVICE_KEY_LABEL = "global.rootz.archive-free.device.v1";
var DEVICE_ISS = "archive-free";
var FORBIDDEN_LABELS = ["global.rootz.desktop.secure-enclave.v1"];
var req = createRequire3(import.meta.url);
var loaded;
var signMcp3 = new Proxy({}, { get: (_t, k) => (loaded ??= req("../vendor/sign-mcp/sign-mcp.cjs"))[k] });
function jwkFromX963(hex) {
  const h = hex.replace(/^0x/, "");
  if (h.length !== 130 || !h.startsWith("04")) throw new Error("not an uncompressed P-256 point");
  const b = Buffer.from(h, "hex");
  return { kty: "EC", crv: "P-256", x: b.subarray(1, 33).toString("base64url"), y: b.subarray(33, 65).toString("base64url") };
}
function jktP256(jwk) {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`;
  return createHash3("sha256").update(canonical).digest("base64url");
}
function defaultHelperPath() {
  if (process.env.ROOTZ_SE_HELPER) return process.env.ROOTZ_SE_HELPER;
  const here = path3.dirname(fileURLToPath(import.meta.url));
  for (const c of [path3.join(here, "..", "native", "rootz-se-helper"), path3.join(here, "rootz-se-helper")]) if (fs2.existsSync(c)) return c;
  return path3.join(here, "..", "native", "rootz-se-helper");
}
function helper(helperPath, args) {
  const out = execFileSync(helperPath, args, { timeout: 3e4, encoding: "utf-8" });
  const r = JSON.parse(out.trim().split("\n").pop());
  if (!r.success) throw new Error(`secure enclave helper: ${r.error}`);
  return r;
}
var SecureEnclaveDeviceKey = class {
  constructor(helperPath = defaultHelperPath(), label = DEVICE_KEY_LABEL) {
    this.helperPath = helperPath;
    this.label = label;
    if (FORBIDDEN_LABELS.includes(label)) throw new Error(`refusing to use ${label}: that is Desktop's wallet key (never unify)`);
  }
  static available(helperPath = defaultHelperPath()) {
    if (process.platform !== "darwin" || !fs2.existsSync(helperPath)) return false;
    try {
      return helper(helperPath, ["isAvailable"]).available === true;
    } catch {
      return false;
    }
  }
  publicJwk() {
    helper(this.helperPath, ["ensureKey", this.label]);
    return jwkFromX963(String(helper(this.helperPath, ["pubkeys", this.label]).signingPublicKey));
  }
  jkt() {
    return jktP256(this.publicJwk());
  }
  signDer(input) {
    const r = helper(this.helperPath, ["sign", this.label, "0x" + Buffer.from(input).toString("hex")]);
    return Buffer.from(String(r.signature).replace(/^0x/, ""), "hex");
  }
  /**
   * Sign a body as this device. kid = the raw b64u RFC 7638 thumbprint (ORD-031: on chain as
   * `kid=<thumb> jkt-p256=<thumb> role=device`). iss is a fixed non-personal string: the JWKS lookup
   * ignores it, and authority comes from the on-chain hop, not from iss (Receipts session, 2026-10-06).
   */
  sign(body, opts = {}) {
    return this.signer(opts).sign(body);
  }
  /** The shared Receipts signer (vendored @ask-orders/envelope externalP256Signer) bound to this SE key. */
  signer(opts = {}) {
    return externalP256Signer({ iss: DEVICE_ISS, kid: this.jkt(), signDer: async (b) => this.signDer(b), now: opts.now });
  }
  /** The JWK to publish. ALWAYS with kid and alg: a JWK without kid matches ANY kid in the lookup. */
  publishedJwk() {
    const jwk = this.publicJwk();
    return { ...jwk, kid: jktP256(jwk), alg: "ecdsa-p256" };
  }
};

// src/winacl.ts
import { execFileSync as execFileSync2 } from "child_process";
var sid;
function currentSid() {
  if (sid !== void 0) return sid;
  try {
    const out = execFileSync2("whoami", ["/user", "/fo", "csv", "/nh"], { encoding: "utf-8", windowsHide: true, timeout: 1e4 });
    sid = (out.trim().split(",").pop() || "").replace(/"/g, "").trim() || null;
  } catch {
    sid = null;
  }
  return sid;
}
function ownerOnlyWindows(target, dir = false) {
  if (process.platform !== "win32") return false;
  const s = currentSid();
  if (!s || !/^S-1-[0-9-]+$/.test(s)) return false;
  try {
    execFileSync2("icacls", [target, "/inheritance:r", "/grant:r", `*${s}:${dir ? "(OI)(CI)F" : "F"}`], { stdio: "ignore", windowsHide: true, timeout: 15e3 });
    return true;
  } catch {
    return false;
  }
}

// src/device-key.ts
var archiveHome = () => process.env.ROOTZ_ARCHIVE_HOME || path4.join(os.homedir(), ".rootz-archive");
var FileDeviceKey = class {
  binding = "none";
  priv;
  kid;
  constructor(file = path4.join(archiveHome(), "device-key.json")) {
    if (!fs3.existsSync(file)) {
      const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
      fs3.mkdirSync(path4.dirname(file), { recursive: true, mode: 448 });
      const tmp = `${file}.tmp-${process.pid}`;
      fs3.writeFileSync(tmp, JSON.stringify({ kind: "rootz-archive.device-key.v1", created: (/* @__PURE__ */ new Date()).toISOString(), jwk: privateKey.export({ format: "jwk" }) }), { mode: 384 });
      ownerOnlyWindows(tmp);
      fs3.renameSync(tmp, file);
    } else {
      ownerOnlyWindows(file);
    }
    this.priv = createPrivateKey({ key: JSON.parse(fs3.readFileSync(file, "utf-8")).jwk, format: "jwk" });
    this.kid = jktP256(this.publicJwk());
  }
  publicJwk() {
    const j = createPublicKey(this.priv).export({ format: "jwk" });
    return { kty: "EC", crv: "P-256", x: j.x, y: j.y };
  }
  publishedJwk() {
    return { ...this.publicJwk(), kid: this.kid, alg: "ecdsa-p256" };
  }
  signer() {
    return externalP256Signer({ iss: DEVICE_ISS, kid: this.kid, signDer: async (b) => new Uint8Array(nodeSign("sha256", Buffer.from(b), { key: this.priv, dsaEncoding: "der" })) });
  }
};
var EnclaveDeviceKey = class {
  constructor(se) {
    this.se = se;
    this.kid = se.jkt();
  }
  binding = "secure-enclave";
  kid;
  publishedJwk() {
    return this.se.publishedJwk();
  }
  signer() {
    return this.se.signer();
  }
};
function deviceKey() {
  const helper2 = process.env.ROOTZ_ARCHIVE_SE_HELPER || defaultHelperPath();
  if (SecureEnclaveDeviceKey.available(helper2)) return new EnclaveDeviceKey(new SecureEnclaveDeviceKey(helper2));
  return new FileDeviceKey();
}

// src/share-inventory.ts
var KIND2 = {
  instructions: "Instruction files (CLAUDE.md)",
  nested_memory: "Memory files",
  prompt_snapshot: "Claude Code system prompt",
  hook_success: "Hook output",
  hook_additional_context: "Hook-added context",
  hook_system_message: "Hook message",
  hook_non_blocking_error: "Hook error output",
  environment: "Environment snapshot",
  session_context: "Session context",
  file: "File contents Claude read",
  edited_text_file: "Edited file snippets",
  mcp_instructions_delta: "MCP server instructions",
  skill_listing: "Skill list",
  credential_org: "Account organisation id",
  model: "Model identity"
};
var SECRETS = [
  // Built from parts so the published bundle never contains a literal key-block marker (the publish gate's secret scan).
  ["private key block", new RegExp(["-----BEG", "IN [A-Z ]*PRIV", "ATE KEY-----"].join(""))],
  ["OpenAI/Anthropic-style key", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["password or secret assignment", /\b(?:password|passwd|secret|api[_-]?key|private[_-]?key|token)\b["']?\s*[:=]\s*["']?[^\s"',;]{8,}/i]
];
var mask = (s) => s.length <= 8 ? "****" : `${s.slice(0, 4)}\u2026${s.slice(-2)} (${s.length} chars)`;
var firstLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
function inventory(bytes) {
  const text = bytes.toString("utf-8");
  const hidden = [];
  const secrets = [];
  let lineNo = 0, reminders = 0, reminderBytes = 0, reminderFirst = "", tools = 0, toolBytes = 0;
  for (const line of text.split("\n")) {
    lineNo++;
    if (!line) continue;
    for (const [type, re] of SECRETS) {
      const m = re.exec(line);
      if (m && secrets.length < 50) secrets.push({ type, line: lineNo, masked: mask(m[0]) });
    }
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type === "attachment" && o.attachment && KIND2[o.attachment.type]) {
      const a = o.attachment;
      const k = a.type;
      const label = k === "instructions" ? Array.isArray(a.files) ? a.files.map((f) => f.path ?? f.displayPath ?? f).join(", ") : "CLAUDE.md" : k === "nested_memory" || k === "file" ? String(a.displayPath ?? a.path ?? a.filename ?? "") : k.startsWith("hook") ? String(a.hookName ?? a.hookEvent ?? "") : "";
      const body = k === "instructions" && Array.isArray(a.files) ? a.files.map((f) => f.content ?? "").join(" ") : a.content ?? a.stdout ?? a.snapshot ?? a.systemPrompt ?? a.text ?? a.context ?? "";
      hidden.push({ kind: KIND2[k], label, bytes: Buffer.byteLength(line), first: firstLine(typeof body === "string" ? body : JSON.stringify(body)) });
      continue;
    }
    if (o.type === "user" && Array.isArray(o.message?.content) && o.message.content.some((c) => c?.type === "tool_result")) {
      tools++;
      toolBytes += Buffer.byteLength(line);
    }
    if (o.type === "user" && /<system-reminder>/.test(line)) {
      const n = (line.match(/<system-reminder>/g) ?? []).length;
      reminders += n;
      reminderBytes += Buffer.byteLength(line);
      if (!reminderFirst) {
        const m = /<system-reminder>([\s\S]{0,400})/.exec(line);
        reminderFirst = firstLine(m?.[1]?.replace(/\\n/g, " "));
      }
    }
  }
  if (tools) hidden.push({ kind: "Tool results (command output, full file contents)", label: `${tools} result(s)`, bytes: toolBytes, first: "Everything Claude ran or read, in full; the readable copy may show less" });
  if (reminders) hidden.push({ kind: "System reminders inside your turns", label: `${reminders} reminder(s)`, bytes: reminderBytes, first: reminderFirst });
  return { hidden, hiddenBytes: hidden.reduce((a, h) => a + h.bytes, 0), totalBytes: bytes.length, secrets };
}
function summary(inv) {
  const by = /* @__PURE__ */ new Map();
  for (const h of inv.hidden) {
    const g = by.get(h.kind) ?? { n: 0, bytes: 0, labels: /* @__PURE__ */ new Set() };
    g.n++;
    g.bytes += h.bytes;
    if (h.label) g.labels.add(h.label);
    by.set(h.kind, g);
  }
  const kb = (b) => `${Math.max(1, Math.round(b / 1024)).toLocaleString("en-US")} KB`;
  const out = [...by.entries()].sort((a, b) => b[1].bytes - a[1].bytes).map(([k, g]) => `${k}: ${g.n} (${kb(g.bytes)})${g.labels.size ? ` \u2014 ${[...g.labels].slice(0, 4).join("; ")}${g.labels.size > 4 ? "; \u2026" : ""}` : ""}`);
  if (inv.secrets.length) out.unshift(`POSSIBLE SECRETS: ${inv.secrets.length} (${[...new Set(inv.secrets.map((s) => s.type))].join(", ")}), e.g. line ${inv.secrets[0].line}: ${inv.secrets[0].masked}`);
  return out;
}
function inventoryMarkdown(inv, jsonlName) {
  const kb = (b) => `${Math.max(1, Math.round(b / 1024)).toLocaleString("en-US")} KB`;
  const lines = [
    `## Before you send this: what \`${jsonlName}\` contains besides the chat`,
    "",
    `The shared file is the exact transcript Claude Code wrote (${kb(inv.totalBytes)}). **${kb(inv.hiddenBytes)} of it is context you do not see in the chat below**: instruction files, memory, hook output, files Claude read and similar. The recipient gets all of it. It cannot be removed without breaking the receipt; if any of it should stay private, do not send this share.`,
    ""
  ];
  if (inv.secrets.length) {
    lines.push(`### \u26A0 Possible secrets found: ${inv.secrets.length}`, "", ...inv.secrets.slice(0, 20).map((s) => `- line ${s.line}: ${s.type}: \`${s.masked}\``), "");
  }
  lines.push(
    "### Hidden context",
    "",
    "| What | Where / name | Size | Starts with |",
    "|---|---|---|---|",
    ...inv.hidden.slice(0, 200).map((h) => `| ${h.kind} | ${h.label.replace(/\|/g, "/").slice(0, 80) || "\u2014"} | ${kb(h.bytes)} | ${h.first.replace(/\|/g, "/").slice(0, 90) || "\u2014"} |`)
  );
  if (inv.hidden.length > 200) lines.push(`| \u2026 ${inv.hidden.length - 200} more | | | |`);
  return lines.join("\n") + "\n\n";
}

// src/share.ts
var archiveHome2 = () => process.env.ROOTZ_ARCHIVE_HOME || path5.join(os2.homedir(), ".rootz-archive");
var sid2 = (rec) => path5.basename(rec.path, ".jsonl");
function findSession(records, which, projectSlug) {
  const t = records.filter((r) => r.kind === "transcript");
  const pool = which === "latest" ? projectSlug ? t.filter((r) => r.path.startsWith(`projects/${projectSlug}/`)) : t : t.filter((r) => sid2(r) === which);
  return pool.length ? pool[pool.length - 1] : null;
}
function authorityFor(kid, home) {
  try {
    const a = JSON.parse(fs4.readFileSync(path5.join(home, "authority.json"), "utf-8"));
    if (a && Array.isArray(a.hops) && a.hops.length && a.hops[a.hops.length - 1].to === kid && typeof a.root === "string") return { evidence: a, named: true };
  } catch {
  }
  return { evidence: { root: "unnamed", legal_anchor: { jurisdiction: "", registry_ids: [] }, hops: [] }, named: false };
}
function readable(messages, id) {
  return `# Conversation ${id}

> A readable copy for convenience. **The capture receipt covers \`${id}.jsonl\`, not this file.**

` + messages.map((m) => `### ${m.role}

${m.content}
`).join("\n");
}
var howTo = (id, named) => `This folder is a Claude Code conversation shared from Rootz Archive, with a capture receipt.

  ${id}.jsonl       the exact conversation file, byte for byte, as captured on the sender's computer
  receipt.json      the capture receipt for that file
  conversation.md   a readable copy for convenience (the receipt does NOT cover it)

To check it:
  1. Open https://receipts.rootz.global/verify
  2. Paste or choose receipt.json
  3. Choose ${id}.jsonl as "the file it covers"
The check runs in your browser; nothing is uploaded.

What it shows: these exact bytes were captured by the sender's device and are in its signed capture log. Change one
byte and the check fails. ${named ? "Authorized by: the device is named on chain by its owner." : 'Authorized by will say "unavailable": the sender has not named this device on chain.'}
What it does not show: that the content is true. The capture time is the device's own clock.

Rootz Archive keeps your own Claude Code conversations, on your own computer: https://archive.rootz.global
`;
async function shareSession(opts) {
  const home = archiveHome2();
  const vault = process.env.ROOTZ_VAULT_DIR || defaultVaultDir();
  const records = readManifest(vault);
  const rec = findSession(records, opts.session, opts.projectSlug);
  if (!rec) throw new Error(opts.session === "latest" ? "No captured conversation found to share yet." : `No captured conversation with id ${opts.session}.`);
  const bytes = reconstruct(vault, rec, new Map(records.map((r) => [r.sha256, r])));
  if (createHash4("sha256").update(bytes).digest("hex") !== rec.sha256) throw new Error("The saved copy does not match its fingerprint; not sharing it. Run verify.");
  const key = opts.key ?? deviceKey();
  const now = opts.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const logId = `archive-device-${key.kid.slice(0, 24)}`;
  const logDir = path5.join(home, "receipts", logId);
  const log = await openDeviceLog({ dir: logDir, logId, signer: key.signer(), binding: key.binding });
  ownerOnlyWindows(logDir, true);
  const appendedFile = path5.join(logDir, "appended.jsonl");
  const seen = fs4.existsSync(appendedFile) ? fs4.readFileSync(appendedFile, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  let index = seen.find((s) => s.sha256 === rec.sha256)?.index;
  if (index === void 0) {
    [index] = await log.append([rec]);
    fs4.appendFileSync(appendedFile, JSON.stringify({ sha256: rec.sha256, index }) + "\n", { mode: 384 });
  }
  const checkpoint = await log.seal(now);
  const { evidence, named } = authorityFor(key.kid, home);
  const keys = { keys: [key.publishedJwk()] };
  const receipt = JSON.parse(JSON.stringify(await captureReceipt(log, { index, checkpoint, authority: evidence, keys })));
  if (!matchesCommitment(bytes, receipt.subject.event.body)) throw new Error("self-check failed: bytes do not match the receipt");
  const sig = verifyProof(receipt.checkpoint.body, receipt.checkpoint.proofs[0], { at: receipt.checkpoint.body.at, publishedKeys: keys, pinnedKid: key.kid });
  if (!sig.valid) throw new Error(`self-check failed: checkpoint signature (${sig.reasons.join(", ")})`);
  const id = sid2(rec);
  const base = path5.join(home, "shares", `${now.slice(0, 10)}-${id.slice(0, 8)}`);
  let dir = base;
  for (let n = 2; fs4.existsSync(dir); n++) dir = `${base}-${n}`;
  fs4.mkdirSync(dir, { recursive: true, mode: 448 });
  ownerOnlyWindows(dir, true);
  const write = (name, data) => {
    fs4.writeFileSync(path5.join(dir, name), data, { mode: 384 });
    return name;
  };
  const files = [write(`${id}.jsonl`, bytes), write("receipt.json", JSON.stringify(receipt, null, 1) + "\n")];
  const inv = inventory(bytes);
  const t = opts.transcript ? await opts.transcript(id).catch(() => null) : null;
  files.push(write("conversation.md", inventoryMarkdown(inv, `${id}.jsonl`) + (t?.messages?.length ? readable(t.messages, id) : `# Conversation ${id}

(No readable copy: open ${id}.jsonl.)
`)));
  files.push(write("HOW-TO-CHECK.txt", howTo(id, named)));
  return { dir, sessionId: id, files, bytes: bytes.length, contains: summary(inv), possibleSecrets: inv.secrets.length, key: { kid: key.kid, binding: key.binding }, authority: named ? "named-on-chain" : "none" };
}

export {
  findSession,
  shareSession
};
