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
| `preParse` | File export | After the file is downloaded, before it's parsed | `options.preParseData` (the raw file text), `fileMeta` | `{ preParseData, fileMeta }` -- both, changed or not, for the parser to read |
| `preSavePage` | Export (source or lookup) | Per page, after the export's transform and output filter | `options.data[]`, `errors[]`, `pageIndex`, `files[]`, `retryData{}` | `{ data[], errors[], abort, newErrorsAndRetryData[] }` |
| `preMap` | Import | Before field mapping | `options.data[]` (unmapped records) | Array matching `data.length`: `{ data }`, `{ errors }`, or `{}` to skip |
| `postMap` | Import | After field mapping, before submit | `options.preMapData[]`, `postMapData[]` | Array matching `postMapData.length`: `{ data }`, `{ errors }`, or `{}` to skip |
| `postSubmit` | Import | After the destination responds | `options.preMapData[]`, `postMapData[]`, `responseData[]` (one per record, below) | `responseData[]` (same length, modified); the response mapping reads the `_json` you return |
| `postAggregate` | Import (a file import that aggregates records) | After the aggregated file is uploaded | `options.postAggregateData: { success, _json, code, message, source }` | void |

**preSavePage returns an object, never a bare array.** Return `{ data, errors, abort, newErrorsAndRetryData }`, passing the page's `errors` through. A hook that returns the array itself -- `return options.data`, or a filtered copy -- drops the page without an error: the run completes with 0 records, 0 errors and 0 pages (live-verified 2026-10-21).

**A throw in preSavePage fails its whole page.** When the hook throws on one record, every record on that page becomes a `script_error` (source `pre_save_page_hook`, each with its own retry data); the other pages run and the run still completes. The error count is therefore whole pages, not bad records: each failed page may hold a single bad record, and its errors share one message and one timestamp.

**postSubmit gets one response per submitted record**, in order. Each `options.responseData[i]` carries:

- `statusCode` -- 200 on success, 422 for a data error
- `errors[]` -- `{ code, message, source }` entries, empty on success
- `ignored` -- true when the record was skipped
- `id` -- the id the destination returned (absent in test runs, and on a record that failed before it was sent)
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

**preMap and postMap shape only the request this import sends.** Later steps never see their changes: the next step receives the record as it entered this import, plus what this step's response mapping merges. To give later steps a value, compute it where they can see it -- preSavePage on the source export (every step sees it), a postResponseMap hook on this step (the steps after it see it), or the later import's own preMap -- or map it from this step's response with response mapping. An element that carries both `data` and `errors` isn't a warning: the record is sent, but it gets the error (with retry data), counts as failed and goes no further -- so retrying that error sends it again.

### Record-Level Processors (on export or import)

