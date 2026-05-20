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
- **Response mapping** -- extracting fields from each page processor's response back into the record for downstream steps. Configured on each `pageProcessors[]` entry, same as in flows. For lookup exports the response has `data[]` and `errors[]` (use `data[0].fieldName` for single results). For imports the response is via `_json` (use `_json.fieldName`)
- **postResponseMap hook** -- JavaScript processing after response mapping, configured on `pageProcessors[]` entries

Used across integrations alongside flows and tools. APIs do not have their own authentication -- incoming requests authenticate via the Celigo API token; outbound calls to external systems use the connections referenced by exports/imports in the pipeline.

## API Modes

### Builder Mode (`type: "builder"`)

Visual configuration with discrete components:

```
API (type: "builder")
+-- request            -- method, relativeURI, params, bodySchema, mockRequest, transform
+-- routers[]          -- processing pipeline (same structure as flow routers)
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

**Legacy APIs** (no `type` field, top-level `_scriptId` + `function`) exist in production but are not represented in the current spec. Distinguish by: if `type` is absent/null and `_scriptId` is present, it's legacy.

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

# Show what an existing API uses (exports, imports, connections)
celigo account deps api <id>

# Find orphaned resources that could be reused
celigo account lint

# Search for APIs already in the account for patterns
celigo apis list | grep -i "<keyword>"

# Check existing exports/imports that could serve as pipeline steps
celigo exports list | grep -i "<system-name>"
celigo imports list | grep -i "<system-name>"

# Search marketplace for pre-built integration templates
celigo templates search "<application-name>"
```

The account index auto-refreshes when stale (>4 hours). Force a fresh snapshot with `celigo account snapshot`.

### 4. Create the supporting resources (bottom-up)

APIs reference exports and imports as page processors -- these must exist before you can attach them. Build order:

1. **Connections** -- create or reuse connections to the target systems
2. **Exports** -- for lookups that query external systems (use `configuring-exports` skill)
3. **Imports** -- for writes to external systems (use `configuring-imports` skill)

### 5. Define the request (builder mode)

Choose the HTTP method and URI path. GET and POST are most common; PUT and PATCH are rare.

- Path parameters use colon notation: `/customers/:id`
- Document query parameters, path parameters, headers, and body schema
- Add a `mockRequest` for testing the pipeline without live calls
- Optionally add a request `transform` (expression-based or script-based) to reshape incoming data before processing

### 6. Build the processing pipeline

The pipeline is made of routers, branches, and page processors. See [router.yml](references/schemas/router.yml) for the full schema.

Every builder API needs at least one router -- it's the container that holds branches, and branches hold the page processors that do the actual work. Use multiple branches when different request conditions need different processing paths (e.g., branch by HTTP method, request field value, or record type). Use multiple routers when you need sequential stages of processing where each stage can branch independently.

For pass-through routers (single branch, no filters, just linear steps before a branching router), omit `routeRecordsTo` and `routeRecordsUsing` -- including them makes it appear as a filter-based branch in the UI. The API defaults are sufficient.

Input filters use s-expression syntax: `["operator", ["type", ["extract", "field"]], value]`. Type wrappers (`string`, `number`, `boolean`) are required around `extract` and `context` accessors. Logical combinators: `["and", cond1, cond2]`, `["or", cond1, cond2]`.

The last branch in the chain must set `nextRouterId: "apiRouter"` to reach the response router.

### 7. Configure responses

Every builder API needs exactly one `success` response and one `fail` response. Add `custom` responses for specific scenarios (e.g., 404 not found, 422 validation error).

Each response has:

- `statusCode` (HTTP status code)
- `inputFilter` to determine when it's selected (typically `["equals", ["boolean", ["context", "success"]], true]` for success)
- `mappings` to shape the response body from the processed record
- Optional `bodySchema` for documentation, `headers`, `lookups`, and `hooks` (preMap, postMap)

### 8. Configure the response router

Set `id: "apiRouter"` and choose routing method:

- `input_filters` (default) -- evaluates each response's `inputFilter`
- `script` -- custom JavaScript returns the response `id` to use

