# Syntax, Conventions, and Recipes

Brace rules, escaping, whitespace, comments, nesting patterns, and common integration recipes.

## Syntax and conventions

### Double vs triple braces

`{{ }}` — Celigo auto-formats the output based on the target context. For URL fields (like relativeURI) it URL-encodes special characters; for database inserts it may add quoting; in other contexts it may apply additional transformations. Use double braces when you want Celigo to handle formatting for you.

`{{{ }}}` — Raw output, no auto-formatting. The value passes through exactly as-is. Use triple braces when you need to control the formatting yourself, or when the helper returns structured content that must be preserved verbatim. Helpers that typically require triple braces: jsonSerialize, base64Encode, base64Decode, encodeURI, decodeURI, htmlDecode, htmlEncode, aws4, jsonParse, hash, hmac.

`{{{{ }}}}` — Raw block. Child content is treated as a literal string (not parsed).

### Literal segments and special field names (segment-literal notation)

Field names containing spaces or special characters require square brackets:

{{[Shipping Address]}}
{{#each articles.[10].[#comments]}}
{{array.[0].item}}
{{array.[0].[item-class]}}

These characters are invalid in bare identifiers:
! " # % & ' ( ) * + , . / ; < = > @ [ \ ] ^ ` { | } ~

Use bracket notation or JavaScript-style quoted strings to access them.

### Escaping handlebars

Prefix with backslash to print braces literally:

\{{escaped}} → outputs {{escaped}}

Raw blocks also preserve content literally:

{{{{raw}}}}
{{this is not parsed}}
{{{{/raw}}}}

Raw block with a variable name:

{{{{name}}}}
  {{Samantha}}
{{{{/name}}}}
→ outputs {{Samantha}} as literal text

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

{{#compare customer1 "==" "2"}}
  {{#compare customer2 "==" "5"}}
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

The runtime context structure available via @root:

{connection: connObj, import: importObj, export: exportObj, data: dataObj, settings: settingsObj, job: jobObj}

## Recipes and patterns

### Convert multiline to single line

Use jsonEncode to preserve newline characters, then replace them:

Data: {"Shipping Address": "Example Name\n1313 Mockingbird Lane\nSan Mateo CA 94404"}

Preserve newlines as literal \n:
{{jsonEncode [Shipping Address]}}

Replace newlines with comma-space:
{{replace (jsonEncode [Shipping Address]) "\n" ", "}}
→ Example Name, 1313 Mockingbird Lane, San Mateo CA 94404

### Remove HTML/RTF markup

Strip HTML tags and &nbsp; entities using regexReplace:

{{{regexReplace field.name "" "(&nbsp;|<([^>]+)>)" "ig"}}}

### Calculate days between dates

dateAdd uses milliseconds. 21 days = 21*24*60*60*1000 = 1814400000 ms.

Add 21 days to a date:
{{dateAdd myDate 1814400000}}

Convert a date to Unix seconds for comparison:
{{dateFormat "X" myDate}}

Compare if 21 days from now is past a date:
{{#compare (add 1814400 (dateFormat "X" timeStamp)) ">" (dateFormat "X" myDate)}}
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

JS: /(?<=id=).*$/.exec(str)
HBS: {{{regexMatch record.Photos "(?<=id=).*$" 0 "gm"}}}

JS: /(?<=id=)\d*/.exec(str)
HBS: {{regexMatch record.Photos "(?<=id=)\d*" 0 "gm"}}

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
- {{0.fieldName}} to access header fields from grouped data
- {{0.[Field With Spaces]}} for field names with spaces
- Nested {{#each this}} for line items within orders
- {{#if @last}}{{else}},{{/if}} for JSON comma separation without trailing comma

### Build a database query from multiple records

Use triple braces for SQL IN clauses with list variables built by a preSavePage hook:

SELECT LOCATION_ID
  FROM LOCATIONS
  WHERE CONCESSION_NUMBER in ({{{data.listOfConcessionNumbers}}})
    AND RIGHT(LOCATION_ID, 4) in ({{{data.listOfBranchNumbers}}})

Triple braces are critical here — double braces would URL-encode the commas and quotes.

### Static lookup with handlebars

You can use handlebars in the Export Field of mapping screens for static lookups. Use multi-field functions (like JOIN) to combine fields, then apply static lookups on the result.
