---
name: configuring-filters
description: Configure Celigo filter rules on exports, imports, and flow branches that control which records continue through the pipeline. Use when adding filters, setting branch routing conditions, or choosing between expression and script filters.
---

<!-- TIER:1 -->

# Configuring Filters

A filter is a **record gate** that decides which records continue through the pipeline and which are silently dropped. Filters are configured directly on exports, imports, and flow router branches -- not as standalone resources.

Concerns when configuring a filter:

- **Placement** -- where in the pipeline the filter runs (output filter on export, input filter on lookup, pre-import filter, branch routing condition)
- **Mechanism** -- expression-based rules (declarative, no code) vs. script-based (full JavaScript control)
- **Expression syntax** -- prefix-notation S-expressions with operators, field access (`extract`), type coercions, and logical combinators (`and`/`or`/`not`)
- **Settings references** -- dynamic filter values pulled from flow, export, import, or integration settings via `settings` accessor
- **Script alternative** -- when expression rules cannot handle the logic (multi-step conditionals, date math, external lookups), use a filter script instead

## Four Places Filters Appear

### Output filter (export `filter`)

Applied after records are retrieved from the source system. Records that match continue through the flow; records that do not match are silently dropped. Available on all export types.

### Input filter (lookup export `inputFilter`)

Applied to incoming records before they trigger a lookup API call. Records that do not match skip the lookup step entirely -- they pass through without enrichment. This reduces unnecessary API calls. Only relevant when `isLookup: true`.

### Import filter (import `filter`)

Applied to records before they are sent to the destination system. Records that do not match are dropped and never submitted to the destination. Useful for conditional writes (e.g., only import records with a non-empty email).

### Branch input filter (router branch `inputFilter`)

Applied per-branch in a flow router to route records to different processing paths. Each branch has its own filter expression. The last branch can omit a filter to serve as a catch-all. Configured on the flow's `routers[].branches[]` entries, not on exports or imports.

## Quick Reference

### Filter Type Decision Matrix

| Situation | Use | Configured on |
|---|---|---|
| Skip records from the source based on field values | Output filter (`filter`) | Export resource |
| Skip lookup calls for records missing required fields | Input filter (`inputFilter`) | Export resource (`isLookup: true`) |
| Skip import for records that should not be written | Import filter (`filter`) | Import resource |
| Route records to different branches by field values | Branch filter (`inputFilter`) | Flow `routers[].branches[]` |
| Complex multi-step logic, date math, external calls | Script filter | Export or import `filter.type: "script"` |

### Expression vs. Script

| Mechanism | When to use | Config |
|---|---|---|
| Expression (`type: "expression"`) | Standard field comparisons, pattern matching, empty checks, combining with and/or | `filter.expression.rules` array |
| Script (`type: "script"`) | Complex business logic, cross-record state, date calculations, external API calls | `filter.script._scriptId` + `filter.script.function` |

Prefer expressions -- they are simpler, faster, and do not require a separate script resource. Use scripts only when expression operators cannot handle the logic.

### Operator Quick Reference

| Operator | Meaning | Operands |
|---|---|---|
| `equals` | Exact match | field, value |
| `notequals` | Not equal | field, value |
| `greaterthan` | Greater than | field, value |
| `greaterthanequals` | Greater than or equal | field, value |
| `lessthan` | Less than | field, value |
| `lessthanequals` | Less than or equal | field, value |
| `contains` | Substring match | field, substring |
| `doesnotcontain` | No substring match | field, substring |
| `startswith` | Prefix match | field, prefix |
| `endswith` | Suffix match | field, suffix |
| `matches` | Pattern match | field, pattern |
| `notempty` | Field has a value | field |
| `empty` | Field is null/empty | field |
| `and` | All conditions true | condition, condition, ... |
| `or` | Any condition true | condition, condition, ... |
| `not` | Negate condition | condition |

Field access: `["extract", "fieldName"]` for record fields, `["settings", "flow.settingName"]` for configuration values.

