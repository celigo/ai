---
uri: celigo://resources/error-patterns
name: Error Pattern Reference
description: >-
  Common Celigo error codes, what they mean, and typical resolutions —
  problem categories, HTTP status classification, error source types,
  symptom-to-cause table, and a diagnostic decision tree.
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

### By HTTP Status Code

| Category | HTTP Status Codes | Meaning | Recommended Action |
|----------|-------------------|---------|-------------------|
| **Needs Investigation** | 400, 401, 403, 404, 405, 409, 422 | Client error — missing info, wrong IDs, permission denied, validation failures | Stop and investigate: check resource config, connection status, permissions |
| **Transient** | 408, 429, 500, 502, 503, 504 | Timeouts, rate limits, server errors | Retry once. If it fails again, escalate — the external system may be down |
| **Configuration Error** | Varies | Preconditions not met but fixable | Follow the error message guidance to fix config, then retry |

A 5xx error not in the transient list (e.g., 501) is still likely transient. A 4xx error not in the investigation list warrants manual review.

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
| `post_submit_hook` | postSubmit script errors | Script code, response data shape |
| `post_aggregate_hook` | postAggregate script errors | Script code, aggregated file data |

## Common Errors by Symptom

| Symptom | Likely Cause | Diagnostic Steps |
|---------|-------------|-----------------|
| `failed` with `numPagesGenerated: 0` | Export-level failure (connection, query, endpoint) | Check connection status with `ping_connection`; review export configuration |
| `completed` with high `numError` | Destination validation or data issues | Use `get_flow_error_summary` to find pattern; inspect individual errors with `get_flow_errors` |
| `completed` with 0 records, 0 errors | Wrong `resourcePath`, empty delta, or filter too restrictive | Verify export `resourcePath`; check `lastExportDateTime`; review output filter |
| `retrying` for extended period | Rate limiting, slow destination, or large dataset | Check destination rate limits; review connection concurrency settings |
| Errors only on specific records | Data-dependent issue (missing fields, bad types, duplicates) | Inspect failing record data; compare with successful records |
| Intermittent `failed` on same flow | Token expiry mid-run, transient network, or rate limits | Compare timestamps of failures; check connection token refresh config |
| 401/403 errors | Expired credentials or insufficient permissions | Test connection with `ping_connection`; re-authorize OAuth connections |
| Timeout errors | Slow destination or oversized payload | Reduce batch size; check destination system performance |
| `0 records exported` (no error) | Wrong `resourcePath`, overly restrictive filter, or empty date range | Check export configuration; widen delta window; test without output filter |
| `Cannot read property of undefined` in script | Script assumes a field exists that is missing from some records | Add null checks in script code |
| `mockOutput is invalid` | Wrong format — used array instead of object | Use `{ "page_of_records": [{ "record": {...} }] }` format |
| `Invalid adaptorType` | Case mismatch or typo | Use exact casing: `HTTPExport`, `NetSuiteDistributedImport`, etc. |
| `"pageProcessors" is not allowed when "routers" is present` | Both set on the same flow | Use `pageProcessors` for linear flows, `routers` for branching — never both |
| `Invalid reference: _connectionId` | Connection does not exist | Verify connection exists with `get_connection` |
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
