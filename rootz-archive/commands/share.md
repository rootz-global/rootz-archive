---
description: Share this project's latest conversation with a capture receipt (a folder on this computer)
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/archive.mjs" share --here)
---
!`node "${CLAUDE_PLUGIN_ROOT}/dist/archive.mjs" share --here`

Tell the user, in plain sentences, what the lines above say: where the share folder is, that they send the whole folder,
and that the recipient checks it at receipts.rootz.global/verify in their browser with nothing uploaded. Then show them
EVERY item of the "BEFORE YOU SEND IT" list, as a short list, possible secrets first: the shared file holds context they
never saw in the chat (instruction and memory files, hook output, tool results, the system prompt), and nothing can be
removed without breaking the receipt. If any of it should stay private, they should not send the share. To share a
different conversation, they can ask you to find it and use the share_session tool. Do not mention technical terms
like vault, manifest, MCP, Merkle or checkpoint.