### 9. Build the JSON

Reference the [Schema Index](#schema-index) above for exact field schemas.

Every API needs at minimum: `name`, `type`, and either `builder` (with `request`) or `script` (with `_scriptId` and `function`).

## CLI Commands

```bash
# CRUD
celigo apis list
celigo apis get <id>
celigo apis create < api.json
celigo apis update <id> < api.json
celigo apis set <id> key=value [key2=value2 ...]
celigo apis delete <id>

# Clone (builder-mode only)
celigo apis clone <id> --api-version <version> [--name <name>] [--description <desc>] [--environment <envId>]

# Pipeline management
celigo apis add-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>]
celigo apis remove-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>]

# Logs
celigo apis logs <id>
celigo apis log-detail <id> <key>

# Test run
celigo apis test-run <id>
celigo apis test-run-step <id> <runId> <exportOrImportId>
celigo apis test-run-step-logs <id> <runId> <exportOrImportId>

# Debug (for exports/imports within the API pipeline)
celigo apis debug-requests <id> <exportOrImportId> [--since <minutes>]
celigo apis debug-request-detail <id> <exportOrImportId> <key>

# Discovery
celigo account search "<keyword>"
celigo templates search "<name>"
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating an API, verify:

- [ ] `name` is set and descriptive
- [ ] `type` is `"builder"` or `"script"` (not omitted, which creates a legacy API)
- [ ] Builder mode: `builder.request.method` and `builder.request.relativeURI` are set
- [ ] Builder mode: at least one router with at least one branch exists
- [ ] Builder mode: last branch has `nextRouterId: "apiRouter"`
- [ ] Builder mode: both `success` and `fail` responses are defined
- [ ] Builder mode: success response `inputFilter` uses `["equals", ["boolean", ["context", "success"]], true]`
- [ ] Script mode: `script._scriptId` and `script.function` reference a valid script
- [ ] All `_exportId` and `_importId` references in page processors point to existing resources
- [ ] Router IDs are unique within the API
- [ ] `version` is set (it becomes part of the endpoint URL: `/{version}{relativeURI}`)
- [ ] Input filter expressions wrap `extract`/`context` accessors in type wrappers (`string`, `number`, `boolean`)

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this automatically.
2. **APIs only support `first_matching_branch` routing.** Unlike flows which also support `all_matching_branches`, API routers always stop at the first matching branch.
3. **Omitting `inputFilter` type wrappers silently fails.** Use `["boolean", ["context", "success"]]`, not bare `["context", "success"]` -- the filter will never match without the wrapper.
4. **Clone only works for builder-mode APIs.** Script and legacy APIs cannot be cloned via the CLI.
5. **Missing a success or fail response causes undefined behavior.** The response router won't know where to route.
6. `**version` becomes part of the URL path.** The full endpoint is `/{version}{relativeURI}`. Changing the version changes the URL that callers must use.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `404` on API endpoint | Wrong `version` or `relativeURI` in the request | Verify the full URL is `/{version}{relativeURI}` and both match the API definition |
| `422` validation error on create/update | Missing required fields or invalid field values | Check the [Pre-Submit Checklist](#pre-submit-checklist); verify `type` is set |
| Response always returns the `fail` response | Success `inputFilter` is malformed or missing type wrapper | Use `["equals", ["boolean", ["context", "success"]], true]` exactly |
| Response body is empty | Response `mappings` not configured or field paths don't match | Verify mapping extract paths match the actual processed record structure |
| Pipeline step silently skipped | `inputFilter` on a branch evaluates to false for all records | Debug with `celigo apis test-run-step` to see each step's input/output |
| `Clone failed` error | Attempting to clone a script-mode or legacy API | Clone is builder-mode only; recreate script APIs manually |
| Page processor returns no data | Export/import `_id` reference is wrong or resource is disabled | Verify the referenced resource exists and is enabled with `celigo exports get` / `celigo imports get` |
| `Router ID not found` error | `nextRouterId` references a non-existent router ID | Ensure all `nextRouterId` values match a real router `id` or `"apiRouter"` |
