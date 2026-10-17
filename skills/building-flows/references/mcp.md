# Building Flows with the Celigo MCP Tools

The tool calls for each step of How to Build a Flow, then for each Flow Operation, for agents connected to the Celigo Platform MCP server. Step numbers and headings match [SKILL.md](../SKILL.md).

## Ids

- `create_resource` returns the new document; its `_id` is the id every later call takes. Never pass `_id` on a create.
- A flow's steps are the exports in `pageGenerators[]._exportId` and the imports or lookups in `pageProcessors[]` (`_importId`, or `_exportId` for a lookup) -- inside `routers[].branches[].pageProcessors[]` on a branching flow. Each step's connection is that export's or import's `_connectionId`.
- Router `id`s, and the `nextRouterId`s that point at them, are strings you assign inside the flow document, not 24-hex resource ids.
- `run_flow` returns `_jobId`: pass it as `_id` to `list_flow_runs` and as `_jobId` to `list_execution_logs`.
- On `list_flow_errors` and `triage_flow_errors`, `_id` is the **flow** and `_stepId` is the **export or import**.
- A flow group's id is the `_id` of an entry in the integration's `flowGroupings[]`; a flow joins the group through its `_flowGroupingId`.

## How Writes Work

- **Read the schema first** with `get_resource({ resourceType: "flows", schema: true })` -- step 7.
- **Create** with `create_resource`; the body is validated upstream with a dry run before anything is persisted.
- **One whitelisted field** is one `patch_resource` call -- see Patchable Flow Fields.
- **Anything else** is `get_resource`, then `update_resource` with the COMPLETE document, without the server-managed `_id`, `lastModified`, and `createdAt`. PUT replaces the whole document and erases omitted fields; no tool does this round trip for you.
- **Never send masked credentials back.** `get_resource` returns a connection's or iClient's stored secrets as `******`; omit the credential fields to keep them. `update_resource` rejects a payload carrying the mask (or asks first, on clients that support elicitation).
- **Logging is PATCH-only.** POST and PUT ignore a flow's `logging`, so arm and disarm it with `patch_resource` (Debug).

## Patchable Flow Fields

On flows, `patch_resource` takes only `replace`, and only on `/name`, `/description`, `/disabled`, `/runPageGeneratorsInParallel`, `/logging/debugUntil`, `/logging/mode`, `/aiDescription`, `/schedule`, and `/timezone`:

```
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/name", value: "<new name>" }] })
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/disabled", value: false }] })
```

**Replace the schedule whole.** `schedule` is one string, the 6-field cron, so `/schedule` takes the complete expression and `/timezone` an IANA name (step 8). A pointer under `/schedule` -- `/schedule/cron`, `/schedule/frequency` -- answers 204 and changes nothing (re-verified on production 2026-10-12): never patch one, and read the flow back after any schedule change. A server whose whitelist predates this lists those pointers instead and rejects `/schedule` before any API call; there, change the schedule with `get_resource` + `update_resource`.

Everything else -- steps, routers, a page generator's own schedule, `proceedOnFailure`, `skipRetries`, `autoResolveMatchingTraceKeys`, chaining, `_flowGroupingId`, `overrides` -- is `get_resource` + `update_resource`.

## 1. Plan the flow

**Step config** -- change the export or import itself. Exports patch only `/debugUntil` and `/assistantMetadata`, and imports only `/debugUntil`, so a config change is a full update:

```
get_resource({ resourceType: "exports", _id: "<exportId>" })
update_resource({ resourceType: "exports", _id: "<exportId>", body: <the complete export, edited> })
```

**Structure** -- a rename or an enable/disable is one patch; adding or removing steps is `get_resource` + `update_resource` with the complete flow (Change the structure).

## 2. Identify the integration

```
list_resources({ resourceType: "integrations" })
get_resource({ resourceType: "integrations", _id: "<integrationId>" })
list_resources({ resourceType: "flows", _integrationId: "<integrationId>" })    // the flows it already holds
```

Set `_integrationId` on every flow you create: a flow created without one lands in the account's "Standalone flows" integration.

## 3. Check for existing patterns

There is no account index over MCP; read the account live:

