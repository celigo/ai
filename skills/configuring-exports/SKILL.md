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
- **preSavePage hook** -- JavaScript processing on the full page of records before they enter the pipeline
- **One-to-many** -- when used as a lookup, fan out child records from a parent. Set `oneToMany: true` and `pathToMany` to the child array path so each child triggers a separate lookup
- **Response mapping** -- when used as a lookup, extract fields from the lookup response back into the record. Configured on the flow's `pageProcessors[]` entry, but planned when building the lookup export. The response contains a `data` array and an `errors` array. Use `data[0].fieldName` when you expect a single result (e.g., fetching one order by ID); use `data[*].fieldName` when multiple results are expected. Response mapping uses Transformation 1.0 syntax (extract/generate pairs), not the newer expression-based transforms
- **postResponseMap hook** -- JavaScript processing after response mapping merges the lookup response back into the record. Configured on the flow's `pageProcessors[]` entry, but planned when building the lookup export

## Export Execution Pipeline

When a flow runs, each export executes this pipeline in strict order:

1. **API request / query / file read** -- fetches raw data from the external system
2. **Response parsing** -- `resourcePath` extracts the record array from the response body or file (e.g., `http.response.resourcePath` for HTTP, `file.json.resourcePath` for JSON files, XPath for XML)
3. **Transformation** (optional) -- `transform` reshapes individual records after extraction (Transformation 2.0)
4. **Output filter** (optional) -- discards records that don't match filter expression rules
5. **preSavePage hook** (optional) -- JavaScript processing on the full page of records

**Key distinction:** `resourcePath` tells the export WHERE to find records in the response. Transforms reshape WHAT each record looks like after extraction. When a user says "extract records from X" or "treat each X as a separate record", that's almost always a `resourcePath` change, not a transform. Use transforms when you need to flatten nested objects, rename fields, or restructure individual records.

## Three Categories of Export

Not all exports work the same way. Before building, understand which category you need:

### Listeners

Receive data pushed to Celigo from an external system. No polling, no scheduling -- the source system sends data when events happen.

- `WebhookExport` -- inbound HTTP listener (no connection required)
- `AS2Export` -- AS2 EDI file reception
- Distributed exports (`type: "distributed"`) -- real-time event-driven push for NetSuite (via SuiteScript) and Salesforce (via streaming API). The platform installs listeners in the source system that fire when records change.
- Change data capture (`type: "stream"`) -- MongoDB change streams that tail the oplog for real-time record changes.

**When to use:** The source system supports outbound webhooks, push notifications, or change data capture and you want real-time processing.

### File Transfers

Read files from a remote location, then either parse them into records or transfer them as blobs.

- `FTPExport` / `S3Export` / `FileSystemExport` -- fetch files from FTP/SFTP, S3, or local filesystem
- `HTTPExport` with `http.type: "file"` -- fetch files over HTTP from cloud storage APIs (Google Drive, Box, Dropbox, Azure Blob Storage). The HTTP connector handles auth; the `file{}` config handles parsing.
- `NetSuiteExport` with `netsuite.type: "file"` -- fetch and parse files (CSV, JSON, XLSX, XML, EDI) from the NetSuite file cabinet
- Parsed mode (`file.output: "records"`) -- CSV, XML, JSON, XLSX, EDI files are parsed into individual records
- Blob mode (`type: "blob"`) -- binary files transferred as-is without parsing. Supported on HTTPExport, NetSuiteExport, SalesforceExport, FTPExport, and S3Export.

**When to use:** The source system drops files (CSV, EDI, XML, etc.) into a directory, bucket, file cabinet, or cloud storage rather than exposing a record-based API.

### Record-Based Exports

Actively fetch batches of records from an API or database on a schedule.

- `HTTPExport` -- REST/GraphQL APIs
- `NetSuiteExport` -- saved searches, restlets, SuiteQL
- `SalesforceExport` -- SOQL/Bulk queries
- `RDBMSExport` -- SQL SELECT queries
- `MongodbExport`, `JDBCExport`, `DynamodbExport` -- other databases
- `WrapperExport` -- custom stack (Walmart, BigCommerce)

