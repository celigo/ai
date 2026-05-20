# Type/Logic Helpers

Type checking, equality, truthiness, and property detection.

### eq
The eq helper compares two input values and returns true if they are equal, using loose equality (type coercion allowed). Use it when comparing values that may differ in type but represent the same value.

Usage

{{eq firstVal secondVal}}

firstVal (required): the first value to compare

secondVal (required): the second value to compare

Tip

Returns boolean true if values are equal under loose equality, else false.

Examples

Compare numbers and strings

{{eq record.a record.b}}
{{eq record.a record.c}}
{{eq record.a record.d}}

Input:

{
"record": {
"a": 5,
"b": 5,
"c": "5",
"d": 3
}
}

Output:

true true false

A conditional usage example

{{#if (eq record.role "admin")}}
Has admin access {{else}}
Standard access {{/if}}

Input:

{ "record": { "role": "admin" } }

Output:

Has admin access

Tip

Uses loose equality (==) — "5" equals 5.

Commonly used in conditional logic helpers (e.g., #if, #unless) to simplify comparisons.

### hasNoItems
Returns true if the input collection (array or object) has no elements or properties.

Usage

{{hasNoItems value}}

value (required): The array or object to evaluate

Examples

Check for empty arrays and objects

{{hasNoItems record.arr1}}
{{hasNoItems record.arr2}}
{{hasNoItems record.obj1}}
{{hasNoItems record.obj2}}

Input:

{
"record": {
"arr1": [],
"arr2": [1, 2],
"obj1": {},
"obj2": { "x": 1 }
}
}

Output:

true false true false

Conditional rendering example

{{#if (hasNoItems record.items)}}
No items found {{else}}
Items present {{/if}}

Input:

{ "record": { "items": [] } }

Output:

No items found

Tip

Works for both arrays and plain objects.

Returns true only when there are no elements (for arrays) or no keys (for objects).

Use with #if or #unless for conditional logic when checking for empty collections.

### hasOwn
The hasOwn helper checks whether the specified key is an own, enumerable property of the given object. It returns true if the property exists directly on the object (not inherited).

Usage

{{hasOwn object "key"}}

object (required): The context object to check

key (required): The property name to test (string)

Examples

Check for existing and missing properties

{{hasOwn record.config "theme"}}
{{hasOwn record.config "version"}}

Input:

{
"record": {
"config": {
"theme": "dark",
"debug": true
}
}
}

Output:

true false

Conditional usage

{{#if (hasOwn record.config "debug")}}
Debug mode enabled {{else}}
Debug property not found {{/if}}

Input:

{
"record": {
"config": {
"theme": "light",
"debug": true
}
}
}

Output:

Debug mode enabled

Tip

Works only for own properties, not those inherited through prototypes.

Ideal for verifying optional settings or configuration fields in objects.

Use with #if or #unless to conditionally render sections based on property existence.

### isFalsey
The isFalsey helper returns true if the input value is falsy according to JavaScript rules. Falsey values include false, 0, "" (empty string), null, undefined, and NaN.

Usage

{{isFalsey value}}

value (required): Any input to evaluate.

Examples

Evaluate various falsey and truthy values

{{isFalsey record.a}}
{{isFalsey record.b}}
{{isFalsey record.c}}
{{isFalsey record.d}}
{{isFalsey record.e}}

Input:

{
"record": {
"a": 1,
"b": 0,
"c": "hello",
"d": "",
"e": null
}
}

Output:

false true false true true

Conditional rendering example

{{#if (isFalsey record.value)}}
Value is falsey {{else}}
Value is truthy {{/if}}

Input:

{ "record": { "value": "" } }

Output:

Value is falsey

Tip

The helper follows JavaScript's native falsy evaluation rules.

Use it to validate input, check optional fields, or guard conditional logic.

Combine with logical helpers (like #and or #or) for complex conditions.

### isTruthy
The isTruthy helper returns true if the input value is truthy according to JavaScript rules (e.g., non-empty strings, non-zero numbers, objects, and arrays).

Usage

{{isTruthy value}}

value (required): Any input to evaluate

Examples

Evaluate different truthy and falsy values

{{isTruthy record.a}}
{{isTruthy record.b}}
{{isTruthy record.c}}
{{isTruthy record.d}}
{{isTruthy record.e}}

Input:

{
"record": {
"a": 1,
"b": 0,
"c": "hello",
"d": "",
"e": null
}
}

Output:

true false true false false

Conditional rendering example

{{#if (isTruthy record.status)}}
Active {{else}}
Inactive {{/if}}

Input:

{ "record": { "status": "enabled" } }

Output:

Active

Tip

Follows standard JavaScript truthiness rules.

Useful for conditional logic when you need to check if a value exists or is non-empty.

Combine with #if or logical helpers (#and, #or) to simplify flow control.

### typeOf
Returns the native JavaScript type of the given input. It's useful for identifying whether a value is a number, string, array, object, or another type before applying logic in a flow.

Usage

{{typeOf value}}

value (required): any input

Examples

Check types of different fields

{{typeOf record.age}}
{{typeOf record.firstName}}
{{typeOf record.items}}

Input:

{
"record": {
"age": 25,
"firstName": "Alice",
"items": [
{ "sku": "ITEM001", "quantity": 2 },
{ "sku": "ITEM002", "quantity": 1 }
]
}
}

Output:

number string array

Check other common types and null

{{typeOf record.age}}
{{typeOf record.flag}}
{{typeOf record.firstName}}
{{typeOf record.items}}
{{typeOf record.note}}

Input:

{
"record": {
"age": 25,
"flag":true,
"firstName": "Alice",
"items": [ { "sku": "ITEM001", "quantity": 2 } ],
"note": null
}
}

Output:

number boolean string array object

Tip

The helper always returns lowercase type names (string, number, array, object, etc.).

For null, the result is object because of JavaScript's type system.

Use this helper when building dynamic templates that depend on data type, such as formatting numbers differently from strings.
