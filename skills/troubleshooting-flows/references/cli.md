# Troubleshooting Flows with the `celigo` CLI

The commands for each step of the troubleshooting-flows Diagnostic Workflow. Step numbers match [SKILL.md](../SKILL.md). Before the first write of a session (retry, resolve, run, cancel), confirm which account the CLI targets -- see getting-started, "Which account the CLI targets".

## Symptom --> First Command

| Symptom | Run first | Then |
|---|---|---|
| Flow totally failed | `celigo jobs list --type flow --flow <flowId> --limit 1` | Check `numPagesGenerated` -- if 0, export failed; check connection and query |
| Partial errors | `celigo flows error-summary <flowId>` | `celigo flows error-analysis <flowId> <stepId>` to find root cause pattern |
| Empty run (0 records) | `celigo jobs list --type flow --flow <flowId> --limit 1` | Check export config (`resourcePath`, delta state, output filter) |
| Stuck / long-running | `celigo jobs current --flow <flowId>` | Check job status; if `retrying`, inspect rate limiting or connection issues |
| Intermittent failures | `celigo jobs run-stats --flow <flowId>` | Compare failing vs passing runs; check token expiry and rate limits |
| Errors that "went away" | `celigo flows resolved-errors <flowId> <stepId>` | Auto-resolved errors already recovered; compare against `celigo flows errors` (open) |
| **Silent logic bug** (no errors, wrong output) | `celigo flows test-run <flowId> --export <genId>` (flow must be disabled) | If test-run can't reach it, enable execution logging (step 6) and run for real |
| **Production incident** (real traffic matters) | `celigo flows enable-execution-logs <flowId>` then run | Read per-record I/O with `query-execution-logs` / `execution-log-detail`; the failing stage names the problem |

## 1. Check the run status

```bash
celigo jobs list --type flow --flow <flowId> --limit 1   # Most recent job
celigo jobs get <jobId>                                  # The run with its per-step child jobs
celigo jobs current --flow <flowId>                      # Currently running job
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

The flow must be disabled -- the API returns 403 for an enabled flow. Disabling a live flow stops its schedule and listeners, so confirm with the user before `celigo flows set <flowId> disabled=true`, and re-enable it (`disabled=false`) before retrying any errors.

`test-run` returns `{metadata, flowJob, childJobs}` -- metadata lists stage names per bubble. Follow with `test-run-step-results` to get `stages[] = [{name, input, output, errors}]` per bubble. Errors include `retryData` inline. Test runs write no script-log entries, so read a hook's effect here; `celigo scripts debug-logs <scriptId>` only has entries from real runs.

The operations in SKILL.md's "what each way of running something touches" table: a test run is `celigo flows test-run` (or `celigo tools test-run`, `celigo apis test-run`); invoking an export on its own is `celigo exports invoke`; invoking an import on its own is `celigo imports invoke`, which writes; a real run is `celigo flows run`; retrying is `celigo flows retry-errors`.

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

Execution logging auto-disables after `--duration` minutes; the CLI silently clamps a larger value to 60. If the flow runs after the window expires, you get no logs. `celigo jobs get <jobId>` shows the `logMode` a past run ran under.

## 7. Low-level debug primitives

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

## 8. Fix and retry (or resolve)

**Fix the configuration** with `celigo <type> set` (which does the GET, edit, and PUT for you; on a connection it takes only the whitelisted fields -- see configuring-connections), then prove the fix on one record before retrying the rest:

```bash
celigo flows retry-errors <flowId> <exportOrImportId> <retryDataKey>   # prints the retry job's ID
celigo jobs get <retryJobId>                                           # numSuccess 1, numError 0? then:
celigo flows retry-errors <flowId> <exportOrImportId> -y               # retry the rest
```

`retry-errors` takes comma-separated `retryDataKey`s from `flows errors`, not `errorId`s.

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

## 9. Verify the fix

```bash
celigo flows run <flowId> -y
celigo jobs list --type flow --flow <flowId> --limit 1
celigo flows error-summary <flowId>
celigo jobs get <retryJobId>                 # after a retry: the retry job's counts
```

## Monitoring Lenses

- **Running:** `celigo jobs current --flow <flowId>`
- **Completed:** `celigo jobs list --type flow --flow <flowId>` and `celigo jobs run-stats --flow <flowId>`
- **Open vs resolved errors:** `celigo flows errors <flowId> <exportOrImportId>` (open) and `celigo flows resolved-errors <flowId> <exportOrImportId>` (resolved, with `resolvedBy`)

## Error Lifecycle and Retries

```bash
celigo --jq '.[] | {errorId, classification, retryAt, retryDataKey, traceKey}' flows errors <flowId> <exportOrImportId>
celigo jobs get <retryJobId>                     # status, numSuccess, numError
celigo jobs errors <retryJobId>                  # the records that failed again
celigo jobs list --type retry --flow <flowId>    # retry history, including the platform's own (triggeredBy: auto)
```

`celigo flows retry-errors` prints the ID of the retry job it queues.

## Stuck-Flow Triangulation

1. **Run state:** `celigo jobs current --flow <flowId>` and `celigo jobs list --type flow --flow <flowId> --limit 1`.
2. **Queue depth:** `celigo connections get <connectionId>` -- the document's `queues[].size`, and whether it is `offline`.
3. **What else is active:** `celigo jobs current` across the account, matched to the flows that share the connection.

A run frozen for hours: `celigo jobs get <flowJobId>` inlines the per-step child jobs -- read their counts, not the parent's. Cancel the parent and re-run, only if no import wrote:

```bash
celigo jobs cancel <flowJobId> -y
celigo jobs get <flowJobId>          # repeat until status is canceled
celigo flows run <flowId> -y
```

Truly stuck: capture `celigo jobs diagnostics <jobId>` and escalate to Celigo support.

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
celigo flows run <flowId> [--start-time <ISO8601>] [--end-time <ISO8601>] [--export-ids <ids>] [-y]   # Reprocess a window
```

## Common Errors

```bash
celigo flows set <flowId> disabled=false             # 422 inactive_flow on flows retry-errors: re-enable, then retry
celigo jobs current --flow <flowId>                  # 409 job_already_queued on flows run: the run still in progress
celigo --jq '.mockOutput' exports get <exportId>     # a test run replaying old sample records: the export's saved mock
celigo exports set <exportId> mockOutput=null        # clear it so test runs read the live source
```
