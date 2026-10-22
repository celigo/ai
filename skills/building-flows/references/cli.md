# Building Flows with the `celigo` CLI

The commands for each step of How to Build a Flow, then for each Flow Operation. Step numbers and headings match [SKILL.md](../SKILL.md). Before the first write of a session (create, update, set, run, retry), confirm which account the CLI targets with one `celigo profile whoami` (the account, environment and token it authenticates as) -- see getting-started, "Which account the CLI targets".

## How `set` and `update` Write

- `celigo <type> set <id> key=value [key2=value2 ...]` changes the named fields and keeps the rest. When every field is on the type's PATCH whitelist it sends one JSON Patch; otherwise it does the GET, edits the fields, and PUTs the complete document back for you. The flows whitelist is `name`, `description`, `aiDescription`, `disabled`, `runPageGeneratorsInParallel`, `logging.debugUntil`, `logging.mode`, `schedule`, and `timezone` from CLI 2026.10.1; 2026.9.x and earlier list five schedule sub-paths in place of the last two (see step 8). Exports whitelist `debugUntil` and `assistantMetadata`, imports `debugUntil` -- every other field goes through GET + PUT.
- Dot and index paths reach nested fields (`pageGenerators[0].schedule`, `routers[0].branches[1].pageProcessors[0]._importId`). Values parse as JSON with a string fallback, so `disabled=false` is a boolean and `'_runNextFlowIds=["<flowId>"]'` an array. `key=null` removes a field; `content=file://./hook.js` reads a value from a file.
- `celigo <type> update <id> < doc.json` PUTs exactly the document you pipe in, so omitted fields are erased -- GET it first. It refuses a body that still carries masked `******` credentials copied from a GET unless you pass `--force` -- a mask sent back keeps the stored secret, but leaving a secret field out clears it -- and `set` on connections and iClients refuses any field that isn't whitelisted.
- On an Integration App's document (`_connectorId` set), the platform answers 200 to a PUT but keeps its own value for every field the app locks. `set` and `update` name those fields on stderr ("the Integration App locks it") and exit 1.

## 1. Plan the flow

Step config -- check what else uses the step, then work on the export or import itself:

```bash
celigo exports dependencies <exportId>       # every flow listed changes with this export
celigo imports dependencies <importId>
celigo exports set <exportId> key=value [key2=value2 ...]
celigo imports set <importId> key=value [key2=value2 ...]
```

`dependencies` (alias `used-by`) answers `{}` when nothing depends on the step -- and also for an id that doesn't exist, so check the id. To give this flow its own copy instead, clone the step (the reply's `_id` is the copy) and point the flow's step at it:

```bash
celigo imports clone <importId> --name "<name>"                    # same environment: no stdin needed
celigo flows set <flowId> 'pageProcessors[1]._importId=<copyId>'   # the step's position in the flow
```

Structure -- `celigo flows set` for fields, the helpers under Change the structure for steps, or the full round trip:

```bash
celigo flows get <flowId> > flow.json
# edit flow.json
celigo flows update <flowId> < flow.json
```

## 2. Identify the integration

```bash
celigo integrations list
celigo integrations get <integrationId>
```

## 3. Check for existing patterns

```bash
# Search for similar resources in the account index
celigo account search "<keyword>"

# Show what an existing resource uses and what uses it
celigo account dependencies flow <flowId>

# Find orphaned resources, offline connections, untriggered flows
celigo account lint

# Search marketplace for pre-built integration templates
celigo templates marketplace

# Preview a template before installing
celigo templates preview <templateId> --summary
```

The `account` commands read a local index of the account. It refreshes itself when older than 15 minutes (`CELIGO_INDEX_STALE_MINUTES`; `--no-refresh` skips it); force a fresh snapshot with `celigo account snapshot`. `account dependencies` takes `--direction uses|used-by|both` (default `both`). `templates preview --summary` counts the template's objects by model; without it you get every object's full config.

## 4. Build the connections, exports, and imports

