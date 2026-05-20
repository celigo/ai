# Encoding Helpers

Base64, URL, HTML, and JSON encoding/decoding, plus URL stripping utilities.

### base64Decode
The base64Decode helper converts a base64-encoded string into a specified output format such as UTF-8, hex, or binary. This is commonly used to handle encoded values in API responses, encrypted credentials, or custom fields in records. If no format is specified, it defaults to decoding as UTF-8.

Usage

{{base64Decode base64String "decodeFormat"}}

base64String: The base64-encoded input string you want to decode.

decodeFormat(optional): The output format. Supported values include: "utf8" (default), "ascii", "hex", "base64", "binary", "latin1", "ucs2"/"ucs-2", or "utf16le"/"utf-16le".

Examples

Decode base64-encoded record field to UTF-8

{{base64Decode record.base64EncodedData "utf8"}}

If record.base64EncodedData is "U29tZSBlbmNvZGVkIHZhbHVl", the output will be "Some encoded value".

Decode base64 string to hexadecimal

{{base64Decode "SGVsbG8gV29ybGQh" "hex"}}

This decodes the base64 string "SGVsbG8gV29ybGQh" to its hex representation: "48656c6c6f20576f726c6421" (which is "Hello World!" in UTF-8).

Using triple braces to prevent auto-formatting

{{{base64Decode record.base64EncodedData "utf8"}}}

Use triple braces to get the raw decoded value without Celigo's automatic formatting (e.g., quotes or URI encoding).

Tip

Always choose the correct decodeFormat based on how you intend to use the decoded output—e.g., "utf8" for readable strings or "hex" for raw byte inspection.

If omitted, the format defaults to "utf8", which works for most readable text values.

Use triple braces ({{{ }}}) when you need unformatted, raw string output.

If base64String is malformed or the format is unsupported, the helper may throw an error—validate inputs when possible.

### base64Encode
Use the base64Encode helper to encode a given string or field value into a specified format (e.g., UTF-8, hex, base64). By default, if you don't specify a format, it encodes as UTF-8. Since this helper produces raw encoded output, Celigo recommends using triple braces ({{{ }}}).

Usage

{{{base64Encode base64String "encodeFormat"}}}

base64String: The input string or field (e.g., record.connection.http.unencrypted.apiKey) to be encoded.

encodeFormat (optional): The target encoding format. Supported values include "ascii", "base64", "hex", "ucs2", "utf16le", "utf8", "binary", or "latin1". Defaults to "utf8".

Example

Encoding a single field

{{{base64Encode record.email}}}

If record.email is "jane.doe@example.com", it becomes something like "amFuZS5kb2VAZXhhbXBsZS5jb20=".

Combining username and password

{{{base64Encode (join ":" connection.http.unencrypted.username connection.http.encrypted.secret)}}}

Produces a base64-encoded string like "dXNlcm5hbWU6c2VjcmV0" for "username:secret". Use the `join` helper to combine fields with a separator.

Specifying a different format

{{{base64Encode "Hello" "hex"}}}

Encodes "Hello" as hex-encoded base64 content, yielding "48656c6c6f".

Tip

Always use triple braces ({{{ }}}) to prevent Celigo's automatic quoting or formatting of the encoded string.

If you omit the second parameter, the helper encodes the string in UTF-8 by default.

Make sure your input is a valid string; otherwise, the helper may produce unexpected output or an error.

### decodeURI
Use the decodeURI helper to convert a URI-encoded string into its decoded form. This is especially useful when you need to process data that contains URL-encoded spaces, symbols, or other special characters.

Usage

{{{decodeURI field}}}

field: The field or string containing the URL-encoded text (e.g., record.orders or a literal like "overseas%20order%20flow").

Note

Note: This helper often appears with triple braces ({{{ }}}) to ensure you're getting the raw decoded text without any additional formatting or escaping.

Examples

Decoding a field containing URI-encoded data

{{{decodeURI orders}}}

If orders is "overseas%20order%20flow", the output becomes "overseas order flow".

Decoding a literal URI

{{{decodeURI "overseas%20order%20flow"}}}

Produces the same decoded string: "overseas order flow".

Tip

Use triple braces ({{{ }}}) when decoding URIs to avoid automatic encoding or quoting of the decoded result.

If the input is already decoded or is not a valid URI-encoded string, the helper simply returns the original text.

Combine decodeURI with other helpers (like encodeURI or base64Encode) only if you fully understand how they transform text.

Use the triple-brace {{{decodeURI}}} helper to decode a URI-encoded string. This will convert encoded characters (e.g., %20) back to their standard textual representations (e.g., spaces).

