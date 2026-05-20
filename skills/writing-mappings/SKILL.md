---
name: writing-mappings
description: Write field mappings and transforms in Celigo integrations. Covers Mapper 2.0 (imports), Transformation 2.0 (exports), lookups, response mapping, and Mapper 1.0 (NetSuite/Salesforce). Use when editing mappings[], transform{}, responseMapping, or lookup configurations.
---

<!-- TIER:1 -->

# Writing Mappings and Transforms

Mappings and transforms are the **data reshaping layer** in Celigo integrations. They control how fields from one system translate into fields for another. Mappings are used across flows, APIs, and tools.

## Mapping Systems

Four systems handle data reshaping:

- **Mapper 2.0** -- modern recursive field mapping on imports (`mappings[]` array). Handles nested objects, arrays of any depth, lookups, conditionals, and date conversions. Default for new imports on all adaptor types except NetSuite and Salesforce
- **Mapper 1.0** -- legacy flat mapping on NetSuite and Salesforce imports (`mapping.fields[]` / `mapping.lists[]`). Body-level and sublist fields in separate flat arrays. Also present on many older HTTP/FTP/RDBMS imports created before Mapper 2.0 existed
- **Transformation 2.0** -- rule-based data reshaping on exports (`transform.expression.rulesTwoDotZero`). Uses the same Mapper 2.0 schema internally. Two modes: "create" (build new record from scratch) or "modify" (edit fields on existing record, unmapped fields pass through)
- **Response mapping** -- simple extract/generate pairs that carry data from a lookup or import response back into the record (`responseMapping` on flow `pageProcessors[]`). Uses Transformation 1.0 syntax

Lookups are shared across all systems -- static key-value maps or references to LookupCache resources for large/dynamic datasets. NetSuite imports use a distinct lookup system that queries live NetSuite records.

## Quick Reference

### Which Mapping System?

| Context | System | Syntax | Read schema |
|---|---|---|---|
| Import field mapping (HTTP, RDBMS, FTP, S3, etc.) | Mapper 2.0 | `mappings[]` | [mappings.yml](references/schemas/mappings.yml) |
| NetSuite/Salesforce import | Mapper 1.0 | `mapping.fields[]` | see import schema ([netsuitedistributed.yml](../configuring-imports/references/schemas/netsuitedistributed.yml), [salesforce.yml](../configuring-imports/references/schemas/salesforce.yml)) |
| Export data reshaping | Transformation 2.0 | `transform{}` | [transform.yml](references/schemas/transform.yml) |
| Response mapping (lookup/import carry-back) | Transformation 1.0 | extract/generate pairs | [response-mapping.yml](references/schemas/response-mapping.yml) |
| Value translation | Lookups | `lookups[]` | [lookups.yml](references/schemas/lookups.yml) |

**Editing existing imports:** Many existing imports use Mapper 1.0 even for HTTP and RDBMS adaptor types (pre-dating Mapper 2.0). Always check whether an import uses `mappings[]` (2.0) or `mapping.fields[]` (1.0) before modifying -- never mix the two.

### Schema Index

| Schema | Contents |
|---|---|
| [mappings.yml](references/schemas/mappings.yml) | Mapper 2.0 field definitions (generate, extract, dataType, buildArrayHelper, conditionals) |
| [lookups.yml](references/schemas/lookups.yml) | Static and dynamic lookup definitions |
| [transform.yml](references/schemas/transform.yml) | Transformation 2.0 envelope (mode, expression, script) |
| [response-mapping.yml](references/schemas/response-mapping.yml) | Transformation 1.0 extract/generate pairs for response carry-back |
| [netsuitedistributed.yml](../configuring-imports/references/schemas/netsuitedistributed.yml) | NetSuite Mapper 1.0 mapping + lookups |
| [salesforce.yml](../configuring-imports/references/schemas/salesforce.yml) | Salesforce Mapper 1.0 mapping |

## Related Skills

- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- import adaptor types, operation logic, hooks
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- export adaptor types, delta syncs, webhooks
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- Handlebars expressions used inside mapping `extract` fields
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring exports and imports into a flow pipeline

<!-- TIER:2 -->

## Mapper 2.0 Workflow

The `mappings[]` array is **recursive** -- a mapping can contain nested child mappings of the same structure to any depth. This is the core design principle.

### 1. Check the existing resource

Before modifying mappings, always retrieve the current state of the resource. Check whether it uses Mapper 2.0 (`mappings[]`) or Mapper 1.0 (`mapping.fields[]`).

