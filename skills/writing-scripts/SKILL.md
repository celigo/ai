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
- **One script, many functions** -- a single script resource can contain multiple functions, each wired independently to different hook points

Used across flows, APIs, and tools.

Diagnosing a script is read-only. Editing it, rewiring it, and running a flow to test it all write to the account or to the connected systems, and an edit to a shared script reaches every hook that names it -- make those changes when the user asked for them, not as part of explaining a failure. A question about why something fails or how to fix it asks for the cause and the change you propose; make the change once the user says to.

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

**preSavePage returns an object, never a bare array.** Return `{ data, errors, abort, newErrorsAndRetryData }`, passing the page's `errors` through. A hook that returns the array itself -- `return options.data`, or a filtered copy -- drops the page without an error: the run completes with 0 records, 0 errors and 0 pages (live-verified 2026-10-21).

**A throw in preSavePage fails its whole page.** When the hook throws on one record, every record on that page becomes a `script_error` (source `pre_save_page_hook`, each with its own retry data); the other pages run and the run still completes. The error count is therefore whole pages, not bad records: each failed page may hold a single bad record, and its errors share one message and one timestamp.

**postSubmit gets one response per submitted record**, in order. Each `options.responseData[i]` carries:

- `statusCode` -- 200 on success, 422 for a data error
- `errors[]` -- `{ code, message, source }` entries, empty on success
- `ignored` -- true when the record was skipped
- `id` -- the id the destination returned (absent in test runs)
- `_json` -- the destination's parsed response body, where its own error detail sits (`_headers` holds the response headers)

Return the same array, same length, with entries edited -- for example, an error message enriched from the body:

```javascript
function addResponseReason (options) {
  return options.responseData.map((response) => {
    const reason = response._json && response._json.message
    if (response.errors && response.errors.length && reason) {
      response.errors = response.errors.map((error) => ({ ...error, message: `${error.message}: ${reason}` }))
    }
    return response
  })
}
```

**preMap and postMap shape only the request this import sends.** Later steps never see their changes: the next step receives the record as it entered this import, plus what this step's response mapping merges. To give later steps a value, compute it where they can see it -- preSavePage on the source export (every step sees it), a postResponseMap hook on this step (the steps after it see it), or the later import's own preMap -- or map it from this step's response with response mapping.

### Record-Level Processors (on export or import)

| Hook | When | Input | Must return |
|------|------|-------|-------------|
| `filter` | Per-record: an export's output filter, or an import's input filter | `options.record` | `boolean` (true = process) |
| `inputFilter` | Per-record on lookup exports | `options.record` | `boolean` (true = include) |
| `transform` | Per-record reshaping of what an export returns -- source records, or a lookup's results (exports only) | `options.record` | Transformed record |

Only `filter` runs on both exports and imports; `inputFilter` (lookups) and `transform` are export-only. Imports have no `transform` -- their response-side slot is `responseTransform`, which reshapes the destination's response before response mapping.

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
| Filter records entering a lookup export | `inputFilter` | Export (lookup) | Receives single record, returns boolean (true = include) |
| Reshape the records an export or lookup returns | `transform` | Export (source or lookup) | Receives single record, returns transformed record |
| Change what an import sends, before field mapping | `preMap` | Import | Receives unmapped records array, returns array (same length) |
| Change what an import sends, after field mapping | `postMap` | Import | Receives pre-map + post-map arrays, returns array (same length) |
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

- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- export configuration, where `preSavePage`, `filter`, `transform`, and `inputFilter` hooks are wired
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- import configuration, where `preMap`, `postMap`, `postSubmit`, and `postAggregate` hooks are wired
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- flow construction, where `postResponseMap` and `branching` hooks are wired
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- Handlebars expressions for dynamic values in scripts and hook configurations

<!-- TIER:2 -->

## Common Options Available to All Hooks

Most hooks receive these context fields in `options`:

- `_flowId`, `_integrationId`, `_apiId`, `_parentIntegrationId` -- execution context IDs
- `_exportId` or `_importId` -- the step's resource ID
- `_connectionId` -- the connection in use
- `settings` -- the settings of every resource in the step's chain, under fixed scope keys (`.integration`, `.flowGrouping`, `.flow`, `.connection`, `.iClient`, and the step's own `.export` or `.import`): read `options.settings.flow.batchSize`, never `options.settings.batchSize`
- `testMode` -- boolean, whether running in test/preview mode
- `job` -- the current job object

