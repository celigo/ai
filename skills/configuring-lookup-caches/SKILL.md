---
name: configuring-lookup-caches
description: Configure Celigo lookup cache resources -- in-memory key-value stores used for fast lookups, deduplication, cross-reference resolution, and state tracking during flow execution. Use when creating caches, loading data, referencing caches in import lookups, or managing cache lifecycle.
---

<!-- TIER:1 -->

# Configuring Lookup Caches

A lookup cache is an **in-memory key-value store** managed by Celigo for fast data retrieval during integration processing. Unlike export-based lookups that query external systems per-record, lookup caches provide sub-millisecond access to pre-loaded reference data without consuming API calls.

Lookup caches handle three concerns:

- **Cache metadata** -- name, description, and whether data is included in templates/cloning
- **Data management** -- loading, retrieving, updating, and purging key-value entries via dedicated data endpoints
- **Size governance** -- each cache has a 50 MB limit; the per-environment aggregate limit across all caches is 1 GB

Lookup caches are consumed by import and export mappings through a lookup entry. The entry references a cache by `_lookupCacheId` and optionally extracts a specific field from the cached object via the `extract` JSON path, and a mapping row uses it by name. On an HTTP import the entry goes in `http.lookups`. This is configured on the import/export resource, not on the cache itself.

Used across flows, APIs, and tools.

## "Lookup" -- Which One Is Meant?

"Lookup" is overloaded in Celigo, and a lookup cache is only one thing the word can mean. When a request just says "the lookup," confirm which one before acting -- they live in different places and are configured differently. A single entry in `lookups[]` resolves its value one of three ways:

- **Cached** -- the entry sets `_lookupCacheId` to read a lookup cache (this skill): pre-loaded reference data read in-memory, no per-record external call, as fresh as the last data load.
- **Static map** -- the entry carries an inline `map` object. No cache and no external call; the table travels with the import/export. Best for a handful of stable pairs that rarely change.
- **Live / dynamic** -- the entry issues a per-record query against a connected system (an HTTP request, SOQL, a NetSuite search, SQL). Always-fresh answers, at the cost of one external request per record.

Quick test for which is meant: pre-loaded data read in-memory is a **lookup cache**; an answer that must reflect the source system right now is a **live/dynamic** lookup; a small fixed table living on the step is a **static `map`**.

