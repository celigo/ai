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

When an error occurs, classify it into one of three categories to determine the right action:

| Category | HTTP status codes | Meaning | Action |
|---|---|---|---|
| **Needs investigation** | 400, 401, 403, 404, 405, 409, 422 | Missing info, wrong IDs, permission denied, validation errors | Stop and investigate -- check resource config, connection status, permissions |
| **Transient** | 408, 429, 500, 502, 503, 504 | Timeouts, rate limits, server errors | Retry once. If it fails again, escalate -- the external system may be down |
| **Configuration error** | varies | Preconditions not met but fixable | Follow the error message guidance to fix the config, then retry |

A 5xx error not in the transient list (e.g., 501) is still likely transient. A 4xx error not in the investigation list warrants manual review.

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
| Flow totally failed | `celigo jobs latest-flow <flowId>` | Check `numPagesGenerated` -- if 0, export failed; check connection and query |
| Partial errors | `celigo flows error-summary <flowId>` | `celigo flows error-analyze <flowId> <stepId>` to find root cause pattern |
| Empty run (0 records) | `celigo jobs latest-flow <flowId>` | Check export config (`resourcePath`, delta state, output filter) |
| Stuck / long-running | `celigo jobs current --flow <flowId>` | Check job status; if `retrying`, inspect rate limiting or connection issues |
| Intermittent failures | `celigo jobs run-stats --flow <flowId>` | Compare failing vs passing runs; check token expiry and rate limits |
| **Silent logic bug** (no errors, wrong output) | `celigo flows test-run <flowId> --export <genId>` | Escalate to `celigo flows trace <flowId> --run` if test-run can't reach the problem |
| **Production incident** (real traffic matters) | `celigo flows trace <flowId> --run` | Read `records[].journey[].stages[]` for per-record I/O; `errorStage` names the failure point |

### Key Diagnostic Commands

```bash
# Job status
celigo jobs latest-flow <flowId>           # Most recent job
celigo jobs current --flow <flowId>        # Currently running job
celigo jobs diagnostics <jobId>            # Full diagnostic bundle

# Error investigation
celigo flows error-summary <flowId>        # Per-step error counts
celigo flows error-analyze <flowId> <id>   # Group errors by pattern
celigo flows errors <flowId> <id>          # List individual errors
celigo flows error-request-detail <flowId> <id> <key>  # Raw HTTP request/response

# Trace (one command, full report)
celigo flows trace <flowId> --run          # arm → run → wait → collect → disarm
celigo flows trace <flowId> --job <jobId>  # post-mortem on existing job
celigo flows test-run <flowId> --export <genId>  # safe, fast, try this first

# Low-level primitives (flows trace uses these internally)
celigo flows execution-logs-enable <flowId>
celigo flows debug-requests <flowId> <id>
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
celigo jobs latest-flow <flowId>
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
celigo flows error-analyze <flowId> <exportOrImportId> [--limit 200]
```

If most errors share the same message, that's your root cause. Multiple distinct patterns may indicate multiple issues.

### 4. Inspect individual errors

Once you know the pattern, look at specific records and the HTTP request/response that produced the error.

```bash
celigo flows errors <flowId> <exportOrImportId>
celigo flows error-data <flowId> <exportOrImportId> <retryDataKey>
celigo flows error-request-detail <flowId> <exportOrImportId> <reqAndResKey>
```

`error-request-detail` is the most powerful diagnostic -- it shows exactly what HTTP request was sent and what the destination responded with.

### 5. Use test runs for safe iteration (try this first)

Test runs process a single page without affecting production data or delta state. Fast, safe, no arming, no side effects -- answers most logic questions.

```bash
celigo flows test-run <flowId> --export <exportId>
celigo flows test-run-step <flowId> <runId> <exportOrImportId>
celigo flows test-run-step-logs <flowId> <runId> <exportOrImportId>
```

`test-run` returns `{metadata, flowJob, childJobs}` -- metadata lists stage names per bubble. Follow with `test-run-step` to get `stages[] = [{name, input, output, errors}]` per bubble. Errors include `retryData` inline.

Test runs don't advance the delta timestamp -- you can repeat them safely against the same data.

**Limitations:** imports don't actually submit, mock data is shared across lookups/imports, and some adaptors don't run in test mode. When these bite, escalate to §6.

### 6. End-to-end trace with `flows trace` (silent/logic bugs, production incidents)

When test-run can't answer it -- imports must actually submit, destination behavior matters, or it's a production incident -- use `flows trace`. One command arms debug across the flow, triggers the run (or uses an existing job), waits for logs to index, collects a per-record journey, and disarms.