```bash
celigo imports get <importId>
celigo account search <keyword>
```

### 2. Understand the source data shape

Invoke the upstream export to see real records, or query the source system's metadata for the full field list.

```bash
celigo exports invoke <exportId>
celigo metadata fields <sourceConnectionId> <entityType>
```

### 3. Understand the target data shape

Query metadata for the target system to discover required fields and types.

```bash
celigo metadata types <targetConnectionId>
celigo metadata fields <targetConnectionId> <entityType>
```

### 4. Choose the input context

The **input context** controls what data is available to extract paths. Set via the "Input context" dropdown in the mapper UI:

- **`record`** (default) -- extract paths reference the record directly. `$.user_id` accesses the `user_id` field on the record
- **`envelope`** -- extract paths reference a wrapper object containing `record`, `job`, `settings` (with `connection`, `flow`, `integration`, `flowGrouping`), `iClient`, and `import`. Record fields shift to `$.record.user_id`, but you gain access to metadata like `$.settings.connection.api_username`, `$.job.type`, `$.settings.flow.fieldName`

**When to use envelope:** APIs and tools where you need request context (headers, path params, query params, connection settings) directly in mappings without Handlebars. Also useful on transforms at the beginning of API/tool steps where the envelope exposes the full request context. Envelope context eliminates the need for `{{settings.connection.fieldName}}` Handlebars expressions -- use `$.settings.connection.fieldName` instead.

### 5. Map by data type

Every mapping needs three properties: `generate` (target field name), `dataType` (output type), and `extract` (how to get data from source).

**Extract supports three patterns** (distinguished by syntax):
- **JSON path** -- starts with `$.` (e.g., `$.customer.email`). Always references the top-level root, even in nested mappings
- **Handlebars** -- contains `{{` (e.g., `{{record.firstName}} {{record.lastName}}`). For computed values
- **Hard-coded** -- plain string literal (e.g., `"Active"`, `"USD"`). Neither `$.` prefix nor `{{`

**Simple types** (string, number, boolean, date) -- direct field-to-field mapping. For dates, set `extractDateFormat`/`generateDateFormat` for conversion.

**Objects** -- set `dataType: "object"`, add child mappings in the `mappings[]` array. Never use dot notation in `generate`.

**Arrays** -- set `dataType` to an array type (`stringarray`, `numberarray`, `booleanarray`, `objectarray`, `arrayarray`) and configure `buildArrayHelper[]`. Three patterns for object arrays:
- **Extract only** -- pull existing objects from source (`extract: "$.items[*]"`)
- **Mappings only** -- construct objects from individual fields (each `buildArrayHelper` entry creates one array element)
- **Extract + mappings** -- iterate a source array and reshape each element. Uses the **composite object mechanism**: array brackets `[*]` in the extract path collapse to single objects inside the mappings, so `$.orders[*].items[*]` becomes `$.orders.items.fieldName` in child extract paths. Parent context remains accessible (e.g., `$.orders.id`, `$.customerName`)

### 6. Add lookups for value translation

Define lookups alongside mappings and reference them by name via `lookupName` on any mapping.

- **Static** -- `map` object with key-value pairs. Best for small, fixed sets (country codes, status values)
- **Dynamic** -- `_lookupCacheId` referencing a LookupCache resource, with optional `extract` JSON path to pull a specific field from the cached object
- Set `allowFailures: true` + `default` to continue processing when lookup keys are missing

### 7. Add conditionals where needed

Control when a mapping applies: `record_created` (only on insert), `record_updated` (only on update), or `extract_not_empty` (skip when source is null/empty).

### Schema reference

All Mapper 2.0 field definitions: [mappings.yml](references/schemas/mappings.yml), [lookups.yml](references/schemas/lookups.yml)

## Transformation 2.0 Workflow

Transformation 2.0 reshapes data **on exports** before it enters the pipeline. It wraps Mapper 2.0 syntax in a transform envelope with a mode selector.

### 1. Check the existing resource

Before modifying transforms, retrieve the current export to inspect any existing transform configuration.

```bash
celigo exports get <exportId>
celigo account search <keyword>
```

### 2. Choose the mode

- **`create`** -- build a completely new record. Only mapped fields appear in output. Use when the output structure differs significantly from the source
- **`modify`** -- edit specific fields on the existing record. Unmapped fields pass through unchanged. Use for surgical adjustments (rename, add, remove a few fields)

### 3. Write the mappings

