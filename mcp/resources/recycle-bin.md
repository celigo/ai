---
uri: celigo://resources/recycle-bin
name: Recycle Bin Reference
description: >-
  The Celigo Recycle Bin — the account-wide soft-delete safety net that
  holds deleted resources for 30 days before automatic purge. Covers the
  deletion lifecycle, cascade restore of dependents, and the
  restore-vs-purge safety asymmetry.
mimeType: text/markdown
---
# Celigo Recycle Bin

The Recycle Bin is the account's **soft-delete safety net**. When a resource is deleted it is not removed immediately — it lands in the Recycle Bin and stays recoverable for **30 days**, after which it is permanently purged automatically. From the bin you can see what was deleted, restore it, or remove it for good ahead of the timer.

The bin is **account-wide** and spans **every resource type** — connections, flows, exports, imports, integrations, scripts, stacks, iClients, APIs, Tools, MCP servers, lookup caches, EDI profiles, file definitions, agents, users, and more. Whatever was deleted is findable here for 30 days regardless of its type.

## Deletion lifecycle

A deleted resource follows a short lifecycle with one timer and three exits:

```
active resource
   |
   |  deleted in its own area (this is what sends it to the bin)
   v
Recycle Bin
   |-- restore --> back to active   (recoverable)
   |-- purge ----> gone forever     (irreversible)
   `-- 30 days --> auto-purged      (irreversible, default exit)
```

- **List** — see what is currently in the bin.
- **Restore** — the recoverable exit; the resource returns to the account, fully usable again.
- **Purge** — the permanent exit, taken early and deliberately instead of waiting for the timer.

The 30-day clock is the default exit: anything not restored or purged is removed automatically when it expires. The bin is a **grace period**, not permanent storage.

Deleting an *active* resource happens in that resource's own area (for example, deleting an export or a flow) — and that delete is what sends the resource to the Recycle Bin. The bin itself owns only the after-deletion lifecycle: list, restore, and purge.

## Cascade — deletes and restores travel together

Deletion **cascades to dependents**, and restore **cascades them back**. When a parent resource is deleted, the dependents deleted alongside it land in the bin too. Restoring the parent performs a **cascade restore** that brings those dependents back with it — so restoring a deleted integration or flow generally revives the steps and child resources that went down with it, without having to restore each piece individually.

The reverse holds for removal: purging a parent removes its dependents as part of what is being purged.

## Restore vs purge — the safety asymmetry

The two ways out of the bin are **asymmetric**, and that asymmetry drives the defaults:

- **Restore is safe.** It returns the resource to active use; if you decide you did not want it, you can simply delete it again. Reversible.
- **Purge is forever.** Once purged, a resource cannot be recovered — there is no second recycle bin behind it. Irreversible.

In most cases an explicit purge is unnecessary — the 30-day auto-purge handles cleanup on its own. Reach for a manual purge only when a resource genuinely needs to be gone *now* (to free something up, or to ensure it is no longer recoverable), and confirm before doing it because it cannot be undone.

## API reference

All Recycle Bin operations live under the `v1/recycleBinTTL` endpoint.

### List deleted resources

`GET /v1/recycleBinTTL` — returns the resources currently held in the bin. Results can be filtered by resource type (case-insensitive); omit the filter to return everything. Each entry contains:

- `model` — the resource type of the deleted item (e.g. `Connection`, `Export`, `Flow`).
- `doc` — the deleted resource document, including `_id`, `name`, and `lastModified` (the deletion timestamp).

### Restore a resource

`POST /v1/recycleBinTTL/{resourceType}/{resourceId}/doCascadeRestore` — restores a deleted resource to the account. This is a **cascade restore**: dependents that were deleted alongside the resource are restored too.

### Purge a resource

`DELETE /v1/recycleBinTTL/{resourceType}/{resourceId}` — permanently deletes a resource from the bin. **This cannot be undone.**

Both restore and purge take the same two path parameters:

- `resourceType` — the API resource type in **plural** form (e.g. `exports`, `connections`, `flows`, `lookupcaches`).
- `resourceId` — the `_id` of the deleted resource, taken from the list response.

### Resource type names

The `model` value returned by the list operation maps to the plural `resourceType` used in the restore and purge paths:

| `model` | `resourceType` (plural) |
|---|---|
| `Connection` | `connections` |
| `Export` | `exports` |
| `Import` | `imports` |
| `Flow` | `flows` |
| `Integration` | `integrations` |
| `Script` | `scripts` |
| `Stack` | `stacks` |
| `IClient` | `iclients` |
| `AccessToken` | `accesstokens` |
| `Agent` | `agents` |
| `Api` | `apis` |
| `LookupCache` | `lookupcaches` |
| `EDIProfile` | `ediprofiles` |
| `FileDefinition` | `filedefinitions` |
| `TradingPartnerConnector` | `tpconnectors` |
| `MCPServer` | `mcpservers` |
| `Tool` | `tools` |
| `User` | `users` |