```bash
# Full cycle: arm → run → wait → collect → disarm
celigo flows trace <flowId> --run

# Post-mortem on an existing job (must have had debug on)
celigo flows trace <flowId> --job <jobId>

# Arm now, wait for next scheduled run, then re-run with --job to collect
celigo flows trace <flowId>
```

Options: `--wait <sec>` (terminal timeout, default 300), `--log-delay <sec>` (post-terminal sleep for log indexing, default 120), `--duration <min>` (debug window, max 60), `--no-disarm`, `--no-clear`.

**Report shape** (single JSON, LLM-ready):

```
{
  flow, job, dataAvailability, bubbles, traceKeyGaps,
  records: [
    {
      traceKey, duplicateTraceKey,
      journey: [
        { bubble: {_id, kind, name, adaptorType},
          recordId, groupId, status, startedAt, completedAt,
          errorStage,          // names the failing stage, from server-side attribution
          stages: [            // ordered, matches `test-run-step` shape
            { name, input, output, errors }
          ]
        }
      ]
    }
  ],
  errors,   // each error pre-enriched with retryData (inline)
  warnings
}
```

**Pre-flight for --run: set traceKeyTemplate on page generators.** Before the run, inspect each generator and set a template if missing, so records can be stitched across bubbles by business ID:

```bash
celigo exports get <exportId> --jq '{name, traceKeyTemplate}'
# If traceKeyTemplate is empty or null, pick a unique field from a sample record:
celigo exports preview <exportId>
celigo exports set <exportId> traceKeyTemplate='{{record.id}}'
```

The trace report's `traceKeyGaps[]` flags page generators where this wasn't done.

### 7. Low-level debug primitives (surgical control)

`flows trace` is the orchestrator. These are the primitives underneath -- use them when you want manual control over arming, clearing, or probing:

```bash
# Flow-level execution logging
celigo flows execution-logs-enable <flowId> [--duration <minutes>]
celigo flows execution-logs-disable <flowId>
celigo flows execution-logs <flowId> <jobId>
celigo flows execution-log-query <flowId> <jobId> --export-or-import-id <id> --group-id <gid> --record-id <rid>
celigo flows execution-log-data <flowId> <jobId> --export-or-import-id <id> --stage <stage> --group-id <gid> --record-id <rid>

# Per-bubble HTTP request/response
celigo flows debug-requests <flowId> <exportOrImportId> [--since 60]
celigo flows debug-request-detail <flowId> <exportOrImportId> <key>

# Per-resource debug toggles (used by `flows trace` internally)
celigo exports debug-enable <id>
celigo imports debug-enable <id>
celigo scripts debug-enable <id>
celigo connections debug-enable <id>
```

**Stage names** (for `execution-log-data --stage`):
- Built-in: `apiCall`, `transformation`, `mapping`, `inputFilter`, `outputFilter`, `responseMapping`, `responseTransformation`, `routing`
- Script hooks: the **function name** wired on the bubble (e.g., `preMapHook`, `postSubmitHook`, `branchingHook`, `preSavePageHook`, `postResponseMapHook`)

**Test-run uses a different stage vocabulary** than live `/logs/data/query`: `request`/`response`/`parse` (three stages) instead of live's merged `apiCall`; `transformTwoDotZero` instead of `transformation`; `responseMap` instead of `responseMapping`; `router` instead of `routing`. Everything else matches. `flows trace` uses the live vocabulary in its report.

### 8. Fix and retry (or resolve)

**Fix the configuration**, then retry:

```bash
celigo flows retry-errors <flowId> <exportOrImportId> -y
celigo flows retry-errors <flowId> <exportOrImportId> key1,key2,key3
```

**Fix the data** when specific records have bad values:

```bash
celigo flows error-data <flowId> <exportOrImportId> <retryDataKey>
# Edit the data, then:
celigo flows update-error-data <flowId> <exportOrImportId> <retryDataKey>
celigo flows retry-errors <flowId> <exportOrImportId> <retryDataKey>
```

**Resolve without retry** when errors are expected or not worth reprocessing:

```bash
celigo flows resolve-errors <flowId> <exportOrImportId> errorId1,errorId2
celigo flows resolve-errors <flowId> <exportOrImportId> -y
```

### 9. Verify the fix

Run the flow again and confirm clean execution.

```bash
celigo flows run <flowId> -y
celigo jobs latest-flow <flowId>
celigo flows error-summary <flowId>
```

