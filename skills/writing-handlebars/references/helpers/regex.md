# Regex Helpers

Pattern matching, replacement, and search using Node.js regular expressions.

### regexMatch
Use the regexMatch helper to search a string in your record (or other context field) using a regular expression. It returns the portion of the text that matches the specified pattern, optionally selecting which match occurrence (index) to return, and applying optional regex flags.

Usage

{{regexMatch field regex index options}}

field: The field or variable name containing the text to search (e.g., record.details).

regex: The regular expression pattern to match.

index (optional): Which match to return (0-based). Defaults to 0 if omitted.

options (optional): Regex flags such as "g" (global), "i" (case-insensitive), "m" (multiline).

Examples

Extracting numbers from a record field

If record.comment is "Order ID: 12345 delivered on 2025-04-20" and you want the first 5-digit number:

{{regexMatch record.comment "[0-9]{5}"}}

This returns "12345". By default, this returns the first match (index 0).

Using the index parameter

If record.comment has multiple matches, for example "IDs: 12345 and 67890", retrieve the second match (index 1):

{{regexMatch record.comment "[0-9]{5}" 1}}

This returns "67890".

Applying regex flags

Use the options argument to include flags. To match case-insensitively:

{{regexMatch record.comment "order id" 0 "i"}}

If record.comment is "ORDER ID: 98765", the helper still matches "ORDER ID" because of the `i` flag.

Double vs. triple braces

{{{regexMatch record.comment "[0-9]+"}}}

Triple braces return the raw matched string without Celigo's automatic formatting (e.g., additional quotes).

Tip

If you only need a single match, leave index at its default (0).

Make sure your regular expression correctly captures the substring you want — particularly with capturing groups or special characters.

Use triple braces if you want to avoid any automatic formatting for the matched substring.

### regexReplace
Replace part of a string in your flow data with a new value, using a regular-expression pattern to identify what should change.

Usage

{{regexReplace field replacement regex options}}

field: The text field or variable to modify (e.g., record.order.notes).

replacement: The value that should replace every substring matching regex.

regex: Regular-expression pattern that identifies the text to replace.

options (optional): Regex flags such as "g" (global), "i" (case-insensitive), "m" (multiline).

Examples

Redacting credit-card digits in free-form notes

{{regexReplace record.notes "#### #### #### ####" "[0-9]{4} ?[0-9]{4} ?[0-9]{4} ?[0-9]{4}" "g"}}

If record.notes is "Payment with 4111 1111 1111 1111 approved" → "Payment with #### #### #### #### approved".

Normalizing SKU format (remove spaces and dashes)

{{regexReplace record.item.sku "" "[ -]" "g"}}

"ABC-123 45" → "ABC12345".

Stripping HTML tags and &nbsp; entities

{{{regexReplace field.name "" "(&nbsp;|<([^>]+)>)" "ig"}}}

Converting CRLF line-endings to LF and returning raw output

{{{regexReplace record.description "\n" "\r\n" "g"}}}

Triple braces give the cleaned text exactly as produced, without Celigo's automatic quoting or encoding.

Tip

Patterns are JavaScript-style regular expressions — escape special characters (`\.` for a literal dot, `\\` for a backslash, etc.).

If the field might be empty or missing, combine this helper with a conditional or default to avoid null results.

Use triple braces (`{{{ }}}`) when you must embed the modified text without Celigo's automatic formatting (e.g., inside a JSON body you are building manually).

### regexSearch
Locate the position (0-based index) of the first substring that matches a regular-expression pattern within a string.

Usage

{{regexSearch field regex options}}

field: Text field or variable to search (e.g., record.total).

regex: Regular-expression pattern.

options (optional): Regex flags such as "i" (case-insensitive) or "m" (multiline).

The helper returns the numeric index of the match, or -1 when the pattern is not found.

Examples

Locating a character in a price

{{regexSearch record.total "5"}}

If record.total is "$1499.95", the helper returns 7 (the "5" is the eighth character).

Finding the decimal point

{{regexSearch record.total "\."}}

Returns 5 for "$1499.95" — the "." is at index 5.

Case-insensitive search in notes

{{regexSearch record.comment "celigo" "i"}}

With record.comment = "HELLO Celigo", the helper returns the index of "Celigo" even though the case differs.

Tip

The index is zero-based (0, 1, 2, …).

If no match is found, expect -1 and handle that outcome in subsequent mappings.

Triple braces (`{{{ }}}`) are usually unnecessary here — the helper returns a plain number that is not subject to Celigo's automatic string formatting.

### Common recipes

The platform uses the Node.js regex engine. Three helpers are available:

- regexMatch — match and return data by index
- regexReplace — return modified string with pattern replaced
- regexSearch — return position of match (0-indexed)

Parameters: field, regex, index (regexMatch only), options (flags: `g`=global, `i`=case-insensitive, `m`=multiline).

Strip phone formatting to digits only:

{{regexMatch (regexReplace phone "" "[^\d]" "g") "\d{10}$" "g"}}

Extract value between parentheses:

{{regexMatch exampleField "(?<=\()(.*?)(?=\))" "g"}}

Input: "(BR12345)-WIT-1" → BR12345.

Extract the query-string id from a URL:

HBS: {{{regexMatch record.Photos "id=.*$"}}}

Or grab just the digits after `id=`:

HBS: {{regexMatch record.Photos "(?<=id=)\d*" 0 "gm"}}
