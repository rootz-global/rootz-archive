---
description: Open your Rootz Archive dashboard (a page on this computer)
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/archive.mjs" dashboard)
---
!`node "${CLAUDE_PLUGIN_ROOT}/dist/archive.mjs" dashboard`

Tell the user in one or two plain sentences what the line above says: where the dashboard file is, and that it opened
in their browser (or the exact message if it is not archiving yet). Mention it is a local page: generated on this
computer, nothing sent to Rootz. Do not mention technical terms like vault, manifest, MCP, or SQLite.
