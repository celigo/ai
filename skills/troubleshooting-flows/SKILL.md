---
name: troubleshooting-flows
description: Diagnose and resolve Celigo flow failures -- total failures, partial errors, stuck jobs, empty runs, and performance issues. Use when a flow is failing, producing errors, returning no data, or running slowly.
---

<!-- TIER:1 -->

# Troubleshooting Flows

A flow is broken when it fails to move data correctly. This skill covers systematic diagnosis: identifying the problem type, isolating the failing step, inspecting errors, and resolving them.

Troubleshooting concerns:

- **Job status** -- understanding what `completed`, `failed`, `canceled`, and `retrying` mean for the flow
- **Error analysis** -- grouping errors by pattern to find root causes instead of reading them one-by-one
- **Request/response inspection** -- seeing exactly what was sent and returned at each step
- **Execution logs** -- record-level tracing through every stage of the pipeline
- **Retry and resolution** -- fixing error data and retrying vs bulk resolving
- **Delta/state issues** -- `lastExportDateTime` drift, stuck deltas, re-processing windows

## How to Run the Steps

This skill names each diagnostic step by what it reads or changes; the exact calls depend on how you reach the account. Read the one reference that matches your tools -- both follow the step numbers of the Diagnostic Workflow below:

- **Celigo MCP tools** (`list_flow_runs`, `list_flow_errors`, `triage_flow_errors`, ...) -- [references/mcp.md](references/mcp.md)
- **The `celigo` CLI** -- [references/cli.md](references/cli.md)

Diagnosis is read-only. Retrying errors, resolving them, running a flow, and changing configuration all write to the account or to the connected systems -- do them only when the user asked for the fix, not as part of finding the cause.

## Problem Categories

### Total Failure

Job status is `failed` with 0 successful records. The entire run collapsed before processing any data. Typically `numPagesGenerated: 0` (export-level failure) or pages generated but `numPagesProcessed: 0` (import-level failure on the first page).

Common causes: connection failure (credentials expired, endpoint down), export query error (invalid SQL, bad saved search ID), missing/deleted resource, permission denied.

### Partial Failure

Job status is `completed` but `numError > 0` alongside successful records. Some records failed while others processed normally. Real-world data shows wide variance -- from 2 errors in 8000 successes to 500+ errors in 8000 successes.

Common causes: validation errors on the destination (required fields missing, type mismatches), duplicate key violations, record-level lookup failures, rate limiting on specific batches, data-dependent issues (specific records have bad data).

### Empty Run

Job completes successfully with 0 errors AND 0 records processed.

Common causes: wrong `resourcePath` on the export (extracts from wrong JSON path), delta export with no changes since last run (legitimate), output filter too restrictive (all records filtered out), source query returns no results, webhook export with no inbound events.

### Stuck or Long-Running

Job stays in `running` or `retrying` status longer than expected.

Common causes: large dataset with no pagination limits, destination system slow to respond, script hook with long-running logic, on-premise agent connectivity issues, rate limiting causing backoff.

### Intermittent Failures

Flow sometimes succeeds and sometimes fails with the same configuration.

Common causes: token/session expiry mid-run (long-running flows), rate limiting (varies with concurrent flows), transient network errors, source system maintenance windows.

## Error Diagnosis Framework

### Classification

When an error occurs, classify it into one of three categories to determine the right action:

| Category | HTTP status codes | Meaning | Action |
|---|---|---|---|
| **Needs investigation** | 400, 401, 403, 404, 405, 409, 422 | Missing info, wrong IDs, permission denied, validation errors | Stop and investigate -- check resource config, connection status, permissions |
| **Transient** | 408, 429, 500, 502, 503, 504 | Timeouts, rate limits, server errors | Retry once. If it fails again, escalate -- the external system may be down |
| **Configuration error** | varies | Preconditions not met but fixable | Follow the error message guidance to fix the config, then retry |

A 5xx error not in the transient list (e.g., 501) is still likely transient. A 4xx error not in the investigation list warrants manual review.

### Root Cause: Configuration vs Data

Every flow error has one of two root causes:

- **Static configuration** -- a hardcoded value in the step config is wrong (mapping expression, filter rule, hardcoded field, URI, query, SQL statement). Fix: change the resource configuration.
- **Dynamic data** -- the upstream source sent unexpected data (missing required field, wrong type, null where a value is expected, unexpected array/object shape). Fix: add input filtering or validation upstream, or fix the source system

**To distinguish:** check if the error reproduces with different input records. If the same error occurs for every record, it's configuration. If only some records fail, it's data. Compare the step's error count with the run's total records, then sample several errors and compare their messages and the records they carry.

### Which Step Failed?

Error location determines which resource and skill to investigate:

