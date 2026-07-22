---
uri: celigo://resources/handlebars-helpers
name: Handlebars Helper Catalog
description: >-
  Complete reference of Celigo's custom Handlebars helpers — 79 inline
  helpers, 16 block helpers, and 7 data variables — grouped by category
  with signatures and input→output examples. Companion to the
  writing-handlebars how-to skill; use it to look up the exact name,
  parameters, and behavior of a specific helper.
mimeType: text/markdown
---
# Celigo Handlebars Helper Catalog

A complete, categorized reference of the custom Handlebars helpers available in Celigo integrator.io: **79 inline helpers**, **16 block helpers**, and **7 data variables**, plus the date/time format tokens and the `hashOptions`/`hmacOptions` request context.

This page is a lookup reference — the exact name, signature, behavior, and a short example for each helper. For *how* and *where* to write Handlebars (contexts, brace rules, patterns, gotchas), see the `writing-handlebars` skill.

## How to read this catalog

- Each entry lists the **signature** (`` `{{helper args}}` ``) followed by a one-line description, then an **example** rendered as `input` → `output`.
- Examples use the current record context, so field references appear as `record.fieldName` (AFE 2.0).
- Signatures that show triple braces `{{{ }}}` should be used with triple braces to avoid auto-escaping of their output.
- Optional parameters are noted inline.

## Braces & syntax essentials

- **`{{ }}` (double)** — context-aware output. Celigo auto-formats: URL fields URL-encode, RDBMS wraps values in single quotes, etc.
- **`{{{ }}}` (triple)** — raw output, no escaping. Prefer for URIs, SQL, JSON bodies, file paths, and any value that is *already* in final/encoded form (double braces would double-encode it).
- **`{{{{ }}}}` (raw block)** — child content is treated as a literal string, not parsed.
- **Field access** — `record.field`, nested `record.a.b`, array index `record.items.[0]`, special characters `record.[Field With Spaces]`.
- **Subexpressions** — nest helpers with `()`, evaluated inside-out: `{{uppercase (split record.name " " 0)}}`.
- **Escaping** — `\{{escaped}}` prints literal braces; `{{{{raw}}}} ... {{{{/raw}}}}` preserves content verbatim.
- **Comments** — `{{! single line }}` or `{{!-- multi-line --}}` (stripped from output).
- **No leading space inside braces** — `{{expression}}` is correct; `{{ expression}}` is a compile error.
- **String literals** are Handlebars literals, not JSON/JS strings — the only escapes are `\"` inside a double-quoted literal and `\'` inside a single-quoted one; every other backslash is literal.

---

## String helpers

### uppercase
`{{uppercase field}}` — convert all letters to uppercase.
`{{uppercase "library"}}` → `LIBRARY`

### lowercase
`{{lowercase field}}` — convert all letters to lowercase.
`{{lowercase "HERE WE GO!"}}` → `here we go!`

### capitalize
`{{capitalize field}}` — capitalize the first letter of the first word only.
`{{capitalize "hello world"}}` → `Hello world`

### capitalizeAll
`{{capitalizeAll field}}` — capitalize the first letter of every word.
`{{capitalizeAll "the quick brown fox"}}` → `The Quick Brown Fox`

### sentence
`{{sentence value}}` — convert to sentence case: capitalize the first letter after `.`, `!`, `?` and lowercase the rest.
`{{sentence "hello world. goodbye world."}}` → `Hello world. Goodbye world.`

### camelcase
`{{camelcase value}}` — convert to camelCase, removing non-alphanumeric separators (digits preserved).
`{{camelcase "hand crafted item"}}` → `handCraftedItem`

### pascalcase
`{{pascalcase value}}` — convert to PascalCase (each word capitalized, first letter uppercase).
`{{pascalcase "new-arrival-products"}}` → `NewArrivalProducts`

### snakecase
`{{snakecase value}}` — convert to snake_case; splits camel/Pascal boundaries and lowercases.
`{{snakecase "getUserProfile"}}` → `get_user_profile`

### dashcase
`{{dashcase value}}` — convert to dash-case (hyphen separators), lowercased.
`{{dashcase "getUserProfile"}}` → `get-user-profile`