**When to use:** You need to poll an API or query a database for records on a schedule (full fetch or delta/incremental).

## Quick Reference

### Adaptor Decision Matrix

| Your data comes from... | Use adaptorType | Category | Read schema |
|---|---|---|---|
| REST or GraphQL API | `HTTPExport` | Record-based | [http.yml](references/schemas/http.yml) |
| Files over HTTP (Google Drive, Box, Dropbox, Azure Blob) | `HTTPExport` with `http.type: "file"` | File transfer | [http.yml](references/schemas/http.yml) + [file.yml](references/schemas/file.yml) |
| NetSuite (any method) | `NetSuiteExport` | Record-based | [netsuite.yml](references/schemas/netsuite.yml) |
| Salesforce objects | `SalesforceExport` | Record-based | [salesforce.yml](references/schemas/salesforce.yml) |
| SQL database | `RDBMSExport` | Record-based | [rdbms.yml](references/schemas/rdbms.yml) |
| MongoDB | `MongodbExport` | Record-based | [mongodb.yml](references/schemas/mongodb.yml) |
| JDBC database | `JDBCExport` | Record-based | [jdbc.yml](references/schemas/jdbc.yml) |
| DynamoDB | `DynamodbExport` | Record-based | [dynamodb.yml](references/schemas/dynamodb.yml) |
| Files on FTP/SFTP | `FTPExport` | File transfer | [ftp.yml](references/schemas/ftp.yml) + [file.yml](references/schemas/file.yml) |
| Files on S3 | `S3Export` | File transfer | [s3.yml](references/schemas/s3.yml) + [file.yml](references/schemas/file.yml) |
| Webhooks / push events | `WebhookExport` | Listener | [webhook.yml](references/schemas/webhook.yml) |
| AS2 EDI messages | `AS2Export` | Listener | [as2.yml](references/schemas/as2.yml) |
| Manual file upload | `SimpleExport` | File transfer | [simple.yml](references/schemas/simple.yml) |
| Local filesystem | `FileSystemExport` | File transfer | [filesystem.yml](references/schemas/filesystem.yml) + [file.yml](references/schemas/file.yml) |
| Pre-built stack connector | `WrapperExport` | Record-based | [wrapper.yml](references/schemas/wrapper.yml) |

`adaptorType` is **case-sensitive**: `HTTPExport`, not `httpExport`.

### Minimum Required Fields

Every export needs at minimum:

- `name` -- human-readable label
- `adaptorType` -- from the matrix above
- `_connectionId` -- except `WebhookExport` and `SimpleExport`
- Adaptor config block -- `http{}`, `netsuite{}`, `ftp{}`, `salesforce{}`, `rdbms{}`, etc.

### Which Schemas to Read

1. **Always:** [request.yml](references/schemas/request.yml) (base fields for all exports)
2. **Plus:** the adaptor-specific file from the matrix above (e.g., `http.yml` for HTTPExport)
3. **If file-based:** also [file.yml](references/schemas/file.yml) (CSV, XML, JSON, XLSX, EDI parsing config)
4. **If delta/incremental:** check [delta.yml](references/schemas/delta.yml) or Handlebars URI pattern (`{{{lastExportDateTime}}}`)
5. **If cloning:** [clone-request.yml](references/schemas/clone-request.yml), [clone-response.yml](references/schemas/clone-response.yml)

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Base fields (all exports):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **Adaptor-specific config:**
  - [http.yml](references/schemas/http.yml) -- HTTP/REST/GraphQL
  - [netsuite.yml](references/schemas/netsuite.yml) -- NetSuite (restlet, saved search, SuiteQL, file cabinet)
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
- **Operational modes:** [delta.yml](references/schemas/delta.yml), [webhook.yml](references/schemas/webhook.yml), [distributed.yml](references/schemas/distributed.yml), [once.yml](references/schemas/once.yml)
- **Mock output:** [mock-output.yml](references/schemas/mock-output.yml)
- **Clone:** [clone-request.yml](references/schemas/clone-request.yml), [clone-response.yml](references/schemas/clone-response.yml)

