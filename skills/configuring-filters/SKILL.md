---
name: configuring-filters
description: Configure Celigo filter rules on exports, imports, and flow branches that control which records continue through the pipeline. Use when adding filters, setting branch routing conditions, or choosing between expression and script filters.
---

<!-- TIER:1 -->

# Configuring Filters

A filter is a **record gate** that decides which records pass a point in the pipeline. What happens to the rest depends on where it sits: an export's filter silently drops them from the flow, while a lookup's or an import's filter only skips that step for them. Filters are configured directly on exports, imports, and flow router branches -- not as standalone resources.

Concerns when configuring a filter:

- **Placement** -- where in the pipeline the filter runs (output filter on export, input filter on lookup, pre-import filter, branch routing condition)
- **Mechanism** -- expression-based rules (declarative, no code) vs. script-based (full JavaScript control)
- **Expression syntax** -- prefix-notation S-expressions with operators, field access (`extract`), type coercions, and logical combinators (`and`/`or`/`not`)
- **Settings references** -- dynamic filter values pulled from flow, export, import, or integration settings via `settings` accessor
- **Script alternative** -- when expression rules cannot handle the logic (loops, multi-step conditionals, external lookups), use a filter script instead. Dates relative to now and arithmetic across fields don't need one ([Dates and Computed Values](#dates-and-computed-values))

## Four Places Filters Appear

### Output filter (export `filter`)

Applied after records are retrieved from the source system. Records that match continue through the flow; records that do not match are silently dropped. Available on all export types.

### Input filter (lookup export `inputFilter`)

Applied to incoming records before they trigger a lookup API call. Records that do not match skip the lookup step entirely -- they pass through without enrichment. This reduces unnecessary API calls. Only relevant when `isLookup: true`.

### Import filter (import `filter`)

Decides whether the import runs for a record. A record that doesn't match skips this import -- nothing is sent to the destination for it -- and continues to the next step with nothing from this import's response mapping, so a later step that should only see written records needs its own filter. Useful for conditional writes (e.g., only import records with a non-empty email). AI agent and guardrail steps are imports, and their `filter` works the same way.

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
| Loops, multi-step logic, external calls | Script filter | Export or import `filter.type: "script"` |

### Expression vs. Script

| Mechanism | When to use | Config |
|---|---|---|
| Expression (`type: "expression"`) | Field comparisons, regular expressions, empty checks, dates relative to now, arithmetic, combining with and/or | `filter.expression.rules` array |
| Script (`type: "script"`) | Complex business logic, cross-record state, values `epochtime` can't read, external API calls | `filter.script._scriptId` + `filter.script.function` |

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
| `matches` | Regular expression match | field, regular expression |
| `notempty` | Field has a value | field |
| `empty` | Field is null/empty | field |
| `and` | All conditions true | condition, condition, ... |
| `or` | Any condition true | condition, condition, ... |
| `not` | Negate condition | condition |

To test that a field has a value, use `notempty`, not a pattern: a record without the field passes `["matches", ["string", ["extract", "email"]], ".*\\S.*"]`.

Field access: `["extract", "fieldName"]` for record fields, `["settings", "flow.settingName"]` for configuration values. Paths are relative to the record itself (`customer.email` for a nested field): `["extract", "record.status"]` matches nothing. Only a Handlebars operand takes the `record.` prefix.

Type coercions: `["number", ...]`, `["string", ...]`, `["boolean", ...]`, `["epochtime", ...]` -- the only four; `datetime`, `date` and `timestamp` are refused with 422 `Invalid operation: <name>.` Every `extract` must sit inside one: a bare `["extract", ...]` is refused with 422 "Field operation extract must be called by a Type Conversion Operation", both when the filter is saved and by the filter processor (`celigo processors invoke filter`). A bare `settings` is refused the same way.

The value compared with a coercion must have its type: `number` with an unquoted number (`50`), `string` with a quoted string, `boolean` with `true` or `false`. A mismatch such as `["number", ...]` against `"50"` is refused with 422 "Argument #2 for operation greaterthanequals is a different data type: string.", on save and in the filter processor. A quoted number is a string, though, so `["string", ...]` against `"50"` saves and compares as text: `"120.00"` sorts before `"50"`, and the rule drops 120 and 1250 while passing 75. Compare amounts as `["number", ["extract", "total_price"]]` against `50`, even when the field arrives as a string.

`number` reads a missing or empty field as 0, so `["lessthan", ["number", ["extract", "total"]], 100]` passes records that have no total. Add `["notempty", ["string", ["extract", "total"]]]` beside it with `and` when that matters.

Transformations: `["lowercase", ...]`, `["uppercase", ...]`, `["floor", ...]`, `["ceiling", ...]`, `["abs", ...]`. Arithmetic on number operands: `["add", a, b]`, `["subtract", a, b]`, `["multiply", a, b]`, `["divide", a, b]`, `["modulo", a, b]`.

