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

The bin is **account-wide**, but some deletes can't be undone: an iClient or a user is deleted for good, a sync never enters the recycle bin, and the bin doesn't serve access tokens or HTTP connectors. Most other resources stay restorable for 30 days; [Resource type names](#resource-type-names) lists the types the bin holds. Restore with dependents (`celigo recycle-bin restore <id> --cascade`): a plain restore fails with `descendants_not_restored` while something deleted with it is still in the bin.

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

Deletion **cascades to dependents**, and a **cascade restore** brings them back. When a parent resource is deleted, the dependents deleted alongside it land in the bin too. A cascade restore of the parent brings those dependents back with it — so cascade-restoring a deleted integration or flow generally revives the steps and child resources that went down with it, without having to restore each piece individually. A plain restore of the parent is refused while any of them is still in the bin.

The reverse holds for removal: purging a parent removes its dependents as part of what is being purged.

## Restore vs purge — the safety asymmetry

The two ways out of the bin are **asymmetric**, and that asymmetry drives the defaults:

- **Restore is safe.** It returns the resource to active use; if you decide you did not want it, you can simply delete it again. Reversible.
- **Purge is forever.** Once purged, a resource cannot be recovered — there is no second recycle bin behind it. Irreversible.

In most cases an explicit purge is unnecessary — the 30-day auto-purge handles cleanup on its own. Reach for a manual purge only when a resource genuinely needs to be gone *now* (to free something up, or to ensure it is no longer recoverable), and confirm before doing it because it cannot be undone.

## API reference

All Recycle Bin operations live under the `v1/recycleBinTTL` endpoint.

### List deleted resources

`GET /v1/recycleBinTTL` — returns the resources currently held in the bin; `GET /v1/recycleBinTTL/{resourceType}` returns one type's deleted documents, with the type spelled exactly as in [Resource type names](#resource-type-names). Each entry of the full listing contains:

- `model` — the resource type of the deleted item (e.g. `Connection`, `Export`, `Flow`).
- `doc` — the deleted resource document, including `_id`, `name`, and `lastModified` (the deletion timestamp).

### Restore a resource

`POST /v1/recycleBinTTL/{resourceType}/{resourceId}/doCascadeRestore` — restores a deleted resource to the account together with the dependents deleted alongside it (a **cascade restore**). Prefer it for integrations and flows.

`POST /v1/recycleBinTTL/{resourceType}/{resourceId}` — restores that one resource only. It's refused with 422 `descendants_not_restored` while a dependent deleted with it is still in the bin; restore the dependent first, or use the cascade restore.

### Purge a resource

`DELETE /v1/recycleBinTTL/{resourceType}/{resourceId}` — permanently deletes a resource from the bin. **This cannot be undone.**

Both restore and purge take the same two path parameters:

- `resourceType` — the API resource type in lowercase **plural** form (e.g. `exports`, `connections`, `flows`, `lookupcaches`); any other spelling is refused.
- `resourceId` — the `_id` of the deleted resource, taken from the list response.

### Resource type names

These are the types the bin holds. The `model` value returned by the list operation maps to the plural `resourceType` used in the paths:

| `model` | `resourceType` (plural) |
|---|---|
| `Connection` | `connections` |
| `Export` | `exports` |
| `Import` | `imports` |
| `Flow` | `flows` |
| `Integration` | `integrations` |
| `Script` | `scripts` |
| `Stack` | `stacks` |
| `Agent` (on-premise agent) | `agents` |
| `Api` | `apis` |
| `LookupCache` | `lookupcaches` |
| `EDIProfile` | `ediprofiles` |
| `FileDefinition` | `filedefinitions` |
| `McpServer` | `mcpservers` |
| `Tool` | `tools` |
| `AsyncHelper` | `asynchelpers` |
| `Topic` | `topics` |
| `NetworkPolicy` | `networkpolicies` |
| `Group` (end-user group) | `groups` |
| `Role` (end-user role) | `roles` |
| `IDPConfig` (identity-provider config) | `idpconfigs` |
| `StorageItem` (Celigo Storage file or folder) | `storageitems` — list only; restore or purge it through Celigo Storage |

Network policies are accepted by the bin's routes, but a deleted policy may not appear in the listing. iClients, syncs, and users are deleted permanently, and the bin's routes refuse access tokens, HTTP connectors, and trading-partner connectors.