## Related Skills

- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connection types, auth methods, iClients
- [writing-mappings > Transformation 2.0](../writing-mappings/SKILL.md#transformation-20-workflow) -- reshape export output before mapping
- [writing-scripts > Data Pipeline Hooks](../writing-scripts/SKILL.md#data-pipeline-hooks) -- preSavePage, postResponseMap hooks
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- dynamic values in URIs, filters, delta tokens
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring exports into flows
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
celigo account deps export <id>

# Find orphaned exports not referenced by any flow
celigo account lint

# Check if a similar export already exists in the account
celigo exports list | grep -i "<application-name>"

# Search the marketplace for pre-built integration templates
celigo templates search "<application-name>"

# Preview a template to see its export configuration
celigo templates preview <id> --model Export
celigo templates preview <id> --summary
```

The account index auto-refreshes when stale (>4 hours). Force a fresh snapshot with `celigo account snapshot`.

Existing exports in the account are the best reference -- they show proven patterns for that specific customer's setup. Marketplace templates may provide a complete pre-built integration you can install rather than building from scratch.

### 3. Check for a pre-built connector

Celigo maintains 550+ HTTP connector definitions and 590+ trading partner connectors. These provide pre-configured auth, base URLs, and endpoint definitions for common applications. Connectors are set on the **connection**, not the export -- but they determine what the export can do.

```bash
# Search HTTP connectors (REST APIs: Shopify, Stripe, HubSpot, etc.)
celigo http-connectors search "<application-name>"
celigo http-connectors get <id> --full    # see endpoints, resources, auth config

# Search trading partner connectors (EDI, AS2, VAN)
celigo tp-connectors search "<application-name>"
```

If an HTTP connector exists for your target app, use it when creating the connection (`_httpConnectorId` on the connection). The export can then reference a specific endpoint from that connector via `http._httpConnectorEndpointId` and `http._httpConnectorVersionId`.

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

This tells you what data is available to export before you write any configuration.

- **NetSuite:** `metadata types` returns both record types and saved searches (with IDs you need for `netsuite.restlet.searchId`). `metadata fields` returns field IDs, names, types, and group — including sublist fields you'll need for `mapping.lists[].generate` on the import side.
- **Salesforce:** `metadata types` returns sObjects with queryable/createable flags. `metadata fields` returns fields, types, and relationship names — use these to discover child objects for `distributed.relatedLists[]` and relationship field names for cross-object queries.
- **RDBMS:** `metadata types` returns table names. `metadata fields` returns column names and types for a given table — use these when writing SQL queries or building field mappings.

### 5. Determine the category

Is this a **listener** (real-time push from the source), a **file transfer** (fetch and parse/transfer files), or a **record-based export** (poll an API or query a database)? This narrows which adaptor types and modes apply.

### 6. Choose the right adaptor type

Use the [Adaptor Decision Matrix](#adaptor-decision-matrix) in Quick Reference above to select the correct `adaptorType` for your target system.

### 7. Build the export JSON

Use the [Schema Index](#schema-index) and [Which Schemas to Read](#which-schemas-to-read) in Quick Reference above. Read `request.yml` for base fields, then the adaptor-specific schema, plus `file.yml` if file-based and `delta.yml` if incremental.

## CLI Commands

```bash
# CRUD
celigo exports list
celigo exports get <id>
celigo exports create < export.json
celigo exports update <id> < export.json
celigo exports set <id> key=value [key2=value2 ...]
celigo exports delete <id>

# Invoke (test-run an export, see what data comes back)
celigo exports invoke [id] [--all]

# Clone and connection management
echo '{"connectionMap":{"oldConnId":"newConnId"}}' | celigo exports clone <id>
celigo exports replace-connection <id> <newConnectionId>

# Discovery
celigo account search "<keyword>"
celigo templates search "<name>"
celigo templates preview <id> --model Export
celigo templates preview <id> --summary
celigo http-connectors search "<name>"
celigo tp-connectors search "<name>"
celigo metadata types <connectionId>
celigo metadata fields <connectionId> <entityType>

# Debug
celigo exports debug-enable <id> [--duration <minutes>]
celigo exports debug-disable <id>
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating an export, verify:

- [ ] **`adaptorType` is exact** -- case-sensitive, matches the [Adaptor Decision Matrix](#adaptor-decision-matrix) (e.g., `HTTPExport`, not `httpExport` or `HttpExport`)
- [ ] **`_connectionId` is valid** -- points to an existing, online connection of the correct type. Not needed for `WebhookExport` or `SimpleExport`
- [ ] **Adaptor config block is present** -- `http{}`, `netsuite{}`, `ftp{}`, etc. matches the `adaptorType`
- [ ] **`resourcePath` or query is correct** -- wrong path silently returns 0 records with no error
- [ ] **Pagination is configured** -- for HTTP exports, set `http.paging` if the API returns paginated results
- [ ] **Delta/incremental is configured** -- if using delta, check `delta.dateField` or Handlebars `{{{lastExportDateTime}}}` in the URI
- [ ] **File parsing matches the format** -- if file-based, `file.type` matches the actual file format (csv, json, xml, xlsx, edi)
- [ ] **`mockOutput` format is correct** -- `{ "page_of_records": [{ "record": {...} }] }`, not a plain array
- [ ] **No `rest:` block** -- `rest:` creates a legacy RESTExport. Use only `http:` for new exports
- [ ] **Output filter syntax is valid** -- if using an output filter expression, test it against sample data
- [ ] **Lookup config is complete** -- if `isLookup: true`, ensure response mapping is planned for the flow's `pageProcessors[]` entry

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this.
2. **Including a `rest:` block creates a legacy RESTExport.** Use only `http:` for new exports.
3. **Wrong `resourcePath` produces 0 records with no error.** First thing to check when an export succeeds but returns nothing.
4. **`mockOutput` format is `{ "page_of_records": [{ "record": {...} }] }`.** Not a plain array.
5. **HTTP delta exports use Handlebars** (`{{{lastExportDateTime}}}` in `relativeURI`), not `delta.dateField`.
6. **NetSuite saved searches need `netsuite.restlet.searchId`.** Use `celigo metadata types <connectionId>` to find the search ID.
7. **File exports require the `file{}` block.** Without it, file-based exports return raw bytes instead of parsed records.
8. **Webhook exports have no `_connectionId`.** Setting one causes validation errors.
9. **Distributed exports require `type: "distributed"` on the export AND `distributed: true` on the connection.**

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `404 Not Found` on export invoke | Wrong `relativeURI` or `resourcePath` | Verify the endpoint path against the API docs; check for missing path parameters |
| `401 Unauthorized` | Connection credentials expired or invalid | Run `celigo connections ping <connId>`; re-authorize OAuth connections |
| `0 records exported` (no error) | Wrong `resourcePath`, empty date range, or overly restrictive filter | Check `resourcePath`, widen delta window, test without output filter |
| `Cannot read property of undefined` in preSavePage | Script assumes a field exists that is missing from some records | Add null checks: `if (record.field)` before access |
| `mockOutput is invalid` | Wrong format -- used array instead of object | Use `{ "page_of_records": [{ "record": {...} }] }` |
| `Invalid adaptorType` | Case mismatch or typo | Use exact casing from the Adaptor Decision Matrix |
| `Connection is offline` | Connection failed health check | Fix credentials, re-authorize, then `celigo connections ping <id>` |
| `Rate limit exceeded` / `429` | Too many concurrent requests to the source API | Lower `concurrencyLevel` on the connection; add retry config |
| `Timeout` on large exports | Query returns too much data or API is slow | Add pagination, narrow the date range, or increase timeout settings |
| `File parsing error` | `file.type` doesn't match actual file format, or delimiter/encoding mismatch | Verify `file.type`, check `file.csv.columnDelimiter`, ensure correct encoding |
