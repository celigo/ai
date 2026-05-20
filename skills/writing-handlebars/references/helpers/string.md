# String Helpers

Case conversion, padding, trimming, replacement, splitting, and text manipulation.

### camelcase
Converts alphanumeric strings (uppercase and lowercase) to camelcase, and removes non-alphanumeric characters - including spaces, dashes, forwardslashes, and underscores. This is useful for creating variable-style keys or formatting labels consistently in integrations. Digits are preserved.

Usage

{{camelcase value}}

value (required): input string

Examples

Convert a product type to camelcase

{{camelcase record.product.type}}

Input:

{
"record": {
"product": {
"type": "hand crafted item"
}
}
}

Output:

handCraftedItem

Convert from dash-separated string

{{camelcase record.category}}

Input:

{
"record": {
"category": "new-arrival-products"
}
}

Output:

newArrivalProducts

Preserve numbers and remove special characters from in a string

{{camelcase "version-2_1-final"}} → version21Final

Tip

Numbers remain unchanged but are preserved in the output (e.g., "order_123_id" → order123Id).

All caps strings are switched to camelcase ("HELLO&WORLD" → "helloWorld")

Use this helper to standardize keys for APIs or when generating identifiers programmatically.

Unlike sentence, this helper does not add spaces or adjust casing beyond camelCase rules.

Non-alphanumeric characters (except digits) are treated as separators and removed

Leading and trailing whitespace is trimmed before conversion

Non-string datatype inputs (like numbers or boolean) are converted to strings before processing. Arrays of primitive types (like strings or numbers) are converted into a comma-separated string before processing. If inputs are objects or object arrays, the output will be unusable.

### capitalize
Use {{capitalize}} to capitalize the first letter of the very first word in a string. You can pass a hard-coded string or a field from the record.

Usage

{{capitalize field}}

field: A string or field containing text (e.g., "lorem ipsum" or record.description).

Examples

Capitalizing a record field

{{capitalize record.day}}

If record.day is "today is the day!", the output becomes "Today is the day!".

Hard-coded string

{{capitalize "hello world"}}

Results in "Hello world".

Partial sentence fields

{{capitalize record.type}}

If record.type is "dog", the output is "Dog".

Tip

This helper only affects the first word; subsequent words remain unchanged.

If your text starts with a space or punctuation, the first letter recognized might not be what you expect—confirm that the string starts with a letter.

For full title capitalization (each word in a string), consider using {{capitalizeAll}} instead.

### capitalizeAll
Use {{capitalizeAll}} to capitalize the first letter of every word in a string. You can pass a hard-coded string or a field from the record.

Usage

{{capitalizeAll field}}

field: The string or field containing text (e.g., "john doe" or record.addressLine1).

Examples

Capitalizing a record field

{{capitalizeAll record.lastName}}

If record.lastName is "doe smith", it outputs "Doe Smith".

Capitalizing a literal text

{{capitalizeAll "the quick brown fox"}}

Results in "The Quick Brown Fox".

Formatting product titles

{{capitalizeAll record.productTitle}}

If record.productTitle is "new release item", you get "New Release Item".

Tip

Punctuation or special characters can split words differently; verify the output if your text includes unusual symbols.

This helper is case-insensitive; it only guarantees the first letter of each word is uppercase. All other letters remain unchanged.

### chop
Removes leading and trailing whitespace and special characters from a string. It is useful when cleaning up input values before using them in a flow.

Usage

{{chop value}}

value (required): the input string

Examples

Remove surrounding characters from labels

{{chop record.label1}}
{{chop record.label2}}
{{chop record.label3}}

Input:

{
"record": {
"label1": "_ABC_",
"label2": "-ABC-",
"label3": " ABC "
}
}

Output:

ABC
ABC
ABC

Preserve interior punctuation, strip only edges, and bypass auto-formatting with {{{...}}}

{{{chop record.label}}}

Input

{ "record": { "label": " Hello*&^World- " } }

Output

Hello*&^World

Tip

