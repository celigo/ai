---
name: building-flows
description: Build Celigo flows -- pipelines that move data from source systems to destination systems on a schedule or in response to events. Covers scheduling, chaining, error management, and abstract/instance templating. Use when creating, editing, or debugging flows.
---

<!-- TIER:1 -->

# Building Flows

A flow moves data from one or more source systems to one or more destination systems. It runs on a schedule, in response to events (webhooks, listeners), or when triggered by another flow. Flows are the primary way integrations get work done in Celigo.

A flow has **page generators** (exports that fetch data) and **page processors** (imports and lookups that process each record). Processors run sequentially in a flat list, or conditionally through routers that branch records to different paths. These processing pipeline mechanics -- routers, branches, page processors, response mapping -- are shared with APIs and tools (see `building-apis` and `building-tools`).

## How to Run the Steps

This skill names each build step by what it reads or changes; the exact calls depend on how you reach the account. Read the one reference that matches your tools -- both follow the step numbers of How to Build a Flow below, then Duplicate Records and the headings of Flow Operations:

- **Celigo MCP tools** (`list_flows`, `upsert_flow`, `patch_flow`, `run_flow`, ...) -- [references/mcp.md](references/mcp.md)
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
- **Script-based** (`routeRecordsUsing: "script"`) -- a JavaScript `branching` function returns, per record, an array of branch indices -- zero-based positions in `branches[]` (e.g. `[0]`)

Flows support both `first_matching_branch` and `all_matching_branches` routing. APIs only support `first_matching_branch`. Tools support `first_matching_branch` only.

A flow uses EITHER `pageProcessors` (linear) OR `routers` (branching) at the top level -- not both.

When a branching flow needs linear steps before the branch point (e.g., a lookup enrichment or AI classification that all branches depend on), use a **pass-through router**: a single-branch router with `nextRouterId` pointing to the branching router. Omit `routeRecordsTo` and `routeRecordsUsing` on the pass-through router -- including them makes it appear as a filter-based branch in the UI. Leaving both unset is the pass-through shape; the server fills in no default.

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

