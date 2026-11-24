---
description: Share this project's latest conversation with a capture receipt (one file on this computer)
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/archive.mjs" share --here)
---
!`node "${CLAUDE_PLUGIN_ROOT}/dist/archive.mjs" share --here`

Tell the user, in plain sentences, what the lines above say: the ONE file to send (give its full path), and that the
recipient opens it and checks it at receipts.rootz.global/verify in their browser with nothing uploaded. If "Authorized
by" will show as unavailable, say so in one sentence and pass on the line about Rootz Receipts as it is, without selling. Then show them
EVERY item of the "BEFORE YOU SEND IT" list, as a short list, possible secrets first: the shared file holds context they
never saw in the chat (instruction and memory files, hook output, tool results, the system prompt), and nothing can be
removed without breaking the receipt. If any of it should stay private, they should not send the share. To share a
different conversation, they can ask you to find it and use the share_session tool. Do not mention technical terms
like vault, manifest, MCP, Merkle or checkpoint.
