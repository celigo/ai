# Troubleshooting Flows with the Celigo MCP Tools

The tool calls for each step of the troubleshooting-flows Diagnostic Workflow, for agents connected to the Celigo Platform MCP server. Step numbers match [SKILL.md](../SKILL.md).

## Ids

- On `list_flow_errors` and `triage_flow_errors`, `_id` is the **flow** and `_stepId` is the failing **export or import**. Swapping them is the most common mistake.
- On `list_flow_runs`, `_id` is a **job** (one run); scope run history with `_flowId` or `_integrationId`.
- A flow's steps are the exports in `pageGenerators[]` and the imports in `pageProcessors[]` of `get_resource({ resourceType: "flows", _id })`. Each step's connection is that export's or import's `_connectionId`.

## 1. Check the run status

```
list_flow_runs({ _flowId: "<flowId>", limit: 1 })                    // newest run first (type defaults to flow)
list_flow_runs({ _id: "<jobId>" })                                   // the run family: parent job + children[] per step
list_flow_runs({ current: true, body: { _flowIds: ["<flowId>"] } })  // queued / running right now
```

The run family's `children[]` carries each step's own status and counts -- the quickest way to see whether the export or an import failed.

## 2. Get the per-step error counts

```
list_flow_errors({ _id: "<flowId>" })                      // open errors for every step of the flow, grouped by step
list_flow_errors({})                                       // account-wide rollup: which flows have open errors, how many
list_flow_errors({ _integrationId: "<integrationId>" })    // the rollup for one integration
```

The rollup costs one call per integration -- use it instead of looping over flows. It counts open errors only.

## 3. Analyze error patterns

There is no server-side pattern analysis. Page through one step's errors and group them by `message` (and `code`) yourself:

```
list_flow_errors({ _id: "<flowId>", _stepId: "<exportOrImportId>", limit: 200 })
```

Pass `nextCursor` back as `cursor` until the sample is large enough. To narrow to one run, add `_flowJobId` together with `occurredAt_gte` -- upstream rejects `_flowJobId` on its own.

## 4. Inspect individual errors

Each error carries `errorId`, `retryDataKey`, `message`, `code`, `occurredAt`, and `traceKey`.

```
list_flow_errors({ _id: "<flowId>", _stepId: "<stepId>", retryDataKey: "<retryDataKey>" })
```

returns that error's stored retry-data snapshot: the record (`data`), the `stage` it failed in, and the captured request/response fields. When execution logging was armed for the failing run, the error's `traceKey` is the entry point into its per-record trace: `list_execution_logs({ _id: "<flowId>", _jobId: "<jobId>", traceKeyPrefix: "<traceKey>" })`.

## 5. Test run

```
test_run({ resourceType: "flows", _id: "<flowId>" })
```

Returns a `runId`, the per-step metadata (the stages each step produced), and the test run's job records. No MCP tool reads a test run's per-stage input and output; when you need a record's actual input and output, use execution logs (step 6).

## 6. Execution logs

Arm logging, run, read, then disarm. The flow's debug window can be set up to 72 hours ahead on standard licenses.

```
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/logging/debugUntil", value: "<ISO-8601 time>" }] })
run_flow({ _id: "<flowId>" })                                                              // returns _jobId; writes -- confirm first
list_flow_runs({ _id: "<_jobId>" })                                                        // poll until the run has finished
list_execution_logs({ _id: "<flowId>", _jobId: "<_jobId>", status: "error" })             // index: one entry per record
list_execution_logs({ _id, _jobId, _stepId, recordId, groupId })                          // one record's step timeline (no stage names)
list_execution_logs({ _id, _jobId, _stepId, recordId, groupId, stage: "apiCall" })        // one stage's payloads (raw HTTP)
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/logging/debugUntil", value: "<a past ISO-8601 time>" }] })   // disarm
```

An empty index page that comes back with a `_hint` means logging was not armed for that run. A stage read takes the names in SKILL.md step 7; an unknown name comes back empty, with no error.

## 7. Low-level debug primitives

`patch_resource` arms the per-resource debug windows -- `/debugUntil` on exports, imports, and scripts, `/debugDate` (or `/debugUntil`) on connections, at most 1 hour ahead -- but no MCP tool reads what they capture. For raw HTTP at one step, read the `apiCall` stage of the execution log (step 6), or read the debug logs in the UI or with the CLI.

## 8. Fix and retry (or resolve)

**Configuration fix.** A whitelisted single field is one `patch_resource` call -- the tool description lists each family's patchable paths:

```
patch_resource({ resourceType: "flows", _id, body: [{ op: "replace", path: "/disabled", value: false }] })
patch_resource({ resourceType: "connections", _id, body: [{ op: "replace", path: "/http/concurrencyLevel", value: 5 }] })
```

While a connection has `autoRecoverRateLimitErrors: true`, set `/<type>/targetConcurrencyLevel` instead of `concurrencyLevel`. Anything that isn't patchable is `get_resource` then `update_resource` with the complete document -- PUT replaces it, so omitted fields are erased. On a connection that includes the credentials: never send the masked `******` values back, and don't omit them either -- a full update without the real secret clears it, so hand such a change to the user in the Celigo UI (configuring-connections, Credential Discipline).

