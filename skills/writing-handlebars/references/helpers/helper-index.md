# Helper Index

Quick-reference table for all Celigo Handlebars helpers. Find the helper you need, then follow the category link for full documentation with usage, examples, and tips.

| Helper | Category | Description |
|--------|----------|-------------|
| `abs` | [math](math.md) | Absolute value of a number |
| `add` | [math](math.md) | Sum any number of values |
| `addCommas` | [format](format.md) | Format number with thousands separators |
| `after` | [array](array.md) | Return array excluding first N elements |
| `arrayify` | [array](array.md) | Cast any value to an array |
| `avg` | [math](math.md) | Average of all provided values |
| `aws4` | [auth](auth.md) | AWS Signature Version 4 for API auth |
| `base64Decode` | [encoding](encoding.md) | Decode base64 string to specified format |
| `base64Encode` | [encoding](encoding.md) | Encode string to base64 |
| `before` | [array](array.md) | Return array excluding last N elements |
| `bytes` | [format](format.md) | Convert number to human-readable byte size |
| `camelcase` | [string](string.md) | Convert string to camelCase |
| `capitalize` | [string](string.md) | Capitalize first letter of first word |
| `capitalizeAll` | [string](string.md) | Capitalize first letter of every word |
| `ceil` | [math](math.md) | Round up to nearest integer |
| `chop` | [string](string.md) | Remove leading/trailing whitespace and special chars |
| `dashcase` | [string](string.md) | Convert string to dash-case |
| `dateAdd` | [date](date.md) | Add/subtract milliseconds from a date |
| `dateFormat` | [date](date.md) | Format date with moment.js tokens |
| `decodeURI` | [encoding](encoding.md) | Decode URI-encoded string |
| `divide` | [math](math.md) | Divide first value by second |
| `dotcase` | [string](string.md) | Convert string to dot.case |
| `encodeURI` | [encoding](encoding.md) | URI-encode a string |
| `eq` | [type-logic](type-logic.md) | Strict equality check |
| `floor` | [math](math.md) | Round down to nearest integer |
| `getValue` | [array](array.md) | Get value from array/object by key |
| `hash` | [auth](auth.md) | Generate hash digest (SHA-256, etc.) |
| `hasNoItems` | [type-logic](type-logic.md) | Check if array/object is empty |
| `hasOwn` | [type-logic](type-logic.md) | Check if object has own property |
| `hmac` | [auth](auth.md) | Generate HMAC digest for auth |
| `htmlDecode` | [encoding](encoding.md) | Decode HTML entities to characters |
| `htmlEncode` | [encoding](encoding.md) | Encode characters to HTML entities |
| `isFalsey` | [type-logic](type-logic.md) | Check if value is falsy |
| `isTruthy` | [type-logic](type-logic.md) | Check if value is truthy |
| `join` | [string](string.md) | Join array elements with separator |
| `jsonEncode` | [encoding](encoding.md) | JSON-encode a single value (adds quotes/escaping) |
| `jsonParse` | [encoding](encoding.md) | Parse JSON string to object |
| `jsonSerialize` | [encoding](encoding.md) | Serialize object to JSON string (alias: `jsonStringify`) |
| `lookup` | [array](array.md) | Find object in array by property value |
| `lowercase` | [string](string.md) | Convert string to lowercase |
| `modulo` | [math](math.md) | Remainder of division |
| `multiply` | [math](math.md) | Multiply values together |
| `occurrences` | [string](string.md) | Count occurrences of substring |
| `ordinalize` | [format](format.md) | Add ordinal suffix (1st, 2nd, 3rd) |
| `padLeft` | [string](string.md) | Pad string on the left to target length |
| `padRight` | [string](string.md) | Pad string on the right to target length |
| `pascalcase` | [string](string.md) | Convert string to PascalCase |
| `pathcase` | [string](string.md) | Convert string to path/case |
| `pluck` | [array](array.md) | Extract property from each object in array |
| `random` | [math](math.md) | Generate random integer in range |
| `regexMatch` | [regex](regex.md) | Return text matching a regex pattern |
| `regexReplace` | [regex](regex.md) | Replace text matching a regex pattern |
| `regexSearch` | [regex](regex.md) | Return position of first regex match |
| `removefirst` | [string](string.md) | Remove first occurrence of substring |
| `replace` | [string](string.md) | Replace all occurrences of substring |
| `replacefirst` | [string](string.md) | Replace first occurrence of substring |
| `reverse` | [string](string.md) | Reverse a string or array |
| `round` | [math](math.md) | Round to nearest integer |
| `sanitize` | [string](string.md) | Strip HTML tags from string |
| `sentence` | [string](string.md) | Convert string to Sentence case |
| `snakecase` | [string](string.md) | Convert string to snake_case |
| `sort` | [array](array.md) | Sort array elements |
| `split` | [string](string.md) | Split string into array by delimiter |
| `stripProtocol` | [encoding](encoding.md) | Remove protocol (http/https) from URL |
| `stripQuerystring` | [encoding](encoding.md) | Remove query string from URL |
| `substring` | [string](string.md) | Extract portion of string by index |
| `subtract` | [math](math.md) | Subtract second value from first |
| `sum` | [math](math.md) | Sum all values in an array |
| `timestamp` | [date](date.md) | Current timestamp in specified format |
| `toExponential` | [math](math.md) | Format number in exponential notation |
| `toFixed` | [math](math.md) | Format number with fixed decimal places |
| `toPrecision` | [math](math.md) | Format number to specified precision |
| `trim` | [string](string.md) | Remove leading/trailing whitespace |
| `trimLeft` | [string](string.md) | Remove leading whitespace |
| `trimRight` | [string](string.md) | Remove trailing whitespace |
| `truncateWords` | [string](string.md) | Truncate string to N words |
| `typeOf` | [type-logic](type-logic.md) | Return type name of value |
| `unique` | [array](array.md) | Remove duplicate values from array |
| `uppercase` | [string](string.md) | Convert string to UPPERCASE |

## Block Helpers

| Helper | Description |
|--------|-------------|
| `#and` | Render block if both parameters are truthy |
| `#compare` | Compare two values with logical operator (`==`, `>`, `<`, etc.) |
| `#contains` | Check if value exists in array or string |
| `#each` | Iterate over array or object |
| `#filter` | Filter array elements by property value |
| `#if...else` | Conditional rendering |
| `#ifEven` | Render block if value is even |
| `#inArray` | Check if value exists in simple array |
| `#isEmpty` | Render block if collection is empty |
| `#neither` | Render block if both parameters are falsy |
| `#not` | Invert truthiness |
| `#or` | Render block if either parameter is truthy |
| `#some` | Check if any array element satisfies condition |
| `#startsWith` | Check if string starts with prefix |
| `#unless` | Inverse of `#if` |
| `#with` | Change context scope |

See [block-helpers.md](block-helpers.md) for full documentation, examples, and data variables (`@first`, `@last`, `@index`, `@key`, `@root`, `this`).

## Additional Reference

- [syntax-and-recipes.md](syntax-and-recipes.md) — Brace rules, escaping, whitespace, comments, and common integration patterns
