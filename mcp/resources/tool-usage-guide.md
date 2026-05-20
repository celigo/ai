---
uri: celigo://resources/tool-usage-guide
name: Tool Usage Guide
description: >-
  How to approach common tasks with the Celigo MCP tools — recommended
  starting points, build order, task-to-tool routing, error triage
  workflow, and important rules.
mimeType: text/markdown
---
# Celigo MCP Tool Usage Guide

## Getting Started

When exploring a Celigo account for the first time, fan out atomic list reads in parallel to build a quick mental model:

- `list_integrations` — top-level project containers
- `list_flows` — every pipeline (note `disabled` for active vs. inactive split)
- `list_connections` — every external-system credential (note `offline` for health)
- `list_exports` / `list_imports` — data source/destination steps

The cardinalities and `disabled`/`offline` flags from those four calls give you the same orientation a "summary" tool would, while keeping the surface narrow and following the PRD's atomic-tool pattern.

## Build Order

Celigo resources reference each other, so always build bottom-up:

1. **Connection** — credentials for each external system
2. **Export + Import** — data source and destination steps, each referencing a connection
3. **Flow** — pipeline wiring exports to imports within an integration

Never start by creating a flow — its exports and imports must exist first, and those require connections.

## Discover Before Building

Before creating new resources, always check what already exists:

- Use `list_integrations`, `list_flows`, `list_connections`, `list_exports`, `list_imports` to see current resources.
- Use `list_templates` to find pre-built marketplace templates before building from scratch.
- Use `list_http_connectors` (and `get_http_connector` for the schema) to check if a pre-built connector exists for the target application (550+ apps available).

## Task-to-Tool Routing

| Task | Recommended tools | Notes |
|------|-------------------|-------|
| Orient yourself in an account | `list_integrations`, `list_flows`, `list_connections` (in parallel) | Cardinalities + `disabled`/`offline` flags are usually enough |
| Find existing resources | `list_flows`, `list_connections`, `list_exports`, `list_imports` | Check what exists before building |
| Find pre-built integrations | `list_templates` | Always check templates before building from scratch |
| Find pre-built connectors | `list_http_connectors`, `get_http_connector` | 550+ REST API connectors available |
| Set up credentials | `create_connection`, `ping_connection`, `test_connection` | Create, then ping for reachability and test for full validation |
| Build data source step | `create_export` | Requires a connection first |
| Build data destination step | `create_import` | Requires a connection first |
| Build a pipeline | `create_flow` | Requires exports and imports first |
| Understand fields before create/update | `get_schema` | Call with resource type first; use `availableSubSchemas` to drill into adaptor variants |
| Run a flow | `run_flow` | Returns job ID for tracking |
| Check job status | `list_jobs`, `get_job`, `get_latest_job_for_flow`, `get_latest_job_for_integration` | Monitor flow execution |
| Dashboard — running jobs | `get_current_jobs` (POST, body filter) | In-progress runs across the account |
| Dashboard — completed jobs | `get_dashboard_stats` (POST, body filter) | Completed runs, aggregated for the dashboard |
| Triage errors | `get_flow_errors`, `get_flow_error_summary`, `get_job_errors` | Start with error summary for pattern analysis |
| Retry or resolve errors | `retry_errors`, `resolve_errors` | Fix config first, then retry |
| Triage routing for errors | `assign_errors`, `tag_errors` | `assign_errors`: route to a user (`email`); `tag_errors`: group by `tagIds` from `GET /v1/tags` |
| Get execution log for a run | `get_execution_log` | Signed URL to the diagnostics bundle for a specific jobId |
| Inspect connection traffic | `get_connection_debug_logs` | Returns captured HTTP request/response payloads. Enable capture by PUTting a future `debugDate` ISO timestamp on the connection first |
| Inspect flow structure | `get_flow`, `get_export`, `get_import` | Walk pageGenerators / pageProcessors to map dependencies |
| Manage scripts | `list_scripts`, `get_script`, `create_script`, `update_script` | JavaScript hooks for transformation |
| Manage lookup caches | `list_lookup_caches`, `get_lookup_cache` | Key-value stores for reference resolution |
| Review account activity | `list_audit_entries` | Who changed what and when (filter by `resourceType`, `_resourceId`, `_byUserId`, time range) |
| Check account health | `list_flows` → fan out `get_flow_error_summary` per active flow → sort by `numError` → `get_dashboard_stats` for run-rate context | Atomic-tool composition; see the `audit-account-health` prompt for the full skill |
| Get oriented in this MCP server | (no tool — see `getting-started` prompt) | Onboarding for AI agents and humans alike: core concepts, build order, the Phase 1 read toolkit, planning discipline, sandbox-vs-production rules, and a routing table to the other prompts. |
| Author Handlebars expressions | (no tool — see `writing-handlebars` prompt) | Authoring guide for dynamic values in mappings, HTTP bodies, SQL queries, URIs, and filters. Pure reference; agents apply expressions inside resource payloads. |
| Author SQL for RDBMS exports / imports | (no tool — see `writing-sql` prompt) | Authoring guide for `rdbms.query` — SELECT / INSERT / UPDATE / UPSERT / MERGE / delta / once / bulk patterns across Snowflake, Postgres, MySQL, MariaDB, SQL Server, Azure Synapse, Oracle, BigQuery, Redshift. Pair with `get_application_metadata` for table / column discovery. |
| Get connector schema (HTTP-based) | `get_http_connector` | Connector definition: auth, endpoints, params, pagination |
| Get connector schema (app-based) | `get_application_metadata` | Record types and fields for NetSuite/Salesforce/DB/etc. connections |
| List environments | `list_environments` | Sandbox and staging environments (read-only in current scope) |

