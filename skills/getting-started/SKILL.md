---
name: getting-started
description: Orientation for Celigo integrations -- core concepts, build order, account discovery, planning discipline, sandbox awareness, and which skill to use for each task. Start here when the task is unclear or the user is new to Celigo.
---

<!-- TIER:1 -->

# Getting Started with Celigo Integrations

## Core Concepts

Celigo integrations move data between external systems through a small set of resource types:

- **Connection** -- credentials and configuration that authenticate to an external system (Salesforce, NetSuite, HTTP API, database, FTP, etc.)
- **Export** -- data source step that fetches records from a connected system (or receives them via webhook)
- **Import** -- data destination step that writes records to a connected system
- **Flow** -- pipeline that connects exports to imports, with optional branching, transformation, and scripting
- **Integration** -- named container that groups related flows, connections, and resources
- **Script** -- JavaScript hook that runs at specific points in the data pipeline (preSavePage, preMap, postMap, postSubmit, postResponseMap)
- **API** -- custom HTTP endpoint that exposes integration logic for synchronous external consumption
- **Tool** -- reusable building block (input schema -> routers with lookups/imports -> output contract) callable from flows, APIs, AI agents, MCP servers, and other tools
- **AI agent** -- LLM-powered pipeline step (stored as an import) that classifies, extracts, summarizes, or generates data mid-pipeline
- **Guardrail** -- safety/compliance check (PII, moderation, AI evaluation) that flags records; the parent pipeline decides what happens to flagged records
- **Lookup cache** -- account-level key-value store for fast in-memory reference lookups (cross-reference IDs, large translation tables, dedup markers)

### How each surface is invoked

The three pipeline-carrying resources differ mainly in what starts them:

| Resource | Started by | Schedule/listeners | Runtime controls |
|---|---|---|---|
| **Flow** | Itself -- cron schedule, listener/webhook, or another flow chaining into it | Yes | Yes (`proceedOnFailure`, `skipRetries`, chaining, ...) |
| **API** | An external HTTP caller; the request IS the source record | No | No -- errors land on the fail response; retries are the caller's concern |
| **Tool** | A consumer -- flow step, AI agent, API, MCP server, or another tool | No | No -- the consumer decides error behavior |

"Every night at 2 AM" or "when a webhook fires" always points at a flow. "Reachable from outside Celigo over HTTP" points at an API. "Reusable from multiple places inside Celigo" points at a tool (and a recipe needed both inside and outside is a tool exposed behind an API).

## Build Order

Always build bottom-up. Resources reference each other, so dependencies must exist first:

```
1. Connection     (credentials for each system)
2. Export + Import (data source and destination steps, each referencing a connection)
3. Flow           (pipeline wiring exports to imports)
```

Never start by creating a flow -- its exports and imports must exist first, and those require connections.

