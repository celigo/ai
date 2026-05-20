# Format Helpers

Number formatting: thousands separators, byte sizes, and ordinal suffixes.

### addCommas
The addCommas helper formats a numeric value by adding commas to separate thousands. Use it for improving the readability of large numbers, such as counts, totals, or financial values.

Usage

{{addCommas value}}

value (required): The number to format

Examples

Format large numbers

{{addCommas record.stats.views}} {{addCommas record.stats.downloads}}

Input:

{
"record": {
"stats": {
"views": 1234567,
"downloads": 987654321
}
}
}

Output:

1,234,567 987,654,321

Display formatted totals

{{addCommas record.totalSales}}

Input:

{ "record": { "totalSales": 45200000 } }

Output:

45,200,000

Combine with text

Total views: {{addCommas record.views}}

Input:

{ "record": { "views": 1543220 } }

Output:

Total views: 1,543,220

Tip

Works with both integer and floating-point numbers.

If the value is null, undefined, or not numeric, the helper returns an empty string.

Ideal for displaying user metrics, prices, or quantities in readable format.

### bytes
Converts a number or numeric string into a human-readable byte-size string (for example, 825399 → 825.39 kB). You can also control the number of decimal places with the optional precision parameter.

Usage

{{bytes input precision}}

input (required): number or string representing a byte value

precision (optional): decimal rounding (defaults to 2)

Examples

Convert different values to formatted sizes

{{bytes record.a}}
{{bytes record.b}}
{{bytes record.c}}
{{bytes record.d}}

Input:

{
"record": {
"a": "foo",
"b": 13661855,
"c": 825399,
"d": 1396
}
}

Output:

3 B
13.66 MB
825.39 kB
1.4 kB

Using precision control

{{bytes record.b 0}}
{{bytes record.b 3}}

Input:

{ "record": { "b": 13661855 } }

Output:

14 MB
13.662 MB

Tip

If the input is not numeric (for example, "foo"), the helper returns the length of the string in bytes.

Precision can be set to 0 for whole-number output, or higher values for detailed rounding.

Use triple braces ({{{ }}}) when you need the numeric string unquoted, such as for logging or file size comparisons.

bytes uses SI (base-1000) units (kB, MB, GB, TB), not binary (1024). E.g., 1024 will give output 1.02 kB; 1048576 will give output 1.05 MB.

### ordinalize
Converts a number into its ordinal string form (e.g., 1 → 1st, 2 → 2nd, 3 → 3rd). It correctly handles special cases such as 11, 12, and 13, which use the th suffix.

Usage

{{ordinalize value}}

value (required): number or numeric string to ordinalize

Examples

Ordinalize basic numbers

{{ordinalize record.a}}
{{ordinalize record.b}}
{{ordinalize record.c}}
{{ordinalize record.d}}
{{ordinalize record.e}}

Input:

{ "record": { "a": 1, "b": 2, "c": 3, "d": 11, "e": 22 } }

Output:

1st
2nd
3rd
11th
22nd

Ordinalize values from record fields

{{ordinalize record.rank}}

Input:

{ "record": { "rank": 4 } }

Output:

4th

Tip

Works with both numbers and numeric strings (e.g., "5" → 5th).

Will not work with negatives, floats, or text strings.

The helper ensures correct suffixes (st, nd, rd, th) even for tricky numbers like 11, 12, and 13.

Useful for displaying ranks, steps, or ordered positions in a user-friendly format.
