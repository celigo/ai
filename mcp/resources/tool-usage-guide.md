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
- Use `list_marketplace` to find pre-built marketplace templates before building from scratch (set `_id` to preview a template blueprint; use `deploy_template` to install).
- Use `get_schema` with `target='connector'` (HTTP connector id/name, or a connection `_id` for native app metadata) to check whether a pre-built connector exists for the target application.

## Task-to-Tool Routing

| Task | Recommended tools | Notes |
|------|-------------------|-------|
| Orient yourself in an account | `list_integrations`, `list_flows`, `list_connections` (in parallel) | Cardinalities + `disabled`/`offline` flags are usually enough |
| Find existing resources | `list_flows`, `list_connections`, `list_exports`, `list_imports` | Check what exists before building |
| Find pre-built integrations | `list_marketplace` | Always check templates before building from scratch; `deploy_template` to install |
| Find / inspect connectors | `get_schema` (`target='connector'` or `connector_openapi`) | HTTP catalog entry by id/name, or native app metadata via connection `_id` |
| Set up credentials | `upsert_connection` | Omit `_id` to create; provide `_id` to update (full-document PUT) |
| Build data source step | `upsert_export` | Requires a connection first |
| Build data destination step | `upsert_import` | Requires a connection first |
| Build a pipeline | `upsert_flow` | Requires exports and imports first; create with `disabled: true` |
| Understand fields before create/update | `get_schema` | Call with `target='resource'` first; use `availableSubSchemas` to drill into adaptor variants |
| Run a flow | `run_flow` | Returns `_jobId` for tracking |
| Check job status | `list_jobs` | Use `_id` for one run (parent + children); `_flowId` / `_integrationId` to list recent runs. Always scope list mode. |
| In-progress / recent runs | `list_jobs` with `status` + scope (`_flowId` / `_integrationId`) | Prefer scoped lists; unscoped account-wide lists are slow or rejected |
| Triage errors | `list_flow_errors`, optionally `list_flows` with `includeErrorCounts` / `hasOpenErrors` | Unscoped `list_flow_errors` defaults to summary mode; drill into a flow/step for detail |
| Retry, resolve, assign, or tag errors | `triage_flow_errors` | One tool, `action` = `retry` \| `resolve` \| `assign` \| `tag`. Confirm with the user before `retry` (writes to destinations). Tag codes from `list_tags`. |
| Inspect / edit retry payload | `get_flow_error_retry_data`, `update_flow_error_retry_data` | Use `retryDataKey` from `list_flow_errors` before retrying |
| Get execution log for a run | `list_execution_logs` | Requires flow `_id` + `_jobId`; flow must have debug logging armed (`logging.debugUntil`) |
| Inspect flow / export / import structure | `list_flows` / `list_exports` / `list_imports` with `_id` | Dual-purpose list tools: set `_id` for full config. Walk `pageGenerators` / `pageProcessors` to map dependencies |
| Manage scripts | `list_scripts`, `upsert_script` | JavaScript hooks for transformation; omit `_id` to create, provide `_id` to update |
| Manage lookup caches | `list_lookup_caches`, `upsert_lookup_cache`, `list_lookup_cache_data`, `upsert_lookup_cache_data`, `delete_lookup_cache_data` | Key-value stores for reference resolution |
| Review account activity | `list_audit_log_entries` | Who changed what and when (filter by `resourceType`, `_resourceId`, `_byUserId`, time range) |
| Check account health | `list_flows` with `includeErrorCounts` / `hasOpenErrors` → `list_flow_errors` on the worst flows → `list_jobs` with `_flowId` for run context | Atomic-tool composition; see the `audit-account-health` prompt for the full skill |
| Get oriented in this MCP server | (no tool — see `getting-started` prompt) | Onboarding for AI agents and humans alike: core concepts, build order, the Phase 1 read toolkit, planning discipline, sandbox-vs-production rules, and a routing table to the other prompts. |
| Author Handlebars expressions | (no tool — see `writing-handlebars` prompt) | Authoring guide for dynamic values in mappings, HTTP bodies, SQL queries, URIs, and filters. Pure reference; agents apply expressions inside resource payloads. |
| Author SQL for RDBMS exports / imports | (no tool — see `writing-sql` prompt) | Authoring guide for `rdbms.query` — SELECT / INSERT / UPDATE / UPSERT / MERGE / delta / once / bulk patterns across Snowflake, Postgres, MySQL, MariaDB, SQL Server, Azure Synapse, Oracle, BigQuery, Redshift. Pair with `get_schema` (`target='connector'`, connection `_id`) for table / column discovery. |
| Get connector schema (HTTP-based) | `get_schema` (`target='connector'` or `connector_openapi`) | Connector definition: auth, endpoints, params, pagination |
| Get connector schema (app-based) | `get_schema` (`target='connector'`, `name` = connection `_id`) | Record types and fields for NetSuite/Salesforce/DB/etc. connections |
| List environments | `list_environments` | Sandbox and staging environments (read-only in current scope) |
| Delete a resource | `delete_resource` | Pass `resourceType` + `_id`. Warnings are advisory; the delete still proceeds. |

