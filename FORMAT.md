# Rootz Archive: storage format

Everything Rootz Archive keeps is ordinary files in open formats. You can read, copy, move or delete them without the
Software.

## 1. Exact copies: `~/.rootz-archive/vault/`
| Path | Format |
|---|---|
| `blobs/<ab>/<sha256>` | **gzip** of raw file bytes. The name is the SHA-256 (hex) of the *uncompressed* bytes. |
| `manifest.jsonl` | **JSON Lines**, one record per captured version of a file, append-only. |
| `state.json` | Cache of the last version per file. It can be rebuilt from the manifest. |
| `heartbeat.json`, `last-verify.json` | Status of the last capture and the last integrity check. |

A manifest record (`scheme: "rootz-archive-vault/1"`):
```json
{"v":1,"scheme":"rootz-archive-vault/1","capturedAt":"2026-10-06T13:04:00.182Z","host":"my-mac",
 "source":"claude-code","kind":"transcript","path":"projects/<project>/<session>.jsonl",
 "size":12345,"mtimeMs":1791292040000,"sha256":"<sha256 of the full file at this version>",
 "blob":"<sha256 of the stored bytes>","base":null,"baseSize":0}
```
- `kind` is one of: `transcript`, `subagent-transcript`, `tool-result`, `memory`, `file-history`, `prompt-history`,
  `other`.
- If `base` is null, `blob` holds the whole file.
- If `base` is set, the file grew: `blob` holds only the bytes appended after the version whose `sha256` equals
  `base`, which was `baseSize` bytes long. To rebuild a version, concatenate the blobs along the `base` chain.
- **Integrity check:** rebuild the version, then confirm its length equals `size` and its SHA-256 equals `sha256`.

`path` is relative to `~/.claude` (the Claude Code folder). Settings, credentials and caches are never captured.

## 2. Search index: `~/.rootz-desktop/`
| File | Format |
|---|---|
| `archives.db` | **SQLite**, the Rootz archive database. **Shared with Rootz Desktop** if you install it. |
| `search.db` | **SQLite** FTS5 full-text index. It can be deleted, and is rebuilt from `archives.db`. |

## 3. Licence acceptance: `~/.rootz-archive/licence-accepted.json`, `licence-acceptances.jsonl`
The version you accepted, with the time and the computer name.

## 4. Your settings: `~/.rootz-archive/settings.json`
`{"paused": false, "excludeProjects": ["-Users-you-code-private-repo"]}`. Change these with `/rootz-archive:pause`,
`/rootz-archive:resume`, `/rootz-archive:exclude-project` and `/rootz-archive:include-project`.

## Deleting your archive
1. `claude plugin uninstall rootz-archive`. Do this first, or the next session will capture again.
2. Delete `~/.rootz-archive/`.
3. Delete `~/.rootz-desktop/search.db`. **Delete `~/.rootz-desktop/archives.db` only if you do not use Rootz Desktop**,
   because Desktop uses the same file.

Rootz Archive never deletes anything itself. Deleting is always your choice.
