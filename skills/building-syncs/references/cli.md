# Building Syncs with the `celigo` CLI

The commands for each step of How to Build a Sync, then for each Sync Operation. Step numbers and headings match [SKILL.md](../SKILL.md). Before the first write of a session (create, update, set, upsert, run, cancel, delete), confirm which account the CLI targets with one `celigo profile whoami` (the account, environment and token it authenticates as) -- see getting-started, "Which account the CLI targets".

Three groups cover syncs: `celigo syncs` (the sync itself, runs, events, usage), `celigo datasets` (the catalog, columns, and the sync's datasets), and `celigo sync-jobs` (runs and their errors).

## Modes and Writes

The profile's mode gates sync writes:

- **Any mode** -- the reads: `syncs list|get|audit|sources|destinations|events|usage`, `sync-jobs list|get|errors`, `datasets list|get|available|fields`, and `platform get`.
- **Operate or full** -- `syncs run`, `syncs cancel-jobs`, `sync-jobs cancel`, and `notifications subscribe|unsubscribe`.
- **Full** -- `syncs create|update|delete`, `datasets upsert`, and every `syncs set`: no field of a sync is PATCH-whitelisted, so operate mode can't set even `disabled`.

A command the mode refuses names the mode it needs. Tell the user what was blocked; never change the mode to get past it ([getting-started > Working on a Live Account](../../getting-started/SKILL.md#working-on-a-live-account)).

How the sync writes behave:

- **`celigo syncs set <syncId> key=value ...`** reads the sync, changes the named fields, and PUTs the complete document back, so `disabled` and everything else you didn't name are kept. Prefer it for single-field changes. It refuses `_integrationId` before sending anything.
- **`celigo syncs update <syncId> --file sync.json`** PUTs the body you give it, so everything you leave out is cleared -- including `disabled`, which enables a complete sync (SKILL.md, Gotcha 1). Start from `celigo syncs get <syncId>`. It drops `_id`, `_userId` and `_integrationId` from the body without a word: an update carrying another integration's id exits 0 and leaves the sync where it was.
- **`celigo datasets upsert --sync <syncId> --file datasets.json`** sends one batch and prints `Datasets upserted on sync <syncId>.` -- the API returns no body, so read the datasets back.

The CLI prints the platform's message without its error code -- `(422): Validation error: An integration is suppose to have either flows or syncs but not both.` is `integration_not_for_sync`; SKILL.md's Common Errors pairs each message with its code. A request with no answer after 30 seconds is retried up to three more times, and the CLI warns that a write that timed out may still have landed: read the sync back before trying again.

## 1. Confirm it's a sync, and read the license

```bash
celigo subscriptions licenses --jq '.[] | .di'     # enabled, volume, volumeAddOn, disableOverage, histLoadEndDate
celigo syncs list                                  # the account's syncs, with _integrationId and disabled
celigo syncs sources                               # applications with a catalog (object mode)
celigo syncs destinations                          # supported warehouses: bigquery, mssql, nsaw, snowflake
```

`syncs list` lists the current environment's syncs; an empty account answers `[]`. Count the enabled ones before planning to enable another: without a volume pack (`volumeAddOn: 0`), an environment can have one.

## 2. Find or create the sync integration

```bash
celigo integrations list
celigo integrations get <integrationId>             # "syncs": true marks a sync integration
celigo syncs list --integration <integrationId>     # the syncs it holds
echo '{"name": "<name>", "syncs": true}' | celigo integrations create
```

`celigo integrations set <integrationId> syncs=true` can't convert an integration: the platform answers 200 and drops the field, and the CLI reports nothing because the field wasn't there before. Removing the flag the same way prints `not stored  syncs` and exits 1.

## 3. Pick the source connection and read its catalog

```bash
celigo connections list --fields _id,name,type,offline
celigo datasets available <connectionId>                    # tables (_catalog: dataset) and the connection's exports (_catalog: export)
celigo datasets available <connectionId> --type datasets    # the tables only
celigo datasets available <connectionId> --refresh          # re-read the catalog from the source application
celigo platform get v1/di/metadata/connections/<connectionId>/datasets   # the raw {datasets, exports} answer
```

`datasets available` merges the two catalogs into one list: no `_catalog: dataset` rows means an empty object catalog -- export-backed datasets only. Each row's `name` is the `externalId` to use.

## 4. Create the draft sync

```bash
echo '{"_integrationId": "<integrationId>", "name": "<name>", "source": {"_connectionId": "<connectionId>"}}' | celigo syncs create
celigo syncs get <syncId>                           # disabled: true, destination: {}, and the driftPolicy it started with
```

## 5. Choose the datasets

Read the columns with `--sync`. The form without it answered 422 "A required parameter is missing: _datasetId" for an export and for an HTTP-connector object.

```bash
celigo datasets fields <connectionId> <datasetName> --sync <syncId>               # columns, types, constraints, deltaFields
celigo datasets fields <connectionId> <exportId> --is-export --sync <syncId>      # an export's record structure
celigo datasets fields <connectionId> <savedSearch> --record-type <recordType> --display-name "<name>" --sync <syncId>   # a NetSuite saved search
```

The column read asks the source application, so it needs a working connection; against an unreachable one it times out. Then write the batch:

```bash
celigo datasets upsert --sync <syncId> --file datasets.json
celigo datasets list --sync <syncId>                          # follows every page
celigo datasets get <datasetId> --sync <syncId>
celigo datasets available <connectionId> --sync <syncId>      # the catalog with each saved dataset's settings beside it
```

A create batch, one catalog table and one export:

```json
[
  {"externalId": "<catalog name>", "name": "Account", "enable": false, "ingestionMode": "merge",
   "exportProperties": {"type": "delta", "delta": {"dateField": "<one of deltaFields>"}},
   "dataElements": [{"name": "Id", "enable": true, "isPrimaryKey": true}, {"name": "Name", "enable": true}]},
  {"externalId": "<exportId>", "isExport": true, "name": "Orders", "tableName": "orders", "enable": false, "ingestionMode": "append",
   "dataElements": [{"name": "id", "enable": true}, {"name": "total", "enable": true}]}
]
```

To update a dataset, send it whole by `_id` -- from its read-back, without `externalId` and the read-only fields:

```bash
celigo datasets get <datasetId> --sync <syncId> \
  --jq '[del(.externalId, ._userId, ._syncId, .enableAllDataElements, .userActionRequired, .mismatchSyncConnection) | .enable = true]' > update.json
celigo datasets upsert --sync <syncId> --file update.json
```

`datasets available --sync` shows only what's in the catalog: a saved dataset whose `externalId` the catalog doesn't list appears in `datasets list` alone.

## 6. Set the destination

```bash
celigo connections list --fields _id,name,type,rdbms.type,offline          # warehouse connections are type rdbms (NSAW: jdbc)
celigo syncs list --fields _id,name,_integrationId,destination             # the database and schema other syncs use
celigo syncs get <syncId> > sync.json
# edit sync.json: set destination {_connectionId, database, schema}; keep "disabled": true
celigo syncs update <syncId> --file sync.json
```

Or `celigo syncs set <syncId> destination._connectionId=<connectionId> destination.database=<database> destination.schema=<schema>` -- one GET + PUT carrying all three. The save connects to the warehouse; if it doesn't answer within 30 seconds, read the sync back before anything else (Modes and Writes).

## 7. Set the schedule, backfill start, and drift policy

```bash
celigo syncs set <syncId> historicDateTime=2024-01-01T00:00:00.000Z
celigo syncs set <syncId> schedule='? 0 */6 * * *' timezone=America/New_York
celigo syncs set <syncId> driftPolicy.dataset.added=ignore driftPolicy.element.added=ignore
celigo syncs get <syncId>
```

`key=null` removes a field (`schedule=null` for on-demand runs only).

## 8. Review columns for personal data

Set `mask` in each dataset's `dataElements` and send the dataset whole (step 5):

```json
[{"_id": "<datasetId>", "name": "Contact", "tableName": "contact", "enable": false, "ingestionMode": "merge",
  "dataElements": [{"name": "Id", "enable": true, "isPrimaryKey": true}, {"name": "Email", "enable": true, "mask": true}]}]
```

## 9. Enable, then run

```bash
celigo syncs set <syncId> disabled=false
celigo syncs run <syncId>                           # {syncId, flowExecutionGroupId}
```

In CLI 2026.10.1, `syncs run` sends no body: it's always a normal run of every enabled dataset. A resync or a run scoped to some datasets needs the REST API -- `POST /v1/syncs/<syncId>/run` with `{"runType": "resync"}`, or `{"runType": "resync", "datasetIds": ["<datasetId>", ...]}` -- or the Celigo UI. Later CLI releases add `--resync` and `--datasets` to `syncs run`; check `celigo syncs run --help`.

## 10. Watch the first run

```bash
celigo sync-jobs list --sync <syncId>                          # newest first: status, runType, numErrors, numLoadedRecords
celigo sync-jobs get <syncJobId>
celigo platform get v1/syncJobs/<syncJobId>/family             # the parent job with tables[], one child job per table
celigo sync-jobs errors <syncJobId>                            # code, message, source, stage, occurredAt
celigo syncs events <syncId> --run <flowExecutionGroupId>
```

## Sync Operations

### Read and write

```bash
celigo syncs list [--integration <integrationId>] [--fields all]
celigo syncs get <syncId>
echo '<body>' | celigo syncs create
celigo syncs update <syncId> --file sync.json
celigo syncs set <syncId> key=value [key2=value2 ...]
celigo syncs audit <syncId>                                    # change history, including system changes to its connections
celigo datasets list --sync <syncId>
celigo datasets get <datasetId> --sync <syncId>
celigo datasets upsert --sync <syncId> --file datasets.json
celigo datasets available <connectionId> [--sync <syncId>] [--type datasets|exports|all] [--refresh]
celigo datasets fields <connectionId> <datasetName> --sync <syncId> [--is-export] [--refresh]
celigo syncs sources
celigo syncs destinations
```

`syncs list` shows `_id`, `name`, `_integrationId` and `disabled`; `--fields all` returns whole documents. `datasets list` and `get` need `--sync` -- datasets have no unscoped route.

### Run

```bash
celigo syncs run <syncId>
```

A normal run only (step 9); the resync and the scoped run are REST or UI calls in CLI 2026.10.1. The sync must be enabled, and a second run while one is queued or running is refused with 409.

### Monitor runs

```bash
celigo sync-jobs list --sync <syncId> [--created-gte <iso>] [--created-lte <iso>]
celigo sync-jobs get <syncJobId>
celigo platform get v1/syncJobs/<syncJobId>/family
celigo sync-jobs errors <syncJobId>
celigo platform get "v1/syncJobs/<syncJobId>/errors?_childJobId=<childJobId>"     # one table's errors; the child id is tables[]._id in the family
celigo platform get v1/integrations/<integrationId>/syncJobs/latest              # each sync's latest job; null when none has run
celigo syncs events <syncId> [--type "Schema Drift"|"Data Catalog"] [--resource-name <table>] [--run <flowExecutionGroupId>] [--time-gte <iso>] [--time-lte <iso>] [--limit <n>]
```

`sync-jobs list` follows every page; a created-date filter also returns queued and running jobs outside the range. `syncs events` follows every page unless `--limit` (1-1000) caps it to one request, and `--time-gte` must not be in the future. `platform get` sends one GET and prints the body: the family, the per-table error filter, and the latest-per-integration read have no command of their own. Sync runs and errors aren't flow jobs -- don't look for them with `celigo jobs` or `celigo flows errors`.

### Cancel

```bash
celigo sync-jobs cancel <syncJobId> -y
celigo syncs cancel-jobs <syncId> -y                # every queued and running job of the sync
celigo sync-jobs get <syncJobId>                    # canceling, then canceled
```

### Pause, change, delete

```bash
celigo syncs set <syncId> disabled=true
celigo syncs delete <syncId> -y
```

A delete is permanent: `celigo recycle-bin list --type syncs` is refused with 403 ("Recycle Bin operations are not supported for the given model at this time"), and the sync's datasets are gone with it. To delete the integration afterwards: `celigo integrations delete <integrationId> -y`.

### Usage and notifications

```bash
celigo syncs usage                                  # records loaded per sync, this calendar month (UTC)
celigo syncs usage --by month [--from YYYY-MM] [--to YYYY-MM]   # account-wide history against the license entitlement
celigo syncs usage --by environment
celigo notifications subscribe --user <email> --sync <syncId>
celigo notifications unsubscribe --user <email> --sync <syncId>
```

`syncs usage` lists only syncs that loaded rows this month, and needs account-administration permission. `subscriptions usage` carries the same figures under `syncs`.
