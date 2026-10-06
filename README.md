# Rootz Archive Free

**Archive keeps an exact copy of every Claude Code conversation, and every file Claude edits, on your own computer,
so your AI can search everything you've worked on together.**

Free. No account. Nothing leaves your computer. Works offline.

## Install (two commands)

```
claude plugin marketplace add rootz-global/rootz-archive
claude plugin install rootz-archive@rootz
```

Then start a new Claude Code session. You'll see:

> 🟢 Archive Free is setting up: keeping an exact copy of your Claude Code conversations on this computer.

From then on, each session opens with a one-line status, for example:

> 🟢 Archive Free (this computer): Protected · last captured 2 min ago · 327 conversations and 1,409 AI-edited files protected

**Needs:** Node.js 22.13 or newer (`node -v`). Nothing else to install.

## Use it

Just ask Claude:
- "What did we decide about the login flow last month?"
- "Find the session where we fixed the upload bug."
- "Is Archive Free working?"

Or type `/rootz-archive:archive` for a summary of what's protected.

Your AI can also **summarise past sessions with your own Claude account** and add the summaries to the search. Ask
"summarise my five longest unsummarised sessions". Archive never holds an AI key; summaries never replace the
original conversation.

## What it keeps, and where

| What | Where |
|---|---|
| Exact, byte-for-byte copies of every conversation (including the part before Claude compacts it), sub-agent conversations, and every file Claude edited | `~/.rootz-archive/vault`. Nothing is ever deleted, and every copy is re-checked against its fingerprint daily. |
| The searchable archive | `~/.rootz-desktop/archives.db` |

It never copies your settings, credentials or caches.

Every answer from Archive Free ends with **"Source: Archive Free · this computer"**, so you always know which archive
answered.

## Upgrading

Archive Free is the archive from **Rootz Desktop**, packaged on its own. Installing Rootz Desktop later opens the same
archive with nothing to import, and adds anchoring, decentralised backup and connections for web AIs.

## Privacy

Everything stays on your computer. The plugin makes no network connections.

---
Built from the Rootz V6 archive. See `PROVENANCE.txt` for the exact source commit and file fingerprints, and
`rootz-archive/THIRD_PARTY_NOTICES.txt` for open-source licences.
© Rootz Corp.
