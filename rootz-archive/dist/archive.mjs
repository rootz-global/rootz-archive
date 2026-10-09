#!/usr/bin/env node
import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/archive-cli.ts
import { spawn } from "child_process";
import * as fs6 from "fs";
import * as path7 from "path";

// src/archive.ts
import * as fs2 from "fs";
import * as os2 from "os";
import * as path3 from "path";
import * as zlib from "zlib";

// ../desktop-v6/src/archive/database.ts
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import * as os from "os";

// src/sqlite-shim.ts
import { createRequire } from "module";
var _DatabaseSync;
var DatabaseSync = function(f) {
  _DatabaseSync ??= createRequire(import.meta.url)("node:sqlite").DatabaseSync;
  return new _DatabaseSync(f);
};
function normalise(params) {
  return params.map((p) => p === void 0 ? null : p);
}
var Statement = class {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(s) {
    this.s = s;
  }
  run(...p) {
    const r = this.s.run(...normalise(p));
    return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
  }
  get(...p) {
    return this.s.get(...normalise(p)) ?? void 0;
  }
  all(...p) {
    return this.s.all(...normalise(p));
  }
  iterate(...p) {
    return this.s.iterate(...normalise(p));
  }
};
var Database = class {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db;
  depth = 0;
  name;
  constructor(filename) {
    this.name = filename;
    this.db = new DatabaseSync(filename);
  }
  prepare(sql) {
    return new Statement(this.db.prepare(sql));
  }
  exec(sql) {
    this.db.exec(sql);
    return this;
  }
  /** pragma('journal_mode = WAL') sets; pragma('table_info(x)') returns rows, like better-sqlite3. */
  pragma(source, opts) {
    const rows = this.db.prepare(`PRAGMA ${source}`).all();
    if (opts?.simple) {
      const first = rows[0];
      return first ? Object.values(first)[0] : void 0;
    }
    return rows;
  }
  /** Same semantics as better-sqlite3: commits on return, rolls back on throw, nests with savepoints. */
  transaction(fn) {
    return (...args) => {
      const sp = `sp_${this.depth}`;
      const outer = this.depth === 0;
      this.db.exec(outer ? "BEGIN" : `SAVEPOINT ${sp}`);
      this.depth++;
      try {
        const r = fn(...args);
        this.depth--;
        this.db.exec(outer ? "COMMIT" : `RELEASE ${sp}`);
        return r;
      } catch (e) {
        this.depth--;
        this.db.exec(outer ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    };
  }
  close() {
    this.db.close();
  }
};

// ../desktop-v6/src/archive/database.ts
var ArchiveDatabase = class {
  db = null;
  dbPath;
  initialized = false;
  constructor(dataDir) {
    const baseDir = dataDir || path.join(
      process.env.APPDATA || process.env.HOME || ".",
      ".rootz-desktop"
    );
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.dbPath = path.join(baseDir, "archives.db");
  }
  /**
   * Initialize the database and create tables
   */
  async initialize() {
    if (this.initialized) return;
    try {
      this.db = new Database(this.dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
      console.log("[ArchiveDB] Opened database:", this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS archives (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          content_hash TEXT,
          transcript TEXT,
          transcript_hash TEXT,
          session_id TEXT,
          source TEXT NOT NULL DEFAULT 'local',
          secret_address TEXT,
          note_address TEXT,
          template_type TEXT,
          message_count INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          synced_at INTEGER
        )
      `);
      try {
        this.db.exec("ALTER TABLE archives ADD COLUMN transcript TEXT");
        this.db.exec("ALTER TABLE archives ADD COLUMN transcript_hash TEXT");
        this.db.exec("ALTER TABLE archives ADD COLUMN session_id TEXT");
      } catch {
      }
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS archive_tags (
          archive_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (archive_id, tag),
          FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE
        )
      `);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS archive_decisions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          archive_id TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          author TEXT,
          FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE
        )
      `);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS archive_discussions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          archive_id TEXT NOT NULL,
          topic TEXT NOT NULL,
          summary TEXT,
          resolved INTEGER DEFAULT 0,
          FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE
        )
      `);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS archive_custom_fields (
          archive_id TEXT PRIMARY KEY,
          fields_json TEXT NOT NULL,
          FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE
        )
      `);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS archive_artifacts (
          id TEXT PRIMARY KEY,
          archive_id TEXT NOT NULL,
          artifact_type TEXT NOT NULL,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          byte_length INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          blob_data BLOB,
          origin_bundle TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_artifacts_archive ON archive_artifacts(archive_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_artifacts_hash ON archive_artifacts(content_hash)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS transcript_chunks (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          project_slug TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          total_chunks INTEGER NOT NULL,
          line_start INTEGER NOT NULL,
          line_end INTEGER NOT NULL,
          original_size INTEGER NOT NULL,
          compressed_size INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          note_block_number INTEGER,
          note_tx_hash TEXT,
          ipfs_hash TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          archived_at INTEGER,
          compressed_content TEXT,
          decrypted_content TEXT
        )
      `);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS project_archive_configs (
          project_slug TEXT PRIMARY KEY,
          secret_address TEXT NOT NULL,
          chain_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_archive_time INTEGER,
          total_chunks_archived INTEGER NOT NULL DEFAULT 0,
          total_bytes_archived INTEGER NOT NULL DEFAULT 0
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_archives_created ON archives(created_at DESC)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_archives_source ON archives(source)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_archives_template ON archives(template_type)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_archives_secret ON archives(secret_address)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_tags_tag ON archive_tags(tag)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_session ON transcript_chunks(session_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_project ON transcript_chunks(project_slug)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_status ON transcript_chunks(status)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_created ON transcript_chunks(created_at DESC)");
      try {
        this.db.exec("ALTER TABLE transcript_chunks ADD COLUMN decrypted_content TEXT");
        console.log("[ArchiveDB] Added decrypted_content column");
      } catch {
      }
      try {
        this.db.exec("ALTER TABLE transcript_chunks ADD COLUMN compressed_content TEXT");
        console.log("[ArchiveDB] Added compressed_content column");
      } catch {
      }
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS parsed_messages (
          id TEXT PRIMARY KEY,
          chunk_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          turn_index INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          tools_used TEXT,
          files_referenced TEXT,
          timestamp INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (chunk_id) REFERENCES transcript_chunks(id)
        )
      `);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS session_metadata (
          session_id TEXT PRIMARY KEY,
          project_slug TEXT NOT NULL,
          summary TEXT,
          total_turns INTEGER NOT NULL DEFAULT 0,
          total_tokens_estimate INTEGER,
          files_read TEXT,
          files_written TEXT,
          tools_used TEXT,
          topics TEXT,
          code_languages TEXT,
          has_errors INTEGER DEFAULT 0,
          first_message_at INTEGER,
          last_message_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          git_commit_hash TEXT,
          git_branch TEXT,
          git_dirty INTEGER DEFAULT 0
        )
      `);
      this.addColumnIfNotExists("session_metadata", "git_commit_hash", "TEXT");
      this.addColumnIfNotExists("session_metadata", "git_branch", "TEXT");
      this.addColumnIfNotExists("session_metadata", "git_dirty", "INTEGER DEFAULT 0");
      this.addColumnIfNotExists("session_metadata", "sub_directory", "TEXT");
      this.addColumnIfNotExists("transcript_chunks", "sub_directory", "TEXT");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_messages_session ON parsed_messages(session_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_messages_chunk ON parsed_messages(chunk_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_messages_role ON parsed_messages(role)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_metadata_project ON session_metadata(project_slug)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_metadata_updated ON session_metadata(updated_at DESC)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS embeddings (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          content_preview TEXT,
          embedding BLOB NOT NULL,
          model_version TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(source_type, source_id, model_version)
        )
      `);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS semantic_tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          confidence REAL NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(source_type, source_id, tag)
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_type, source_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_embeddings_type ON embeddings(source_type)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_semantic_tags_source ON semantic_tags(source_type, source_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_semantic_tags_tag ON semantic_tags(tag)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_facts (
          id TEXT PRIMARY KEY,
          source_session_id TEXT NOT NULL,
          fact_type TEXT NOT NULL,
          subject TEXT NOT NULL,
          predicate TEXT NOT NULL,
          object TEXT NOT NULL,
          confidence REAL DEFAULT 0.8,
          extracted_at INTEGER NOT NULL,
          verified INTEGER DEFAULT 0,
          context_preview TEXT,
          FOREIGN KEY (source_session_id) REFERENCES session_metadata(session_id)
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_facts_subject ON knowledge_facts(subject)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_facts_type ON knowledge_facts(fact_type)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_facts_session ON knowledge_facts(source_session_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_facts_object ON knowledge_facts(object)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS conversation_archive_state (
          conversation_id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          project_slug TEXT,
          last_archived_message_index INTEGER NOT NULL DEFAULT 0,
          total_messages_at_last_archive INTEGER NOT NULL DEFAULT 0,
          last_archived_at INTEGER,
          archive_ids TEXT NOT NULL DEFAULT '[]',
          latest_archive_id TEXT,
          conversation_title TEXT,
          first_message_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_conv_state_platform ON conversation_archive_state(platform)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_conv_state_project ON conversation_archive_state(project_slug)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_conv_state_updated ON conversation_archive_state(updated_at DESC)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS session_relationships (
          id TEXT PRIMARY KEY,
          source_session_id TEXT NOT NULL,
          target_session_id TEXT NOT NULL,
          relationship_type TEXT NOT NULL,
          strength REAL NOT NULL DEFAULT 0.5,
          reason TEXT,
          created_at INTEGER NOT NULL,
          verified INTEGER DEFAULT 0,
          FOREIGN KEY (source_session_id) REFERENCES session_metadata(session_id),
          FOREIGN KEY (target_session_id) REFERENCES session_metadata(session_id),
          UNIQUE(source_session_id, target_session_id, relationship_type)
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_rel_source ON session_relationships(source_session_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_rel_target ON session_relationships(target_session_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_rel_type ON session_relationships(relationship_type)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS topic_clusters (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          keywords TEXT NOT NULL DEFAULT '[]',
          session_ids TEXT NOT NULL DEFAULT '[]',
          centroid_embedding BLOB,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_cluster_name ON topic_clusters(name)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_cluster_updated ON topic_clusters(updated_at DESC)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS context_effectiveness (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          context_type TEXT NOT NULL,
          context_id TEXT NOT NULL,
          loaded_at INTEGER NOT NULL,
          was_useful INTEGER,
          feedback_at INTEGER,
          usage_count INTEGER DEFAULT 0,
          FOREIGN KEY (session_id) REFERENCES session_metadata(session_id)
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_ctx_session ON context_effectiveness(session_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_ctx_type ON context_effectiveness(context_type)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_ctx_useful ON context_effectiveness(was_useful)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS summary_hierarchy (
          id TEXT PRIMARY KEY,
          level TEXT NOT NULL,
          project_slug TEXT NOT NULL,
          period_start INTEGER NOT NULL,
          period_end INTEGER NOT NULL,
          summary TEXT NOT NULL,
          key_topics TEXT NOT NULL DEFAULT '[]',
          key_decisions TEXT NOT NULL DEFAULT '[]',
          session_ids TEXT NOT NULL DEFAULT '[]',
          parent_summary_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (parent_summary_id) REFERENCES summary_hierarchy(id)
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_summary_level ON summary_hierarchy(level)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_summary_project ON summary_hierarchy(project_slug)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_summary_period ON summary_hierarchy(period_start, period_end)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ai_chat_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          sender TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          archived_at INTEGER,
          secret_address TEXT
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_chat_session ON ai_chat_messages(session_id, created_at)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_chat_sender ON ai_chat_messages(sender)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ai_chat_cursors (
          session_id TEXT NOT NULL,
          reader TEXT NOT NULL,
          last_seen_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (session_id, reader)
        )
      `);
      this.addColumnIfNotExists("archives", "digest", "TEXT");
      this.addColumnIfNotExists("archives", "digest_model", "TEXT");
      this.addColumnIfNotExists("archives", "digest_version", "TEXT");
      this.addColumnIfNotExists("archives", "observations", "TEXT");
      this.addColumnIfNotExists("archives", "observation_count", "INTEGER DEFAULT 0");
      this.addColumnIfNotExists("archives", "auto_captured", "INTEGER DEFAULT 0");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS session_observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          archive_id TEXT,
          timestamp INTEGER NOT NULL,
          type TEXT NOT NULL,
          tool TEXT,
          target TEXT,
          summary TEXT,
          metadata TEXT,
          FOREIGN KEY (session_id) REFERENCES session_metadata(session_id),
          FOREIGN KEY (archive_id) REFERENCES archives(id)
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_obs_session ON session_observations(session_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_obs_archive ON session_observations(archive_id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_obs_type ON session_observations(type)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_obs_timestamp ON session_observations(timestamp DESC)");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS local_indexed_files (
          file_path TEXT PRIMARY KEY,
          project_slug TEXT NOT NULL,
          session_id TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          mtime INTEGER NOT NULL,
          messages_indexed INTEGER NOT NULL DEFAULT 0,
          indexed_at INTEGER NOT NULL
        )
      `);
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_lif_project ON local_indexed_files(project_slug)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_lif_session ON local_indexed_files(session_id)");
      this.initialized = true;
      console.log("[ArchiveDB] Initialized (better-sqlite3):", this.dbPath);
    } catch (error) {
      console.error("[ArchiveDB] Initialization failed:", error);
      throw error;
    }
  }
  /**
   * Add column to table if it doesn't exist (for migrations)
   */
  addColumnIfNotExists(table, column, type) {
    if (!this.db) return;
    try {
      const result = this.db.pragma(`table_info(${table})`);
      const columns = result.map((row) => row.name);
      if (!columns.includes(column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        console.log(`[ArchiveDB] Added column ${column} to ${table}`);
      }
    } catch (error) {
      console.warn(`[ArchiveDB] Could not add column ${column} to ${table}:`, error);
    }
  }
  /**
   * Generate a unique ID for local archives
   */
  generateId() {
    return `local-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }
  /**
   * Create a new local archive
   *
   * THINKING AS ASSET: Accepts optional transcript (full conversation) and sessionId
   * for complete thinking capture and future replay.
   */
  async createArchive(params) {
    if (!this.db) throw new Error("Database not initialized");
    const id = this.generateId();
    const now = Date.now();
    const contentHash = await this.hashContent(params.content);
    const transcriptHash = params.transcript ? await this.hashContent(params.transcript) : null;
    const obsCount = params.observations ? params.observations.filter((o) => o.type === "observation" || o.type === "decision").length : 0;
    const createTxn = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO archives (
          id, title, content, content_hash, transcript, transcript_hash,
          session_id, source, template_type, message_count,
          observations, observation_count, auto_captured,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.title,
        params.content,
        contentHash,
        params.transcript || null,
        transcriptHash,
        params.sessionId || null,
        params.templateType || null,
        params.messageCount || null,
        params.observations ? JSON.stringify(params.observations) : null,
        obsCount,
        params.autoCapture ? 1 : 0,
        now,
        now
      );
      if (params.tags && params.tags.length > 0) {
        const insertTag = this.db.prepare("INSERT INTO archive_tags (archive_id, tag) VALUES (?, ?)");
        for (const tag of params.tags) {
          insertTag.run(id, tag.toLowerCase().trim());
        }
      }
      if (params.decisions && params.decisions.length > 0) {
        const insertDecision = this.db.prepare(
          "INSERT INTO archive_decisions (archive_id, text, timestamp, author) VALUES (?, ?, ?, ?)"
        );
        for (const decision of params.decisions) {
          insertDecision.run(id, decision.text, decision.timestamp, decision.author || null);
        }
      }
      if (params.customFields && Object.keys(params.customFields).length > 0) {
        this.db.prepare(
          "INSERT INTO archive_custom_fields (archive_id, fields_json) VALUES (?, ?)"
        ).run(id, JSON.stringify(params.customFields));
      }
      if (params.observations && params.observations.length > 0) {
        const insertObs = this.db.prepare(`
          INSERT INTO session_observations (session_id, archive_id, timestamp, type, tool, target, summary, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const obs of params.observations) {
          if (obs.type === "observation" || obs.type === "decision" || obs.type === "error") {
            insertObs.run(
              params.sessionId || null,
              id,
              obs.ts,
              obs.type,
              obs.tool || null,
              obs.target || null,
              obs.summary || obs.text || null,
              obs.metadata ? JSON.stringify(obs.metadata) : null
            );
          }
        }
      }
    });
    createTxn();
    console.log("[ArchiveDB] Created archive:", id, obsCount > 0 ? `(${obsCount} observations)` : "");
    return this.getArchive(id);
  }
  /**
   * Get an archive by ID
   */
  async getArchive(id) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare("SELECT * FROM archives WHERE id = ?").get(id);
    if (!row) return null;
    return this.hydrateArchive(row);
  }
  /**
   * Get an archive by blockchain address
   */
  async getArchiveByAddress(secretAddress) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare("SELECT * FROM archives WHERE secret_address = ?").get(secretAddress);
    if (!row) return null;
    return this.hydrateArchive(row);
  }
  // ============================================================
  // OFFICE INTEGRATION: Artifact Management
  // ============================================================
  /**
   * Create an artifact associated with an archive
   *
   * Used by Office add-ins to store document binaries (DOCX, PDF, etc.)
   */
  async createArtifact(params) {
    if (!this.db) throw new Error("Database not initialized");
    const id = this.generateId();
    const now = Date.now();
    const blobBuffer = params.blobData ? Buffer.from(params.blobData) : null;
    this.db.prepare(`
      INSERT INTO archive_artifacts (id, archive_id, artifact_type, filename, mime_type, byte_length, content_hash, blob_data, origin_bundle, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.archiveId,
      params.artifactType,
      params.filename,
      params.mimeType,
      params.byteLength,
      params.contentHash,
      blobBuffer,
      params.originBundle || null,
      now
    );
    console.log(`[ArchiveDB] Created artifact ${id} for archive ${params.archiveId}`);
    return {
      id,
      archiveId: params.archiveId,
      artifactType: params.artifactType,
      filename: params.filename,
      mimeType: params.mimeType,
      byteLength: params.byteLength,
      contentHash: params.contentHash,
      blobData: params.blobData,
      originBundle: params.originBundle,
      createdAt: now
    };
  }
  /**
   * Get artifacts for an archive
   */
  async getArtifacts(archiveId) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT * FROM archive_artifacts WHERE archive_id = ? ORDER BY created_at ASC"
    ).all(archiveId);
    return rows.map((row) => ({
      id: row.id,
      archiveId: row.archive_id,
      artifactType: row.artifact_type,
      filename: row.filename,
      mimeType: row.mime_type,
      byteLength: row.byte_length,
      contentHash: row.content_hash,
      blobData: row.blob_data ? new Uint8Array(row.blob_data) : void 0,
      originBundle: row.origin_bundle,
      createdAt: row.created_at
    }));
  }
  /**
   * Get artifact by ID
   */
  async getArtifact(id) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare("SELECT * FROM archive_artifacts WHERE id = ?").get(id);
    if (!row) return null;
    return {
      id: row.id,
      archiveId: row.archive_id,
      artifactType: row.artifact_type,
      filename: row.filename,
      mimeType: row.mime_type,
      byteLength: row.byte_length,
      contentHash: row.content_hash,
      blobData: row.blob_data ? new Uint8Array(row.blob_data) : void 0,
      originBundle: row.origin_bundle,
      createdAt: row.created_at
    };
  }
  /**
   * Delete artifact by ID
   */
  async deleteArtifact(id) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare("DELETE FROM archive_artifacts WHERE id = ?").run(id);
    return true;
  }
  /**
   * List recent archives
   */
  async listRecent(limit = 20, offset = 0) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT * FROM archives ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).all(limit, offset);
    const archives = [];
    for (const row of rows) {
      archives.push(await this.hydrateArchive(row));
    }
    return archives;
  }
  /**
   * Search archives using LIKE
   *
   * Note: better-sqlite3 supports FTS5 — future enhancement
   */
  async search(query, limit = 20) {
    if (!this.db) throw new Error("Database not initialized");
    const searchPattern = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT * FROM archives
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(searchPattern, searchPattern, limit);
    const results = [];
    for (const row of rows) {
      const archive = await this.hydrateArchive(row);
      const titleMatches = (archive.title.toLowerCase().match(new RegExp(query.toLowerCase(), "g")) || []).length;
      const contentMatches = (archive.content.toLowerCase().match(new RegExp(query.toLowerCase(), "g")) || []).length;
      const score = titleMatches * 10 + contentMatches;
      const contentLower = archive.content.toLowerCase();
      const queryLower = query.toLowerCase();
      const matchIndex = contentLower.indexOf(queryLower);
      let snippet;
      if (matchIndex >= 0) {
        const start = Math.max(0, matchIndex - 40);
        const end = Math.min(archive.content.length, matchIndex + query.length + 40);
        snippet = (start > 0 ? "..." : "") + archive.content.substring(start, end) + (end < archive.content.length ? "..." : "");
      }
      results.push({ archive, score, snippet });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }
  /**
   * Advanced search with query syntax and filters
   *
   * Query syntax:
   * - Simple words: matches if any word appears (OR)
   * - "exact phrase": matches exact phrase in quotes
   * - word1 AND word2: both must appear
   * - word1 OR word2: either must appear
   * - NOT word: excludes archives containing word
   * - title:word: searches only in title
   * - content:word: searches only in content
   * - tag:word: searches only in tags
   */
  async advancedSearch(options) {
    if (!this.db) throw new Error("Database not initialized");
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const conditions = [];
    const params = [];
    if (options.dateFrom) {
      conditions.push("created_at >= ?");
      params.push(options.dateFrom);
    }
    if (options.dateTo) {
      conditions.push("created_at <= ?");
      params.push(options.dateTo);
    }
    if (options.source) {
      conditions.push("source = ?");
      params.push(options.source);
    }
    if (options.templateType) {
      conditions.push("template_type = ?");
      params.push(options.templateType);
    }
    if (options.hasTranscript !== void 0) {
      if (options.hasTranscript) {
        conditions.push('transcript IS NOT NULL AND transcript != ""');
      } else {
        conditions.push('(transcript IS NULL OR transcript = "")');
      }
    }
    if (options.tags && options.tags.length > 0) {
      const tagPlaceholders = options.tags.map(() => "?").join(", ");
      conditions.push(`id IN (
        SELECT archive_id FROM archive_tags
        WHERE tag IN (${tagPlaceholders})
        GROUP BY archive_id
        HAVING COUNT(DISTINCT tag) = ?
      )`);
      params.push(...options.tags.map((t) => t.toLowerCase().trim()));
      params.push(options.tags.length);
    }
    const parsedQuery = this.parseSearchQuery(options.query || "");
    for (const condition of parsedQuery.conditions) {
      if (condition.type === "exact") {
        const pattern = `%${condition.value}%`;
        if (condition.field === "title") {
          conditions.push("title LIKE ?");
          params.push(pattern);
        } else if (condition.field === "content") {
          conditions.push("content LIKE ?");
          params.push(pattern);
        } else if (condition.field === "transcript" && options.includeTranscript) {
          conditions.push("transcript LIKE ?");
          params.push(pattern);
        } else {
          const fieldConditions = ["title LIKE ?", "content LIKE ?"];
          params.push(pattern, pattern);
          if (options.includeTranscript) {
            fieldConditions.push("transcript LIKE ?");
            params.push(pattern);
          }
          conditions.push(`(${fieldConditions.join(" OR ")})`);
        }
      } else if (condition.type === "not") {
        const pattern = `%${condition.value}%`;
        conditions.push("title NOT LIKE ? AND content NOT LIKE ?");
        params.push(pattern, pattern);
        if (options.includeTranscript) {
          conditions.push("(transcript IS NULL OR transcript NOT LIKE ?)");
          params.push(pattern);
        }
      } else if (condition.type === "tag") {
        conditions.push(`id IN (SELECT archive_id FROM archive_tags WHERE tag LIKE ?)`);
        params.push(`%${condition.value.toLowerCase()}%`);
      } else if (condition.type === "field") {
        const pattern = `%${condition.value}%`;
        if (condition.field === "title") {
          conditions.push("title LIKE ?");
          params.push(pattern);
        } else if (condition.field === "content") {
          conditions.push("content LIKE ?");
          params.push(pattern);
        } else if (condition.field === "transcript" && options.includeTranscript) {
          conditions.push("transcript LIKE ?");
          params.push(pattern);
        }
      } else if (condition.type === "term") {
        const pattern = `%${condition.value}%`;
        const fieldConditions = ["title LIKE ?", "content LIKE ?"];
        params.push(pattern, pattern);
        if (options.includeTranscript) {
          fieldConditions.push("transcript LIKE ?");
          params.push(pattern);
        }
        conditions.push(`(${fieldConditions.join(" OR ")})`);
      }
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT * FROM archives
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);
    const rows = this.db.prepare(sql).all(...params);
    const results = [];
    for (const row of rows) {
      const archive = await this.hydrateArchive(row);
      const { score, matchedIn, snippet } = this.calculateRelevance(
        archive,
        parsedQuery.terms,
        options.includeTranscript || false
      );
      results.push({ archive, score, snippet, matchedIn });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }
  /**
   * Parse search query into conditions
   */
  parseSearchQuery(query) {
    const conditions = [];
    const terms = [];
    if (!query.trim()) {
      return { terms, conditions };
    }
    const quotedPhrases = [];
    let processedQuery = query.replace(/"([^"]+)"/g, (_, phrase) => {
      quotedPhrases.push(phrase);
      return `__PHRASE_${quotedPhrases.length - 1}__`;
    });
    const tokens = processedQuery.split(/\s+/).filter((t) => t.length > 0);
    let i = 0;
    while (i < tokens.length) {
      let token = tokens[i];
      const phraseMatch = token.match(/__PHRASE_(\d+)__/);
      if (phraseMatch) {
        const phrase = quotedPhrases[parseInt(phraseMatch[1])];
        conditions.push({ type: "exact", value: phrase });
        terms.push(phrase);
        i++;
        continue;
      }
      if (token.toUpperCase() === "NOT" && i + 1 < tokens.length) {
        i++;
        const nextToken = tokens[i];
        const nextPhraseMatch = nextToken.match(/__PHRASE_(\d+)__/);
        const value = nextPhraseMatch ? quotedPhrases[parseInt(nextPhraseMatch[1])] : nextToken;
        conditions.push({ type: "not", value });
        i++;
        continue;
      }
      if (token.toUpperCase() === "AND") {
        i++;
        continue;
      }
      if (token.toUpperCase() === "OR") {
        i++;
        continue;
      }
      const fieldMatch = token.match(/^(title|content|transcript|tag):(.+)$/i);
      if (fieldMatch) {
        const field = fieldMatch[1].toLowerCase();
        let value = fieldMatch[2];
        const valuePhraseMatch = value.match(/__PHRASE_(\d+)__/);
        if (valuePhraseMatch) {
          value = quotedPhrases[parseInt(valuePhraseMatch[1])];
        }
        if (field === "tag") {
          conditions.push({ type: "tag", value });
        } else {
          conditions.push({ type: "field", field, value });
        }
        terms.push(value);
        i++;
        continue;
      }
      conditions.push({ type: "term", value: token });
      terms.push(token);
      i++;
    }
    return { terms, conditions };
  }
  /**
   * Calculate relevance score and find match locations
   */
  calculateRelevance(archive, searchTerms, includeTranscript) {
    let score = 0;
    const matchedIn = /* @__PURE__ */ new Set();
    let snippet;
    if (searchTerms.length === 0) {
      return { score: 1, matchedIn: [], snippet: void 0 };
    }
    const titleLower = (archive.title || "").toLowerCase();
    const contentLower = (archive.content || "").toLowerCase();
    const transcriptLower = (archive.transcript || "").toLowerCase();
    const tagsLower = (archive.tags || []).map((t) => t.toLowerCase());
    for (const term of searchTerms) {
      const termLower = term.toLowerCase();
      const titleMatches = (titleLower.match(new RegExp(this.escapeRegex(termLower), "g")) || []).length;
      if (titleMatches > 0) {
        score += titleMatches * 20;
        matchedIn.add("title");
      }
      const tagMatches = tagsLower.filter((t) => t.includes(termLower)).length;
      if (tagMatches > 0) {
        score += tagMatches * 15;
        matchedIn.add("tags");
      }
      const contentMatches = (contentLower.match(new RegExp(this.escapeRegex(termLower), "g")) || []).length;
      if (contentMatches > 0) {
        score += contentMatches * 5;
        matchedIn.add("content");
        if (!snippet) {
          const matchIndex = contentLower.indexOf(termLower);
          if (matchIndex >= 0) {
            const start = Math.max(0, matchIndex - 50);
            const end = Math.min(archive.content.length, matchIndex + term.length + 50);
            snippet = (start > 0 ? "..." : "") + archive.content.substring(start, end) + (end < archive.content.length ? "..." : "");
          }
        }
      }
      if (includeTranscript && transcriptLower) {
        const transcriptMatches = (transcriptLower.match(new RegExp(this.escapeRegex(termLower), "g")) || []).length;
        if (transcriptMatches > 0) {
          score += Math.min(transcriptMatches, 10) * 2;
          matchedIn.add("transcript");
          if (!snippet) {
            const matchIndex = transcriptLower.indexOf(termLower);
            if (matchIndex >= 0) {
              const start = Math.max(0, matchIndex - 50);
              const end = Math.min(archive.transcript.length, matchIndex + term.length + 50);
              snippet = "[Transcript] " + (start > 0 ? "..." : "") + archive.transcript.substring(start, end) + (end < archive.transcript.length ? "..." : "");
            }
          }
        }
      }
    }
    return {
      score,
      matchedIn: Array.from(matchedIn),
      snippet
    };
  }
  /**
   * Escape special regex characters
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  /**
   * Filter archives by tag
   */
  async filterByTag(tag, limit = 50) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT a.* FROM archives a
      JOIN archive_tags t ON a.id = t.archive_id
      WHERE t.tag = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(tag.toLowerCase().trim(), limit);
    const archives = [];
    for (const row of rows) {
      archives.push(await this.hydrateArchive(row));
    }
    return archives;
  }
  /**
   * Filter archives by template type
   */
  async filterByTemplate(templateType, limit = 50) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT * FROM archives WHERE template_type = ? ORDER BY created_at DESC LIMIT ?"
    ).all(templateType, limit);
    const archives = [];
    for (const row of rows) {
      archives.push(await this.hydrateArchive(row));
    }
    return archives;
  }
  /**
   * Get all unique tags
   */
  async getAllTags() {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT tag, COUNT(*) as count FROM archive_tags GROUP BY tag ORDER BY count DESC"
    ).all();
    return rows.map((row) => ({
      tag: row.tag,
      count: row.count
    }));
  }
  /**
   * Update archive metadata
   */
  async updateMetadata(id, updates) {
    if (!this.db) throw new Error("Database not initialized");
    const archive = await this.getArchive(id);
    if (!archive) return null;
    const now = Date.now();
    if (updates.title || updates.templateType !== void 0) {
      this.db.prepare(`
        UPDATE archives SET
          title = COALESCE(?, title),
          template_type = COALESCE(?, template_type),
          updated_at = ?
        WHERE id = ?
      `).run(updates.title || null, updates.templateType || null, now, id);
    }
    if (updates.tags) {
      this.db.prepare("DELETE FROM archive_tags WHERE archive_id = ?").run(id);
      const insertTag = this.db.prepare("INSERT INTO archive_tags (archive_id, tag) VALUES (?, ?)");
      for (const tag of updates.tags) {
        insertTag.run(id, tag.toLowerCase().trim());
      }
    }
    if (updates.decisions) {
      this.db.prepare("DELETE FROM archive_decisions WHERE archive_id = ?").run(id);
      const insertDecision = this.db.prepare(
        "INSERT INTO archive_decisions (archive_id, text, timestamp, author) VALUES (?, ?, ?, ?)"
      );
      for (const decision of updates.decisions) {
        insertDecision.run(id, decision.text, decision.timestamp, decision.author || null);
      }
    }
    if (updates.customFields) {
      this.db.prepare("DELETE FROM archive_custom_fields WHERE archive_id = ?").run(id);
      if (Object.keys(updates.customFields).length > 0) {
        this.db.prepare(
          "INSERT INTO archive_custom_fields (archive_id, fields_json) VALUES (?, ?)"
        ).run(id, JSON.stringify(updates.customFields));
      }
    }
    return this.getArchive(id);
  }
  /**
   * Upsert a blockchain archive (insert or update)
   *
   * Used by ChainSyncer to cache chain archives locally.
   * Uses secretAddress as the unique key for chain archives.
   */
  async upsertChainArchive(params) {
    if (!this.db) throw new Error("Database not initialized");
    const now = Date.now();
    const existing = await this.getArchiveByAddress(params.secretAddress);
    if (existing) {
      this.db.prepare(`
        UPDATE archives SET
          title = ?,
          content = ?,
          content_hash = ?,
          note_address = COALESCE(?, note_address),
          template_type = COALESCE(?, template_type),
          updated_at = ?,
          synced_at = ?
        WHERE secret_address = ?
      `).run(
        params.title,
        params.content,
        params.contentHash || null,
        params.noteAddress || null,
        params.templateType || null,
        now,
        now,
        params.secretAddress
      );
      if (params.tags) {
        this.db.prepare("DELETE FROM archive_tags WHERE archive_id = ?").run(existing.id);
        const insertTag = this.db.prepare("INSERT INTO archive_tags (archive_id, tag) VALUES (?, ?)");
        for (const tag of params.tags) {
          insertTag.run(existing.id, tag.toLowerCase().trim());
        }
      }
      if (params.decisions) {
        this.db.prepare("DELETE FROM archive_decisions WHERE archive_id = ?").run(existing.id);
        const insertDecision = this.db.prepare(
          "INSERT INTO archive_decisions (archive_id, text, timestamp, author) VALUES (?, ?, ?, ?)"
        );
        for (const decision of params.decisions) {
          insertDecision.run(existing.id, decision.text, decision.timestamp, decision.author || null);
        }
      }
      console.log("[ArchiveDB] Updated chain archive:", params.secretAddress);
      return this.getArchive(existing.id);
    }
    const id = params.secretAddress;
    const contentHash = params.contentHash || await this.hashContent(params.content);
    this.db.prepare(`
      INSERT INTO archives (id, title, content, content_hash, source, secret_address, note_address, template_type, created_at, updated_at, synced_at)
      VALUES (?, ?, ?, ?, 'chain', ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.title,
      params.content,
      contentHash,
      params.secretAddress,
      params.noteAddress || null,
      params.templateType || null,
      params.createdAt,
      now,
      now
    );
    if (params.tags && params.tags.length > 0) {
      const insertTag = this.db.prepare("INSERT INTO archive_tags (archive_id, tag) VALUES (?, ?)");
      for (const tag of params.tags) {
        insertTag.run(id, tag.toLowerCase().trim());
      }
    }
    if (params.decisions && params.decisions.length > 0) {
      const insertDecision = this.db.prepare(
        "INSERT INTO archive_decisions (archive_id, text, timestamp, author) VALUES (?, ?, ?, ?)"
      );
      for (const decision of params.decisions) {
        insertDecision.run(id, decision.text, decision.timestamp, decision.author || null);
      }
    }
    if (params.customFields && Object.keys(params.customFields).length > 0) {
      this.db.prepare(
        "INSERT INTO archive_custom_fields (archive_id, fields_json) VALUES (?, ?)"
      ).run(id, JSON.stringify(params.customFields));
    }
    console.log("[ArchiveDB] Created chain archive:", id);
    return this.getArchive(id);
  }
  /**
   * Get all chain archives that need refresh (older than maxAge)
   */
  async getStaleChainArchives(maxAgeMs) {
    if (!this.db) throw new Error("Database not initialized");
    const cutoffTime = Date.now() - maxAgeMs;
    const rows = this.db.prepare(`
      SELECT * FROM archives
      WHERE source = 'chain'
      AND (synced_at IS NULL OR synced_at < ?)
      ORDER BY synced_at ASC
      LIMIT 100
    `).all(cutoffTime);
    const archives = [];
    for (const row of rows) {
      archives.push(await this.hydrateArchive(row));
    }
    return archives;
  }
  /**
   * Get all known chain secret addresses
   */
  async getChainSecretAddresses() {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT secret_address FROM archives
      WHERE source = 'chain' AND secret_address IS NOT NULL
    `).all();
    return rows.map((r) => r.secret_address);
  }
  /**
   * Delete an archive
   */
  async deleteArchive(id) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare("DELETE FROM archive_tags WHERE archive_id = ?").run(id);
    this.db.prepare("DELETE FROM archive_decisions WHERE archive_id = ?").run(id);
    this.db.prepare("DELETE FROM archive_discussions WHERE archive_id = ?").run(id);
    this.db.prepare("DELETE FROM archive_custom_fields WHERE archive_id = ?").run(id);
    this.db.prepare("DELETE FROM archives WHERE id = ?").run(id);
    return true;
  }
  /**
   * Get archive statistics
   */
  async getStats() {
    if (!this.db) throw new Error("Database not initialized");
    const total = this.db.prepare("SELECT COUNT(*) as count FROM archives").get();
    const local = this.db.prepare("SELECT COUNT(*) as count FROM archives WHERE source = 'local'").get();
    const chain = this.db.prepare("SELECT COUNT(*) as count FROM archives WHERE source = 'chain'").get();
    const tags = this.db.prepare("SELECT COUNT(DISTINCT tag) as count FROM archive_tags").get();
    const decisions = this.db.prepare("SELECT COUNT(*) as count FROM archive_decisions").get();
    return {
      totalArchives: total?.count ?? 0,
      localArchives: local?.count ?? 0,
      chainArchives: chain?.count ?? 0,
      totalTags: tags?.count ?? 0,
      totalDecisions: decisions?.count ?? 0
    };
  }
  // ============================================
  // TRANSCRIPT ARCHIVER: Chunk Management
  // ============================================
  /**
   * Create a new transcript chunk record
   */
  async createChunk(chunk) {
    if (!this.db) throw new Error("Database not initialized");
    const id = `chunk-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    this.db.prepare(`
      INSERT INTO transcript_chunks (
        id, session_id, project_slug, sub_directory, chunk_index, total_chunks,
        line_start, line_end, original_size, compressed_size,
        content_hash, note_block_number, note_tx_hash, ipfs_hash,
        status, created_at, archived_at, compressed_content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      chunk.sessionId,
      chunk.projectSlug,
      chunk.subDirectory || null,
      chunk.chunkIndex,
      chunk.totalChunks,
      chunk.lineRange[0],
      chunk.lineRange[1],
      chunk.originalSize,
      chunk.compressedSize,
      chunk.contentHash,
      chunk.noteBlockNumber || null,
      chunk.noteTxHash || null,
      chunk.ipfsHash || null,
      chunk.status,
      chunk.createdAt,
      chunk.archivedAt || null,
      chunk.compressedContent || null
    );
    console.log("[ArchiveDB] Created chunk:", id, "for session:", chunk.sessionId);
    return { id, ...chunk };
  }
  /**
   * Update chunk status after archiving to chain
   */
  async updateChunkArchived(chunkId, noteBlockNumber, noteTxHash, ipfsHash) {
    if (!this.db) throw new Error("Database not initialized");
    const now = Date.now();
    this.db.prepare(`
      UPDATE transcript_chunks SET
        note_block_number = ?,
        note_tx_hash = ?,
        ipfs_hash = ?,
        status = 'confirmed',
        archived_at = ?
      WHERE id = ?
    `).run(noteBlockNumber, noteTxHash, ipfsHash || null, now, chunkId);
    console.log("[ArchiveDB] Chunk archived:", chunkId, "at block:", noteBlockNumber);
  }
  /**
   * Store decrypted content locally for a chunk
   * Content is stored in plaintext for easy local access
   */
  async updateChunkDecryptedContent(chunkId, decryptedContent) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare(`
      UPDATE transcript_chunks SET decrypted_content = ? WHERE id = ?
    `).run(decryptedContent, chunkId);
    console.log("[ArchiveDB] Stored decrypted content for chunk:", chunkId, "length:", decryptedContent.length);
  }
  /**
   * Update chunk subdirectory (called after session metadata is extracted)
   */
  async updateChunkSubDirectory(chunkId, subDirectory) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare(`
      UPDATE transcript_chunks SET sub_directory = ? WHERE id = ?
    `).run(subDirectory, chunkId);
    console.log("[ArchiveDB] Updated chunk subdirectory:", chunkId, "subDirectory:", subDirectory);
  }
  /**
   * Get all chunks for a session
   */
  async getSessionChunks(sessionId) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT * FROM transcript_chunks WHERE session_id = ? ORDER BY chunk_index ASC"
    ).all(sessionId);
    return rows.map((row) => this.rowToChunk(row));
  }
  /**
   * Get pending chunks that need to be archived
   */
  async getPendingChunks(projectSlug) {
    if (!this.db) throw new Error("Database not initialized");
    let sql = "SELECT * FROM transcript_chunks WHERE status = 'pending'";
    const params = [];
    if (projectSlug) {
      sql += " AND project_slug = ?";
      params.push(projectSlug);
    }
    sql += " ORDER BY created_at ASC LIMIT 100";
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((row) => this.rowToChunk(row));
  }
  /**
   * Get the last archived line number for a session
   */
  async getLastArchivedLine(sessionId) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare(`
      SELECT MAX(line_end) as last_line FROM transcript_chunks
      WHERE session_id = ? AND status IN ('pending', 'uploaded', 'confirmed')
    `).get(sessionId);
    return row?.last_line ?? 0;
  }
  /**
   * Get chunk statistics for a session
   */
  async getSessionChunkStats(sessionId) {
    if (!this.db) throw new Error("Database not initialized");
    const chunks = await this.getSessionChunks(sessionId);
    const confirmed = chunks.filter((c) => c.status === "confirmed");
    const pending = chunks.filter((c) => c.status === "pending");
    return {
      totalChunks: chunks.length,
      confirmedChunks: confirmed.length,
      pendingChunks: pending.length,
      totalBytes: chunks.reduce((sum, c) => sum + c.compressedSize, 0),
      lastLine: Math.max(...chunks.map((c) => c.lineRange[1]), 0)
    };
  }
  /**
   * Get decompressed content for a chunk by ID
   * Returns the original JSONL content, decompressed from stored gzip data
   */
  async getChunkContent(chunkId) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare(
      "SELECT compressed_content, decrypted_content FROM transcript_chunks WHERE id = ?"
    ).get(chunkId);
    if (!row) {
      return null;
    }
    const compressedContent = row.compressed_content;
    const decryptedContent = row.decrypted_content;
    if (decryptedContent) {
      return decryptedContent;
    }
    if (compressedContent) {
      try {
        const zlib3 = __require("zlib");
        const { promisify } = __require("util");
        const gunzip = promisify(zlib3.gunzip);
        const compressed = Buffer.from(compressedContent, "base64");
        const decompressed = await gunzip(compressed);
        return decompressed.toString("utf8");
      } catch (err) {
        console.error("[ArchiveDB] Failed to decompress chunk content:", chunkId, err);
        return null;
      }
    }
    return null;
  }
  /**
   * Confirm a chunk has been written to blockchain
   * Updates status and stores transaction details
   */
  async confirmChunkOnChain(chunkId, txInfo) {
    if (!this.db) throw new Error("Database not initialized");
    const now = Date.now();
    this.db.prepare(`
      UPDATE transcript_chunks SET
        note_block_number = ?,
        note_tx_hash = ?,
        status = 'confirmed',
        archived_at = ?
      WHERE id = ?
    `).run(txInfo.blockNumber || null, txInfo.txHash || null, now, chunkId);
    console.log("[ArchiveDB] Chunk confirmed on chain:", chunkId, "tx:", txInfo.txHash);
  }
  /**
   * Get chunks that are missing compressed content
   */
  async getChunksWithoutContent() {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT * FROM transcript_chunks WHERE compressed_content IS NULL ORDER BY created_at ASC"
    ).all();
    return rows.map((row) => this.rowToChunk(row));
  }
  /**
   * Update compressed content for a chunk
   * Used when re-archiving to populate missing content
   */
  async updateChunkCompressedContent(chunkId, compressedContent, compressedSize) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare(`
      UPDATE transcript_chunks SET
        compressed_content = ?,
        compressed_size = ?
      WHERE id = ?
    `).run(compressedContent, compressedSize, chunkId);
    console.log("[ArchiveDB] Updated compressed content for chunk:", chunkId, "size:", compressedSize);
  }
  /**
   * Convert database row to TranscriptChunk
   */
  rowToChunk(row) {
    return {
      id: row.id,
      sessionId: row.session_id,
      projectSlug: row.project_slug,
      subDirectory: row.sub_directory,
      chunkIndex: row.chunk_index,
      totalChunks: row.total_chunks,
      lineRange: [row.line_start, row.line_end],
      originalSize: row.original_size,
      compressedSize: row.compressed_size,
      contentHash: row.content_hash,
      noteBlockNumber: row.note_block_number,
      noteTxHash: row.note_tx_hash,
      ipfsHash: row.ipfs_hash,
      status: row.status,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
      decryptedContent: row.decrypted_content,
      compressedContent: row.compressed_content
    };
  }
  // ============================================
  // TRANSCRIPT ARCHIVER: Project Config Management
  // ============================================
  /**
   * Get project archive configuration
   */
  async getProjectConfig(projectSlug) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare(
      "SELECT * FROM project_archive_configs WHERE project_slug = ?"
    ).get(projectSlug);
    if (!row) return null;
    return {
      projectSlug: row.project_slug,
      secretAddress: row.secret_address,
      chainId: row.chain_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastArchiveTime: row.last_archive_time,
      totalChunksArchived: row.total_chunks_archived,
      totalBytesArchived: row.total_bytes_archived
    };
  }
  /**
   * Create or update project archive configuration
   */
  async upsertProjectConfig(config) {
    if (!this.db) throw new Error("Database not initialized");
    const existing = await this.getProjectConfig(config.projectSlug);
    const now = Date.now();
    if (existing) {
      this.db.prepare(`
        UPDATE project_archive_configs SET
          secret_address = ?,
          chain_id = ?,
          updated_at = ?,
          last_archive_time = ?,
          total_chunks_archived = ?,
          total_bytes_archived = ?
        WHERE project_slug = ?
      `).run(
        config.secretAddress,
        config.chainId,
        now,
        config.lastArchiveTime || null,
        config.totalChunksArchived,
        config.totalBytesArchived,
        config.projectSlug
      );
      console.log("[ArchiveDB] Updated project config:", config.projectSlug);
    } else {
      this.db.prepare(`
        INSERT INTO project_archive_configs (
          project_slug, secret_address, chain_id, created_at, updated_at,
          last_archive_time, total_chunks_archived, total_bytes_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        config.projectSlug,
        config.secretAddress,
        config.chainId,
        now,
        now,
        config.lastArchiveTime || null,
        config.totalChunksArchived,
        config.totalBytesArchived
      );
      console.log("[ArchiveDB] Created project config:", config.projectSlug);
    }
    return this.getProjectConfig(config.projectSlug);
  }
  /**
   * Update project config after archiving chunks
   */
  async updateProjectArchiveStats(projectSlug, chunksArchived, bytesArchived) {
    if (!this.db) throw new Error("Database not initialized");
    const now = Date.now();
    this.db.prepare(`
      UPDATE project_archive_configs SET
        updated_at = ?,
        last_archive_time = ?,
        total_chunks_archived = total_chunks_archived + ?,
        total_bytes_archived = total_bytes_archived + ?
      WHERE project_slug = ?
    `).run(now, now, chunksArchived, bytesArchived, projectSlug);
  }
  // ============================================
  // SEARCHABLE ARCHIVE: Transcript Processing
  // ============================================
  /**
   * Process decrypted transcript content into searchable messages
   *
   * Parses the raw transcript JSONL and extracts:
   * - Individual messages with role/content
   * - Tool usage per message
   * - File references
   * - Session-level metadata
   */
  async processTranscriptContent(chunkId, sessionId, projectSlug, rawContent) {
    if (!this.db) throw new Error("Database not initialized");
    const now = Date.now();
    const messages = [];
    const allFilesRead = /* @__PURE__ */ new Set();
    const allFilesWritten = /* @__PURE__ */ new Set();
    const allToolsUsed = /* @__PURE__ */ new Set();
    const allTopics = /* @__PURE__ */ new Set();
    const allLanguages = /* @__PURE__ */ new Set();
    let hasErrors = false;
    let firstTimestamp;
    let lastTimestamp;
    const lines = rawContent.split("\n").filter((l) => l.trim());
    let turnIndex = 0;
    let lineNum = 0;
    for (const line of lines) {
      if (++lineNum % 400 === 0) await new Promise((res) => setImmediate(res));
      try {
        const entry = JSON.parse(line);
        const entryType = entry.type === "user" ? "human" : entry.type;
        if (entryType === "human" || entryType === "assistant") {
          const role = entryType;
          let content = "";
          const toolsUsed = [];
          const filesReferenced = [];
          const timestamp = entry.timestamp ? new Date(entry.timestamp).getTime() : void 0;
          if (timestamp) {
            if (!firstTimestamp || timestamp < firstTimestamp) firstTimestamp = timestamp;
            if (!lastTimestamp || timestamp > lastTimestamp) lastTimestamp = timestamp;
          }
          const contentBlocks = entry.message && Array.isArray(entry.message.content) ? entry.message.content : Array.isArray(entry.content) ? entry.content : null;
          if (contentBlocks) {
            for (const block of contentBlocks) {
              if (block.type === "text") {
                content += (block.text || "") + "\n";
              } else if (block.type === "tool_use") {
                const toolName = block.name || "unknown";
                toolsUsed.push(toolName);
                allToolsUsed.add(toolName);
                if (block.input) {
                  this.extractFileReferences(block.input, filesReferenced, allFilesRead, allFilesWritten, toolName);
                  if (typeof block.input === "object") {
                    for (const [key, val] of Object.entries(block.input)) {
                      if (typeof val === "string" && val.length > 20 && val.length < 2e3) {
                        content += `
${val}`;
                      }
                    }
                  }
                }
              } else if (block.type === "tool_result") {
                if (block.is_error) {
                  hasErrors = true;
                }
                if (Array.isArray(block.content)) {
                  for (const sub of block.content) {
                    if (sub.type === "text" && typeof sub.text === "string" && sub.text.length < 2e3) {
                      content += "\n" + sub.text;
                    }
                  }
                } else if (typeof block.content === "string" && block.content.length < 2e3) {
                  content += "\n" + block.content;
                }
              }
            }
          } else if (typeof entry.message?.content === "string") {
            content = entry.message.content;
          } else if (typeof entry.content === "string") {
            content = entry.content;
          }
          content = content.trim();
          if (!content) continue;
          const codeBlockMatches = content.matchAll(/```(\w+)/g);
          for (const match of codeBlockMatches) {
            if (match[1]) {
              allLanguages.add(match[1].toLowerCase());
            }
          }
          this.extractTopics(content, allTopics);
          filesReferenced.forEach((f) => allFilesRead.add(f));
          const messageId = `msg-${chunkId}-${turnIndex}`;
          messages.push({
            id: messageId,
            chunkId,
            sessionId,
            turnIndex,
            role,
            content: content.substring(0, 1e5),
            // Limit to 100KB per message
            toolsUsed: toolsUsed.length > 0 ? toolsUsed : void 0,
            filesReferenced: filesReferenced.length > 0 ? filesReferenced : void 0,
            timestamp,
            createdAt: now
          });
          turnIndex++;
        }
      } catch (e) {
        console.debug("[ArchiveDB] Skipping malformed line:", e);
      }
    }
    const insertTxn = this.db.transaction(() => {
      this.db.prepare("DELETE FROM parsed_messages WHERE chunk_id = ?").run(chunkId);
      const insertMsg = this.db.prepare(`
        INSERT INTO parsed_messages (
          id, chunk_id, session_id, turn_index, role, content,
          tools_used, files_referenced, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const msg of messages) {
        insertMsg.run(
          msg.id,
          msg.chunkId,
          msg.sessionId,
          msg.turnIndex,
          msg.role,
          msg.content,
          msg.toolsUsed ? JSON.stringify(msg.toolsUsed) : null,
          msg.filesReferenced ? JSON.stringify(msg.filesReferenced) : null,
          msg.timestamp || null,
          msg.createdAt
        );
      }
    });
    insertTxn();
    const allFiles = [...allFilesRead, ...allFilesWritten];
    console.log(`[ArchiveDB] Files for subdir detection - read: ${allFilesRead.size}, written: ${allFilesWritten.size}, total: ${allFiles.length}`);
    const subDirectory = extractSubDirectory(allFiles) || void 0;
    console.log(`[ArchiveDB] Extracted subDirectory: ${subDirectory || "none"} for session ${sessionId}`);
    const metadata = {
      sessionId,
      projectSlug,
      subDirectory,
      totalTurns: turnIndex,
      filesRead: Array.from(allFilesRead),
      filesWritten: Array.from(allFilesWritten),
      toolsUsed: Array.from(allToolsUsed),
      topics: Array.from(allTopics).slice(0, 50),
      // Limit topics
      codeLanguages: Array.from(allLanguages),
      hasErrors,
      firstMessageAt: firstTimestamp,
      lastMessageAt: lastTimestamp,
      createdAt: now,
      updatedAt: now
    };
    await this.upsertSessionMetadata(metadata);
    console.log(`[ArchiveDB] Processed chunk ${chunkId}: ${messages.length} messages, ${allToolsUsed.size} tools, ${allFilesRead.size} files`);
    return { messagesCount: messages.length, metadata };
  }
  /**
   * Extract file references from tool inputs
   */
  extractFileReferences(input, filesReferenced, allFilesRead, allFilesWritten, toolName) {
    const pathFields = ["file_path", "path", "filePath", "filename", "file"];
    for (const field of pathFields) {
      const value = input[field];
      if (typeof value === "string" && value.length > 0 && value.length < 500) {
        filesReferenced.push(value);
        if (["Write", "Edit", "NotebookEdit"].includes(toolName)) {
          allFilesWritten.add(value);
        } else {
          allFilesRead.add(value);
        }
      }
    }
    if (input["pattern"] && typeof input["pattern"] === "string") {
      filesReferenced.push(input["pattern"]);
    }
  }
  /**
   * Extract topics/keywords from content using word frequency analysis.
   * Finds the most distinctive words in the content rather than matching
   * a hardcoded list of generic programming terms.
   */
  extractTopics(content, topics) {
    const STOP_WORDS = /* @__PURE__ */ new Set([
      // English
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "is",
      "it",
      "as",
      "be",
      "was",
      "are",
      "been",
      "has",
      "had",
      "have",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "can",
      "shall",
      "not",
      "no",
      "if",
      "then",
      "else",
      "when",
      "up",
      "out",
      "so",
      "than",
      "too",
      "very",
      "just",
      "about",
      "also",
      "into",
      "over",
      "after",
      "before",
      "between",
      "under",
      "again",
      "there",
      "here",
      "all",
      "each",
      "every",
      "both",
      "few",
      "more",
      "most",
      "other",
      "some",
      "such",
      "only",
      "own",
      "same",
      "that",
      "this",
      "these",
      "those",
      "what",
      "which",
      "who",
      "whom",
      "how",
      "its",
      "my",
      "your",
      "his",
      "her",
      "our",
      "their",
      "me",
      "him",
      "us",
      "them",
      "we",
      "you",
      "they",
      "he",
      "she",
      "i",
      // Programming noise (these appear in every session)
      "function",
      "return",
      "const",
      "let",
      "var",
      "class",
      "new",
      "import",
      "export",
      "require",
      "module",
      "true",
      "false",
      "null",
      "undefined",
      "string",
      "number",
      "boolean",
      "object",
      "array",
      "type",
      "interface",
      "extends",
      "implements",
      "async",
      "await",
      "try",
      "catch",
      "throw",
      "console",
      "log",
      "error",
      "warn",
      "info",
      "debug",
      "default",
      "value",
      "name",
      "data",
      "result",
      "response",
      "request",
      "params",
      "options",
      "args",
      "file",
      "path",
      "line",
      "code",
      "text",
      "message",
      "length",
      "index",
      "key",
      "map",
      "set",
      "get",
      "add",
      "remove",
      "create",
      "update",
      "delete",
      "read",
      "write",
      "open",
      "close",
      "start",
      "stop",
      "run",
      "test",
      "check",
      "call",
      "use",
      "make",
      "find",
      "show",
      "list",
      "item",
      "first",
      "last",
      "next",
      "end",
      // Path noise
      "src",
      "dist",
      "build",
      "node_modules",
      "packages",
      "apps",
      "lib",
      "tests",
      "docs",
      "config",
      "scripts",
      "public",
      "assets",
      "utils",
      "components",
      "types",
      "main",
      "users",
      "var",
      "tmp",
      "usr",
      "opt",
      "www",
      "home",
      "onedrive",
      "documents",
      "corp",
      "rootz",
      "claud",
      "project",
      // The user's own home-folder names (e.g. their username) are path noise too. Derived at
      // runtime rather than hard-coded, so this list carries no one's name in a shipped build.
      ...os.homedir().toLowerCase().split(/[\\/\s_.-]+/).filter((w) => w.length >= 3)
    ]);
    const wordCounts = /* @__PURE__ */ new Map();
    const words = content.toLowerCase().match(/\b[a-z][a-z0-9_-]{2,25}\b/g) || [];
    for (const w of words) {
      if (!STOP_WORDS.has(w) && !/^\d+$/.test(w)) {
        wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
      }
    }
    const sorted = [...wordCounts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [word] of sorted) {
      topics.add(word);
    }
    const compoundMatches = content.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g);
    for (const m of compoundMatches) {
      const term = m[1];
      if (term.length >= 6) {
        topics.add(term.toLowerCase());
      }
    }
    const pathMatches = content.matchAll(/(?:[/\\])([\w-]{3,30})(?=[/\\.])/g);
    const pathTermCounts = /* @__PURE__ */ new Map();
    for (const m of pathMatches) {
      const term = m[1].toLowerCase();
      if (!STOP_WORDS.has(term) && !/^\d+$/.test(term)) {
        pathTermCounts.set(term, (pathTermCounts.get(term) || 0) + 1);
      }
    }
    for (const [term, count] of pathTermCounts) {
      if (count >= 2) {
        topics.add(term);
      }
    }
    const solidityMatches = content.match(/\b(contract|function|mapping|modifier|event|emit|require|payable|external|internal|public|private)\s+(\w{3,30})\b/g);
    if (solidityMatches) {
      for (const m of solidityMatches) {
        const parts = m.split(/\s+/);
        if (parts[1] && !STOP_WORDS.has(parts[1].toLowerCase())) {
          topics.add(parts[1].toLowerCase());
        }
      }
    }
    const addrMatches = content.match(/0x[a-fA-F0-9]{40}/g);
    if (addrMatches && addrMatches.length > 0) {
      topics.add("blockchain");
      topics.add("polygon");
    }
  }
  /**
   * Upsert session metadata
   */
  async upsertSessionMetadata(metadata) {
    if (!this.db) throw new Error("Database not initialized");
    const existing = await this.getSessionMetadata(metadata.sessionId);
    const now = Date.now();
    if (existing) {
      const mergedFilesRead = [.../* @__PURE__ */ new Set([...existing.filesRead, ...metadata.filesRead])];
      const mergedFilesWritten = [.../* @__PURE__ */ new Set([...existing.filesWritten, ...metadata.filesWritten])];
      const mergedToolsUsed = [.../* @__PURE__ */ new Set([...existing.toolsUsed, ...metadata.toolsUsed])];
      const mergedTopics = [.../* @__PURE__ */ new Set([...existing.topics, ...metadata.topics])].slice(0, 50);
      const mergedLanguages = [.../* @__PURE__ */ new Set([...existing.codeLanguages, ...metadata.codeLanguages])];
      const subDir = metadata.subDirectory || existing.subDirectory;
      this.db.prepare(`
        UPDATE session_metadata SET
          total_turns = total_turns + ?,
          sub_directory = COALESCE(?, sub_directory),
          files_read = ?,
          files_written = ?,
          tools_used = ?,
          topics = ?,
          code_languages = ?,
          has_errors = ?,
          first_message_at = COALESCE(?, first_message_at),
          last_message_at = COALESCE(?, last_message_at),
          git_commit_hash = COALESCE(?, git_commit_hash),
          git_branch = COALESCE(?, git_branch),
          git_dirty = COALESCE(?, git_dirty),
          updated_at = ?
        WHERE session_id = ?
      `).run(
        metadata.totalTurns,
        subDir || null,
        JSON.stringify(mergedFilesRead),
        JSON.stringify(mergedFilesWritten),
        JSON.stringify(mergedToolsUsed),
        JSON.stringify(mergedTopics),
        JSON.stringify(mergedLanguages),
        metadata.hasErrors || existing.hasErrors ? 1 : 0,
        metadata.firstMessageAt || null,
        metadata.lastMessageAt || null,
        metadata.gitCommitHash || null,
        metadata.gitBranch || null,
        metadata.gitDirty !== void 0 ? metadata.gitDirty ? 1 : 0 : null,
        now,
        metadata.sessionId
      );
    } else {
      this.db.prepare(`
        INSERT INTO session_metadata (
          session_id, project_slug, sub_directory, summary, total_turns, total_tokens_estimate,
          files_read, files_written, tools_used, topics, code_languages,
          has_errors, first_message_at, last_message_at, created_at, updated_at,
          git_commit_hash, git_branch, git_dirty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        metadata.sessionId,
        metadata.projectSlug,
        metadata.subDirectory || null,
        metadata.summary || null,
        metadata.totalTurns,
        metadata.totalTokensEstimate || null,
        JSON.stringify(metadata.filesRead),
        JSON.stringify(metadata.filesWritten),
        JSON.stringify(metadata.toolsUsed),
        JSON.stringify(metadata.topics),
        JSON.stringify(metadata.codeLanguages),
        metadata.hasErrors ? 1 : 0,
        metadata.firstMessageAt || null,
        metadata.lastMessageAt || null,
        metadata.createdAt,
        metadata.updatedAt,
        metadata.gitCommitHash || null,
        metadata.gitBranch || null,
        metadata.gitDirty ? 1 : 0
      );
    }
  }
  /**
   * Get session metadata by ID
   */
  async getSessionMetadata(sessionId) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare(
      "SELECT * FROM session_metadata WHERE session_id = ?"
    ).get(sessionId);
    if (!row) return null;
    return this.rowToSessionMetadata(row);
  }
  /**
   * Get all session metadata for a project
   */
  async getProjectSessions(projectSlug, limit = 50) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT * FROM session_metadata WHERE project_slug = ? ORDER BY updated_at DESC LIMIT ?"
    ).all(projectSlug, limit);
    return rows.map((row) => this.rowToSessionMetadata(row));
  }
  /**
   * Search parsed messages
   */
  async searchMessages(query, options) {
    if (!this.db) throw new Error("Database not initialized");
    const limit = options?.limit || 50;
    const conditions = [];
    const params = [];
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      conditions.push("content LIKE ?");
      params.push(`%${query}%`);
    } else {
      for (const term of terms) {
        conditions.push("content LIKE ?");
        params.push(`%${term}%`);
      }
    }
    if (options?.sessionId) {
      conditions.push("session_id = ?");
      params.push(options.sessionId);
    }
    if (options?.role) {
      conditions.push("role = ?");
      params.push(options.role);
    }
    let sql;
    if (options?.projectSlug) {
      sql = `
        SELECT m.* FROM parsed_messages m
        JOIN transcript_chunks c ON m.chunk_id = c.id
        WHERE ${conditions.join(" AND ")} AND c.project_slug = ?
        ORDER BY m.timestamp DESC, m.turn_index DESC
        LIMIT ?
      `;
      params.push(options.projectSlug, limit);
    } else {
      sql = `
        SELECT * FROM parsed_messages
        WHERE ${conditions.join(" AND ")}
        ORDER BY timestamp DESC, turn_index DESC
        LIMIT ?
      `;
      params.push(limit);
    }
    const rows = this.db.prepare(sql).all(...params);
    const messages = rows.map((row) => this.rowToParsedMessage(row));
    const sessionIds = [...new Set(messages.map((m) => m.sessionId))];
    const metadataMap = /* @__PURE__ */ new Map();
    for (const sid of sessionIds) {
      const meta = await this.getSessionMetadata(sid);
      if (meta) metadataMap.set(sid, meta);
    }
    return messages.map((msg) => ({
      ...msg,
      sessionMetadata: metadataMap.get(msg.sessionId)
    }));
  }
  /**
   * Search sessions by file touched
   */
  async searchSessionsByFile(filePath, limit = 20) {
    if (!this.db) throw new Error("Database not initialized");
    const pattern = `%${filePath}%`;
    const rows = this.db.prepare(`
      SELECT * FROM session_metadata
      WHERE files_read LIKE ? OR files_written LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(pattern, pattern, limit);
    return rows.map((row) => this.rowToSessionMetadata(row));
  }
  /**
   * Search sessions by tool used
   */
  async searchSessionsByTool(toolName, limit = 20) {
    if (!this.db) throw new Error("Database not initialized");
    const pattern = `%"${toolName}"%`;
    const rows = this.db.prepare(`
      SELECT * FROM session_metadata
      WHERE tools_used LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(pattern, limit);
    return rows.map((row) => this.rowToSessionMetadata(row));
  }
  /**
   * Get sessions with errors
   */
  async getSessionsWithErrors(limit = 20) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT * FROM session_metadata
      WHERE has_errors = 1
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map((row) => this.rowToSessionMetadata(row));
  }
  // ============================================
  // LOCAL JSONL INDEXING
  // ============================================
  /**
   * Index local Claude Code JSONL session files into parsed_messages for search.
   *
   * Scans ~/.claude/projects/ for JSONL transcript files and processes them
   * into the same parsed_messages + session_metadata tables used by blockchain
   * archives. Tracks indexed files by path + mtime to avoid re-indexing.
   *
   * Each JSONL file gets a synthetic transcript_chunks entry (with prefix "local-")
   * so that the existing searchMessages() JOIN on transcript_chunks works unchanged.
   *
   * @param options.projectFilter - Only index sessions for this project slug
   * @param options.limit - Max files to index per call (default 50)
   * @param options.forceReindex - Re-index even if file hasn't changed
   * @returns Summary of indexing results
   */
  async indexLocalSessions(options) {
    if (!this.db) throw new Error("Database not initialized");
    const limit = options?.limit || 50;
    const forceReindex = options?.forceReindex || false;
    const projectsDir = path.join(
      process.env.USERPROFILE || process.env.HOME || os.homedir(),
      ".claude",
      "projects"
    );
    if (!fs.existsSync(projectsDir)) {
      return {
        filesScanned: 0,
        filesIndexed: 0,
        filesSkipped: 0,
        filesErrored: 0,
        totalMessagesIndexed: 0,
        errors: ["No .claude/projects directory found"]
      };
    }
    let filesScanned = 0;
    let filesIndexed = 0;
    let filesSkipped = 0;
    let filesErrored = 0;
    let totalMessagesIndexed = 0;
    const errors = [];
    const projEntries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const projEntry of projEntries) {
      if (!projEntry.isDirectory()) continue;
      const projectSlug = projEntry.name;
      if (options?.projectFilter && projectSlug !== options.projectFilter) continue;
      const projPath = path.join(projectsDir, projectSlug);
      let jsonlFiles;
      try {
        jsonlFiles = fs.readdirSync(projPath).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const fname of jsonlFiles) {
        if (filesIndexed >= limit) break;
        const filePath = path.join(projPath, fname);
        filesScanned++;
        try {
          const stat = fs.statSync(filePath);
          const mtimeMs = Math.floor(stat.mtimeMs);
          const fileSize = stat.size;
          const MAX_INDEXABLE_SIZE = 500 * 1024 * 1024;
          if (fileSize > MAX_INDEXABLE_SIZE) {
            filesSkipped++;
            console.log(`[ArchiveDB] Skipping large file (${(fileSize / 1024 / 1024).toFixed(1)}MB > 500MB limit): ${fname}`);
            continue;
          }
          if (!forceReindex) {
            const existing = this.db.prepare(
              "SELECT mtime, file_size FROM local_indexed_files WHERE file_path = ?"
            ).get(filePath);
            if (existing) {
              if (existing.mtime === mtimeMs && existing.file_size === fileSize) {
                filesSkipped++;
                continue;
              }
            }
          }
          const sessionId = fname.replace(".jsonl", "");
          const rawContent = fs.readFileSync(filePath, "utf-8");
          if (!rawContent.trim()) {
            filesSkipped++;
            continue;
          }
          const chunkId = `local-${sessionId}`;
          const indexTxn = this.db.transaction(() => {
            this.db.prepare("DELETE FROM parsed_messages WHERE chunk_id = ?").run(chunkId);
            this.db.prepare("DELETE FROM transcript_chunks WHERE id = ?").run(chunkId);
            const now2 = Date.now();
            const lineCount = rawContent.split("\n").filter((l) => l.trim()).length;
            const zlib3 = __require("zlib");
            const compressed = zlib3.gzipSync(Buffer.from(rawContent, "utf8")).toString("base64");
            this.db.prepare(`
              INSERT INTO transcript_chunks (
                id, session_id, project_slug, chunk_index, total_chunks,
                line_start, line_end, original_size, compressed_size,
                content_hash, status, created_at, compressed_content
              ) VALUES (?, ?, ?, 0, 1, 0, ?, ?, ?, ?, 'local', ?, ?)
            `).run(
              chunkId,
              sessionId,
              projectSlug,
              lineCount,
              fileSize,
              compressed.length,
              // Hash the WHOLE transcript, not the first 10,000 chars. A hash over
              // a prefix cannot detect a change past that prefix, so it silently
              // stops being an integrity check on exactly the long sessions where
              // one is worth having.
              crypto.createHash("sha256").update(rawContent).digest("hex"),
              now2,
              compressed
            );
          });
          indexTxn();
          const result = await this.processTranscriptContent(
            chunkId,
            sessionId,
            projectSlug,
            rawContent
          );
          totalMessagesIndexed += result.messagesCount;
          const now = Date.now();
          this.db.prepare(`
            INSERT OR REPLACE INTO local_indexed_files (
              file_path, project_slug, session_id, file_size, mtime,
              messages_indexed, indexed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            filePath,
            projectSlug,
            sessionId,
            fileSize,
            mtimeMs,
            result.messagesCount,
            now
          );
          filesIndexed++;
          console.log(`[ArchiveDB] Indexed local session ${sessionId}: ${result.messagesCount} messages`);
        } catch (err) {
          filesErrored++;
          const errMsg = `Failed to index ${filePath}: ${err.message}`;
          errors.push(errMsg);
          console.warn(`[ArchiveDB] ${errMsg}`);
          if (err.message.includes("malformed") || err.message.includes("allocation failed")) {
            console.error("[ArchiveDB] Database corruption detected during indexing \u2014 aborting");
            break;
          }
        }
      }
      if (filesIndexed >= limit) break;
    }
    console.log(`[ArchiveDB] Local indexing complete: scanned=${filesScanned} indexed=${filesIndexed} skipped=${filesSkipped} errors=${filesErrored} messages=${totalMessagesIndexed}`);
    return {
      filesScanned,
      filesIndexed,
      filesSkipped,
      filesErrored,
      totalMessagesIndexed,
      errors
    };
  }
  /**
   * Parse one session's raw .jsonl transcript into the searchable parsed_messages
   * + session_metadata store, via a synthetic transcript_chunk. Shared by the
   * stranded-session backfill and the capture write-path so hook/browser captures
   * become first-class searchable turns instead of observation-only archives.
   */
  async parseTranscriptForSession(sessionId, rawContent, opts) {
    if (!this.db) throw new Error("Database not initialized");
    let projectSlug = opts?.projectSlug || "recovered";
    if (!opts?.projectSlug) {
      for (const line of rawContent.split("\n").slice(0, 40)) {
        if (!line.trim()) continue;
        try {
          const cwd = JSON.parse(line).cwd;
          if (cwd) {
            projectSlug = cwd.replace(/[\\/:. ]/g, "-");
            break;
          }
        } catch {
        }
      }
    }
    const chunkId = `reparse-${sessionId}`;
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM parsed_messages WHERE chunk_id = ?").run(chunkId);
      this.db.prepare("DELETE FROM transcript_chunks WHERE id = ?").run(chunkId);
      const now = Date.now();
      const lineCount = rawContent.split("\n").filter((l) => l.trim()).length;
      this.db.prepare(`
        INSERT INTO transcript_chunks (
          id, session_id, project_slug, chunk_index, total_chunks,
          line_start, line_end, original_size, compressed_size,
          content_hash, status, created_at
        ) VALUES (?, ?, ?, 0, 1, 0, ?, ?, 0, ?, 'local', ?)
      `).run(
        chunkId,
        sessionId,
        projectSlug,
        lineCount,
        rawContent.length,
        crypto.createHash("sha256").update(rawContent.substring(0, 1e4)).digest("hex"),
        now
      );
    })();
    const result = await this.processTranscriptContent(chunkId, sessionId, projectSlug, rawContent);
    return { messagesCount: result.messagesCount, projectSlug };
  }
  /**
   * Recover "stranded" sessions. The auto-capture hooks (and browser extension)
   * store the full raw .jsonl in archives.transcript but never run
   * processTranscriptContent, so the real conversation never reaches the
   * searchable parsed_messages store (search_conversations/get_session_context
   * see nothing). This re-parses each distinct stranded session — using its
   * largest captured transcript — via parseTranscriptForSession, so the recovered
   * turns become first-class searchable messages.
   */
  async reparseStrandedTranscripts(opts) {
    if (!this.db) throw new Error("Database not initialized");
    const limit = opts?.limit ?? 1e3;
    const rows = this.db.prepare(`
      SELECT a.session_id AS session_id, a.transcript AS transcript
      FROM archives a
      JOIN (
        SELECT session_id, MAX(LENGTH(transcript)) AS maxlen
        FROM archives
        WHERE session_id IS NOT NULL AND transcript IS NOT NULL AND LENGTH(transcript) > 200
          AND session_id NOT IN (SELECT DISTINCT session_id FROM parsed_messages WHERE session_id IS NOT NULL)
        GROUP BY session_id
      ) m ON a.session_id = m.session_id AND LENGTH(a.transcript) = m.maxlen
      GROUP BY a.session_id
      LIMIT ?
    `).all(limit);
    let sessionsReparsed = 0;
    let messagesIndexed = 0;
    let skipped = 0;
    const errors = [];
    for (const row of rows) {
      const sessionId = row.session_id;
      try {
        const result = await this.parseTranscriptForSession(sessionId, row.transcript);
        if (result.messagesCount > 0) {
          sessionsReparsed++;
          messagesIndexed += result.messagesCount;
        } else {
          skipped++;
        }
      } catch (err) {
        errors.push(`${sessionId}: ${err.message}`);
        if (err.message.includes("malformed") || err.message.includes("allocation failed")) break;
      }
    }
    return { sessionsScanned: rows.length, sessionsReparsed, messagesIndexed, skipped, errors };
  }
  /**
   * Get local indexing statistics
   */
  async getLocalIndexStats() {
    if (!this.db) throw new Error("Database not initialized");
    const countRow = this.db.prepare("SELECT COUNT(*) as cnt, SUM(messages_indexed) as msgs FROM local_indexed_files").get();
    const projectRow = this.db.prepare("SELECT COUNT(DISTINCT project_slug) as cnt FROM local_indexed_files").get();
    const timeRow = this.db.prepare("SELECT MIN(indexed_at) as oldest, MAX(indexed_at) as newest FROM local_indexed_files").get();
    return {
      totalFilesIndexed: countRow?.cnt ?? 0,
      totalMessagesIndexed: countRow?.msgs ?? 0,
      projectsIndexed: projectRow?.cnt ?? 0,
      oldestIndexedAt: timeRow?.oldest ?? null,
      newestIndexedAt: timeRow?.newest ?? null
    };
  }
  /**
   * Get recent sessions for LLM context
   */
  async getRecentSessionsForContext(projectSlug, limit = 5) {
    if (!this.db) throw new Error("Database not initialized");
    const sessions = await this.getProjectSessions(projectSlug, limit);
    const results = [];
    for (const session of sessions) {
      const messageRows = this.db.prepare(`
        SELECT content FROM parsed_messages
        WHERE session_id = ?
        ORDER BY turn_index ASC
        LIMIT 3
      `).all(session.sessionId);
      let messagePreview = "";
      if (messageRows.length > 0) {
        messagePreview = messageRows.map((r) => r.content.substring(0, 200)).join("\n---\n");
      }
      results.push({
        sessionId: session.sessionId,
        summary: session.summary,
        filesModified: [...session.filesRead, ...session.filesWritten].slice(0, 10),
        toolsUsed: session.toolsUsed,
        messagePreview: messagePreview.substring(0, 1e3)
      });
    }
    return results;
  }
  /**
   * Get archive search stats
   */
  async getSearchStats() {
    if (!this.db) throw new Error("Database not initialized");
    const sessionsRow = this.db.prepare("SELECT COUNT(*) as count FROM session_metadata").get();
    const messagesRow = this.db.prepare("SELECT COUNT(*) as count FROM parsed_messages").get();
    const errorsRow = this.db.prepare("SELECT COUNT(*) as count FROM session_metadata WHERE has_errors = 1").get();
    const allMetaRows = this.db.prepare("SELECT files_read, files_written, tools_used FROM session_metadata").all();
    const allFiles = /* @__PURE__ */ new Set();
    const allTools = /* @__PURE__ */ new Set();
    for (const row of allMetaRows) {
      try {
        const filesRead = JSON.parse(row.files_read || "[]");
        const filesWritten = JSON.parse(row.files_written || "[]");
        const tools = JSON.parse(row.tools_used || "[]");
        filesRead.forEach((f) => allFiles.add(f));
        filesWritten.forEach((f) => allFiles.add(f));
        tools.forEach((t) => allTools.add(t));
      } catch {
      }
    }
    return {
      totalSessions: sessionsRow?.count ?? 0,
      totalMessages: messagesRow?.count ?? 0,
      uniqueFiles: allFiles.size,
      uniqueTools: allTools.size,
      sessionsWithErrors: errorsRow?.count ?? 0
    };
  }
  /**
   * Convert row to SessionMetadata
   */
  rowToSessionMetadata(row) {
    return {
      sessionId: row.session_id,
      projectSlug: row.project_slug,
      subDirectory: row.sub_directory,
      summary: row.summary,
      totalTurns: row.total_turns,
      totalTokensEstimate: row.total_tokens_estimate,
      filesRead: JSON.parse(row.files_read || "[]"),
      filesWritten: JSON.parse(row.files_written || "[]"),
      toolsUsed: JSON.parse(row.tools_used || "[]"),
      topics: JSON.parse(row.topics || "[]"),
      codeLanguages: JSON.parse(row.code_languages || "[]"),
      hasErrors: row.has_errors === 1,
      firstMessageAt: row.first_message_at,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Git integration
      gitCommitHash: row.git_commit_hash,
      gitBranch: row.git_branch,
      gitDirty: row.git_dirty === 1
    };
  }
  /**
   * Convert row to ParsedMessage
   */
  rowToParsedMessage(row) {
    return {
      id: row.id,
      chunkId: row.chunk_id,
      sessionId: row.session_id,
      turnIndex: row.turn_index,
      role: row.role,
      content: row.content,
      toolsUsed: row.tools_used ? JSON.parse(row.tools_used) : void 0,
      filesReferenced: row.files_referenced ? JSON.parse(row.files_referenced) : void 0,
      timestamp: row.timestamp,
      createdAt: row.created_at
    };
  }
  /**
   * Get all project configurations
   */
  async getAllProjectConfigs() {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT * FROM project_archive_configs ORDER BY updated_at DESC"
    ).all();
    return rows.map((row) => ({
      projectSlug: row.project_slug,
      secretAddress: row.secret_address,
      chainId: row.chain_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastArchiveTime: row.last_archive_time,
      totalChunksArchived: row.total_chunks_archived,
      totalBytesArchived: row.total_bytes_archived
    }));
  }
  // ============================================
  // INCREMENTAL ARCHIVE: Conversation State Methods
  // ============================================
  /**
   * Get archive state for a conversation
   */
  async getConversationArchiveState(conversationId) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare(
      "SELECT * FROM conversation_archive_state WHERE conversation_id = ?"
    ).get(conversationId);
    if (!row) return null;
    return this.rowToConversationState(row);
  }
  /**
   * Set/update archive state for a conversation
   */
  async setConversationArchiveState(state) {
    if (!this.db) throw new Error("Database not initialized");
    const existing = await this.getConversationArchiveState(state.conversationId);
    const now = Date.now();
    if (existing) {
      this.db.prepare(`
        UPDATE conversation_archive_state SET
          platform = ?,
          project_slug = ?,
          last_archived_message_index = ?,
          total_messages_at_last_archive = ?,
          last_archived_at = ?,
          archive_ids = ?,
          latest_archive_id = ?,
          conversation_title = ?,
          first_message_at = COALESCE(?, first_message_at),
          updated_at = ?
        WHERE conversation_id = ?
      `).run(
        state.platform,
        state.projectSlug || null,
        state.lastArchivedMessageIndex,
        state.totalMessagesAtLastArchive,
        state.lastArchivedAt,
        JSON.stringify(state.archiveIds),
        state.latestArchiveId || null,
        state.conversationTitle || null,
        state.firstMessageAt || null,
        now,
        state.conversationId
      );
    } else {
      this.db.prepare(`
        INSERT INTO conversation_archive_state (
          conversation_id, platform, project_slug,
          last_archived_message_index, total_messages_at_last_archive, last_archived_at,
          archive_ids, latest_archive_id, conversation_title, first_message_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        state.conversationId,
        state.platform,
        state.projectSlug || null,
        state.lastArchivedMessageIndex,
        state.totalMessagesAtLastArchive,
        state.lastArchivedAt,
        JSON.stringify(state.archiveIds),
        state.latestArchiveId || null,
        state.conversationTitle || null,
        state.firstMessageAt || null,
        state.createdAt || now,
        now
      );
    }
    console.log("[ArchiveDB] Updated conversation state:", state.conversationId, "archived:", state.lastArchivedMessageIndex);
  }
  /**
   * Get conversations that have unarchived messages
   */
  async getPendingConversations(options) {
    if (!this.db) throw new Error("Database not initialized");
    const conditions = ["last_archived_message_index < total_messages_at_last_archive"];
    const params = [];
    if (options?.platform) {
      conditions.push("platform = ?");
      params.push(options.platform);
    }
    if (options?.projectSlug) {
      conditions.push("project_slug = ?");
      params.push(options.projectSlug);
    }
    const limit = options?.limit || 50;
    const sql = `
      SELECT * FROM conversation_archive_state
      WHERE ${conditions.join(" AND ")}
      ORDER BY updated_at DESC
      LIMIT ?
    `;
    params.push(limit);
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((row) => this.rowToConversationState(row));
  }
  /**
   * Get archive status summary for all tracked conversations
   */
  async getArchiveStatusSummary() {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare("SELECT * FROM conversation_archive_state").all();
    if (rows.length === 0) {
      return {
        totalConversations: 0,
        fullyArchived: 0,
        partiallyArchived: 0,
        neverArchived: 0,
        byPlatform: {}
      };
    }
    const states = rows.map((row) => this.rowToConversationState(row));
    const byPlatform = {};
    let fullyArchived = 0;
    let partiallyArchived = 0;
    let neverArchived = 0;
    for (const state of states) {
      if (!byPlatform[state.platform]) {
        byPlatform[state.platform] = { total: 0, archived: 0, pending: 0 };
      }
      byPlatform[state.platform].total++;
      if (state.lastArchivedMessageIndex === 0) {
        neverArchived++;
        byPlatform[state.platform].pending++;
      } else if (state.lastArchivedMessageIndex >= state.totalMessagesAtLastArchive) {
        fullyArchived++;
        byPlatform[state.platform].archived++;
      } else {
        partiallyArchived++;
        byPlatform[state.platform].pending++;
      }
    }
    return {
      totalConversations: states.length,
      fullyArchived,
      partiallyArchived,
      neverArchived,
      byPlatform
    };
  }
  /**
   * Get all conversation states for a platform
   */
  async getConversationsByPlatform(platform, options) {
    if (!this.db) throw new Error("Database not initialized");
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const rows = this.db.prepare(
      "SELECT * FROM conversation_archive_state WHERE platform = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    ).all(platform, limit, offset);
    return rows.map((row) => this.rowToConversationState(row));
  }
  /**
   * Convert database row to ConversationArchiveState
   */
  rowToConversationState(row) {
    return {
      conversationId: row.conversation_id,
      platform: row.platform,
      projectSlug: row.project_slug,
      lastArchivedMessageIndex: row.last_archived_message_index,
      totalMessagesAtLastArchive: row.total_messages_at_last_archive,
      lastArchivedAt: row.last_archived_at,
      archiveIds: row.archive_ids ? JSON.parse(row.archive_ids) : [],
      latestArchiveId: row.latest_archive_id,
      conversationTitle: row.conversation_title,
      firstMessageAt: row.first_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log("[ArchiveDB] Closed");
    }
  }
  // ============================================
  // Private helpers
  // ============================================
  /**
   * Hydrate a database row into a full LocalArchive object
   */
  async hydrateArchive(row) {
    if (!this.db) throw new Error("Database not initialized");
    const id = row.id;
    const tags = this.db.prepare("SELECT tag FROM archive_tags WHERE archive_id = ?").all(id).map((r) => r.tag);
    const decisionRows = this.db.prepare(
      "SELECT text, timestamp, author FROM archive_decisions WHERE archive_id = ? ORDER BY timestamp"
    ).all(id);
    const decisions = decisionRows.map((d) => ({
      text: d.text,
      timestamp: d.timestamp,
      author: d.author
    }));
    const discussionRows = this.db.prepare(
      "SELECT topic, summary, resolved FROM archive_discussions WHERE archive_id = ?"
    ).all(id);
    const discussions = discussionRows.map((d) => ({
      topic: d.topic,
      summary: d.summary,
      resolved: d.resolved === 1
    }));
    const customFieldRow = this.db.prepare(
      "SELECT fields_json FROM archive_custom_fields WHERE archive_id = ?"
    ).get(id);
    const customFields = customFieldRow ? JSON.parse(customFieldRow.fields_json) : void 0;
    return {
      id,
      title: row.title,
      content: row.content,
      contentHash: row.content_hash,
      // THINKING AS ASSET: Include full conversation transcript
      transcript: row.transcript,
      transcriptHash: row.transcript_hash,
      sessionId: row.session_id,
      source: row.source,
      secretAddress: row.secret_address,
      noteAddress: row.note_address,
      templateType: row.template_type,
      tags,
      messageCount: row.message_count,
      decisions: decisions.length > 0 ? decisions : void 0,
      discussions: discussions.length > 0 ? discussions : void 0,
      customFields,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncedAt: row.synced_at
    };
  }
  /**
   * Hash content for deduplication
   */
  async hashContent(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }
  // ============================================
  // AI MEMORY PHASE 1: Embedding Management
  // ============================================
  /**
   * Store an embedding for a source item
   */
  async storeEmbedding(params) {
    if (!this.db) throw new Error("Database not initialized");
    const id = `emb-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    const now = Date.now();
    const embeddingBuffer = Buffer.from(params.embedding.buffer, params.embedding.byteOffset, params.embedding.byteLength);
    this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (
        id, source_type, source_id, content_preview, embedding, model_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.sourceType,
      params.sourceId,
      params.contentPreview,
      embeddingBuffer,
      params.modelVersion,
      now
    );
  }
  /**
   * Get all embeddings, optionally filtered by type
   */
  async getAllEmbeddings(types) {
    if (!this.db) throw new Error("Database not initialized");
    let sql = "SELECT source_type, source_id, content_preview, embedding, model_version FROM embeddings";
    const params = [];
    if (types && types.length > 0) {
      const placeholders = types.map(() => "?").join(", ");
      sql += ` WHERE source_type IN (${placeholders})`;
      params.push(...types);
    }
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((row) => {
      const buf = row.embedding;
      return {
        sourceType: row.source_type,
        sourceId: row.source_id,
        contentPreview: row.content_preview,
        embedding: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4),
        modelVersion: row.model_version
      };
    });
  }
  /**
   * Check if an embedding exists for a source item
   */
  async hasEmbedding(sourceType, sourceId) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare(
      "SELECT 1 FROM embeddings WHERE source_type = ? AND source_id = ? LIMIT 1"
    ).get(sourceType, sourceId);
    return !!row;
  }
  /**
   * Get sessions without embeddings for batch indexing
   */
  async getSessionsWithoutEmbeddings(limit = 100) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT sm.* FROM session_metadata sm
      LEFT JOIN embeddings e ON e.source_type = 'session' AND e.source_id = sm.session_id
      WHERE e.id IS NULL
      ORDER BY sm.updated_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map((row) => this.rowToSessionMetadata(row));
  }
  /**
   * Get all sessions (for message indexing across all sessions)
   */
  async getAllSessions(limit = 100) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT * FROM session_metadata
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map((row) => this.rowToSessionMetadata(row));
  }
  /**
   * Get messages without embeddings for a specific session
   */
  async getMessagesWithoutEmbeddings(sessionId, limit = 50, minLength = 0) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT pm.* FROM parsed_messages pm
      LEFT JOIN embeddings e ON e.source_type = 'message' AND e.source_id = pm.id
      WHERE pm.session_id = ? AND e.id IS NULL AND LENGTH(pm.content) >= ?
      ORDER BY pm.turn_index ASC
      LIMIT ?
    `).all(sessionId, minLength, limit);
    return rows.map((row) => this.rowToParsedMessage(row));
  }
  /**
   * Get all messages for a session (used by FactExtractor)
   */
  async getMessagesBySession(sessionId, limit = 2e3) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT * FROM parsed_messages
      WHERE session_id = ?
      ORDER BY turn_index ASC
      LIMIT ?
    `).all(sessionId, limit);
    return rows.map((row) => this.rowToParsedMessage(row));
  }
  /**
   * Get a single parsed message by ID (used by EmbeddingService for enrichment)
   */
  async getParsedMessage(id) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare("SELECT * FROM parsed_messages WHERE id = ?").get(id);
    if (!row) return null;
    return this.rowToParsedMessage(row);
  }
  /**
   * Get embedding statistics
   */
  async getEmbeddingStats() {
    if (!this.db) throw new Error("Database not initialized");
    const totalRow = this.db.prepare("SELECT COUNT(*) as count FROM embeddings").get();
    const total = totalRow?.count ?? 0;
    const byTypeRows = this.db.prepare(
      "SELECT source_type, COUNT(*) as count FROM embeddings GROUP BY source_type"
    ).all();
    const byType = {};
    for (const row of byTypeRows) {
      byType[row.source_type] = row.count;
    }
    const modelRow = this.db.prepare(
      "SELECT model_version FROM embeddings LIMIT 1"
    ).get();
    const modelVersion = modelRow?.model_version ?? null;
    return { total, byType, modelVersion };
  }
  /**
   * Delete embeddings for a source item
   */
  async deleteEmbedding(sourceType, sourceId) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare(
      "DELETE FROM embeddings WHERE source_type = ? AND source_id = ?"
    ).run(sourceType, sourceId);
  }
  /**
   * Store a semantic tag for a source item
   */
  async storeSemanticTag(sourceType, sourceId, tag, confidence) {
    if (!this.db) throw new Error("Database not initialized");
    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO semantic_tags (source_type, source_id, tag, confidence, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sourceType, sourceId, tag.toLowerCase(), confidence, now);
  }
  /**
   * Get semantic tags for a source item
   */
  async getSemanticTags(sourceType, sourceId) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT tag, confidence FROM semantic_tags WHERE source_type = ? AND source_id = ? ORDER BY confidence DESC"
    ).all(sourceType, sourceId);
    return rows.map((row) => ({
      tag: row.tag,
      confidence: row.confidence
    }));
  }
  // ============================================
  // Knowledge Facts (AI Memory Phase 2)
  // ============================================
  /**
   * Store a knowledge fact extracted from a session
   */
  async storeFact(fact) {
    if (!this.db) throw new Error("Database not initialized");
    const id = `fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO knowledge_facts (
        id, source_session_id, fact_type, subject, predicate, object,
        confidence, extracted_at, verified, context_preview
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      fact.sourceSessionId,
      fact.factType,
      fact.subject.toLowerCase(),
      fact.predicate,
      fact.object,
      fact.confidence,
      now,
      fact.verified ? 1 : 0,
      fact.contextPreview || null
    );
    return id;
  }
  /**
   * Store multiple facts at once (batch operation)
   */
  async storeFacts(facts) {
    let stored = 0;
    for (const fact of facts) {
      try {
        await this.storeFact(fact);
        stored++;
      } catch (err) {
        console.warn("[Database] Failed to store fact:", err);
      }
    }
    return stored;
  }
  /**
   * Query knowledge facts with flexible filters
   */
  async queryFacts(options = {}) {
    if (!this.db) throw new Error("Database not initialized");
    const conditions = [];
    const params = [];
    if (options.subject) {
      conditions.push("subject LIKE ?");
      params.push(`%${options.subject.toLowerCase()}%`);
    }
    if (options.factType) {
      conditions.push("fact_type = ?");
      params.push(options.factType);
    }
    if (options.object) {
      conditions.push("object LIKE ?");
      params.push(`%${options.object}%`);
    }
    if (options.sessionId) {
      conditions.push("source_session_id = ?");
      params.push(options.sessionId);
    }
    if (options.verified !== void 0) {
      conditions.push("verified = ?");
      params.push(options.verified ? 1 : 0);
    }
    let sql = "SELECT * FROM knowledge_facts";
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY extracted_at DESC";
    if (options.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((row) => ({
      id: row.id,
      sourceSessionId: row.source_session_id,
      factType: row.fact_type,
      subject: row.subject,
      predicate: row.predicate,
      object: row.object,
      confidence: row.confidence,
      extractedAt: row.extracted_at,
      verified: Boolean(row.verified),
      contextPreview: row.context_preview
    }));
  }
  /**
   * Get all facts for a specific subject (component, concept, etc.)
   */
  async getFactsAbout(subject) {
    return this.queryFacts({ subject, limit: 50 });
  }
  /**
   * Get facts extracted from a specific session
   */
  async getFactsFromSession(sessionId) {
    return this.queryFacts({ sessionId, limit: 100 });
  }
  /**
   * Get all decisions (fact_type = 'decision')
   */
  async getDecisions(options = {}) {
    return this.queryFacts({
      factType: "decision",
      subject: options.subject,
      limit: options.limit || 50
    });
  }
  /**
   * Verify a fact (mark as human-verified)
   */
  async verifyFact(factId) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare("UPDATE knowledge_facts SET verified = 1 WHERE id = ?").run(factId);
  }
  /**
   * Delete a fact
   */
  async deleteFact(factId) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare("DELETE FROM knowledge_facts WHERE id = ?").run(factId);
  }
  /**
   * Clear all facts for a session (useful before re-extraction with updated patterns)
   */
  async clearFactsBySession(sessionId) {
    if (!this.db) throw new Error("Database not initialized");
    const countRow = this.db.prepare("SELECT COUNT(*) as cnt FROM knowledge_facts WHERE source_session_id = ?").get(sessionId);
    const count = countRow?.cnt ?? 0;
    this.db.prepare("DELETE FROM knowledge_facts WHERE source_session_id = ?").run(sessionId);
    return count;
  }
  /**
   * Clear all facts of a specific type (useful for re-extracting after pattern changes)
   */
  async clearFactsByType(factType) {
    if (!this.db) throw new Error("Database not initialized");
    const countRow = this.db.prepare("SELECT COUNT(*) as cnt FROM knowledge_facts WHERE fact_type = ?").get(factType);
    const count = countRow?.cnt ?? 0;
    this.db.prepare("DELETE FROM knowledge_facts WHERE fact_type = ?").run(factType);
    return count;
  }
  /**
   * Get fact statistics
   */
  async getFactStats() {
    if (!this.db) throw new Error("Database not initialized");
    const totalRow = this.db.prepare("SELECT COUNT(*) as count FROM knowledge_facts").get();
    const total = totalRow?.count ?? 0;
    const byTypeRows = this.db.prepare(
      "SELECT fact_type, COUNT(*) as count FROM knowledge_facts GROUP BY fact_type"
    ).all();
    const byType = {};
    for (const row of byTypeRows) {
      byType[row.fact_type] = row.count;
    }
    const verifiedRow = this.db.prepare("SELECT COUNT(*) as count FROM knowledge_facts WHERE verified = 1").get();
    const verified = verifiedRow?.count ?? 0;
    const subjectsRow = this.db.prepare("SELECT COUNT(DISTINCT subject) as count FROM knowledge_facts").get();
    const subjects = subjectsRow?.count ?? 0;
    return { total, byType, verified, subjects };
  }
  // ============================================
  // Session Relationships (AI Memory Phase 13.3)
  // ============================================
  /**
   * Create a relationship between two sessions
   */
  async createSessionRelationship(params) {
    if (!this.db) throw new Error("Database not initialized");
    const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO session_relationships (
        id, source_session_id, target_session_id, relationship_type,
        strength, reason, created_at, verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id,
      params.sourceSessionId,
      params.targetSessionId,
      params.relationshipType,
      params.strength || 0.5,
      params.reason || null,
      now
    );
    return id;
  }
  /**
   * Get relationships for a session (both as source and target)
   */
  async getSessionRelationships(sessionId) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT * FROM session_relationships
      WHERE source_session_id = ? OR target_session_id = ?
      ORDER BY strength DESC
    `).all(sessionId, sessionId);
    return rows.map((row) => ({
      id: row.id,
      sourceSessionId: row.source_session_id,
      targetSessionId: row.target_session_id,
      relationshipType: row.relationship_type,
      strength: row.strength,
      reason: row.reason,
      createdAt: row.created_at,
      verified: Boolean(row.verified)
    }));
  }
  /**
   * Get ALL relationships (for graph visualization)
   */
  async getAllRelationships(limit = 2500) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT * FROM session_relationships
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map((row) => ({
      id: row.id,
      sourceSessionId: row.source_session_id,
      targetSessionId: row.target_session_id,
      relationshipType: row.relationship_type,
      strength: row.strength,
      reason: row.reason,
      createdAt: row.created_at,
      verified: Boolean(row.verified)
    }));
  }
  /**
   * Find related sessions (sessions that share files, topics, or are linked)
   */
  async findRelatedSessions(sessionId, limit = 10) {
    if (!this.db) throw new Error("Database not initialized");
    const relationships = await this.getSessionRelationships(sessionId);
    const related = relationships.map((rel) => ({
      sessionId: rel.sourceSessionId === sessionId ? rel.targetSessionId : rel.sourceSessionId,
      relationship: rel.relationshipType,
      strength: rel.strength,
      reason: rel.reason
    })).filter((r) => r.sessionId !== sessionId).slice(0, limit);
    return related;
  }
  /**
   * Auto-detect relationships between sessions based on shared files
   */
  async detectSharedFileRelationships(sessionId) {
    if (!this.db) throw new Error("Database not initialized");
    const sessionMeta = await this.getSessionMetadata(sessionId);
    if (!sessionMeta) return 0;
    const sessionFiles = /* @__PURE__ */ new Set([...sessionMeta.filesRead, ...sessionMeta.filesWritten]);
    if (sessionFiles.size === 0) return 0;
    const otherSessions = await this.getAllSessions(50);
    let created = 0;
    for (const other of otherSessions) {
      if (other.sessionId === sessionId) continue;
      const otherFiles = /* @__PURE__ */ new Set([...other.filesRead, ...other.filesWritten]);
      const sharedFiles = [...sessionFiles].filter((f) => otherFiles.has(f));
      if (sharedFiles.length > 0) {
        const strength = Math.min(1, sharedFiles.length / 5);
        await this.createSessionRelationship({
          sourceSessionId: sessionId,
          targetSessionId: other.sessionId,
          relationshipType: "related",
          strength,
          reason: `shared files: ${sharedFiles.slice(0, 3).join(", ")}${sharedFiles.length > 3 ? "..." : ""}`
        });
        created++;
      }
    }
    return created;
  }
  // ============================================
  // Topic Clusters (AI Memory Phase 13.3)
  // ============================================
  /**
   * Create or update a topic cluster
   */
  async upsertTopicCluster(params) {
    if (!this.db) throw new Error("Database not initialized");
    const id = params.id || `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const embeddingBuffer = params.centroidEmbedding ? Buffer.from(params.centroidEmbedding.buffer, params.centroidEmbedding.byteOffset, params.centroidEmbedding.byteLength) : null;
    this.db.prepare(`
      INSERT OR REPLACE INTO topic_clusters (
        id, name, description, keywords, session_ids,
        centroid_embedding, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.name,
      params.description || null,
      JSON.stringify(params.keywords),
      JSON.stringify(params.sessionIds),
      embeddingBuffer,
      now,
      now
    );
    return id;
  }
  /**
   * Get all topic clusters
   */
  async getTopicClusters(limit = 20) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT * FROM topic_clusters
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map((row) => {
      const centroidBuf = row.centroid_embedding;
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        keywords: JSON.parse(row.keywords || "[]"),
        sessionIds: JSON.parse(row.session_ids || "[]"),
        centroidEmbedding: centroidBuf ? new Float32Array(centroidBuf.buffer, centroidBuf.byteOffset, centroidBuf.byteLength / 4) : void 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });
  }
  /**
   * Get a specific topic cluster
   */
  async getTopicCluster(clusterId) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare("SELECT * FROM topic_clusters WHERE id = ?").get(clusterId);
    if (!row) return null;
    const centroidBuf = row.centroid_embedding;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      keywords: JSON.parse(row.keywords || "[]"),
      sessionIds: JSON.parse(row.session_ids || "[]"),
      centroidEmbedding: centroidBuf ? new Float32Array(centroidBuf.buffer, centroidBuf.byteOffset, centroidBuf.byteLength / 4) : void 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  /**
   * Add a session to a topic cluster
   */
  async addSessionToCluster(clusterId, sessionId) {
    if (!this.db) throw new Error("Database not initialized");
    const cluster = await this.getTopicCluster(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    if (!cluster.sessionIds.includes(sessionId)) {
      cluster.sessionIds.push(sessionId);
      await this.upsertTopicCluster({
        ...cluster,
        sessionIds: cluster.sessionIds
      });
    }
  }
  /**
   * Find clusters for a session based on topics
   */
  async findClustersForSession(sessionId) {
    if (!this.db) throw new Error("Database not initialized");
    const session = await this.getSessionMetadata(sessionId);
    if (!session || session.topics.length === 0) return [];
    const clusters = await this.getTopicClusters(50);
    const matchingClusters = [];
    for (const cluster of clusters) {
      const hasMatch = session.topics.some(
        (topic) => cluster.keywords.some(
          (kw) => kw.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(kw.toLowerCase())
        )
      );
      if (hasMatch) {
        matchingClusters.push(cluster);
      }
    }
    return matchingClusters;
  }
  // ============================================
  // Context Effectiveness (AI Memory Phase 13.4)
  // ============================================
  /**
   * Track that context was loaded into a session
   */
  async trackContextLoaded(params) {
    if (!this.db) throw new Error("Database not initialized");
    const id = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO context_effectiveness (
        id, session_id, context_type, context_id, loaded_at, usage_count
      ) VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, params.sessionId, params.contextType, params.contextId, now);
    return id;
  }
  /**
   * Record feedback on whether context was useful
   */
  async recordContextFeedback(contextId, wasUseful) {
    if (!this.db) throw new Error("Database not initialized");
    const now = Date.now();
    this.db.prepare(`
      UPDATE context_effectiveness
      SET was_useful = ?, feedback_at = ?
      WHERE id = ?
    `).run(wasUseful ? 1 : 0, now, contextId);
  }
  /**
   * Increment usage count for context
   */
  async incrementContextUsage(contextId) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare(`
      UPDATE context_effectiveness
      SET usage_count = usage_count + 1
      WHERE id = ?
    `).run(contextId);
  }
  /**
   * Get context that was useful for similar sessions
   */
  async getEffectiveContext(options = {}) {
    if (!this.db) throw new Error("Database not initialized");
    let sql = `
      SELECT
        context_type,
        context_id,
        SUM(CASE WHEN was_useful = 1 THEN 1 ELSE 0 END) as useful_count,
        COUNT(*) as total_count,
        AVG(usage_count) as avg_usage
      FROM context_effectiveness
      WHERE was_useful IS NOT NULL
    `;
    const params = [];
    if (options.contextType) {
      sql += " AND context_type = ?";
      params.push(options.contextType);
    }
    sql += " GROUP BY context_type, context_id";
    sql += " HAVING CAST(useful_count AS REAL) / total_count >= ?";
    params.push(options.minUsefulRatio || 0.5);
    sql += " ORDER BY useful_count DESC";
    sql += " LIMIT ?";
    params.push(options.limit || 20);
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((row) => ({
      contextType: row.context_type,
      contextId: row.context_id,
      usefulCount: row.useful_count,
      totalCount: row.total_count,
      avgUsageCount: row.avg_usage
    }));
  }
  // ============================================
  // Summary Hierarchy (AI Memory Phase 13.5)
  // ============================================
  /**
   * Create or update a summary
   */
  async upsertSummary(params) {
    if (!this.db) throw new Error("Database not initialized");
    const id = params.id || `sum_${params.level}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO summary_hierarchy (
        id, level, project_slug, period_start, period_end,
        summary, key_topics, key_decisions, session_ids,
        parent_summary_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.level,
      params.projectSlug,
      params.periodStart,
      params.periodEnd,
      params.summary,
      JSON.stringify(params.keyTopics),
      JSON.stringify(params.keyDecisions),
      JSON.stringify(params.sessionIds),
      params.parentSummaryId || null,
      now,
      now
    );
    return id;
  }
  /**
   * Get summaries for a project at a specific level
   */
  async getSummaries(options) {
    if (!this.db) throw new Error("Database not initialized");
    let sql = "SELECT * FROM summary_hierarchy WHERE project_slug = ?";
    const params = [options.projectSlug];
    if (options.level) {
      sql += " AND level = ?";
      params.push(options.level);
    }
    if (options.periodStart) {
      sql += " AND period_start >= ?";
      params.push(options.periodStart);
    }
    if (options.periodEnd) {
      sql += " AND period_end <= ?";
      params.push(options.periodEnd);
    }
    sql += " ORDER BY period_start DESC";
    sql += " LIMIT ?";
    params.push(options.limit || 20);
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((row) => ({
      id: row.id,
      level: row.level,
      projectSlug: row.project_slug,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      summary: row.summary,
      keyTopics: JSON.parse(row.key_topics || "[]"),
      keyDecisions: JSON.parse(row.key_decisions || "[]"),
      sessionIds: JSON.parse(row.session_ids || "[]"),
      parentSummaryId: row.parent_summary_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  /**
   * Get the project timeline (summaries at all levels)
   */
  async getProjectTimeline(projectSlug, limit = 50) {
    const [project, months, weeks, days] = await Promise.all([
      this.getSummaries({ projectSlug, level: "project", limit: 1 }),
      this.getSummaries({ projectSlug, level: "month", limit: 12 }),
      this.getSummaries({ projectSlug, level: "week", limit }),
      this.getSummaries({ projectSlug, level: "day", limit })
    ]);
    return { project, months, weeks, days };
  }
  /**
   * Generate a daily summary from sessions
   */
  async generateDailySummary(projectSlug, date) {
    if (!this.db) throw new Error("Database not initialized");
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const rows = this.db.prepare(`
      SELECT * FROM session_metadata
      WHERE project_slug = ?
        AND first_message_at >= ?
        AND first_message_at <= ?
      ORDER BY first_message_at ASC
    `).all(projectSlug, startOfDay.getTime(), endOfDay.getTime());
    if (rows.length === 0) {
      return "";
    }
    const sessions = rows.map((row) => this.rowToSessionMetadata(row));
    const summaries = sessions.map((s) => s.summary).filter(Boolean);
    const allTopics = [...new Set(sessions.flatMap((s) => s.topics))];
    const allFiles = [...new Set(sessions.flatMap((s) => [...s.filesRead, ...s.filesWritten]))].slice(0, 10);
    const baseSummary = summaries.join("\n\n") || `${sessions.length} sessions on ${date.toDateString()}`;
    const filesNote = allFiles.length > 0 ? `

Files touched: ${allFiles.join(", ")}` : "";
    const summaryId = await this.upsertSummary({
      level: "day",
      projectSlug,
      periodStart: startOfDay.getTime(),
      periodEnd: endOfDay.getTime(),
      summary: baseSummary + filesNote,
      keyTopics: allTopics.slice(0, 10),
      keyDecisions: [],
      // Would need fact extraction to populate
      sessionIds: sessions.map((s) => s.sessionId)
    });
    return summaryId;
  }
  // ============================================
  // AI-to-AI Chat (Supervised Inter-AI Messaging)
  // ============================================
  /**
   * Post a message to an AI chat session
   */
  async postChatMessage(msg) {
    if (!this.db) throw new Error("Database not initialized");
    const id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO ai_chat_messages (
        id, session_id, sender, content, metadata, created_at, archived_at, secret_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      msg.sessionId,
      msg.sender,
      msg.content,
      msg.metadata ? JSON.stringify(msg.metadata) : null,
      now,
      msg.archivedAt || null,
      msg.secretAddress || null
    );
    return {
      id,
      sessionId: msg.sessionId,
      sender: msg.sender,
      content: msg.content,
      metadata: msg.metadata,
      createdAt: now,
      archivedAt: msg.archivedAt,
      secretAddress: msg.secretAddress
    };
  }
  mapChatRow(row) {
    return {
      id: row.id,
      sessionId: row.session_id,
      sender: row.sender,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : void 0,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
      secretAddress: row.secret_address
    };
  }
  /**
   * Read messages from a chat session.
   *
   * IMPORTANT: when `since` is NOT provided the default is TAIL — the newest
   * `limit` messages (returned in chronological order), like a chat client. The
   * old behavior returned the OLDEST messages, which made "any reply yet?" show
   * ancient history. For the "what's new for me?" flow prefer catchupChat().
   *
   * Timestamps are UNIX MILLISECONDS (Date.now()), not seconds.
   */
  async getChatMessages(sessionId, options = {}) {
    if (!this.db) throw new Error("Database not initialized");
    const conditions = ["session_id = ?"];
    const params = [sessionId];
    if (options.since != null) {
      conditions.push("created_at > ?");
      params.push(options.since);
    }
    if (options.until != null) {
      conditions.push("created_at <= ?");
      params.push(options.until);
    }
    if (options.sender) {
      conditions.push("sender = ?");
      params.push(options.sender);
    }
    if (options.notSender) {
      conditions.push("sender != ?");
      params.push(options.notSender);
    }
    const limit = options.limit || 50;
    const where = conditions.join(" AND ");
    const useTail = options.tail ?? options.since == null;
    let rows;
    if (useTail) {
      rows = this.db.prepare(`
        SELECT * FROM (
          SELECT * FROM ai_chat_messages
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT ?
        ) ORDER BY created_at ASC
      `).all(...params, limit);
    } else {
      rows = this.db.prepare(`
        SELECT * FROM ai_chat_messages
        WHERE ${where}
        ORDER BY created_at ASC
        LIMIT ?
      `).all(...params, limit);
    }
    return rows.map((row) => this.mapChatRow(row));
  }
  // ---- Per-reader read cursors (mailbox model) ----
  /** Get a reader's cursor (last_seen_at ms) for a session; 0 if never read. */
  getChatCursor(sessionId, reader) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare(
      "SELECT last_seen_at FROM ai_chat_cursors WHERE session_id = ? AND reader = ?"
    ).get(sessionId, reader);
    return row ? row.last_seen_at : 0;
  }
  /** Set a reader's cursor. Never moves backwards. Returns the effective cursor. */
  setChatCursor(sessionId, reader, lastSeenAt) {
    if (!this.db) throw new Error("Database not initialized");
    const current = this.getChatCursor(sessionId, reader);
    const next = Math.max(current, lastSeenAt);
    this.db.prepare(`
      INSERT INTO ai_chat_cursors (session_id, reader, last_seen_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, reader) DO UPDATE SET last_seen_at = ?, updated_at = ?
    `).run(sessionId, reader, next, Date.now(), next, Date.now());
    return next;
  }
  /** Count unread (from others) for a reader in a session. */
  getChatUnreadCount(sessionId, reader) {
    if (!this.db) throw new Error("Database not initialized");
    const cursor = this.getChatCursor(sessionId, reader);
    const row = this.db.prepare(
      "SELECT COUNT(*) as n FROM ai_chat_messages WHERE session_id = ? AND created_at > ? AND sender != ?"
    ).get(sessionId, cursor, reader);
    return row.n;
  }
  /**
   * Catch up: return the messages a reader has NOT yet seen (from others),
   * oldest-first, bounded by a character budget so a large backlog never blows
   * the context window. Advances the reader's cursor over exactly what is
   * returned, so repeated calls page forward through the backlog without
   * re-reading. This moves a pointer only — messages are never modified.
   */
  async catchupChat(sessionId, reader, options = {}) {
    if (!this.db) throw new Error("Database not initialized");
    const budgetChars = options.budgetChars ?? 8e3;
    const maxPerMessage = options.maxPerMessage ?? 4e3;
    const startCursor = this.getChatCursor(sessionId, reader);
    const conditions = ["session_id = ?", "created_at > ?"];
    const params = [sessionId, startCursor];
    if (!options.includeSelf) {
      conditions.push("sender != ?");
      params.push(reader);
    }
    const rows = this.db.prepare(`
      SELECT * FROM ai_chat_messages
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at ASC
    `).all(...params);
    const totalUnread = rows.length;
    const out2 = [];
    let usedChars = 0;
    let truncatedMessages = 0;
    let lastDeliveredAt = startCursor;
    for (const row of rows) {
      const msg = this.mapChatRow(row);
      if (out2.length > 0 && usedChars + msg.content.length > budgetChars) break;
      if (msg.content.length > maxPerMessage) {
        const full = msg.content.length;
        msg.content = msg.content.slice(0, maxPerMessage) + `

\u2026[truncated \u2014 ${full} chars total; full message id=${msg.id}]`;
        truncatedMessages++;
      }
      out2.push(msg);
      usedChars += msg.content.length;
      lastDeliveredAt = row.created_at;
    }
    let cursor = startCursor;
    if (!options.peek && out2.length > 0) {
      cursor = this.setChatCursor(sessionId, reader, lastDeliveredAt);
    }
    return {
      messages: out2,
      delivered: out2.length,
      remaining: totalUnread - out2.length,
      truncatedMessages,
      cursor,
      reader
    };
  }
  /**
   * Acknowledge (mark read) up to a point without returning content.
   * If `upTo` is omitted, marks the entire session read for this reader.
   */
  async ackChat(sessionId, reader, upTo) {
    if (!this.db) throw new Error("Database not initialized");
    let target = upTo;
    if (target == null) {
      const row = this.db.prepare(
        "SELECT MAX(created_at) as m FROM ai_chat_messages WHERE session_id = ?"
      ).get(sessionId);
      target = row.m ?? this.getChatCursor(sessionId, reader);
    }
    const cursor = this.setChatCursor(sessionId, reader, target);
    return { cursor, reader };
  }
  /**
   * List active chat sessions
   */
  async listChatSessions(limit = 20) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(`
      SELECT
        session_id,
        COUNT(*) as msg_count,
        GROUP_CONCAT(DISTINCT sender) as participants,
        MAX(created_at) as last_at,
        MIN(created_at) as first_at
      FROM ai_chat_messages
      GROUP BY session_id
      ORDER BY last_at DESC
      LIMIT ?
    `).all(limit);
    const sessions = rows.map((row) => {
      const sessionId = row.session_id;
      const lastMsgRow = this.db.prepare(`
        SELECT content FROM ai_chat_messages
        WHERE session_id = ? ORDER BY created_at DESC LIMIT 1
      `).get(sessionId);
      const lastMessage = lastMsgRow ? lastMsgRow.content.slice(0, 100) : "";
      return {
        sessionId,
        messageCount: row.msg_count,
        participants: row.participants.split(","),
        lastMessageAt: row.last_at,
        firstMessageAt: row.first_at,
        lastMessage
      };
    });
    return sessions;
  }
  /**
   * Mark a chat session as archived (update all messages)
   */
  async markChatArchived(sessionId, secretAddress) {
    if (!this.db) throw new Error("Database not initialized");
    const now = Date.now();
    const info = this.db.prepare(`
      UPDATE ai_chat_messages
      SET archived_at = ?, secret_address = ?
      WHERE session_id = ? AND archived_at IS NULL
    `).run(now, secretAddress, sessionId);
    return info.changes;
  }
  // ============================================
  // AUTO-CAPTURE PHASE 3: Observation & Digest Queries
  // ============================================
  /**
   * Get observations for a session (from session_observations table)
   */
  async getSessionObservations(sessionId, options) {
    if (!this.db) throw new Error("Database not initialized");
    let sql = "SELECT * FROM session_observations WHERE session_id = ?";
    const params = [sessionId];
    if (options?.type) {
      sql += " AND type = ?";
      params.push(options.type);
    }
    sql += " ORDER BY timestamp ASC";
    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      archiveId: row.archive_id,
      timestamp: row.timestamp,
      type: row.type,
      tool: row.tool,
      target: row.target,
      summary: row.summary,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));
  }
  /**
   * Get digest for an archive
   */
  async getArchiveDigest(archiveId) {
    if (!this.db) throw new Error("Database not initialized");
    const row = this.db.prepare(
      "SELECT digest, digest_model, digest_version, observation_count, auto_captured FROM archives WHERE id = ?"
    ).get(archiveId);
    if (!row) return null;
    return {
      digest: row.digest ? JSON.parse(row.digest) : null,
      digestModel: row.digest_model,
      digestVersion: row.digest_version,
      observationCount: row.observation_count || 0,
      autoCapture: row.auto_captured === 1
    };
  }
  /**
   * Update digest for an archive (for compression/recompression)
   */
  async updateArchiveDigest(archiveId, digest, model, version) {
    if (!this.db) throw new Error("Database not initialized");
    this.db.prepare(
      "UPDATE archives SET digest = ?, digest_model = ?, digest_version = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(digest), model, version, Date.now(), archiveId);
  }
  /**
   * Get observations for an archive (by archive_id in session_observations)
   */
  async getArchiveObservations(archiveId) {
    if (!this.db) throw new Error("Database not initialized");
    const rows = this.db.prepare(
      "SELECT * FROM session_observations WHERE archive_id = ? ORDER BY timestamp ASC"
    ).all(archiveId);
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      type: row.type,
      tool: row.tool,
      target: row.target,
      summary: row.summary
    }));
  }
};
function extractSubDirectory(filePaths, baseProjectPath) {
  if (!filePaths || filePaths.length === 0) {
    console.log("[extractSubDirectory] No file paths provided");
    return null;
  }
  console.log(`[extractSubDirectory] Processing ${filePaths.length} file paths`);
  if (filePaths.length > 0) {
    console.log(`[extractSubDirectory] Sample paths: ${filePaths.slice(0, 3).join(", ")}`);
  }
  const baseMarkers = ["claud project", "claude project", "claud-project"];
  const subdirCounts = /* @__PURE__ */ new Map();
  for (const filePath of filePaths) {
    if (filePath.includes("\\Temp\\") || filePath.includes("/Temp/") || filePath.includes("node_modules") || filePath.includes(".claude")) {
      continue;
    }
    const normalizedPath = filePath.replace(/\\/g, "/");
    let baseIndex = -1;
    for (const marker of baseMarkers) {
      const idx = normalizedPath.toLowerCase().indexOf(marker.toLowerCase());
      if (idx !== -1) {
        baseIndex = idx + marker.length;
        break;
      }
    }
    if (baseIndex === -1) continue;
    const afterBase = normalizedPath.substring(baseIndex);
    const parts = afterBase.split("/").filter((p) => p.length > 0);
    if (parts.length > 0) {
      const subdir = parts[0];
      if (!subdir.includes(".")) {
        subdirCounts.set(subdir, (subdirCounts.get(subdir) || 0) + 1);
      }
    }
  }
  if (subdirCounts.size === 0) {
    console.log("[extractSubDirectory] No subdirectories detected - no paths matched base markers");
    return null;
  }
  console.log(`[extractSubDirectory] Detected subdirs: ${JSON.stringify([...subdirCounts.entries()])}`);
  let maxCount = 0;
  let mostCommon = null;
  for (const [subdir, count] of subdirCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = subdir;
    }
  }
  console.log(`[extractSubDirectory] Selected: ${mostCommon} (${maxCount} occurrences)`);
  return mostCommon;
}

