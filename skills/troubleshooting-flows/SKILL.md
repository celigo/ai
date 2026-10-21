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

Job status is `completed` but `numError > 0` alongside successful records. Some records failed while others processed normally. The failed share varies widely, from a handful of records to a large part of the run.

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

The platform stamps each error with a read-only `classification` -- read it from the error itself (every error in a step's error list carries it) rather than guessing from the message or status code. The classifier is heuristic, so identical messages can classify differently, and nothing you configure changes a classification. It decides whether the platform recovers on its own:

| Classification | Typical cause | Recovers on its own? | Action |
|---|---|---|---|
| `intermittent` | Timeouts, 5xx responses, dropped connections | Yes -- up to four automatic retries, the first about 30 minutes after the error, while the flow's `autoResolveMatchingTraceKeys` is on (the default). A `retryAt` on the error means it's still in auto-retry | Wait. Once attempts are exhausted (no `retryAt`) or the setting is off, retry manually when the target is healthy |
| `rate_limit` | HTTP 429, quota exceeded | Through the connection, not the error list -- with auto-recover on, rate-limited records are held while concurrency drops and climbs back, so the flow can look stuck with no new errors | Open `rate_limit` errors mean auto-recover is off or gave up: re-enable it or lower `targetConcurrencyLevel` (see configuring-connections), then retry |
| `connection` | Credentials, permissions, expired token, offline connection | No -- and these errors carry no retry data | Fix the connection (ping it, or read its `offline` flag), then re-run the flow |
| `value` | The destination rejected a value (format, status transition, locked field) | No | Fix the mapping or the data (edit the retry data of records already failed), then retry |
| `missing` | A required field or referenced record is missing | No | Supply the data or fix the lookup or mapping, then retry |
| `duplicate` | The destination already holds the record | No | Fix the match or upsert criteria; resolve the error if the existing record is right |
| `parse` | Malformed JSON or XML, Handlebars or script syntax | No | Fix the template or script, then retry |
| `too_large` | Request, response, or page too big | No -- never auto-recovered | Reduce page or batch size, or trim the payload, then retry |
| (none) | Nothing classified with confidence | No | Read the error's `code` and `message` and its raw HTTP request/response, then investigate |

Status codes are hints, not the classification: a 429 usually lands as `rate_limit`, a 401 or 403 as `connection`, a timeout or 5xx often (not always) as `intermittent`. Don't retry `value`, `missing`, or `parse` errors before fixing the cause -- they fail the same way again. `governance` is a legacy value, since split into `rate_limit` and `too_large`.

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

**Integration App steps.** If the failing step belongs to an Integration App (it carries `_connectorId`), find the app setting that governs the behavior before touching the step. The app locks parts of its steps -- a write to a locked field answers 200 but keeps the app's value -- and the app's own code runs only when its settings are saved through the app ([using-marketplace-templates > Changing an Installed Integration App](../using-marketplace-templates/SKILL.md#changing-an-installed-integration-app)). Only the account's own changes to the step are customer-side causes: in the step's audit log, `source: connector` entries are the app's own and `source: system` entries the platform's. If the account made none, the packaged configuration is the vendor's -- take it to the app's documentation or Celigo support.

## Quick Reference

### Symptom --> First Look

| Symptom | Look at first | Then |
|---|---|---|
| Flow totally failed | The latest run's counts (step 1) | `numPagesGenerated: 0` means the export failed -- check its connection and query, not the import |
| Partial errors | Open-error counts per step (step 2) | Group that step's errors by message (step 3) to find the root-cause pattern |
| Empty run (0 records) | The latest run's counts (step 1) | Export config: `resourcePath`, delta state, output filter |
| Stuck / long-running | The flow's in-progress runs | Triangulate before diagnosing -- see Stuck-Flow Triangulation |
| Scheduled runs not appearing | Whether the flow is disabled, and its in-progress runs | Check in order -- see [Missed Scheduled Runs](#missed-scheduled-runs). Never rewrite a working schedule as the fix |
| Intermittent failures | The flow's run history | Compare failing vs passing runs; check token expiry and rate limits |
| Errors that "went away" | Resolved-error history | Who closed each one (`resolvedBy`) and the retry jobs' counts -- zero open errors is not proof of recovery (see Error Lifecycle and Retries) |
| "It created duplicates" | The runs around the time the user names -- a duplicate the destination accepted raised no error, so it shows in the successes, not the error list | Follow [building-flows > Duplicate Records](../building-flows/SKILL.md#duplicate-records) |
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

Key fields: `status`, `numError`, `numSuccess`, `numIgnore`, `numPagesGenerated`, `numPagesProcessed`, `startedAt`, `endedAt`. The run's own counts add up every step, lookups included -- one record that passes an export and an import counts twice -- so to know how many records a step wrote, failed or ignored, read that step's child job. A `failed` status with `numPagesGenerated: 0` means the export itself failed -- don't look at import errors. `completed` with `numError > 0` means partial failure at the record level.

### 2. Get the per-step error counts

See which steps have open errors and how many. Focus on the step with the most errors first.

### 3. Analyze error patterns

Group the step's errors by message to find the root cause instead of reading them one-by-one. If most errors share the same message, that's your root cause. Multiple distinct patterns may indicate multiple issues. Group a large enough sample: a page of 100 can hide a second pattern in a step with thousands of errors.

### 4. Inspect individual errors

Once you know the pattern, look at specific records: each error's message and code, the record data the step failed on (its retry data), and the HTTP request/response that produced the error. The raw request/response is the most powerful diagnostic -- it shows exactly what was sent and what the destination answered.

### 5. Use test runs for safe iteration (try this first)

Test runs process one page from one generator and never send imports, so they're the safest way to see what every stage does, and they don't advance the delta timestamp. They aren't side-effect free, though (below). The flow may be enabled or disabled -- an enabled flow's test run answers 200 and runs (live-verified 2026-10-14) -- so don't disable a live flow to test it: that stops its schedule and listeners for nothing. A test run reports the stages each step went through; with per-stage results you can read every stage's `{name, input, output, errors}`.

Test runs don't advance the delta timestamp -- you can repeat them safely against the same data.

What each way of running something touches:

| Operation | Source systems | Destinations |
|---|---|---|
| A test run of a flow (or of a tool or API) | Read live, unless the export has a saved `mockOutput` -- then it's replayed | Never called -- each import returns its saved `mockResponse`, or the placeholder `{"id": "1234567890", "mockResponse": "replace me"}` |
| Invoking an export on its own | Read live -- except a preview of an export document that still carries `mockOutput` (as one read from the API does), which returns that snapshot instead; invoking the saved export by id reads live | -- |
| Invoking an import on its own | -- | **Written** -- no job is created, but the request is sent |
| A real run of the flow | Read live | **Written** |
| Retrying errors | Replays each error's saved retry data | **Written** |

Hooks execute in all of these, and nothing sandboxes the `integrator-api` module in test mode: treat a hook's writes -- to a lookup cache or state, or an import or flow it runs -- as real. In a test run an import's `response` and `parse` stages show the mock, not the destination's answer -- when that answer matters, escalate to step 6. To make downstream steps testable, save a realistic `mockResponse` on the import ([configuring-imports > Testing an Import Without Writing](../configuring-imports/SKILL.md#testing-an-import-without-writing)).

### 6. End-to-end debugging with execution logs (silent/logic bugs, production incidents)

When a test run can't answer it -- imports must actually submit, destination behavior matters, or it's a production incident -- arm execution logging, run the flow for real, then read the per-record I/O the run captured. Disarm logging when you're done.

1. Arm execution logging on the flow (a time-boxed debug window).
2. Trigger the run (or wait for the next scheduled run).
3. After the run, list the captured per-record logs for that job.
4. Drill into one record's steps, then read one stage's data by name (stage names: step 7).
5. Disarm logging.

A stage read returns entries that name their stage, and a mapping or hook entry carries `input`, `output` and `errors` (much like a test run's per-stage results), so the failing stage tells you where the record broke. The stage data for the API call holds the raw HTTP request and response. Errors carry retry data -- see step 8 to fix and retry.

**Logs are never retroactive.** Each job records the logging mode it ran under (the run's `logMode`) -- that, not the flow's current setting, says what a past run captured; enabling logging afterwards recovers nothing. `basic` keeps record counts and step status only, with no payloads; `detailed` adds request and response payloads; a debug window captures every stage. Payload capture needs the account's payload-storage setting (`logging.storePayload`), which an owner or administrator turns on. An empty execution-log read is not an error: check the stage name first -- an unknown stage returns the same empty result as one that captured nothing (step 7 lists the names) -- then the run's `logMode`, and give a just-finished run a few minutes to index.

### 7. Low-level debug primitives (surgical control)

The step 6 workflow builds on debug windows you can also arm directly: execution logging on the flow, and per-resource debug windows on an export, import, script, or connection that capture raw HTTP at that one step. Use them when you want manual control over arming, clearing, or probing a single step. How each window is armed and read differs by surface -- see your reference.

**Stage names** (for reading one stage of a record's execution log). Neither the record index nor a record's step timeline lists its stages, so you ask for each one by name:
- `apiCall` -- the HTTP request and response an export or import sent
- `mapping` -- an import's per-record mapping input and output
- `transformation` -- an export's transform, per record (not `transform`)
- `outputFilter` -- an export's output filter, per record
- `responseMapping` -- a step's response mapping, per record
- Script hooks: `<hookType>Hook`, whatever the hook's function is called: `preSavePageHook`, `preMapHook`, `postMapHook`, `postSubmitHook`, `postResponseMapHook`. On a run logged at debug level, the hook stage holds the hook's input (its `options`) and its return value; a `preSavePageHook`, `preMapHook`, `postMapHook` or `postSubmitHook` entry covers the whole group, with its records under `data`, while `postResponseMapHook` entries are per record. The function's own name and the bare hook name (`preMap`) return none of it, and a postMap hook logs only when the import has mappings.
- Unconfirmed: `responseTransformation` or `responseTransform`, `inputFilter`, `routing`

An unknown stage name gets the same empty result as a stage that captured nothing -- a misspelling raises no error -- so an empty answer tells you nothing until the name is right.

**Test runs use a different stage vocabulary** than live execution logs: `request`/`response`/`parse` (three stages) where live has a single `apiCall`, `transformTwoDotZero` and `responseMap` where live has `transformation` and `responseMapping`, and `router` for routing. Don't reuse test-run stage names when reading live execution logs (step 6).

### 8. Fix and retry (or resolve)

**Fix the configuration**, then prove the fix on one record before retrying the rest -- a retry against an unproven fix just produces a new error per record: retry one error, read the retry job it queues (one success, no error?), and only then retry the rest. A single field (rename, enable/disable, schedule, a debug window, connection concurrency) is a targeted change; anything else is a full-document update -- read the current document first, because an update replaces the whole document and erases omitted fields. A connection's full update also needs its real credentials -- see **configuring-connections** (Credential Discipline).

**Fix the data** when specific records have bad values: read the failing record's retry data, edit it, save it back on the error, then retry that error.

**Resolve without retry** when errors are expected or not worth reprocessing.

Retrying writes to the destination system. Confirm with the user before retrying, and before retrying every open error of a step at once.

### 9. Verify the fix

Run the flow again and confirm clean execution: the new run's counts, then the step's open errors. For a retry, read the retry job rather than the open-error list (see [Error Lifecycle and Retries](#error-lifecycle-and-retries)).

## Monitoring Lenses and Execution Metrics

Before diagnosing, pick the lens that matches the question -- all execution state comes through one of two:

- **Running** -- jobs executing right now. The live view: in-progress jobs with real-time progress (records processed so far, errors accumulating, pages generated, whether the export phase is done). Use it for "what's happening this moment" -- a long-running job you're watching, or a flow you just kicked off.
- **Completed** -- historical runs per flow. The rear-view: run counts, runtime, success / error / ignore totals, open errors, and when it last executed or errored. Use it for "how have things been going" -- slow flows, error-prone flows, "did the order sync run today."

Quick test: now --> running; recently / over time --> completed.

### Reading the Execution Metrics

Keep the record-level counts straight so you don't misread a run:

- **Success, error, and ignore are three distinct outcomes per record.** `numSuccess` processed cleanly; `numError` failed; **`numIgnore` is not an error** -- it's a record the flow intentionally skipped (filtered out, or a no-op upsert). Don't fold ignores into error counts: a run with a high `numIgnore` and `numError: 0` is healthy, not broken.
- **Run counts never go down; open-error counts do.** A run's `numError` counts every error it produced, including ones resolved since; `numOpenError` is what still needs attention. On the run itself, the counts add up every step (step 1).
- **Open vs resolved errors.** Open errors are the failures still waiting for attention -- the triage number. Resolved errors were closed by a retry, by the platform (`resolvedBy: auto`), or by a user resolving them, which reprocesses nothing; the resolved history says who closed each one. A user in `resolvedBy` means that user resolved or retried the error, not that its record made it: submitting a retry closes the errors it retries at once, before the retry job runs and whatever it does. So zero open errors means nothing is waiting, not that every record made it -- read the retry jobs' counts ([Error Lifecycle and Retries](#error-lifecycle-and-retries)).

## Error Lifecycle and Retries

**A retry is a job, not an outcome.** Retrying errors queues a `type: retry` job and closes the errors it retries immediately: they move to resolved, with `resolvedBy` set to whoever submitted the retry, before the job runs and whatever it does. Each record that fails again comes back as a *new* open error -- a new `errorId` with the same `retryDataKey` and `traceKey` -- so reconcile before-and-after by `retryDataKey`, and judge the retry by the job's counts, never by an empty open-error list read right after submitting. Read each open error's `classification`, `retryAt`, `retryDataKey`, and `traceKey`; read the retry job's status, `numSuccess`, and `numError`, and the records that failed again; the flow's retry history includes the platform's own retries (`triggeredBy: auto`).

What the platform retries on its own depends on the error's `classification` ([Classification](#classification)): only `intermittent` errors, up to four attempts while the flow's `autoResolveMatchingTraceKeys` is on -- an error with `retryAt` set is still in auto-retry, so don't race it with a manual retry. Its value is a real attempt time only once an attempt has run: on a first-occurrence error it's stamped about a minute after `occurredAt`, though the first attempt runs about 30 minutes out; on the new error a failed attempt opens, it's the next attempt's time. Errors classified `connection` carry no `retryDataKey` and can't be retried at all: fix the connection, then re-run the flow. Open errors are purged at their `purgeAt` -- 30 days after they occur by default -- and a purged error can't be retried.

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

**A run frozen for hours won't finish on its own.** The platform's stuck-run recovery cancels a step that stops making progress (typically after about four hours) and stamps `canceledBy: system` -- but `system` also covers stale-run cleanup and the cancels that follow deleting the flow or replacing one of its connections, so read the run's age and counters before calling it stuck. Open the run to see its per-step child jobs; use their counts, not the parent's (the parent sums every step), to see where it froze and whether any import wrote.

**Cancel-and-rerun is clean only if no import wrote.** Cancel the parent run, never a child step -- a canceled child can leave the parent inconsistent. Cancellation is asynchronous (`canceling`, then `canceled`), and a flow runs one instance at a time, so a new run is refused with 409 `job_already_queued` until the cancel lands. If an import already wrote records, the re-run re-reads the same delta window (the checkpoint advances only after a successful run), and create-only imports write duplicates.

**A fix is a hypothesis until a later run proves it.** After any corrective action -- re-enabling the flow, a config change, or canceling a wedged job -- re-run and compare before/after job state before calling the incident resolved. A config-only change with no new run is not runtime-validated.

## Missed Scheduled Runs

When a flow's scheduled runs aren't appearing, check in order:

1. **Is the flow disabled?** A disabled flow starts no scheduled runs.
2. **Is a run still queued or running?** No scheduled run starts while one is in progress, and the boundaries that pass meanwhile are skipped, by design.
3. **Is the schedule the one you expect?** Read the flow's `schedule` and `timezone` (UTC by default), and the `schedule` on the source step that should fire (its `pageGenerators` entry): a source step's own schedule overrides the flow's.
4. **Did it just start late?** Allow a few minutes past the boundary.

If the flow is enabled, idle and unchanged, and a boundary still passed with no run, the platform's scheduler missed it: offer a manual run to catch up, watch the next boundary, and escalate to Celigo support if boundaries keep passing. Never rewrite or re-save a working schedule as the fix -- every valid form runs, step forms like `*/15` included.

<!-- TIER:3 -->

## Diagnostic Checklist

Before escalating or concluding investigation:

- [ ] Checked the latest run -- confirmed `status`, `numError`, `numSuccess`, `numIgnore`, `numPagesGenerated`
- [ ] Identified which step(s) have open errors, and how many
- [ ] Grouped the failing step's errors by pattern to identify the root cause
- [ ] Inspected individual errors and their retry data
- [ ] Reviewed the raw HTTP request/response for a representative error
- [ ] If errors are unclear: armed execution logging, re-ran the flow, and inspected the record-level trace
- [ ] Before calling errors recovered: checked who resolved them (`resolvedBy`) and the retry jobs' counts
- [ ] Verified the fix by re-running the flow and confirming clean execution -- for a retry, by the retry job's counts

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
10. **Zero open errors is not proof of recovery.** Errors leave the open list when a retry is submitted, whatever it then does, when the platform auto-resolves them, when a user resolves them (nothing is reprocessed), or when they're purged after 30 days. Open errors are the triage number, but judge a retry by its job's `numSuccess` / `numError`, and check `resolvedBy` in the resolved history before calling a flow recovered.
11. **A `queued` status is not a diagnosis, and a shared connection is not proof.** Triangulate job state, connection queue depth, and what else is draining that connection first. Another flow blocks yours only when its work is running or queued right now -- merely sharing the connection makes it a candidate at most. A backlog means the run is waiting its turn; re-check in ~10-15 minutes before escalating.
12. **Test runs execute hooks but write nothing to the script log.** Read a hook's effect from the test run's per-stage results, where your surface offers them. A script's debug logs only have entries from real runs -- where `console.log` / `info` / `warn` / `error` are recorded at every logging level, and `console.debug` only while the script's debug window is open.
13. **Retries need an enabled flow.** Retrying errors on a disabled flow fails with 422 `inactive_flow` -- enable it before you retry. Test runs work on enabled and disabled flows alike.
14. **Removing a step hides its open errors.** Once a step is detached from its flow, its open errors drop out of the integration's error summary, and reading the errors of a run that used it fails with 404 -- until the step is re-attached. Retry or resolve a step's errors before removing it; to read them afterwards, re-attach it.

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
| A retry says no open errors matched, or a key "looks like an errorId" | Passed `errorId`s, or the errors were already resolved or purged | Pass the errors' `retryDataKey` values; resolved errors can't be retried |
| 422 `inactive_flow` on a retry | The flow is disabled | Re-enable it, then retry |
| 404 reading a run's errors, though the flow exists | A step that run used was removed from the flow | Re-attach the step to read, retry or resolve its errors (gotcha 14) |
| 409 `job_already_queued` on a run | A run is still queued, running, or canceling | Wait for it to finish; after a cancel, read the run until its status is `canceled` |
| 422 when arming debug logging | The account's payload storage (`logging.storePayload`) is off -- detailed and debug logging need it | An account owner or administrator turns it on, then arm debug again |
| Test run shows old sample records instead of live data | The export has a saved `mockOutput`, which test runs replay | Read the export's `mockOutput`, and clear it to read the live source again |
