---
name: writing-scripts
description: Write Celigo JavaScript hook scripts -- preSavePage, preMap, postMap, postSubmit, postResponseMap, filter, transform, branching, handleRequest. Use when creating or editing scripts, choosing the right hook point, understanding input/output data shapes, or debugging script behavior.
---

<!-- TIER:1 -->

# Writing Scripts

A script is a **JavaScript function** that runs at a specific hook point in the Celigo data pipeline. Scripts handle logic that expressions, filters, and visual mappings cannot -- complex conditionals, cross-record calculations, API calls within the pipeline, and custom routing.

Concerns when writing a script:

- **Choosing the right hook point** -- which function type matches what you're trying to accomplish
- **Input/output contracts** -- what `options` contains and what the function must return (array length rules are strict)
- **Expression alternative** -- filter, transform, and output filter have expression-based alternatives that don't require a script; prefer expressions when possible
- **Available modules** -- scripts can `import` three built-in modules: `integrator-api` (call Celigo APIs), `dayjs` (date/time manipulation), and `sjcl` (Stanford JavaScript Crypto Library for hashing/encryption)
- **One script, many functions** -- a single script resource can contain multiple exported functions, each wired independently to different hook points

Used across flows, APIs, and tools.

## Hook Points

Every script function runs at a specific point in the pipeline. Choose based on *when* you need to act and *what data* you need access to.

### Data Pipeline Hooks

| Hook | Runs on | When | Input | Must return |
|------|---------|------|-------|-------------|
| `preSavePage` | Export | After retrieval, before pipeline | `options.data[]`, `errors[]`, `files[]`, `retryData{}` | `{ data[], errors[], abort, newErrorsAndRetryData[] }` |
| `preMap` | Import | Before field mapping | `options.data[]` (unmapped records) | Array matching `data.length`: `{ data }`, `{ errors }`, or `{}` to skip |
| `postMap` | Import | After field mapping, before submit | `options.preMapData[]`, `postMapData[]` | Array matching `postMapData.length`: `{ data }`, `{ errors }`, or `{}` to skip |
| `postSubmit` | Import | After destination submission | `options.preMapData[]`, `postMapData[]`, `responseData[]` | `responseData[]` (same length, modified) |
| `postAggregate` | Import | After file aggregation upload | `options.postAggregateData: { success, _json, code, message }` | void |

### Record-Level Processors (on export or import)

| Hook | When | Input | Must return |
|------|------|-------|-------------|
| `filter` | Per-record, before processing | `options.record` | `boolean` (true = process) |
| `input_filter` | Per-record on lookup exports | `options.record` | `boolean` (true = include) |
| `transform` | Per-record, reshaping before mapping | `options.record` | Transformed record |

**filter and transform have expression-based alternatives.** Only use a script when the logic is too complex for an expression (multi-field conditionals, date math, external lookups).

### Flow-Level Hook

| Hook | Runs on | When | Input | Must return |
|------|---------|------|-------|-------------|
| `postResponseMap` | Page processor (flow/API/tool) | After response mapping merges results | `options.postResponseMapData[]`, `responseData[]` | `postResponseMapData[]` (same length) |

Configured on the flow's `pageProcessors[]` entry, not on the export/import. Plan this hook when building the resource, but wire it at the flow level.

### Routing and Handlers

| Hook | Runs on | When | Input | Must return |
|------|---------|------|-------|-------------|
| `branching` | Router | Per-record routing decision | `options.record`, `settings` | `number[]` (branch indices, e.g., `[0, 2]`) |
| `handleRequest` | API resource | Incoming HTTP request (script-mode API) | `options.method`, `headers`, `queryString`, `body`, `rawBody` | `{ statusCode, headers?, body }` |
| `contentBasedFlowRouter` | AS2 connection | EDI message routing | `options.httpHeaders`, `mimeHeaders`, `rawMessageBody` | `{ _flowId, _exportId }` |

## Quick Reference

### Hook Point Decision Matrix

| When you need to... | Use hook | Configured on | Input / Output |
|---|---|---|---|
| Transform or filter a batch after retrieval | `preSavePage` | Export | Receives pages of records, returns pages (with optional errors) |
| Filter individual records before processing | `filter` | Export or import | Receives single record, returns boolean (true = keep) |
| Filter records entering a lookup export | `input_filter` | Export (lookup) | Receives single record, returns boolean (true = include) |
| Reshape records before mapping | `transform` | Export or import | Receives single record, returns transformed record |
| Transform records before field mapping | `preMap` | Import | Receives unmapped records array, returns array (same length) |
| Transform records after field mapping | `postMap` | Import | Receives pre-map + post-map arrays, returns array (same length) |
| Process API responses after submission | `postSubmit` | Import | Receives pre-map, post-map, and response arrays, returns response array |
| Handle results after file aggregation | `postAggregate` | Import (file) | Receives aggregation result, returns void |
| Post-response processing (merge lookup/import results) | `postResponseMap` | Flow `pageProcessors[]` entry | Receives merged records + response data, returns merged records (same length) |
| Route records to branches | `branching` | Router in flow/tool | Receives single record + settings, returns branch indices array |
| Handle incoming HTTP requests (script-mode API) | `handleRequest` | API resource | Receives method, headers, query, body; returns `{ statusCode, headers?, body }` |
| Route EDI messages to flows | `contentBasedFlowRouter` | AS2 connection | Receives HTTP/MIME headers + raw body, returns `{ _flowId, _exportId }` |

