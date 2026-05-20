# Block Helpers and Data Variables

Iteration, conditionals, comparison, filtering, and context variables for block-level logic.

## Block helpers

### #and
The #and block helper renders the expression if both of the specified parameters are true (according to JavaScript rules). If the result is false, the {{else}} expression prints in the output. If the field is undefined, null, or an empty string, it will evaluate as false, otherwise it will be true. The integer value of 0 will evaluate to false; however, the STRING value of "0" evaluates to true, as all non-empty strings are true:

{{#and field field}} expr {{else}} expr {{/and}}

Template

Context

Output

{{#and Contact.homeAddress zeroInteger}}true{{else}}false{{/and}}

{{#and Contact.homeAddress emptyString}}true{{else}}false{{/and}}

{{#and Contact.homeAddress emptyString}}true{{else}}false{{/and}}

{{#and Contact.homeAddress emptyString}}true{{else}}false{{/and}}

{{#and Contact.homeAddress emptyString}}true{{else}}false{{/and}}

{
"Contact":{
"homeAddress":"123 Anywhere",
"offAddress":"789 Somewhere"
},
"emptyString":"",
"nullfield":null,
"zeroString":"0",
"zeroInteger":0
}

true

false

false

true

false

{{#and legends.unicorns legends.horses}} {{legends.unicorns}} - {{legends.horses}} {{else}} Not found {{/and}}

{
"legends":{
"unicorns":"11",
"ponies":"22",
"horses":"33",
"total":"66"
}
}

11-33

{{#and firstName lastName}} {{firstName}} {{middleName}} {{lastName}} {{else}}Not found {{/and}}

{
"fullName":"Hillary Ann Swank",
"firstName":"Hillary",
"middleName":"Ann",
"lastName":"Swank"
}

Hillary Ann Swank

### #compare
The #compare block helper compares two variables using a logical operator.

{{#compare field operator field}} expr {{else}} expr {{/compare}}

The compare helper compares data variables against each other using logical operators. The "else" statement is used to output text if the argument returns a false condition.

Template

{{#compare details.fromState "===" "NE"}}+{{details.qty}}
{{else}}{{details.qty}}{{/compare}}
{{#compare details.fromState "===" "AK"}}TRUE: {{details.qty}}
{{else}}FALSE{{/compare}}

Context

{
"export": {},
"details": {
"fromState": "NE",
"customerName": "Thomas",
"customerId": "22222",
"qty": "3",
"other": " "
}
}

Output

+3

FALSE

The second argument is the arithmetic operator to be used for comparing the two arguments. Optionally, you can also specify the {{else}} expression to render the value when #compare returns FALSE.

In the following example, reversing the operator will change the output to "false."

Template

{{#compare sample1 ">" sample2}} true {{else}} false {{/compare}}

Context

{
"sample1": "50",
"sample2": "100",
"sample3": "200"
}

Output

true

This example shows a comparison of the quantity on hand against the quantity ordered, and logical output.

Template

{{#compare qty ">=" ordered}}Please ship {{qty}} units
{{else}} do-not-ship{{/compare}}

Context

{
"state": "VA",
"name": "Thomas Jefferson",
"part": "R1",
"qty": "100",
"ordered": "100",
"inventoryOnOrder": "1000",
"ERP_Item": "kit"
}

Output

Please ship 100 units

This example uses compare to verify a phone number field has exactly 10 digits. If not, the output is ten zeros (0000000000).

Template

{{#compare phone.length "===" 10}}{{else}}0000000000{{/compare}}

Context

{
"phone": "123456789"
}

Output

0000000000

Logical Operators for #compare

Operator

Description

<

Less than (a < b)

>

Greater than (a > b)

<=

Less than or equal to (a <= b)

>=

Greater than or equal to (a >= b)

==

Equal to (a == b)

If the two compared values are not of the same type (string, boolean, or number), this operator will attempt to convert the values to like types.

===

Strict equal to (a === b)

If the two compared values are not of the same type (string, boolean, or number), this operator will NOT attempt to convert the values to like types. No type conversion is done, and the types must be the same to be considered equal.

!=

Not equal to (a != b)

If the two compared values are not of the same type (string, boolean, or number), this operator will attempt to convert the values to like types.

!==

Strict not equal to (a !== b)

If the two compared values are not of the same type (string, boolean, or number), this operator will NOT attempt to convert the values to like types. No type conversion is done, and the types must be the same to be considered equal.

Note

You can reference literal strings in compare statements by surrounding the literal string in double quotation marks. For example: {{#compare record.Domain "==" "eu.integrator.io"}}

Compare with else

This example shows the #compare block helper with a nested compare expression. The sample compares the quantity order with current inventory levels. It then compares the current inventory levels with items on order. If the order can be successfully filled, the expressions return "Match". If not, the output returns "Inventory levels too low".

Template

{{#compare ordered "<=" stockLevel}}Match{{else compare stockLevel "<" inventoryOnOrder}}Match{{else}}Inventory levels too low{{/compare}}

Context

{
"state": "NE",
"name": "Thomas",
"qty": "100",
"ordered": "100",
"stockLevel": "10",
"inventoryOnOrder": "1000",
"ERP_Item": "kit"
}

Output

Match

### #contains
The #contains block helper parses the name:value specified in the block to check for the presence of a given value. If the value specified is not present, then it prints the {{else}} expression.

{{#contains fieldArray field}} optionalTextIfTrue {{else}} optionalTextIfFalse {{/contains}}

The fieldArray value can be an array name, arrayname.keyname, or a string that will be interpreted as an array.

In the first example, the order.item value is "12345". The specified value in the #contains block is "5". Since 5 is a number present in the value, the first expression statement will be displayed. The second example is looking for a "6". Since 6 is not present, the else statement it output.

Template

Context

Output

{{#contains order.item "5"}}
Sales ID Found!
{{else}}Sales ID Missing!
{{/contains}}

{
"order": {
"item": "12345"
}
}

Sales ID Found!

{{#contains order.item "6"}}
Sales ID Found!
{{else}}Sales ID Missing!
{{/contains}}

{
"order": {
"item": "12345"
}
}

Sales ID Missing!

{{#contains order.sales "2"}}
Sales ID Found!
{{else}}Sales ID Missing!
{{/contains}}

{
"order": {
"sales": ["2","3","59","4","9","10","7"]
}
}

Sales ID Found!

The example below shows an if/then argument against the product and whether or not a product warranty was purchased via an if...else argument against the context fields specified.

Template

{{#contains ERP_Item "kit"}}+1{{else}}None found{{/contains}}
{{#contains warranty "yes"}}Warranty included{{/contains}}

Context

{
"state": "NE",
"name": "Thomas",
"id": "22222",
"qty": "100",
"ordered": "100",
"stockLevel": "100",
"returned": "100",
"other": " ",
"ERP_Item": "kit",
"warranty": "yes"
}

Output

+1
Warranty included

The example below uses #contains expression nested inside of an if/else expression to set a field to true if another field contains a specific string. In this example, the source_name field contains "3.1415926". If the value for source_name does not contain "3.1415926", the field is set to false.

Template

{{#if source_name}}{{#contains source_name "3.1415926"}}true
{{else}}false{{/contains}}{{/if}}

Context

{
"source_name": "3.1415926",
"id": 123,
"name": "Bob",
"age": 33
}

Output

true

### #each
This helper allows you to iterate over a list. Inside the #each block, you can reference the element to be iterated over.

{{#each field}}{{this}}{{/each}}

This example shows a simple record with names. The {{each}} expression will reference the context while the {{this}} expression will iterate over the array of items in the [people] array.

For the example below, in integrator.io, the [people] array must be referenced as an absolute path in the Resource path field. If the context was an object (name:value pair), then the path would not need to be set.

Also in this example, the semicolon and space between the expressions will allow spacing and punctuation between the variables on output.

Template

{{#each people}}{{this}}; {{/each}}

Context

{
"people": [
"Bertram Gilfoyle",
"Erlich Bachman",
"Jin Yang"
]
}

Output

Bertram Gilfoyle; Erlich Bachman; Jin Yang;

This example shows the system iterating over the array in the "field.names" variables.

Template

{{#each fields.names}}{{#each this}} Employee {{@key}}: {{this}}
{{/each}}{{/each}}

Context

{
"fields": {
"field": "sample",
"field2": "row2",
"rights": [
"system",
"admin",
"editor",
"contributor",
"viewer",
"vendor"
],
"names": [
{"name1":"Stacy"},
{"name2":"Lance"},
{"name3": "Bernice"}
]
}
}

Output

Employee name1: Stacy
Employee name2: Lance
Employee name3: Bernice

When looping through items in #each, you can also reference the current loop index.

Template

System privilege levels: {{@index}} {{#each fields.rights}} {{@index}}: {{this}} {{/each}}

Context

{
"fields": {
"field": "sample",
"field2": "row2",
"rights": [
"system",
"admin",
"editor",
"contributor",
"viewer",
"vendor"
],
"names": [
{"name1":"Stacy"},
{"name2":"Lance"},
{"name3": "Bernice"}
]
}
}

Output

System privilege levels:
0: system
1: admin
2: editor
3: contributor
4: viewer
5: vendor

Additionally for iterating over objects, {{@key}} will reference the current key name. @key will

provide the current index location in an array or the key names in the Context.

Template

{{#each fields.rights}}
{{@key}}:{{this}};
{{/each}}

Context

{
"fields": {
"field": "sample",
"field2": "row2",
"rights": [
"system",
"admin",
"editor",
"contributor",
"viewer",
"vendor"
],
"names": [
{"name1":"Stacy"},
{"name2":"Lance"},
{"name3": "Bernice"}
]
}
}

Output

0:system; 1:admin; 2:editor; 3:contributor; 4:viewer; 5:vendor;

The first and last steps of iteration are noted via the @first and @last variables when iterating over an array. When iterating over an object, only @first is available. Nested #each blocks may access the iteration variables via depth based paths. To access a parent index in a nested #each loop, specify @../index.

The each helper also supports block parameters, allowing for named references anywhere in the block.

Template

{{#each fields.rights}}
{{@key}}:{{this}};
{{/each}}

Context

{
"fields": {
"field": "sample",
"field2": "row2",
"rights": [
"system",
"admin",
"editor",
"contributor",
"viewer",
"vendor"
],
"names": [
{"name1":"Stacy"},
{"name2":"Lance"},
{"name3": "Bernice"}
]
}
}

Output

0:system; 1:admin; 2:editor; 3:contributor; 4:viewer; 5:vendor;

To create a list or convert data based on index location in a record, you can declare an |item| using vertical bars (pipe character), then entering the characters by their respective index locations (where 0=first character).

Template

{{#each inventoryItems as |item|}}
{{item.[0]}}: {{item.[10]}}
{{/each}}

Context

{
"inventoryItems": {
"X": "1001 text a",
"Y": "2002 text b",
"Z": "3003 text c"
}
}

Output

1: a
2: b
3: c

### #filter
Checks each element in an array and renders the block for each element whose value/property equals the specified value; if no matches, renders the {{else}} block. the specified value. If no matches are found, the {{else}} block is rendered. This helper is useful when working with arrays of objects where filtering by property is required.

Usage

{{#filter array value arrayProperty}}expressionInitial{{else}}expressionElse{{/filter}}

array (required): array to filter

value (required): value to match

arrayProperty (optional): property in each array element to compare (if array contains objects)

Examples

Filter order line items by tag

{{#filter record.order.lineItems "custom" "tag"}}
Custom item: {{sku}} {{else}}
No custom items {{/filter}}

Input:

{
"record": {
"order": {
"id": 12345,
"customer": "John Doe",
"lineItems": [
{ "sku": "TShirt-001", "tag": "standard" },
{ "sku": "Mug-009", "tag": "custom" },
{ "sku": "SmallMug-010", "tag": "custom" },
{ "sku": "Cap-003", "tag": "standard" }
]
}
}
}

Output:

Custom item: Mug-009
Custom item: SmallMug-010

Check for non-matching case

{{#filter record.order.lineItems "express" "tag"}}
Found express items {{else}}
No express items {{/filter}}

Output:

No express items

Tip

The match is case-sensitive: "Custom" and "custom" are treated differently.

Inside the block, you can directly access the properties of the matching element (e.g., {{sku}}, {{tag}}).

#filter renders once per match. Use it when you need to output properties of the matched element(s).

Works with primitive arrays and arrays of objects.

arrayProperty supports dot-paths (e.g., "details.department").

If the first argument is missing/undefined/not an array, the helper produces no output (does not hit {{else}}).

An empty array [] (valid but with no elements) will render the {{else}} block.

### #if...else
The #if _else helper allows an if/then argument.

{{#if field}}expr{{else}}expr{{/if}}

If the argument in the {{#if field}} is true, then it prints the value from the context. If the argument is false (either undefined, null, " ", 0, or [ ] ), then the block prints the else condition.

Important

Do not use spaces in this expression.

If Else logical operators

The following logical operators may be used for building an argument or placing arguments inside expressions.

if

If a specified condition is true, this specifies a block of code to be executed

If the condition is false, another block of code can be executed.

{{#if data.name}}{{data.name}}{{/if}}

if...else

This statement is a part of JavaScript's "Conditional" Statements, which are used to perform different actions based on different conditions, and will execute a block of code if a specified condition is true.

{{#if Name}}{{Name}}{{else}}{{/if}}

else

Specifies a block of code to be executed if the same condition is false.

else if

Specifies a new condition to test if the first condition is false.

compare

Compares two values using logical operators.

{{#compare field operator field}} expr {{else}} expr {{/compare}}

each

{{#each data.identity-profiles}} {{vid}} {{/each}}

if...compare

{{#if data.name}}{{#compare data.name "!="
""}}{{data.name}}{{else}}{{/compare}}{{/if}}

### #ifEven
This argument checks to see if a given value is an even number.

{{#ifEven field}} expr {{else}} expr {{/ifEven}}

If the argument results in an even number (true), the value prints to output. If the argument results in an odd number (false), the {{else}} expression displays. A blank expr field prints the value unless text is specified, as shown below.

Template

Context

Output

{{#ifEven orders.item1}}
{{orders.item1}}
{{else}}
Odd Value {{/ifEven}}

{
"orders": {
"item1": "2",
"item2": "5",
"item3": "8"
}
}

2

{{#ifEven orders.item2}}
The even number value is {{orders.item2}} {{else}}
Odd number value {{/ifEven}}

Odd number value

{{#ifEven orders.item3}}
The even number value is {{orders.item3}} {{else}}
Odd number value {{/ifEven}}

The even number value is 8

### #inArray
Checks if a specified value exists in an array. If the value is found, the main block is rendered; if not, the {{else}} block runs. This helper works only with simple arrays (strings, numbers, etc.), not arrays of objects.

Usage

{{#inArray array value}} expressionInitial {{else}} expressionElse {{/inArray}}

array (required): the array to search

value (required): value to check for

Examples

Check if a tag exists in an order

{{#inArray record.order.tags "priority"}}
Push to Salesforce as high-priority case {{else}}
Ignore or send as regular case {{/inArray}}

Input:

{
"record": {
"order": {
"id": 45678,
"tags": ["gift", "priority", "international"]
}
}
}

Output:

Push to Salesforce as high-priority case

Check membership with a missing value

{{#inArray record.order.tags "express"}}
Mark as express shipping {{else}}
Continue with standard shipping {{/inArray}}

Input:

{
"record": {
"order": {
"tags": ["gift", "priority", "international"]
}
}
}

Output:

Continue with standard shipping

Strings don't change to numbers

{{#inArray record.numbers "3"}} Found{{else}} Not found{{/inArray}}

Input:

{ "record": { "numbers": [1, 2, 3, 4] } }

Output:

Not found

Tip

Works only with arrays of simple values. For arrays of objects, use the #filter helper.

Matching is case-sensitive: "Priority" and "priority" are treated as different values.

Useful for routing, conditional branching, or handling special cases based on tags or labels.

Renders the {{else}} block if the array parameter is not a valid array or if the array contains objects.

### #isEmpty
Renders the main block when the collection is an empty array/object, the parameter is missing/undefined, or the value is null or undefined; otherwise renders the {{else}} block.

Usage

{{#isEmpty collection}}Block if empty{{else}}Block if not{{/isEmpty}}

collection (required): array or object to test

Examples

Check if an array or object is empty

{{#isEmpty record.arr}}Array is empty{{else}}Has items{{/isEmpty}}
{{#isEmpty record.obj}}Object is empty{{else}}Has keys{{/isEmpty}}

Input:

{
"record": {
"arr": [],
"obj": {}
}
}

Output:

Array is empty
Object is empty

Non-empty case

{{#isEmpty record.items}}No items found{{else}}Items available{{/isEmpty}}

Input:

{ "record": { "items": [1, 2, 3] } }

Output:

Items available

Tip

Works with both arrays and objects.

For strings, use the #not helper combined with the value to check for emptiness ({{#not record.value}}).

Useful for handling optional fields, conditionally rendering messages, or validating data presence.

If the input is not an array or plain object (e.g., boolean/number), #isEmpty treats it as empty and renders the main block.

### #neither
This helper is used for building true/false arguments.

{{#neither field field}} expr {{else}} expr {{/neither}}

If both parameters are equal to false, the first expression displays.

If one or both are equal to true, the {{else}} expression statement displays.

In this example, both the values in the Context are blank /null (which makes the argument true), so the first expression is printed to output.

Template

{{#neither item1 item2}}
Values are absent for the specified parameters. {{else}}
Only one of the parameters has a value. {{/neither}}

Context

{
"item1": "",
"item2": ""
}

Output

Values are absent for the specified parameters.

In this example, only one of the Context variables is blank, so the argument will pass the {{else}} statement to the output.

Template

{{#neither item1 item2}}
Values are absent for at least one of the specified parameters. {{else}}
Only one of the parameters has a value. {{/neither}}

Context

{
"item1": "",
"item2": "5"
}

Output

Only one of the parameters has a value.

### #not
Inverts truthiness and renders its block if the input is falsy. If the input is truthy, the {{else}} block runs.

Usage

{{#not value}}Block if falsey{{else}}Block if truthy{{/not}}

value (required): input value to negate

Examples

Check if a field is empty

{{#not record.empty}}Field is empty{{else}}Field has value{{/not}}

Input:

{
"record": {
"isEnabled": true,
"empty": "",
"count": 0
}
}

Output:

Field is empty

Check if a count is zero

{{#not record.count}}No items available{{else}}Items exist{{/not}}

Input:

{ "record": { "count": 0 } }

Output:

No items available

Empty array is truthy

{{#not record.items}}No items{{else}}Items array exists{{/not}}

Input:

{ "record": { "items": [] } }

Output:

Items array exists

Tip

Evaluates based on standard JavaScript truthy/falsy rules (0, "", null, undefined, and false are falsy).

Useful for conditionally displaying fallback messages or handling missing data.

Combine with other logical helpers (#and, #or) for more complex conditions.

Evaluate using standard JavaScript truthiness rules: 0, "", null, undefined, and false are falsy; non-empty strings (including "0" and "false"), non-zero numbers, objects, and arrays (even []) are truthy.

### #or
This helper creates an all-or-nothing argument. It prints the first expression if the argument is true, and the {{else}} expression if the argument is false.

{{#or field field}} expr {{else}} expr {{/or}}

Template

Context

Output

{{#or item1 item2}}
One or both fields have a data value {{else}}
Neither field has a data value {{/or}}

{
"item1": "100",
"item2": "15000"
}

One or both fields have a data value.

{
"item1": "",
"item2": ""
}

Neither field has a data value.

### #some
Checks whether any element in an array satisfies a given condition function. If true for at least one, the main block is rendered; otherwise, the {{else}} block is rendered.

Usage

{{#some array conditionFn}} expressionInitial {{else}} expressionElse {{/some}}

array (required): array to evaluate

conditionFn (required): functionto apply to each element. Valid conditionFn include:

isFalsy

isTruthy

isArray

isString

isObject

isNumber

isBoolean

Examples

Check if any array element is truthy

{{#some record.arr isTruthy}}
Truthy {{else}}
N/A {{/some}}

Input:

{ "record": { "arr": [1, "hello", true] } }

Output:

Truthy

Check if any array element is a number

{{#some record.values isNumber}}
Contains a number {{else}}
No numbers {{/some}}

Input:

{ "record": { "values": ["apple", false, 42] } }

Output:

Contains a number

Tip

Use #some when you only need to know if at least one match exists, not all elements.

For arrays of objects where property matching is needed, use #filter.

The exhaustive supported list for ConditionFn is isFalsy, isTruthy, isArray, isString, isObject, isNumber, isBoolean.

Use #some to check existence of at least one match; if none match but parameters are valid, the {{else}} block renders.

### #startsWith
Renders the block if the test string begins with the specified prefix. If it doesn't match, renders the {{else}} block.

Usage

{{#startsWith prefix testString}}Block if match{{else}}Fallback{{/startsWith}}

prefix (required): the prefix to check for

testString (required): string to test against

Note

This helper produces an empty string when either the prefix or testString parameter is missing, undefined, or when the helper call is malformed.

Examples

Check if a greeting starts with "Hello"

{{#startsWith "Hello" record.greeting}}Match!{{else}}No match{{/startsWith}}
{{#startsWith "Goodbye" record.greeting}}Wrong!{{else}}Still here{{/startsWith}}

Input:

{ "record": { "greeting": "Hello, world!" } }

Output:

Match!
Still here

Check if a customer name starts with "Jane"

{{#startsWith "Jane" record.firstName}}
Welcome, Jane! {{else}}
User not Jane {{/startsWith}}

Input:

{ "record": { "firstName": "Jane Doe" } }

Output:

Welcome, Jane!

Tip

Matching is case-sensitive ("Hello" ≠ "hello").

Use when validating prefixes in IDs, codes, or user inputs.

### #unless
The #unless helper is the inverse argument of the #if block helper. The #unless block renders if the #unless expression returns a false value.

{{#unless field}} expr {{else}} expr {{/unless}}

Template

Context

Output

{{#unless contact.phone}}
Phone number missing {{else}}
Contact phone number {{contact.phone}} {{/unless}}

{
"contact": {
"phone": "310-555-1234",
"street": "streetName",
"address": "streetAddress"
}
}

Contact phone number is:
310-555-1234

{
"contact": {
"street": "streetName",
"address": "streetAddress"
}
}

Phone number missing

### #with
The #with helper demonstrates how to pass a parameter to your helper. When a parameter calls a helper, it is invoked with whatever context the template passed in. This allows access to nested objects in the context without having to repeatedly type the parent name in each expression.

Template

{{#with library}}{{title}} on "{{album}}" by {{artist}} {{/with}}

Context

{
"library": {
"album": "The Sound",
"title": "Danube Incident",
"artist": "Lalo Schifrin"
}
}

Output

Danube Incident on "The Sound" by Lalo Schifrin

The with helper passes a parameter to a helper.

{{#with field}} {{field1}} {{field2}} {{/with}}

When a parameter calls the helper, it invokes the context from the template.

Template

The author{{#with author}} {{firstName}} {{lastName}}{{/with}}

Context

{
"title": "A Tale of Two Cities",
"author": {
"firstName": "Charles",
"lastName": "Dickens"
}
}

Output

Output The author Charles Dickens

## Data variables

### first
This data variable returns true for the first element of an array or an object. When iterating through values in an array, the output always starts with 0.

Template

Context

Output

{{#each @root.child}}
{{#if @first}}
{{@key}}
{{/if}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

childTitle

{{#each array}}
{{#if @first}}
{{@key}}
{{/if}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

0

{{#each array}}
{{#if @first}}
{{@key}}
{{/if}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": ["apple","orange","pear","banana"],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

0

### index
This data variable gives you the current index in an array iteration or in a JSON iteration in the context of #each.

Template

Context

Output

{{#each @root.child}}
{{@index}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

0 1

{{#each @root.people}}
{{@index}}
{{/each}}

{
"people": [
"Bertram Gilfoyle",
"Erlich Bachman",
"Jin Yang"
]
}

0 1 2

### key
This data variable provides the current index location in an array or the key names in the context. The key is the index value of the array. When iterating through values in an array, the output always starts with 0.

Template

Context

Output

{{#each array}}
{{@key}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

0 1 2 3

{{#each array}}
{{@key}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": ["one","two","three","four"],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

0 1 2 3

{{#each @root.child}}
{{@key}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

childTitle childBody

{{#each @root}}
{{@key}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

title body array message child

### last
This data variable returns true for the last element of an array or an object. When iterating through values in an array, the output always starts with 0. In a nested loop, refer to the immediate parent with the index @../last, and so on.

Template

Context

Output

{{#each @root.child}}
{{#if @last}}
{{@key}}
{{/if}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

childBody

{{#each array}}
{{#if @last}}
{{@key}}
{{/if}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

3

{{#each array}}
{{#if @last}}
{{@key}}
{{/if}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [
"apple",
"orange",
"pear",
"banana"
],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

3

### object.length
Counts the length of a given string for use in other functions.

This example counts the length of the state field. If the length is exactly two characters, integrator.io capitalizes the output. If the length is not exactly two characters, the output is "Bad state value".

Template

{{#compare state.length "===" 2}}{{uppercase state}}{{else}}Bad state value{{/compare}}

Context

{
"state": "ill"
}

{
"state": "il"
}

Output

Bad state value

IL

This example uses length with the compare handlebar to verify a phone number field has exactly 10 digits. If not, the output is ten zeros (0000000000).

Template

{{#compare phone.length "===" 10}}{{phone}}{{else}}0000000000{{/compare}}

Context

{
"phone": "123456789"
}

Output

0000000000

### root
Reference the @root data variable to access the root element properties while you iterate in the context of any nested or child elements. The following scenarios illustrate @root with sample JSON.

Template

Context

Output

{{@root.title}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message."
}

My New Post

{{#each array}}{{@root.title}}
{{/each}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message."
}

My New Post
My New Post
My New Post
My New Post

{{@root.child.childTitle}}

{
"title": "My New Post",
"body": "This is my first post!",
"array": [1,2,3,4],
"message": "This is the message.",
"child": {
"childTitle": "Child Title",
"childBody": "Child Body"
}
}

Child Title

### this
The this keyword refers to different objects, depending on how it's invoked (used or called).

You can use the this expression in handlebars to reference the current context. Within a block helper, this refers to the element being iterated over. While iterating an object, this refers to the complete object. While iterating an array, this refers to a complete array. We have to use {{#each this}} to refer to individual elements in an array.

Template

Context

Output

[ {{#with data}} {{#each this}} {{#if @index}}, {{/if}}
{
"firstName" : {{this.name}}, {{#each this}}
"{{@key}}": "{{this}}" {{/each}}
} {{/each}} {{/with}}
]

{
"data": [
{
"name": "John",
"id": 1
},
{
"name": "Leslie",
"id": 2
}
]
}

[
{
"firstName": "John",
"Name": "John",
"id": 1
},
{
"firstName": "Leslie",
"name": "Leslie",
"id": 2
}
]

This example shows a simple dataset with two names. The first {{#each this}} references the objects in the data array. So, in this case, we're referring to each object in the array.

{
"data": [
{
"name": "John",
"id": 1
},
{
"name": "Leslie",
"id": 2
}
]
}

The second use of {{#each this}} references each element of the object. That would be the key: value pairs in each object.

{
"data": [
{
"name": "John",
"id": 1
},
{
"name": "Leslie",
"id": 2
}
]
}

The third use of {{this}} references the value of the key: value pair.

{
"data": [
{
"name": "John" ,
"id": 1
},
{
"name": "Leslie" ,
"id": 2
}
]
}

So, the final output would be

[
{
"name": "John",
"id": 1
},
{
"name": "Leslie",
"id": 2
}
]