| Error location | Resource to check | Skill |
|---|---|---|
| Export / page generator | Export config (connection, query, resourcePath) | configuring-exports |
| Import / page processor | Import config (mapping, destination fields, operation) | configuring-imports |
| Script hook | Script code (preSavePage, preMap, postMap, postSubmit) | writing-scripts |
| Mapping | Mapping expression (field paths, lookups, hardcoded values) | writing-mappings |
| Filter | Filter expression (s-expression syntax, field references) | configuring-filters |
| Connection | Connection config (auth, URL, credentials) | configuring-connections |

## Quick Reference

### Symptom --> First Look

| Symptom | Look at first | Then |
|---|---|---|
| Flow totally failed | The latest run's counts (step 1) | `numPagesGenerated: 0` means the export failed -- check its connection and query, not the import |
| Partial errors | Open-error counts per step (step 2) | Group that step's errors by message (step 3) to find the root-cause pattern |
| Empty run (0 records) | The latest run's counts (step 1) | Export config: `resourcePath`, delta state, output filter |
| Stuck / long-running | The flow's in-progress runs | Triangulate before diagnosing -- see Stuck-Flow Triangulation |
| Intermittent failures | The flow's run history | Compare failing vs passing runs; check token expiry and rate limits |
| Errors that "went away" | Resolved-error history | Resolved by auto-retry (`resolvedBy: auto`) means the platform already recovered -- nothing to chase |
| **Silent logic bug** (no errors, wrong output) | A test run (step 5) | If the test run can't reach it, arm execution logging (step 6) and run for real |
| **Production incident** (real traffic matters) | Execution logging (step 6), then a run | Read per-record I/O; the failing stage names the problem |

## Related Skills

