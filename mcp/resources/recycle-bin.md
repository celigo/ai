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

The bin is **account-wide**, but some deletes can't be undone: an iClient or a user is deleted for good, a sync never enters the recycle bin, the bin doesn't serve access tokens or HTTP connectors, and a deleted network policy, end-user group or role can't be restored today. Most other resources stay restorable for 30 days; [Resource type names](#resource-type-names) lists the types the bin holds. Restore with dependents (`celigo recycle-bin restore <id> --cascade`): a plain restore fails with `descendants_not_restored` while one of its dependents is still in the bin.

**On the MCP server**, the only recycle-bin tools are for Celigo Storage: `list_storage_items` with `deleted: true` lists deleted files and folders, and `restore_storage_item` restores one. Listing the rest of the bin, restoring any other resource, and every purge need the CLI (`celigo recycle-bin list|get|restore|purge`), the routes below, or the UI.

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

While a resource is in the bin, its normal routes answer 404 and lists leave it out, but it still counts as a reference: a deleted connection still blocks deleting the iClient it points at, and deleted steps still block purging the topic they used, until they're purged.

## Cascade — restores travel together, deletes and purges don't

A delete removes only the resource you name: deleting a flow leaves its exports, imports and scripts in place, and an integration can't be deleted while it still holds flows. Delete each dependent you mean to remove. A **cascade restore** works the other way: it brings back the parent together with its dependents that are in the bin — a flow with the steps and scripts it uses — without restoring each piece individually. A plain restore of the parent is refused while any of them is still in the bin.

Purges don't cascade either. A purge removes only the resource you name, and it's refused with 422 (`this document is referenced by Flow : <id>`) while another bin entry still references it: a deleted flow references its integration and the exports and imports it used, and a deleted import references the script its hook runs, so purge the flow before them and the import before its script. Purging the flow leaves the rest in the bin. A few purges reach further: purging an integration purges its Celigo Storage folder, a storage folder's purge takes its descendants, purging a connection permanently deletes the end users' own copies of it (their MCP connections), and purging a topic deletes its stored messages.

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
- `doc` — the deleted document, abridged: `_id`, `name` and `lastModified`, plus `deletedAt` on some types (lookup caches, tools, topics, MCP servers and storage items carry it; exports, imports, flows and connections don't). The list is sorted by `lastModified`, newest first.

### Read one deleted resource

`GET /v1/recycleBinTTL/{resourceType}/{resourceId}` (the CLI's `celigo recycle-bin get <id>`) returns the deleted document whole, including fields the list leaves out (a script's `content`, a connection's `queues`), so you can show what a deleted resource looked like or compare it field by field with a recreated copy. Storage items can't be read this way (501).

### Restore a resource

`POST /v1/recycleBinTTL/{resourceType}/{resourceId}/doCascadeRestore` — restores a deleted resource to the account together with its dependents that are in the bin (a **cascade restore**). Prefer it for integrations and flows.

`POST /v1/recycleBinTTL/{resourceType}/{resourceId}` — restores that one resource only. It's refused with 422 `descendants_not_restored` while one of its dependents is still in the bin; restore the dependent first, or use the cascade restore.

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

The bin's routes accept network policies and end-user groups and roles, but deleted ones can't be restored or purged today: the listing shows the environment's live policies and groups in their place (and no roles), and restore and purge refuse those live entries. Keep a copy of a policy, group or role before deleting it. iClients, syncs, and users are deleted permanently, and the bin's routes refuse access tokens, HTTP connectors, and trading-partner connectors.

Deleted Celigo Storage files and folders keep counting toward the storage quota until they're purged, and restoring one fails with 409 `STORAGE_ITEM_ALREADY_EXISTS` while a live item holds its name: the CLI's restore can send a new name (`--file` with `{"name": "<new name>"}`), the MCP tool can't.