At each layer, match the connector to the target application -- raw HTTP is the fallback, not the default. Use the application-specific adaptor when one exists (NetSuite, Salesforce, databases, FTP/S3); otherwise check for a pre-built HTTP connector (550+ apps: `celigo http-connectors list`); hand-write HTTP config only when neither covers the target. See [configuring-connections](../configuring-connections/SKILL.md#4-check-for-a-pre-built-connector-and-global-iclient) and the adaptor decision matrices in [configuring-exports](../configuring-exports/SKILL.md#adaptor-decision-matrix) / [configuring-imports](../configuring-imports/SKILL.md#adaptor-decision-matrix).

For APIs and tools, the same principle applies: build the connections, exports, and imports that the API/tool will use, then wire them into the API/tool definition.

<!-- TIER:2 -->

## First Steps

### 0. Pick your surface: CLI or MCP

Skills in this pack show `celigo ...` CLI commands, but there are two equivalent ways to execute most operations:

- **The Celigo CLI** -- what the command blocks in these skills show.
- **The Celigo Platform MCP server** -- if your agent is connected to it, the same operations are MCP tools. Translate CLI blocks directly: `list_<type>` / `upsert_<type>` replace `celigo <type> list|get|create|update`, `delete_resource` replaces `celigo <type> delete`, and `run_flow`, `cancel_job`, `list_jobs`, `list_flow_errors`, `list_execution_logs`, `deploy_template`, and `get_schema` cover running, monitoring, deploying, and schema lookups. The MCP server also has tools with no CLI equivalent, such as `search_knowledge_base` and `triage_flow_errors`.

A few operations are CLI-only (no MCP tool): the local account index (`celigo account snapshot|search|dependencies|lint`), API-token management (`celigo accesstokens ...`), stacks, on-premise agents, and user management. For those, use the CLI, the integrator.io REST API, or the UI.

### 1. Configure the CLI

```bash
celigo config set api_token <your-token>       # Set your API bearer token
celigo config set base_url <url>               # Optional: override base URL for sandbox/EU
celigo config show                             # Verify configuration
```

The CLI accepts either token kind from **Resources > API tokens** as its bearer token: a **personal access token** (any user can generate one; inherits your own permissions; expires after 90 days by default) or an **account API token** (owner/admin-created, scopeable, long-lived -- prefer it for CI). See [managing-api-tokens](../managing-api-tokens/SKILL.md).

### 2. Build the Account Index

The account index is a local snapshot of all resources in your Celigo account. It enables fast search, dependency analysis, and linting without repeated API calls.

```bash
celigo account snapshot                        # Fetch all resources, build dependency graph
celigo account search <keyword>                # Find resources by name or keyword
celigo account dependencies <type> <id>        # Show what a resource uses and what uses it
celigo account lint                            # Find orphaned resources, offline connections, untriggered flows
celigo account stats                           # Resource counts by type
```

The index auto-refreshes when stale (default: 4 hours, configurable via `CELIGO_INDEX_STALE_HOURS`). Commands that depend on the index refresh it automatically unless `--no-refresh` is passed.

### 3. Discover Before Building

Before creating new resources, always check what already exists:

- `celigo account search "customer sync"` -- find existing flows, exports, imports by keyword
- `celigo account dependencies flow <id>` -- see the full resource tree for an existing flow
- `celigo account lint` -- identify orphaned exports/imports you might reuse

## Planning Discipline

Before writing any JSON or CLI commands, answer these questions:

**What kind of operation is this?**

- **Modifying an existing resource's config** (export settings, import mappings, scripts) -- work on the resource directly with `celigo <type> set` or `celigo <type> get` + edit + `celigo <type> update`. Don't rebuild the flow
- **Modifying an existing flow's structure** (add/remove steps, change schedule) -- GET the flow, modify the structure, PUT it back
- **Building something new where every step is clear** -- build directly, bottom-up
- **Any ambiguity about what to build** -- design first (see checklist below)

**Design checklist (when ambiguity exists):**

- What source systems? What destination systems?
- What data moves between them, in which direction?
- How often? (cron schedule, webhook trigger, on-demand)
- What happens when a step fails? (`proceedOnFailure`, error notifications)
- Do downstream steps need data from upstream responses? (response mapping)
- Is this a one-off or a reusable template? (abstract/instance flow)
- Sandbox or production? (never mix -- `sandbox: true` flows only use `sandbox: true` connections)

<!-- TIER:3 -->

## Sandbox vs Production

Celigo enforces strict separation:

- A `sandbox: true` connection can only be used by `sandbox: true` flows
- A production (non-sandbox) connection can only be used by production flows
- Mixing sandbox and production resources will cause runtime errors

When testing, always create flows with `disabled: true` and verify before enabling.

## Which Skill to Use

| Task | Skill | Key sections |
|---|---|---|
| Set up credentials for an external system | [configuring-connections](../configuring-connections/SKILL.md) | Connection Type Decision Matrix, iClients |
| Fetch data from a system (export) | [configuring-exports](../configuring-exports/SKILL.md) | Adaptor Decision Matrix, Export Execution Pipeline |
| Write data to a system (import) | [configuring-imports](../configuring-imports/SKILL.md) | Adaptor Decision Matrix, Import Execution Pipeline |
| Wire exports to imports in a pipeline | [building-flows](../building-flows/SKILL.md) | Flow Topologies, How to Build a Flow |
| Build a synchronous HTTP endpoint | [building-apis](../building-apis/SKILL.md) | Builder vs Script mode, API Execution Pipeline |
| Build a reusable operation | [building-tools](../building-tools/SKILL.md) | Tool Concepts, Tool Execution Pipeline |
| Map fields between source and destination | [writing-mappings](../writing-mappings/SKILL.md) | Mapper 2.0 Workflow, Transformation 2.0 |
| Write dynamic expressions in configs | [writing-handlebars](../writing-handlebars/SKILL.md) | Helper Catalog, Expression Patterns |
| Write JavaScript hooks | [writing-scripts](../writing-scripts/SKILL.md) | Hook Point Decision Matrix |
| Set up EDI/B2B trading partner integrations | [building-b2b](../building-b2b/SKILL.md) | EDI Standards, Trading Partner Onboarding |
| Debug a failing flow | [troubleshooting-flows](../troubleshooting-flows/SKILL.md) | Error Diagnosis Framework, Diagnostic Workflow |
| Configure filters on exports or imports | [configuring-filters](../configuring-filters/SKILL.md) | Expression Syntax, Filter Placement |
| Set up AI-powered import processing | [configuring-ai-agents](../configuring-ai-agents/SKILL.md) | Provider Decision Matrix |
| Add PII/moderation/policy checks | [configuring-guardrails](../configuring-guardrails/SKILL.md) | Type Decision Matrix, Guardrails Flag, They Don't Enforce |
| Configure lookup caches | [configuring-lookup-caches](../configuring-lookup-caches/SKILL.md) | How to Build a Lookup Cache |
| Expose tools via MCP for AI agents | [building-mcp-servers](../building-mcp-servers/SKILL.md) | How to Build an MCP Server |
| Manage account users and access | [managing-users](../managing-users/SKILL.md) | Access Strategy Decision Matrix |
| Organize flows/APIs in a container; clone or promote across environments | [managing-integrations](../managing-integrations/SKILL.md) | Clone Decision Matrix, ILM Reference |
| Install a prebuilt Template or Integration App from the Marketplace | [using-marketplace-templates](../using-marketplace-templates/SKILL.md) | Templates vs Integration Apps |
| Create inbound API tokens for scripts, pipelines, or MCP servers | [managing-api-tokens](../managing-api-tokens/SKILL.md) | Access Scope Decision Matrix |
| Run extension code on your own server or AWS Lambda | [managing-stacks](../managing-stacks/SKILL.md) | Do You Need a Stack?, server vs lambda |
| Reach a private system behind your firewall | [managing-on-premise-agents](../managing-on-premise-agents/SKILL.md) | Do You Need an On-Premise Agent? |

## When No Skill Covers the Shape

The reference schemas shipped with these skills cover the high-stakes shapes where guessing corrupts data, not the whole API surface. When you need a field or resource no skill documents, use the live sources — in this order:

1. **A real resource is ground truth.** `celigo <type> get <id>` returns the exact wire shape; request bodies for `create`/`update` are exactly what GET returns. Copying a live resource beats any documentation.
2. **The developer docs are agent-native and always current.** Every API reference page is fetchable as markdown — append `.md` to any page URL (e.g. `https://developer.celigo.com/api/api-reference/flows.md`), start from the index at `https://developer.celigo.com/llms.txt`, or ask a direct question: `GET https://developer.celigo.com/readme.md?ask=<question>`.
3. **Prefer a shipped schema when one exists** — schemas under each skill's `references/` are synced from the API specs and reviewed before shipping, and their `x-celigo-ai-guidance` notes carry hazards the raw docs don't.
