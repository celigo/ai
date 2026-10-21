# Configuring Connections with the Celigo MCP Tools

The tool calls for each section of the configuring-connections skill, for agents connected to the Celigo Platform MCP server. Section and step names match [SKILL.md](../SKILL.md).

## Ids

- `delete_resource` takes a plural `resourceType` -- `"connections"`, `"iclients"` -- and `list_audit_log_entries` a singular one (`"connection"`, `"iclient"`).
- Exports and imports carry a connection's `_id` as `_connectionId`. A connection carries its iClient's `_id` as `http._iClientId`, `salesforce._iClientId`, `mcp.http._iClientId`, `s3._iClientId`, `rdbms._iClientId`, or `netsuite._iClientId`, and its HTTP connector's `_id` as `http._httpConnectorId`.
- `list_connections` has no name or integration filter, and the API answers 500 to `include` on connections -- list them whole and match client-side on connector identity (`http._httpConnectorId`, `http._httpConnectorApiId`, legacy `assistant`; for other types the `type` and its target), not on `name`.

## Writes

**No tool patches a connection.** A whitelisted field -- `name`, the debug window, the concurrency settings, borrowing, auto-recover, and `endUserProvidedFields` (SKILL.md, Connection Operations) -- goes through the UI or the CLI's `connections set`; never fall back to a full update for one. `upsert_connection` with an `_id` is a full PUT: it keeps each stored secret whose `******` mask goes back exactly as read, and clears a secret it leaves out (a token connection without its token is refused with 422 instead). A credential or auth-type change needs the new secret, so it's the user's to make in the UI, where re-entering the credential or re-authorizing is part of the save (SKILL.md, Credential Discipline).

**Masked credentials.** `list_connections` returns stored credentials as `******`. Sent back unchanged, a mask keeps its stored secret, and `upsert_connection` refuses a body carrying one unless you pass `force: true`. Pass it only with masks this connection's own read returned. The tool's description and error message may say the mask wipes the secret and suggest leaving the masked fields out; leaving them out is what clears them. **Rotating a secret** is the user's job in the Celigo UI: a credential pasted into chat is compromised (see Credential Discipline), so you never write one you were given.

**A full update** (a base URI, an endpoint, a header): read the connection with `list_connections` and the `_id`, edit it, then send `upsert_connection` the `_id`, the complete document with every `******` left as read, and `force: true`. PUT replaces the whole document and erases omitted fields -- a partial `http` object wipes the auth configuration. Leave out the server-managed and read-only fields a GET returns (`_id`, `lastModified`, `createdAt`, `offline`, `sandbox`, `queues`).

```
list_connections({ _id: "<connectionId>" })
upsert_connection({ _id: "<connectionId>", force: true, body: <the complete edited document, every ****** left exactly as read> })
```

**iClients follow the same mask rule.** The iClient API keeps a secret sent back as the exact `******` mask, so `upsert_iclient` with an `_id` takes the complete document with every secret field as read (it needs no `force`). Never drop a secret to keep it, whatever the tool's description says: an `oauth2` block without `clientSecret` is refused with 422 `missing_required_field`, and other providers' secrets aren't preserved. A Google service account iClient needs its full JSON key on every update, so that change is the user's, in the UI (SKILL.md, iClient Operations).

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

The connector's connection form is `supportedBy.connection` (a connector grouped into APIs can carry one per `apis[]` entry). Its `preConfiguredFields` are what a connection created from the connector gets -- the entry whose `path` is `http._iClientId`, when there is one, names the global iClient in `values` -- and `fieldsUserMustSet` lists what the user must supply (credentials, settings, scopes). A connection that authorizes through the global iClient can show `http._iClientId` empty at rest, so find the global iClient in the form, not on another connection.

## 5. Choose the type, auth method, and build

```
get_schema({ target: "resource", name: "connection/http" })
upsert_connection({ body: { name: "Shopify - my-store", type: "http", http: { ... } } })
```

There is no connector scaffold over MCP: build the body from the connector's `preConfiguredFields` (step 4) and set `http._httpConnectorId` and `http._httpConnectorVersionId` yourself, plus `http._httpConnectorApiId` for a connector with more than one API. A create takes no `_id`.

## 6. Test the connection

No MCP tool pings a connection or runs its OAuth authorization -- see Not Available over MCP. After the user authorizes, read `offline` from `list_connections({ _id })`.

On native adaptors (NetSuite, Salesforce, RDBMS, ...), `get_schema({ target: "connector", name: "<connectionId>" })` returns the connected application's native metadata (record types, fields, picklists) -- the discovery step before building an export.

## Connection Operations

```
list_connections({})
list_connections({ _id: "<connectionId>" })
upsert_connection({ body: { ... } })                                       // create
upsert_connection({ _id: "<connectionId>", body: { ... } })                // the complete document, only on a connection nothing uses yet -- see Writes
delete_resource({ resourceType: "connections", _id: "<connectionId>" })    // dependents come back in warnings, after the delete
```

`delete_resource` deletes even when the connection has dependents, so confirm the target with the user first. An integration's registered connections are its `_registeredConnectionIds` (`list_integrations({ _id })`); no MCP tool registers or deregisters one.

## Credential Discipline & Runtime Behavior

### Online / offline

`list_connections({ _id })` -- `offline: true` means the connection is offline and skipped during flow execution. Fixing it is a change to an existing connection, so the user makes it in the UI (or with the CLI) -- see Writes.

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

- An iClient update keeps a secret sent back as the exact `******` mask, so send the secret fields back as read; leaving one out never keeps it (see Writes).
- To see which connections use an iClient before rotating its secret or deleting it, list connections and match `http._iClientId`, `salesforce._iClientId`, `mcp.http._iClientId`, `s3._iClientId`, `rdbms._iClientId`, and `netsuite._iClientId` client-side.
- On a connector connection, an `http._iClientId` that `list_iclients({ _id })` answers with 404 `invalid_ref` names Celigo's published iClient, which lives in Celigo's account: normal, not a deleted iClient (SKILL.md, step 4).
- Pointing a connection at an iClient changes its `_iClientId`, which takes a full update of the connection -- so the user makes it in the UI, then authorizes the connection.

## Not Available over MCP

- **Any change to an existing connection.** A targeted change (rename, concurrency, borrowing, auto-recover, the debug window, `endUserProvidedFields`) is the UI or the CLI's `connections set`; anything else is the UI. The one exception is a connection nothing uses yet (Writes).
- **Connection ping.** Read the connection's `offline` flag instead; ping with the CLI or the UI.
- **OAuth authorization.** The user authorizes in the Celigo UI, or with the CLI.
- **A connection's debug logs** -- arming the window and reading what it captured; the UI or the CLI.
- **A connection's dependents as a read-only report** -- match `_connectionId` across exports and imports instead.
- **The account index and lint** (keyword search, offline connections in use, orphaned connections) -- list and filter client-side.
- **Registering a connection on an integration**, or deregistering it -- the UI, or the CLI's `integrations register-connections` and `integrations deregister-connections`.
- **Trading partner connectors** -- the UI, or the CLI's `tp-connectors list`.
- **Replacing a connection in one call** on a flow, API, Tool, export, or import. Use the CLI or the UI, or `list_<type>` and `upsert_<type>` on each export and import that still carries the old `_connectionId` -- same type, and for HTTP the same application (SKILL.md, Connection Operations).
- **Scaffolding a connection from a connector** -- build the body from the connector's connection form (step 4).
- **Changing only an iClient's `oauth2.failPath`** -- a full `upsert_iclient`, or the CLI's `iclients set`.

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