## Function Point Categories

Scripts run at twelve function points, grouped into four categories. The [Hook Points](#hook-points) tables above give each one's input/output contract; this is the mental model for *which kind* of point you're wiring and whether a non-script alternative exists.

- **Step-level pipeline hooks** (on the export or import) -- `preSavePage`, `preMap`, `postMap`, `postSubmit`, `postAggregate`
- **Parent-level response hook** (on the flow/API/tool `pageProcessors[]` entry, not the step) -- `postResponseMap`
- **Script-mode replacements for declarative slots** -- `filter`, `inputFilter`, `transform`, `branching`
- **Resource-specific function points** -- `contentBasedFlowRouter` (on an AS2 connection) and `handleRequest` (on a script-mode API)

**Script-only points have no declarative equivalent:** `postSubmit`, `postResponseMap`, `postAggregate`, `contentBasedFlowRouter`, and `handleRequest`. On those slots a script is the only option. The four script-mode slots (`filter`, `inputFilter`, `transform`, `branching`) each hold *either* a declarative rule tree *or* a script -- never both -- so prefer the declarative path there unless the logic genuinely can't be expressed as rules (see [Declarative vs Script Mode](#declarative-vs-script-mode)).

## Declarative vs Script Mode

The four mode-switchable slots -- `filter`, `inputFilter`, `transform`, and `branching` -- hold a declarative rule tree or a script reference at any one moment, not both. Because the slot's contents change, switching modes is a two-part operation.

**From script mode to declarative mode** (the common direction -- prototype with a script, then clean up):

1. Clear the script from the slot. The slot reverts to declarative mode by default.
2. Author the declarative rule for that slot (rules-engine filter, Mapper 2.0 transform, or router input-filter rule).

**From declarative mode to script mode** (rarer -- the rules engine couldn't express what you need):

1. Wire a script into the slot. The declarative rules already there are replaced by the script reference automatically.

Wiring a script and clearing it are mirror operations on the same slot. Recognize the mode-swap in phrasing like *"switch the filter to rules"*, *"convert this transform back to expressions"*, or *"use a script for this filter instead of rules"*.

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

A hook's `function` can name any top-level function in the script; what must match, exactly and case-sensitively, is that name and a function the script declares. Plain function declarations work, and a single script can contain multiple functions.

See [references/schemas/request.yml](references/schemas/request.yml) for the create/update schema and [references/schemas/response.yml](references/schemas/response.yml) for the response shape.

Key fields:
- `name` -- descriptive name (convention: `<System> - <step> - <hookType>`, e.g., `"Salesforce - getBatchRecords - postResponseMap"`)
- `content` -- the JavaScript source code

To add a function to a script that other hooks already use, read the script, add the function to its `content`, and send the whole `content` back with the existing functions in it -- an update replaces `content` whole, and a hook whose function is gone fails. Or put the new function in a script of its own.

### 5. Wire the script to the resource

Wiring depends on the hook type:

| Hook | Wiring pattern | Where |
|------|---------------|-------|
| `preSavePage`, `preMap`, `postMap`, `postSubmit`, `postAggregate` | `hooks.{hookType}: { _scriptId, function }` | Export or import resource |
| `filter`, `inputFilter`, `transform` | `{field}: { type: "script", script: { _scriptId, function } }` | `filter`: an export's output filter or an import's input filter; `inputFilter`: a lookup export's input filter; `transform`: exports only |
| `postResponseMap` | `hooks.postResponseMap: { _scriptId, function }` | Flow `pageProcessors[]` entry |
| `branching` | `routeRecordsUsing: "script"` + script reference | Router in flow |
| `handleRequest` | `script: { _scriptId, function }` + `type: "script"` | API resource |
| `contentBasedFlowRouter` | `as2.contentBasedFlowRouter: { _scriptId, function }` | AS2 connection |

**Hook-based** attachment (preSavePage, preMap, etc.) adds one key under the resource's `hooks`, beside the hooks already there -- but over the API it is a full update of the export or import. Read the whole document, add the key to its `hooks`, and send the complete document back: a body whose `hooks` holds only the new hook removes the others (a `preMap` dropped while adding `postSubmit`), and a body without the request settings or connection clears those too. Only a debug or metadata field of an export or import can change on its own, so a refused single-field change to `hooks` means "send the full update", not that hooks can't be set over the API. **Replace-based** attachment (filter, transform) replaces the existing filter/transform expression.

### 6. Test and iterate

```bash
# Enable debug logging on the script
celigo scripts enable-debug <script-id>

# Run the flow or API that triggers the script
celigo flows run <flow-id> -y

# Check debug logs
celigo scripts debug-logs <script-id> --since 30

# Check execution logs
celigo scripts debug-logs <script-id> --level ERROR --limit 20

# Disable debug when done
celigo scripts disable-debug <script-id>
```

## Available Modules

Scripts can import three built-in modules:

### integrator-api

Reach platform data and actions from inside a script -- run exports and imports, read and write lookup caches, keep state across runs, start flows. Calls are synchronous and throw on failure, and they resolve against the script's integration: a lookup cache or connection the script uses must be registered to that integration.

```javascript
import { exports, lookupcaches } from 'integrator-api'

const result = exports.run({ _id: 'exportId' })
const hits = lookupcaches.getData({ _id: 'cacheId', keys: ['SKU-1', 'SKU-2'] })
```

**Hooks get runtime operations, not resource CRUD.** Inside a hook -- `preSavePage`, `preMap`, `postMap`, `postSubmit`, `postResponseMap`, `postAggregate`, and script-mode filters, transforms, and branching -- `find`, `get`, `create`, `update`, `patch`, and `delete` on any object (`connections.get(_id)` included) throw `Access restricted`. Resource CRUD belongs in `handleRequest` on a script-mode API. The data and run operations work in hooks: lookup cache `getData` / `putData`, `state`, `exports.run`, `imports.run`, `flows.run` -- useful in `preSavePage` for enrichment and `postSubmit` for triggering downstream processes.

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
celigo scripts debug-logs <id> [--limit N] [--offset N] [--level INFO|WARN|ERROR] [--time-gte ISO] [--time-lte ISO]
celigo scripts enable-debug <id> [--duration <minutes>]
celigo scripts disable-debug <id>
celigo scripts debug-logs <id> [--since <minutes>] [--flow-id <id>]
```

## Authoring Against Sample Data

Script logic is runtime-dependent -- it only works against the specific shape of data it handles -- so a script is written and validated against a **sample input**. The sample comes from the step's recent runs, a test run of the parent flow, or a JSON example you supply. A script written without sample data is written blind.

A test-run capture wraps each record as `{record, errors, traceKey}` and drops the runtime keys; the hook receives bare records in `options.data`. Unwrap `.record` first, or copy the hook's literal `options` from its stage in a debug-level flow run log (`celigo flows enable-execution-logs <flowId>`, then a real run).

Treat authoring as a loop, not a one-shot:

1. **Generate or edit** the function against the sample input.
2. **Run** it against that sample.
3. **Check** the output for errors or obviously-wrong results.
4. **Iterate** -- refine and re-run until it passes.

**Running a script against sample data executes its `integrator-api` calls for real, test mode included.** Lookup-cache `putData` and `deleteData` and `state` writes change the account. Treat `purgeData`, `imports.run` and `flows.run` as real too. While iterating, point them at a scratch cache or resource, or review the code without running it.

A script that fails on the first pass isn't a failure; it's the first turn of the loop -- the runtime error and the code are both visible, so the next pass is informed by what went wrong. When no sample is available (the step has never run and no parent provided records), supply a JSON example before writing the script; a user-supplied sample plays the same validation role as captured runtime data.

## Execution Logs and the Debug Window

Scripts write to a per-script **execution log** using standard `console` methods. What gets captured depends on the level:

- `console.error()`, `console.warn()`, `console.info()`, and `console.log()` are **always captured** -- no setup, no toggle (`info` and `log` are equivalent).
- `console.debug()` is **gated**: its output is persisted only while a time-bounded **debug window** is open on the script. When the window is closed, `console.debug()` still runs but its output is dropped.

"Debugging a script" here means exactly this -- turning on `console.debug()` capture for a window. It is not breakpoint-style debugging; there is no pausing or stepping through code. Open a window only when you need `console.debug()` output; for "why did this fail?" / "what errors happened?", the always-captured error/warn/info/log entries are usually enough.

The debug window is time-bounded and expires automatically -- `celigo scripts enable-debug <id> [--duration <minutes>]` opens it for 60 minutes by default (the maximum). There's no need to close it manually, though `celigo scripts disable-debug <id>` ends it early.

Each log entry records its time, level (`INFO` / `WARN` / `ERROR` / `DEBUG`), the message, and two locating fields:

- `functionType` -- which hook produced the entry (`preMap`, `postSubmit`, etc.)
- `_resourceId` -- the export or import that ran the hook

Because one script can carry many functions across many hook sites, an unfiltered log stream interleaves entries from every consumer. Filter aggressively when reading -- by flow (`--flow-id`), by time (`--since` / `--time-gte` / `--time-lte`), and by level (`--level`). The practical query is "logs for this script, in this flow, on this step, during this window."

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a script, verify:

- [ ] **Hook point and function name are right** -- the function is written for the hook it's wired to, and the reference's `function` matches a top-level function the script declares, exactly and case-sensitively (the name needn't match the hook type)
- [ ] **Return value matches contract** -- batch hooks (`preMap`, `postMap`, `postSubmit`, `postResponseMap`) return arrays that match the input array length exactly; `preSavePage` returns the `{ data, errors, abort, newErrorsAndRetryData }` object, never the array
- [ ] **Existing hooks and functions are kept** -- the export or import update carries every hook it already had plus the new one, and a shared script's `content` keeps its other functions
- [ ] **Error handling uses return pattern, not throw** -- per-record errors use `{ errors: [...] }` return values (`newErrorsAndRetryData` entries in preSavePage), not thrown exceptions (which fail the entire page)
- [ ] **Expression alternative considered** -- filter, transform, and output filter can use expressions; only use a script when expressions cannot handle the logic
- [ ] **`content` field is included on PUT** -- omitting `content` on update erases the code; always GET first, modify, then PUT
- [ ] **Debug mode is disabled after testing** -- `celigo scripts disable-debug <id>` to avoid log noise in production

## Gotchas

1. **Array length contracts are strict.** `preMap`, `postMap`, and `postResponseMap` return arrays MUST match the input array length. Returning fewer or more elements fails the entire page silently or with cryptic errors.
2. **`abort: true` stops pagination, not the flow.** In `preSavePage`, setting `abort: true` tells the export to stop generating new pages. It does NOT stop the flow or cancel processing of the current page's records.
3. **Script `content` is not returned in list responses.** `celigo scripts list` shows metadata only. You must `celigo scripts get <id>` to see the actual JavaScript code.
4. **PUT erases `content` if omitted.** Always GET the script first, modify, then PUT the complete object. The `set` command handles this automatically.
5. **One script resource can contain multiple functions.** A single script with both `preSavePage` and `preMap` functions can be wired to different resources by specifying the `function` name in each hook reference.
6. **Throwing an exception fails the entire page.** In batch hooks (preSavePage, preMap, postMap, postSubmit), an unhandled exception fails ALL records on that page, not just one. In preSavePage that's all it fails, whatever the script editor's stub says: each record on the page becomes an error with its own retry data, and later pages and the rest of the run go on. Use the error return pattern (`{ errors: [...] }`) for per-record errors; in preSavePage, report a bad record through `newErrorsAndRetryData` (`{retryData: <the record>, errors: [{code, message, source}]}`) and pass the page's `errors` through.
7. **`postResponseMap` lives on the flow, not the resource.** The hook is configured on the `pageProcessors[]` entry in the flow/API/tool, even though it processes export or import response data.
8. **filter/transform scripts replace expression-based alternatives.** Wiring a script filter replaces any existing expression filter. They cannot coexist on the same resource.
9. **`console.log()` output goes to script logs, not stdout.** Use `celigo scripts debug-logs` to see output. Logs require debug mode to be enabled for debug-level messages.
10. **Only `console.debug()` needs the debug window.** `error` / `warn` / `info` / `log` are always captured; `debug` output is persisted only while a time-bounded debug window is open (`celigo scripts enable-debug`). A closed window silently drops `console.debug()` output.
11. **Shared-script logs interleave across hook sites.** One script can hold many functions used by many exports/imports, so its log stream mixes entries from every consumer. Filter by flow, level, and time when reading; each entry's `functionType` and `_resourceId` identify where it came from.
12. **Clearing a script-mode filter/transform reverts the slot to declarative mode.** The four mode-switchable slots (`filter`, `inputFilter`, `transform`, `branching`) hold a rule tree or a script, never both -- removing the script drops the slot back to rules, and wiring a script replaces the rules.
13. **A preSavePage that returns an array drops the page silently.** The run completes with 0 records, 0 errors and 0 pages. Return `{ data, errors, abort, newErrorsAndRetryData }`.
14. **Wiring a hook is a full update of the export or import.** Send its existing `hooks` and every other field back with the new hook, and keep a shared script's other functions in its `content`.
15. **The response body in postSubmit is `_json`.** Each `responseData` entry holds the destination's parsed body in `_json`, next to `statusCode`, `errors`, `ignored` and `id`.

## Common Errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| "The number of elements in the return value must match the input" | Batch hook return array length differs from input | Ensure return array has exactly `data.length` (preMap) or `postMapData.length` (postMap) elements; use `{}` for skipped records |
| All records on a page fail with no per-record detail | Unhandled exception thrown in a batch hook (preSavePage, preMap, postMap or postSubmit) | Wrap logic in try/catch; return `{ errors: [...] }` per record (`newErrorsAndRetryData` in preSavePage) instead of throwing |
| A run completes, but some records never reached the next step; the export's errors are `script_error` from `pre_save_page_hook`, many sharing one message and timestamp | preSavePage threw on one record, which fails every record on that page, each with its own retry data; the other pages ran | Fix the hook so that record can't throw (guard the field, or report it through `newErrorsAndRetryData`), then retry those errors |
| A run completes with 0 records, 0 errors and 0 pages, though the source returned data | preSavePage returned a bare array | Return `{ data, errors: options.errors, abort: false, newErrorsAndRetryData: [] }` |
| A value set in preMap or postMap is missing in a later step | They shape only this import's request; the next step gets the record as it entered this import | Set the value in preSavePage on the source export, in a postResponseMap hook on this step, or in the later import's own preMap |
| Another hook stopped running after a hook was added | The update sent `hooks` holding only the new hook, or rewrote a shared script's `content` without its other functions | Read the export or import (or the script) first, and send the existing hooks (or functions) back with the new one |
| Script content is empty after update | PUT omitted the `content` field | Always GET first, modify, then PUT the complete object (or use `celigo scripts set`) |
| `abort: true` set but flow keeps running | `abort` only stops pagination; current page still processes | This is expected behavior; use error returns or filter to skip individual records |
| Script not executing / no logs | Script not wired to any resource; the only runs were test runs (they execute scripts but write no log entries); or the output is `console.debug()` with no debug window open | Verify the `_scriptId` + `function` reference on the export/import/flow, then read the logs of a real run; for `console.debug()` output, open a window first (`celigo scripts enable-debug <id>`) |
| "Function not found" or similar | The hook reference's `function` doesn't name a function the script declares | Make the two names match exactly (case-sensitive); any top-level function name works, and a plain declaration needs no `export` |
| Filter always returns all/no records | Filter function returns truthy/falsy value instead of strict boolean | Return explicit `true` or `false`; avoid returning objects or undefined |
| `postResponseMap` not firing | Hook wired on the import/export instead of the flow's `pageProcessors[]` entry | Move the hook config to the `pageProcessors[]` entry in the flow, not the resource |
| `console.debug()` lines missing from logs | No debug window was open while the script ran | Open a window first (`celigo scripts enable-debug <id>`), then reproduce; error/warn/info/log don't require it |
| Log stream is a confusing mix of unrelated entries | Script is shared across many hooks/flows and the query is unfiltered | Filter by `--flow-id`, `--level`, and date range; use each entry's `functionType` / `_resourceId` to identify the origin |
