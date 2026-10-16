# Troubleshooting Flows with the `celigo` CLI

The commands for each step of the troubleshooting-flows Diagnostic Workflow. Step numbers match [SKILL.md](../SKILL.md). Before the first write of a session (retry, resolve, run, cancel), confirm which account the CLI targets -- see getting-started, "Which account the CLI targets".

## Symptom --> First Command

| Symptom | Run first | Then |
|---|---|---|
| Flow totally failed | `celigo jobs list --flow <flowId> --limit 1` | Check `numPagesGenerated` -- if 0, export failed; check connection and query |
| Partial errors | `celigo flows error-summary <flowId>` | `celigo flows error-analysis <flowId> <stepId>` to find root cause pattern |
| Empty run (0 records) | `celigo jobs list --flow <flowId> --limit 1` | Check export config (`resourcePath`, delta state, output filter) |
| Stuck / long-running | `celigo jobs current --flow <flowId>` | Check job status; if `retrying`, inspect rate limiting or connection issues |
| Intermittent failures | `celigo jobs run-stats --flow <flowId>` | Compare failing vs passing runs; check token expiry and rate limits |
| Errors that "went away" | `celigo flows resolved-errors <flowId> <stepId>` | Auto-resolved errors already recovered; compare against `celigo flows errors` (open) |
| **Silent logic bug** (no errors, wrong output) | `celigo flows test-run <flowId> --export <genId>` | If test-run can't reach it, enable execution logging (step 6) and run for real |
| **Production incident** (real traffic matters) | `celigo flows enable-execution-logs <flowId>` then run | Read per-record I/O with `query-execution-logs` / `execution-log-detail`; the failing stage names the problem |

## 1. Check the run status

```bash
celigo jobs list --flow <flowId> --limit 1           # Most recent job
celigo jobs get <jobId>
celigo jobs current --flow <flowId>                  # Currently running job
```

## 2. Get the per-step error counts

```bash
celigo flows error-summary <flowId>                  # Per-step error counts
```

## 3. Analyze error patterns

```bash
celigo flows error-analysis <flowId> <exportOrImportId> [--limit 200]
```

`error-analysis` only samples up to `--limit` errors (default 100). For flows with thousands of errors, raise the limit to get an accurate pattern distribution.

## 4. Inspect individual errors

```bash
celigo flows errors <flowId> <exportOrImportId>                       # list open errors (note the errorId of each)
celigo flows error <flowId> <exportOrImportId> <errorId> --retry-data       # inspect one error + its editable retry data
celigo flows error <flowId> <exportOrImportId> <errorId> --request-detail   # + the captured HTTP request/response
```

`flows error` takes the `errorId` (the `_id` from `flows errors`), not a `reqAndResKey` or `retryDataKey` -- it resolves those internal keys for you: `--request-detail` follows the error's `reqAndResKey`, `--retry-data` follows its `retryDataKey`. Use `debug-request-detail` only when you already hold a raw `reqAndResKey` from `debug-requests`.

## 5. Test run

```bash
celigo flows test-run <flowId> --export <exportId>
celigo flows test-run-step-results <flowId> <runId> <exportOrImportId>
celigo flows test-run-step-logs <flowId> <runId> <exportOrImportId>
```

`test-run` returns `{metadata, flowJob, childJobs}` -- metadata lists stage names per bubble. Follow with `test-run-step-results` to get `stages[] = [{name, input, output, errors}]` per bubble. Errors include `retryData` inline.

## 6. Execution logs

```bash
# 1. Arm debug logging on the flow (optionally bound the window; default and maximum 60 minutes)
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

Execution logging auto-disables after `--duration` minutes. If the flow runs after the window expires, you get no logs.

## 7. Low-level debug primitives

```bash
# Flow-level execution logging
celigo flows enable-execution-logs <flowId> [--duration <minutes>]
celigo flows disable-execution-logs <flowId>
celigo flows execution-logs <flowId> <jobId>
celigo flows query-execution-logs <flowId> <jobId> --export-or-import-id <id> --group-id <gid> --record-id <rid>
celigo flows execution-log-detail <flowId> <jobId> --export-or-import-id <id> --stage <stage> --group-id <gid> --record-id <rid>

# Per-bubble HTTP request/response
celigo flows debug-requests <flowId> <exportOrImportId> [--since 60]
celigo flows debug-request-detail <flowId> <exportOrImportId> <key>

# Per-resource debug toggles (capture raw HTTP at a specific bubble)
celigo exports enable-debug <id>
celigo imports enable-debug <id>
celigo scripts enable-debug <id>
celigo connections enable-debug <id>
```

## 8. Fix and retry (or resolve)

**Fix the configuration** with `celigo <type> set` (which does the GET, edit, and PUT for you), then retry:

```bash
celigo flows retry-errors <flowId> <exportOrImportId> -y
celigo flows retry-errors <flowId> <exportOrImportId> key1,key2,key3
```

**Fix the data** when specific records have bad values:

```bash
celigo flows error <flowId> <exportOrImportId> <errorId> --retry-data > data.json
# Edit data.json (the retryData object), then push it back by errorId:
celigo flows update-error-data <flowId> <exportOrImportId> <errorId> < data.json
celigo flows retry-errors <flowId> <exportOrImportId> <retryDataKey>
```

**Resolve without retry** when errors are expected or not worth reprocessing:

```bash
celigo flows resolve-errors <flowId> <exportOrImportId> errorId1,errorId2
celigo flows resolve-errors <flowId> <exportOrImportId> -y
```

## 9. Verify the fix

```bash
celigo flows run <flowId> -y
celigo jobs list --flow <flowId> --limit 1
celigo flows error-summary <flowId>
```

## Monitoring Lenses

- **Running:** `celigo jobs current --flow <flowId>`
- **Completed:** `celigo jobs list --flow <flowId>` and `celigo jobs run-stats --flow <flowId>`
- **Open vs resolved errors:** `celigo flows errors <flowId> <exportOrImportId>` (open) and `celigo flows resolved-errors <flowId> <exportOrImportId>` (resolved)

## Stuck-Flow Triangulation

1. **Run state:** `celigo jobs current --flow <flowId>` and `celigo jobs list --flow <flowId> --limit 1`.
2. **Queue depth:** `celigo connections get <connectionId>` -- the document's `queues[].size`, and whether it is `offline`.
3. **What else is active:** `celigo jobs current` across the account, matched to the flows that share the connection.

Truly stuck: capture `celigo jobs diagnostics <jobId>` and escalate to Celigo support. Cancel a wedged job with `celigo jobs cancel <jobId>`.

## More Commands

```bash
# Job inspection
celigo jobs cancel <jobId> [-y]
celigo jobs diagnostics <jobId>             # Diagnostic bundle -- include it when Celigo support asks for details
celigo jobs download-files <jobId>
celigo jobs get <jobId>
celigo jobs errors <jobId>
celigo jobs run-stats [--flow <flowId>] [--status <status>]

# Connection health
celigo connections ping <connectionId>

# Error investigation
celigo flows resolved-errors <flowId> <exportOrImportId>

# Error resolution
celigo flows assign-errors <flowId> <exportOrImportId> <email> [errorIds] [-y]
celigo flows delete-resolved-errors <flowId> <exportOrImportId> [errorIds] [-y]
celigo flows tag-errors <flowId> <exportOrImportId>

# Flow state
celigo flows last-export-date <flowId>      # The delta checkpoint (lastExportDateTime)
celigo flows run <flowId> [--start-time <ISO8601>] [--end-time <ISO8601>] [-y]   # Reprocess a window
```
