---
uri: celigo://resources/error-patterns
name: Error Pattern Reference
description: >-
  Common Celigo error codes, what they mean, and typical resolutions —
  problem categories, each error's classification and what recovers on
  its own, error source types, symptom-to-cause table, and a diagnostic
  decision tree.
mimeType: text/markdown
---
# Celigo Error Pattern Reference

## Problem Categories

When a flow fails, the problem falls into one of five categories:

### Total Failure
Job status is `failed` with 0 successful records. The entire run collapsed before processing any data. Typically `numPagesGenerated: 0` (export-level failure) or pages generated but `numPagesProcessed: 0` (import-level failure on the first page).

**Common causes:** Connection failure (credentials expired, endpoint down), export query error (invalid SQL, bad saved search ID), missing/deleted resource, permission denied.

### Partial Failure
Job status is `completed` but `numError > 0` alongside successful records. Some records failed while others processed normally.

**Common causes:** Validation errors on the destination (required fields missing, type mismatches), duplicate key violations, record-level lookup failures, rate limiting on specific batches, data-dependent issues (specific records have bad data).

### Empty Run
Job completes successfully with 0 errors AND 0 records processed.

**Common causes:** Wrong `resourcePath` on the export (extracts from wrong JSON path), delta export with no changes since last run (legitimate), output filter too restrictive (all records filtered out), source query returns no results, webhook export with no inbound events.

### Stuck or Long-Running
Job stays in `running` or `retrying` status longer than expected.

**Common causes:** Large dataset with no pagination limits, destination system slow to respond, script hook with long-running logic, on-premise agent connectivity issues, rate limiting causing backoff.

### Intermittent Failures
Flow sometimes succeeds and sometimes fails with the same configuration.

**Common causes:** Token/session expiry mid-run (long-running flows), rate limiting (varies with concurrent flows), transient network errors, source system maintenance windows.

## Error Classification

### By the Error's `classification`

The platform stamps every error with a read-only `classification`. Read it from the error itself (`list_flow_errors` returns it) rather than guessing from the message or status code: it decides whether the platform recovers on its own.

| Classification | Typical cause | Recovers on its own? | Action |
|---|---|---|---|
| `intermittent` | Timeouts, 5xx responses, dropped connections | Yes: up to four automatic retries, the first about 30 minutes after the error, while the flow's `autoResolveMatchingTraceKeys` is on (the default). A `retryAt` on the error means it's still in auto-retry | Wait. Once the attempts are spent (no `retryAt`) or the setting is off, retry when the target is healthy. A timed-out create may have been written anyway, and every retry sends it again |
| `rate_limit` | HTTP 429, quota exceeded | Through the connection: with auto-recover on, rate-limited records are held while concurrency drops and climbs back, so the flow can look stuck with no new errors | Open `rate_limit` errors mean auto-recover is off or gave up: turn it back on or lower the connection's `targetConcurrencyLevel`, then retry |
| `connection` | Credentials, permissions, an expired token, an offline connection | No, and these errors carry no retry data | Fix the connection, then re-run the flow |
| `value` | The destination rejected a value (format, status transition, locked field) | No | Fix the mapping or, when the record itself is bad, its retry data; then retry |
| `missing` | A required field or referenced record is missing | No | Supply the data or fix the lookup or mapping, then retry |
| `duplicate` | The destination already holds the record | No | Fix the match or upsert criteria; resolve the error if the existing record is right |
| `parse` | Malformed JSON or XML, Handlebars or script syntax, or a template naming a field the record lacks | No | Fix the template or script, then retry |
| `too_large` | Request, response or page too big | No | Reduce the page or batch size, or trim the payload, then retry |
| (none) | Nothing classified with confidence | No | Read the error's `code` and `message`, then investigate |

Status codes are hints, not the classification: a 429 usually lands as `rate_limit`, a 401 or 403 as `connection`, a timeout or 5xx often (not always) as `intermittent`. Don't retry `value`, `missing` or `parse` errors before fixing the cause; they fail the same way again. `governance` is a legacy value, since split into `rate_limit` and `too_large`.