```
list_resources({ resourceType: "flows", name: "<keyword>" })          // server-side name match (flows and apis only)
list_resources({ resourceType: "exports", limit: 100 })                 // other families: page with nextCursor, match client-side
get_resource({ resourceType: "flows", _id: "<flowId>" })                // what a flow uses: walk its steps, then each step's _connectionId
list_resources({ resourceType: "flows", sort_by: "lastExecutedAt" })    // never-run flows sort last
list_resources({ resourceType: "connections" })                         // each connection's offline flag
list_marketplace({})                                                    // published Templates, most-installed first
list_marketplace({ _id: "<templateId>" })                               // one Template's blueprint: objects[] of { model, doc }
```

The preview has no summary mode -- count `objects[]` by `model` yourself. What uses a resource, and the lint for orphaned resources and untriggered flows, are not available over MCP. `delete_resource` runs a dependency scan, but it deletes -- never use it as a read.

## 4. Build the connections, exports, and imports

```
list_resources({ resourceType: "connections" })
list_resources({ resourceType: "exports" })
list_resources({ resourceType: "imports" })
list_resources({ resourceType: "http-connectors", search: "<app name>" })    // the pre-built connector catalog
```

Connections, exports, and imports have no integration filter -- list them and match client-side. Without `limit`, a list drains up to 50 pages.

## 5. Choose the topology

Abstract and instance flows:

```
create_resource({ resourceType: "flows", body: { name, _integrationId, isAbstract: true, disabled: true, pageGenerators: [...], routers: [...] } })
create_resource({ resourceType: "flows", body: { name, _integrationId, _abstractFlowId: "<abstractFlowId>", overrides: {...}, disabled: true } })
list_resources({ resourceType: "flows", _abstractFlowId: "<abstractFlowId>" })    // the instances of an abstract flow
```

`get_resource` on an instance returns its sparse document (`_abstractFlowId`, `overrides`, instance-level fields) -- the document to edit and send back. There is no merged view over MCP; read the abstract flow for the structure.

## 7. Build the flow JSON

```
get_resource({ resourceType: "flows", schema: true })                          // the flow schema (rooted at Request), guidance, writeNotes
get_resource({ resourceType: "flows", schema: true, adaptorType: "router" })   // one nested shape
```

`availableSubSchemas` in the first response names the nested shapes you can pass as `adaptorType` -- `page-generator`, `page-processor`, `router`, `branch`, `response-mapping`, `overrides`, and more.

## 8. Configure scheduling

Replace the schedule and timezone whole (Patchable Flow Fields):

```
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/schedule", value: "? 5 9 ? * 1,2,3,4,5" }, { op: "replace", path: "/timezone", value: "America/New_York" }] })
get_resource({ resourceType: "flows", _id: "<flowId>" })   // confirm the new schedule
```

Where the server rejects `/schedule`, send the complete flow instead:

```
update_resource({ resourceType: "flows", _id: "<flowId>", body: <the complete flow with schedule: "? 5 9 ? * 1,2,3,4,5" and timezone: "America/New_York"> })
```

A page generator's own `schedule` sits on its `pageGenerators[]` entry in the same document, so changing it is always a full update.

## 9. Set the runtime controls

```
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/runPageGeneratorsInParallel", value: true }] })
```

The rest are `get_resource` + `update_resource`: `proceedOnFailure` on a `pageProcessors[]` entry (inside its branch on a branching flow), `skipRetries` on a `pageGenerators[]` entry -- the flow schema carries it there, not at the top level -- and `autoResolveMatchingTraceKeys` on the flow.

## 10. Configure chaining

`_runNextFlowIds` (flow ids) and `_runNextExportIds` (`[{ _flowId, _exportId }]`) are `get_resource` + `update_resource`; keep the entries already there. A chained flow runs as its own job once this one completes successfully -- look for it in that flow's history: `list_flow_runs({ _flowId: "<nextFlowId>", limit: 1 })`.

## 11. Create disabled, test, enable

```
create_resource({ resourceType: "flows", body: { name: "<name>", _integrationId: "<integrationId>", disabled: true, pageGenerators: [{ _exportId: "<exportId>" }], pageProcessors: [{ type: "import", _importId: "<importId>" }] } })
get_resource({ resourceType: "flows", _id: "<flowId>" })
test_run({ resourceType: "flows", _id: "<flowId>" })    // while the flow is still disabled
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/disabled", value: false }] })
```

## Duplicate Records