The helper removes spaces, underscores, dashes, and other non-alphanumeric characters at the start or end of the string.

It does not remove characters inside the string body. For example, "A_B_C" remains unchanged.

By default, double braces let Celigo auto-format the result based on output context. If you need the raw value with no auto-formatting, use {{{…}}}.

Non-string inputs (datatypes such as number or boolean) are converted to strings before processing. Arrays of primitive types (like strings or numbers) are converted into a comma-separated string before processing. If inputs are objects or object arrays, the output will be unusable.

### dashcase
Converts a string into dashcase by replacing spaces, underscores, and other non-word characters with hyphens (-). Use it when you need consistent, URL-friendly or identifier-friendly formatting.

Usage

{{dashcase value}}

value (required): input string

Examples

Convert a product name to dashcase

{{dashcase record.product.name}}

Input:

{
"record": {
"product": {
"name": "a-b-c d_e"
}
}
}

Output:

a-b-c-d-e

Convert a descriptive field

{{dashcase record.category}}

Input:

{
"record": {
"category": "New Product Launch 2025"
}
}

Output:

new-product-launch-2025

Split case-boundary

{{dashcase record.camel}}

Input

{ "record": { "camel": "getUserProfile" } }

Output

get-user-profile

Tip

All separators are normalized into a single -.

Useful for generating slugs, file names, or identifiers in APIs and URLs.

Multiple non-word characters in a row are collapsed into a single dash.

Inserts hyphens at camel/Pascal case boundaries and lowercases the final string.

Collapses multiple separators to a single hyphen and trims leading/trailing hyphens (result may be empty for inputs made only of separators).