A retry is a job, not an outcome: it closes the errors it retries at once and queues a `type: "retry"` job, so judge it by that job's counts (`list_flow_runs` with `type: "retry"` and the flow's `_flowId`). A record that fails again comes back as a new error with the same `retryDataKey`.

### Root Cause: Configuration vs Data

Every flow error has one of two root causes:

- **Static configuration** — a hardcoded value in the step config is wrong (mapping expression, filter rule, hardcoded field, URI, query). Fix: update the resource configuration.
- **Dynamic data** — the upstream source sent unexpected data (missing required field, wrong type, null where a value is expected). Fix: add input filtering or validation upstream, or fix the source system.

**To distinguish:** If the same error occurs for every record, it's configuration. If only some records fail, it's data.

## Error Source Types

Errors are classified by where they occur in the data pipeline:

| Error Source | Description | What to Check |
|-------------|-------------|---------------|
| `application` | External app errors (API responses) | Destination system's error message, request payload |
| `internal` | Celigo platform internal errors | Platform status, contact support if persistent |
| `connection` | Connection/auth failures | Credentials, tokens, endpoint reachability |
| `resource` | Resource configuration errors | Export/import configuration, field references |
| `lookup` | Lookup cache errors | Cache data, key existence, cache size limits |
| `transformation` | Data transformation errors | Transform expressions, field paths, data types |
| `output_filter` | Output filter expression errors | Filter syntax (S-expression), field references |
| `input_filter` | Input filter expression errors | Filter syntax, field path existence in record |
| `import_filter` | Import filter expression errors | Filter syntax on import step |
| `mapping` | Field mapping errors | Source/destination field paths, data types |
| `response_mapping` | Response mapping errors | Extract/generate pairs, `_json` path references |
| `pre_save_page_hook` | preSavePage script errors | Script code, null checks on record fields |
| `pre_parse_hook` | preParse script errors (file exports) | Script code, the raw file text it receives |
| `pre_map_hook` | preMap script errors | Script code, input record shape |
| `post_map_hook` | postMap script errors | Script code, mapped record shape |
| `post_submit_hook` | postSubmit script errors | Script code, response data shape. The destination already accepted these records, so a retry sends them again |
| `post_response_map_hook` | postResponseMap script errors | Script code, the response-mapped records and per-record results |
| `post_aggregate_hook` | postAggregate script errors | Script code, aggregated file data |
| `pre_send_hook_ss`, `pre_map_hook_ss`, `post_map_hook_ss`, `post_submit_hook_ss` | A NetSuite step's SuiteScript hook: a script in NetSuite's file cabinet that runs inside NetSuite, not a Celigo script | The SuiteScript's code and the NetSuite code and message in the error |
| `tool_input`, `tool_output` | A Tool step's input or output schema didn't validate | The record entering the Tool, or the Tool's mapped output, against the Tool's schema |