// src/search.ts
import * as path2 from "path";
var SearchIndex = class {
  constructor(archiveDb, dataDir, v6) {
    this.archiveDb = archiveDb;
    this.v6 = v6;
    this.db = new Database(path2.join(dataDir, "search.db"));
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
    const out2 = [];
    for (const r of rows) {
      let ids = [];
      try {
        ids = JSON.parse(r.session_ids);
      } catch {
      }
      const m = /^sum_session_.+?__(.+)__\d+$/.exec(r.id);
      for (const sid of ids) {
        if (sessionId && sid !== sessionId) continue;
        out2.push({ sessionId: sid, model: m ? decodeURIComponent(m[1]) : "unknown", createdAt: r.created_at, text: r.summary, sourceMessages: 0 });
      }
    }
    return out2;
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
  return process.env.ROOTZ_ARCHIVE_DIR || path3.join(process.env.APPDATA || process.env.HOME || os2.homedir(), ".rootz-desktop");
}
function claudeProjectsDir() {
  return path3.join(process.env.USERPROFILE || process.env.HOME || os2.homedir(), ".claude", "projects");
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
      const jsonl = fs2.readFileSync(live, "utf-8");
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
  if (!fs2.existsSync(root)) return null;
  for (const dir of fs2.readdirSync(root)) {
    const candidate = path3.join(root, dir, `${sessionId}.jsonl`);
    if (fs2.existsSync(candidate)) return candidate;
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
  const out2 = [];
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
    out2.push({ role: msg.role === "user" ? "human" : msg.role || String(entry.type), content: text, timestamp: ts });
  }
  return out2;
}

// src/licence.ts
import * as fs3 from "fs";
import * as os3 from "os";
import * as path4 from "path";
var LICENCE_VERSION = "1.1";
var LICENCE_URL = "https://github.com/rootz-global/rootz-archive/blob/main/LICENSE.md";
var file = () => path4.join(process.env.ROOTZ_ARCHIVE_HOME || path4.join(os3.homedir(), ".rootz-archive"), "licence-accepted.json");
function acceptance() {
  try {
    const a = JSON.parse(fs3.readFileSync(file(), "utf-8"));
    return a.version === LICENCE_VERSION ? a : null;
  } catch {
    return null;
  }
}
var NOT_ACCEPTED_MESSAGE = `Rootz Archive is installed but NOT archiving yet. To start, read the licence (${LICENCE_URL}) and type /rootz-archive:accept to accept it.`;

// src/launcher.ts
import * as fs4 from "fs";
import * as os4 from "os";
import * as path5 from "path";
import { pathToFileURL } from "url";
var launcherPath = () => path5.join(process.env.ROOTZ_ARCHIVE_HOME || path5.join(os4.homedir(), ".rootz-archive"), "bin", "archive-free-mcp.mjs");
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
  if (!fs4.existsSync(serverPath)) return null;
  const file2 = launcherPath();
  const src = launcherSource(serverPath, version);
  try {
    if (fs4.readFileSync(file2, "utf-8") === src) return file2;
  } catch {
  }
  fs4.mkdirSync(path5.dirname(file2), { recursive: true });
  const tmp = `${file2}.tmp-${process.pid}`;
  fs4.writeFileSync(tmp, src, { mode: 493 });
  fs4.renameSync(tmp, file2);
  return file2;
}

