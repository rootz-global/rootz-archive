---
description: Accept the Rootz Archive use licence and start archiving
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/archive.mjs" accept)
---
The user typed /rootz-archive:accept. That is their act of accepting the Rootz Archive Use Licence (LICENSE.md in the plugin folder). The acceptance has already been recorded by this command:

!`node "${CLAUDE_PLUGIN_ROOT}/dist/archive.mjs" accept`

Tell the user, in two plain sentences, what the line above says (accepted, or already accepted). Remind them that they keep their own backups (licence §9). If the line above shows an error instead, say so plainly and suggest checking `node --version` (22.13 or newer is needed).
