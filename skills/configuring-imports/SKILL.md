---
name: configuring-imports
description: Configure Celigo imports -- the destination step that writes records to external systems. Use when creating imports, choosing the adaptor type, setting up field mappings, lookups, upsert logic, AI agent imports, or file-based imports.
---

<!-- TIER:1 -->

# Configuring Imports

An import is the **data destination** in a Celigo integration. It takes records from an upstream step and writes them to an external system -- REST APIs, databases, ERPs, file servers, or AI models. Every import is bound to exactly one connection and one adaptor type.

Imports handle six concerns:

- **Field mapping** -- transforming source fields into the destination system's expected format (including value resolution via static maps and lookup tables). Uses Mapper 2.0 (`mappings[]` array) by default; NetSuite and Salesforce imports only support Mapper 1.0 (`mapping.fields[]` / `mapping.lists[]`)
- **Operation logic** -- create, update, upsert, delete, attach/detach
- **Hooks** -- JavaScript pre/post processing at various pipeline stages (preMap, postMap, postSubmit). File-based imports that generate files from records also support postAggregate
- **One-to-many** -- fan out child records from a parent. Set `oneToMany: true` and `pathToMany` to the child array path (e.g., `"lineItems"`) when one source record should create multiple import operations
- **Response mapping** -- extract fields from the import's API response back into the record for downstream steps. Configured on the flow's `pageProcessors[]` entry, but planned when building the import. The response is available via `_json` (the raw API response) and `errors`. Use `_json.fieldName` to extract from the response (e.g., `_json.id` for a created record's ID, `_json.output.1.content.0.text` for OpenAI responses). Response mapping uses Transformation 1.0 syntax (extract/generate pairs), not the newer expression-based transforms
- **postResponseMap hook** -- JavaScript processing after response mapping merges the response back into the record. Configured on the flow's `pageProcessors[]` entry, but planned when building the import. Use to transform or enrich the merged record before downstream steps

Imports are used across flows, APIs, and tools.

## Import Execution Pipeline

When records arrive at an import step, this pipeline executes in strict order:

1. **Input filter** (optional) -- discards records before any processing (configured as an expression on the flow's `pageProcessors[]` entry)
2. **preMap hook** (optional) -- JavaScript processing before field mapping
3. **Field mapping** -- Mapper 2.0 or 1.0 maps source fields to destination fields, including lookups and hardcoded values
4. **postMap hook** (optional) -- JavaScript processing after field mapping, before submission
5. **Submit to destination** -- writes the mapped record to the external system
6. **postSubmit hook** (optional) -- JavaScript processing after the destination responds (access response data, log results, trigger side effects)
7. **Response mapping** (optional) -- carries data from the destination response back into the record for downstream steps. Configured on the flow's `pageProcessors[]` entry, not on the import itself
8. **postResponseMap hook** (optional) -- JavaScript processing after response mapping merges response data back into the record

**Key distinction:** Response mapping lives on the flow's `pageProcessors[]` entry, not on the import resource. When building an import that needs to pass data downstream, plan the response mapping at flow design time.

## Categories of Import

### Record-Based Imports

Submit structured records to APIs, databases, or ERPs. The vast majority of imports.

- `NetSuiteDistributedImport` -- high-performance SuiteApp writes (add, update, addupdate, delete, attach, detach)
- `HTTPImport` -- REST/GraphQL APIs (POST, PUT, PATCH, DELETE). Supports connector-assisted (`formType: "assistant"`) and GraphQL (`graph_ql`) modes
- `SalesforceImport` -- Salesforce CRUD via SOAP, REST, Bulk, or Composite Record API
- `RDBMSImport` -- SQL databases (Snowflake, PostgreSQL, MySQL, SQL Server, Oracle). Uses `per_record`, `bulk_insert`, or `bulk_load` query types
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

- `AiAgentImport` -- OpenAI or Gemini model invocations with structured output, tool use, and reasoning
- `GuardrailImport` -- PII detection, content moderation, or custom AI-based validation

### Stack and Tool Imports

- `WrapperImport` -- custom pre-built stack connectors (Walmart, BigCommerce)
- `ToolImport` -- invoke a Celigo Tool resource

## Quick Reference

### Adaptor Decision Matrix

| Your data goes to... | Use adaptorType | Category | Read schema |
|---|---|---|---|
| REST or GraphQL API | `HTTPImport` | Record-based | [http.yml](references/schemas/http.yml) |
| NetSuite (any method) | `NetSuiteDistributedImport` | Record-based | [netsuitedistributed.yml](references/schemas/netsuitedistributed.yml) |
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
| OpenAI / Gemini | `AiAgentImport` | AI | [aiagent.yml](references/schemas/aiagent.yml) |
| PII detection / content moderation | `GuardrailImport` | AI | [guardrail.yml](references/schemas/guardrail.yml) |
| Celigo Tool | `ToolImport` | Tool | [wrapper.yml](references/schemas/wrapper.yml) |
| Pre-built stack connector | `WrapperImport` | Stack | [wrapper.yml](references/schemas/wrapper.yml) |

`adaptorType` is **case-sensitive**: `NetSuiteDistributedImport`, not `netsuitedistributedimport`.

### Minimum Required Fields

Every import needs at minimum: `name`, `adaptorType`, `_connectionId` (except AiAgentImport/GuardrailImport without BYOK), and the adaptor config block (`http{}`, `netsuite_da{}`, `salesforce{}`, etc.).

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
  - [filesystem.yml](references/schemas/filesystem.yml) -- local filesystem
- **AI config:**
  - [aiagent.yml](references/schemas/aiagent.yml) -- AI agent (provider, model, instructions, tools, structured output)
  - [guardrail.yml](references/schemas/guardrail.yml) -- guardrails (PII, moderation, AI-agent validation)
- **File output:** [file.yml](references/schemas/file.yml) (CSV, XML, JSON, XLSX config for file-based imports)
- **Clone:** [clone-request.yml](references/schemas/clone-request.yml), [clone-response.yml](references/schemas/clone-response.yml)

## Related Skills

- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connection types and auth for import destinations
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
celigo account deps import <id>

# Find orphaned imports not referenced by any flow
celigo account lint

# Search marketplace templates
celigo templates search "<application-name>"

# Extract just imports from a template
celigo templates preview <id> --model Import
celigo templates preview <id> --summary
```

The account index auto-refreshes when stale (>4 hours). Force a fresh snapshot with `celigo account snapshot`.

### 3. Check for a pre-built connector

Celigo maintains 550+ HTTP connectors with pre-configured auth, endpoints, and resources.

```bash
# Search HTTP connectors
celigo http-connectors search "<application-name>"
celigo http-connectors get <id> --full    # see endpoints, resources, auth config

# Search trading partner connectors (EDI, AS2)
celigo tp-connectors search "<application-name>"
```

If a connector exists, reference it on the connection (`_httpConnectorId`). The import can then use `http._httpConnectorVersionId` and `http._httpConnectorEndpointId` for pre-built endpoint configuration.

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

## CLI Commands

```bash
# CRUD
celigo imports list
celigo imports get <id>
celigo imports create < import.json
celigo imports update <id> < import.json
celigo imports set <id> key=value [key2=value2 ...]
celigo imports delete <id> [-y]

# Invoke (test submission without creating a job)
echo '[{"name":"test"}]' | celigo imports invoke <id>

# Clone and connection management
echo '{"connectionMap":{"oldConnId":"newConnId"}}' | celigo imports clone <id>
celigo imports replace-connection <id> <newConnectionId>

# Discovery
celigo templates search "<name>"
celigo http-connectors search "<name>"
celigo tp-connectors search "<name>"
celigo metadata types <connectionId>
celigo metadata fields <connectionId> <entityType>

# Debug
celigo imports debug-enable <id> [--duration <minutes>]
celigo imports debug-disable <id>
```

<!-- TIER:3 -->

## Pre-Submit Checklist

### Required (all imports)
- [ ] `name` is set
- [ ] `adaptorType` exact case matches connection type (request.yml > adaptorType)
- [ ] `_connectionId` references a valid, online connection (skip for AI imports without BYOK)
- [ ] Adaptor config block name matches adaptorType (`http{}` for HTTPImport, `netsuite_da{}` for NetSuiteDistributedImport, etc.)

### Adaptor-specific
- [ ] HTTP: `http.method` and `http.relativeURI` are set (http.yml)
- [ ] NetSuite: `netsuite_da.operation` and `netsuite_da.recordType` are set (netsuitedistributed.yml)
- [ ] RDBMS: `rdbms.queryType` is `per_record` or `bulk_insert` -- NOT legacy `insert`/`update` (rdbms.yml)
- [ ] Salesforce: `salesforce.sObjectType` and `salesforce.operation` are set (salesforce.yml)

### Cross-resource consistency
- [ ] Connection `type` matches the import's `adaptorType`
- [ ] If response mapping needed: configured on the flow's `pageProcessors[]` entry, not on the import itself
- [ ] If one-to-many: `oneToMany: true` and `pathToMany` is set to the child array path
- [ ] If using Mapper 1.0 (NetSuite/Salesforce): `mapping.fields[]` / `mapping.lists[]`, not `mappings[]`

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this.
2. **Including a `rest:` block creates a legacy RESTImport.** Use only `http:` for new imports.
3. **Input filter skips that import, not the record.** Filtered records skip the current import step but continue to subsequent steps in the flow. They aren't dropped -- check `numIgnore` on the job if records seem to bypass a step.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 `adaptorType invalid` | Wrong case | Use exact case from decision matrix: `HTTPImport`, `NetSuiteDistributedImport`, etc. |
| 422 `_connectionId required` | Missing connection | Set `_connectionId` to a valid connection ID |
| 422 `queryType invalid` | Legacy Snowflake value | Use `per_record` or `bulk_insert`, not `insert`/`update` |
| 422 `distributed required` | Missing NetSuite flag | Use `NetSuiteDistributedImport` with `distributed: true` on connection |
| 422 `mapping invalid` | Wrong mapper version | NetSuite/Salesforce use Mapper 1.0 (`mapping.fields[]`), not Mapper 2.0 (`mappings[]`) |