## CLI Commands

All commands shown in the Diagnostic Workflow above, plus these additional commands:

```bash
# Job inspection (additional)
celigo jobs cancel <jobId> [-y]
celigo jobs diagnostics <jobId>
celigo jobs files <jobId>
celigo jobs family <jobId>
celigo jobs errors <jobId>
celigo jobs run-stats [--flow <flowId>] [--status <status>]

# Error investigation (additional)
celigo flows resolved-errors <flowId> <exportOrImportId>

# Error resolution (additional)
celigo flows assign-errors <flowId> <exportOrImportId> <email> [errorIds] [-y]
celigo flows delete-resolved <flowId> <exportOrImportId> [errorIds] [-y]
celigo flows tag-errors <flowId> <exportOrImportId>

# Debug logging (additional)
celigo flows execution-log-query <flowId> <jobId> --export-or-import-id <id> --group-id <gid> --record-id <rid>

# Flow state
celigo flows last-export-date <flowId>
celigo flows run <flowId> [--start-date <ISO8601>] [--end-date <ISO8601>] [-y]
```

<!-- TIER:3 -->

## Diagnostic Checklist

Before escalating or concluding investigation:

- [ ] Checked job status via `celigo jobs latest-flow` -- confirmed `status`, `numError`, `numSuccess`, `numPagesGenerated`
- [ ] Ran `celigo flows error-summary` to identify which step(s) have errors
- [ ] Ran `celigo flows error-analyze` to group errors by pattern and identify root cause
- [ ] Inspected individual errors via `celigo flows errors` and `celigo flows error-data`
- [ ] Reviewed raw HTTP request/response via `celigo flows error-request-detail`
- [ ] If errors are unclear: enabled execution logs, re-ran flow, and inspected record-level trace
- [ ] If HTTP-level detail needed: used `celigo flows debug-requests` on the failing export/import
- [ ] Verified fix by re-running the flow and confirming clean execution

## Gotchas

1. **A `completed` job can still have errors.** `completed` means the job finished, not that every record succeeded. Always check `numError` alongside status.
2. **`error-analyze` only samples up to `--limit` errors.** Default is 100. For flows with thousands of errors, increase the limit to get an accurate pattern distribution.
3. **`error-request-detail` requires `reqAndResKey`, not `retryDataKey`.** These are different identifiers on the error record.
4. **Debug execution logs auto-disable after `--duration` minutes.** Default is 60. If your flow runs after the window expires, you get no logs. Enable, then run promptly.
5. **Test runs don't advance delta state.** This is intentional -- you can test repeatedly with the same data. But it means test runs always re-fetch the same records.
6. **Retrying resolved errors is not possible.** Once resolved, an error cannot be retried. Only resolve errors you're certain don't need reprocessing.
7. **`lastExportDateTime` drift causes re-processing or gaps.** If a delta export's timestamp is wrong, use `flows run --start-date` to override and reprocess a specific window.
8. **Empty `numPagesGenerated: 0` on a failed job means the export itself failed.** The problem is the source step -- check the connection, query, or endpoint, not the import.
9. **Execution log data is ephemeral.** Logs are retained for a limited time. Enable logging and run the flow promptly.
10. **`jobs diagnostics` produces a diagnostic bundle.** Use this when Celigo support asks for details -- it includes internal execution context not visible through other commands.

## Common Errors

| Symptom | Likely Cause | Diagnostic Steps |
|---------|-------------|-----------------|
| `failed` with `numPagesGenerated: 0` | Export-level failure (connection, query, endpoint) | Check connection status (`celigo connections ping`); review export config |
| `completed` with high `numError` | Destination validation or data issues | `error-analyze` to find pattern; `error-request-detail` for HTTP detail |
| `completed` with 0 records, 0 errors | Wrong `resourcePath`, empty delta, or filter too restrictive | Verify `resourcePath`; check `lastExportDateTime`; review output filter |
| `retrying` for extended period | Rate limiting, slow destination, or large dataset | Check destination rate limits; review concurrency on connection |
| Errors only on specific records | Data-dependent issue (missing fields, bad types, duplicates) | `error-data` to inspect failing records; compare with successful records |
| Intermittent `failed` on same flow | Token expiry mid-run, transient network, or rate limits | Compare timestamps of failures; check connection token refresh config |
| 401/403 errors in `error-request-detail` | Expired credentials or insufficient permissions | `celigo connections ping`; re-authorize if OAuth; check API permissions |
| Timeout errors | Slow destination or oversized payload | Reduce batch size; check destination system performance |
