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

- **Mapper 2.0** -- modern recursive field mapping on imports (`mappings[]` array). Handles nested objects, arrays of any depth, lookups, conditionals, and date conversions. Default for new imports on all adaptor types except NetSuite DA (`NetSuiteDistributedImport`), Salesforce and `WrapperImport`, which support only Mapper 1.0 -- `NetSuiteHTTPImport` uses Mapper 2.0. The same rows also reshape the arriving record into an HTTP or NetSuite REST lookup's request (`mappings[]` on an `isLookup` `HTTPExport` / `NetSuiteHTTPExport`; no other export takes them), and build a Tool's `output.mappings` and an API response's `mappings`
- **Mapper 1.0** -- legacy flat mapping on Salesforce and `WrapperImport` imports (`mapping.fields[]` / `mapping.lists[]`) and NetSuite DA imports (the same arrays under `netsuite_da.mapping`). Body-level and sublist fields in separate flat arrays. Also present on many older HTTP/FTP/RDBMS imports created before Mapper 2.0 existed
- **Transformation 2.0** -- rule-based data reshaping on exports (`transform.expression.rulesTwoDotZero`). Uses the same Mapper 2.0 schema internally. Two modes: "create" (build new record from scratch) or "modify" (edit fields on existing record, unmapped fields pass through)
- **Response mapping** -- simple extract/generate pairs that carry data from a lookup or import response back into the record (`responseMapping` on flow `pageProcessors[]`). Uses Transformation 1.0 syntax. It's how a step passes a value to later steps; an import's own mapping never reaches them (gotcha 11)

Lookups translate values in every system. They come in three kinds: **static** (an inline `map`), **cached** (`_lookupCacheId`, read from a LookupCache resource), and **live** (imports only: a query to the destination for each record, such as an HTTP request, SOQL, SQL or a NetSuite search). The schemas call cached lookups "dynamic", and some adaptor schemas use the same word for live ones, so say which you mean. NetSuite DA lookups are always live NetSuite searches.

**Direction decides the tool.** Mappings translate data going *out* to a destination -- every import needs them, because the in-flight record almost never matches what the destination expects. Transformations reshape data coming *in* -- on exports, listeners, and API/tool entry stages. Never use an upstream transformation to match a destination's shape; that's the destination import's mapping. Transformations earn their keep in two situations: multiple sources feeding one pipeline (reshape each new source to the canonical record shape the existing steps expect) and genuinely messy source data (flatten deep nesting once at entry instead of fighting it in every downstream mapping). With a single well-shaped source, don't add a transform just because you can -- and skip identity transforms that rename nothing.

## Quick Reference

### Which Mapping System?

| Context | System | Syntax | Read schema |
|---|---|---|---|
| Import field mapping (HTTP, RDBMS, FTP, S3, etc.) | Mapper 2.0 | `mappings[]` | [mappings.yml](references/schemas/mappings.yml) |
| NetSuite DA / Salesforce / Wrapper import | Mapper 1.0 | `netsuite_da.mapping.fields[]` / `mapping.fields[]` | see import schema ([netsuitedistributed.yml](../configuring-imports/references/schemas/netsuitedistributed.yml); the Salesforce and Wrapper `mapping` is in [base.yml](../configuring-imports/references/schemas/base.yml)) |
| Export data reshaping | Transformation 2.0 | `transform{}` | [transform.yml](references/schemas/transform.yml) |
| Response mapping (lookup/import carry-back) | Transformation 1.0 | extract/generate pairs | [response-mapping.yml](references/schemas/response-mapping.yml) |
| Value translation | Lookups | `lookups[]` | [lookups.yml](references/schemas/lookups.yml) |

**Editing existing imports:** Many existing imports use Mapper 1.0 even for HTTP and RDBMS adaptor types (pre-dating Mapper 2.0). Always check whether an import uses `mappings[]` (2.0) or `mapping.fields[]` (1.0) before modifying -- never mix the two.

### Schema Index

