---
uri: celigo://resources/glossary
name: Product Glossary
description: >-
  Official Celigo terminology and definitions — core resource types
  (Connection, Export, Import, Flow, Integration, Script, API, Tool),
  supporting resources, and key platform concepts.
mimeType: text/markdown
---
# Celigo Product Glossary

## Core Resource Types

### Connection
Credential and configuration object that authenticates Celigo to an external system (Salesforce, NetSuite, HTTP API, database, FTP, etc.). Exports and imports that reach an external system reference one via `_connectionId` (Event Streams topic steps need none). Connections must be created before the resources that use them.

**Connection types:** `http` (REST/GraphQL), `netsuite`, `salesforce`, `rdbms` (SQL Server, MySQL, MariaDB, PostgreSQL, Oracle, Snowflake, BigQuery, Redshift, Azure Synapse), `jdbc`, `mongodb`, `dynamodb`, `ftp` (FTP/SFTP/FTPS), `s3`, `filesystem`, `as2`, `van`, `mcp`, `wrapper`.

### Export
Data source step that fetches records from an external system and feeds them into a flow for processing. Exports serve two roles:
- **Source** — starting point that fetches the primary batch of records (page generator in a flow).
- **Lookup** — mid-flow enrichment step (`isLookup: true`) that fetches additional data per-record during processing.

**Adaptor types:** `HTTPExport`, `NetSuiteExport`, `NetSuiteHTTPExport`, `SalesforceExport`, `RDBMSExport`, `MongodbExport`, `JDBCExport`, `DynamodbExport`, `FTPExport`, `S3Export`, `WebhookExport`, `AS2Export`, `SimpleExport`, `FileSystemExport`, `WrapperExport`, `TopicExport`. Case-sensitive. `NetSuiteHTTPExport` reads NetSuite over its REST APIs and SuiteQL with no SuiteApp; send it explicitly, because a NetSuite export without it is taken as `NetSuiteExport` (saved searches, listeners, the file cabinet). `TopicExport` listens to an Event Streams topic. `RESTExport` is a legacy name for the HTTP adaptor.

**Three categories:** Listeners (webhooks, real-time push), File transfers (FTP, S3, file parsing), Record-based (API polling, database queries).

### Import
Data destination step that takes records from an upstream step and writes them to an external system. Each import has an adaptor type, mapping config, and optional lookups.

**Adaptor types:** `HTTPImport`, `NetSuiteDistributedImport`, `NetSuiteHTTPImport`, `SalesforceImport`, `RDBMSImport`, `MongodbImport`, `DynamodbImport`, `JDBCImport`, `FTPImport`, `S3Import`, `AS2Import`, `FileSystemImport`, `AiAgentImport`, `GuardrailImport`, `ToolImport`, `WrapperImport`, `TopicImport`. Case-sensitive. A NetSuite import is `NetSuiteDistributedImport` when the Celigo SuiteApp or bundle is installed and `NetSuiteHTTPImport` (the REST APIs) without it; `NetSuiteImport` is legacy. `TopicImport` publishes each record to an Event Streams topic. `RESTImport` is a legacy name for the HTTP adaptor.

### Flow
Pipeline that connects exports (sources) to imports (destinations) with optional branching, transformation, and scripting. Flows run on a schedule, in response to events, or when triggered by another flow.

**Structure:**
- **Page generators** — exports that fetch data (`pageGenerators[]`).
- **Page processors** — imports and lookups that process each record (`pageProcessors[]` for linear flows, or `routers[]` for branching flows). Never both.

**Topologies:** Linear (flat processor list), Branching (routers with conditional branches), Abstract/Instance (template + per-instance overrides).

### Integration
Named container that groups related flows, connections, and resources. Every flow belongs to an integration via `_integrationId`.

### Script
JavaScript function that runs at specific points in the data pipeline. Hook types: `preParse` (file exports: the raw file, before parsing), `preSavePage` (after export, before pipeline), `preMap` (before field mapping), `postMap` (after mapping, before submit), `postSubmit` (after destination responds), `postResponseMap` (after response mapping merges data), `postAggregate` (after file aggregation on file imports).

### API
Custom RESTful HTTP endpoint that exposes integration logic for synchronous external consumption. Two modes: builder (visual configuration) and script (custom JavaScript handler).

### Tool
Reusable building block that encapsulates lookups, imports, transforms, and branching behind input/output contracts. Callable from flows, APIs, AI agents, MCP servers, and other tools.

## Supporting Resource Types

### Lookup Cache
Key-value store used by imports to resolve references at runtime. Maximum 50 MB per cache. Supports upsert, get, delete, and purge operations. Common uses: cross-reference mapping, deduplication, state tracking.

### Agent (AI)
AI agent import configuration (`AiAgentImport`) for LLM-powered processing steps. Supports any provider in the `aiAgent.provider` enum, with model selection, system prompts, structured output, and tool use.

### Guardrail
Safety and compliance check (PII detection, content moderation, AI-agent evaluation) applied to data flowing through integrations.

### On-Premise Agent (OPA)
Agent installed on customer premises for connecting to systems behind firewalls. Connections reference an OPA via `_agentId`.

