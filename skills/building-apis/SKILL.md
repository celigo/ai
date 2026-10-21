---
name: building-apis
description: Build Celigo APIs -- custom HTTP endpoints that let external systems push or query data synchronously through Celigo integrations. Use when creating APIs, proxying authenticated requests, or exposing lookup/write operations as a REST interface that returns a structured response.
---

<!-- TIER:1 -->

# Building APIs

An API is a **RESTful endpoint** that exposes integration logic for external consumption. External systems call the API over HTTP; the API processes the request through lookups and imports, then returns a structured response. Concerns when building an API:

- **Mode selection** -- builder (visual configuration) vs script (full JavaScript control)
- **Request definition** -- HTTP method, URI path, parameters, body schema, request transformation
- **Processing pipeline** -- routers and page processors (lookups + imports) that execute business logic
- **Response routing** -- directing processed data to the correct response definition based on success/failure or custom conditions
- **Response shaping** -- status codes, field mappings, body schema, hooks (preMap, postMap) on each response
- **Response mapping** -- extracting fields from each page processor's response back into the record for downstream steps. Configured on each `pageProcessors[]` entry, same as in flows. For lookup exports the response has `data[]` and `errors[]` (use `data[0].fieldName` for single results). For imports use `id` for the created record's ID and `_json.fieldName` for response-body fields
- **postResponseMap hook** -- JavaScript processing after response mapping, configured on `pageProcessors[]` entries

Used across integrations alongside flows and tools. APIs do not have their own authentication -- incoming requests authenticate via the Celigo API token; outbound calls to external systems use the connections referenced by exports/imports in the pipeline.

## The Request IS the Source Record

APIs are invoked by an external HTTP caller -- there is no upstream export, no scheduler, no listener feeding them. That has three design consequences:

