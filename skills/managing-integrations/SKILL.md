---
name: managing-integrations
description: Manage Celigo integrations -- the named containers that group flows, APIs, Tools, connections, scripts, and settings so a body of automation is organized, secured, and evolved as one unit. Covers plain integrations vs Integration Apps, parent/child hierarchies, cloning with connection remap, moving resources between integrations, notifications, aliases, and Integration Lifecycle Management (ILM) revisions/snapshots/pulls/reverts across environments. Use when creating, organizing, cloning, promoting, or versioning integrations, or deciding whether new work belongs in an existing integration or its own.
---

<!-- TIER:1 -->

# Managing Integrations

An integration is a first-class Celigo resource that represents a **named group of related resources** -- flows, APIs, Tools, registered connections, scripts, settings, aliases, and revision history. It is the organizational layer that says "this body of automation goes together," typically because it serves a specific business purpose (the "Shopify-NetSuite integration", the "customer-onboarding integration"). The actual work is done by the resources inside; the integration coordinates how they are managed, deployed, and evolved.

Users may call integrations **tiles**, **workspaces**, or **integration folders** -- treat these as equivalent vocabulary for the same resource type.

Concerns when managing integrations:

- **Organization and access** -- grouping related work so it can be named, permissioned, and reported on as a unit. The integration boundary is the **permission boundary**.
- **Plain vs Integration App** -- customer-built integrations you own end to end, vs template-driven apps installed from the Marketplace.
- **Hierarchy** -- parent/child integrations for multi-store, multi-tenant, or per-environment splits.
- **Lifecycle and promotion** -- cloning across environments and running the ILM workflow (snapshots, pulls, reverts) to evolve integrations safely.
- **Composition** -- what lives inside, and how to move a resource from one integration to another.
- **Per-integration knobs** -- aliases and settings, which live on the integration record, and notification subscriptions and run statistics, which don't.

## What Lives Inside an Integration

An integration is a container for the resources that do the work:

- **Flows** -- the body of the integration's automation; each is enabled/disabled independently.
- **APIs** -- HTTP endpoints the integration exposes to external callers.
- **Tools** -- reusable processing blocks invoked by flows, APIs, and AI agents.
- **Registered connections** -- connections attached to the integration's connection list (registration is organizational, not binding -- see Gotchas).
- **Scripts** -- JavaScript attached to the integration or its resources.
- **Settings and custom forms** -- the integration record holds the settings *values*; a custom form controls their *shape*.

Integration records carry no health counts -- the error and offline-connection totals on the dashboard tiles aren't part of the integration API, so `celigo integrations list` can't rank by them. For "which of my integrations have problems," read `celigo integrations errors <id>` (one row per flow: `_flowId`, its open-error count `numError`, and `lastErrorAt`) and check `offline` on the connections in the record's `_registeredConnectionIds` (`celigo connections list` shows `offline`).

## Plain Integrations vs Integration Apps

Two flavors share the integration resource shape but behave differently:

- **Plain integrations** are built from scratch by the customer, who owns the structure entirely. Adding, removing, or modifying inner resources is normal CRUD, and cloning preserves the full structure.
- **Integration Apps (IAs)** are template-driven integrations, typically installed from the **Marketplace**. IA resources carry a `_connectorId`; the template controls which flows exist, what settings are exposed, and how children are organized. Customer edits are bounded by the template, and the app can ship upgrades that propagate from the template author to every installed instance. Adding a flow to an IA may be limited to a "Custom flows" area.

Cloning, snapshots, pulls, reverts, and ignore fields are for plain integrations: the platform refuses lifecycle calls on an Integration App (`not_supported`) and refuses to clone resources installed from one. To run an Integration App in another environment, install it there from the Marketplace (one license covers every environment) and set up its connections and settings again; a few apps offer their own clone utility, so check the app's documentation. Add a store or tenant through the app's own Add store flow, not a clone.

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
| "Develop changes in sandbox" / "clone to prod" | Cross-environment clone through the UI clone flow | Entry point to the ILM workflow (a CLI or API clone is standalone -- see below) |
| Copy but keep future changes in sync | UI clone (lifecycle-linked) | Enables pulls between the two; a standalone CLI or API clone can't pull |
| Copy with **no** intention of keeping in sync | Duplicate from scratch | Loses lineage; ILM unavailable |

