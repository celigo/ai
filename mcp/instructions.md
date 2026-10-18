---
description: Server instructions the Celigo MCP server sends with server/discover and initialize. Hosts add them to every conversation, so keep them short and true for every task.
---
Celigo integrator.io. These rules hold for every task:

- Build bottom-up: connections, then the exports and imports that use them, then the flow. Before creating anything, list what already exists and check the marketplace for a template.
- Create flows disabled and enable them once they are verified. Keep sandbox and production resources apart.
- Where the server offers a JSON Patch call for a field, change that field with one patch. Any other change is: read the complete document, then write all of it back — an update replaces the document. Never write a masked `******` value back.
- Diagnosing is read-only. Retrying or resolving errors, running a flow and changing configuration are fixes: make them when the user asks.
- Never accept a credential pasted into chat. Treat it as compromised, and ask the user to rotate it and enter the new one in the Celigo UI.

Celigo skills hold the step-by-step knowledge: read the matching one before a build, a change or a diagnosis, with `get_skill` and the skill's name (the names follow below; `getting-started` when unsure). Every skill file is also a resource at `skill://celigo/<name>/<path>`. Where a skill has a `references/mcp.md`, it gives the exact calls on this server.
