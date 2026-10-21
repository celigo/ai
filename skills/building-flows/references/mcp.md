# Building Flows with the Celigo MCP Tools

The tool calls for each step of How to Build a Flow, then for each Flow Operation, for agents connected to the Celigo Platform MCP server. Step numbers and headings match [SKILL.md](../SKILL.md).

## Ids

- `upsert_<type>` without an `_id` creates the resource and returns the new document; its `_id` is the id every later call takes. Never pass `_id` on a create -- with one, `upsert_<type>` replaces that document.
- A flow's steps are the exports in `pageGenerators[]._exportId` and the imports or lookups in `pageProcessors[]` (`_importId`, or `_exportId` for a lookup) -- inside `routers[].branches[].pageProcessors[]` on a branching flow. Each step's connection is that export's or import's `_connectionId`.
- Router `id`s, and the `nextRouterId`s that point at them, are strings you assign inside the flow document, not 24-hex resource ids.
- `run_flow` returns `_jobId`: pass it as `_id` to `list_flow_runs` and as `_jobId` to `list_execution_logs`.
- On `list_flow_errors`, `get_flow_error_retry_data`, and `triage_flow_errors`, `_id` is the **flow** and `_stepId` is the **export or import**.
- A flow group's id is the `_id` of an entry in the integration's `flowGroupings[]`; a flow joins the group through its `_flowGroupingId`.

## How Writes Work

- **Read the schema first** with `get_schema({ target: "resource", name: "flow" })` -- step 7.
- **Create** with `upsert_<type>` and no `_id`.
- **One whitelisted flow field** is one `patch_flow` call -- see Patchable Flow Fields. No other resource has a patch tool.
- **Anything else** is a read with `list_<type>` and the `_id`, then `upsert_<type>` with the `_id` and the COMPLETE document, without the server-managed `_id`, `lastModified`, and `createdAt`. PUT replaces the whole document and erases omitted fields; no tool does this round trip for you.
- **Never send masked credentials back.** `list_connections` with an `_id` returns the stored secrets as `******`, and `upsert_connection` rejects a body carrying the mask unless you pass `force: true` -- never pass it. Omitting the secrets is no fix either, whatever the error message suggests: a full update without the real secret clears it. No tool patches a connection, so hand connection changes to the user in the Celigo UI -- see **configuring-connections** (Credential Discipline).
- **Logging is PATCH-only.** POST and PUT ignore a flow's `logging`, so arm and disarm it with `patch_flow` (Debug).

## Patchable Flow Fields

`patch_flow` takes only `replace`, and the platform applies it only on `/name`, `/description`, `/disabled`, `/runPageGeneratorsInParallel`, `/logging/debugUntil`, `/logging/mode`, `/aiDescription`, `/schedule`, and `/timezone`; any other path returns 422:

```
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/name", value: "<new name>" }] })
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/disabled", value: false }] })
```

**Replace the schedule whole.** `schedule` is one string, the 6-field cron, so `/schedule` takes the complete expression and `/timezone` an IANA name (step 8). A pointer under `/schedule` -- `/schedule/cron`, `/schedule/frequency` -- answers 204 and changes nothing (re-verified on production 2026-10-12): never patch one, whatever the tool's description lists, and read the flow back after any schedule change.

Everything else -- steps, routers, a page generator's own schedule, `proceedOnFailure`, `skipRetries`, `autoResolveMatchingTraceKeys`, chaining, `_flowGroupingId`, `overrides` -- is `list_flows` + `upsert_flow`.

## 1. Plan the flow

**Step config** -- change the export or import itself. Exports and imports have no patch tool, so a config change is a full update:

```
list_exports({ _id: "<exportId>" })
upsert_export({ _id: "<exportId>", body: <the complete export, edited> })
```

Nothing over MCP lists what uses a step. Before the edit, read every flow with its steps and look for the step's `_id` in `pageGenerators[]._exportId`, `pageProcessors[]`, and each branch's `pageProcessors[]`; APIs and Tools hold steps the same way (`list_apis`, `list_tools`):

```
list_flows({ include: "pageGenerators,pageProcessors,routers" })
```

To give this flow its own copy, create one with `upsert_export` or `upsert_import` and no `_id`, from the step's document without its server-managed fields, then point this flow's step at the new `_id` (`list_flows` + `upsert_flow`).