| Schema | Contents |
|---|---|
| [mappings.yml](references/schemas/mappings.yml) | Mapper 2.0 field definitions (generate, extract, dataType, buildArrayHelper, conditionals) |
| [lookups.yml](references/schemas/lookups.yml) | Static and cached lookup definitions (the schema calls cached lookups "dynamic") |
| [transform.yml](references/schemas/transform.yml) | Transformation 2.0 envelope (mode, expression, script) |
| [response-mapping.yml](references/schemas/response-mapping.yml) | Transformation 1.0 extract/generate pairs for response carry-back |
| [netsuitedistributed.yml](../configuring-imports/references/schemas/netsuitedistributed.yml) | NetSuite Mapper 1.0 mapping + lookups |
| [base.yml](../configuring-imports/references/schemas/base.yml) | The import-level Mapper 1.0 `mapping` that Salesforce and Wrapper imports use |
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

Map against the record as it reaches this step: the export's records after its transform, output filter and preSavePage hook, plus every field an earlier step's response mapping merged in -- on a grouped source, an array of rows (step 5). Invoking the export shows its records with the transform applied, not what earlier lookups add; a test run's input to this step, or a failed record's retry data, shows the record exactly. For the full field list of the entity type, query the source system's metadata through its connection.

On a one-to-many import (`oneToMany: true`) the mapping sees one child at a time. With `pathToMany`, `$.<field>` is the child's field and `$._PARENT.<field>` the parent's -- `_PARENT` is the parent without the child array, and the parent's own fields aren't at `$`. With a blank `pathToMany` on a grouped record, each row is the record.

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
- **JSON path** -- starts with `$`, the record as it arrives: `$.customer.email` on an object record; `$[0].field` (one row) or `$[*].field` (every row) on a grouped record -- an array of rows from `groupByFields`, file key columns, or a NetSuite saved search (grouped unless `skipGrouping: true`). On a grouped record `$.field` resolves nothing and the mapper still succeeds. Always references the top-level root, even in nested mappings. A key that contains a dot needs bracket notation: `$['P.O. Number']` (or `$["P.O. Number"]`, `$.[P.O. Number]`); `$.P.O. Number` is read as a nested path, maps nothing, and the record still succeeds. Spaces, hyphens and `#` need no brackets (`$.Ship To Name`, `$.Tracking #`). Filter expressions fail the record (gotcha 13).
- **Handlebars** -- contains `{{` (e.g., `{{record.firstName}} {{record.lastName}}`). For computed values
- **Hard-coded** -- plain string literal (e.g., `"Active"`, `"USD"`). Neither starts with `$` nor contains `{{`

**Simple types** (`string`, `number`, `boolean`) -- direct field-to-field mapping. Dates are strings: use `dataType: "string"` with `extractDateFormat` / `generateDateFormat` (plus `extractDateTimezone` / `generateDateTimezone` when the zone changes). There is no `date` dataType; `"date"` is rejected like any unknown type (`Destination datatype is a required field`).

**Objects** -- set `dataType: "object"`, add child mappings in the `mappings[]` array. Never use dot notation in `generate`. A Handlebars `extract` on an `object` row must render a JSON object; anything else fails the record (`You can't map string (source) to object (destination)`).

**Arrays** -- set `dataType` to an array type (`stringarray`, `numberarray`, `booleanarray`, `objectarray`) and configure `buildArrayHelper[]`. The schema also lists `arrayarray`, but the mapper refuses it as an unknown type (`Destination datatype is a required field`), though a save accepts it -- build an array-of-arrays value in a script hook instead. Three entry patterns for object arrays:
- **Extract only** -- pull existing objects from source (`extract: "$.items[*]"`)
- **Mappings only** -- construct objects from individual fields (each `buildArrayHelper` entry creates one array element)
- **Extract + mappings** -- iterate a source array and reshape each element. Uses the **composite object mechanism**: array brackets `[*]` in the extract path collapse to single objects inside the mappings, so `$.orders[*].items[*]` becomes `$.orders.items.fieldName` in child extract paths. Parent context remains accessible (e.g., `$.orders.id`, `$.customerName`)

The entry's own `extract` keeps the `[*]` (without it, `$.line_items` yields one empty element per item), and child extracts drop it but keep the array's path. A child `$.line_items[*].sku` maps nothing, and an element-relative `$.sku` reads the record root, not the line:

