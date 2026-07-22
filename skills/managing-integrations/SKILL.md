---
name: managing-integrations
description: Manage Celigo integrations -- the named containers that group flows, APIs, Tools, connections, scripts, and settings so a body of automation is organized, secured, and evolved as one unit. Covers plain integrations vs Integration Apps, parent/child hierarchies, cloning with connection remap, moving resources between integrations, notifications, aliases, and Integration Lifecycle Management (ILM) revisions/snapshots/pulls/reverts across environments. Use when creating, organizing, cloning, promoting, or versioning integrations, or deciding whether new work belongs in an existing integration or its own.
---

<!-- TIER:1 -->

# Managing Integrations

An integration is a first-class Celigo resource that represents a **named group of related resources** -- flows, APIs, Tools, registered connections, scripts, settings, notification subscriptions, aliases, and revision history. It is the organizational layer that says "this body of automation goes together," typically because it serves a specific business purpose (the "Shopify-NetSuite integration", the "customer-onboarding integration"). The actual work is done by the resources inside; the integration coordinates how they are managed, deployed, and evolved.

Users may call integrations **tiles**, **workspaces**, or **integration folders** -- treat these as equivalent vocabulary for the same resource type.

Concerns when managing integrations:

- **Organization and access** -- grouping related work so it can be named, permissioned, and reported on as a unit. The integration boundary is the **permission boundary**.
- **Plain vs Integration App** -- customer-built integrations you own end to end, vs template-driven apps installed from the Marketplace.
- **Hierarchy** -- parent/child integrations for multi-store, multi-tenant, or per-environment splits.
- **Lifecycle and promotion** -- cloning across environments and running the ILM workflow (snapshots, pulls, reverts) to evolve integrations safely.
- **Composition** -- what lives inside, and how to move a resource from one integration to another.
- **Per-integration knobs** -- notifications, aliases, analytics, and settings that live on the integration record itself.

## What Lives Inside an Integration

An integration is a container for the resources that do the work:

- **Flows** -- the body of the integration's automation; each is enabled/disabled independently.
- **APIs** -- HTTP endpoints the integration exposes to external callers.
- **Tools** -- reusable processing blocks invoked by flows, APIs, and AI agents.
- **Registered connections** -- connections attached to the integration's connection list (registration is organizational, not binding -- see Gotchas).
- **Scripts** -- JavaScript attached to the integration or its resources.
- **Settings and custom forms** -- the integration record holds the settings *values*; a custom form controls their *shape*.

Integration listings surface computed fields useful for "which of my integrations have problems": `numFlows`, `numError` (open errors across all flows), `numRegisteredConnections`, `numOfflineConnections`, and `lastErrorAt` (ISO timestamp of the most recent error). Rank by `numError` / `numOfflineConnections` to triage.

## Plain Integrations vs Integration Apps

Two flavors share the integration resource shape but behave differently:

- **Plain integrations** are built from scratch by the customer, who owns the structure entirely. Adding, removing, or modifying inner resources is normal CRUD, and cloning preserves the full structure.
- **Integration Apps (IAs)** are template-driven integrations, typically installed from the **Marketplace**. IA resources carry a `_connectorId`; the template controls which flows exist, what settings are exposed, and how children are organized. Customer edits are bounded by the template, and the app can ship upgrades that propagate from the template author to every installed instance. Adding a flow to an IA may be limited to a "Custom flows" area.

Marketplace install and template-upgrade operations are a separate concern from managing the integration record.

## Parent / Child Integrations

Some integrations support **children**: a parent integration with multiple child integrations underneath it. This shows up most often in **multi-store / multi-tenant** setups (one IA supporting several Shopify stores or business units, each a child) and in **per-environment splits** inside a single IA.

Children **inherit structure** from the parent (the flows, the settings schema, the connection requirements) but carry their own **configuration values** (the actual connections, settings values, and per-child flow customizations). Integration listings return both parent and child entries, so the full tree is visible.

Child integrations are generally available only when the parent is an **Integration App**. For a plain integration, use sibling integrations or per-flow naming instead (e.g. `Order sync -- Store A`, `Order sync -- Store B`).

## Quick Reference

### Add-to-Existing vs New Integration

Default: **add to an existing integration**. Spawning a new one per flow defeats the purpose of grouping. Reach for a new integration when:

| Situation | Choice |
|---|---|
| A **different group of people** must manage or monitor it (contractor scope, partner visibility, ops vs IT split) | New integration -- the boundary is the access boundary |
| The work is **conceptually separate** (different business problem, audience, lifecycle) | New integration |
| Installing from a **Marketplace template** | New integration (IAs come as their own integration) |
| An existing integration is at its **scale ceiling** (rare) | New integration |
| Same team, same access needs, related work | Add to existing |

### Clone Decision Matrix

| Intent | Clone type | Notes |
|---|---|---|
| "A copy to play with" / backup before risky changes | Same-environment clone | Parallel copy in the same environment |
| "Develop changes in sandbox" / "clone to prod" | Cross-environment clone | Entry point to the ILM workflow |
| Copy but keep future changes in sync | Clone (preserves clone-family lineage) | Enables pulls between the two |
| Copy with **no** intention of keeping in sync | Duplicate from scratch | Loses lineage; ILM unavailable |

Cross-environment clones remap connections via a **connection map** at clone time -- see the Reference Index.

### Moving a Resource -- Three Tiers

| Tier | Resources | How it changes integration |
|---|---|---|
| **Owned (movable)** | flows, APIs, Tools | Move re-homes it: swaps `_integrationId`, preserves `_id`/history/errors (flows also clear `_flowGroupingId`) |
| **Registered (not owned)** | connections, lookup caches | Register/deregister to the integration's list (can belong to several at once) |
| **Inherited (move the parent)** | exports, imports, AI agents, guardrails | No per-step move -- move the parent flow/API/Tool |

Integration-App resources (`_connectorId`) cannot be freely moved. Whole-integration relocation across **accounts** is the separate **Integration transfer** operation.

### Minimum Required Fields

Creating an integration requires at minimum:

- `name` -- the display name; name it after the business purpose, not a single operation.
- `description` (optional) -- helpful context for the team.

Integration Apps are not created this way -- they are installed from the Marketplace.

### Reference Index

Deep ILM detail lives in [references/lifecycle-management.md](references/lifecycle-management.md):

- **Clone family & linked vs standalone clones** -- why a pull can report "no changes to pull"
- **Revisions** -- `snapshot` / `pull` / `revert` semantics, diffs, and auto-snapshots
- **Ignore fields** -- per-resource-type fields (`flow.*`, `export.*`, `import.*`, `connection.*`) that stay per-environment
- **Connection remap on clone** -- the connection-map object and why a post-clone update cannot remap
- **Move vs clone vs transfer** -- owned / registered / inherited resource tiers

## Related Skills

- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- flows are the body of an integration's automation
- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connections are registered to integrations and remapped on cross-environment clone
- [building-apis > Quick Reference](../building-apis/SKILL.md#quick-reference) -- APIs live inside integrations
- [building-tools > Tool Concepts](../building-tools/SKILL.md#tool-concepts) -- Tools live inside integrations
- [managing-users > Access Strategy Decision Matrix](../managing-users/SKILL.md#access-strategy-decision-matrix) -- the integration boundary is the permission boundary; grant manage/monitor per integration
- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- diagnosing the errors that roll up into `numError`
- [using-marketplace-templates](../using-marketplace-templates/SKILL.md) -- Integration Apps install from the Marketplace as their own integration; templates seed a new one

<!-- TIER:2 -->

## How to Manage Integrations

### 1. Discover existing integrations

Before creating anything, understand the current state:

```bash
# List all integrations (includes parent and child entries)
celigo integrations list

# Inspect one integration's record
celigo integrations get <id>

# Find related work by keyword across the account
celigo account search "<keyword>"
```

Review the computed fields (`numFlows`, `numError`, `numRegisteredConnections`, `numOfflineConnections`, `lastErrorAt`) to spot integrations that need attention.

### 2. Decide: add to an existing integration or create a new one

Use the [Add-to-Existing vs New Integration](#add-to-existing-vs-new-integration) matrix. The key question is almost always about access: *do the people who will manage or monitor this work differ from the people who already have access to an existing integration?* If yes, it needs its own integration so Custom permissions can be granted independently. If no, add it to the existing one.

### 3. Create an integration

```bash
# Create from a JSON body (minimum: a descriptive name)
echo '{"name":"Shopify-NetSuite"}' | celigo integrations create

# Or edit a file and pipe it in
celigo integrations create < integration.json
```

Name it after the business purpose, not a single operation. Integration Apps are **not** created here -- install them from the Marketplace instead.

### 4. Organize the resources inside

Build the inner resources bottom-up (connections, then exports/imports, then flows/APIs/Tools) using their own skills. To change which integration a resource belongs to:

- **Flows / APIs / Tools** -- these are *owned* and can be **moved** (the move preserves the resource's `_id`, history, and errors while swapping `_integrationId`). Moving is done in the Celigo UI or via the public API -- not via `celigo integrations update`, which only mutates the parent record.
- **Connections / lookup caches** -- these are *registered*, not owned. "Move a connection" means register it to the target integration and deregister from the source (see `configuring-connections`).
- **Exports / imports / AI agents / guardrails** -- these *inherit* their integration from the parent flow/API/Tool; move the parent instead.

### 5. Clone across environments (and remap connections)

To develop safely or promote work, clone the integration into another environment. Cloning copies the integration record, its flows, APIs, Tools, registered connections, scripts, and settings, and joins the copy to the original's **clone family**.

- A **cross-environment** clone is the entry point to ILM.
- Cloning **cancels in-progress jobs** on the original integration's connections -- schedule accordingly.
- Remap connections to the target environment **at clone time** using a connection map (`{"<oldConnectionId>": "<newConnectionId>"}`). This is the only place the binding change can happen -- see the [Reference Index](#reference-index).

Cloning and connection remap are performed in the Celigo UI or via the public API. (The flow-level equivalent, `celigo flows clone`, is documented in `building-flows` and uses the same `connectionMap`.)

### 6. Promote with ILM (snapshot, pull, revert)

Run the git-style ILM workflow to evolve integrations across environments:

1. **Snapshot** the production integration before big changes (a known-good state to revert to).
2. **Develop** in the cross-environment clone.
3. **Pull** the changes from the clone back into production; auto-snapshots bookend the merge, and conflicts stop the pull for manual resolution.
4. **Revert** to a prior revision if a pull introduced a regression.

Configure **ignore fields** first so environment-specific values (URLs, sandbox vs prod IDs) do not cross during a pull. These operations run in the Celigo UI's **Revisions** tab or via the public API. See [references/lifecycle-management.md](references/lifecycle-management.md) for full semantics.

### 7. Configure per-integration knobs

These features live on the integration record and are managed in the Celigo UI or via the public API:

- **Notifications** -- subscribe users (the current user or anyone by email) to *all flow errors*, *specific flow errors*, or *offline-connection alerts* for the integration.
- **Aliases** -- stable, portable names mapping to a resource `_id`. Use them when scripts must reference resources by name, because `_id`s change when an integration is cloned to a new environment but aliases can stay stable.
- **Analytics** -- flow execution metrics (success / error / ignored / resolved record counts, average processing time) roll up at the integration level, aggregated across the integration or grouped per flow or per step.

### 8. Delete an integration

```bash
celigo integrations delete <id>
```

Deleting removes the integration and is destructive -- confirm nothing is still running and that the resources inside are no longer needed. Prefer moving resources out first if any should be kept.

## CLI Commands

```bash
# CRUD
celigo integrations list
celigo integrations get <id>
celigo integrations create < integration.json
celigo integrations update <id> < integration.json
celigo integrations delete <id>

# Discovery
celigo account search "<keyword>"        # Find integrations and related resources by name/keyword
```

**UI / API alternatives.** The CRUD CLI mutates only the integration record. Operations that touch the integration's *inside* resources or lifecycle are performed in the Celigo UI or via the public API, not the CRUD CLI:

- **Clone** (same- or cross-environment) and connection remap
- **ILM**: snapshots, pulls, reverts, and ignore-field configuration (Revisions tab)
- **Move** a flow/API/Tool between integrations
- **Register / deregister** connections and lookup caches
- **Notifications**, **aliases**, and **analytics**
- **Integration transfer** across accounts, and **Marketplace** install/upgrade for Integration Apps

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating, cloning, or promoting an integration, verify:

- [ ] Chose add-to-existing vs new integration based on the **access boundary** (who manages/monitors the work)
- [ ] New integration has a clear `name` describing the business purpose, not a single operation
- [ ] For a cross-environment clone, the connection map covers **every** source `_connectionId` that must point at a target-environment connection
- [ ] For ILM promotion, the source clone is **lifecycle-linked** (created via the UI clone flow), not standalone
- [ ] **Ignore fields** cover environment-specific values before pulling between environments
- [ ] Took a **pre-deploy snapshot** of the receiving integration before a risky pull
- [ ] Used **move** (preserves `_id`/history), not clone, when the same resource should change integrations
- [ ] Confirmed nothing critical is running before **cloning** (in-progress jobs on the original's connections are canceled) or **deleting**

## Gotchas

1. **A standalone clone silently breaks ILM.** A clone created outside the UI clone flow (e.g. a plain public-API copy) is in the clone family but **not lifecycle-linked**: snapshots are refused, and pulls report `Everything up to date -- no changes to pull` even with real edits. Check for a standalone source before debugging a "no changes" pull. It cannot be linked after the fact -- recreate it via the UI clone flow.
2. **Connection remap only happens at clone time.** Use the connection map (`{"<oldConnectionId>": "<newConnectionId>"}`) during the clone. Updating the integration afterward cannot remap connections on the inner flows/exports/imports -- `celigo integrations update` only mutates the parent record.
3. **Registration is not binding.** Registering a connection to an integration is an organizational tag (visibility in the connection list). The `_connectionId` on an export/import is what actually binds a connection to work. Register/deregister never changes which connections the inner resources use.
4. **Cloning cancels in-progress jobs** on the original integration's connections during the operation. Schedule clones when the integration is idle.
5. **Pulls only work between directly related, lifecycle-linked family members** -- a parent and a direct child, not across unrelated branches of the clone family.
6. **Ignore fields only affect field-level updates to existing resources.** Resource creation and deletion during a pull are never suppressed by the ignore list.
7. **Move preserves the resource; clone creates a new one.** A move keeps the same `_id`, history, and errors and just swaps `_integrationId` (flows also clear `_flowGroupingId`). If the user says "move," "reassign," or "relocate," do not clone.
8. **Integration-App resources are template-controlled.** Resources carrying a `_connectorId` cannot be freely moved or restructured; their shape and upgrades come from the connector/template author. Custom additions may be limited to a "Custom flows" area.
9. **Integration transfer (across accounts) is distinct** from a resource move (within an account) and from a clone (a copy). Do not conflate them.
10. **PUT/update erases omitted fields.** When editing an integration record, GET first, modify, then update so you do not drop existing fields.
11. **Child integrations require an Integration App parent.** Plain integrations do not get children -- use sibling integrations or per-flow naming to distinguish multi-store/multi-tenant work.

## Common Errors

| Error / Symptom | Likely Cause | Fix |
|---|---|---|
| Pull reports `Everything up to date -- no changes to pull` (but edits exist) | Source clone is **standalone**, not lifecycle-linked | Recreate the clone through the Celigo UI clone flow; standalone clones cannot be linked after the fact |
| `clone must be linked to source integration` on snapshot | Snapshot attempted on a standalone clone | Use a lifecycle-linked clone (created via the UI clone flow) |
| Pull stops with conflicts | Both sides changed the same fields | Resolve manually in the Celigo UI **Revisions** tab |
| Cloned flows still point at the source environment's connections | Connection map not supplied (or wrong IDs) at clone time | Re-clone with a connection map linking each old `_connectionId` to the target-environment connection |
| Environment-specific values overwritten by a pull | Those field paths are not in the integration's **ignore fields** | Add the paths (e.g. `connection.*`, `export.*`) to ignore fields, then re-pull |
| Cannot move a flow/API/Tool into an integration | Resource is Integration-App-owned (`_connectorId` set) | IA resources are managed by the connector; use a Custom-flows area or a plain integration |
| `403 Forbidden` on integration edit | Token lacks manage/admin access to that integration | Use a token with manage or admin access (see `managing-users`) |
| `404 Not Found` on integration get/update | Wrong integration `_id`, or it was deleted | Verify the ID with `celigo integrations list` |
| Integration listing is missing integrations you expect | Token has Custom access and only sees granted integrations | Use an admin/owner token, or grant Custom access to those integrations (see `managing-users`) |