```
list_flow_runs({ _flowId: "<flowId>", createdAt_gte: "<ISO-8601>", createdAt_lte: "<ISO-8601>" })   // the runs around the time the user names
list_flow_runs({ _id: "<jobId>" })                                                                    // one run: the parent job plus children[] per step, with their counts
list_flow_errors({ _id: "<flowId>", _stepId: "<importId>", retryDataKey: "<retryDataKey>" })         // a real record's data, to check what idLockTemplate renders
```

## Flow Operations

### Read and write

```
list_resources({ resourceType: "flows", _integrationId: "<integrationId>" })    // also name, disabled, _abstractFlowId, includeInstances, sort_by
get_resource({ resourceType: "flows", _id: "<flowId>" })
create_resource({ resourceType: "flows", body: <the flow> })
update_resource({ resourceType: "flows", _id: "<flowId>", body: <the complete flow> })
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [<replace ops on whitelisted paths>] })
delete_resource({ resourceType: "flows", _id: "<flowId>" })
```

A flow list is projected by default (`disabled`, `lastModified`, `_integrationId`, `schedule`); read one flow for its steps. `delete_resource` runs a dependency pre-flight and returns dependents in `warnings[]` -- advisory, unless your client supports elicitation, in which case the server asks first.

### Run

```
run_flow({ _id: "<flowId>" })                                                                          // returns _jobId; writes -- confirm first
run_flow({ _id: "<flowId>", body: { export: { startDate: "<ISO-8601>", endDate: "<ISO-8601>" } } })    // this run's delta window
run_flow({ _id: "<flowId>", body: { _exportIds: ["<exportId>"] } })                                    // only these page generators
list_flow_runs({ _id: "<_jobId>" })                                                                     // poll: the parent job plus children[] per step
```

The flow must be enabled and belong to an enabled integration. `startDate` maps to `lastExportDateTime` and `endDate` to `currentExportDateTime`, for this run only.

### Test run

```
test_run({ resourceType: "flows", _id: "<flowId>" })
```

Returns a `runId`, the per-step `metadata` (the stage names each step produced), and the test run's job records. Flows take no test-run body, so unlike the CLI's `--export` you can't pick the page generator. Test runs still call the real connected systems for the steps they execute -- confirm before test-running something that writes. The flow must be disabled -- the API returns 403 for an enabled flow's test run. No MCP tool reads a step's per-stage results.

### Clone

Not available over MCP -- see below.

### Change the structure

No helper tools: edit the flow document and send it back whole.

```
get_resource({ resourceType: "flows", _id: "<flowId>" })
update_resource({ resourceType: "flows", _id: "<flowId>", body: <the complete flow, steps edited> })
```

- **Page generators** are `pageGenerators[]` entries -- `{ _exportId }`, optionally with a `schedule` of their own.
- **Page processors** are `pageProcessors[]` entries, at the top level or in a branch on a branching flow -- `{ type: "import", _importId }`, or `{ type: "export", _exportId }` for a lookup.
- **Replacing a connection** has no single call. Set the new `_connectionId` on each export and import of the flow, one `get_resource` + `update_resource` per resource, with a connection of the same type. Unlike the platform's replace-connection (the CLI's `flows replace-connection`), this is not atomic.
- **Instance flows** inherit their structure -- change their `overrides` instead.

### Manage errors

```
list_flow_errors({ _id: "<flowId>" })                                               // open errors of every step, grouped by step
list_flow_errors({ _id: "<flowId>", _stepId: "<exportOrImportId>", limit: 200 })     // one step's open errors
list_flow_errors({ _id, _stepId, status: "resolved" })                               // resolved history
list_flow_errors({ _id, _stepId, retryDataKey: "<retryDataKey>" })                   // one error's retry-data snapshot
triage_flow_errors({ _id, _stepId, action: "retry", body: { retryDataKeys: ["<retryDataKey>"] } })     // or retryAll: true
triage_flow_errors({ _id, _stepId, action: "resolve", body: { errors: ["<errorId>"] } })               // or resolveAll: true
triage_flow_errors({ _id, _stepId, action: "assign", body: { errorIds: ["<errorId>"], email: "<email>" } })
triage_flow_errors({ _id, _stepId, action: "tag", body: { errors: [{ id: "<errorId>", rdk: "<retryDataKey>" }], tagIds: ["<tagId>"] } })
triage_flow_errors({ _id, _stepId, action: "update_retry_data", retryDataKey: "<retryDataKey>", body: <the whole snapshot, data edited> })
```

