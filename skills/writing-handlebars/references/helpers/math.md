# Math Helpers

Numeric operations: absolute value, arithmetic, rounding, precision, and random numbers.

### abs
Use {{abs}} to return the absolute value of a number. You can pass in a numeric field from the record or a hard-coded number.

Usage

{{abs number}}

number: A numeric value or a field that resolves to a number (e.g., -123, "120.5", or record.amountDue).

Examples

Handling a negative order total

{{abs record.total}}

If record.total is -45.67, this outputs 45.67.

Explicit numeric value

{{abs "-123"}}

Returns 123.

Using an amount due field

{{abs record.amountDue}}

If record.amountDue is "100", the output remains 100.

Tip

Ensure the field you pass in is numeric (or can be parsed as numeric). Non-numeric values may result in unexpected behavior.

The returned value preserves decimals if the input is a floating-point number.

### add
Use {{add}} to sum any number of numeric values—integers, floats, or decimals. You can pass in numeric fields from the record or hard-coded values.

Usage

{{add number1 number2 ...}}

number1, number2, ...: Any valid numeric inputs (fields or literals).

Examples

Summing order item quantities

{{add record.items.[0].quantity record.items.[1].quantity}}

If the first item has a quantity of 2 and the second item has a quantity of 1, it returns 3.

Adding hard-coded numbers

{{add "2" "5"}}

Returns 7.

Combining multiple fields

{{add record.tax record.shipping record.discount}}

If record.tax is 5.25, record.shipping is 10, and record.discount is -2, this returns 13.25.

Tip

You can pass as many arguments as needed.

Ensure each argument is numeric (or can be parsed as numeric); otherwise, the helper may produce unexpected results.

Negative values are handled naturally, allowing you to sum discounts or other adjustments.

### avg
Use {{avg}} to compute the average of all provided numeric values—integers, floats, or decimals. You can pass in numeric fields from the record or hard-coded values.

Usage

{{avg number1 number2 ...}}

number1, number2, ...: One or more numeric inputs (fields or literals) to be averaged.

Examples

Averaging field values

{{avg record.itemPrice record.shipping}}

If record.itemPrice is 25 and record.shipping is 5, the output is 15.

Combining multiple hard-coded numbers

{{avg "2" "5" "2"}}

The sum is 9, divided by 3 inputs equals 3.

Mixing fields and literals

{{avg record.item1Quantity "12" record.item2Quantity}}

If record.item1Quantity is 6 and record.item2Quantity is 18, the output is (6 + 12 + 18) / 3 = 12.

Tip

Pass any number of arguments; the helper automatically sums and divides them.

Each argument must be numeric (or parseable as numeric) for accurate results.

The average is returned as a floating-point number if any inputs are floats or decimals.

### ceil
Use {{ceil}} to round a numeric value up to the nearest whole integer (i.e., always rounding to the next higher integer if decimals are present).

Usage

{{ceil field}}

field: A numeric or string-parsable numeric value (e.g., 45.75, "45.75", or record.subTotal).

Examples

Rounding a record field

{{ceil record.total}}

If record.total is 45.75, this outputs 46.

Handling decimal shipping cost

{{ceil record.shipping}}

If record.shipping is 62.02, the result is 63.

Hard-coded numeric strings

{{ceil "45.02"}}

Returns 46.

Tip

Negative values are rounded "up" toward zero. For example, {{ceil -2.8}} yields -2.

If the value is already an integer (e.g., 45), the helper simply returns it unchanged.

Ensure the field can be interpreted as numeric; otherwise, results may be invalid.

### divide
Use {{divide}} to calculate the quotient of two numeric values—either from your record fields or from hard-coded values.

Usage

{{divide number1 number2}}

number1: A numeric field or string literal representing the dividend.

number2: A numeric field or string literal representing the divisor.

Examples

Dividing two record fields

{{divide record.item1 record.item2}}

If record.item1 is "33" and record.item2 is "11", this returns 3.

Using hard-coded numbers

{{divide "2002" "100"}}

Outputs 20.02.

Combining a record field with a hard-coded value

{{divide record.total 3}}

If record.total is 33, this yields 11.

Tip

The result is a floating-point value when division is not even (e.g., 10 / 3 = 3.3333).

Dividing by zero (or a zero-like value) can cause errors or unexpected behavior.

Confirm your inputs are numeric or can be parsed as numeric.

### floor
Use {{floor}} to round a numeric value down to the nearest whole integer. This helper finds the largest integer less than or equal to the given number.

Usage

{{floor field}}

field: A numeric or string-parsable numeric value (e.g., 3.14, "45.25", record.total).

Examples

Hard-coded number

{{floor 22.44}}

Outputs 22.

Record field

{{floor record.total}}

If record.total is 45.25, the result is 45.

String literal

{{floor "3.14"}}

Returns 3.

Tip

Negative values go "down" away from zero (e.g., -2.8 becomes -3).

Confirm the input is numeric (or convertible to a number). Non-numeric strings could produce unexpected results.

Use {{ceil}} if you need the opposite behavior (rounding up).