```json
{"generate": "lines", "dataType": "objectarray", "status": "Active", "buildArrayHelper": [{
  "extract": "$.line_items[*]",
  "mappings": [
    {"generate": "sku", "dataType": "string", "extract": "$.line_items.sku", "status": "Active"},
    {"generate": "quantity", "dataType": "number", "extract": "$.line_items.quantity", "status": "Active"},
    {"generate": "orderNumber", "dataType": "string", "extract": "$.name", "status": "Active"}
  ]
}]}
```

`dataType: "number"` converts a numeric string (`"2"` becomes `2`).

Entries add their elements in order and can be mixed: an iterating entry (`$.lines[*]`) followed by a constructed one (child `mappings`, no `extract`) gives every line plus one more, such as a fee line. Never index an entry's `extract` (`$[0]`) -- the whole array is silently dropped.

An array row takes its values only from `buildArrayHelper` entries or a `hardCodedValue`, never from its own `extract` -- JSONPath, Handlebars or a literal: an `objectarray` row is refused (`"buildArrayHelper" or "hardCodedValue" must be present for object array datatype.`), and a primitive-array row silently yields nothing. Handlebars works in an entry: an `objectarray` entry that renders a JSON array (`{{{jsonSerialize record.items}}}`) adds one element per item; on a primitive array each entry is one element.

For a constant array or object, set the row's `hardCodedValue` -- a literal entry `extract` is refused (`extract only supports json path or handlebars expression`). A primitive array splits the value on commas exactly as written (`"A, B"` gives `["A", " B"]`; a `numberarray` converts each part to a number), an `object` takes a JSON object string, and an `objectarray` a JSON array string.

### 6. Add lookups for value translation

Define lookups alongside mappings and reference them by name via `lookupName` on any mapping; the row's `extract` is the key the lookup receives. An import whose adaptor keeps its own copy of the lookups (`http.lookups` on an HTTP import; the import schema's [`lookups`](../configuring-imports/references/schemas/base.yml) lists the others) needs each entry there and the same entry in the top-level `lookups`. On an HTTP import the save keeps `http.lookups` and mirrors it to the top level, overwriting a top-level copy that differs; one saved with only the top-level array keeps neither copy, and every record that uses the lookup then fails with `Unable to find lookup in mapping configs - <name>`.

- **Static** -- `map` object with key-value pairs. Best for small, fixed sets (country codes, status values)
- **Cached** -- `_lookupCacheId` referencing a LookupCache resource, with optional `extract` JSON path to pull a specific field from the cached object
- **Live** (imports only) -- a request to the destination for each record (on an HTTP import, `method` + `relativeURI`, with an optional `body` and `extract`), so it adds one call per record. Transformation 2.0 lookups take only static and cached
- A key missing from a static `map` fails the record only when the lookup sets `allowFailures: false` (`Could not find value for static lookup: <name> {Lookup Key: <key>} ...`), and its `default` is then ignored. With `true`, or with the key left out, the `default` is written (`""` writes an empty string), or the field is left out when there's none. A live HTTP lookup that matches nothing leaves the field out, and the record succeeds. A cache lookup follows the same `allowFailures` rule; with `false`, a missing key fails the record with `lookupcache_evaluation_failed`. When a miss must stop the record, set `false` explicitly -- left out, the record goes through with the `default`, or without the field

### 7. Add conditionals where needed

`conditional.when` holds one value, and two settings share it: the composite-import gate -- `record_created` (only on insert) or `record_updated` (only on update) -- and the action when the source is empty: `extract_not_empty` (leave the field out) or `fail_record_when_empty` (fail the record with `<generate>: Source field has no value`). Setting one replaces the other. Empty means null, missing or `""`; `0`, `false` and whitespace are values and map through. With no condition, a missing or `""` source leaves the field out, but a null source is written as null. `fail_record_when_empty` can't share a row with a `default`, `lookupName` or `hardCodedValue` (the save refuses it).

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

