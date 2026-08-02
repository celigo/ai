---
name: building-tools
description: Build Celigo tool resources -- reusable building blocks that encapsulate lookups, imports, transforms, and branching behind input/output contracts. Callable from flows, APIs, AI agents, MCP servers, and other tools. Use when creating tools, adding steps, or configuring routing.
---

<!-- TIER:1 -->

# Building Tools

A tool is Celigo's **first-class reusable building block**. It encapsulates logic -- lookups, imports, transforms, branching -- behind a defined input and output contract. Build it once, use it everywhere: from Flows, APIs, AI Agents, MCP Servers, and other Tools.

## Tool Concepts

**Why tools exist:** Without tools, users build the same lookup-transform-import patterns repeatedly across Flows, APIs, and Agents. Tools solve this by providing a governed, composable abstraction: one definition, many consumers, consistent behavior.

**When to build a tool:**

- You're building an **MCP server** -- MCP servers expose tools as endpoints; every piece of logic an MCP server offers must be a tool
- The same logic is needed by **2+ consumers** (flows, APIs, agents, MCP servers) -- build once, call everywhere
- You want **connection flexibility** -- callers can pass different connections to the same tool definition
- You're **composing smaller pieces** -- tools can call other tools for nested orchestration

**When NOT to build a tool:**

- The logic is **specific to one flow or API and won't be reused** -- inline it as a lookup/import processor directly
- You need **abstract/instance templating** for multi-tenant patterns -- use abstract flows

**Tool vs API:** the split is how the work gets invoked. An **API** is reachable from *outside* Celigo over HTTP (a partner system, a customer-facing app). A **tool** is reachable only from *inside* Celigo (flow steps, AI agents, APIs, other tools). If a recipe must be reachable from both, build it as a tool and expose the tool behind an API endpoint -- the tool stays available to inside-Celigo consumers at the same time.

**Tool vs flow:** tools don't start themselves -- no `schedule`, no listeners, no flow runtime controls (`proceedOnFailure` and friends are the consumer's concern), and no abstract/instance layer (a tool is already the unit of reuse; per-environment variation is handled by the consumer-bound connection model). "Every night, do X" or "when a webhook arrives, do Y" is a flow -- the tool may be the thing the flow *does*.

**Architecture:**

```
Tool
+-- input         -- JSON Schema defining what callers send
+-- routers[]     -- processing pipeline
|   +-- branches[]
|       +-- pageProcessors[]  -- lookups (exports), imports, transfers
+-- output        -- schema, mappings, lookups, hooks defining what the tool returns
```

Routers hold branches, branches hold page processors. Use multiple branches when different inputs need different processing paths. Chain routers via `nextRouterId` for sequential processing stages. The special `nextRouterId: "outputRouter"` exits the tool and returns results.

#### Tool Execution Pipeline

When a tool is invoked:

1. **Input received** -- input data validated against the tool's JSON Schema (`input`)
2. **Router evaluation** -- `routeRecordsUsing` evaluates branch conditions (if multiple branches exist)
3. **Branch selection** -- matching branch processes the input
4. **Page processors** -- each processor executes sequentially (export lookups, import writes)
5. **Response mapping** -- `responseMapping` on each processor carries data to the next processor
6. **Output mapping** -- final output mapped according to the tool's `output` configuration (schema, mappings, lookups, hooks)
7. **Return** -- output returned to the caller (flow, API, AI agent, MCP server)

**Execution mode depends on the caller:**

- Called from a **Flow** -- runs in flow mode (batch-oriented, run console, error management)
- Called from an **API** -- runs in API mode (single request/response)
- Called from an **AI Agent** -- runs with agent context; agent maps connections to the tool
- Called from an **MCP Server** -- exposed as an MCP tool endpoint for external AI clients
- Called from another **Tool** -- nested execution within the parent tool's context

**Connection model:** Always bring-your-own-keys. The caller (flow, API, agent, MCP server) maps connections to the tool at configuration time. MCP Server overrides can swap connections per-server without modifying the tool.

**Build order:** Connection --> Export + Import --> Tool --> (consumer: Flow / API / Agent / MCP Server)

**Concerns beyond the build steps:**

- **Response mapping** -- extract fields from processor responses back into the record. Configured on `pageProcessors[]` entries within branches, but planned when building the processors. For lookups the response has `data[]` and `errors[]` (use `data[0].fieldName` for single results); for imports use `_json.fieldName`. Uses Transformation 1.0 syntax (extract/generate pairs)
- **postResponseMap hook** -- JavaScript processing after response mapping. Also on `pageProcessors[]` entries, but planned when building the processors

