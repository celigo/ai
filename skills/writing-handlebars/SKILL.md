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

SQL queries in `rdbms.query` use Handlebars with the mandatory `record.` prefix. Double braces render the value as a single-quoted SQL string literal with embedded quotes escaped -- use them for strings and timestamps, without adding quotes of your own. Triple braces output the raw value, for numbers and identifiers. For full SQL patterns (MERGE, upsert, bulk operations, dialect differences), see [writing-sql](../writing-sql/SKILL.md).

### Output filters

Expression-based filters on exports use Handlebars to evaluate whether a record passes through or gets skipped.

### File paths and names

Dynamic file names in FTP/S3 exports and imports use Handlebars for timestamps and record-derived values.

### Delta tokens

Platform-injected variables like `{{lastExportDateTime}}` provide the last successful export timestamp for incremental syncs. These are not record fields -- the platform injects them at runtime into the export's HTTP/query context only.

## Quick Reference

### Context Decision Matrix (AFE 2.0)

All contexts use `record.` prefix to access the current record's fields (AFE 2.0). Do NOT use bare field names, `data.field`, or `data.0.field` -- those are deprecated AFE 1.0 patterns. **Exception:** Mapper 1.0 (Salesforce / NetSuite DA) uses bare field names without `record.` prefix.

| Where | Syntax | Data prefix | Example |
|---|---|---|---|
| Mapping extract | `{{ }}` (double) | `record.` | `{{record.firstName}}` |
| HTTP relative URI | `{{ }}` (double) -- URL-encoded at runtime; triple only for an already-encoded value | `record.` | `/customers?email={{record.email}}` |
| HTTP body / postBody | `{{{ }}}` (triple) | `record.` | `{{{record.orderId}}}` in JSON body |
| SQL query (RDBMS) | `{{ }}` for strings and dates (quoted for you), `{{{ }}}` for numbers and identifiers | `record.` | `WHERE email = {{record.email}} AND qty > {{{record.qty}}}` |
| Output filter | `{{ }}` (double) | `record.` | `{{record.status}}` |
| Delta URI parameter | `{{ }}` (double) | (platform-injected) | `?updated_since={{lastExportDateTime}}` |

An ID with no special characters renders the same with either brace style, which is why URI examples like `/customers/{{{record.id}}}` work too.

Additional context objects available via `@root`:

| Object | Description |
|--------|-------------|
| `record` | Current record being processed |
| `job` | Current job metadata |
| `settings` | Integration/flow settings |
| `connection` | Connection object (for auth headers) |

When **one-to-many grouping** is configured, the data shape changes to `batch_of_records` -- iterate with `{{#each batch_of_records}}` to access individual records.

### Key Syntax

- **`{{double-braces}}`** -- context-aware output at runtime. In a `relativeURI` the value is URL-encoded, which a path segment or query parameter needs. In an RDBMS query it becomes a single-quoted SQL string literal with embedded quotes doubled (`O'Neil` renders `'O''Neil'`), so never add your own quotes around it.
- **`{{{triple-braces}}}`** -- raw output, no encoding or quoting. Use for JSON bodies, headers, file paths, numbers and identifiers in SQL, and URI values that are already URL-encoded (double braces would encode them a second time). Never hand-quote a triple-brace string in SQL (`'{{{record.name}}}'`) -- the first apostrophe in the data breaks the statement.
- **The preview isn't the runtime.** The expression preview HTML-escapes double braces (`&` shows as `&amp;`); a running request URL-encodes them in a URI and quotes them in SQL instead.
- **Always use `record.` prefix (AFE 2.0)** -- `{{{record.fieldName}}}` in all contexts, never bare `{{{fieldName}}}` or `{{{data.fieldName}}}` (AFE 1.0). Nested fields: `{{{record.properties.email}}}`.
- **Exception: Mapper 1.0 (Salesforce / NetSuite DA)** -- uses bare field names without `record.` prefix. This is the only context where bare field references are correct.

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

What `{{record.X}}` or `{{settings.Y}}` actually resolves to depends on **which bubble** the expression runs in. The shapes below were captured by setting `body: "{{{jsonSerialize this}}}"` on import/lookup bubbles and echoing through a mirror endpoint — they represent exactly what's available at runtime.

### Import bubble (HTTPImport, NetSuiteDistributedImport, etc.)

Body templates and Handlebars in `mappings[].extract` run per-record with this context:

