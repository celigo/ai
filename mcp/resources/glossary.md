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
Credential and configuration object that authenticates Celigo to an external system (Salesforce, NetSuite, HTTP API, database, FTP, etc.). Every export and import references a connection via `_connectionId`. Connections must be created before the resources that use them.

**Connection types:** `http` (REST/GraphQL), `netsuite`, `salesforce`, `rdbms` (SQL Server, MySQL, PostgreSQL, Oracle, Snowflake, BigQuery, Redshift), `jdbc`, `mongodb`, `dynamodb`, `ftp` (FTP/SFTP/FTPS), `s3`, `filesystem`, `as2`, `van`, `mcp`, `wrapper`.

### Export
Data source step that fetches records from an external system and feeds them into a flow for processing. Exports serve two roles:
- **Source** — starting point that fetches the primary batch of records (page generator in a flow).
- **Lookup** — mid-flow enrichment step (`isLookup: true`) that fetches additional data per-record during processing.

**Adaptor types:** `HTTPExport`, `NetSuiteExport`, `SalesforceExport`, `RDBMSExport`, `MongodbExport`, `JDBCExport`, `DynamodbExport`, `FTPExport`, `S3Export`, `WebhookExport`, `AS2Export`, `SimpleExport`, `FileSystemExport`, `WrapperExport`. Case-sensitive.

**Three categories:** Listeners (webhooks, real-time push), File transfers (FTP, S3, file parsing), Record-based (API polling, database queries).

### Import
Data destination step that takes records from an upstream step and writes them to an external system. Each import has an adaptor type, mapping config, and optional lookups.

**Adaptor types:** `HTTPImport`, `NetSuiteDistributedImport`, `SalesforceImport`, `RDBMSImport`, `MongodbImport`, `DynamodbImport`, `JDBCImport`, `FTPImport`, `S3Import`, `AS2Import`, `FileSystemImport`, `AiAgentImport`, `GuardrailImport`, `ToolImport`, `WrapperImport`. Case-sensitive.

### Flow
Pipeline that connects exports (sources) to imports (destinations) with optional branching, transformation, and scripting. Flows run on a schedule, in response to events, or when triggered by another flow.

**Structure:**
- **Page generators** — exports that fetch data (`pageGenerators[]`).
- **Page processors** — imports and lookups that process each record (`pageProcessors[]` for linear flows, or `routers[]` for branching flows). Never both.

**Topologies:** Linear (flat processor list), Branching (routers with conditional branches), Abstract/Instance (template + per-instance overrides).

### Integration
Named container that groups related flows, connections, and resources. Every flow belongs to an integration via `_integrationId`.

### Script
JavaScript function that runs at specific points in the data pipeline. Hook types: `preSavePage` (after export, before pipeline), `preMap` (before field mapping), `postMap` (after mapping, before submit), `postSubmit` (after destination responds), `postResponseMap` (after response mapping merges data), `postAggregate` (after file aggregation on file imports).

### API
Custom RESTful HTTP endpoint that exposes integration logic for synchronous external consumption. Two modes: builder (visual configuration) and script (custom JavaScript handler).

### Tool
Reusable building block that encapsulates lookups, imports, transforms, and branching behind input/output contracts. Callable from flows, APIs, AI agents, MCP servers, and other tools.

## Supporting Resource Types

### Lookup Cache
Key-value store used by imports to resolve references at runtime. Maximum 50 MB per cache. Supports upsert, get, delete, and purge operations. Common uses: cross-reference mapping, deduplication, state tracking.

### Agent (AI)
AI agent import configuration (`AiAgentImport`) for LLM-powered processing steps. Supports OpenAI and Gemini providers with model selection, system prompts, structured output, and tool use.

### Guardrail
Safety and compliance check (PII detection, content moderation, AI-agent evaluation) applied to data flowing through integrations.

### On-Premise Agent (OPA)
Agent installed on customer premises for connecting to systems behind firewalls. Connections reference an OPA via `_agentId`.

### Stack
Custom execution environment for scripts and hooks. Two types: self-hosted HTTP servers and AWS Lambda functions.

### EDI Profile
X12 and EDIFACT interchange envelope settings for specific trading partners.

### File Definition
Parser and generator for structured file formats (CSV, fixed-width, XML, JSON, EDI).

### iClient
Reusable OAuth credential store — holds client ID, client secret, scopes, and token endpoints. Shared across multiple connections to avoid duplicating OAuth app credentials. Referenced via `_iClientId` on connections.

### HTTP Connector
Pre-built guided connector definition for REST APIs. Celigo maintains 550+ HTTP connectors with pre-configured auth, base URLs, and endpoint definitions for common applications (Shopify, Stripe, HubSpot, etc.).

### Trading Partner Connector
Pre-configured connection template for onboarding EDI trading partners. 590+ connectors available.

### Template
Published integration template available in the Celigo marketplace. Templates provide pre-built integration patterns that can be installed into an account.

### Environment
Sandbox or staging environment for testing integrations before production. Celigo enforces strict separation — sandbox connections can only be used by sandbox flows.

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

## Key Concepts

### Build Order
Always build bottom-up — dependencies must exist before the resources that reference them:
1. **Connection** (credentials for each system)
2. **Export + Import** (data source and destination steps, each referencing a connection)
3. **Flow** (pipeline wiring exports to imports within an integration)

### Sandbox vs Production
Celigo enforces strict environment separation. A `sandbox: true` connection can only be used by `sandbox: true` flows. Mixing sandbox and production resources causes runtime errors.

### Delta / Incremental Sync
Export mode that only fetches records changed since the last run. Uses `lastExportDateTime` to track the high-water mark. HTTP exports use Handlebars (`{{{lastExportDateTime}}}` in the URI); database exports use `delta.dateField`.

### Response Mapping
Mechanism to carry data from a step's API response back into the record for downstream steps. Uses Transformation 1.0 syntax (extract/generate pairs). Lives on the flow's `pageProcessors[]` entry, not on the import itself.

### Page Generator vs Page Processor
- **Page generator** — export that serves as the data source for a flow.
- **Page processor** — import or lookup export that processes records within a flow. Can be chained sequentially or routed conditionally via routers.

### RBAC (Role-Based Access Control)
User access levels: administrator (full access), manage (create and edit), monitor (view and run), integration-only (scoped to specific integrations).