Cross-environment clones remap connections via a **connection map** at clone time -- see the Reference Index.

### Moving a Resource -- Three Tiers

| Tier | Resources | How it changes integration |
|---|---|---|
| **Owned (movable)** | flows, APIs, Tools | Move re-homes it: a save with the target `_integrationId` keeps `_id`/history/errors (a flow must drop `_flowGroupingId` in the same save) |
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
- **Revisions** -- `snapshot` / `pull` / `revert` semantics, diffs, and what a revert restores
- **Ignore fields** -- the specific fields per resource type (an export's `http.body`, a flow's `disabled`) that pulls and reverts leave alone
- **Connection remap on clone** -- the connection-map object, and replacing a connection after the clone
- **Move vs clone vs transfer** -- owned / registered / inherited resource tiers

## Related Skills

- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- flows are the body of an integration's automation
- [building-syncs > The sync integration](../building-syncs/SKILL.md#the-sync-integration) -- integrations created with `syncs: true` hold syncs, and can't be deleted while they do
- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connections are registered to integrations and remapped on cross-environment clone
- [building-apis > Quick Reference](../building-apis/SKILL.md#quick-reference) -- APIs live inside integrations
- [building-tools > Tool Concepts](../building-tools/SKILL.md#tool-concepts) -- Tools live inside integrations
- [managing-users > Access Strategy Decision Matrix](../managing-users/SKILL.md#access-strategy-decision-matrix) -- the integration boundary is the permission boundary; grant manage/monitor per integration
- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- diagnosing the open errors `celigo integrations errors` reports per flow
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

# Open errors per flow in one integration (numError, lastErrorAt)
celigo integrations errors <id>

# Find related work by keyword across the account
celigo account search "<keyword>"
```

`celigo integrations list` returns the records only -- no error counts. Use `celigo integrations errors <id>` for open errors per flow, and `celigo flows error-summary <flowId>` to drill into one flow's steps.

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

- **Flows / APIs / Tools** -- these are *owned* and can be **moved**; the move keeps the resource's `_id`, history, and errors. Move a flow by saving it with the target `_integrationId` and without its `_flowGroupingId` (`celigo flows set <flowId> _integrationId=<targetId> _flowGroupingId=null`); a stale group fails with 422 `flowgrouping_not_belong`, and the platform registers the flow's connections in the target integration. APIs and Tools move the same way, but only builder-mode APIs belong to an integration (a script-mode API stays account-level). Don't move abstract or instance flows: the UI offers no Move for a multi-instance family, and moving them one at a time splits it across integrations. `celigo integrations update` moves nothing -- it only mutates the parent record.
- **Connections / lookup caches** -- these are *registered*, not owned. "Move a connection" means register it to the target integration and deregister from the source (see `configuring-connections`).
- **Exports / imports / AI agents / guardrails** -- these *inherit* their integration from the parent flow/API/Tool; move the parent instead.

### 5. Clone across environments (and remap connections)

To develop safely or promote work, clone the integration into another environment. Cloning copies the integration record, its flows, APIs, Tools, scripts, and settings, and joins the copy to the original's **clone family**. It never copies connections: the copy uses the ones its connection map names.

- A **cross-environment** clone is the entry point to ILM.
- Cloning **cancels in-progress jobs** on the original integration's connections -- schedule accordingly.
- The connection map (`{"<oldConnectionId>": "<newConnectionId>"}`) must name every registered connection, mapped to itself in the same environment or to an existing connection in the target environment -- so create or choose the target's connections before the clone. Omitting the map or sending `{}` fails with 400 `invalid_connectionMap`; leaving out a registered connection, or naming one the source doesn't use, fails with `invalid_connectionId`.
- To repoint a flow, API, or Tool after the clone, replace the connection on it (`celigo flows replace-connection <flowId> <oldConnectionId> <newConnectionId>`, or `apis` / `tools replace-connection`); one call swaps every step. The new connection must be of the same type, and for HTTP it should reach the same application, because the steps keep their relative URIs. Replacing a connection on a flow cancels the flow's in-flight runs. Don't re-clone to fix connections: a second clone is a second integration with new ids.

Clone through the Celigo UI's clone flow whenever the copy will take part in ILM -- it's the only path that produces a **lifecycle-linked** clone. `celigo integrations clone <id> <environmentId> [--name <name>]` copies from the CLI. With nothing piped, it maps each registered connection to itself, which suits a same-environment copy; for another environment, pipe `{"connectionMap": {...}}` on stdin, listing every registered connection -- a piped map replaces the self-map, so one that remaps a single connection must still list the rest. Cross-environment clones need CLI 2026.10.1 or later, since 2026.9.6 creates the copy in the profile's own environment. Every CLI or API clone is **standalone**: fine as a scratch copy or a backup, but refused by snapshots and invisible to pulls. (The flow-level equivalent, `celigo flows clone`, is documented in `building-flows` and uses the same `connectionMap`.)

**A clone the user will pull from later is made in the UI.** Don't substitute a CLI or API clone, or rebuild the integration with creates: both leave an unlinked copy. Give the user the UI steps and the connection map to choose there. The map covers every connection in the integration's `_registeredConnectionIds`, including any the user didn't mention, each paired with an existing connection in the target environment; a registered connection with no counterpart there needs one created first. A Marketplace template install is not a clone -- it takes a published template's id, never an integration's or an environment's -- and no MCP tool clones an integration.

### 6. Promote with ILM (snapshot, pull, revert)

Run the git-style ILM workflow to evolve integrations across environments:

1. **Snapshot** the production integration before big changes (a known-good state to revert to).
2. **Develop** in the cross-environment clone.
3. **Pull** the changes from the clone back into production; conflicts stop the pull for manual resolution. The pull's own revision keeps the integration's state from before and after the merge (`beforeRevisionHash`, `afterRevisionHash`) -- those are its restore points, and no separate snapshot revisions appear in the history.
4. **Revert** a pull that introduced a regression from the pull's own revision: **Revert to before this revision** restores the state from just before the pull.

Configure **ignore fields** first so environment-specific values (URLs, sandbox vs prod IDs) do not cross during a pull. Pulls, reverts, and ignore-field configuration run only in the Celigo UI's **Revisions** tab -- the API can create a snapshot but can't start a pull or a revert, and no MCP tool does either.

**Asked to roll back a pull? Point the user to the revert.** Find the pull in the revision history (when it ran, who ran it, and its diff), then tell the user which revision to revert in the Revisions tab and which action to pick. Never imitate a revert by writing old values back to the resources: the changes you can read in the audit log may not be everything the pull did (a pull can also create and delete resources), and the history gets no revert revision. Snapshots and the revision history are scriptable:

```bash
celigo integrations create-snapshot <id> --description "Before v2 deploy"
celigo integrations revisions <id>                      # revision history
celigo integrations revision-diff <id> <revisionId>     # before/after of a pull or revert
celigo integrations revision-errors <id> <revisionId>   # why a pull or revert failed
```

A failed pull or revert has no diff; read its `revision-errors` instead. An id written `<type> - <id>.deleted` in those messages is the change set's marker, not the resource's state: the resource may still exist, so check before calling it deleted or restoring anything from the recycle bin.

See [references/lifecycle-management.md](references/lifecycle-management.md) for full semantics.

### 7. Configure per-integration knobs

These are managed in the Celigo UI or from the CLI:

- **Notifications** -- notification subscriptions are separate, account-level records, one per user and target (an integration's flow errors, one flow, a connection's offline alerts, or a sync), not fields of the integration. Read them with `celigo notifications list`; change them with `celigo notifications subscribe --user <email>` plus `--integration`, `--flow`, `--connection`, or `--sync <id>` (`unsubscribe` takes the same flags). The reply reports each item separately, so check every item's status; an email that isn't an account user's fails the whole request with 403 `invalid_access`.
- **Aliases** -- stable, portable names mapping to a resource `_id`. Use them when scripts must reference resources by name, because `_id`s change when an integration is cloned to a new environment but aliases can stay stable. Edit them in the record's `aliases[]` (`celigo integrations set` or `update`).
- **Run statistics** -- `celigo jobs run-stats --integration <id>` returns per-flow totals for the runs that finished in the last 24 hours: runs; record successes, errors, and ignores; open errors; errors resolved automatically or by users; and average run duration. It has no per-step breakdown and no per-record processing time. For another window, the API behind it (`POST /v1/flows/runs/stats`) takes `time_gt` and `time_lte`, and `celigo flows run-stats <flowId>` charts one flow's run durations over 1 hour to 90 days. Say which window you report.

### 8. Delete an integration

```bash
celigo integrations delete <id>
```

Deleting an integration is a soft delete: it stays in the recycle bin for 30 days. The delete is refused with 422 `dependencies_not_deleted` while the integration still contains APIs or Tools, so move or delete those first (`celigo integrations dependencies <id>` lists what still depends on it), and confirm nothing in it is still needed or running. To undo it, restore the integration with its contents in one call, `celigo recycle-bin restore <id> --cascade`: a plain restore fails with `descendants_not_restored` while something deleted with it is still in the bin.

## CLI Commands

```bash
# CRUD
celigo integrations list
celigo integrations get <id>
celigo integrations create < integration.json
celigo integrations update <id> < integration.json
celigo integrations delete <id>

# Health and history
celigo integrations errors <id>              # open errors per flow
celigo integrations dependencies <id>
celigo integrations audit <id>

# Clone (a standalone copy -- see Gotchas)
celigo integrations clone <id> <environmentId> [--name <name>]

# Repoint connections after a clone (every step of one flow, API, or Tool)
celigo flows replace-connection <flowId> <oldConnectionId> <newConnectionId>
celigo apis replace-connection <apiId> <connectionId> <newConnectionId>
celigo tools replace-connection <toolId> <connectionId> <newConnectionId>

# ILM: snapshots and revision reads
celigo integrations create-snapshot <id> --description "<label>"
celigo integrations revisions <id>
celigo integrations revision <id> <revisionId>
celigo integrations revision-diff <id> <revisionId>     # pull/revert revisions
celigo integrations revision-errors <id> <revisionId>   # failed revisions

# Registration and organization
celigo integrations register-connections <id> <connectionIds...>
celigo integrations deregister-connections <id> <connectionIds...> [-y]
celigo integrations register-lookup-caches <id> <lookupCacheIds...>
celigo integrations deregister-lookup-caches <id> <lookupCacheIds...> [-y]
celigo integrations flow-groups <id>
celigo integrations create-flow-group <id> <name>
celigo integrations download <id> [-o <path>]           # the integration as a ZIP

# Notifications (account-level records, not part of the integration)
celigo notifications list
celigo notifications subscribe --user <email> --integration <id>
celigo notifications unsubscribe --user <email> --integration <id>

# Discovery
celigo account search "<keyword>"        # Find integrations and related resources by name/keyword
```

**UI-only.** ILM pulls, reverts, and ignore-field configuration (the Revisions tab); lifecycle-linked clones (the UI clone flow); and Integration transfer across accounts. Moving a flow/API/Tool is a save of `_integrationId` on that resource (see step 4), not on the integration record -- `celigo integrations update` can't do it. Marketplace installs are covered in `using-marketplace-templates`.

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating, cloning, or promoting an integration, verify:

- [ ] Chose add-to-existing vs new integration based on the **access boundary** (who manages/monitors the work)
- [ ] New integration has a clear `name` describing the business purpose, not a single operation
- [ ] The clone's connection map lists **every** registered connection, each mapped to itself (same environment) or to an existing target-environment connection
- [ ] For ILM promotion, the source clone is **lifecycle-linked** (created via the UI clone flow), not standalone
- [ ] **Ignore fields** cover environment-specific values before pulling between environments
- [ ] Took a **pre-deploy snapshot** of the receiving integration before a risky pull
- [ ] Used **move** (preserves `_id`/history), not clone, when the same resource should change integrations
- [ ] Confirmed nothing critical is running before **cloning** (in-progress jobs on the original's connections are canceled) or **deleting**

## Gotchas

1. **A standalone clone silently breaks ILM.** A clone created outside the UI clone flow (`celigo integrations clone`, or any public-API clone) is in the clone family but **not lifecycle-linked**: snapshots are refused, and pulls report `Everything up to date -- no changes to pull` even with real edits. Check for a standalone source before debugging a "no changes" pull. It cannot be linked after the fact -- recreate it via the UI clone flow.
2. **Remap connections at clone time or replace them afterward -- never through the integration record.** Set the connection map (`{"<oldConnectionId>": "<newConnectionId>"}`) during the clone when you can. Afterward, `celigo flows replace-connection` (or `apis` / `tools replace-connection`) repoints every step of one flow, API, or Tool in one call; `celigo integrations update` only mutates the parent record. Don't re-clone to fix connections -- a second clone is a second integration with new ids.
3. **Registration is not binding.** Registering a connection to an integration is an organizational tag (visibility in the connection list). The `_connectionId` on an export/import is what actually binds a connection to work. Register/deregister never changes which connections the inner resources use.
4. **Cloning cancels in-progress jobs** on the original integration's connections during the operation. Schedule clones when the integration is idle.
5. **Pulls only work between directly related, lifecycle-linked family members** -- a parent and a direct child, not across unrelated branches of the clone family.
6. **Ignore fields only affect field-level updates to existing resources.** Resource creation and deletion during a pull are never suppressed by the ignore list.
7. **Move preserves the resource; clone creates a new one.** A move keeps the same `_id`, history, and errors and just swaps `_integrationId` (a flow must drop `_flowGroupingId` in the same save). If the user says "move," "reassign," or "relocate," do not clone -- but don't move abstract or instance flows either, which splits the family (step 4).
8. **Integration-App resources are template-controlled.** Resources carrying a `_connectorId` cannot be freely moved or restructured; their shape and upgrades come from the connector/template author. A full update that changes a field the app locks still answers 200 and keeps the app's value, so read the resource back ([using-marketplace-templates > Changing an Installed Integration App](../using-marketplace-templates/SKILL.md#changing-an-installed-integration-app)). Custom additions may be limited to a "Custom flows" area.
9. **Integration transfer (across accounts) is distinct** from a resource move (within an account) and from a clone (a copy). Do not conflate them.
10. **PUT/update erases omitted fields.** When editing an integration record, GET first, modify, then update so you do not drop existing fields.
11. **Child integrations require an Integration App parent.** Plain integrations do not get children -- use sibling integrations or per-flow naming to distinguish multi-store/multi-tenant work.
12. **Roll back a pull with a revert, never by hand.** A pull keeps its before and after states on its own revision, so the revert target is the pull itself (**Revert to before this revision**, in the Revisions tab), not a snapshot you'd expect beside it. Writing the old values back yourself misses whatever you didn't read -- a pull can create and delete resources too -- and records no revert.

## Common Errors

| Error / Symptom | Likely Cause | Fix |
|---|---|---|
| Pull reports `Everything up to date -- no changes to pull` (but edits exist) | Source clone is **standalone**, not lifecycle-linked | Recreate the clone through the Celigo UI clone flow; standalone clones cannot be linked after the fact |
| `clone must be linked to source integration` on snapshot | Snapshot attempted on a standalone clone | Use a lifecycle-linked clone (created via the UI clone flow) |
| Pull stops with conflicts | Both sides changed the same fields | Resolve manually in the Celigo UI **Revisions** tab |
| Flows fail after a pull; the user asks to roll it back | The pull changed something production needed | Identify the pull in the revision history, then have the user revert it in the **Revisions** tab (**Revert to before this revision** on the pull); don't write old values back by hand |
| Cloned flows still point at the source environment's connections | The connection map named the old connections (or wrong IDs) | Replace the connection on each flow, API, or Tool (`celigo flows replace-connection <flowId> <oldConnectionId> <newConnectionId>`); don't re-clone |
| Environment-specific values overwritten by a pull | Those fields aren't in the integration's **ignore fields** | Re-enter the overwritten values (or revert the pull) -- a re-pull won't bring them back -- then choose those specific fields in the ignore fields before the next pull |
| Cannot move a flow/API/Tool into an integration | Resource is Integration-App-owned (`_connectorId` set) | IA resources are managed by the connector; use a Custom-flows area or a plain integration |
| `422 flowgrouping_not_belong` when moving a flow | The save kept the flow's old `_flowGroupingId`; flow groups are per-integration | Save it with the target `_integrationId` and `_flowGroupingId=null` (step 4) |
| `403 Forbidden` on integration edit | Token lacks manage/admin access to that integration | Use a token with manage or admin access (see `managing-users`) |
| `404 Not Found` on integration get/update | Wrong integration `_id`, or it was deleted | Verify the ID with `celigo integrations list` |
| Integration listing is missing integrations you expect | Token has Custom access and only sees granted integrations | Use an admin/owner token, or grant Custom access to those integrations (see `managing-users`) |
