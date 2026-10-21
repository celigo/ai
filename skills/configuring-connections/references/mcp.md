# Configuring Connections with the Celigo MCP Tools

The tool calls for each section of the configuring-connections skill, for agents connected to the Celigo Platform MCP server. Section and step names match [SKILL.md](../SKILL.md).

## Ids

- `resourceType` is plural on the resource tools -- `"connections"`, `"iclients"`, `"http-connectors"`, `"trading-partner-connectors"` -- and singular on `list_audit_log_entries` (`"connection"`, `"iclient"`).
- Exports and imports carry a connection's `_id` as `_connectionId`. A connection carries its iClient's `_id` as `http._iClientId`, `netsuite._iClientId`, `salesforce._iClientId`, or `mcp._iClientId`, and its HTTP connector's `_id` as `http._httpConnectorId`.
- `list_resources` has no name or integration filter for connections and rejects `include`/`exclude` on them -- list them and match client-side on connector identity (`http._httpConnectorId`, `http._httpConnectorApiId`, legacy `assistant`; for other types the `type` and its target), not on `name`.

## Writes

**A whitelisted field is one `patch_resource` call.** Connections accept `/name`, `/debugDate`, `/debugUntil`, `/<type>/concurrencyLevel`, `/<type>/targetConcurrencyLevel`, `/_borrowConcurrencyFromConnectionId`, `/autoRecoverRateLimitErrors`, and `/endUserProvidedFields`, with `replace`, `add`, or `remove` (`remove` unsets a field; `null` values are rejected). `<type>` is the connection's adaptor block, e.g. `/http/concurrencyLevel`. iClients accept only `/oauth2/failPath`.

```
patch_resource({ resourceType: "connections", _id: "<connectionId>", body: [{ op: "replace", path: "/name", value: "Shopify - my-store" }] })
```

**Anything else is `get_resource`, then `update_resource` with the complete document.** PUT replaces the whole document and erases omitted fields -- a partial `http` object wipes the auth configuration. Send it back without the server-managed and read-only fields a GET returns (`_id`, `lastModified`, `createdAt`, `offline`, `sandbox`, `queues`) -- the server's body validation rejects them as additional properties without naming them.

```
get_resource({ resourceType: "connections", _id: "<connectionId>" })
update_resource({ resourceType: "connections", _id: "<connectionId>", body: <the complete edited document, credentials as Credential Discipline says> })
```

**Masked credentials.** `get_resource` returns stored credentials as `******`. Never send them back: a body that still carries a mask is rejected, or, on clients that support elicitation, the server asks the user to confirm first. A connection's full update needs the real secret -- one that echoes the mask, omits the secret, or carries a placeholder clears the stored credential and takes the connection offline -- so use `patch_resource` for every whitelisted field, and for any other change on a connection in use, describe it and have the user make it in the Celigo UI (SKILL.md, Credential Discipline). Placeholder credentials belong only on a connection nothing depends on yet. iClients take a different contract: the server puts the stored mask back into an omitted secret field for you (the iClient API reads it as "keep"), as long as the body still carries that field's parent object, such as `oauth2`. **Rotating a secret** is the user's job in the Celigo UI: a credential pasted into chat is compromised (see Credential Discipline), so you never write one you were given.

**Schema first.** Before a create or update, `get_resource({ resourceType: "connections", schema: true, adaptorType: "<type>" })` returns that adaptor's JSON schema and the family's writing guidance. `adaptorType` is the connection `type` (`http`, `netsuite`, `salesforce`, `rdbms`, `jdbc`, `mongodb`, `dynamodb`, `ftp`, `s3`, `filesystem`, `as2`, `van`, `mcp`, `wrapper`, `rest`) or a shared block (`oauth`, `jwt`, `ssl`, `pgp`). iClients have one schema: `get_resource({ resourceType: "iclients", schema: true })`. `create_resource` and `update_resource` are dry-run validated before anything is saved.

## 3. Check for existing connections