### encodeURI
Use the encodeURI helper to convert special characters in a string into their URI-encoded representations. This ensures that spaces, punctuation, and other symbols are properly encoded for safe transmission in URLs.

Usage

{{{encodeURI field}}}

field: The string or field you want to URI-encode (e.g., record.orders or a literal like "sample data type").

Note

Note: Typically, you see triple braces ({{{ }}}) used with this helper, so you get the raw encoded text without additional formatting.

Examples

Encoding a record field

{{{encodeURI orders}}}

If orders is "overseas order flow", the output is "overseas%20order%20flow".

Encoding a literal string

{{{encodeURI "sample data type"}}}

Produces "sample%20data%20type".

Tip

Pair encodeURI with decodeURI if you need to reverse the encoding later.

Using triple braces ({{{ }}}) returns the encoded string exactly, without Celigo's automatic formatting.

Characters such as , / ? : @ & = + $ # and spaces become percent-encoded, making them safe for use in URLs.

### htmlDecode
Converts encoded entities (such as &lt;, &amp;, and &quot;) into their readable characters. Use it when data sources return encoded text and you need to display or process the plain form. This helper requires triple curly braces {{{...}}}.

Usage

{{{htmlDecode value}}}

value (required): encoded string

Examples

Decode HTML entities

{{{htmlDecode record.aiOutput}}}

Input:

{
"record": {
"aiOutput": "&lt;p&gt;Hello &amp; welcome&lt;/p&gt;"
}
}

Output:

<p>Hello & welcome</p>

Tip

Use this helper when consuming API responses or stored text that contain encoded entities.

Decoding restores special characters like &lt; &amp; &gt; to their normal form <, >, &.

Combine with sanitize if you need to both decode and strip tags, keeping only plain text.