```bash
celigo connections list
celigo exports list
celigo imports list
celigo http-connectors list        # 550+ pre-built connectors; --search <term> narrows by name
```

## 5. Choose the topology

Abstract and instance flows:

```bash
celigo flows list --abstract-flow-id <abstractFlowId>     # the instances of an abstract flow
celigo flows get <instanceFlowId> --merge-instance        # an instance's effective config: the abstract structure merged with its overrides
```

Without `--merge-instance`, an instance returns its sparse document (`_abstractFlowId`, `overrides`, instance-level fields) -- that is the document to edit and PUT back. The structure helpers under Change the structure refuse instance flows.

## 8. Configure scheduling

```bash
celigo flows set <flowId> schedule='? 5 9 ? * 1,2,3,4,5' timezone=America/New_York
celigo flows set <flowId> 'pageGenerators[1].schedule=? 0 * ? * *'
```

Set the whole `schedule` string: the flow stores it as one cron string, and a PATCH beneath `/schedule` answers 204 while changing nothing. From CLI 2026.10.1 the first command is one PATCH, and `set` refuses any path beneath `schedule` or `timezone` (`schedule.cron=...`) before sending anything, naming the whole-value assignment instead. CLI 2026.9.x and earlier send the first command through GET + PUT, but whitelist `schedule.cron`, `schedule.frequency`, `schedule.days`, `schedule.startDate` and `schedule.endDate`, so `schedule.cron=...` there sends `replace /schedule/cron` and changes nothing. A page generator's `schedule` (the second command) is always GET + PUT. Read the flow first -- a generator with its own `schedule` keeps running at its times after a flow-level change -- and read it back after a schedule change.

## 9. Set the runtime controls

```bash
celigo flows set <flowId> runPageGeneratorsInParallel=true
celigo flows set <flowId> logging.mode=detailed
celigo flows set <flowId> 'pageProcessors[2].proceedOnFailure=true'
celigo flows set <flowId> 'pageGenerators[1].skipRetries=true'
```

The first two are one PATCH each -- the only way `logging` changes, since `flows create` and `flows update` ignore it; the per-step controls and `autoResolveMatchingTraceKeys` go through GET + PUT. On a branching flow a processor's path runs through its branch: `'routers[0].branches[1].pageProcessors[0].proceedOnFailure=true'`.

## 10. Configure chaining

```bash
celigo flows set <flowId> '_runNextFlowIds=["<nextFlowId>"]'
celigo flows set <flowId> '_runNextExportIds=[{"_flowId":"<otherFlowId>","_exportId":"<exportId>"}]'
```

Both go through GET + PUT and replace the whole list -- include the ids already there.

## 11. Create disabled, test, enable

```bash
celigo flows create < flow.json                                          # the body carries "disabled": true
celigo flows get <flowId>                                                # verify the structure
celigo flows test-run <flowId> --export <exportId>                       # one page from that generator; the flow may be enabled or disabled
celigo flows test-run-step-results <flowId> <runId> <exportOrImportId>  # per-stage input, output, and errors
celigo flows set <flowId> disabled=false                                 # enable: one PATCH
```

To re-register a NetSuite or topic listener after a repair, toggle the flow: `celigo flows set <flowId> disabled=true`, then `disabled=false`.

## Duplicate Records

```bash
celigo jobs list --type flow --flow <flowId> --created-gte <iso> --created-lte <iso>   # the runs around the time the user names
celigo jobs get <jobId>                                                                # inlines the per-step child jobs and their counts
celigo platform get 'v1/flows/<flowId>/jobs/search?traceKeyPrefix=<traceKey>&createdAt_gte=<iso>'   # the runs that carried one record (at most 1000)
celigo flows error <flowId> <importId> <errorId> --retry-data                          # a real record's data, to check what idLockTemplate renders
```

## Flow Operations

### Read and write

