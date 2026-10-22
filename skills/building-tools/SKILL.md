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

**Tool vs API:** the split is the contract callers get. A **tool** is called by flow steps, AI agents, APIs and other tools, and outside callers can reach it too: a caller authenticated to the Celigo REST API can run it directly through its invoke operation (input plus connection bindings; the output comes back synchronously), and an MCP server publishes tools to outside AI clients. Put an **API** in front only when callers need their own URL, method and status codes (a partner system, a customer-facing app) -- the tool stays available to its other consumers at the same time.

**Tool vs flow:** tools don't start themselves -- no `schedule`, no listeners, no flow-level runtime controls, and no abstract/instance layer (a tool is already the unit of reuse; per-environment variation is handled by the consumer-bound connection model). A step's own `proceedOnFailure` is set on its page-processor entry, as in a flow ([step 7](#7-wire-page-processors-into-branches)). "Every night, do X" or "when a webhook arrives, do Y" is a flow -- the tool may be the thing the flow *does*.

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

In a flow, an API or another tool, the tool runs as a **`ToolImport`** step: an import with `"adaptorType": "ToolImport"` and `"tool": {"_toolId": "<tool id>", "overrides": {"connections": [...]}}` and no `_connectionId`, which the parent's page processor references like any import (`{"type": "import", "_importId": "<wrapper id>"}`). Change the tool through `tools` and the wrapper through `imports`.

**Connection model:** Always bring-your-own-keys. The caller (flow, API, agent, MCP server) maps connections to the tool at configuration time. MCP Server overrides can swap connections per-server without modifying the tool.

**Build order:** Connection --> Export + Import --> Tool --> (consumer: Flow / API / Agent / MCP Server)

**Concerns beyond the build steps:**

- **Response mapping** -- extract fields from processor responses back into the record. Configured on `pageProcessors[]` entries within branches as `{"fields": [{"extract": ..., "generate": ...}], "lists": []}`, but planned when building the processors. For lookups the response has `data[]` and `errors[]` (use `data[0].fieldName` for one field of the first result, or `data[0]` for the whole record), and `data` holds the records after the export's own transform and output filter, so use the transformed field names; for imports use `id` for the created record's ID and `_json.fieldName` for response-body fields (the body's fields are also at the root, so `orderNumber` reads the same as `_json.orderNumber`). An extract can be Handlebars over this envelope (`{{data.0.name}}`), which has no `record`: `{{record.x}}` renders nothing
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

Binding isn't optional. A direct invoke and a tool step (a `ToolImport`) must list every connection the tool's steps use as `{"_abstractId": <authored id>, "_id": <connection to run with>}` -- in the invoke body's `overrides.connections`, or in the import's `tool.overrides.connections`. The same id twice keeps the authored connection, and leaving one out fails with `connection_not_overridden` ("Missing connection overrides"). The connection to run with goes in `_id`: a binding that names it `_connectionId`, or gives only `_abstractId`, is refused with 422 "Invalid override at overrides.connections[0]. Connection override must include at least one of: _id, ...". `celigo tools connections <id>` lists the connections to bind. An MCP server binds per step instead; see [building-mcp-servers > How to Build an MCP Server](../building-mcp-servers/SKILL.md#how-to-build-an-mcp-server).

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

Every tool needs at minimum: `name`, `_integrationId` (a create without it fails with 422 "Expected field: _integrationId to be present."), an `input.schema`, and a router whose branch has a step. A tool without steps saves, but every invoke and test run is refused ([step 6](#6-configure-routing-if-needed)).

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

Write its `description` (up to 5,120 characters) for the model that decides when to call it: what it does now, what it takes and what it returns. An MCP server serves it verbatim as the tool's description, with the Tool's `name` as the title and its schemas as the input and output, and an AI agent step reads the same `description` and input schema.

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

# Show what an existing tool uses -- tools aren't in the local account index
celigo tools connections <id>
celigo tools get <id>

# Find orphaned resources that could be reused
celigo account lint

# Check if similar tools already exist
celigo tools list

# Search marketplace for pre-built integration templates
celigo templates marketplace
```

The account index auto-refreshes when stale (older than 15 minutes by default). Force a fresh snapshot with `celigo account snapshot`.

Existing tools in the account are the best reference -- they show proven patterns for that specific customer's setup. Marketplace templates may provide a complete pre-built integration you can install rather than building from scratch.

### 4. Build the connections, exports, and imports

Tools reference exports and imports as page processors in router branches. Build bottom-up: connections first, then exports and imports that use those connections, then the tool that wires them together. See `configuring-exports` and `configuring-imports`.

### 5. Define the input schema

The input schema is a JSON Schema object describing what data the tool accepts. For MCP compatibility, the root schema must have `type: "object"`. Every call is checked against it: a missing `required` property or a failed `pattern` refuses the call with 422 "Tool input validation failed: ...", so a new required property breaks callers that don't send it. Leave `$schema` out -- a draft 2020-12 `$schema` fails the save with 422 "Invalid input.schema - no schema with key or ref ..." -- and set `schemaMode: "json"` on a schema you write as JSON (Gotcha 12).

### 6. Configure routing (if needed)

- **No routing** -- all inputs processed the same way: one pass-through router with one branch and no routing fields (Gotcha 4). Don't leave `routers` out: a tool with no steps, or with a branch that has none, is refused on every invoke and test run with 400 "Tool has no steps configured. Add at least one step before executing the tool."
- **Filter-based routing** (`routeRecordsUsing: "input_filters"`) -- declarative expression rules on each branch, as `"inputFilter": {"version": "1", "rules": [...]}` (Gotcha 15)
- **Script-based routing** (`routeRecordsUsing: "script"`) -- a custom JavaScript `branching` function returns an array of branch indices (zero-based positions in `branches[]`); tools take the first matching branch, so return a single index (e.g. `[1]`)

### 7. Wire page processors into branches

Each branch contains `pageProcessors[]` -- an ordered list of exports (lookups) and imports (actions). Each processor has:

- `type`: `"export"` or `"import"`
- `_exportId` or `_importId`: reference to the resource
- `responseMapping`: extract fields from the processor response back into the record -- an object with `fields` (and `lists`), not Mapper 2.0 rows or a transform's `rules`
- `hooks.postResponseMap`: optional script for post-processing
- `proceedOnFailure`: when `true`, the later steps and the output stage still run after this step fails (with `false` they're skipped). A direct invoke still answers 422 with the failed step's error either way, so the caller gets no output

### 8. Configure output

Output mappings transform the processed data into the tool's return value. Supports:

- `mappings[]` -- Mapper 2.0 rows, such as `{"generate": "orderStatus", "extract": "$.statusCode", "dataType": "string", "status": "Active"}`. A bare `extract` writes that text literally, and a nested target is a parent row with child `mappings`, not `a.b` in `generate` ([writing-mappings > Mapper 2.0 Workflow](../writing-mappings/SKILL.md#mapper-20-workflow))
- `lookups[]` -- static key-value enrichment tables
- `hooks.preMap` / `hooks.postMap` -- script hooks before and after mapping
- `schema` -- checked against the mapped output on every run: with `additionalProperties: false`, a mapped field the schema doesn't list fails the run with 422 "Tool output validation failed: must NOT have additional properties"

Output mappings and branch response mappings both shape data, but at different times. Branch `responseMapping` merges a processor's response onto the in-flight record so *downstream branches and routers* can use it. Output `mappings` assemble the tool's *return value* at the very end -- and they only see the final in-flight record, not raw processor responses. If a processor's response field must appear in the output, it needs a response mapping on that processor first.

A one-lookup tool's router and output. The lookup's first result lands on the record as `item`, and each output row reads it with a `$.` path (an output row reading `data[0]` finds nothing, because `data` exists only in the lookup's response):

```json
"routers": [{
  "id": "main",
  "branches": [{
    "name": "Look up the item",
    "pageProcessors": [{
      "type": "export",
      "_exportId": "<lookup export id>",
      "responseMapping": {"fields": [{"extract": "data[0]", "generate": "item"}], "lists": []}
    }],
    "nextRouterId": "outputRouter"
  }]
}],
"output": {
  "mappings": [
    {"generate": "sku", "dataType": "string", "extract": "$.item.sku", "status": "Active"},
    {"generate": "onHand", "dataType": "number", "extract": "$.item.onHand", "status": "Active"}
  ]
}
```

A one-branch router like this one sets neither `routeRecordsTo` nor `routeRecordsUsing` (Gotcha 4).

### 9. Build the JSON

Reference the [Schema Index](#schema-index) for the exact fields needed. Use the [Which Schemas to Read](#which-schemas-to-read) decision rule to determine which files to consult.

### 10. Test the tool

Pass the test input explicitly as `{"input": {...}}`, in a file passed to `celigo tools test-run <id> --file <path>`. A test run ignores the saved `mockInput` and otherwise starts from an empty record.

A lookup export without a saved `mockOutput` calls its live system in a test run, and the run then saves that response on the export as its `mockOutput`. Every later test run that uses the export -- from any Tool or API, whatever the input -- answers the lookup from that saved `mockOutput` instead of calling the system; real invokes aren't affected. Read the export's `mockOutput` when test runs return the same lookup result for different inputs, and remove it to test against live data again (`celigo exports set <exportId> mockOutput=null`). Imports never send in a test run (each returns its saved `mockResponse` or a placeholder), so a passing run proves the data shaping but not the writes. A test run never appears in the tool's request history. Invoking the tool runs it for real, imports included: `celigo tools invoke <id> --file <path>` with `{"input": {...}, "overrides": {"connections": [...]}}` (see [Consumer-Bound Connections](#consumer-bound-connections)).

## Observing Runs

A tool's runs are recorded only when the caller asks. A direct invoke is recorded with `--log-mode debug` (the `x-log-mode: debug` header); the other modes are accepted and ignored there, and they take effect only when an AI agent, MCP server or guardrail runs the tool. Find a run with `celigo tools request-history <id>` -- the last 5 minutes unless you pass `--time-gte`/`--time-lte`, and a run shows up a few seconds after it ends -- then open it with `celigo tools execution-logs <id> <executionId>`. Recording needs the account's Tool logging entitlement, a sandbox tool answers 403, and test runs never appear. An `input.traceKeyTemplate` (Handlebars with at least one `{{...}}`, such as `order-{{record.orderId}}`) lets you find runs with `--trace-key-prefix`.

To see what entered or left the tool itself, use its own debug windows (Gotcha 8).

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
celigo tools dependencies <id>                # check before deleting
celigo tools audit <id>                       # change history
celigo tools delete <id>

# Clone into an integration; steps with connections need {"connectionMap": {"<connId>": "<connId>"}} (map to itself to reuse)
celigo tools clone <id> --integration <integrationId> [--name <name>] [--file <path>]

# Manage page processors and connections
celigo tools add-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>] [-y]
celigo tools remove-processor <id> <exportOrImportId> [--router <routerId>] [--branch <branchName>] [-y]
celigo tools connections <id>
celigo tools replace-connection <id> <connectionId> <newConnectionId>   # every step at once, same connection type

# Test run (the --file body is {"input": {...}})
celigo tools test-run <id> --file <path>
celigo tools test-run-step-results <id> <runId> <exportOrImportId>
celigo tools test-run-step-logs <id> <runId> <exportOrImportId>

# Invoke (runs for real; the --file body is {"input": {...}, "overrides": {"connections": [...]}})
celigo tools invoke <id> --file <path> [--log-mode debug]   # debug records the run in request history

# Run history
celigo tools request-history <id> [--time-gte <iso>] [--time-lte <iso>]
celigo tools execution-logs <id> <executionId> [--details]

# Debug: a step needs its export's or import's debugUntil; the tool's own stages need input/output.debugUntil
celigo tools set <id> input.debugUntil=<ISO time>    # at most 60 minutes ahead; output.debugUntil likewise
celigo tools debug-requests <id> <exportOrImportId|tool_input|tool_output> [--since <minutes>]
celigo tools debug-request-detail <id> <exportOrImportId|tool_input|tool_output> <key>

# Discovery and export
celigo account search "<keyword>"
celigo templates marketplace
celigo tools graph <ref> [--as mermaid]       # the tool's canvas, from a pulled local tree
celigo tools download <id> [-o <path>]        # template ZIP
```

<!-- TIER:3 -->

## Pre-Submit Checklist

### Required (all tools)
- [ ] `name` is set
- [ ] `_integrationId` references a valid integration
- [ ] `input.schema` is defined with `type: "object"` at root (required for MCP compatibility), has no `$schema`, and carries `schemaMode: "json"` if written as JSON
- [ ] A full update sends `routers`, and `input`/`output` whole (with `schemaMode`) if it sends them at all

### Pipeline
- [ ] All `_exportId` / `_importId` references in page processors point to existing resources
- [ ] Connections for referenced exports/imports are online
- [ ] Router IDs are unique within the tool
- [ ] At least one router exists, and every branch has a step and a `nextRouterId` (a router `id` or `"outputRouter"`)
- [ ] No lookup export is a step twice

### Cross-resource consistency
- [ ] If response mapping needed: configured on `pageProcessors[]` entries within branches
- [ ] If routing used: `routeRecordsUsing` and branch filters/scripts are configured correctly
- [ ] If tool is for MCP: tool `name` is unique across all tool and API entries in the MCP server
- [ ] A tool that's already in use gets no new required input (callers that don't send it are refused) and no `additionalProperties: false` on an output its mappings exceed

## Gotchas

1. **PUT erases omitted fields, except `input` and `output`.** Always GET first, modify, then PUT; the `set` command handles this. A full update without `routers` deletes every step (the next invoke is refused with 400 "Tool has no steps configured..."), and one without `description` or `aiDescription` removes them. Left out, `input` and `output` keep their stored fields (only `mockInput` is cleared); sent, each replaces the whole object. `name` and `_integrationId` go on every update. PATCH (`celigo tools set` on `name`, `description`, `aiDescription`, `input.debugUntil`, `output.debugUntil`) changes one of those without the risk.
2. **Router IDs must be unique within the tool.** Branch `nextRouterId` must reference a real router `id` or the special `"outputRouter"` terminal value.
3. **No dangling branches.** All branches must merge back to the output node. A branch without `nextRouterId` saves, but every invoke is refused with 422 (and every test run with 400) "One or more branches are not merged back. Review the setup to ensure all branches converge.", whichever branch the input would take.
4. **Routing fields come as a pair.** Set `routeRecordsTo` and `routeRecordsUsing` together on any router that chooses between branches, and leave both off a one-branch pass-through router. Half a pair fails with 422 `invalid_flow_router_config`; several branches with neither field fail with `invalid_flow_router_branch`.
5. **Tools cannot be deleted while in use.** The delete is refused with 422 `dependencies_not_deleted`, one error per blocker -- a `ToolImport` step ("import <id> must be deleted before you can delete tool <id>"), an MCP server or an access token. List them with `celigo tools dependencies <id>` and remove those references first.
6. **`add-processor` auto-creates a router.** If the tool has no routers, the command creates a default router with one branch. Otherwise it targets the first router's first branch by default -- use `--router` and `--branch` to target a specific location.
7. **Tool names must be unique in the MCP Server.** The `name` field in `tools[]` on the MCP Server must be unique across all tool AND api entries in that server.
8. **Debug capture is set on each step and on the tool's own Input and Output.** A step's requests are recorded only while its export or import has `debugUntil` (`celigo exports enable-debug <id>` / `celigo imports enable-debug <id>`); read them with `celigo tools debug-requests <id> <exportOrImportId>`. To see each record that entered or left the tool with its schema outcome, failed (422) input validation included, set `celigo tools set <id> input.debugUntil=<ISO time>` (or `output.debugUntil`) at most 60 minutes ahead -- later is refused with 422 "...exceeds the maximum allowed difference of 3600 secs." -- and read `celigo tools debug-requests <id> tool_input` (or `tool_output`). Capture works for every caller; test runs record nothing.
9. **Test run results may be base64-encoded.** The CLI auto-decodes these, but raw API responses need manual decoding.
10. **Two different things are called "lookup."** A branch page-processor lookup (`pageProcessors[].type: "export"`) calls an external system at runtime; an output static lookup table (`output.lookups[]`) is a fixed value-translation map that reaches nothing. They live in different parts of the tool and are not interchangeable.
11. **Refactoring steps into a tool cannot be undone.** There is no programmatic inline-back; cleanup is manual (delete the new tool and its wrapper, then restore the parent). The operation is user-driven only -- never initiate it unprompted, and it can update shared exports/imports that other consumers also use.
12. **Keep `schemaMode: "json"` on schemas written as JSON.** Unset, the UI opens a schema in its visual editor, and an edit there rebuilds it without `format`, `const`, `default`, `additionalProperties`, `$ref` or composition keywords, and turns `integer` into `number`. `schemaMode` lives inside `input` and `output`, so an update that sends either object must carry it too.
13. **A lookup export is a step only once per tool.** Using the same export on two branches, or twice in one, fails the save with 422 "The export <id> is already included as a pageProcessor in your flow, and cannot be added again." Put a lookup that every branch needs before the branching router, or give the second branch its own export.
14. **Hooks on a tool's steps don't see the integration's settings.** On a direct invoke, a lookup's `postResponseMap` hook got `options.settings` holding only that export's own `settings.export`, though the tool's integration had settings. Pass anything else a hook needs in the input.
15. **A branch filter in the export-filter form is dropped.** A branch `inputFilter` sent as `{"type": "expression", "expression": {...}}` saves without an error and is stored as no filter, so that branch takes every input. Send `{"version": "1", "rules": [...]}` and read the tool back.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 "Expected field: _integrationId to be present." | Missing integration | Set `_integrationId` to a valid integration ID, on every create and update |
| 422 "Invalid input.schema - no schema with key or ref ..." | The schema's `$schema` names a draft the validator doesn't know (draft 2020-12) | Remove `$schema` |
| 422 "Duplicate router found with the id ..." | Two routers share an `id` | Give each router its own `id` and update the `nextRouterId` values that point at it |
| 422 "Invalid nextRouterId is defined on the branch. Please correct the branch configuration." | A `nextRouterId` names no router in the tool | Point it at a router `id` or `"outputRouter"` |
| 422 on invoke, 400 on a test run: "One or more branches are not merged back. Review the setup to ensure all branches converge." | A branch has no `nextRouterId` | Set `nextRouterId` on every branch |
| 400 "Tool has no steps configured. Add at least one step before executing the tool." | The tool has no router, or a branch has no steps -- also what a full update without `routers` leaves | Put the steps in a router branch; send `routers` on every full update |
| 422 "<id> is not a valid routers.0.branches.0.pageProcessors.0._exportId" | The step names an export (or import) that doesn't exist | Use an id from `celigo exports list` / `celigo imports list` |
| 422 "The export <id> is already included as a pageProcessor in your flow, and cannot be added again." | One export is a step twice, on two branches or in one | Put the shared lookup before the branching router, or give the second branch its own export |
| 422 "Tool input validation failed: must have required property '...'" (or "... must match pattern ...") | The call's input fails `input.schema` | Send what the schema requires, or relax the schema (callers already in use break when a property becomes required) |
| 422 "Tool output validation failed: must NOT have additional properties" | `output.schema` sets `additionalProperties: false`, and the mappings write a field it doesn't list | List every mapped field in the schema, or drop `additionalProperties: false` |
| 422 "import <id> must be deleted before you can delete tool <id>" (`dependencies_not_deleted`) | A `ToolImport` step, MCP server or access token still references the tool | List them with `celigo tools dependencies <id>`, remove those references, then delete |
| 422 "...exceeds the maximum allowed difference of 3600 secs." | `input.debugUntil` or `output.debugUntil` set more than 60 minutes ahead | Set it at most 60 minutes ahead |
| 422 `invalid_flow_router_config` | A router sets only one of `routeRecordsTo` / `routeRecordsUsing` | Set both on a router that chooses between branches, or neither on a one-branch pass-through router |
| 422 `invalid_flow_router_branch` | A router with several branches sets neither routing field | Set `routeRecordsTo` and `routeRecordsUsing` on it |
| One branch takes every input, and its `inputFilter` reads back `null` | The filter was sent as `{"type": "expression", "expression": {...}}`, which is stored as no filter | Send `{"version": "1", "rules": [...]}`, then read the tool back |
| `connection_not_overridden` ("Missing connection overrides") | An invoke or tool step left a connection the tool's steps use unbound | Bind every connection, as in [Consumer-Bound Connections](#consumer-bound-connections) |
| 422 "Invalid override at overrides.connections[0]. Connection override must include at least one of: _id, ..." | A binding without `_id`: the connection named `_connectionId`, or `_abstractId` alone | Send `{"_abstractId": <authored id>, "_id": <connection to run with>}` |
| An output field comes back empty or holds its own path as text | The output row reads the lookup's raw response (`data[0]...`) or a bare string, or no `responseMapping` carried the field onto the record | Map the lookup onto the record first (`{"extract": "data[0]", "generate": "item"}`), then read `$.item.<field>` in the output row |
| A test run answers a lookup with the same record whatever the input | The lookup export has a saved `mockOutput`, which test runs answer from (the first test run that called the lookup saved it) | Read the export's `mockOutput`; remove it to call the live system again |
