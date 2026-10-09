# Notes for directory reviewers

## Policy 1.F ("must not query or extract Claude's memory, chat history or summaries")

**Rootz Archive keeps the user's own record of their own work, for the user, on the user's computer. It never leaves
that computer.** (Rootz's position, 2026-10-09.)

- **It's the user's data, kept for the user, not for us.** The files Rootz Archive copies (`~/.claude/projects`,
  `file-history`, `memory`, `history.jsonl`) are files Claude Code has already written to **the user's own disk**,
  containing **the user's own sessions**. Rootz Archive keeps an exact copy of them, so the user's record survives
  Claude Code's default 30-day cleanup.
- **Nothing is extracted from the user's machine.** There's no network code (a build gate enforces it; see
  PRIVACY.md), no telemetry and no account. Rootz receives nothing.
- **Nothing happens without the user's explicit act.** Capture starts only after the user runs
  `/rootz-archive:accept`. The user can pause it, exclude projects, or delete everything at any time (README, FORMAT.md).
- **It's the user's choice to keep a record of their own work.** Preventing a user from recording their own sessions
  isn't in the user's interest. It's the same principle as keeping one's own notes, email or files.
- **Reading, when it happens, is the user's own AI reading the user's own archive, at the user's request**, through the
  declared MCP server, inside the user's own session. Every answer is labelled "Source: Rootz Archive · this computer".

## Other expected questions
- **Background capture process:** at session start, if the archive isn't up to date, the plugin starts one detached
  capture of its own (`node dist/archive.mjs capture`). It copies local files, takes a lock so only one runs at a time,
  and exits. It may finish after the session ends. It never starts another program and makes no network connections.
- **Shared database with Rootz Desktop:** `~/.rootz-desktop/archives.db` is the same file Rootz Desktop uses, by design,
  so a user who later installs Desktop keeps one archive. SQLite WAL mode allows both to use it safely.
- **The launcher file** (`~/.rootz-archive/bin/archive-free-mcp.mjs`) lets the user's other AI tools search the same
  archive. Uninstalling leaves the user's data and this launcher in place on purpose (data is never deleted for the
  user); README and FORMAT.md give the removal steps.
- **Secrets pasted into conversations** are copied as they are, because the archive is an exact record. The README and
  PRIVACY.md tell the user this, and how to delete a copy.
