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
| `intermittent` | Timeouts, 5xx responses, dropped connections | Yes: while the flow's `autoResolveMatchingTraceKeys` is on (the default), the platform retries each one up to four times, the first about 30 minutes after the error. A `retryAt` on the error means it's still in auto-retry | Don't retry or resolve them now. Retry by hand, once the endpoint recovers, only where auto-retry is off or its attempts are used up (no `retryAt`). A timed-out create may have been written anyway, and every retry, automatic or manual, sends it again |
| `rate_limit` | HTTP 429, quota exceeded | Through the connection, not the error list: with auto-recover on, rate-limited records are held while concurrency drops and climbs back, so the flow can look stuck with no new errors | Open `rate_limit` errors mean auto-recover is off or gave up: turn it back on or lower the connection's `targetConcurrencyLevel`, then retry |
| `connection` | Credentials, permissions, an expired token, an offline connection | No, and these errors carry no retry data | Fix the connection, then re-run the flow |
| `value` | The destination rejected a value (format, status transition, locked field) | No | Fix the mapping or, when the record itself is bad, its retry data; then retry |
| `missing` | A required field or referenced record is missing | No | Supply the data or fix the lookup or mapping, then retry |
| `duplicate` | The destination already holds the record | No | Fix the match or upsert criteria; resolve the error if the existing record is right |
| `parse` | Malformed JSON or XML, Handlebars or script syntax, or a template naming a field the record lacks | No | Fix the template or script, then retry |
| `too_large` | Request, response or page too big | No | Reduce the page or batch size, or trim the payload, then retry |
| (none) | Nothing classified with confidence | No | Read the error's `code` and `message`, then investigate |

Status codes are hints, not the classification: a 429 usually lands as `rate_limit`, a 401 or 403 as `connection`, a timeout or 5xx often (not always) as `intermittent`. Don't retry `value`, `missing` or `parse` errors before fixing the cause; they fail the same way again.

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
| `pre_map_hook` | preMap script errors | Script code, input record shape |
| `post_map_hook` | postMap script errors | Script code, mapped record shape |
| `post_submit_hook` | postSubmit script errors, or a destination refusal the hook reworded | Script code, response data shape. A `script_error` or an error the hook adds to an accepted record is on a written record, so a retry sends it again; a message carrying the destination's own status and reason is its refusal, on a record that wasn't written |
| `post_aggregate_hook` | postAggregate script errors | Script code, aggregated file data |

## Common Errors by Symptom

| Symptom | Likely Cause | Diagnostic Steps |
|---------|-------------|-----------------|
| `failed` with `numPagesGenerated: 0` | Export-level failure (connection, query, endpoint) | Check the connection's `offline` flag (`list_connections` with its `_id`); review export configuration |
| `completed` with high `numError` | Destination validation or data issues | Use `list_flow_errors` with the flow `_id` to find the pattern; add `_stepId` to read one step's errors |
| `completed` with 0 records, 0 errors | Wrong `resourcePath`, empty delta, or filter too restrictive | Verify export `resourcePath`; check `lastExportDateTime`; review output filter |
| `retrying` for extended period | Rate limiting, slow destination, or large dataset | Check destination rate limits; review connection concurrency settings |
| Errors only on specific records | Data-dependent issue (missing fields, bad types, duplicates) | Inspect failing record data; compare with successful records |
| Intermittent `failed` on same flow | Token expiry mid-run, transient network, or rate limits | Compare timestamps of failures; check connection token refresh config |
| 401/403 errors | Expired credentials or insufficient permissions | Have the user test the connection in the Celigo UI (this server has no ping tool; the CLI has `celigo connections ping`); re-authorize OAuth connections |
| Timeout errors | Slow destination or oversized payload | Reduce batch size; check destination system performance |
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
