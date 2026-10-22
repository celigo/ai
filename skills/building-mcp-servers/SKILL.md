---
name: building-mcp-servers
description: Build Celigo MCP server resources -- endpoints that expose Tools and builder-mode APIs to external AI agents and MCP clients. Use when creating MCP servers, linking tools or APIs, or configuring annotations and overrides.
---

<!-- TIER:1 -->

# Building MCP Servers

An MCP server is a **Model Context Protocol endpoint** that exposes Celigo Tools and builder-mode APIs as callable tools for external AI agents and MCP clients -- and, optionally, prompt templates, Celigo Storage files, and tools relayed from another MCP server. Concerns when building an MCP server:

- **Endpoint identity** -- unique `relativeURI` that, with the account's MCP alias, forms the server's URL
- **Tool selection** -- which Tool resources to expose, each with an MCP-compatible name
- **API selection** -- which builder-mode API resources to expose (script-mode APIs are not supported)
- **Prompts, files and proxies** -- inline prompt templates (`prompts[]`), Celigo Storage files (`resources[]`), and an upstream MCP server's capabilities (`upstreamMcpConnections[]`)
- **Annotations** -- MCP-standard behavior hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) that help AI agents decide when and how to call a tool
- **Overrides** -- per-server connection bindings for a tool's steps. Every tool entry needs one for each step, and they're the only overrides that change what a call does
- **Name uniqueness** -- tool names must be unique across all `tools[]` and `apis[]` entries within the server