**Structure** -- a rename or an enable/disable is one `patch_flow`; adding or removing steps is `list_flows` + `upsert_flow` with the complete flow (Change the structure).

## 2. Identify the integration

```
list_integrations({})
list_integrations({ _id: "<integrationId>" })
list_flows({ _integrationId: "<integrationId>" })    // the flows it already holds
```

Set `_integrationId` on every flow you create: a flow created without one lands in the account's "Standalone flows" integration.

## 3. Check for existing patterns

There is no account index over MCP; read the account live:

```
list_flows({ name: "<keyword>" })             // server-side name match (flows only)
list_exports({ limit: 100 })                  // other families: page with nextCursor, match client-side
list_flows({ _id: "<flowId>" })               // what a flow uses: walk its steps, then each step's _connectionId
list_flows({ sort_by: "lastExecutedAt" })     // never-run flows sort last
list_connections({})                          // each connection's offline flag
list_marketplace({})                          // published Templates, most-installed first
list_marketplace({ _id: "<templateId>" })     // one Template's blueprint: objects[] of { model, doc }
```

The preview has no summary mode -- count `objects[]` by `model` yourself. What uses a resource, and the lint for orphaned resources and untriggered flows, are not available over MCP. `delete_resource` scans for dependents, but it deletes even when it finds them -- never use it as a read.

## 4. Build the connections, exports, and imports

```
list_connections({})
list_exports({})
list_imports({})
get_schema({ target: "connector", name: "<app name>" })    // the pre-built connector catalog: the matching connector, or the candidates
```

Connections, exports, and imports have no integration filter -- list them and match client-side. Without `limit`, a list drains up to 50 pages.

## 5. Choose the topology

Abstract and instance flows:

```
upsert_flow({ body: { name, _integrationId, isAbstract: true, disabled: true, pageGenerators: [...], routers: [...] } })
upsert_flow({ body: { name, _integrationId, _abstractFlowId: "<abstractFlowId>", overrides: {...}, disabled: true } })
list_flows({ _abstractFlowId: "<abstractFlowId>" })    // the instances of an abstract flow
```

`list_flows` with an instance's `_id` returns its sparse document (`_abstractFlowId`, `overrides`, instance-level fields) -- the document to edit and send back. There is no merged view over MCP; read the abstract flow for the structure.

## 7. Build the flow JSON

```
get_schema({ target: "resource", name: "flow" })           // the flow schema, plus availableSubSchemas
get_schema({ target: "resource", name: "flow/router" })    // one nested shape
```

`availableSubSchemas` in the first response names the nested shapes you can ask for after `flow/` -- `page-generator`, `page-processor`, `router`, `branch`, `response-mapping`, `overrides`, and more.

## 8. Configure scheduling

Replace the schedule and timezone whole (Patchable Flow Fields):

```
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/schedule", value: "? 5 9 ? * 1,2,3,4,5" }, { op: "replace", path: "/timezone", value: "America/New_York" }] })
list_flows({ _id: "<flowId>" })   // confirm the new schedule
```

A page generator's own `schedule` sits on its `pageGenerators[]` entry in the same document, so changing it is always a full update.

## 9. Set the runtime controls

```
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/runPageGeneratorsInParallel", value: true }] })
```

The rest are `list_flows` + `upsert_flow`: `proceedOnFailure` on a `pageProcessors[]` entry (inside its branch on a branching flow), `skipRetries` on a `pageGenerators[]` entry -- the flow schema carries it there, not at the top level -- and `autoResolveMatchingTraceKeys` on the flow.

## 10. Configure chaining

`_runNextFlowIds` (flow ids) and `_runNextExportIds` (`[{ _flowId, _exportId }]`) are `list_flows` + `upsert_flow`; keep the entries already there. A chained flow runs as its own job once this one completes successfully -- look for it in that flow's history: `list_flow_runs({ type: "flow", _flowId: "<nextFlowId>", limit: 1 })`.

## 11. Create disabled, test, enable

```
upsert_flow({ body: { name: "<name>", _integrationId: "<integrationId>", disabled: true, pageGenerators: [{ _exportId: "<exportId>" }], pageProcessors: [{ type: "import", _importId: "<importId>" }] } })
list_flows({ _id: "<flowId>" })
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/disabled", value: false }] })    // only after the test run
```