Same Mapper 2.0 syntax: `generate`, `dataType`, `extract`, nested `mappings`, `buildArrayHelper`, lookups. Everything described in the Mapper 2.0 section above applies here, including input context.

**Input context is especially valuable on transforms for APIs and tools** -- set it to `envelope` to access the full request context (headers, path params, query params, connection settings) directly via JSON path instead of Handlebars.

### 4. Configure the transform envelope

Set `transform.type: "expression"`, `expression.version: "2"`, then place `mappings[]` and `lookups[]` under `expression.rulesTwoDotZero` with the chosen `mode`.

**Script alternative:** Set `transform.type: "script"` with `script._scriptId` and `script.function` for programmatic transforms when expression rules aren't sufficient.

### Schema reference

All Transformation 2.0 field definitions: [transform.yml](references/schemas/transform.yml), [mappings.yml](references/schemas/mappings.yml), [lookups.yml](references/schemas/lookups.yml)

## Mapper 1.0 Reference (NetSuite and Salesforce)

NetSuite and Salesforce imports use the older flat mapping structure. Two arrays within the `mapping` object:

- **`mapping.fields[]`** -- body-level field mappings. Each entry has `extract` (source path) or `hardCodedValue` (static value), `generate` (target field ID), and optional `lookupName`, `dataType`, `internalId`, `immutable`, `discardIfEmpty`, `conditional`
- **`mapping.lists[]`** -- sublist/line-item mappings. Each entry has `generate` (sublist ID, e.g., `"item"`), `jsonPath` (source array path), and `fields[]` (column mappings with the same properties as body fields, plus `isKey` for matching existing lines)

**NetSuite lookups are different** -- they query live NetSuite records using `recordType`, `searchField`, `resultField`, and `operator`. Not static maps. Defined in `netsuite_da.lookups[]`, referenced by `lookupName` in field mappings. To discover valid field IDs for `searchField` and `resultField`, run `celigo metadata fields <connectionId> <recordType>` — the returned field IDs are the exact values to use.

**Salesforce lookups** follow the same Mapper 1.0 pattern but the lookup structure is simpler.

**Sublist field discovery:** For NetSuite `mapping.lists[].generate`, the sublist name (e.g., `"item"`, `"addressbook"`) comes from `celigo metadata fields <connectionId> <recordType>` — sublists appear as field groups. For Salesforce related lists, use `celigo metadata fields <connectionId> <sObjectType>` to discover relationship fields and child object names for `distributed.relatedLists[].sObjectType`.

### Schema reference

NetSuite Mapper 1.0: see `mapping` and `lookups` in the configuring-imports skill's [netsuitedistributed.yml](../configuring-imports/references/schemas/netsuitedistributed.yml)
Salesforce Mapper 1.0: see `mapping` in the configuring-imports skill's [salesforce.yml](../configuring-imports/references/schemas/salesforce.yml)

## Response Mapping Reference (Transformation 1.0)

Response mapping extracts fields from a lookup or import API response back into the original record. It lives on the flow's `pageProcessors[]` entry, not on the resource itself -- but it's planned when building the resource.

Two sections:
- **`fields.type[]`** -- field-level extract/generate pairs using dot notation
- **`lists.type[]`** -- array mappings with `generate` (target array name) and `fields[]` (column mappings)

**For lookup exports:** the response contains `data[]` and `errors[]`. Use `data[0].fieldName` for single results, `data[*].fieldName` when multiple results are expected.