**Headers.** An HTTP export's or lookup's transform reads the response headers: `{{{headers.<name>}}}` in either input context, or `$.headers['<name>']` in `envelope` (double braces HTML-escape the value). On a lookup, a field the transform writes reaches later steps only through the step's response mapping (`data[0].<field>`). An API's request transform is different: in a test run it sees only the request body -- a `mockRequest`'s `pathParams`, `queryParams` and `headers` don't reach it -- so a test run can't confirm a rule that reads them.

### 4. Configure the transform envelope

Set `transform.type: "expression"`, `expression.version: "2"`, then place `mappings[]` and `lookups[]` under `expression.rulesTwoDotZero` with the chosen `mode`.

**Script alternative:** Set `transform.type: "script"` with `script._scriptId` and `script.function` for programmatic transforms when expression rules aren't sufficient.

### Schema reference

All Transformation 2.0 field definitions: [transform.yml](references/schemas/transform.yml), [mappings.yml](references/schemas/mappings.yml), [lookups.yml](references/schemas/lookups.yml)

## Mapper 1.0 Reference (NetSuite and Salesforce)

NetSuite DA (`NetSuiteDistributedImport`), Salesforce and `WrapperImport` imports use the older flat mapping structure (`NetSuiteHTTPImport` uses Mapper 2.0). Two arrays within the `mapping` object -- the import's own `mapping` on Salesforce and Wrapper imports, `netsuite_da.mapping` on NetSuite DA:

- **`mapping.fields[]`** -- body-level field mappings. Each entry has `extract` (source path) or `hardCodedValue` (static value), `generate` (target field ID), and optional `lookupName`, `dataType`, `internalId`, `immutable`, `discardIfEmpty`, `conditional`
- **`mapping.lists[]`** -- one entry per destination sublist or child list: `generate` (the NetSuite sublist id, e.g., `"item"`, or the Salesforce child relationship name) and `fields[]` (column mappings with the same properties as body fields, plus `isKey` for matching existing lines). Leave the entry's legacy `jsonPath` unset; on NetSuite DA it breaks iteration, so only the first source element renders. Column extracts start at the record root: `line_items[*].sku` gives one line per element, and a plain path repeats on every line

**Mapper 1.0 is its own dialect.** Extracts are bare dot-paths from the record root (`email`, `customer.first_name`, `line_items[*].sku`), and constants go in `hardCodedValue`. Dotted and bracket-star `generate` paths build nested destinations (`customer.addresses[*].city`), though NetSuite body fields stay flat. Set `discardIfEmpty` when an empty source must not overwrite the destination with null.

**Converting a Mapper 1.0 import to 2.0.** Translate every row in one save and remove `mapping`: an import that carries both runs only `mappings[]` and ignores the Mapper 1.0 rows, so a partial conversion silently drops whatever wasn't translated. Bare dot-path extracts become `$.` paths; a dotted or `[*]` `generate` becomes nested `object` / `objectarray` rows, and a `lists[]` entry an `objectarray` row with a `buildArrayHelper`; `discardIfEmpty` becomes `conditional.when: extract_not_empty` (without it, Mapper 2.0 writes a null source as null); `lookupName`, `hardCodedValue`, `default` and the date fields carry over. Mapper 2.0 has no `immutable` and no `lookup_not_empty`, `lookup_empty` or `expression` condition -- tell the user before dropping one. Salesforce, NetSuite DA and Wrapper imports support only Mapper 1.0, so never convert those.

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

**For lookup exports:** the response envelope is `{"statusCode": 200, "data": [...result records], "errors": []}`, and every extract starts from `data` -- the lookup's records after its own transform and output filter, so name the transformed fields.