The same word also names things outside this skill: a mid-flow **lookup step** (an export with `isLookup: true` that fetches from an external system between flow steps) and **transform lookups** (tables inside an export transform's rules). "Lookup" alone is never enough -- listen for whether the subject is stored cache data, an inline rule on a step, a live query, or a separate flow step.

## Use Cases

Lookup caches serve several distinct patterns:

### Cross-Reference / ID Mapping
The most common use case. Map external IDs to internal IDs across systems (e.g., Shopify product IDs to NetSuite internal IDs, external customer GUIDs to Salesforce Account IDs). Avoids repeated API lookups during import processing.

### Deduplication / Debouncing
Track which records were already processed so a repeat is skipped. The cache can't do this on its own: a write is an upsert with no insert-if-absent, so two runs that both read "not there" both proceed. Build it as a [Deduplication Ledger](#deduplication-ledger) -- and when the destination itself can answer "does this exist?", match there instead ([configuring-imports > Writing Exactly Once](../configuring-imports/SKILL.md#writing-exactly-once)).

### State Tracking
Maintain timestamps, batch IDs, or processing markers across flow runs. Common patterns: "last sync time" caches and "open batch ID" holders. A cache is not a lock table -- it has no compare-and-set; serialize work per key with an import's `idLockTemplate` instead.

### Static Reference Data
Store relatively stable reference tables -- product catalogs, category hierarchies, shipping overrides, zip code lookups. Set `includeDataInTemplatesAndCloning: true` when this data is part of the integration's configuration.

## Quick Reference

### Minimum Required Fields

Every lookup cache needs at minimum: `name`.

Optional but common: `description`, `includeDataInTemplatesAndCloning`.

A lookup cache is an account-level resource that lives in one environment. It has no writable `_integrationId`; one sent on create or update is silently dropped. To tie a cache to an integration, register it (`celigo integrations register-lookup-caches <integrationId> <cacheId>`, or `PUT /v1/integrations/{id}/lookupcaches/register` with an array of cache ids), or create it already registered with `POST /v1/integrations/{id}/lookupcaches`. Registration also adds an `aliases[]` entry on the integration (a slug of the cache name), the handle scripts and hooks use for the cache.

### Data Operations

All data operations use the cache ID. Data entries are key-value pairs: keys are strings (1-255 characters, case-sensitive); values may be null, a number, a boolean, a string, or an object, and read back with the type they were written with. Store complex data as an object -- the consuming lookup's `extract` JSON path pulls fields from it. A top-level array value is rejected (400 `invalid_value`), so wrap it (`{"items": [...]}`).

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| Upsert data | POST | `/v1/lookupcaches/{id}/data` | Body: `{ "data": [{ "key": "k", "value": "v" }] }` |
| Get data | POST | `/v1/lookupcaches/{id}/getData` | No body = first page (max 1000). With `{ "keys": [...] }` or `{ "startsWith": "prefix" }` |
| Delete keys | DELETE | `/v1/lookupcaches/{id}/data` | Body: `{ "keys": ["k1", "k2"] }` |
| Purge all | DELETE | `/v1/lookupcaches/{id}/data/purge` | Removes all entries |

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Base fields (create/update):** [request.yml](references/schemas/request.yml) -- name, description, includeDataInTemplatesAndCloning, externalId
- **Response shape:** [response.yml](references/schemas/response.yml) -- includes size, sizeInMB, timestamps, and template or clone origin; no integration field (an integration lists its caches in `_registeredLookupCacheIds`)

### Referencing Caches in Lookups

Lookup caches are consumed through a lookup entry on the import or export that needs the data. See the writing-mappings skill for full lookup configuration details. The key fields:

- `name` -- unique identifier for the lookup within the resource; a mapping row names it in `lookupName`
- `_lookupCacheId` -- references the cache resource
- `extract` -- optional JSON path to pull a specific field from the cached value (e.g., `$.details.price`); without it the whole value is returned
- `default` -- fallback value when the key is not found; ignored when `allowFailures` is `false`
- `allowFailures` -- `false` fails the record on a missing key (`lookupcache_evaluation_failed`); `true` uses the `default`; left out, the record still succeeds, and with no `default` the field is silently missing. Set `false` explicitly when a missing key must stop the record

On an HTTP import the entry goes in `http.lookups`: the save keeps that array and mirrors it to the top-level `lookups`, and drops a `lookups` array sent only at the top level. Save it with a full PUT of the import -- GET it, add the entry and the row's `lookupName`, and send the whole document back -- because an import's PATCH accepts only `debugUntil`. The mapping row's `extract` is the key the cache is read with:

```json
"http": {
  "lookups": [{"name": "skuToItem", "_lookupCacheId": "<cacheId>", "extract": "$.itemCode", "allowFailures": false}]
},
"mappings": [
  {"generate": "itemCode", "dataType": "string", "extract": "$.sku", "lookupName": "skuToItem", "status": "Active"}
]
```

## Related Skills

- [writing-mappings > Add lookups for value translation](../writing-mappings/SKILL.md#6-add-lookups-for-value-translation) -- configuring `lookups[]` with `_lookupCacheId`, `extract`, and `allowFailures`
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- Handlebars in mapping extracts and request templates
- [configuring-imports > How to Build an Import](../configuring-imports/SKILL.md#how-to-build-an-import) -- imports are the primary consumer of lookup caches
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- lookup exports (`isLookup: true`) as an alternative to caches for live data
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring lookups into flow pipelines

<!-- TIER:2 -->

## How to Build a Lookup Cache

### 1. Determine the use case

What data needs to be cached? Cross-reference IDs, static reference tables, deduplication keys, or processing state? This determines data structure, loading strategy, and lifecycle.

### 2. Check for existing caches

Before creating a new cache, search for existing ones in the account:

```bash
# List all lookup caches
celigo lookup-caches list

# Search across the account
celigo account search "lookup cache"
celigo account search "<keyword related to your use case>"
```

### 3. Create the cache

Create the cache metadata first. Data is loaded separately.

```bash
# Create a new empty cache
echo '{"name":"Product SKU to NetSuite ID","description":"Maps Shopify SKUs to NetSuite internal IDs for order import"}' | celigo lookup-caches create

# With template inclusion, then registered on the integration whose flows use it
echo '{"name":"State Shipping Overrides","includeDataInTemplatesAndCloning":true}' | celigo lookup-caches create
celigo integrations register-lookup-caches <integrationId> <cacheId>
```

### 4. Load data into the cache

Use the `put-data` command to upsert key-value entries. The CLI auto-batches by count (1000 entries) and size (5 MB) per request.

```bash
# Upsert entries
echo '{"data":[{"key":"SKU-001","value":{"nsId":"12345","name":"Widget A"}},{"key":"SKU-002","value":{"nsId":"12346","name":"Widget B"}}]}' | celigo lookup-caches put-data <cacheId>

# Simple string values for deduplication
echo '{"data":[{"key":"order-10001","value":"processed"},{"key":"order-10002","value":"processed"}]}' | celigo lookup-caches put-data <cacheId>
```

For large datasets, pipe from a script or file that generates the `{ "data": [...] }` JSON. The CLI handles batching automatically.

### 5. Verify the data

```bash
# Get first page of all data (max 1000 keys)
celigo lookup-caches get-data <cacheId>

# Get specific keys
echo '{"keys":["SKU-001","SKU-002"]}' | celigo lookup-caches get-data <cacheId>

# Get keys by prefix
echo '{"startsWith":"SKU-"}' | celigo lookup-caches get-data <cacheId>

# Check cache size
celigo lookup-caches get <cacheId>
```

### 6. Reference the cache in a lookup

On the import or export resource, add a lookup entry referencing the cache ID (on an HTTP import, in `http.lookups`), name it from the mapping row that needs the value, and set `allowFailures` for what a missing key should do ([Referencing Caches in Lookups](#referencing-caches-in-lookups)). See [writing-mappings > Add lookups for value translation](../writing-mappings/SKILL.md#6-add-lookups-for-value-translation) for the full configuration pattern.

### 7. Plan the data refresh strategy

Lookup caches are not automatically refreshed. Choose a strategy:

- **Manual** -- update data via CLI or API as needed. Good for static reference tables.
- **Flow-driven** -- use a scheduled flow with a postSubmit or preSavePage hook that calls the lookup cache data API to refresh entries. Good for cross-reference caches that need periodic sync.
- **Purge and reload** -- purge all data and reload from scratch on a schedule. Good when the full dataset is small enough to reload quickly.

## Purge vs Delete -- Data vs Resource

Two different operations both sound like "clearing" or "removing" a cache. Choose by blast radius:

- **Purge** empties the data (`celigo lookup-caches purge-data <id>`) while the cache resource and every lookup that references its `_lookupCacheId` stay valid. After a purge, lookups just miss until data is reloaded, so their `default` / `allowFailures` behavior takes over. "Clear the cache" and "start over with fresh data" almost always mean purge.
- **Delete** removes the resource itself (`celigo lookup-caches delete <id>`). Every lookup entry pointing at that `_lookupCacheId` breaks. Reserve delete for "we don't use this cache anymore," and check what still references it first.

Purge can't be undone. The entries come back only if you reload them from their source, so never purge a cache that is the only copy of its data -- a deduplication ledger or a state cache -- unless every record should look new again. Deleting a cache is a soft delete: for 30 days you can restore it from the recycle bin under the same `_id` (`celigo recycle-bin restore <cacheId>`). Whether a restored cache's entries come back isn't documented, so read them after restoring.

Loads are upserts keyed by `key`: re-loading a refreshed dataset overwrites matching keys and adds new ones, but it does **not** remove keys that are absent from the new load. A true "replace the whole table" is therefore purge + reload, not a plain reload.

## Deduplication Ledger

A ledger remembers which keys were processed so a repeat -- a re-fired webhook, a re-run, another flow -- is skipped. Use one only when the destination can't answer "does this exist?"; otherwise match on the destination import ([configuring-imports > Writing Exactly Once](../configuring-imports/SKILL.md#writing-exactly-once)). The wiring decides whether it actually de-duplicates:

1. **Claim with an import step, under a lock.** A cache write is an upsert -- no insert-if-absent, no compare-and-set -- so the claim has to be one import step: an HTTP import to the cache's data endpoint (`POST /v1/lookupcaches/<id>/data`, through a connection to Celigo's own API -- [configuring-connections > Minimum Required Fields](../configuring-connections/SKILL.md#minimum-required-fields) says how to build one) with `ignoreExisting: true`, an ignore lookup that calls `getData` for the record's key, and `idLockTemplate` on the same key. The lock isn't optional: without it, two pages or runs that both read a miss both write. A hook that calls `getData` and then writes has the same race and no lock to close it. Point the ignore lookup's `extract` at the entry's value (`data[0].value`): a keyed `getData` returns an entry for a miss too, with the `key` echoed and an `error` instead of `value`, so an extract of `data`, `data[0]` or `data[0].key` is never empty and the import ignores every record. Give every ledger entry a non-empty value, because an empty one reads as not found. Write the lookup's request in `body` with the record's fields named at the top level (`{{orderId}}`, not `{{record.orderId}}`); a `postBody` isn't sent ([configuring-imports > Gotchas](../configuring-imports/SKILL.md#gotchas)).
2. **Let ignored records through, then filter.** A record the ledger ignores still continues to the next step. Response-map the ledger step's `ignored` flag onto the record (`{"extract": "ignored", "generate": "alreadyDone"}`) and give the destination import a filter that drops records where `alreadyDone` is true ([configuring-filters](../configuring-filters/SKILL.md#import-filter-import-filter)).
3. **Mark processed; never delete after processing.** A cache emptied as records are handled is a queue, not a ledger: a record that wrote one step and failed the next never reaches the delete, so the next run writes it again, and a later repeat of the same event looks new. Keep the entry with a status and timestamp in its value, have any flow that reads the cache as its source skip processed entries, and delete old entries by key on a schedule (`delete-data`; caches have no TTL).
4. **The claim lands before the destination write.** If the destination step then fails, retry that step's error (`celigo flows retry-errors <flowId> <importId> <retryDataKey>`) -- a fresh run would find the claim and skip the record for good.

## CLI Commands

```bash
# CRUD
celigo lookup-caches list
celigo lookup-caches get <id>
celigo lookup-caches create < cache.json
celigo lookup-caches update <id> < cache.json
celigo lookup-caches set <id> key=value [key2=value2 ...]
celigo lookup-caches delete <id> [-y]

# Register on an integration (the only tie a cache has to one)
celigo integrations register-lookup-caches <integrationId> <id>

# Data operations
echo '{"data":[{"key":"k","value":"v"}]}' | celigo lookup-caches put-data <id>
celigo lookup-caches get-data <id>                                      # first page, all keys
echo '{"keys":["k1","k2"]}' | celigo lookup-caches get-data <id>       # specific keys
echo '{"startsWith":"prefix"}' | celigo lookup-caches get-data <id>     # prefix search
echo '{"keys":["k1","k2"]}' | celigo lookup-caches delete-data <id> [-y]
celigo lookup-caches purge-data <id> [-y]
```

<!-- TIER:3 -->

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this.
2. **Data upsert uses POST, not PUT.** `POST /v1/lookupcaches/{id}/data` upserts entries. This is different from the resource-level PUT that updates cache metadata.
3. **Values keep their JSON type -- except top-level arrays.** Null, number, boolean, string, and object values round-trip as written. A top-level array, or an object with its own top-level `key` property, fails the whole batch with 400 `invalid_value` and nothing is written; wrap arrays (`{"items": [...]}`). Store objects as objects, not JSON strings, so the lookup's `extract` path can read their fields.
4. **50 MB per cache, 1 GB per environment.** Caches near the 50 MB limit, such as a large NetSuite item cache, risk hitting the ceiling on the next upsert. Monitor `size` and `sizeInMB` on the response.
5. **`get-data` returns max 1000 keys per call.** For caches with more than 1000 entries, use `startsWith` prefix queries or specific key lookups to retrieve data.
6. **No automatic TTL or expiry.** Lookup cache data persists until explicitly deleted or purged. Stale data is a common source of bugs -- plan a refresh strategy.
7. **`includeDataInTemplatesAndCloning` defaults to false.** If the cache data is part of the integration's configuration (static reference tables, shipping overrides), set this to `true` or the data will be lost when cloning or installing from a template.
8. **Sandbox and production caches are separate.** A `sandbox: true` cache is only accessible to sandbox flows. Production flows cannot read sandbox caches and vice versa.
9. **Deleting a cache is a soft delete.** The cache is retained for 30 days before permanent removal. During this window, a cache with the same name cannot be re-created with the same `_id`.
10. **A cache write is an upsert -- there is no insert-if-absent.** Writes never fail because a key exists, so a "first writer wins" claim built from a read then a write (two steps, or a hook) lets every concurrent writer win. The claim holds only as one import step with `ignoreExisting` + an existence lookup + `idLockTemplate` on the key ([Deduplication Ledger](#deduplication-ledger)).

## Safe Lookup-to-Update -- Never Write Off an Unguarded First Match

Cross-reference resolution -- the flagship cache use case -- resolves a key (an internal ID, an account ID) that then feeds a downstream update or write. A cache read returns exactly one value per key, so resolving on a genuinely unique key (an external ID, a primary key) is safe by construction. The danger lives in any lookup that **can return more than one match** -- typically a live/dynamic lookup on a fuzzy or human key (name, email, phone number), where duplicates are normal.

Feeding the first result (`data[0]`) of a multi-match-capable lookup into an update writes an arbitrary wrong record on every duplicate -- a silent data-corruption bug, not a skipped record, and one wrong-record update is worse than a skipped record. Never feed, skip on, or branch on an unguarded first match. Guard it one of two ways:

- Configure the resolving lookup to **fail or skip the record on multiple matches**, so a duplicate never reaches the write, OR
- **Check that the result count equals one** before the write -- an input filter on the writing step, or a `postResponseMap` hook that drops or errors records whose lookup returned more than one result.

Make the guard explicit when you build a lookup-then-update: a bare `data[0]` mapping paired with an assumption that the lookup "should" return a single match is exactly the shape that corrupts data in production.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 on data upsert | Entries exceed 5 MB batch limit or individual entry too large | Reduce batch size; the CLI auto-batches at 1000 entries / 5 MB |
| 400 `invalid_value` on data upsert | A top-level array value, an object with its own top-level `key` property, or a missing value -- one bad entry fails the whole batch and nothing is written | Wrap arrays in an object (`{"items": [...]}`), fix the entry, and resend the batch |
| 400 `cache_dynamodb_invalid_key` on data upsert | Empty, missing, or over-255-character key | Fix the key and resend the batch |
| 404 on data operations | Cache ID does not exist or was deleted | Verify the cache ID with `celigo lookup-caches get <id>` |
| A looked-up field is missing from the request, with no error | The key isn't in the cache, and the lookup leaves `allowFailures` out with no `default` | Check that the cache is populated and the key format matches exactly (case-sensitive); set `allowFailures: false` to fail such records, or `true` with a `default` |
| `lookupcache_evaluation_failed`: "<field>: The lookup cache could not be evaluated. Check the value in the key '<key>', and try again." | The key isn't in the cache, and the lookup has `allowFailures: false` | Load the key, or fix the value the mapping row extracts, then retry the failed records |
| Every record fails with "Unable to find lookup in mapping configs - <name>" | The mapping names a lookup the import doesn't have -- on an HTTP import, often one sent only in the top-level `lookups`, which the save drops | Put the entry in `http.lookups` under that name |
| Lookup returns full object instead of field | Missing `extract` path on the lookup definition | Add `extract: "$.fieldName"` to the lookup entry on the import/export |
| 403 on cache operations | Account does not have the Lookup Cache license | Contact Celigo to enable the lookup cache feature |
| Cache size approaching 50 MB | Too much data for a single cache | Purge stale entries, split into multiple caches by category, or archive old data |
| Downstream update modifies the wrong record | The first result (`data[0]`) of a multi-match-capable lookup was fed into a write with no single-match guard | Configure the lookup to fail/skip on multiple matches, or verify the result count equals one before writing |
| "Clearing" a cache breaks every lookup that used it | The cache resource was deleted instead of having its data purged | Use `purge-data` to empty entries while keeping references valid; delete only to retire the cache entirely |
| Repeats still processed despite a dedup cache | Existence checked outside the write (a lookup step or hook) with no lock, or entries deleted after processing (a queue, not a ledger) | Make the claim one import step with `ignoreExisting` + lookup + `idLockTemplate`; mark entries processed instead of deleting them ([Deduplication Ledger](#deduplication-ledger)) |