**For imports:** the response is available via `_json`. Use `_json.fieldName` (e.g., `_json.id` for a created record's ID, `_json.output.1.content.0.text` for AI model responses).

### Schema reference

All response mapping field definitions: [response-mapping.yml](references/schemas/response-mapping.yml)

## CLI Commands

```bash
# Discover resources
celigo account search <keyword>              # Find imports/exports by name
celigo imports get <importId>                 # Inspect existing import (check mappings vs mapping)
celigo exports get <exportId>                 # Inspect existing export (check transform)

# Understand data shapes
celigo exports invoke <exportId>              # See real source records
celigo metadata types <connectionId>          # List entity types
celigo metadata fields <connectionId> <type>  # List fields for an entity

# Update mappings (GET -> modify -> PUT)
celigo imports set <importId> <key>=<value> [<key2>=<value2> ...]   # Field-level edit (dot/bracket paths, JSON values)
celigo exports set <exportId> <key>=<value> [<key2>=<value2> ...]
celigo imports update <importId> < import.json                      # Full PUT replace from stdin JSON
celigo exports update <exportId> < export.json
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before submitting any mapping configuration, verify:

- [ ] **Correct system identified** -- `mappings[]` for Mapper 2.0, `mapping.fields[]` for Mapper 1.0; never mix
- [ ] **`status: "Active"` on every mapping entry** -- API rejects entries without it
- [ ] **No dot notation in `generate`** -- use nested `dataType: "object"` with child `mappings[]` instead
- [ ] **Extract paths start from root** -- `$.` paths always reference the top-level input, even in nested mappings
- [ ] **Array mappings have `buildArrayHelper`** -- required for all `*array` dataTypes
- [ ] **Lookups defined and referenced** -- every `lookupName` on a mapping has a corresponding entry in `lookups[]`
- [ ] **Date formats specified** -- `extractDateFormat`/`generateDateFormat` set when `dataType: "date"`
- [ ] **Full resource PUT** -- GET the complete resource first, modify only the mapping section, PUT the whole object back
- [ ] **Response mapping on the flow** -- `responseMapping` lives on `flow.pageProcessors[]`, not on the import resource itself
- [ ] **Composite object paths adjusted** -- when `buildArrayHelper` has both `extract` and `mappings`, child extract paths drop the `[*]` brackets

## Gotchas

1. **Existing imports may use Mapper 1.0 even for HTTP/RDBMS/FTP.** Mapper 2.0 is the default for new imports, but many older imports across all adaptor types use Mapper 1.0. Always check the existing format before editing -- `mappings[]` means 2.0, `mapping.fields[]` means 1.0. Never mix.
2. **Extract paths always reference the root of the input context.** Even in deeply nested Mapper 2.0 mappings, `$.` paths start from the top level (the record in `record` context, or the envelope in `envelope` context), not the current nesting level.
3. **Composite object collapses arrays to single objects.** When `buildArrayHelper` has both `extract` and `mappings`, array brackets in the extract path are replaced with single objects in child mapping contexts. `$.orders[*].items[*]` becomes `$.orders.items.fieldName` inside the mappings.
4. **Response mapping uses Transformation 1.0 syntax, not 2.0.** Don't use `rulesTwoDotZero` structure in `responseMapping`. It uses simple extract/generate pairs with dot notation.
5. **NetSuite lookups query live data.** A NetSuite import's `netsuite_da.lookups[]` searches NetSuite records at runtime (`recordType`, `searchField`, `resultField`), unlike Mapper 2.0 static `map` lookups.
6. **`generate` must not use dot notation in Mapper 2.0.** Build nested structures with `dataType: "object"` and child `mappings[]`. `"generate": "customer.name"` silently creates a field literally named `"customer.name"`.
7. **Empty `generate` indicates inner array in `arrayarray`.** For nested array structures, inner array mappings have no `generate` field -- this is expected, not an error.
8. **Transformation 2.0 "modify" passes through unmapped fields.** "Create" mode only outputs explicitly mapped fields. Choose based on whether you want a clean slate or surgical edits.
9. **PUT erases omitted fields on the parent resource.** When updating mappings on an import or transform on an export, always GET the full resource first, modify the mapping/transform section, then PUT the complete object. The `set` command handles this.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| "Mapping object must have status field present" | Missing `status` on a mapping entry | Add `status: "Active"` to every mapping object |
| Import silently creates field named `"customer.name"` | Dot notation in `generate` | Use nested `dataType: "object"` with child `mappings[]` |
| Mapped fields missing in output | Using Mapper 2.0 syntax on a Mapper 1.0 import (or vice versa) | Check existing format: `mappings[]` = 2.0, `mapping.fields[]` = 1.0 |
| Extract returns `null` in nested mapping | Extract path relative to nesting level | Extract paths always start from root (`$.`), not the current level |
| Array output is empty | Missing `buildArrayHelper` on array dataType | Add `buildArrayHelper[]` for all `*array` dataTypes |
| Lookup key not found / processing stops | `allowFailures` not set on lookup | Set `allowFailures: true` and provide a `default` value |
| Response mapping not applied | `responseMapping` placed on the import resource | Move to `flow.pageProcessors[]` entry for that import |
| Composite object paths return wrong data | `[*]` brackets still in child extract paths | Drop `[*]` -- arrays collapse to single objects inside `buildArrayHelper` mappings |
| Date values malformed in output | Missing date format configuration | Set `extractDateFormat` and `generateDateFormat` on date mappings |
| PUT overwrites entire resource | Partial JSON sent without GET first | Always GET full resource, modify mapping section, PUT complete object |
