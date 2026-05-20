---
name: building-mcp-servers
description: Build Celigo MCP server resources -- endpoints that expose Tools and builder-mode APIs to external AI agents and MCP clients. Use when creating MCP servers, linking tools or APIs, or configuring annotations and overrides.
---

<!-- TIER:1 -->

# Building MCP Servers

An MCP server is a **Model Context Protocol endpoint** that exposes Celigo Tools and builder-mode APIs as callable tools for external AI agents and MCP clients. Concerns when building an MCP server:

- **Endpoint identity** -- unique `relativeURI` that forms the server's URL path
- **Tool selection** -- which Tool resources to expose, each with an MCP-compatible name
- **API selection** -- which builder-mode API resources to expose (script-mode APIs are not supported)
- **Annotations** -- MCP-standard behavior hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) that help AI agents decide when and how to call a tool
- **Overrides** -- per-server customization of a tool's connections, exports, imports, and routers without modifying the underlying tool definition
- **Name uniqueness** -- tool names must be unique across all `tools[]` and `apis[]` entries within the server

MCP servers do not have their own authentication mechanism. Incoming MCP requests authenticate via the Celigo API token; outbound calls to external systems use the connections referenced by the underlying tools and APIs.

Used alongside tools and APIs. The MCP server is a thin exposure layer -- all processing logic lives in the referenced Tool and API resources.

## Composition Patterns

MCP servers combine two types of entries:

### Tool Entries (`tools[]`)

Reference Celigo Tool resources. Each tool becomes an MCP tool endpoint. The tool's `input.schema` must have `type: "object"` at the root to comply with the MCP specification. Tool entries support annotations (behavior hints) and overrides (per-server connection/resource customization).

### API Entries (`apis[]`)

Reference Celigo builder-mode API resources. Each API becomes an MCP tool endpoint. Only `type: "builder"` APIs are supported -- script-mode and legacy APIs cannot be exposed via MCP. API entries do not support annotations or overrides.

### Typical Compositions

In production, most MCP servers expose APIs only. Servers that combine both tools and APIs are less common but valid for mixed read/write patterns (e.g., tools for writes with annotations, APIs for lookups).

## Quick Reference

### Decision Matrix

| You need to... | Use tool entry | Use API entry |
|---|---|---|
| Expose reusable logic with connection flexibility | Yes | -- |
| Hint behavior to AI agents (read-only, destructive) | Yes (annotations) | -- |
| Swap connections per-server without modifying the resource | Yes (overrides) | -- |
| Expose a builder-mode API as an MCP endpoint | -- | Yes |
| Expose a script-mode or legacy API | Not supported | Not supported |

### Minimum Required Fields

Every MCP server needs at minimum:

- `name` -- human-readable label
- `relativeURI` -- unique URI path segment (must start with `/`, single segment, alphanumeric + underscores + hyphens)

Each tool entry needs: `_toolId`, `name`

Each API entry needs: `_apiId`, `name`

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

| Schema | What it defines |
|--------|----------------|
| [request.yml](references/schemas/request.yml) | Top-level MCP server fields (name, relativeURI, description, disabled, tools, apis) |
| [response.yml](references/schemas/response.yml) | MCP server response shape (includes _id, timestamps, sandbox) |
| [io-tool.yml](references/schemas/io-tool.yml) | Tool entry schema (_toolId, name, disabled, annotations, overrides) |
| [api-tool.yml](references/schemas/api-tool.yml) | API entry schema (_apiId, name, disabled) |
| [annotations.yml](references/schemas/annotations.yml) | MCP behavior hints (title, readOnlyHint, destructiveHint, idempotentHint, openWorldHint) |
| [overrides.yml](references/schemas/overrides.yml) | Per-server overrides for connections, exports, imports, and routers |

## Related Skills

