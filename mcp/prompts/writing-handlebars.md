---
name: writing-handlebars
description: >-
  Author Handlebars expressions for Celigo resource configurations: pick
  the right brace style for the target context, use the correct AFE 2.0
  record prefix, compose helpers, and avoid the common pitfalls (date
  arithmetic in milliseconds, lexicographic compare, masked-credential
  overwrites).
---
You are a Celigo integration expert. The user needs help authoring a Handlebars expression for use inside a Celigo resource configuration — a mapping extract, an HTTP body, an RDBMS query, a URI, a filter, or a file path. Use this reference to draft the expression. In Phase 1 you cannot apply changes directly; produce the expression, explain what it does, and tell the user where to paste it.

## Where Handlebars Are Used in Celigo

Handlebars is Celigo's template language for embedding dynamic values into resource configurations. Any string field that the platform evaluates at runtime can contain Handlebars expressions.

| Context | Field examples | Brace style | Data prefix |
|---|---|---|---|
| Mapping extract | `mappings[].extract` on imports | `{{ }}` (double) | `record.` |
| HTTP relative URI | `http.relativeURI` on exports/imports | `{{ }}` (double) — URL-encoded at runtime; triple only for an already-encoded value | `record.` |
| HTTP body / postBody | `http.body`, `http.postBody` | `{{{ }}}` (triple) | `record.` |
| RDBMS SQL query | `rdbms.query` | `{{ }}` for strings and dates (quoted for you), `{{{ }}}` for numbers and identifiers | `record.` |
| Output filter (expression) | export `filter.rules` | `{{ }}` (double) | `record.` |
| Delta URI parameter | export delta sync URI | `{{ }}` (double) | platform-injected (`lastExportDateTime`, `lastExportDateTimeUTC`) |
| File path / name | FTP/S3 export/import names | `{{{ }}}` (triple) | `record.` |

Other context objects available via `@root`:

| Object | Description |
|---|---|
| `record` | Current record being processed |
| `job` | Current job metadata |
| `settings` | Integration / flow settings |
| `connection` | Connection object (used for auth headers) |

When **one-to-many grouping** is configured the data shape is `batch_of_records`; iterate with `{{#each batch_of_records}}` to access individual records.

## Syntax Fundamentals

### Braces

| Syntax | Behaviour | When to use |
|---|---|---|
| `{{ }}` | Context-aware at runtime — URL-encoded in a `relativeURI`; a quoted SQL string literal (embedded quotes doubled) in an RDBMS query | Record values in URIs; string and date values in SQL, with no quotes of your own; mapping extracts and output filters |
| `{{{ }}}` | Raw output — no encoding or quoting | JSON bodies, headers, file paths, SQL numbers and identifiers, and URI values that are already URL-encoded |
| `\{{ }}` | Escaped tag — a backslash before `{{` prints that tag literally (`\{{name}}` renders `{{name}}`) | Emitting literal Handlebars syntax. Raw blocks (`{{{{raw}}}}`) aren't supported — they fail at runtime |

### Field access (AFE 2.0)

| Pattern | Meaning |
|---|---|
| `record.fieldName` | Standard field reference (all contexts) |
| `record.nested.field` | Dot-notation for nested objects |
| `record.[Field With Spaces]` | Bracket notation for special characters in field names |
| `record.items.[0].name` | Array index access |
| `@root.fieldName` | Top-level context — escape nested `#each` scope |
| `../fieldName` | Parent context — one level up from current `#each` |
| `this` | Current iteration element |
| `@index` / `@key` | Current array index / object key in `#each` |
| `@first` / `@last` | First / last element in `#each` iteration |

**Always use the `record.` prefix in AFE 2.0.** Bare field names (`{{{firstName}}}`) and `data.field` are deprecated AFE 1.0 syntax.

**Exception:** Mapper 1.0 (Salesforce / NetSuite import mappings) uses bare field names without the `record.` prefix. This is the only context where bare references are correct.

