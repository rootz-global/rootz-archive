# Security policy: Rootz Archive

## Reporting a vulnerability
Please report security issues **privately**, using GitHub's private vulnerability reporting:
**https://github.com/rootz-global/rootz-archive/security/advisories/new**

Please don't open a public issue for a security problem. We aim to acknowledge reports within 3 business days, and we
credit reporters who want credit.

## Scope
The Rootz Archive Claude Code plugin and its MCP server (this repository's `rootz-archive/` folder, `server.json` and the
`.mcpb` release). Rootz Archive is local-only: it makes no network connections, and its data stays on the user's
computer (see PRIVACY.md). Issues of particular interest:
- anything that reads or writes outside the documented paths (FORMAT.md);
- anything that could make the plugin send data off the machine;
- ways to accept the licence, or start capture, without the user's own command;
- weaknesses in the integrity check (`vault verify`).

## Supported versions
Only the latest published version receives fixes. Update with `claude plugin update rootz-archive@rootz`.
