---
name: building-flows
description: Build Celigo flows -- pipelines that move data from source systems to destination systems on a schedule or in response to events. Covers scheduling, chaining, error management, and abstract/instance templating. Use when creating, editing, or debugging flows.
---

<!-- TIER:1 -->

# Building Flows

A flow moves data from one or more source systems to one or more destination systems. It runs on a schedule, in response to events (webhooks, listeners), or when triggered by another flow. Flows are the primary way integrations get work done in Celigo.

A flow has **page generators** (exports that fetch data) and **page processors** (imports and lookups that process each record). Processors run sequentially in a flat list, or conditionally through routers that branch records to different paths. These processing pipeline mechanics -- routers, branches, page processors, response mapping -- are shared with APIs and tools (see `building-apis` and `building-tools`).

## How to Run the Steps

This skill names each build step by what it reads or changes; the exact calls depend on how you reach the account. Read the one reference that matches your tools -- both follow the step numbers of How to Build a Flow below, then the headings of Flow Operations:

- **Celigo MCP tools** (`get_resource`, `create_resource`, `update_resource`, `patch_resource`, `run_flow`, ...) -- [references/mcp.md](references/mcp.md)
- **The `celigo` CLI** -- [references/cli.md](references/cli.md)

Planning and checking what already exists only read the account. Creating or changing a resource, enabling a flow, running it, and retrying or resolving its errors all write to the account or to the connected systems. The two surfaces differ most on writes -- which fields can be changed on their own, and whether the read-modify-write of a full update is done for you -- so follow your reference there.

## What Starts a Flow

Flows **start themselves** -- this is the biggest thing that separates them from APIs (invoked by an HTTP caller) and tools (invoked by a consumer). Every flow begins with one or more page generators, of two kinds:

- **Scheduled exports** -- the flow runs on a cron cadence and each run pulls from the source: everything (full sync), only what changed since the last run (delta sync), records matching a query, or files landed in an FTP/SFTP/S3 folder. The right primitive for batch work: nightly reconciliations, hourly delta syncs, backfills, off-peak windows.
- **Listeners** -- the source pushes to the flow. A webhook fires (or a NetSuite/Salesforce native real-time event triggers) and the payload immediately starts flowing. No schedule; the flow runs as events arrive. The right primitive for event-driven work ("when X happens, do Y"), especially when latency matters.

A flow can mix both, and multi-generator designs are common:

- **Real-time plus batch safety net** -- a listener catches events as they fire; a scheduled export reconciles at off-peak hours, catching up after webhook outages
- **Consolidating sources** -- customers from Salesforce AND HubSpot, each with its own generator, feeding the same downstream pipeline
- **Different slices of the same source** -- one export pulls new records, another pulls updated records, when the API exposes them separately

If the requirement is "every night at 2 AM, do X" or "when a webhook arrives, do Y" -- that lives on a flow. APIs and tools have no schedule and no listener; they only run when invoked.

## Fetched Data Needs a Downstream Consumer

A common design mistake: ending a flow on an import that *fetches* data back from a remote system (a preview call, a query, a lookup-shaped POST) and relying on response mapping to capture the result. Response mapping makes fields visible to the NEXT step -- if no next step exists, the captured data is discarded when the run ends and nobody sees it.

When the requirement says "preview / estimate / retrieve / fetch / check / look up", the design needs at least one of:

- **A write-back import** to the source system (most common) -- e.g. source export -> preview import -> update import that writes the captured fields onto the source record
- **A persistent destination** the user named (file to S3/SFTP, email, database)
- **A router or AI agent step** that consumes the captured data within the same run

A two-step export -> fetch-shaped-import flow with nothing after it is a smell -- re-read the intent for where the fetched data should end up. The same applies in reverse: capturing a created record's ID via response mapping is only useful if a later step writes it somewhere.

## Flow Topologies

### Linear Flows

A flat `pageProcessors[]` list with no routers. One or more page generators feed records through a sequential chain of page processors. Each processor is either an import (`type: "import"`) or a lookup export (`type: "export"`). Records pass through every step in order. Unique to flows -- APIs and tools always use routers.

