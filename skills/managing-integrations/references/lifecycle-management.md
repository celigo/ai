# Integration Lifecycle Management (ILM) -- Reference

Deep reference for evolving integrations across environments. ILM is Celigo's git-style workflow: develop changes in a clone, then merge them back into the original. It runs at the **integration level**, not the resource level -- you do not pull an individual flow, you pull the whole integration (and its flows, APIs, Tools, exports, imports, connections, and scripts).

Pulls, reverts, and ignore-field configuration run only in the Celigo UI (the integration's **Revisions** tab); there is no API or CLI path to start a pull or a revert. Snapshots and the revision history are scriptable: `celigo integrations create-snapshot <id> --description "<label>"` takes a snapshot, and `celigo integrations revisions`, `revision`, `revision-diff`, and `revision-errors` read the history. The current ignore configuration is the integration's `iLMIgnore` field (`celigo integrations get <id>`).

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
- A clone created as a plain one-shot copy (`celigo integrations clone`, or directly through the public API) appears in the clone family but is **standalone**.

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

Canceled revisions drop their diff, and a failed pull or revert has none: read its error records instead (`celigo integrations revision-errors <id> <revisionId>`). An id written `<type> - <id>.deleted` in those messages is the change set's marker, not the resource's state -- the resource may still exist, so check before calling it deleted or restoring anything from the recycle bin.

### Common ILM workflow shapes

- **Pre-deploy snapshot.** Before making big changes to a production integration, snapshot it -- this gives a known-good state to revert to if things go wrong.
- **Sandbox to production pull.** Develop in a cross-environment clone; when ready, pull from the clone into the production integration. The pull merges the changes; the auto-created snapshots bookend the merge.
- **Revert a bad pull.** If a pull introduced a regression, revert to either the pre-pull snapshot or the prior known-good revision.

## Ignore fields -- what stays per-environment

When pulling changes between integrations in different environments, some fields should **not** cross -- environment-specific URLs, sandbox vs production IDs, environment-tagged settings, and the like. The integration's **ignore fields** name them: per resource type, you choose specific fields from the platform's list of ignorable fields -- for example an export's `name` or `http.body`, or a flow's `disabled` -- and each choice applies to that field on every resource of that type in the integration. There are no wildcards such as `connection.*`, so name the specific fields when advising.

Behavior:

- The pull respects the ignore list: ignored fields stay at their **current value on the receiving side**, regardless of what the source integration has.
- **Creation and deletion of resources are never affected by ignore fields** -- only field-level updates to existing resources.
- Ignore fields are configured at the integration level and apply to **every** pull and revert involving that integration. Configure once; it applies to all future pulls and reverts.

## Cloning details and connection remap

Cloning is the foundational integration operation. It produces a copy of the integration (and its inside resources) and joins the new copy to the original's clone family. Two shapes:

- **Same-environment clone** -- duplicates the integration inside the same environment. Useful for "copy the working integration and modify the copy" workflows.
- **Cross-environment clone** -- duplicates the integration into a different environment (development, sandbox, QA, production, or DR). Cross-environment clones are the **entry point** to the ILM workflow -- develop in the clone, then pull the changes back into the original.

Both are for plain integrations. The platform refuses to clone resources installed from an Integration App and refuses lifecycle calls on one (`not_supported`); an Integration App is installed in each environment instead -- see [Plain Integrations vs Integration Apps](../SKILL.md#plain-integrations-vs-integration-apps).

The clone operation:

- Clones the integration record, the flows, the APIs and Tools, the scripts, and the settings. Connections aren't cloned: each registered connection is reused as the connection map names it (itself, or an existing connection in the target environment).
- Tags the clone as a child of the original in the clone family.
- **Cancels all in-progress jobs** on the original integration's connections during the operation. Mention this when scheduling a clone on a running integration.

### Connection remap -- at clone time, or replace afterward

When cloning into a different environment, the cloned integration's flows / exports / imports usually need to point at **different connections** (sandbox NetSuite instead of production NetSuite, dev Shopify instead of prod Shopify). A **connection map** on the clone request sets them. It must list every registered connection, mapped to itself (same environment) or to an existing connection in the target environment, so create or choose the target's connections before the clone. The format maps old connection ID to new connection ID:

```json
{ "<oldConnectionId>": "<newConnectionId>", "<oldConnectionId2>": "<newConnectionId2>" }
```

(The flow-level clone documented in `building-flows` uses the same `connectionMap` object.)

Omitting the map or sending `{}` fails with 400 `invalid_connectionMap`; leaving out a registered connection, or naming one the source doesn't use, fails with `invalid_connectionId`. The CLI builds a self-map only when nothing is piped, so a piped map that remaps one connection must still list the rest.

**Set the map at clone time when you can; to repoint afterward, replace the connection, not the integration record.** Updating the integration can only mutate the parent integration record, and registering or deregistering connections is an organizational layer (visibility in the integration's connection list), **not** a binding layer -- neither changes which connections the inside resources point at. To repoint an existing flow, API, or Tool, replace the connection on it (`celigo flows replace-connection <flowId> <oldConnectionId> <newConnectionId>`, or `apis` / `tools replace-connection`); one call swaps every step. The new connection must be of the same type, and for HTTP it should reach the same application, because the steps keep their relative URIs. Replacing a connection on a flow cancels the flow's in-flight runs. Don't re-clone to fix connections: a second clone is a second integration with new ids.

## Moving resources vs cloning vs transfer

These three operations are easy to confuse.

### Move (within an account)

A **move** re-homes a resource into a different integration while keeping the **same** resource -- its `_id`, execution history, errors, and every reference to it are preserved; only its integration changes. A resource can always be moved back later. Move is **not** clone: clone produces a new resource (new `_id`).

Which resources actually "move" depends on how each relates to an integration -- three tiers:

- **Owned (movable):** flows, APIs, and Tools carry a writable `_integrationId` -- the integration owns them. Moving is a save with the target `_integrationId`; a flow must drop its `_flowGroupingId` in the same save (flow groups are per-integration, so a stale one fails with 422 `flowgrouping_not_belong`), and the platform registers the resource's step connections in the target integration on save. Only builder-mode APIs belong to an integration -- a script-mode API is account-level, and the platform drops its `_integrationId`. Don't move abstract or instance flows: the UI offers no Move for a multi-instance family, and moving them one at a time splits it across integrations.
- **Registered (not owned):** connections and lookup caches are not owned by an integration -- they are **registered** to its list (and can be registered to several integrations at once). "Move a connection to X" is a register/deregister, not a move.
- **Inherited (move the parent):** exports, imports, AI agents, and guardrails take their integration from the flow / API / Tool that uses them. There is no per-step move -- "move the export" means move its parent flow.

**Integration-App-owned resources cannot be moved.** Resources that carry a `_connectorId` are managed by the connector/template installer, not by free-form moves.

### Transfer (across accounts)

**Integration transfer** is a distinct operation that moves an entire integration (and the resources inside it) from one Celigo **account** to another. Use it when ownership of a body of work changes between organizations or accounts. It is not a resource move (within an account) and not a clone (a copy).

## Environment promotion

Cross-environment clones plus pulls are how work is promoted between environments (for example, development, sandbox, QA, production, and DR). Because cloning preserves clone-family lineage, the cloned integration is eligible for pulls to and from the original -- future changes flow between environments through the ILM workflow.

Duplicating an integration from scratch (creating a fresh integration and manually rebuilding its resources) loses that lineage: the two integrations look alike but are unrelated in the clone family, and ILM operations between them are unavailable. Reach for duplicate-from-scratch only when the ILM relationship is genuinely unwanted.
