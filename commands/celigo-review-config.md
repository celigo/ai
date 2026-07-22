---
description: Review a Celigo resource config (flow, export, import, connection, mapping) that I paste in, and flag issues against best practices.
---

Review the Celigo resource configuration I provide (paste the JSON, or point me at a file) and flag issues. No live account is required -- reason from the config itself.

Use the skill that matches the resource type: `building-flows`, `configuring-exports`, `configuring-imports`, `configuring-connections`, `writing-mappings`, or `troubleshooting-flows`.

Check for:

- **Correctness** -- `adaptorType` casing, required fields, valid `_connectionId`/`_exportId`/`_importId` references, 6-field cron schedule.
- **Sandbox/production** consistency (`sandbox` flags must not mix).
- **Error handling** -- `proceedOnFailure`, retry/notification settings.
- **Mappings** -- `record.` prefix (AFE 2.0), triple vs double braces, unguarded first-match lookups.
- **Common pitfalls** for that resource type (see the skill's Gotchas section).

Produce a prioritized list of findings (blocker / warning / nit) with the concrete fix for each. Do not modify anything unless I ask.
