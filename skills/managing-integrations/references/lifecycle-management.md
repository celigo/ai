# Integration Lifecycle Management (ILM) -- Reference

Deep reference for evolving integrations across environments. ILM is Celigo's git-style workflow: develop changes in a clone, then merge them back into the original. It runs at the **integration level**, not the resource level -- you do not pull an individual flow, you pull the whole integration (and its flows, APIs, Tools, exports, imports, connections, and scripts).

These operations are performed in the Celigo UI (the integration's **Revisions** tab) or via the public API. They are not part of the CRUD CLI (`celigo integrations list|get|create|update|delete`), which mutates only the integration record itself.

## The ILM model

The canonical loop:

1. The customer has a production integration.
2. They clone it into a development or sandbox environment (a cross-environment clone).
3. They build and modify the integration's resources in the clone.
4. They pull the changes back into the production integration.

Snapshots, pulls, and reverts cover the integration and everything inside it. Three concepts work together: the **clone family**, **revisions**, and **pulls**.

## Clone family

The clone family is the tree of all integrations related to a given integration -- the original, all direct clones, and all clones of clones. Cloning tags the new copy as a child of the source in this family.

Pulls (the merge operation) can only happen **between directly related family members** -- a parent and a direct child, or a clone-of-a-clone and its immediate parent. They cannot happen across unrelated branches of the tree, or between integrations that are not in the same family.

The first time a customer runs an ILM workflow, the family is just two integrations: the original and the cross-environment clone they develop in. Over time the family grows -- each environment can be a separate clone, each major release can branch a sub-clone, and so on.

## Linked vs standalone clones -- why a pull can see "no changes"

Family membership alone is **not** enough for pulls. A clone must also be **lifecycle-linked** to its source. The link is established when the clone is created through the platform's clone-and-install flow:

- A clone created through the **Celigo UI** is always lifecycle-linked.
- A clone created as a plain one-shot copy (for example, directly through the public API) appears in the clone family but is **standalone**.

A standalone clone has two failure modes that surface as confusing symptoms:

- **Snapshots are refused** with `clone must be linked to source integration`.
- **A pull that uses it as the source reports `Everything up to date -- no changes to pull` even when it has real edits**, because the pull engine has no shared history to diff through.

So when a user says a pull "finds no changes" they know exist, check whether the source clone is standalone before debugging anything else. A standalone clone **cannot be linked after the fact** -- recreate it through the UI clone flow to get a linked one.

## Revisions: snapshots, pulls, and reverts

Every state-changing operation on the integration's ILM history produces a **revision** -- an entry in the integration's version log. Listing revisions shows the full history in reverse-chronological order; each entry carries its type (`snapshot` / `pull` / `revert`), its description, the user who created it, and the timestamp.

### Snapshot

A manual point-in-time backup of the integration's current state. Users create these explicitly ("snapshot before the deploy"). Snapshots are also created automatically on **both sides of a pull** (the state before and after the merge).

Snapshots are **not diffable** -- there is no source to diff against.

### Pull

A merge of changes from a related family member. The pull compares the two integrations, identifies the delta, checks for conflicts, and merges automatically when clean. Conflict-laden pulls stop and require manual resolution in the Celigo UI's Revisions tab.

Pull revisions materialize a **before/after diff** that stays retrievable after completion -- that is how "what did that pull change?" gets answered retrospectively, field by field.

### Revert

A rollback to a previous revision (a snapshot, pull, or prior revert). Reverts **never produce conflicts** -- they simply rewind to a known prior state. Like pulls, reverts materialize a retrievable before/after diff.

Canceled revisions drop their diff.

### Common ILM workflow shapes

- **Pre-deploy snapshot.** Before making big changes to a production integration, snapshot it -- this gives a known-good state to revert to if things go wrong.
- **Sandbox to production pull.** Develop in a cross-environment clone; when ready, pull from the clone into the production integration. The pull merges the changes; the auto-created snapshots bookend the merge.
- **Revert a bad pull.** If a pull introduced a regression, revert to either the pre-pull snapshot or the prior known-good revision.

## Ignore fields -- what stays per-environment

When pulling changes between integrations in different environments, some fields should **not** cross -- environment-specific URLs, sandbox vs production IDs, environment-tagged settings, and the like. The integration's **ignore fields** configuration lists, per resource type (`flow.*`, `export.*`, `import.*`, `connection.*`, and so on), the fields that pulls should leave alone.

Behavior:

- The pull respects the ignore list: ignored fields stay at their **current value on the receiving side**, regardless of what the source integration has.
- **Creation and deletion of resources are never affected by ignore fields** -- only field-level updates to existing resources.
- Ignore fields are configured at the integration level and apply to **every** pull involving that integration. Configure once; it applies to all future pulls.

## Cloning details and connection remap

Cloning is the foundational integration operation. It produces a copy of the integration (and its inside resources) and joins the new copy to the original's clone family. Two shapes:

- **Same-environment clone** -- duplicates the integration inside the same environment. Useful for "copy the working integration and modify the copy" workflows, or for setting up parallel instances under one Integration App template.
- **Cross-environment clone** -- duplicates the integration into a different environment (development, sandbox, QA, production, or DR). Cross-environment clones are the **entry point** to the ILM workflow -- develop in the clone, then pull the changes back into the original.

The clone operation:

- Clones the integration record, the flows, the APIs and Tools, the registered connections, the scripts, and the settings.
- Tags the clone as a child of the original in the clone family.
- **Cancels all in-progress jobs** on the original integration's connections during the operation. Mention this when scheduling a clone on a running integration.

### Connection remap -- the only place to remap connections

When cloning into a different environment, the cloned integration's flows / exports / imports usually need to point at **different connections** (sandbox NetSuite instead of production NetSuite, dev Shopify instead of prod Shopify). A **connection map** on the clone request is the only place this remap can happen. The format maps old connection ID to new connection ID:

```json
{ "<oldConnectionId>": "<newConnectionId>", "<oldConnectionId2>": "<newConnectionId2>" }
```

(The flow-level clone documented in `building-flows` uses the same `connectionMap` object.)

**Do not defer connection remaps to post-clone updates.** Updating the integration afterward can only mutate the parent integration record -- it cannot remap the connections used by the integration's inside flows / exports / imports. Registering and deregistering connections is an organizational layer (visibility in the integration's connection list), **not** a binding layer -- it does not change which connections the inside resources point at. The clone operation is the only path that performs that binding change. So "clone into another environment and swap connections" is a single clone call with the connection map populated -- not a clone followed by a connection-update sequence.

