# Building Flows with the `celigo` CLI

The commands for each step of How to Build a Flow, then for each Flow Operation. Step numbers and headings match [SKILL.md](../SKILL.md). Before the first write of a session (create, update, set, run, retry), confirm which account the CLI targets -- see getting-started, "Which account the CLI targets".

## How `set` and `update` Write

- `celigo <type> set <id> key=value [key2=value2 ...]` changes the named fields and keeps the rest. When every field is on the type's PATCH whitelist it sends one JSON Patch; otherwise it does the GET, edits the fields, and PUTs the complete document back for you. The flows whitelist is `name`, `description`, `aiDescription`, `disabled`, `runPageGeneratorsInParallel`, `logging.debugUntil`, `logging.mode`, and five schedule sub-paths -- `schedule.cron`, `schedule.frequency`, `schedule.days`, `schedule.startDate`, `schedule.endDate` (see step 8 before using those). Exports whitelist `debugUntil` and `assistantMetadata`, imports `debugUntil` -- every other field goes through GET + PUT.
- Dot and index paths reach nested fields (`pageGenerators[0].schedule`, `routers[0].branches[1].pageProcessors[0]._importId`). Values parse as JSON with a string fallback, so `disabled=false` is a boolean and `'_runNextFlowIds=["<flowId>"]'` an array. `key=null` removes a field; `content=file://./hook.js` reads a value from a file.
- `celigo <type> update <id> < doc.json` PUTs exactly the document you pipe in, so omitted fields are erased -- GET it first. It refuses a body that still carries masked `******` credentials copied from a GET unless you pass `--force`; for the same reason `set` on connections and iClients refuses any field that isn't whitelisted.

## 1. Plan the flow

Step config -- work on the export or import itself:

```bash
celigo exports set <exportId> key=value [key2=value2 ...]
celigo imports set <importId> key=value [key2=value2 ...]
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

Both go through GET + PUT. Set the whole `schedule` string, never `schedule.cron=...`: that sub-path is on the PATCH whitelist, so `set` sends `replace /schedule/cron`, which the platform answers with 204 while changing nothing -- the flow stores `schedule` as one cron string. Read the flow back after a schedule change.

## 9. Set the runtime controls

```bash
celigo flows set <flowId> runPageGeneratorsInParallel=true
celigo flows set <flowId> 'pageProcessors[2].proceedOnFailure=true'
celigo flows set <flowId> 'pageGenerators[1].skipRetries=true'
```

The first is one PATCH; the per-step controls and `autoResolveMatchingTraceKeys` go through GET + PUT. On a branching flow a processor's path runs through its branch: `'routers[0].branches[1].pageProcessors[0].proceedOnFailure=true'`.

## 10. Configure chaining

```bash
celigo flows set <flowId> '_runNextFlowIds=["<nextFlowId>"]'
celigo flows set <flowId> '_runNextExportIds=[{"_flowId":"<otherFlowId>","_exportId":"<exportId>"}]'
```

Both go through GET + PUT and replace the whole list -- include the ids already there.

## 11. Create disabled, verify, enable

```bash
celigo flows create < flow.json            # the body carries "disabled": true
celigo flows get <flowId>                  # verify the structure
celigo flows set <flowId> disabled=false   # enable: one PATCH
```

## Flow Operations

### Read and write

```bash
celigo flows list
celigo flows get <flowId>
celigo flows create < flow.json
celigo flows update <flowId> < flow.json
celigo flows set <flowId> key=value [key2=value2 ...]
celigo flows delete <flowId>
```

`flows list` narrows with `--integration <integrationId>` and `--name <substring>`. `flows delete` asks for confirmation unless you pass `-y`.

### Run

```bash
celigo flows run <flowId> [--start-time <ISO8601>] [--end-time <ISO8601>] [--export-ids <ids>] -y
```

The delta-window flags are `--start-time` and `--end-time` -- `flows run` has no `--start-date` or `--end-date`. They set this run's `lastExportDateTime` and `currentExportDateTime`. `--export-ids` is a comma-separated list of the page generators to run. The flow must be enabled.

### Test run

```bash
celigo flows test-run <flowId> --export <exportId>
celigo flows test-run-step-results <flowId> <runId> <exportOrImportId>
```

For flows, `--export` (one page generator) is required, and the CLI's help says the flow must be disabled -- the API returns 403 for an enabled flow. `test-run` returns the stage names per step (`metadata`), the test `flowJob` (its `_id` is the `runId`), and `childJobs`.

### Clone

```bash
echo '{"connectionMap":{"<oldConnectionId>":"<newConnectionId>"}}' | celigo flows clone <flowId> <integrationId> <environmentId> [--flow-group <flowGroupingId>]
```

A same-environment clone needs no stdin: the CLI maps each connection to itself. `--name` names the clone (default `Clone - <source name>`).

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
```

`debug-requests` lists what a step captured while its own debug window was open (`celigo exports enable-debug <id>` or `celigo imports enable-debug <id>`); `--since` defaults to 60 minutes. `enable-execution-logs` arms at most 60 minutes, the default. The full debugging workflow is in **troubleshooting-flows** ([references/cli.md](../../troubleshooting-flows/references/cli.md)).

### Read the delta checkpoint

```bash
celigo flows last-export-date <flowId>
```

### Organize with flow groups

```bash
celigo integrations flow-groups <integrationId>
celigo integrations create-flow-group <integrationId> <name>
celigo flows set-group <flowGroupingId> <flowIds...>
```

`create-flow-group` prints the new group; its `_id` is the `flowGroupingId`. `celigo flows unset-group <flowIds...>` takes flows out of their group.

## Pre-Submit Checklist and Common Errors

```bash
celigo integrations get <integrationId>    # the _integrationId is real
celigo connections get <connectionId>      # the _connectionId is real
```
