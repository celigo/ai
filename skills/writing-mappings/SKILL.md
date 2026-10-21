---
name: writing-mappings
description: Write field mappings and transforms in Celigo integrations. Covers Mapper 2.0 (imports), Transformation 2.0 (exports), lookups, response mapping, and Mapper 1.0 (NetSuite DA/Salesforce). Use when editing mappings[], transform{}, responseMapping, or lookup configurations.
---

<!-- TIER:1 -->

# Writing Mappings and Transforms

Mappings and transforms are the **data reshaping layer** in Celigo integrations. They control how fields from one system translate into fields for another. Mappings are used across flows, APIs, and tools.

## How to Run the Steps

This skill names each step by what it reads or changes; the exact calls depend on how you reach the account. Read the one reference that matches your tools -- both follow the workflows and sections below, and add how to save and check a change:

- **Celigo MCP tools** (`list_imports`, `upsert_import`, `get_schema`, ...) -- [references/mcp.md](references/mcp.md)
- **The `celigo` CLI** -- [references/cli.md](references/cli.md)

Reading resources, sample records, and metadata is read-only; saving a mapping, transform, or response mapping writes to the account. The platform has no single-field update for any of them, so every save replaces the whole import, export, or flow document -- start from the current document and send all of it back. To check a saved change, test-run the flow: a test run never executes the flow's imports and doesn't advance its delta state, but it still calls the systems behind the steps it runs.

## Mapping Systems

Four systems handle data reshaping:

- **Mapper 2.0** -- modern recursive field mapping on imports (`mappings[]` array). Handles nested objects, arrays of any depth, lookups, conditionals, and date conversions. Default for new imports on all adaptor types except NetSuite DA (`NetSuiteDistributedImport`) and Salesforce -- `NetSuiteHTTPImport` uses Mapper 2.0
- **Mapper 1.0** -- legacy flat mapping on Salesforce imports (`mapping.fields[]` / `mapping.lists[]`) and NetSuite DA imports (the same arrays under `netsuite_da.mapping`). Body-level and sublist fields in separate flat arrays. Also present on many older HTTP/FTP/RDBMS imports created before Mapper 2.0 existed
- **Transformation 2.0** -- rule-based data reshaping on exports (`transform.expression.rulesTwoDotZero`). Uses the same Mapper 2.0 schema internally. Two modes: "create" (build new record from scratch) or "modify" (edit fields on existing record, unmapped fields pass through)
- **Response mapping** -- simple extract/generate pairs that carry data from a lookup or import response back into the record (`responseMapping` on flow `pageProcessors[]`). Uses Transformation 1.0 syntax. It's how a step passes a value to later steps; an import's own mapping never reaches them (gotcha 11)

Lookups are shared across all systems -- static key-value maps or references to LookupCache resources for large/dynamic datasets. NetSuite imports use a distinct lookup system that queries live NetSuite records.

**Direction decides the tool.** Mappings translate data going *out* to a destination -- every import needs them, because the in-flight record almost never matches what the destination expects. Transformations reshape data coming *in* -- on exports, listeners, and API/tool entry stages. Never use an upstream transformation to match a destination's shape; that's the destination import's mapping. Transformations earn their keep in two situations: multiple sources feeding one pipeline (reshape each new source to the canonical record shape the existing steps expect) and genuinely messy source data (flatten deep nesting once at entry instead of fighting it in every downstream mapping). With a single well-shaped source, don't add a transform just because you can -- and skip identity transforms that rename nothing.

## Quick Reference

### Which Mapping System?

