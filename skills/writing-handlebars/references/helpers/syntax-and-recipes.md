# Syntax, Conventions, and Recipes

Brace rules, escaping, whitespace, comments, nesting patterns, and common integration recipes.

## Syntax and conventions

### Double vs triple braces

`{{ }}` — Celigo auto-formats the output based on the target context. For URL fields (like relativeURI) it URL-encodes special characters; for database inserts it may add quoting; in other contexts it may apply additional transformations. Use double braces when you want Celigo to handle formatting for you.

`{{{ }}}` — Raw output, no auto-formatting. The value passes through exactly as-is. Use triple braces when you need to control the formatting yourself, or when the helper returns structured content that must be preserved verbatim. Helpers that typically require triple braces: jsonSerialize, base64Encode, base64Decode, encodeURI, decodeURI, htmlDecode, htmlEncode, aws4, jsonParse, hash, hmac.

`\{{ }}` — Escaped tag. A backslash before `{{` prints that tag literally instead of evaluating it. Raw blocks (`{{{{ }}}}`) are not supported — they fail at runtime.

### Literal segments and special field names (segment-literal notation)

Field names containing spaces or special characters require square brackets:

{{record.[Shipping Address]}}
{{#each record.articles.[10].[#comments]}}
{{record.array.[0].item}}
{{record.array.[0].[item-class]}}

These characters are invalid in bare identifiers:
! " # % & ' ( ) * + , . / ; < = > @ [ \ ] ^ ` { | } ~

Use bracket notation or JavaScript-style quoted strings to access them.

Index an array the same way, with `.[N]`: `{{record.tags.[0]}}`, `{{record.items.[0].sku}}`. A number mid-path also works (`{{record.items.0.sku}}`), but a trailing one (`{{record.tags.0}}`) fails to parse with `Expecting 'ID', got 'NUMBER'`, and JavaScript brackets (`{{record.items[0]}}`) with `got 'INVALID'`.

### String literals in helper arguments

A quoted argument is a Handlebars literal, not a JavaScript string. The only escapes are `\"` inside double quotes and `\'` inside single quotes; every other backslash is literal, so `"\n"` is a backslash and an `n`. That's why the multiline recipe below works: `jsonEncode` turns a line feed into those same two characters. A double-quoted literal can't end in a backslash when a `"` follows later in the template (`got 'INVALID'`); write it in single quotes (`'\'`). Arguments delimited by JSON-escaped quotes (`{{dateFormat \"YYYY\" record.d}}`) don't parse either.

### Escaping handlebars

Prefix with backslash to print braces literally:

\{{escaped}} → outputs {{escaped}}

Only the tag after the backslash is escaped; the next tag is evaluated as usual:

\{{name}} and {{record.x}} → {{name}} and <value of record.x>

Raw blocks ({{{{raw}}}}...{{{{/raw}}}}) are not supported — no `raw` block helper is registered, so they fail at runtime (`Unable to read "call" from undefined`). Use the backslash escape.

### Whitespace

Leading whitespace inside braces causes errors:

Correct: {{expression}}
WRONG:   {{ expression}} — the space before "expression" causes a compile error

### Comments

{{! single line comment }}
{{!-- multi-line comment --}}

Comments are stripped from output entirely.

### Nesting block helpers

Block helpers can be nested inside each other:

{{#compare record.customer1 "==" "2"}}
  {{#compare record.customer2 "==" "5"}}
    Both match
  {{else}}
    Only first matches
  {{/compare}}
{{else}}
  First does not match
{{/compare}}

### Parent context in #each loops

Inside an #each block, only the iterated element is in scope. Use ../ to access the parent context:

{{#each record.lineItems}}
  Parent order ID: {{../record.orderId}}
  Line item: {{this.sku}}
{{/each}}

Use @root to access the top-level context from any depth:

{{#each record.orders}}
  {{#each this.items}}
    Connection key: {{@root.connection.http.encrypted.apiKey}}
  {{/each}}
{{/each}}

The runtime context structure available via @root (the full shape is in [Runtime Context at Each Stage](../../SKILL.md#runtime-context-at-each-stage)):

{record: recordObj (rows for a grouped record), data: [the records in the request], connection: connObj, import: importObj, export: exportObj, settings: settingsObj, job: jobObj}

## Recipes and patterns

### Convert multiline to single line

Use jsonEncode to preserve newline characters, then replace them:

Data: {"record": {"Shipping Address": "Example Name\n1313 Mockingbird Lane\nSan Mateo CA 94404"}}

Preserve newlines as literal \n:
{{jsonEncode record.[Shipping Address]}}

Replace newlines with comma-space:
{{replace (jsonEncode record.[Shipping Address]) "\n" ", "}}
→ Example Name, 1313 Mockingbird Lane, San Mateo CA 94404

### Remove HTML/RTF markup

Strip HTML tags and &nbsp; entities using regexReplace:

{{{regexReplace record.description "" "(&nbsp;|<([^>]+)>)" "ig"}}}

### Calculate days between dates

dateAdd uses milliseconds unless you name a unit. 21 days = 21*24*60*60*1000 = 1814400000 ms.

Add 21 days to a date:
{{dateAdd record.myDate 1814400000}}
{{dateAdd record.myDate 21 "d"}}

Convert a date to Unix seconds for comparison:
{{dateFormat "X" record.myDate}}

Compare if 21 days from now is past a date:
{{#compare (add 1814400 (dateFormat "X" record.timeStamp)) ">" (dateFormat "X" record.myDate)}}
  21 days from now is after myDate
{{else}}
  21 days from now is before myDate
{{/compare}}

### JavaScript → Handlebars equivalents

For users familiar with JavaScript, here are common equivalents:

JS: str.split("?id=")[1]
HBS: {{split record.Photos "?id=" 1}}

JS: str.replace("/core/media/media.nl?id=", "")
HBS: {{replace record.Photos "/core/media/media.nl?id=" ""}}

JS: str.match("id=.*$")
HBS: {{{regexMatch record.Photos "id=.*$"}}}

JS: str.split("id=")[1]
HBS: {{{split record.Photos "id=" 1}}}

JS: str.split("id=")[1].match(/^\d+/)[0]
HBS: {{regexMatch (split record.Photos "id=" 1) "^\d+"}}

Avoid lookbehind (`(?<=…)`) in these patterns: the expression editor's preview rejects it (`Invalid group`), so the expression can't be tested there. Split on the prefix first, then match.

### Complex JSON template with nested iteration

Building a JSON request body with nested arrays from exported data:

{
  "Order": [
    {{#each data}}
    {
      "ExternalID": "{{0.id}}",
      "ShipAddress1": "{{0.[Shipping Address 1]}}",
      "ShipCity": "{{0.[Shipping City]}}",
      "ShipState": "{{0.[Shipping State/Province]}}",
      "Items": {
        "Item": [
          {{#each this}}
          {
            "Inv": "{{Item}}",
            "Qty": "{{Quantity}}",
            "PricePer": "{{Amount}}"
          }
          {{#if @last}}{{else}},{{/if}}
          {{/each}}
        ]
      }
    }
    {{#if @last}}{{else}},{{/if}}
    {{/each}}
  ]
}

Key patterns demonstrated:
- Each item of `data` is one grouped record (an array of rows), so inside {{#each data}}, {{0.fieldName}} reads the group's first row. At the root, a grouped record is `rows` ({{rows.0.fieldName}})
- {{0.[Field With Spaces]}} for field names with spaces
- Nested {{#each this}} for line items within orders
- {{#if @last}}{{else}},{{/if}} for JSON comma separation without trailing comma

### Build a database query from multiple records

Use triple braces for SQL IN clauses with list variables built by a preSavePage hook:

SELECT LOCATION_ID
  FROM LOCATIONS
  WHERE CONCESSION_NUMBER in ({{{record.listOfConcessionNumbers}}})
    AND RIGHT(LOCATION_ID, 4) in ({{{record.listOfBranchNumbers}}})

Triple braces are critical here — in a SQL query, double braces would wrap the whole prebuilt list in one quoted string literal.

### Static lookup with handlebars

You can use handlebars in the Export Field of mapping screens for static lookups. Use multi-field functions (like JOIN) to combine fields, then apply static lookups on the result.