MCP servers support configurable **authentication** of their own -- Celigo OAuth (the recommended choice, which you must turn on explicitly with `oauth: {useCeligoOauth: true}`), an external IdP, or static API tokens, gated by `mcp:read` / `mcp:write` scopes -- plus optional traffic limits and an IP network policy (see [Authentication and Scoping](#authentication-and-scoping)). Outbound calls to external systems use the connections referenced by the underlying tools and APIs.

Used alongside tools and APIs. The MCP server is a thin exposure layer -- all processing logic lives in the referenced Tool and API resources.

## Composition Patterns

A server publishes four kinds of entries, and can relay another MCP server's capabilities:

### Tool Entries (`tools[]`)

Reference Celigo Tool resources. Each tool becomes an MCP tool endpoint. The tool's `input.schema` must have `type: "object"` at the root to comply with the MCP specification. Tool entries support annotations (behavior hints) and need overrides that bind each of the Tool's steps to a connection for this server.

### API Entries (`apis[]`)

Reference Celigo builder-mode API resources. Each API becomes an MCP tool endpoint. Only `type: "builder"` APIs are supported -- script-mode and legacy APIs cannot be exposed via MCP. API entries do not support annotations or overrides.

### Prompt Entries (`prompts[]`)

Prompt templates defined inline on the server -- there's no separate prompt resource. Each has a `name` (letters, digits, `_`, `-`, `.`; unique among the server's prompts, though it may match a tool's name), one or more `messagesTemplate[]` messages with role `user` or `assistant` (`system` is refused), and `arguments[]` declaring each `{{placeholder}}` the templates use (argument names: letters, digits and `_`). Clients list them with `prompts/list` and fetch them rendered with `prompts/get`. Unlike every other entry, a prompt sent without `disabled` is saved **enabled**. A prompt keeps its `_id` -- the handle `prompt:<_id>` grants name -- only while its name stays the same: a renamed prompt gets a new `_id`, and grants on the old one stop matching it.

### Resource Entries (`resources[]`)

Celigo Storage files served to clients (`resources/list`, `resources/read`), each named by `_fileId` with an optional `title`. The file must be an active file in this account, not a folder, and can appear once per server; sandbox servers can't have resources. Resource entries start disabled. An entry keeps its `_id` (the `resource:<_id>` grant handle) only while it points at the same file. Uploading files and reading their status: [managing-file-storage > 3. Upload a file or create a folder](../managing-file-storage/SKILL.md#3-upload-a-file-or-create-a-folder).

### Proxied MCP Servers (`upstreamMcpConnections[]`)

To give clients a vendor's own MCP tools, attach the vendor's MCP connection (a Connection of `type: "mcp"`) and whitelist what to relay. Each attachment lists rows by the upstream's own names -- `tools[]`, `prompts[]` and `resources[]`, each row `{"upstreamName": ...}` with optional presentation `overrides` -- at most 500 rows per attachment, and only listed rows are served, under this server's URL, sign-in and grants. The upstream is always called with the connection's own credentials, whoever the caller is. Discovery, which reads the upstream's catalog and flags rows that changed or disappeared, runs from the integrator.io UI. The attachment's `alias` (letters, digits, `_`, `-`; at most 32 characters; stored lowercase) is derived from the connection's name when you omit it, so set it when that name is longer. A full update that omits `upstreamMcpConnections` keeps it, but one that includes it approves the upstream's current definitions, including any that changed since they were last approved -- and so does `celigo mcp-servers set` on any field it can't patch, because it sends the whole document.

### Typical Compositions

Publish an existing builder API as it is; build a new capability as a Tool, which gets annotations and per-server connection bindings. One server can mix every kind above.

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

Each prompt needs `name` and at least one `messagesTemplate[]` message; each resource needs `_fileId`.

Tool, API and resource entries default to `disabled: true` -- a prompt sent without `disabled` is saved enabled -- and clients never see a disabled entry.

### Schema Index

The schemas are in [references/schemas/](references/schemas/), and the fields every response shares in [references/common-schemas/](references/common-schemas/):

| Schema | What it defines |
|--------|----------------|
| [request.yml](references/schemas/request.yml) | Top-level MCP server fields (name, relativeURI, description, disabled, tools, apis) |
| [base.yml](references/schemas/base.yml) | Every writable server field, and which ones a full update clears or keeps when omitted |
| [response.yml](references/schemas/response.yml) | MCP server response shape (includes _id, timestamps, sandbox) |
| [io-tool.yml](references/schemas/io-tool.yml) | Tool entry schema (_toolId, name, disabled, annotations, overrides) |
| [api-tool.yml](references/schemas/api-tool.yml) | API entry schema (_apiId, name, disabled) |
| [prompt.yml](references/schemas/prompt.yml) | Prompt entry (name, arguments, messagesTemplate, disabled) |
| [resource.yml](references/schemas/resource.yml) | Resource entry (a Celigo Storage `_fileId`, title, disabled) |
| [upstream-mcp-connection.yml](references/schemas/upstream-mcp-connection.yml) | Proxied MCP server attachment and its whitelisted rows |
| [annotations.yml](references/schemas/annotations.yml) | MCP behavior hints (title, readOnlyHint, destructiveHint, idempotentHint, openWorldHint) |
| [overrides.yml](references/schemas/overrides.yml) | Per-server overrides for connections, exports, imports, and routers |
| [server-connection.yml](references/schemas/server-connection.yml) | A `connections[]` entry and its `requiresEndUserCredentials` flag |
| [permission-set.yml](references/schemas/permission-set.yml) | Capability set (`permissionSets[]`) |
| [oauth-config.yml](references/schemas/oauth-config.yml) | The `oauth` block's three sign-in modes |
| [policy.yml](references/schemas/policy.yml) | A traffic limit (`policies[]`): rate limit or quota |
| [resource-response.yml](references/common-schemas/resource-response.yml) | `_id`, `createdAt`, `lastModified` and `deletedAt`, shared by every resource response |

## Related Skills

- [building-tools > How to Build a Tool](../building-tools/SKILL.md#how-to-build-a-tool) -- building the Tool resources that MCP servers expose
- [building-apis > How to Build an API](../building-apis/SKILL.md#how-to-build-an-api) -- building the builder-mode APIs that MCP servers expose
- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connections used by tools and overridden per-server
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- exports used as lookups within tool pipelines
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- imports used as action steps within tool pipelines
- [managing-network-policies > Where a Policy Applies](../managing-network-policies/SKILL.md#where-a-policy-applies) -- limit which networks can reach the server with an IP allow/deny list (`_networkPolicyId`)
- [managing-end-users > How Access Composes](../managing-end-users/SKILL.md#how-access-composes) -- who may call a Celigo OAuth server: end users, groups, roles and capability sets
- [managing-api-tokens > Where Tokens Are Managed](../managing-api-tokens/SKILL.md#where-tokens-are-managed) -- the API tokens automation uses to call the server
- [managing-file-storage > Which Operation](../managing-file-storage/SKILL.md#which-operation) -- the Celigo Storage files a server publishes as resources

<!-- TIER:2 -->

## How to Build an MCP Server

### 1. Plan what the server exposes

Before creating anything, determine what capabilities the MCP server should offer to AI agents. Each capability maps to either a Tool or a builder-mode API. Group related capabilities under a single server with a meaningful `relativeURI`.

If the goal is an AI assistant that works on the Celigo account itself -- its flows, errors and builds -- don't build a server: connect the assistant to the Celigo Platform MCP server, which Celigo hosts in each region ([Connect the Celigo MCP server](https://github.com/celigo/ai/blob/main/docs/connect-mcp.md)). Build a server to give outside clients your own business capabilities.

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

An entry has no description of its own. Clients get the Tool's own `description` verbatim as the tool's description, its `name` as the tool's `title`, and its input and output schemas as `inputSchema` and `outputSchema`; an API entry gets the API's `name` and `description`, its request's `body`, `pathParams`, `queryParams` and `headers` as inputs, and its `success` response's body schema as output. The entry's `name` is the name clients call. A tool entry's `annotations.title` is sent too, but clients that follow the MCP spec show the `title` first. So the Tool's `description` is what a client's model reads to pick it: write it for that model ([building-tools > 1. Determine the tool's purpose](../building-tools/SKILL.md#1-determine-the-tools-purpose)).

### 5. Configure annotations (tool entries only)

Annotations are optional MCP-standard hints that help AI agents decide when and how to call a tool. Set them based on what the underlying tool actually does:

- `readOnlyHint: true` -- tool only reads data, no side effects (e.g., a lookup)
- `destructiveHint: true` -- tool deletes or permanently modifies data
- `idempotentHint: true` -- calling multiple times with the same input produces the same result
- `openWorldHint: true` -- tool interacts with external APIs where results may vary between calls

Annotations are hints only -- they are not enforced by the server.

### 6. Configure overrides (tool entries only)

A Tool's steps run on a server only after the server's entry binds them. Give each export or import step in the Tool (its `routers[].branches[].pageProcessors[]`, from `celigo tools get <toolId>`) its own entry in `overrides.exports[]` or `overrides.imports[]`: `_abstractId` and `_id` are both the step's `_exportId` or `_importId`, and `_connectionId` is the connection the step runs on for this server -- its own, or another one to use instead. Bind the instance of each system this server is meant to reach: follow the server's existing bindings, and when several online connections to the same application could serve, ask which one.

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

### 8. Go live: the URL, and a real client

Clients connect to `https://<your region's API host>/mcp/<account alias><relativeURI>` -- for a US account, for example, `https://api.integrator.io/mcp/acmecorp/order-desk`. The account alias is the account's MCP alias: creating the first server requires one (422 `mcp_server_account_alias_required`), the platform may have assigned it already, and no API returns it, so read it in the integrator.io UI. The alias and `relativeURI` together are the URL every client holds: change either and the server moves at once, and the old URL answers 404.

There's no test or preview operation for a server in the API -- a real MCP client is the test. Connect it, sign in, list the tools, and call each one once; reconnect after changing entries so the client lists them again. Before anyone signs in, one unauthenticated request shows whether the URL is right and OAuth sign-in is on:

```bash
curl -si -X POST "https://api.integrator.io/mcp/<account alias><relativeURI>" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}'
```

A 401 with a `WWW-Authenticate` header naming the server's OAuth metadata means the server is found, enabled, and ready for sign-in; other answers are in [Common Errors](#common-errors). Under Celigo OAuth, read `celigo mcp-servers effective-access <id>` before handing over the URL.

## Authentication and Scoping

Deciding who can call a server is the second design decision after deciding what it exposes. MCP servers have their own configurable authentication, independent of the connections their underlying tools use. Celigo OAuth and API tokens can be enabled at the same time on one server -- a common shape when a server serves both human users (OAuth) and automation (tokens).

### Authentication modes

- **Celigo OAuth** (`oauth: {useCeligoOauth: true}`) -- the identity provider to choose for most servers, but not one the platform applies for you: a server saved without an `oauth` block (or with `oauth: {}`) has no OAuth sign-in at all, so OAuth clients can't connect to it. Consumers authenticate with their Celigo credentials (routed to your SSO provider automatically if the account has SSO). Only this mode supports **per-user downstream connections**, which apply only to connections you mark (see [Whose login a call uses](#whose-login-a-call-uses)), and an explicit **Users list** on the server's Access tab.
- **External IdP (external OAuth)** -- validates OAuth tokens issued by your own identity provider (Auth0, Okta, etc.), set up one of two ways: point `oauth._mcpOAuthProviderId` at an account-level **MCP OAuth provider**, which holds the issuer URL, audience, required scopes and validation settings and can serve many servers (`celigo mcp-oauth-providers create`; deleting a provider removes OAuth from every server that references it), or set `issuerURL` and `audience` on the server's own `oauth` block (both or neither). Tokens are checked against the issuer's JWKS, or by RFC 7662 introspection when `useIntrospection` is `true` -- that requires `clientId` and uses `clientSecret` (a `******` sent back keeps the stored secret). With External, the Users list is not shown and per-user downstream connections are not available. Provider limits to check first: Auth0 requires the *Resource Parameter Compatibility Profile* on its application, and Microsoft Entra ID and Google Identity are not currently supported for MCP OAuth.
- **API tokens** -- static bearer tokens the consumer sends on every request. Created on the server (they also appear in the account's global API tokens list) with a name, optional description, and an auto-purge window. The value stays masked (`******`) in every API response -- only the UI's show-token action reveals it, to people who may manage the token -- so never paste it into chat. Right for service-to-service callers, legacy clients that can't do OAuth, short-lived access, or as a fallback alongside OAuth. API tokens aren't checked for `mcp:read` or `mcp:write`: a token caller can call every entry the server exposes, so the server's entries are the only way to narrow what it reaches.

The `oauth` block takes exactly one of the three: `useCeligoOauth`, `_mcpOAuthProviderId`, or inline `issuerURL` and `audience`.

Default to Celigo OAuth -- set `oauth.useCeligoOauth: true` on the server -- and add an API token alongside it when automation is in scope. Reach for an external IdP only when the consumer explicitly requires a specific provider.

### Who may use the server

With Celigo OAuth, decide who may use the server. Give each person a grant on it -- directly, through a group, or through a capability set -- that covers every kind of entry it exposes: each `:all` covers only its own kind (`tool:all`, `api:all`, `prompt:all`, `resource:all`), and specific ids grant less. Each grant call replaces that person's or group's grant on this server, so send the complete list every time. Grants govern end users only: the account owner and the environment's workspace administrators sign in and reach everything on the server with no end-user record or grant. Other workspace users need an end-user record with grants, and someone who holds both records is judged by the end-user grants alone. Check the server's compiled access before handing over the URL. Inviting people, groups and roles, and what changing a capability set does to grants: [managing-end-users](../managing-end-users/SKILL.md).

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

Every OAuth request (Celigo or external) needs a scope in the caller's token, by operation:

- **`mcp:write`** -- calling any tool (`tools/call`), whatever the Tool or API does and whatever its annotations say.
- **`mcp:read` or `mcp:write`** -- listing tools, prompts and resources, and reading prompts and resources.

So a token with only `mcp:read` sees the catalog but can't call a single tool: scopes can't make a tool call read-only. To keep an audience from changing data, publish only Tools and APIs that read. An external provider's or inline `oauth.scopes` also limits what the server allows, and is what it advertises to clients: a list of only `mcp:read` refuses every tool call with 403 `insufficient_scope`, whatever the token carries; an empty list allows both, and so does Celigo OAuth. API tokens aren't scope-checked. The scope claim usually lives in the standard OAuth `scope` or `scp` claim, depending on the IdP.

### Traffic limits

`policies[]` holds up to three limits, each checked before a tool runs; empty, the default, means unlimited:

- a server-wide **rate limit** -- `{"type": "rate-limit", "name": "Server limit", "config": {"limit": 600, "periodTime": 1, "periodTimeUnit": "MINUTE"}}` (per `MINUTE`, `HOUR` or `DAY`)
- a **per-user rate limit** -- the same with `"keyResolver": "consumer"` in `config`: each OAuth end user gets their own allowance, and API-token callers aren't counted against it
- a **quota** -- `"type": "quota"` per UTC `DAY`, `WEEK` or `MONTH`, for all callers together

A call over a limit isn't run and isn't counted: the client gets HTTP 429 with `Retry-After` and a JSON-RPC error naming the policy -- `Rate limit exceeded: <name>` or `Usage quota exceeded: <name>` -- so name each one the way callers should read it. Every `tools/call` counts, even for a tool that doesn't exist; `initialize` and the list calls never do. A second policy of the same type and key is refused. Change limits by patching the whole array, which leaves the rest of the server alone (`celigo mcp-servers set <id> 'policies=[...]'`); `"enabled": false` keeps a policy without enforcing it. A rate limit keeps the allowance already used when you raise it, so one that just tripped admits nothing until it refills.

### Network policy

`_networkPolicyId` points the server at a network policy -- an IP allow and deny list -- that every MCP request to it must pass. Use a policy from the server's own environment (otherwise 422 `invalid_ref`). A full update that omits `_networkPolicyId` keeps it; clear it with a patch `remove` (`celigo mcp-servers set <id> _networkPolicyId=null`) or `null` on a full update. Force-deleting the policy clears it from the server without an entry in the server's audit log. Creating policies, how allow and deny lists combine, and avoiding lockout: [managing-network-policies](../managing-network-policies/SKILL.md).

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

# Change history, dependents, templates
celigo mcp-servers audit <id>
celigo mcp-servers dependencies <id>
celigo mcp-servers download <id> [-o <file.zip>]
celigo mcp-servers install-template <templateId>

# External sign-in that servers share
celigo mcp-oauth-providers list
celigo mcp-oauth-providers create < provider.json

# Discovery
celigo account search "<keyword>"
celigo tools list
celigo apis list
```

`download` packages a server as a template ZIP for the Marketplace. Only tools and inline prompts travel, so a server with APIs or resources is refused up front with 400 `invalid_template` ("Installing an MCP server supports only tools and prompts. Unsupported: apis, resources."). `install-template` installs a published MCP-server template: a prompt-only one creates the server, disabled; a tool-bearing one continues as an integration install, where connections are mapped. Each install request installs again, so check for the new server before retrying one ([using-marketplace-templates](../using-marketplace-templates/SKILL.md)).

Over the Celigo Platform MCP server, `list_mcp_servers` reads servers, `upsert_mcp_server` creates one (no `_id`) or replaces it (with `_id`: a full update, see gotcha 1), and `delete_resource` deletes one. There's no patch tool, so traffic limits and the network policy change through the complete document too; `list_audit_log_entries` with `resourceType: "mcpserver"` reads the change history. Access (grants, effective access), end users' connections, templates and OAuth providers have no MCP tool: use the CLI or the integrator.io UI.

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
- [ ] Every tool, API and resource entry meant to be served has `disabled: false` (they default to disabled), every prompt not ready to serve has `disabled: true` (prompts default to enabled), and at least one item is enabled before or with the server
- [ ] Each resource names an active Celigo Storage file -- not a folder, not still `pending` -- each file once, and the server isn't a sandbox server
- [ ] Every tool entry binds each of the Tool's steps with its own `overrides.exports[]` or `overrides.imports[]` entry -- an identity `connections[]` pair doesn't count
- [ ] OAuth clients will connect: `oauth` is set explicitly (`useCeligoOauth: true`, or an external provider) -- a server with no `oauth` block has no OAuth sign-in
- [ ] Each capability set is `{name, _toolIds: [...]}` (and `_apiIds`, `_promptIds`, `_resourceIds`), listing ids of items already on the server
- [ ] With Celigo OAuth, the people meant to use the server hold grants covering every kind it exposes, checked with `celigo mcp-servers effective-access <id>`
- [ ] Each connection runs as the login you intend: the bound connection for every caller, or each end user's own (`requiresEndUserCredentials`)
- [ ] Traffic limits, if any, are one per type and key, each named the way a refused caller should read it
- [ ] A network policy, if set, is from this environment and admits every caller's address
- [ ] Sandbox MCP servers only reference sandbox connections and resources
- [ ] The URL handed over is `https://<API host>/mcp/<account alias><relativeURI>`, and one unauthenticated request to it answers 401 ([step 8](#8-go-live-the-url-and-a-real-client))

## Gotchas

1. **A full update clears every array you leave out.** A PUT (`celigo mcp-servers update`) replaces each array it sends and empties each one it omits -- `tools`, `apis`, `prompts`, `resources`, `connections`, capability sets (`permissionSets`) and traffic limits (`policies`) -- without an error; `upstreamMcpConnections`, `_networkPolicyId` and `logging` are the exceptions and keep their stored value when omitted. Patch the name, enabled state, traffic limits and network policy; for anything else, send the complete document back with every `_id` intact. Grants point at a capability set by its `_id`: a set sent back without it keeps the `_id` only while its name still matches (ignoring case), and a set that disappears -- left out, or renamed without its `_id` -- has every `pset:` grant rewritten into its members' own capabilities, which then no longer follow the set ([managing-end-users > 6. Grant through capability sets](../managing-end-users/SKILL.md#6-grant-through-capability-sets)). `celigo mcp-servers set` does both: it patches those four fields and round-trips the full document for any other.
2. **Script-mode and legacy APIs cannot be exposed.** Only `type: "builder"` APIs work in MCP servers. If you get a validation error on an API entry, verify the referenced API has `type: "builder"` set.
3. **Tool input schema must be `type: "object"`.** The MCP specification requires tool inputs to be JSON objects. The Tool itself saves with any root type (`array`, `string`), but adding it to a server is refused: "Tool '<id>' cannot be added to MCP server. MCP specification requires the tool input schema type to be 'object'."
4. **Annotations are hints, not enforcement.** Setting `readOnlyHint: true` does not prevent the tool from writing data. The AI agent may ignore annotations entirely.
5. **Name uniqueness spans both arrays.** A tool named `get_customer` in `tools[]` conflicts with an API also named `get_customer` in `apis[]`. Names must be unique across the combined set.
6. **Overrides only apply to tool entries.** API entries in `apis[]` do not support annotations or overrides. To customize an API's behavior per-server, modify the API resource itself.
7. **Entries and servers start disabled -- prompts don't.** `tools[]`, `apis[]` and `resources[]` entries default to `disabled: true`, and clients never see a disabled entry, so send `disabled: false` on each one you mean to serve. A prompt sent without `disabled` is saved enabled, so send `disabled: true` on one that isn't ready. Enabling the server while nothing in it is enabled fails with 422 `mcp_server_enablement_requires_enabled_item`.
8. **Where calls show up.** Calls are in the server's request log, in the integrator.io UI (on production, `celigo platform get v1/mcpservers/<id>/logs` reads it too; the route isn't in the published API reference yet). A published Tool's runs are in its request history with invoker type `mcp` (`celigo tools request-history <toolId> --invoker-type mcp`) if the account has the Tool-logging entitlement. Configuration changes are in the server's audit log (`celigo mcp-servers audit <id>`) -- except enabling or disabling it with a patch, which isn't recorded today. The server's `logging.mode` is `basic` unless set (`standard`, `detailed` and `noLogging` are the others). There's no preview or test route for a server: test with a real client ([step 8](#8-go-live-the-url-and-a-real-client)).
9. **MCP server and MCP connection are opposite things -- a proxy joins them.** An MCP *server* (this resource) publishes your capabilities outward, so external MCP clients call in. An MCP *connection* is a separate Connection resource (`type: "mcp"`) that consumes an external MCP server, so Celigo calls out. They share the word "MCP" and are configured in different places -- confusing the two is a common mistake here. If the goal is to wire Celigo to consume someone else's MCP server, reach for an MCP connection, not this resource; to hand that server's tools on to your own clients, attach the connection to a server as a proxy ([Proxied MCP Servers](#proxied-mcp-servers-upstreammcpconnections)).
10. **Every invocation counts as one MCP call.** Each tool or API invocation counts against the account's MCP entitlement, including failed calls -- a 500 still consumes a call -- and usage is aggregated across all MCP servers in the account. The entitlement only sends threshold notifications; it never blocks. A server's own traffic limits do block, with 429 ([Traffic limits](#traffic-limits)), so aggressive consumer-side retries both inflate usage and trip them.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 "Relative URI should only use letters, numbers, dashes, colons, underscores or dots." | `relativeURI` isn't `/` plus one segment of letters, digits, `-` and `_` (colons and dots are refused too, whatever the message says) | Use a single segment, such as `/order-desk` |
| 422 `mcp_server_duplicate_relative_uri` "An MCP server with relative URI '…' already exists." | Another server in the account uses it | Choose another `relativeURI` (`celigo mcp-servers list`) |
| 422 `mcp_server_account_alias_required` | The account has no MCP alias yet | Have the user set it in the integrator.io UI -- it becomes part of every server URL, and the API can't set it -- then create the server |
| 422 "Tool not found" / "API not found" | An entry's `_toolId` or `_apiId` isn't a Tool or API in this account | Check with `celigo tools get <id>` or `celigo apis get <id>` |
| 422 "Duplicate tool name found: \"…\". Each tool must have a unique name within the MCP server." | Two entries share a `name` -- names span `tools[]` and `apis[]` | Rename one |
| 422 "Each Tool can only be referenced once per MCP server. Duplicate Tool found." | The same `_toolId` in two entries (an `_apiId` twice is refused too) | Keep one entry per Tool or API |
| 422 "Tool name must contain only letters (A-Z, a-z), digits (0-9), underscore (_), hyphen (-), and dot (.)." | An entry `name` has a space or another character | Use letters, digits, `_`, `-` and `.` (at most 128 characters) |
| 422 "API is invalid. Only builder type APIs can be used in MCP servers" | The API is script-mode | Publish a builder-mode API, or put the logic in a Tool |
| 422 "Tool '…' cannot be added to MCP server. MCP specification requires the tool input schema type to be 'object'." | The Tool's `input.schema` root isn't `type: "object"` (the Tool itself saved) | Give the Tool an object input schema |
| 422 `mcp_server_invalid_array_item` "Each entry in tools must be an object. Null or invalid entries are not allowed." | A `null` in `tools`, `apis`, `prompts`, `resources` or `upstreamMcpConnections` | Remove it |
| 422 `mcp_server_duplicate_prompt_name` "Duplicate prompt name '…' found. Each prompt must have a unique name within the MCP server." | Two prompts share a `name` | Rename one |
| 422 "`system` is not a valid enum value for path `role`." | A prompt message with role `system` | Use `user` or `assistant`; put system-level instructions in the first message |
| 422 `mcp_server_file_not_found` "File not found: …" | A resource's `_fileId` is a folder, a deleted or another account's file, or a file still `pending` seconds after its upload | Use an active file's id; after an upload, read the file back until `status` is `active` |
| 422 `mcp_server_resources_not_allowed_in_sandbox` | `resources` on a sandbox server | Leave `resources` out on sandbox servers |
| 422 `mcp_server_duplicate_policy` "Each policy can only be configured once per MCP server. Duplicate server rate limit found." | Two traffic limits with the same `type` and `keyResolver` | Keep one server rate limit, one per-user rate limit and one quota |
| 422 `mcp_server_enablement_requires_enabled_item` | The write enables the server while every entry is disabled (tool, API and resource entries default to `disabled: true`) | Send `disabled: false` on at least one entry first, or in the same body |
| 422 `resource_invalid` on a capability set | Its `_toolIds` (or `_apiIds`, `_promptIds`, `_resourceIds`) name something that isn't on this server, such as a tool not in `tools[]` | List only ids of the server's own entries, in the array for their kind |
| 422 `invalid_ref` on `_networkPolicyId` | The policy belongs to another environment, or doesn't exist | Use a policy from the server's own environment |
| 400 `invalid_template` on `download` | The server publishes APIs or resources | Only tools and prompts go into a template |
| A tool or API is missing from the client's tool list | Its entry was saved without `disabled: false`, or the client listed the tools before the change | Set `disabled: false` on the entry; reconnect the client |
| The client gets 404 `resource_not_found` | A wrong alias or `relativeURI` -- or the server is disabled, which answers the same | Check the URL ([step 8](#8-go-live-the-url-and-a-real-client)) and the server's `disabled` |
| OAuth client can't sign in to the server | The server has no `oauth` block (none is filled in for you), or it was sent as `oauth: {}`: requests get 401 with no `WWW-Authenticate` challenge, so the client has nothing to sign in to | Set `oauth: {useCeligoOauth: true}` (or an external provider), then reconnect the client |
| 401 "Bearer Authentication Failed" | The caller's bearer token isn't accepted -- wrong, revoked or expired | Give the caller a valid token ([managing-api-tokens](../managing-api-tokens/SKILL.md)) |
| Signed in, but a tool is missing or every call is refused | Under Celigo OAuth, no grant covers that kind of entry on this server for that person | Read `celigo mcp-servers effective-access <id>` and grant the missing kind ([Who may use the server](#who-may-use-the-server)) |
| A workspace user who isn't an administrator signs in, then every request is refused | Grants come from an end-user record, and they have none | Invite them as an end user and grant the server ([managing-end-users](../managing-end-users/SKILL.md)) |
| 403 `insufficient_scope` on `tools/call`, while listing works | The token has only `mcp:read`, or the server's `oauth.scopes` lists only `mcp:read` | Every tool call needs `mcp:write`: have the client request it, or add it to the server's (or provider's) scopes ([Scopes](#scopes----mcpread-vs-mcpwrite)) |
| Every call to a tool fails with `Missing connection overrides. The following connection IDs must be overridden: …` | A step in the Tool has no binding on this server; an identity `connections[]` pair doesn't count | Add an `overrides.exports[]` or `overrides.imports[]` entry for each step (see [step 6](#6-configure-overrides-tool-entries-only)) |
| One end user's calls fail on a connection while everyone else's work | The connection requires end-user credentials and that person hasn't supplied theirs (there's no fallback) | Have them connect on the MCP setup page; `celigo mcp-servers connections <id> --end-users` lists who has |
| Callers see data that isn't theirs | Every caller runs on the bound connection's one login | Narrow each call with an identifier input, or require end-user credentials ([Whose login a call uses](#whose-login-a-call-uses)) |
| 429 `Rate limit exceeded: <name>` or `Usage quota exceeded: <name>` | One of the server's traffic limits refused the call before the tool ran | Retry after `Retry-After`; raise or disable the policy if the limit is wrong ([Traffic limits](#traffic-limits)) |
