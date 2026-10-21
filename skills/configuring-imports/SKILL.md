---
name: configuring-imports
description: Configure Celigo imports -- the destination step that writes records to external systems. Use when creating imports, choosing the adaptor type, setting up field mappings, lookups, upsert logic, AI agent imports, or file-based imports.
---

<!-- TIER:1 -->

# Configuring Imports

An import is the **data destination** in a Celigo integration. It takes records from an upstream step and writes them to an external system -- REST APIs, databases, ERPs, file servers, or AI models. Every import has one adaptor type and, apart from the connection-less kinds in [Minimum Required Fields](#minimum-required-fields), is bound to exactly one connection.

Imports handle six concerns:

- **Field mapping** -- transforming source fields into the destination system's expected format (including value resolution via static maps and lookup tables). Uses Mapper 2.0 (`mappings[]` array) by default, including `NetSuiteHTTPImport`. `SalesforceImport` supports only Mapper 1.0 (`mapping.fields[]` / `mapping.lists[]`), and `NetSuiteDistributedImport` uses its own Mapper 1.0 dialect at `netsuite_da.mapping`
- **Operation logic** -- create, update, upsert, delete, attach/detach
- **Hooks** -- JavaScript pre/post processing at various pipeline stages (preMap, postMap, postSubmit). File-based imports that generate files from records also support postAggregate
- **One-to-many** -- fan out a child array already on the input record. Set `oneToMany: true` and `pathToMany` to that path (e.g., `"lineItems"`) when one source record should create one import operation per child. After fan-out the child is `record` (`{{record.sku}}`) and the parent (without the array) is `record._PARENT` (`{{record._PARENT.id}}`). Leave `pathToMany` blank when the arriving record is itself an array (grouped rows from a `groupByFields` export or a file group) -- each element then becomes the record, with no `_PARENT`. A path on an array record processes zero children and still reports success; a blank path on an object record fails with `oneToMany_error`. `oneToMany` doesn't batch by itself: templates see `batch_of_records` only when `http.batchSize` is above 1 (the default varies by API) or an RDBMS query runs `per_page`
- **Response mapping** -- extract fields from the import's API response back into the record for downstream steps. Configured on the flow's `pageProcessors[]` entry, but planned when building the import. Extracts read the response envelope: `id` (the destination-assigned record ID), `statusCode`, `ignored`, `errors`, and `_json` (the raw response body, whose top-level fields are also flattened onto the envelope). Use `id` for a created record's ID and `_json.fieldName` for other response fields (e.g., `_json.output.1.content.0.text` for OpenAI responses) -- `_json.id` works only when the body itself has a top-level `id`. Flow test runs never send imports, so `id` is empty there. Response mapping uses Transformation 1.0 syntax (extract/generate pairs), not the newer expression-based transforms
- **postResponseMap hook** -- JavaScript processing after response mapping merges the response back into the record. Configured on the flow's `pageProcessors[]` entry, but planned when building the import. Use to transform or enrich the merged record before downstream steps

Imports are used across flows, APIs, and tools.

## Import Execution Pipeline

When records arrive at an import step, this pipeline executes in strict order:

1. **Input filter** (optional) -- records that don't match skip this import (see [Gotchas](#gotchas)). Configured as `filter` on the import resource itself -- an `inputFilter` key on an import is silently discarded. See [configuring-filters](../configuring-filters/SKILL.md#import-filter-import-filter)
2. **preMap hook** (optional) -- JavaScript processing before field mapping
3. **Field mapping** -- Mapper 2.0 or 1.0 maps source fields to destination fields, including lookups and hardcoded values
4. **postMap hook** (optional) -- JavaScript processing after field mapping, before submission
5. **Submit to destination** -- writes the mapped record to the external system
6. **postSubmit hook** (optional) -- JavaScript processing after the destination responds (access response data, log results, trigger side effects)
7. **Response mapping** (optional) -- carries data from the destination response back into the record for downstream steps. Configured on the flow's `pageProcessors[]` entry, not on the import itself
8. **postResponseMap hook** (optional) -- JavaScript processing after response mapping merges response data back into the record

**Key distinction:** Response mapping lives on the flow's `pageProcessors[]` entry, not on the import resource. When building an import that needs to pass data downstream, plan the response mapping at flow design time.

**What an HTTP import's templates see.** `http.relativeURI` and header values render against the record before mapping, and an undefined path fails the request. `http.body` renders against the mapped record, where an undefined path renders empty and the record still succeeds (`strictHandlebarEvaluation` doesn't change that). Leave `http.body` unset to send the mapped record; when you template it, use the mapped (destination) field names.

## Categories of Import

### Record-Based Imports

Submit structured records to APIs, databases, or ERPs. The vast majority of imports.

