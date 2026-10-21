# Troubleshooting Flows with the Celigo MCP Tools

The tool calls for each step of the troubleshooting-flows Diagnostic Workflow, for agents connected to the Celigo Platform MCP server. Step numbers match [SKILL.md](../SKILL.md).

## Ids

- On `list_flow_errors`, `get_flow_error_retry_data`, `update_flow_error_retry_data`, and `triage_flow_errors`, `_id` is the **flow** and `_stepId` is the failing **export or import**. Swapping them is the most common mistake.
- On `list_flow_runs`, `_id` is a **job** (one run); list run history with `type` plus `_flowId` or `_integrationId`.
- A flow's steps are the exports in `pageGenerators[]` and the imports in `pageProcessors[]` of `list_flows({ _id: "<flowId>" })`. Each step's connection is that export's or import's `_connectionId`.

## 1. Check the run status

```
list_flow_runs({ type: "flow", _flowId: "<flowId>", limit: 1 })    // newest run first
list_flow_runs({ _id: "<jobId>" })                                  // the run family: parent job + children[] per step
list_current_jobs({ body: { _flowIds: ["<flowId>"] } })             // queued / running right now
```

The run family's `children[]` carries each step's own status and counts -- the quickest way to see whether the export or an import failed, and the counts to read for one step, since the parent's add up every step.

## 2. Get the per-step error counts

```
list_flow_errors({ _id: "<flowId>" })                      // open errors for every step of the flow, grouped by step
list_flow_errors({})                                       // account-wide summary: which flows have open errors, how many
list_flow_errors({ _integrationId: "<integrationId>" })    // the summary for one integration
list_flows({ hasOpenErrors: true })                        // only the flows with open errors, highest count first
```

The summary scans up to 100 flows per call -- while `hasMore` is true, pass `nextCursor` back as `cursor`. It counts open errors only.

## 3. Analyze error patterns

There is no server-side pattern analysis. Page through one step's errors and group them by `message` (and `code`) yourself:

```
list_flow_errors({ _id: "<flowId>", _stepId: "<exportOrImportId>", limit: 200 })
```

Pass `nextCursor` back as `cursor` until the sample is large enough. There is no filter for one run: compare each error's `occurredAt` with the run's start and end.

## 4. Inspect individual errors

Each error carries `errorId`, `retryDataKey`, `message`, `code`, `classification`, `occurredAt`, `retryAt`, and `traceKey`.

```
get_flow_error_retry_data({ _id: "<flowId>", _stepId: "<stepId>", retryDataKey: "<retryDataKey>" })
```

returns that error's stored retry-data snapshot: the record (`data`), the `stage` it failed in, and the captured request/response fields. When the failing run captured execution logs, the error's `traceKey` finds its per-record entry: `list_execution_logs({ _id: "<flowId>", _jobId: "<jobId>", traceKey: "<traceKey>" })`.

## 5. Test run

No MCP tool test-runs a flow (see Not Available over MCP). Have the user test-run it in the Celigo UI, or use the CLI. When only a real run can show a record's input and output, use execution logs (step 6) -- a real run writes, so that is the user's call.

## 6. Execution logs

Arm logging, run, read, then disarm. The flow's debug window can be set up to 72 hours ahead on standard licenses.

```
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/logging/debugUntil", value: "<ISO-8601 time>" }] })
run_flow({ _id: "<flowId>" })                                                          // returns _jobId; writes -- confirm first
list_flow_runs({ _id: "<_jobId>" })                                                    // poll until the run has finished
list_execution_logs({ _id: "<flowId>", _jobId: "<_jobId>" })                           // index: one entry per record
list_execution_logs({ _id, _jobId, _stepId, recordId, groupId })                       // one record's step timeline (no stage names)
list_execution_logs({ _id, _jobId, _stepId, recordId, groupId, stage: "apiCall" })     // one stage's payloads (raw HTTP)
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/logging/debugUntil", value: "<a past ISO-8601 time>" }] })   // disarm
```

The index filters on `_stepId` and on `traceKey` (a substring match). A stage read takes the names in SKILL.md step 7; an unknown name comes back empty, with no error. An empty index is not an error either: read the run's `logMode` in `list_flow_runs({ _id: "<_jobId>" })`.

## 7. Low-level debug primitives

`patch_flow` arms the flow's execution logging (step 6). No MCP tool arms or reads the per-resource debug windows on exports, imports, scripts, and connections. For raw HTTP at one step, read the `apiCall` stage of the execution log (step 6), or read the debug logs in the UI or with the CLI.

## 8. Fix and retry (or resolve)

**Configuration fix.** On a flow, a whitelisted field is one `patch_flow` call (building-flows lists the fields); anything else is `list_flows` with the `_id`, then `upsert_flow` with the complete document:

```
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/disabled", value: false }] })
```

Exports, imports, and scripts have no patch tool: read the resource with its `list_<type>` tool and `_id`, edit it, and send the complete document back with `upsert_<type>` -- PUT replaces it, so omitted fields are erased. No tool patches a connection, and its full update needs the real secret -- never send the masked `******` values back, and don't omit them either, because a full update without the real secret clears it. So hand a connection change to the user in the Celigo UI, concurrency included (configuring-connections, Credential Discipline). While a connection has `autoRecoverRateLimitErrors: true`, the setting to lower is `targetConcurrencyLevel`, not `concurrencyLevel`.