| Hook | When | Input | Must return |
|------|------|-------|-------------|
| `filter` | Per-record: an export's output filter (it sees the transformed record), or an import's input filter | `options.record` | `boolean` (true = process) |
| `inputFilter` | Per-record on lookup exports | `options.record` | `boolean` (true = run the lookup; false = skip it, and the record continues without the lookup's data, counted as ignored) |
| `transform` | Per-record reshaping of what an export returns -- source records, or a lookup's results (exports only) | `options.record` | Transformed record |

Only `filter` runs on both exports and imports; `inputFilter` (lookups) and `transform` are export-only. Imports have no `transform` -- their response-side slot is `responseTransform`, which reshapes the destination's response before response mapping.

**filter and transform have expression-based alternatives.** Only use a script when the logic is too complex for an expression (multi-field conditionals, date math, external lookups).

### Flow-Level Hook

| Hook | Runs on | When | Input | Must return |
|------|---------|------|-------|-------------|
| `postResponseMap` | Page processor (flow/API/tool) | After response mapping merges results | `options.postResponseMapData[]`, `responseData[]` -- per record, an import's response as postSubmit returned it, or a lookup's `{ data: [<results>], errors }` | `postResponseMapData[]` (same length) |

Configured on the flow's `pageProcessors[]` entry, not on the export/import. Plan this hook when building the resource, but wire it at the flow level.

### Routing and Handlers

| Hook | Runs on | When | Input | Must return |
|------|---------|------|-------|-------------|
| `branching` | Router | Per-record routing decision | `options.record`, `settings` | `number[]` of zero-based branch indices: one index (`[0]`) under `first_matching_branch`, where more than one fails the record with `invalid_script_routing`; several (`[0, 2]`) only under `all_matching_branches` |
| `handleRequest` | API resource | Incoming HTTP request (script-mode API) | `options.method`, `headers`, `queryString`, `body`, `rawBody` | `{ statusCode, headers?, body }` |
| `contentBasedFlowRouter` | AS2 or VAN connection | EDI message routing | `options.httpHeaders`, `mimeHeaders`, `rawMessageBody` (AS2) | `{ _flowId, _exportId }` |

## Quick Reference

### Hook Point Decision Matrix

| When you need to... | Use hook | Configured on | Input / Output |
|---|---|---|---|
| Fix a file's raw text before it's parsed (a header row, a preamble, a format) | `preParse` | Export (file) | Receives the raw file text and its metadata, returns both |
| Transform or filter a batch after retrieval | `preSavePage` | Export | Receives pages of records, returns pages (with optional errors) |
| Filter individual records before processing | `filter` | Export or import | Receives single record, returns boolean (true = keep) |
| Skip a lookup for some records | `inputFilter` | Export (lookup) | Receives single record, returns boolean (false = no lookup call; the record goes on unenriched) |
| Reshape the records an export or lookup returns | `transform` | Export (source or lookup) | Receives single record, returns transformed record |
| Change what an import sends, before field mapping | `preMap` | Import | Receives unmapped records array, returns array (same length) |
| Change what an import sends, after field mapping | `postMap` | Import | Receives pre-map + post-map arrays, returns array (same length) |
| Process API responses after submission | `postSubmit` | Import | Receives pre-map, post-map, and response arrays, returns response array |
| Handle results after file aggregation | `postAggregate` | Import (file) | Receives aggregation result, returns void |
| Post-response processing (merge lookup/import results) | `postResponseMap` | Flow `pageProcessors[]` entry | Receives merged records + response data, returns merged records (same length) |
| Route records to branches | `branching` | Router in flow/tool | Receives single record + settings, returns branch indices array |
| Handle incoming HTTP requests (script-mode API) | `handleRequest` | API resource | Receives method, headers, query, body; returns `{ statusCode, headers?, body }` |
| Route EDI messages to flows | `contentBasedFlowRouter` | AS2 or VAN connection | Receives HTTP/MIME headers + raw body (AS2), returns `{ _flowId, _exportId }` |

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
- [troubleshooting-flows > 7. Low-level debug primitives](../troubleshooting-flows/SKILL.md#7-low-level-debug-primitives-surgical-control) -- reading a hook's stage in a run's execution log

<!-- TIER:2 -->

## Common Options Available to All Hooks

The batch hooks (preSavePage, preMap, postMap, postSubmit, postResponseMap) receive these context fields in `options`:

- `_flowId`, `_integrationId`, `_apiId`, `_parentIntegrationId` -- execution context IDs
- `_exportId` or `_importId` -- the step's resource ID
- `_connectionId` -- the connection in use
- `configuration` -- the static object on the hook reference ([5. Wire the script](#5-wire-the-script-to-the-resource))
- `settings` -- the settings of every resource in the step's chain, under fixed scope keys (`.integration`, `.flowGrouping`, `.flow`, `.connection`, `.iClient`, and the step's own `.export` or `.import`): read `options.settings.flow.batchSize`, never `options.settings.batchSize`. A scope whose resource has no settings can be missing entirely, so guard it: `(options.settings.flow || {}).batchSize`
- `testMode` -- boolean, whether running in test/preview mode
- `sandbox` -- boolean, whether the script runs in a sandbox environment
- `job` -- the current job object
- preSavePage also gets `pageIndex` (the page's position, from 0) and, on a delta export, `lastExportDateTime` and `currentExportDateTime`

Record-level functions get far less -- in a real run, no resource IDs and no `testMode`: a script transform gets `record`, `settings` and `job`; an export's script filter adds `pageIndex` (and the delta dates on a delta export); a lookup's input filter gets `record`, `settings`, `job` and `pageIndex`; a branching function only `record` and `settings` -- and its `settings` has no step scope, because a router isn't a step.

## Function Point Categories

Scripts run at the function points below, grouped into four categories. The [Hook Points](#hook-points) tables above give each one's input/output contract; this is the mental model for *which kind* of point you're wiring and whether a non-script alternative exists.

- **Step-level pipeline hooks** (on the export or import) -- `preParse`, `preSavePage`, `preMap`, `postMap`, `postSubmit`, `postAggregate`. A Tool's `output` and a builder API's responses carry their own `hooks.preMap` and `hooks.postMap` around their mappings.
- **Parent-level response hook** (on the flow/API/tool `pageProcessors[]` entry, not the step) -- `postResponseMap`
- **Script-mode replacements for declarative slots** -- `filter`, `inputFilter`, `transform`, `branching`, and a builder API's response router (`routeRecordsUsing: "script"`; the function returns the response `id`)
- **Resource-specific function points** -- `contentBasedFlowRouter` (on an AS2 or VAN connection) and `handleRequest` (on a script-mode API)

Two more sit outside the data pipeline, mostly in Integration App authoring: a settings form's `init` (returns the form to render) and a resource's `preSave` on an export, import or integration (returns `options.newResource`; a throw blocks the save).

**Script-only points have no declarative equivalent:** `preParse`, `postSubmit`, `postResponseMap`, `postAggregate`, `contentBasedFlowRouter`, and `handleRequest`. On those slots a script is the only option. The four script-mode slots (`filter`, `inputFilter`, `transform`, `branching`) each hold *either* a declarative rule tree *or* a script -- never both -- so prefer the declarative path there unless the logic genuinely can't be expressed as rules (see [Declarative vs Script Mode](#declarative-vs-script-mode)).

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
| `preParse`, `preSavePage` | `hooks.{hookType}: { _scriptId, function, configuration? }` | Export resource |
| `preMap`, `postMap`, `postSubmit`, `postAggregate` | `hooks.{hookType}: { _scriptId, function, configuration? }` | Import resource |
| `filter`, `inputFilter`, `transform` | `{field}: { type: "script", script: { _scriptId, function } }` | `filter`: an export's output filter or an import's input filter; `inputFilter`: a lookup export's input filter; `transform`: exports only |
| `postResponseMap` | `hooks.postResponseMap: { _scriptId, function }` | Flow `pageProcessors[]` entry |
| `branching` | `routeRecordsUsing: "script"` + script reference | Router in flow |
| `handleRequest` | `script: { _scriptId, function }` on an API created with `type: "script"` (an API's `type` can't change after creation) | API resource |
| `contentBasedFlowRouter` | `as2.contentBasedFlowRouter` or `van.contentBasedFlowRouter`: `{ _scriptId, function }` | AS2 or VAN connection |

**Hook-based** attachment (preSavePage, preMap, etc.) adds one key under the resource's `hooks`, beside the hooks already there -- but over the API it is a full update of the export or import. Read the whole document, add the key to its `hooks`, and send the complete document back: a body whose `hooks` holds only the new hook removes the others (a `preMap` dropped while adding `postSubmit`), and a body without the request settings or connection clears those too. Only a debug or metadata field of an export or import can change on its own, so a refused single-field change to `hooks` means "send the full update", not that hooks can't be set over the API. **Replace-based** attachment (filter, transform) replaces the existing filter/transform expression.

A hook reference's optional `configuration` is a static object the function receives as `options.configuration`, so one function can serve several steps with different values. A hook can name a stack (`_stackId`) instead of a script -- see [managing-stacks > Referencing a Stack](../managing-stacks/SKILL.md#referencing-a-stack-_stackid).

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

Each kind of run treats hooks differently:

- **An export preview** (`celigo exports invoke` with a document) stops after parsing: its transform, output filter and preSavePage don't run there.
- **A flow test run** runs hooks on the first page only (later pages arrive empty) and never sends imports, so import hooks see the saved `mockResponse` (or a placeholder) instead of a real response. It writes no script log entries.
- **A real run** is the only kind that writes the script's log.

**To run one function without a flow,** send it to the JavaScript processor -- the platform's script runner -- with the code and the `options` the function should receive, such as `input[0]` from its hook stage in a debug-level run ([Authoring Against Sample Data](#authoring-against-sample-data)):

```bash
celigo processors invoke javascript --file run.json
# run.json: {"rules": {"function": "<name>", "code": "<script source>"},
#            "options": {"type": "hook", "container": "integration", "testMode": true, "_integrationId": "<id>"},
#            "data": <the options object the function receives>}
```

The reply's `data` is the function's return value. A throw, a syntax or import error, or a `function` the code doesn't declare comes back as 422 with the message (`entry point("<name>") is not a function`). Its `integrator-api` calls run for real against that integration; leave `options` out to run plain JavaScript with no integration context (an `options` without `_integrationId` is refused with 422).

## Available Modules

Scripts can import three built-in modules:

### integrator-api

Reach platform data and actions from inside a script -- run exports and imports, read and write lookup caches, keep state across runs, start flows. Calls are synchronous and throw on failure, and they resolve against the integration the hook is running in (`options._integrationId`), not the script: a lookup cache or connection must be registered to that integration, and an export or import must be used by one of its flows -- anything else throws `<type>: <id> doesn't belong to this integration`. [references/integrator-api.md](references/integrator-api.md) has what each call returns and the errors you'll see.

```javascript
import { exports, lookupcaches } from 'integrator-api'

const page = exports.run({ _id: 'exportId' })   // { data, dataURIs }
const read = lookupcaches.getData({ _id: 'cacheId', keys: ['SKU-1', 'SKU-2'] })
// read.data has one entry per key: { key, value } for a hit, { key, error: { message } } for a miss
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
celigo scripts set <id> content=file://./hook.js   # load the source from a file
celigo scripts dependencies <id>                    # every resource whose hooks use the script
celigo scripts delete <id>
```

### Logs and Debugging

```bash
celigo scripts debug-logs <id> [--since <minutes> | --time-gte <iso> [--time-lte <iso>]] [--flow-id <id>] [--resource-id <id>] [--function-type <type>] [--level INFO|WARN|ERROR|DEBUG] [--limit N] [--offset N]
celigo scripts enable-debug <id> [--duration <minutes>]
celigo scripts disable-debug <id>
celigo scripts delete-debug-logs <id>
```

`--flow-id` takes a flow, API or Tool ID.

## Authoring Against Sample Data

Script logic is runtime-dependent -- it only works against the specific shape of data it handles -- so a script is written and validated against a **sample input**. The sample comes from the step's recent runs, a test run of the parent flow, or a JSON example you supply. A script written without sample data is written blind.

A test-run capture wraps each record as `{record, errors, traceKey}` and drops the runtime keys; the hook receives bare records in `options.data`. Unwrap `.record` first, or start from the `options` a debug-level real run logged for the hook: `input[0]` of its `<hookType>Hook` stage, such as `preMapHook` ([troubleshooting-flows > 7. Low-level debug primitives](../troubleshooting-flows/SKILL.md#7-low-level-debug-primitives-surgical-control); `celigo flows enable-execution-logs <flowId>`, then a real run). That copy isn't a pure snapshot: its records can already carry fields the step adds later (its response mapping's targets), so remove those, and a `postResponseMapHook` entry has no `responseData` -- add it yourself.

Treat authoring as a loop, not a one-shot:

1. **Generate or edit** the function against the sample input.
2. **Run** it against that sample.
3. **Check** the output for errors or obviously-wrong results.
4. **Iterate** -- refine and re-run until it passes.

**Running a script against sample data executes its `integrator-api` calls for real, test mode included.** Lookup-cache `putData` and `deleteData` and `state` writes change the account. Treat `purgeData`, `imports.run` and `flows.run` as real too. While iterating, point them at a scratch cache or resource, or review the code without running it.

A script that fails on the first pass isn't a failure; it's the first turn of the loop -- the runtime error and the code are both visible, so the next pass is informed by what went wrong. When no sample is available (the step has never run and no parent provided records), supply a JSON example before writing the script; a user-supplied sample plays the same validation role as captured runtime data.

## Execution Logs and the Debug Window

Scripts write to a per-script **execution log** using standard `console` methods. What gets captured depends on the level:

- `console.error()`, `console.warn()`, `console.info()`, and `console.log()` are **always captured** on real runs, whatever the flow's logging mode -- no setup, no toggle (`info` and `log` are equivalent).
- `console.debug()` is **gated**: its output is persisted only while a time-bounded **debug window** is open on the script. When the window is closed, `console.debug()` still runs but its output is dropped.

"Debugging a script" here means exactly this -- turning on `console.debug()` capture for a window. It is not breakpoint-style debugging; there is no pausing or stepping through code. Open a window only when you need `console.debug()` output; for "why did this fail?" / "what errors happened?", the always-captured error/warn/info/log entries are usually enough.

The debug window is time-bounded and expires automatically -- `celigo scripts enable-debug <id> [--duration <minutes>]` opens it for 60 minutes by default (the maximum). There's no need to close it manually, though `celigo scripts disable-debug <id>` ends it early. The window is the script's `debugUntil`, which only a PATCH sets (what `enable-debug` sends): a full update carrying `debugUntil` leaves it unset, and an end more than an hour ahead is refused with 422. Closing a window deletes nothing; entries leave the log only through `celigo scripts delete-debug-logs <id>` (the script page's Clear logs) or the account's log retention.

Each log entry records its time, level (`INFO` / `WARN` / `ERROR` / `DEBUG`), the message, and two locating fields:

- `functionType` -- which hook produced the entry (`preMap`, `postSubmit`, etc.)
- `_resourceId` -- the export or import that ran the hook

Because one script can carry many functions across many hook sites, an unfiltered log stream interleaves entries from every consumer. Filter aggressively when reading -- by flow, API or Tool (`--flow-id`), by step (`--resource-id`), by hook type (`--function-type`), by time (`--since` / `--time-gte` / `--time-lte`), and by level (`--level`). The practical query is "logs for this script, in this flow, on this step, during this window."

The API returns the log one time slice per call, newest first. `celigo scripts debug-logs` follows its cursor for you; a direct `GET /v1/scripts/{_id}/logs` must follow `nextPageURL` itself -- an empty `logs` with a `nextPageURL` is one empty slice, not an empty log. The Celigo MCP server has no tool for script logs or debug windows; use the CLI or the script's page.

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a script, verify:

- [ ] **Hook point and function name are right** -- the function is written for the hook it's wired to, and the reference's `function` matches a top-level function the script declares, exactly and case-sensitively (the name needn't match the hook type); after saving, the step read back still carries the hook (a hook key the step type doesn't have is dropped)
- [ ] **Return value matches contract** -- batch hooks (`preMap`, `postMap`, `postSubmit`, `postResponseMap`) return arrays that match the input array length exactly; `preSavePage` returns the `{ data, errors, abort, newErrorsAndRetryData }` object, never the array
- [ ] **Existing hooks and functions are kept** -- the export or import update carries every hook it already had plus the new one, and a shared script's `content` keeps its other functions
- [ ] **Error handling uses return pattern, not throw** -- per-record errors use `{ errors: [...] }` return values (`newErrorsAndRetryData` entries in preSavePage), not thrown exceptions (which fail the entire page in a batch hook -- after the destination accepted it, in postSubmit)
- [ ] **Expression alternative considered** -- filter, transform, and output filter can use expressions; only use a script when expressions cannot handle the logic
- [ ] **A full update sends every field you mean to keep** -- an update that omits `content` keeps the stored source (only a create without it makes an empty script), but read the script first anyway and send the rest of what you mean to keep
- [ ] **A shared script's other users are checked** -- `celigo scripts dependencies <id>` lists every resource whose hooks use the script; editing a function changes it for all of them
- [ ] **Debug mode is disabled after testing** -- `celigo scripts disable-debug <id>` to avoid log noise in production

## Gotchas

1. **Array length contracts are strict.** `preMap`, `postMap`, `postSubmit`, and `postResponseMap` return arrays MUST match the input array length. Returning fewer or more elements fails the entire page silently or with cryptic errors.
2. **`abort: true` stops pagination, not the flow.** In `preSavePage`, setting `abort: true` tells the export to stop generating new pages. It does NOT stop the flow or cancel processing of the current page's records.
3. **Script `content` is not returned in list responses.** `celigo scripts list` shows metadata only. You must `celigo scripts get <id>` to see the actual JavaScript code.
4. **An update without `content` keeps the stored source.** Only a script created without `content` is empty. Read the script before a full update anyway and send every field you mean to keep; `celigo scripts set` does the read for you.
5. **One script resource can contain multiple functions.** A single script with both `preSavePage` and `preMap` functions can be wired to different resources by specifying the `function` name in each hook reference.
6. **What a throw fails depends on the hook.** In a script filter, transform or branching function, an unhandled exception fails only the current record. In the batch hooks (preSavePage, preMap, postMap, postSubmit, postResponseMap) it fails ALL records on that page, not just one -- and that's all it fails, whatever the script editor's stub says: each record becomes an error with its own retry data, and later pages and the rest of the run go on. A postSubmit throw fails records the destination has already accepted, so retrying them sends them again. (preParse differs: per the export schema, a throw there fails the run.) Each failure is a `script_error` with the message `Error: <your message>` and a `source` naming where it was thrown: `transformation`, `output_filter`, `JavaScript(router)`, `pre_save_page_hook`, `pre_map_hook`, `post_map_hook`, `post_submit_hook` or `post_response_map_hook`. Use the error return pattern (`{ errors: [...] }`) for per-record errors; in preSavePage, report a bad record through `newErrorsAndRetryData` (`{retryData: <the record>, errors: [{code, message, source}]}`) and pass the page's `errors` through.
7. **`postResponseMap` lives on the flow, not the resource.** The hook is configured on the `pageProcessors[]` entry in the flow/API/tool, even though it processes export or import response data.
8. **filter/transform scripts replace expression-based alternatives.** Wiring a script filter replaces any existing expression filter. They cannot coexist on the same resource.
9. **`console.log()` output goes to script logs, not stdout.** Use `celigo scripts debug-logs` to see output. Logs require debug mode to be enabled for debug-level messages.
10. **Only `console.debug()` needs the debug window.** `error` / `warn` / `info` / `log` are always captured; `debug` output is persisted only while a time-bounded debug window is open (`celigo scripts enable-debug`). A closed window silently drops `console.debug()` output.
11. **Shared-script logs interleave across hook sites.** One script can hold many functions used by many exports/imports, so its log stream mixes entries from every consumer. Filter by flow, level, and time when reading; each entry's `functionType` and `_resourceId` identify where it came from.
12. **Clearing a script-mode filter/transform reverts the slot to declarative mode.** The four mode-switchable slots (`filter`, `inputFilter`, `transform`, `branching`) hold a rule tree or a script, never both -- removing the script drops the slot back to rules, and wiring a script replaces the rules.
13. **A preSavePage that returns an array drops the page silently.** The run completes with 0 records, 0 errors and 0 pages. Return `{ data, errors, abort, newErrorsAndRetryData }`.
14. **Wiring a hook is a full update of the export or import.** Send its existing `hooks` and every other field back with the new hook, and keep a shared script's other functions in its `content`.
15. **The response body in postSubmit is `_json`.** Each `responseData` entry holds the destination's parsed body in `_json`, next to `statusCode`, `errors`, `ignored` and `id`.
16. **preSavePage sees one page at a time.** Each call gets one page (`pageIndex` counts from 0), so grouping or de-duplication inside it spans only that page. Pages are cut after the export's transform and output filter -- a record they drop doesn't count toward `pageSize` -- and an export whose filter drops every record never calls preSavePage at all. It's the one batch hook that may return more or fewer records than it received. On a lookup, it runs once per incoming record, over that record's results.
17. **A record can be an array.** When an export groups rows (`groupByFields`, or Group rows on a NetSuite saved search), each group travels as one record holding its rows, so `record` or `data[i]` can be an array: check `Array.isArray(record)` before reading fields ([configuring-exports > Grouped records](../configuring-exports/SKILL.md#grouped-records----one-record-many-rows)).
18. **A hook on the wrong step type is dropped without an error.** `hooks.preSavePage` or `hooks.preParse` on an import, or `hooks.preMap` on an export, saves (201) and reads back without the hook, so it never runs or logs. postAggregate on an HTTP records import is refused instead (422 "Doc contains unsupported postAggregate hook"). Read the resource back after wiring.
19. **An async-helper export can't carry its own preSavePage.** Put the hook on the helper's result export -- see [configuring-exports > Async APIs (submit, poll, fetch)](../configuring-exports/SKILL.md#async-apis-submit-poll-fetch).
20. **`getData` then `putData` in a hook isn't a lock.** A cache write is an upsert with no insert-if-absent, so two pages or runs can both read "absent" and both write. Claim the key on an import step instead ([configuring-lookup-caches > Deduplication Ledger](../configuring-lookup-caches/SKILL.md#deduplication-ledger)).

## Common Errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| "The number of elements in the return value must match the input" | Batch hook return array length differs from input | Ensure return array has exactly `data.length` (preMap) or `postMapData.length` (postMap) elements; use `{}` for skipped records |
| All records on a page fail with the same `script_error` | Unhandled exception thrown in a batch hook (preSavePage, preMap, postMap, postSubmit or postResponseMap); the error's `source` names the hook | Wrap logic in try/catch; return `{ errors: [...] }` per record (`newErrorsAndRetryData` in preSavePage) instead of throwing |
| `script_error` "script did not terminate within time limit" | A hook ran past the platform's script time limit; every record on that page fails, with no `classification` | Do less per page (fewer `integrator-api` or outside calls, or a smaller page size), then retry the errors |
| A run completes, but some records never reached the next step; the export's errors are `script_error` from `pre_save_page_hook`, many sharing one message and timestamp | preSavePage threw on one record, which fails every record on that page, each with its own retry data; the other pages ran | Fix the hook so that record can't throw (guard the field, or report it through `newErrorsAndRetryData`), then retry those errors |
| A run completes with 0 records, 0 errors and 0 pages, though the source returned data | preSavePage returned a bare array | Return `{ data, errors: options.errors, abort: false, newErrorsAndRetryData: [] }` |
| A value set in preMap or postMap is missing in a later step | They shape only this import's request; the next step gets the record as it entered this import | Set the value in preSavePage on the source export, in a postResponseMap hook on this step, or in the later import's own preMap |
| Another hook stopped running after a hook was added | The update sent `hooks` holding only the new hook, or rewrote a shared script's `content` without its other functions | Read the export or import (or the script) first, and send the existing hooks (or functions) back with the new one |
| Script content is empty | The script was created without `content` (an update that omits it keeps the stored source) | Set it: `celigo scripts set <id> content=file://./hook.js` |
| `abort: true` set but flow keeps running | `abort` only stops pagination; current page still processes | This is expected behavior; use error returns or filter to skip individual records |
| Script not executing / no logs | Script not wired to any resource; the hook key isn't one the step type has, so the save dropped it (gotcha 18); the only runs were test runs (they execute scripts but write no log entries); or the output is `console.debug()` with no debug window open | Read the export/import/flow back and verify the `_scriptId` + `function` reference, then read the logs of a real run; for `console.debug()` output, open a window first (`celigo scripts enable-debug <id>`) |
| "Function not found" or similar (the JavaScript processor says `entry point("<name>") is not a function`) | The hook reference's `function` doesn't name a function the script declares | Make the two names match exactly (case-sensitive); any top-level function name works, and a plain declaration needs no `export` |
| Filter always returns all/no records | Filter function returns truthy/falsy value instead of strict boolean | Return explicit `true` or `false`; avoid returning objects or undefined |
| `postResponseMap` not firing | Hook wired on the import/export instead of the flow's `pageProcessors[]` entry | Move the hook config to the `pageProcessors[]` entry in the flow, not the resource |
| `<type>: <id> doesn't belong to this integration` from an `integrator-api` call | The cache isn't registered to the integration the hook runs in, or none of its flows uses that export or import | Register the cache (`celigo integrations register-lookup-caches`), or call a step this integration's flows use ([references/integrator-api.md](references/integrator-api.md#what-a-call-can-reach)) |
| `ReferenceError: lookupcaches is not defined` | The call's module object wasn't imported | `import { lookupcaches } from 'integrator-api'` |
| 422 "Doc contains unsupported postAggregate hook" | postAggregate on an HTTP records import; it belongs only on a file import that aggregates records | Use postSubmit for per-page results, or move the logic to the file import |
| 422 "...exceeds the maximum allowed difference of 3600 secs" | `debugUntil` set more than an hour ahead | `celigo scripts enable-debug <id> --duration <minutes>` (60 at most) |
| `console.debug()` lines missing from logs | No debug window was open while the script ran | Open a window first (`celigo scripts enable-debug <id>`), then reproduce; error/warn/info/log don't require it |
| Log stream is a confusing mix of unrelated entries | Script is shared across many hooks/flows and the query is unfiltered | Filter by `--flow-id`, `--level`, and date range; use each entry's `functionType` / `_resourceId` to identify the origin |