- [building-tools > How to Build a Tool](../building-tools/SKILL.md#how-to-build-a-tool) -- building the Tool resources that MCP servers expose
- [building-apis > How to Build an API](../building-apis/SKILL.md#how-to-build-an-api) -- building the builder-mode APIs that MCP servers expose
- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connections used by tools and overridden per-server
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- exports used as lookups within tool pipelines
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- imports used as action steps within tool pipelines

<!-- TIER:2 -->

## How to Build an MCP Server

### 1. Plan what the server exposes

Before creating anything, determine what capabilities the MCP server should offer to AI agents. Each capability maps to either a Tool or a builder-mode API. Group related capabilities under a single server with a meaningful `relativeURI`.

### 2. Check for existing resources

Look for tools and APIs that can be reused before creating new ones.

```bash
# Search across all resource types in the account
celigo account search "<keyword>"

# Check existing tools
celigo tools list

# Check existing APIs (only builder-mode can be used)
celigo apis list

# Check existing MCP servers for patterns
celigo mcp-servers list
```

### 3. Build the underlying resources (bottom-up)

MCP servers reference tools and APIs -- these must exist first. Build order:

1. **Connections** -- create or reuse connections to target systems
2. **Exports + Imports** -- data sources and destinations for tool/API pipelines
3. **Tools** -- reusable logic blocks (use `building-tools` skill). Ensure `input.schema` has `type: "object"` at root for MCP compatibility
4. **APIs** -- builder-mode endpoints (use `building-apis` skill). Ensure `type: "builder"` is set
5. **MCP Server** -- the exposure layer that references tools and APIs

### 4. Choose tool names

Each entry (tool or API) needs a `name` that becomes the MCP tool name visible to AI agents. Names must:

- Be unique across all `tools[]` and `apis[]` entries in the server
- Contain only alphanumeric characters, underscores, hyphens, and dots
- Be descriptive enough for an AI agent to understand the tool's purpose (e.g., `get_customer`, `create_order`, `validate.input`)

### 5. Configure annotations (tool entries only)

Annotations are optional MCP-standard hints that help AI agents decide when and how to call a tool. Set them based on what the underlying tool actually does:

- `readOnlyHint: true` -- tool only reads data, no side effects (e.g., a lookup)
- `destructiveHint: true` -- tool deletes or permanently modifies data
- `idempotentHint: true` -- calling multiple times with the same input produces the same result
- `openWorldHint: true` -- tool interacts with external APIs where results may vary between calls

Annotations are hints only -- they are not enforced by the server.

### 6. Configure overrides (tool entries only)

Overrides let you customize a tool's internal resources for this specific MCP server without modifying the tool definition. This enables reusing the same tool across multiple servers with different configurations.

The most common override is **connection overrides** -- mapping the tool's abstract connection references to concrete connections for this server. Override entries use `_abstractId` (the connection ID in the tool definition) and `_id` (the concrete connection to use instead).

Export, import, and router overrides are also available but rarely used in practice.

### 7. Build the MCP server JSON

Reference the [Schema Index](#schema-index) for exact field schemas. Every MCP server needs at minimum: `name` and `relativeURI`. Add `tools[]` and/or `apis[]` entries to expose capabilities. Set `disabled: false` to enable the server (at least one tool or API entry must also be enabled).

## CLI Commands

```bash
# CRUD
celigo mcp-servers list
celigo mcp-servers get <id>
celigo mcp-servers create < mcp-server.json
celigo mcp-servers update <id> < mcp-server.json
celigo mcp-servers set <id> key=value [key2=value2 ...]
celigo mcp-servers delete <id>

# Discovery
celigo account search "<keyword>"
celigo tools list
celigo apis list
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating an MCP server, verify:

- [ ] `name` is set and descriptive
- [ ] `relativeURI` starts with `/`, contains a single path segment, uses only alphanumeric characters, underscores, and hyphens
- [ ] `relativeURI` is unique across all MCP servers in the account
- [ ] All `_toolId` references in `tools[]` point to existing Tool resources
- [ ] All `_apiId` references in `apis[]` point to existing builder-mode API resources (not script-mode or legacy)
- [ ] Tool names are unique across all `tools[]` and `apis[]` entries in the server
- [ ] Tool names contain only alphanumeric characters, underscores, hyphens, and dots
- [ ] Tool entries referencing Tools verify that the tool's `input.schema` has `type: "object"` at root
- [ ] At least one tool or API entry is enabled (`disabled: false`) if the server itself is enabled
- [ ] Connection overrides (if used) map `_abstractId` to valid concrete connection IDs
- [ ] Sandbox MCP servers only reference sandbox connections and resources

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this automatically.
2. **Script-mode and legacy APIs cannot be exposed.** Only `type: "builder"` APIs work in MCP servers. If you get a validation error on an API entry, verify the referenced API has `type: "builder"` set.
3. **Tool input schema must be `type: "object"`.** The MCP specification requires tool inputs to be JSON objects. If a tool's `input.schema` has a different root type (e.g., `array`, `string`), it cannot be exposed via MCP.
4. **Annotations are hints, not enforcement.** Setting `readOnlyHint: true` does not prevent the tool from writing data. The AI agent may ignore annotations entirely.
5. **Name uniqueness spans both arrays.** A tool named `get_customer` in `tools[]` conflicts with an API also named `get_customer` in `apis[]`. Names must be unique across the combined set.
6. **Overrides only apply to tool entries.** API entries in `apis[]` do not support annotations or overrides. To customize an API's behavior per-server, modify the API resource itself.
7. **Enabling the server requires at least one enabled entry.** Setting `disabled: false` on the server alone is not sufficient -- at least one tool or API within it must also have `disabled: false`.
8. **Preview and logs endpoints are session-auth only.** The `/preview` and `/logs` endpoints for MCP servers are not accessible via bearer token -- they require the UI session.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 on create/update | Missing required fields or invalid `relativeURI` format | Check `name` and `relativeURI`; ensure URI starts with `/` and is a single valid segment |
| 422 `_toolId not found` | Referenced tool does not exist or was deleted | Verify the tool exists with `celigo tools get <id>` |
| 422 `_apiId not found` | Referenced API does not exist or was deleted | Verify the API exists with `celigo apis get <id>` |
| 422 `duplicate tool name` | Two entries share the same `name` | Ensure all names across `tools[]` and `apis[]` are unique |
| 422 `relativeURI already in use` | Another MCP server in the account uses the same URI | Choose a different `relativeURI`; check with `celigo mcp-servers list` |
| 422 `invalid API type` | API entry references a script-mode or legacy API | Only `type: "builder"` APIs are supported; check with `celigo apis get <id>` |
| 422 `input schema invalid` | Tool's `input.schema` root type is not `object` | Update the tool's input schema to have `type: "object"` at root |
| Server enabled but not accessible | All tool/API entries are disabled | Enable at least one entry with `disabled: false` |