```
{
  "0": { ...the record at batch index 0, with mapped fields... },   // per-record
  "data": [ ...array of all records in this page, post-mapping... ],
  "lookup": { ...merged results from preceding lookup steps... },
  "recordLookupError": null | { ... },                               // set when a lookup failed
  "settings": { "import": {...}, "connection": {...} },
  "connection": { /* FULL connection object: auth, baseURI, etc. */ },
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
  "connection": { /* full connection object */ },

  // the record is spread at TOP LEVEL (not indexed by `0` like imports)
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
| Record location | `0.<field>` + `data[].<field>` | `<field>` (top-level) + `data.<field>` |
| `data` shape | array of records | single record (with `_INITDATA` nested) |
| `exportStartTime` | No | Yes |
| `lookup` | Yes (merged preceding results) | N/A |
| `import` / `job` / `recordLookupError` / `testMode` | Yes | No |
| `connection` (full) | Yes | Yes |

### How to rediscover the shape for any bubble

Set the body on an HTTP import or lookup to `{{{jsonSerialize this}}}` and point it at an echo endpoint (integrator.io's `/v1/mirror` works). Enable flow execution logging, run the flow, and inspect the `apiCall.response.body` — it's a copy of what you sent, which is the full runtime context. This works for any bubble whose adaptor sends an HTTP body.

## How to Write a Handlebars Expression

### 1. Identify the context

Where the expression runs determines what data is available. In AFE 2.0, all contexts use `record.` to access the current record:

| Context | Available data | Prefix |
|---------|---------------|--------|
| Mapping extract | Current record | `record.` |
| HTTP body/URI | Current record | `record.` |
| RDBMS query | Current record | `record.` |
| Output filter | Current record | `record.` |
| Delta URI parameter | Platform variables | `lastExportDateTime`, `lastExportDateTimeUTC` |

Other context objects (`job`, `settings`, `connection`) are accessible via `@root` -- e.g., `{{@root.connection.http.encrypted.apiKey}}`.

When one-to-many grouping is active, the shape is `batch_of_records` and you must iterate: `{{#each batch_of_records}}{{record.field}}{{/each}}`.

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

### Grouped data access (one-to-many / batch_of_records)

When one-to-many grouping is configured, the data shape becomes `batch_of_records`. Iterate to access individual records:

```
{{#each batch_of_records}}
  {{record.orderId}}
  {{record.[Shipping City]}}
{{/each}}
```

### Conditional field with fallback

```
{{#if record.nickname}}{{{record.nickname}}}{{else}}{{{record.firstName}}}{{/if}}
```

### Nested iteration with parent context

```
{{#each record.orders}}
  Order: {{{this.id}}}  Customer: {{{../customerName}}}
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
- [ ] **`record.` prefix everywhere (AFE 2.0).** All contexts use `record.fieldName` -- mappings, HTTP bodies, SQL, filters. Never use bare `fieldName`, `data.fieldName`, or `data.0.fieldName` (AFE 1.0). Exception: Mapper 1.0 (Salesforce / NetSuite DA) uses bare field names.
- [ ] **`lastExportDateTime` only in export context.** This platform-injected variable is available in the export's HTTP/query context for delta syncs only -- not in mappings or import templates.
- [ ] **`dateAdd` values in milliseconds.** 1 day = 86,400,000. Not seconds, not hours.
- [ ] **`#each` context shifts.** Inside `{{#each}}`, `this` is the current item. Use `../` for parent or `@root` for top-level fields.
- [ ] **Missing fields: empty in bodies, errors elsewhere.** In an HTTP body or a mapping an undefined field renders an empty string -- guard with `{{#if field}}` when the downstream system rejects empty values. In a relative URI, a header, or an SQL query the same undefined path fails the request instead.
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
9. **Missing fields render empty only in bodies and mappings.** There, an undefined field outputs nothing and raises no error -- use `{{#if field}}` to guard when the downstream system rejects empty values. In a relative URI, a header, or an SQL query, rendering is strict: an undefined path fails the request (SQL steps fail with `cannot_evaluate_handlebars`).
10. **`jsonEncode` escapes a value; it adds no quotes.** It escapes quotes, backslashes, and newlines so a string can sit inside a JSON string you quote yourself: `"note": "{{{jsonEncode record.note}}}"`. Use triple braces -- double braces escape the result a second time (the preview shows `\&quot;`), which breaks the JSON. Numbers and booleans pass through unchanged; objects render `[object Object]`, so use `jsonSerialize` for objects and arrays.

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `&amp;`, `&lt;`, or `&quot;` in the preview of a body or message | The preview HTML-escapes double braces | Use triple braces `{{{ }}}` in bodies, and judge by what a run sends -- the `request` stage of a test run, or debug logs |
| `&amp;` / `&#x3D;` in the preview of a URI | The preview HTML-escapes double braces; the runtime URL-encodes them | Nothing to fix -- check the URL a run actually sends |
| `''value''` or a SQL syntax error at a quote | Quotes added around a double-brace value (`'{{record.name}}'`), or a hand-quoted triple-brace value hit an apostrophe | Use `{{record.name}}` with no quotes of your own |
| Paging cursor or `next` link corrupted (`%2B` became `%252B`) | Double braces URL-encoding a value that was already encoded | Use triple braces for already-encoded URI values |
| Empty output, no error | Missing `record.` prefix (or using AFE 1.0 `data.field`) | Change to `{{{record.fieldName}}}` -- applies in all contexts |
| Delta export returns all records | `lastExportDateTime` used outside export context (e.g., in mapping) | Move to the export's `relativeURI` or query parameter |
| `dateAdd` produces date seconds ahead instead of days | Value in seconds instead of milliseconds | Multiply by 1000: use `86400000` not `86400` |
| `{{#compare "9" ">" "10"}}` is TRUE | String comparison, not numeric | Convert to number first or restructure logic |
| `undefined` or empty in nested `#each` | `this` scope changed; referencing parent field without `../` | Use `../fieldName` or `@root.fieldName` |
| JSON body has trailing comma | `{{#each}}` without comma-guard logic | Add `{{#if @last}}{{else}},{{/if}}` between items |
| Bracket notation field returns empty | Using `record.Field Name` instead of `record.[Field Name]` | Wrap field name in brackets: `record.[Field Name]` |
| `regexMatch` returns a number | Used `regexSearch` (returns position) instead of `regexMatch` | Switch to `regexMatch` for the matched text |
| A string value gets a second pair of quotes (`""abc""`) | `jsonSerialize` on a string adds JSON quotes inside quotes the template also wrote | Inside quotes use `{{{jsonEncode record.x}}}`; keep `jsonSerialize` for objects and arrays, unquoted |
