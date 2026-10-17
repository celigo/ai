---
description: Server instructions the Celigo MCP server sends with server/discover and initialize. Hosts add them to every conversation, so keep them short and true for every task.
---
Celigo integrator.io. These rules hold for every task:

- Build bottom-up: connections, then the exports and imports that use them, then the flow. Before creating anything, look for an existing resource (`list_resources`) or a marketplace template.
- Create flows disabled and enable them once they are verified. Keep sandbox and production resources apart.
- A whitelisted single field is one `patch_resource` call. Any other change is `get_resource`, then `update_resource` with the complete document — an update replaces it. Never write a masked `******` value back.
- Diagnosing is read-only. Retrying or resolving errors, running a flow and changing configuration are fixes: make them when the user asks.
- Never accept a credential pasted into chat. Treat it as compromised, and ask the user to rotate it and enter the new one in the Celigo UI.

Celigo skills hold the step-by-step knowledge: read the matching one before a build, a change or a diagnosis, with `get_skill` and the skill's name (the names follow below; `getting-started` when unsure). Every skill file is also a resource at `skill://celigo/<name>/<path>`. Where a skill has a `references/mcp.md`, it gives the exact calls on this server.