- **building-flows** ([Quick Reference](../building-flows/SKILL.md#quick-reference)) -- flow structure, topologies, and configuration
- **configuring-exports** ([Quick Reference](../configuring-exports/SKILL.md#quick-reference)) -- export configuration and adaptor types
- **configuring-imports** ([Quick Reference](../configuring-imports/SKILL.md#quick-reference)) -- import configuration and adaptor types
- **writing-scripts** ([Quick Reference](../writing-scripts/SKILL.md#quick-reference)) -- script hook debugging and data shapes

<!-- TIER:2 -->

## Diagnostic Workflow

### 1. Check the run status

Start with the most recent run of the flow (its parent job), then open the run to see its per-step child jobs -- one per export and import.

Key fields: `status`, `numError`, `numSuccess`, `numIgnore`, `numPagesGenerated`, `numPagesProcessed`, `startedAt`, `endedAt`. A `failed` status with `numPagesGenerated: 0` means the export itself failed -- don't look at import errors. `completed` with `numError > 0` means partial failure at the record level.

### 2. Get the per-step error counts

See which steps have open errors and how many. Focus on the step with the most errors first.

### 3. Analyze error patterns

Group the step's errors by message to find the root cause instead of reading them one-by-one. If most errors share the same message, that's your root cause. Multiple distinct patterns may indicate multiple issues. Group a large enough sample: a page of 100 can hide a second pattern in a step with thousands of errors.

### 4. Inspect individual errors

Once you know the pattern, look at specific records: each error's message and code, the record data the step failed on (its retry data), and the HTTP request/response that produced the error. The raw request/response is the most powerful diagnostic -- it shows exactly what was sent and what the destination answered.

### 5. Use test runs for safe iteration (try this first)

Test runs process a single page without affecting production data or delta state. Fast, safe, no arming, no side effects -- answers most logic questions. A test run reports the stages each step went through; with per-stage results you can read every stage's `{name, input, output, errors}`.

Test runs don't advance the delta timestamp -- you can repeat them safely against the same data.

**Limitations:** imports don't actually submit, mock data is shared across lookups/imports, and some adaptors don't run in test mode. When these bite, escalate to step 6.

### 6. End-to-end debugging with execution logs (silent/logic bugs, production incidents)

When a test run can't answer it -- imports must actually submit, destination behavior matters, or it's a production incident -- arm execution logging, run the flow for real, then read the per-record I/O the run captured. Disarm logging when you're done.

1. Arm execution logging on the flow (a time-boxed debug window).
2. Trigger the run (or wait for the next scheduled run).
3. After the run, list the captured per-record logs for that job.
4. Drill into one record's stages and stage data.
5. Disarm logging.

Each per-record log entry names the stage that produced it, so the failing stage tells you where the record broke. The stage data for the API call holds the raw HTTP request and response. Errors carry retry data -- see step 8 to fix and retry.

### 7. Low-level debug primitives (surgical control)

The step 6 workflow builds on debug windows you can also arm directly: execution logging on the flow, and per-resource debug windows on an export, import, script, or connection that capture raw HTTP at that one step. Use them when you want manual control over arming, clearing, or probing a single step. How each window is armed and read differs by surface -- see your reference.

**Stage names** (for reading one stage of a record's execution log):
- Built-in: `apiCall`, `transformation`, `mapping`, `inputFilter`, `outputFilter`, `responseMapping`, `responseTransformation`, `routing`
- Script hooks: the **function name** wired on the bubble (e.g., `preMapHook`, `postSubmitHook`, `branchingHook`, `preSavePageHook`, `postResponseMapHook`)

**Test runs use a different stage vocabulary** than live execution logs: `request`/`response`/`parse` (three stages) instead of live's merged `apiCall`; `transformTwoDotZero` instead of `transformation`; `responseMap` instead of `responseMapping`; `router` instead of `routing`. Everything else matches. The live execution logs (step 6) use the live vocabulary.

### 8. Fix and retry (or resolve)

**Fix the configuration**, then retry the step's errors. A single field (rename, enable/disable, schedule, a debug window, connection concurrency) is a targeted change; anything else is a full-document update -- read the current document first, because an update replaces the whole document and erases omitted fields.

**Fix the data** when specific records have bad values: read the failing record's retry data, edit it, save it back on the error, then retry that error.

**Resolve without retry** when errors are expected or not worth reprocessing.

Retrying writes to the destination system. Confirm with the user before retrying, and before retrying every open error of a step at once.

### 9. Verify the fix

Run the flow again and confirm clean execution: the new run's counts, then the step's open errors.

## Monitoring Lenses and Execution Metrics

Before diagnosing, pick the lens that matches the question -- all execution state comes through one of two:

- **Running** -- jobs executing right now. The live view: in-progress jobs with real-time progress (records processed so far, errors accumulating, pages generated, whether the export phase is done). Use it for "what's happening this moment" -- a long-running job you're watching, or a flow you just kicked off.
- **Completed** -- historical runs per flow. The rear-view: run counts, runtime, success / error / ignore totals, open errors, and when it last executed or errored. Use it for "how have things been going" -- slow flows, error-prone flows, "did the order sync run today."

Quick test: now --> running; recently / over time --> completed.

### Reading the Execution Metrics

Keep the record-level counts straight so you don't misread a run:

- **Success, error, and ignore are three distinct outcomes per record.** `numSuccess` processed cleanly; `numError` failed; **`numIgnore` is not an error** -- it's a record the flow intentionally skipped (filtered out, or a no-op upsert). Don't fold ignores into error counts: a run with a high `numIgnore` and `numError: 0` is healthy, not broken.
- **Open vs resolved errors.** Open errors are the failures still unresolved and needing attention -- the number that matters for triage. Resolved errors -- cleared by auto-retry or by a user -- are no longer open; the resolved history says who cleared each one (`resolvedBy: auto` is the platform's auto-retry). A flow with many total errors but zero open errors has already recovered; don't chase it.

## Stuck-Flow Triangulation

Every connection is backed by its own FIFO message queue, shared by every flow (and API or Tool step) that uses that connection and drained up to the connection's `concurrencyLevel` in parallel. When a run seems stuck -- `queued`, "not moving", "started but nothing is happening" -- the cause is almost never visible on the resource's configuration. Triangulate three live facts before offering any explanation:

1. **The run's actual state** -- the latest job: `queued`, `running` (with or without progress), or already finished.
2. **Queue depth on each connection the steps drain through** -- how many messages are already in line ahead of this run. A connection document carries its queue sizes (`queues[].size`).
3. **What else is running or queued right now** on those same connections -- other flows and integrations contending for the same drain.

A bare `queued` status is not a diagnosis on its own. Calibrate every conclusion to the legs you actually verified:

- **Verified blocker** -- runtime evidence links it to this run: a queue this run's steps drain through currently holds messages ahead of it.
- **Likely hypothesis** -- consistent with the evidence but not linked at runtime. Another flow's job running or queued right now on a shared connection is a real observation whose blocking role is still an inference (per-slot occupancy isn't visible) -- present it as the likely cause, never confirmed. A flow that merely shares the connection but isn't currently active is a candidate at most.
- **Unknown** -- a leg couldn't be fetched. Name exactly which evidence is missing and keep the diagnosis unconfirmed.

**A shared connection alone is never proof.** "Another flow also uses this connection" becomes a diagnosis only when that flow's work is running or sitting in the queue right now.

**Speak in flows and integrations, not queues and exports.** Walk the chain up and name the flows (and their integrations) producing the load: "your run is waiting behind ~1,200 messages on the NetSuite connection, mostly from 'Inventory Sync', which is running right now" is a diagnosis; "the connection queue has 1,200 messages" is not.

**A backlog is an explanation, not a defect -- but verify it drains.** Work queued ahead means the run is waiting its turn, not broken; it starts when the queue drains. One snapshot can't tell a draining queue from a wedged one, so re-check in ~10-15 minutes. If the second look shows the same depth with the job still waiting -- especially with nothing else running or queued on those connections (idle capacity next to a standing line is itself an anomaly) -- stop advising patience and escalate. Raising `concurrencyLevel` can lift throughput, but that's a connection change, not the fix for a one-time backlog.

**Truly stuck = empty queues + nothing else active + still not moving.** That combination rules out the account and points at the platform -- gather the job id, flow id, timestamps, and the evidence above, and escalate to Celigo support.

**A fix is a hypothesis until a later run proves it.** After any corrective action -- re-enabling the flow, a config change, or canceling a wedged job -- re-run and compare before/after job state before calling the incident resolved. A config-only change with no new run is not runtime-validated.

<!-- TIER:3 -->

## Diagnostic Checklist

Before escalating or concluding investigation:

- [ ] Checked the latest run -- confirmed `status`, `numError`, `numSuccess`, `numIgnore`, `numPagesGenerated`
- [ ] Identified which step(s) have open errors, and how many
- [ ] Grouped the failing step's errors by pattern to identify the root cause
- [ ] Inspected individual errors and their retry data
- [ ] Reviewed the raw HTTP request/response for a representative error
- [ ] If errors are unclear: armed execution logging, re-ran the flow, and inspected the record-level trace
- [ ] Checked resolved-error history before chasing errors that may already have recovered
- [ ] Verified the fix by re-running the flow and confirming clean execution

## Gotchas

1. **A `completed` job can still have errors.** `completed` means the job finished, not that every record succeeded. Always check `numError` alongside status.
2. **Pattern analysis is only as good as its sample.** Grouping the first 100 errors of a step with thousands can miss a second pattern -- widen the sample before concluding.
3. **Execution logging is a time-boxed debug window.** If the flow runs after the window closes, nothing is captured. Arm it, then run promptly.
4. **Test runs don't advance delta state.** This is intentional -- you can test repeatedly with the same data. But it means test runs always re-fetch the same records.
5. **Retrying resolved errors is not possible.** Once resolved, an error cannot be retried. Only resolve errors you're certain don't need reprocessing.
6. **`lastExportDateTime` drift causes re-processing or gaps.** If a delta export's timestamp is wrong, run the flow with an explicit start date (and optionally end date) to reprocess a specific window, rather than editing the checkpoint.
7. **`numPagesGenerated: 0` on a failed job means the export itself failed.** The problem is the source step -- check the connection, query, or endpoint, not the import.
8. **Execution log data is ephemeral.** Logs are retained for a limited time. Enable logging and run the flow promptly.
9. **`numIgnore` is not `numError`.** An ignored record was intentionally skipped (filtered out, or a no-op upsert), not failed. A run with a high `numIgnore` and zero `numError` is healthy -- don't triage it as a failure.
10. **Open errors are the triage number, not total errors.** A flow with thousands of total errors but zero open errors has already recovered via auto-retry or manual resolve. Check open errors against the resolved history before investigating.
11. **A `queued` status is not a diagnosis, and a shared connection is not proof.** Triangulate job state, connection queue depth, and what else is draining that connection first. Another flow blocks yours only when its work is running or queued right now -- merely sharing the connection makes it a candidate at most. A backlog means the run is waiting its turn; re-check in ~10-15 minutes before escalating.

## Common Errors

| Symptom | Likely Cause | Diagnostic Steps |
|---------|-------------|-----------------|
| `failed` with `numPagesGenerated: 0` | Export-level failure (connection, query, endpoint) | Check the export's connection (offline? does a ping succeed?); review the export config |
| `completed` with high `numError` | Destination validation or data issues | Group the step's errors by pattern; read the raw HTTP request/response for one error |
| `completed` with 0 records, 0 errors | Wrong `resourcePath`, empty delta, or filter too restrictive | Verify `resourcePath`; check the delta checkpoint (`lastExportDateTime`); review the output filter |
| `retrying` for extended period | Rate limiting, slow destination, or large dataset | Check destination rate limits; review concurrency on the connection |
| Errors only on specific records | Data-dependent issue (missing fields, bad types, duplicates) | Read the failing records' retry data; compare with successful records |
| Intermittent `failed` on same flow | Token expiry mid-run, transient network, or rate limits | Compare timestamps of failures; check connection token refresh config |
| 401/403 in an error's HTTP response | Expired credentials or insufficient permissions | Check the connection (offline? ping?); re-authorize if OAuth; check API permissions |
| Timeout errors | Slow destination or oversized payload | Reduce batch size; check destination system performance |
| `queued` / `running` but not advancing | Waiting behind queued work on a shared connection, or a platform-side stall | Triangulate job state, connection queue depth, and other flows draining that connection; re-check in 10-15 min. If empty queues + nothing active + still stuck, escalate with the job id and evidence |
