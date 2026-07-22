---
description: Plan a new Celigo integration from requirements -- systems, data, schedule, error handling -- and produce a bottom-up build order. Design only; creates nothing.
---

Help me plan a new Celigo integration. Ground your guidance in the `getting-started` skill (core concepts, build order, planning discipline) and `building-flows` skill.

First, confirm the requirements (ask me for anything I haven't already given):

- Source system(s) and destination system(s)
- What data moves, and in which direction(s)
- Sync frequency -- real-time/webhook, scheduled (cron), or on-demand
- Failure handling -- `proceedOnFailure`, retries, error notifications
- One-off or reusable template
- Sandbox or production (never mix)

Then produce a plan:

1. The resources to build **bottom-up** -- connections, then exports/imports, then the flow(s) -- naming each.
2. For each resource, which skill to follow (e.g. `configuring-connections`, `configuring-exports`, `configuring-imports`, `building-flows`).
3. Open questions, risks, and any reusable existing resources to look for first.

This is a design step -- do not create or modify any resources.