// src/archive-cli.ts
import { fileURLToPath } from "url";

// src/version.ts
var SERVER_VERSION = "0.4.2";
var MIN_NODE = "22.13";
function nodeOk(v = process.versions.node) {
  const [maj, min] = v.split(".").map(Number);
  return maj > 22 || maj === 22 && min >= 13;
}
var NODE_TOO_OLD_MESSAGE = (v = process.versions.node) => `Rootz Archive needs Node.js ${MIN_NODE} or newer (this computer has ${v}). Your conversations are NOT being archived. Install a current Node.js from https://nodejs.org, then start a new Claude Code session.`;

// src/vault.ts
import * as crypto2 from "crypto";
import * as fs5 from "fs";
import * as os5 from "os";
import * as path6 from "path";
import * as zlib2 from "zlib";
var MANIFEST_VERSION = 1;
function defaultVaultDir() {
  return process.env.ROOTZ_VAULT_DIR || path6.join(os5.homedir(), ".rootz-archive", "vault");
}
function claudeCodeSource(home = os5.homedir()) {
  return {
    name: "claude-code",
    root: path6.join(home, ".claude"),
    classify: (rel) => {
      const r = rel.split(path6.sep).join("/");
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
var sha = (b) => crypto2.createHash("sha256").update(b).digest("hex");
function* walk(dir) {
  let entries;
  try {
    entries = fs5.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path6.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}
function blobPath(vault2, hash) {
  return path6.join(vault2, "blobs", hash.slice(0, 2), hash);
}
function putBlob(vault2, bytes) {
  const h = sha(bytes);
  const p = blobPath(vault2, h);
  if (!fs5.existsSync(p)) {
    fs5.mkdirSync(path6.dirname(p), { recursive: true });
    const tmp = `${p}.tmp-${process.pid}`;
    fs5.writeFileSync(tmp, zlib2.gzipSync(bytes));
    fs5.renameSync(tmp, p);
  }
  return h;
}
function readBlob(vault2, hash) {
  return zlib2.gunzipSync(fs5.readFileSync(blobPath(vault2, hash)));
}
function readManifest(vault2) {
  const p = path6.join(vault2, "manifest.jsonl");
  if (!fs5.existsSync(p)) return [];
  return fs5.readFileSync(p, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
function loadState(vault2) {
  const p = path6.join(vault2, "state.json");
  try {
    return JSON.parse(fs5.readFileSync(p, "utf-8"));
  } catch {
  }
  const s = {};
  for (const r of readManifest(vault2)) s[`${r.source}:${r.path}`] = { sha256: r.sha256, size: r.size, mtimeMs: r.mtimeMs };
  return s;
}
function snapshot(sources, vault2 = defaultVaultDir(), now = () => /* @__PURE__ */ new Date()) {
  fs5.mkdirSync(vault2, { recursive: true });
  const lockPath = path6.join(vault2, ".lock");
  let lock;
  try {
    lock = fs5.openSync(lockPath, "wx");
  } catch {
    const age = Date.now() - fs5.statSync(lockPath).mtimeMs;
    if (age < 30 * 6e4) return { scanned: 0, captured: 0, appended: 0, whole: 0, unchanged: 0, bytesStored: 0, errors: ["another snapshot is running"] };
    fs5.rmSync(lockPath);
    lock = fs5.openSync(lockPath, "wx");
  }
  const res = { scanned: 0, captured: 0, appended: 0, whole: 0, unchanged: 0, bytesStored: 0, errors: [] };
  const state = loadState(vault2);
  const manifest = fs5.openSync(path6.join(vault2, "manifest.jsonl"), "a");
  try {
    for (const src of sources) {
      for (const abs of walk(src.root)) {
        const rel = path6.relative(src.root, abs);
        const kind = src.classify(rel);
        if (!kind) continue;
        res.scanned++;
        try {
          const st = fs5.statSync(abs);
          const key = `${src.name}:${rel}`;
          const prev = state[key];
          if (prev && prev.size === st.size && prev.mtimeMs === Math.floor(st.mtimeMs)) {
            res.unchanged++;
            continue;
          }
          const bytes = fs5.readFileSync(abs);
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
            blob = putBlob(vault2, bytes.subarray(prev.size));
            base = prev.sha256;
            baseSize = prev.size;
            res.appended++;
            res.bytesStored += bytes.length - prev.size;
          } else {
            blob = putBlob(vault2, bytes);
            res.whole++;
            res.bytesStored += bytes.length;
          }
          const rec = {
            v: MANIFEST_VERSION,
            scheme: "rootz-archive-vault/1",
            capturedAt: now().toISOString(),
            host: os5.hostname(),
            source: src.name,
            kind,
            path: rel.split(path6.sep).join("/"),
            size: bytes.length,
            mtimeMs: Math.floor(st.mtimeMs),
            sha256: full,
            blob,
            base,
            baseSize
          };
          fs5.writeSync(manifest, JSON.stringify(rec) + "\n");
          state[key] = { sha256: full, size: bytes.length, mtimeMs: rec.mtimeMs };
          res.captured++;
        } catch (e) {
          res.errors.push(`${rel}: ${e.message}`);
        }
      }
    }
  } finally {
    fs5.closeSync(manifest);
    fs5.writeFileSync(path6.join(vault2, "state.json.tmp"), JSON.stringify(state));
    fs5.renameSync(path6.join(vault2, "state.json.tmp"), path6.join(vault2, "state.json"));
    fs5.closeSync(lock);
    fs5.rmSync(lockPath, { force: true });
  }
  return res;
}
function reconstruct(vault2, rec, bySha) {
  const parts = [];
  let r = rec;
  for (let guard = 0; r; guard++) {
    if (guard > 1e5) throw new Error("tail chain too long or cyclic");
    parts.unshift(readBlob(vault2, r.blob));
    if (!r.base) break;
    const next = bySha.get(r.base);
    if (!next) throw new Error(`missing base version ${r.base}`);
    if (next.size !== r.baseSize) throw new Error(`base size mismatch for ${r.path}`);
    r = next;
  }
  return Buffer.concat(parts);
}
function verify(vault2 = defaultVaultDir()) {
  const recs = readManifest(vault2);
  const bySha = /* @__PURE__ */ new Map();
  for (const r of recs) bySha.set(r.sha256, r);
  const out2 = { records: recs.length, ok: 0, failures: [] };
  for (const r of recs) {
    try {
      const bytes = reconstruct(vault2, r, bySha);
      if (bytes.length !== r.size) throw new Error(`size ${bytes.length} != recorded ${r.size}`);
      if (sha(bytes) !== r.sha256) throw new Error("sha256 mismatch");
      out2.ok++;
    } catch (e) {
      out2.failures.push({ path: r.path, sha256: r.sha256, error: e.message });
    }
  }
  return out2;
}
function writeHeartbeat(vault2, r, at = /* @__PURE__ */ new Date()) {
  const hb = { at: at.toISOString(), captured: r.captured, errors: r.errors.slice(0, 5) };
  fs5.writeFileSync(path6.join(vault2, "heartbeat.json"), JSON.stringify(hb));
}
function writeVerifyMark(vault2, r, at = /* @__PURE__ */ new Date()) {
  const m = { at: at.toISOString(), records: r.records, ok: r.ok, failures: r.failures.length };
  fs5.writeFileSync(path6.join(vault2, "last-verify.json"), JSON.stringify(m));
}
var readJson = (p) => {
  try {
    return JSON.parse(fs5.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
};
var ago = (ms) => ms < 9e4 ? "just now" : ms < 90 * 6e4 ? `${Math.round(ms / 6e4)} min ago` : ms < 48 * 36e5 ? `${Math.round(ms / 36e5)} hours ago` : `${Math.round(ms / 864e5)} days ago`;
function health(vault2 = defaultVaultDir(), now = Date.now(), staleAfterMs = 30 * 6e4) {
  const details = [];
  const hb = readJson(path6.join(vault2, "heartbeat.json"));
  const vm = readJson(path6.join(vault2, "last-verify.json"));
  const recs = fs5.existsSync(path6.join(vault2, "manifest.jsonl")) ? readManifest(vault2) : [];
  const conversations = new Set(recs.filter((r) => r.kind === "transcript" || r.kind === "subagent-transcript").map((r) => r.path)).size;
  const files = new Set(recs.filter((r) => r.kind === "file-history").map((r) => r.path)).size;
  if (!hb) return { state: "amber", headline: "Archive has not run yet on this computer.", details: [`Vault: ${vault2}`] };
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

// src/archive-cli.ts
for (const k of ["log", "info", "warn", "debug"]) console[k] = (...a) => console.error(...a);
var out = (line) => process.stdout.write(line + "\n");
var cmd = process.argv[2];
var vault = defaultVaultDir();
var isHook = process.argv.includes("--hook");
async function capture() {
  const r = snapshot([claudeCodeSource()], vault);
  if (r.errors.includes("another snapshot is running")) return { skipped: true };
  const archive = await LocalArchive.open(defaultDataDir());
  try {
    const idx = await archive.db.indexLocalSessions({ limit: 1e5 });
    const s = archive.search.sync();
    writeHeartbeat(vault, r);
    const vm = (() => {
      try {
        return JSON.parse(fs6.readFileSync(path7.join(vault, "last-verify.json"), "utf-8"));
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
  if (cmd === "session-start") {
    try {
      refreshLauncher(path7.join(path7.dirname(fileURLToPath(import.meta.url)), "server.mjs"), SERVER_VERSION);
    } catch {
    }
  }
  if (!acceptance() && (cmd === "capture" || cmd === "snapshot" || cmd === "session-start")) {
    if (cmd === "session-start") out(JSON.stringify({ systemMessage: `\u{1F7E0} ${NOT_ACCEPTED_MESSAGE}` }));
    return;
  }
  switch (cmd) {
    case "capture": {
      const r = await capture();
      if (!isHook) process.stdout.write(JSON.stringify(r) + "\n");
      return;
    }
    case "snapshot": {
      const r = snapshot([claudeCodeSource()], vault);
      if (!r.errors.includes("another snapshot is running")) writeHeartbeat(vault, r);
      return;
    }
    case "session-start": {
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
    default:
      process.stderr.write("usage: archive.mjs capture | snapshot | session-start | health | verify | search <q> | transcript <id>\n");
      process.exitCode = 2;
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