**Prove the fix on one record first.** Retry a single `retryDataKey`, read the retry job's counts (Error Lifecycle and Retries below), and only then retry the rest.

**Data fix.** Read the snapshot, edit `data`, save it back, retry:

```
get_flow_error_retry_data({ _id, _stepId, retryDataKey })
update_flow_error_retry_data({ _id, _stepId, retryDataKey, body: <the whole snapshot, data edited> })
triage_flow_errors({ _id, _stepId, action: "retry", body: { retryDataKeys: ["<retryDataKey>"] } })
```

**Resolve, or act on every open error of a step.** Targeted resolve: `action: "resolve", body: { errors: ["<errorId>", ...] }`. `retryAll: true` (with `action: "retry"`) and `resolveAll: true` (with `action: "resolve"`) use the platform's bulk endpoints, and the server runs them without asking.

Retries write to the destination system -- confirm with the user before any retry, and before any `retryAll` or `resolveAll`.

## 9. Verify the fix

```
run_flow({ _id: "<flowId>" })
list_flow_runs({ _id: "<_jobId>" })
list_flow_errors({ _id: "<flowId>" })
```

After a retry, read the retry job instead (Error Lifecycle and Retries).

## Error Lifecycle and Retries

```
list_flow_runs({ type: "retry", _flowId: "<flowId>" })       // retry history, newest first -- including the platform's own (triggeredBy: auto)
list_flow_runs({ _id: "<retryJobId>" })                       // one retry job: status, numSuccess, numError
list_flow_errors({ _id: "<flowId>", _stepId: "<stepId>" })    // the open errors -- reconcile before and after by retryDataKey
```

A record that fails again comes back as a new open error with a new `errorId` and the same `retryDataKey`.

## Resolved Errors and the Monitoring Lenses

No MCP tool reads resolved errors, so who closed an error (`resolvedBy`) takes the UI or the CLI. Over MCP, judge a retry by its job's counts (Error Lifecycle and Retries).

- **Running lens:** `list_current_jobs({ body: { _flowIds: [...] } })`.
- **Completed lens:** `list_flow_runs({ type: "flow", _flowId, limit: 25 })`; add `numError_gte` to find failing runs, `createdAt_gte` / `createdAt_lte` for a window.

## Stuck-Flow Triangulation

1. **Run state:** `list_current_jobs({ body: { _flowIds: ["<flowId>"] } })`, plus the latest run from step 1.
2. **Queue depth:** `list_connections({ _id: "<connectionId>" })` returns the connection's `queues[].size` and whether it is `offline`, for each connection the flow's steps use. `list_connections({ fetchQueueSize: true })` returns every connection's queues in one call.
3. **What else is active:** `list_current_jobs({})` across the account (or `body: { _integrationIds: [...] }`), then match those flows' steps to the shared connection.

A run frozen for hours: `list_flow_runs({ _id: "<flowJobId>" })` returns the parent with `children[]` -- read the children's counts, not the parent's. Cancel the parent and re-run, only when the user agrees and no import wrote:

```
cancel_flow_run({ _id: "<flowJobId>" })
list_flow_runs({ _id: "<flowJobId>" })     // repeat until status is canceled
run_flow({ _id: "<flowId>" })
```

## Missed Scheduled Runs

```
list_flows({ _id: "<flowId>" })                                   // disabled, schedule, timezone, and each pageGenerators[].schedule
list_current_jobs({ body: { _flowIds: ["<flowId>"] } })           // a run still queued or running
list_flow_runs({ type: "flow", _flowId: "<flowId>", limit: 5 })   // recent runs; triggeredBy "system" marks a scheduled one
run_flow({ _id: "<flowId>" })                                     // catch up -- writes, so only once the user agrees
```

Don't `patch_flow` the schedule to fix a miss.

## Reprocess a Window

```
run_flow({ _id: "<flowId>", body: { export: { startDate: "<ISO-8601>", endDate: "<ISO-8601>" } } })
```

## Common Errors

```
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/disabled", value: false }] })   // 422 inactive_flow on a retry: re-enable, then retry
list_current_jobs({ body: { _flowIds: ["<flowId>"] } })                                       // 409 job_already_queued from run_flow: the run still in progress
list_exports({ _id: "<exportId>" })                                                           // a test run replaying old sample records: its mockOutput
```

Clearing `mockOutput` is a full update -- `list_exports` with the `_id`, then `upsert_export` with the complete document minus `mockOutput` (exports have no patch tool).

## Not Available over MCP

- **Test runs** (step 5) and **a test run's per-stage results** -- the UI, or the CLI's `flows test-run` and `flows test-run-step-results`.
- **Connection ping.** Read the connection's `offline` flag and the 401/403 responses in its steps' errors instead; ping with the CLI or the UI.
- **Changing a connection**, its concurrency included -- the user makes the change in the UI, or use the CLI's `connections set` for a whitelisted field.
- **Per-resource debug windows** (step 7) -- arming them and reading what they capture.
- **Resolved-error history**, with `resolvedBy` -- the UI, or the CLI's `flows resolved-errors`.
- **Server-side error pattern analysis** (step 3) -- group client-side.
- **Reading the delta checkpoint** (`lastExportDateTime`) -- override the window with `run_flow` instead.
- **A job diagnostics bundle.** When escalating to Celigo support, give the flow id, job id, timestamps, and the error codes you found.

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
