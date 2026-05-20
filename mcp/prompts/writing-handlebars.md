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
| HTTP relative URI | `http.relativeURI` on exports/imports | `{{{ }}}` (triple) | `record.` |
| HTTP body / postBody | `http.body`, `http.postBody` | `{{{ }}}` (triple) | `record.` |
| RDBMS SQL query | `rdbms.query` | `{{{ }}}` (triple) | `record.` |
| Output filter (expression) | export `filter.rules` | `{{ }}` (double) | `record.` |
| Delta URI parameter | export delta sync URI | `{{{ }}}` (triple) | platform-injected (`lastExportDateTime`, `lastExportDateTimeUTC`) |
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
| `{{ }}` | Context-dependent formatting — RDBMS wraps the value in single quotes (`'value'`); URLs URL-encode the value | Only when auto-formatting is desired (mapping extracts, output filters) |
| `{{{ }}}` | Raw output — no escaping or wrapping | Default everywhere — SQL, JSON bodies, URIs, file paths. Add literal quotes yourself where needed |
| `{{{{ }}}}` | Raw block — contents treated as a literal string | Escaping Handlebars syntax itself in output |

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

Uses moment.js tokens. **Always use triple braces for date output.**

Common tokens: `YYYY` (4-digit year), `MM` (2-digit month), `DD` (2-digit day), `HH` (24-hour hour), `mm` (minute), `ss` (second), `SSS` (millisecond), `Z` (timezone offset), `X` (Unix seconds), `x` (Unix milliseconds).

Timezone: pass as the third argument — `{{{dateFormat "YYYY-MM-DD" record.date "US/Eastern"}}}`.

### Date arithmetic

`dateAdd` works in **milliseconds**:
- 1 hour = 3,600,000
- 1 day = 86,400,000
- 7 days = 604,800,000

## Helper Catalogue (79 helpers)

The Celigo Ora CLI ships the full helper documentation; the categories below are the index. Full helper signatures are available in the CLI repo under `skills/writing-handlebars/references/helpers/`.

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

- Default to `{{{ }}}` (triple) for HTTP bodies, SQL, URIs, file paths.
- Use `{{ }}` (double) only in mapping extracts and display text where context-dependent formatting (RDBMS quote-wrapping, URL encoding) is desired.
- When in doubt, use triple — raw output never breaks SQL or JSON; auto-formatted output can.

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

- [ ] **Prefer triple braces `{{{ }}}`.** Double braces apply context-dependent formatting — in RDBMS they wrap values in single quotes, in URLs they URL-encode. Use triple braces for explicit control and add literal quotes where needed.
- [ ] **`record.` prefix everywhere (AFE 2.0).** All contexts use `record.fieldName`. Never bare `fieldName`, `data.fieldName`, or `data.0.fieldName` (AFE 1.0). Exception: Mapper 1.0 (Salesforce / NetSuite) uses bare field names.
- [ ] **`lastExportDateTime` only in export delta context.** This platform-injected variable is available in the export's HTTP/query context for delta syncs only — not in mappings or import templates.
- [ ] **`dateAdd` values in milliseconds.** 1 day = 86,400,000. Not seconds, not hours.
- [ ] **`#each` shifts context.** Inside `{{#each}}`, `this` is the current item. Use `../` for parent or `@root` for top-level fields.
- [ ] **Missing fields fail silently.** Handlebars outputs an empty string for undefined fields. Guard with `{{#if field}}` when the downstream system rejects empty values.
- [ ] **Bracket notation for special characters.** Field names with spaces, dots, or hyphens need `record.[Field Name]`.
- [ ] **`compare` is string-based.** `{{#compare "9" ">" "10"}}` is TRUE (lexicographic). Convert values to numbers first if you need numeric comparison.
- [ ] **Walked through with sample data.** Showed the user a worked example: input record → rendered output.

## Gotchas

1. **Double braces apply auto-formatting.** `{{ }}` adds context-dependent formatting — in RDBMS it wraps values in single quotes, in URLs it URL-encodes. This corrupts SQL queries and JSON bodies. Prefer `{{{ }}}` and add literal quotes explicitly.
2. **Always use `record.` prefix (AFE 2.0).** `{{{record.fieldName}}}` — not `{{{fieldName}}}` or `{{{data.fieldName}}}`.
3. **`lastExportDateTime` is platform-injected.** Available only in the export's HTTP/query context for delta syncs.
4. **`compare` does string comparison.** `"9" > "10"` is TRUE lexicographically. Convert values first.
5. **Nested `#each` changes context.** Inside `{{#each record.items}}`, `this` is the item, not the record. Use `../` for parent or `@root` for top-level.
6. **`dateAdd` uses milliseconds, not seconds.** 1 day = 86,400,000.
7. **`regexMatch` returns the match string; `regexSearch` returns the position.** Don't confuse them.
8. **Raw blocks `{{{{ }}}}` output literal Handlebars syntax** — they're for escaping `{{ }}` in output, not for "extra raw" rendering.
9. **Missing fields produce empty strings silently.** Use `{{#if field}}` guards when needed.
10. **`jsonEncode` wraps a single value, not a whole body.** Use it on individual field values only.

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `&amp;`, `&lt;`, or unexpected `'quotes'` in SQL/JSON output | Double braces `{{ }}` applying auto-formatting | Switch to triple braces `{{{ }}}` and add literal quotes where needed |
| Empty output, no error | Missing `record.` prefix (or AFE 1.0 `data.field`) | Change to `{{{record.fieldName}}}` |
| Delta export returns all records | `lastExportDateTime` used outside export context | Move to the export's `relativeURI` or query parameter |
| `dateAdd` produces date seconds ahead instead of days | Value in seconds instead of milliseconds | Multiply by 1000: `86400000`, not `86400` |
| `{{#compare "9" ">" "10"}}` is TRUE | String comparison, not numeric | Convert to number first or restructure logic |
| `undefined` or empty in nested `#each` | `this` scope changed; referencing parent field without `../` | Use `../fieldName` or `@root.fieldName` |
| JSON body has trailing comma | `{{#each}}` without comma-guard logic | Add `{{#if @last}}{{else}},{{/if}}` between items |
| Bracket notation field returns empty | Using `record.Field Name` instead of `record.[Field Name]` | Wrap field name in brackets |
| `regexMatch` returns a number | Used `regexSearch` instead | Switch to `regexMatch` for the matched text |
| Entire body wrapped in quotes | Used `jsonEncode` on the whole template | Use `jsonEncode` only on individual field values |