### Subexpressions (nesting helpers)

Use `()` to nest one helper's output as input to another. The inner helper evaluates first:

```
{{uppercase (split record.fullName " " 0)}}              -- split then uppercase the first word
{{{base64Encode (join ":" record.user record.pass)}}}    -- join then encode
{{#compare (add record.qty 1) ">" "100"}}...{{/compare}} -- add then compare
{{#each (after record.tags 3)}}...{{/each}}              -- slice then iterate
```

### Block helpers

- `{{#each record.items}}...{{/each}}` — iterate array or object
- `{{#if record.active}}...{{else}}...{{/if}}` — conditional
- `{{#compare val1 "==" val2}}...{{/compare}}` — comparison (`==`, `===`, `!=`, `!==`, `<`, `>`, `<=`, `>=`)
- `{{#with record.address}}...{{/with}}` — change context scope

### Date / time formatting

Uses moment.js tokens. Pick braces by the field the date lands in, as for any value: triple in a JSON body, double in a URI or SQL query.

Common tokens: `YYYY` (4-digit year), `MM` (2-digit month), `DD` (2-digit day), `HH` (24-hour hour), `mm` (minute), `ss` (second), `SSS` (millisecond), `Z` (timezone offset), `X` (Unix seconds), `x` (Unix milliseconds).

Timezone: pass as the **fourth** argument, after the input format (`""` when the input is ISO 8601) — `{{{dateFormat "YYYY-MM-DD" record.date "" "US/Eastern"}}}`. The signature is `dateFormat outputFormat date inputFormat timezone`.

### Date arithmetic

`dateAdd` works in **milliseconds**:
- 1 hour = 3,600,000
- 1 day = 86,400,000
- 7 days = 604,800,000

## Helper Catalogue (79 helpers)

The categories below are the index. For full helper signatures -- name, parameters, and input->output examples -- read the `celigo://resources/handlebars-helpers` resource (the Handlebars Helper Catalog served by this MCP server).

- **Math** — `abs`, `add`, `subtract`, `multiply`, `divide`, `modulo`, `ceil`, `floor`, `round`, `sum`, `avg`, `random`, `toFixed`, `toExponential`, `toPrecision`
- **String** — `uppercase`, `lowercase`, `capitalize`, `capitalizeAll`, `camelcase`, `pascalcase`, `snakecase`, `dashcase`, `dotcase`, `pathcase`, `sentence`, `trim`, `trimLeft`, `trimRight`, `padLeft`, `padRight`, `replace`, `replacefirst`, `removefirst`, `chop`, `truncateWords`, `sanitize`, `split`, `join`, `reverse`, `occurrences`, `substring`
- **Array** — `after`, `before`, `first`, `last`, `reverse`, `sort`, `unique`, `pluck`, `arrayify`, `lookup`, `getValue`, `sum`
- **Date / time** — `dateFormat`, `dateAdd`, `timestamp`
- **Encoding** — `base64Encode`, `base64Decode`, `htmlEncode`, `htmlDecode`, `jsonEncode`, `jsonParse`, `jsonSerialize`, `encodeURI`, `decodeURI`, `stripProtocol`, `stripQuerystring`
- **Regex** — `regexMatch`, `regexReplace`, `regexSearch`
- **Auth / crypto** — `hash`, `hmac`, `aws4`
- **Type / logic** — `typeOf`, `eq`, `isTruthy`, `isFalsey`, `hasOwn`, `hasNoItems`, `compare`
- **Format** — `addCommas`, `bytes`, `ordinalize`
- **Block helpers** — `#each`, `#if`, `#compare`, `#contains`, `#filter`, `#and`, `#or`, `#not`, `#unless`, `#with`, `#some`, `#startsWith`, `#inArray`, `#isEmpty`

## How to Author a Handlebars Expression

### 1. Identify the context

Where the expression runs determines what data is available. Use the context table at the top of this prompt — pick the row that matches the field the user is editing.