Type coercions: `["number", ...]`, `["string", ...]`, `["boolean", ...]`, `["epochtime", ...]`.

Transformations: `["lowercase", ...]`, `["uppercase", ...]`, `["floor", ...]`, `["ceiling", ...]`, `["abs", ...]`.

### Schema Index

| Schema | Contents |
|---|---|
| [filter.yml](references/schemas/filter.yml) | Filter object -- type, expression (version, rules), script (_scriptId, function), all operators and examples |

## Related Skills

- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- export configuration where output filter and input filter are wired
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- import configuration where import filter is wired
- [writing-scripts > Record-Level Processors](../writing-scripts/SKILL.md#record-level-processors-on-export-or-import) -- script-based filter hook signature and data shapes
- [building-flows > Flow Topologies](../building-flows/SKILL.md#flow-topologies) -- branching routers with per-branch input filters
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- Handlebars in dynamic filter values

<!-- TIER:2 -->

## How to Configure a Filter

### 1. Determine filter placement

Where in the pipeline should filtering happen?

- **After export retrieval** -- use an output filter on the export (`filter`)
- **Before a lookup call** -- use an input filter on the lookup export (`inputFilter`)
- **Before import submission** -- use a filter on the import (`filter`)
- **For branch routing** -- use branch input filters on the flow router

### 2. Choose expression vs. script

Can the logic be expressed as field comparisons combined with and/or? Use an expression. Need loops, date math, cross-field calculations, or external API calls? Use a script.

### 3. Build the expression rules

Expression rules use prefix (S-expression) notation. Every rule is an array where the first element is the operator and remaining elements are operands.

**Pattern: Single condition**
```
[operator, [extract, fieldName], value]
```

**Pattern: Multiple conditions (all must match)**
```
[and, [condition1], [condition2], ...]
```

**Pattern: Multiple conditions (any must match)**
```
[or, [condition1], [condition2], ...]
```

**Pattern: Field access with type coercion**
```
[operator, [number, [extract, fieldName]], numericValue]
```

**Pattern: Dynamic value from settings**
```
[equals, [string, [extract, fieldName]], [string, [settings, flow.settingName]]]
```

### 4. Set the filter on the resource

Use the CLI `set` command to add or update a filter on an existing export or import. The `set` command does GET-modify-PUT automatically.

```bash
# Set an expression filter on an export (output filter)
celigo exports set <id> filter.type=expression filter.expression.version=1 filter.expression.rules='["notempty",["extract","email"]]'

# Set an expression filter on an import
celigo imports set <id> filter.type=expression filter.expression.version=1 filter.expression.rules='["notequals",["extract","status"],"cancelled"]'
```

For complex expressions, use JSON input:

```bash
# Create or update the full export with filter included
celigo exports update <id> < export-with-filter.json
```

### 5. Wire a script filter (when expressions are insufficient)

Create the script resource first, then reference it:

```bash
# Create the filter script
celigo scripts create < filter-script.json

# Wire it to the export
celigo exports set <id> filter.type=script filter.script._scriptId=<scriptId> filter.script.function=filterRecords
```

The script function receives `options.record` and must return `true` (process) or `false` (skip). See [writing-scripts > Record-Level Processors](../writing-scripts/SKILL.md#record-level-processors-on-export-or-import) for the full function signature.

### 6. Test the filter

```bash
# Invoke the export to see which records pass through
celigo exports invoke <id>

# Run the flow and check record counts
celigo flows run <flowId> -y
celigo jobs latest-flow <flowId>
```

Check `numSuccess`, `numIgnore`, and `numError` on the job. Records dropped by a filter show up in `numIgnore`, not `numError`.

## CLI Commands

Filters are configured on exports and imports, not as standalone resources. Use export and import CRUD commands.

```bash
# Read current filter config
celigo exports get <id>
celigo imports get <id>

# Set filter via key=value (GET-modify-PUT)
celigo exports set <id> filter.type=expression filter.expression.version=1 filter.expression.rules='[...]'
celigo imports set <id> filter.type=expression filter.expression.version=1 filter.expression.rules='[...]'

# Set input filter on a lookup export
celigo exports set <id> inputFilter.type=expression inputFilter.expression.version=1 inputFilter.expression.rules='[...]'

# Full JSON update (for complex filters)
celigo exports update <id> < export.json
celigo imports update <id> < import.json

# Remove a filter (set to empty)
celigo exports set <id> filter=null
celigo imports set <id> filter=null

# Test
celigo exports invoke <id>
celigo flows run <flowId> -y
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a filter, verify:

- [ ] **`filter.type` matches the config block** -- `"expression"` requires `filter.expression`, `"script"` requires `filter.script`
- [ ] **`expression.version` is `"1"`** -- the only supported version
- [ ] **Operator names are lowercase** -- `"notempty"`, not `"isNotEmpty"` or `"NOTEMPTY"`
- [ ] **`extract` references valid field names** -- field names must match the actual record structure; use dot notation for nested fields (e.g., `"customer.email"`)
- [ ] **Type coercions are applied where needed** -- comparing a string field to a number requires `["number", ["extract", "field"]]`
- [ ] **Script filter returns strict boolean** -- `true` or `false`, not truthy/falsy values
- [ ] **Input filter is on a lookup export** -- `inputFilter` only applies when `isLookup: true`

## Gotchas

1. **Operators are `notempty`/`empty`, not `isnotempty`/`isempty`.** The spec documents both forms but the platform uses the shorter names. Using `isnotempty` or `isempty` will silently fail to match.
2. **Filtered records are silently dropped, not errored.** There is no error log entry for filtered records. They appear as `numIgnore` in job stats, which makes debugging "missing records" problems harder. Check the filter first when records disappear without errors.
3. **Import filter drops records before submission.** Records filtered out on an import never reach the destination -- they are not sent, not rejected. This differs from a server-side rejection which would appear in errors.
4. **Input filter skips the step, not the record.** On a lookup export, a filtered record skips the lookup but continues through subsequent flow steps. It is not removed from the pipeline.
5. **Branch filters use the same expression syntax but live on the flow.** Branch `inputFilter` is configured on `routers[].branches[]` in the flow, not on the export or import. Use `celigo flows set` or `celigo flows update` to modify them.
6. **Expression and script filters cannot coexist.** Setting `filter.type` to `"script"` ignores any `expression` config, and vice versa. Switching types does not auto-clear the other config block.
7. **PUT erases omitted fields.** Always GET the export/import first, modify the filter, then PUT the complete object. The `set` command handles this automatically.
8. **`settings` accessor requires scoped prefix.** Use `flow.settingName`, `export.settingName`, `import.settingName`, or `integration.settingName` -- not bare `settingName`.
9. **String comparison is case-sensitive by default.** Use `["lowercase", ["string", ["extract", "field"]]]` before comparison to make it case-insensitive. The `matches` operator also does case-sensitive matching.

## Common Errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| Records silently disappear, no errors | Filter is dropping them; check `numIgnore` in job stats | Review the filter expression; temporarily remove it to confirm |
| Filter passes all records (no filtering) | Wrong field name in `extract`, or type mismatch (comparing string to number without coercion) | Verify field name matches record structure; add type coercion |
| Filter blocks all records | Logic inverted (e.g., `equals` instead of `notequals`), or field is always empty/null | Test with a known record; check if the field exists in the data |
| "Function not found" on script filter | `function` name in `filter.script.function` does not match an exported function in the script | Verify exact function name (case-sensitive) in the script resource |
| Script filter returns inconsistent results | Function returns truthy/falsy instead of strict `true`/`false` | Return explicit `true` or `false` |
| `inputFilter` has no effect | Export is not a lookup (`isLookup` is not `true`) | Set `isLookup: true` on the export, or move the filter to `filter` instead |