### htmlEncode
Converts special characters in a string (such as <, >, &, ', ") into their encoded entity forms. Use it when you need to safely store or transmit text that may include reserved characters.

Usage

{{{htmlEncode value}}}

value (required): input string to encode

Examples

Encode HTML-sensitive characters

{{htmlEncode record.content}}

Input:

{
"record": {
"content": "<div class='alert'>& Goodbye \"world\"</div>"
}
}

Output:

&lt;div class=&#39;alert&#39;&gt;&amp; Goodbye &quot;world&quot;&lt;/div&gt;

Tip

Use this helper when sending data that should not be interpreted as markup, such as embedding text inside HTML templates or storing raw text in databases.

Only special characters are converted; plain text remains unchanged.

Combine with htmlDecode if you need to safely switch between encoded and decoded forms.

### jsonEncode
Use jsonEncode to produce a string output without surrounding quotes if you pass in a string field. This helper is designed primarily for string fields and will return the same literal value for non-string inputs (e.g., numbers, booleans)—but will convert objects or arrays to "[object Object]" rather than JSON. If you need true JSON serialization of objects or arrays, consider jsonSerialize.

{{jsonEncode field}}

field can be a string, number, boolean, or other type. If it's not a string, the literal value is returned. Objects/arrays become "[object Object]".

Usage

{{jsonEncode field}}

field can be a string, number, boolean, or other type. If it's not a string, the literal value is returned. Objects/arrays become "[object Object]".

Examples

Encoding a string field

{{jsonEncode record.email}}

If record.email is "jane.doe@example.com", the output is jane.doe@example.com (notice no quotes).

Passing a numeric field

{{jsonEncode record.total}}

If record.total is 89.99, the output is 89.99.

Passing an object

{{jsonEncode record}}

If record is { "customerId": "CUST123" }, the output is "[object Object]" rather than valid JSON.

Tip

Use jsonEncode only when you specifically want a string field without extra quotes; be cautious when passing objects or arrays.

If your downstream system requires fully structured JSON for objects, use a helper that preserves JSON structure rather than returning "[object Object]".

Double braces vs. triple braces typically do not affect jsonEncode output—this helper removes quotes around strings by design.

### jsonParse
The jsonParse helper parses a valid JSON string and returns the resulting object or object array. Use it when working with API responses or data fields that store JSON text but need to be accessed as objects.

Usage

{{{jsonParse string}}}

string (required): A valid JSON string

Note

Returns object/[object] verify that your AFE field supports objects and object arrays.

Examples

Parse a JSON string into an object

{{{jsonParse record.string}}}

Input:

{
"record": {
"string": "{\"foo\": \"bar\"}"
}
}

Output:

{ "foo": "bar" }

Extract a primitive from a stringified JSON

/api/v2/users.json?page[size]?shardid={{#with (jsonParse record.payload)}}{{shardid}}{{/with}}

Input:

{ "record": { "payload": "{\"shardid\":\"dddt22\"}" } }

Output:

/api/v2/users.json?page[size]?shardid=dddt22

Extract a child object from stringified JSON into requestBody

{{#with (jsonParse record.payload)}}{{{jsonStringify event}}}{{/with}}

Input:

{
"record": {
"payload": "{\"event\":{\"type\":\"create\",\"source\":\"api\"},\"id\":[123,456,789],\"status\":\"success\"}"
}
}

Output:

{"type":"create","source":"api"}

Iterate a stringified JSON array

{{#each (jsonParse record.roles)}}
{{@index}}: {{this}}
{{/each}}

Input:

{ "record": { "roles": "[\"system\",\"admin\",\"editor\",\"contributor\",\"viewer\",\"vendor\"]" } }

Output:

0: system
1: admin
2: editor
3: contributor
4: viewer
5: vendor

Tip

The input must be valid JSON (keys in double quotes, properly escaped).

Useful for parsing API responses, webhooks, or stored JSON payloads.

Use the #with block helper around jsonParse for property access: {{#with (jsonParse record.payload)}}{{name}}{{/with}}.

Field types matter: Verify datatype of AFE field while using jsonParse

Stringified JSON auto-deserializes, so jsonParse is usually not required.

Textual fields like relative URI and mapper expressions use jsonParse to extract primitives/iterate.

### jsonSerialize (alias: jsonStringify)
Use jsonSerialize to convert any object or array into a JSON-formatted string in Celigo. `jsonStringify` is an alias for the same helper — they behave identically; prefer `jsonSerialize` in new templates. This is especially handy when you need to pass an entire record or a subset of fields as JSON—such as creating a JSON payload for an HTTP request. The syntax is typically {{{jsonSerialize yourObject}}} to ensure raw, unformatted output.

Usage

{{{jsonSerialize objectToSerialize}}}

Examples

Serializing the entire record

{{{jsonSerialize record}}}

This example returns a JSON string of the entire record object, which could then be stored in another system or used as part of a request body.

Serializing nested fields

{{{jsonSerialize record.items}}}

If record.items is an array of order items, this returns something like:

[{"sku":"ITEM001","quantity":2},{"sku":"ITEM002","quantity":1}]

Double vs. Triple Braces

{{jsonSerialize record}}

Using double braces here may introduce additional formatting (for example, quoting) depending on the context. If you want the raw JSON with no additional processing, use triple braces as shown above.

Tip

Always confirm the data you pass to jsonSerialize is an actual object or array. If you pass a string, it will be wrapped in quotes, which might not be what you intend.

Triple braces ({{{ }}}) are recommended if you need raw JSON output for downstream systems or logging.

Test with realistic data to ensure the JSON-serialized string meets your use-case requirements—especially if your downstream system expects a specific JSON structure.

### stripProtocol
Removes the protocol (http://, https://, etc.) from a URL, returning a protocol-relative path.

Usage

{{stripProtocol url}}

url (required): input URL string

Examples

Remove protocol from a CDN URL

{{stripProtocol record.cdn}}

Input:

{
"record": {
"cdn": "http://foo.bar/image.png"
}
}

Output:

//foo.bar/image.png

Tip

Useful for ensuring links work correctly across environments where protocol may vary.

The helper preserves the rest of the URL, including domain, path, and query parameters.

Combine with stripQuerystring if you also want to remove query parameters while keeping the domain and path.

Values that are already protocol-relative (//example.com/...) remain unchanged (no duplicate forwardslashes).

Only the first occurrence of <scheme>:// is removed. For example, https://example.com/redirect?url=http://other.com, only the leading https is removed; the http:// inside the query remains.

Scheme matching is case-insensitive and can handle HTTP(S). FTP, WS, and h2://.

### stripQuerystring
Removes everything after the ? in a URL, returning only the base path. Use it when you need a clean URL without query parameters.

Usage

{{stripQuerystring url}}

url (required): input string containing a URL

Examples

Remove query parameters from a URL

{{stripQuerystring record.fullUrl}}

Input:

{
"record": {
"fullUrl": "https://example.com/product?ref=ads&utm_source=google"
}
}

Output:

https://example.com/product

Remove query and fragment

{{stripQuerystring record.fullUrl}}

Input:

{ "record": { "fullUrl": "https://site.com/page?x=1#section" } }

Output:

https://site.com/page

Tip

The helper only removes the querystring; the main path of the URL remains unchanged.

If a ? is present, everything from ? to end is removed (fragments after the query are dropped). If there's no ? before the fragment, the URL is unchanged.

Works on plain strings and file paths (e.g., "/local/path/file.html?version=1.0" → "/local/path/file.html"). No URL validation or decoding is performed; the helper is simple string truncation at the first ?.