### Branching Flows

Page generators feed records into `routers[]` instead of `pageProcessors[]`. Each router evaluates records against branch conditions and routes them to matching branches. Branches contain their own `pageProcessors[]` and can chain to other routers via `nextRouterId`.

Two routing modes (shared with APIs and tools):
- **Input filters** (`routeRecordsUsing: "input_filters"`) -- S-expression rules on each branch; last branch can omit filter as a catch-all
- **Script-based** (`routeRecordsUsing: "script"`) -- a JavaScript function returns the branch name

Flows support both `first_matching_branch` and `all_matching_branches` routing. APIs only support `first_matching_branch`. Tools support `first_matching_branch` only.

A flow uses EITHER `pageProcessors` (linear) OR `routers` (branching) at the top level -- not both.

When a branching flow needs linear steps before the branch point (e.g., a lookup enrichment or AI classification that all branches depend on), use a **pass-through router**: a single-branch router with `nextRouterId` pointing to the branching router. Omit `routeRecordsTo` and `routeRecordsUsing` on the pass-through router -- including them makes it appear as a filter-based branch in the UI. The API defaults are sufficient.

### Abstract / Instance Flows

A template/inheritance model. An abstract flow (`isAbstract: true`) defines the complete graph but cannot execute. Instance flows (`_abstractFlowId`) inherit the graph and customize via an `overrides` object (connections, schedules, mappings, filters).

Use when the same flow structure is deployed across multiple regions, tenants, or environments with different connections or parameters.

## Quick Reference

### Flow Type Decision Matrix

| Pattern | Structure | Key fields | Read schema |
|---------|-----------|------------|-------------|
| Linear | Flat processor list | `pageGenerators[]`, `pageProcessors[]` | `request.yml`, `page-generator.yml`, `page-processor.yml` |
| Branching (routers) | Routers with conditional branches | `pageGenerators[]`, `routers[]` | + `router.yml`, `branch.yml` |
| Abstract / Instance | Template + per-instance overrides | `isAbstract: true` / `_abstractFlowId`, `overrides` | + `overrides-helper.yml`, `overrides.yml` |

### Minimum Required Fields

Every flow needs at minimum:
- `name` -- display name
- `_integrationId` -- parent integration
- `disabled: true` -- always create disabled
- `pageGenerators[]` -- at least one entry with `_exportId`
- **Either** `pageProcessors[]` (linear) **or** `routers[]` (branching) -- never both

### Which Schemas to Read

**Always read:**
- [request.yml](references/schemas/request.yml) -- base flow fields
- [page-generator.yml](references/schemas/page-generator.yml) -- export sources, per-generator schedules, delta coordination
- [page-processor.yml](references/schemas/page-processor.yml) -- import/export steps with responseMapping and hooks

**Add for branching flows:**
- [router.yml](references/schemas/router.yml) -- routing strategy, record distribution mode
- [branch.yml](references/schemas/branch.yml) -- input filters, per-branch processors, chaining

**Add if response mapping is needed:**
- [response-mapping.yml](references/schemas/response-mapping.yml) -- extract/generate pairs for carrying data between steps

**All available schemas** (in [references/schemas/](references/schemas/)):

- **Base fields (all flows):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **Page generators:** [page-generator.yml](references/schemas/page-generator.yml)
- **Page processors:** [page-processor.yml](references/schemas/page-processor.yml)
- **Response mapping:** [response-mapping.yml](references/schemas/response-mapping.yml)
- **Routers:** [router.yml](references/schemas/router.yml)
- **Branches:** [branch.yml](references/schemas/branch.yml)
- **Abstract flow helpers:** [overrides-helper.yml](references/schemas/overrides-helper.yml)
- **Instance overrides:** [overrides.yml](references/schemas/overrides.yml)
- **Cloning:** [clone-request.yml](references/schemas/clone-request.yml), [clone-response.yml](references/schemas/clone-response.yml)

## Related Skills