- `NetSuiteDistributedImport` -- high-performance SuiteApp writes (add, update, addupdate, delete, attach, detach). The default for NetSuite when the Celigo SuiteApp or bundle is installed
- `NetSuiteHTTPImport` -- NetSuite's REST APIs on a `netsuite` connection (`nsDomainType: "suitetalk"`: `POST /services/rest/record/v1/<type>` to insert, `PATCH .../<type>/{id}` to update; `"restlet"` for a custom RESTlet). Use it when neither the SuiteApp nor the bundle is installed, or the user asks for REST
- `HTTPImport` -- REST/GraphQL APIs (POST, PUT, PATCH, DELETE). Supports connector-assisted (`formType: "assistant"`) and GraphQL (`graph_ql`, `assistant_graphql`) modes. A GraphQL import posts to the connection's base URI -- its form has no relative-URI field and writes `relativeURI: ["/"]` on every save -- so the connection must supply the GraphQL endpoint: a `graph_ql` connection, or a connector connection bound to the app's GraphQL API. On a connection bound to the app's REST API every record fails (HTTP 406 on Shopify); add a second connection bound to the GraphQL API, re-point the GraphQL steps to it, and leave the shared REST connection unchanged
- `SalesforceImport` -- Salesforce CRUD via SOAP, REST, Bulk, or Composite Record API
- `RDBMSImport` -- SQL databases (Snowflake, PostgreSQL, MySQL, SQL Server, Oracle). `rdbms.queryType` is a one-element array whose value fixes the companion field: `per_record`, `per_page` (renders against `batch_of_records`) and `first_page` (runs once, on the first page) take `rdbms.query`, an array of SQL strings; `bulk_insert` takes `rdbms.bulkInsert` (pure INSERT, with no upsert or ignore-existing logic); `bulk_load` takes `rdbms.bulkLoad` (a staged load that becomes a MERGE with `primaryKeys`, or runs your own SQL with `overrideMergeQuery`). Prefer `bulk_load` where the database supports it, then `bulk_insert` for pure INSERTs, then `per_page`, and `per_record` only when the logic can't be batched. The legacy uppercase `INSERT` (and the retired `MERGE`, `COPY` and `BULK INSERT`) fail any save with 422 "Import query types … are deprecated"; `UPDATE` is legacy too, so don't use it. Other strings, such as lowercase `insert`, fail as an invalid enum value. The SQL itself: [writing-sql](../writing-sql/SKILL.md)
- `MongodbImport`, `DynamodbImport`, `JDBCImport` -- other databases

### File-Based Imports

Write or upload files to remote storage. Require the `file{}` configuration block. Two modes:

- **Record-to-file** -- aggregates incoming records into a file (CSV, JSON, XML, XLSX). The `file{}` block defines the output format.
- **Blob passthrough** -- transfers a binary blob as-is from an upstream export. Set the `blobKeyPath` field to the path in the record that contains the blob key.

Adaptor types:

- `HTTPImport` with `http.type: "file"` -- upload files over HTTP to cloud storage APIs (Google Drive, Box, Dropbox, Azure Blob Storage)
- `FTPImport` -- CSV, XML, JSON, XLSX, EDI files to FTP/SFTP
- `S3Import` -- objects to Amazon S3
- `AS2Import` -- AS2 EDI file transmission
- `FileSystemImport` -- local/on-premise filesystem writes

### AI Imports

Invoke AI models for classification, extraction, or safety checks. No `_connectionId` required unless using BYOK.

- `AiAgentImport` -- LLM invocations (any provider in the `aiAgent.provider` enum) with structured output, tool use, and reasoning
- `GuardrailImport` -- PII detection, content moderation, or custom AI-based validation

### Stack and Tool Imports

- `WrapperImport` -- custom pre-built stack connectors (Walmart, BigCommerce)
- `ToolImport` -- runs the Celigo Tool named by `tool._toolId`. It needs no `_connectionId`; instead it must bind each connection the tool's steps use in `tool.overrides.connections` as `{_abstractId, _id}` -- set `_id` equal to `_abstractId` to keep the tool's own connection. A connection left unbound fails the run with `connection_not_overridden`

### Topic Imports (Event Streams)

- `TopicImport` -- publishes each record as a message to an Event Streams topic, which topic listeners (`TopicExport`) read. Set `topic._topicId` to the topic's `_id`, never its name (`celigo topics list`; an unknown id fails the save with 422 `invalid_ref`), and optionally `topic.batchSize` (default 1000). There's no connection and no create/update logic: each record becomes one message, reshaped by the mapping if there is one; with one-to-many, each element is its own message carrying the parent under `_PARENT`. Register the topic on the flow's integration so its flows can bind to it (`celigo integrations register-topics <integrationId> <topicId>`); the account needs the Event Streams entitlement. Test runs publish nothing; an invoke publishes for real

## Import Matching (create / update / upsert)

The core decision on most record-based imports is the **operation** -- what happens to each record at the destination. Create requires no match key; update and delete require one; upsert checks first and does whichever applies. Users describe the intent in business terms ("look up the customer and update them", "match by email and upsert", "skip the ones that already exist") that resolve into five behaviors:

- **Always create** -- every record is submitted as new. No matching, no checks.
- **Create only if missing** -- match-check first; submit as create if not found, skip silently if found.
- **Update only if exists** -- match-check first; submit as update if found, skip silently if not.
- **Update only if exists, fail if missing** -- strict variant; no-match records error out instead of skipping.
- **Upsert** -- submit a create when no match is found, an update when matched. The catch-all, and the right default when the user is vague.