### dotcase
`{{dotcase value}}` — convert to dot.case (period separators), lowercased.
`{{dotcase "Customer Profile Data"}}` → `customer.profile.data`

### pathcase
`{{pathcase value}}` — convert to path/case (forward-slash separators), lowercased.
`{{pathcase "getUserProfile"}}` → `get/user/profile`

### trim
`{{trim field}}` — remove leading and trailing whitespace.
`{{trim " Lalo Schifrin "}}` → `Lalo Schifrin`

### trimLeft
`{{trimLeft value}}` — remove leading whitespace only.
`{{trimLeft " ABC "}}` → `ABC ` (trailing space kept)

### trimRight
`{{trimRight value}}` — remove trailing whitespace only.
`{{trimRight " ABC "}}` → ` ABC` (leading space kept)

### chop
`{{chop value}}` — remove leading/trailing whitespace and non-alphanumeric characters (interior preserved).
`{{chop "_ABC_"}}` → `ABC`

### sanitize
`{{sanitize string}}` — strip all markup tags, keeping the inner text.
`{{sanitize "<span>Hello <strong>World</strong></span>"}}` → `Hello World`

### padLeft
`{{padLeft value length "char"}}` — pad the start up to `length`; `char` optional (default space).
`{{padLeft record.customerId 10 "0"}}` → `000CUST123` (from `CUST123`)

### padRight
`{{padRight value length "char"}}` — pad the end up to `length`; `char` optional (default space).
`{{padRight record.code 6 "*"}}` → `XYZ***` (from `XYZ`)

### substring
`{{substring stringField startIndex endIndex}}` — extract characters from `startIndex` (inclusive) to `endIndex` (exclusive).
`{{substring "Celigo" 1 4}}` → `eli`

### split
`{{split field delimiter index}}` — split on `delimiter`; return the element at `index` (0-based, default 0).
`{{split "Hillary-Ann-Swank" "-" 1}}` → `Ann`

### truncateWords
`{{truncateWords string limit suffix}}` — keep the first `limit` words and append `suffix` (default `…`).
`{{truncateWords "foo bar baz" 2}}` → `foo bar…`

### reverse
`{{reverse value}}` — reverse the characters of a string.
`{{reverse "abcde"}}` → `edcba`

### occurrences
`{{occurrences str substring}}` — count case-sensitive, non-overlapping occurrences of `substring`.
`{{occurrences "foo bar foo bar baz" "foo"}}` → `2`

### replace
`{{replace field oldSubstring newSubstring}}` — replace all occurrences (case-sensitive).
`{{replace "these & those" "&" "and"}}` → `these and those`

### replacefirst
`{{replacefirst str a b}}` — replace only the first occurrence of `a` with `b`.
`{{replacefirst "a b a b a b" "a" "z"}}` → `z b a b a b`

### removefirst
`{{removefirst str substring}}` — remove only the first occurrence of `substring`.
`{{removefirst "abcabc" "abc"}}` → `abc`

### join
`{{join delimiterField field1 field2 ...}}` — concatenate any number of values with a delimiter; arrays are flattened.
`{{join "/" "root" "images" "logo.png"}}` → `root/images/logo.png`

---

## Math & number helpers

### abs
`{{abs number}}` — absolute value of a number.
`{{abs "-123"}}` → `123`

### add
`{{add number1 number2 ...}}` — sum any number of numeric arguments.
`{{add "2" "5"}}` → `7`

### subtract
`{{subtract minuend subtrahend}}` — difference of two numbers.
`{{subtract 6 3}}` → `3`

### multiply
`{{multiply value1 value2}}` — product of two numbers.
`{{multiply record.quantity record.unitPrice}}` → `59.97` (from `3` × `19.99`)

### divide
`{{divide number1 number2}}` — quotient (dividend ÷ divisor).
`{{divide "2002" "100"}}` → `20.02`

### modulo
`{{modulo a b}}` — remainder of `a` ÷ `b`.
`{{modulo 7 3}}` → `1`

