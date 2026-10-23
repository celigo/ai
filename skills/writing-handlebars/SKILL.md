---
name: writing-handlebars
description: Write Handlebars template expressions for Celigo integrations -- dynamic values in mappings, HTTP bodies, SQL queries, URIs, and filters. Use when building any resource configuration that needs computed, conditional, or formatted field values.
---

<!-- TIER:1 -->

# Writing Handlebars Expressions

Handlebars is Celigo's template language for embedding dynamic values into resource configurations. Any string field that the platform evaluates at runtime can contain Handlebars expressions.

Concerns when writing Handlebars:

- **Context** -- where the expression runs determines what data is available and how output is treated
- **Braces** -- double `{{ }}` vs triple `{{{ }}}` controls output escaping
- **Field access** -- `record.` prefix (AFE 2.0) outside a few bare-field contexts ([Key Syntax](#key-syntax)), `@root` for job/settings/connection, bracket notation for special characters
- **Helpers** -- 80 custom helpers for math, string manipulation, dates, encoding, regex, lookup caches, and more
- **Block helpers** -- `#each`, `#if`, `#compare`, `#with` for iteration and conditional logic
- **Date/time** -- moment.js format tokens with timezone support

Used across exports, imports, mappings, output filters, and APIs.

**Copy field paths from the data, never from the request.** Before writing an expression, read a record the step actually receives -- the import's `sampleData`, the source export's `mockOutput` or a recent run's records, or a failing record's retry data -- and take each path from it. The field the user names, or the destination field being filled, isn't evidence of the source's name (`phone` may arrive as `phoneNumber`), and a wrong path renders empty with no error ([step 2](#2-know-the-data-shape)). An import holds a record of its own only in `sampleData`; when it has none, read the flow that uses it (the import's dependencies name it) and that flow's source export's `mockOutput` or a recent run's records. When you report the change, say which record each path came from.

## Where Handlebars Are Used

### Mapping extracts

In import `mappings[].extract` fields, Handlebars concatenates, transforms, or conditionally selects values. The context is the current record.

### HTTP request templates

Export and import `http` blocks use Handlebars in `relativeURI`, `body`, `headers`, and `postBody`. In a `relativeURI`, double braces URL-encode the value at runtime -- use them for record values in path segments and query parameters, and triple braces only for a value that is already URL-encoded (a paging cursor or `next` link from a response). In a JSON body, double braces are JSON-escaped at runtime, so write string values as `"{{record.name}}"`; triple braces insert raw text, and a value holding a quote, backslash, newline or tab then breaks the body (422 `invalid_json`). Use triple braces for numbers, booleans and serialized JSON in a body, and in headers.

### RDBMS SQL queries

SQL queries in `rdbms.query` use Handlebars with the mandatory `record.` prefix (a `per_page` query iterates `batch_of_records` instead -- see [Template roots](#template-roots)). Double braces render the value as a single-quoted SQL string literal with embedded quotes escaped -- use them for strings and timestamps, without adding quotes of your own. Triple braces output the raw value, for numbers and identifiers. For full SQL patterns (MERGE, upsert, bulk operations, dialect differences), see [writing-sql](../writing-sql/SKILL.md).

### Filter rule operands

Filters are rule arrays, not templates (see [configuring-filters](../configuring-filters/SKILL.md)). A Handlebars string can be one operand of a rule, but only when the whole string is a single `{{…}}` expression with `record.`-prefixed paths: `["equals", "{{lowercase record.status}}", "open"]`. It renders as text, so wrap it in `["number", …]` before comparing it to a number.

### File paths and names

Dynamic file names in FTP/S3 exports and imports use Handlebars for timestamps and record-derived values. A file-provider export or lookup also describes each record's source file as `fileMeta`, with exactly `fileName`, `fileSize` and `lastModifiedTime` (epoch milliseconds): `{{fileMeta.fileName}}`, `{{dateFormat "YYYY-MM-DD" fileMeta.lastModifiedTime "x"}}`. A run-date stamp is `{{timestamp "YYYYMMDD" "<time zone>"}}`: `orders_{{timestamp "YYYYMMDD" "America/New_York"}}.csv` renders `orders_20261023.csv`. There is no `date` helper (`{{date 'YYYYMMDD'}}` is refused with `Missing helper: "date"`), and a bare `{{timestamp}}` renders the full ISO time, colons included. The names are case-sensitive ([configuring-exports > File Transfers](../configuring-exports/SKILL.md#file-transfers)).

### Delta tokens

Delta exports get two platform variables: `{{lastExportDateTime}}`, the last successful run (the window's lower bound), and `{{currentExportDateTime}}`, this run's upper bound. These are not record fields -- the platform injects them at runtime into the export's HTTP/query context only.

## Quick Reference

### Context Decision Matrix (AFE 2.0)

All contexts use `record.` prefix to access the current record's fields (AFE 2.0). Do NOT use bare field names, `data.field`, or `data.0.field` -- those are deprecated AFE 1.0 patterns. **Exceptions:** Mapper 1.0 (Salesforce / NetSuite DA), NetSuite saved-search criteria and an HTTP import lookup's body use bare field names without `record.` prefix (see [Key Syntax](#key-syntax)).

| Where | Syntax | Data prefix | Example |
|---|---|---|---|
| Mapping extract | `{{ }}` (double) | `record.` | `{{record.firstName}}` |
| HTTP relative URI | `{{ }}` (double) -- URL-encoded at runtime; triple only for an already-encoded value | `record.` | `/customers?email={{record.email}}` |
| HTTP body (JSON) | `{{ }}` inside quotes for strings (JSON-escaped); `{{{ }}}` for numbers, booleans and serialized JSON | `record.` | `{"name": "{{record.name}}", "qty": {{{record.qty}}} }` |
| HTTP import lookup body (`http.lookups[].body`) | as in a JSON body | none: the record's fields are at the top level | `{"email": "{{email}}"}` |
| SQL query (RDBMS) | `{{ }}` for strings and dates (quoted for you), `{{{ }}}` for numbers and identifiers | `record.` | `WHERE email = {{record.email}} AND qty > {{{record.qty}}}` |
| Filter rule operand | `{{ }}` (double), one expression filling the operand | `record.` | `["equals", "{{record.status}}", "open"]` |
| Delta URI parameter | `{{ }}` (double) | (platform-injected) | `?updated_since={{lastExportDateTime}}` |

An ID with no special characters renders the same with either brace style, which is why URI examples like `/customers/{{{record.id}}}` work too.

Additional context objects available via `@root`:

| Object | Description |
|--------|-------------|
| `record` | Current record being processed (`rows` when it's a grouped record) |
| `job` | Current job metadata |
| `settings` | Settings by scope key: `settings.integration`, `settings.flowGrouping`, `settings.flow`, `settings.connection`, `settings.iClient`, and the step's own `settings.export` or `settings.import` |
| `connection` | Connection object (for auth headers) |

**The root follows the record's shape.** An object record is `record`; a grouped record (an array of rows) is `rows`, and `record.*` is undefined on it. `batch_of_records` replaces both only when an HTTP import sends several records per request (`http.batchSize` above 1) or an RDBMS import runs `per_page`. One-to-many doesn't batch by itself: each child renders as `record`. See [Template roots](#template-roots).

### Key Syntax

- **`{{double-braces}}`** -- context-aware output at runtime. In a `relativeURI` the value is URL-encoded, which a path segment or query parameter needs. In an RDBMS query it becomes a single-quoted SQL string literal with embedded quotes doubled (`O'Neil` renders `'O''Neil'`), so never add your own quotes around it. In a JSON body it is JSON-escaped, so it goes inside the value's quotes (`"{{record.name}}"`).
- **`{{{triple-braces}}}`** -- raw output, no encoding or quoting. Use for serialized JSON, numbers and booleans in a body, headers, file paths, numbers and identifiers in SQL, and URI values that are already URL-encoded (double braces would encode them a second time). A raw string inside a JSON body's quotes breaks the body on the first quote, backslash, newline or tab. Never hand-quote a triple-brace string in SQL (`'{{{record.name}}}'`) -- the first apostrophe in the data breaks the statement.
- **The preview isn't the runtime.** The expression preview HTML-escapes double braces (`&` shows as `&amp;`, `'` as `&#x27;`); a running request URL-encodes them in a URI, quotes them in SQL and JSON-escapes them in a JSON body instead, with no HTML escaping. An `&#x27;` in the preview is no reason to switch a body value to triple braces. It also renders a null value empty where a run writes `null` (gotcha 16).
- **Always use `record.` prefix (AFE 2.0)** -- `{{{record.fieldName}}}` in all contexts, never bare `{{{fieldName}}}` or `{{{data.fieldName}}}` (AFE 1.0). Nested fields: `{{{record.properties.email}}}`.
- **Exceptions: Mapper 1.0, NetSuite search criteria and HTTP import lookup bodies** -- Mapper 1.0 (Salesforce / NetSuite DA) uses bare field names without `record.` prefix. So do NetSuite saved-search lookup criteria (`netsuite.restlet.criteria[].searchValue` and criteria formulas), where the incoming record is the root: write `{{poNumber}}`. `{{record.poNumber}}` resolves in runs but fails the step preview with `handlebars_template_parse_error`. So does the request template of an HTTP import's own lookup, in `http.lookups[].body` (a `postBody` there is never sent): the record's fields sit at the top level, so `{{email}}` renders the record's value and `{{record.email}}` renders empty ([configuring-imports > Gotchas](../configuring-imports/SKILL.md#gotchas)). A lookup export (`isLookup: true`) reads `{{record.email}}` as usual.

## Related Skills

- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- export adaptor types, delta sync setup, output filters
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- import adaptor types, operation modes, mapping systems
- [writing-mappings > Quick Reference](../writing-mappings/SKILL.md#quick-reference) -- Mapper 2.0 fields, lookups, conditional mappings

<!-- TIER:2 -->

## Syntax Fundamentals

### Braces

| Syntax | Behavior | When to use |
|--------|----------|-------------|
| `{{ }}` | Context-aware at runtime -- URL-encoded in a `relativeURI`; a quoted SQL string literal (embedded quotes doubled) in an RDBMS query; JSON-escaped in a JSON body | Record values in URIs; string and date values in SQL, with no quotes of your own; string values inside quotes in a JSON body |
| `{{{ }}}` | Raw output, no encoding or quoting | Serialized JSON, numbers and booleans in a body; headers, file paths, SQL numbers and identifiers, and URI values that are already URL-encoded |
| `\{{ }}` | Escaped tag -- a backslash before `{{` prints that tag literally (`\{{name}}` renders `{{name}}`) | Emitting literal Handlebars syntax. Raw blocks (`{{{{raw}}}}`) aren't supported -- they fail at runtime |

Inside a GraphQL `variables` value stored as a JSON string, the body is two JSON levels deep and the brace choice shifts with it: a string value is `"{{jsonEncode record.x}}"` and an object or array `{{jsonSerialize record.x}}`, both in double braces; triple braces there fail with 422 `invalid_json` ([configuring-imports > GraphQL imports](../configuring-imports/SKILL.md#graphql-imports)).

### Field access

| Pattern | Meaning |
|---------|---------|
| `record.fieldName` | Standard field reference (AFE 2.0), outside the [Key Syntax](#key-syntax) bare-field contexts |
| `record.nested.field` | Dot-notation for nested objects |
| `record.[Field With Spaces]` | Bracket notation for special characters in field names |
| `record.items.[0].name` | Array index access. Mid-path, `record.items.0.name` works too; a trailing `.0` (`record.tags.0`) and `record.items[0]` fail to parse |
| `@root.fieldName` | Root context -- escape nested `#each` scope |
| `../fieldName` | Parent context -- one level up from current `#each` |
| `this` | Current iteration element |
| `@index` / `@key` | Current array index / object key in `#each` |
| `@first` / `@last` | Boolean -- first/last element in `#each` iteration, over an array or an object |
| `as \|value key\|` | Block parameters: `{{#each record.address as \|value key\|}}` names the element and its key (the index, for an array); the names stay visible inside nested loops |

### Subexpressions (nesting helpers)

Use `()` to nest one helper's output as input to another. The inner helper evaluates first:

```
{{uppercase (split record.fullName " " 0)}}              -- split then uppercase the first word
{{{base64Encode (join ":" record.user record.pass)}}}    -- join then encode
{{#compare (add record.qty 1) ">" 100}}...{{/compare}}   -- add then compare
{{#each (after record.tags 3)}}...{{/each}}              -- slice then iterate
```

Subexpressions can be nested multiple levels deep. Each `()` resolves inside-out.

### Block helpers

- `{{#each record.items}}...{{/each}}` -- iterate array or object
- `{{#if record.active}}...{{else}}...{{/if}}` -- conditional
- `{{#compare val1 "==" val2}}...{{/compare}}` -- comparison (`==`, `===`, `!=`, `!==`, `<`, `>`, `<=`, `>=`). It compares like JavaScript: two strings compare as text, and a number on either side makes it numeric, so write a numeric threshold unquoted: `{{#compare record.total_price ">" 500}}` ([gotcha 4](#gotchas))
- `{{#with record.address}}...{{/with}}` -- change context scope

### Date/time formatting

Uses moment.js tokens. Pick braces by the field the date lands in, as for any value (see [Braces](#braces)): double in a URI, a SQL query or a quoted JSON string.

Common tokens: `YYYY` (4-digit year), `MM` (2-digit month), `DD` (2-digit day), `HH` (24h hour), `mm` (minute), `ss` (second), `SSS` (millisecond), `Z` (timezone offset), `X` (Unix seconds), `x` (Unix milliseconds). As an input format, `x` and `X` read an epoch: `{{dateFormat "YYYY-MM-DD" record.updatedMs "x"}}`. An epoch held in a string renders `Invalid date` without one; a millisecond epoch held as a number parses either way.

Timezone: pass as the **fourth** argument, after the input format (`""` when the input is ISO 8601) -- `{{{dateFormat "YYYY-MM-DD" record.date "" "US/Eastern"}}}`. The signature is `dateFormat outputFormat date inputFormat timezone`; a zone in the third slot is read as the input format, and the output is the literal text `Invalid date`. Name an IANA zone (`America/Chicago`, `US/Central`): an abbreviation such as `CST` is refused with 422 `doesn't support timezone=CST`. Without a zone the output is UTC; an input that carries its own offset converts correctly. Tokens are case-sensitive: `MM` is the month and `mm` the minute, so a 24-hour time of day is `HH:mm:ss` (`HH:MM:SS` renders hour, month and a fraction of a second). `timestamp` (the current time) takes the zone second; pass one rather than rely on a default: `{{timestamp "YYYY-MM-DDTHH:mm:ssZ" "America/Chicago"}}`.

### Date arithmetic

`dateAdd` adds **milliseconds** by default (1 hour = 3,600,000; 1 day = 86,400,000), or a count of a unit you name: `{{dateAdd record.d 3 "d"}}`, `{{dateAdd record.d -2 "h" "America/New_York"}}`. Units are `ms`, `s`, `min`, `h`, `d`, `w`, `M` and `Y` (or long forms such as `days`), quoted. A third argument that isn't a unit is read as the time zone, so bare `m` and `y` fail with 422 `doesn't support timezone=m`. With a zone, `d`, `w`, `M` and `Y` follow that zone's calendar -- the same wall-clock time across a daylight-saving change -- while `ms` through `h` add exact durations; without one the math runs in UTC. Month and year math clamps (Jan 31 + 1 `M` is Feb 28), and a result with a zone has no milliseconds (`2026-02-01T10:00:00Z`).

## Runtime Context at Each Stage

What `{{record.X}}` or `{{settings.Y}}` actually resolves to depends on **which bubble** the expression runs in and on the shape of the record it renders against. The bubble shapes below come from captures of the whole context on import and lookup bubbles, echoed through integrator.io's own `/v1/mirror`; such a capture carries credential material, and the mirror's reply echoes the connection's `Authorization` header, so read [How to rediscover the shape for any bubble](#how-to-rediscover-the-shape-for-any-bubble) before making one. A capture lists the context's own keys, so it never shows `record` or `rows` (see [Template roots](#template-roots)).

### Template roots

- **`record`** -- the record, when it's an object.
- **`rows`** -- the record, when it's grouped (an array of rows: a `groupByFields` export, file key columns, a grouped NetSuite saved search). Read it as `{{rows.0.field}}` or `{{#each rows}}`; `record.*` is undefined on it.
- **`batch_of_records`** -- the root only when an HTTP import sends several records per request (`http.batchSize` above 1) or an RDBMS import runs `per_page`. Iterate `{{#each batch_of_records}}` and read `this.record.<field>` (`this.rows` for a grouped record); a root-level `record` or `rows` is undefined there.
- **One-to-many doesn't batch by itself** -- each child renders as `record` (children are batched only under the `batchSize` rule above), and with `pathToMany` set the parent's other fields are under `record._PARENT`.
- **`data`** -- always lists the records in the current request: one record when the import sends one per request.

### Import bubble (HTTPImport, NetSuiteDistributedImport, etc.)

On an HTTP import, fields render against different versions of the record:

- `http.body` renders against the mapped record (unless `http.sendPostMappedData` is false), so template it with the mapped (destination) field names; a mapping that outputs the `rows [ ]` structure makes the body's root `rows`. Leave `http.body` unset to send the mapped record as is.
- `relativeURI`, header values and `mappings[].extract` see the record before mapping (source field names).
- An undefined path renders empty in a body and the record still succeeds (`strictHandlebarEvaluation` doesn't change that). In a relative URI or a header it fails the request. A null value is different: it renders as the text `null` (gotcha 16).

Besides the root, the context carries:

```
{
  "data": [ ...the records in this request... ],
  "lookup": { ...merged results from preceding lookup steps... },
  "recordLookupError": null | { ... },                               // set when a lookup failed
  "settings": { "import": {...}, "connection": {...}, ... },         // one key per scope
  "connection": { /* FULL connection object: auth, baseURI, encrypted credential fields, etc. */ },
  "import": { /* full import config */ },
  "job": { "parentJob": { "_id", "type", "startedAt", ... } },
  "templateVersion": 1,
  "testMode": false
}
```

### Lookup bubble (HTTPExport with `isLookup: true`)

Lookup request templates run per-record with a **different** shape (an HTTP import's own `http.lookups[]` aren't lookup exports: `record.` renders empty in their body, so name the fields at the top level; see [Key Syntax](#key-syntax)):

```
{
  "exportStartTime": "ISO timestamp",
  "settings": { "export": {...}, "connection": {...} },
  "connection": { /* full connection object, encrypted credential fields included */ },

  // the record is spread at TOP LEVEL
  "_id": "...",
  "name": "...",
  "<other record fields>": "...",

  "data": {
    /* copy of the record */,
    "_INITDATA": { /* original record before transforms */ }
  }
}
```

### Export bubble (source generator)

Export URI templates and delta tokens have a minimal context — the platform injects `{{lastExportDateTime}}`, `{{currentExportDateTime}}`, plus `settings` and `connection`. No `record.` context exists yet (records haven't been fetched).

### Key differences between import and lookup contexts

| Context key | Import | Lookup |
|---|---|---|
| Address the record as | `record.<field>` (`rows` when grouped, `batch_of_records` when batched) | `record.<field>` (the capture also shows its fields at the top level and in `data`) |
| `data` shape | the records in this request (one when the import sends one per request) | single record (with `_INITDATA` nested) |
| `exportStartTime` | No | Yes |
| `lookup` | Yes (merged preceding results) | N/A |
| `import` / `job` / `recordLookupError` / `testMode` | Yes | No |
| `connection` (full) | Yes | Yes |

### How to rediscover the shape for any bubble

To see only what a template renders, skip the mirror: the Handlebars processor ([step 5](#5-test-the-expression)) renders it against a record you supply and calls nothing. To see what the runtime binds, serialize only what you need. `{{{jsonSerialize this}}}` sends the whole runtime context to whatever endpoint the step calls, and that context includes the step's connection with its encrypted credential fields. To see a record's shape, set the body on an HTTP import or lookup to `{{{jsonSerialize record}}}` (`rows` for a grouped record) and point it only at integrator.io's own `/v1/mirror`, never a third-party echo service. Enable flow execution logging, run the flow, and inspect the `apiCall.response.body` — it's a copy of what you sent. Read only that body: the mirror also echoes the request's headers, `Authorization` included, as response headers. Execution logs mask it, but runtime `_headers` -- an `imports invoke` result, a response mapping's input, a postSubmit hook's `responseData` -- carry the calling connection's token in clear. Never print an invoke or preview result's `_headers`, never response-map `_headers` from a mirror call, and never log them from a hook. Capture the whole context only when you need a key outside the record, still only to `/v1/mirror`, and treat the result as a secret: it holds that credential material. A whole-context capture lists the context's own keys, and `record` and `rows` are aliases, not keys, so it never prints them: take the root from the record's shape ([Template roots](#template-roots)), not from the capture. This works for any bubble whose adaptor sends an HTTP body.

## How to Write a Handlebars Expression

### 1. Identify the context

Where the expression runs determines what data is available. In AFE 2.0, contexts use `record.` to access the current record, apart from the [Key Syntax](#key-syntax) exceptions:

| Context | Available data | Prefix |
|---------|---------------|--------|
| Mapping extract | Current record | `record.` |
| HTTP body/URI | Current record | `record.` |
| HTTP import lookup body | Current record, fields at the top level | none (`{{email}}`) |
| RDBMS query | Current record | `record.` |
| Filter rule operand | Current record | `record.` |
| Delta URI parameter | Platform variables | `lastExportDateTime`, `currentExportDateTime` |

Other context objects (`job`, `settings`, `connection`) are accessible via `@root` -- e.g., `{{@root.connection.http.encrypted.apiKey}}`.

Reference settings through a scope key: `{{settings.integration.x}}`, `{{settings.flowGrouping.x}}`, `{{settings.flow.x}}`, `{{settings.connection.x}}`, `{{settings.iClient.x}}`, or the step's own `{{settings.export.x}}` / `{{settings.import.x}}`. Steps inside an API or a Tool get only their own scope plus connection and iClient. `{{settings.x}}` and paths built from settings-form labels resolve to nothing: they render empty in a body and fail the request in a relative URI or header, where rendering is strict.

When the step batches (`http.batchSize` above 1, or an RDBMS `per_page` query), iterate `{{#each batch_of_records}}{{this.record.field}}{{/each}}`. A grouped record is `rows` (`{{rows.0.field}}`), and a one-to-many child is `record`, with its parent's fields under `record._PARENT` when `pathToMany` is set.

### 2. Know the data shape

Before writing any expression, inspect what the input data looks like. For an import, that's the record entering it: the import's `sampleData` when it has one, otherwise the records of the flow's source export (its `mockOutput`, or a recent run). The name of the field you're filling isn't evidence of the record's (`email` may arrive as `emailAddress`), and a wrong path renders empty in a body with no error.

```bash
# Test-run an export to see actual record shapes
celigo exports invoke <exportId>

# Check mock output for the expected shape
celigo --jq '.mockOutput' exports get <exportId>
```

### 3. Choose the right braces

- `{{ }}` (double) for record values in a `relativeURI` (URL-encoded at runtime), for string and date values in SQL (quoted and escaped for you), and for string values inside quotes in a JSON body (JSON-escaped)
- `{{{ }}}` (triple) for serialized JSON, numbers and booleans in a body, headers, file paths, numbers and identifiers in SQL, and URI values that are already URL-encoded
- In mapping extracts and display text, `{{ }}` where HTML escaping is acceptable. Free text in a JSON body -- a message, a note, a description -- is a string value like any other: `"{{record.note}}"`
- Judge a double-brace URI, SQL or JSON-body value by a run, not the preview -- the preview HTML-escapes double braces, which the runtime doesn't

### 4. Find the right helper

See the [helper index](references/helpers/helper-index.md) for all 80 custom helpers. Key categories:

- **[Math](references/helpers/math.md)** -- `abs`, `add`, `subtract`, `multiply`, `divide`, `modulo`, `ceil`, `floor`, `round`, `sum`, `avg`, `random`, `toFixed`, `toExponential`, `toPrecision`
- **[String](references/helpers/string.md)** -- `uppercase`, `lowercase`, `capitalize`, `capitalizeAll`, `camelcase`, `pascalcase`, `snakecase`, `dashcase`, `dotcase`, `pathcase`, `sentence`, `trim`, `trimLeft`, `trimRight`, `padLeft`, `padRight`, `replace`, `replacefirst`, `removefirst`, `chop`, `truncateWords`, `sanitize`, `split`, `join`, `reverse`, `occurrences`, `substring`
- **[Array](references/helpers/array.md)** -- `after`, `before`, `sort`, `unique`, `pluck`, `arrayify`, `getValue`, `sum`. There is no `first` or `last` helper: index the array (`{{record.items.[0].sku}}`) or use `@first` / `@last` inside `#each`. `reverse` reverses a string; on an array it renders empty. `lookup` isn't an array helper either; it reads a lookup defined on the same import step (`{{lookup.<name>}}`), and `getLookupCacheData` reads a lookup cache by its alias on the integration (`{{getLookupCacheData "skumap" record.sku}}`)
- **[Date/time](references/helpers/date.md)** -- `dateFormat`, `dateAdd`, `timestamp`
- **[Encoding](references/helpers/encoding.md)** -- `base64Encode`, `base64Decode`, `htmlEncode`, `htmlDecode`, `jsonEncode`, `jsonParse`, `jsonSerialize`, `encodeURI`, `decodeURI`, `stripProtocol`, `stripQuerystring`
- **[Regex](references/helpers/regex.md)** -- `regexMatch`, `regexReplace`, `regexSearch`
- **[Auth/crypto](references/helpers/auth.md)** -- `hash`, `hmac`, `aws4`
- **[Type/logic](references/helpers/type-logic.md)** -- `typeOf`, `eq`, `isTruthy`, `isFalsey`, `hasOwn`, `hasNoItems`, and the block helper `#compare`. There are no `gt`, `gte`, `lt` or `lte` helpers; compare with `#compare`
- **[Format](references/helpers/format.md)** -- `addCommas`, `bytes`, `ordinalize`
- **[Block helpers](references/helpers/block-helpers.md)** -- `#each`, `#if`, `#compare`, `#contains`, `#filter`, `#and`, `#or`, `#not`, `#neither`, `#ifEven`, `#unless`, `#with`, `#some`, `#startsWith`, `#inArray`, `#isEmpty`

Helper names are exact and case-sensitive: the case-conversion helpers are all lowercase (`camelcase`, not `camelCase`), and there's no `encodeURIComponent` (`encodeURI` already encodes `&`, `=` and `/`). A name that isn't a helper fails the render with 422 `Missing helper: "<name>"` once it has arguments (in a filter rule, 422 `Failed to evaluate handlebars expression`), but with none it's read as a field: a misspelled `{{timestmap}}` renders empty. The processor catalog (`celigo processors list`, the handlebars entry's `helperFunctions`) doesn't list every helper -- `eq`, `modulo`, `truncateWords` and `reverse` render although it omits them -- so check the index, and render a doubtful helper once (step 5).

### 5. Test the expression

Render the template first with the Handlebars processor (`POST /v1/processors/handlebars`): it saves nothing, runs no flow and calls no endpoint. It binds `data` as the template's root, so send the envelope the step would bind -- `{"record": {...}}`, `{"rows": [...]}` or `{"batch_of_records": [...]}`. Its output HTML-escapes double braces (`&` renders `&amp;`) where a run URL-encodes, quotes or JSON-escapes them, so judge a double-brace value by a run. It also renders a null value empty where a run writes `null` (gotcha 16). It has no integration to read lookup caches from (`getLookupCacheData` answers 422), and the MCP server has no tool for it.

```bash
# Render against a sample record -- stateless, nothing saved or sent
echo '{"rules": {"template": "{{record.name}} | {{{record.name}}}", "resultMode": "text"},
       "data": {"record": {"name": "Smith & Sons"}}}' | celigo processors invoke handlebars
# -> "data": "Smith &amp; Sons | Smith & Sons"

# Invoke export to see if dynamic URI/query produces results
celigo exports invoke <exportId>

# Invoke import to validate body template renders correctly -- a real write:
# each piped record is sent to the destination, so point it at a test destination
echo '[{"orderId":"test-1"}]' | celigo imports invoke <importId>
```

## Common Patterns

### JSON comma separation in HTTP body templates

Avoid trailing commas when building JSON arrays:

```
{{#each record.items}}{...}{{#if @last}}{{else}},{{/if}}{{/each}}
```

### Batched, grouped and one-to-many records

When an HTTP import sends several records per request (`http.batchSize` above 1) or an RDBMS import runs `per_page`, iterate `batch_of_records`; each entry carries `record` (`rows` for a grouped record):

```
{{#each batch_of_records}}
  {{this.record.orderId}}
  {{this.record.[Shipping City]}}
{{/each}}
```

With one record per request, a grouped record is `rows`, and a one-to-many child is `record`, with the parent under `record._PARENT` when `pathToMany` is set:

```
{{#each rows}}{{this.sku}} {{/each}}
{{record._PARENT.orderId}}
```

### Value or a default when empty

In a JSON body, keep the whole conditional inside the value's quotes, with double braces for the value:

```
"phone": "{{#if record.mobile}}{{record.mobile}}{{else}}N/A{{/if}}",
"name": "{{#if record.nickname}}{{record.nickname}}{{else}}{{record.firstName}}{{/if}}"
```

`#if` takes its `{{else}}` branch for an empty string, null and a missing field -- and also for `0`, `false` and `[]`; `{{#unless record.mobile}}N/A{{else}}{{record.mobile}}{{/unless}}` is the same test. `#isEmpty` doesn't cover an empty string (every string takes its `{{else}}` branch), and `{{#compare record.mobile "==" ""}}` misses null and missing. There is no `default`, `ifEmpty` or `coalesce` helper (422 `Missing helper`), `{{or record.mobile "N/A"}}` is refused (`or` works only as a block), and JavaScript's `||` is a parse error. Take the path from the record ([step 2](#2-know-the-data-shape)), not from the field you're filling: with a guessed path the test is always false, so every record silently gets the default.

### Nested iteration with parent context

```
{{#each record.orders}}
  Order: {{{this.id}}}  Customer: {{{../record.customerName}}}
  {{#each this.items}}
    Item: {{{this.sku}}}
  {{/each}}
{{/each}}
```

Inside the inner loop, `this`, `@index` and `@key` belong to the inner loop. Name the outer loop's element to keep it in reach: `{{#each record.orders as |order|}}{{#each order.items}}{{{order.id}}}/{{{this.sku}}} {{/each}}{{/each}}`.

### SQL IN clause from list variable

Build by a preSavePage hook (which can inject fields into the record), rendered with triple braces:

```
SELECT id FROM orders WHERE status IN ({{{record.statusList}}})
```

### JavaScript-to-Handlebars equivalents

| JavaScript | Handlebars |
|-----------|------------|
| `str.split("?id=")[1]` | `{{split record.field "?id=" 1}}` |
| `str.replace("old", "new")` | `{{replace record.field "old" "new"}}` |
| `str.match(/pattern/)` | `{{{regexMatch record.field "pattern"}}}` |
| `str.match(/id=(\d+)/)[1]` | `{{regexMatch (split record.url "id=" 1) "^\d+"}}` -- `regexMatch` returns the whole match, never a capture group |
| `value \|\| "N/A"` | `{{#if record.value}}{{record.value}}{{else}}N/A{{/if}}` -- `\|\|` is a parse error, and there's no `default` helper |
| `Math.abs(n)` | `{{abs record.field}}` |
| `arr.length` | `{{record.items.length}}` |
| average of `arr` | `{{divide (sum record.prices) record.prices.length}}` -- `avg` doesn't unwrap an array |

<!-- TIER:3 -->

## Pre-Submit Checklist

Before finalizing any Handlebars expression, verify each item:

- [ ] **Braces match the field.** `{{ }}` for values in a `relativeURI` (URL-encoded at runtime), for string and date values in SQL (quoted and escaped -- no quotes of your own), and for string values inside quotes in a JSON body (JSON-escaped: `"{{record.note}}"`); `{{{ }}}` for numbers, booleans and serialized JSON in a body, headers, file paths, SQL numbers and identifiers, and already-encoded URI values. A triple-brace string inside a JSON body's quotes fails each record whose value holds a double quote, backslash, line break or tab (422 `invalid_json`).
- [ ] **Paths come from the data, not the destination.** Read each field's name in the records the template renders against (the import's `sampleData`, the source export's `mockOutput` or a recent run's records; for an import body, the mapped record), not from the field you're filling: a wrong path renders empty in a body with no error, so `{{record.contact.email}}` sends `""` when the record holds `contact.emailAddress`.
- [ ] **`record.` prefix everywhere (AFE 2.0).** All contexts use `record.fieldName` -- mappings, HTTP bodies, SQL, filters. Never use bare `fieldName`, `data.fieldName`, or `data.0.fieldName` (AFE 1.0). Exceptions: Mapper 1.0 (Salesforce / NetSuite DA), NetSuite saved-search criteria and an HTTP import lookup's body (`http.lookups[].body`) use bare field names.
- [ ] **The root matches the record's shape.** A grouped record is `rows`, and a batched request (`http.batchSize` above 1, RDBMS `per_page`) is `batch_of_records`; `record.*` is undefined on both.
- [ ] **Every block is closed, and no literal `}` touches a closing tag.** Each `{{#if}}`, `{{#each}}`, `{{#unless}}` and `{{#with}}` has its `{{/…}}` (gotcha 15); `{"in": {{{jsonSerialize record}}} }`, not `{"in": {{{jsonSerialize record}}}}`; `{{/if}} }`, not `{{/if}}}`.
- [ ] **`lastExportDateTime` only in export context.** This platform-injected variable is available in the export's HTTP/query context for delta syncs only -- not in mappings or import templates.
- [ ] **`dateAdd` offsets are milliseconds unless a unit follows.** 1 day is `86400000` or `1 "d"`, never `86400`; `m` and `y` aren't units (`min`, `M`, `Y`).
- [ ] **`#each` context shifts.** Inside `{{#each}}`, `this` is the current item. Use `../` for parent or `@root` for top-level fields.
- [ ] **Missing fields: empty in bodies, errors elsewhere.** In an HTTP body or a mapping an undefined field renders an empty string -- guard with `{{#if field}}` when the downstream system rejects empty values. In a relative URI, a header, or an SQL query the same undefined path fails the request instead. Guard an optional date or object before passing it to `dateFormat`, `dateAdd` or `jsonSerialize`. A null field, or one under a null object, isn't missing: guard it too, or it arrives as `null` (gotcha 16).
- [ ] **Bracket notation for special characters.** Field names with spaces, dots, or hyphens need `record.[Field Name]` syntax.
- [ ] **`#compare` thresholds are unquoted numbers.** Two strings compare as text (`"1250.00" > "500"` is false); a number on either side makes the comparison numeric, so compare a string amount against `500`, not `"500"`.
- [ ] **Only real helpers, spelled exactly.** No `first`, `last`, `gt`, `gte`, `lt`, `lte`, `default`, `ifEmpty` or `coalesce` -- each fails with `Missing helper` -- and `or` only as a block (`{{#or a b}}…{{/or}}`). Names are case-sensitive, and a misspelled name with no arguments renders empty instead of failing.
- [ ] **Saved with a full PUT.** A template is part of its resource: GET it, change the string, and PUT the whole document back. An import's PATCH accepts only `debugUntil`, so a refused PATCH means "send a PUT", not "edit it in the UI".
- [ ] **Test with real data.** Render it with `celigo processors invoke handlebars` against a sample record (nothing is saved or sent), then run `celigo exports invoke` (reads the source) or `celigo imports invoke` (writes to the destination -- use a test destination) to verify the expression renders correctly with actual records.

## Gotchas

1. **Double braces format for the field they're in.** At runtime `{{ }}` URL-encodes in a `relativeURI`, renders a quoted, escaped SQL string literal in an RDBMS query, and JSON-escapes a string inside quotes in a JSON body (`"{{record.note}}"` arrives with its quotes, backslashes, line breaks and tabs intact, and nothing HTML-escaped) -- usually what you want. Triple braces skip that: a raw `&` or space breaks a query string, a hand-quoted `'{{{record.name}}}'` breaks on an apostrophe, and `"{{{record.note}}}"` in a JSON body fails each record whose value holds a double quote, backslash, line break or tab with 422 `invalid_json`, while the other records go through. Use `{{{ }}}` where raw is the point -- numbers, booleans and serialized JSON (`{{{jsonSerialize record.items}}}`, unquoted) in a body, headers, SQL numbers and identifiers, and values already URL-encoded, which double braces would encode twice (`%2B` becomes `%252B`). The same goes for `{{encodeURI record.x}}` in a URI: double braces already encode `&`, `=`, `/` and spaces, so write `{{record.x}}` or `{{{encodeURI record.x}}}`, not both.
2. **Always use `record.` prefix (AFE 2.0).** Use `{{{record.fieldName}}}`, not `{{{fieldName}}}` or `{{{data.fieldName}}}`. The `record.` prefix applies in mappings, HTTP, SQL and filters; bare field names belong only in the [Key Syntax](#key-syntax) exceptions (Mapper 1.0, NetSuite search criteria, an HTTP import lookup's body). Elsewhere, bare field names and the `data.` prefix are deprecated AFE 1.0 syntax.
3. **`lastExportDateTime` is platform-injected.** It exists only in the export's HTTP/query context for delta syncs -- not available in mappings or import templates.
4. **`#compare` follows JavaScript comparison.** Two strings compare as text, character by character: `"9" > "10"` and `"75.00" > "500"` are true, and `"1250.00" > "500"` is false. A number on either side makes the comparison numeric, so compare a string field (most APIs send amounts as strings) against an unquoted number: `{{#compare record.total_price ">" 500}}`. A helper that returns a number, such as `round`, works on the left too; `toFixed` returns a string. `==` and `!=` convert types before comparing, `===` and `!==` don't.
5. **Nested `#each` changes context.** Inside `{{#each record.items}}`, `this` is the current item, not the record. Use `../` to reach the parent or `@root` for the top-level context.
6. **`dateAdd` counts milliseconds unless you name a unit.** Adding 1 day is `86400000` or `1 "d"`, not `86400`, which lands seconds in the future. `m` and `y` aren't units: the third argument is then read as a time zone and refused (`doesn't support timezone=m`), so write `min`, `M` or `Y`.
7. **`regexMatch` returns the match string; `regexSearch` returns the position.** Don't confuse them -- `regexSearch` returns a number (0-indexed position), not the matched text. `regexMatch`'s index picks the Nth whole match (0 is the first), and a capture group doesn't narrow what it returns: `{{regexMatch "id=123" "id=(\d+)"}}` gives `id=123`. Split on the prefix first: `{{regexMatch (split record.url "id=" 1) "^\d+"}}`.
8. **Raw blocks `{{{{ }}}}` fail at runtime.** No `raw` block helper is registered, so `{{{{raw}}}}...{{{{/raw}}}}` errors (`Unable to read "call" from undefined`) instead of printing its contents. To emit literal braces, put a backslash before the tag: `\{{name}}` renders `{{name}}`.
9. **Missing fields render empty only in bodies and mappings.** There, an undefined field (not a null one -- gotcha 16) outputs nothing and raises no error, even with `http.strictHandlebarEvaluation: true` -- use `{{#if field}}` to guard when the downstream system rejects empty values. In a relative URI, a header, or an SQL query, rendering is strict: an undefined path fails the request (SQL steps fail with `cannot_evaluate_handlebars`). Don't count on the empty render once a helper wraps the field: on a missing input `dateFormat` prints the run's date, and `dateAdd` and `jsonSerialize` fail the record. Guard an optional date or object with `{{#if record.x}}…{{/if}}` before passing it to them. The run's error is `handlebars_template_parse_error`, with the template as its message, so only a processor render (`celigo processors invoke handlebars`) shows the helper's own error.
10. **`jsonEncode` escapes a value; it adds no quotes.** It escapes quotes, backslashes, and newlines so a string can sit inside a JSON string you quote yourself: `"note": "{{{jsonEncode record.note}}}"`. Use triple braces -- double braces escape the result a second time (the preview shows `\&quot;`), so the value arrives with extra backslashes. Numbers and booleans pass through unchanged; objects render `[object Object]`, so use `jsonSerialize` for objects and arrays. To send an object or array as a JSON *string* value, quote its serialization: `"items": "{{jsonSerialize record.items}}"` (double braces JSON-escape it at run time) and `"items": "{{{jsonEncode (jsonSerialize record.items)}}}"` arrive as the same string.
11. **A literal `}` can't touch a closing tag.** The parser reads `}}}` and `}}}}` as close tokens, so `{"id": {{record.id}}}` and `{{/if}}}` fail to compile (`got 'CLOSE_UNESCAPED'`), and so does `{"in": {{{jsonSerialize record}}}}` (`got 'CLOSE_RAW_BLOCK'`). The save doesn't catch it: the step saves, and every record fails at run time. Put a space or a newline before the literal brace: `{"in": {{{jsonSerialize record}}} }`, `{{/if}} }`. Comment closes are exempt. JSON written inside a string, such as a GraphQL `variables` value, hits this most often. The run's error is `handlebars_template_parse_error` with "Failed to generate request body from template: <template>. Details: <parse error>", and the flow's error list keeps only its first 500 characters (497 and `...`), so in a long template the part that names the broken token is missing: search the template for a literal `}` right after a closing `}}` or `}}}` and for a block left open (gotcha 15), or get the full message from an import invoke or a Handlebars processor render. Double quotes inside a tag are not the problem: `"date": "{{dateFormat "YYYY-MM-DD" record.date}}"` is valid in a JSON body, because the tag renders before anything parses the JSON.
12. **String arguments have no escape sequences except `\"` and `\'`.** `"\n"` is a backslash and an `n`, not a line feed. A double-quoted literal can't end in a backslash when a `"` follows anywhere later in the template, as in any JSON body (`got 'INVALID'`); write that one in single quotes (`'\'`). Arguments still wrapped in JSON-escaped quotes (`{{dateFormat \"YYYY\" record.d}}`, from a template pasted already escaped) fail to parse the same way: the template text needs plain `"` or `'`.
13. **XML records hide two shapes.** With the XML parser's custom mode (`V0_json: false`), an empty element parses to `{}`, which prints `[object Object]` and passes `{{#if}}`; guard it with `{{#if (eq (typeOf record.Note) "string")}}`. A repeating element that occurs once is an object, so `{{#each record.Line}}` walks its fields instead of the one line; iterate `{{#each (arrayify record.Line)}}`, or list the element in the parser's `listNodes` ([configuring-exports > Gotchas](../configuring-exports/SKILL.md#gotchas)).
14. **An array printed as a value is comma-joined.** `{{record.tags}}` renders `t0,t1` and an array of objects `[object Object],[object Object]`, in a body and in a mapping alike. So does an array passed to a helper that expects values: `{{avg record.prices}}` renders `2,5,7`, not an average (`sum` unwraps an array; `avg` doesn't). Iterate with `#each`, `join` with your own separator, or `jsonSerialize` it.
15. **Every block needs its closing tag.** A block opened without one -- `{{#if record.coupon}}` with no `{{/if}}`, or an unclosed `{{#each}}`, `{{#unless}}` or `{{#with}}` -- fails to compile: every record fails, whether or not it has the field, with `handlebars_template_parse_error` ("Expecting 'OPEN_INVERSE_CHAIN', 'INVERSE', 'OPEN_ENDBLOCK', got 'EOF'"), and the step still saves. Add the missing closing tag where the block should end; removing a brace doesn't fix it. In a JSON body that is usually `…"coupon": "{{record.coupon}}"{{/if}} }`, with a space between `{{/if}}` and the object's closing `}` (gotcha 11). The flow's error list keeps only the message's first 500 characters, which in a long body stop before the parse detail; an import invoke or a Handlebars processor render shows it.
16. **A null value renders `null`, not empty.** In a JSON body, double braces write a null field -- or any field under an object that is null (`{{record.customer.name}}` with `"customer": null`) -- as the text `null`: a run and the import's own preview send `"name": "null"`, while the Handlebars processor renders it empty, so a template can test clean and still send "null". A field that is absent renders empty everywhere, and so do triple braces, `lowercase` and `trim` over the null; `jsonSerialize` prints `null`. In a relative URI a null leaf renders `null` too, and a field under a null object fails the request like an undefined path (`"name" not defined in null`). Guard a nullable field -- `{{#if record.customer.name}}{{record.customer.name}}{{/if}}` -- or the whole object with `{{#if record.customer}}…{{/if}}`.
17. **Arithmetic on decimals follows JavaScript floating point.** `{{multiply record.total_price 100}}` renders `1998.9999999999998` for `"19.99"` and `3495.0000000000005` for `"34.95"`, while `"20.00"` gives `2000`, so a destination that wants whole cents refuses only some records. Wrap the result in `round` -- `{{round (multiply record.total_price 100)}}` -- or in `toFixed` with the decimals you need (it returns a string). `floor` and `ceil` cut the wrong way for some values: `19.99` floors to `1998` and `34.95` ceils to `3496`. `add`, `subtract` and `divide` behave the same way.

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `&amp;`, `&lt;`, `&quot;` or `&#x27;` in the preview of a body or message | The preview and the Handlebars processor HTML-escape double braces; a run doesn't -- in a JSON body it JSON-escapes them, so the preview's `It&#x27;s` arrives as `It's` | Nothing to fix: keep `"{{record.x}}"` for strings in a JSON body, and judge by what a run sends -- the `request` stage of a test run, or debug logs. Triple braces there break the body on the first quote or line break |
| Some records fail with 422 `invalid_json` ("An invalid JSON is sent in the request.body … Expected ',' or '}' after property value", or "Bad control character in string literal") and nothing is sent for them, while others go through | A triple-brace string inside a JSON body's quotes (`"{{{record.note}}}"`) inserted a value holding a double quote, backslash, line break or tab raw. The message's advice to quote property names is generic; the property names are fine | Write `"{{record.note}}"` (or `"{{{jsonEncode record.note}}}"`), then retry the failed records |
| `&amp;` / `&#x3D;` in the preview of a URI | The preview HTML-escapes double braces; the runtime URL-encodes them | Nothing to fix -- check the URL a run actually sends |
| The destination gets the text `"null"` where the source field is null | Double braces in a JSON body write a null value -- a null field, or a field under a null object -- as `null`; the Handlebars processor renders it empty, so testing the template doesn't show it | Guard the field: `{{#if record.customer.name}}{{record.customer.name}}{{/if}}` (gotcha 16) |
| `''value''` or a SQL syntax error at a quote | Quotes added around a double-brace value (`'{{record.name}}'`), or a hand-quoted triple-brace value hit an apostrophe | Use `{{record.name}}` with no quotes of your own |
| Paging cursor or `next` link corrupted (`%2B` became `%252B`), or a URI value encoded twice (`%2526`) | Double braces URL-encoding a value that was already encoded -- a cursor, or the output of `{{encodeURI …}}` | Use triple braces for already-encoded URI values; write `{{record.x}}` or `{{{encodeURI record.x}}}`, not `{{encodeURI record.x}}` |
| Empty output, no error | Missing `record.` prefix (or using AFE 1.0 `data.field`) | Change to `{{{record.fieldName}}}`, except in the [Key Syntax](#key-syntax) bare-field contexts |
| An HTTP import lookup sends an empty value | `{{record.<field>}}` in `http.lookups[].body`, where it renders empty, or the template sits in `postBody`, which isn't sent | Name the field without `record.` (`{{email}}`), in `body` |
| `record.<field>` empty in a body, or the request fails from a URI or header | The record is grouped (root `rows`) or the request is batched (root `batch_of_records`) | Read `{{rows.0.field}}` / `{{#each rows}}`, or iterate `batch_of_records` ([Template roots](#template-roots)) |
| Every record fails at run time with `got 'CLOSE_UNESCAPED'` or `got 'CLOSE_RAW_BLOCK'`, though the step saved | A literal `}` touches a closing tag (`{{record.id}}}`, `{{{jsonSerialize record}}}}`, `{{/if}}}}`) | Put a space or newline before the literal `}` (gotcha 11) |
| Every record fails with `got 'EOF'` ("Expecting 'OPEN_INVERSE_CHAIN', 'INVERSE', 'OPEN_ENDBLOCK'"), with or without the field, though the step saved | A block (`{{#if}}`, `{{#each}}`, `{{#unless}}`, `{{#with}}`) has no closing tag | Add the closing tag where the block ends, with a space before any literal `}` after it: `{{/if}} }` (gotcha 15) |
| Every record fails with `handlebars_template_parse_error`, and the stored message stops inside the template at 500 characters (497 and `...`) | The flow's error list cuts every message to 500 characters, so the parse detail is gone; the cause is still in the template | Read the full message from an import invoke or a processor render, or search the template for a `}` right after `}}` (gotcha 11) and a block with no closing tag (gotcha 15) |
| 422 `Missing helper: "first"` (or `last`, `gt`, `gte`, `lt`, `lte`, `default`, `ifEmpty`, `coalesce`, `encodeURIComponent`, `camelCase`); in a filter rule, 422 `Failed to evaluate handlebars expression` | Not Celigo helpers, or a name in the wrong case | Index the array (`record.items.[0].sku`), use `@first` / `@last` inside `#each`, compare with `#compare`, write a default as `{{#if record.x}}{{record.x}}{{else}}N/A{{/if}}`, and match the [helper index](references/helpers/helper-index.md) exactly |
| 422 "handlebars Helper {{or}} only supports block usage and cannot be used as a subexpression" | `{{or record.x "N/A"}}` written as a default | `or` picks a block branch, not a value: `{{#if record.x}}{{record.x}}{{else}}N/A{{/if}}` |
| Parse error `Expecting 'ID', got 'NUMBER'` or `got 'INVALID'` at an array index | A trailing number (`record.tags.0`) or JavaScript brackets (`record.items[0]`) | Index with `.[N]`: `record.tags.[0]`, `record.items.[0].sku` |
| `[object Object]` in the output | An object, an array of objects, or an empty XML element (`{}`) printed as a value | `jsonSerialize` it, iterate it with `#each`, or guard an XML field with `(eq (typeOf record.x) "string")` (gotchas 13, 14) |
| 422 `doesn't support timezone=m` (or `=y`, or another word) | `dateAdd`'s third argument isn't one of its units, so it's read as a time zone | Use `ms`, `s`, `min`, `h`, `d`, `w`, `M` or `Y`, then the zone fourth |
| A date renders as `Invalid date` | The zone is in `dateFormat`'s third argument, the input format | Put it fourth: `{{dateFormat "YYYY-MM-DD HH:mm:ss" record.date "" "America/Chicago"}}` |
| 422 `doesn't support timezone=CST` | A zone abbreviation | Use an IANA name (`America/Chicago`) |
| Delta export returns all records | `lastExportDateTime` used outside export context (e.g., in mapping) | Move to the export's `relativeURI` or query parameter |
| `dateAdd` produces date seconds ahead instead of days | Value in seconds instead of milliseconds | Multiply by 1000 (`86400000`, not `86400`), or name the unit: `{{dateAdd record.d 1 "d"}}` |
| `#compare` takes the wrong branch on amounts (`"1250.00" > "500"` is false) | Two strings compare as text | Compare against an unquoted number: `{{#compare record.total_price ">" 500}}` |
| A destination refuses an amount as not a whole number, or a total is a cent off, on some records only | Arithmetic on decimal values returned a binary fraction: `{{multiply record.total_price 100}}` renders `1998.9999999999998` for `19.99` (gotcha 17) | Wrap it in `round` (or `toFixed` with the decimals needed), not `floor` or `ceil`, then retry the failed records |
| `undefined` or empty in nested `#each` | `this` scope changed; referencing parent field without `../` | Use `../fieldName` or `@root.fieldName` |
| JSON body has trailing comma | `{{#each}}` without comma-guard logic | Add `{{#if @last}}{{else}},{{/if}}` between items |
| Bracket notation field returns empty | Using `record.Field Name` instead of `record.[Field Name]` | Wrap field name in brackets: `record.[Field Name]` |
| `regexMatch` returns a number | Used `regexSearch` (returns position) instead of `regexMatch` | Switch to `regexMatch` for the matched text |
| A string value gets a second pair of quotes (`""abc""`) | `jsonSerialize` on a string adds JSON quotes inside quotes the template also wrote | Inside quotes use `{{{jsonEncode record.x}}}`; keep `jsonSerialize` for objects and arrays, unquoted |
