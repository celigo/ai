---
name: building-flows
description: Build Celigo flows -- pipelines that move data from source systems to destination systems on a schedule or in response to events. Covers scheduling, chaining, error management, and abstract/instance templating. Use when creating, editing, or debugging flows.
---

<!-- TIER:1 -->

# Building Flows

A flow moves data from one or more source systems to one or more destination systems. It runs on a schedule, in response to events (webhooks, listeners), or when triggered by another flow. Flows are the primary way integrations get work done in Celigo.

A flow has **page generators** (exports that fetch data) and **page processors** (imports and lookups that process each record). Processors run sequentially in a flat list, or conditionally through routers that branch records to different paths. These processing pipeline mechanics -- routers, branches, page processors, response mapping -- are shared with APIs and tools (see `building-apis` and `building-tools`).

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

- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connection types and auth methods for page generators and processors
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- building exports used as page generators and lookup processors
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- building imports used as page processors
- [writing-mappings > Mapper 2.0 Workflow](../writing-mappings/SKILL.md#mapper-20-workflow) -- field mappings on imports and response mapping between steps
- [writing-scripts > Data Pipeline Hooks](../writing-scripts/SKILL.md#data-pipeline-hooks) -- preSavePage, preMap, postMap, postSubmit, postResponseMap hooks
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- dynamic values in URIs, filters, delta tokens, SQL queries
- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- diagnosing flow failures, errors, and performance issues

<!-- TIER:2 -->

## How to Build a Flow

### 1. Plan the flow

Before creating anything, decide what kind of operation this is:

**Decision tree:**

- **Modifying an existing flow's step config** (export settings, import mappings, scripts) -- work on the step directly, not the flow. Use `celigo exports set`, `celigo imports set`, or the relevant skill (configuring-exports, configuring-imports, writing-scripts, writing-mappings)
- **Modifying an existing flow's structure** (add/remove steps, change schedule, rename) -- GET the flow, modify the structure, PUT it back. Don't rebuild from scratch
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

Every flow belongs to an integration (the container). Find or create the integration first.

```bash
celigo integrations list
```

### 3. Check for existing patterns

Before building from scratch, check what already exists in the account and marketplace.

```bash
# Search for similar resources in the account index
celigo account search "<keyword>"

# Show what an existing resource uses and what uses it
celigo account deps flow <id>

# Find orphaned resources, offline connections, untriggered flows
celigo account lint

# Search marketplace for pre-built integration templates
celigo templates search "<application-name>"

# Preview a template before installing
celigo templates preview <id> --summary
```

The account index auto-refreshes when stale (>4 hours). Force a fresh snapshot with `celigo account snapshot`.

### 4. Build the connections, exports, and imports

Flows reference existing resources. Build bottom-up: connections first, then exports and imports that use those connections, then the flow that wires them together.

```bash
celigo connections list
celigo exports list
celigo imports list
```

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

Pair `schedule` (6-field cron) with `timezone` (IANA). Omit both for listener/webhook/realtime flows.

Individual page generators can override the flow schedule via their own `schedule` field.

### 9. Configure chaining (if needed)

- `_runNextFlowIds` -- trigger other flows on completion

### 10. Create disabled, verify, enable

Always create with `disabled: true`. Verify the structure with `celigo flows get`. Enable only after verification.

## CLI Commands

```bash
# CRUD
celigo flows list
celigo flows get <id>
celigo flows create < flow.json
celigo flows update <id> < flow.json
celigo flows set <id> key=value [key2=value2 ...]
celigo flows delete <id>

# Run
celigo flows run <id> [--start-date <ISO8601>] [--end-date <ISO8601>] [--export-ids <ids>] -y

# Test run (stage-by-stage)
celigo flows test-run <id> --export <exportId>
celigo flows test-run-step <id> <runId> <exportOrImportId>

# Clone
echo '{"connectionMap":{"oldId":"newId"}}' | celigo flows clone <id> <integrationId> <environmentId> [--flow-group <id>]

# Structure manipulation
celigo flows add-generator <id> <exportId> [--schedule '<cron>'] [--index <pos>]
celigo flows remove-generator <id> <exportId>
celigo flows add-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>]
celigo flows remove-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>]
celigo flows replace-connection <id> <oldConnectionId> <newConnectionId>

# Error management
celigo flows errors <id> <exportOrImportId>
celigo flows resolved-errors <id> <exportOrImportId>
celigo flows resolve-errors <id> <exportOrImportId> [errorIds] [-y]
celigo flows retry-errors <id> <exportOrImportId> [retryDataKeys] [-y]
celigo flows assign-errors <id> <exportOrImportId> <email> [errorIds] [-y]
celigo flows delete-resolved <id> <exportOrImportId> [errorIds] [-y]
celigo flows error-data <id> <exportOrImportId> <retryDataKey>
celigo flows update-error-data <id> <exportOrImportId> <retryDataKey>
celigo flows tag-errors <id> <exportOrImportId>
celigo flows error-summary <id>
celigo flows error-analyze <id> <exportOrImportId> [--limit <n>]
celigo flows error-request-detail <id> <exportOrImportId> <reqAndResKey>

# Debug
celigo flows debug-requests <id> <exportOrImportId> [--since <minutes>]
celigo flows debug-request-detail <id> <exportOrImportId> <key>
celigo flows execution-logs-enable <id> [--duration <minutes>]
celigo flows execution-logs-disable <id>
celigo flows execution-logs <id> <jobId>
celigo flows execution-log-query <id> <jobId> --export-or-import-id <id> --group-id <gid> --record-id <rid>
celigo flows execution-log-data <id> <jobId> --export-or-import-id <id> --stage <stage> --group-id <gid> --record-id <rid>

# Metadata
celigo flows last-export-date <id>

# Integration-level flow management
celigo integrations flow-groups <integrationId>
celigo integrations flow-group-create <integrationId> <name>
celigo integrations flow-group-assign <flowGroupingId> <flowIds...>
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a flow, verify:

- [ ] `_integrationId` references a real integration (confirm with `celigo integrations get <id>`)
- [ ] `disabled: true` is set for initial creation -- an enabled flow with a schedule runs immediately
- [ ] `schedule` is 6-field cron with seconds: `"? */5 * * * *"` (first field is always `?`)
- [ ] `pageProcessors[]` and `routers[]` are mutually exclusive -- a flow uses one or the other, never both
- [ ] Router IDs are unique within the flow (random alphanumeric, e.g., `"N8Q9NX24Sj5"`)
- [ ] Every branch `nextRouterId` references an existing router `id` in the same flow

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this automatically.
2. **`pageProcessors` and `routers` are mutually exclusive.** A flow uses one or the other at the top level. Setting both causes validation errors.
3. **Router IDs must be unique within a flow.** Use random alphanumeric strings (e.g., `"N8Q9NX24Sj5"`). `nextRouterId` must reference an existing router `id` in the same flow.
4. **Create flows with `disabled: true`.** An enabled flow with a schedule will run immediately. Enable only after verification.
5. **Build order matters.** Connection -> Export -> Import -> Flow. The API rejects references to non-existent resources.
6. **Schedule is 6-field cron with seconds.** Format: `"? minute hour dayOfMonth month dayOfWeek"`. The first field is always `?`. Common mistake: using 5-field cron without the seconds position.
7. **Instance flows cannot define structure.** Do not set `pageGenerators`, `pageProcessors`, or `routers` on instance flows -- these are inherited from the abstract flow. All customizations go through `overrides`.
8. **Instance flow `overrides` is full-replace on PUT.** Omitting an override entry removes it. Always GET, merge changes, then PUT.
9. **Empty `pageProcessors: []` in a branch is the discard pattern.** Records matching that branch are dropped. A branch with no `inputFilter` serves as a catch-all.
10. **`responseMapping` uses Transformation 1.0 syntax** (extract/generate pairs), not expression-based transforms. Lookup export responses use `data[0].fieldName`; import responses use `_json.fieldName`.
11. **Don't add unnecessary transforms on lookups.** If the lookup returns fields with the same names the downstream import expects, skip the transform -- the data flows through as-is. Only add a transform when you need to rename fields, reshape nested structures, or drop fields. An identity transform (e.g., `errorId` -> `$.errorId`) adds complexity for no benefit.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `"pageProcessors" is not allowed when "routers" is present` | Both `pageProcessors[]` and `routers[]` set on the same flow | Remove one -- use `pageProcessors` for linear, `routers` for branching |
| `Invalid reference: _integrationId` | Integration ID does not exist or is misspelled | Verify with `celigo integrations get <id>` |
| `Invalid reference: _exportId` / `_importId` | Export or import referenced in a page generator/processor does not exist | Create the export/import first, then reference it |
| `Invalid reference: _connectionId` | Connection ID on an export or import does not exist | Verify with `celigo connections get <id>` |
| `Duplicate router id` | Two routers in the same flow share the same `id` | Assign unique alphanumeric IDs to each router |
| `Invalid nextRouterId` | A branch references a router `id` that does not exist in the flow | Ensure `nextRouterId` matches an actual router `id` in the same flow |
| `Invalid cron expression` | Schedule uses 5-field cron or wrong format | Use 6-field format: `"? */5 * * * *"` (seconds field first, always `?`) |
| Flow runs immediately after creation | Created with `disabled: false` or `disabled` omitted (defaults to enabled) | Always set `disabled: true` on create; enable after verification |
