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

The catalog is 29 tools. Six **verb tools** cover every resource family and take a `resourceType`:

| Verb | What it does |
|------|--------------|
| `list_resources` | List a collection (`resourceType` + optional filters; `limit`/`cursor` to page) |
| `get_resource` | One document by `_id`; or the family's field schema with `schema: true` |
| `create_resource` | POST a new document (`body`) |
| `update_resource` | PUT — full-document replace (`_id` + complete `body`) |
| `patch_resource` | JSON Patch a few fields (`_id` + `body: [{ op, path, value }]`) |
| `delete_resource` | Delete by `_id` (warnings about dependents are advisory) |

`resourceType` values: `integrations`, `flows`, `connections`, `exports`, `imports`, `scripts`, `lookup-caches`, `tags`, `tools`, `mcp-servers`, `apis`, `iclients`, `ai-agents`, `guardrails`, `environments`, `topics` (Event Streams), `network-policies`, `groups` and `roles` (end-user access), `edi-profiles`, `file-definitions`, `trading-partner-connectors`, plus the read-only `http-connectors` catalog on `list_resources`/`get_resource`. Families the account is not licensed for (B2B Manager, Event Streams) may be absent from the enum. The enum description on each verb tool says which filters and notes apply to each family.

The rest are operations that do not fit CRUD: `run_flow`, `list_flow_runs`, `cancel_flow_run`, `test_run`, `list_flow_errors`, `triage_flow_errors`, `get_flow_error_retry_data`, `update_flow_error_retry_data`, `list_execution_logs`, `invoke_tool`, `list_invocations`, `publish_topic_messages`, `list_topic_messages`, `list_lookup_cache_data`, `upsert_lookup_cache_data`, `delete_lookup_cache_data`, `register_integration_resources`, `list_audit_log_entries`, `list_edi_transactions`, `update_edi_fa_status`, `list_marketplace`, `install_template`, `list_storage_items`, `upsert_storage_item`, `list_users`, `manage_user`, `manage_mcp_server_access`, `get_schema`, `search_docs`, `submit_feedback`.

## Getting Started

When exploring a Celigo account for the first time, fan out list reads in parallel to build a quick mental model:

- `list_resources` `resourceType: "integrations"` — top-level project containers
- `list_resources` `resourceType: "flows"` — every pipeline (note `disabled` for active vs. inactive; filter with `_integrationId`, `name`, `disabled`)
- `list_resources` `resourceType: "connections"` — every external-system credential (note `offline` for health)
- `list_resources` `resourceType: "exports"` / `"imports"` — data source/destination steps

The cardinalities and `disabled`/`offline` flags from those calls give you the same orientation a "summary" tool would. If a list comes back empty on an account that clearly has resources, the API token may be scoped to specific integrations — pass `_integrationId`.

## Build Order

Celigo resources reference each other, so always build bottom-up:

1. **Connection** — credentials for each external system
2. **Export + Import** — data source and destination steps, each referencing a connection
3. **Flow** — pipeline wiring exports to imports within an integration

Never start by creating a flow — its exports and imports must exist first, and those require connections.

## Discover Before Building

Before creating new resources, always check what already exists:

- Use `list_resources` for `integrations`, `flows`, `connections`, `exports`, `imports` to see current resources.
- Use `list_marketplace` to find pre-built marketplace templates before building from scratch (set `_id` to preview a template blueprint; `install_template` to install).
- Use `list_resources` `resourceType: "http-connectors"` (with `search`) or `get_schema` `target: "connector"` to check whether a pre-built connector exists for the target application.

## Task-to-Tool Routing

