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
- **Field access** -- `record.` prefix in all contexts (AFE 2.0), `@root` for job/settings/connection, bracket notation for special characters
- **Helpers** -- 79 custom helpers for math, string manipulation, dates, encoding, regex, and more
- **Block helpers** -- `#each`, `#if`, `#compare`, `#with` for iteration and conditional logic
- **Date/time** -- moment.js format tokens with timezone support

Used across exports, imports, mappings, output filters, and APIs.

## Where Handlebars Are Used

### Mapping extracts

In import `mappings[].extract` fields, Handlebars concatenates, transforms, or conditionally selects values. The context is the current record.

### HTTP request templates

Export and import `http` blocks use Handlebars in `relativeURI`, `body`, `headers`, and `postBody`. In a `relativeURI`, double braces URL-encode the value at runtime -- use them for record values in path segments and query parameters, and triple braces only for a value that is already URL-encoded (a paging cursor or `next` link from a response). In bodies and headers, use triple braces so values go out raw.

### RDBMS SQL queries

SQL queries in `rdbms.query` use Handlebars with the mandatory `record.` prefix (a `per_page` query iterates `batch_of_records` instead -- see [Template roots](#template-roots)). Double braces render the value as a single-quoted SQL string literal with embedded quotes escaped -- use them for strings and timestamps, without adding quotes of your own. Triple braces output the raw value, for numbers and identifiers. For full SQL patterns (MERGE, upsert, bulk operations, dialect differences), see [writing-sql](../writing-sql/SKILL.md).

### Filter rule operands

Filters are rule arrays, not templates (see [configuring-filters](../configuring-filters/SKILL.md)). A Handlebars string can be one operand of a rule, but only when the whole string is a single `{{…}}` expression with `record.`-prefixed paths: `["equals", "{{lowercase record.status}}", "open"]`. It renders as text, so wrap it in `["number", …]` before comparing it to a number.

### File paths and names

Dynamic file names in FTP/S3 exports and imports use Handlebars for timestamps and record-derived values.

### Delta tokens

Delta exports get two platform variables: `{{lastExportDateTime}}`, the last successful run (the window's lower bound), and `{{currentExportDateTime}}`, this run's upper bound. These are not record fields -- the platform injects them at runtime into the export's HTTP/query context only.

## Quick Reference

### Context Decision Matrix (AFE 2.0)

All contexts use `record.` prefix to access the current record's fields (AFE 2.0). Do NOT use bare field names, `data.field`, or `data.0.field` -- those are deprecated AFE 1.0 patterns. **Exceptions:** Mapper 1.0 (Salesforce / NetSuite DA) and NetSuite saved-search criteria use bare field names without `record.` prefix (see [Key Syntax](#key-syntax)).

| Where | Syntax | Data prefix | Example |
|---|---|---|---|
| Mapping extract | `{{ }}` (double) | `record.` | `{{record.firstName}}` |
| HTTP relative URI | `{{ }}` (double) -- URL-encoded at runtime; triple only for an already-encoded value | `record.` | `/customers?email={{record.email}}` |
| HTTP body / postBody | `{{{ }}}` (triple) | `record.` | `{{{record.orderId}}}` in JSON body |
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

- **`{{double-braces}}`** -- context-aware output at runtime. In a `relativeURI` the value is URL-encoded, which a path segment or query parameter needs. In an RDBMS query it becomes a single-quoted SQL string literal with embedded quotes doubled (`O'Neil` renders `'O''Neil'`), so never add your own quotes around it.
- **`{{{triple-braces}}}`** -- raw output, no encoding or quoting. Use for JSON bodies, headers, file paths, numbers and identifiers in SQL, and URI values that are already URL-encoded (double braces would encode them a second time). Never hand-quote a triple-brace string in SQL (`'{{{record.name}}}'`) -- the first apostrophe in the data breaks the statement.
- **The preview isn't the runtime.** The expression preview HTML-escapes double braces (`&` shows as `&amp;`); a running request URL-encodes them in a URI and quotes them in SQL instead.
- **Always use `record.` prefix (AFE 2.0)** -- `{{{record.fieldName}}}` in all contexts, never bare `{{{fieldName}}}` or `{{{data.fieldName}}}` (AFE 1.0). Nested fields: `{{{record.properties.email}}}`.
- **Exceptions: Mapper 1.0 and NetSuite search criteria** -- Mapper 1.0 (Salesforce / NetSuite DA) uses bare field names without `record.` prefix. So do NetSuite saved-search lookup criteria (`netsuite.restlet.criteria[].searchValue` and criteria formulas), where the incoming record is the root: write `{{poNumber}}`. `{{record.poNumber}}` resolves in runs but fails the step preview with `handlebars_template_parse_error`.

## Related Skills

- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- export adaptor types, delta sync setup, output filters
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- import adaptor types, operation modes, mapping systems
- [writing-mappings > Quick Reference](../writing-mappings/SKILL.md#quick-reference) -- Mapper 2.0 fields, lookups, conditional mappings

<!-- TIER:2 -->

## Syntax Fundamentals

### Braces

| Syntax | Behavior | When to use |
|--------|----------|-------------|
| `{{ }}` | Context-aware at runtime -- URL-encoded in a `relativeURI`; a quoted SQL string literal (embedded quotes doubled) in an RDBMS query | Record values in URIs; string and date values in SQL, with no quotes of your own |
| `{{{ }}}` | Raw output, no encoding or quoting | JSON bodies, headers, file paths, SQL numbers and identifiers, and URI values that are already URL-encoded |
| `\{{ }}` | Escaped tag -- a backslash before `{{` prints that tag literally (`\{{name}}` renders `{{name}}`) | Emitting literal Handlebars syntax. Raw blocks (`{{{{raw}}}}`) aren't supported -- they fail at runtime |

### Field access

| Pattern | Meaning |
|---------|---------|
| `record.fieldName` | Standard field reference -- all contexts (AFE 2.0) |
| `record.nested.field` | Dot-notation for nested objects |
| `record.[Field With Spaces]` | Bracket notation for special characters in field names |
| `record.items.[0].name` | Array index access |
| `@root.fieldName` | Root context -- escape nested `#each` scope |
| `../fieldName` | Parent context -- one level up from current `#each` |
| `this` | Current iteration element |
| `@index` / `@key` | Current array index / object key in `#each` |
| `@first` / `@last` | Boolean -- first/last element in `#each` iteration |

### Subexpressions (nesting helpers)

Use `()` to nest one helper's output as input to another. The inner helper evaluates first:

```
{{uppercase (split record.fullName " " 0)}}              -- split then uppercase the first word
{{{base64Encode (join ":" record.user record.pass)}}}    -- join then encode
{{#compare (add record.qty 1) ">" "100"}}...{{/compare}} -- add then compare
{{#each (after record.tags 3)}}...{{/each}}              -- slice then iterate
```

Subexpressions can be nested multiple levels deep. Each `()` resolves inside-out.

### Block helpers

- `{{#each record.items}}...{{/each}}` -- iterate array or object
- `{{#if record.active}}...{{else}}...{{/if}}` -- conditional
- `{{#compare val1 "==" val2}}...{{/compare}}` -- comparison (`==`, `===`, `!=`, `!==`, `<`, `>`, `<=`, `>=`)
- `{{#with record.address}}...{{/with}}` -- change context scope

### Date/time formatting

Uses moment.js tokens. Pick braces by the field the date lands in, as for any value (see [Braces](#braces)): triple in a JSON body, double in a URI or SQL query.

Common tokens: `YYYY` (4-digit year), `MM` (2-digit month), `DD` (2-digit day), `HH` (24h hour), `mm` (minute), `ss` (second), `SSS` (millisecond), `Z` (timezone offset), `X` (Unix seconds), `x` (Unix milliseconds).

Timezone: pass as the **fourth** argument, after the input format (`""` when the input is ISO 8601) -- `{{{dateFormat "YYYY-MM-DD" record.date "" "US/Eastern"}}}`. The signature is `dateFormat outputFormat date inputFormat timezone`; a zone in the third slot is read as the input format.

### Date arithmetic

`dateAdd` works in **milliseconds**:
- 1 hour = 3,600,000
- 1 day = 86,400,000
- 7 days = 604,800,000

## Runtime Context at Each Stage

What `{{record.X}}` or `{{settings.Y}}` actually resolves to depends on **which bubble** the expression runs in and on the shape of the record it renders against. The bubble shapes below come from captures of the whole context on import and lookup bubbles, echoed through integrator.io's own `/v1/mirror`; such a capture carries credential material, so read [How to rediscover the shape for any bubble](#how-to-rediscover-the-shape-for-any-bubble) before making one. A capture lists the context's own keys, so it never shows `record` or `rows` (see [Template roots](#template-roots)).

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
- An undefined path renders empty in a body and the record still succeeds (`strictHandlebarEvaluation` doesn't change that). In a relative URI or a header it fails the request.

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

Lookup request templates run per-record with a **different** shape:

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

Serialize only what you need. `{{{jsonSerialize this}}}` sends the whole runtime context to whatever endpoint the step calls, and that context includes the step's connection with its encrypted credential fields. To see a record's shape, set the body on an HTTP import or lookup to `{{{jsonSerialize record}}}` (`rows` for a grouped record) and point it only at integrator.io's own `/v1/mirror`, never a third-party echo service. Enable flow execution logging, run the flow, and inspect the `apiCall.response.body` — it's a copy of what you sent. Capture the whole context only when you need a key outside the record, still only to `/v1/mirror`, and treat the result as a secret: it holds that credential material. A whole-context capture lists the context's own keys, and `record` and `rows` are aliases, not keys, so it never prints them: take the root from the record's shape ([Template roots](#template-roots)), not from the capture. This works for any bubble whose adaptor sends an HTTP body.

## How to Write a Handlebars Expression

### 1. Identify the context

Where the expression runs determines what data is available. In AFE 2.0, all contexts use `record.` to access the current record:

| Context | Available data | Prefix |
|---------|---------------|--------|
| Mapping extract | Current record | `record.` |
| HTTP body/URI | Current record | `record.` |
| RDBMS query | Current record | `record.` |
| Filter rule operand | Current record | `record.` |
| Delta URI parameter | Platform variables | `lastExportDateTime`, `currentExportDateTime` |

Other context objects (`job`, `settings`, `connection`) are accessible via `@root` -- e.g., `{{@root.connection.http.encrypted.apiKey}}`.

Reference settings through a scope key: `{{settings.integration.x}}`, `{{settings.flowGrouping.x}}`, `{{settings.flow.x}}`, `{{settings.connection.x}}`, `{{settings.iClient.x}}`, or the step's own `{{settings.export.x}}` / `{{settings.import.x}}`. Steps inside an API or a Tool get only their own scope plus connection and iClient. `{{settings.x}}` and paths built from settings-form labels resolve to nothing: they render empty in a body and fail the request in a relative URI or header, where rendering is strict.

When the step batches (`http.batchSize` above 1, or an RDBMS `per_page` query), iterate `{{#each batch_of_records}}{{this.record.field}}{{/each}}`. A grouped record is `rows` (`{{rows.0.field}}`), and a one-to-many child is `record`, with its parent's fields under `record._PARENT` when `pathToMany` is set.

### 2. Know the data shape

Before writing any expression, inspect what the input data looks like:

```bash
# Test-run an export to see actual record shapes
celigo exports invoke <exportId>

# Check mock output for the expected shape
celigo --jq '.mockOutput' exports get <exportId>
```

### 3. Choose the right braces

- `{{ }}` (double) for record values in a `relativeURI` (URL-encoded at runtime) and for string and date values in SQL (quoted and escaped for you)
- `{{{ }}}` (triple) for HTTP bodies, headers, file paths, numbers and identifiers in SQL, and URI values that are already URL-encoded
- In mapping extracts and display text, `{{ }}` where HTML escaping is acceptable; human-readable message bodies take `{{{ }}}`
- Judge a double-brace URI or SQL value by a run, not the preview -- the preview HTML-escapes double braces, which the runtime doesn't

### 4. Find the right helper

See the [helper index](references/helpers/helper-index.md) for all 79 custom helpers. Key categories:

- **[Math](references/helpers/math.md)** -- `abs`, `add`, `subtract`, `multiply`, `divide`, `modulo`, `ceil`, `floor`, `round`, `sum`, `avg`, `random`, `toFixed`, `toExponential`, `toPrecision`
- **[String](references/helpers/string.md)** -- `uppercase`, `lowercase`, `capitalize`, `capitalizeAll`, `camelcase`, `pascalcase`, `snakecase`, `dashcase`, `dotcase`, `pathcase`, `sentence`, `trim`, `trimLeft`, `trimRight`, `padLeft`, `padRight`, `replace`, `replacefirst`, `removefirst`, `chop`, `truncateWords`, `sanitize`, `split`, `join`, `reverse`, `occurrences`, `substring`
- **[Array](references/helpers/array.md)** -- `after`, `before`, `first`, `last`, `reverse`, `sort`, `unique`, `pluck`, `arrayify`, `lookup`, `getValue`, `sum`
- **[Date/time](references/helpers/date.md)** -- `dateFormat`, `dateAdd`, `timestamp`
- **[Encoding](references/helpers/encoding.md)** -- `base64Encode`, `base64Decode`, `htmlEncode`, `htmlDecode`, `jsonEncode`, `jsonParse`, `jsonSerialize`, `encodeURI`, `decodeURI`, `stripProtocol`, `stripQuerystring`
- **[Regex](references/helpers/regex.md)** -- `regexMatch`, `regexReplace`, `regexSearch`
- **[Auth/crypto](references/helpers/auth.md)** -- `hash`, `hmac`, `aws4`
- **[Type/logic](references/helpers/type-logic.md)** -- `typeOf`, `eq`, `isTruthy`, `isFalsey`, `hasOwn`, `hasNoItems`, `compare`
- **[Format](references/helpers/format.md)** -- `addCommas`, `bytes`, `ordinalize`
- **[Block helpers](references/helpers/block-helpers.md)** -- `#each`, `#if`, `#compare`, `#contains`, `#filter`, `#and`, `#or`, `#not`, `#unless`, `#with`, `#some`, `#startsWith`, `#inArray`, `#isEmpty`

### 5. Test the expression

```bash
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

### Conditional field with fallback

```
{{#if record.nickname}}{{{record.nickname}}}{{else}}{{{record.firstName}}}{{/if}}
```

### Nested iteration with parent context

```
{{#each record.orders}}
  Order: {{{this.id}}}  Customer: {{{../record.customerName}}}
  {{#each this.items}}
    Item: {{{this.sku}}}
  {{/each}}
{{/each}}
```

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
| `Math.abs(n)` | `{{abs record.field}}` |
| `arr.length` | `{{record.items.length}}` |

<!-- TIER:3 -->

## Pre-Submit Checklist

Before finalizing any Handlebars expression, verify each item:

- [ ] **Braces match the field.** `{{ }}` for values in a `relativeURI` (URL-encoded at runtime) and for string and date values in SQL (quoted and escaped -- no quotes of your own); `{{{ }}}` for JSON bodies, headers, file paths, SQL numbers and identifiers, and already-encoded URI values.
- [ ] **`record.` prefix everywhere (AFE 2.0).** All contexts use `record.fieldName` -- mappings, HTTP bodies, SQL, filters. Never use bare `fieldName`, `data.fieldName`, or `data.0.fieldName` (AFE 1.0). Exceptions: Mapper 1.0 (Salesforce / NetSuite DA) and NetSuite saved-search criteria use bare field names.
- [ ] **The root matches the record's shape.** A grouped record is `rows`, and a batched request (`http.batchSize` above 1, RDBMS `per_page`) is `batch_of_records`; `record.*` is undefined on both.
- [ ] **No literal `}` against a closing tag.** `{"in": {{{jsonSerialize record}}} }`, not `{"in": {{{jsonSerialize record}}}}`.
- [ ] **`lastExportDateTime` only in export context.** This platform-injected variable is available in the export's HTTP/query context for delta syncs only -- not in mappings or import templates.
- [ ] **`dateAdd` values in milliseconds.** 1 day = 86,400,000. Not seconds, not hours.
- [ ] **`#each` context shifts.** Inside `{{#each}}`, `this` is the current item. Use `../` for parent or `@root` for top-level fields.
- [ ] **Missing fields: empty in bodies, errors elsewhere.** In an HTTP body or a mapping an undefined field renders an empty string -- guard with `{{#if field}}` when the downstream system rejects empty values. In a relative URI, a header, or an SQL query the same undefined path fails the request instead. Guard an optional date or object before passing it to `dateFormat`, `dateAdd` or `jsonSerialize`.
- [ ] **Bracket notation for special characters.** Field names with spaces, dots, or hyphens need `record.[Field Name]` syntax.
- [ ] **`compare` is string-based.** `{{#compare "9" ">" "10"}}` is TRUE (lexicographic). Convert values first or use strict operators.
- [ ] **Test with real data.** Run `celigo exports invoke` (reads the source) or `celigo imports invoke` (writes to the destination -- use a test destination) to verify the expression renders correctly with actual records.

## Gotchas

1. **Double braces format for the field they're in.** At runtime `{{ }}` URL-encodes in a `relativeURI` and renders a quoted, escaped SQL string literal in an RDBMS query -- usually what you want. Triple braces skip that: a raw `&` or space breaks a query string, and a hand-quoted `'{{{record.name}}}'` breaks on an apostrophe. Use `{{{ }}}` where raw is the point -- JSON bodies, headers, SQL numbers and identifiers, and values already URL-encoded, which double braces would encode twice (`%2B` becomes `%252B`).
2. **Always use `record.` prefix (AFE 2.0).** Use `{{{record.fieldName}}}`, not `{{{fieldName}}}` or `{{{data.fieldName}}}`. The `record.` prefix applies in all contexts -- mappings, HTTP, SQL, filters. Bare field names and `data.` prefix are deprecated AFE 1.0 syntax.
3. **`lastExportDateTime` is platform-injected.** It exists only in the export's HTTP/query context for delta syncs -- not available in mappings or import templates.
4. **`compare` does string comparison.** `{{#compare "9" ">" "10"}}` is TRUE because `"9" > "1"` lexicographically. Use the strict equality operators or convert values first.
5. **Nested `#each` changes context.** Inside `{{#each record.items}}`, `this` is the current item, not the record. Use `../` to reach the parent or `@root` for the top-level context.
6. **`dateAdd` uses milliseconds, not seconds.** Adding 1 day is `86400000`, not `86400`. A common mistake that produces dates seconds in the future instead of days.
7. **`regexMatch` returns the match string; `regexSearch` returns the position.** Don't confuse them -- `regexSearch` returns a number (0-indexed position), not the matched text.
8. **Raw blocks `{{{{ }}}}` fail at runtime.** No `raw` block helper is registered, so `{{{{raw}}}}...{{{{/raw}}}}` errors (`Unable to read "call" from undefined`) instead of printing its contents. To emit literal braces, put a backslash before the tag: `\{{name}}` renders `{{name}}`.
9. **Missing fields render empty only in bodies and mappings.** There, an undefined field outputs nothing and raises no error -- use `{{#if field}}` to guard when the downstream system rejects empty values. In a relative URI, a header, or an SQL query, rendering is strict: an undefined path fails the request (SQL steps fail with `cannot_evaluate_handlebars`). Don't count on the empty render once a helper wraps the field: guard an optional date or object with `{{#if record.x}}…{{/if}}` before passing it to `dateFormat`, `dateAdd` or `jsonSerialize`.
10. **`jsonEncode` escapes a value; it adds no quotes.** It escapes quotes, backslashes, and newlines so a string can sit inside a JSON string you quote yourself: `"note": "{{{jsonEncode record.note}}}"`. Use triple braces -- double braces escape the result a second time (the preview shows `\&quot;`), which breaks the JSON. Numbers and booleans pass through unchanged; objects render `[object Object]`, so use `jsonSerialize` for objects and arrays.
11. **A literal `}` can't touch a closing tag.** The parser reads `}}}` and `}}}}` as close tokens, so `{"id": {{record.id}}}` and `{{/if}}}` fail to compile (`got 'CLOSE_UNESCAPED'`), and so does `{"in": {{{jsonSerialize record}}}}` (`got 'CLOSE_RAW_BLOCK'`). Put a space or a newline before the literal brace: `{"in": {{{jsonSerialize record}}} }`. Comment closes are exempt. JSON written inside a string, such as a GraphQL `variables` value, hits this most often.

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `&amp;`, `&lt;`, or `&quot;` in the preview of a body or message | The preview HTML-escapes double braces | Use triple braces `{{{ }}}` in bodies, and judge by what a run sends -- the `request` stage of a test run, or debug logs |
| `&amp;` / `&#x3D;` in the preview of a URI | The preview HTML-escapes double braces; the runtime URL-encodes them | Nothing to fix -- check the URL a run actually sends |
| `''value''` or a SQL syntax error at a quote | Quotes added around a double-brace value (`'{{record.name}}'`), or a hand-quoted triple-brace value hit an apostrophe | Use `{{record.name}}` with no quotes of your own |
| Paging cursor or `next` link corrupted (`%2B` became `%252B`) | Double braces URL-encoding a value that was already encoded | Use triple braces for already-encoded URI values |
| Empty output, no error | Missing `record.` prefix (or using AFE 1.0 `data.field`) | Change to `{{{record.fieldName}}}` -- applies in all contexts |
| `record.<field>` empty in a body, or the request fails from a URI or header | The record is grouped (root `rows`) or the request is batched (root `batch_of_records`) | Read `{{rows.0.field}}` / `{{#each rows}}`, or iterate `batch_of_records` ([Template roots](#template-roots)) |
| Template fails to compile: `got 'CLOSE_UNESCAPED'` or `got 'CLOSE_RAW_BLOCK'` | A literal `}` touches a closing tag (`{{record.id}}}`, `{{{jsonSerialize record}}}}`) | Put a space or newline before the literal `}` |
| Delta export returns all records | `lastExportDateTime` used outside export context (e.g., in mapping) | Move to the export's `relativeURI` or query parameter |
| `dateAdd` produces date seconds ahead instead of days | Value in seconds instead of milliseconds | Multiply by 1000: use `86400000` not `86400` |
| `{{#compare "9" ">" "10"}}` is TRUE | String comparison, not numeric | Convert to number first or restructure logic |
| `undefined` or empty in nested `#each` | `this` scope changed; referencing parent field without `../` | Use `../fieldName` or `@root.fieldName` |
| JSON body has trailing comma | `{{#each}}` without comma-guard logic | Add `{{#if @last}}{{else}},{{/if}}` between items |
| Bracket notation field returns empty | Using `record.Field Name` instead of `record.[Field Name]` | Wrap field name in brackets: `record.[Field Name]` |
| `regexMatch` returns a number | Used `regexSearch` (returns position) instead of `regexMatch` | Switch to `regexMatch` for the matched text |
| A string value gets a second pair of quotes (`""abc""`) | `jsonSerialize` on a string adds JSON quotes inside quotes the template also wrote | Inside quotes use `{{{jsonEncode record.x}}}`; keep `jsonSerialize` for objects and arrays, unquoted |