### Dates and Computed Values

Compare a date as `["epochtime", ["extract", "<field>"]]` against epoch milliseconds, written as a number. `epochtime` reads ISO 8601 strings and epoch-millisecond numbers; a `string` comparison of timestamps orders values with different UTC offsets wrongly.

`epochtime` fails on a value it can't read -- an empty string, text that isn't a date, or epoch milliseconds sent as a string -- with `Invalid date. Cannot convert given string or number to date time.` In a run, that record fails with `FILTER_EVALUATION_FAILED` and the others go on; the filter processor and an export preview refuse the whole call with 422. A `notempty` test beside it doesn't help, because `and` and `or` evaluate every operand. A missing or `null` field doesn't match and raises nothing. When the field can arrive blank, use a script filter.

To compare with the current time, use a Handlebars operand: `["number", "{{timestamp \"x\"}}"]` is now in epoch milliseconds, so this passes records created in the last 7 days:

```json
["greaterthanequals", ["epochtime", ["extract", "created"]], ["subtract", ["number", "{{timestamp \"x\"}}"], 604800000]]
```

A helper can also compute a value from fields: `["equals", ["number", "{{add record.a record.b}}"], 5]`. A Handlebars operand is evaluated only when the whole string is one `{{...}}` expression -- text around it, or a second expression, makes it a literal. It reads the record as `record.<field>` (an unprefixed `{{status}}` renders empty) and renders text, so wrap it in `["number", ...]` before comparing it with a number (otherwise 422 `... is a different data type: number`). `epochtime` doesn't render it (422 `invalid datetime format`), and an unknown helper fails the rule with 422 `Failed to evaluate handlebars expression`.

### Schema Index

| Schema | Contents |
|---|---|
| [filter.yml](references/schemas/filter.yml) | Filter object -- type, expression (version, rules), script (_scriptId, function), operators, Handlebars operands and examples |

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

Put the filter on the step that should skip the record. An export's output filter removes the record from every later step. When only one destination should skip it -- every customer goes to the ERP, only some to the newsletter -- filter that destination's import and leave the export and the other imports alone. When several steps share the condition, route them down a branch instead of repeating the filter on each.

### 2. Choose expression vs. script