## Moving resources vs cloning vs transfer

These three operations are easy to confuse.

### Move (within an account)

A **move** re-homes a resource into a different integration while keeping the **same** resource -- its `_id`, execution history, errors, and every reference to it are preserved; only its integration changes. A resource can always be moved back later. Move is **not** clone: clone produces a new resource (new `_id`).

Which resources actually "move" depends on how each relates to an integration -- three tiers:

- **Owned (movable):** flows, APIs, and Tools carry a writable `_integrationId` -- the integration owns them. Moving swaps `_integrationId`; for flows it also clears `_flowGroupingId` (flow groups are per-integration), and the platform auto-registers the resource's step connections in the target integration on save.
- **Registered (not owned):** connections and lookup caches are not owned by an integration -- they are **registered** to its list (and can be registered to several integrations at once). "Move a connection to X" is a register/deregister, not a move.
- **Inherited (move the parent):** exports, imports, AI agents, and guardrails take their integration from the flow / API / Tool that uses them. There is no per-step move -- "move the export" means move its parent flow.

**Integration-App-owned resources cannot be moved.** Resources that carry a `_connectorId` are managed by the connector/template installer, not by free-form moves.

### Transfer (across accounts)

**Integration transfer** is a distinct operation that moves an entire integration (and the resources inside it) from one Celigo **account** to another. Use it when ownership of a body of work changes between organizations or accounts. It is not a resource move (within an account) and not a clone (a copy).

## Environment promotion

Cross-environment clones plus pulls are how work is promoted between environments (for example, development, sandbox, QA, production, and DR). Because cloning preserves clone-family lineage, the cloned integration is eligible for pulls to and from the original -- future changes flow between environments through the ILM workflow.

Duplicating an integration from scratch (creating a fresh integration and manually rebuilding its resources) loses that lineage: the two integrations look alike but are unrelated in the clone family, and ILM operations between them are unavailable. Reach for duplicate-from-scratch only when the ILM relationship is genuinely unwanted.