### round
`{{round field}}` — round to the nearest whole integer.
`{{round "29.77"}}` → `30`

### ceil
`{{ceil field}}` — round up to the nearest integer.
`{{ceil "45.02"}}` → `46`

### floor
`{{floor field}}` — round down to the nearest integer.
`{{floor 22.44}}` → `22`

### avg
`{{avg number1 number2 ...}}` — average of all numeric arguments.
`{{avg "2" "5" "2"}}` → `3`

### sum
`{{sum field1 field2 ...}}` — add multiple numbers, or sum every element of a single array argument.
`{{sum record.items}}` → `31` (from `[2, 5, 7, 8, 9]`)

### random
`{{random "crypto|uuid|number" length}}` — generate a random string; method `crypto` (alphanumeric), `uuid` (short token), or `number` (digits); `length` optional (default 32).
`{{random "number" 9}}` → `738495210`

---

## Number formatting helpers

### toFixed
`{{toFixed field digits}}` — format to a fixed number of decimal places (returns a string).
`{{toFixed 123.456789 4}}` → `123.4568`

### toExponential
`{{toExponential field fractionDigits}}` — convert to exponential (scientific) notation; `fractionDigits` optional.
`{{toExponential "12345" 2}}` → `1.23e4`

### toPrecision
`{{toPrecision field precision}}` — format to a number of significant digits (switches to scientific notation when needed).
`{{toPrecision 123.00 3}}` → `123`  ·  `{{toPrecision 123.00 2}}` → `1.2e+2`

### addCommas
`{{addCommas value}}` — add commas as thousands separators.
`{{addCommas record.totalSales}}` → `45,200,000`

### bytes
`{{bytes input precision}}` — human-readable byte size using SI (base-1000) units; `precision` optional (default 2).
`{{bytes 825399}}` → `825.39 kB`

### ordinalize
`{{ordinalize value}}` — convert a number to its ordinal form (handles 11/12/13).
`{{ordinalize 22}}` → `22nd`

---

## Date & time helpers