## Error Triage Workflow

When a flow is failing, follow this sequence:

1. **Find flows with open errors** — `list_flows` with `hasOpenErrors: true` or `includeErrorCounts: true` (or `list_jobs` with `_flowId` for the latest run’s counts).
2. **Get the error summary** — `list_flow_errors` without `_id` (summary mode) or with `_id` only to see which steps have errors.
3. **Analyze error patterns** — `list_flow_errors` with `_id` + `_stepId` to read individual error messages (`errorId`, `retryDataKey`).
4. **Inspect details** — optional `get_flow_error_retry_data` for the staged payload; `list_execution_logs` for the run diagnostics bundle when debug logging is armed.
5. **Fix and retry** — Update the resource via the matching `upsert_*` tool, then `triage_flow_errors` with `action: "retry"`.
6. **Resolve without retry** — `triage_flow_errors` with `action: "resolve"` when errors are expected or not worth reprocessing.
7. **Route or group** — `triage_flow_errors` with `action: "assign"` (`errorIds` + `email`) or `action: "tag"` (`errors[{id, rdk}]` + `tagIds` from `list_tags`).
8. **Verify** — `run_flow` again and confirm clean execution via `list_jobs` with `_flowId` (newest first).

## Connection Setup Workflow

1. **Check for a pre-built connector** — `get_schema` with `target='connector'` and the application / connector name.
2. **Create the connection** — `upsert_connection` (omit `_id`) with the correct type and auth configuration.
3. **Get metadata** — `get_schema` with `target='connector'` and `name` set to the new connection `_id` to discover available record types and fields.

## Resource Schema Workflow

Before creating exports, imports, or connections, retrieve field schemas:

1. **Get base schema** — `get_schema` with `target='resource'` and the resource type (e.g., `name: 'export'`).
2. **Check for adaptor variants** — if the response includes `availableSubSchemas`, call again with a path like `export/http` (or use `target='connector'` / `connector_openapi` when you need connector-specific fields).
3. **Create the resource** — use the schema fields to build a valid request body for `upsert_export`, `upsert_import`, `upsert_connection`, etc. (omit `_id` to create).

## Common Patterns

### Full Sync Flow
`list_connections` → `upsert_export` (source) → `upsert_import` (destination) → `upsert_flow` → `run_flow`

### Error Investigation
`list_jobs` (`_flowId`) → `list_flow_errors` → `triage_flow_errors` (`retry` or `resolve`)

### Account Health Audit
`list_flows` (`includeErrorCounts` / `hasOpenErrors`) → `list_flow_errors` on the worst flows → for offenders, `list_jobs` with `_flowId` then step-scoped `list_flow_errors` to inspect specific failures

## Important Rules

- **`adaptorType` is case-sensitive.** Use `HTTPExport`, not `httpExport`. Use `NetSuiteDistributedImport`, not `netsuitedistributedimport`.
- **PUT erases omitted fields.** `upsert_*` with `_id` is a full-document replace. Always fetch first (`list_*` with `_id`), modify, then upsert the complete object.
- **Create flows with `disabled: true`.** An enabled flow with a schedule runs immediately. Enable only after verification.
- **Schedule is 6-field cron with seconds.** Format: `"? */5 * * * *"`. The first field is always `?`.
- **Sandbox and production must not mix.** `sandbox: true` flows only use `sandbox: true` connections.
- **Connections should be named after the system, not the operation.** "Shopify - my-store" is correct; "Shopify - Customer Upsert" is not, because connections are shared across resources.
- **Create vs update is one tool.** There are no separate `create_*` / `update_*` / `get_*` tools — use `upsert_*` (omit `_id` to create) and `list_*` with `_id` to fetch one resource.

## Concept Aliases (for common AI prompts)

When a user asks for a vague concept, route to one of the concrete tools:

- **"Connector schema"** — use `get_schema` with `target='connector'` (HTTP connector id/name) or the same target with a connection `_id` for native application metadata (NetSuite, Salesforce, databases, etc.). Use `target='connector_openapi'` for the OpenAPI fragment.
- **"Debug log" / "execution log"** — use `list_execution_logs` for the per-job run diagnostics bundle (flow `_id` + `_jobId`; requires debug logging armed on the flow). There is no separate connection traffic-capture tool in the current catalog.
- **"Dashboard stats" / "current jobs"** — use `list_jobs` with a scope filter (`_flowId`, `_integrationId`, …) and optional `status`. There are no separate dashboard aggregate tools in the current catalog.
- **"OpenAPI spec"** — read the `celigo://resources/api-reference` resource (this MCP server) or the canonical spec at https://github.com/celigo/integrator-api-specs.
- **"Templates"** — use `list_marketplace` (and `deploy_template` to install). There is no `list_templates` tool.
