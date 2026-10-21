# Building Syncs with the Celigo MCP Tools

What an agent connected to the Celigo Platform MCP server can do for each step of How to Build a Sync and each Sync Operation. Step numbers and headings match [SKILL.md](../SKILL.md).

**The deployed server has no sync tools.** It can't list, create, update, enable, run or delete a sync; it has no dataset, catalog, sync-job, sync-error, event or usage tool; and it has no generic passthrough to the REST API. Syncs are built and operated with the `celigo` CLI ([cli.md](cli.md)), the integrator.io REST API (`/v1/syncs`, `/v1/syncJobs`, `/v1/di/...`), or the Celigo UI. Say so to the user before you start, and hand the sync steps to one of those.

The server's other tools still do the surrounding work: finding connections, building the export behind an export-backed dataset, and reading integrations.

## Ids

- A sync, a dataset and a sync job each have a 24-hex `_id`; none of them is reachable through `list_<type>` or `delete_resource`.
- A sync's source is `source._connectionId` and its warehouse is `destination._connectionId` -- ordinary connection ids, readable with `list_connections`.
- An export-backed dataset's `externalId` is an export's `_id` (`list_exports`).

## 1. Confirm it's a sync, and read the license

Decide sync versus flow from SKILL.md. The license's `di` block, the account's syncs, and the sources and destinations lists aren't readable over MCP: use the CLI (`celigo subscriptions licenses`, `celigo syncs list|sources|destinations`) or the UI. For product questions, `search_docs({ query: "..." })` searches the Celigo documentation.

## 2. Find or create the sync integration

```
list_integrations({})
list_integrations({ _id: "<integrationId>" })     // the full document: "syncs": true marks a sync integration
```

Create the sync integration, and everything inside it, with the CLI or the UI.

## 3. Pick the source connection and read its catalog

```
list_connections({})                              // the source connection, and its offline flag
```

The sync catalog (`/v1/di/metadata/...`) and the column read aren't available over MCP. `get_schema({ target: "connector", name: "<connectionId>" })` returns an application's metadata for building exports, not the sync catalog -- don't take dataset `externalId`s from it.

## 4. Create the draft sync

Not available over MCP.

## 5. Choose the datasets

Not available over MCP. An export-backed dataset needs an export on the sync's source connection, which the server can build:

```
get_schema({ target: "resource", name: "export" })
upsert_export({ body: { name: "<name>", _connectionId: "<sourceConnectionId>", ... } })   // no _id: creates; the reply's _id is the dataset's externalId
```

See **configuring-exports** for the export itself.

## 6. Set the destination

Not available over MCP. Find the warehouse connection with `list_connections({})` -- `type: "rdbms"` with `rdbms.type` `snowflake`, `bigquery` or `mssql`, or the NetSuite Analytics Warehouse JDBC connection -- and pass its `_id` to the user or the CLI.

## 7. Set the schedule, backfill start, and drift policy

Not available over MCP.

## 8. Review columns for personal data

Not available over MCP: masking is part of each dataset's `dataElements`.

## 9. Enable, then run

Not available over MCP. `run_flow` runs flows, not syncs.

## 10. Watch the first run

Not available over MCP. The flow run and error tools (`list_flow_runs`, `list_flow_errors`, `triage_flow_errors`) read flows; a sync's runs, errors and events are read through the sync job routes -- the CLI's `celigo sync-jobs` and `celigo syncs events`, or the UI.

## Sync Operations

Every Sync Operation -- read and write, run, monitor runs, cancel, pause, change, delete, usage and notifications -- is not available over MCP. `delete_resource` doesn't take syncs, and an integration that still holds a sync refuses deletion with 422 whichever surface asks.

## Not Available over MCP

| Need | Use |
|---|---|
| Syncs: list, read, create, update, enable, disable, delete, audit | The CLI's `celigo syncs`, or the REST API's `/v1/syncs` |
| Datasets, the catalog, and column details | The CLI's `celigo datasets`, or `/v1/syncs/{_syncId}/datasets` and `/v1/di/metadata/...` |
| Runs, resyncs and scoped runs | The CLI's `celigo syncs run` (a normal run in CLI 2026.10.1), `POST /v1/syncs/{_syncId}/run` with `runType` and `datasetIds`, or the UI |
| Sync jobs, their table families, errors, and cancel | The CLI's `celigo sync-jobs` and `celigo syncs cancel-jobs`, or `/v1/syncJobs/...` |
| Events and usage | The CLI's `celigo syncs events` and `celigo syncs usage`, or `/v1/di/resource/syncs/{_syncId}/events` and `/v1/syncs/usage` |
| The Data Ingestion license | The CLI's `celigo subscriptions licenses`, or the UI's subscription page |
| A sync's failure notifications | The CLI's `celigo notifications subscribe --user <email> --sync <syncId>` |

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
