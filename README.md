# Rootz Archive Free

**Archive keeps an exact copy of every Claude Code conversation, and every file Claude edits, on your own computer,
so your AI can search everything you've worked on together.**

Free. No account. The plugin makes no network connections.

## Install

**Use is subject to the [Rootz Archive Free Use Licence](LICENSE.md). By installing you accept it.**

```
claude plugin marketplace add rootz-global/rootz-archive
claude plugin install rootz-archive@rootz
```

Start a new Claude Code session, then type **`/rootz-archive:accept`** to accept the licence. Archive Free doesn't
capture anything until you do. After that, each session opens with a one-line status, for example:

> 🟢 Archive Free (this computer): Captured · last capture 2 min ago · 327 conversations and 1,409 AI-edited files
> captured

**Needs:** Node.js 22.13 or newer (`node -v`); install it from https://nodejs.org or with `brew install node`. Nothing
else to install. Without it, Archive Free tells you at session start that it isn't archiving.

**Windows:** if `claude plugin marketplace add` fails with `EBUSY: resource busy or locked`, install from a local clone
instead. Run `git clone https://github.com/rootz-global/rootz-archive C:\rootz-plugins\rootz-archive`, then
`claude plugin marketplace add C:\rootz-plugins\rootz-archive`, then `claude plugin install rootz-archive@rootz`.
To update later, run `git pull` in that folder.

## Use it

Just ask Claude:
- "What did we decide about the login flow last month?"
- "Find the session where we fixed the upload bug."
- "Is Archive Free working?"

Or type `/rootz-archive:archive` for a summary of what's captured.

Your AI can also **summarise past sessions with your own Claude account** and add the summaries to the search. Ask
"summarise my five longest unsummarised sessions". Archive never holds an AI key, and summaries never replace the
original conversation.

## What it keeps, and where

| What | Where |
|---|---|
| Exact, byte-for-byte copies of every conversation (including the part before Claude compacts it), sub-agent conversations, and every file Claude edited | `~/.rootz-archive/vault`. Archive Free never deletes anything itself, and re-checks every copy against its fingerprint daily. |
| The searchable archive | `~/.rootz-desktop/archives.db` |

It never copies your settings, credentials or caches. The file formats are open and described in
[FORMAT.md](FORMAT.md).

Every answer from Archive Free ends with **"Source: Archive Free · this computer"**, so you always know which archive
answered.

## Your archive, your backups

- **Where your archive goes:** Archive Free sends nothing to Rootz. When you ask Claude to search or summarise your
  archive, what Claude reads goes to Anthropic, as with anything else you show Claude.
- **Deleting:** you can delete your archive whenever you choose. See [FORMAT.md](FORMAT.md#deleting-your-archive).
  Uninstall first, or the next session will capture again.
- **Backups:** Archive Free is **not a backup service**. You are responsible for your own backups, including of the
  archive itself (licence §9).
- **Other people's data:** your conversations may contain other people's personal data or secrets you pasted in. The
  archive keeps its copy even if you later delete the original, and what you capture is your responsibility (licence
  §7).

## Upgrading

Archive Free is the archive from **Rootz Desktop**, packaged on its own. Installing Rootz Desktop later opens the same
archive with nothing to import, and adds anchoring, decentralised backup and connections for web AIs.

---
Built from the Rootz V6 archive. See `PROVENANCE.txt` for the exact source commit and file fingerprints, and
`rootz-archive/THIRD_PARTY_NOTICES.txt` for open-source licences. Rootz is not affiliated with or endorsed by
Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic.
© 2026 Rootz Corp. Use under the [Rootz Archive Free Use Licence](LICENSE.md).