### 2. Inspect the data shape first

Before writing any expression, find a sample of the input record:

- For exports: call `get_export` on the export ID, look at `mockOutput` if present, or inspect a recent successful job's record sample via `get_job_errors` / `get_latest_job_for_flow` from a related flow.
- For imports / mappings: read the export feeding the import via `get_flow` → `pageGenerators` → `get_export`, then inspect that export's `mockOutput` or the upstream record.
- For SQL / RDBMS exports: read the connection via `get_connection` to confirm the dialect, then check the column metadata against the SQL the user is writing.

### 3. Choose the right braces

- `{{ }}` (double) for record values in a `relativeURI` (URL-encoded at runtime) and for string and date values in SQL (quoted and escaped for you).
- `{{{ }}}` (triple) for HTTP bodies, headers, file paths, numbers and identifiers in SQL, and URI values that are already URL-encoded.
- Judge a double-brace URI or SQL value by a run, not the preview — the preview HTML-escapes double braces, which the runtime doesn't.

### 4. Select the helper

Pick from the helper catalogue above. Prefer composing existing helpers via subexpressions over writing a `script` hook — Handlebars is cheaper, easier to read, and runs synchronously.

### 5. Validate

Phase 1 cannot run the expression directly. Walk through the expression mentally with a sample record, double-check the brace style for the target context, and produce a worked example showing input → rendered output. Tell the user to paste the expression into the target field and observe the next run, or to use the integrator.io UI's preview pane on the field if available.

## Common Patterns

### JSON comma separation in HTTP body templates

Avoid trailing commas when building JSON arrays:

```
{{#each record.items}}{...}{{#if @last}}{{else}},{{/if}}{{/each}}
```

### Grouped data access (one-to-many / batch_of_records)

When one-to-many grouping is configured the data shape becomes `batch_of_records`. Iterate to access individual records:

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

### SQL `IN` clause from list variable

Build the comma-separated list in a `preSavePage` hook (which can inject fields into the record), then render with triple braces:

```
SELECT id FROM orders WHERE status IN ({{{record.statusList}}})
```

### JavaScript-to-Handlebars equivalents

| JavaScript | Handlebars |
|---|---|
| `str.split("?id=")[1]` | `{{split record.field "?id=" 1}}` |
| `str.replace("old", "new")` | `{{replace record.field "old" "new"}}` |
| `str.match(/pattern/)` | `{{{regexMatch record.field "pattern"}}}` |
| `Math.abs(n)` | `{{abs record.field}}` |
| `arr.length` | `{{record.items.length}}` |

## Pre-Submit Checklist

Before handing the user a final expression, verify each of these:

- [ ] **Braces match the field.** `{{ }}` for values in a `relativeURI` (URL-encoded at runtime) and for string and date values in SQL (quoted and escaped — no quotes of your own); `{{{ }}}` for JSON bodies, headers, file paths, SQL numbers and identifiers, and already-encoded URI values.
- [ ] **`record.` prefix everywhere (AFE 2.0).** All contexts use `record.fieldName`. Never bare `fieldName`, `data.fieldName`, or `data.0.fieldName` (AFE 1.0). Exception: Mapper 1.0 (Salesforce / NetSuite) uses bare field names.
- [ ] **`lastExportDateTime` only in export delta context.** This platform-injected variable is available in the export's HTTP/query context for delta syncs only — not in mappings or import templates.
- [ ] **`dateAdd` values in milliseconds.** 1 day = 86,400,000. Not seconds, not hours.
- [ ] **`#each` shifts context.** Inside `{{#each}}`, `this` is the current item. Use `../` for parent or `@root` for top-level fields.
- [ ] **Missing fields: empty in bodies, errors elsewhere.** In an HTTP body or a mapping an undefined field renders an empty string — guard with `{{#if field}}` when the downstream system rejects empty values. In a relative URI, a header, or an SQL query the same undefined path fails the request instead.
- [ ] **Bracket notation for special characters.** Field names with spaces, dots, or hyphens need `record.[Field Name]`.
- [ ] **`compare` is string-based.** `{{#compare "9" ">" "10"}}` is TRUE (lexicographic). Convert values to numbers first if you need numeric comparison.
- [ ] **Walked through with sample data.** Showed the user a worked example: input record → rendered output.

