---
name: writing-handlebars
description: >-
  Author Handlebars expressions for Celigo resource configurations: pick
  the right brace style for the target context, use the correct AFE 2.0
  record prefix, compose helpers, and avoid the common pitfalls (raw
  strings in a JSON body, date arithmetic in milliseconds, lexicographic
  compare, null values).
---
You are a Celigo integration expert. The user needs help authoring a Handlebars expression for use inside a Celigo resource configuration — a mapping extract, an HTTP body, an RDBMS query, a URI, a filter, or a file path. Use this reference to draft the expression. In Phase 1 you cannot apply changes directly; produce the expression, explain what it does, and tell the user where to paste it.

## Where Handlebars Are Used in Celigo

Handlebars is Celigo's template language for embedding dynamic values into resource configurations. Any string field that the platform evaluates at runtime can contain Handlebars expressions.

| Context | Field examples | Brace style | Data prefix |
|---|---|---|---|
| Mapping extract | `mappings[].extract` on imports | `{{ }}` (double) | `record.` |
| HTTP relative URI | `http.relativeURI` on exports/imports | `{{ }}` (double) — URL-encoded at runtime; triple only for an already-encoded value | `record.` |
| HTTP body (JSON) | `http.body` | `{{ }}` inside quotes for strings (JSON-escaped); `{{{ }}}` for numbers, booleans and serialized JSON | `record.` |
| HTTP import lookup body | `http.lookups[].body` (a `postBody` isn't sent) | as in a JSON body | none: the record's fields are at the top level |
| RDBMS SQL query | `rdbms.query` | `{{ }}` for strings and dates (quoted for you), `{{{ }}}` for numbers and identifiers | `record.` |
| Filter rule operand | one operand inside `filter.expression.rules` -- filters are rule arrays, not templates | `{{ }}` (double), one expression filling the operand | `record.` |
| Delta URI parameter | export delta sync URI | `{{ }}` (double) | platform-injected (`lastExportDateTime`, `currentExportDateTime`) |
| File path / name | FTP/S3 export/import names | `{{{ }}}` (triple) | `record.` |

Other context objects available via `@root`:

| Object | Description |
|---|---|
| `record` | Current record being processed (`rows` when it's a grouped record) |
| `job` | Current job metadata |
| `settings` | Settings by scope key (see below) |
| `connection` | Connection object (used for auth headers) |

**The root follows the record's shape.** An object record is `record`; a grouped record (an array of rows) is `rows` (`{{rows.0.field}}`, `{{#each rows}}`), and `record.*` is undefined on it. `batch_of_records` is the root only when an HTTP import sends several records per request (`http.batchSize` above 1) or an RDBMS import runs `per_page`: iterate `{{#each batch_of_records}}` and read `this.record.<field>` (`this.rows` for a grouped record). One-to-many doesn't batch by itself: each child renders as `record`, and with `pathToMany` set the parent's other fields are under `record._PARENT`. `data` always lists the records in the current request.

On an HTTP import, `http.body` renders against the mapped record (unless `http.sendPostMappedData` is false), so use the mapped (destination) field names there; `relativeURI`, header values and mapping extracts see the record before mapping. An undefined path renders empty in a body and fails the request in a relative URI or header. To see what a template gets, send `{{{jsonSerialize record}}}` (`rows` for a grouped record) to integrator.io's own `/v1/mirror` only, never to a third-party echo service: `{{{jsonSerialize this}}}` sends the whole context, the connection's encrypted credential fields included, to whatever endpoint the step calls. A whole-context capture never prints `record` or `rows` (they're aliases, not keys), so don't infer the root from one.

Reference settings through a scope key: `{{settings.integration.x}}`, `{{settings.flowGrouping.x}}`, `{{settings.flow.x}}`, `{{settings.connection.x}}`, `{{settings.iClient.x}}`, or the step's own `{{settings.export.x}}` / `{{settings.import.x}}`. Steps inside an API or a Tool get only their own scope plus connection and iClient. `{{settings.x}}` and paths built from settings-form labels resolve to nothing: they render empty in a body and fail the request in a relative URI or header.

## Syntax Fundamentals

### Braces

| Syntax | Behaviour | When to use |
|---|---|---|
| `{{ }}` | Context-aware at runtime — URL-encoded in a `relativeURI`; a quoted SQL string literal (embedded quotes doubled) in an RDBMS query; JSON-escaped in a JSON body | Record values in URIs; string and date values in SQL, with no quotes of your own; string values inside quotes in a JSON body; mapping extracts and filter rule operands |
| `{{{ }}}` | Raw output — no encoding or quoting | Serialized JSON, numbers and booleans in a body; headers, file paths, SQL numbers and identifiers, and URI values that are already URL-encoded. A raw string inside a JSON body's quotes breaks the body on the first quote, backslash, newline or tab |
| `\{{ }}` | Escaped tag — a backslash before `{{` prints that tag literally (`\{{name}}` renders `{{name}}`) | Emitting literal Handlebars syntax. Raw blocks (`{{{{raw}}}}`) aren't supported — they fail at runtime |

### Field access (AFE 2.0)

| Pattern | Meaning |
|---|---|
| `record.fieldName` | Standard field reference (AFE 2.0), outside the exceptions below |
| `record.nested.field` | Dot-notation for nested objects |
| `record.[Field With Spaces]` | Bracket notation for special characters in field names |
| `record.items.[0].name` | Array index access |
| `@root.fieldName` | Top-level context — escape nested `#each` scope |
| `../fieldName` | Parent context — one level up from current `#each` |
| `this` | Current iteration element |
| `@index` / `@key` | Current array index / object key in `#each` |
| `@first` / `@last` | First / last element in `#each` iteration |

**Always use the `record.` prefix in AFE 2.0.** Bare field names (`{{{firstName}}}`) and `data.field` are deprecated AFE 1.0 syntax.

**Exceptions:** Mapper 1.0 (Salesforce / NetSuite import mappings) uses bare field names without the `record.` prefix. So do NetSuite saved-search lookup criteria (`netsuite.restlet.criteria[].searchValue` and criteria formulas), where the incoming record is the root: write the field as the record carries it, with no `record.` prefix — `{{customer_ref}}` for a record that has `customer_ref`. `{{record.customer_ref}}` resolves in runs but fails the step preview with `handlebars_template_parse_error`, and a path the record doesn't carry fails every record before any search ("Failed to generate criteria.0.searchValue from template"): fix the template, then retry. So does the request template of an HTTP import's own lookup, in `http.lookups[].body` (a `postBody` there is never sent): the record's fields sit at the top level, so `{{email}}` renders the record's value and `{{record.email}}` renders empty. A lookup export (`isLookup: true`) reads `{{record.email}}` as usual.

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

Uses moment.js tokens. Pick braces by the field the date lands in, as for any value: double in a URI, a SQL query or a quoted JSON string.

Common tokens: `YYYY` (4-digit year), `MM` (2-digit month), `DD` (2-digit day), `HH` (24-hour hour), `mm` (minute), `ss` (second), `SSS` (millisecond), `Z` (timezone offset), `X` (Unix seconds), `x` (Unix milliseconds).

Timezone: pass as the **fourth** argument, after the input format (`""` when the input is ISO 8601) — `{{{dateFormat "YYYY-MM-DD" record.date "" "US/Eastern"}}}`. The signature is `dateFormat outputFormat date inputFormat timezone`.

### Date arithmetic

`dateAdd` works in **milliseconds**:
- 1 hour = 3,600,000
- 1 day = 86,400,000
- 7 days = 604,800,000

## Helper Catalogue (80 helpers)

The categories below are the index. For full helper signatures -- name, parameters, and input->output examples -- read the `celigo://resources/handlebars-helpers` resource (the Handlebars Helper Catalog served by this MCP server).

- **Math** — `abs`, `add`, `subtract`, `multiply`, `divide`, `modulo`, `ceil`, `floor`, `round`, `sum`, `avg`, `random`, `toFixed`, `toExponential`, `toPrecision`
- **String** — `uppercase`, `lowercase`, `capitalize`, `capitalizeAll`, `camelcase`, `pascalcase`, `snakecase`, `dashcase`, `dotcase`, `pathcase`, `sentence`, `trim`, `trimLeft`, `trimRight`, `padLeft`, `padRight`, `replace`, `replacefirst`, `removefirst`, `chop`, `truncateWords`, `sanitize`, `split`, `join`, `reverse`, `occurrences`, `substring`
- **Array** — `after`, `before`, `sort`, `unique`, `pluck`, `arrayify`, `getValue`, `sum`. There is no `first` or `last` helper: index the array (`{{record.items.[0].sku}}`) or use `@first` / `@last` inside `#each`. `reverse` reverses a string; on an array it renders empty. `lookup` isn't an array helper either: it reads a lookup defined on the same import step (`{{lookup.<name>}}`), and `getLookupCacheData` reads a lookup cache by its alias on the integration
- **Date / time** — `dateFormat`, `dateAdd`, `timestamp`
- **Encoding** — `base64Encode`, `base64Decode`, `htmlEncode`, `htmlDecode`, `jsonEncode`, `jsonParse`, `jsonSerialize`, `encodeURI`, `decodeURI`, `stripProtocol`, `stripQuerystring`
- **Regex** — `regexMatch`, `regexReplace`, `regexSearch`
- **Auth / crypto** — `hash`, `hmac`, `aws4`
- **Type / logic** — `typeOf`, `eq`, `isTruthy`, `isFalsey`, `hasOwn`, `hasNoItems`, and the block helper `#compare`. There are no `gt`, `gte`, `lt` or `lte` helpers; compare with `#compare`
- **Format** — `addCommas`, `bytes`, `ordinalize`
- **Block helpers** — `#each`, `#if`, `#compare`, `#contains`, `#filter`, `#and`, `#or`, `#not`, `#neither`, `#ifEven`, `#unless`, `#with`, `#some`, `#startsWith`, `#inArray`, `#isEmpty`

Helper names are exact and case-sensitive (`camelcase`, not `camelCase`). A name that isn't a helper fails the render with 422 `Missing helper: "<name>"` once it has arguments, but with none it's read as a field and renders empty.

## How to Author a Handlebars Expression

### 1. Identify the context

Where the expression runs determines what data is available. Use the context table at the top of this prompt — pick the row that matches the field the user is editing.

### 2. Inspect the data shape first

Before writing any expression, find a sample of the input record:

- For exports: call `get_export` on the export ID, look at `mockOutput` if present, or inspect a recent successful job's record sample via `get_job_errors` / `get_latest_job_for_flow` from a related flow.
- For imports / mappings: read the export feeding the import via `get_flow` → `pageGenerators` → `get_export`, then inspect that export's `mockOutput` or the upstream record.
- For SQL / RDBMS exports: read the connection via `get_connection` to confirm the dialect, then check the column metadata against the SQL the user is writing.

### 3. Choose the right braces

- `{{ }}` (double) for record values in a `relativeURI` (URL-encoded at runtime), for string and date values in SQL (quoted and escaped for you), and for string values inside quotes in a JSON body (JSON-escaped: `"{{record.note}}"`).
- `{{{ }}}` (triple) for numbers, booleans and serialized JSON in a body, headers, file paths, numbers and identifiers in SQL, and URI values that are already URL-encoded.
- Judge a double-brace URI, SQL or JSON-body value by a run, not the preview — the preview HTML-escapes double braces, which the runtime doesn't.

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

`#if` takes its `{{else}}` branch for an empty string, null and a missing field — and also for `0`, `false` and `[]`.

### Nested iteration with parent context

```
{{#each record.orders}}
  Order: {{{this.id}}}  Customer: {{{../record.customerName}}}
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

- [ ] **Braces match the field.** `{{ }}` for values in a `relativeURI` (URL-encoded at runtime), for string and date values in SQL (quoted and escaped — no quotes of your own), and for string values inside quotes in a JSON body (JSON-escaped: `"{{record.note}}"`); `{{{ }}}` for numbers, booleans and serialized JSON in a body, headers, file paths, SQL numbers and identifiers, and already-encoded URI values. A triple-brace string inside a JSON body's quotes fails each record whose value holds a double quote, backslash, line break or tab (422 `invalid_json`).
- [ ] **`record.` prefix everywhere (AFE 2.0).** All contexts use `record.fieldName`. Never bare `fieldName`, `data.fieldName`, or `data.0.fieldName` (AFE 1.0). Exceptions: Mapper 1.0 (Salesforce / NetSuite), NetSuite saved-search criteria and an HTTP import lookup's body (`http.lookups[].body`) use bare field names.
- [ ] **The root matches the record's shape.** A grouped record is `rows`, and a batched request (`http.batchSize` above 1, RDBMS `per_page`) is `batch_of_records`; `record.*` is undefined on both.
- [ ] **No literal `}` against a closing tag.** `{"in": {{{jsonSerialize record}}} }`, not `{"in": {{{jsonSerialize record}}}}`.
- [ ] **`lastExportDateTime` only in export delta context.** This platform-injected variable is available in the export's HTTP/query context for delta syncs only — not in mappings or import templates.
- [ ] **`dateAdd` values in milliseconds.** 1 day = 86,400,000. Not seconds, not hours.
- [ ] **`#each` shifts context.** Inside `{{#each}}`, `this` is the current item. Use `../` for parent or `@root` for top-level fields.
- [ ] **Missing fields: empty in bodies, errors elsewhere.** In an HTTP body or a mapping an undefined field renders an empty string — guard with `{{#if field}}` when the downstream system rejects empty values. In a relative URI, a header, or an SQL query the same undefined path fails the request instead. Guard an optional date or object before passing it to `dateFormat`, `dateAdd` or `jsonSerialize`. A null field, or one under a null object, isn't missing: guard it too, or it arrives as `null` (gotcha 12).
- [ ] **Bracket notation for special characters.** Field names with spaces, dots, or hyphens need `record.[Field Name]`.
- [ ] **`#compare` thresholds are unquoted numbers.** Two strings compare as text (`"1250.00" > "500"` is false); a number on either side makes the comparison numeric, so compare a string amount against `500`, not `"500"`.
- [ ] **Walked through with sample data.** Showed the user a worked example: input record → rendered output.

## Gotchas

1. **Double braces format for the field they're in.** At runtime `{{ }}` URL-encodes in a `relativeURI`, renders a quoted, escaped SQL string literal in an RDBMS query, and JSON-escapes a string inside quotes in a JSON body (`"{{record.note}}"` arrives with its quotes, backslashes, line breaks and tabs intact, and nothing HTML-escaped) — usually what you want. Triple braces skip that: a raw `&` breaks a query string, a hand-quoted `'{{{record.name}}}'` breaks on an apostrophe, and `"{{{record.note}}}"` in a JSON body fails each record whose value holds a double quote, backslash, line break or tab with 422 `invalid_json`, while the other records go through. Use `{{{ }}}` where raw is the point — numbers, booleans and serialized JSON (`{{{jsonSerialize record.items}}}`, unquoted) in a body, headers, SQL numbers and identifiers, and already-encoded values.
2. **Always use `record.` prefix (AFE 2.0).** `{{{record.fieldName}}}` — not `{{{fieldName}}}` or `{{{data.fieldName}}}`. Bare names belong only in the exceptions under Field access (Mapper 1.0, NetSuite search criteria, an HTTP import lookup's body).
3. **`lastExportDateTime` is platform-injected.** Available only in the export's HTTP/query context for delta syncs.
4. **`#compare` follows JavaScript comparison.** Two strings compare as text, character by character: `"9" > "10"` and `"75.00" > "500"` are true. A number on either side makes the comparison numeric, so compare a string field against an unquoted number: `{{#compare record.total_price ">" 500}}`.
5. **Nested `#each` changes context.** Inside `{{#each record.items}}`, `this` is the item, not the record. Use `../` for parent or `@root` for top-level.
6. **`dateAdd` uses milliseconds, not seconds.** 1 day = 86,400,000.
7. **`regexMatch` returns the match string; `regexSearch` returns the position.** Don't confuse them.
8. **Raw blocks `{{{{ }}}}` fail at runtime** — no `raw` block helper is registered. To emit literal braces, put a backslash before the tag: `\{{name}}` renders `{{name}}`.
9. **Missing fields render empty only in bodies and mappings.** There an undefined field (not a null one — gotcha 12) outputs nothing. In a relative URI, a header, or an SQL query an undefined path fails the request. Use `{{#if field}}` guards in bodies when needed. Don't count on the empty render once a helper wraps the field: on a missing input `dateFormat` prints the run's date, and `dateAdd` and `jsonSerialize` fail the record. Guard an optional date or object with `{{#if record.x}}…{{/if}}` before passing it to them. The run's error is `handlebars_template_parse_error`, with the template as its message, so only a processor render (`celigo processors invoke handlebars`) shows the helper's own error.
10. **`jsonEncode` escapes a value; it adds no quotes.** Use it inside quotes you write yourself — `"note": "{{{jsonEncode record.note}}}"` — with triple braces (double braces escape its output a second time; the preview shows `\&quot;`).
11. **A literal `}` can't touch a closing tag.** The parser reads `}}}` and `}}}}` as close tokens, so `{"id": {{record.id}}}` and `{{/if}}}` fail to compile (`got 'CLOSE_UNESCAPED'`), and so does `{"in": {{{jsonSerialize record}}}}` (`got 'CLOSE_RAW_BLOCK'`). The save doesn't catch it: the step saves, and every record fails at run time. Put a space or a newline before the literal brace: `{"in": {{{jsonSerialize record}}} }`. Comment closes are exempt.
12. **A null value renders `null`, not empty.** In a JSON body, double braces write a null field — or any field under an object that is null (`{{record.customer.name}}` with `"customer": null`) — as the text `null`: a run sends `"name": "null"`, while the Handlebars processor renders it empty, so a template can test clean and still send "null". A field that is absent renders empty everywhere, and so do triple braces over the null; `jsonSerialize` prints `null`. In a relative URI a null leaf renders `null` too, and a field under a null object fails the request like an undefined path. Guard a nullable field — `{{#if record.customer.name}}{{record.customer.name}}{{/if}}` — or the whole object with `{{#if record.customer}}…{{/if}}`.

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `&amp;`, `&lt;`, `&quot;` or `&#x27;` in the preview of a body or message | The preview HTML-escapes double braces; a run doesn't -- in a JSON body it JSON-escapes them, so the preview's `It&#x27;s` arrives as `It's` | Nothing to fix: keep `"{{record.x}}"` for strings in a JSON body, and judge by what a run sends -- the `request` stage of a test run, or debug logs. Triple braces there break the body on the first quote or line break |
| Some records fail with 422 `invalid_json` ("An invalid JSON is sent in the request.body …") and nothing is sent for them, while others go through | A triple-brace string inside a JSON body's quotes (`"{{{record.note}}}"`) inserted a value holding a double quote, backslash, line break or tab raw | Write `"{{record.note}}"` (or `"{{{jsonEncode record.note}}}"`), then retry the failed records |
| The destination gets the text `"null"` where the source field is null | Double braces in a JSON body write a null value -- a null field, or a field under a null object -- as `null` | Guard the field: `{{#if record.customer.name}}{{record.customer.name}}{{/if}}` (gotcha 12) |
| `''value''` or a SQL syntax error at a quote | Quotes added around a double-brace value, or a hand-quoted triple-brace value hit an apostrophe | Use `{{record.name}}` with no quotes of your own |
| Empty output, no error | Missing `record.` prefix (or AFE 1.0 `data.field`) | Change to `{{{record.fieldName}}}`, outside the bare-field exceptions |
| An HTTP import lookup sends an empty value | `{{record.<field>}}` in `http.lookups[].body`, where it renders empty, or the template sits in `postBody`, which isn't sent | Name the field without `record.` (`{{email}}`), in `body` |
| `record.<field>` empty in a body, or the request fails from a URI or header | The record is grouped (root `rows`) or the request is batched (root `batch_of_records`) | Read `{{rows.0.field}}` / `{{#each rows}}`, or iterate `batch_of_records` |
| Every record fails at run time with `got 'CLOSE_UNESCAPED'` or `got 'CLOSE_RAW_BLOCK'`, though the step saved | A literal `}` touches a closing tag (`{{record.id}}}`, `{{{jsonSerialize record}}}}`) | Put a space or newline before the literal `}` |
| Delta export returns all records | `lastExportDateTime` used outside export context | Move to the export's `relativeURI` or query parameter |
| `dateAdd` produces date seconds ahead instead of days | Value in seconds instead of milliseconds | Multiply by 1000: `86400000`, not `86400` |
| `{{#compare "9" ">" "10"}}` is TRUE | String comparison, not numeric | Convert to number first or restructure logic |
| `undefined` or empty in nested `#each` | `this` scope changed; referencing parent field without `../` | Use `../fieldName` or `@root.fieldName` |
| JSON body has trailing comma | `{{#each}}` without comma-guard logic | Add `{{#if @last}}{{else}},{{/if}}` between items |
| Bracket notation field returns empty | Using `record.Field Name` instead of `record.[Field Name]` | Wrap field name in brackets |
| `regexMatch` returns a number | Used `regexSearch` instead | Switch to `regexMatch` for the matched text |
| A string value gets a second pair of quotes | `jsonSerialize` on a string adds JSON quotes inside quotes the template also wrote | Inside quotes use `{{{jsonEncode record.x}}}`; keep `jsonSerialize` for objects and arrays, unquoted |
