# Configuring Connections with the Celigo MCP Tools

The tool calls for each section of the configuring-connections skill, for agents connected to the Celigo Platform MCP server. Section and step names match [SKILL.md](../SKILL.md).

## Ids

- `delete_resource` takes a plural `resourceType` -- `"connections"`, `"iclients"` -- and `list_audit_log_entries` a singular one (`"connection"`, `"iclient"`).
- Exports and imports carry a connection's `_id` as `_connectionId`. A connection carries its iClient's `_id` as `http._iClientId`, `netsuite._iClientId`, `salesforce._iClientId`, or `mcp._iClientId`, and its HTTP connector's `_id` as `http._httpConnectorId`.
- `list_connections` has no name or integration filter, and the API answers 500 to `include` on connections -- list them whole and match client-side on connector identity (`http._httpConnectorId`, `http._httpConnectorApiId`, legacy `assistant`; for other types the `type` and its target), not on `name`.

## Writes

**No tool makes a targeted change to a connection.** The platform's PATCH whitelist -- `name`, the debug window, the concurrency settings, borrowing, auto-recover, and `endUserProvidedFields` (SKILL.md, Connection Operations) -- has no MCP tool, and `upsert_connection` with an `_id` is a full PUT. For a whitelisted field on a connection in use, describe the change and have the user make it in the Celigo UI, or make it with the CLI's `connections set` if you have the CLI. Never fall back to a full update for it.

**A full update is `list_connections` with the `_id`, then `upsert_connection` with the `_id` and the complete document.** PUT replaces the whole document and erases omitted fields -- a partial `http` object wipes the auth configuration. Send it back without the server-managed and read-only fields a GET returns (`_id`, `lastModified`, `createdAt`, `offline`, `sandbox`, `queues`).

```
list_connections({ _id: "<connectionId>" })
upsert_connection({ _id: "<connectionId>", body: <the complete edited document, credentials as Credential Discipline says> })
```

**Masked credentials.** `list_connections` returns stored credentials as `******`. Never send them back: `upsert_connection` rejects a body that still carries a mask unless you pass `force: true`, and you never pass it. Its error message suggests leaving the masked fields out, but a connection's full update needs the real secret -- one that echoes the mask, omits the secret, or carries a placeholder clears the stored credential and takes the connection offline. So for any change on a connection in use, describe it and have the user make it in the Celigo UI (SKILL.md, Credential Discipline). Placeholder credentials belong only on a connection nothing depends on yet. iClients take a different contract: the iClient API keeps a secret sent back as the exact `******` mask and rejects a body that leaves a secret field out, so send an iClient's secret fields back as read. **Rotating a secret** is the user's job in the Celigo UI: a credential pasted into chat is compromised (see Credential Discipline), so you never write one you were given.

**Schema first.** Before a create or update, `get_schema({ target: "resource", name: "connection/<type>" })` returns that adaptor's JSON schema. `<type>` is the connection `type` (`http`, `netsuite`, `salesforce`, `rdbms`, `jdbc`, `mongodb`, `dynamodb`, `ftp`, `s3`, `filesystem`, `as2`, `van`, `mcp`, `wrapper`, `rest`) or a shared block (`oauth`, `jwt`, `ssl`, `pgp`); `name: "connection"` alone lists them in `availableSubSchemas`. iClients have one schema: `get_schema({ target: "resource", name: "iclient" })`.

## 3. Check for existing connections

```
list_connections({})                              // every connection -- match connector identity client-side, not the name
list_connections({ limit: 100 })                  // one page; pass nextCursor back as cursor
list_connections({ _id: "<connectionId>" })       // offline, queues, the auth shape (credentials masked)
list_marketplace({})                              // published templates, most-installed first
list_marketplace({ _id: "<templateId>" })         // a template's blueprint: its objects[] entries with model "Connection"
```

**What uses a connection.** No read-only tool lists a connection's dependents. List exports and imports and match their `_connectionId` client-side. `delete_resource` scans for dependents and returns them in `warnings`, but only as part of a delete that goes ahead anyway -- never use it as a probe.

**Offline and orphaned connections.** There is no account lint: filter the connection list on `offline: true`, then match those connections against the exports and imports of enabled flows.

## 4. Check for a pre-built connector and global iClient

```
get_schema({ target: "connector", name: "<application-name>" })       // case-insensitive name match over the catalog: the connector, or the candidates
get_schema({ target: "connector", name: "<connectorId>" })            // the full connector, including its connection form
get_schema({ target: "connector_openapi", name: "<connectorId>" })    // its OpenAPI fragment
```

The connector's connection form is `supportedBy.connection` (a connector grouped into APIs can carry one per `apis[]` entry). Its `preConfiguredFields` are what a connection created from the connector gets -- the entry whose `path` is `http._iClientId`, when there is one, names the global iClient in `values` -- and `fieldsUserMustSet` lists what the user must supply (credentials, settings, scopes). A connection that authorizes through the global iClient can show `http._iClientId` empty at rest, so read the form when a working connection doesn't settle it.