### Stack
Custom execution environment for scripts and hooks. Two types: self-hosted HTTP servers and AWS Lambda functions.

### EDI Profile
X12 and EDIFACT interchange envelope settings for specific trading partners.

### File Definition
Parser and generator for structured files a standard parser can't describe: EDI (X12, EDIFACT), fixed-width, and delimited files with row-type markers. Plain CSV, JSON, XML and XLSX use the step's own file settings.

### iClient
Reusable OAuth credential store — holds client ID, client secret, scopes, and token endpoints. Shared across multiple connections to avoid duplicating OAuth app credentials. Referenced via `_iClientId` on connections.

### HTTP Connector
Pre-built guided connector definition for REST APIs. Celigo maintains 550+ HTTP connectors with pre-configured auth, base URLs, and endpoint definitions for common applications (Shopify, Stripe, HubSpot, etc.).

### Trading Partner Connector
Pre-configured connection template for onboarding EDI trading partners. 590+ connectors available.

### Template
Published integration template available in the Celigo marketplace. Templates provide pre-built integration patterns that can be installed into an account.

### Environment
An isolated partition of the account (Production, a sandbox, Development, …) with its own connections, flows and users, reached with its own token or profile. Nothing crosses environments: an id from another environment isn't found.

### Tag
Label for organizing and filtering resources across the account.

### Notification
Alert configuration for flow errors, job completions, and other events.

### Job
Execution record for a flow run. Contains status, timing, record counts (success, error, ignored), and page processing statistics.

### Audit Log
Change history tracking who modified what resource and when, filterable by resource type and time range.

### MCP Server
MCP server configuration that exposes Celigo tools and APIs as MCP endpoints for AI agents.

### End User
Someone outside the workspace who signs in through MCP OAuth to use the account's MCP servers. End users are a separate record type from workspace users; their access is capability grants per MCP server, given directly or through groups and roles.

### Network Policy
Named IP allow and deny lists. A policy restricts nothing until it's assigned to an API token, an MCP server, or sign-in; deny always wins, and an empty allow list admits every address the deny list doesn't name.

### API Token
Bearer credential for calls into integrator.io's API, custom APIs and MCP servers: an account API token or a personal access token, with full or scoped access. Managed only in the UI.

### Topic (Event Streams)
A retained message channel in the account. Flows publish to it with a `TopicImport` step and listen with a `TopicExport` step (`topic._topicId`), and every listener gets every message. Licensed, and registered on the integrations whose steps use it.

### Celigo Storage
The file and folder store built into integrator.io, addressed by `_id` (renames and moves keep it). Storage Query runs read-only SQL over stored files, and the Celigo-hosted SFTP file server gives partners access to folders.

### Sync
A Celigo Data Ingestion pipeline that replicates an application's tables or objects (datasets) into a data warehouse on a schedule, with backfill and schema-drift handling. A sync lives in an integration that holds syncs instead of flows (`syncs: true`).

### Integration App
A vendor-maintained integration installed from the Marketplace. Its resources carry `_connectorId`, and the app governs them: a full update keeps the app's value for a field it locks, a PATCH of a locked field is refused, deletes are refused, and settings are saved through the app's own settings form, not by writing `settings`.

### Alias
A stable name an integration or flow maps to a resource `_id` (`aliases[]`), so scripts and templates can refer to the resource by name across clones.

### Recycle Bin
Holds most deleted resources for 30 days, restorable until they're purged or expire. See the Recycle Bin Reference.

## Key Concepts

### Build Order
Always build bottom-up — dependencies must exist before the resources that reference them:
1. **Connection** (credentials for each system)
2. **Export + Import** (data source and destination steps, each referencing a connection)
3. **Flow** (pipeline wiring exports to imports within an integration)

### Environments and the `sandbox` field
Each environment is isolated and reached with its own credential, so build and test in the one you're connected to. The `sandbox` field is a deprecated legacy marker: honored only when a flow is created (and refused without a sandbox subscription), ignored on update, and read-only on connections, so never set it to move or classify a resource.

### Delta / Incremental Sync
Export mode that only fetches records changed since the last run. Uses `lastExportDateTime` to track the high-water mark. HTTP and database exports put `{{lastExportDateTime}}` in the request itself (the URI, body or SQL `WHERE` clause); application adaptors such as Salesforce and NetSuite name the timestamp field or fields in `delta.dateField`.

### Response Mapping
Mechanism to carry data from a step's API response back into the record for downstream steps. Uses Transformation 1.0 syntax (extract/generate pairs). Lives on the flow's `pageProcessors[]` entry, not on the import itself.

### Page Generator vs Page Processor
- **Page generator** — export that serves as the data source for a flow.
- **Page processor** — import or lookup export that processes records within a flow. Can be chained sequentially or routed conditionally via routers.

### RBAC (Role-Based Access Control)
Workspace access: the account owner (one per account), then three account-wide levels — administrator (full access), manage (create and edit), and monitor (view and run). An account-wide level covers every integration, including ones created later; for access to chosen integrations only, a user has no account-wide level and a `manage` or `monitor` grant per integration (`integrationAccessLevel`).