```bash
celigo flows list
celigo flows get <flowId>
celigo flows audit <flowId>                # change history, its steps' and their scripts' changes included
celigo flows dependencies <flowId>         # what references the flow (alias used-by)
celigo flows create < flow.json
celigo flows update <flowId> < flow.json
celigo flows set <flowId> key=value [key2=value2 ...]
celigo flows delete <flowId>
```

`flows list` narrows with `--integration <integrationId>` and `--name <substring>`. `flows delete` asks for confirmation unless you pass `-y`. It's refused while another flow lists this one in `_runNextFlowIds` (`flows dependencies` names it), and it leaves the flow's exports and imports: delete those on their own once `exports dependencies` / `imports dependencies` shows nothing else uses them.

To see a branching flow in execution order, render the graph Flow Builder draws -- offline, from a file (steps shown by id) or, inside a tree pulled with `celigo pull`, as `celigo flows graph <flowId>` (steps named):

```bash
celigo flows get <flowId> > flow.json
celigo flows graph --file flow.json --as mermaid
```

### Run

```bash
celigo flows run <flowId> [--start-time <ISO8601>] [--end-time <ISO8601>] [--export-ids <ids>] -y
celigo flows cancel-jobs <flowId> -y       # cancel every running job of the flow
celigo flows run-stats <flowId>            # run times over the last 30 days, with a suggested alert threshold
echo '{"type":"long-runtime","_flowId":"<flowId>","longRuntime":{"thresholdMinutes":30},"_recipientEmails":["<email>"]}' | celigo alerts create
```

The delta-window flags are `--start-time` and `--end-time` -- `flows run` has no `--start-date` or `--end-date`. They set this run's `lastExportDateTime` and `currentExportDateTime`. `--export-ids` is a comma-separated list of the page generators to run; a listener among them (webhook, NetSuite or Salesforce real-time, CDC or topic) is refused with 422 `The realtime export <id> of type <type> cannot be queued`, since listeners run only on their own events, and a run without the flag starts every page generator that isn't a listener. The flow must be enabled. Jobs keep running for a few seconds after `cancel-jobs` returns. `run-stats` suggests a threshold (the p99 run time, rounded up, at least 5 minutes) once a flow has three completed runs. An alert recipient who isn't a user of the account yet is invited, and the API answers 403 when the account doesn't have proactive alerts.

### Test run

```bash
celigo flows test-run <flowId> --export <exportId>
celigo flows test-run-step-results <flowId> <runId> <exportOrImportId>
```

For flows, `--export` (one page generator) is required. The flow may be enabled or disabled -- an enabled flow's test run answers 200 and runs (live-verified 2026-10-14; CLI 2026.9.x's help still says it must be disabled). `test-run` returns the stage names per step (`metadata`), the test `flowJob` (its `_id` is the `runId`), and `childJobs`.

### Clone

```bash
echo '{"connectionMap":{"<oldConnectionId>":"<newConnectionId>","<keptConnectionId>":"<keptConnectionId>"}}' | celigo flows clone <flowId> <integrationId> <environmentId> [--flow-group <flowGroupingId>]
```

With nothing piped, the CLI maps each connection the flow's steps use to itself, which suits a same-environment clone. A piped map replaces that self-map, so it must still list every connection the steps use: the ones you remap, and the rest mapped to themselves. `--name` names the clone (default `Clone - <source name>`).

### Change the structure

```bash
celigo flows add-generator <flowId> <exportId> [--schedule '<cron>'] [--index <pos>]
celigo flows remove-generator <flowId> <exportId>
celigo flows add-processor <flowId> <exportOrImportId> [--router <routerId>] [--branch <branchName>]
celigo flows remove-processor <flowId> <exportOrImportId> [--router <routerId>] [--branch <branchName>]
celigo flows replace-connection <flowId> <oldConnectionId> <newConnectionId>
```

The add and remove helpers do the GET, edit, and PUT for you (`-y` skips the confirmation) and refuse instance flows. `add-processor` detects whether the id is an import or a lookup export; on a flow with routers it needs `--router`, plus `--branch` to pick the branch. `replace-connection` swaps the connection on every export, import, and lookup of the flow in one call; the new connection must be the same adaptor type.