| Task | Recommended tools | Notes |
|------|-------------------|-------|
| Orient yourself in an account | `list_resources` for `integrations`, `flows`, `connections` (in parallel) | Cardinalities + `disabled`/`offline` flags are usually enough |
| Find existing resources | `list_resources` (`flows`, `connections`, `exports`, `imports`) | `name` filter works for `flows` and `apis`; `_integrationId` for flows, connections, exports, imports; `externalId` for exports, imports, connections |
| Find pre-built integrations | `list_marketplace` | Always check templates before building from scratch; `install_template` to install |
| Find / inspect connectors | `list_resources` / `get_resource` `resourceType: "http-connectors"` (`includeOpenApi` for the OpenAPI fragment) | Or `get_schema` `target: "connector"` |
| Set up credentials | `create_resource` `resourceType: "connections"` | Never send `******` back in a PUT — it is the masked placeholder, not the secret |
| Build data source / destination step | `create_resource` `resourceType: "exports"` / `"imports"` | Requires a connection first |
| Build a pipeline | `create_resource` `resourceType: "flows"` | Requires exports and imports first; create with `disabled: true` |
| Understand fields before create/update | `get_resource` with `schema: true` (+ `adaptorType`, e.g. `"http"`), or `get_schema` | Returns the JSON schema plus family guidance and write notes |
| Change a few fields | `patch_resource` | Enable/disable a flow (`/disabled`), rename (`/name`), schedule, connection concurrency; `replace` ops on whitelisted paths |
| Replace a whole document | `update_resource` | Fetch with `get_resource` first, modify, send the complete object |
| Run a flow | `run_flow` | Returns `_jobId` for tracking |
| Check a run / run history / in-progress runs | `list_flow_runs` | `_id` for one run (parent + children); `_flowId` / `_integrationId` for history; `current: true` for in-progress. Always scope list mode. |
| Which flows have errors | `list_flow_errors` (no `_id`) | One row per flow with open-error counts, scoped by `_integrationId`; `numError_gte: 0` lists every flow with its count |
| Read a flow's errors | `list_flow_errors` with `_id` (+ `_stepId`) | `status: "resolved"` for history (who resolved, auto-retry clears) |
| Retry, resolve, assign, or tag errors | `triage_flow_errors` | `action` = `retry` \| `resolve` \| `assign` \| `tag`. Confirm with the user before `retry` (writes to destinations). Tag codes from `list_resources` `resourceType: "tags"`. |
| Inspect / edit retry payload | `get_flow_error_retry_data`, `update_flow_error_retry_data` | Use `retryDataKey` from `list_flow_errors` before retrying |
| Get execution log for a run | `list_execution_logs` | Flow `_id` + `_jobId`; the flow must have debug logging armed (`logging.debugUntil`, settable with `patch_resource`) |
| Inspect flow / export / import structure | `get_resource` with `_id` | Walk `pageGenerators` / `pageProcessors` to map dependencies |
| Manage scripts | `list_resources` / `get_resource` / `create_resource` / `update_resource` `resourceType: "scripts"` | JavaScript hooks for transformation |
| Manage lookup caches | verb tools with `resourceType: "lookup-caches"`; data via `list_lookup_cache_data`, `upsert_lookup_cache_data`, `delete_lookup_cache_data` | Key-value stores for reference resolution |
| Review account activity | `list_audit_log_entries` | Who changed what and when (filter by `resourceType`, `_resourceId`, `_byUserId`, `source`, time range) |
| Check account health | `list_flow_errors` (no `_id`) → `list_flow_errors` with `_id` on the worst flows → `list_flow_runs` with `_flowId` for run context | See the `audit-account-health` prompt for the full skill |
| Users and invitations | `list_users`, `manage_user` | `userType` is required on both; end users can be added to / removed from `groups` and their `effective_access` read |
| Run a Celigo Tool | `invoke_tool` | Bind every step connection in `overrides.connections`; confirm before invoking a Tool that writes |
| Tool / API run history | `list_invocations` (`resourceType: "tools"` or `"apis"`) | Pass `time_gte` / `time_lte` — upstream defaults to the last 5 minutes; `executionId` for one run's steps |
| Test-run a flow, API or Tool | `test_run` | Inline, separate short-lived history; `tools` take `{ input }`, `apis` `{ mockRequest }` |
| Event Streams topics | `resourceType: "topics"`, `publish_topic_messages`, `list_topic_messages` | Requires the Event Streams entitlement; TopicImport publishes, TopicExport listens |
| Make a connection / cache / topic visible in an integration | `register_integration_resources` | Connections one by one (also `unregister`); lookup caches and topics as one array |
| Who can use an MCP server | `manage_mcp_server_access` | `assign_end_users` / `assign_groups` with capability tokens (`tool:all`, `pset:<id>`), `effective_access` to read the matrix |
| Restrict where MCP requests may come from | `resourceType: "network-policies"` | IP allow/deny lists referenced by an MCP server's `_networkPolicyId` |
| Files and folders | `list_storage_items`, `upsert_storage_item` | Celigo Storage; `restore: true` on upsert brings back a deleted item |
| B2B / EDI | `list_edi_transactions`, `update_edi_fa_status`, `resourceType: "edi-profiles"` / `"file-definitions"` | Requires B2B Manager |
| Get oriented in this MCP server | (no tool — see `getting-started` prompt) | Core concepts, build order, planning discipline, sandbox-vs-production rules |
| Author Handlebars expressions | (no tool — see `writing-handlebars` prompt) | Dynamic values in mappings, HTTP bodies, SQL queries, URIs, filters |
| Author SQL for RDBMS exports / imports | (no tool — see `writing-sql` prompt) | `rdbms.query` patterns across Snowflake, Postgres, MySQL, SQL Server, Oracle, BigQuery, Redshift |
| Answer a product question | `search_docs` | Knowledge Base search with an AI-generated answer |
| Report a tool problem | `submit_feedback` | Wrong schema, misleading description, missing capability |
| Delete a resource | `delete_resource` | Pass `resourceType` + `_id`. Warnings are advisory; the delete still proceeds. |

## Error Triage Workflow

When a flow is failing, follow this sequence:

1. **Find flows with open errors** — `list_flow_errors` without `_id` (optionally `_integrationId`).
2. **See which steps have errors** — `list_flow_errors` with `_id` only.
3. **Analyze error patterns** — `list_flow_errors` with `_id` + `_stepId` to read individual error messages (`errorId`, `retryDataKey`); add `status: "resolved"` to compare with what has already been cleared.
4. **Inspect details** — optional `get_flow_error_retry_data` for the staged payload; `list_execution_logs` for per-record diagnostics when debug logging is armed.
5. **Fix and retry** — fix the export/import/connection with `patch_resource` (or `update_resource` for a full replace), then `triage_flow_errors` with `action: "retry"`.
6. **Resolve without retry** — `triage_flow_errors` with `action: "resolve"` when errors are expected or not worth reprocessing.
7. **Route or group** — `triage_flow_errors` with `action: "assign"` (`errorIds` + `email`) or `action: "tag"` (`errors[{id, rdk}]` + `tagIds` from `list_resources` `resourceType: "tags"`).
8. **Verify** — `run_flow` again and confirm clean execution via `list_flow_runs` with `_flowId` (newest first).

## Connection Setup Workflow

1. **Check for a pre-built connector** — `list_resources` `resourceType: "http-connectors"` with `search`, or `get_schema` `target: "connector"`.
2. **Get the schema** — `get_resource` `resourceType: "connections"`, `schema: true`, `adaptorType` (e.g. `"http"`, `"netsuite"`, `"rdbms"`).
3. **Create the connection** — `create_resource` `resourceType: "connections"` with the correct type and auth configuration.
4. **Get metadata** — `get_resource` `resourceType: "connections"`, `_id`, `includeMetadata: true` to discover available record types and fields.

## Resource Schema Workflow

Before creating exports, imports, or connections, retrieve field schemas:

1. **Get base schema** — `get_resource` with `schema: true` and the `resourceType` (e.g. `"exports"`).
2. **Check for adaptor variants** — if the response lists `availableSubSchemas`, call again with `adaptorType` (e.g. `"http"`).
3. **Create the resource** — use the schema fields to build a valid `body` for `create_resource`.

## Common Patterns

### Full Sync Flow
`list_resources` (`connections`) → `create_resource` (`exports`) → `create_resource` (`imports`) → `create_resource` (`flows`, `disabled: true`) → `run_flow`

### Error Investigation
`list_flow_runs` (`_flowId`) → `list_flow_errors` (`_id`, `_stepId`) → `triage_flow_errors` (`retry` or `resolve`)

### Account Health Audit
`list_flow_errors` (no `_id`) → `list_flow_errors` with `_id` on the worst flows → `list_flow_runs` with `_flowId` for run context

## Important Rules

- **`adaptorType` is case-sensitive.** Use `HTTPExport`, not `httpExport`. Use `NetSuiteDistributedImport`, not `netsuitedistributedimport`.
- **PUT erases omitted fields.** `update_resource` is a full-document replace. Fetch first (`get_resource`), modify, then send the complete object — or use `patch_resource` for a few fields.
- **Never echo `******` back.** Stored credentials are returned masked; a PUT containing the placeholder is blocked (or asks for confirmation) because it would wipe the secret.
- **Create flows with `disabled: true`.** An enabled flow with a schedule runs immediately. Enable only after verification (`patch_resource` `/disabled` → `false`).
- **Schedule is 6-field cron with seconds.** Format: `"? */5 * * * *"`. The first field is always `?`.
- **Sandbox and production must not mix.** `sandbox: true` flows only use `sandbox: true` connections.
- **Connections should be named after the system, not the operation.** "Shopify - my-store" is correct; "Shopify - Customer Upsert" is not, because connections are shared across resources.
- **Filters are per family.** A filter the selected `resourceType` does not support is rejected before any API call, with the supported list — read the error and retry.

## Concept Aliases (for common AI prompts)

When a user asks for a vague concept, route to one of the concrete tools:

- **"Connector schema"** — `list_resources` / `get_resource` `resourceType: "http-connectors"` (HTTP connector catalog; `includeOpenApi` for the OpenAPI fragment) or `get_resource` `resourceType: "connections"` with `includeMetadata: true` for native application metadata (NetSuite, Salesforce, databases, etc.).
- **"Debug log" / "execution log"** — `list_execution_logs` (flow `_id` + `_jobId`; requires debug logging armed on the flow).
- **"Dashboard stats" / "current jobs"** — `list_flow_runs` with `current: true` or a scope filter (`_flowId`, `_integrationId`) and optional `status`; `list_flow_errors` without `_id` for error counts per flow.
- **"OpenAPI spec"** — read the `celigo://resources/api-reference` resource (this MCP server) or the canonical spec at https://github.com/celigo/integrator-api-specs.
- **"Templates"** — `list_marketplace` (and `install_template` to install).
- **Old tool names** — `list_flows`, `upsert_connection`, `list_jobs`, `get_flow` and the other per-resource names still work as aliases and are rewritten onto the tools above; prefer the current names.