When matching applies, decide four things: the **matching behavior**, the **match key field(s)** (`email`, `external_id`, `customer.id` -- required for anything other than always-create), the **on-match action** (update, skip, fail), and the **on-no-match action** (create, skip, fail).

How a destination implements matching is adaptor-specific -- there is no single "matching mode" field. A destination might expose: a native **upsert** keyed off an external ID (Salesforce upsert, NetSuite upsert, RDBMS `ON CONFLICT`); a distinct `addupdate` operation that handles both paths in one call; an `ignoreExisting` flag paired with a lookup that probes before writing (lock it when repeats can arrive concurrently -- see [Writing Exactly Once](#writing-exactly-once)); two separate create and update endpoints with no upsert variant (see composite imports below); or a lookup endpoint plus separate create and update endpoints, where the lookup runs pre-write to drive the create-vs-update decision. Some destinations have no matching concept at all -- writing a CSV to FTP, sending an email, posting to a webhook -- so every record goes out as-is.

**Prefer import-level matching over a separate lookup step.** Imports natively support this pre-write check, so a single import that does the matching and the write together means fewer steps, fewer round-trips, and no glue logic to maintain. A standalone lookup earns its place only when the looked-up data has a consumer *beyond* the write -- a router branching on something other than "does this exist", an AI agent reasoning over the result, or multiple downstream steps reading different fields. If the only consumer is the destination call itself, the work belongs inside the import. It's also the only check that runs under the import's concurrency lock, which matters whenever the same record can arrive twice ([Writing Exactly Once](#writing-exactly-once)). An import's own lookups also refuse an ambiguous match: on HTTP, Salesforce and NetSuite DA imports, a `lookups[]` entry that matches more than one record fails the record unless `useDefaultOnMultipleMatches` is set. When an update's key must come from a separate lookup that can match several records, guard it -- fail or skip on multiple matches, or check for exactly one ([configuring-lookup-caches > Safe Lookup-to-Update](../configuring-lookup-caches/SKILL.md#safe-lookup-to-update----never-write-off-an-unguarded-first-match)).

### Composite (two-endpoint) imports

When an HTTP destination has no native upsert but exposes separate create and update endpoints, a **composite import** pins both endpoints on a single import node, role-tagged create and update. The runtime picks per record via a match-key check -- the same way a native upsert would -- so the flow stays one step. Prefer this over two separate imports driven by an upstream lookup or router; reach for separate imports only when the create and update paths must diverge beyond endpoint selection (different mappings, different downstream consumers, or different hook chains).

### Writing Exactly Once

Every source can hand an import the same record twice: a sender fires a webhook again, a failed or canceled run is re-run over the same delta window, an error is retried, a record that wrote this step but failed a later one comes back on the next run, or another flow writes the same destination. **A trace key never de-duplicates** -- it correlates a record's errors and is the default lock key below; a record that arrives twice is written twice. Make the write itself idempotent, in this order of preference:

| Rank | Pattern | Why it holds under concurrency |
|---|---|---|
| 1 | **A key the destination enforces** -- an upsert or insert on a primary key or unique constraint (`ON CONFLICT`, `MERGE` -- see [writing-sql](../writing-sql/SKILL.md)), a unique external ID, an API that rejects a duplicate reference | The destination refuses the second copy |
| 2 | **`ignoreExisting: true` + the existence check on this import + `idLockTemplate` on the same business key.** The check is `http.ignoreLookupName` (a lookup on the key) or `http.ignoreExtract` (the record already carries the destination ID) -- exactly one -- or the adaptor's equivalent (NetSuite `internalIdLookup`, Salesforce `idLookup.whereClause`) | The existence check runs inside the per-key lock |
| 3 | **A ledger step** in front of a destination that can't be queried -- [configuring-lookup-caches > Deduplication Ledger](../configuring-lookup-caches/SKILL.md#deduplication-ledger) | The ledger's claim is itself rank 2 |

A match that is really a search run before the write -- a lookup-driven composite create/update, an `addupdate` found by search -- is a check-then-write, not rank 1, unless the destination also rejects the duplicate key.

**The concurrency ID lock.** `idLockTemplate` renders a key per record; records that render the same key are never submitted at the same time, and different keys run in parallel.

- **Default:** the record's trace key (a source's `traceKeyTemplate` arrives on the record as `io_custom_trace_key`). A blank trace key means **no lock**, so set `idLockTemplate` when the identity is nested or composite. A template replaces the default rather than adding to it.
- **Render time:** from the record as it arrives, before this import's own lookups and mapping. A key built from `{{lookup.<name>}}` or a mapped field renders empty -- and an empty key is no lock at all. Key it on a field the record carries (`{{{record.orderId}}}`), or one an upstream lookup step added through response mapping.
- **Scope:** this import across every page, every concurrent run, and every flow that uses it (`celigo imports dependencies <id>`) -- not the connection: two imports rendering the same key still run in parallel. Records within one page are sent one at a time anyway, so a one-page test never shows the race.
- **Coverage:** the `ignoreExisting` existence check runs inside the lock. Nothing documents the same for `ignoreMissing`, the composite create/update decision, or one-to-many children -- where those must write once, connection `concurrencyLevel: 1` closes the check-then-write race (the import's pages run one at a time), at the cost of serializing everything on that connection.

## Quick Reference

### Adaptor Decision Matrix

| Your data goes to... | Use adaptorType | Category | Read schema |
|---|---|---|---|
| REST or GraphQL API | `HTTPImport` | Record-based | [http.yml](references/schemas/http.yml) |
| NetSuite, Celigo SuiteApp or bundle installed | `NetSuiteDistributedImport` | Record-based | [netsuitedistributed.yml](references/schemas/netsuitedistributed.yml) |
| NetSuite, neither installed (or REST requested) | `NetSuiteHTTPImport` + `nsDomainType` | Record-based | [http.yml](references/schemas/http.yml) |
| Salesforce objects | `SalesforceImport` | Record-based | [salesforce.yml](references/schemas/salesforce.yml) |
| SQL database (Snowflake, PostgreSQL, etc.) | `RDBMSImport` | Record-based | [rdbms.yml](references/schemas/rdbms.yml) |
| MongoDB | `MongodbImport` | Record-based | [mongodb.yml](references/schemas/mongodb.yml) |
| DynamoDB | `DynamodbImport` | Record-based | [dynamodb.yml](references/schemas/dynamodb.yml) |
| JDBC database (non-built-in) | `JDBCImport` | Record-based | [jdbc.yml](references/schemas/jdbc.yml) |
| Files over HTTP (Google Drive, Box, Dropbox, Azure Blob) | `HTTPImport` with `http.type: "file"` | File-based | [http.yml](references/schemas/http.yml) |
| Files to FTP/SFTP | `FTPImport` | File-based | [ftp.yml](references/schemas/ftp.yml) |
| Files to S3 | `S3Import` | File-based | [s3.yml](references/schemas/s3.yml) |
| AS2 EDI transmission | `AS2Import` | File-based | [as2.yml](references/schemas/as2.yml) |
| Local filesystem | `FileSystemImport` | File-based | [filesystem.yml](references/schemas/filesystem.yml) |
| An LLM (any provider in the `aiAgent.provider` enum) | `AiAgentImport` | AI | [aiagent.yml](references/schemas/aiagent.yml) |
| PII detection / content moderation | `GuardrailImport` | AI | [guardrail.yml](references/schemas/guardrail.yml) |
| Celigo Tool | `ToolImport` | Tool | [tool.yml](references/schemas/tool.yml) |
| Pre-built stack connector | `WrapperImport` | Stack | [wrapper.yml](references/schemas/wrapper.yml) |
| An Event Streams topic | `TopicImport` | Topic | [topic.yml](references/schemas/topic.yml) |

**Raw HTTP is the fallback, not the default.** Pick the most specific match, in order:

1. **Native adaptor** -- if the application has its own row (NetSuite, Salesforce, databases, FTP/S3), use it. Do not build an `HTTPImport` against that app's REST API.
2. **Pre-built HTTP connector** -- for any other REST/GraphQL app, check the 550+ connector catalog before writing HTTP config (see [Check for a pre-built connector](#3-check-for-a-pre-built-connector)). The step is still an `HTTPImport`, but it runs on a connector-backed connection and takes its endpoint config from the connector.
3. **Manual HTTP** -- hand-write the config from public API docs only when no connector exists or it doesn't cover the operation you need.

For NetSuite, run `celigo connections suiteapp-status <connectionId>`: `suiteapp.success` or `bundle.success` true means `NetSuiteDistributedImport`; both false means `NetSuiteHTTPImport`. `NetSuiteImport` is legacy -- don't use it unless asked.

`adaptorType` is **case-sensitive**: `NetSuiteDistributedImport`, not `netsuitedistributedimport`.

### Minimum Required Fields

Every import needs at minimum: `name`, `adaptorType`, and the adaptor config block (`http{}`, `netsuite_da{}`, `salesforce{}`, `tool{}`, `topic{}`, etc.). `_connectionId` is required except on the connection-less imports: `ToolImport` (connections are bound per tool step in `tool.overrides`), `TopicImport` (must not carry one -- with a connection, the save is validated as that connection's adaptor and fails), and `AiAgentImport` / `GuardrailImport` unless they use a BYOK connection.

### Which Schemas to Read

1. Always: [request.yml](references/schemas/request.yml) (base fields)
2. Plus: the adaptor-specific file from the decision matrix
3. If file-based: also [file.yml](references/schemas/file.yml)
4. If cloning: [clone-request.yml](references/schemas/clone-request.yml), [clone-response.yml](references/schemas/clone-response.yml)

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Base fields (all imports):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **Adaptor-specific config:**
  - [http.yml](references/schemas/http.yml) -- HTTP/REST/GraphQL (methods, URIs, headers, response parsing, upsert via existingExtract)
  - [netsuitedistributed.yml](references/schemas/netsuitedistributed.yml) -- NetSuite SuiteApp (operation, recordType, internalIdLookup, mapping, lookups)
  - [netsuite.yml](references/schemas/netsuite.yml) -- NetSuite legacy
  - [salesforce.yml](references/schemas/salesforce.yml) -- Salesforce (sObjectType, operation, api, idLookup)
  - [rdbms.yml](references/schemas/rdbms.yml) -- SQL databases (queryType, query, bulkInsert, bulkLoad)
  - [ftp.yml](references/schemas/ftp.yml) -- FTP/SFTP
  - [s3.yml](references/schemas/s3.yml) -- Amazon S3
  - [mongodb.yml](references/schemas/mongodb.yml) -- MongoDB (method, collection, filter, upsert)
  - [dynamodb.yml](references/schemas/dynamodb.yml) -- DynamoDB
  - [jdbc.yml](references/schemas/jdbc.yml) -- JDBC databases
  - [as2.yml](references/schemas/as2.yml) -- AS2 EDI
  - [wrapper.yml](references/schemas/wrapper.yml) -- custom stack connectors
  - [tool.yml](references/schemas/tool.yml) -- Tool imports (`_toolId`, connection overrides)
  - [topic.yml](references/schemas/topic.yml) -- Event Streams publisher (`_topicId`, `batchSize`)
  - [filesystem.yml](references/schemas/filesystem.yml) -- local filesystem
- **AI config:**
  - [aiagent.yml](references/schemas/aiagent.yml) -- AI agent (provider, model, instructions, tools, structured output)
  - [guardrail.yml](references/schemas/guardrail.yml) -- guardrails (PII, moderation, AI-agent validation)
- **File output:** [file.yml](references/schemas/file.yml) (CSV, XML, JSON, XLSX config for file-based imports)
- **Clone:** [clone-request.yml](references/schemas/clone-request.yml), [clone-response.yml](references/schemas/clone-response.yml)

## Related Skills

- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connection types and auth for import destinations
- [managing-file-storage > Use stored files in a flow](../managing-file-storage/SKILL.md#8-use-stored-files-in-a-flow) -- Celigo Storage folders as a file destination
- [writing-mappings > Mapper 2.0 Workflow](../writing-mappings/SKILL.md#mapper-20-workflow) -- field mappings on imports
- [writing-scripts > Data Pipeline Hooks](../writing-scripts/SKILL.md#data-pipeline-hooks) -- preMap, postMap, postSubmit, postAggregate hooks
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- dynamic values in URIs, HTTP bodies, SQL queries
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring imports into flow pipelines as page processors
- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- diagnosing import-related failures

<!-- TIER:2 -->

## How to Build an Import

### 1. Identify the target application

What system are you writing data to? This determines adaptor type, connection type, and configuration shape.

### 2. Check for existing patterns

Before building from scratch, look at what already exists:

```bash
# Search your account (fast, uses local index)
celigo account search "<keyword>"

# Show what an existing import uses (connection) and what uses it (flows)
celigo account dependencies import <id>

# Find orphaned imports not referenced by any flow
celigo account lint

# Search marketplace templates
celigo templates marketplace

# Extract just imports from a template
celigo templates preview <id> --model Import
celigo templates preview <id> --summary
```

The account index auto-refreshes when stale (older than 15 minutes by default). Force a fresh snapshot with `celigo account snapshot`.

### 3. Check for a pre-built connector

**Always run this check before writing any HTTP config.** Celigo maintains 550+ HTTP connectors with pre-configured auth, endpoints, and resources. Hand-write a manual `HTTPImport` from public API docs only when this search comes up empty or the connector doesn't cover the operation you need.

```bash
# Search HTTP connectors
celigo http-connectors list | grep -i "<application-name>"
celigo http-connectors get <id> --full    # see endpoints, resources, auth config

# Drill into the endpoints the connector defines for imports
celigo http-connectors catalog <id> --resource-type import --published-only
celigo http-connectors endpoint-detail <id> --resource-type import --resource-id <rid> --endpoint-id <epid>

# Search trading partner connectors (EDI, AS2)
celigo tp-connectors list
```

If a connector exists, create the connection from it (`http._httpConnectorId` -- see [configuring-connections > Check for a pre-built connector and global iClient](../configuring-connections/SKILL.md#4-check-for-a-pre-built-connector-and-global-iclient)) and take the import's `relativeURI`, method, and body/response shapes from the connector's endpoint metadata rather than reconstructing them from public API docs. Write each operation's `relativeURI` and `method` exactly as the endpoint defines them: saving links the import to those endpoints by setting `http._httpConnectorVersionId`, `http._httpConnectorResourceId` and `http._httpConnectorEndpointIds[]` (one per operation; imports drop the singular `_httpConnectorEndpointId`), but pointers you send for the same connector are kept as sent. Read the import back: missing pointers mean a URI matched no endpoint. When retargeting an import, update or drop the old pointers in the same save -- a GET-modify-PUT that changes only the URI leaves the import naming the old endpoint.

### 4. Query metadata for the target system

For NetSuite, Salesforce, and RDBMS connections, discover available record types and fields:

```bash
celigo metadata types <connectionId>          # List record types / sObjects / tables
celigo metadata fields <connectionId> <type>  # List fields for an entity type
```

- **NetSuite:** `metadata fields` returns field IDs, types, and groups — use the IDs for `mapping.fields[].generate` and `mapping.lists[].fields[].generate`. Sublist names (e.g., `"item"`, `"addressbook"`) appear as groups, which map to `mapping.lists[].generate`. Lookup field IDs here are the `searchField`/`resultField` values for `netsuite_da.lookups[]`.
- **Salesforce:** `metadata fields` returns field API names, types, and relationship info. Use field API names for `salesforce.sObjectType` lookups and for discovering which fields are createable/updateable.
- **RDBMS:** `metadata fields` returns column names and types for a table — use these to write SQL queries (see `writing-sql`) and verify column names before building `bulkInsert.tableName` or `bulkLoad.tableName`.

### 5. Determine the category

Is this a **record-based import** (submit records to an API/database/ERP), a **file-based import** (write files to storage), or an **AI import** (invoke a model)?

### 6. Choose the right adaptor type

Refer to the [Adaptor Decision Matrix](#adaptor-decision-matrix) in the Quick Reference above.

### 7. Build the import JSON

Reference the [Schema Index](#schema-index) for the exact fields needed. Use the [Which Schemas to Read](#which-schemas-to-read) decision rule to determine which files to consult.

## File Uploads over HTTP (multipart/form-data)

Some destination APIs accept files only as `multipart/form-data` POSTs (Jira attachments, QuickBooks attachables, OpenAI file uploads). This is an `HTTPImport` with `blob: true` and `blobKeyPath`, posting to the API's upload endpoint, and it works nothing like a JSON record write. Do **not** set `http.type: "file"`: that is the folder mode of file-storage connectors (Google Drive, Box, Dropbox, Azure Blob), which treats `relativeURI` as a folder path -- combined with an API endpoint URL it saves cleanly and fails every record with "Directory is not found." Four pieces have to line up:

1. **Where the bytes come from.** The import never carries the file itself. A preceding blob export or blob lookup pulls the file into blob storage, and that step's response mapping puts the reference onto the record -- the idiom is `{"extract": "data.0.blobKey", "generate": "blobKey"}`. The record then carries a `blobKey` (a storage pointer, not content).
2. **The media type.** The connection's media type (or the import's request media type override) is `multipart/form-data`; success/error response media types usually override to JSON so replies parse normally.
3. **The request body.** Not raw MIME and not a normal handlebars payload -- a JSON array of parts, each `{name, value, type}` plus optional `filename` (include the extension) and `mime-headers`. The file part is `"type": "attachment"` with `"value": "{{blob}}"` -- `{{blob}}` is the only accepted value for an attachment (anything else 422s). Fields the API wants alongside the file ride as `"type": "inline"` parts; an inline part whose value is a JSON object must be serialized. One file reference per import.
4. **`blob: true` + `blobKeyPath`** (Advanced settings) -- `blobKeyPath` is the JSON path in the record where the blobKey lives (`blobKey`, or `file.blobKey` if nested). At send time the platform follows it into blob storage and streams the real bytes into the attachment part.

The platform assembles the final MIME body itself -- it generates the `boundary` (never hardcode one), writes each part's `Content-Disposition`, and substitutes the attachment part with the raw file bytes. The parts array is a build recipe, not the payload.

**Not every multipart API is form-data.** Some upload endpoints expect `multipart/related` instead (e.g. Google Drive's `/upload/drive/v3/files?uploadType=multipart`), and the parts-array machinery does NOT apply. There the request body is the literal MIME document: explicit boundary, a JSON metadata part, and a content part referencing `{{blob}}` (double braces). Check which flavor the destination API documents before building -- mixing them produces an import that saves cleanly and fails at runtime.

## Async Destinations (submit, poll, confirm)

Some destination APIs only acknowledge a write (an HTTP 202, a job ticket) and finish it in the background -- bulk loads, file ingestion, document conversion. Attach an **async helper** to the import (`http._asyncHelperId`) so the step submits, polls a status export until the external work completes, and only then resolves. The mechanics and constraints (a status export with done/error value lists and poll intervals; no transform, output filter, or hook on the async-configured step; helpers cannot nest) are identical to the export side -- see [configuring-exports > Async APIs (submit, poll, fetch)](../configuring-exports/SKILL.md#async-apis-submit-poll-fetch). Only add one when the API genuinely cannot confirm the write synchronously.

## Testing an Import Without Writing

Most ways of trying an import send the request to the destination for real. Know which is which before you point one at a production system:

| What you run | Reaches the destination? |
|---|---|
| `celigo imports invoke <id>` with records on stdin | **Yes -- a real write.** One result per record, every adaptor; no job is created |
| `celigo imports invoke` with an import document on stdin (the preview route) | **Yes -- a real write**, despite the name. NetSuite, Salesforce, RDBMS, and FTP imports are rejected with 422 `invalid_adaptor` |
| `celigo flows test-run <flowId> --export <exportId>` | **No.** Imports never execute in a test run -- each returns its saved `mockResponse` |
| A real flow run, or `celigo flows retry-errors` | Yes |

In the flow builder's import editor, **Preview** builds the request without sending it (HTTP imports only), while **Send** is a real write. No CLI command offers the compose-only preview, so from the CLI, test-run the flow and read the import's `request` stage with `celigo flows test-run-step-results` -- on an HTTP import its input is the record after mapping.

**Save a realistic `mockResponse`.** In test runs and flow-builder previews, an import with no saved mock answers with the placeholder `{"id": "1234567890", "mockResponse": "replace me"}`, so response mappings extract nothing real and downstream steps see empty data. Save an array of records shaped like the destination's answer -- `statusCode`, the created record's `id`, and the response body under `_json`:

```bash
celigo imports set <importId> 'mockResponse=[{"statusCode": 200, "id": "SO-1001", "_json": {"id": "SO-1001", "status": "created"}}]'
```

A saved `mockResponse` substitutes only in test runs and flow-builder previews -- `imports invoke`, real runs, and retries always send.

## CLI Commands

```bash
# CRUD
celigo imports list
celigo imports get <id>
celigo imports create < import.json
celigo imports update <id> < import.json
celigo imports set <id> key=value [key2=value2 ...]
celigo imports delete <id> [-y]

# Invoke -- a real write: each record is sent to the destination (no job is created).
# HTTP 200 even when records fail; check each result's statusCode and errors
echo '[{"name":"test"}]' | celigo imports invoke <id>

# Mock response for test runs and flow-builder previews (never used by invoke or real runs)
celigo imports set <id> mockResponse=file://./mock-response.json

# Clone and connection management
echo '{"connectionMap":{"oldConnId":"newConnId"}}' | celigo imports clone <id>
celigo imports replace-connection <id> <newConnectionId>

# Discovery
celigo templates marketplace
celigo http-connectors list
celigo http-connectors catalog <id> --resource-type import --published-only
celigo http-connectors endpoint-detail <id> --resource-type import --resource-id <rid> --endpoint-id <epid>
celigo tp-connectors list
celigo metadata types <connectionId>
celigo metadata fields <connectionId> <entityType>

# Debug
celigo imports enable-debug <id> [--duration <minutes>]
celigo imports disable-debug <id>
```

<!-- TIER:3 -->

## Pre-Submit Checklist

### Required (all imports)
- [ ] `name` is set
- [ ] `adaptorType` exact case matches connection type (request.yml > adaptorType)
- [ ] `_connectionId` references a valid, online connection (skip for `ToolImport`, `TopicImport`, and AI imports without BYOK)
- [ ] Adaptor config block name matches adaptorType (`http{}` for HTTPImport, `netsuite_da{}` for NetSuiteDistributedImport, etc.)

### Adaptor-specific
- [ ] HTTP: pre-built connector was checked (`celigo http-connectors list`) -- hand-written config only because no connector covers the app or operation
- [ ] HTTP: `http.method` and `http.relativeURI` are set (http.yml)
- [ ] HTTP lookups: each `http.lookups[]` request template is in `body`, not `postBody`, and names the record's fields without `record.` (gotcha 10)
- [ ] NetSuite DA: `netsuite_da.operation` and `netsuite_da.recordType` are set, and `update`, `addupdate` and `delete` carry `netsuite_da.internalIdLookup` -- the lookup, not a mapped `internalid`, picks the record (on `update` it overrides a mapped one). When the record already carries the internal id, use the expression form `["internalid","is","{{{id}}}"]` rather than dropping the lookup (netsuitedistributed.yml)
- [ ] RDBMS: `rdbms.queryType` is one current value (`bulk_load`, `bulk_insert`, `per_page`, `per_record` or `first_page`) with its companion field set -- never the legacy uppercase `INSERT` or `UPDATE` (rdbms.yml)
- [ ] Salesforce: `salesforce.sObjectType` and `salesforce.operation` are set (salesforce.yml)

### Cross-resource consistency
- [ ] Connection `type` matches the import's `adaptorType`
- [ ] If response mapping needed: configured on the flow's `pageProcessors[]` entry, not on the import itself
- [ ] If one-to-many: `oneToMany: true`, with `pathToMany` set to the child array path for an object record (child fields then use `record.<field>` and parent fields `record._PARENT.<field>`) and left blank for an array (grouped) record
- [ ] If downstream steps read this import's response: a realistic `mockResponse` is saved, so test runs carry real-looking data past this step
- [ ] If a repeated record would duplicate data: the write is keyed (a destination-enforced key, or `ignoreExisting` + an existence check) and `idLockTemplate` renders a non-empty key from a field the record carries on arrival -- never `{{lookup.*}}` ([Writing Exactly Once](#writing-exactly-once))
- [ ] Mapper 1.0 only where required: `mapping.fields[]` / `mapping.lists[]` on Salesforce, `netsuite_da.mapping` on NetSuite DA -- never `mappings[]` there. `NetSuiteHTTPImport` uses `mappings[]`

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this.
2. **Including a `rest:` block creates a legacy RESTImport.** Use only `http:` for new imports.
3. **Input filter skips that import, not the record.** Filtered records skip the current import step but continue to subsequent steps in the flow, without this import's response-mapped fields, so a later step that writes those fields back needs its own filter on them. Check `numIgnore` on the job if records seem to bypass a step.
4. **Multipart file parts only accept `{{blob}}`.** In a `multipart/form-data` parts array, the file part must be `"type": "attachment"` with `"value": "{{blob}}"` -- any other value 422s. Never hardcode the MIME `boundary`; the platform generates it. Fields the API wants alongside the file ride as `"type": "inline"` parts.
5. **`bodyKey`/`blobKey` in logs is an artifact, not a payload field.** Audit and debug logs never show the assembled multipart body -- an internal storage pointer appears where the body would be. But if the destination actually received the literal string `bodyKey` or `blobKey`, the file part is misconfigured (an `inline` part where an `attachment` belongs, or a `blobKeyPath` that doesn't resolve).
6. **`imports invoke` is a real write.** "No job created" doesn't mean nothing is sent: both forms execute the request against the live destination, and a saved `mockResponse` doesn't stop them. A 200 can still carry per-record failures in each result's `errors`. Point it at a sandbox, or test-run the flow when you only need to check mapping output.
7. **A trace key is not duplicate detection.** Repeated keys are normal (delta re-emits, retries) and never skip, merge, or reject a record. Only a keyed write stops the second copy -- see [Writing Exactly Once](#writing-exactly-once).
8. **A lock keyed on this import's own lookup is no lock.** `idLockTemplate` renders before the import's lookups and mapping run, so `{{lookup.<name>}}` renders empty. Check the key against a real record (an error's retry data: `celigo flows error <flowId> <importId> <errorId> --retry-data`), not a sample that may lack the field.
9. **Lookups can't chain.** A lookup's own URI, body and headers render before any lookup has run, so `{{lookup.<name>}}` there is undefined: it either fails the render (`handlebars_template_parse_error`: `Unable to read "<name>" from undefined`) or renders empty, and either way that lookup fails or asks the wrong question for every record. Test runs never execute imports, so the first real run is where it shows. Resolve the value in one query, or add an upstream lookup step and reference the field it adds to the record.
10. **An HTTP import's lookups send `body`, not `postBody`, and read the record's fields at the top level.** Put a lookup's request template in `http.lookups[].body`. A template saved as `postBody`, the field [http.yml](references/schemas/http.yml) documents, saves without complaint, but the lookup goes out with an empty body, so it asks the wrong question for every record and nothing errors. The CLI's schema check calls `body` undocumented; it's still the field that's sent. Inside that template the record's fields sit at the top level: `{{email}}` renders the record's value, and `{{record.email}}` renders empty.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 `adaptorType invalid` | Wrong case | Use exact case from decision matrix: `HTTPImport`, `NetSuiteDistributedImport`, etc. |
| 422 `_connectionId required` | Missing connection | Set `_connectionId` to a valid connection ID |
| 422 `Import query types … are deprecated` | `rdbms.queryType` holds the legacy uppercase `INSERT` (or a retired `MERGE`, `COPY` or `BULK INSERT`) | Use one current value -- `bulk_load`, `bulk_insert`, `per_page`, `per_record` or `first_page` -- and set its companion field |
| 422 `… is not a valid enum value for path rdbms.queryType.0` | A `queryType` string outside the enum, such as lowercase `insert` | Use one of the current values above |
| 422 `distributed required` | Missing NetSuite flag | Use `NetSuiteDistributedImport` with `distributed: true` on the import (there's no such connection flag); check the SuiteApp with `celigo connections suiteapp-status <connectionId>` |
| 422 `mapping invalid` | Wrong mapper version | Salesforce uses Mapper 1.0 (`mapping.fields[]`) and NetSuite DA uses `netsuite_da.mapping`, not Mapper 2.0 (`mappings[]`); `NetSuiteHTTPImport` uses `mappings[]` |
| 422 attachment `value` invalid | Multipart file part is not `{{blob}}` | Set the file part to `"type": "attachment"`, `"value": "{{blob}}"`; let the platform generate the `boundary` |
| Every record fails with "Directory is not found" | `http.type: "file"` (file-storage folder mode) combined with an API upload endpoint | Remove `http.type: "file"`; keep `blob: true` + `blobKeyPath` and post to the endpoint |
| 422 `invalid_adaptor` ("Import preview is not supported for adaptor type") | `celigo imports invoke` with a document on stdin, for a NetSuite, Salesforce, RDBMS, or FTP import | Save the import and invoke it by ID (a real write), or test-run the flow to check mapping output without sending |
| Downstream steps see `1234567890` or `"replace me"` in a test run | No `mockResponse` saved on the upstream import -- test runs never call the destination | Save a realistic `mockResponse` on that import |
| The destination receives the same record twice | A bare create; `ignoreExisting` with no lock on records whose trace key is blank; or a lock keyed on the import's own lookup | Key the write and lock it on the business key ([Writing Exactly Once](#writing-exactly-once)); find which runs wrote it first ([building-flows > Duplicate Records](../building-flows/SKILL.md#duplicate-records)) |
| 422 `cannot_set_traceKeyTemplate` | `traceKeyTemplate` set on a one-to-one import | Set it on the source export or listener -- on an import it is valid only with `oneToMany: true`. To change the lock key, set `idLockTemplate` |
| `oneToMany_error` | A blank `pathToMany` on an object record ("Record at index 0 was not an array, and no PathToMany was provided"). The editor's Preview can also show it falsely on a step fed an array, because the preview re-splits the record it displays | Object record: set `pathToMany` to the child array. Array (grouped) record: blank is right, and each row is the record, with no `_PARENT` -- confirm with a test run before changing the configuration |