## Error Triage Workflow

When a flow is failing, follow this sequence:

1. **Check the latest job** — `get_latest_job_for_flow` to see status, record counts, and error counts.
2. **Get the error summary** — `get_flow_error_summary` to see which steps have errors and how many.
3. **Analyze error patterns** — `get_flow_errors` to read individual error messages and identify root causes.
4. **Inspect details** — `get_job_errors` for job-level error data, `get_connection_debug_logs` for HTTP request/response payloads.
5. **Fix and retry** — Update the resource configuration, then `retry_errors` to reprocess failed records.
6. **Resolve without retry** — `resolve_errors` when errors are expected or not worth reprocessing.
7. **Route or group** — `assign_errors` to push specific error IDs to a user for follow-up (`{ errorIds, email }`); `tag_errors` to label errors with short codes for cohort tracking (`{ errorIds, tagIds }`, codes from `GET /v1/tags`).
7. **Verify** — `run_flow` again and confirm clean execution via `get_latest_job_for_flow`.

## Connection Setup Workflow

1. **Check for a pre-built connector** — `list_http_connectors` to see if the target application has a Celigo connector.
2. **Create the connection** — `create_connection` with the correct type and auth configuration.
3. **Test connectivity** — `ping_connection` to verify credentials and reachability; follow with `test_connection` for a fuller capability check.
4. **Get metadata** — `get_application_metadata` to discover available record types and fields.

## Resource Schema Workflow

Before creating exports, imports, or connections, retrieve field schemas:

1. **Get base schema** — `get_schema` with target='resource' and the resource type (e.g., 'export').
2. **Check for adaptor variants** — if the response includes `availableSubSchemas`, call again with 'resource/adaptor' (e.g., 'export/http').
3. **Create the resource** — use the schema fields to build a valid request body for `create_export`, `create_import`, etc.

## Common Patterns

### Full Sync Flow
`list_connections` → `create_export` (source) → `create_import` (destination) → `create_flow` → `run_flow`

### Error Investigation
`get_latest_job_for_flow` → `get_flow_error_summary` → `get_flow_errors` → `retry_errors` or `resolve_errors`

### Account Health Audit
`list_flows` → fan out `get_flow_error_summary` per active flow id → sort by total `numError` → for the worst offenders, `get_latest_job_for_flow` then `get_job_errors` to inspect specific failures

## Important Rules

- **`adaptorType` is case-sensitive.** Use `HTTPExport`, not `httpExport`. Use `NetSuiteDistributedImport`, not `netsuitedistributedimport`.
- **PUT erases omitted fields.** When updating resources, always GET first, modify, then PUT the complete object.
- **Create flows with `disabled: true`.** An enabled flow with a schedule runs immediately. Enable only after verification.
- **Schedule is 6-field cron with seconds.** Format: `"? */5 * * * *"`. The first field is always `?`.
- **Sandbox and production must not mix.** `sandbox: true` flows only use `sandbox: true` connections.
- **Connections should be named after the system, not the operation.** "Shopify - my-store" is correct; "Shopify - Customer Upsert" is not, because connections are shared across resources.

## Concept Aliases (for common AI prompts)

When a user asks for a vague concept, route to one of the concrete tools:

- **"Connector schema"** — use `get_http_connector` for HTTP/REST connectors, `get_application_metadata` for application connectors (NetSuite, Salesforce, databases, etc.).
- **"Debug log"** — use `get_connection_debug_logs` for HTTP request/response payloads on a connection (capture must first be enabled via `update_connection` setting `debugDate` to a future ISO timestamp), or `get_execution_log` for the per-job run diagnostics bundle. There is no single generic debug endpoint.
- **"Execution log"** — use `get_execution_log` for a specific jobId (returns a signed URL to the diagnostics bundle).
- **"Dashboard stats"** — `get_dashboard_stats` for completed runs; `get_current_jobs` for in-progress runs.
- **"OpenAPI spec"** — read the `celigo://resources/api-reference` resource (this MCP server) or the canonical spec at https://github.com/celigo/integrator-api-specs.