- **configuring-connections** ([Quick Reference](../configuring-connections/SKILL.md#quick-reference)) -- connection types and auth methods for page generators and processors
- **configuring-exports** ([Quick Reference](../configuring-exports/SKILL.md#quick-reference)) -- building exports used as page generators and lookup processors
- **configuring-imports** ([Quick Reference](../configuring-imports/SKILL.md#quick-reference)) -- building imports used as page processors
- **writing-mappings** ([Mapper 2.0 Workflow](../writing-mappings/SKILL.md#mapper-20-workflow)) -- field mappings on imports and response mapping between steps
- **writing-scripts** ([Data Pipeline Hooks](../writing-scripts/SKILL.md#data-pipeline-hooks)) -- preSavePage, preMap, postMap, postSubmit, postResponseMap hooks
- **writing-handlebars** ([Quick Reference](../writing-handlebars/SKILL.md#quick-reference)) -- dynamic values in URIs, filters, delta tokens, SQL queries
- **troubleshooting-flows** ([Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow)) -- diagnosing flow failures, errors, and performance issues

<!-- TIER:2 -->

## How to Build a Flow

### 1. Plan the flow

Before creating anything, decide what kind of operation this is:

**Decision tree:**

- **Modifying an existing flow's step config** (export settings, import mappings, scripts) -- work on the step directly, not the flow: change the export or import itself, or follow the relevant skill (configuring-exports, configuring-imports, writing-scripts, writing-mappings)
- **Modifying an existing flow's structure** (add/remove steps, change schedule, rename) -- read the flow, modify the structure, and write the complete document back. Don't rebuild from scratch. Only a few single fields (the name, enable/disable) can be changed on their own -- your reference lists them
- **Building a new flow where every step is known** -- build directly, bottom-up (skip to step 2)
- **Any ambiguity about what steps are needed** -- design first. List every system, every data direction, every step before writing any JSON

**Design checklist (when ambiguity exists):**

- What source systems? What destination systems?
- What data moves between them, in which direction?
- How often? (cron schedule, webhook trigger, on-demand)
- What happens when a step fails? (`proceedOnFailure`, error notifications)
- Do downstream steps need data from upstream responses? (response mapping)
- Is this a one-off or a reusable template? (abstract/instance flow)
- Sandbox or production? (never mix -- `sandbox: true` flows only use `sandbox: true` connections)

### 2. Identify the integration

Every flow belongs to an integration (the container). Find or create the integration first: list the account's integrations and pick the one this flow belongs to.

### 3. Check for existing patterns

Before building from scratch, check what already exists in the account and marketplace:

- Search the account for similar resources by keyword
- Show what an existing resource uses and what uses it
- Find orphaned resources, offline connections, and untriggered flows
- Search the marketplace for pre-built integration templates, and preview a template before installing it

### 4. Build the connections, exports, and imports

Flows reference existing resources. Build bottom-up: connections first, then exports and imports that use those connections, then the flow that wires them together. List the account's connections, exports, and imports first to see what already exists.

For every step, match the adaptor to the target application -- raw HTTP is the fallback, not the default. Use the native adaptor when one exists (NetSuite, Salesforce, databases, FTP/S3); otherwise check the HTTP connector catalog for a pre-built connector (550+ apps) and build the connection from it; hand-write HTTP config from public API docs only when no connector exists or it doesn't cover the endpoint. See **configuring-exports** ([Check for a pre-built connector](../configuring-exports/SKILL.md#3-check-for-a-pre-built-connector)) and **configuring-imports** ([Check for a pre-built connector](../configuring-imports/SKILL.md#3-check-for-a-pre-built-connector)).

See `configuring-exports` and `configuring-imports` for how to build each resource.

### 5. Choose the topology

| Scenario | Topology |
|----------|----------|
| All records follow the same path | Linear (`pageProcessors`) |
| Records need conditional routing by field values | Branching with input filters |
| Routing logic requires custom JavaScript | Branching with script router |
| Records should fan out to all matching paths | Branching with `all_matching_branches` |
| Same structure across multiple tenants/regions | Abstract + instance flows |

**Abstract/instance flows:** Abstract flows are reusable templates that cannot run directly. Instance flows inherit the abstract's structure and override specific fields (connections, filters, schedules). Use when the same integration pattern repeats across tenants or regions. Create with `isAbstract: true`. Top-level `pageProcessors` are automatically wrapped into a single-branch router. Instance flows reference the abstract via `_abstractFlowId` and specify overrides -- they do NOT use the normal scaffolding process. `_integrationId` is NOT inherited and must be set explicitly on the instance.

### 6. Design the step sequence

For each step, decide:
- **Type** -- `import` (write to destination) or `export` (lookup for enrichment)
- **Response mapping** -- what data from this step's response do downstream steps need? **Only add response mapping when downstream steps need fields that aren't already in the record or when field names need to change.** If the lookup returns fields with the same names the downstream step expects, skip the response mapping -- it adds complexity without value.
- **proceedOnFailure** -- should the pipeline continue if this step fails?
- **Hooks** -- does this step need a `postResponseMap` script?

### 7. Build the flow JSON

Reference the schemas listed in the Quick Reference above for exact field schemas.

### 8. Configure scheduling

Pair `schedule` (6-field cron) with `timezone` (IANA). Omit both for listener/webhook/realtime flows. `timezone` defaults to UTC, which is usually wrong for human-facing schedules ("9 AM every weekday" should survive daylight saving).

Individual page generators can override the flow schedule via their own `schedule` field (e.g. one source syncs hourly, another nightly, in the same flow).

### 9. Set the runtime controls

Flow-level and per-step switches that change production behavior. APIs and tools have none of these -- they are flow-only.

| Control | Where | Default | Flip it when |
|---|---|---|---|
| `proceedOnFailure` | per processor | `false` (a failed record stops there) | The step is non-critical and downstream steps still do meaningful work without it (a Slack notification late in the flow shouldn't block the sync). Keep `false` when downstream depends on this step's output |
| `skipRetries` | flow, and per generator | `false` (failed jobs retry) | Work is time-sensitive (retrying a stale webhook is meaningless) or non-idempotent (retries risk duplicates). Per-generator override: set it only on the real-time generator |
| `runPageGeneratorsInParallel` | flow | `false` (generators run sequentially) | Sources are independent and can take the load. Careful: parallel generators hitting the same API can blow rate limits that sequential runs respect |
| `autoResolveMatchingTraceKeys` | flow | duplicate trace keys raise an error | The source genuinely emits duplicates in normal operation, or the flow is intentionally idempotent. Don't enable it to paper over upstream duplication |

### 10. Configure chaining (if needed)

- `_runNextFlowIds` -- trigger other flows when this one completes. The classic use is multi-stage pipelines: "after the customer-master sync finishes, run the orders sync." When a requirement says "X has to happen, *then* Y", chain two focused flows rather than building one big one
- `_runNextExportIds` -- more granular: trigger specific exports inside other flows instead of the whole flow

### 11. Create disabled, verify, enable

Always create with `disabled: true`. Verify the structure by reading the flow back. Enable only after verification.

## Flow Operations

The operations on a flow beyond building it. Each reference lists its calls under these same headings and names the ones its surface lacks.

- **Read and write** -- list flows, read one, create one, replace a whole flow, change individual fields, delete one
- **Run** -- run on demand, optionally overriding the delta window (a start and end date) or running only some of the page generators
- **Test run** -- run the flow in test mode, stage by stage, then read one step's per-stage results
- **Clone** -- copy a flow into a target integration and environment, mapping each source connection to a target connection, optionally into a flow group
- **Change the structure** -- add a page generator (optionally with its own schedule, at a chosen position) or remove one; add or remove a page processor, at the top level or inside a router branch; replace one connection with another across every step
- **Manage errors** -- list a step's open or resolved errors; resolve, retry, assign (to a user by email), or tag them; delete resolved errors; read one error with its retry data and its HTTP request and response; edit an error's retry data before a retry; count open errors per step; group a step's errors by pattern
- **Debug** -- read a step's captured HTTP requests and one request's detail; arm and disarm execution logging; read a run's per-record execution logs, one record's stages, and one stage's data
- **Read the delta checkpoint** -- the flow's last export date
- **Organize with flow groups** -- list an integration's flow groups, create one, and assign flows to it

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a flow, verify:

- [ ] `_integrationId` references a real integration (confirm by reading the integration by id)
- [ ] `disabled: true` is set for initial creation -- an enabled flow with a schedule runs immediately
- [ ] `schedule` is 6-field cron with seconds: `"? */5 * * * *"` (first field is always `?`)
- [ ] `pageProcessors[]` and `routers[]` are mutually exclusive -- a flow uses one or the other, never both
- [ ] Router IDs are unique within the flow (random alphanumeric, e.g., `"N8Q9NX24Sj5"`)
- [ ] Every branch `nextRouterId` references an existing router `id` in the same flow

## Gotchas

1. **PUT erases omitted fields.** A full update replaces the whole document: always read it first, modify, then write the complete document back. Your reference says which single fields can be changed on their own and whether your surface does the read-modify-write for you.
2. **`pageProcessors` and `routers` are mutually exclusive.** A flow uses one or the other at the top level. Setting both causes validation errors.
3. **Router IDs must be unique within a flow.** Use random alphanumeric strings (e.g., `"N8Q9NX24Sj5"`). `nextRouterId` must reference an existing router `id` in the same flow.
4. **Create flows with `disabled: true`.** An enabled flow with a schedule will run immediately. Enable only after verification.
5. **Build order matters.** Connection -> Export -> Import -> Flow. The API rejects references to non-existent resources.
6. **Schedule is 6-field cron with seconds.** Format: `"? minute hour dayOfMonth month dayOfWeek"`. The first field is always `?`. Common mistake: using 5-field cron without the seconds position.
7. **Instance flows cannot define structure.** Do not set `pageGenerators`, `pageProcessors`, or `routers` on instance flows -- these are inherited from the abstract flow. All customizations go through `overrides`.
8. **Instance flow `overrides` is full-replace on PUT.** Omitting an override entry removes it. Always read the instance, merge your changes into its `overrides`, then write it back.
9. **Empty `pageProcessors: []` in a branch is the discard pattern.** Records matching that branch are dropped. A branch with no `inputFilter` serves as a catch-all.
10. **`responseMapping` uses Transformation 1.0 syntax** (extract/generate pairs), not expression-based transforms. Lookup export responses use `data[0].fieldName`; import responses use `_json.fieldName`.
11. **Don't add unnecessary transforms on lookups.** If the lookup returns fields with the same names the downstream import expects, skip the transform -- the data flows through as-is. Only add a transform when you need to rename fields, reshape nested structures, or drop fields. An identity transform (e.g., `errorId` -> `$.errorId`) adds complexity for no benefit.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `"pageProcessors" is not allowed when "routers" is present` | Both `pageProcessors[]` and `routers[]` set on the same flow | Remove one -- use `pageProcessors` for linear, `routers` for branching |
| `Invalid reference: _integrationId` | Integration ID does not exist or is misspelled | Read the integration by id to confirm it exists |
| `Invalid reference: _exportId` / `_importId` | Export or import referenced in a page generator/processor does not exist | Create the export/import first, then reference it |
| `Invalid reference: _connectionId` | Connection ID on an export or import does not exist | Read the connection by id to confirm it exists |
| `Duplicate router id` | Two routers in the same flow share the same `id` | Assign unique alphanumeric IDs to each router |
| `Invalid nextRouterId` | A branch references a router `id` that does not exist in the flow | Ensure `nextRouterId` matches an actual router `id` in the same flow |
| `Invalid cron expression` | Schedule uses 5-field cron or wrong format | Use 6-field format: `"? */5 * * * *"` (seconds field first, always `?`) |
| Flow runs immediately after creation | Created with `disabled: false` or `disabled` omitted (defaults to enabled) | Always set `disabled: true` on create; enable after verification |