**Prove the fix on one record first.** Retry a single `retryDataKey`, read the retry job's counts (Error Lifecycle and Retries below), and only then retry the rest.

**Data fix.** Read the snapshot, edit `data`, save it back, retry:

```
list_flow_errors({ _id, _stepId, retryDataKey })
triage_flow_errors({ _id, _stepId, action: "update_retry_data", retryDataKey, body: <the whole snapshot, data edited> })
triage_flow_errors({ _id, _stepId, action: "retry", body: { retryDataKeys: ["<retryDataKey>"] } })
```

**Resolve, or act on every open error of a step.** Targeted resolve: `action: "resolve", body: { errors: ["<errorId>", ...] }`. `retryAll: true` (with `action: "retry"`) and `resolveAll: true` (with `action: "resolve"`) use the platform's bulk endpoints; clients that support elicitation get a confirmation prompt from the server first.

Retries write to the destination system -- confirm with the user before any retry.

## 9. Verify the fix

```
run_flow({ _id: "<flowId>" })
list_flow_runs({ _id: "<_jobId>" })
list_flow_errors({ _id: "<flowId>" })
```

After a retry, read the retry job instead (Error Lifecycle and Retries).

## Error Lifecycle and Retries

```
list_flow_runs({ _flowId: "<flowId>", type: "retry" })        // retry history, newest first -- including the platform's own (triggeredBy: auto)
list_flow_runs({ _id: "<retryJobId>" })                       // one retry job: status, numSuccess, numError
list_flow_errors({ _id: "<flowId>", _stepId: "<stepId>" })    // the open errors -- reconcile before and after by retryDataKey
```

A record that fails again comes back as a new open error with a new `errorId` and the same `retryDataKey`.

## Resolved Errors and the Monitoring Lenses

```
list_flow_errors({ _id: "<flowId>", status: "resolved" })                                                  // resolved history, grouped by step
list_flow_errors({ _id, _stepId, status: "resolved", resolvedBy: ["auto"], resolvedAt_gte: "<ISO-8601>" })  // closed by the platform -- not proof the record made it
```

Resolved history is per flow or per step; the account-wide rollup is open-only. Resolved records add `resolvedAt`, `resolvedBy`, and `purgeAt`, and their retry data may already be purged.

- **Running lens:** `list_flow_runs({ current: true, body: { _flowIds: [...] } })`.
- **Completed lens:** `list_flow_runs({ _flowId, limit: 25 })`; add `numError_gte` to find failing runs, `createdAt_gte` / `createdAt_lte` for a window.

## Stuck-Flow Triangulation

1. **Run state:** `list_flow_runs({ current: true, body: { _flowIds: ["<flowId>"] } })`, plus the latest run from step 1.
2. **Queue depth:** `get_resource({ resourceType: "connections", _id: "<connectionId>" })` returns the connection's `queues[].size` and whether it is `offline`, for each connection the flow's steps use. `list_resources({ resourceType: "connections", fetchQueueSize: true })` returns every connection's queues in one call.
3. **What else is active:** `list_flow_runs({ current: true })` across the account (or `body: { _integrationIds: [...] }`), then match those flows' steps to the shared connection.

A run frozen for hours: `list_flow_runs({ _id: "<flowJobId>" })` returns the parent with `children[]` -- read the children's counts, not the parent's. Cancel the parent and re-run, only when the user agrees and no import wrote:

```
cancel_flow_run({ _id: "<flowJobId>" })
list_flow_runs({ _id: "<flowJobId>" })     // repeat until status is canceled
run_flow({ _id: "<flowId>" })
```

## Reprocess a Window

```
run_flow({ _id: "<flowId>", body: { export: { startDate: "<ISO-8601>", endDate: "<ISO-8601>" } } })
```

## Common Errors

```
patch_resource({ resourceType: "flows", _id: "<flowId>", body: [{ op: "replace", path: "/disabled", value: false }] })   // 422 inactive_flow on a retry: re-enable, then retry
list_flow_runs({ current: true, body: { _flowIds: ["<flowId>"] } })                                                       // 409 job_already_queued from run_flow: the run still in progress
get_resource({ resourceType: "exports", _id: "<exportId>" })                                                              // a test run replaying old sample records: its mockOutput
```

Clearing `mockOutput` is a full update -- `get_resource`, then `update_resource` without it (exports patch only `/debugUntil` and `/assistantMetadata`).

## Not Available over MCP

- **Connection ping.** Read the connection's `offline` flag and the 401/403 responses in its steps' errors instead; ping with the CLI or the UI.
- **Reading per-resource debug logs** (step 7) and **a test run's per-stage results** (step 5).
- **Server-side error pattern analysis** (step 3) -- group client-side.
- **Reading the delta checkpoint** (`lastExportDateTime`) -- override the window with `run_flow` instead.
- **A job diagnostics bundle.** When escalating to Celigo support, give the flow id, job id, timestamps, and the error codes you found.

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