## Gotchas

1. **Double braces format for the field they're in.** At runtime `{{ }}` URL-encodes in a `relativeURI` and renders a quoted, escaped SQL string literal in an RDBMS query — usually what you want. Triple braces skip that: a raw `&` breaks a query string, and a hand-quoted `'{{{record.name}}}'` breaks on an apostrophe. Use `{{{ }}}` for JSON bodies, headers, SQL numbers and identifiers, and already-encoded values.
2. **Always use `record.` prefix (AFE 2.0).** `{{{record.fieldName}}}` — not `{{{fieldName}}}` or `{{{data.fieldName}}}`.
3. **`lastExportDateTime` is platform-injected.** Available only in the export's HTTP/query context for delta syncs.
4. **`compare` does string comparison.** `"9" > "10"` is TRUE lexicographically. Convert values first.
5. **Nested `#each` changes context.** Inside `{{#each record.items}}`, `this` is the item, not the record. Use `../` for parent or `@root` for top-level.
6. **`dateAdd` uses milliseconds, not seconds.** 1 day = 86,400,000.
7. **`regexMatch` returns the match string; `regexSearch` returns the position.** Don't confuse them.
8. **Raw blocks `{{{{ }}}}` fail at runtime** — no `raw` block helper is registered. To emit literal braces, put a backslash before the tag: `\{{name}}` renders `{{name}}`.
9. **Missing fields render empty only in bodies and mappings.** In a relative URI, a header, or an SQL query an undefined path fails the request. Use `{{#if field}}` guards in bodies when needed.
10. **`jsonEncode` escapes a value; it adds no quotes.** Use it inside quotes you write yourself — `"note": "{{{jsonEncode record.note}}}"` — with triple braces (double braces escape its output a second time; the preview shows `\&quot;`).

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `&amp;`, `&lt;`, or `&quot;` in the preview of a body or message | The preview HTML-escapes double braces | Use triple braces `{{{ }}}` in bodies, and judge by what a run sends -- the `request` stage of a test run, or debug logs |
| `''value''` or a SQL syntax error at a quote | Quotes added around a double-brace value, or a hand-quoted triple-brace value hit an apostrophe | Use `{{record.name}}` with no quotes of your own |
| Empty output, no error | Missing `record.` prefix (or AFE 1.0 `data.field`) | Change to `{{{record.fieldName}}}` |
| Delta export returns all records | `lastExportDateTime` used outside export context | Move to the export's `relativeURI` or query parameter |
| `dateAdd` produces date seconds ahead instead of days | Value in seconds instead of milliseconds | Multiply by 1000: `86400000`, not `86400` |
| `{{#compare "9" ">" "10"}}` is TRUE | String comparison, not numeric | Convert to number first or restructure logic |
| `undefined` or empty in nested `#each` | `this` scope changed; referencing parent field without `../` | Use `../fieldName` or `@root.fieldName` |
| JSON body has trailing comma | `{{#each}}` without comma-guard logic | Add `{{#if @last}}{{else}},{{/if}}` between items |
| Bracket notation field returns empty | Using `record.Field Name` instead of `record.[Field Name]` | Wrap field name in brackets |
| `regexMatch` returns a number | Used `regexSearch` instead | Switch to `regexMatch` for the matched text |
| A string value gets a second pair of quotes | `jsonSerialize` on a string adds JSON quotes inside quotes the template also wrote | Inside quotes use `{{{jsonEncode record.x}}}`; keep `jsonSerialize` for objects and arrays, unquoted |
