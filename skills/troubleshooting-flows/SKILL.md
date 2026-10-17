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

The platform stamps each error with a read-only `classification` -- read it from the error itself (`celigo flows errors <flowId> <stepId>`) rather than guessing from the message or status code. The classifier is heuristic, so identical messages can classify differently, and nothing you configure changes a classification. It decides whether the platform recovers on its own:

| Classification | Typical cause | Recovers on its own? | Action |
|---|---|---|---|
| `intermittent` | Timeouts, 5xx responses, dropped connections | Yes -- up to four automatic retries, the first about 30 minutes after the error, while the flow's `autoResolveMatchingTraceKeys` is on (the default). A `retryAt` on the error means it's still in auto-retry | Wait. Once attempts are exhausted (no `retryAt`) or the setting is off, retry manually when the target is healthy |
| `rate_limit` | HTTP 429, quota exceeded | Through the connection, not the error list -- with auto-recover on, rate-limited records are held while concurrency drops and climbs back, so the flow can look stuck with no new errors | Open `rate_limit` errors mean auto-recover is off or gave up: re-enable it or lower `targetConcurrencyLevel` (see configuring-connections), then retry |
| `connection` | Credentials, permissions, expired token, offline connection | No -- and these errors carry no retry data | Fix the connection (`celigo connections ping <id>`), then re-run the flow |
| `value` | The destination rejected a value (format, status transition, locked field) | No | Fix the mapping or the data (`update-error-data` for records already failed), then retry |
| `missing` | A required field or referenced record is missing | No | Supply the data or fix the lookup or mapping, then retry |
| `duplicate` | The destination already holds the record | No | Fix the match or upsert criteria; resolve the error if the existing record is right |
| `parse` | Malformed JSON or XML, Handlebars or script syntax | No | Fix the template or script, then retry |
| `too_large` | Request, response, or page too big | No -- never auto-recovered | Reduce page or batch size, or trim the payload, then retry |
| (none) | Nothing classified with confidence | No | Read the error's `code` and `message` and `flows error --request-detail`, then investigate |

Status codes are hints, not the classification: a 429 usually lands as `rate_limit`, a 401 or 403 as `connection`, a timeout or 5xx often (not always) as `intermittent`. Don't retry `value`, `missing`, or `parse` errors before fixing the cause -- they fail the same way again. `governance` is a legacy value, since split into `rate_limit` and `too_large`.

### Root Cause: Configuration vs Data

Every flow error has one of two root causes:

- **Static configuration** -- a hardcoded value in the step config is wrong (mapping expression, filter rule, hardcoded field, URI, query, SQL statement). Fix: change the resource configuration via `celigo <type> set`
- **Dynamic data** -- the upstream source sent unexpected data (missing required field, wrong type, null where a value is expected, unexpected array/object shape). Fix: add input filtering or validation upstream, or fix the source system

**To distinguish:** check if the error reproduces with different input records. If the same error occurs for every record, it's configuration. If only some records fail, it's data.

```bash
# Check if all records fail (configuration) or only some (data)
celigo flows error-summary <flowId>              # Compare error count vs total records
celigo flows errors <flowId> <stepId>            # Sample specific errors to compare
```

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

### Symptom --> First Command

| Symptom | Run first | Then |
|---|---|---|
| Flow totally failed | `celigo jobs list --type flow --flow <flowId> --limit 1` | Check `numPagesGenerated` -- if 0, export failed; check connection and query |
| Partial errors | `celigo flows error-summary <flowId>` | `celigo flows error-analysis <flowId> <stepId>` to find root cause pattern |
| Empty run (0 records) | `celigo jobs list --type flow --flow <flowId> --limit 1` | Check export config (`resourcePath`, delta state, output filter) |
| Stuck / long-running | `celigo jobs current --flow <flowId>` | Check job status; if `retrying`, inspect rate limiting or connection issues |
| Intermittent failures | `celigo jobs run-stats --flow <flowId>` | Compare failing vs passing runs; check token expiry and rate limits |
| **Silent logic bug** (no errors, wrong output) | `celigo flows test-run <flowId> --export <genId>` | If test-run can't reach it, enable execution logging (§6) and run for real |
| **Production incident** (real traffic matters) | `celigo flows enable-execution-logs <flowId>` then run | Read per-record I/O with `query-execution-logs` / `execution-log-detail`; the failing stage names the problem |