### Minimum Required Fields

A script resource needs only two fields:

- `name` -- descriptive name (convention: `<System> - <step> - <hookType>`, e.g., `"Salesforce - getBatchRecords - postResponseMap"`)
- `content` -- the JavaScript source code as a string

See [references/schemas/request.yml](references/schemas/request.yml) for the full create/update schema.

## Related Skills

- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- export configuration, where `preSavePage`, `filter`, `transform`, and `input_filter` hooks are wired
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- import configuration, where `preMap`, `postMap`, `postSubmit`, and `postAggregate` hooks are wired
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- flow construction, where `postResponseMap` and `branching` hooks are wired
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- Handlebars expressions for dynamic values in scripts and hook configurations

<!-- TIER:2 -->

## Common Options Available to All Hooks

Most hooks receive these context fields in `options`:

- `_flowId`, `_integrationId`, `_apiId`, `_parentIntegrationId` -- execution context IDs
- `_exportId` or `_importId` -- the step's resource ID
- `_connectionId` -- the connection in use
- `settings` -- custom settings in scope for the resource
- `testMode` -- boolean, whether running in test/preview mode
- `job` -- the current job object

## How to Write a Script

### 1. Determine what you need to accomplish

Map your goal to the right hook point using the [Hook Point Decision Matrix](#hook-point-decision-matrix) above.

### 2. Check if an expression can handle it

Filter, transform, and output filter all have expression-based alternatives. Expressions are simpler to maintain and don't require a script resource. Use a script only when you need:

- Multi-step logic or loops
- Cross-record calculations (totals, deduplication)
- External API calls via `integrator-api`
- Error handling with retry data
- Access to `preMapData` alongside `postMapData`

### 3. Check for existing scripts in the account

```bash
celigo scripts list
celigo scripts get <id>   # content is only returned on individual GET
```

### 4. Create the script resource

Build the script with the correct function name matching the hook point. A single script can contain multiple functions.

See [references/schemas/request.yml](references/schemas/request.yml) for the create/update schema and [references/schemas/response.yml](references/schemas/response.yml) for the response shape.

Key fields:
- `name` -- descriptive name (convention: `<System> - <step> - <hookType>`, e.g., `"Salesforce - getBatchRecords - postResponseMap"`)
- `content` -- the JavaScript source code

### 5. Wire the script to the resource

Wiring depends on the hook type:

| Hook | Wiring pattern | Where |
|------|---------------|-------|
| `preSavePage`, `preMap`, `postMap`, `postSubmit`, `postAggregate` | `hooks.{hookType}: { _scriptId, function }` | Export or import resource |
| `filter`, `input_filter`, `transform` | `{field}: { type: "script", script: { _scriptId, function } }` | Export or import resource |
| `postResponseMap` | `hooks.postResponseMap: { _scriptId, function }` | Flow `pageProcessors[]` entry |
| `branching` | `routeRecordsUsing: "script"` + script reference | Router in flow |
| `handleRequest` | `script: { _scriptId, function }` + `type: "script"` | API resource |
| `contentBasedFlowRouter` | `as2.contentBasedFlowRouter: { _scriptId, function }` | AS2 connection |

**Hook-based** attachment (preSavePage, preMap, etc.) is additive -- adding a hook doesn't remove existing config. **Replace-based** attachment (filter, transform) replaces the existing filter/transform expression.

### 6. Test and iterate

```bash
# Enable debug logging on the script
celigo scripts debug-enable <script-id>

# Run the flow or API that triggers the script
celigo flows run <flow-id> -y

# Check debug logs
celigo scripts debug-logs <script-id> --since 30

# Check execution logs
celigo scripts logs <script-id> --level error --limit 20

# Disable debug when done
celigo scripts debug-disable <script-id>
```

## Available Modules

Scripts can import three built-in modules:

### integrator-api

Call Celigo APIs from within the script -- run exports, read connections, trigger imports.

```javascript
import { exports, imports, connections } from 'integrator-api'

const result = exports.run({ _id: 'exportId' })
const conn = connections.get({ _id: 'connectionId' })
```

Useful in `preSavePage` for enrichment, `handleRequest` for orchestration, and `postSubmit` for triggering downstream processes.

### dayjs

Date and time manipulation. Handles parsing, formatting, diffing, and timezone conversions without manual date math.

```javascript
import dayjs from 'dayjs'

const formatted = dayjs(record.createdAt).format('YYYY-MM-DD')
const isRecent = dayjs().diff(dayjs(record.updatedAt), 'day') < 7
```

### sjcl

Stanford JavaScript Crypto Library for hashing, encryption, and HMAC generation.

```javascript
import sjcl from 'sjcl'

const hash = sjcl.hash.sha256.hash(payload)
const hexDigest = sjcl.codec.hex.fromBits(hash)
```

## CLI Commands

### CRUD

```bash
celigo scripts list
celigo scripts get <id>
celigo scripts create < script.json
celigo scripts update <id> < script.json
celigo scripts set <id> name="New Name"
celigo scripts delete <id>
```

### Logs and Debugging

```bash
celigo scripts logs <id> [--limit N] [--offset N] [--level error|warn|info|debug] [--start-date ISO] [--end-date ISO]
celigo scripts debug-enable <id> [--duration <minutes>]
celigo scripts debug-disable <id>
celigo scripts debug-logs <id> [--since <minutes>] [--flow-id <id>]
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a script, verify:

- [ ] **Hook point is correct** -- the function name matches the hook type being wired (e.g., `preSavePage` function for a `hooks.preSavePage` reference)
- [ ] **Return value matches contract** -- batch hooks (`preMap`, `postMap`, `postSubmit`, `postResponseMap`) return arrays that match the input array length exactly
- [ ] **Error handling uses return pattern, not throw** -- per-record errors use `{ errors: [...] }` return values, not thrown exceptions (which fail the entire page)
- [ ] **Expression alternative considered** -- filter, transform, and output filter can use expressions; only use a script when expressions cannot handle the logic
- [ ] **`content` field is included on PUT** -- omitting `content` on update erases the code; always GET first, modify, then PUT
- [ ] **Debug mode is disabled after testing** -- `celigo scripts debug-disable <id>` to avoid log noise in production

## Gotchas

1. **Array length contracts are strict.** `preMap`, `postMap`, and `postResponseMap` return arrays MUST match the input array length. Returning fewer or more elements fails the entire page silently or with cryptic errors.
2. **`abort: true` stops pagination, not the flow.** In `preSavePage`, setting `abort: true` tells the export to stop generating new pages. It does NOT stop the flow or cancel processing of the current page's records.
3. **Script `content` is not returned in list responses.** `celigo scripts list` shows metadata only. You must `celigo scripts get <id>` to see the actual JavaScript code.
4. **PUT erases `content` if omitted.** Always GET the script first, modify, then PUT the complete object. The `set` command handles this automatically.
5. **One script resource can contain multiple functions.** A single script with both `preSavePage` and `preMap` functions can be wired to different resources by specifying the `function` name in each hook reference.
6. **Throwing an exception fails the entire page.** In batch hooks (preSavePage, preMap, postMap, postSubmit), an unhandled exception fails ALL records on that page, not just one. Use the error return pattern (`{ errors: [...] }`) for per-record errors.
7. **`postResponseMap` lives on the flow, not the resource.** The hook is configured on the `pageProcessors[]` entry in the flow/API/tool, even though it processes export or import response data.
8. **filter/transform scripts replace expression-based alternatives.** Wiring a script filter replaces any existing expression filter. They cannot coexist on the same resource.
9. **`console.log()` output goes to script logs, not stdout.** Use `celigo scripts logs` or `debug-logs` to see output. Logs require debug mode to be enabled for debug-level messages.

## Common Errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| "The number of elements in the return value must match the input" | Batch hook return array length differs from input | Ensure return array has exactly `data.length` (preMap) or `postMapData.length` (postMap) elements; use `{}` for skipped records |
| All records on a page fail with no per-record detail | Unhandled exception thrown in batch hook | Wrap logic in try/catch; return `{ errors: [...] }` per record instead of throwing |
| Script content is empty after update | PUT omitted the `content` field | Always GET first, modify, then PUT the complete object (or use `celigo scripts set`) |
| `abort: true` set but flow keeps running | `abort` only stops pagination; current page still processes | This is expected behavior; use error returns or filter to skip individual records |
| Script not executing / no logs | Script not wired to any resource, or debug mode not enabled | Verify `_scriptId` + `function` reference on the export/import/flow; enable debug with `celigo scripts debug-enable` |
| "Function not found" or similar | `function` name in hook reference doesn't match an exported function in the script | Check the function name matches exactly (case-sensitive) between the hook config and the script's `export` |
| Filter always returns all/no records | Filter function returns truthy/falsy value instead of strict boolean | Return explicit `true` or `false`; avoid returning objects or undefined |
| `postResponseMap` not firing | Hook wired on the import/export instead of the flow's `pageProcessors[]` entry | Move the hook config to the `pageProcessors[]` entry in the flow, not the resource |
