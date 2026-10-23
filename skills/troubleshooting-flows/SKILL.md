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

## Read Before You Answer

A diagnosis rests on what this account shows, not on what usually goes wrong. Work through these in order and stop only when the evidence names a cause:

1. **Pin down what the user means.** Which flow or integration, and which symptom: a failed run, some records failing, nothing exported, a stuck or late run, wrong data with no errors, or "it used to work". For "the most recent error", compare the errors' times, not which step has the most errors. If the user only says things are slow and no flow's recent runs are slower than its own history, ask one question -- which flow, run, screen or call is slow -- rather than tuning anything or reporting that nothing is slow.
2. **Read the run.** The latest run's status and each step's counts (success, error, ignore, pages). They name the [problem category](#problem-categories) and the step to look at.
3. **Read the errors themselves.** Open the failing step's errors: message, code, `source`, `classification`, and the values one or two failing records carry (their retry data). Group them by message. Quote what the errors say -- "the lookup has no entry for 'Local Pickup'", not "a lookup probably failed".
4. **Read the configuration the errors point at.** The mapping row, lookup, request body or URI, filter, query, hook or connection the error names. A cause has to explain why these records failed while others on the same step succeeded. Some settings act only in one mode -- an export's `once` callback only when its `type` is `once`, its `{{lastExportDateTime}}` tokens only when it is `delta` -- so read the `type` before naming such a setting as the safeguard or the cause. When the user calls it a platform bug, read the configuration before agreeing or filing anything.
5. **If it used to work, read what changed.** The audit log of the step, the flow and the step's connection, just before the first error or slowdown: a connection change (concurrency, auth, auto-recover) explains a failure or a slowdown as often as a step change.
6. **Before advising a retry or a re-run, say what it will do.** A retry runs each failed record's saved data through the step as the step is now, so it fails the same way until the configuration or that data is fixed. A re-run after a canceled or failed run reads the same window again, so a create-only import writes again the records it already wrote. An empty delta run leaves the checkpoint where it was, so the first run after the fix picks those records up -- no backfill run is needed. When the user asks for a retry that would write records a second time -- errors a postSubmit hook raised after the destination accepted the records, or creates that timed out -- say so and ask before retrying.
7. **Answer with the evidence.** Name the cause as a specific field, value or setting, list the reads that show it, give the fix, and say what not to do yet. An ignored record leaves no error and no retry data, so once its cause is fixed it comes through only if the source sends it again. When some records fail (or are ignored) and others go through, say what those records carry that the others don't -- the value, character or missing field in their data. Change nothing the user didn't ask you to change: when they ask you to fix it, make the change; when they ask why or how to fix it, say what to change and offer to make it. Either way, a retry, a run or a resolve waits for their go-ahead, so offer the one the fix needs. When the fix leaves records for the next scheduled run, say when that run is and what it will bring in, and offer to run it now.

## Problem Categories

### Total Failure

Job status is `failed` with 0 successful records. The entire run collapsed before processing any data. Typically `numPagesGenerated: 0` (export-level failure) or pages generated but `numPagesProcessed: 0` (import-level failure on the first page).

Common causes: connection failure (credentials expired, endpoint down), export query error (invalid SQL, bad saved search ID), missing/deleted resource, permission denied.

### Partial Failure

Job status is `completed` but `numError > 0` alongside successful records. Some records failed while others processed normally. The failed share varies widely, from a handful of records to a large part of the run.

Common causes: validation errors on the destination (required fields missing, type mismatches), duplicate key violations, record-level lookup failures, rate limiting on specific batches, data-dependent issues (specific records have bad data).

### Empty Run

Job completes successfully with 0 errors AND 0 records processed.

Common causes: wrong `resourcePath` on the export (extracts from wrong JSON path), delta export with no changes since last run (legitimate), output filter too restrictive (all records filtered out), source query returns no results, webhook export with no inbound events, or the export now reads another source -- its `_connectionId` was switched to a different connection (a dev or sandbox store, another account). The export's audit log shows the switch; its old value names the connection the export read before, the one to point it back to if the switch was a mistake.

On a file export, also check its name filters (`fileNameStartsWith`, `fileNameEndsWith`): a file whose name doesn't match is skipped silently, and the match is case-sensitive on most servers, so `ORDER_` skips `order_123.csv`. A filter changed in the export's audit log around when the runs went empty is the likely cause; its old value is the one to set back.

A delta run that exports nothing leaves the checkpoint where it was, so once the cause is fixed, the next run picks up the records the empty runs missed -- no backfill run is needed. An empty execution log proves nothing here: the log holds one entry per record, so a run that exported nothing has none at any log mode.

### Stuck or Long-Running

Job stays in `running` or `retrying` status longer than expected.

Common causes: large dataset with no pagination limits, destination system slow to respond, script hook with long-running logic, on-premise agent connectivity issues, rate limiting causing backoff.

**A run that got slower.** Compare the slow runs with earlier runs of the same flow ([Monitoring Lenses](#monitoring-lenses-and-execution-metrics)). In a slow run's family, each step's child job has its own `startedAt` and `endedAt`; the step whose child job ends long after the others is the one holding the run. Before blaming a change, compare that step's records per run with its time per record: more records at the same pace is volume, not a fault. Then check what sets that step's pace: its connection's concurrency (`targetConcurrencyLevel` while auto-recover is on) against what the target system allows, rate-limit errors on that connection, and whether the step calls the target once per record -- a lookup step does, as does an import's dynamic lookup -- where a lookup cache answers from stored values instead ([configuring-lookup-caches](../configuring-lookup-caches/SKILL.md)). Answer with those numbers for the slow run and a normal one: each step's time, its records per run and its time per record or per call. Recommend the change that shortens the slow step, and leave out tuning for the steps that aren't holding the run, such as a larger page size on an export that takes one minute of a twenty-minute run.

### Intermittent Failures

Flow sometimes succeeds and sometimes fails with the same configuration.

Common causes: token/session expiry mid-run (long-running flows), rate limiting (varies with concurrent flows), transient network errors, source system maintenance windows.

## Error Diagnosis Framework

### Classification

The platform stamps each error with a read-only `classification` -- read it from the error itself (every error in a step's error list carries it) rather than guessing from the message or status code. The classifier is heuristic, so identical messages can classify differently, and nothing you configure changes a classification. It decides whether the platform recovers on its own:

| Classification | Typical cause | Recovers on its own? | Action |
|---|---|---|---|
| `intermittent` | Timeouts, 5xx responses, dropped connections | Yes -- up to four automatic retries, the first about 30 minutes after the error, while the flow's `autoResolveMatchingTraceKeys` is on (the default). A `retryAt` on the error means it's still in auto-retry | Wait. Once attempts are exhausted (no `retryAt`) or the setting is off, retry manually when the target is healthy. A timed-out create may have been written anyway, and every retry, automatic or manual, sends it again: for a create-only import, check the destination or make the import skip records that already exist (configuring-imports) |
| `rate_limit` | HTTP 429, quota exceeded | Through the connection, not the error list -- with auto-recover on, rate-limited records are held while concurrency drops and climbs back, so the flow can look stuck with no new errors | Open `rate_limit` errors mean auto-recover is off or gave up: re-enable it or lower `targetConcurrencyLevel` (see configuring-connections), then retry |
| `connection` | Credentials, permissions, expired token, offline connection | No -- and these errors carry no retry data | Fix the connection (ping it, or read its `offline` flag), then re-run the flow |
| `value` | The destination rejected a value (format, status transition, locked field) | No | Fix the mapping (retrying an import's error runs the fixed import) or, when the record itself is bad, edit its retry data; then retry |
| `missing` | A required field or referenced record is missing | No | Supply the data or fix the lookup or mapping, then retry |
| `duplicate` | The destination already holds the record | No | Fix the match or upsert criteria; resolve the error if the existing record is right. A resolve drops the refused record, changes included: when they should reach the destination (an insert refused on a unique key), make the import update or upsert, then retry |
| `parse` | Malformed JSON or XML, Handlebars or script syntax -- or a template naming a field the record doesn't have (`"<field>" not defined in the model`), which is missing data, not syntax | No | Fix the template or script, then retry. For a field "not defined in the model", read the record's retry data first: fix the data, or the import's handling of records that lack it |
| `too_large` | Request, response, or page too big | No -- never auto-recovered | Reduce page or batch size, or trim the payload, then retry |
| (none) | Nothing classified with confidence | No | Read the error's `code` and `message` and its raw HTTP request/response, then investigate |

Status codes are hints, not the classification: a 429 usually lands as `rate_limit`, a 401 or 403 as `connection`, a timeout or 5xx often (not always) as `intermittent`. Don't retry `value`, `missing`, or `parse` errors before fixing the cause -- they fail the same way again. `governance` is a legacy value, since split into `rate_limit` and `too_large`.

### Root Cause: Configuration vs Data

Every flow error has one of two root causes:

- **Static configuration** -- a hardcoded value in the step config is wrong (mapping expression, filter rule, hardcoded field, URI, query, SQL statement). Fix: change the resource configuration.
- **Dynamic data** -- the upstream source sent unexpected data (missing required field, wrong type, null where a value is expected, unexpected array/object shape). Fix: add input filtering or validation upstream, or fix the source system

**To distinguish:** check if the error reproduces with different input records. If the same error occurs for every record, it's configuration. If only some records fail, it's data. Compare the step's error count with the run's total records, then sample several errors and compare their messages and the records they carry. A candidate cause has to explain why these records failed while others on the same step succeeded -- anything every record shares is ruled out. Retry data is the record as it entered the step, so its ids are the source's: identify the destination record from the request the step sent, not from those ids.

### Which Step Failed?

Error location determines which resource and skill to investigate. Each error's `source` says where in the step it was raised -- `application` (the step's call to the external system: usually the destination's answer, but also a request that never went out, such as a URL template that failed to render, so read the `code` with it), `connection`, `mapping`, a filter, or a hook:

| Error location | Resource to check | Skill |
|---|---|---|
| Export / page generator | Export config (connection, query, resourcePath) | configuring-exports |
| Import / page processor | Import config (mapping, destination fields, operation) | configuring-imports |
| Script hook (`pre_save_page_hook`, `pre_map_hook`, `post_map_hook`, `post_submit_hook`, `post_response_map_hook`, ...) | Script code | writing-scripts |
| SuiteScript hook (`pre_send_hook_ss`, `pre_map_hook_ss`, `post_map_hook_ss`, `post_submit_hook_ss`) | The NetSuite step's SuiteScript hook -- a script in NetSuite's file cabinet that runs inside NetSuite, not a Celigo script. A `post_submit_hook_ss` error with a NetSuite code and message is NetSuite's refusal that the hook reworded, as Integration Apps do: diagnose the NetSuite error | configuring-exports, configuring-imports, managing-integrations |
| Tool step (`tool_input`, `tool_output`) | The Tool's input or output schema -- the record entering the Tool, or its mapped output, didn't validate | building-tools |
| Mapping | Mapping expression (field paths, lookups, hardcoded values) | writing-mappings |
| Filter | Filter expression (s-expression syntax, field references) | configuring-filters |
| Connection | Connection config (auth, URL, credentials) | configuring-connections |

**Integration App steps.** If the failing step belongs to an Integration App (it carries `_connectorId`), find the app setting that governs the behavior before touching the step. The app locks parts of its steps -- a write to a locked field answers 200 but keeps the app's value -- and the app's own code runs only when its settings are saved through the app ([using-marketplace-templates > Changing an Installed Integration App](../using-marketplace-templates/SKILL.md#changing-an-installed-integration-app)). So don't write the integration's `settings` or the app's steps to fix it: save the setting with `celigo integrations persist-settings`, or, where no tool saves it (MCP has none), tell the user which setting to change, from what value to what, on the app's settings page. Only the account's own changes to the step are customer-side causes: in the step's audit log, `source: connector` entries are the app's own and `source: system` entries the platform's. If the account made none, the packaged configuration is the vendor's -- take it to the app's documentation or Celigo support. An app's errors often put its own sentence before the original message, and on NetSuite steps they can carry a SuiteScript hook's `source` ([Reading an App's Errors](../managing-integrations/references/integration-apps.md#reading-an-apps-errors)).

## Quick Reference

### Symptom --> First Look

| Symptom | Look at first | Then |
|---|---|---|
| Flow totally failed | The latest run's counts (step 1) | `numPagesGenerated: 0` means the export failed -- check its connection and query, not the import |
| Every step on a NetSuite connection fails with `Invalid login attempt`, and the connection is offline | The connection's account, role and token (`netsuite.account`, `roleName`, `tokenName`) -- name them in the answer | NetSuite refused the token and records why. A NetSuite administrator checks, in order: the token revoked or made inactive; the role taken off the user, made inactive or missing *Log in using Access Tokens*; the integration record set to Blocked; the token created in another account (a refreshed sandbox needs new tokens) -- [configuring-connections > Minimum Required Fields](../configuring-connections/SKILL.md#minimum-required-fields), "A NetSuite token that stops working" |
| Partial errors | Open-error counts per step (step 2) | Group that step's errors by message (step 3) to find the root-cause pattern |
| Empty run (0 records) | The latest run's counts (step 1) | Export config: `resourcePath`, delta state, output filter, a file export's name filters -- and the export's audit log, for a `_connectionId` switched to another store or account or a name filter changed ([Empty Run](#empty-run)) |
| Some records never arrived, and no errors | Each step's `numIgnore` (step 1) | An ignored record raises no error: the run's execution log lists it at the step that skipped it, with status `ignore` (step 6). A record that no router branch took isn't counted at all -- check the branches' filters or the routing script ([building-flows > Branching Flows](../building-flows/SKILL.md#branching-flows)). If the run's log holds nothing for the record (the run captured no per-record log), say so, give the step counts, trace the record in an event report over the run's window, and offer a debug window for the next run, saying how long it can stay open (step 6) |
| Stuck / long-running | The flow's in-progress runs | Triangulate before diagnosing -- see Stuck-Flow Triangulation |
| Nobody was told about a failed or slow run | The notification subscriptions and long-runtime alerts covering the flow | Neither lives on the flow -- see [Alerts and Notifications](#alerts-and-notifications) |
| A canceled run, before running the flow again | The run's status (`canceling` until it lands) and its import steps' `numSuccess` | A re-run reads the same window again, so records an import already wrote are written again -- see Stuck-Flow Triangulation |
| Scheduled runs not appearing, or "it didn't run at 7" | The flow's `timezone` (UTC when unset) and its latest runs' start times | Check in order -- see [Missed Scheduled Runs](#missed-scheduled-runs). Never rewrite a working schedule as the fix |
| Intermittent failures | The flow's run history | Compare failing vs passing runs; check token expiry and rate limits |
| A flow that used to work started failing | The audit log, for changes just before the first error | A flow's own audit log includes changes to its exports, imports, their connections and the scripts they use, but an audit query by one resource's id returns only that resource's changes -- then read each step's and connection's too. A change made before the step's first successful run is configuration still under test, not a regression |
| Errors that "went away" | Resolved-error history | Who closed each one (`resolvedBy`) and the retry jobs' counts -- zero open errors is not proof of recovery (see Error Lifecycle and Retries) |
| Errors came back after a retry | The flow's runs of type `retry`, not the original run | The retry job's own counts, and its start time against the fix's time in the step's audit log (see [Error Lifecycle and Retries](#error-lifecycle-and-retries)) |
| Every record of a GraphQL step fails the same way (HTTP 406 on Shopify) | The step's connection: which of the app's APIs it is bound to (`http._httpConnectorApiId`) and its base URI | A GraphQL step on a connection bound to the app's REST API posts to the REST root. Point the step at a connection that reaches the GraphQL endpoint, and only that step ([configuring-connections > Connection Types](../configuring-connections/SKILL.md#connection-types)) |
| "It created duplicates" | The runs around the time the user names -- a duplicate the destination accepted raised no error, so it shows in the successes, not the error list | Follow [building-flows > Duplicate Records](../building-flows/SKILL.md#duplicate-records) |
| A Data Ingestion sync failed | The sync's own jobs and their errors | A sync isn't a flow: its runs and errors never appear among flow runs or flow errors, and its errors can't be retried or resolved -- fix the cause and run the sync again |
| **Silent logic bug** (no errors, wrong output) | A test run (step 5) | Check what each stage does to the record (step 5); if the test run can't reach it, arm execution logging (step 6) and run for real |
| **Production incident** (real traffic matters) | Execution logging (step 6), then a run | Read per-record I/O; the failing stage names the problem |

## Related Skills

- **building-flows** ([Quick Reference](../building-flows/SKILL.md#quick-reference)) -- flow structure, topologies, and configuration
- **configuring-exports** ([Quick Reference](../configuring-exports/SKILL.md#quick-reference)) -- export configuration and adaptor types
- **configuring-imports** ([Quick Reference](../configuring-imports/SKILL.md#quick-reference)) -- import configuration and adaptor types
- **writing-scripts** ([Quick Reference](../writing-scripts/SKILL.md#quick-reference)) -- script hook debugging and data shapes

<!-- TIER:2 -->

## Diagnostic Workflow

### 1. Check the run status

Make sure it's the right flow first: a cloned flow is named `Clone - <name>` by default, so an account can hold several look-alikes. Diagnose the copy that is enabled, triggered (scheduled, chained, or listening for events) and has recent runs, and say which copy each finding is about.

Start with the most recent run of the flow (its parent job), then open the run to see its per-step child jobs -- one per export and import.

Key fields: `status`, `numError`, `numSuccess`, `numIgnore`, `numPagesGenerated`, `numPagesProcessed`, `startedAt`, `endedAt`. The run's own counts add up every step, lookups included -- one record that passes an export and an import counts twice -- so to know how many records a step wrote, failed or ignored, read that step's child job. A `failed` status with `numPagesGenerated: 0` means the export itself failed -- don't look at import errors. `completed` with `numError > 0` means partial failure at the record level.

### 2. Get the per-step error counts

See which steps have open errors and how many. Focus on the step with the most errors first -- unless the question is about the latest failure: each step's entry also carries `lastErrorAt`, the time of its newest error, so compare those rather than the counts.

### 3. Analyze error patterns

Group the step's errors by message to find the root cause instead of reading them one-by-one. If most errors share the same message, that's your root cause. Multiple distinct patterns may indicate multiple issues. Group a large enough sample: a page of 100 can hide a second pattern in a step with thousands of errors.

### 4. Inspect individual errors

Once you know the pattern, look at specific records: each error's message and code, the record data the step failed on (its retry data), and the HTTP request/response that produced the error. The raw request/response is the most powerful diagnostic -- it shows exactly what was sent and what the destination answered. Only errors from HTTP-based steps have one (they carry a `reqAndResKey`); a NetSuite distributed import's record errors, for example, don't. For an error from a NetSuite step, [Diagnosing NetSuite Steps](../configuring-exports/references/netsuite.md) maps NetSuite's codes to their causes and lists the checks to run against the account.

### 5. Use test runs for safe iteration (try this first)

Test runs process one page from one generator and never send imports, so they're the safest way to see what every stage does, and they don't advance the delta timestamp. They aren't side-effect free, though (below). The flow may be enabled or disabled -- an enabled flow's test run answers 200 and runs (live-verified 2026-10-14) -- so don't disable a live flow to test it: that stops its schedule and listeners for nothing. A test run reports the stages each step went through; with per-stage results you can read every stage's `{name, input, output, errors}`. An Integration App's flow (`_connectorId` set) can't be test-run: the platform answers 422 `not_allowed` ("Debug flow is not allowed for integration apps."), so check a change there by reading the resource back and following its next real run (step 6).

Test runs don't advance the delta timestamp -- you can repeat them safely against the same data.

What each way of running something touches:

| Operation | Source systems | Destinations |
|---|---|---|
| A test run of a flow (or of a tool or API) | Read live, unless the export has a saved `mockOutput` -- then it's replayed | Not written. Most imports aren't called at all -- each returns its saved `mockResponse`, or the placeholder `{"id": "1234567890", "mockResponse": "replace me"}`; a NetSuite DA import still sends the page to NetSuite, which builds each record without saving it ([configuring-imports > Testing an Import Without Writing](../configuring-imports/SKILL.md#testing-an-import-without-writing)) |
| Invoking an export on its own | Read live -- except a preview of an export document that still carries `mockOutput` (as one read from the API does), which returns that snapshot instead; invoking the saved export by id reads live | -- |
| Invoking an import on its own | -- | **Written** -- no job is created, but the request is sent |
| A real run of the flow | Read live | **Written** |
| Retrying errors | Replays each error's saved retry data | **Written** |

Hooks execute in all of these, and nothing sandboxes the `integrator-api` module in test mode: treat a hook's writes -- to a lookup cache or state, or an import or flow it runs -- as real. In a test run an import's `response` and `parse` stages show the mock, not the destination's answer -- when that answer matters, escalate to step 6. To make downstream steps testable, save a realistic `mockResponse` on the import ([configuring-imports > Testing an Import Without Writing](../configuring-imports/SKILL.md#testing-an-import-without-writing)). A replayed `mockOutput` looks live too: the export still shows `request` and `response` stages, the `response` holding the mock under the source's URL, and the test run's HTTP log records a 200. Those stages don't prove the source was read -- check the export for a saved `mockOutput` first.

**No errors, wrong output: check what each stage does to the record.** A Transformation 1.0 transform, or Transformation 2.0 in `create` mode, rebuilds the record from only the fields it maps, so a later filter, router or template that reads a dropped field silently stops matching (`modify` keeps the rest). A filter only passes or skips a record, and a response mapping merges into it. An import's mapping and its preMap/postMap hooks shape only the request it sends ([writing-mappings](../writing-mappings/SKILL.md#gotchas), gotcha 11). A grouped record is an array (`$[0].field`, `$[*].field`): paths written for one object find nothing in it, and a Transformation 2.0 `modify` passes it through unchanged.

### 6. End-to-end debugging with execution logs (silent/logic bugs, production incidents)

When a test run can't answer it -- imports must actually submit, destination behavior matters, or it's a production incident -- arm execution logging, run the flow for real, then read the per-record I/O the run captured. Disarm logging when you're done.

1. Arm execution logging on the flow (a time-boxed debug window).
2. Trigger the run (or wait for the next scheduled run).
3. After the run, list the captured per-record logs for that job.
4. Drill into one record's steps, then read one stage's data by name (stage names: step 7).
5. Disarm logging.

A stage read returns entries that name their stage, and a mapping or hook entry carries `input`, `output` and `errors` (much like a test run's per-stage results), so the failing stage tells you where the record broke. The stage data for the API call holds the raw HTTP request and response. Errors carry retry data -- see step 8 to fix and retry.

**Tracing one record from its error.** The error's `_flowJobId` is the run, and its `traceKey` finds the record's entries in that run's index -- one per step it passed, each with its own `recordId` and `groupId`; neither is the trace key or the error's `oIndex`. With them, read the step's stages in order: `mapping` (what the mapping produced), the hook stages its `hooks` name, such as `postMapHook` (what a hook changed; one entry per group), and `apiCall` (what was sent, and the answer). A value that is right in the `mapping` output and wrong in the request was changed by a hook -- name the hook and its script.

**Logs are never retroactive.** Each job records the logging mode it ran under (the run's `logMode`) -- that, not the flow's current setting, says what a past run captured; enabling logging afterwards recovers nothing. `basic` keeps each record's outcome at each step (`success`, `error` or `ignore`) and, in the `apiCall` stage, each call's method, URL and status code -- no headers or bodies; `detailed` adds headers and bodies; a debug window captures every stage. Payload capture needs the account's payload-storage setting (`logging.storePayload`), which an owner or administrator turns on. A run that captured nothing carries no `logMode` -- for example one that ran while the account-level logging preference was off, when a flow set to `basic` captures nothing. The plan sets limits too, on the account's license: a plan without execution logging captures nothing, one capped at `basic` doesn't include a persistent `detailed` mode but still allows debug windows, and the longest debug window is the plan's `maxDebugDuration` (in minutes) -- a later end is rejected with 422. An empty execution-log read is not an error: check the stage name first -- an unknown stage returns the same empty result as one that captured nothing (step 7 lists the names) -- then the run's `logMode` and its age (gotcha 8), and give a just-finished run a few minutes to index.

**When the run captured nothing at the level needed,** the answer has four parts. Say so, naming the run's `logMode` (or its absence). Give what the run does show: each step's counts, and the rules that could have skipped the record. Trace the record through an event report over the run's window ([Event Reports](#event-reports)): it lists each record's events by trace key whatever the run's logging, so its rows show whether the record was exported and which step ignored it -- on a run that captured nothing, an `ignore` row names the step but not the rule (its `stage` is empty). Then offer to capture the next run with a flow debug window (`logging.debugUntil`) that opens before that run starts, and give the window's limits with the offer: it closes on its own at its end, which can be at most the plan's `maxDebugDuration` ahead (72 hours on a plan that allows 4320 minutes; the CLI's `enable-execution-logs` stops at 60 minutes), so for a nightly run set the end past the run's start. For example: "I can open a debug window now that stays open until just after the next scheduled run (this plan allows up to 72 hours), then trace the record in that run."

### 7. Low-level debug primitives (surgical control)

The step 6 workflow builds on debug windows you can also arm directly, and each feeds a different log. Execution logging on the flow feeds the run's per-record execution log (step 6). An export's or import's own debug window records every request that step sends while it's open -- for a Tool step, each record with the Tool's output -- and can end at most 60 minutes ahead (a later end is rejected with 422 `update_not_allowed`). A connection's window records the traffic every flow sends through it, and a script's window adds its `console.debug` lines to the script's log (gotcha 12). None is retroactive: arm the window, then run. Use them when you want manual control over arming, clearing, or probing a single step. How each window is armed and read differs by surface -- see your reference.

**Stage names** (for reading one stage of a record's execution log). Neither the record index nor a record's step timeline lists the stages a record went through, so you ask for each one by name. One exception: the timeline entry of a step that ignored the record names the stage that skipped it, even on a run logged at `basic` -- `inputFilter` (the import's filter), `preMapHook` (a preMap hook that returned no data for it), or an empty `stage` (an ignore-existing rule). The names:
- `apiCall` -- the HTTP request and response an export or import sent
- `mapping` -- an import's per-record mapping input and output
- `transformation` -- an export's transform, per record (not `transform`)
- `outputFilter` -- an export's output filter, per record
- `inputFilter` -- an import's filter, per record: `success: false` marks a record the filter skipped
- `responseMapping` -- a step's response mapping, per record
- Script hooks: `<hookType>Hook`, whatever the hook's function is called: `preSavePageHook`, `preMapHook`, `postMapHook`, `postSubmitHook`, `postResponseMapHook`. On a run logged at debug level, the hook stage holds the hook's input (its `options`) and its return value; a `preSavePageHook`, `preMapHook`, `postMapHook` or `postSubmitHook` entry covers the whole group, with its records under `data`, while `postResponseMapHook` entries are per record. The function's own name and the bare hook name (`preMap`) return none of it, and a postMap hook logs only when the import has mappings.
- Unconfirmed: `responseTransformation` or `responseTransform`, `routing`

An unknown stage name gets the same empty result as a stage that captured nothing -- a misspelling raises no error -- so an empty answer tells you nothing until the name is right.

**Test runs use a different stage vocabulary** than live execution logs: `request`/`response`/`parse` (three stages) where live has a single `apiCall`, `transformTwoDotZero` and `responseMap` where live has `transformation` and `responseMapping`, and `router` for routing. Don't reuse test-run stage names when reading live execution logs (step 6).

### 8. Fix and retry (or resolve)

**Fix the configuration**, then prove the fix on one record before retrying the rest -- a retry against an unproven fix just produces a new error per record: retry one error, read the retry job it queues (one success, no error?), and only then retry the rest. Retrying an import's error runs its retry data -- the record as it entered the import, before the import's mapping -- through the import as it is now, so a fix to that import's mapping or settings reaches the records that already failed. A single field (rename, enable/disable, schedule, a debug window, connection concurrency) is a targeted change; anything else is a full-document update -- read the current document first, because an update replaces the whole document and erases omitted fields. A connection's full update sends each secret back as the masked value it read, which keeps it, and never leaves one out -- see **configuring-connections** (Credential Discipline).

**Fix the data** when specific records have bad values: read the failing record's retry data, edit it, save it back on the error, then retry that error. Edit the field the step reads -- the source field its mapping extracts, as the retry data holds it -- not the destination field it writes. A correction made in the source system never reaches a retry, because the retry data is the record as it was when it failed: edit the retry data, or let a run export the corrected record again.

**Errors raised after the destination answered are on records it already holds.** A postSubmit hook runs after the import's request succeeded, so its errors (`source: post_submit_hook`, often statusCode 422 with the destination's id on the record) mark records that were written; retrying them runs the import again, and a create-only import writes them a second time. Fix the hook, then resolve those errors rather than retrying them, unless the import is made to skip records that already exist.

**Resolve without retry** only when the record needs nothing more -- a `duplicate` the destination already holds, or a record handled some other way. Resolving reprocesses nothing and a resolved error can't be retried, so resolving a `missing` or `value` error drops that record for good. When a step's errors are mixed, split them by `classification` and message: resolve the ones that need nothing, and fix and retry the rest.

Retrying writes to the destination system. Confirm with the user before retrying, and before retrying every open error of a step at once.

### 9. Verify the fix

A run writes to the destination, so run the flow again only when the user asked for it or agrees -- otherwise say what to run and what to check. Asking for a fix isn't asking for a run: after the fix, say when the next scheduled run picks it up and what it will process, backlog included, and offer to run it now. Then confirm clean execution: the new run's counts, then the step's open errors. For a retry, read the retry job rather than the open-error list (see [Error Lifecycle and Retries](#error-lifecycle-and-retries)). Runs and retry jobs finish asynchronously: if the job is still queued or running after a second read, stop polling and report what you changed, what you submitted, and which job to check.

## Monitoring Lenses and Execution Metrics

Before diagnosing, pick the lens that matches the question -- all execution state comes through one of two:

- **Running** -- jobs executing right now. The live view: in-progress jobs with real-time progress (records processed so far, errors accumulating, pages generated, whether the export phase is done). Use it for "what's happening this moment" -- a long-running job you're watching, or a flow you just kicked off.
- **Completed** -- historical runs per flow. The rear-view: run counts, runtime, success / error / ignore totals, open errors, and when it last executed or errored. Use it for "how have things been going" -- slow flows, error-prone flows, "did the order sync run today."

Quick test: now --> running; recently / over time --> completed.

Completed-run totals cover only their time window -- the last 24 hours unless you ask for another. A flow missing from them had no runs in that window (it still exists), a total never describes more time than its window, and an open-error count is what's open now, whatever the window. Judge "slow" against the flow's own runtime history (its average and p5/p95 per period) and say since when it changed ("slower since Tuesday"), not against a fixed number.

### Reading the Execution Metrics

Keep the record-level counts straight so you don't misread a run:

- **Success, error, and ignore are three distinct outcomes per record.** `numSuccess` processed cleanly; `numError` failed; **`numIgnore` is not an error** -- it's a record the flow intentionally skipped (filtered out, or an import's ignore-existing or ignore-missing rule). Don't fold ignores into error counts: a run with a high `numIgnore` and `numError: 0` is healthy, not broken. An ignored record raises no error, so error lists never show it -- to find out why one was skipped, find it in the run's execution log (step 6), listed with status `ignore` at the step that skipped it, then check that step's filter, router branch or ignore rule.
- **`triggeredBy` says how a run started:** `system` for a scheduled run, a user's id for a manual one, the upstream flow's id for a chained one, and absent for an event-driven run (a listener or webhook). On a retry job it's `auto` for the platform's own retry, otherwise the user who submitted it.
- **Run counts never go down; open-error counts do.** A run's `numError` counts every error it produced, including ones resolved since; `numOpenError` is what still needs attention. On the run itself, the counts add up every step (step 1).
- **Open vs resolved errors.** Open errors are the failures still waiting for attention -- the triage number. Resolved errors were closed by a retry, by the platform (`resolvedBy: auto`), or by a user resolving them, which reprocesses nothing; the resolved history says who closed each one. A user in `resolvedBy` means that user resolved or retried the error, not that its record made it: submitting a retry closes the errors it retries at once, before the retry job runs and whatever it does. So zero open errors means nothing is waiting, not that every record made it -- read the retry jobs' counts ([Error Lifecycle and Retries](#error-lifecycle-and-retries)).

### Alerts and Notifications

Two account-level records tell people about a flow without anyone watching it. Neither appears in the flow's document, so read them when a user asks why nobody was told, and before promising that someone will be.

- **Notification subscriptions** email one account user when the resource they follow raises an error or changes state: a flow, an integration's flows, a connection (going offline) or a sync. Only users of the account can be subscribed ([managing-integrations](../managing-integrations/SKILL.md), per-integration knobs).
- **Long-runtime alerts** email their recipients when a run lasts at least the alert's threshold (5 to 59,940 minutes) -- the warning for a slow or stuck run, which raises no error of its own. An alert covers one flow, or every flow of an integration, and a flow or integration takes one alert (a second is refused with 409). An account without proactive alerts answers 403 to every alert call.

To set up a long-runtime alert:

1. **Take the threshold from the flow's runtime history,** not a round number. Once the window holds 3 completed runs, the platform suggests one: the p99 run time, rounded up, at least 5 minutes. A threshold under the flow's normal runtime alerts on most runs. The history's "alerts triggered" counts past runs over the threshold, not emails sent.
2. **Name recipients the user chose.** Recipients are given as email addresses, and an address that isn't a user of the account yet is invited or given access to the integration, so a new address widens access.
3. **Change it as a whole.** An update replaces the threshold and the whole recipient list together, and the flow or integration it covers is fixed when it's created. Removing an alert's last recipient is refused ("Delete the alert instead").

An alert that has never fired has no last-triggered time. Creating or deleting an alert also writes to the flows it covers: their `lastModified` moves with no new field on the flow, and a create leaves no entry in the flow's audit log, so don't take it for an edit to the flow.

### Event Reports

An event report is a CSV of the record-level events of chosen flows over a time window: one row per record at each step -- exported, looked up, received by a listener, imported, ignored, failed or resolved (the `type` column) -- with its trace key, time, step, run and, for a failure, the error's code, message, source, classification and retry data key. Use one when a question covers every record over a stretch of time, such as last night's failures for an audit or a bulk error review; one run's records are in its execution log -- or, when that run captured none, in an event report over its window, which lists records whatever the run's logging -- and a step's current failures in its open errors.

- **The request** names at least one flow in `_flowIds` and a `startTime` within the last 30 days. `endTime` defaults to the moment of the request, and the window spans at most 3 days: a longer window, or an older start, is refused with 422 and creates nothing. `flow_events` is the only report type.
- **Generation is asynchronous and takes minutes.** A report starts `queued`, turns `running` within seconds, and ends `completed`, `failed` or `canceled`, so poll for all three. `reportGenerationErrors` explains a failure, and can hold per-flow errors on a `completed` report too.
- **Download through a signed URL**, available only once the report is `completed` (400 before that) and valid for about 15 minutes, so ask for a fresh one rather than storing it. The file is served with `Content-Encoding: gzip`: say so when you hand over the link, since a browser decodes it but a script needs a client that does (`curl --compressed`) or has to gunzip it. Its columns start `traceKey`, `time` (epoch milliseconds), `type`, `timeTaken`, `_flowJobId`; a report on several flows adds `_flowId` after them.
- **Cancel** stops a queued or running report. A completed one can't be canceled (422), and a canceled one can't be resumed, so create a new one.
- **Reports can't be deleted.** Each stays in the account's list until it expires, 30 days after it was created.
- **No MCP tool creates or reads event reports.** Over MCP, tell the user to create it in the UI or with the CLI's `event-reports`, and give the window and flows to use. Don't assemble a report yourself from runs and errors, or upload files to stand in for it.

## Error Lifecycle and Retries

**A retry is a job, not an outcome.** Retrying errors queues a `type: retry` job and closes the errors it retries immediately: they move to resolved, with `resolvedBy` set to whoever submitted the retry, before the job runs and whatever it does. Each record that fails again comes back as a *new* open error -- a new `errorId` with the same `retryDataKey` and `traceKey` -- so reconcile before-and-after by `retryDataKey`, and judge the retry by the job's counts, never by an empty open-error list read right after submitting. Read each open error's `classification`, `retryAt`, `retryDataKey`, and `traceKey`; read the retry job's status, `numSuccess`, and `numError`, and the records that failed again; the flow's retry history includes the platform's own retries (`triggeredBy: auto`).

**Read the retry job, not the run it retried.** List the flow's runs of type `retry` to find it -- it is a job of its own. The original run's counts say nothing about the retry: they add up every step, so the export's records count among its successes, and its errors show as resolved from the moment the retry is submitted. A retry runs the step as it is when the retry job runs, so a retry submitted before the fix was saved fails the same way again: compare the retry job's start time with the fix's time in the step's audit log. Then retry the new errors -- after a mapping fix, their retry data needs no edits (step 8).

What the platform retries on its own depends on the error's `classification` ([Classification](#classification)): only `intermittent` errors, up to four attempts while the flow's `autoResolveMatchingTraceKeys` is on -- an error with `retryAt` set is still in auto-retry, so don't race it with a manual retry. Its value is a real attempt time only once an attempt has run: on a first-occurrence error it's stamped about a minute after `occurredAt`, though the first attempt runs about 30 minutes out; on the new error a failed attempt opens, it's the next attempt's time. Errors classified `connection` carry no `retryDataKey` and can't be retried at all: fix the connection, then re-run the flow. Open errors are purged at their `purgeAt` -- 30 days after they occur by default -- and a purged error can't be retried.

**Why wasn't this retried?** Check in order: the flow's `autoResolveMatchingTraceKeys` (off means no automatic retries); the error's `classification` (only `intermittent` retries); its `retryAt`, and the flow's retry jobs with `triggeredBy: auto`; for a `rate_limit` error, the connection's auto-recover.

**A later run resolves or replaces a record's open errors.** While `autoResolveMatchingTraceKeys` is on, a record that later succeeds has its open errors resolved (`resolvedBy: auto`), and one that fails again has its older open error replaced by the new one -- which keeps the older error's tags but gets a new `errorId` and a new `retryDataKey`, so match a record's errors across runs by `traceKey`. The lists can lag the run's end by several seconds, so re-read them before concluding. An error still open after a later run completed therefore belongs to a record that run didn't process: say so before resolving it, because resolving hides a record that never made it. To see which runs carried one record, search the flow's runs by its trace key (your reference). Auto-retry doesn't depend on the trace key, but replacing does: if one record's errors pile up instead of replacing each other, its trace key is blank -- give the source export a `traceKeyTemplate`.

## Stuck-Flow Triangulation

Every connection is backed by its own FIFO message queue, shared by every flow (and API or Tool step) that uses that connection and drained up to the connection's `concurrencyLevel` in parallel. When a run seems stuck -- `queued`, "not moving", "started but nothing is happening" -- the cause is almost never visible on the resource's configuration. Triangulate three live facts before offering any explanation:

1. **The run's actual state** -- the latest job: `queued`, `running` (with or without progress), or already finished.
2. **Queue depth on each connection the steps drain through** -- how many messages are already in line ahead of this run. A connection document carries its queue sizes (`queues[].size`). A message is one unit of work for a step (a page of records, a retry, a webhook delivery), not a record, and the count alone doesn't say which flows put the messages there -- that comes from leg 3.
3. **What else is running or queued right now** on those same connections -- other flows and integrations contending for the same drain.

A bare `queued` status is not a diagnosis on its own. Calibrate every conclusion to the legs you actually verified:

- **Verified blocker** -- runtime evidence links it to this run: a queue this run's steps drain through currently holds messages ahead of it.
- **Likely hypothesis** -- consistent with the evidence but not linked at runtime. Another flow's job running or queued right now on a shared connection is a real observation whose blocking role is still an inference (per-slot occupancy isn't visible) -- present it as the likely cause, never confirmed. A flow that merely shares the connection but isn't currently active is a candidate at most.
- **Unknown** -- a leg couldn't be fetched. Name exactly which evidence is missing and keep the diagnosis unconfirmed.

**A shared connection alone is never proof.** "Another flow also uses this connection" becomes a diagnosis only when that flow's work is running or sitting in the queue right now.

**Speak in flows and integrations, not queues and exports.** Walk the chain up and name the flows (and their integrations) producing the load: "your run is waiting behind ~1,200 messages on the NetSuite connection, mostly from 'Inventory Sync', which is running right now" is a diagnosis; "the connection queue has 1,200 messages" is not.

**A backlog is an explanation, not a defect -- but verify it drains.** Work queued ahead means the run is waiting its turn, not broken; it starts when the queue drains. One snapshot can't tell a draining queue from a wedged one, so re-check in ~10-15 minutes. If the second look shows the same depth with the job still waiting -- especially with nothing else running or queued on those connections (idle capacity next to a standing line is itself an anomaly) -- stop advising patience and escalate. A queue that is deeper at the second look is taking work faster than the connection drains it -- a capacity problem, not a wedge. Raising `concurrencyLevel` can lift throughput, but that's a connection change, not the fix for a one-time backlog.

**A connection recovering from rate limits drains slowly.** While its auto-recover is on, rate-limit errors drop the connection's concurrency to 1, then the platform climbs it back toward `targetConcurrencyLevel`, so runs on it can sit with no progress and no new errors. A `concurrencyLevel` below the connection's `targetConcurrencyLevel` means it's recovering -- check that before calling a run stuck.

**Truly stuck = empty queues + nothing else active + still not moving.** That combination rules out the account and points at the platform -- gather the job id, flow id, timestamps, and the evidence above, and escalate to Celigo support.

**A run frozen for hours won't finish on its own.** The platform's stuck-run recovery cancels a step that stops making progress (typically after about four hours) and stamps `canceledBy: system` -- but `system` also covers stale-run cleanup and the cancels that follow deleting the flow or replacing one of its connections, so read the run's age and counters before calling it stuck. Open the run to see its per-step child jobs; use their counts, not the parent's (the parent sums every step), to see where it froze and whether any import wrote. Every schedule boundary that passed while it was frozen was skipped, not queued -- say how many scheduled runs were missed.

**Cancel-and-rerun is clean only if no import wrote.** Cancel the parent run, never a child step -- a canceled child can leave the parent inconsistent. Only a queued, running or retrying job can be canceled; a finished one answers 403. Cancellation is asynchronous (`canceling`, then `canceled`), and a flow runs one instance at a time, so a new run is refused with 409 `job_already_queued` until the cancel lands. If an import already wrote records, the re-run re-reads the same delta window (the checkpoint advances only after a successful run), and create-only imports write duplicates.

**A fix is a hypothesis until a later run proves it.** After any corrective action -- re-enabling the flow, a config change, or canceling a wedged job -- re-run and compare before/after job state before calling the incident resolved. A config-only change with no new run is not runtime-validated.

## Missed Scheduled Runs

When a flow's scheduled runs aren't appearing, check in order:

1. **Did it run at another hour?** A schedule fires in the flow's `timezone` -- UTC when the flow has none -- and run times (`createdAt`, `startedAt`) are UTC. Put the latest scheduled run's start (`triggeredBy: system`) and the schedule's hour in the user's time zone before anything else: "it didn't run at 7" is often a run at 07:00 UTC. If so, the fix is the flow's `timezone` (an IANA name such as `America/Chicago`), and setting it is the user's call.
2. **Is the flow disabled?** A disabled flow starts no scheduled runs.
3. **Is a run still queued or running?** No scheduled run starts while one is in progress, and the boundaries that pass meanwhile are skipped, by design.
4. **Is the schedule the one you expect?** Read the flow's `schedule`, and the `schedule` on the source step that should fire (its `pageGenerators` entry): a source step's own schedule overrides the flow's.
5. **Did it just start late?** A save can store the minute field five minutes later -- when it is 0, 15, 30 or 45, a list of only those minutes, a range from minute 0, or a `*/N` step above 5 -- and the stored schedule is what runs: `? 0 6 ? * *` is stored as `? 5 6 ? * *` and starts at 6:05, `*/15` as `5-59/15` (other minute fields are kept, see [building-flows](../building-flows/SKILL.md)). Read the stored `schedule`, then allow a few minutes past that boundary.

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
- [ ] Before resolving errors a later run left open: told the user that run didn't process those records
- [ ] For a run that seemed missed or late: compared its UTC start time with the flow's `timezone`
- [ ] Verified the fix by re-running the flow and confirming clean execution -- for a retry, by the retry job's counts

## Gotchas

1. **A `completed` job can still have errors.** `completed` means the job finished, not that every record succeeded. Always check `numError` alongside status.
2. **Pattern analysis is only as good as its sample.** Grouping the first 100 errors of a step with thousands can miss a second pattern -- widen the sample before concluding.
3. **Execution logging is a time-boxed debug window.** If the flow runs after the window closes, nothing is captured. Arm it, then run promptly.
4. **Test runs don't advance delta state.** This is intentional -- you can test repeatedly with the same data. But it means test runs always re-fetch the same records.
5. **Retrying resolved errors is not possible.** Once resolved, an error cannot be retried. Only resolve errors you're certain don't need reprocessing.
6. **`lastExportDateTime` drift causes re-processing or gaps.** If a delta export's timestamp is wrong, run the flow with an explicit start date to reprocess from it, rather than editing the checkpoint. An explicit end date becomes the checkpoint, even a past one, so the next run re-reads everything after it. Runs that export nothing don't move the checkpoint, so they leave no gap to fill.
7. **`numPagesGenerated: 0` on a failed job means the export itself failed.** The problem is the source step -- check the connection, query, or endpoint, not the import.
8. **Execution logs expire.** A run's log is kept for the account's execution-log retention setting -- 7 to 180 days, no longer than the plan's `maxRetentionPeriod` -- and an older run's log reads back empty, as if nothing was captured.
9. **`numIgnore` is not `numError`.** An ignored record was intentionally skipped (filtered out, or an import's ignore-existing or ignore-missing rule), not failed, and it raises no error -- the run's execution log lists it with status `ignore`. A run with a high `numIgnore` and zero `numError` is healthy -- don't triage it as a failure.
10. **Zero open errors is not proof of recovery.** Errors leave the open list when a retry is submitted, whatever it then does, when the platform auto-resolves them, when a user resolves them (nothing is reprocessed), or when they're purged after 30 days. Open errors are the triage number, but judge a retry by its job's `numSuccess` / `numError`, and check `resolvedBy` in the resolved history before calling a flow recovered.
11. **A `queued` status is not a diagnosis, and a shared connection is not proof.** Triangulate job state, connection queue depth, and what else is draining that connection first. Another flow blocks yours only when its work is running or queued right now -- merely sharing the connection makes it a candidate at most. A backlog means the run is waiting its turn; re-check in ~10-15 minutes before escalating.
12. **Test runs execute hooks but write nothing to the script log.** Read a hook's effect from the test run's per-stage results, where your surface offers them. A script's debug logs only have entries from real runs -- where `console.log` / `info` / `warn` / `error` are recorded at every logging level, and `console.debug` only while the script's debug window is open.
13. **Retries need an enabled flow.** Retrying errors on a disabled flow fails with 422 `inactive_flow` -- enable it before you retry. Test runs work on enabled and disabled flows alike.
14. **Removing a step hides its open errors.** Once a step is detached from its flow, its open errors drop out of the flow's and the integration's error summaries, and reading or resolving them -- or reading the errors of a run that used the step -- fails with 404 "Export/Import not found." until the step is re-attached. They are neither resolved nor deleted, and they still purge 30 days after they occurred. Retry or resolve a step's errors before removing it; to reach them afterwards, re-attach it -- which also puts the step back into every run.
15. **Tagging errors replaces their tags.** Each listed error's whole tag set is replaced, so read the current tags and merge to add one. An error holds at most 3 tags; a fourth is refused with 400 and nothing changes. When the record fails again, the new error keeps the tags.

## Common Errors

| Symptom | Likely Cause | Diagnostic Steps |
|---------|-------------|-----------------|
| `failed` with `numPagesGenerated: 0` | Export-level failure (connection, query, endpoint) | Check the export's connection (offline? does a ping succeed?); review the export config |
| `completed` with high `numError` | Destination validation or data issues | Group the step's errors by pattern; read the raw HTTP request/response for one error |
| `completed` with 0 records, 0 errors | Wrong `resourcePath`, empty delta, filter too restrictive, or the export switched to another connection | Verify `resourcePath`; check the delta checkpoint (`lastExportDateTime`); review the output filter; read the export's audit log for a `_connectionId` change |
| `retrying` for extended period | Rate limiting, slow destination, or large dataset | Check destination rate limits; review concurrency on the connection |
| Errors only on specific records | Data-dependent issue (missing fields, bad types, duplicates) | Read the failing records' retry data; compare with successful records |
| Intermittent `failed` on same flow | Token expiry mid-run, transient network, or rate limits | Compare timestamps of failures; check connection token refresh config |
| 401/403 in an error's HTTP response | Expired credentials or insufficient permissions | Check the connection (offline? ping?); re-authorize if OAuth; check API permissions |
| Timeout errors | Slow destination or oversized payload | Reduce batch size; check destination system performance |
| `Connection could not be established. Target service might be inactive.` followed by `[connect ECONNREFUSED <ip>:<port>]` (error source `application`) | The target host refused the connection: nothing is listening at that address and port, or a firewall rejects it | Check that the target is up and that the connection's host and port are right; the fix is at the target or in the connection's address, not in the flow's steps |
| `queued` / `running` but not advancing | Waiting behind queued work on a shared connection, or a platform-side stall | Triangulate job state, connection queue depth, and other flows draining that connection; re-check in 10-15 min. If empty queues + nothing active + still stuck, escalate with the job id and evidence |
| A retry says no open errors matched, or a key "looks like an errorId" | Passed `errorId`s, or the errors were already resolved or purged | Pass the errors' `retryDataKey` values; resolved errors can't be retried |
| 422 `inactive_flow` on a retry | The flow is disabled | Re-enable it, then retry |
| 404 "Export/Import not found." reading or resolving a step's errors, or reading the errors of a run that used it, though the flow exists | The step was removed from the flow | Re-attach the step to read, retry or resolve its errors (gotcha 14) |
| 409 `job_already_queued` on a run | A run is still queued, running, or canceling | Wait for it to finish; after a cancel, read the run until its status is `canceled` -- no second cancel is needed. Before re-running a canceled run, read its import steps' `numSuccess`: a re-run reads the same window again, so a create-only import writes those records twice |
| 422 when arming debug logging | The account's payload storage (`logging.storePayload`) is off -- detailed and debug logging need it | An account owner or administrator turns it on, then arm debug again |
| Test run shows old sample records instead of live data | The export has a saved `mockOutput`, which test runs replay | Read the export's `mockOutput`, and clear it to read the live source again |
| `script_error` "script did not terminate within time limit" | A hook ran past the platform's script time limit; every record on that page fails, with no `classification` | Make the hook do less per page (fewer outside calls, or a smaller page size), then retry the errors |
| 404 `file_not_found` reading an error's HTTP request/response | The stored trace was purged, expired, or never captured -- the error id isn't wrong | Work from the error's message and retry data instead |
| 404 `no_retrydata_found` reading retry data | The error has none (a connection error) or it's gone | Fix the cause and re-run the flow |
| 400 `missing_required_field` "...at most 3 tags" when tagging errors | More than 3 tags for one error | Keep at most 3 per error (gotcha 15) |
| 403 "The job is already in ... state" on a cancel | The job already finished | Nothing to cancel: only queued, running or retrying jobs can be canceled |
| 403 `FEATURE_DISABLED` from a NetSuite REST step | NetSuite's REST Web Services feature is off | A NetSuite administrator enables it (Setup > Company > Enable Features > SuiteCloud), or read the data with a saved-search export ([configuring-exports](../configuring-exports/SKILL.md#gotchas), gotcha 12) |