## 5. Choose the type, auth method, and build

```
get_schema({ target: "resource", name: "connection/http" })
upsert_connection({ body: { name: "Shopify - my-store", type: "http", http: { ... } } })
```

There is no connector scaffold over MCP: build the body from the connector's `preConfiguredFields` (step 4) and set `http._httpConnectorId` and `http._httpConnectorVersionId` yourself. A create takes no `_id`.

## 6. Test the connection

No MCP tool pings a connection or runs its OAuth authorization -- see Not Available over MCP. After the user authorizes, read `offline` from `list_connections({ _id })`.

On native adaptors (NetSuite, Salesforce, RDBMS, ...), `get_schema({ target: "connector", name: "<connectionId>" })` returns the connected application's native metadata (record types, fields, picklists) -- the discovery step before building an export.

## Connection Operations

```
list_connections({})
list_connections({ _id: "<connectionId>" })
upsert_connection({ body: { ... } })                                       // create
upsert_connection({ _id: "<connectionId>", body: { ... } })                // the complete document -- see Writes
delete_resource({ resourceType: "connections", _id: "<connectionId>" })    // dependents come back in warnings, after the delete
```

`delete_resource` deletes even when the connection has dependents, so confirm the target with the user first. An integration's registered connections are its `_registeredConnectionIds` (`list_integrations({ _id })`); no MCP tool registers or deregisters one.

## Credential Discipline & Runtime Behavior

### Online / offline

`list_connections({ _id })` -- `offline: true` means the connection is offline and skipped during flow execution.

### Connections as concurrency queues

```
list_connections({ _id: "<connectionId>" })    // queues[].size -- always present on one connection
list_connections({ fetchQueueSize: true })     // every connection's queues in one call
```

Changing the level -- `<type>.concurrencyLevel`, or `<type>.targetConcurrencyLevel` while `autoRecoverRateLimitErrors` is true -- is a targeted change no MCP tool makes: the user makes it in the UI, or use the CLI (Writes).

### Auto-recover rate-limit errors

```
list_audit_log_entries({ resourceType: "connection", _resourceId: "<connectionId>" })    // where the concurrency adjustments appear
```

Re-enabling auto-recover, or turning it off and setting the level in one PATCH, has no MCP tool either -- the UI or the CLI. The records it recovers land in the Resolved errors, which no MCP tool reads.

### Borrowing concurrency

Setting or clearing `_borrowConcurrencyFromConnectionId`, and setting the parent's ceiling to the system's limit (`<type>.targetConcurrencyLevel` while its `autoRecoverRateLimitErrors` is true, otherwise `<type>.concurrencyLevel`), are targeted changes with no MCP tool -- the UI or the CLI.

### Wire-level debug logging

No MCP tool arms a connection's debug window or reads what it captured -- the UI or the CLI.

## iClients

```
list_iclients({})
list_iclients({ _id: "<iClientId>" })                                 // secrets come back as ******
get_schema({ target: "resource", name: "iclient" })
upsert_iclient({ body: { provider: "custom_oauth2", ... } })
upsert_iclient({ _id: "<iClientId>", body: <the complete edited document, secret fields as read> })
delete_resource({ resourceType: "iclients", _id: "<iClientId>" })     // dependents come back in warnings, after the delete
```

- An iClient update keeps a secret sent back as the exact `******` mask and rejects a body that leaves a secret field out, so send the secret fields back as read.
- To see which connections use an iClient before rotating its secret or deleting it, list connections and match `http._iClientId`, `netsuite._iClientId`, `salesforce._iClientId`, and `mcp._iClientId` client-side.
- Pointing a connection at an iClient changes its `_iClientId`, which takes a full update of the connection -- so the user makes it in the UI, then authorizes the connection.

## Not Available over MCP

- **A targeted change to a connection** -- rename, concurrency, borrowing, auto-recover, the debug window, `endUserProvidedFields`. The user makes it in the UI, or use the CLI's `connections set`.
- **Connection ping.** Read the connection's `offline` flag instead; ping with the CLI or the UI.
- **OAuth authorization.** The user authorizes in the Celigo UI, or with the CLI.
- **A connection's debug logs** -- arming the window and reading what it captured; the UI or the CLI.
- **A connection's dependents as a read-only report** -- match `_connectionId` across exports and imports instead.
- **The account index and lint** (keyword search, offline connections in use, orphaned connections) -- list and filter client-side.
- **Registering a connection on an integration**, or deregistering it -- the UI, or the CLI's `integrations register-connections` and `integrations deregister-connections`.
- **Trading partner connectors** -- the UI, or the CLI's `tp-connectors list`.
- **Replacing a connection across a flow's exports and imports in one call.** Use the CLI or the UI, or `list_<type>` and `upsert_<type>` on each export and import that still carries the old `_connectionId`.
- **Scaffolding a connection from a connector** -- build the body from the connector's connection form (step 4).
- **Changing only an iClient's `oauth2.failPath`** -- a full `upsert_iclient`, or the CLI's `iclients set`.

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
