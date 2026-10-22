# Diagnosing NetSuite Steps

How to configure NetSuite exports, imports and connections is in [configuring-exports](../SKILL.md), [configuring-imports](../../configuring-imports/SKILL.md) and [configuring-connections](../../configuring-connections/SKILL.md), with their schemas. This reference is for a NetSuite step that fails, stalls or returns nothing: the checks that reach into the NetSuite account, the errors NetSuite steps return, and the traps that fail without an error.

- **CLI:** `celigo connections ping`, `celigo connections suiteapp-status`, `celigo metadata types|fields`, plus the run and error commands in [troubleshooting-flows](../../troubleshooting-flows/SKILL.md).
- **MCP:** the deployed server has no tool for a connection ping, the SuiteApp check or metadata. Run them with the CLI, or through the REST API: `GET /v1/connections/{_id}/ping`, `GET /v1/connections/{_id}/distributed` and `GET /v1/connections/{_id}/distributedApps`.

## Check the NetSuite Side First

When every NetSuite step on a connection fails, or a listener or a NetSuite DA import never gets anywhere, check the account before the step:

```bash
celigo connections ping <connectionId>                  # credentials and reachability; answers 200 either way, so read the body
celigo connections ping <connectionId> --distributed    # the Celigo SuiteApp or bundle RESTlet in the account
celigo connections suiteapp-status <connectionId>       # which of the SuiteApp and the bundle are installed, and their versions
```

- **The distributed ping** is a live round trip to the Celigo SuiteApp or bundle RESTlet that NetSuite listeners and NetSuite DA imports run through. It takes a few seconds and returns `{success, statusCode, resBody, bundleURL}`. Run it before building either.
- **`suiteapp-status`** reports the SuiteApp and the legacy bundle separately (`{bundle, suiteapp}`). Trust it over the connection's `netsuite.suiteAppInstalled`, which only records what was detected the last time the connection authenticated.

## Errors on NetSuite Steps

| Error | Where | What it means | What to do |
|---|---|---|---|
| HTTP 400 `SSS_REQUEST_LIMIT_EXCEEDED` (RESTlets), HTTP 429 (REST web services), `ExceededConcurrentRequestLimitFault` or `WS_REQUEST_BLOCKED` (SOAP), "Only one request may be made against a session at a time" | Any step on the NetSuite account | The account's concurrency limit is spent. Every connection to the account and every caller outside Celigo share it, and NetSuite refuses all of them at once, so a step can fail with nothing changed on its own connection | Total the ceilings of every connection to that account and keep them, with the outside callers, within its limit, or have the connections borrow from one parent ([Connections as concurrency queues](../../configuring-connections/SKILL.md#connections-as-concurrency-queues----throughput-and-governance)) |
| 403 `FEATURE_DISABLED` "The 'REST Web Services' feature is not enabled" | Every SuiteTalk REST and SuiteQL call | NetSuite's REST Web Services feature is off | A NetSuite administrator enables it (Setup > Company > Enable Features > SuiteCloud); custom RESTlets don't need it ([gotcha 12](../SKILL.md#gotchas)) |
| `sss_invalid_srch_operator` | A saved-search or lookup criterion | A numeric operator (`equalto`, `greaterthan`, `between` and the like) on a text column: the platform turns a templated `searchValue` into a number for them | Compare text and checkbox columns with `is` / `isnot`, and list or select columns with `anyof` / `noneof` and an array `searchValue` |
| `[search_not_sorted]` | An ad-hoc RESTlet search (criteria and columns, no saved search) | Grouping needs the search sorted by internal id | Set `netsuite.skipGrouping: true` ([gotcha 6](../SKILL.md#gotchas)) |
| `STATIC_MAPPING_ERROR` "Exported value is empty/undefined for the field: $.<path>" | A NetSuite DA lookup set with `searchField` and `operator` | The record's value for the search is empty | Fill the value upstream, or set `allowFailures: true` with a `default` |
| `VALUE_LOOKUP_FAILED` | A NetSuite DA lookup set with an `expression` | No match, or more than one | [configuring-imports > Common Errors](../../configuring-imports/SKILL.md#common-errors); a single match can be wrong too (below) |

## Wrong Results With No Error

- **A DA lookup whose key renders empty searches `isempty`.** When the source path a criterion reads is null or missing, the lookup searches that field for blank values instead of failing: two or more blank records fail the record with `VALUE_LOOKUP_FAILED` ("More than one match for `"[<field>,"isempty"]"`"), none fail it with "Could not find a match", and exactly one silently becomes the match. Branch on the key inside the expression: send a record without one to a fallback record, or render a value that can't match and set `allowFailures: true` with a `default`.
- **A saved search edited in NetSuite changes the export.** The export runs the search's current definition, so its output changes with no change in Celigo. When the output changed and the export didn't, open the search in NetSuite.
- **A formula criterion that's false for every record returns no rows** and no error. Check the formula with a preview that should return records.
- **A listener that never fires** is usually scoped away from the save: records a Celigo NetSuite import writes arrive in the `restlet` context, which the defaults leave out ([gotchas 14 and 15](../SKILL.md#gotchas)), and the listener's deployment follows its flow being enabled ([Listeners](../SKILL.md#listeners)).
- **The mapping Preview of a NetSuite DA import can't evaluate `[*]` inside a block-helper argument** (`{{#if line_items[*].x}}`, `{{#contains line_items[*].sku "_"}}`): the sublist comes back empty with no error, and a record using `<array>.@index.<field>` is dropped. An empty preview says nothing about such an expression; check it with a run.

## Batch Size, Previews and Metadata

- **`netsuite.restlet.batchSize`** (default 1000) sets how many records each NetSuite call returns; the export's `pageSize` doesn't. Larger batches mean fewer round trips but more NetSuite governance and memory per call, so lower it for large records. A test run or preview caps each request at the export's `pageSize` (default 20) instead, so it never exercises the run's batch size.
- **Metadata is cached.** `celigo metadata types <connectionId>` lists record types and saved searches, and `celigo metadata fields <connectionId> <recordType>` a record type's fields; after a field, record type or saved search is created in NetSuite, read again with `--refresh` ([step 4](../SKILL.md#4-query-metadata-for-the-target-system)).