- **The request body is the input shape.** What the caller sends in the body is what downstream processing sees as the record. Don't assume path params, query params or headers are on `record`: in a test run they reach neither the record nor the request `transform`, so check a real call before building logic on them. There is no upstream pipeline to reshape the body first -- use the request `transform` if it needs reshaping before routing.
- **The response stage is the output.** Whatever the selected response definition produces is exactly what the caller receives. Nothing runs after it.
- **No self-starting.** APIs have no `schedule`, no listener, and none of the flow-level runtime controls (`skipRetries`, chaining). "Every night at 2 AM, do X" is a flow -- possibly one that *calls* the API, but the schedule lives on the flow. Retry-after-failure is the caller's decision. A page processor's `proceedOnFailure` does apply (see [Response selection](#response-selection----success-fail-custom)).

When a flow needs to invoke an API, it does so as an ordinary HTTP caller (an HTTP export/import pointing at the API's URL). There is no special flow-step-to-API wiring.

A top-level `disabled: true` takes the API offline without deleting it -- callers get a 404 until it's re-enabled.

## API Modes

### Builder Mode (`type: "builder"`)

Visual configuration with discrete components:

```
API (type: "builder")
+-- request            -- method, relativeURI, params, bodySchema, mockRequest, transform
+-- routers[]          -- optional processing pipeline (same structure as flow routers)
|   +-- branches[]
|       +-- inputFilter        -- when to use this branch (s-expression rules)
|       +-- pageProcessors[]   -- lookups (exports) and imports
|       +-- nextRouterId       -- chain to next router, or "apiRouter" to finish
+-- responseRouter     -- id="apiRouter", routes processed data to a response
+-- responses[]        -- success, fail, custom -- each with statusCode, inputFilter, mappings
```

The incoming HTTP request **replaces the export** as data source. Routers and page processors work identically to flows.

#### API Execution Pipeline (Builder Mode)

When an API receives a request:

1. **Request received** -- method + path matched against the API endpoint definition
2. **Request transform** (optional) -- reshapes the incoming request body before routing
3. **Router evaluation** -- `routeRecordsUsing` evaluates branch input filter conditions
4. **Branch selection** -- first matching branch processes the request
5. **Page processors** -- each processor in the branch executes sequentially (export lookups, import writes)
6. **Response mapping** -- `responseMapping` on each processor carries data forward to the next processor
7. **Response router** -- `responseRouter` (id="apiRouter") selects which response template to use based on response input filters
8. **Response** -- selected response template returned to the caller with its statusCode, headers, and body

### Script Mode (`type: "script"`)

A single `handleRequest` JavaScript function receives the request object (method, headers, queryParams, body, pathParams) and returns `{statusCode, headers, body}`. Complete control with no visual configuration.

**Legacy APIs** (no `type` field, top-level `_scriptId` + `function`) can still turn up in an account but are not represented in the current spec. Distinguish by: if `type` is absent/null and `_scriptId` is present, it's legacy.

## Quick Reference

### Decision Matrix

| Scenario | Mode | Why |
|----------|------|-----|
| Standard lookup/write with structured response | Builder | Visual debugging, test runs, structured responses |
| Multiple response shapes based on success/failure | Builder | Response router + inputFilter handles this declaratively |
| Complex conditional logic or custom auth validation | Script | Full JavaScript control over request/response |
| Dynamic routing that can't be expressed as input filters | Script | `handleRequest` can implement arbitrary logic |
| Proxy through an authenticated connection | Builder | Wire the connection's export/import as a page processor |
| Simple webhook receiver that transforms and forwards | Builder | Single router, single branch, one import |

### Minimum Required Fields

| Mode | Required Fields |
|------|----------------|
| Builder | `name`, `type: "builder"`, `builder.request` (method + relativeURI) |
| Script | `name`, `type: "script"`, `script._scriptId`, `script.function` |
| Legacy | `name`, `_scriptId`, `function` (no `type` field) |

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

| Schema | What it defines |
|--------|----------------|
| [request.yml](references/schemas/request.yml) | Top-level API fields (name, type, version, disabled, builder/script refs) |
| [response.yml](references/schemas/response.yml) | API response shape |
| [builder.yml](references/schemas/builder.yml) | Builder configuration (request, routers, responseRouter, responses refs) |
| [api-request.yml](references/schemas/api-request.yml) | Request config (method, relativeURI, params, bodySchema, mockRequest, transform) |
| [api-response.yml](references/schemas/api-response.yml) | Response definitions (id, name, type, statusCode, inputFilter, mappings, hooks) |
| [response-router.yml](references/schemas/response-router.yml) | Response router (id="apiRouter", routeRecordsUsing) |
| [router.yml](references/schemas/router.yml) | Routers (branches, inputFilter, pageProcessors) |
| [script.yml](references/schemas/script.yml) | Script config (_scriptId, function) |
| [apim.yml](references/schemas/apim.yml) | APIM metadata (publication status) |
| [shipworks.yml](references/schemas/shipworks.yml) | Legacy ShipWorks auth |

## Related Skills

- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- building lookup exports used as page processors in the API pipeline
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- building imports used as page processors in the API pipeline
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- flows share the same router/branch/pageProcessor pipeline mechanics
- [writing-scripts > Quick Reference](../writing-scripts/SKILL.md#quick-reference) -- writing `handleRequest` (script-mode APIs), `preMap`/`postMap` hooks, and `postResponseMap`
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- dynamic expressions in request bodies, URIs, and response mappings
- [configuring-filters > Quick Reference](../configuring-filters/SKILL.md#quick-reference) -- input filters on router branches to conditionally route records

<!-- TIER:2 -->

## How to Build an API

### 1. Plan what the API needs to do

Before creating anything, understand the requirements: what endpoint the caller needs, what data it sends, what systems are involved, what the response should look like. This determines everything -- mode, pipeline shape, which connections/exports/imports are needed.

### 2. Decide the mode

Use **builder** for most APIs -- it provides visual debugging, test runs, and structured responses. Use **script** only when the processing logic is too dynamic for the visual pipeline (e.g., complex conditional responses, custom auth validation, dynamic routing).

### 3. Check for existing resources

Look for connections, exports, and imports that can be reused before creating new ones.

```bash
# Search across all resource types in the account
celigo account search "<keyword>"

# Show what an existing API uses -- the local index records no edges out of APIs
celigo apis connections <id>
celigo apis get <id>

# Find orphaned resources that could be reused
celigo account lint

# Search for APIs already in the account for patterns
celigo apis list | grep -i "<keyword>"

# Check existing exports/imports that could serve as pipeline steps
celigo exports list | grep -i "<system-name>"
celigo imports list | grep -i "<system-name>"

# Search marketplace for pre-built integration templates
celigo templates marketplace
```

The account index auto-refreshes when stale (older than 15 minutes by default). Force a fresh snapshot with `celigo account snapshot`.

### 4. Create the supporting resources (bottom-up)

APIs reference exports and imports as page processors -- these must exist before you can attach them. Build order:

1. **Connections** -- create or reuse connections to the target systems
2. **Exports** -- for lookups that query external systems (use `configuring-exports` skill)
3. **Imports** -- for writes to external systems (use `configuring-imports` skill)

### 5. Define the request (builder mode)

Choose the HTTP method and URI path. GET and POST are most common; PUT and PATCH are rare.

- Path parameters use colon notation: `/customers/:id`
- Document query parameters, path parameters, headers, and body schema
- Save a `mockRequest` as a sample request, but send the test request explicitly when you test (step 10)
- Optionally add a request `transform` (expression-based or script-based) to reshape incoming data before processing

### 6. Build the processing pipeline

The pipeline is made of routers, branches, and page processors. See [router.yml](references/schemas/router.yml) for the full schema.

Routers are optional: an API that only reshapes the request can go straight to the response router, with the responses mapping request fields. Once the API calls other systems, add a router -- it's the container that holds branches, and branches hold the page processors that do the actual work. Use multiple branches when different request conditions need different processing paths (e.g., branch by HTTP method, request field value, or record type). Use multiple routers when you need sequential stages of processing where each stage can branch independently.

For pass-through routers (single branch, no filters, just linear steps before a branching router), omit `routeRecordsTo` and `routeRecordsUsing` -- including them makes it appear as a filter-based branch in the UI. Leaving both unset is the pass-through shape; the server fills in no default.

Input filters use s-expression syntax: `["operator", ["type", ["extract", "field"]], value]`. Type wrappers (`string`, `number`, `boolean`) are required around `extract` and `context` accessors. Logical combinators: `["and", cond1, cond2]`, `["or", cond1, cond2]`.

The last branch in the chain must set `nextRouterId: "apiRouter"` to reach the response router.

### 7. Configure responses

Every builder API needs exactly one `success` response and one `fail` response. Add `custom` responses for specific scenarios (e.g., 404 not found, 422 validation error), and list them before `success`: the first response in `responses[]` whose `inputFilter` matches is the one returned, and a response without an `inputFilter` matches every request.

Each response has:

- `statusCode` (HTTP status code)
- `inputFilter` to determine when it's selected (optional; see [Response selection](#response-selection----success-fail-custom))
- `mappings` to shape the response body from the processed record
- Optional `bodySchema` for documentation, `headers`, `lookups`, and `hooks` (preMap, postMap)

### 8. Configure the response router

Set `id: "apiRouter"` and choose routing method:

- `input_filters` (default) -- evaluates each response's `inputFilter`
- `script` -- custom JavaScript returns the response `id` to use

### 9. Build the JSON

Reference the [Schema Index](#schema-index) above for exact field schemas.

Every API needs at minimum: `name`, `type`, and either `builder` (with `request`) or `script` (with `_scriptId` and `function`).

A complete builder API with one lookup, a 404 for "not found", a nested success body and the fail response. `request`, `routers`, `responseRouter` and `responses` are siblings under `builder`:

```json
{
  "name": "Get item stock",
  "type": "builder",
  "version": "v1",
  "disabled": false,
  "_integrationId": "<integration id>",
  "builder": {
    "request": {"method": "POST", "relativeURI": "/items/stock"},
    "routers": [{
      "id": "lookup_item",
      "branches": [{
        "name": "Look up the item",
        "pageProcessors": [{
          "type": "export",
          "_exportId": "<lookup export id>",
          "responseMapping": {"fields": [{"extract": "data[0]", "generate": "item"}]}
        }],
        "nextRouterId": "apiRouter"
      }]
    }],
    "responseRouter": {"id": "apiRouter", "routeRecordsUsing": "input_filters"},
    "responses": [
      {
        "id": "notFound", "name": "Not found", "type": "custom", "statusCode": 404,
        "inputFilter": {"version": "1", "rules": ["empty", ["string", ["extract", "item.sku"]]]},
        "mappings": [{"generate": "error", "dataType": "string", "hardCodedValue": "Item not found", "status": "Active"}]
      },
      {
        "id": "success", "name": "Success", "type": "success", "statusCode": 200,
        "mappings": [{
          "generate": "item", "dataType": "object", "status": "Active",
          "mappings": [
            {"generate": "sku", "dataType": "string", "extract": "$.item.sku", "status": "Active"},
            {"generate": "onHand", "dataType": "number", "extract": "$.item.onHand", "status": "Active"}
          ]
        }]
      },
      {"id": "fail", "name": "Fail", "type": "fail", "statusCode": 500, "mappings": []}
    ]
  }
}
```

The lookup's first record lands on the record as `item`, the custom 404 comes first so it answers when the lookup found nothing, and `success` (no filter) answers everything else.

### 10. Test the API

Send the test request explicitly as `{"mockRequest": {"body": {...}}}`, in a file passed to `celigo apis test-run <id> --file <path>`. To test with the sample saved on the API, read the API first and send its `builder.request.mockRequest` as that `mockRequest`: a run without one starts from an empty record, and the saved one isn't replayed. The body must be a JSON object: an array is refused with 400 "Mock request body should be a plain object." Only the body reaches the first step. Path params, query params and headers in a test request appear nowhere in that step's context, and a request `transform` can't read them either, so check logic that depends on them with a real call. The run's `metadata` names the response it selected: `success`, `fail` or a custom response's `id` is one of its keys.

A lookup export without a saved `mockOutput` calls its live system in a test run, and the run then saves that response on the export as its `mockOutput`. Every later test run that uses the export -- from any API or Tool, whatever the request -- answers the lookup from that saved `mockOutput` instead of calling the system; real calls aren't affected. So when test runs keep returning the same lookup result for different requests, read the export's `mockOutput`, and remove it to test against live data again. Imports never send in a test run: each returns its saved `mockResponse` or a placeholder ([configuring-imports > Testing an Import Without Writing](../configuring-imports/SKILL.md#testing-an-import-without-writing)). So a passing run proves the request shaping and routing but not the writes, and it never shows up in request history. Only a real call to the endpoint does.

## The Response and Routing Model

Once the routers finish processing, the API selects which response to return and shapes its body. This is where APIs diverge most from flows -- the routing is narrower, and "mapping" happens at two distinct layers.

### Branch selection and router chaining

APIs support a single routing strategy: `first_matching_branch`. Within a router, each record is evaluated against the branches in order and taken by the *first* branch whose `inputFilter` matches; that record then follows only that branch. (Flows also offer `all_matching_branches`, which fans one record out to every matching branch -- APIs never do this. A record takes exactly one branch per router.)

Each branch's `nextRouterId` decides where the record goes after that branch's page processors finish:

- **Another router's `id`** -- chain into that router for a further stage of processing.
- **`"apiRouter"`** -- hand off to the response router (whose reserved `id` is always `apiRouter`) to finish.

Chaining lets you express sequential stages where each stage branches independently; the last branch in the chain sets `nextRouterId: "apiRouter"` to reach the response router.

### Response selection -- success, fail, custom

Every builder API has exactly one `success` response, exactly one `fail` response, and zero or more `custom` responses (the response's `type` field). The response router (`id: "apiRouter"`) picks one after processing completes:

- **`success`** -- the happy path. It isn't a fallback checked after the `custom` responses: like any response, it's returned when it's the first in the list whose `inputFilter` matches. Conventionally a 2xx `statusCode` (`200`, or `201` when the API created something).
- **`fail`** -- the error path. A step that fails (a lookup returned a 500, an import got a 4xx, a script threw) stops the request, which gets the `fail` response. Set `proceedOnFailure: true` on a page processor to let the next step run after it fails instead; the request can then still end in `success`, because `context.success` stays true. Conventionally a 4xx/5xx `statusCode` (`400` or `500`); its `mappings` surface the error message and any context the caller needs.
- **`custom`** -- a non-error, non-default response selected by its own `inputFilter`. Reach for one when the outcome fits neither `success` nor `fail`, when the `statusCode` differs, or when the body shape differs. Typical cases:
  - **`404` not found** -- the lookup ran but returned zero records (filter: the results array is empty).
  - **`409` conflict** -- the destination rejected a create because the record already exists.
  - **`202` accepted** -- processing started a background job; tell the caller "received, working on it."
  - **Conditional body** -- a different shape driven by a query parameter (e.g. `?format=summary` vs `?format=full`).

In `input_filters` mode the response router returns the first response, in list order, whose `inputFilter` matches, and a response without an `inputFilter` matches every request. So list `custom` responses ahead of `success`. A `success` listed first answers every request that didn't fail, even one a later custom filter matches, and giving it the typed filter `["equals", ["boolean", ["context", "success"]], true]` doesn't change that: `context.success` is true whenever no step failed, including when a lookup found nothing. In `script` mode a JavaScript function inspects the record and returns the response `id` to use.

### `statusCode` vs the response `type`

These are independent and often conflated:

- The response **`type`** (`success` / `fail` / `custom`) is Celigo's internal classification -- it drives which response the response router selects.
- The **`statusCode`** is the HTTP status the caller receives -- it lives on the response definition.

A `custom` response can carry any `statusCode` (the "not found" response returns `404`; the "async accepted" response returns `202`), and `success` is conventionally 2xx but doesn't have to be. So "return a `404` when the customer isn't found" means adding a `custom` response with `statusCode: 404` and an `inputFilter` that matches when the lookup's results array is empty -- not editing the `success` response.

### The two mapping layers

"Mapping" refers to two different things at two layers, and conflating them is the most common source of confusion when building APIs.

**1. Page-processor `responseMapping` (record enrichment).** Configured on a lookup or import inside a router branch -- the same shape as a flow's page-processor `responseMapping`. It pulls fields off that page processor's response and merges them onto the record so downstream routers, page processors, and response mappings can see them. It does **not** shape the HTTP body.

```
{
  "fields": [
    {"extract": "data[0].id", "generate": "customerId"},
    {"extract": "data[0].accountStatus", "generate": "status"}
  ]
}
```

**2. Response-stage `mappings` (HTTP body).** Configured on a `success` / `fail` / `custom` response (alongside its `lookups` and `hooks`). It reads the now-enriched record and builds the HTTP response body returned to the caller.

```
{
  "mappings": [
    {
      "generate": "data",
      "dataType": "object",
      "status": "Active",
      "mappings": [
        {"extract": "$.customerId", "generate": "id", "dataType": "string", "status": "Active"},
        {"extract": "$.status", "generate": "status", "dataType": "string", "status": "Active"}
      ]
    }
  ]
}
```

Response mappings are Mapper 2.0 rows. Every row needs `dataType` and `status` -- a save without `dataType` fails with 422 `Path 'dataType' is required`, once per row that omits it, and a row without `status` fails with 422 `Mapping object must have status field present.` An `extract` reads a field only as a `$.` path or Handlebars: a bare string, `record.customerId` included, is written into the body as that literal text. A dotted `generate` such as `data.id` makes one key with a dot in its name, so build nested objects as an `object` row with child `mappings`, as above.

The two work together: the lookup's `responseMapping` merges `customerId` onto the record, then the response's `mappings` place `customerId` into the body's `data.id`. A field the page processor returned must first be carried onto the record by a `responseMapping` before a response `mapping` can extract it. When unsure which layer you need, ask: does this step *add* the field to the record (page-processor `responseMapping`) or *read* the field off the record into the body (response `mappings`)?

## Observing Calls

Look for an API's calls in its request history, the run index (`celigo apis request-history <id>`; builder-mode APIs only). It covers the last 5 minutes unless you pass a window (`--time-gte`, `--time-lte`), and a new call can take a while to appear. Then open that execution's trace with `celigo apis execution-logs <id> <executionId>`; step-level trace data is recorded only under `detailed` logging or a debug window. The older request-log store (`celigo apis logs`) may hold nothing for current calls, and test runs appear in neither, so an empty result from one store doesn't prove the API wasn't called.

Change an API's logging only by patching `logging.mode` or `logging.debugUntil` (`celigo apis set <id> logging.mode=detailed`); a create or a full update ignores `logging` without an error. `noLogging` records no request history, and `standard`, `detailed` and a debug window need payload storage on the account (422 `payload_storage_required`). The modes are listed under `logging` in [base.yml](references/schemas/base.yml).

## CLI Commands

```bash
# CRUD
celigo apis list
celigo apis get <id>
celigo apis create < api.json
celigo apis update <id> < api.json
celigo apis set <id> key=value [key2=value2 ...]
celigo apis dependencies <id>                 # check before deleting
celigo apis delete <id>

# Clone (builder-mode only)
celigo apis clone <id> --api-version <version> [--name <name>] [--description <desc>] [--environment <envId>]

# Pipeline management
celigo apis add-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>]
celigo apis remove-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>]

# Request history and logging
celigo apis request-history <id> [--time-gte <iso>] [--time-lte <iso>]
celigo apis execution-logs <id> <executionId> [--details]
celigo apis set <id> logging.mode=<basic|standard|detailed|accountLevel|noLogging>
celigo apis logs <id>                         # older request-log store
celigo apis log-detail <id> <key>

# Test run (the --file body is {"mockRequest": {...}})
celigo apis test-run <id> --file <path>
celigo apis test-run-step-results <id> <runId> <exportOrImportId>
celigo apis test-run-step-logs <id> <runId> <exportOrImportId>
celigo --jq '.mockOutput' exports get <exportId>   # the saved response test runs answer this lookup from
celigo exports set <exportId> mockOutput=null      # clear it so the next test run calls the system

# Debug (for exports/imports within the API pipeline)
celigo apis debug-requests <id> <exportOrImportId> [--since <minutes>]
celigo apis debug-request-detail <id> <exportOrImportId> <key>

# Discovery
celigo account search "<keyword>"
celigo templates marketplace
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating an API, verify:

- [ ] `name` is set and descriptive
- [ ] `type` is `"builder"` or `"script"` (not omitted, which creates a legacy API)
- [ ] Builder mode: `builder.request.method` and `builder.request.relativeURI` are set
- [ ] Builder mode, full update: the body carries `disabled` (`false` keeps the API online)
- [ ] Builder mode: lookups and imports sit in a router branch (an API with no processing can omit `routers`)
- [ ] Every response `mappings[]` row has a `dataType` and `status: "Active"`, reads fields with `$.` paths or Handlebars, and nests objects with child `mappings` rather than a dotted `generate`
- [ ] Builder mode: last branch has `nextRouterId: "apiRouter"`
- [ ] Builder mode: both `success` and `fail` responses are defined
- [ ] Builder mode: `custom` responses come before `success` in `responses[]` (the first match wins, and a response without an `inputFilter` matches every request)
- [ ] Builder mode: `request`, `routers`, `responseRouter` and `responses` sit directly under `builder`, and each lookup that feeds the body has a `responseMapping` (`{"fields": [{"extract": "data[0]...", "generate": ...}]}`)
- [ ] Script mode: `script._scriptId` and `script.function` reference a valid script
- [ ] All `_exportId` and `_importId` references in page processors point to existing resources
- [ ] Router IDs are unique within the API
- [ ] `version` is set (it becomes part of the endpoint URL: `/{version}{relativeURI}`)
- [ ] Input filter expressions wrap `extract`/`context` accessors in type wrappers (`string`, `number`, `boolean`)

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this automatically. PATCH reaches only `name`, `description`, `disabled`, `timeoutPeriod`, `pagination.enabled`, `logging` and `traceKeyTemplate` (any other path is refused with 422), so a change inside `builder` -- reordering responses, editing a router -- is always a full update.
2. **APIs only support `first_matching_branch` routing.** Unlike flows which also support `all_matching_branches`, API routers always stop at the first matching branch.
3. **Omitting `inputFilter` type wrappers silently fails.** Use `["boolean", ["context", "success"]]`, not bare `["context", "success"]` -- the filter will never match without the wrapper.
4. **Clone only works for builder-mode APIs.** Script and legacy APIs cannot be cloned via the CLI.
5. **Missing a success or fail response causes undefined behavior.** The response router won't know where to route.
6. `**version` becomes part of the URL path.** The full endpoint is `/{version}{relativeURI}`. Changing the version changes the URL that callers must use.
7. **Page-processor `responseMapping` and response `mappings` are different layers.** `responseMapping` enriches the record with fields from a page processor's response; a response's `mappings` shape the HTTP body from that record. A field the lookup returned won't reach the body unless a `responseMapping` first carries it onto the record.
8. **APIs don't start themselves.** No `schedule`, no listeners, no flow-level runtime controls, no abstract/instance templating. Scheduled or event-driven work belongs in a flow that calls the API.
9. **A full update without `disabled` takes the API offline.** `disabled: true` pauses an API without deleting it (callers get a 404). Send `disabled` on every full update of a builder API (`false` to keep it online): a body that omits it saves without error, but the endpoint answers 404 `api_not_found` until `disabled: false` is sent again.
10. **Deleting an API doesn't check dependents.** The delete succeeds and the endpoint stops at once, so anything that depends on the API, such as an MCP server publishing it, breaks. Check `celigo apis dependencies <id>` first; a deleted API stays in the recycle bin for 30 days (`celigo recycle-bin restore <id>`).

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `404` on API endpoint | Wrong `version` or `relativeURI` in the request | Verify the full URL is `/{version}{relativeURI}` and both match the API definition |
| `404` `api_not_found` on an endpoint that answered before | The API is disabled, or a full update left `disabled` out | Send `disabled: false` (`celigo apis set <id> disabled=false`) |
| `422` validation error on create/update | Missing required fields or invalid field values | Check the [Pre-Submit Checklist](#pre-submit-checklist); verify `type` is set |
| Response always returns the `fail` response | A page processor fails on every request: with `proceedOnFailure` off, a failed step selects `fail` | Find the failing step in the test run's step results (`celigo apis test-run-step-results`) and fix it, or set `proceedOnFailure: true` on a step whose failure the API should tolerate |
| A custom response (a 404, say) is never returned; those requests get `success` | `success` is listed before it. Responses are checked in list order, and a `success` without a filter, or with the typed `context.success` filter, matches every request that didn't fail | Move the custom response ahead of `success` in `responses[]`, as a full update: read the API, reorder, and send the whole document back with `disabled` (PATCH can't reach `builder`) |
| Every test run returns the same lookup result, whatever the request | The lookup export has a saved `mockOutput` (the first test run that called it saved one), and test runs answer from it | Read the export's `mockOutput`; remove it to call the live system again |
| Response body is empty | Response `mappings` not configured or field paths don't match | Verify mapping extract paths match the actual processed record structure |
| `422` `Mapping object must have status field present.` | A response mapping row without `status` | Add `"status": "Active"` to every row |
| Response body holds a field's name (`"customerId"`) instead of its value, or a key with a dot in it | A bare `extract` is a literal, and a dotted `generate` is one key | Read the field with a `$.` path (`$.customerId`), and nest objects with child `mappings` |
| Pipeline step silently skipped | `inputFilter` on a branch evaluates to false for all records | Debug with `celigo apis test-run-step-results` to see each step's input/output |
| `Clone failed` error | Attempting to clone a script-mode or legacy API | Clone is builder-mode only; recreate script APIs manually |
| Page processor returns no data | Export/import `_id` reference is wrong or resource is disabled | Verify the referenced resource exists and is enabled with `celigo exports get` / `celigo imports get` |
| `Router ID not found` error | `nextRouterId` references a non-existent router ID | Ensure all `nextRouterId` values match a real router `id` or `"apiRouter"` |
| Response body missing a field the lookup returned | The page-processor `responseMapping` never carried the field onto the record | Add a `responseMapping` entry (`{"fields": [{"extract": ..., "generate": ...}]}`) on the page processor so the response `mappings` have it to extract |
