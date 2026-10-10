# Rootz Archive: Privacy Policy (Claude Code plugin)

Effective 9 October 2026. This policy covers the **Rootz Archive Claude Code plugin** and its MCP server. It does not
cover Rootz's websites or other products, which have their own policies.

## In short
Rootz Archive runs entirely on your computer. **It sends nothing to Rootz or anyone else. It has no telemetry, no
analytics, no accounts and no network connections.** Rootz receives none of your data.

## What it reads
Only after you accept the licence by typing `/rootz-archive:accept` (no AI can accept it for you), never in projects you
excluded or while capture is paused, and only these files that Claude Code itself writes on your
computer:
- `~/.claude/projects/**`: your Claude Code conversation transcripts (including sub-agent conversations), the tool
  results Claude Code saves, and Claude's memory notes;
- `~/.claude/file-history/**`: the copies Claude Code keeps of files it edits;
- `~/.claude/history.jsonl`: your Claude Code prompt history.

It never reads your Claude Code settings, credentials or caches.

These files can contain anything you or Claude wrote, **including personal data, other people's data, or secrets you
pasted into a conversation**. Rootz Archive copies them exactly as they are.

## What it stores (all on your computer)
- `~/.rootz-archive/vault/`: exact copies of the files above (gzip-compressed), each named by its SHA-256 fingerprint,
  plus a manifest recording, for each saved version: its path, size, fingerprint, capture time and **this computer's
  name**.
- `~/.rootz-desktop/archives.db` and `search.db` (on Windows `%APPDATA%\.rootz-desktop\`): a searchable index of your
  conversations. (If you use Rootz Desktop, it shares this file.)
- `~/.rootz-archive/licence-accepted.json` and `licence-acceptances.jsonl`: the licence version you accepted, when, and
  this computer's name.
- `~/.rootz-archive/vault/heartbeat.json`, `last-verify.json`, `state.json`: when it last captured and checked your
  archive, and which version of each file it last saved.
- `~/.rootz-archive/settings.json`: your pause setting and the projects you excluded.
- `~/.rootz-archive/bin/archive-free-mcp.mjs`: a small launcher so other AI tools on your computer can search the archive.
- `~/.rootz-archive/recall.jsonl`: each time your AI reads from the archive, the tool's name and the time. Never what
  was asked or what came back. It feeds the dashboard's Recall count.
- `~/.rootz-archive/dashboard.html`: your dashboard page, written only when you run `/rootz-archive:dashboard`. It is
  a plain file with no scripts and no links to the internet.

Folders are created owner-only (0700) and files owner-only (0600).

## What it sends
**Nothing.** The plugin makes no network connections; a build check refuses any release containing network code. It
starts no programs other than its own capture step (Node running the plugin's own `dist/archive.mjs`) and, only when
you run `/rootz-archive:dashboard`, your default browser to open the dashboard file. It downloads nothing.

**Background capture:** at session start, if the archive isn't up to date, the plugin starts one background capture of
its own (the same local copy step), which may finish after the session ends.

**One thing to know:** when **you or your AI** use Rootz Archive's search tools inside Claude Code (or another AI tool),
the results are shown to that AI as part of your conversation. Your AI provider (for example Anthropic) then
handles them under **your agreement with that provider**, as with anything else you show your AI.
Every tool answer ends with a source line that includes **this computer's name** (for example "Source: Rootz Archive ·
this computer (my-laptop)"), so that name is part of what your AI sees. Rootz is not involved in that exchange.

## What Rootz receives and retains
**Nothing.** Rootz operates no server for this plugin and receives no copies, metadata, usage statistics or crash
reports. Because Rootz receives nothing, Rootz retains nothing.

## How long your data is kept
Until **you** delete it. Rootz Archive never deletes anything by itself. You are responsible for your own backups
(licence §9).

## How to delete it
1. Uninstall the plugin: `claude plugin uninstall rootz-archive`. Do this first, or the next session will capture again.
2. Delete the folder `~/.rootz-archive/`.
3. Delete `~/.rootz-desktop/search.db`, and `~/.rootz-desktop/archives.db` **unless you use Rootz Desktop** (it shares
   that file).

Deleting a conversation in Claude Code does **not** remove Rootz Archive's copy. Delete the copy from the vault too if
you need it gone.

## Children
Rootz Archive is a developer tool and is not directed at children under 18.

## Changes and contact
If this policy changes, the new version ships with the plugin and is listed in its changelog.
Questions: https://github.com/rootz-global/rootz-archive/issues