- **Single result** -- `data[0].fieldName` (or the equivalent `data.0.fieldName`). `data[0]` is simply the first record returned: rely on it only when the lookup can match at most one record (a unique key such as an id). When it can match several (a name, an email), also map `data.length` and check it's 1 before anything writes on the strength of `data[0]`.
- **No match** -- a lookup that finds nothing still succeeds: `data` is `[]`, `data[0].fieldName` merges nothing, and the record continues without the field (`proceedOnFailure` doesn't come into it). To act on a miss, map `data.length` (a number, `0` here) or `{{#if data.length}}found{{else}}missing{{/if}}` and filter or branch on it. To fail the record instead, set the lookup's `http.response.successPath` to a path only a match returns (e.g., `results[0].id`).
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

The `[*]` wildcard is only honored inside `lists[].fields[].extract`. In a top-level `fields[].extract`, `data[*].fieldName` (and bare `data[*]`) is silently ignored -- the field is never merged onto the record. Bare result-field names (`fieldName` without the `data` prefix) resolve to nothing in either section. On a one-to-many step the response mapping merges into each child, so map plain `fields` (`data[0].price` → `price`); a `lists` entry isn't needed.

**For imports:** the envelope carries `id` (the destination-assigned record ID), `statusCode`, `ignored`, `errors`, and `_json` (the raw response body). Use `id` for a created record's ID and `_json.fieldName` for other response fields (e.g., `_json.output.1.content.0.text` for AI model responses). Flow test runs never send imports, so there `id` comes from the saved `mockResponse` or the placeholder response (`1234567890`, numbered `1234567890-1`, `-2` ... when a page has several records), never from the destination. An import's `responseTransform` runs before the response mapping and replaces `_json` with its output: it takes only v1 rules (`expression.version: "1"`; `"2"` is refused at save), which keep just the fields they generate, so response-map those names (at the envelope root or under `_json`); `id` still resolves.

### Schema reference

All response mapping field definitions: [response-mapping.yml](references/schemas/response-mapping.yml)

<!-- TIER:3 -->

## Pre-Submit Checklist

Before submitting any mapping configuration, verify:

- [ ] **Correct system identified** -- `mappings[]` for Mapper 2.0, `mapping.fields[]` for Mapper 1.0; never mix (an import holding both runs only `mappings[]`)
- [ ] **Lookups defined and referenced** -- every `lookupName` on a mapping has a corresponding entry in `lookups[]`, and on an HTTP import (or another adaptor that keeps its own copy) the same entry in `http.lookups` or the adaptor's array; a lookup whose miss must fail the record sets `allowFailures: false`
- [ ] **Full resource PUT** -- GET the complete resource first, modify only the mapping section, PUT the whole object back, with every existing row you didn't mean to change
- [ ] **Response mapping on the flow** -- `responseMapping` lives on `flow.pageProcessors[]`, not on the import resource itself

**Mapper 2.0 and Transformation 2.0:**

- [ ] **A `status` on every row** -- the API rejects a row without one, and only `Active` rows run. Give new rows `Active`; when you re-send an existing tree, keep each row's stored `Draft` or `Inactive` -- rewriting it turns back on a row the user parked
- [ ] **No `date` dataType** -- a date is a `string` row with `extractDateFormat`/`generateDateFormat`
- [ ] **No dot notation in `generate`** -- use nested `dataType: "object"` with child `mappings[]` instead
- [ ] **Extract paths start from root** -- `$` paths always reference the top-level input, even in nested mappings; a grouped record's rows are `$[0]` / `$[*]`; a key with dots in its name is bracketed (`$['P.O. Number']`)
- [ ] **Array mappings have `buildArrayHelper`** -- required for all `*array` dataTypes unless the row sets `hardCodedValue`; an array row's own `extract` is never read
- [ ] **Composite object paths adjusted** -- when `buildArrayHelper` has both `extract` and `mappings`, the entry's extract keeps `[*]` (`$.line_items[*]`) and child extract paths drop it but keep the array's path (`$.line_items.sku`)
- [ ] **Nothing the save accepts but the run can't use** -- no `arrayarray`, no JSONPath filter or script expression (`[?(...)]`, `[(...)]`), no indexed `buildArrayHelper` extract (`$[0]`), and no row with a source but no `generate` outside the `rows [ ]` root

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
7. **An unnamed top-level `objectarray` is the `rows [ ]` structure, not a missing name.** When the only top-level mapping is an `objectarray` with no `generate`, the mapped record is an array, and templates such as `http.body` bind it as `rows` instead of `record`. Keep it unnamed -- naming it turns the output into an object, and `{{#each rows}}` then renders nothing. Any other row with a source and no `generate` is incomplete; the editor won't save it ("One or more destination field values not entered"). The API saves one anyway, so a tree written through the API can leave the user's next save in the editor failing until the row is completed or removed.
8. **Transformation 2.0 "modify" passes through unmapped fields.** "Create" mode only outputs explicitly mapped fields. Choose based on whether you want a clean slate or surgical edits.
9. **PUT erases omitted fields on the parent resource.** When updating mappings on an import or transform on an export, always GET the full resource first, modify the mapping/transform section, then PUT the complete object. No mapping, transform, or response-mapping field can be patched on its own, so every change takes this full PUT -- for a response mapping, a PUT of the whole flow. Arrays are saved exactly as sent: a `mappings` array (or `rulesTwoDotZero.mappings`) holding only the new row deletes every other row, so carry each existing row through, and keep the transform's `mode`. A `modify` transform keeps unmapped record fields at run time; it doesn't keep rules you leave out of a save.
10. **`[*]` in response mapping only works inside `lists`.** `data[*].fieldName` in a top-level `fields[].extract` is silently ignored -- nothing is merged. For multiple lookup results use `extract: "data"` (whole array) or a `lists` entry with `data[*].fieldName` extracts.
11. **An import's mapping never reaches the next step.** It shapes only the request the import sends: the mapped output, and anything preMap or postMap change, stay in this step. The next step receives the record as it arrived here plus what this step's response mapping (or postResponseMap hook) adds, so to pass a value downstream, response-map it.
12. **Renaming a mapping row can blank a body field.** On an HTTP import with both a mapping and an `http.body` template, the template renders against the mapped record (unless `http.sendPostMappedData` is false), so `{{record.<name>}}` must use the mapping's `generate` names. Rename or remove a row and the template's reference renders empty while the record still succeeds. An HTTP lookup export's `mappings` work the same way. An HTTP import's own `http.lookups[]` don't: their `body` reads the record's fields at the top level (`{{email}}`, not `{{record.email}}`; [configuring-imports > Gotchas](../configuring-imports/SKILL.md#gotchas)).
13. **JSONPath filter and script expressions save but never run.** The mapper doesn't evaluate them: `$.items[?(@.active)]` or `$.items[(@.length-1)]` passes the save, then every record fails with `Eval [?(expr)] prevented in JSONPath expression.` Pick the elements before the mapping -- in a preMap hook or the source's query -- and map the array as a whole.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| "Mapping object must have status field present" | Missing `status` on a mapping entry | Add a `status` (`Active` for new rows) |
| `inactive_parent_active_child` (no message text) | An `Active` row under an `Inactive` parent | Re-enable the parent in the same save, or leave the child non-`Active` |
| Import silently creates field named `"customer.name"` | Dot notation in a Mapper 2.0 `generate` | Use nested `dataType: "object"` with child `mappings[]` |
| Only the first sublist line is written | A NetSuite DA `mapping.lists[]` entry has the legacy `jsonPath` set | Remove it; drive the lines from `<array>[*].<field>` column extracts |
| `Cannot set properties of undefined (setting '_hasStarNotation')` | NetSuite DA: a row's `conditional.lookupName` names no lookup on the import (on a sublist row the job can stall instead) | Fix the name or restore the lookup |
| `The mapping condition:"record_updated" not supported for the operation` | NetSuite DA: `when: record_updated` on an `add` operation | Use it only on `addupdate` or `update` |
| Mapped fields missing in output | Using Mapper 2.0 syntax on a Mapper 1.0 import (or vice versa) | Check existing format: `mappings[]` = 2.0, `mapping.fields[]` = 1.0 |
| Extract returns `null` in nested mapping | Extract path relative to nesting level | Extract paths always start from root (`$`), not the current level |
| Mapped fields empty (the body goes out as `{}`), yet the record succeeds | `$.field` on a grouped record (an array of rows) | Address the rows as `$[0].field` or `$[*].field` |
| "Destination datatype is a required field" | `dataType` missing, or a value that isn't a Mapper 2.0 type, such as `date` or `arrayarray` (which saves, then fails here at run time) | Use a listed type; a date is a `string` with date formats |
| Array output is empty | A primitive-array row reading its own `extract` instead of `buildArrayHelper` entries, or an indexed entry `extract` (`$[0]`) | Add `buildArrayHelper[]` entries that iterate (`$.items[*]`) or construct (child `mappings`) |
| `"buildArrayHelper" or "hardCodedValue" must be present for object array datatype.` | An `objectarray` row with only its own `extract` (JSONPath, Handlebars or a literal) | Move the source into a `buildArrayHelper` entry, or set a constant as the row's `hardCodedValue` |
| `extract only supports json path or handlebars expression` | A literal in a `buildArrayHelper` entry's `extract` | Set the constant as the row's `hardCodedValue` |
| `<generate>: You can't map number (source) to objectarray (destination)` | An `objectarray` row's `buildArrayHelper` entry sets `sourceDataType: "number"` (the save refuses it) | Leave `sourceDataType` off an entry that builds objects |
| `You can't map string (source) to object (destination)` | A Handlebars `extract` on an `object` row rendered something other than a JSON object | Render a JSON object, or build the object from child rows |
| `<generate>: Source field has no value` (`extract_empty`) | `fail_record_when_empty` on a row whose source is null, missing or `""` | Expected when the field is required; otherwise use `extract_not_empty` or a `default` |
| `Eval [?(expr)] prevented in JSONPath expression.` | A JSONPath filter or script expression in an `extract` (gotcha 13) | Select the elements before the mapping, and map the whole array |
| `The maximum size of the field: mappings.<n>.extract in the Import document should be 1024 characters.` | An `extract` longer than 1024 characters | Split it into nested rows, a lookup, or a preMap hook |
| `Unable to find lookup in mapping configs - <name>` | A row's `lookupName` names no lookup the import keeps -- on an HTTP import, often one saved only in the top-level `lookups` | Define it in `http.lookups` (or the adaptor's array) and in the top-level `lookups`, or fix the name |
| `Could not find value for static lookup: <name> {Lookup Key: <key>} ...` | The key isn't in the static `map`, and the lookup sets `allowFailures: false` (which also ignores its `default`) | Add the key to the map, or set `allowFailures: true` with a `default` |
| `lookupcache_evaluation_failed`: "<field>: The lookup cache could not be evaluated. Check the value in the key '<key>', and try again." | The key isn't in the cache, and the lookup sets `allowFailures: false` | Load the key into the cache, or fix the value the row extracts, then retry the failed records |
| A looked-up field is missing from the request, with no error | The key isn't in the map or cache, the lookup leaves `allowFailures` out, and there's no `default` | Set `allowFailures: false` to fail those records, or `true` with a `default` |
| A column whose name has dots maps nothing (`$.P.O. Number`), and the record succeeds | The dots are read as a nested path | Use bracket notation: `$['P.O. Number']` |
| Response mapping not applied | `responseMapping` placed on the import resource | Move to `flow.pageProcessors[]` entry for that import |
| Lookup response field empty / never merged | `data[*].fieldName` (or a bare field name) in a top-level `fields[].extract` | Use `data[0].fieldName` for one result; `extract: "data"` or a `lists` entry with `data[*].fieldName` extracts for many |
| `data[0].field` merges nothing from a grouping lookup | Grouped results nest one level deeper (`data: [[row, …], …]`) | Use `data[0][0].field` for the first row, or map `data[0]` for the whole group |
| A value mapped on an import is missing in the next step | The import's mapping shapes only its own request | Response-map it from this step's response, or add it in a postResponseMap hook |
| A body field goes out empty after a mapping edit | `http.body` names a `generate` that was renamed or removed | Point `{{record.<name>}}` at the current `generate` name |
| Composite object paths return wrong data | `[*]` brackets still in child extract paths (they map nothing), an element-relative child path (`$.sku` reads the record root), or no `[*]` on the entry's own extract (empty elements) | Entry extract `$.line_items[*]`; child extracts `$.line_items.<field>` -- arrays collapse to single objects inside `buildArrayHelper` mappings |
| Date values malformed in output | Missing date format configuration | Set `extractDateFormat` and `generateDateFormat` on date mappings |
| PUT overwrites entire resource | Partial JSON sent without GET first | Always GET full resource, modify mapping section, PUT complete object |