| Context | System | Syntax | Read schema |
|---|---|---|---|
| Import field mapping (HTTP, RDBMS, FTP, S3, etc.) | Mapper 2.0 | `mappings[]` | [mappings.yml](references/schemas/mappings.yml) |
| NetSuite DA / Salesforce import | Mapper 1.0 | `netsuite_da.mapping.fields[]` / `mapping.fields[]` | see import schema ([netsuitedistributed.yml](../configuring-imports/references/schemas/netsuitedistributed.yml); Salesforce's `mapping` is in [base.yml](../configuring-imports/references/schemas/base.yml)) |
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
| [base.yml](../configuring-imports/references/schemas/base.yml) | The import-level Mapper 1.0 `mapping` that Salesforce imports use |
| [salesforce.yml](../configuring-imports/references/schemas/salesforce.yml) | Salesforce import settings and lookups |

## Related Skills

- **configuring-imports** ([Quick Reference](../configuring-imports/SKILL.md#quick-reference)) -- import adaptor types, operation logic, hooks
- **configuring-exports** ([Quick Reference](../configuring-exports/SKILL.md#quick-reference)) -- export adaptor types, delta syncs, webhooks
- **writing-handlebars** ([Quick Reference](../writing-handlebars/SKILL.md#quick-reference)) -- Handlebars expressions used inside mapping `extract` fields
- **building-flows** ([How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow)) -- wiring exports and imports into a flow pipeline

<!-- TIER:2 -->

## Mapper 2.0 Workflow

The `mappings[]` array is **recursive** -- a mapping can contain nested child mappings of the same structure to any depth. This is the core design principle.

### 1. Check the existing resource

Before modifying mappings, always retrieve the current state of the resource -- search the account for it by name if you don't have its id, then read the complete import. Check whether it uses Mapper 2.0 (`mappings[]`) or Mapper 1.0 (`mapping.fields[]`).

### 2. Understand the source data shape

Invoke the upstream export to see real records, or query the source system's metadata through its connection for the full field list of the entity type.

### 3. Understand the target data shape

Query the target system's metadata through its connection to discover required fields and types -- list the entity types it offers, then read the fields of the one you're writing to.

### 4. Choose the input context

The **input context** controls what JSONPath extracts start from. On an import it's the import's `inputContext` field; on a Transformation 2.0 transform, `transform.expression.rulesTwoDotZero.inputContext`:

- **`record`** (the default) -- extract paths reference the record directly. `$.user_id` accesses the `user_id` field on the record
- **`envelope`** -- record fields shift to `$.record.user_id`, and the envelope also carries `job`, `testMode` and `settings`. Read settings as `$.settings.<scope>.<field>`, where the scope is `integration`, `flowGrouping`, `flow`, `connection`, `iClient`, or the step's own `import` or `export` (e.g., `$.settings.connection.api_username`); a path outside these resolves to nothing. A webhook listener's transform also gets the incoming request's `headers` and `queryParams`, and file-provider steps get `fileMeta`

An import's envelope carries no request headers. In API and Tool runs, the integration, flow-group and flow settings are empty.

**When to use envelope:** when a mapping needs a setting or job value as a JSON path -- `$.settings.connection.fieldName` instead of a `{{settings.connection.fieldName}}` Handlebars expression.

### 5. Map by data type

Every mapping needs three properties: `generate` (target field name), `dataType` (output type), and `extract` (how to get data from source).

**Extract supports three patterns** (distinguished by syntax):
- **JSON path** -- starts with `$`, the record as it arrives: `$.customer.email` on an object record; `$[0].field` (one row) or `$[*].field` (every row) on a grouped record -- an array of rows from `groupByFields`, file key columns, or a NetSuite saved search (grouped unless `skipGrouping: true`). On a grouped record `$.field` resolves nothing and the mapper still succeeds. Always references the top-level root, even in nested mappings
- **Handlebars** -- contains `{{` (e.g., `{{record.firstName}} {{record.lastName}}`). For computed values
- **Hard-coded** -- plain string literal (e.g., `"Active"`, `"USD"`). Neither starts with `$` nor contains `{{`

**Simple types** (`string`, `number`, `boolean`) -- direct field-to-field mapping. Dates are strings: use `dataType: "string"` with `extractDateFormat` / `generateDateFormat` (plus `extractDateTimezone` / `generateDateTimezone` when the zone changes). There is no `date` dataType; `"date"` is rejected like any unknown type (`Destination datatype is a required field`).

**Objects** -- set `dataType: "object"`, add child mappings in the `mappings[]` array. Never use dot notation in `generate`.

**Arrays** -- set `dataType` to an array type (`stringarray`, `numberarray`, `booleanarray`, `objectarray`) and configure `buildArrayHelper[]`. The schema also lists `arrayarray`, but it has been observed failing at save and run time with `Destination datatype is a required field` (the error for a missing type) -- avoid it, and build an array-of-arrays value in a script hook instead. Three patterns for object arrays:
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

Before modifying transforms, retrieve the current export to inspect any existing transform configuration -- search the account for it by name if you don't have its id.

### 2. Choose the mode

- **`create`** -- build a completely new record. Only mapped fields appear in output. Use when the output structure differs significantly from the source
- **`modify`** -- edit specific fields on the existing record. Unmapped fields pass through unchanged when the transform runs; rules you leave out of a save don't survive it (gotcha 9). Use for surgical adjustments (rename, add, remove a few fields)

### 3. Write the mappings

Same Mapper 2.0 syntax: `generate`, `dataType`, `extract`, nested `mappings`, `buildArrayHelper`, lookups. Everything described in the Mapper 2.0 section above applies here, including input context.

**Input context is especially valuable on transforms for APIs and tools** -- set it to `envelope` to access the full request context (headers, path params, query params, connection settings) directly via JSON path instead of Handlebars.

### 4. Configure the transform envelope

Set `transform.type: "expression"`, `expression.version: "2"`, then place `mappings[]` and `lookups[]` under `expression.rulesTwoDotZero` with the chosen `mode`.

**Script alternative:** Set `transform.type: "script"` with `script._scriptId` and `script.function` for programmatic transforms when expression rules aren't sufficient.

### Schema reference

All Transformation 2.0 field definitions: [transform.yml](references/schemas/transform.yml), [mappings.yml](references/schemas/mappings.yml), [lookups.yml](references/schemas/lookups.yml)

## Mapper 1.0 Reference (NetSuite and Salesforce)

NetSuite DA (`NetSuiteDistributedImport`) and Salesforce imports use the older flat mapping structure (`NetSuiteHTTPImport` uses Mapper 2.0). Two arrays within the `mapping` object -- the import's own `mapping` on Salesforce, `netsuite_da.mapping` on NetSuite DA:

- **`mapping.fields[]`** -- body-level field mappings. Each entry has `extract` (source path) or `hardCodedValue` (static value), `generate` (target field ID), and optional `lookupName`, `dataType`, `internalId`, `immutable`, `discardIfEmpty`, `conditional`
- **`mapping.lists[]`** -- one entry per destination sublist or child list: `generate` (the NetSuite sublist id, e.g., `"item"`, or the Salesforce child relationship name) and `fields[]` (column mappings with the same properties as body fields, plus `isKey` for matching existing lines). Leave the entry's legacy `jsonPath` unset; on NetSuite DA it breaks iteration, so only the first source element renders. Column extracts start at the record root: `line_items[*].sku` gives one line per element, and a plain path repeats on every line

**Mapper 1.0 is its own dialect.** Extracts are bare dot-paths from the record root (`email`, `customer.first_name`, `line_items[*].sku`), and constants go in `hardCodedValue`. Dotted and bracket-star `generate` paths build nested destinations (`customer.addresses[*].city`), though NetSuite body fields stay flat. Set `discardIfEmpty` when an empty source must not overwrite the destination with null.

**NetSuite DA `update`, `addupdate` and `delete` need `netsuite_da.internalIdLookup`.** The lookup, not a mapped `internalid`, picks the record (on `update` it overrides a mapped one). When the record already carries the internal id, use the expression form `["internalid","is","{{{id}}}"]` rather than dropping the lookup -- as long as every record carries it: on SuiteApp 2.0 an `addupdate` record whose id is empty doesn't fall through to create, because the empty value is searched as `isempty` and can match an existing record.

**NetSuite lookups are different** -- they query live NetSuite records using `recordType`, `searchField`, `resultField`, and `operator`. Not static maps. Defined in `netsuite_da.lookups[]`, referenced by `lookupName` in field mappings. To discover valid field IDs for `searchField` and `resultField`, read the record type's fields from the NetSuite connection's metadata — the returned field IDs are the exact values to use. A lookup's `expression` (which overrides `searchField` and `operator`) renders against the whole source record, without `record.`; a lookup used on a sublist row reaches the current line with `<array>[*].<field>` (e.g., `{{{line_items[*].sku}}}`). A bare line field is undefined at the record root, and a helper that receives one fails every record with `INVALID_HANDLE_BAR_EXPRESSION`. The mapping preview returns an empty sublist for `[*]` inside a block-helper argument, so validate those with a run.

**Salesforce lookups** follow the same Mapper 1.0 pattern but the lookup structure is simpler.

**Sublist field discovery:** For NetSuite `mapping.lists[].generate`, the sublist name (e.g., `"item"`, `"addressbook"`) comes from the record type's field metadata on the NetSuite connection — sublists appear as field groups. For a Salesforce child list, read the sObject type's field metadata on the Salesforce connection for its relationship fields and child objects; the `lists[]` entry's `generate` is the child relationship name. (`distributed.relatedLists` belongs to Salesforce listener exports, not imports.)

### Schema reference

NetSuite Mapper 1.0: see `mapping` and `lookups` in the configuring-imports skill's [netsuitedistributed.yml](../configuring-imports/references/schemas/netsuitedistributed.yml)
Salesforce Mapper 1.0: see the import-level `mapping` in the configuring-imports skill's [base.yml](../configuring-imports/references/schemas/base.yml); its [salesforce.yml](../configuring-imports/references/schemas/salesforce.yml) holds the Salesforce settings and lookups

## Response Mapping Reference (Transformation 1.0)

Response mapping extracts fields from a lookup or import API response back into the original record. It lives on the flow's `pageProcessors[]` entry, not on the resource itself -- but it's planned when building the resource. Changing one is an update to the flow, not to the import or lookup export.

Two sections, both plain arrays (never wrap them in an object like `"fields": {"type": [...]}` -- the API accepts that shape but silently erases the step's mappings):
- **`fields[]`** -- field-level extract/generate pairs using dot notation
- **`lists[]`** -- array mappings with `generate` (target array name) and `fields[]` (extract/generate pairs applied per array item)

**For lookup exports:** the response envelope is `{"statusCode": 200, "data": [...result records], "errors": []}`, and every extract starts from `data`.

- **Single result** -- `data[0].fieldName` (or the equivalent `data.0.fieldName`).
- **Grouped results** -- a lookup that groups its results returns each one as an array of rows: `data: [[row, …], …]`. `data[0]` is the first group and `data[0][0].field` its first row's field; `data[0].field` merges nothing. Map the whole group (`data[0]`) when you need every row. This is verified for HTTP lookups that set `groupByFields`; check a NetSuite saved-search lookup's shape in a test run before relying on it.
- **Multiple results, keep the whole array** -- `extract: "data"`, `generate: "<arrayField>"`. The record gains an array of the result objects; downstream steps read it with normal JSON array paths (e.g. `$.<arrayField>[*].fieldName` in Mapper 2.0) or fan out over it with one-to-many (`pathToMany: "<arrayField>"`).
- **Multiple results, reshaped** -- a `lists` entry whose field extracts use `data[*].fieldName`. Produces one array item per result; the `[*]` marks the array to iterate:

```json
{
  "fields": [],
  "lists": [
    {
      "generate": "matchedOrders",
      "fields": [
        { "extract": "data[*].id", "generate": "orderId" },
        { "extract": "data[*].total", "generate": "amount" }
      ]
    }
  ]
}
```

The `[*]` wildcard is only honored inside `lists[].fields[].extract`. In a top-level `fields[].extract`, `data[*].fieldName` (and bare `data[*]`) is silently ignored -- the field is never merged onto the record. Bare result-field names (`fieldName` without the `data` prefix) resolve to nothing in either section.

**For imports:** the envelope carries `id` (the destination-assigned record ID), `statusCode`, `ignored`, `errors`, and `_json` (the raw response body). Use `id` for a created record's ID and `_json.fieldName` for other response fields (e.g., `_json.output.1.content.0.text` for AI model responses). `id` is empty in flow test runs, which never send imports.

### Schema reference

All response mapping field definitions: [response-mapping.yml](references/schemas/response-mapping.yml)

<!-- TIER:3 -->

## Pre-Submit Checklist

Before submitting any mapping configuration, verify:

- [ ] **Correct system identified** -- `mappings[]` for Mapper 2.0, `mapping.fields[]` for Mapper 1.0; never mix
- [ ] **Lookups defined and referenced** -- every `lookupName` on a mapping has a corresponding entry in `lookups[]`
- [ ] **Full resource PUT** -- GET the complete resource first, modify only the mapping section, PUT the whole object back, with every existing row you didn't mean to change
- [ ] **Response mapping on the flow** -- `responseMapping` lives on `flow.pageProcessors[]`, not on the import resource itself

**Mapper 2.0 and Transformation 2.0:**

- [ ] **A `status` on every row** -- the API rejects a row without one, and only `Active` rows run. Give new rows `Active`; when you re-send an existing tree, keep each row's stored `Draft` or `Inactive` -- rewriting it turns back on a row the user parked
- [ ] **No `date` dataType** -- a date is a `string` row with `extractDateFormat`/`generateDateFormat`
- [ ] **No dot notation in `generate`** -- use nested `dataType: "object"` with child `mappings[]` instead
- [ ] **Extract paths start from root** -- `$` paths always reference the top-level input, even in nested mappings; a grouped record's rows are `$[0]` / `$[*]`
- [ ] **Array mappings have `buildArrayHelper`** -- required for all `*array` dataTypes
- [ ] **Composite object paths adjusted** -- when `buildArrayHelper` has both `extract` and `mappings`, child extract paths drop the `[*]` brackets

**Mapper 1.0:**

- [ ] **The 1.0 dialect** -- bare dot-path extracts, constants in `hardCodedValue`, dotted or `[*]` `generate` paths for nested destinations (flat on NetSuite body fields), and `discardIfEmpty` where an empty source must not overwrite the destination with null
- [ ] **NetSuite DA** -- `update`, `addupdate` and `delete` carry `netsuite_da.internalIdLookup`, and `mapping.lists[]` entries leave the legacy `jsonPath` unset

## Gotchas

1. **Existing imports may use Mapper 1.0 even for HTTP/RDBMS/FTP.** Mapper 2.0 is the default for new imports, but many older imports across all adaptor types use Mapper 1.0. Always check the existing format before editing -- `mappings[]` means 2.0, `mapping.fields[]` means 1.0. Never mix.
2. **Extract paths always reference the root of the input context.** Even in deeply nested Mapper 2.0 mappings, `$` paths start from the top level (the record in `record` context, or the envelope in `envelope` context), not the current nesting level.
3. **Composite object collapses arrays to single objects.** When `buildArrayHelper` has both `extract` and `mappings`, array brackets in the extract path are replaced with single objects in child mapping contexts. `$.orders[*].items[*]` becomes `$.orders.items.fieldName` inside the mappings.
4. **Response mapping uses Transformation 1.0 syntax, not 2.0.** Don't use `rulesTwoDotZero` structure in `responseMapping`. It uses simple extract/generate pairs with dot notation.
5. **NetSuite lookups query live data.** A NetSuite import's `netsuite_da.lookups[]` searches NetSuite records at runtime (`recordType`, `searchField`, `resultField`), unlike Mapper 2.0 static `map` lookups.
6. **`generate` must not use dot notation in Mapper 2.0.** Build nested structures with `dataType: "object"` and child `mappings[]`. `"generate": "customer.name"` silently creates a field literally named `"customer.name"`.
7. **An unnamed top-level `objectarray` is the `rows [ ]` structure, not a missing name.** When the only top-level mapping is an `objectarray` with no `generate`, the mapped record is an array, and templates such as `http.body` bind it as `rows` instead of `record`. Keep it unnamed -- naming it turns the output into an object, and `{{#each rows}}` then renders nothing. Any other row with a source and no `generate` is incomplete; the editor won't save it ("One or more destination field values not entered").
8. **Transformation 2.0 "modify" passes through unmapped fields.** "Create" mode only outputs explicitly mapped fields. Choose based on whether you want a clean slate or surgical edits.
9. **PUT erases omitted fields on the parent resource.** When updating mappings on an import or transform on an export, always GET the full resource first, modify the mapping/transform section, then PUT the complete object. No mapping, transform, or response-mapping field can be patched on its own, so every change takes this full PUT -- for a response mapping, a PUT of the whole flow. Arrays are saved exactly as sent: a `mappings` array (or `rulesTwoDotZero.mappings`) holding only the new row deletes every other row, so carry each existing row through, and keep the transform's `mode`. A `modify` transform keeps unmapped record fields at run time; it doesn't keep rules you leave out of a save.
10. **`[*]` in response mapping only works inside `lists`.** `data[*].fieldName` in a top-level `fields[].extract` is silently ignored -- nothing is merged. For multiple lookup results use `extract: "data"` (whole array) or a `lists` entry with `data[*].fieldName` extracts.
11. **An import's mapping never reaches the next step.** It shapes only the request the import sends: the mapped output, and anything preMap or postMap change, stay in this step. The next step receives the record as it arrived here plus what this step's response mapping (or postResponseMap hook) adds, so to pass a value downstream, response-map it.
12. **Renaming a mapping row can blank a body field.** On an HTTP import with both a mapping and an `http.body` template, the template renders against the mapped record (unless `http.sendPostMappedData` is false), so `{{record.<name>}}` must use the mapping's `generate` names. Rename or remove a row and the template's reference renders empty while the record still succeeds. An HTTP lookup export's `mappings` work the same way. An HTTP import's own `http.lookups[]` don't: their `body` reads the record's fields at the top level (`{{email}}`, not `{{record.email}}`; [configuring-imports > Gotchas](../configuring-imports/SKILL.md#gotchas)).

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| "Mapping object must have status field present" | Missing `status` on a mapping entry | Add a `status` (`Active` for new rows) |
| `inactive_parent_active_child` (no message text) | An `Active` row under an `Inactive` parent | Re-enable the parent in the same save, or leave the child non-`Active` |
| Import silently creates field named `"customer.name"` | Dot notation in a Mapper 2.0 `generate` | Use nested `dataType: "object"` with child `mappings[]` |
| Only the first sublist line is written | A NetSuite DA `mapping.lists[]` entry has the legacy `jsonPath` set | Remove it; drive the lines from `<array>[*].<field>` column extracts |
| Mapped fields missing in output | Using Mapper 2.0 syntax on a Mapper 1.0 import (or vice versa) | Check existing format: `mappings[]` = 2.0, `mapping.fields[]` = 1.0 |
| Extract returns `null` in nested mapping | Extract path relative to nesting level | Extract paths always start from root (`$`), not the current level |
| Mapped fields empty (the body goes out as `{}`), yet the record succeeds | `$.field` on a grouped record (an array of rows) | Address the rows as `$[0].field` or `$[*].field` |
| "Destination datatype is a required field" | `dataType` missing, or a value that isn't a Mapper 2.0 type, such as `date` | Use a listed type; a date is a `string` with date formats |
| Array output is empty | Missing `buildArrayHelper` on array dataType | Add `buildArrayHelper[]` for all `*array` dataTypes |
| Lookup key not found / processing stops | `allowFailures` not set on lookup | Set `allowFailures: true` and provide a `default` value |
| Response mapping not applied | `responseMapping` placed on the import resource | Move to `flow.pageProcessors[]` entry for that import |
| Lookup response field empty / never merged | `data[*].fieldName` (or a bare field name) in a top-level `fields[].extract` | Use `data[0].fieldName` for one result; `extract: "data"` or a `lists` entry with `data[*].fieldName` extracts for many |
| `data[0].field` merges nothing from a grouping lookup | Grouped results nest one level deeper (`data: [[row, …], …]`) | Use `data[0][0].field` for the first row, or map `data[0]` for the whole group |
| A value mapped on an import is missing in the next step | The import's mapping shapes only its own request | Response-map it from this step's response, or add it in a postResponseMap hook |
| A body field goes out empty after a mapping edit | `http.body` names a `generate` that was renamed or removed | Point `{{record.<name>}}` at the current `generate` name |
| Composite object paths return wrong data | `[*]` brackets still in child extract paths | Drop `[*]` -- arrays collapse to single objects inside `buildArrayHelper` mappings |
| Date values malformed in output | Missing date format configuration | Set `extractDateFormat` and `generateDateFormat` on date mappings |
| PUT overwrites entire resource | Partial JSON sent without GET first | Always GET full resource, modify mapping section, PUT complete object |