```
list_resources({ resourceType: "connections" })                        // every connection -- match connector identity client-side, not the name
list_resources({ resourceType: "connections", limit: 100 })            // one page; pass nextCursor back as cursor
get_resource({ resourceType: "connections", _id: "<connectionId>" })   // offline, queues, the auth shape (credentials masked)
list_marketplace({})                                                    // published templates, most-installed first
list_marketplace({ _id: "<templateId>" })                              // a template's blueprint: its objects[] entries with model "Connection"
```

**What uses a connection.** No read-only tool lists a connection's dependents. List exports and imports and match their `_connectionId` client-side. `delete_resource` runs the platform's dependency check and returns the dependents in `warnings[]`, but only as part of a delete -- never use it as a probe.

**Offline and orphaned connections.** There is no account lint: filter the connection list on `offline: true`, then match those connections against the exports and imports of enabled flows.

## 4. Check for a pre-built connector and global iClient

```
list_resources({ resourceType: "http-connectors", search: "<application-name>" })              // case-insensitive name match over the catalog
get_resource({ resourceType: "http-connectors", _id: "<connectorId>" })                         // the full connector, including its connection form
get_resource({ resourceType: "http-connectors", _id: "<connectorId>", includeOpenApi: true })  // adds an OpenAPI-style fragment: baseURIs, apis, versions
list_resources({ resourceType: "trading-partner-connectors", publishedOnly: "true" })           // Celigo-published partners; needs the B2B Manager entitlement
```

The connector's connection form is `supportedBy.connection` (a connector grouped into APIs can carry one per `apis[]` entry). Its `preConfiguredFields` are what a connection created from the connector gets -- the entry whose `path` is `http._iClientId`, when there is one, names the global iClient in `values` -- and `fieldsUserMustSet` lists what the user must supply (credentials, settings, scopes). A connection that authorizes through the global iClient can show `http._iClientId` empty at rest, so read the form when a working connection doesn't settle it.

## 5. Choose the type, auth method, and build

```
get_resource({ resourceType: "connections", schema: true, adaptorType: "http" })
create_resource({ resourceType: "connections", body: { name: "Shopify - my-store", type: "http", http: { ... } } })
```

There is no connector scaffold over MCP: build the body from the connector's `preConfiguredFields` (step 4) and set `http._httpConnectorId` and `http._httpConnectorVersionId` yourself. `create_resource` takes no `_id`.

## 6. Test the connection

No MCP tool pings a connection or runs its OAuth authorization -- see Not Available over MCP. After the user authorizes, read `offline` from `get_resource({ resourceType: "connections", _id })`.

On native adaptors (NetSuite, Salesforce, RDBMS, ...), `get_resource({ resourceType: "connections", _id: "<connectionId>", includeMetadata: true })` adds the connected application's native metadata (record types, fields, picklists) -- the discovery step before building an export.

## Connection Operations

```
list_resources({ resourceType: "connections" })
get_resource({ resourceType: "connections", _id: "<connectionId>" })
create_resource({ resourceType: "connections", body: { ... } })
update_resource({ resourceType: "connections", _id: "<connectionId>", body: { ... } })     // the complete document -- see Writes
delete_resource({ resourceType: "connections", _id: "<connectionId>" })                   // dependents come back in warnings[]
register_integration_resources({ _id: "<integrationId>", resourceType: "connections", ids: ["<connectionId>"] })
register_integration_resources({ _id: "<integrationId>", resourceType: "connections", ids: ["<connectionId>"], action: "unregister" })
```

On clients with elicitation, a delete that has dependents asks the user first; for every other caller it proceeds. An integration's registered connections are its `_registeredConnectionIds` (`get_resource({ resourceType: "integrations", _id })`) -- read-only; registering is the only way to change them.

## Credential Discipline & Runtime Behavior

### Online / offline

`get_resource({ resourceType: "connections", _id })` -- `offline: true` means the connection is offline and skipped during flow execution.

### Connections as concurrency queues

```
get_resource({ resourceType: "connections", _id: "<connectionId>" })        // queues[].size -- always present on one connection
list_resources({ resourceType: "connections", fetchQueueSize: true })        // every connection's queues in one call
patch_resource({ resourceType: "connections", _id, body: [{ op: "replace", path: "/http/concurrencyLevel", value: 25 }] })
patch_resource({ resourceType: "connections", _id, body: [{ op: "replace", path: "/http/targetConcurrencyLevel", value: 25 }] })   // instead, while autoRecoverRateLimitErrors is true
```