Where MCP differs: there is no server-side pattern analysis -- page through a step's errors (pass `nextCursor` back as `cursor`) and group them by `message` yourself. `assign` has no all-errors form, so list the `errorId`s first. Tag codes are the 5-character `tagId`s from `list_resources({ resourceType: "tags" })`. Retries write to the destination system -- confirm before any retry; on clients that support elicitation the server itself confirms `retryAll` and `resolveAll`. The flow's own error-handling settings (`proceedOnFailure`, `skipRetries`, `autoResolveMatchingTraceKeys`) are fields -- step 9.

### Debug

```
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/logging/debugUntil", value: "<ISO-8601 time>" }] })          // arm
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/logging/debugUntil", value: "<a past ISO-8601 time>" }] })   // disarm
list_execution_logs({ _id: "<flowId>", _jobId: "<jobId>" })                             // index: one entry per record
list_execution_logs({ _id, _jobId, _stepId, recordId, groupId })                        // one record's stage timeline
list_execution_logs({ _id, _jobId, _stepId, recordId, groupId, stage: "apiCall" })      // one stage's payloads (raw HTTP)
```

The flow's debug window can be set up to 72 hours ahead on standard licenses (the CLI caps it at 60 minutes). Disarm with a past timestamp: flows accept only `replace`, so the `remove` the CLI sends has no MCP equivalent. A step's captured debug requests aren't readable over MCP -- the `apiCall` stage holds the raw HTTP. The full workflow is in **troubleshooting-flows** ([references/mcp.md](../../troubleshooting-flows/references/mcp.md)).

### Read the delta checkpoint

Not available over MCP -- override the window for one run with `run_flow`'s `body.export.startDate` / `endDate` instead.

### Organize with flow groups

```
get_resource({ resourceType: "integrations", _id: "<integrationId>", include: "flowGroupings" })      // [{ _id, name, ... }]
patch_resource({ resourceType: "integrations", _id: "<integrationId>", body: [{ op: "replace", path: "/flowGroupings", value: [<every existing group as read>, { name: "<new group>" }] }] })
update_resource({ resourceType: "flows", _id: "<flowId>", body: <the complete flow with _flowGroupingId: "<flowGroupingId>"> })
```

The patch replaces the whole array: keep every existing group exactly as read, `_id` included, or the flows in a dropped group become ungrouped. The server assigns the new group's `_id` -- read the integration back for it. Flows join a group one `update_resource` at a time; the server silently drops an invalid `_flowGroupingId`, so read the flow back.

## Pre-Submit Checklist and Common Errors

```
get_resource({ resourceType: "integrations", _id: "<integrationId>" })    // the _integrationId is real
get_resource({ resourceType: "connections", _id: "<connectionId>" })      // the _connectionId is real
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/disabled", value: true }] })   // a 403 from test_run: disable, test, then re-enable
list_flow_runs({ current: true, body: { _flowIds: ["<flowId>"] } })        // a 409 job_already_queued from run_flow: the run still in progress
```

## Not Available over MCP

- **Cloning a flow** -- use the CLI (`celigo flows clone`), the UI, or the REST API (`POST /v1/flows/{_id}/clone`).
- **Replacing a connection across a flow in one call** -- per-resource updates (Change the structure), or the CLI's `flows replace-connection`.
- **The account index**: keyword search beyond the flows and APIs `name` filter, **what uses a resource**, and the **lint** for orphaned resources and untriggered flows. Read live with `list_resources` and `get_resource`, or use the CLI's `account` commands.
- **A merged view of an instance flow** -- read the abstract flow, or use the CLI's `flows get --merge-instance`.
- **Picking the page generator for a test run**, and **a test run's per-stage results** -- arm execution logging and read a real run, or use the CLI's `flows test-run --export` and `flows test-run-step-results`.
- **A step's captured debug requests** -- read the `apiCall` stage of the execution logs, or use the CLI's `flows debug-requests`.
- **Deleting resolved errors** -- the CLI's `flows delete-resolved-errors`, or the UI.
- **Assigning every open error of a step at once** -- list the `errorId`s and assign them.
- **Reading the delta checkpoint** (`lastExportDateTime`) -- override the window with `run_flow`, or read it with the CLI's `flows last-export-date`.
- **Assigning several flows to a flow group in one call** -- one `update_resource` per flow.
- **Notification subscriptions** for a flow -- the UI, or the CLI (`celigo notifications subscribe`).

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
