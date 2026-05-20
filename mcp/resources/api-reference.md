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

This page only documents endpoints currently exposed as MCP tools by this server. The Celigo API is much larger; see `endpoints.yml` and the canonical OpenAPI spec for the complete surface.

## Base URLs

- US (default): `https://api.integrator.io`
- EU: `https://api.eu.integrator.io`

All paths below are relative to the base URL.

## Auth

All requests require `Authorization: Bearer <token>` where `<token>` is an access token for the target account. Tokens are scoped to the account and environment (production vs sandbox).

## Resource Catalog (exposed tools)

The MCP tool name is shown in `backticks` where helpful.

### Integrations — `/v1/integrations`

- `GET /v1/integrations` — `list_integrations`
- `GET /v1/integrations/{_id}` — `get_integration`
- `POST /v1/integrations` — `create_integration`
- `PUT /v1/integrations/{_id}` — `update_integration` / `set_integration`
- `DELETE /v1/integrations/{_id}` — `delete_integration`

### Flows — `/v1/flows`

- `GET /v1/flows` — `list_flows`
- `GET /v1/flows/{_id}` — `get_flow`
- `POST /v1/flows` — `create_flow`
- `PUT /v1/flows/{_id}` — `update_flow` / `set_flow`
- `DELETE /v1/flows/{_id}` — `delete_flow`
- `POST /v1/flows/{_id}/run` — `run_flow` (**internal**, not in public spec)
- `POST /v1/flows/runs/stats` — `get_dashboard_stats` (completed flow-run jobs for the dashboard)
- `GET /v1/flows/{_id}/errors` — `get_flow_error_summary`
- `GET /v1/flows/{_id}/{stepId}/errors` — `get_flow_errors`
- `GET /v1/flows/{_id}/{stepId}/resolved` — `get_flow_resolved_errors`
- `PUT /v1/flows/{_id}/{stepId}/resolved` — `resolve_errors` (body: `{ errors: [<errorId>, ...] }`)
- `POST /v1/flows/{_id}/{stepId}/retry` — `retry_errors` (body: `{ retryDataKeys }` or `{ errorIds }` or `{ errorFileId }`; note no `errors/` prefix)
- `PUT /v1/flows/{_id}/{stepId}/errors/assign` — `assign_errors` (body: `{ errorIds, email, _userId? }`)
- `PUT /v1/flows/{_id}/{stepId}/tags` — `tag_errors` (body: `{ errorIds, tagIds }`; tag codes from `GET /v1/tags`)

### Connections — `/v1/connections`

- `GET|POST|PUT|DELETE` standard CRUD
- `POST /v1/connections/{_id}/ping` — `ping_connection`
- `POST /v1/connections/{_id}/test` — `test_connection` (more thorough than ping)
- `GET /v1/connections/{_id}/debug` — `get_connection_debug_logs` (capture must be enabled by setting `debugDate` to a future ISO timestamp on the connection; **internal**)

### Exports / Imports — `/v1/exports`, `/v1/imports`

- Standard CRUD on both resources
- `POST /v1/exports/{_id}/invoke` — `invoke_export` (test-fetch a sample page; **internal**)

### Integrations — `/v1/integrations`

Standard CRUD only. Revisions, snapshots, and template downloads are not exposed in the current MCP scope.

### Jobs — `/v1/jobs`, `/v1/flows/{flowId}/jobs`, `/v1/integrations/{integrationId}/jobs`

- `GET /v1/jobs` — `list_jobs` (one of `_flowId`/`_integrationId`/`_jobId` is required)
- `GET /v1/jobs/{_id}` — `get_job`
- `POST /v1/jobs/current` — `get_current_jobs` (in-progress, with body filter)
- `PUT /v1/jobs/{_id}/cancel` — `cancel_job`
- `GET /v1/jobs/{_id}/diagnostics` — `get_execution_log` (signed URL to diagnostics bundle)
- `GET /v1/jobs/{_id}/errors` — `get_job_errors` (**internal**)
- `GET /v1/flows/{flowId}/jobs/latest` — `get_latest_job_for_flow`
- `GET /v1/integrations/{integrationId}/jobs/latest` — `get_latest_job_for_integration`

### Scripts — `/v1/scripts`

Standard CRUD. (Script logs, audit trail, and debug capture are deferred from the current MCP scope.)

### Audit — `/v1/audit`

- `GET /v1/audit` — `list_audit_entries` (filters: `resourceType`, `_resourceId`, `_byUserId`, `source`, `action`, `from`, `to`, `limit`, `offset`)

### HTTP Connectors — `/v1/httpconnectors`

- `GET /v1/httpconnectors` — `list_http_connectors`
- `GET /v1/httpconnectors/{_id}` — `get_http_connector` (full connector schema: auth, endpoints, params, pagination, rate limits)

### Marketplace Templates — `/v1/templates`

- `GET /v1/templates` — `list_templates` (browse pre-built integration templates; `tolerateForbidden` because marketplace access is plan-gated)

### Metadata — `/v1/metadata`

- `GET /v1/metadata/application/{applicationId}` — `get_application_metadata` (record types and fields for connected apps like NetSuite, Salesforce, databases)

### Other resources (standard CRUD)

- **Agents** — `/v1/imports?adaptorType=AiAgentImport`
- **Guardrails** — `/v1/imports?adaptorType=GuardrailImport`
- **Async Helpers** — `/v1/asynchelpers`
- **APIs** — `/v1/apis`
- **iClients** — `/v1/iclients`
- **Lookup Caches** — `/v1/lookupcaches`
- **Tools** — `/v1/tools`
- **MCP Servers** — `/v1/mcpservers`
- **Environments** — `/v1/environments` (read-only: `list_environments`)

## Tool Naming Conventions

- List: `list_<plural>` (e.g., `list_flows`)
- Get: `get_<singular>` (e.g., `get_flow`)
- Create: `create_<singular>` / Update: `update_<singular>` / Delete: `delete_<singular>`
- Custom ops: `<action>_<singular>` (e.g., `ping_connection`, `run_flow`)

## Phases

Tools are tagged with `phase` 1/2/3 in `endpoints.yml`:

- **Phase 1** — core, always-on tools (enabled by default). Includes all reads, plus the limited Phase 1 actions: `ping_connection`, `test_connection`, `run_flow`, `cancel_job`, `resolve_errors`, `retry_errors`, `tag_errors`, `assign_errors`, `invoke_export`.
- **Phase 2** — write tools and the rest of the catalog (`create_*`, `update_*`, `delete_*`, `set_*`). Enable via `ENABLED_PHASES=1,2`.
- **Phase 3** — reserved for future risky/specialized operations.

## Where to Find More

- Full OpenAPI spec (source): https://github.com/celigo/integrator-api-specs/tree/main/specs/v1
- Bundled spec (dist): https://github.com/celigo/integrator-api-specs/tree/main/dist/v1
- Sibling clone (if present): `../integrator-api-specs/specs/v1/`
- This MCP server's endpoint map: `endpoints.yml` at the root of this repo
