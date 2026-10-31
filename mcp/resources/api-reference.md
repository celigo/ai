---
uri: celigo://resources/api-reference
name: API Reference (OpenAPI v1)
description: >-
  Summary of the Celigo integrator.io public REST API v1 that backs the
  MCP tools. Organized by resource with paths, HTTP methods, and MCP
  tool-name mappings. Use this when you need to understand the underlying
  API for a tool, or to discover endpoints/tools by resource. Links to
  the authoritative OpenAPI spec in the integrator-api-specs repo.
mimeType: text/markdown
---
# Celigo API Reference (OpenAPI v1)

This resource summarizes the Celigo integrator.io public REST API (v1) that backs the Celigo MCP tools. The authoritative, machine-readable source is the OpenAPI 3.1 specification in the sibling repository [`integrator-api-specs`](https://github.com/celigo/integrator-api-specs) (source under `specs/v1/`, bundled to `dist/v1/openapi.yaml`).

This page only documents endpoints currently exposed as MCP tools by this server. The Celigo API is much larger; see the canonical OpenAPI spec for the complete surface.

## Base URLs

- US (default): `https://api.integrator.io`
- EU: `https://api.eu.integrator.io`
- AU: `https://api.au.integrator.io`
- CA: `https://api.ca.integrator.io`

All paths below are relative to the base URL.

## Auth

All requests require `Authorization: Bearer <token>` where `<token>` is an access token for the target account. Tokens are scoped to the account and environment (production vs sandbox).

## Resource Catalog (exposed tools)

Each resource family has one read tool and one write tool, and all families share one delete tool:

- `list_<plural>` — `GET /v1/<plural>` lists the collection; with `_id`, `GET /v1/<plural>/{_id}` returns one resource's full configuration.
- `upsert_<singular>` — without `_id`, `POST /v1/<plural>` creates; with `_id`, `PUT /v1/<plural>/{_id}` replaces the whole document.
- `delete_resource` — `DELETE /v1/<plural>/{_id}`, with the family chosen by `resourceType`.

### Integrations — `/v1/integrations`

- `list_integrations`, `upsert_integration`, `delete_resource` (`resourceType: "integrations"`)
- `POST /v1/integrations/template/{_id}` — `install_template` (installs a published marketplace template as a new integration; the body needs a `connectionMap`)

Revisions, snapshots, and template downloads are not exposed in the current MCP scope.

### Flows — `/v1/flows`

- `list_flows`, `upsert_flow`, `delete_resource` (`resourceType: "flows"`); `list_flows` also takes `_integrationId`, and `includeErrorCounts`, `hasOpenErrors` or `numError_gte` to add and filter by each flow's open-error count
- `PATCH /v1/flows/{_id}` — `patch_flow` (JSON Patch, `replace` only, on whitelisted paths such as `/disabled`, `/name`, `/description`, `/schedule`, `/timezone` and `/logging/debugUntil`)
- `POST /v1/flows/{_id}/run` — `run_flow` (optional `export.startDate` / `export.endDate` and `_exportIds`)
- `GET /v1/flows/{_id}/errors`, `GET /v1/flows/{_id}/{_stepId}/errors` — `list_flow_errors` (one step's open errors, a flow's by step, or a summary across flows)
- `GET|PUT /v1/flows/{_id}/{_stepId}/{retryDataKey}/data` — `get_flow_error_retry_data`, `update_flow_error_retry_data`
- `triage_flow_errors`, one `action` per call: `POST /v1/flows/{_id}/{_stepId}/retry` (`retry`), `PUT /v1/flows/{_id}/{_stepId}/resolved` (`resolve`), `PUT /v1/flows/{_id}/{_stepId}/errors/assign` (`assign`), `PUT /v1/flows/{_id}/{_stepId}/tags` (`tag`; tag codes from `list_tags`, `GET /v1/tags`)
- `GET /v1/flows/{_id}/jobs/{_jobId}/logs` — `list_execution_logs`, then a record's step timeline (`.../logs/metadata/query`) or one stage's data (`.../logs/data/query`). A run keeps what its log mode captured (the job's `logMode`); a debug window (`logging.debugUntil`) captures every stage of the runs after it, and turning logging on adds nothing to past runs.

Resolved-error history is not exposed.

### Connections — `/v1/connections`

- `list_connections`, `upsert_connection`, `delete_resource` (`resourceType: "connections"`)

Connection ping, test, and debug-log capture are not exposed; test a connection in the Celigo UI.

### Exports / Imports — `/v1/exports`, `/v1/imports`

- `list_exports` / `upsert_export`, `list_imports` / `upsert_import`, `delete_resource`

Invoking an export or an import on its own, and previewing one, are not exposed.

### Jobs — `/v1/jobs`

- `GET /v1/jobs` — `list_flow_runs` (list mode needs a scope: `_flowId` or `_integrationId` for flow and retry runs, `_flowJobId` or `_parentJobId` for step jobs)
- `GET /v1/jobs/{_id}/family` — `list_flow_runs` with `_id` (the run plus a child job per step)
- `POST /v1/jobs/current` — `list_current_jobs` (queued, running, or canceling)
- `PUT /v1/jobs/{_id}/cancel` — `cancel_flow_run`

### Scripts — `/v1/scripts`

`list_scripts`, `upsert_script`, `delete_resource`. (Script logs, audit trail, and debug capture are deferred from the current MCP scope.)

### Audit — `/v1/audit`

- `GET /v1/audit` — `list_audit_log_entries` (filters: `resourceType`, `_resourceId`, `_byUserId`, `source`, `action`, `fieldPath`, `from`, `to`, `limit`)

### Connectors and application metadata

- `get_schema` with `target='connector'` and an HTTP connector's id or name returns the connector's definition (auth, endpoints, parameters, pagination); `target='connector_openapi'` returns its OpenAPI fragment
- `get_schema` with `target='connector'` and a connection `_id` returns the connected application's metadata (record types and fields for NetSuite, Salesforce, databases, etc.)

### Marketplace — `/v1/published/combined`

- `POST /v1/published/combined` — `list_marketplace` (the published catalog; `_id` previews one template's blueprint)
- `POST /v1/integrations/template/{_id}` — `install_template`

### Other resources (`list_*` / `upsert_*` / `delete_resource`)

- **Agents** — `/v1/imports?adaptorType=AiAgentImport` (`list_ai_agents`, `upsert_ai_agent`)
- **Guardrails** — `/v1/imports?adaptorType=GuardrailImport` (`list_guardrails`, `upsert_guardrail`)
- **APIs** — `/v1/apis`
- **iClients** — `/v1/iclients`
- **Lookup Caches** — `/v1/lookupcaches`; entries through `list_lookup_cache_data`, `upsert_lookup_cache_data`, and `delete_lookup_cache_data`
- **Tools** — `/v1/tools`
- **MCP Servers** — `/v1/mcpservers`
- **EDI Profiles** — `/v1/ediprofiles`; **File Definitions** — `/v1/filedefinitions`
- **Environments** — `/v1/environments` (read-only: `list_environments`)

Also exposed: EDI transactions (`list_edi_transactions`, `update_edi_fa_status`), Celigo Storage (`list_storage_items`, `upsert_storage_item`, `restore_storage_item`, `get_storage_file_download_url`, `cancel_storage_upload`), users (`list_users`, `manage_user`), the Celigo knowledge base (`search_docs`), product feedback (`submit_feedback`), and, on builds that serve skills, `get_skill`. Licenses and subscription usage (`/v1/licenses`, `/v1/licenseEntitlementUsage`) are not exposed.

## Tool Naming Conventions

- `list_<plural>` — list the collection, or set `_id` to fetch one resource (e.g., `list_flows`)
- `upsert_<singular>` — create without `_id`; replace the whole document with `_id` (e.g., `upsert_flow`)
- `delete_resource` — one delete tool for every family, chosen by `resourceType`
- Operations: `<verb>_<noun>` (e.g., `run_flow`, `patch_flow`, `cancel_flow_run`, `triage_flow_errors`)

There are no separate `get_*`, `create_*`, or `update_*` tools for resources.

## Phases

Each tool belongs to release phase 1 or 2, and the server's `ENABLED_PHASES` setting picks which phases a deployment lists; the default is `1,2`.

- **Phase 1** — every read, plus the operational actions: `run_flow`, `cancel_flow_run`, `triage_flow_errors`, `update_flow_error_retry_data`, and `upsert_lookup_cache_data`.
- **Phase 2** — configuration writes: the resource `upsert_*` tools, `patch_flow`, `delete_resource`, `delete_lookup_cache_data`, `install_template`, `manage_user`, the storage writes, `update_edi_fa_status`, and `submit_feedback`.

## Where to Find More

- API reference, one page per resource: https://developer.celigo.com/api/api-reference
- Full OpenAPI spec (source): https://github.com/celigo/integrator-api-specs/tree/main/specs/v1
- Bundled spec (dist): https://github.com/celigo/integrator-api-specs/tree/main/dist/v1
- The tools this server offers, with their parameters: its own tool list (`tools/list`)