#### The Two Flavors of Lookup

"Lookup" refers to two different things in a tool. They live in different places and solve different problems:

- **Branch page-processor lookups** (`pageProcessors[].type: "export"`) -- work-doing lookups inside a router branch that call an external system at runtime ("look up the customer in NetSuite by email"). The data isn't in the tool yet; the export fetches it, and a `responseMapping` pulls fields from the response onto the record so downstream branches and the output can see them. This is the same lookup primitive flows use -- same export resource, same response mapping, same `postResponseMap` hook.
- **Output static lookup tables** (`output.lookups[]`) -- declarative value-translation tables on the output stage. They reach no external system; they are fixed key/value maps defined inline (e.g. a map translating `A` to `Active`, `I` to `Inactive`, `P` to `Pending`, with a `default`). An output `mappings[]` entry references a table by its `name` (via `lookupName`) to translate a field value during output assembly.

Rule of thumb: external system, runtime call --> branch page-processor lookup. Translate one value into another via a fixed table --> output static lookup.

#### Consumer-Bound Connections

A tool never pins connections at design time -- the key difference from flows and APIs:

- **A flow or API pins each of its own steps to a specific connection at build time** -- the connection IDs are baked into the resource.
- **A tool's lookups and imports declare the connections they need**, and the consumer supplies the actual connection at bind time -- when the tool is added as a flow step, attached to an AI agent, exposed behind an API endpoint, or embedded in another tool.

The tool definition stays unchanged across every binding. The same tool can be bound with a sandbox NetSuite connection from one consumer and a production NetSuite connection from another, without forking. Mechanically, the tool's page processors reference underlying export and import resources that carry the connection; binding selects which connection records those resources use in that context. Because of this, knowing which connections a tool requires is part of its design -- those connections must already exist in the consumer's account before the tool can be bound and run there.

## Quick Reference

### Decision Matrix

| You need to... | Build a tool? | Instead use |
|---|---|---|
| Reuse logic across 2+ flows/APIs/agents | Yes | -- |
| Expose logic via MCP server | Yes | -- |
| Allow callers to swap connections | Yes | -- |
| Nest orchestration (tool calls tool) | Yes | -- |
| One-off logic for a single flow | No | Inline lookup/import in flow |
| Multi-tenant templating | No | Abstract/instance flows |

### Minimum Required Fields

Every tool needs at minimum: `name`, `_integrationId`, and an `input.schema`.

### Which Schemas to Read

1. Always: [request.yml](references/schemas/request.yml) (base fields for create/update)
2. Input config: [input.yml](references/schemas/input.yml) (schema, transform, mockInput)
3. Output config: [output.yml](references/schemas/output.yml) (mappings, lookups, hooks)
4. Pipeline config: [router.yml](references/schemas/router.yml) (routing strategy, branches, page processors, response mapping)
5. Response shape: [response.yml](references/schemas/response.yml)

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Base fields (create/update):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **Input configuration:** [input.yml](references/schemas/input.yml) -- schema, transform, mockInput
- **Output configuration:** [output.yml](references/schemas/output.yml) -- mappings, lookups, hooks
- **Router and branch configuration:** [router.yml](references/schemas/router.yml) -- routing strategy, branches, page processors, response mapping

## Related Skills

- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- building lookup exports used as steps in the tool pipeline
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- building imports used as action steps in the tool pipeline
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring tools into flow pipelines
- [building-apis > Quick Reference](../building-apis/SKILL.md#quick-reference) -- exposing tools via API endpoints
- [writing-scripts > Quick Reference](../writing-scripts/SKILL.md#quick-reference) -- script hooks on tool page processors
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- dynamic expressions in request bodies, URIs, and field mappings
- [configuring-filters > Quick Reference](../configuring-filters/SKILL.md#quick-reference) -- input filters on tool steps and router branches

<!-- TIER:2 -->

## How to Build a Tool

### 1. Determine the tool's purpose

What should this tool do when called? Define the inputs it expects and the processing steps it needs.

### 2. Identify the integration

Every tool belongs to an integration. Find or create the integration first.

```bash
celigo integrations list
```

### 3. Check for existing patterns

Before building from scratch, look at what already exists:

```bash
# Search your account (fast, uses local index)
celigo account search "<keyword>"

# Show what an existing tool uses (exports, imports, connections)
celigo account dependencies tool <id>

# Find orphaned resources that could be reused
celigo account lint

# Check if similar tools already exist
celigo tools list

# Search marketplace for pre-built integration templates
celigo templates marketplace
```

The account index auto-refreshes when stale (>4 hours). Force a fresh snapshot with `celigo account snapshot`.

Existing tools in the account are the best reference -- they show proven patterns for that specific customer's setup. Marketplace templates may provide a complete pre-built integration you can install rather than building from scratch.

### 4. Build the connections, exports, and imports

Tools reference exports and imports as page processors in router branches. Build bottom-up: connections first, then exports and imports that use those connections, then the tool that wires them together. See `configuring-exports` and `configuring-imports`.

### 5. Define the input schema

The input schema is a JSON Schema object describing what data the tool accepts. For MCP compatibility, the root schema must have `type: "object"`.

### 6. Configure routing (if needed)

- **No routing** -- all inputs processed the same way; skip routers entirely
- **Filter-based routing** (`routeRecordsUsing: "input_filters"`) -- declarative expression rules on each branch
- **Script-based routing** (`routeRecordsUsing: "script"`) -- custom JavaScript function returns the branch name

### 7. Wire page processors into branches

Each branch contains `pageProcessors[]` -- an ordered list of exports (lookups) and imports (actions). Each processor has:

- `type`: `"export"` or `"import"`
- `_exportId` or `_importId`: reference to the resource
- `responseMapping`: extract fields from the processor response back into the record
- `hooks.postResponseMap`: optional script for post-processing
- `proceedOnFailure`: whether to continue if this step fails

### 8. Configure output

Output mappings transform the processed data into the tool's return value. Supports:

- `mappings[]` -- extract/generate field pairs (Celigo standard mapping format)
- `lookups[]` -- static key-value enrichment tables
- `hooks.preMap` / `hooks.postMap` -- script hooks before and after mapping

Output mappings and branch response mappings both shape data, but at different times. Branch `responseMapping` merges a processor's response onto the in-flight record so *downstream branches and routers* can use it. Output `mappings` assemble the tool's *return value* at the very end -- and they only see the final in-flight record, not raw processor responses. If a processor's response field must appear in the output, it needs a response mapping on that processor first.

### 9. Build the JSON

Reference the [Schema Index](#schema-index) for the exact fields needed. Use the [Which Schemas to Read](#which-schemas-to-read) decision rule to determine which files to consult.

## Refactoring Steps into a Tool

A user can ask to factor a contiguous chunk of steps out of an existing flow, API, or tool into a brand-new reusable tool. The parent keeps behaving as before, but the selected steps are replaced by a single tool-step -- a thin wrapper that maps the parent's data into the new tool's input and binds the connections it needs. When the parent is itself a tool, the new resource is a **sub-tool** and the operation is **tool composition** -- same mechanics.

This operation is **user-driven only.** Trigger phrases: "refactor", "factor out", "extract", "turn this into a tool", "make this part reusable", "pull these steps out as their own tool". It is never something to propose unprompted -- reuse decisions belong to the user, and the operation creates real Celigo records and can mutate shared resources.

How it works:

1. The named steps are resolved to a contiguous selection with a single entry and a single exit (a valid tool topology).
2. The new tool's `input` and `output` schemas are designed against the real record shapes flowing through that boundary.
3. The wrapper is built for the parent to point at, then the parent is rewritten to remove the selected steps and splice in the new tool-step.

**Entry and exit nodes never move.** A flow's trigger steps, an API's request/response bookends, and a tool's input/output nodes are stripped from the selection regardless of whether the user included them -- only the body between them becomes the new tool.

**No resources are cloned.** The new tool's page processors reference the SAME export/import IDs the parent used inline. If those underlying exports/imports are then updated to fit the new tool's input/output shape, the change propagates to every other consumer of those resources (other flows, APIs, tools, MCP servers) -- a platform-wide invariant, not a refactor-specific effect.

**Refactoring cannot be undone.** There is no programmatic inverse; inlining a tool back into its parent is not supported. If the user regrets a refactor, cleanup is manual: delete the new tool and its wrapper, then restore the parent to its previous configuration. Refactor one parent at a time -- factoring steps from several parents into one shared tool is not a single operation.

## CLI Commands

```bash
# CRUD
celigo tools list
celigo tools get <id>
celigo tools create < tool.json
celigo tools update <id> < tool.json
celigo tools set <id> key=value [key2=value2 ...]
celigo tools delete <id>

# Manage page processors
celigo tools add-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>] [-y]
celigo tools remove-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>] [-y]

# Test run
celigo tools test-run <id>
celigo tools test-run-step-results <id> <runId> <exportOrImportId>
celigo tools test-run-step-logs <id> <runId> <exportOrImportId>

# Debug (requires debug enabled on the underlying export/import)
celigo tools debug-requests <id> <exportOrImportId> [--since <minutes>]
celigo tools debug-request-detail <id> <exportOrImportId> <key>

# Discovery
celigo account search "<keyword>"
celigo templates marketplace
```

<!-- TIER:3 -->

## Pre-Submit Checklist

### Required (all tools)
- [ ] `name` is set
- [ ] `_integrationId` references a valid integration
- [ ] `input.schema` is defined with `type: "object"` at root (required for MCP compatibility)

### Pipeline
- [ ] All `_exportId` / `_importId` references in page processors point to existing resources
- [ ] Connections for referenced exports/imports are online
- [ ] Router IDs are unique within the tool
- [ ] All branches merge back to output node (no dangling branches)
- [ ] Last branch in chain uses `nextRouterId: "outputRouter"` to exit the tool

### Cross-resource consistency
- [ ] If response mapping needed: configured on `pageProcessors[]` entries within branches
- [ ] If routing used: `routeRecordsUsing` and branch filters/scripts are configured correctly
- [ ] If tool is for MCP: tool `name` is unique across all tool and API entries in the MCP server

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this.
2. **Router IDs must be unique within the tool.** Branch `nextRouterId` must reference a real router `id` or the special `"outputRouter"` terminal value.
3. **No dangling branches.** All branches must merge back to the output node. A dangling branch causes a configuration error at execution time, even if no record takes that path.
4. **Do not include `routeRecordsTo` or `routeRecordsUsing` on routers unless needed.** If either is present, the API may also require a top-level `dataType` field, triggering validation errors. Omit both for simple tools -- the API defaults correctly.
5. **Tools cannot be deleted while in use.** Check "Used by" dependencies first (flows, APIs, agents, MCP servers referencing the tool).
6. **`add-processor` auto-creates a router.** If the tool has no routers, the command creates a default router with one branch. Otherwise it targets the first router's first branch by default -- use `--router` and `--branch` to target a specific location.
7. **Tool names must be unique in the MCP Server.** The `name` field in `tools[]` on the MCP Server must be unique across all tool AND api entries in that server.
8. **Debug logging is on the export/import, not the tool.** Use `celigo exports enable-debug` or `celigo imports enable-debug` on the resources referenced by page processors, then use `celigo tools debug-requests` to view the logs scoped to the tool.
9. **Test run results may be base64-encoded.** The CLI auto-decodes these, but raw API responses need manual decoding.
10. **Two different things are called "lookup."** A branch page-processor lookup (`pageProcessors[].type: "export"`) calls an external system at runtime; an output static lookup table (`output.lookups[]`) is a fixed value-translation map that reaches nothing. They live in different parts of the tool and are not interchangeable.
11. **Refactoring steps into a tool cannot be undone.** There is no programmatic inline-back; cleanup is manual (delete the new tool and its wrapper, then restore the parent). The operation is user-driven only -- never initiate it unprompted, and it can update shared exports/imports that other consumers also use.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 `_integrationId required` | Missing integration | Set `_integrationId` to a valid integration ID |
| 422 `input.schema invalid` | Bad JSON Schema | Ensure root schema has `type: "object"` and valid JSON Schema syntax |
| 422 `router id not unique` | Duplicate router IDs | Each router `id` must be unique within the tool |
| 422 `dangling branch` | Branch missing exit | Set `nextRouterId` to a valid router ID or `"outputRouter"` on every branch |
| 422 `_exportId not found` / `_importId not found` | Deleted or invalid resource | Verify the referenced export/import exists and has not been deleted |
| 409 `tool in use` | Tool referenced by consumers | Remove tool from all flows, APIs, agents, and MCP servers before deleting |
| 422 `dataType required` | Unnecessary routing fields | Remove `routeRecordsTo` / `routeRecordsUsing` from simple tools; the API defaults correctly |
