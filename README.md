# Rootz Archive

**Archive keeps an exact copy of every Claude Code conversation, and every file Claude edits, on your own computer,
so your AI can search everything you've worked on together.**

**Free for individual users.** No account. The plugin makes no network connections.

Website: https://archive.rootz.global · 2-minute video: https://www.youtube.com/watch?v=jvaAA72Ubjk

## Install

**Use is subject to the [Rootz Archive Use Licence](LICENSE.md). By installing you accept it.**

**Needs:** Node.js 22.13 or newer. Check with `node -v`; install it from https://nodejs.org (any OS) or with
`brew install node` (macOS). Nothing else to install. Without it, Rootz Archive tells you at session start that it
isn't archiving.

```
claude plugin marketplace add rootz-global/rootz-archive
claude plugin install rootz-archive@rootz
```

Start a new Claude Code session, then type **`/rootz-archive:accept`** to accept the licence. Rootz Archive doesn't
capture anything until you do. After that, each session opens with a one-line status, for example:

> 🟢 Rootz Archive (this computer): Captured · last capture 2 min ago · 327 conversations and 1,409 AI-edited files
> captured

Tested on macOS; Windows and Linux are in testing. Please [open an issue](https://github.com/rootz-global/rootz-archive/issues)
if anything breaks.

**Windows:** if `claude plugin marketplace add` fails with `EBUSY: resource busy or locked`, install from a local clone
instead. Run `git clone https://github.com/rootz-global/rootz-archive C:\rootz-plugins\rootz-archive`, then
`claude plugin marketplace add C:\rootz-plugins\rootz-archive`, then `claude plugin install rootz-archive@rootz`.
To update later, run `git pull` in that folder.

## Claude Desktop (search only)

Download `rootz-archive-<version>.mcpb` from the [latest release](https://github.com/rootz-global/rootz-archive/releases/latest)
and open it with Claude Desktop. It is also on the Official MCP Registry as `global.rootz/archive`. To start, open
Settings → Extensions → Rootz Archive and tick **"I accept the Rootz Archive Use Licence"**. Desktop searches your
archive. Continuous, exact-copy capture needs the Claude Code plugin above.

## Use it

Just ask Claude:
- "What did we decide about the login flow last month?"
- "Find the session where we fixed the upload bug."
- "Is Rootz Archive working?"

Or type `/rootz-archive:archive` for a summary of what's captured.

Your AI can also **summarise past sessions with your own Claude account** and add the summaries to the search. Ask
"summarise my five longest unsummarised sessions". Archive never holds an AI key, and summaries never replace the
original conversation.

## What it keeps, and where

| What | Where (Windows in brackets) |
|---|---|
| Exact, byte-for-byte copies of every conversation (including the part before Claude compacts it), sub-agent conversations, and every file Claude edited | `~/.rootz-archive/vault` (`%USERPROFILE%\.rootz-archive\vault`). Rootz Archive never deletes anything itself, and re-checks every copy against its fingerprint daily. Only you can read it: folders 0700, files 0600. |
| The searchable archive | `~/.rootz-desktop/archives.db` (`%APPDATA%\.rootz-desktop\archives.db`) |

It never copies your settings, credentials or caches. The file formats are open and described in
[FORMAT.md](FORMAT.md).

Every answer from Rootz Archive ends with **"Source: Rootz Archive · this computer"**, so you always know which archive
answered.

## Your archive, your backups

- **Where your archive goes:** Rootz Archive sends nothing to Rootz. When you ask Claude to search or summarise your
  archive, what Claude reads goes to Anthropic, as with anything else you show Claude.
- **Uninstalling and deleting:** run `claude plugin uninstall rootz-archive` and `claude plugin marketplace remove rootz`.
  Your archive stays until you delete it, which you can do whenever you choose: see
  [FORMAT.md](FORMAT.md#deleting-your-archive). Uninstall first, or the next session will capture again.
- **Backups:** Rootz Archive is **not a backup service**. You are responsible for your own backups, including of the
  archive itself (licence §9).
- **Other people's data:** your conversations may contain other people's personal data or secrets you pasted in. The
  archive keeps its copy even if you later delete the original, and what you capture is your responsibility (licence
  §7).

## Upgrading

Rootz Archive is the archive from **Rootz Desktop**, packaged on its own. Installing Rootz Desktop later opens the same
archive with nothing to import, and adds anchoring, decentralised backup and connections for web AIs.

## Also from Rootz

**[Rootz Receipts](https://receipts.rootz.global)**: Archive keeps what happened; Receipts proves where an AI's output
came from. Every result carries a signed origin receipt that anyone can check, and when one AI's output becomes the
next one's input, the receipt goes with it.

---
Built from the Rootz V6 archive. See `PROVENANCE.txt` for the exact source commit and file fingerprints, and
`rootz-archive/THIRD_PARTY_NOTICES.txt` for open-source licences. Rootz is not affiliated with or endorsed by
Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic.
© 2026 Rootz Corp. Free for individual users, under the [Rootz Archive Use Licence](LICENSE.md).