Digits are preserved and participate in tokenization (e.g., "version-2_1-final" → version-2-1-final or per your tests, version-2-final when there's spacing).

Non-string inputs (datatypes such as number or boolean) are converted to strings before processing. Arrays of primitive types (like strings or numbers) are converted into a comma-separated string before processing. If inputs are objects or object arrays, the output will be unusable.

### dotcase
Converts a string into dotcase format by replacing spaces, dashes, underscores, and other non-word characters with periods (.). Use it when you need key-like values separated by dots.

Usage

{{dotcase value}}

value (required): input string to convert

Examples

Convert a category label to dotcase

{{dotcase record.category.label}}

Input:

{
"record": {
"category": {
"label": "a-b-c d_e"
}
}
}

Output:

a.b.c.d.e

Convert descriptive text

{{dotcase record.section}}

Input:

{
"record": {
"section": "Customer Profile Data"
}
}

Output:

customer.profile.data

Tip

All separators normalize into a single ..

Non-string datatype inputs (like numbers or boolean) are converted to strings before processing. Arrays of primitive types (like strings or numbers) are converted into a comma-separated string before processing. If inputs are objects or object arrays, the output will be unusable.

The helper splits camelCase/PascalCase before joining with dots (e.g., getUserProfile → get.user.profile).

Useful for configuration keys, settings names, or when working with nested key formats.

Consecutive non-word characters collapse into one period.

### join
Use {{join}} to concatenate multiple fields or literal strings with a chosen delimiter between each item. You can supply any number of items to join.

Usage

{{join delimiterField field1 field2 ...}}

delimiterField: The delimiter to place between each value (e.g., "-", "/", ",").

field1, field2, ...: One or more values or references to join.

Examples

Joining literal strings

{{join "-" "unicorn" "ponies"}}

Produces "unicorn-ponies".

Combining record fields with a comma

{{join "," record.band1 record.band2 record.band3}}

If record.band1 is "Iron Maiden", record.band2 is "DIO", and record.band3 is "(old)Metallica", the result is "Iron Maiden,DIO,(old)Metallica".

Using a different delimiter

{{join "/" record.folder record.subfolder record.filename}}

For record.folder = "root", record.subfolder = "images", and record.filename = "logo.png", you get "root/images/logo.png".

Tip

You can pass in as many items as needed after specifying the delimiter.

If any of the items are arrays, each element will be joined using the specified delimiter.

Make sure your fields resolve to strings or can be converted to strings; otherwise, you may see unexpected results.

### lowercase
Use {{lowercase}} to convert all letters in the specified string or field to lowercase. This is handy for standardizing case across integrations or preparing data for case-sensitive downstream systems.

Usage

{{lowercase field}}

field: A string or string-like field (e.g., "EXAMPLE", record.comment).

Examples

Hard-coded string

{{lowercase "HERE WE GO!"}}

Outputs:

here we go!

Record field

{{lowercase record.firstName}}

If record.firstName is "Jane", this returns "jane".

Email normalization

{{lowercase record.email}}

Ensures the entire email address is in lowercase.

Tip

Non-alphabetic characters remain unaffected.

Always confirm the field resolves to a valid string; otherwise, unexpected results may occur.

For an uppercase equivalent, see {{uppercase}}.

### occurrences
The occurrences helper returns the number of times a given substring appears within an input string. It's useful for counting keyword matches, delimiters, or repeated text patterns.

Usage

{{occurrences str substring}}

str (required): The input string to search

substring (required): The substring to count occurrences of

Examples

Count how many times a word appears

{{occurrences record.text "foo"}}

Input:

{
"record": {
"text": "foo bar foo bar baz"
}
}

Output:

2

Count delimiter occurrences

{{occurrences record.path "/"}}

Input:

{
"record": {
"path": "/api/v1/resource/item"
}
}

Output:

4

Count character appearances

{{occurrences record.name "a"}}

Input:

{
"record": {
"name": "Banana"
}
}

Output:

3

Tip

Matching is case-sensitive by default ("Foo" ≠ "foo").

Overlapping matches aren't counted separately.

Use it to validate input patterns or measure frequency of specific tokens in text fields.

### padLeft
Adds characters to the beginning of a string or number until it reaches the specified length. By default, it pads with spaces, but you can define any character or string.

Usage

{{padLeft value length "char"}}

value (required): string or number to pad

length (required): total length of the final string

char (optional): the character(s) to pad with. Defaults to a space

Examples

Pad customer ID with zeros

{{padLeft record.customerId 10 "0"}}

Input:

{ "record": { "customerId": "CUST123" } }

Output:

000CUST123

Pad numeric order ID with spaces (default behavior)

{{padLeft record.orderId 12}}

Input:

{ "record": { "orderId": "456" } }

Output (spaces on the left):

456

Tip

If the input value is already equal to or longer than the target length, the value is returned unchanged.

You can use multiple characters as padding (e.g., "AB"). The pattern is repeated and truncated, so the final output length equals the target.

If you are padding special characters such as &amp;, &gt;, or &lt;, use {{{...}}} to bypass auto-formatting.

If length is missing, non-numeric, negative, or zero, the value is returned unchanged.

If length is a fractional value such as 5.7, or 5.9, or 5.1, the floor value of the length (this case 5) is taken and applied to the input.

Max length supported is 999999. Be cautious when using a very large value for length as it can lead to performance issues

Non-string inputs (datatypes such as number or boolean) are converted to strings before processing. Arrays of primitive types (like strings or numbers) are converted into a comma-separated string before processing. If inputs are objects or object arrays, the output will be unusable.

### padRight
Adds characters to the end of a string or number until it reaches the specified length. By default, it pads with spaces, but you can define any character or string.

Usage

{{padRight value length "char"}}

value (required): The string or number to pad

length (required): The total length of the final string

char (optional): The character(s) to pad with (defaults to a space).

Examples

Pad a code with asterisks

{{padRight record.code 6 "*"}}

Input:

{ "record": { "code": "XYZ" } }

Output:

XYZ***

Pad an order ID with spaces (default behavior)

{{padRight record.orderId 8}}

Input:

{ "record": { "orderId": "123" } }

Output (spaces on the right):

123

Tip

If the input value is already equal to or longer than the target length, the value is returned unchanged.

You can use multiple characters as padding (e.g., "AB"). The pattern is repeated and truncated so the final output length equals the target.

By default, double braces let Celigo auto-format the result based on output context. If you need the raw value with no auto-formatting, use {{{…}}}.

If length is missing, non-numeric, negative, or zero, the value is returned unchanged.

If length is a fractional value such as 5.7, or 5.9, or 5.1, the floor value of the length (this case 5) is taken and applied to the input.

Non-string datatype inputs (like number or boolean) are converted to strings before processing. Arrays of primitive types (like strings or numbers) are converted into a comma-separated string before processing. If inputs are objects or object arrays, the output will be unusable.

### pascalcase
Converts a string into Pascalcase format, where each word starts with an uppercase letter and no separators remain. Use it when you need class-like or identifier-style naming.

Usage

{{pascalcase value}}

value (required): The input string

Examples

Convert a product type to pascalcase

{{pascalcase record.product.type}}

Input:

{
"record": {
"product": {
"type": "hand crafted item"
}
}
}

Output:

HandCraftedItem

Convert from dash-separated string

{{pascalcase record.category}}

Input:

{
"record": {
"category": "new-arrival-products"
}
}

Output:

NewArrivalProducts

Preserve numbers

{{pascalcase record.code}}

Input

{ "record": { "code": "order_123_id" } }

Output

Order123Id

Tip

Numbers remain unchanged but are preserved in the output (e.g., "order_123_id" → Order123Id).

Non-string datatype inputs (like numbers or boolean) are converted to strings before processing. Arrays of primitive types (like strings or numbers) are converted into a comma-separated string before processing. If inputs are objects or object arrays, the output will be unusable.

Supported separators: space, dash, underscore, and mixed combinations.

Useful for naming conventions in code generation, integration keys, or system identifiers.

Unlike camelcase, the first letter is always uppercase.

### pathcase
Converts a string into pathcase by replacing spaces, dashes, underscores, and other non-word characters with forward slashes (/). Use it when you need to format identifiers or labels as path-like values.

Usage

{{pathcase value}}

value (required): input string to convert

Examples

Convert a mixed string into pathcase

{{pathcase record.input}}

Input:

{
"record": {
"input": "a-b-c d_e"
}
}

Output:

a/b/c/d/e

Split camel/pathcase

{{pathcase record.name}}

Input

{ "record": { "name": "getUserProfile" } }

Output

get/user/profile

Tip

All separators (spaces, dashes, underscores, symbols) are normalized to /.

Lowercasses all segments with digits preserved (e.g. v2, v1)

Useful for generating folder-like paths, URL fragments, or grouping keys.

Consecutive non-word characters are collapsed into a single slash.

Non-string datatype inputs (like numbers or boolean) are converted to strings before processing. Arrays of primitive types (like strings or numbers) are converted into a comma-separated string before processing. If inputs are objects or object arrays, the output will be unusable.

### removefirst
Removes only the first occurrence of a specified substring from the input string. Use it when you need to eliminate the first match while preserving any additional instances.

Usage

{{removefirst str substring}}

str: input string

substring: substring to remove

Examples

Remove the first occurrence of a character

{{removefirst record.text "a"}}

Input:

{ "record": { "text": "a b a b a b" } }

Output:

b a b a b

Remove the first word in a sentence

{{removefirst record.note "Order"}}

Input:

{ "record": { "note": "Order Order Order" } }

Output:

Order Order

Tip

Only the first match is removed; all later occurrences remain unchanged.

Removal is case-sensitive—"A" and "a" are treated differently.

Use this helper when cleaning up values with a predictable first marker or prefix.

### replace
Use the replace helper to substitute all occurrences of a specified substring in a field with a new value. This is helpful for simple, exact string replacements—such as updating product names, removing certain keywords, or standardizing text in records.

Usage

{{replace field oldSubstring newSubstring}}

field: The field or variable whose text you want to modify (e.g., record.description).

oldSubstring: The text to find in the field.

newSubstring: The text that replaces each occurrence of oldSubstring.

Examples

Replacing ampersands with "and"

If record.cases is "these & those & some other cases", then:

{{replace record.cases "&" "and"}}

yields "these and those and some other cases".

Updating an item's description

If record.description is "Shoes", you can change it to "Boots":

{{replace record.description "Shoes" "Boots"}}

which returns "Boots".

Using triple braces for raw output

{{{replace record.details ":" "="}}}

replaces all colons (:) with equals signs (=) and returns the unformatted string, bypassing any automatic quoting or encoding.

Tip

This helper performs a straightforward, case-sensitive replacement on all occurrences of oldSubstring.

For more complex pattern matching (e.g., partial words, optional characters), consider using the regexReplace helper.

If you want the result to be returned exactly as is—without any automatic formatting—use triple braces ({{{ }}}).

### replacefirst
Replaces only the first occurrence of a specified substring in a string with another value. Use it when you want to substitute the first match but leave later matches unchanged.

Usage

{{replacefirst str a b}}

str: input string

a: substring to replace

b: replacement string

Examples

Replace the first occurrence of a character

{{replacefirst record.text "a" "z"}}

Input:

{ "record": { "text": "a b a b a b" } }

Output:

z b a b a b

Replace only the first word

{{replacefirst record.note "Order" "Invoice"}}

Input:

{ "record": { "note": "Order Order Order" } }

Output:

Invoice Order Order

Tip

Only the first matching substring is replaced; later matches remain unchanged.

Matching is case-sensitive—"A" and "a" are treated differently.

Use this helper when you need to replace a predictable prefix, tag, or marker without altering the rest of the string.

### reverse
Reverses the order of characters in a string. Use it when you need to flip text values, generate unique transformations, or apply data manipulation for testing.

Usage

{{reverse value}}

value (required): string to be reversed

Examples

Reverse a simple word

{{reverse record.word}}

Input:

{ "record": { "word": "abcde" } }

Output:

edcba

Reverse a customer name

{{reverse record.firstName}}

Input:

{ "record": { "firstName": "Jane" } }

Output:

enaJ

Tip

Works on any string input; numbers are first treated as strings before reversing.

Whitespace and punctuation are preserved in reversed order.

Useful for debugging or creating obfuscated identifiers.

### sanitize
Removes all markup tags from the input string and returns only the plain text content. This is useful when working with values that may include formatting or markup but need to be stored, displayed, or passed along as clean text.

Usage

{{sanitize string}}

string (required): input string to sanitize.

Examples

Strip markup from a field value

{{sanitize record.raw}}

Input:

{
"record": {
"raw": "<span>Hello <strong>World</strong></span>"
}
}

Output:

Hello World

Tip

Use this helper when cleaning fields that may contain markup copied from external sources, such as CMS fields or web form inputs.

Only tags are removed; the text content inside the tags is preserved.

Pair with formatting helpers if you need to reformat the sanitized string after cleanup.

No spaces/newlines are added for removed elements (div, li, td, br, etc.).

Self closing/void elements like <img> are removed; surrounding text is retained.

If HTML entities are preserved after sanitizing, use htmlDecode to convert these into their readable characters.

### sentence
Converts text into sentence case. The first letter of each sentence is capitalized, and all remaining letters are converted to lowercase. Use it to standardize inconsistent text inputs.

Usage

{{sentence value}}

value (required): input string

Examples

Convert a message to sentence case

{{sentence record.message}}

Input:

{
"record": {
"message": "hello world. goodbye world."
}
}

Output:

Hello world. Goodbye world.

Use periods, question marks, or exclamation points as word boundaries

{{sentence record.message}}

Input

{ "record": { "message": "Mr. hello world? goodbye world!" }}

Output

Mr. Hello world? Goodbye world!

Tip

This helper lowercases all non-initial characters, so acronyms like "API" become "Api." Use with caution if capitalization must be preserved.

Useful for formatting free-text fields, such as comments or notes, into consistent sentence case.

Works best when input strings are well-formed with clear sentence-ending punctuation (., !, ?).

Will not work as expected for non-string inputs such as number, boolean, arrays, or objects.

### snakecase
Converts a string into snakecase format by replacing spaces, dashes, and other non-word characters with underscores (_). Use it when you need consistent identifiers, especially for systems that prefer underscore naming conventions.

Usage

{{snakecase value}}

value (required): input string

Examples

Convert a product label to snakecase

{{snakecase record.product.label}}

Input:

{
"record": {
"product": {
"label": "a-b-c d_e"
}
}
}

Output:

a_b_c_d_e

Convert descriptive text

{{snakecase record.category}}

Input:

{
"record": {
"category": "New Product Launch 2025"
}
}

Output:

new_product_launch_2025

Convert camelCase (and other case splitting)

{{snakecase record.userAction}}

Input:

{ "record": { "userAction": "getUserProfile" } }

Output:

get_user_profile

Tip

All separators are normalized into a single underscore.

Useful for generating consistent keys, database field names, or API parameters.

Consecutive non-word characters collapse into a single underscore.

Output is lowercase and splits camelcase/pascalcase at capital letter boundaries.

Digits are preserved; underscores are not inserted between letters and adjacent digits unless a separator exists.

Non-string datatype inputs (like numbers or boolean) are converted to strings before processing. Arrays of primitive types (like strings or numbers) are converted into a comma-separated string before processing. If inputs are objects or object arrays, the output will be unusable.

### split
Usage

Use the split helper to break a string into an array of substrings based on a specified delimiter. You can optionally return a single element from the resulting array by providing its 0-based index.

{{split field delimiter [index]}}

field: The field or variable containing the string to split (e.g., record.fullName).

delimiter: The character(s) used to split the string (e.g., "-", ",", " ").

index (optional): Zero-based index indicating which substring to return. If omitted, the helper returns the substring at index 0.

Examples

Getting specific parts of a name

If record.fullName is "Hillary-Ann-Swank", then:

{{split record.fullName "-" 0}} → Hillary
{{split record.fullName "-" 1}} → Ann
{{split record.fullName "-" 2}} → Swank

Returning substring at position 0 (no index)

{{split record.fullName "-"}}

Produces substring at index position 0 (e.g., "Hillary").

Tip

If the delimiter does not appear in the string, the helper returns the string itself (or an empty result if the string is empty).

Double-check that the delimiter matches exactly what you expect (e.g., a space vs. a hyphen).

Use triple braces ({{{ }}}) if you prefer raw, unformatted output of the resulting comma-separated list.

### substring
Use the substring helper to extract a portion of a string from the specified start index (inclusive) up to the end index (exclusive). It's helpful for shortening longer field values or picking out key segments within text.

Usage

{{substring stringField startIndex endIndex}}

stringField: The field or variable containing the source string (e.g., record.itemizationCode).

startIndex: The 0-based position in the string where extraction begins.

endIndex: The 0-based position where extraction ends, not including the character at this index.

Examples

Truncating a code

If record.itemizationCode is "itemizationCode", then:

{{substring record.itemizationCode 0 4}}

returns "item".

Extracting part of a memo

Suppose record.memo is "The quick brown fox jumped over the lazy dog". You can grab "brown fox" with:

{{substring record.memo 10 19}}

Using triple braces for raw output

{{{substring record.memo 0 9}}}

This avoids any automatic formatting if you want the substring exactly as-is.

Tip

Do not wrap the field reference in quotes when referencing it. For example, use {{substring record.description 0 10}}, not {{substring "record.description" 0 10}}.

Since endIndex is non-inclusive, {{substring "Celigo" 1 4}} returns "eli".

If startIndex or endIndex goes beyond the actual string length, the helper returns only the portion that exists within that range.

### trim
Use the trim helper to remove any leading or trailing whitespace characters from the specified field or string. This is particularly useful when dealing with data that may have extra spaces before or after meaningful text.

Usage

{{trim field}}

field: The field or variable containing the text to be trimmed (e.g., record.name).

Examples

Trimming whitespace from a record field

If record.artist is " Lalo Schifrin ", then:

{{trim record.artist}}

returns "Lalo Schifrin" (with leading and trailing spaces removed).

Using triple braces for raw output

{{{trim record.title}}}

Returns the cleaned string without any automatic formatting—e.g., "Danube Incident" if the original value had extra whitespace.

Tip

Trimming helps avoid issues where strings appear identical but contain hidden or unintended spaces.

You typically don't need quotes for numeric fields, but if you do pass a string literal directly (e.g., " Hello "), ensure it's quoted properly.

If the original string has only whitespace or is empty, trim returns an empty string.

### trimLeft
Removes only leading whitespace from a string, leaving trailing whitespace unchanged. Use it when you need to clean up values that may have extra spaces at the beginning.

Usage

{{trimLeft value}}

value (required): input string

Examples

Remove spaces from the start of a string

{{trimLeft record.text}}

Input:

{ "record": { "text": " ABC " } }

Output:

"ABC "

Tip

Only leading whitespace is removed; trailing whitespace remains intact.

Use this helper when importing or exporting values where trailing spaces are meaningful but leading spaces should be discarded.

Pair with trimRight if you need to remove trailing whitespace as well.

### trimRight
Removes only trailing whitespace from a string, leaving leading whitespace unchanged. Use it when values may include extra spaces at the end that need to be cleaned up.

Usage

{{trimRight value}}

value (required): input string

Examples

Remove spaces from the end of a string

{{trimRight record.text}}

Input:

{ "record": { "text": " ABC " } }

Output:

" ABC"

Tip

Only trailing whitespace is removed; leading whitespace remains intact.

Use this helper when exporting values where leading spaces are meaningful but trailing spaces should be discarded.

Pair with `trimLeft` if you need to remove both leading and trailing whitespace.

### truncateWords
Shortens a string to a set number of words and optionally appends a suffix. This is useful when you need to limit text length in fields, summaries, or previews.

Usage

{{truncateWords string limit suffix}}

string (required): input string

limit: number of words to keep

suffix (optional): suffix to append (defaults to ...)

Examples

Truncate a description to different word counts

{{truncateWords record.description 1}}
{{truncateWords record.description 2}}
{{truncateWords record.description 3}}

Input:

{ "record": { "description": "foo bar baz" } }

Output:

foo… foo bar… foo bar baz

Custom suffix

{{truncateWords record.notes 2 "--more"}}

Input:

{ "record": { "notes": "Integration setup requires testing" } }

Output:

Integration setup--more

Truncate to zero words (returns only suffix)

{{truncateWords record.description 0}}

Input:

{ "record": { "description": "foo bar baz" } }

Output:

…

Tip

Word boundaries are respected—truncation doesn't cut off part of a word.

If the number of words in the input is less than or equal to the limit, the string is returned unchanged.

Use the suffix parameter to provide user-friendly cues, such as " (continued)" or "...".

limit is required and must be a non-negative integer. 0 returns only the suffix. Negative or non-numeric ⇒ empty result.

### uppercase
Use the uppercase helper to convert all lowercase letters in a given string or field to uppercase characters. This is useful for standardizing text fields (e.g., product categories, usernames) or ensuring uppercase output in flow data.

Usage

{{uppercase field}}

field: The text-based field or variable you want to transform (e.g., record.category).

Example

Converting a literal string

{{uppercase "library"}}

Produces "LIBRARY".

Using data from the record

The {{uppercase family.type}} is a member of the {{uppercase family.animal}} family

If family.type is "dog" and family.animal is "canine", the output becomes:

The DOG is a member of the CANINE family

Triple braces for raw output

{{{uppercase record.description}}}

Returns the uppercase string without Celigo's automatic formatting.

Tip

Non-alphabetic characters and uppercase letters remain unchanged.

If the field contains numbers or other symbols, they are unaffected.

If the field is empty or null, uppercase returns an empty string.
