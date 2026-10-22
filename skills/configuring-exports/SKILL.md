---
name: configuring-exports
description: Configure Celigo export resources -- the data source step that fetches records from external systems. Use when creating or editing exports, choosing the right adaptor type for a target application, setting up delta/incremental syncs, webhooks, file transfers, or lookups.
---

<!-- TIER:1 -->

# Configuring Exports

An export is the **data source** in a Celigo integration. It connects to an external system and pulls data into the pipeline. Exports serve two roles:

- **Source** -- the starting point that fetches the primary batch of records
- **Lookup** -- a mid-flow enrichment step (`isLookup: true`) that fetches additional data per-record during processing

Both roles are used across flows, APIs, and tools.

Beyond fetching data, exports also handle post-retrieval processing before records enter the pipeline:

- **Output filter** -- expression-based filtering to skip records that don't match criteria
- **Transform** -- Transformation 2.0 expression rules to reshape/flatten response data before mapping
- **preSavePage hook** -- JavaScript processing on the full page of records before they enter the pipeline; the only stage that can change how many records a page carries (split one record into many, or merge several)
- **One-to-many** -- when used as a lookup, fan out a child array already on the input record. Set `oneToMany: true` and `pathToMany` to that array path so each child triggers a separate lookup. Once fanned out, the array element itself is the record, and the parent (without the array) is `record._PARENT`. This is not `resourcePath`, which locates records in an API response -- see [One-to-many fan-out](#one-to-many-fan-out----the-array-element-is-the-record)
- **Response mapping** -- when used as a lookup, extract fields from the lookup response back into the record. Configured on the flow's `pageProcessors[]` entry, but planned when building the lookup export. The response contains a `data` array and an `errors` array. Use `data[0].fieldName` when you expect a single result (e.g., fetching one order by ID). When multiple results are expected, map the whole array with `extract: "data"` (downstream steps then read it as a normal JSON array, or fan out over it with one-to-many), or use a `lists` entry with `data[*].fieldName` extracts to build a reshaped array. Do not put `data[*].fieldName` in a top-level `fields[].extract` -- the wildcard is silently ignored there and nothing is merged. See [writing-mappings > Response Mapping Reference](../writing-mappings/SKILL.md#response-mapping-reference-transformation-10). Response mapping uses Transformation 1.0 syntax (extract/generate pairs), not the newer expression-based transforms
- **postResponseMap hook** -- JavaScript processing after response mapping merges the lookup response back into the record. Configured on the flow's `pageProcessors[]` entry, but planned when building the lookup export
- **Trace key** -- each record's identity downstream: imports use it to match retries to their errors and as their default lock key, and it never de-duplicates. By default it's the first of the top-level fields `id`, `internalId`, `_id`, `internal_id` or `identifier` (exact names, in a few capitalizations) that the record has -- never a nested field. Set `traceKeyTemplate` when the identity is nested or composite (`{{join "_" record.customerId record.orderId}}`, without the `record.` prefix when a transform reshaped the record first). Keys are capped at 256 characters

## Export Execution Pipeline

When a flow runs, each export executes this pipeline in strict order:

1. **API request / query / file read** -- fetches raw data from the external system. On a file export an optional `preParse` hook then gets the raw file text (`preParseData`, with `fileMeta`) and returns it for the parser; a throw there fails the run
2. **Response parsing** -- `resourcePath` extracts the record array from the response body or file (e.g., `http.response.resourcePath` for HTTP, `file.json.resourcePath` for JSON files, XPath for XML)
3. **Grouping** (optional) -- rows that share a key become one record, an array of those rows: `groupByFields`, or Group rows on a NetSuite saved search (see [Grouped records](#grouped-records----one-record-many-rows))
4. **Transformation** (optional) -- `transform` reshapes individual records after extraction (Transformation 2.0). On an HTTP export it also sees the response's headers, by lowercase name, so it can carry a header into the records: `{{{headers.[x-total-count]}}}` as an extract, or `$.headers['x-total-count']` with `inputContext: "envelope"` (live-verified in a preview and a test run, 2026-10-22). Use triple braces: double braces HTML-escape the value
5. **Output filter** (optional) -- discards records that don't match filter expression rules
6. **preSavePage hook** (optional) -- JavaScript processing on the full page of records

**Key distinction:** `resourcePath` tells the export WHERE to find records in the response. Transforms reshape WHAT each record looks like after extraction. When a user says "extract records from X" or "treat each X as a separate record", that's almost always a `resourcePath` change, not a transform. Use transforms when you need to flatten nested objects, rename fields, or restructure individual records.

## Three Categories of Export

Not all exports work the same way. Before building, understand which category you need:

### Listeners

Receive data pushed to Celigo from an external system. No polling, no scheduling -- the source system sends data when events happen.

- `WebhookExport` with `type: "webhook"` -- inbound HTTP listener (no connection required). URL, signature checks and responses: [Webhook listeners](#webhook-listeners----type-url-signature-responses)
- `AS2Export` -- AS2 EDI file reception
- Distributed exports (`type: "distributed"`) -- real-time listeners for NetSuite and Salesforce. NetSuite: saving the export deploys a Celigo user event script on the record type (the account needs the Celigo SuiteApp or bundle). Salesforce: saving creates nothing in Salesforce -- the org needs the Celigo managed package plus an Apex trigger on each object that calls it. Integration Apps create their triggers at installation; for a custom flow the customer deploys the trigger, starting from the code the export page shows under Required trigger. `celigo connections ping --distributed <connectionId>` checks that the package or SuiteApp responds; its `success: false` (still HTTP 200) also comes back for an offline connection, so read `resBody` before telling the user to install anything.
- Change data capture (`type: "stream"` plus a `cdc` object) -- streams database changes as they happen: MongoDB change streams (`MongodbExport`), and SQL Server CDC or PostgreSQL logical replication (`RDBMSExport`). A CDC export has no query. The RDBMS form watches `rdbms.tables` (`database.schema.table` on SQL Server, `schema.table` on PostgreSQL) or, on PostgreSQL only, `cdc.publicationName`. The save checks the export and the connection's database type, not the database: one whose own change capture isn't set up (PostgreSQL logical replication, SQL Server CDC on the database and each table, a MongoDB replica set) still saves, so when a CDC listener delivers nothing, check the database side first instead -- set one, not both. Every CDC export must resolve a snapshot mode (`cdc.snapshotMode`, or a `snapshot.mode` entry in `cdc.properties`), and a MongoDB one a capture mode too (`cdc.captureMode`, or a `capture.mode` entry). See [cdc.yml](references/schemas/cdc.yml).
- Topic listeners (`adaptorType: "TopicExport"`, `type: "stream"`) -- consume what is published to the Event Streams topic in `topic._topicId`. No `_connectionId` and no `cdc` object: with a connection, the save validates the export as that connection's adaptor and fails. Without `type: "stream"` the export saves but runs as a batch export and never starts on a publish; a PATCH can't add the type later, so update the full document with it, then disable and re-enable the flow. A topic listener can't be a lookup. See [topic.yml](references/schemas/topic.yml).

`type: "stream"` is accepted only on those three adaptors (`MongodbExport`, `RDBMSExport` on SQL Server or PostgreSQL, `TopicExport`); every other adaptor rejects the save with `unsupported_export_type`.

**A listener is switched by its flow.** `netsuite.distributed.disabled` is maintained by the platform; pause a NetSuite listener by disabling its flow. A topic subscription or a NetSuite listener's deployment becomes active when the flow goes from disabled to enabled -- a flow created already enabled doesn't activate it. Create the flow disabled and enable it afterwards. After repairing a listener export, or when a NetSuite listener stops firing, disable and re-enable the flow (`celigo flows set <flowId> disabled=true`, then `disabled=false`). A webhook listener has no such step: it accepts requests as soon as a flow it feeds is enabled, a flow created enabled included, and refuses them with 403 while every such flow is disabled.

**When to use:** The source system supports outbound webhooks, push notifications, or change data capture, or the records arrive on an Event Streams topic, and you want real-time processing.

### File Transfers

Read files from a remote location, then either parse them into records or transfer them as blobs.

- `FTPExport` / `S3Export` / `FileSystemExport` -- fetch files from FTP/SFTP, S3, or local filesystem
- `HTTPExport` with `http.type: "file"` -- read the files in a cloud storage folder (Google Drive, Box, Dropbox, Azure Blob Storage, Google Cloud Storage, Azure Data Lake Storage Gen2, Celigo Storage). On these file-storage connectors it's folder mode: `relativeURI` is a folder path the connector resolves, not an API endpoint -- an API URL there saves cleanly and fails at runtime with "Directory is not found". A folder picked in the UI's folder browser is stored in `file.directory` (`pathMode: "directoryId"` plus the provider's folder `id`); on the drive-style providers that id alone selects the folder and `relativeURI` isn't read, so retarget the export by changing `file.directory.id` (Google Cloud Storage keeps the bucket in `storageRootId` and the object prefix in `id`). The connector handles auth; the `file{}` config handles parsing. To fetch one file per record from an API endpoint instead, use a blob lookup (`type: "blob"`, `isLookup: true`) without `http.type: "file"`, and response-map its `data.0.blobKey` to `blobKey`, the field the upload import's `blobKeyPath` names.
- `NetSuiteExport` with `netsuite.type: "file"` -- fetch and parse files (CSV, JSON, XLSX, XML, EDI) from the NetSuite file cabinet
- Parsed mode (`file.output: "records"`) -- CSV, XML, JSON, XLSX, EDI files are parsed into individual records. Fixed-width files, and files whose rows carry a type marker (`HDR`/`DTL`), parse through a file definition (`file.type: "filedefinition"`); see [building-b2b](../building-b2b/SKILL.md#5-create-file-definitions), since a few rule mistakes drop rows without an error. On a file-provider export or lookup, each record's source file is also `fileMeta` -- exactly `fileName`, `fileSize` and `lastModifiedTime` (epoch milliseconds) -- read as `{{fileMeta.fileName}}` in Handlebars or `$.fileMeta.<field>` in an envelope-mode transform. Only file-provider steps populate it at run time, even where an editor render resolves it
- Blob mode (`type: "blob"`) -- binary files transferred as-is without parsing. Supported on HTTPExport, NetSuiteExport, SalesforceExport, FTPExport, and S3Export.
- **Source files are deleted after a successful read.** An FTP/SFTP or S3 export removes each file it processed from the folder or bucket unless `file.skipDelete` is `true`; `ftp.backupDirectoryPath` (S3: `s3.backupBucket`) moves them there instead, which also takes them out of the folder. Files that fail processing stay. When another system or flow reads the same files, set `file.skipDelete: true` and narrow the export to its own files with `ftp.fileNameStartsWith`/`fileNameEndsWith` (S3: `s3.keyStartsWith`/`keyEndsWith`).

A CSV export on SFTP that leaves the files for another reader (`hasHeaderRow` and a comma delimiter are the defaults, shown for clarity):

```json
{
  "name": "Read inventory files",
  "adaptorType": "FTPExport",
  "_connectionId": "<ftpConnectionId>",
  "ftp": { "directoryPath": "/outbound", "fileNameStartsWith": "inventory_", "fileNameEndsWith": ".csv" },
  "file": { "type": "csv", "output": "records", "skipDelete": true, "csv": { "hasHeaderRow": true, "columnDelimiter": "," } }
}
```

**When to use:** The source system drops files (CSV, EDI, XML, etc.) into a directory, bucket, file cabinet, or cloud storage rather than exposing a record-based API.

### Record-Based Exports

Actively fetch batches of records from an API or database on a schedule.

- `HTTPExport` -- REST and GraphQL APIs (for GraphQL, see [GraphQL APIs](#graphql-apis----envelope-cursor-paging-errors-with-http-200))
- `NetSuiteHTTPExport` -- NetSuite's REST APIs on a `netsuite` connection: SuiteQL and REST record endpoints (`nsDomainType: "suitetalk"`) or a custom RESTlet (`nsDomainType: "restlet"`). Nothing has to exist in NetSuite first, so it's the default for NetSuite exports and lookups
- `NetSuiteExport` -- a saved search (or search criteria) run through Celigo's SuiteApp/bundle RESTlets. Use it when the user names or wants a saved search; it's also the adaptor for NetSuite listeners and file cabinet exports
- `SalesforceExport` -- SOQL/Bulk queries
- `RDBMSExport` -- SQL SELECT queries
- `MongodbExport`, `JDBCExport`, `DynamodbExport` -- other databases
- `WrapperExport` -- custom connector code, typically a function on a stack (`wrapper.function`)

**When to use:** You need to poll an API or query a database for records on a schedule (full fetch or delta/incremental).

## Quick Reference

### Adaptor Decision Matrix

| Your data comes from... | Use adaptorType | Category | Read schema |
|---|---|---|---|
| REST or GraphQL API | `HTTPExport` | Record-based | [http.yml](references/schemas/http.yml) |
| Files in a cloud storage folder (Google Drive, Box, Dropbox, Azure Blob, Google Cloud Storage, ADLS Gen2, Celigo Storage) | `HTTPExport` with `http.type: "file"` | File transfer | [http.yml](references/schemas/http.yml) + [file.yml](references/schemas/file.yml) |
| NetSuite records (SuiteQL, REST record endpoints, custom RESTlet) | `NetSuiteHTTPExport` + `nsDomainType` | Record-based | [http.yml](references/schemas/http.yml) |
| NetSuite saved search, listener, or file cabinet | `NetSuiteExport` | Record-based, Listener, or File transfer | [netsuite.yml](references/schemas/netsuite.yml) |
| Salesforce objects | `SalesforceExport` | Record-based | [salesforce.yml](references/schemas/salesforce.yml) |
| SQL database (queries, or CDC on SQL Server and PostgreSQL) | `RDBMSExport` | Record-based or Listener | [rdbms.yml](references/schemas/rdbms.yml) (+ [cdc.yml](references/schemas/cdc.yml) for CDC) |
| MongoDB (queries or change streams) | `MongodbExport` | Record-based or Listener | [mongodb.yml](references/schemas/mongodb.yml) (+ [cdc.yml](references/schemas/cdc.yml) for change streams) |
| JDBC database, including NetSuite through SuiteAnalytics Connect (a `netsuitejdbc` connection) | `JDBCExport` | Record-based | [jdbc.yml](references/schemas/jdbc.yml) |
| DynamoDB | `DynamodbExport` | Record-based | [dynamodb.yml](references/schemas/dynamodb.yml) |
| Files on FTP/SFTP | `FTPExport` | File transfer | [ftp.yml](references/schemas/ftp.yml) + [file.yml](references/schemas/file.yml) |
| Files on S3 | `S3Export` | File transfer | [s3.yml](references/schemas/s3.yml) + [file.yml](references/schemas/file.yml) |
| Webhooks / push events | `WebhookExport` | Listener | [webhook.yml](references/schemas/webhook.yml) |
| AS2 EDI messages | `AS2Export` | Listener | [as2.yml](references/schemas/as2.yml) |
| Event Streams topic | `TopicExport` (`type: "stream"`) | Listener | [topic.yml](references/schemas/topic.yml) |
| Manual file upload | `SimpleExport` | File transfer | [simple.yml](references/schemas/simple.yml) |
| Local filesystem | `FileSystemExport` | File transfer | [filesystem.yml](references/schemas/filesystem.yml) + [file.yml](references/schemas/file.yml) |
| Custom connector code on a stack | `WrapperExport` | Record-based | [wrapper.yml](references/schemas/wrapper.yml) |

**Raw HTTP is the fallback, not the default.** Pick the most specific match, in order:

1. **Native adaptor** -- if the application has its own row (NetSuite, Salesforce, databases, FTP/S3), use it. Do not build an `HTTPExport` against that app's REST API.
2. **Pre-built HTTP connector** -- for any other REST/GraphQL app, check the 550+ connector catalog before writing HTTP config (see [Check for a pre-built connector](#3-check-for-a-pre-built-connector)). The step is still an `HTTPExport`, but it runs on a connector-backed connection and takes its endpoint config from the connector.
3. **Manual HTTP** -- hand-write the config from public API docs only when no connector exists or it doesn't cover the endpoint you need.

`adaptorType` is **case-sensitive**: `HTTPExport`, not `httpExport`.

### Minimum Required Fields

Every export needs at minimum:

- `name` -- human-readable label
- `adaptorType` -- from the matrix above
- `_connectionId` -- except `WebhookExport`, `SimpleExport` and `TopicExport` (a connection on a topic listener fails the save)
- Adaptor config block -- `http{}`, `netsuite{}`, `ftp{}`, `salesforce{}`, `rdbms{}`, `topic{}`, etc.

### Which Schemas to Read

1. **Always:** [request.yml](references/schemas/request.yml) (base fields for all exports)
2. **Plus:** the adaptor-specific file from the matrix above (e.g., `http.yml` for HTTPExport)
3. **If file-based:** also [file.yml](references/schemas/file.yml) (CSV, XML, JSON, XLSX, EDI parsing config)
4. **If delta/incremental:** `type: "delta"`, plus [delta.yml](references/schemas/delta.yml) or the Handlebars URI pattern (`{{lastExportDateTime}}`)
5. **If cloning:** [clone-request.yml](references/schemas/clone-request.yml), [clone-response.yml](references/schemas/clone-response.yml)

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Base fields (all exports):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **Adaptor-specific config:**
  - [http.yml](references/schemas/http.yml) -- HTTP/REST/GraphQL
  - [netsuite.yml](references/schemas/netsuite.yml) -- `NetSuiteExport` (saved search, Celigo RESTlets, listener, file cabinet); `NetSuiteHTTPExport` uses [http.yml](references/schemas/http.yml) plus `nsDomainType`
  - [salesforce.yml](references/schemas/salesforce.yml) -- Salesforce (SOQL, bulk)
  - [ftp.yml](references/schemas/ftp.yml) -- FTP/SFTP
  - [s3.yml](references/schemas/s3.yml) -- Amazon S3
  - [rdbms.yml](references/schemas/rdbms.yml) -- SQL databases
  - [mongodb.yml](references/schemas/mongodb.yml) -- MongoDB
  - [jdbc.yml](references/schemas/jdbc.yml) -- JDBC databases
  - [dynamodb.yml](references/schemas/dynamodb.yml) -- DynamoDB
  - [as2.yml](references/schemas/as2.yml) -- AS2 EDI
  - [wrapper.yml](references/schemas/wrapper.yml) -- custom stack connectors
  - [filesystem.yml](references/schemas/filesystem.yml) -- local filesystem
  - [simple.yml](references/schemas/simple.yml) -- data loader / manual upload
- **File parsing:** [file.yml](references/schemas/file.yml) (CSV, XML, JSON, XLSX, EDI)
- **Grouping:** [group-by.yml](references/schemas/group-by.yml) (`groupByFields`; NetSuite saved searches group with `netsuite.skipGrouping` instead)
- **Operational modes:** [delta.yml](references/schemas/delta.yml), [once.yml](references/schemas/once.yml), [test.yml](references/schemas/test.yml), [webhook.yml](references/schemas/webhook.yml), [cdc.yml](references/schemas/cdc.yml) (database listeners), [topic.yml](references/schemas/topic.yml) (topic listeners). NetSuite and Salesforce listener settings live in `netsuite.distributed` and `salesforce.distributed` ([netsuite.yml](references/schemas/netsuite.yml), [salesforce.yml](references/schemas/salesforce.yml)); [distributed.yml](references/schemas/distributed.yml) holds only the optional `bearerToken` for pushing records into a distributed export
- **Mock output:** [mock-output.yml](references/schemas/mock-output.yml)
- **Preview request:** [preview-request.yml](references/schemas/preview-request.yml) (`postData` sets the delta variables in a preview)
- **Clone:** [clone-request.yml](references/schemas/clone-request.yml), [clone-response.yml](references/schemas/clone-response.yml)

## Related Skills

- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connection types, auth methods, iClients
- [managing-file-storage > Use stored files in a flow](../managing-file-storage/SKILL.md#8-use-stored-files-in-a-flow) -- Celigo Storage folders as a file source
- [writing-mappings > Transformation 2.0](../writing-mappings/SKILL.md#transformation-20-workflow) -- reshape export output before mapping
- [writing-scripts > Data Pipeline Hooks](../writing-scripts/SKILL.md#data-pipeline-hooks) -- preSavePage, postResponseMap hooks
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- dynamic values in URIs, filters, delta tokens
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring exports into flows
- [configuring-topics > How to Build an Event Stream](../configuring-topics/SKILL.md#how-to-build-an-event-stream) -- the topic a listener reads: registration, retention, messages, positions
- [building-syncs > Sources](../building-syncs/SKILL.md#sources-catalog-datasets-and-export-backed-datasets) -- an export as the source of a sync's export-backed dataset
- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- diagnosing export-related failures

<!-- TIER:2 -->

## How to Build an Export

### 1. Identify the target application

What system are you pulling data from? This determines everything -- adaptor type, connection type, and configuration shape.

### 2. Check for existing patterns

Before building from scratch, look at what already exists:

```bash
# Search across the entire account for related resources
celigo account search "<keyword>"

# Show what an existing export uses (connection) and what uses it (flows)
celigo account dependencies export <id>

# Find orphaned exports not referenced by any flow
celigo account lint

# Check if a similar export already exists in the account
celigo exports list | grep -i "<application-name>"

# Search the marketplace for pre-built integration templates
celigo templates marketplace

# Preview a template to see its export configuration
celigo templates preview <id> --model Export
celigo templates preview <id> --summary
```

The account index auto-refreshes when stale (older than 15 minutes by default). Force a fresh snapshot with `celigo account snapshot`.

Existing exports in the account are the best reference -- they show proven patterns for that specific customer's setup. Marketplace templates may provide a complete pre-built integration you can install rather than building from scratch.

### 3. Check for a pre-built connector

**Always run this check before writing any HTTP config.** Celigo maintains 550+ HTTP connector definitions and 590+ trading partner connectors. These provide pre-configured auth, base URLs, and endpoint definitions for common applications. Connectors are set on the **connection**, not the export -- but they determine what the export can do. Hand-write a manual `HTTPExport` from public API docs only when this search comes up empty or the connector doesn't cover the endpoint you need.

```bash
# Search HTTP connectors (REST APIs: Shopify, Stripe, HubSpot, etc.)
celigo http-connectors list | grep -i "<application-name>"
celigo http-connectors get <id> --full    # see endpoints, resources, auth config

# Drill into the endpoints the connector defines for exports
celigo http-connectors catalog <id> --resource-type export --published-only
celigo http-connectors endpoint-detail <id> --resource-type export --resource-id <rid> --endpoint-id <epid>

# Search trading partner connectors (EDI, AS2, VAN)
celigo tp-connectors list
```

If an HTTP connector exists for your target app, create the connection from it (`http._httpConnectorId` -- see [configuring-connections > Check for a pre-built connector and global iClient](../configuring-connections/SKILL.md#4-check-for-a-pre-built-connector-and-global-iclient)) and take the export's `relativeURI`, method, pagination, and response paths from the connector's endpoint metadata rather than reconstructing them from public API docs. In `celigo http-connectors endpoint-detail`, the endpoint's `supportedBy` lists what the connector's own form applies: `preConfiguredFields` (values it sets), `fieldsUserMustSet` (what it asks the user for -- often which `type` the endpoint supports, such as `delta` or `test`) and `fieldsToUnset`. Their paths are the form's, not the export's: Shopify's list-customers endpoint presets `response` to `{resourcePath: "customers"}` (the export's `http.response.resourcePath`) and `delta` to a `dateFormat` (`delta.dateFormat`) plus `defaults: {updated_at_min: "{{{lastExportDateTime}}}"}` (a query parameter in `relativeURI`). Saving links the export to the connector: when `relativeURI` and `method` match one of its endpoints, the platform sets `http._httpConnectorVersionId`, `http._httpConnectorResourceId` and `http._httpConnectorEndpointId`, replacing pointers that belong to another connector. Pointers for the connection's own connector are kept exactly as sent, even when the URI names a different endpoint. Read the export back after saving (no pointers means the URI matched no endpoint), and when you retarget it to another endpoint, update or drop the old pointers in the same save: the request follows `relativeURI`, but stale pointers keep naming the old endpoint in the editor and in later edits.

If a trading partner connector exists (EDI/AS2), reference it on the export via `ftp._tpConnectorId` (FTP exports) or `as2._tpConnectorId` (AS2 exports). You may also need to set `_ediProfileId` on the export for EDI document validation.

### 4. Query metadata for the target system

For NetSuite, Salesforce, and RDBMS connections, you can discover available record types and fields directly from the live system:

```bash
# List available record types / sObjects / tables
# NetSuite also returns saved searches alongside record types
celigo metadata types <connectionId>

# List fields for a specific entity type
celigo metadata fields <connectionId> <entityType>
```

This tells you what data is available to export before you write any configuration. Both commands read a server-side cache: after a field, record type or saved search is created in the app, re-read with `--refresh`.

- **NetSuite:** `metadata types` returns both record types and saved searches (with IDs you need for `netsuite.restlet.searchId`). Use a record type's lowercase `scriptId` as `recordType`, not its `id`: for custom records and lists, `id` is NetSuite's numeric internal id. A search over every transaction type uses `recordType: "transaction"`. `metadata fields` returns field IDs, names, types, and group — including the sublist groups and fields you'll need for `netsuite_da.mapping.lists[]` on a NetSuite DA import. Search criteria and columns take search-column ids instead, which can differ (`shipaddress1`, not `shipaddr1`).
- **Salesforce:** `metadata types` returns sObjects with queryable/createable flags. `metadata fields` returns fields, types, and relationship names — use these to discover child objects for `salesforce.distributed.relatedLists[]` and relationship field names for cross-object queries.
- **RDBMS:** `metadata types` returns table names. `metadata fields` returns column names and types for a given table — use these when writing SQL queries or building field mappings.

### 5. Determine the category

Is this a **listener** (real-time push from the source), a **file transfer** (fetch and parse/transfer files), or a **record-based export** (poll an API or query a database)? This narrows which adaptor types and modes apply.

### 6. Choose the right adaptor type

Use the [Adaptor Decision Matrix](#adaptor-decision-matrix) in Quick Reference above to select the correct `adaptorType` for your target system. For NetSuite, [Diagnosing NetSuite Steps](references/netsuite.md) has the checks to run against the NetSuite account and the errors its steps return.

### 7. Build the export JSON

Use the [Schema Index](#schema-index) and [Which Schemas to Read](#which-schemas-to-read) in Quick Reference above. Read `request.yml` for base fields, then the adaptor-specific schema, plus `file.yml` if file-based and `delta.yml` if incremental.

## Export Design Decisions

A few design choices recur when building exports. Each has a defensible default once the framing is clear.

### Delta vs one-time vs full sync

The export's `type` field selects the sync behavior:

- **Delta** (`type: "delta"`) -- pulls only records created or modified since the flow's checkpoint (see [Delta windows and the checkpoint](#delta-windows-and-the-checkpoint)). The default for ongoing scheduled syncs when the source exposes a usable "last modified" timestamp. Application adaptors such as NetSuite and Salesforce name the timestamp field in `delta.dateField`; HTTP exports and SQL queries put `{{lastExportDateTime}}` in the request instead (`relativeURI`, body or query), and an HTTP export with `delta.dateField` is refused with 422 "Unsupported dateField in export.delta.dateField". See [delta.yml](references/schemas/delta.yml).
- **One-time** (`type: "once"`) -- reads each record once by marking it in the source: each run selects the records not yet marked, then marks them after a page succeeds so later runs skip them. Adaptors that mark a checkbox name it in `once.booleanField` (`false` to `true`); an RDBMS export runs `rdbms.once.query`, an `UPDATE` (see [writing-sql](../writing-sql/SKILL.md)); an HTTP export calls `http.once`, a request rendered against each record as exported, before any mapping. Each mark runs only while the export's `type` is `once`: on an export with no `type`, a saved `http.once` is kept and never called, so every run reads everything again. The mark only stops this export from reading the record again; keeping a repeated record from writing twice is the import's job ([configuring-imports > Writing Exactly Once](../configuring-imports/SKILL.md#writing-exactly-once)). Use for backfills and migrations, or when the source has no reliable timestamp but its records can carry a processed flag. See [once.yml](references/schemas/once.yml).
- **Full** (neither `delta` nor `once` mode) -- re-pulls the entire dataset every run. Use when the source has no usable modification timestamp, the dataset is small enough that re-pulling is cheap, or business logic requires a fresh snapshot each run.

When the request is vague ("sync customers"), confirm which kind of sync is intended before building. Delta is a reasonable default when the source exposes a timestamp field; full is reasonable for small static datasets.

### Delta windows and the checkpoint

Each delta run reads one window. `{{lastExportDateTime}}` is its start (the flow's checkpoint) and `{{currentExportDateTime}}` its end (the time the run started). Put `{{lastExportDateTime}}` in the request as the lower bound, such as `?updated_since={{lastExportDateTime}}`; with `{{currentExportDateTime}}` there, every run asks for records changed after it started and exports nothing. Both render as ISO 8601 UTC with milliseconds (`2026-10-01T00:00:00.000Z`) in HTTP requests and SQL queries alike, and `delta.dateFormat` reformats both. `{{lastExportDateTimeUTC}}` isn't a variable: it renders empty. On an export with no `type`, both render empty on every run, so a request that carries them goes out with a blank bound (`?updated_since=`) each time: set `type: "delta"`.

- **Set `delta.startDate` for the first run.** Without it, a new flow's first run renders `{{lastExportDateTime}}` as the run's own time -- an empty window, not a full export. With it, the first run starts there.
- **The checkpoint moves only when a run exports records.** Such a run sets it (`GET /v1/flows/<flowId>/lastExportDateTime`) to its window end. A run that exports nothing leaves it where it was, so the next run that finds records reaches back to the last run that exported any. After a stretch of empty runs (a broken filter token, an outage at the source), fix the cause and the next run picks up the missed records by itself: no backfill run is needed.
- **A run given its own window leaves the checkpoint at that window's end.** A run with `export.startDate`/`endDate` (CLI: `flows run --start-time/--end-time`) reads that window and leaves the checkpoint at `endDate`, even a past one, so the next scheduled run re-reads everything after it. A backfill with an old end date rewinds the export.
- **A document preview renders both variables empty** unless the document supplies them in `postData` (gotcha 18), so it doesn't show the delta window by itself.

### Listener/webhook vs scheduled export

Both are starting steps (see [Three Categories of Export](#three-categories-of-export)); the choice is driven by what the source supports and the latency budget, not preference:

- Reach for a **listener** (`WebhookExport`, NetSuite/Salesforce `type: "distributed"`, or `type: "stream"` for database CDC and topic listeners) when the source pushes events or streams its changes and the flow needs to react quickly ("when X happens, do Y", "when a row changes").
- Reach for a **scheduled export** when the source has no push mechanism, or when batch timing at off-peak hours is acceptable.

NetSuite and Salesforce support both for many record types. Mixing them on one flow is a common, good pattern -- a listener handles low-latency reactions while a scheduled export runs as a safety net for backfills, end-of-day reconciliation, and catching up after a webhook outage.

### Webhook listeners -- type, URL, signature, responses

A webhook listener is a `WebhookExport` with `type: "webhook"` and a `webhook` object. Without the type, the save is refused with 422 "_connectionId is required unless type is [webhook|simple]". It needs no connection; one may be set, and it saves and updates without error. It runs only as a flow's source: put it in the flow's `pageGenerators` (`[{"_exportId": "<exportId>"}]`) with a full update of the flow that keeps its `pageProcessors` -- the flow PATCH route can't set `pageGenerators` -- then enable the flow.

- **URL.** The sender POSTs to `https://api.integrator.io/v1/exports/<exportId>/data`, or the same path on the account's regional API host (`api.eu.integrator.io`, `api.au.integrator.io`, `api.ca.integrator.io`). The export's page in Celigo shows this URL as its public URL, ready to copy. There is no other listener path.
- **Signature.** Configure exactly what the sender does. HMAC takes `verify: "hmac"`, `key`, `algorithm` (`sha256`, `sha1`, `sha384` or `sha512`), `encoding` (`hex` or `base64`) and `header` (the header that carries the signature). With `provider: "custom"` the platform computes the HMAC of the raw body and compares the header value with it character for character: a lowercase hex SHA-256 signature was accepted, while base64, uppercase hex, a `sha256=` prefix, SHA-1 and a wrong key each got 401.
- **Secret.** When the receiver picks the secret, as many senders allow, generate a random one of at least 32 characters (for example `openssl rand -hex 32`), save it as the `key` (or `token`), and give it to the user to register with the sender. Never save a placeholder. Reads return it masked, so hand it over when you create it.
- **Responses.** 204 when a request is accepted (the default `successStatusCode`), 401 when it fails verification, and 403 `unable_to_run_flows` while every flow the export feeds is disabled or not fully configured. A refused request isn't queued: once the flow is enabled again, the sender has to resend what it delivered in the meantime. Enabling the flow is the whole fix: the next delivery is accepted at once, and nothing needs to be run.
- **Updating the export needs the secret.** Reads return `webhook.token` masked, and an update without it is refused with 422 ("token is required for token verification"). When the flow is the problem, fix the flow and leave the export alone.

### Lookup export vs separate scheduled export

The distinguishing question is when the data is needed:

- A **lookup export** (`isLookup: true`) runs per in-flight record, mid-pipeline, keyed off the upstream record -- fetching the customer for a specific order, or inventory for a specific SKU.
- A **scheduled export** runs once per flow run as a starting point, producing the first batch of records the flow processes.

If the request is "for each X, look up Y", it's a lookup. If it's "every hour, pull all Y", it's a scheduled export.

Four lookup behaviors to plan for before the first test:

- **Finding nothing isn't a failure.** Zero results count as success: the record continues with nothing merged, so `proceedOnFailure` doesn't apply. To fail the record instead on an HTTP lookup, set `http.response.successPath` (without `successValues`) to a path only a match has, such as `results[0].id`; an empty result then fails with `response_failure`. For your own error message, a `preSavePage` hook on the lookup can return one `newErrorsAndRetryData` entry when `options.data` and `options.errors` are both empty. To route instead of fail, response-map `data` and `errors` onto the record and branch on them.
- **The response mapping reads the lookup's output, not its raw response.** It sees the records after the lookup's own transform and output filter, so extract the field names the transform produces. A saved `mockOutput` holds the raw response and a test run applies the transform on top of it, so don't write the mapping against the stored shape.
- **More than one match needs a guard.** When a lookup can match more than one record (a name, email or phone key), guard `data[0]` before it feeds an update -- see [configuring-lookup-caches > Safe Lookup-to-Update](../configuring-lookup-caches/SKILL.md#safe-lookup-to-update----never-write-off-an-unguarded-first-match).
- **A standalone preview can't render the record.** Any lookup whose request reads the arriving record (`{{record.*}}` in a URI, body, SOQL or SQL query, or a `{{...}}` field in a NetSuite search criterion) fails a standalone preview with `handlebars_template_parse_error` ("... not defined in the model"): neither the export preview nor a virtual export (`exports invoke --connection`) binds a record, even when you send one. That's a preview limitation, not a broken template. Check the lookup in the flow builder's step preview with an upstream record, or in a flow test run (`celigo flows test-run <flowId> --export <sourceExportId>`), which calls the lookup live unless it has a saved `mockOutput` (a test run replays it).

### One-to-many fan-out -- the array element IS the record

`oneToMany` plus `pathToMany` unwraps a child array that is already on the input record. It does not locate records in an API response (`resourcePath` does that), and it does not split a lookup's multi-row response (map that onto the record with response mapping `extract: "data"`, then fan out over the mapped array in a later step). Only a step that receives a record fans out: on a flow's source export both fields save and do nothing, so split a source's records with a `preSavePage` hook (or, for a file definition, the record boundary in its rules).

With `oneToMany: true` and `pathToMany` set to a child array path, each element of that array triggers its own lookup. Once fanned out, **the element becomes the record**:

- Child fields are `{{record.variantId}}` -- not `{{variantId}}`, and not `{{record.lineItems.variantId}}`.
- The parent's other fields stay on the child as `record._PARENT` (the parent without the array): `{{record._PARENT.id}}`.

Fan-out does not change the request root to `batch_of_records`. A lookup has no request batch size: it runs once per fanned-out child, and its request always renders against `record`.

When the arriving record is itself an array -- grouped rows from a `groupByFields` export or a file group -- leave `pathToMany` blank: each element becomes the record, with no `_PARENT`. A path on an array record fans out zero children and still reports success; a blank path on an object record fails with `oneToMany_error`.

Three consequences worth knowing before you debug the wrong thing:

- **The build-time preview warning is expected.** Previewing a fanned-out lookup in isolation reports "`<field>` not defined in the model" because no upstream record is bound, as for any lookup that reads the record ([Lookup export vs separate scheduled export](#lookup-export-vs-separate-scheduled-export)). That is not a broken template -- don't "fix" a correct `{{record.X}}` reference because of it.
- **Response mapping merges per element automatically.** To get looked-up values back onto each element, author a normal top-level `fields` response mapping; Celigo merges each result into its corresponding fanned-out element.
- **Two anti-patterns.** Don't target the array with a `lists` entry (that nests a new array inside each element), and don't attempt the per-element merge in `postResponseMap` (it sees the page of parent records, not per-element results).

### Grouped records -- one record, many rows

Grouping runs after parsing and before the transform, and turns the rows that share a key into one record:

- **NetSuite saved searches** group with Group rows (`netsuite.skipGrouping` false or omitted), keyed on the internal id, so sort the search by Internal ID. `groupByFields` is refused on a NetSuite export (`[invalid_config] netsuite connection is not supported for groupByFields property`), and an ad-hoc search needs `skipGrouping: true`.
- **Every other source** uses `groupByFields`, which merges only adjacent rows with equal values, so return same-key rows together: the query's `ORDER BY`, or `file.sortByFields` on a file export (it's ignored on HTTP and database exports). `pageSize` then counts groups, not rows.
- **The group is a bare array of rows**, not an object: `rows` in Handlebars (`{{rows.0.<field>}}`, `{{#each rows}}`), `$[0].<field>` and `$[*].<field>` in Mapper 2.0 and Transformation 2.0 (`$.<field>` resolves nothing), and an array in hooks. A document preview shows it as a `group` stage after `parse`. A one-to-many step over it leaves `pathToMany` blank.
- **A webhook listener** makes one record of each element of a top-level JSON array and one record of an object (unless `webhook.pathToRecords` names an inner array), then pages each request's records at `pageSize` (default 20) before any hook or grouping runs. `groupByFields` there merges only adjacent rows within a page, so keep one request's rows together by having the sender post an object, or by raising `pageSize` above the largest request.

### Source-side transform vs destination-side mapping

Both reshape data, but in opposite directions:

- A **transform** on a source export reshapes records as they enter the flow -- flattening nested responses, or aligning multiple sources to a common shape (see [Export Execution Pipeline](#export-execution-pipeline)).
- A **mapping** on a downstream import reshapes records as they leave the flow toward a destination.

Don't add a transform to "match a destination" -- that's the destination import mapping's job. Transforms are for entry reshaping; mappings are for exit reshaping.

### Async APIs (submit, poll, fetch)

Most APIs return data in the same call and need none of this. Some APIs only *acknowledge* a request (an HTTP 202, a job ticket, a feed or document id) and process it in the background -- Amazon SP-API feeds, large report generators, bulk extract and file-conversion jobs. For those, attach an **async helper** to the export via `http._asyncHelperId`. The helper is its own resource (`/v1/asynchelpers`, `celigo async-helpers`) that teaches the step the submit-poll-fetch pattern and does nothing until a step points at it. It bundles three pieces:

1. **A status export** (required) -- run on each poll to ask "is it done yet?". Configure the **status path** to read in the response, the case-sensitive **in-progress / done / done-without-data / error** value lists (taken from the API's docs), and the **initial wait** and **poll wait** intervals in minutes.
2. **A result export** (optional, usually present) -- fetches the final payload once status reports done.
3. **Initial-submission handling** -- where to find the job ticket in the first acknowledgement: "same as status" when the acknowledgement is itself shaped like a status response, otherwise a resource path (plus transform rules for non-JSON acknowledgements, e.g. Amazon's XML).

Two constraints shape the design: the status and result exports must be ordinary synchronous exports (an async helper cannot nest another), and the async-configured step **cannot carry its own transform, output filter, or preSavePage hook** -- put any reshaping or filtering on the dedicated result export instead. The same pattern applies symmetrically to imports writing to asynchronous destinations (`_asyncHelperId` on the import).

Build it bottom-up: the status export (and result export) first, then the helper that names them (`http.status._exportId`, `http.result._exportId`; `celigo async-helpers create`), then `http._asyncHelperId` on the step. A helper's delete is refused while any step still references it (`celigo async-helpers dependencies <id>` lists them), and clearing a step's reference leaves the helper and its exports in place.

Reach for an async helper only when the API genuinely forces the fire-and-check-back shape. Adding one to a synchronous API is pure overhead -- extra polling plus a status and result export to maintain.

### GraphQL APIs -- envelope, cursor paging, errors with HTTP 200

A GraphQL export is an ordinary `HTTPExport`: `http.method: "POST"` and an `http.body` holding the JSON envelope `{"query", "operationName", "variables"}`, with `http.formType: "graph_ql"` (or `assistant_graphql`, the connector-assisted GraphQL form). The form type is set on the step, and a step that carries it works on a plain `http` connection too; a `graph_ql` connection only adds the editor toggle in the UI ([configuring-connections > Connection Types](../configuring-connections/SKILL.md#connection-types)).

- **The form type changes the request.** Under `graph_ql` or `assistant_graphql`, a `variables` value stored as a JSON string is parsed and sent as an object; under `http` it goes out as a string, not the object a GraphQL request carries. Keep the GraphQL form type on any step whose `variables` is a string.
- **Handlebars in `variables`.** The body renders as one template and is then parsed as JSON. When every expression sits inside a string value, store `variables` as an object. An unquoted expression -- a number, `null`, a `{{#if}}` block -- needs `variables` as a JSON string, which also keeps the body parseable at rest (otherwise the editor shows every field empty): `"variables": "{\"first\": 50, \"after\": {{#if export.http.paging.token}}\"{{export.http.paging.token}}\"{{else}}null{{/if}} }"`. A lookup's record values inside such a string: [configuring-imports > GraphQL imports](../configuring-imports/SKILL.md#graphql-imports).
- **Cursor paging.** `http.paging.method: "token"`, `paging.path` at the cursor (`data.orders.pageInfo.endCursor`, `pathLocation: "body"`), the token in `variables` as above so the first page sends `null`, and `http.response.resourcePath` at the records (`data.orders.edges`). Paging stops when the cursor comes back empty or null. `lastPagePath` and `lastPageValues` (`data.orders.pageInfo.hasNextPage`, `["false"]`) stop token paging only together with `lastPageStatusCode: 200`; without it the export sends one more request with the last cursor.
- **Errors come back as HTTP 200.** A GraphQL server usually reports a failed query with 200, an `errors` array and `data: null`, which the export reads as success: zero records, no error. Set `http.response.failPath` and `errorPath` to `errors[0].message` to fail the run with the server's message. `failPath: "errors"` catches a response with exactly one error and lets two or more through.
- **Connector GraphQL APIs.** A connector flags GraphQL with `isGraphQL`, on the connector or on one of its `apis[]` (`celigo http-connectors get <id>`). Bind the connection to that API (`http._httpConnectorApiId`) and its base URI is the GraphQL endpoint. A connector doesn't necessarily preset a fail path, so read the step's `http.response` back and add one.
- **The endpoint belongs to the connection.** The GraphQL editor owns `http.relativeURI`: it shows no field for it and rewrites it whenever the export is saved there, so the GraphQL endpoint must be the connection's base URI -- a `graph_ql` connection whose base URI is the endpoint, or a connector connection bound to the connector's GraphQL API. When the connection's base URI stops at an API root, move the export to a connection that supplies the GraphQL endpoint instead of patching `relativeURI`.

## CLI Commands

```bash
# CRUD
celigo exports list
celigo exports get <id>
celigo exports create < export.json
celigo exports update <id> < export.json
celigo exports set <id> key=value [key2=value2 ...]
celigo exports delete <id>

# Invoke: with <id>, run the saved export against the live source (no job, nothing saved);
# with a piped document, preview it stage by stage -- parse, transform, output filter, preSavePage --
# returning only the first record unless the document sets test.limit
celigo exports invoke [id] [--all]
# Run the saved export (or a piped document) through another connection: records only, {data, dataURIs}
celigo exports invoke [id] --connection <connectionId>

# Clone and connection management
echo '{"connectionMap":{"oldConnId":"newConnId"}}' | celigo exports clone <id>
celigo exports replace-connection <id> <newConnectionId>

# CDC listener: reset the stream position (refused for snapshotMode initial_only
# unless --snapshot-mode changes the mode in the same save)
celigo exports reset-cursor <id> [--snapshot-mode when_needed]

# Discovery
celigo account search "<keyword>"
celigo templates marketplace
celigo templates preview <id> --model Export
celigo templates preview <id> --summary
celigo http-connectors list
celigo http-connectors catalog <id> --resource-type export --published-only
celigo http-connectors endpoint-detail <id> --resource-type export --resource-id <rid> --endpoint-id <epid>
celigo tp-connectors list
celigo metadata types <connectionId>
celigo metadata fields <connectionId> <entityType>

# Debug
celigo exports enable-debug <id> [--duration <minutes>]
celigo exports disable-debug <id>
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating an export, verify:

- [ ] **`adaptorType` is exact** -- case-sensitive, matches the [Adaptor Decision Matrix](#adaptor-decision-matrix) (e.g., `HTTPExport`, not `httpExport` or `HttpExport`)
- [ ] **Pre-built connector was checked** -- for HTTP exports, `celigo http-connectors list` found no connector for the app (or the connector lacks the endpoint) before any hand-written `relativeURI`
- [ ] **`_connectionId` is valid** -- points to an existing, online connection of the correct type. Not needed for `WebhookExport` or `SimpleExport`, and never set on `TopicExport`
- [ ] **Listener `type` is set** -- `type: "webhook"` for `WebhookExport` (422 without it), `type: "distributed"` for NetSuite and Salesforce listeners, `type: "stream"` for CDC and topic listeners (a topic listener saved without it runs as a batch export), and the flow is created disabled, then enabled
- [ ] **Adaptor config block is present** -- `http{}`, `netsuite{}`, `ftp{}`, etc. matches the `adaptorType`
- [ ] **`resourcePath` or query is correct** -- wrong path silently returns 0 records with no error
- [ ] **Pagination is configured** -- for HTTP exports, set `http.paging` if the API returns paginated results
- [ ] **Delta is configured for the adaptor** -- `type: "delta"` is set (with no `type`, the delta variables render empty); HTTP and SQL: `{{lastExportDateTime}}` (not `{{currentExportDateTime}}`) as the lower bound in the request, and no `delta.dateField` on HTTP; application adaptors: `delta.dateField`. `delta.startDate` is set, or the first run exports nothing
- [ ] **File parsing matches the format** -- if file-based, `file.type` matches the actual file format (csv, json, xml, xlsx, edi)
- [ ] **Files that must stay are kept** -- a file export deletes each file it processed unless `file.skipDelete` is `true`; `backupDirectoryPath` moves them away instead
- [ ] **A webhook secret is real** -- a generated value of 32+ random characters handed to the user, never a placeholder, with the listener URL `https://<api host>/v1/exports/<exportId>/data`
- [ ] **`mockOutput` format is correct** -- `{ "page_of_records": [{ "record": {...} }] }`, not a plain array
- [ ] **No `rest:` block** -- `rest:` creates a legacy RESTExport. Use only `http:` for new exports
- [ ] **Output filter syntax is valid** -- if using an output filter expression, test it against sample data
- [ ] **Lookup config is complete** -- if `isLookup: true`, ensure response mapping is planned for the flow's `pageProcessors[]` entry, and decide what a lookup that finds nothing, or more than one match, should do

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT; `celigo exports set` does this for every field except `assistantMetadata` and `debugUntil`, which it PATCHes. The export PATCH route accepts only those two paths, so every other change -- a URI, a filter, a delimiter -- is a full update. One read hides data: an `HTTPExport` saved with an empty `http.relativeURI` and no `http.body` reads back with no `http` block, although the platform still stores and runs it. Don't build an update from that read (`exports set` included) -- it erases the stored request -- so send the complete `http` block yourself. An empty relative URI calls the connection's base URI exactly; `"/"` adds a trailing slash, which is a different URL.
2. **Including a `rest:` block creates a legacy RESTExport.** Use only `http:` for new exports.
3. **Wrong `resourcePath` produces 0 records with no error.** First thing to check when an export succeeds but returns nothing.
4. **`mockOutput` format is `{ "page_of_records": [{ "record": {...} }] }`.** Not a plain array.
5. **HTTP delta exports use Handlebars** (`{{lastExportDateTime}}` in `relativeURI` -- double braces, which URL-encode the value), not `delta.dateField`, which an HTTP export refuses with 422 "Unsupported dateField in export.delta.dateField". The `delta` object is optional there, but `type: "delta"` isn't -- with no `type` the token renders empty on every run -- and set `delta.startDate`: without it the first run's window is empty. See [Delta windows and the checkpoint](#delta-windows-and-the-checkpoint).
6. **A NetSuite RESTlet export runs a saved search or an ad-hoc one.** A saved search goes in `netsuite.restlet.searchId` (its internal or script id; `celigo metadata types <connectionId>` lists them). An ad-hoc search sets `searchId: "-1"` with `recordType`, `criteria` and `columns`, plus `netsuite.skipGrouping: true` (without it the run fails with `[search_not_sorted]`). Criteria rows are always ANDed, so put OR logic in one `formulanumeric` criterion; inside criteria the incoming record is the Handlebars root (`{{poNumber}}`, not `{{record.poNumber}}`).
7. **File exports require the `file{}` block.** Without it, file-based exports return raw bytes instead of parsed records.
8. **A webhook export needs `type: "webhook"`, not a connection.** Without the type, the save is refused with 422 "_connectionId is required unless type is [webhook|simple]". A `_connectionId` on a webhook export is harmless: it saves and updates without error.
9. **Listeners need `type: "distributed"` at the top level and on the adaptor block** (`netsuite.type` or `salesforce.type`), plus the adaptor's `distributed` object. Nothing is set on the connection; check the SuiteApp/bundle or Salesforce package with `celigo connections ping --distributed <connectionId>`.
10. **`type: "once"` needs a dedicated, writeable tracking flag.** `once.booleanField` must be writeable by the export's connection, and no other process may update the same field -- a shared flag causes records to be skipped.
11. **An async-helper export cannot carry its own transform, output filter, or preSavePage hook.** Build that processing into the helper's result export instead. The status and result exports must themselves be plain synchronous exports -- an async helper cannot nest another. See [Async APIs (submit, poll, fetch)](#async-apis-submit-poll-fetch).
12. **NetSuite REST exports need `adaptorType: "NetSuiteHTTPExport"` and `nsDomainType` sent explicitly.** On a NetSuite connection the server otherwise infers `NetSuiteExport` and rejects the document (422 "netsuite subschema not defined"). `http.relativeURI` carries the full path starting at `/services/rest/...`, and the account needs NetSuite's REST Web Services feature (403 `FEATURE_DISABLED` otherwise -- fall back to a saved search). The record list endpoint returns only ids and links; for records with fields use SuiteQL: `POST /services/rest/query/v1/suiteql?limit=<n>&offset={{{export.http.paging.skip}}}` with header `Prefer: transient`, body `{"q": "<SuiteQL>"}`, `http.paging.method: "skip"` and `http.response.resourcePath: "items"`. SuiteQL columns are the Records Catalog's lowercase names (`entityid`, `lastmodifieddate`). Don't convert an existing `NetSuiteExport` to REST unless asked.
13. **A document preview runs the export's whole pipeline.** `exports invoke` with a piped document (`POST /v1/exports/preview`) applies the transform, the output filter and the preSavePage hook, in that order, each as a stage after `parse`: `transformTwoDotZero` (`transform` for version 1 rules), `outputFilter`, where each record it drops carries `isIgnored: true`, and `preSavePageHook`, which receives only the records the filter passed. Top-level `data` is what the last of them returned. A preview body that still carries `mockOutput`, as a document read from the API does, returns that snapshot as a single `parse` stage instead of calling the source: remove `mockOutput` to read live, or invoke the saved export by id, which reads live.
14. **A NetSuite listener fires only for the saves it's scoped to.** `netsuite.distributed.executionContext` defaults to `userinterface` and `webstore`, and `executionType` to `create`, `edit` and `xedit` (inline edit). Records a Celigo NetSuite import writes arrive in the `restlet` context: list it to catch them, leave it out to ignore them. Bulk contexts such as `csvimport` and `custommassupdate` turn each record of a mass update into its own event, so add them only when asked.
15. **A NetSuite listener sends body fields only**, plus the sublists named in `netsuite.distributed.sublists` (each one an extra query inside every save); `forceReload` adds fields NetSuite fills after the save, such as new line ids. Its `qualifier` rules nest in pairs (`[A, "and", [B, "and", C]]`) and can't use sublist fields. To stop a two-way sync from looping, have the write-back import check the listener's `skipExportFieldId` checkbox in the same save: the listener skips that save and clears the box. A scheduled export has no such field, so exclude the writer's own saves in its criteria instead.
16. **A Salesforce listener with a `qualifier` receives no delete events.** The package runs the qualifier as a query against the live record, which a delete removed. Leave it unset when deletes must reach the flow, and drop unwanted events with the output filter.
17. **XML sources need `listNodes` for repeating elements.** With custom parsing (`parsers[].rules.V0_json: false`), an element that occurs once parses as an object and more than once as an array, so list every element that can repeat in `listNodes`, as its full path from the record element. An empty element parses to `{}`, which renders `[object Object]` and passes `{{#if}}`.
18. **A document preview reads one record and no delta window.** Without `test.limit` in the document, `exports invoke` with a document returns only the first record (`pageSize` doesn't change that), while invoking the saved export by id returns them all. A delta export's `{{lastExportDateTime}}` and `{{currentExportDateTime}}` render empty in a document preview unless the document carries both in `postData` (`{"lastExportDateTime": "2026-01-15T00:00:00.000Z", "currentExportDateTime": "2026-01-16T00:00:00.000Z"}`), which then render as given. A blob export's preview calls the source for real and returns a usable `{blobKey, fileMeta}`.
19. **A NetSuite RESTlet export stopped by NetSuite's per-call limit needs a smaller `netsuite.restlet.batchSize`.** Each RESTlet call reads `batchSize` records (default 1000), and NetSuite stops any single RESTlet execution that runs past 300 seconds (`SSS_TIME_LIMIT_EXCEEDED`) or 5,000 usage units (`SSS_USAGE_LIMIT_EXCEEDED`). A saved search that grew in NetSuite -- more rows, or added columns and formulas -- can push a call over, and the run fails partway with nothing changed in Celigo. Lower `restlet.batchSize` in a full update of the export (gotcha 1): halving it halves the rows every call reads. In a flow run the export's `pageSize` doesn't size the call; it pages records to the next step. Changing the export's columns isn't the fix either: on a saved-search export, `restlet.columns` adds columns after the search's own and never removes one, so every call does more work. If small batches still fail, the search's owner simplifies the search itself in NetSuite.

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `404 Not Found` on export invoke | Wrong `relativeURI` or `resourcePath` | Verify the endpoint path against the API docs; check for missing path parameters |
| `401 Unauthorized` | Connection credentials expired or invalid | Run `celigo connections ping <connId>`; re-authorize OAuth connections |
| `0 records exported` (no error) | Wrong `resourcePath`, an overly restrictive filter, or an empty delta window: `{{currentExportDateTime}}` used as the lower bound, or a first run without `delta.startDate`. On a GraphQL export, also an `errors` answer with HTTP 200. On a file export, also no file in the folder (`ftp.directoryPath`) that passes the name filters (`fileNameStartsWith`/`fileNameEndsWith` or `file.filter`): files that don't match are skipped before download, silently | Compare a file export's folder and name filters with where and how the files actually land (an EDI profile or file definition doesn't set them). Check `resourcePath` and the delta token ([Delta windows and the checkpoint](#delta-windows-and-the-checkpoint)), test without output filter. Empty runs don't move the checkpoint, so once fixed, the next run catches up without a backfill. GraphQL: read a preview's `raw` stage, and set `failPath` ([GraphQL APIs](#graphql-apis----envelope-cursor-paging-errors-with-http-200)) |
| 422 "Unsupported dateField in export.delta.dateField" | `delta.dateField` on an HTTP export | Remove it; put `{{lastExportDateTime}}` in the request |
| 422 "_connectionId is required unless type is [webhook\|simple]" | A `WebhookExport` saved without `type: "webhook"` | Add `type: "webhook"` |
| Webhook deliveries get 403 `unable_to_run_flows` | Every flow the listener feeds is disabled or not fully configured | Enable the flow. Refused deliveries weren't queued, so the sender has to resend them |
| Webhook deliveries get 401 | The signature or token doesn't match: wrong `key`, `algorithm`, `encoding` or `header`, or a prefix such as `sha256=` in the header | Configure the sender's exact scheme; a `custom` provider compares the bare digest as sent |
| `Cannot read property of undefined` in preSavePage | Script assumes a field exists that is missing from some records | Add null checks: `if (record.field)` before access |
| `mockOutput is invalid` | Wrong format -- used array instead of object | Use `{ "page_of_records": [{ "record": {...} }] }` |
| `handlebars_template_parse_error` ("... not defined in the model") previewing a lookup | A standalone preview binds no record, so a request that reads the record can't render | Not a broken template: check the lookup in the flow builder's step preview or a flow test run |
| `Invalid adaptorType` | Case mismatch or typo | Use exact casing from the Adaptor Decision Matrix |
| `Connection is offline` | Connection failed health check | Fix credentials, re-authorize, then `celigo connections ping <id>` |
| `Rate limit exceeded` / `429` | The source API's rate limit was exceeded | With auto-recover on (the default), the connection throttles and retries by itself; to cap it, lower the connection's `targetConcurrencyLevel` (`concurrencyLevel` is platform-managed while auto-recover is on). If the API signals limits another way (another status code or a body field), set the connection's `http.rateLimit`. See [configuring-connections > Auto-recover rate-limit errors](../configuring-connections/SKILL.md#auto-recover-rate-limit-errors) |
| `Timeout` on large exports | Query returns too much data or API is slow | Add pagination, narrow the date range, or increase timeout settings |
| `SSS_TIME_LIMIT_EXCEEDED` or `SSS_USAGE_LIMIT_EXCEEDED` on a NetSuite RESTlet export, partway through a run | One RESTlet call ran past NetSuite's per-call time or usage limit; each call reads `netsuite.restlet.batchSize` records (default 1000) | Lower `netsuite.restlet.batchSize` -- not `pageSize`, and not `restlet.columns`, which adds to a saved search's columns ([gotcha 19](#gotchas)) |
| `File parsing error` | `file.type` doesn't match actual file format, or delimiter/encoding mismatch | Verify `file.type`, check `file.csv.columnDelimiter`, ensure correct encoding |
| Every record of a CSV file fails downstream on missing fields; each parsed record has one field named after the whole header line (`{"order_id;sku;qty": "1001;TEE-M;2"}`) | The file's column delimiter changed, so the parser no longer splits the columns | Read one error's retry data: the field name shows the file's delimiter. Set `file.csv.columnDelimiter` to it. Retrying won't help: the errors' retry data holds the mis-parsed records. Reprocess the file instead -- the export removes what it read unless `file.skipDelete` is set, so the file has to be dropped in the folder again before the flow runs -- or correct each error's retry data before retrying |
| "Directory is not found" | `http.type: "file"` on a file-storage connector (folder mode) with an API URL in `relativeURI` | Put the folder path in `relativeURI`; to fetch one file per record from an API, use a blob lookup without `http.type: "file"` |
| Preview returns `{}`, or only `request` and `raw` stages (no `parse`, no `data`) | Zero records: nothing matched, or `resourcePath` points at nothing -- an HTTP preview looks the same either way | Not a failed preview. Read the `raw` stage to see where the records really are; a NetSuite search that matches nothing returns `{}` |
| 400 "Virtual exports for export type: webhook are not supported." | A document preview of a webhook listener (a NetSuite listener can't be previewed either) | Listeners can't be previewed: test one with a real event, or save a `mockOutput` on it for flow test runs to replay |
| 422 from a document preview whose message is the source's own error body, such as `{"errors":[{"code":"resource_not_found",...}]}` | The source system answered the request with an error | Fix the URI, credentials or permissions at the source. A 422 that names a setting, such as `Invalid operation: isnotempty.`, is the platform refusing the document instead: the preview runs the output filter, so a rule it refuses, or a value an `epochtime` rule can't read, fails the whole preview. The CLI prefixes every 422 with "Validation error:" |
| `page_response_error` "Identical response received from next page request. No more page requests will be made." | A next page's response matched the previous one: the request doesn't change between pages (no paging variable in the URI or body), or the API repeats its last page | Reference `{{export.http.paging.page}}` (or `.skip`, `.token`) in the request, or add `lastPagePath` with `lastPageValues`, or `lastPageStatusCode`. The run completes with the pages already read, so the rest was never exported |
| Records changed just before a run are sometimes missing from a delta export | The source makes changes visible with a delay (indexing, replication), after the window that should have held them closed | Set `delta.lagOffset`, milliseconds subtracted from the window's start, as low as covers the delay; larger values re-read more records |
| Every call to a builder-mode API fails with 400 `api_pagination_source_not_paged` | The API's first lookup, which drives its pagination, lost `http.paging` (the export save accepts that) | Restore the lookup's paging, or turn off the API's `pagination.enabled`. Saving that export, even unchanged, also invalidates the cursors callers already hold |
