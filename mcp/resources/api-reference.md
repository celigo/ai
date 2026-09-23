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
- AU: `https://api.au.integrator.io`
- CA: `https://api.ca.integrator.io`

All paths below are relative to the base URL.

## Auth

All requests require `Authorization: Bearer <token>` where `<token>` is an access token for the target account. Tokens are scoped to the account and environment (production vs sandbox).

## Resource Catalog (exposed tools)

Since io-mcp-server 0.12.0 the CRUD surface is six verb tools keyed by `resourceType`; the per-resource `list_<plural>` / `upsert_<singular>` names (and the older `get_*` / `create_*` / `update_*` / `delete_*` names) still resolve as aliases but are deprecated.

| REST | MCP tool |
|------|----------|
| `GET /v1/<collection>` | `list_resources` (`resourceType`, family-specific filters, `limit`/`cursor`) |
| `GET /v1/<collection>/{_id}` | `get_resource` (`resourceType`, `_id`; `schema: true` returns the family's JSON schema instead) |
| `POST /v1/<collection>` | `create_resource` (`resourceType`, `body`) |
| `PUT /v1/<collection>/{_id}` | `update_resource` (`resourceType`, `_id`, complete `body`) |
| `PATCH /v1/<collection>/{_id}` | `patch_resource` (`resourceType`, `_id`, JSON Patch `body`; whitelisted paths per family) |
| `DELETE /v1/<collection>/{_id}` | `delete_resource` (`resourceType`, `_id`) |

`resourceType` → collection:

| `resourceType` | Collection | Verbs |
|---|---|---|
| `integrations` | `/v1/integrations` | list, get, create, update, patch, delete |
| `flows` | `/v1/flows` | list (`_integrationId`, `name`, `disabled`, `sort_by`, `includeInstances`, `_abstractFlowId`), get, create, update, patch, delete |
| `connections` | `/v1/connections` | list (`_integrationId`, `externalId`), get (`includeMetadata` → `GET /v1/metadata/application/{_id}`), create, update, patch, delete |
| `exports` / `imports` | `/v1/exports`, `/v1/imports` | list (`_integrationId`, `externalId`), get, create, update, delete |
| `ai-agents` / `guardrails` | `/v1/imports?adaptorType=AiAgentImport` / `GuardrailImport` | list, get, create, update, delete |
| `scripts` | `/v1/scripts` | list, get, create, update, patch, delete |
| `lookup-caches` | `/v1/lookupcaches` | list, get, create, update, delete (entries via the data ops below) |
| `tags` | `/v1/tags` | list, get, create, update, patch, delete |
| `tools` | `/v1/tools` | list (`publishedOnly`), get, create, update, patch, delete |
| `mcp-servers` | `/v1/mcpservers` | list, get, create, update, patch, delete |
| `apis` | `/v1/apis` | list (`name`, `disabled`, `_integrationId`), get, create, update, patch, delete |
| `iclients` | `/v1/iclients` | list, get, create, update, delete |
| `environments` | `/v1/environments` | list, get (read-only) |
| `edi-profiles` / `file-definitions` | `/v1/ediprofiles`, `/v1/filedefinitions` | list, get, create, update, delete (B2B Manager) |
| `http-connectors` | `/v1/httpconnectors` | list (`search`), get (`includeOpenApi`) — read-only connector catalog |

### Operations (not CRUD)

- `POST /v1/flows/{_id}/run` — `run_flow`
- `GET /v1/flows/{flowId}/jobs`, `GET /v1/integrations/{integrationId}/jobs`, `GET /v1/jobs/{_id}` (+ children), `POST /v1/jobs/current` — `list_flow_runs` (`_flowId` / `_integrationId` history, `_id` one run, `current: true` in-progress, `includeFiles` for signed URLs)
- `PUT /v1/jobs/{_id}/cancel` — `cancel_flow_run`
- `GET /v1/integrations/{_id}/errors` (account-wide rollup), `GET /v1/flows/{_id}/errors`, `GET /v1/flows/{_id}/{stepId}/errors`, `GET /v1/flows/{_id}/{stepId}/resolved` — `list_flow_errors` (modes by `_id` / `_stepId`; `status: open|resolved`)
- `POST …/retry`, `PUT …/resolved`, `PUT …/errors/assign`, `PUT …/tags` on `/v1/flows/{_id}/{stepId}` — `triage_flow_errors` (`action`: `retry` | `resolve` | `assign` | `tag`)
- `GET|PUT /v1/flows/{_id}/{stepId}/retries/{retryDataKey}` — `get_flow_error_retry_data`, `update_flow_error_retry_data`
- Execution logs index + metadata + data — `list_execution_logs` (flow `_id` + `_jobId`; `status`, `traceKeyPrefix`, `_expOrImpId`, `sort`, paging)
- `POST /v1/lookupcaches/{_id}/getData`, `PUT|POST /v1/lookupcaches/{_id}/data`, `DELETE /v1/lookupcaches/{_id}/data` — `list_lookup_cache_data`, `upsert_lookup_cache_data`, `delete_lookup_cache_data`
- `GET /v1/audit` — `list_audit_log_entries` (`resourceType`, `_resourceId`, `_byUserId`, `source`, `action`, time range)
- `POST /v1/ediTransactions/query`, `GET /v1/ediTransactions/{_id}`, `PATCH /v1/ediTransactions` — `list_edi_transactions`, `update_edi_fa_status`
- `GET /v1/marketplace` (+ template preview), `POST /v1/integrations/template/{_id}` — `list_marketplace`, `install_template`
- Celigo Storage (`/v1/storage/...`) — `list_storage_items`, `upsert_storage_item` (files, folders, presigned upload, `restore`)
- `/v1/ashares`, `/v1/shared/ashares`, `/v1/endusers`, `/v1/invites` — `list_users`, `manage_user` (`userType` required)
- `POST /v1/feedbacks` — `submit_feedback`
- Composites without a single route: `get_schema` (resource/connector schemas), `search_docs` (Knowledge Base)

## Tool Naming Conventions

- CRUD: `<verb>_resource` with `resourceType` — `list_resources`, `get_resource`, `create_resource`, `update_resource`, `patch_resource`, `delete_resource`.
- Operations: `<action>_<noun>` (e.g., `run_flow`, `cancel_flow_run`, `triage_flow_errors`) or `list_<plural>` for non-CRUD collections (`list_flow_runs`, `list_flow_errors`, `list_audit_log_entries`).
- Deprecated aliases: `list_<plural>` / `upsert_<singular>` per resource (surface v2, removed after 2026-12-31 from `tools/list`; alias until at least 2027-06-30), and the surface-v1 `get_*` / `create_*` / `update_*` / `delete_*` / `list_jobs` / `cancel_job` / `deploy_template` names.

## Phases

Tools are tagged with `phase` 1/2 in `endpoints.yml`:

- **Phase 1** — reads and operate actions (`list_resources`, `get_resource`, `run_flow`, `cancel_flow_run`, `triage_flow_errors`, `list_flow_errors`, …).
- **Phase 2** — writes (`create_resource`, `update_resource`, `patch_resource`, `delete_resource`, `upsert_*` data/storage ops, `install_template`, `manage_user`). Both phases are on by default (`ENABLED_PHASES=1,2`); `ENABLED_PHASES=1` yields a read-only server.

## Where to Find More

- Full OpenAPI spec (source): https://github.com/celigo/integrator-api-specs/tree/main/specs/v1
- Bundled spec (dist): https://github.com/celigo/integrator-api-specs/tree/main/dist/v1
- Sibling clone (if present): `../integrator-api-specs/specs/v1/`
- This MCP server's endpoint map: `endpoints.yml` at the root of this repo