No MCP tool test-runs a flow (Test run, below): before you enable it, have the user test-run it in the Celigo UI, or test-run it with the CLI.

## Duplicate Records

```
list_flow_runs({ type: "flow", _flowId: "<flowId>", createdAt_gte: "<ISO-8601>", createdAt_lte: "<ISO-8601>" })   // the runs around the time the user names
list_flow_runs({ _id: "<jobId>" })                                                                                  // one run: the parent job plus children[] per step, with their counts
get_flow_error_retry_data({ _id: "<flowId>", _stepId: "<importId>", retryDataKey: "<retryDataKey>" })              // a real record's data, to check what idLockTemplate renders
```

## Flow Operations

### Read and write

```
list_flows({ _integrationId: "<integrationId>" })    // also name, disabled, _abstractFlowId, includeInstances, sort_by
list_flows({ _id: "<flowId>" })
upsert_flow({ body: <the flow> })
upsert_flow({ _id: "<flowId>", body: <the complete flow> })
patch_flow({ _id: "<flowId>", body: [<replace ops on whitelisted paths>] })
delete_resource({ resourceType: "flows", _id: "<flowId>" })
```

A flow list is projected by default (`disabled`, `lastModified`, `_integrationId`, `schedule`); read one flow for its steps. `delete_resource` scans for dependents and returns them in `warnings`, but it deletes either way -- confirm the target with the user first.

### Run

```
run_flow({ _id: "<flowId>" })                                                                          // returns _jobId; writes -- confirm first
run_flow({ _id: "<flowId>", body: { export: { startDate: "<ISO-8601>", endDate: "<ISO-8601>" } } })    // this run's delta window
run_flow({ _id: "<flowId>", body: { _exportIds: ["<exportId>"] } })                                    // only these page generators
list_flow_runs({ _id: "<_jobId>" })                                                                     // poll: the parent job plus children[] per step
```

The flow must be enabled and belong to an enabled integration. `startDate` maps to `lastExportDateTime` and `endDate` to `currentExportDateTime`, for this run only.

### Test run

Not available over MCP -- see below.

### Clone

Not available over MCP -- see below.

### Change the structure

No helper tools: edit the flow document and send it back whole.

```
list_flows({ _id: "<flowId>" })
upsert_flow({ _id: "<flowId>", body: <the complete flow, steps edited> })
```

- **Page generators** are `pageGenerators[]` entries -- `{ _exportId }`, optionally with a `schedule` of their own.
- **Page processors** are `pageProcessors[]` entries, at the top level or in a branch on a branching flow -- `{ type: "import", _importId }`, or `{ type: "export", _exportId }` for a lookup.
- **Replacing a connection** has no single call. Set the new `_connectionId` on each export and import of the flow, one `list_<type>` + `upsert_<type>` per resource, with a connection of the same type. Unlike the platform's replace-connection (the CLI's `flows replace-connection`), this is not atomic.
- **Instance flows** inherit their structure -- change their `overrides` instead.

### Manage errors

```
list_flow_errors({ _id: "<flowId>" })                                               // open errors of every step, grouped by step
list_flow_errors({ _id: "<flowId>", _stepId: "<exportOrImportId>", limit: 200 })     // one step's open errors
get_flow_error_retry_data({ _id, _stepId, retryDataKey: "<retryDataKey>" })          // one error's retry-data snapshot
triage_flow_errors({ _id, _stepId, action: "retry", body: { retryDataKeys: ["<retryDataKey>"] } })     // or retryAll: true
triage_flow_errors({ _id, _stepId, action: "resolve", body: { errors: ["<errorId>"] } })               // or resolveAll: true
triage_flow_errors({ _id, _stepId, action: "assign", body: { errorIds: ["<errorId>"], email: "<email>" } })
triage_flow_errors({ _id, _stepId, action: "tag", body: { errors: [{ id: "<errorId>", rdk: "<retryDataKey>" }], tagIds: ["<tagId>"] } })
update_flow_error_retry_data({ _id, _stepId, retryDataKey: "<retryDataKey>", body: <the whole snapshot, data edited> })
```