- **Modifying an existing flow's step config** (export settings, import mappings, scripts) -- work on the step directly, not the flow: change the export or import itself, or follow the relevant skill (configuring-exports, configuring-imports, writing-scripts, writing-mappings). An export or import can be a step in several flows, and an edit to it changes every one of them: first list what uses it, and if another flow depends on it, confirm with the user or copy the step for this flow
- **Modifying an existing flow's structure** (add/remove steps, change schedule, rename) -- read the flow, modify the structure, and write the complete document back. Don't rebuild from scratch. Only a few single fields (the name, enable/disable, the schedule and timezone) can be changed on their own -- your reference lists them
- **Modifying an Integration App's flow** (`_connectorId` set) -- edit only what the app leaves open, such as import mappings, lookups, input filters, and response mappings. Its steps, each step's connection, the endpoints and hooks the app ships, and some data-shaping settings are locked, and a full update that changes a locked field still answers 200 and keeps the app's value -- read the flow or step back after every change. For anything else, use the app's settings or build a companion flow outside the app ([using-marketplace-templates > Changing an Installed Integration App](../using-marketplace-templates/SKILL.md#changing-an-installed-integration-app))
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

**Abstract/instance flows:** Abstract flows are reusable templates that cannot run directly. Instance flows inherit the abstract's structure and override specific fields (connections, filters, schedules). Use when the same integration pattern repeats across tenants or regions. Create with `isAbstract: true`. An abstract flow can't use top-level `pageProcessors` -- the platform rejects them with 422 `abstract_flow_invalid_fields` -- so put even a linear chain in `routers[]`, as one [pass-through router](#branching-flows) (a single branch, neither `routeRecordsTo` nor `routeRecordsUsing` set). Instance flows reference the abstract via `_abstractFlowId` and specify overrides -- they do NOT use the normal scaffolding process. `_integrationId` is NOT inherited and must be set explicitly on the instance.

### 6. Design the step sequence

For each step, decide:
- **Type** -- `import` (write to destination) or `export` (lookup for enrichment)
- **Response mapping** -- what does a downstream step need from this step's response? A response reaches the record only through the step's response mapping (or a `postResponseMap` hook); without one it's discarded after the call, even when its field names already match what the next step expects. Every lookup whose results are used downstream needs one; skip it only when nothing downstream reads this step's response (often a terminal import).
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
| `skipRetries` | per page generator (the export has its own, shown as "Do not store retry data") | `false` (failed records keep their retry data and can be retried) | Work is time-sensitive (retrying a stale webhook is meaningless) -- set it on that generator only. It isn't a duplicate fix -- make the write idempotent instead ([configuring-imports > Writing Exactly Once](../configuring-imports/SKILL.md#writing-exactly-once)) |
| `runPageGeneratorsInParallel` | flow | `false` (generators run sequentially) | Sources are independent and can take the load. Careful: parallel generators hitting the same API can blow rate limits that sequential runs respect |
| `autoResolveMatchingTraceKeys` | flow | `true` on every new flow: a new error for a record auto-resolves that record's older open errors on the step, a later success resolves them all, and errors classified `intermittent` retry automatically (up to four attempts, the first about 30 minutes later) | Rarely. Off, every failure of a record stays open until someone resolves it, and intermittent errors get no automatic retry. Repeated trace keys are normal (delta re-emits, retries) and never raise an error -- a `duplicate` classification means the destination already holds the record, so turning this off doesn't fix it |

### 10. Configure chaining (if needed)

- `_runNextFlowIds` -- trigger other flows when this one completes. The classic use is multi-stage pipelines: "after the customer-master sync finishes, run the orders sync." When a requirement says "X has to happen, *then* Y", chain two focused flows rather than building one big one
- `_runNextExportIds` -- more granular: trigger specific exports inside other flows instead of the whole flow
- **Chaining passes no records.** The next flow starts from its own sources. Hand records between flows through a store, and design that store as a ledger, not a queue -- see [configuring-lookup-caches > Deduplication Ledger](../configuring-lookup-caches/SKILL.md#deduplication-ledger)
- **A flow runs one instance at a time.** A run requested while it is queued or running is refused with `409 job_already_queued`, and a run-next trigger that arrives then is dropped, not queued -- several parent completions in quick succession start the child once

### 11. Create disabled, test, enable

Always create with `disabled: true`. Verify the structure by reading the flow back, then test-run it before you enable it. Read each step's per-stage input, output, and errors where your surface offers them.

The flow may be enabled or disabled -- an enabled flow's test run answers 200 and runs (live-verified 2026-10-14). A test run is not a dry run of everything:

- **Imports never send.** Each returns its saved `mockResponse`, or the placeholder `{"id": "1234567890", "mockResponse": "replace me"}` -- so response mappings after an import carry nothing real until you save a realistic mock ([configuring-imports > Testing an Import Without Writing](../configuring-imports/SKILL.md#testing-an-import-without-writing)). An `id` response mapping still merges nothing in a test run: the response the test run builds from the mock carries no `id`, even when the mock has one, while real runs and the builder's preview carry it. Don't change a working `id` mapping because a test run left it empty.
- **Exports and lookups read the live source**, unless the export has a saved `mockOutput`, which is replayed instead (the export's transform and filter still run on it).
- **Hooks run**, and nothing sandboxes the `integrator-api` module in test mode: treat a hook's writes -- to a lookup cache or state, or an import or flow it runs -- as real.

Enable only after the test run looks right.

## Duplicate Records

Every source delivers some records more than once, and nothing between the source and the write removes the repeats:

| Where the repeat comes from | Why |
|---|---|
| The sender fires again (a webhook retry, a button clicked twice) | A listener never de-duplicates; every request is its own record |
| A failed or canceled run is re-run | The delta checkpoint advances only at the end of a successful run, so the next run re-reads the same window |
| A partial failure | The record wrote one step, failed a later one, and never reached the step that marks it done -- the next run writes the first step again |
| Error retries | `intermittent` errors retry automatically, and manual retries re-send the captured record |
| Another flow writes the same destination | Checks inside one flow can't see the other |

A trace key never de-duplicates: it correlates a record's errors and is each import's default concurrency-lock key, and a record emitted twice with the same key is processed twice. The fix is an idempotent write -- [configuring-imports > Writing Exactly Once](../configuring-imports/SKILL.md#writing-exactly-once).

**Diagnosing "it created duplicates" -- read runs before configuration.** One clean latest run proves nothing.

1. List the flow's runs around the time the user names, and open each one: its per-step child jobs carry each step's `numSuccess` / `numError` / `numIgnore`.
2. The same write step succeeding in two runs while a later step errored is a partial failure; more successes than distinct keys in one run means same-key records reached the write without a lock.
3. Then the configuration: is the write keyed (a destination-enforced key, or `ignoreExisting` + an existence check) or a bare create? Does `idLockTemplate` -- or the default trace key -- render non-empty for a real record (read a failed record's retry data), not a sample? What marks a record done, and does a failure skip that step?

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
10. **`responseMapping` uses Transformation 1.0 syntax** (extract/generate pairs), not expression-based transforms. Lookup export responses use `data[0].fieldName`; import responses use `id` for the created record's ID and `_json.fieldName` for response-body fields.
11. **Don't add identity transforms on lookups.** A lookup's `transform` only reshapes its results (the `data` array response mapping extracts from); it never puts them on the record -- the response mapping does. If the results already have the shape you need, skip the transform and extract directly (`data[0].<field>`). Only add a transform to rename fields, reshape nested structures, or drop fields; an identity transform (e.g., `errorId` -> `$.errorId`) adds complexity for no benefit.
12. **Trace keys never de-duplicate.** A record emitted twice with the same trace key is processed twice; repeated keys (delta re-emits, retries) are normal and raise no error on their own. See [Duplicate Records](#duplicate-records).
13. **A test run isn't side-effect free.** Imports never send, but exports and lookups read live systems and hooks execute -- treat a hook's `integrator-api` writes as real. Before test-running against production systems, save a `mockResponse` on imports and a `mockOutput` on any lookup you don't want called.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `"pageProcessors" is not allowed when "routers" is present` | Both `pageProcessors[]` and `routers[]` set on the same flow | Remove one -- use `pageProcessors` for linear, `routers` for branching |
| `422 abstract_flow_invalid_fields` | Top-level `pageProcessors` on an abstract flow (`isAbstract: true`) | Move the chain into one pass-through router in `routers[]` |
| `Invalid reference: _integrationId` | Integration ID does not exist or is misspelled | Read the integration by id to confirm it exists |
| `Invalid reference: _exportId` / `_importId` | Export or import referenced in a page generator/processor does not exist | Create the export/import first, then reference it |
| `Invalid reference: _connectionId` | Connection ID on an export or import does not exist | Read the connection by id to confirm it exists |
| `Duplicate router id` | Two routers in the same flow share the same `id` | Assign unique alphanumeric IDs to each router |
| `Invalid nextRouterId` | A branch references a router `id` that does not exist in the flow | Ensure `nextRouterId` matches an actual router `id` in the same flow |
| `Invalid cron expression` | Schedule uses 5-field cron or wrong format | Use 6-field format: `"? */5 * * * *"` (seconds field first, always `?`) |
| Flow runs immediately after creation | Created with `disabled: false` or `disabled` omitted (defaults to enabled) | Always set `disabled: true` on create; enable after verification |
| An edit to an Integration App flow "succeeds" but nothing changed | The app locks that field: the full update answered 200 and kept the app's value | Change it through the app's settings, or build a companion flow outside the app |
| `409 job_already_queued` on a run | The flow is already queued or running -- one instance at a time | Wait for the in-progress run to finish, then run again. A run-next trigger that arrived meanwhile was dropped, not queued |
| Destination records created twice | A repeat reached a write that isn't idempotent | Read the runs in the window first ([Duplicate Records](#duplicate-records)), then key and lock the write ([configuring-imports > Writing Exactly Once](../configuring-imports/SKILL.md#writing-exactly-once)) |