For output format tokens, see [Date/time format tokens](#datetime-format-tokens) below. Always use triple braces for date output, and set a timezone explicitly.

### dateFormat
`{{dateFormat oFormat date iFormat timezone}}` — format a date/time; `iFormat` (optional) parses non-standard input, `timezone` (optional, IANA id).
`{{dateFormat "MM-DD-YYYY hh:mm A" record.orderDate}}` → `03-26-2025 12:34 PM` (from `2025-03-26T12:34:56Z`)

### dateAdd
`{{dateAdd dateField offsetField timeZoneField}}` — add/subtract an offset in **milliseconds** (prefix `-` to subtract); returns an ISO 8601 timestamp. `offsetField` and `timeZoneField` optional.
`{{dateAdd record.orderDate "86400000"}}` → `2025-03-27T12:34:56.000Z` (+1 day)

### timestamp
`{{timestamp format timezone}}` — current date/time; `format` defaults to ISO 8601, `timezone` defaults to UTC.
`{{timestamp "YYYY-MM-DD HH:mm:ss"}}` → `2025-04-20 17:38:20`
Note: in imports the timezone defaults to the account owner's profile timezone — set it explicitly, e.g. `{{timestamp "" "UTC"}}`.

---

## Array & collection helpers

### after
`{{after array n}}` — return a copy of the array without the first `n` elements.
`{{after record.letters 2}}` → `["c", "d"]` (from `["a", "b", "c", "d"]`)

### before
`{{before array n}}` — return a copy of the array without the last `n` elements.
`{{before record.letters 2}}` → `["a", "b"]` (from `["a", "b", "c", "d"]`)

### arrayify
`{{arrayify value}}` — cast a value to an array (wrap a scalar; `null`/`undefined` → `[]`; existing arrays unchanged).
`{{arrayify "foo"}}` → `["foo"]`

### pluck
`{{pluck array "property"}}` — extract `property` (dot-notation supported) from each element into a new array.
`{{pluck record.products "sku"}}` → `["A001", "A002", "A003"]`

### sort
`{{sort field number="true" reverse="true"}}` — sort an array; `number="true"` for numeric order, `reverse="true"` for descending (both optional; default is ascending lexicographic).
`{{sort record.items number="true"}}` → `1,2,3,4,5` (from `["2","1","4","5","3"]`)

### unique
`{{unique array}}` — remove duplicate primitives, preserving first-seen order.
`{{unique record.categories}}` → `["A", "B", "C"]` (from `["A", "B", "A", "C", "B"]`)

---

## Logic & comparison helpers

### eq
`{{eq firstVal secondVal}}` — loose equality (`==`, type coercion allowed); returns a boolean.
`{{eq 5 "5"}}` → `true`

### isTruthy
`{{isTruthy value}}` — `true` if the value is truthy by JavaScript rules.
`{{isTruthy "hello"}}` → `true`

### isFalsey
`{{isFalsey value}}` — `true` if the value is falsy (`false`, `0`, `""`, `null`, `undefined`, `NaN`).
`{{isFalsey ""}}` → `true`

### typeOf
`{{typeOf value}}` — native JavaScript type name, lowercase (`string`, `number`, `boolean`, `array`, `object`).
`{{typeOf record.items}}` → `array`  (note: `null` → `object`)

### hasNoItems
`{{hasNoItems value}}` — `true` if an array has no elements or an object has no keys.
`{{hasNoItems record.arr1}}` → `true` (from `[]`)

---

## Regular expression helpers

Patterns are JavaScript-style. Avoid lookbehind/lookahead assertions — they are rejected by the field-editor preview (`Invalid group`) on engines that don't support them; split first, then match instead.

### regexMatch
`{{regexMatch field regex index options}}` — return the matched text; `index` selects which whole-match occurrence (0-based, default 0); `options` are flags (`i`, `g`, `m`). `index` selects an occurrence, **not** a capture group.
`{{regexMatch record.comment "[0-9]{5}"}}` → `12345` (from `"Order ID: 12345 ..."`)

### regexReplace
`{{regexReplace field replacement regex}}` — replace every match of `regex` with `replacement`; accepts an optional trailing flags argument (e.g. `"g"`).
`{{regexReplace record.item.sku "" "[ -]" "g"}}` → `ABC12345` (from `ABC-123 45`)

### regexSearch
`{{regexSearch field regex options}}` — 0-based index of the first match, or `-1` if not found; `options` are flags.
`{{regexSearch record.total "\."}}` → `5` (for `$1499.95`)

---

## Encoding & serialization helpers

### base64Encode
`{{{base64Encode base64String "encodeFormat"}}}` — base64-encode a string (`base64String` is the input to encode); `encodeFormat` optional (default `utf8`; also `ascii`, `hex`, `ucs2`, `utf16le`, `binary`, `latin1`). Use triple braces.
`{{{base64Encode record.email}}}` → `amFuZS5kb2VAZXhhbXBsZS5jb20=`

### base64Decode
`{{base64Decode base64String "decodeFormat"}}` — decode a base64 string; `decodeFormat` optional (default `utf8`; also `ascii`, `hex`, `base64`, `binary`, `latin1`, `ucs2`/`ucs-2`, `utf16le`/`utf-16le`).
`{{base64Decode "U29tZSBlbmNvZGVkIHZhbHVl"}}` → `Some encoded value`

### htmlEncode
`{{{htmlEncode value}}}` — encode HTML-special characters (`<`, `>`, `&`, `'`, `"`) to entities.
`{{{htmlEncode "<p>&</p>"}}}` → `&lt;p&gt;&amp;&lt;/p&gt;`

### htmlDecode
`{{{htmlDecode value}}}` — decode HTML entities back to characters (requires triple braces).
`{{{htmlDecode "&lt;p&gt;Hello &amp; welcome&lt;/p&gt;"}}}` → `<p>Hello & welcome</p>`

### encodeURI
`{{{encodeURI field}}}` — percent-encode a string for safe use in a URL.
`{{{encodeURI "overseas order flow"}}}` → `overseas%20order%20flow`

### decodeURI
`{{{decodeURI field}}}` — decode a percent-encoded string.
`{{{decodeURI "overseas%20order%20flow"}}}` → `overseas order flow`

### stripProtocol
`{{stripProtocol url}}` — remove the leading `scheme://`, returning a protocol-relative URL (only the first scheme is removed).
`{{stripProtocol "http://foo.bar/image.png"}}` → `//foo.bar/image.png`

### stripQuerystring
`{{stripQuerystring url}}` — remove everything from the first `?` onward (query and fragment).
`{{stripQuerystring "https://example.com/product?ref=ads"}}` → `https://example.com/product`

### jsonEncode
`{{jsonEncode field}}` — return a string field without surrounding quotes; non-strings are returned as-is; objects/arrays become `"[object Object]"` (use `jsonSerialize` for real JSON).
`{{jsonEncode record.email}}` → `jane.doe@example.com`

### jsonParse
`{{{jsonParse string}}}` — parse a valid JSON string into an object or array.
`{{{jsonParse "{\"foo\":\"bar\"}"}}}` → `{ "foo": "bar" }`
Often paired with `#with` for property access: `{{#with (jsonParse record.payload)}}{{shardid}}{{/with}}`.

### jsonSerialize
`{{{jsonSerialize objectToSerialize}}}` — serialize an object or array into a JSON string. Use triple braces.
`{{{jsonSerialize record.items}}}` → `[{"sku":"ITEM001","quantity":2},{"sku":"ITEM002","quantity":1}]`

---

## Hashing & authentication helpers

### hash
`{{hash algorithm encoding field}}` — cryptographic hash of `field`; `algorithm` e.g. `md5`, `sha1`, `sha256`; `encoding` `hex` or `base64`. See [hashOptions](#hashoptions--hmacoptions) for request-context signing.
`{{hash "sha256" "hex" "HelloWorld"}}` → SHA-256 hex digest of `HelloWorld`

### hmac
`{{hmac "algorithm" key "encoding" field keyEncoding}}` — keyed HMAC signature; `keyEncoding` optional (`utf8` default, or `base64`). Store the key in `connection.http.encrypted`.
`{{hmac "sha256" connection.http.encrypted.secretKey "hex" record.payload}}` → hex SHA-256 HMAC of `record.payload`

### aws4
`{{{aws4 accessKey secretKey sessionToken region serviceName}}}` — generate an AWS Signature V4 authorization string; pass `null` or `""` for an absent `sessionToken`. Use triple braces.
`{{{aws4 connection.http.encrypted.accessKey connection.http.encrypted.secretKey null "us-west-2" "s3"}}}`

---

## Lookup & object access helpers

### lookup
`{{lookup.myDynamicLookup}}` (dynamic search) or `{{lookup "myStaticLookup" record.field}}` (static value-to-value) — resolve a value from a lookup defined in the same flow step. Dynamic names are unquoted; static names are quoted and take a match value.
`{{lookup "stateAbbreviation" record.shippingAddress.state}}` → `TX` (from `Texas`)

### getValue
`{{getValue fieldPath "defaultValue"}}` — safely read a field by path, returning `defaultValue` if it is missing or null. `defaultValue` optional.
`{{getValue "shipping.trackingNumber" "Not Assigned"}}` → `Not Assigned` (when the field is missing)
Note: can fail inside `#each` where the full context path can't be determined — fetch the value before the loop.

### hasOwn
`{{hasOwn object "key"}}` — `true` if `key` is an own (non-inherited), enumerable property of `object`.
`{{hasOwn record.config "theme"}}` → `true` (when `config` has a `theme` key)

---

## Block helpers

Block helpers wrap content and usually support an `{{else}}` branch.

### #if
`{{#if field}}...{{else}}...{{/if}}` — render the block when `field` is truthy (falsy = `undefined`, `null`, `""`, `0`, `[]`). No spaces inside the expression.
`{{#if record.nickname}}{{record.nickname}}{{else}}{{record.firstName}}{{/if}}`

### #unless
`{{#unless field}}...{{else}}...{{/unless}}` — inverse of `#if`; render the block when `field` is falsy.
`{{#unless contact.phone}}Phone number missing{{else}}{{contact.phone}}{{/unless}}`

### #compare
`{{#compare a operator b}}...{{else}}...{{/compare}}` — compare two values. Operators: `<`, `>`, `<=`, `>=`, `==`, `===`, `!=`, `!==` (`==`/`!=` coerce types; `===`/`!==` are strict). Comparison is string-based unless types match.
`{{#compare details.fromState "===" "NE"}}+{{details.qty}}{{else}}{{details.qty}}{{/compare}}`

### #ifEven
`{{#ifEven field}}...{{else}}...{{/ifEven}}` — render the block when the value is an even number.
`{{#ifEven orders.item1}}{{orders.item1}}{{else}}Odd Value{{/ifEven}}`

### #and
`{{#and a b}}...{{else}}...{{/and}}` — render when both operands are truthy (note: integer `0` is falsy, but the string `"0"` is truthy).
`{{#and firstName lastName}}{{firstName}} {{lastName}}{{else}}Not found{{/and}}`

### #or
`{{#or a b}}...{{else}}...{{/or}}` — render when at least one operand is truthy.
`{{#or item1 item2}}One or both have a value{{else}}Neither has a value{{/or}}`

### #not
`{{#not value}}...{{else}}...{{/not}}` — render when `value` is falsy (note: an empty array `[]` is truthy).
`{{#not record.count}}No items available{{else}}Items exist{{/not}}`

### #neither
`{{#neither a b}}...{{else}}...{{/neither}}` — render when both operands are falsy.
`{{#neither item1 item2}}Values are absent{{else}}At least one has a value{{/neither}}`

### #contains
`{{#contains collection value}}...{{else}}...{{/contains}}` — render when `value` is present in an array, or is a substring of a string.
`{{#contains order.item "5"}}Sales ID Found!{{else}}Sales ID Missing!{{/contains}}` (for `"12345"` → Found)

### #inArray
`{{#inArray array value}}...{{else}}...{{/inArray}}` — render when `value` is in a simple (non-object) array; case-sensitive; strings are not coerced to numbers.
`{{#inArray record.order.tags "priority"}}High-priority{{else}}Regular{{/inArray}}`

### #filter
`{{#filter array value arrayProperty}}...{{else}}...{{/filter}}` — render once per element whose value (or `arrayProperty`, dot-paths allowed) equals `value`; inside the block, access the matched element's fields directly.
`{{#filter record.order.lineItems "custom" "tag"}}{{sku}}{{else}}No custom items{{/filter}}`

### #some
`{{#some array conditionFn}}...{{else}}...{{/some}}` — render when any element satisfies `conditionFn`: one of `isFalsy`, `isTruthy`, `isArray`, `isString`, `isObject`, `isNumber`, `isBoolean`.
`{{#some record.values isNumber}}Contains a number{{else}}No numbers{{/some}}`

### #startsWith
`{{#startsWith prefix testString}}...{{else}}...{{/startsWith}}` — render when `testString` begins with `prefix` (case-sensitive).
`{{#startsWith "Hello" record.greeting}}Match!{{else}}No match{{/startsWith}}`

### #isEmpty
`{{#isEmpty collection}}...{{else}}...{{/isEmpty}}` — render when `collection` is an empty array/object, missing, or null.
`{{#isEmpty record.arr}}Array is empty{{else}}Has items{{/isEmpty}}`

### #each
`{{#each list}}...{{/each}}` — iterate an array or object. Inside the block, `this` is the current item; `@index`/`@key`, `@first`/`@last` are available; block params via `as |item|`.
`{{#each people}}{{this}}; {{/each}}` → `Bertram Gilfoyle; Erlich Bachman; Jin Yang;`

### #with
`{{#with object}}...{{/with}}` — set the block's context to `object` for shorter field references.
`{{#with author}}{{firstName}} {{lastName}}{{/with}}` → `Charles Dickens`

---

## Data variables

Special variables available inside block helpers (chiefly `#each`).

### `@index`
Current 0-based index during `#each` iteration.
`{{#each people}}{{@index}} {{/each}}` → `0 1 2`

### `@key`
Current key name (objects) or index (arrays) during `#each`.
`{{#each @root.child}}{{@key}} {{/each}}` → `childTitle childBody`

### `@first`
`true` on the first iteration of `#each`.
`{{#each array}}{{#if @first}}{{@key}}{{/if}}{{/each}}` → `0`

### `@last`
`true` on the last iteration of `#each` (use `@../last` for a parent loop).
`{{#each array}}{{#if @last}}{{@key}}{{/if}}{{/each}}` → `3`

### `this`
The current context — the element being iterated, or the whole object/array depending on scope.
`{{#each people}}{{this}}; {{/each}}`

### `@root`
The top-level context, reachable from any nesting depth.
`{{#each array}}{{@root.title}} {{/each}}` → repeats the root `title` per element

### `.length`
Length of a string or array, used via property access.
`{{#compare phone.length "===" 10}}{{phone}}{{else}}0000000000{{/compare}}`

---

## Date/time format tokens

Celigo uses moment.js. The `dateFormat` helper accepts these tokens (reference timestamp `2020-07-09T19:59:39.156Z`):

| Unit | Tokens (example output) |
|---|---|
| Month | `M` 7 · `Mo` 7th · `MM` 07 · `MMM` Jul · `MMMM` July |
| Quarter | `Q` 3 · `Qo` 3rd |
| Day of month | `D` 9 · `Do` 9th · `DD` 09 |
| Day of year | `DDD` 191 · `DDDo` 191st · `DDDD` 191 |
| Day of week | `d` 4 (0=Sun) · `ddd` Thu · `dddd` Thursday · `E` 4 (ISO, 1=Mon) |
| Week of year | `w`/`W` 28 · `wo`/`Wo` 28th · `ww`/`WW` 28 |
| Year | `YY` 20 · `YYYY` 2020 · `gggg`/`GGGG` 2020 (week/ISO week year) |
| AM/PM | `A` PM · `a` pm |
| Hour | `H` 19 · `HH` 19 · `h` 7 · `hh` 07 |
| Minute | `m` 59 · `mm` 59 |
| Second | `s` 39 · `ss` 39 |
| Fractional second | `S` 1 · `SS` 16 · `SSS` 161 |
| Timezone | `Z` +00:00 · `ZZ` +0000 |
| Unix | `X` 1594324779 (seconds) · `x` 1594324779162 (ms) |
| Localized | `L` 07/09/2020 · `LL` July 9, 2020 · `LLLL` Thursday, July 9, 2020 7:59 PM |

- **Literal text** in a format string is escaped with square brackets: `{{{dateFormat "YYYY-MM-DD [at] HH:mm" timeStamp}}}` → `2020-07-09 at 19:59`.
- **Common timezones**: `US/Eastern`, `US/Central`, `US/Mountain`, `US/Pacific`, `UTC`, `Europe/London`, `Asia/Tokyo`, `Australia/Sydney`.

---

## hashOptions & hmacOptions

When using `hash` or `hmac` to build authentication headers or URI parameters, the platform exposes a request-context object.

**`hashOptions`** / **`hmacOptions`** fields:

- `.headers` — request header parameters
- `.body` — HTTP request body (string)
- `.bodyParametersMap` — body parameters as a map
- `.method` — HTTP method (GET, POST, PUT, …)
- `.http.encrypted` — the connection's `http.encrypted` field (store keys here)
- `.baseURI` — base URI (e.g. `www.celigo-test.com`)
- `.relativeURI` — relative URI (e.g. `/this/is/a/test`)
- `.urlParameters` — query string (e.g. `username=Integrator&domain=IO`)
- `.urlParametersMap` — URL parameters as a map
- `.URI` — full URI
- `.orderedQueryParams` — (`hmacOptions` only) query params in alphabetical order, excluding `sign` and `access_token`

Examples:

```
SHA-256 digest of the full URI, base64:
{{{hash "sha256" hashOptions.http.encrypted.hashKey "base64" hashOptions.URI}}}

HMAC-SHA256 of the request body, hex:
{{{hmac "sha256" hmacOptions.http.encrypted.hmacKey "hex" hmacOptions.body}}}
```
