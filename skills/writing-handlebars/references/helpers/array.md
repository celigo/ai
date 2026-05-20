# Array Helpers

Slicing, searching, deduplication, sorting, and property extraction for arrays.

### after
The after helper returns a new array that excludes the first n elements from the input array. Use it to skip a set number of items from the beginning of a list.

Usage

{{after array n}}

array (required): The array to slice

n (required): The number of items to skip

Examples

Return elements after a specific index

{{after record.letters 2}}

Input:

{
"record": {
"letters": ["a", "b", "c", "d"]
}
}

Output:

["c", "d"]

Skip the first item only

{{after record.items 1}}

Input:

{
"record": {
"items": ["apple", "banana", "cherry"]
}
}

Output:

["banana", "cherry"]

Use with iteration

{{#each (after record.tags 3)}}
{{this}}
{{/each}}

Input:

{
"record": {
"tags": ["one", "two", "three", "four", "five"]
}
}

Output:

four five

Tip

If n is greater than or equal to the array length, the helper returns an empty array.

Works only with arrays. For skipping elements in other data structures, convert them to arrays first (for example, using arrayify).

Useful for pagination, offset handling, or trimming unwanted leading elements.

### arrayify
The arrayify helper casts the given input into an array.

If the input is already an array, it returns it unchanged.

If it's a single value, it wraps that value in an array.

If the input is null or undefined, it returns an empty array.

Usage

{{arrayify value}}

value (required): any value to cast into an array.

Examples

value (required): Any value to cast into an array

Convert values to arrays

{{arrayify record.name}}
{{arrayify record.tags}}

Input:

{
"record": {
"name": "foo",
"tags": ["promo", "sale"]
}
}

Output:

["foo"]
["promo", "sale"]

Handle null or undefined input

{{arrayify record.missingField}}

Input:

{ "record": {} }

Output:

[]

Convert field value to array

{{arrayify record.test}}

Input:

{
"record": {"test":"a,b"}
}

Output:

[ "a,b"]

Tip

Useful for ensuring consistent array output in loops or mappings.

Prevents runtime errors when downstream logic expects arrays.

Combine with iteration helpers like #each to handle single or multiple values uniformly.

### before
The before helper returns a new array excluding the last n elements from the input array. Use it to remove trailing elements or to select only the first portion of an array.

Usage

{{before array n}}

array (required): The array to slice

n (required): The number of items to exclude from the end

Examples

Exclude the last two elements

{{before record.letters 2}}

Input:

{
"record": {
"letters": ["a", "b", "c", "d"]
}
}

Output:

["a", "b"]

Keep only the first item

{{before record.items 3}}

Input:

{
"record": {
"items": ["apple", "banana", "cherry", "date"]
}
}

Output:

["apple"]

Use with iteration

{{#each (before record.tags 1)}}
{{this}}
{{/each}}

Input:

{
"record": {
"tags": ["draft", "review", "published"]
}
}

Output:

draft review

Tip

If n is greater than or equal to the array length, the helper returns an empty array.

Works only with arrays; for strings, use substring-related helpers instead.

Useful for trimming arrays before further processing or output.

### getValue
Use {{getValue}} to safely retrieve the value at a specified field path. If that field does not exist or is null, you can optionally provide a fallback. This helper is especially useful when field names are not fixed or are generated dynamically.

Usage

{{getValue fieldPath "defaultValue"}}

fieldPath: The JSON path or string identifying the field (e.g., "record.customerId" or a dynamic path from another helper).

defaultValue (optional): Returned if the specified field is missing or null.

Examples

Retrieving a known field

{{getValue "record.email" "no-email@example.com"}}

If record.email is "jane.doe@example.com", this outputs "jane.doe@example.com". Otherwise, it defaults to "no-email@example.com".

Handling a dynamic field name

{{getValue (getValue "record.dynamicFieldName")}}

Suppose record.dynamicFieldName is "promoCode", and record.promoCode exists. The first getValue fetches "promoCode", and the second retrieves record.promoCode.

Fallback for missing data

{{getValue "shipping.trackingNumber" "Not Assigned"}}

If shipping.trackingNumber doesn't exist or is null, the helper returns "Not Assigned".

Tip

To avoid errors, use a default value if there's a chance the field path might be undefined or null.

getValue can fail inside a #each block if it cannot determine the full context path; consider referencing known fields instead, or fetch the needed value before the loop.

Nesting getValue allows you to build field paths at runtime, especially when you don't know the field name in advance (e.g., date-based object keys).

### lookup
The {{lookup}} helper retrieves data from lookups you define in the same flow step, but cannot reference lookups from other steps. In the AFE 2.0 screen, you can open the Create/manage lookup drawer to configure these lookups. The drawer supports two types:

Dynamic search: You define the search in the destination application, and then also the single string field value from search results that you want to return.

Static: value-to-value: You define the value to value mappings (e.g., "apple" → "banana").

You must give each lookup a unique alphanumeric name that will be used to reference it in your Handlebars template.

Usage

For a dynamic search lookup, reference the lookup name without quotes in your template:

{{lookup.myDynamicLookup}}

For a static: value-to-value lookup, wrap the lookup name in quotes and supply the value to match:

{{lookup "myStaticLookup" record.someField}}

Use these exact naming conventions (with or without quotes) based on how you created the lookup in the same flow step.

Examples

Dynamic search lookup

Suppose you created a dynamic search lookup called shippingLookup, which retrieves the first shipping method from your destination application (shipping[0].method). To use it in your handlebars template:

{{lookup.shippingLookup}}

If the dynamic search returns "Overnight" as the method, then {{lookup.shippingLookup}} yields "Overnight".

Static value-to-value lookup

Imagine you set up a static lookup named stateAbbreviation that maps full state names to abbreviations, for example:

"California" -> "CA"

"New York" -> "NY"

"Texas" -> "TX"

When building your import record, you can convert a user's address state to its abbreviation:

{{lookup "stateAbbreviation" record.shippingAddress.state}}

If record.shippingAddress.state is "Texas", the helper returns "TX".

Tip

Make sure your lookup's alphanumeric name in the handlebars matches exactly what you defined in the Create/manage lookup drawer (static lookups require quotes, dynamic do not).

For dynamic lookups, verify your JSON path in the destination application's response is valid (e.g., products[0].name).

Previewing from the AFE step will only show placeholder results, but when you run the flow the lookups will execute as expected.

### pluck
The pluck helper iterates over an array (or array of objects) and returns a new array containing the values of a specified property for each element. It supports dot notation to access nested fields.

Usage

{{pluck array "property"}}

array (required): The array or object to extract values from

property (required): The property name to extract; supports dot notation

Examples

Extract a nested property from an array of objects

{{pluck record.items "data.title"}}

Input:

{
"record": {
"items": [
{
"data": {
"title": "Introduction to Handlebars",
"category": "Tutorial"
}
},
{
"data": {
"title": "Advanced Template Logic",
"category": "Guide"
}
},
{
"data": {
"title": "Using Helpers Effectively",
"category": "Best Practices"
}
}
]
}
}

Output:

["Introduction to Handlebars", "Advanced Template Logic", "Using Helpers Effectively"]

Extract top-level values

{{pluck record.products "sku"}}

Input:

{
"record": {
"products": [
{ "sku": "A001", "price": 20 },
{ "sku": "A002", "price": 30 },
{ "sku": "A003", "price": 25 }
]
}
}

Output:

["A001", "A002", "A003"]

Tips

Tip

Dot notation allows extracting deeply nested values (e.g., "order.customer.name").

Nonexistent properties return null for those array elements.

Combine with helpers like unique or join to further process the extracted values.

### sort
Use the sort helper to arrange an array's items in ascending or descending order. By default, the items are sorted alphabetically (lexicographically) in ascending order. You can enable numeric sorting or reverse the sort order using optional parameters:

Usage

{{sort field [number="true"] [reverse="true"]}}

field: The field or variable containing an array to sort (e.g., record.items).

number (optional): If set to "true", the items are sorted numerically instead of lexicographically.

reverse (optional): If set to "true", sorts in descending order.

Examples

Ascending numeric sort

{{sort record.items number="true"}}

If record.items is ["2","1","4","5","3"], this outputs 1,2,3,4,5.

Descending numeric sort

{{sort record.items number="true" reverse="true"}}

Using the same array, this produces 5,4,3,2,1.

Sorting strings in ascending order

{{sort record.items}}

If record.items is ["candy","hat","toy"], it sorts to candy,hat,toy.

Using triple braces for raw output

{{{sort record.items}}}

Returns the same sorted result, but without Celigo's automatic wrapping or encoding (for example, quotes around the output).

Tip

If your array contains numeric strings like "10" and "2", use number="true" to avoid alphabetical ordering ("10","2") instead of the desired numeric order (2,10).

Combining number="true" with reverse="true" yields a descending numeric sort.

Consider whether you need raw output ({{{ }}}) or default formatting ({{ }}}) when working with sorted data.

### unique
The unique helper returns a new array with all duplicate values removed. Use it with #each or other rendering helpers to process or display only distinct values.

Usage

{{unique array}}

array (required): array to deduplicate

Examples

Remove duplicates from a string array

{{#each (unique record.tags)}}{{this}}{{#unless @last}},{{/unless}}{{/each}}

Input:

{ "record": { "tags": ["a", "a", "c", "b", "e", "e"] } }

Output:

a,c,b,e

Use with nested data

{{#each (unique record.categories)}}
{{this}}
{{/each}}

Input:

{ "record": { "categories": ["A","B","A","C","B"] } }

Output:

A
B
C

Tip

Preserves the original order of first occurrences.

Works only for arrays of primitive values (strings, numbers, booleans).

Use this helper to eliminate duplicates before iterating or combining results from multiple data sources.
