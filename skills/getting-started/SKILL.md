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
- **Tool** -- reusable operation (export + import pair) callable from flows, APIs, AI agents, and MCP servers

## Build Order

Always build bottom-up. Resources reference each other, so dependencies must exist first:

```
1. Connection     (credentials for each system)
2. Export + Import (data source and destination steps, each referencing a connection)
3. Flow           (pipeline wiring exports to imports)
```

Never start by creating a flow -- its exports and imports must exist first, and those require connections.

For APIs and tools, the same principle applies: build the connections, exports, and imports that the API/tool will use, then wire them into the API/tool definition.

<!-- TIER:2 -->

## First Steps

### 1. Configure the CLI

```bash
celigo config set api_token <your-token>       # Set your API bearer token
celigo config set base_url <url>               # Optional: override base URL for sandbox/EU
celigo config show                             # Verify configuration
```

### 2. Build the Account Index

The account index is a local snapshot of all resources in your Celigo account. It enables fast search, dependency analysis, and linting without repeated API calls.

```bash
celigo account snapshot                        # Fetch all resources, build dependency graph
celigo account search <keyword>                # Find resources by name or keyword
celigo account deps <type> <id>                # Show what a resource uses and what uses it
celigo account lint                            # Find orphaned resources, offline connections, untriggered flows
celigo account stats                           # Resource counts by type
```

The index auto-refreshes when stale (default: 4 hours, configurable via `CELIGO_INDEX_STALE_HOURS`). Commands that depend on the index refresh it automatically unless `--no-refresh` is passed.

### 3. Discover Before Building

Before creating new resources, always check what already exists:

- `celigo account search "customer sync"` -- find existing flows, exports, imports by keyword
- `celigo account deps flow <id>` -- see the full resource tree for an existing flow
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
| Configure lookup caches | [configuring-lookup-caches](../configuring-lookup-caches/SKILL.md) | How to Build a Lookup Cache |
| Expose tools via MCP for AI agents | [building-mcp-servers](../building-mcp-servers/SKILL.md) | How to Build an MCP Server |
| Manage account users and access | [managing-users](../managing-users/SKILL.md) | Access Strategy Decision Matrix |
