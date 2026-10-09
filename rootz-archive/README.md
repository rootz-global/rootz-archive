# Rootz Archive (Claude Code plugin)

Keeps an exact copy of every Claude Code conversation, and every file Claude edits, on your own computer, and lets
your AI search it. **Free for individual users**, under the [Rootz Archive Use Licence](LICENSE.md). Needs Node.js
22.13+.

## What this plugin runs
- **Hooks (Claude Code):**
  - `SessionStart` prints a one-line status and keeps the stable launcher current.
  - `PreCompact` takes an exact-copy snapshot before Claude compacts.
  - `SessionEnd` captures and indexes.
  - Every hook runs `node dist/archive.mjs …`.
  - **Nothing is captured until you type `/rootz-archive:accept`.**
- **MCP server `archive-free`** (`node dist/server.mjs`, stdio): 14 tools: search, recall, summaries, status, and
  licence acceptance.
- **Commands:** `/rootz-archive:accept`, `/rootz-archive:archive`.

## What it sends
**Nothing to Rootz.** The bundle contains no network client (a build gate checks this). When your AI calls a search
tool, the result goes to your AI provider as part of your conversation, as with anything else you show your AI.

## What it stores (all on your computer)
- `~/.rootz-archive/vault/`: exact, byte-for-byte copies (gzip, named by SHA-256) of `~/.claude/projects/**`
  (transcripts, sub-agent transcripts, tool results, memory), `~/.claude/file-history/**` and `~/.claude/history.jsonl`.
  It never copies settings, credentials or caches. It never deletes anything itself.
- `~/.rootz-desktop/archives.db` + `search.db`: the searchable index (SQLite). This is shared with Rootz Desktop if
  you install it.
- `~/.rootz-archive/licence-accepted.json`: the licence version you accepted, and when.
- `~/.rootz-archive/bin/archive-free-mcp.mjs`: a launcher for using the archive from other AI tools.

Formats and deletion: [FORMAT.md](FORMAT.md). Open-source components: [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
Not affiliated with Anthropic.