### modulo
The modulo helper returns the remainder when dividing the first number (a) by the second (b). This is useful for performing arithmetic operations or creating repeating patterns in templates.

Usage

{{modulo a b}}

a (required): The dividend (number to divide)

b (required): The divisor (number to divide by)

Examples

Basic remainder calculation

{{modulo record.a record.b}}

Input:

{
"record": {
"a": 7,
"b": 3
}
}

Output:

1

Determine even or odd values

{{#if (eq (modulo record.value 2) 0)}}
Even {{else}}
Odd {{/if}}

Input:

{ "record": { "value": 9 } }

Output:

Odd

Use in a loop to create row groups

{{#each record.items}}
{{#if (eq (modulo @index 3) 0)}}<hr>{{/if}}
{{this}}
{{/each}}

Input:

{
"record": {
"items": ["A", "B", "C", "D", "E", "F"]
}
}

Output:

A
B
C
<hr>
D
E
F

Tips

Tip

The helper performs arithmetic using JavaScript's % operator.

Works best for grouping, alternating layouts, or computing sequence offsets.

### multiply
Use multiply to return the product of two values. Each value can be a numeric field from the record or a string that can be parsed as a number. This is helpful for tasks such as computing extended prices (quantity * unitPrice), applying percentage-based discounts, or adjusting invoice totals.

Usage

{{multiply value1 value2}}

value1 and value2 can be numbers or numeric strings (e.g., "5", "10.75").

The output is a numeric result of the multiplication.

Examples

Applying a discount

{{multiply record.total "0.9"}}

If record.total is 100, the output is 90 (a 10% discount).

Calculating extended price

{{multiply record.quantity record.unitPrice}}

If record.quantity is "3" and record.unitPrice is 19.99, the output is 59.97.

Combining hard-coded and dynamic values

{{multiply "5" record.items.length}}

If record.items.length is 4, the output is 20.

Tips

Tip

Make sure each value you pass in can be interpreted as a valid number. Non-numeric strings (like "abc") result in NaN.

Using double braces ({{ }}) vs. triple braces ({{{ }}}) for the output typically has minimal effect here, since the result is a numeric value.

When dealing with currency or decimals, confirm you pass properly formatted numeric strings (e.g., "9.99"). Otherwise, rounding errors can occur.

### random
Use the random helper to generate random strings or numeric sequences. The first argument specifies the generation method—"crypto," "uuid," or "number"—while the second (optional) argument specifies the output length. If no length is provided, the default is 32 characters.

Usage

{{random "crypto" length}} {{random "uuid" length}} {{random "number" length}}

"crypto" returns a random alphanumeric string of the specified length, using a cryptographic approach.

"uuid" returns a shorter alphanumeric string resembling a UUID fragment (though not a standard RFC-4122 UUID).

"number" returns a numeric string of the specified length (e.g., "123456...").

length is an integer controlling how many characters (or digits) to generate. The default is 32 if omitted.

Examples

Generate a short 'crypto' string

{{random "crypto" 8}}

Might produce something like 9b72abf5.

Generate a short 'uuid' string

{{random "uuid" 5}}

Could return a 5-character token like 47c1a.

Generate a numeric string

{{random "number" 9}}

Might yield 738495210.

Tip

Use "crypto" when you need an alphanumeric string with higher randomness (e.g., quick tokens or IDs).

"uuid" returns a shorter alphanumeric sequence intended for unique but less structured identifiers.

"number" is ideal if you specifically need numeric-only identifiers.

If you omit the length argument, a 32-character (or digit) result is returned by default.

### round
Use the round helper to convert a numeric value (including a string representation of a number) to the nearest whole integer. This is commonly used for rounding tax, totals, or any decimal-based fields in a record.

Usage

{{round field}}

field: The field or variable containing a decimal or numeric-like string (e.g., record.vat).

Examples

Rounding a tax amount

If record.vat is "29.77", then:

{{round record.vat}}

results in 30.

Rounding down

If record.discount is 19.4, {{round record.discount}} yields 19.

Using triple braces (though generally not needed for numbers)

{{{round record.fee}}}

Returns the raw rounded value without any automatic string formatting (e.g., quotes).

Tip

If the field is already an integer (e.g., 42), round returns the same value.

Ensure the field contains a valid numeric string; otherwise, round may produce unexpected results or an error.

Consider other numeric helpers (if available) if you need more precise decimal handling or control over rounding (e.g., to a specified number of decimal places).

### subtract
Use the subtract helper to calculate the difference between two numbers (or numeric strings). You can pass numeric literals or fields from the Celigo context. If you provide string values (e.g., "6") instead of unquoted integers, ensure they represent valid numbers.

Usage

{{subtract minuend subtrahend}}

minuend: The first number or numeric field (e.g., 6 or record.total).

subtrahend: The second number or numeric field to subtract from the first.

Examples

Subtracting literal values

{{subtract 6 3}} → 3 {{subtract "6" "3"}} → 3

Subtracting values from the record

Given:

{ "record": { "ponies": "22", "unicorns": "11", "horses": 33 } }

{{subtract ponies unicorns}} → 11 (22 - 11) {{subtract horses 6}} → 27 (33 - 6)

Triple braces for raw numeric output

{{{subtract 10 4}}}

Returns 6 without any automatic string formatting—identical in most numeric scenarios, but triple braces can be used if you need unformatted output.

Tip

If you're passing numeric fields or integers, do not use quotes.

If you're passing values as strings (e.g., "6"), verify they are valid numbers to avoid NaN or unexpected results.

The result is numeric, so double vs. triple braces typically won't change the value, but triple braces return it without any possible formatting or quoting.

### sum
Use the sum helper to add multiple numeric values or all elements of an array. It accepts either an array from a field (e.g., record.items) or one or more individual numeric fields/values. This can handle integers, floats, and numeric strings.

Usage

{{sum field1 field2 field3}}

fieldX: One or more fields or variables containing numeric data. If a single argument is an array, sum processes each element. If multiple arguments are passed, sum adds them all together.

Examples

Summing an array of numbers

If record.items is [2, 5, 7, 8, 9]:

{{sum record.items}}

produces 31.

Summing a larger set of array elements

If record.items is:

[ 50, 10, 10, 10, 5, 5, 60, 10, 10, 10, 5, 5, 50, 10, 10, 10, 10 ]

then {{sum record.items}} returns 290.

Adding numeric fields together

{{sum record.tax record.shipping record.discount}}

This calculates the sum of three numeric fields within record.

Using expressions for intermediate calculations

{{sum (multiply 2 55)}}

Here, the helper sums the result of (multiply 2 55), which is 110.

Tip

If you pass multiple arguments (e.g., {{sum 5 10 20}}), sum adds all of them and returns the total.

When passing a single array, ensure all elements are valid numbers; otherwise, the helper might skip or misinterpret them.

Triple braces ({{{ }}}) generally aren't necessary unless you require the exact numeric output without any automatic formatting.

### toExponential
Use the toExponential helper to convert a numeric value (or a numeric string) into exponential (scientific) notation. You may optionally specify how many digits you want to show after the decimal point.

Usage

{{toExponential field fractionDigits}}

field: The numeric field or value to format (e.g., record.total or "12345").

fractionDigits (optional): How many digits to display after the decimal point.

Examples

Formatting a record field

{{toExponential record.orderId 2}}

If record.orderId is "12345", the output is "1.23e4".

Specifying a literal

{{toExponential "3.14159265359" 6}}

Produces "3.141593e+0", showing six digits after the decimal point.

Using triple braces for raw output

{{{toExponential "12345" 2}}}

Returns the unquoted exponential string, e.g., 1.23e4.

Tip

Make sure the input is a valid number (or numeric string). Otherwise, the result may be NaN.

The fractionDigits parameter is optional; if omitted, it defaults to however many digits JavaScript typically provides.

Consider whether you need raw or automatically formatted output. Triple braces ({{{ }}}) return the result without extra formatting.

### toFixed
Use the toFixed helper to format a numeric value (or numeric string) to a fixed number of decimal places. It returns a string representing the rounded result.

Usage

{{toFixed field digits}}

field: A numeric field or literal (e.g., record.total or 123.456789).

digits: The number of decimal places to display (0 or greater).

Examples

Formatting a record field

If record.tax is 29.7777, then:

{{toFixed record.tax 2}}

outputs "29.78".

Literal value with different decimal places

{{toFixed 123.456789 4}} → "123.4568" {{toFixed 123.456789 0}} → "123"

Using triple braces for raw output

{{{toFixed record.discount 2}}}

Returns the string without any automatic formatting or quotes (e.g., 19.50).

Tip

If your input is not numeric or a numeric string, toFixed may produce NaN.

Values are rounded to the specified number of decimal places.

Consider whether you want raw output ({{{ }}}) or the platform's default string formatting ({{ }}).

### toPrecision
Use the toPrecision helper to format a number (or numeric string) so that it has a specified number of significant digits. If the number of integer digits exceeds the precision, the output switches to scientific notation automatically.

Usage

{{toPrecision field precision}}

field: The numeric field or value to format.

precision: The desired number of significant digits.

Examples

Switching between regular and scientific notation

{{toPrecision 123.00 2}} → "1.2e+2" {{toPrecision 123.00 3}} → "123"

When the integer part fits within the specified precision, the helper produces a standard decimal notation; otherwise, it uses exponential notation.

Handling larger numbers

{{toPrecision 123456 5}} → "1.2346e+5" {{toPrecision 1234567.00 6}} → "123456"

Using a record field and triple braces

{{{toPrecision record.total 4}}}

Returns the formatted result without Celigo's automatic string wrapping, e.g., 9.876e+3 or 9876 depending on the value.

Tip

Ensure your input is numeric or a valid numeric string to avoid NaN.

Setting precision too low (e.g., 0 or 1) will quickly push even moderate numbers into exponential notation.

Use triple braces ({{{ }}}) if you need the exact raw output without additional formatting.