### Manage errors

```bash
celigo flows errors <flowId> <exportOrImportId>
celigo flows resolved-errors <flowId> <exportOrImportId>
celigo flows resolve-errors <flowId> <exportOrImportId> [errorIds] [-y]
celigo flows retry-errors <flowId> <exportOrImportId> [retryDataKeys] [-y]
celigo flows assign-errors <flowId> <exportOrImportId> <email> [errorIds] [-y]
celigo flows unassign-errors <flowId> <exportOrImportId> [errorIds] [-y]
celigo flows delete-resolved-errors <flowId> <exportOrImportId> [errorIds] [-y]
celigo flows error <flowId> <exportOrImportId> <errorId> [--retry-data] [--request-detail]
celigo flows update-error-data <flowId> <exportOrImportId> <errorId> < data.json
celigo flows tag-errors <flowId> <exportOrImportId> < tags.json
celigo flows error-summary <flowId>
celigo flows error-analysis <flowId> <exportOrImportId> [--limit <n>]
```

Ids are comma-separated. Leaving them out acts on every open error of the step (every resolved one for `delete-resolved-errors`) after a confirmation that `-y` skips. `retry-errors` takes `retryDataKey`s, not `errorId`s. `error-analysis` groups at most `--limit` errors (default 100) -- raise it for a step with thousands. `tag-errors` reads `{"errors":[{"id":"<errorId>","rdk":"<retryDataKey>"}],"tagIds":["<tagId>"]}`. Retries write to the destination system. To have a user notified about a flow: `celigo notifications subscribe --user <email> --flow <flowId>`. The flow's own error-handling settings are fields -- step 9.

### Debug

```bash
celigo flows debug-requests <flowId> <exportOrImportId> [--since <minutes>]
celigo flows debug-request-detail <flowId> <exportOrImportId> <key>
celigo flows enable-execution-logs <flowId> [--duration <minutes>]
celigo flows disable-execution-logs <flowId>
celigo flows execution-logs <flowId> <jobId>
celigo flows query-execution-logs <flowId> <jobId> --export-or-import-id <id> --group-id <gid> --record-id <rid>
celigo flows execution-log-detail <flowId> <jobId> --export-or-import-id <id> --stage <stage> --group-id <gid> --record-id <rid>
celigo flows delete-debug-requests <flowId> <exportOrImportId> [reqAndResKeys] [-y]
celigo flows delete-execution-logs <flowId> --started-gte <iso> --started-lte <iso> [-y]
```

`debug-requests` lists what a step captured while its own debug window was open (`celigo exports enable-debug <id>` or `celigo imports enable-debug <id>`); `--since` defaults to 60 minutes. `enable-execution-logs` arms at most 60 minutes, the default. `delete-debug-requests` without keys clears every captured request the step's open errors point to (the errors stay); `delete-execution-logs` deletes the flow's execution-log entries inside the window, irreversibly and in the background. The full debugging workflow is in **troubleshooting-flows** ([references/cli.md](../../troubleshooting-flows/references/cli.md)).

### Read the delta checkpoint

```bash
celigo flows last-export-date <flowId>
```

### Organize with flow groups

```bash
celigo integrations flow-groups <integrationId>
celigo integrations create-flow-group <integrationId> <name>
celigo flows set-group <flowGroupingId> <flowIds...>
celigo integrations delete-flow-group <integrationId> <flowGroupingId> [-y]
```

`create-flow-group` prints the new group; its `_id` is the `flowGroupingId`. `celigo flows unset-group <flowIds...>` takes flows out of their group. `delete-flow-group` moves the group's flows out first (they aren't deleted), because a group removed from `flowGroupings` while flows still belong to it answers success and stays.

## Pre-Submit Checklist and Common Errors

```bash
celigo integrations get <integrationId>    # the _integrationId is real
celigo connections get <connectionId>      # the _connectionId is real
celigo jobs current --flow <flowId>        # a 409 job_already_queued from flows run: the run still in progress
```