Can the logic be expressed as comparisons combined with and/or -- including dates relative to now and arithmetic across fields ([Dates and Computed Values](#dates-and-computed-values))? Use an expression. Need loops, multi-step logic, a date field that can arrive blank, or external API calls? Use a script.

### 3. Build the expression rules

Expression rules use prefix (S-expression) notation. Every rule is an array where the first element is the operator and remaining elements are operands.

**Pattern: Single condition**
```
[operator, [string, [extract, fieldName]], value]
```

**Pattern: Multiple conditions (all must match)**
```
[and, [condition1], [condition2], ...]
```

**Pattern: Multiple conditions (any must match)**
```
[or, [condition1], [condition2], ...]
```

**Pattern: Numeric comparison** (the value unquoted: `50`, not `"50"`)
```
[operator, [number, [extract, fieldName]], numericValue]
```

**Pattern: Boolean test** -- passes `true` and the string `"true"`
```
[equals, [boolean, [extract, fieldName]], true]
```
Test for the value you want: `[notequals, [boolean, [extract, fieldName]], false]` also passes records where the field is missing or null.

**Pattern: Dynamic value from settings**
```
[equals, [string, [extract, fieldName]], [string, [settings, flow.settingName]]]
```

### 4. Set the filter on the resource

The filter is a top-level field of the export or import document itself, set with a full update: read the document, add `filter` beside its other top-level fields, and send the whole document back:

```json
"filter": { "type": "expression", "expression": { "version": "1", "rules": ["notempty", ["string", ["extract", "email"]]] } }
```

Send that object, never the rules array alone. A `filter` sent as a bare array saves with no error and isn't stored, and a full update or `set` that carries one removes the filter the step already had, so the step passes every record. The CLI only prints a spec-check warning (`/filter  expected object, found array`). Read the step back after saving.

Two shortcuts don't work. A flow's `pageProcessors[]` entry has no `filter` field. And the PATCH routes don't take one -- an export's accepts only `/debugUntil` and `/assistantMetadata` (connector assistant metadata, not a filter), an import's only `/debugUntil`.

Use the CLI `set` command to add or update a filter on an existing export or import. The `set` command does GET-modify-PUT automatically. For `filter.expression.version=1` the CLI warns `expected string, found integer`; the platform stores `"1"`, so the warning is harmless.

```bash
# Set an expression filter on an export (output filter)
celigo exports set <id> filter.type=expression filter.expression.version=1 filter.expression.rules='["notempty",["string",["extract","email"]]]'

# Set an expression filter on an import
celigo imports set <id> filter.type=expression filter.expression.version=1 filter.expression.rules='["notequals",["string",["extract","status"]],"cancelled"]'
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

On an Integration App's step (it carries `_connectorId`), the save takes only the app's own scripts: a script you created is refused with 422 `invalid_ref` ("Only a script owned by the user or a script shared by the Integration App can be used at filter.script._scriptId."). Filter an app's step with an expression instead.

### 6. Test the filter

Check the rules first with the filter processor, which saves nothing and runs no flow: send `{"rules": {"version": "1", "rules": <rules>}, "data": [<sample records>]}` and it returns the records that pass in `data`. Send the records themselves -- rows wrapped as `{"record": ...}` match nothing -- and put the values `["settings", "<scope>.<name>"]` reads under `options.settings.<scope>`. It has no flow context, so confirm a settings-dependent rule in a test run.

```bash
# The rules alone (POST /v1/processors/filter)
celigo processors invoke filter --file filter-test.json

# An export's output filter: preview the document, or invoke the saved export by id
celigo exports invoke --file export.json   # stages ... transform, outputFilter, preSavePageHook
celigo exports invoke <id>                 # records only, after the filter

# Any step in its flow: imports send nothing in a test run (lookups still call their source)
celigo flows test-run <flowId> --export <exportId>
celigo flows test-run-step-results <flowId> <runId> <exportOrImportId>
```

In a preview or a test run, the export's `outputFilter` stage marks each record it drops `isIgnored: true`; a test run's `runId` is its `flowJob._id`. For branch filters, a test run's router stage lists the branches each record took ([building-flows > Branching Flows](../building-flows/SKILL.md#branching-flows)). The Celigo MCP server has no tool for the processor, previews or test runs: use the CLI or the REST routes.

A real run (`celigo flows run <flowId> -y`, which writes to the destination) shows the effect in the job: check `numSuccess`, `numIgnore`, and `numError` (`celigo jobs list --type flow --flow <flowId> --limit 1`). Records a filter drops count in the step's `numIgnore`, not `numError` -- but `numIgnore` also counts an import's ignore-existing and ignore-missing skips, so read the filter stage before blaming the filter.

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
celigo processors invoke filter --file filter-test.json
celigo exports invoke <id>
celigo flows test-run <flowId> --export <exportId>
celigo flows run <flowId> -y
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a filter, verify:

- [ ] **`filter.type` matches the config block** -- `"expression"` requires `filter.expression`, `"script"` requires `filter.script`
- [ ] **The filter is an object, not a bare rules array** -- a bare array isn't stored and removes the old filter; read the step back after saving
- [ ] **`expression.version` is `"1"`** -- the only supported version
- [ ] **Operator names are lowercase** -- `"notempty"`, not `"isNotEmpty"` or `"NOTEMPTY"`
- [ ] **`extract` references valid field names** -- field names must match the actual record structure; use dot notation for nested fields (e.g., `"customer.email"`)
- [ ] **Every `extract` sits inside a type coercion** -- `["string", ["extract", "email"]]`, or `["number", ["extract", "field"]]` to compare it to a number; a bare `extract` is refused with 422
- [ ] **The compared value has the coercion's type** -- `number` with `50` (unquoted), `string` with a quoted string, `boolean` with `true`/`false`
- [ ] **An `epochtime` field never arrives blank** -- an empty or unreadable date fails the record; use a script filter when it can
- [ ] **The filter sits on the right step** -- an export's output filter removes the record from every later step; to skip only one destination, filter that import
- [ ] **Script filter returns strict boolean** -- `true` or `false`, not truthy/falsy values
- [ ] **Input filter is on a lookup export** -- `inputFilter` only applies when `isLookup: true`

## Gotchas

1. **Operators are `notempty`/`empty`, not `isnotempty`/`isempty`.** The platform refuses `isnotempty`, `isempty` and `anyof` with 422 `Invalid operation: <name>.`, when the filter is saved and by the filter processor, and a bare `extract` with the type-coercion message. Write `["notempty", ["string", ["extract", "email"]]]`.
2. **Filtered records are ignored, not errored.** There is no error log entry for filtered records. They appear as `numIgnore` in the step's job stats. An export's filter drops them from the flow silently, which makes debugging "missing records" problems harder -- check the filter first when records disappear without errors. `numIgnore` also counts an import's ignore-existing and ignore-missing skips, so confirm with the filter stage of a test run, which marks each record the filter dropped ([6. Test the filter](#6-test-the-filter)).
3. **An import filter skips the import, not the record.** A record the filter rejects is never sent, so it never shows in errors, but it continues to the next step with this import's response-mapped fields empty. A later step that writes those fields needs its own filter on them, such as `["notempty", ["string", ["extract", "createdOrderId"]]]`.
4. **Input filter skips the step, not the record.** On a lookup export, a filtered record skips the lookup but continues through subsequent flow steps. It is not removed from the pipeline.
5. **Branch filters use the same expression syntax but live on the flow.** Branch `inputFilter` is configured on `routers[].branches[]` in the flow, not on the export or import. Use `celigo flows set` or `celigo flows update` to modify them.
6. **Expression and script filters cannot coexist.** Setting `filter.type` to `"script"` ignores any `expression` config, and vice versa. Switching types does not auto-clear the other config block.
7. **PUT erases omitted fields.** Always GET the export/import first, modify the filter, then PUT the complete object. The `set` command handles this automatically.
8. **`settings` accessor requires scoped prefix.** Use the scope that holds the value -- `integration.settingName`, `flowGrouping.settingName`, `flow.settingName`, `connection.settingName`, `iClient.settingName`, or the step's own scope: `export.settingName` on an export or lookup, `import.settingName` on an import (an import's settings aren't under `export.`) -- not bare `settingName`. A router's branch filters have no step scope. Inside an API or a Tool, only the step's own scope, `connection` and `iClient` are filled, so a rule there that reads `integration.`, `flowGrouping.` or `flow.` matches nothing. A scope whose resource has no settings can be absent, and a rule that reads it matches nothing.
9. **String comparison is case-sensitive by default.** Use `["lowercase", ["string", ["extract", "field"]]]` before comparison to make it case-insensitive. The `matches` operator also does case-sensitive matching.

## Common Errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| Records silently disappear, no errors | Filter is dropping them; check `numIgnore` in job stats | Review the filter expression; temporarily remove it to confirm |
| 422 "Field operation extract must be called by a Type Conversion Operation but was called by `<operator>`." (or `settings`) | A bare `extract` or `settings`, on save or in the filter processor | Wrap it in a type coercion: `["notempty", ["string", ["extract", "email"]]]` |
| 422 `Invalid operation: isnotempty.` (or `isempty`, `anyof`, `datetime`, `date`, `timestamp`) | An operator or conversion the platform doesn't have, on save or in the filter processor | Use `notempty` or `empty`; for "any of", combine `equals` rules with `or`; convert dates with `epochtime` |
| `FILTER_EVALUATION_FAILED`: "Invalid date. Cannot convert given string or number to date time.; record=..." (a 422 with the same text from the processor or a preview) | An `epochtime` operand got an empty string, text that isn't a date, or epoch milliseconds as a string; a `notempty` test in the same rule doesn't prevent it | Send ISO 8601 strings or epoch-millisecond numbers; when the field can arrive blank, use a script filter ([Dates and Computed Values](#dates-and-computed-values)) |
| 422 `Failed to evaluate handlebars expression "..."` | A Handlebars operand names a helper that doesn't exist | Fix the helper name ([writing-handlebars > 4. Find the right helper](../writing-handlebars/SKILL.md#4-find-the-right-helper)), or compare the field with `extract` |
| The filter is gone after an update, and the step passes every record | The update sent `filter` as a bare rules array: the platform stored nothing for it and dropped the old filter | Send `{"type": "expression", "expression": {"version": "1", "rules": [...]}}` and read the step back |
| 422 "Argument #2 for operation `<operator>` is a different data type: `<type>`." | The value's type doesn't match the coercion: `["string", ...]` against `50`, `["number", ...]` against `"50"`, `["boolean", ...]` against `"true"` | Match them: `number` with an unquoted number, `string` with a quoted string, `boolean` with `true`/`false` |
| An amount filter drops large values and passes smaller ones (120 and 1250 fail `>= 50`, 75 passes) | A `string` coercion against a quoted number compares as text | Use `["number", ["extract", "field"]]` against an unquoted number |
| Filter passes records it should skip | A negative test such as `["notequals", ["boolean", ...], false]` passes records that lack the field: a missing or null value, or every record when the `extract` names the wrong field. A `number` comparison such as `lessthan` reads a missing or empty field as 0 | Test for the value you want (`["equals", ["boolean", ...], true]`), or add `notempty` on the field with `and`; check the field name against the record |
| Filter blocks all records | Logic inverted (e.g., `equals` instead of `notequals`), the field is always empty/null, or the `extract` path starts with `record.` | Test with a known record in the filter processor; check that the field exists, and drop a `record.` prefix |
| "Function not found" on script filter | `function` name in `filter.script.function` does not match an exported function in the script | Verify exact function name (case-sensitive) in the script resource |
| Script filter returns inconsistent results | Function returns truthy/falsy instead of strict `true`/`false` | Return explicit `true` or `false` |
| `inputFilter` has no effect | Export is not a lookup (`isLookup` is not `true`) | Set `isLookup: true` on the export, or move the filter to `filter` instead |
