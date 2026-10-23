---
description: Review a Celigo resource config (flow, export, import, connection, mapping) that I paste in, and flag issues against best practices.
---

Review the Celigo resource configuration I provide (paste the JSON, or point me at a file) and flag issues. No live account is required -- reason from the config itself.

Use the skill that matches the resource type: `building-flows`, `configuring-exports`, `configuring-imports`, `configuring-connections`, `writing-mappings`, or `troubleshooting-flows`.

Check for:

- **Correctness** -- `adaptorType` casing, required fields, valid `_connectionId`/`_exportId`/`_importId` references, 6-field cron schedule.
- **Environment** -- don't judge or choose an environment by the `sandbox` field: it's a deprecated marker (honored only when a flow is created, ignored on update), and each environment is reached with its own credential.
- **Error handling** -- `proceedOnFailure`, retry/notification settings.
- **Mappings** -- `record.` prefix (AFE 2.0), triple vs double braces, unguarded first-match lookups.
- **Common pitfalls** for that resource type (see the skill's Gotchas section).

Produce a prioritized list of findings (blocker / warning / nit) with the concrete fix for each. Do not modify anything unless I ask.