### Key Diagnostic Commands

```bash
# Job status
celigo jobs list --type flow --flow <flowId> --limit 1           # Most recent job
celigo jobs current --flow <flowId>        # Currently running job
celigo jobs diagnostics <jobId>            # Full diagnostic bundle

# Error investigation
celigo flows error-summary <flowId>        # Per-step error counts
celigo flows error-analysis <flowId> <id>   # Group errors by pattern
celigo flows errors <flowId> <id>          # List individual errors (each has an errorId)
celigo flows error <flowId> <id> <errorId> --request-detail  # Raw HTTP request/response for one error

# Safe iteration first
celigo flows test-run <flowId> --export <genId>  # try this first; the flow may be enabled or disabled

# End-to-end execution logging (real run, full per-record I/O)
celigo flows enable-execution-logs <flowId>      # arm debug logging, then run the flow
celigo flows execution-logs <flowId> <jobId>     # list captured per-record logs
celigo exports enable-debug <id>                 # or imports enable-debug -- arms the step for debug-requests
celigo flows debug-requests <flowId> <id>        # per-bubble HTTP request/response
```

## Related Skills

- [building-flows > Quick Reference](../building-flows/SKILL.md#quick-reference) -- flow structure, topologies, and configuration
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- export configuration and adaptor types
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- import configuration and adaptor types
- [writing-scripts > Quick Reference](../writing-scripts/SKILL.md#quick-reference) -- script hook debugging and data shapes

<!-- TIER:2 -->

## Diagnostic Workflow

### 1. Check the job status

Start with the most recent job to understand what happened.

```bash
celigo jobs list --type flow --flow <flowId> --limit 1
celigo jobs get <jobId>
celigo jobs current --flow <flowId>
```

Key fields: `status`, `numError`, `numSuccess`, `numIgnore`, `numPagesGenerated`, `numPagesProcessed`, `startedAt`, `endedAt`. A `failed` status with `numPagesGenerated: 0` means the export itself failed -- don't look at import errors. `completed` with `numError > 0` means partial failure at the record level.

### 2. Get the error summary

See which steps have errors and how many.

```bash
celigo flows error-summary <flowId>
```

This returns per-step error counts. Focus on the step with the most errors first.

### 3. Analyze error patterns

Group errors by message pattern to find the root cause instead of reading them one-by-one.

```bash
celigo flows error-analysis <flowId> <exportOrImportId> [--limit 200]
```

If most errors share the same message, that's your root cause. Multiple distinct patterns may indicate multiple issues.

### 4. Inspect individual errors

Once you know the pattern, look at specific records and the HTTP request/response that produced the error.

```bash
celigo flows errors <flowId> <exportOrImportId>                       # list open errors (note the errorId of each)
celigo flows error <flowId> <exportOrImportId> <errorId> --retry-data       # inspect one error + its editable retry data
celigo flows error <flowId> <exportOrImportId> <errorId> --request-detail   # + the captured HTTP request/response
```

`flows error --request-detail` is the most powerful diagnostic -- it resolves the error's `reqAndResKey` for you and shows exactly what HTTP request was sent and what the destination responded with. (If you already hold a `reqAndResKey` from `debug-requests`, use `debug-request-detail` instead.)

### 5. Use test runs for safe iteration (try this first)

Test runs process one page from one generator and never send imports, so they're the safest way to see what every stage does, and they don't advance the delta timestamp. They aren't side-effect free, though (below).

```bash
celigo flows test-run <flowId> --export <exportId>
celigo flows test-run-step-results <flowId> <runId> <exportOrImportId>
celigo flows test-run-step-logs <flowId> <runId> <exportOrImportId>
```

The flow may be enabled or disabled -- an enabled flow's test run answers 200 and runs (live-verified 2026-10-14; CLI 2026.9.x's help still says it must be disabled). Don't disable a live flow to test it: that stops its schedule and listeners for nothing.

`test-run` returns `{metadata, flowJob, childJobs}` -- metadata lists stage names per bubble. Follow with `test-run-step-results` to get `stages[] = [{name, input, output, errors}]` per bubble. Errors include `retryData` inline.

Test runs don't advance the delta timestamp -- you can repeat them safely against the same data.

What each way of running something touches:

| Command | Source systems | Destinations |
|---|---|---|
| `celigo flows test-run` (and `tools test-run`, `apis test-run`) | Read live, unless the export has a saved `mockOutput` -- then it's replayed | Never called -- each import returns its saved `mockResponse`, or the placeholder `{"id": "1234567890", "mockResponse": "replace me"}` |
| `celigo exports invoke` | Read live | -- |
| `celigo imports invoke` | -- | **Written** -- no job is created, but the request is sent |
| `celigo flows run` | Read live | **Written** |
| `celigo flows retry-errors` | Replays each error's saved retry data | **Written** |

Hooks execute in all of these, and nothing sandboxes the `integrator-api` module in test mode: treat a hook's writes -- to a lookup cache or state, or an import or flow it runs -- as real. In a test run an import's `response` and `parse` stages show the mock, not the destination's answer -- when that answer matters, escalate to §6. To make downstream steps testable, save a realistic `mockResponse` on the import ([configuring-imports > Testing an Import Without Writing](../configuring-imports/SKILL.md#testing-an-import-without-writing)).

### 6. End-to-end debugging with execution logs (silent/logic bugs, production incidents)

When test-run can't answer it -- imports must actually submit, destination behavior matters, or it's a production incident -- arm execution logging, run the flow for real, then read the per-record I/O the run captured. Disable debug when you're done.

```bash
# 1. Arm debug logging on the flow (optionally bound the window)
celigo flows enable-execution-logs <flowId> [--duration <minutes>]

# 2. Trigger the run (or wait for the next scheduled run)
celigo flows run <flowId> -y

# 3. After the run, list the captured per-record logs for the job
celigo flows execution-logs <flowId> <jobId>

# 4. Drill into one record's stages and stage data
celigo flows query-execution-logs <flowId> <jobId> --export-or-import-id <id> --group-id <gid> --record-id <rid>
celigo flows execution-log-detail  <flowId> <jobId> --export-or-import-id <id> --stage <stage> --group-id <gid> --record-id <rid>

# 5. Disarm debug logging
celigo flows disable-execution-logs <flowId>
```

Each per-record log entry names the stage that produced it (matching the `test-run-step-results` stage shape: `{ name, input, output, errors }`), so the failing stage tells you where the record broke. For raw HTTP at a bubble, use `debug-requests` / `debug-request-detail` (§7). Errors carry `retryData` inline -- see §8 to fix and retry.

**Logs are never retroactive.** Each job records the logging mode it ran under (`logMode` in `celigo jobs get <jobId>`) -- that, not the flow's current setting, says what a past run captured; enabling logging afterwards recovers nothing. `basic` keeps record counts and step status only, with no payloads; `detailed` adds request and response payloads; a debug window captures every stage. Payload capture needs the account's payload-storage setting (`logging.storePayload`), which an owner or administrator turns on. An empty result from the log commands is not an error: check the run's `logMode`, and give a just-finished run a few minutes to index.

### 7. Low-level debug primitives (surgical control)

These are the debug primitives the §6 workflow builds on -- use them directly when you want manual control over arming, clearing, or probing:

```bash
# Flow-level execution logging
celigo flows enable-execution-logs <flowId> [--duration <minutes>]
celigo flows disable-execution-logs <flowId>
celigo flows execution-logs <flowId> <jobId>
celigo flows query-execution-logs <flowId> <jobId> --export-or-import-id <id> --group-id <gid> --record-id <rid>
celigo flows execution-log-detail <flowId> <jobId> --export-or-import-id <id> --stage <stage> --group-id <gid> --record-id <rid>

# Per-bubble HTTP request/response (arm the step first with exports/imports enable-debug)
celigo flows debug-requests <flowId> <exportOrImportId> [--since 60]
celigo flows debug-request-detail <flowId> <exportOrImportId> <key>

# Per-resource debug toggles (capture raw HTTP at a specific bubble)
celigo exports enable-debug <id>
celigo imports enable-debug <id>
celigo scripts enable-debug <id>
celigo connections enable-debug <id>
```

**Stage names** (for `execution-log-detail --stage`):
- Built-in: `apiCall`, `transformation`, `mapping`, `inputFilter`, `outputFilter`, `responseMapping`, `responseTransformation`, `routing`
- Script hooks: the **function name** wired on the bubble (e.g., `preMapHook`, `postSubmitHook`, `branchingHook`, `preSavePageHook`, `postResponseMapHook`)

**Test-run uses a different stage vocabulary** than live `/logs/data/query`: `request`/`response`/`parse` (three stages) instead of live's merged `apiCall`; `transformTwoDotZero` instead of `transformation`; `responseMap` instead of `responseMapping`; `router` instead of `routing`. Everything else matches. The live execution-log commands (§6) use the live vocabulary.

### 8. Fix and retry (or resolve)

**Fix the configuration**, then prove the fix on one record before retrying the rest -- a retry against an unproven fix just produces a new error per record:

```bash
celigo flows retry-errors <flowId> <exportOrImportId> <retryDataKey>   # prints the retry job's ID
celigo jobs get <retryJobId>                                           # numSuccess 1, numError 0? then:
celigo flows retry-errors <flowId> <exportOrImportId> -y               # retry the rest
```

**Fix the data** when specific records have bad values:

```bash
celigo --jq '.retryData' flows error <flowId> <exportOrImportId> <errorId> --retry-data > data.json
# Edit data.json (the retryData object), then push it back by errorId:
celigo flows update-error-data <flowId> <exportOrImportId> <errorId> < data.json
celigo flows retry-errors <flowId> <exportOrImportId> <retryDataKey>
```

**Resolve without retry** when errors are expected or not worth reprocessing:

```bash
celigo flows resolve-errors <flowId> <exportOrImportId> errorId1,errorId2
celigo flows resolve-errors <flowId> <exportOrImportId> -y
```

### 9. Verify the fix

Run the flow again and confirm clean execution. For a retry, read the retry job rather than the open-error list (see [Error Lifecycle and Retries](#error-lifecycle-and-retries)).

```bash
celigo flows run <flowId> -y
celigo jobs list --type flow --flow <flowId> --limit 1
celigo flows error-summary <flowId>
```

## Monitoring Lenses and Execution Metrics

Before diagnosing, pick the lens that matches the question -- all execution state comes through one of two:

- **Running** -- jobs executing right now. The live view: in-progress jobs with real-time progress (records processed so far, errors accumulating, pages generated, whether the export phase is done). Use it for "what's happening this moment" -- a long-running job you're watching, or a flow you just kicked off. Reach it with `celigo jobs current --flow <flowId>`.
- **Completed** -- historical aggregate per flow. The rear-view: run counts, average runtime, success / error / ignore totals, open errors, and when it last executed or errored. Use it for "how have things been going" -- slow flows, error-prone flows, "did the order sync run today." Reach it with `celigo jobs list --type flow --flow <flowId>` and `celigo jobs run-stats --flow <flowId>`.

Quick test: now --> running; recently / over time --> completed.

### Reading the Execution Metrics

Keep the record-level counts straight so you don't misread a run:

- **Success, error, and ignore are three distinct outcomes per record.** `numSuccess` processed cleanly; `numError` failed; **`numIgnore` is not an error** -- it's a record the flow intentionally skipped (filtered out, or a no-op upsert). Don't fold ignores into error counts: a run with a high `numIgnore` and `numError: 0` is healthy, not broken.
- **Open vs resolved errors.** Open errors are the failures still waiting for attention -- the triage number (`celigo flows errors <flowId> <exportOrImportId>`). Resolved errors (`celigo flows resolved-errors <flowId> <exportOrImportId>`) were closed by a successful retry, by the platform (`resolvedBy: auto`), or by a user -- and a user's resolve reprocesses nothing. Zero open errors means nothing is waiting, not that every record made it: check `resolvedBy` and the retry jobs' counts ([Error Lifecycle and Retries](#error-lifecycle-and-retries)).

## Error Lifecycle and Retries

**A retry is a job, not an outcome.** `celigo flows retry-errors` queues a `type: retry` job and prints its ID. Each record that fails again comes back as a *new* open error -- a new `errorId` with the same `retryDataKey` and `traceKey` -- so reconcile before-and-after by `retryDataKey`, and judge the retry by the job's counts, never by an empty open-error list read right after submitting.

```bash
celigo --jq '.[] | {errorId, classification, retryAt, retryDataKey, traceKey}' flows errors <flowId> <exportOrImportId>
celigo jobs get <retryJobId>                     # status, numSuccess, numError
celigo jobs errors <retryJobId>                  # the records that failed again
celigo jobs list --type retry --flow <flowId>    # retry history, including the platform's own (triggeredBy: auto)
```

What the platform retries on its own depends on the error's `classification` ([Classification](#classification)): only `intermittent` errors, up to four attempts while the flow's `autoResolveMatchingTraceKeys` is on -- an error with `retryAt` set is still in auto-retry, so don't race it with a manual retry. Errors classified `connection` carry no `retryDataKey` and can't be retried at all: fix the connection, then re-run the flow. Open errors are purged at their `purgeAt` -- 30 days after they occur by default -- and a purged error can't be retried.

## Stuck-Flow Triangulation

Every connection is backed by its own FIFO message queue, shared by every flow (and API or Tool step) that uses that connection and drained up to the connection's `concurrencyLevel` in parallel. When a run seems stuck -- `queued`, "not moving", "started but nothing is happening" -- the cause is almost never visible on the resource's configuration. Triangulate three live facts before offering any explanation:

1. **The run's actual state** -- the latest job: `queued`, `running` (with or without progress), or already finished. Get it with `celigo jobs current --flow <flowId>` and `celigo jobs list --type flow --flow <flowId> --limit 1`.
2. **Queue depth on each connection the steps drain through** -- how many messages are already in line ahead of this run.
3. **What else is running or queued right now** on those same connections -- other flows and integrations contending for the same drain.

A bare `queued` status is not a diagnosis on its own. Calibrate every conclusion to the legs you actually verified:

- **Verified blocker** -- runtime evidence links it to this run: a queue this run's steps drain through currently holds messages ahead of it.
- **Likely hypothesis** -- consistent with the evidence but not linked at runtime. Another flow's job running or queued right now on a shared connection is a real observation whose blocking role is still an inference (per-slot occupancy isn't visible) -- present it as the likely cause, never confirmed. A flow that merely shares the connection but isn't currently active is a candidate at most.
- **Unknown** -- a leg couldn't be fetched. Name exactly which evidence is missing and keep the diagnosis unconfirmed.

**A shared connection alone is never proof.** "Another flow also uses this connection" becomes a diagnosis only when that flow's work is running or sitting in the queue right now.

**Speak in flows and integrations, not queues and exports.** Walk the chain up and name the flows (and their integrations) producing the load: "your run is waiting behind ~1,200 messages on the NetSuite connection, mostly from 'Inventory Sync', which is running right now" is a diagnosis; "the connection queue has 1,200 messages" is not.

**A backlog is an explanation, not a defect -- but verify it drains.** Work queued ahead means the run is waiting its turn, not broken; it starts when the queue drains. One snapshot can't tell a draining queue from a wedged one, so re-check in ~10-15 minutes. If the second look shows the same depth with the job still waiting -- especially with nothing else running or queued on those connections (idle capacity next to a standing line is itself an anomaly) -- stop advising patience and escalate. Raising `concurrencyLevel` can lift throughput, but that's a connection change, not the fix for a one-time backlog.

**Truly stuck = empty queues + nothing else active + still not moving.** That combination rules out the account and points at the platform -- capture a `celigo jobs diagnostics <jobId>` bundle and escalate to Celigo support.

**A run frozen for hours won't finish on its own.** The platform's stuck-run recovery cancels a step that stops making progress (typically after about four hours) and stamps `canceledBy: system` -- but `system` also covers stale-run cleanup and the cancels that follow deleting the flow or replacing one of its connections, so read the run's age and counters before calling it stuck. `celigo jobs get <flowJobId>` inlines the per-step child jobs; use their counts, not the parent's (the parent sums every step), to see where it froze and whether any import wrote.

**Cancel-and-rerun is clean only if no import wrote.** Cancel the parent run, never a child step -- a canceled child can leave the parent inconsistent. Cancellation is asynchronous (`canceling`, then `canceled`), and a flow runs one instance at a time, so `flows run` returns 409 `job_already_queued` until the cancel lands. If an import already wrote records, the re-run re-reads the same delta window (the checkpoint advances only after a successful run), and create-only imports write duplicates.

```bash
celigo jobs cancel <flowJobId> -y
celigo jobs get <flowJobId>          # repeat until status is canceled
celigo flows run <flowId> -y
```

**A fix is a hypothesis until a later run proves it.** After any corrective action -- re-enabling the flow, a config change, or canceling a wedged job (`celigo jobs cancel <jobId>`) -- re-run and compare before/after job state before calling the incident resolved. A config-only change with no new run is not runtime-validated.

## CLI Commands

All commands shown in the Diagnostic Workflow above, plus these additional commands:

```bash
# Job inspection (additional)
celigo jobs cancel <jobId> [-y]
celigo jobs diagnostics <jobId>
celigo jobs download-files <jobId>
celigo jobs get <jobId>
celigo jobs errors <jobId>
celigo jobs run-stats [--flow <flowId>] [--status <status>]

# Error investigation (additional)
celigo flows resolved-errors <flowId> <exportOrImportId>

# Error resolution (additional)
celigo flows assign-errors <flowId> <exportOrImportId> <email> [errorIds] [-y]
celigo flows delete-resolved-errors <flowId> <exportOrImportId> [errorIds] [-y]
celigo flows tag-errors <flowId> <exportOrImportId>

# Debug logging (additional)
celigo flows query-execution-logs <flowId> <jobId> --export-or-import-id <id> --group-id <gid> --record-id <rid>

# Flow state
celigo flows last-export-date <flowId>
celigo flows run <flowId> [--start-time <ISO8601>] [--end-time <ISO8601>] [--export-ids <ids>] [-y]
```

<!-- TIER:3 -->

## Diagnostic Checklist

Before escalating or concluding investigation:

- [ ] Checked job status via `celigo jobs list --type flow --flow <flowId> --limit 1` -- confirmed `status`, `numError`, `numSuccess`, `numPagesGenerated`
- [ ] Ran `celigo flows error-summary` to identify which step(s) have errors
- [ ] Ran `celigo flows error-analysis` to group errors by pattern and identify root cause
- [ ] Inspected individual errors via `celigo flows errors` and `celigo flows error <flowId> <exportOrImportId> <errorId> --retry-data`
- [ ] Reviewed raw HTTP request/response via `celigo flows error <flowId> <exportOrImportId> <errorId> --request-detail`
- [ ] If errors are unclear: enabled execution logs, re-ran flow, and inspected record-level trace
- [ ] If HTTP-level detail needed: armed the failing export/import (`exports enable-debug` / `imports enable-debug`) and used `celigo flows debug-requests` on it
- [ ] Verified fix by re-running the flow and confirming clean execution

## Gotchas

1. **A `completed` job can still have errors.** `completed` means the job finished, not that every record succeeded. Always check `numError` alongside status.
2. **`error-analysis` only samples up to `--limit` errors.** Default is 100. For flows with thousands of errors, increase the limit to get an accurate pattern distribution.
3. **`flows error` takes the `errorId` (the `_id` from `flows errors`), not a `reqAndResKey` or `retryDataKey`.** It resolves those internal keys for you: `--request-detail` follows the error's `reqAndResKey`, `--retry-data` follows its `retryDataKey`. Use `debug-request-detail` only when you already hold a raw `reqAndResKey` from `debug-requests`.
4. **Debug execution logs auto-disable after `--duration` minutes.** The default and the maximum is 60 -- the CLI silently clamps larger values. If your flow runs after the window expires, you get no logs. Enable, then run promptly.
5. **Test runs don't advance delta state.** This is intentional -- you can test repeatedly with the same data. But it means test runs always re-fetch the same records.
6. **Retrying resolved errors is not possible.** Once resolved, an error cannot be retried. Only resolve errors you're certain don't need reprocessing.
7. **`lastExportDateTime` drift causes re-processing or gaps.** If a delta export's timestamp is wrong, use `celigo flows run <flowId> --start-time <ISO8601> [--end-time <ISO8601>]` to override and reprocess a specific window.
8. **Empty `numPagesGenerated: 0` on a failed job means the export itself failed.** The problem is the source step -- check the connection, query, or endpoint, not the import.
9. **Execution log data is ephemeral.** Logs are retained for a limited time. Enable logging and run the flow promptly.
10. **`jobs diagnostics` produces a diagnostic bundle.** Use this when Celigo support asks for details -- it includes internal execution context not visible through other commands.
11. **`numIgnore` is not `numError`.** An ignored record was intentionally skipped (filtered out, or a no-op upsert), not failed. A run with a high `numIgnore` and zero `numError` is healthy -- don't triage it as a failure.
12. **Zero open errors is not proof of recovery.** Errors leave the open list when a retry succeeds, when the platform auto-resolves them, when a user resolves them (nothing is reprocessed), or when they're purged after 30 days. Open errors are the triage number, but judge a retry by its job's `numSuccess` / `numError`, and check `resolvedBy` in `flows resolved-errors` before calling a flow recovered.
13. **A `queued` status is not a diagnosis, and a shared connection is not proof.** Triangulate job state, connection queue depth, and what else is draining that connection first. Another flow blocks yours only when its work is running or queued right now -- merely sharing the connection makes it a candidate at most. A backlog means the run is waiting its turn; re-check in ~10-15 minutes before escalating.
14. **Test runs execute hooks but write nothing to the script log.** Read a hook's effect from `test-run-step-results`. `celigo scripts debug-logs <scriptId>` only has entries from real runs -- where `console.log` / `info` / `warn` / `error` are recorded at every logging level, and `console.debug` only while the script's debug window is open.
15. **Retries need an enabled flow.** `flows retry-errors` on a disabled flow fails with 422 `inactive_flow` -- enable it before you retry. Test runs work on enabled and disabled flows alike.

## Common Errors

| Symptom | Likely Cause | Diagnostic Steps |
|---------|-------------|-----------------|
| `failed` with `numPagesGenerated: 0` | Export-level failure (connection, query, endpoint) | Check connection status (`celigo connections ping`); review export config |
| `completed` with high `numError` | Destination validation or data issues | `error-analysis` to find pattern; `flows error --request-detail` for HTTP detail |
| `completed` with 0 records, 0 errors | Wrong `resourcePath`, empty delta, or filter too restrictive | Verify `resourcePath`; check `lastExportDateTime`; review output filter |
| `retrying` for extended period | Rate limiting, slow destination, or large dataset | Check destination rate limits; review concurrency on connection |
| Errors only on specific records | Data-dependent issue (missing fields, bad types, duplicates) | `flows error --retry-data` to inspect failing records; compare with successful records |
| Intermittent `failed` on same flow | Token expiry mid-run, transient network, or rate limits | Compare timestamps of failures; check connection token refresh config |
| 401/403 errors in `flows error --request-detail` | Expired credentials or insufficient permissions | `celigo connections ping`; re-authorize if OAuth; check API permissions |
| Timeout errors | Slow destination or oversized payload | Reduce batch size; check destination system performance |
| `queued` / `running` but not advancing | Waiting behind queued work on a shared connection, or a platform-side stall | Triangulate job state (`jobs current`), connection queue depth, and other flows draining that connection; re-check in 10-15 min. If empty queues + nothing active + still stuck, capture `jobs diagnostics` and escalate |
| `flows retry-errors` says no open errors matched, or a key "looks like an errorId" | Passed `errorId`s, or the errors were already resolved or purged | Pass `retryDataKey` values from `flows errors`; resolved errors can't be retried |
| 422 `inactive_flow` on `flows retry-errors` | The flow is disabled | Re-enable it (`celigo flows set <flowId> disabled=false`), then retry |
| 409 `job_already_queued` on `flows run` | A run is still queued, running, or canceling | Wait for it (`celigo jobs current --flow <flowId>`); after `jobs cancel`, poll `jobs get` until `canceled` |
| 422 when arming debug logging | The account's payload storage (`logging.storePayload`) is off -- detailed and debug logging need it | An account owner or administrator turns it on, then arm debug again |
| Test run shows old sample records instead of live data | The export has a saved `mockOutput`, which test runs replay | `celigo --jq '.mockOutput' exports get <exportId>`; clear it with `celigo exports set <exportId> mockOutput=null` |