The path segment is the connection's own `type` (`/netsuite/concurrencyLevel`, `/ftp/targetConcurrencyLevel`, ...).

### Auto-recover rate-limit errors

```
patch_resource({ resourceType: "connections", _id, body: [{ op: "replace", path: "/autoRecoverRateLimitErrors", value: true }] })   // re-enable after the platform switched it off
patch_resource({ resourceType: "connections", _id, body: [{ op: "replace", path: "/autoRecoverRateLimitErrors", value: false }, { op: "replace", path: "/http/concurrencyLevel", value: <n> }] })   // turn it off and set the level in one PATCH
list_audit_log_entries({ resourceType: "connection", _resourceId: "<connectionId>" })                                            // where the concurrency adjustments appear
list_flow_errors({ _id: "<flowId>", status: "resolved" })                                                                        // the Resolved errors that recovered records land in
```

### Borrowing concurrency

```
patch_resource({ resourceType: "connections", _id: "<borrowerId>", body: [{ op: "replace", path: "/_borrowConcurrencyFromConnectionId", value: "<parentId>" }] })
patch_resource({ resourceType: "connections", _id: "<borrowerId>", body: [{ op: "remove", path: "/_borrowConcurrencyFromConnectionId" }] })   // stop borrowing
```

Set the parent's ceiling to the system's limit: `/<type>/targetConcurrencyLevel` while its `autoRecoverRateLimitErrors` is true, otherwise `/<type>/concurrencyLevel`.

### Wire-level debug logging

```
patch_resource({ resourceType: "connections", _id: "<connectionId>", body: [{ op: "replace", path: "/debugDate", value: "<ISO-8601 time, at most 1 hour ahead>" }] })   // arm
patch_resource({ resourceType: "connections", _id: "<connectionId>", body: [{ op: "replace", path: "/debugDate", value: "<a past ISO-8601 time>" }] })                // disarm
```

`/debugUntil` is an alias for `/debugDate`. No MCP tool reads the captured logs -- read them in the UI or with the CLI.

## iClients

```
list_resources({ resourceType: "iclients" })
get_resource({ resourceType: "iclients", _id: "<iClientId>" })               // secrets come back as ******
get_resource({ resourceType: "iclients", schema: true })
create_resource({ resourceType: "iclients", body: { provider: "custom_oauth2", ... } })
update_resource({ resourceType: "iclients", _id: "<iClientId>", body: <the complete edited document without its secret fields> })
patch_resource({ resourceType: "iclients", _id: "<iClientId>", body: [{ op: "replace", path: "/oauth2/failPath", value: "<path>" }] })
delete_resource({ resourceType: "iclients", _id: "<iClientId>" })            // dependents come back in warnings[]
```

- `update_resource` reads the iClient first and fails on an unknown id -- the platform's iClient PUT would otherwise create a new document at that id.
- To see which connections use an iClient before rotating its secret or deleting it, list connections and match `http._iClientId`, `netsuite._iClientId`, `salesforce._iClientId`, and `mcp._iClientId` client-side.
- `_iClientId` isn't patchable on a connection: point a connection at an iClient with `get_resource` then `update_resource`, then have the user authorize the connection.

## Not Available over MCP

- **Connection ping.** Read the connection's `offline` flag instead; ping with the CLI or the UI.
- **OAuth authorization.** The user authorizes in the Celigo UI, or with the CLI.
- **Reading a connection's debug logs.** `patch_resource` arms and disarms the window; read what it captured in the UI or with the CLI.
- **A connection's dependents as a read-only report** -- match `_connectionId` across exports and imports instead.
- **The account index and lint** (keyword search, offline connections in use, orphaned connections) -- list and filter client-side.
- **Replacing a connection across a flow's exports and imports in one call.** Use the CLI or the UI, or `get_resource` and `update_resource` on each export and import that still carries the old `_connectionId`.
- **Scaffolding a connection from a connector** -- build the body from the connector's connection form (step 4).

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
