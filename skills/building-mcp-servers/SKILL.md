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
- **Overrides** -- per-server connection bindings for a tool's steps. Every tool entry needs one for each step, and they're the only overrides that change what a call does
- **Name uniqueness** -- tool names must be unique across all `tools[]` and `apis[]` entries within the server

MCP servers support configurable **authentication** of their own -- Celigo OAuth (the recommended choice, which you must turn on explicitly with `oauth: {useCeligoOauth: true}`), an external IdP, or static API tokens, gated by `mcp:read` / `mcp:write` scopes (see [Authentication and Scoping](#authentication-and-scoping)). Outbound calls to external systems use the connections referenced by the underlying tools and APIs.

Used alongside tools and APIs. The MCP server is a thin exposure layer -- all processing logic lives in the referenced Tool and API resources.

## Composition Patterns

MCP servers combine two types of entries:

### Tool Entries (`tools[]`)

Reference Celigo Tool resources. Each tool becomes an MCP tool endpoint. The tool's `input.schema` must have `type: "object"` at the root to comply with the MCP specification. Tool entries support annotations (behavior hints) and need overrides that bind each of the Tool's steps to a connection for this server.

### API Entries (`apis[]`)

Reference Celigo builder-mode API resources. Each API becomes an MCP tool endpoint. Only `type: "builder"` APIs are supported -- script-mode and legacy APIs cannot be exposed via MCP. API entries do not support annotations or overrides.

### Typical Compositions

A server can expose APIs only, tools only, or both. Combining them suits mixed read/write patterns (e.g., tools for writes with annotations, APIs for lookups).

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

Each tool entry needs: `_toolId`, `name`, `disabled: false`, and a binding for each of the Tool's steps (see [step 6](#6-configure-overrides-tool-entries-only))

Each API entry needs: `_apiId`, `name`, `disabled: false`

Entries default to `disabled: true`, and clients never see a disabled entry.

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
- [managing-network-policies > Where a Policy Applies](../managing-network-policies/SKILL.md#where-a-policy-applies) -- limit which networks can reach the server with an IP allow/deny list (`_networkPolicyId`)

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

A Tool's steps run on a server only after the server's entry binds them. Give each export or import step in the Tool (its `routers[].branches[].pageProcessors[]`, from `celigo tools get <toolId>`) its own entry in `overrides.exports[]` or `overrides.imports[]`: `_abstractId` and `_id` are both the step's `_exportId` or `_importId`, and `_connectionId` is the connection the step runs on for this server -- its own, or another one to use instead.

```json
{
  "_toolId": "<toolId>",
  "name": "get_customer",
  "disabled": false,
  "overrides": {
    "exports": [
      {"_abstractId": "<step's _exportId>", "_id": "<step's _exportId>", "_connectionId": "<connection id>"}
    ]
  }
}
```

Saving doesn't check the bindings; the call does. A tool with an unbound step fails every call with `Missing connection overrides. The following connection IDs must be overridden: …`. A `connections[]` pair that re-maps a connection to a *different* one also binds the steps that use it (a step entry's `_connectionId` wins over a pair), but an identity pair, the same id as `_abstractId` and `_id`, counts as no binding. Export steps are the case confirmed on a running server, so after binding import steps the same way, check the tool with one call from an MCP client.

Only connection bindings take effect. The other override fields -- an export's response mapping, page size, type, or retry and failure settings, and a router's name, strategy or branch filters -- save but don't change what a call does, and the import-side ones can't be relied on either. When one server needs different logic, publish a variant Tool.

### 7. Build the MCP server JSON

Reference the [Schema Index](#schema-index) for exact field schemas. Every MCP server needs at minimum: `name` and `relativeURI`. Add `tools[]` and/or `apis[]` entries, each with `disabled: false`, to expose capabilities. A new server starts disabled; enable it with `disabled: false` together with or after its entries, because a write that enables the server while every entry is disabled fails with 422 `mcp_server_enablement_requires_enabled_item`.

A server created enabled, with Celigo sign-in, one read-only tool and a capability set:

```json
{
  "name": "Order desk",
  "relativeURI": "/order-desk",
  "disabled": false,
  "oauth": {"useCeligoOauth": true},
  "tools": [{
    "_toolId": "<toolId>",
    "name": "get_order",
    "disabled": false,
    "annotations": {"readOnlyHint": true},
    "overrides": {
      "exports": [{"_abstractId": "<step's _exportId>", "_id": "<step's _exportId>", "_connectionId": "<connection id>"}]
    }
  }],
  "permissionSets": [{"name": "Order desk readers", "accessLevel": "read", "_toolIds": ["<toolId>"]}]
}
```

A capability set (`permissionSets[]`) names items already on the server by id -- `_toolIds` holds `tools[]._toolId` values, and `_apiIds`, `_promptIds` and `_resourceIds` work the same way -- not tool names or capability strings. Its `accessLevel` (`read` or `write`) is accepted but not stored, so a set grants exactly the items it lists. The save gives each set an `_id`; people get the set through a `pset:<_id>` grant ([Who may use the server](#who-may-use-the-server)).

## Authentication and Scoping

Deciding who can call a server is the second design decision after deciding what it exposes. MCP servers have their own configurable authentication, independent of the connections their underlying tools use. Celigo OAuth and API tokens can be enabled at the same time on one server -- a common shape when a server serves both human users (OAuth) and automation (tokens).

### Authentication modes

- **Celigo OAuth** (`oauth: {useCeligoOauth: true}`) -- the identity provider to choose for most servers, but not one the platform applies for you: a server saved without an `oauth` block (or with `oauth: {}`) has no OAuth sign-in at all, so OAuth clients can't connect to it. Consumers authenticate with their Celigo credentials (routed to your SSO provider automatically if the account has SSO). Only this mode supports **per-user downstream connections**, which apply only to connections you mark (see [Whose login a call uses](#whose-login-a-call-uses)), and an explicit **Users list** on the server's Access tab.
- **External IdP (external OAuth)** -- validates OAuth tokens issued by your own identity provider (Auth0, Okta, etc.). External providers are configured once at the account level and referenced from any server; the server stores the issuer URL, audience, validation method (JWKS or introspection), and required scopes (`mcp:read`, `mcp:write`, or both). With External, the Users list is not shown and per-user downstream connections are not available. Provider limits to check first: Auth0 requires the *Resource Parameter Compatibility Profile* on its application, and Microsoft Entra ID and Google Identity are not currently supported for MCP OAuth.
- **API tokens** -- static bearer tokens the consumer sends on every request. Created on the server (they also appear in the account's global API tokens list) with a name, optional description, and an auto-purge window; the token value is shown once at creation. Right for service-to-service callers, legacy clients that can't do OAuth, short-lived access, or as a fallback alongside OAuth. API tokens have no scope-narrowing UI of their own -- their granularity comes from the server's tool list and the `mcp:read` / `mcp:write` split.

Default to Celigo OAuth -- set `oauth.useCeligoOauth: true` on the server -- and add an API token alongside it when automation is in scope. Reach for an external IdP only when the consumer explicitly requires a specific provider.

### Who may use the server

With Celigo OAuth, decide who may use the server. Give each person a grant on it -- directly, through a group, or through a capability set -- that covers every kind of entry it exposes: each `:all` covers only its own kind (`tool:all`, `api:all`, `prompt:all`, `resource:all`), and specific ids grant less. Each grant call replaces that person's or group's grant on this server, so send the complete list every time. The account owner needs no grant. Check the server's compiled access before handing over the URL. Inviting people, groups and roles, and what changing a capability set does to grants: [managing-end-users](../managing-end-users/SKILL.md).

```bash
# End users and their access-record ids (ashareIds); invite sends a real invitation email
celigo end-users list
celigo end-users invite --email <address> --grant <id>=tool:all,api:all

# Grant on this server (each call replaces the listed targets' grant here)
celigo mcp-servers assign-end-users <id> <ashareId> [<ashareId> ...] --capabilities tool:all,api:all
celigo mcp-servers assign-groups <id> <groupId> [<groupId> ...] --capabilities pset:<capability set _id>

# Every end user who can reach the server, and through which grant
celigo mcp-servers effective-access <id>
```

### Whose login a call uses

By default every caller runs on the connection bound on the server: one login for everyone. If callers shouldn't share that login's view of the data, either narrow each call with an identifier input or require end-user credentials on that connection: list it in the server's `connections[]` as `{"_connectionId": "<id>", "requiresEndUserCredentials": true}` (the same flag on the tool entry's `overrides.connections[]` also counts). Each end user then supplies their own values, once on the MCP setup page, for the fields the connection's own `endUserProvidedFields` lists, and their calls run on that personal copy. There's no fallback: an end user who hasn't connected can't use the tools that need it. Changing `endUserProvidedFields`, or unflagging or dropping the connection on the last server that flags it (a full update that omits `connections` can do that), invalidates the copies, and end users connect again. `celigo mcp-servers connections <id> --end-users` lists the copies end users hold.

### Scopes -- `mcp:read` vs `mcp:write`

Every OAuth path (Celigo or external) requires the issued token to carry MCP scopes:

- **`mcp:read`** -- non-destructive operations, such as listing available tools (`tools/list`) and invoking tools whose underlying Tool or API has no side effects.
- **`mcp:write`** -- operations that may change data or state.

The scope is checked on every request; a structurally valid token missing the required scope is rejected. Grant the minimum scope a consumer needs -- a read-only partner should not receive `mcp:write`. The scope claim usually lives in the standard OAuth `scope` or `scp` claim, depending on the IdP.

## CLI Commands

```bash
# CRUD
celigo mcp-servers list
celigo mcp-servers get <id>
celigo mcp-servers create < mcp-server.json
celigo mcp-servers update <id> < mcp-server.json
celigo mcp-servers set <id> key=value [key2=value2 ...]
celigo mcp-servers delete <id>

# Access and end-user connections (Celigo OAuth)
celigo mcp-servers assign-end-users <id> <ashareId> [<ashareId> ...] --capabilities <capabilities>
celigo mcp-servers assign-groups <id> <groupId> [<groupId> ...] --capabilities <capabilities>
celigo mcp-servers effective-access <id>
celigo mcp-servers connections <id> --end-users

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
- [ ] Every entry meant to be served has `disabled: false` (entries default to disabled), and at least one is enabled before or with the server
- [ ] Every tool entry binds each of the Tool's steps with its own `overrides.exports[]` or `overrides.imports[]` entry -- an identity `connections[]` pair doesn't count
- [ ] OAuth clients will connect: `oauth` is set explicitly (`useCeligoOauth: true`, or an external provider) -- a server with no `oauth` block has no OAuth sign-in
- [ ] Each capability set is `{name, _toolIds: [...]}` (and `_apiIds`, `_promptIds`, `_resourceIds`), listing ids of items already on the server
- [ ] With Celigo OAuth, the people meant to use the server hold grants covering every kind it exposes, checked with `celigo mcp-servers effective-access <id>`
- [ ] Each connection runs as the login you intend: the bound connection for every caller, or each end user's own (`requiresEndUserCredentials`)
- [ ] Sandbox MCP servers only reference sandbox connections and resources

## Gotchas

1. **A full update clears every array you leave out.** A PUT (`celigo mcp-servers update`) replaces each array it sends and empties each one it omits -- `tools`, `apis`, `prompts`, `resources`, `connections`, capability sets (`permissionSets`) and traffic limits (`policies`) -- without an error; `upstreamMcpConnections` and `_networkPolicyId` are the exceptions and keep their stored value when omitted. Patch the name, enabled state, traffic limits and network policy; for anything else, send the complete document back with every `_id` intact. Grants point at a capability set by its `_id`: a set sent back without it keeps the `_id` only while its name still matches (ignoring case), and a set that disappears -- left out, or renamed without its `_id` -- has every `pset:` grant rewritten into its members' own capabilities, which then no longer follow the set ([managing-end-users > 6. Grant through capability sets](../managing-end-users/SKILL.md#6-grant-through-capability-sets)). `celigo mcp-servers set` does both: it patches those four fields and round-trips the full document for any other.
2. **Script-mode and legacy APIs cannot be exposed.** Only `type: "builder"` APIs work in MCP servers. If you get a validation error on an API entry, verify the referenced API has `type: "builder"` set.
3. **Tool input schema must be `type: "object"`.** The MCP specification requires tool inputs to be JSON objects. If a tool's `input.schema` has a different root type (e.g., `array`, `string`), it cannot be exposed via MCP.
4. **Annotations are hints, not enforcement.** Setting `readOnlyHint: true` does not prevent the tool from writing data. The AI agent may ignore annotations entirely.
5. **Name uniqueness spans both arrays.** A tool named `get_customer` in `tools[]` conflicts with an API also named `get_customer` in `apis[]`. Names must be unique across the combined set.
6. **Overrides only apply to tool entries.** API entries in `apis[]` do not support annotations or overrides. To customize an API's behavior per-server, modify the API resource itself.
7. **Entries and servers start disabled.** `tools[]`, `apis[]`, `prompts[]` and `resources[]` entries default to `disabled: true`, and clients never see a disabled entry, so send `disabled: false` on each one you mean to serve. Enabling the server while nothing in it is enabled fails with 422 `mcp_server_enablement_requires_enabled_item`.
8. **Preview and logs endpoints are session-auth only.** The `/preview` and `/logs` endpoints for MCP servers are not accessible via bearer token -- they require the UI session.
9. **MCP server and MCP connection are opposite things.** An MCP *server* (this resource) publishes your capabilities outward, so external MCP clients call in. An MCP *connection* is a separate Connection resource (`type: "mcp"`) that consumes an external MCP server, so Celigo calls out. They share the word "MCP" and are configured in different places -- confusing the two is a common mistake here. If the goal is to wire Celigo to consume someone else's MCP server, reach for an MCP connection, not this resource.
10. **Every invocation counts as one MCP call.** Each tool or API invocation counts against the account's MCP entitlement, including failed calls -- a 500 still consumes a call -- and usage is aggregated across all MCP servers in the account. Enforcement is soft (threshold notifications, not blocking), so aggressive consumer-side retries inflate usage.

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
| 422 `mcp_server_enablement_requires_enabled_item` | The write enables the server while every entry is disabled (entries default to `disabled: true`) | Send `disabled: false` on at least one entry first, or in the same body |
| 422 `resource_invalid` on a capability set | Its `_toolIds` (or `_apiIds`, `_promptIds`, `_resourceIds`) name something that isn't on this server, such as a tool not in `tools[]` | List only ids of the server's own entries, in the array for their kind |
| A tool or API is missing from the client's tool list | Its entry was saved without `disabled: false` | Set `disabled: false` on the entry |
| OAuth client can't sign in to the server | The server has no `oauth` block (none is filled in for you), or it was sent as `oauth: {}` | Set `oauth: {useCeligoOauth: true}` (or an external provider), then reconnect the client |
| Every call to a tool fails with `Missing connection overrides. The following connection IDs must be overridden: …` | A step in the Tool has no binding on this server; an identity `connections[]` pair doesn't count | Add an `overrides.exports[]` or `overrides.imports[]` entry for each step (see [step 6](#6-configure-overrides-tool-entries-only)) |
