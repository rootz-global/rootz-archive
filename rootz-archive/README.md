# Rootz Archive (Claude Code plugin)

Keeps an exact copy of every Claude Code conversation, and every file Claude edits, on your own computer, and lets
your AI search it. **Free for individual users**, under the [Rootz Archive Use Licence](LICENSE.md). Needs Node.js
22.13+.

## What this plugin runs, sends and stores
**In short: it runs locally, makes no network connections, and stores everything on your own computer.**

### Runs
- **Hooks (Claude Code):**
  - `SessionStart` prints a one-line status and keeps the stable launcher current.
  - `PreCompact` takes an exact-copy snapshot before Claude compacts.
  - `SessionEnd` captures and indexes.
  - Every hook runs `node dist/archive.mjs …`.
  - **Nothing is captured until you type `/rootz-archive:accept`.**
- **MCP server `archive-free`** (`node dist/server.mjs` plus its `dist/chunks/`, stdio; readable, unminified, every file ≤ 256 KiB): 13 tools: search, recall, summaries and
  status. None of them can accept the licence; only you can.
- **Commands:**
  - `/rootz-archive:accept` (the only way to start capture; it runs the plugin's own accept step);
  - `/rootz-archive:archive` (status);
  - `/rootz-archive:pause` and `/rootz-archive:resume`;
  - `/rootz-archive:exclude-project` and `/rootz-archive:include-project` (for the current folder's project).
- **Background capture:** at session start, if the archive isn't up to date, the plugin starts one capture of its own
  in the background (`node dist/archive.mjs capture`). It copies local files, never runs twice at once, and exits. It
  may finish after the session ends.

### Sends
**Nothing to Rootz.** The bundle contains no network client (a build gate checks this). When your AI calls a search
tool, the result goes to your AI provider as part of your conversation, as with anything else you show your AI.

### Stores (all on your computer)
- `~/.rootz-archive/vault/`: exact, byte-for-byte copies (gzip, named by SHA-256) of `~/.claude/projects/**`
  (transcripts, sub-agent transcripts, tool results, memory), `~/.claude/file-history/**` and `~/.claude/history.jsonl`.
  It never copies settings, credentials or caches. It never deletes anything itself.
- `~/.rootz-desktop/archives.db` + `search.db` (on Windows `%APPDATA%\.rootz-desktop\`): the searchable index
  (SQLite). This is shared with Rootz Desktop if you install it.
- `~/.rootz-archive/licence-accepted.json`: the licence version you accepted, and when.
- `~/.rootz-archive/bin/archive-free-mcp.mjs`: a launcher for using the archive from other AI tools.

Formats and deletion: [FORMAT.md](FORMAT.md). Privacy: [PRIVACY.md](PRIVACY.md). Open-source components: [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
Not affiliated with Anthropic.

## Try it
After `/rootz-archive:accept`, ask Claude:
1. "Is Rootz Archive working?"
2. "Search my archive for what we decided about the login flow."
3. "Show me the full transcript of yesterday's session on the payment bug."

**Trying it without your real history:** point it at a test folder first. Set `ROOTZ_ARCHIVE_HOME`, `ROOTZ_VAULT_DIR`
and `ROOTZ_ARCHIVE_DIR` to empty directories before starting Claude Code; the plugin then reads and writes only there
(your `~/.claude` transcripts are still the source).

## Troubleshooting
- **"NOT archiving yet":** type `/rootz-archive:accept`. Nothing is read or captured before that.
- **"could not start its status check" / "needs Node.js":** run `node --version`. Rootz Archive needs **22.13 or
  newer**; install it from https://nodejs.org (Windows, macOS and Linux installers), then start a new session.
- **Status 🟠 "Not captured for …":** start a new session (capture runs at session start and end), or check
  `/rootz-archive:pause` isn't on.
- **Status 🔴 "do not match their fingerprint":** a saved copy changed on disk. Run
  `node ~/.claude/plugins/cache/rootz/rootz-archive/<version>/dist/archive.mjs verify` to list them, and
  open an issue.
- **Search finds nothing:** new sessions are indexed when a session ends. Ask Claude to run `index_local_sessions` to
  index now.