**Integration App steps.** If the failing step belongs to an Integration App (it carries `_connectorId`), find the app setting that governs the behavior before touching the step. The app locks parts of its steps (a write to a locked field answers 200 but keeps the app's value), and its own code runs only when its settings are saved through the app. So don't write the integration's `settings` or the app's steps to fix it: tell the user which setting to change, from what value to what, on the app's settings page.

## Common Errors by Symptom

| Symptom | Likely Cause | Diagnostic Steps |
|---------|-------------|-----------------|
| `failed` with `numPagesGenerated: 0` | Export-level failure (connection, query, endpoint) | Check the connection's `offline` flag (`list_connections` with its `_id`); review export configuration |
| `completed` with high `numError` | Destination validation or data issues | Use `list_flow_errors` with the flow `_id` to find the pattern; add `_stepId` to read one step's errors |
| `completed` with 0 records, 0 errors | Wrong `resourcePath`, empty delta, or filter too restrictive | Verify export `resourcePath`; check `lastExportDateTime`; review output filter |
| `retrying` for extended period | Rate limiting, slow destination, or large dataset | Check destination rate limits; review connection concurrency settings |
| Errors only on specific records | Data-dependent issue (missing fields, bad types, duplicates) | Inspect failing record data; compare with successful records |
| Intermittent `failed` on same flow | Token expiry mid-run, transient network, or rate limits | Compare timestamps of failures; check connection token refresh config |
| 401/403 errors | Expired credentials or insufficient permissions | Have the user test the connection in the Celigo UI; re-authorize OAuth connections |
| Timeout errors | Slow destination or oversized payload | Reduce batch size; check destination system performance |
| `Connection could not be established. Target service might be inactive.` with `[connect ECONNREFUSED <ip>:<port>]` | Nothing is listening at that host and port, or a firewall rejects it | Check that the target is up and that the connection's host and port are right; the fix isn't in the flow's steps |
| `queued` / `running` but not advancing | Waiting behind queued work on a shared connection, or a platform-side stall | Check the run's state, the connection's `queues[].size` and what else is running (`list_current_jobs`); look again in 10-15 minutes. Empty queues, nothing else active and still stuck: escalate with the job id |
| 409 `job_already_queued` on a run | A run is still queued, running or canceling | Wait for it to finish; after a cancel, read the run until its status is `canceled` |
| 422 `inactive_flow` on a retry | The flow is disabled | Re-enable it, then retry |
| 403 `FEATURE_DISABLED` from a NetSuite REST step | NetSuite's REST Web Services feature is off | A NetSuite administrator enables it, or read the data with a saved-search export |
| `Invalid login attempt` on a NetSuite token-based connection | NetSuite refused the token; its Login Audit Trail records why | Have a NetSuite administrator check the token, the role and its *Log in using Access Tokens* permission, the integration record and the account; a new token goes in through the Celigo UI |
| `script_error` "script did not terminate within time limit" | A hook ran past the platform's script time limit; every record on that page fails | Make the hook do less per page (fewer outside calls, or a smaller page size), then retry |
| `0 records exported` (no error) | Wrong `resourcePath`, overly restrictive filter, or empty date range | Check export configuration; widen delta window; test without output filter |
| `Cannot read property of undefined` in script | Script assumes a field exists that is missing from some records | Add null checks in script code |
| `mockOutput is invalid` | Wrong format — used array instead of object | Use `{ "page_of_records": [{ "record": {...} }] }` format |
| `Invalid adaptorType` | Case mismatch or typo | Use exact casing: `HTTPExport`, `NetSuiteDistributedImport`, etc. |
| `"pageProcessors" is not allowed when "routers" is present` | Both set on the same flow | Use `pageProcessors` for linear flows, `routers` for branching — never both |
| `Invalid reference: _connectionId` | Connection does not exist | Verify the connection exists with `list_connections` and its `_id` |
| `Invalid cron expression` | Wrong schedule format | Use 6-field format: `"? */5 * * * *"` (seconds field first, always `?`) |
| `422 queryType invalid` (Snowflake) | Legacy query type value | Use `per_record` or `bulk_insert`, not legacy `insert`/`update` |

## Error Triage Decision Tree

```
Flow failed?
├── Job status = "failed"
│   ├── numPagesGenerated = 0 → Export failed
│   │   └── Check: connection status, credentials, query/endpoint config
│   └── numPagesGenerated > 0, numPagesProcessed = 0 → Import failed on first page
│       └── Check: destination validation, mapping, import config
├── Job status = "completed" with numError > 0
│   ├── All records failed → Configuration error
│   │   └── Check: mapping expressions, hardcoded values, import settings
│   └── Some records failed → Data-dependent error
│       └── Check: failing records for missing fields, bad types, duplicates
├── Job status = "completed" with 0 records
│   └── Check: resourcePath, delta state, output filter, source query
└── Job stays "running" or "retrying"
    └── Check: rate limits, dataset size, destination performance, agent connectivity
```
