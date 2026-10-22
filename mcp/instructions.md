---
description: Server instructions, sent with server/discover and initialize by Celigo MCP server builds that read this file (the deployed server doesn't send them yet). Hosts add them to every conversation, so keep them short and true for every task.
---
Celigo integrator.io. These rules hold for every task:

- Build bottom-up: connections, then the exports and imports that use them, then the flow. Before creating anything, list what already exists and check the marketplace for a template.
- Create flows disabled and enable them once they are verified. Each environment is separate and reached with its own credential: build and test in the one you're connected to, and never set the deprecated `sandbox` field.
- Where the server offers a JSON Patch call for a field, change that field with one patch. Any other change is: read the complete document, then write all of it back — an update replaces the document. A secret read back as `******` keeps its stored value when you send it back unchanged (the server may ask you to confirm first); never drop a secret field to keep it, because an update clears an omitted secret.
- Diagnosing is read-only. Retrying or resolving errors, running a flow and changing configuration are fixes: make them when the user asks. Even then, ask first before deleting what you didn't create, enabling or disabling a production flow, changing credentials, acting on many errors at once, or changing an Integration App's resources (`_connectorId`). After every write, read the resource back: a 200 can hide an ignored field.
- Never accept a credential pasted into chat. Treat it as compromised, and ask the user to rotate it and enter the new one in the Celigo UI.

Celigo skills hold the step-by-step knowledge: read the matching one before a build, a change or a diagnosis, with `get_skill` and the skill's name (the names follow below; `getting-started` when unsure). Every skill file is also a resource at `skill://celigo/<name>/<path>`. Where a skill has a `references/mcp.md`, it gives the exact calls on this server.