Where MCP differs: there is no server-side pattern analysis -- page through a step's errors (pass `nextCursor` back as `cursor`) and group them by `message` yourself. `assign` has no all-errors form, so list the `errorId`s first. Tag codes are the 5-character `tagId`s from `list_tags({})`. Resolved errors can't be read. Retries write to the destination system -- confirm before any retry, and before `retryAll` or `resolveAll`, which the server runs without asking. The flow's own error-handling settings (`proceedOnFailure`, `skipRetries`, `autoResolveMatchingTraceKeys`) are fields -- step 9.

### Debug

```
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/logging/debugUntil", value: "<ISO-8601 time>" }] })          // arm
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/logging/debugUntil", value: "<a past ISO-8601 time>" }] })   // disarm
list_execution_logs({ _id: "<flowId>", _jobId: "<jobId>" })                             // index: one entry per record
list_execution_logs({ _id, _jobId, _stepId, recordId, groupId })                        // one record's step timeline (no stage names)
list_execution_logs({ _id, _jobId, _stepId, recordId, groupId, stage: "apiCall" })      // one stage's payloads (raw HTTP)
```

The flow's debug window can be set up to 72 hours ahead on standard licenses (the CLI caps it at 60 minutes). Disarm with a past timestamp: `patch_flow` takes only `replace`, so the `remove` the CLI sends has no MCP equivalent. A step's captured debug requests aren't readable over MCP -- the `apiCall` stage holds the raw HTTP. The full workflow is in **troubleshooting-flows** ([references/mcp.md](../../troubleshooting-flows/references/mcp.md)).

### Read the delta checkpoint

Not available over MCP -- override the window for one run with `run_flow`'s `body.export.startDate` / `endDate` instead.

### Organize with flow groups

```
list_integrations({ _id: "<integrationId>", include: "flowGroupings" })                     // [{ _id, name, ... }]
upsert_flow({ _id: "<flowId>", body: <the complete flow with _flowGroupingId: "<flowGroupingId>"> })
```

Flows join an existing group one `upsert_flow` at a time; the server silently drops an invalid `_flowGroupingId`, so read the flow back. Creating a group is not available over MCP: no tool patches an integration's `flowGroupings`, and replacing the whole integration document to add one puts its other settings at risk.

## Pre-Submit Checklist and Common Errors

```
list_integrations({ _id: "<integrationId>" })              // the _integrationId is real
list_connections({ _id: "<connectionId>" })                // the _connectionId is real
list_current_jobs({ body: { _flowIds: ["<flowId>"] } })    // a 409 job_already_queued from run_flow: the run still in progress
```

## Not Available over MCP

- **Test runs** and **a test run's per-stage results** -- the UI, or the CLI's `flows test-run` (its `--export` picks the page generator) and `flows test-run-step-results`.
- **Cloning a flow** -- use the CLI (`celigo flows clone`), the UI, or the REST API (`POST /v1/flows/{_id}/clone`).
- **Replacing a connection across a flow in one call** -- per-resource updates (Change the structure), or the CLI's `flows replace-connection`.
- **Changing a connection** -- no tool patches one, and its full update needs the real secret; see **configuring-connections**.
- **The account index**: keyword search beyond the flows `name` filter, **what uses a resource**, and the **lint** for orphaned resources and untriggered flows. Read live with the `list_<type>` tools, or use the CLI's `account` commands.
- **A merged view of an instance flow** -- read the abstract flow, or use the CLI's `flows get --merge-instance`.
- **A step's captured debug requests** -- read the `apiCall` stage of the execution logs, or use the CLI's `flows debug-requests`.
- **Resolved errors**, reading or deleting them -- the CLI's `flows resolved-errors` and `flows delete-resolved-errors`, or the UI.
- **Assigning every open error of a step at once** -- list the `errorId`s and assign them.
- **Reading the delta checkpoint** (`lastExportDateTime`) -- override the window with `run_flow`, or read it with the CLI's `flows last-export-date`.
- **Creating a flow group**, and **assigning several flows to one in one call** -- the UI, or the CLI's `integrations create-flow-group` and `flows set-group`.
- **Notification subscriptions** for a flow -- the UI, or the CLI (`celigo notifications subscribe`).

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
