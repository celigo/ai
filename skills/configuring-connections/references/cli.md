# Configuring Connections with the `celigo` CLI

The commands for each section of the configuring-connections skill. Section and step names match [SKILL.md](../SKILL.md). Before the first write of a session (create, update, set, delete, enable-debug, authorize, register), confirm which account the CLI targets -- see getting-started, "Which account the CLI targets".

## Writes: `set` and `update`

For most resource types, `celigo <type> set` does the GET, edit, and PUT for you. Connections and iClients are the exception, because their GET masks credentials: `set` applies only the PATCH-whitelisted fields, as one atomic PATCH that never re-sends the masks, and refuses any other field rather than fall back to a GET and PUT that would write `******` over the stored secrets.

- **`connections set`** -- `name`, `debugDate`, `debugUntil`, `<adaptor>.concurrencyLevel`, `<adaptor>.targetConcurrencyLevel`, `_borrowConcurrencyFromConnectionId`, `autoRecoverRateLimitErrors`, `endUserProvidedFields`. `<adaptor>` is the connection's `type` block (`http.concurrencyLevel`); `field=null` removes the field.
- **`iclients set`** -- `oauth2.failPath` only.
- **`update`** sends the complete document (PUT) from stdin or `--file`, and refuses a body that still contains masked `"******"` values unless you pass `--force`. On a connection, remove the masked fields from the body to keep the stored secrets; to rotate one, put the new value in that field and remove the other masked fields.
- **`create`** refuses masked values with no override -- a new connection has no secret behind the mask.

An iClient update works the other way round on the platform: it keeps a secret whose field still carries the exact `******` mask, and rejects a body that leaves a secret field out (422 `missing_required_field`). An `iclients update` that leaves a secret unchanged therefore needs the real value, or the unchanged mask sent with `--force`.

```bash
celigo connections set <id> name="Shopify - my-store"
celigo connections set <id> http.concurrencyLevel=10
celigo connections update <id> --file connection.json     # the complete document, masked fields removed
```

## 3. Check for existing connections

```bash
# Search the account for existing connections by name or keyword
celigo account search "<application-name>" [--type connection]

# Show what uses a connection (exports, imports)
celigo account dependencies connection <id>

# Find offline connections used by enabled flows, orphaned connections
celigo account lint

# Search marketplace for pre-built integration templates
celigo templates marketplace

# Preview a template's connection model
celigo templates preview <id> --model Connection

# List all connections
celigo connections list

# Filter by name or type
celigo connections list | grep -i "<application-name>"
```

`account search`, `account dependencies`, and `account lint` read a local account index that auto-refreshes when it is older than 15 minutes (`CELIGO_INDEX_STALE_MINUTES`; `--no-refresh` skips the refresh). Force a fresh snapshot with `celigo account snapshot`. Before deleting a connection, ask the server rather than the index: `celigo connections dependencies <id>` walks every reference path, including ones the local graph can miss.

## 4. Check for a pre-built connector and global iClient

```bash
# Search HTTP connectors (550+ apps: Shopify, Stripe, HubSpot, etc.)
celigo http-connectors list [--search <term>]
celigo http-connectors get <id> --full    # see auth config, endpoints, resources

# Search trading partner connectors (EDI, AS2, VAN)
celigo tp-connectors list
```

The connector list is abridged: no base URIs or auth details. `celigo http-connectors match <url|name>` reads them for the connectors that fit and reports what each one's connection form prescribes -- the auth types it offers and the one it preselects, Celigo's global iClient when it ships one (`globalIClientId`), and the fields you must set. `get --full` includes the endpoints, resources, supported fields, and global iClient references.

`celigo connections get <id>` adds a note on stderr when a connector OAuth connection has an empty `http._iClientId`, saying whether it authorizes through the connector's global iClient or still needs an iClient of its own.

## 5. Choose the type, auth method, and build

```bash
celigo connections create < connection.json
celigo connections create --connector <id|name> --name "<name>"    # scaffold from a pre-built HTTP connector
```

`create` is connector-first. `--connector` scaffolds what the connector's own form saves -- form type, connector, API and version ids, its default auth type and pre-configured fields, a base URI -- merges your body's fields over it, and lists on stderr the fields you still have to set; it never invents credentials. A hand-written `type: "http"` body whose base URI a pre-built connector serves is refused (use `--connector`, or `--allow-raw-http` to create the raw connection deliberately), and a connector body whose `http.auth.type` the connector doesn't offer needs `--auth-type <type>` to confirm it. `--tp-connector <id|name>` links an `as2`, `ftp`, or `s3` connection to a trading partner connector. `--dry-run` prints the body that would be sent without creating anything.

## 6. Test the connection

```bash
celigo connections authorize <id> [--timeout <seconds>] [--print-url]    # OAuth connections, before the first ping
celigo connections ping <id>
```

`authorize` opens the provider's authorization page in your browser (`--print-url` prints the URL instead), waits until the connection no longer needs authorization (`--timeout` defaults to 180 seconds), then pings it. `ping --distributed` pings the Celigo distributed adaptor installed behind a NetSuite or Salesforce connection (the SuiteApp or bundle, or the Salesforce package) rather than the connection itself.

On NetSuite, Salesforce, and RDBMS connections, read the connected application's native metadata through the connection:

```bash
celigo metadata types <connectionId>                  # NetSuite record types and saved searches, Salesforce sObjects, RDBMS tables
celigo metadata fields <connectionId> <entityType>
```

## Connection Operations

```bash
# CRUD
celigo connections list
celigo connections get <id>
celigo connections create < connection.json
celigo connections update <id> < connection.json
celigo connections delete <id>

# Targeted changes (the PATCH whitelist -- see Writes above)
celigo connections set <id> <field>=<value>

# Test connectivity
celigo connections ping <id>

# OAuth authorization (opens browser for OAuth flow)
celigo connections authorize <id> [--timeout <seconds>] [--print-url]

# Debug
celigo connections enable-debug <id> [--duration <minutes>]
celigo connections disable-debug <id>
celigo connections debug-logs <id>

# Integration-level connection management
celigo integrations register-connections <integrationId> <connectionIds...>
celigo integrations deregister-connections <integrationId> <connectionIds...>

# Replace connection across a flow's exports/imports
celigo flows replace-connection <flowId> <oldConnectionId> <newConnectionId>
```

`connections list --integration <id>` lists one integration's connections. `connections delete` and `integrations deregister-connections` ask for confirmation; `-y` skips it.

## Credential Discipline & Runtime Behavior

### Online / offline

```bash
celigo connections ping <id>
celigo connections get <id>        # offline: true -- the connection is offline
```

### Connections as concurrency queues

```bash
celigo connections get <id>                                   # queues[].size -- messages waiting on this connection
celigo connections set <id> http.concurrencyLevel=25          # use the connection's own type block
celigo connections set <id> http.targetConcurrencyLevel=25    # instead, while autoRecoverRateLimitErrors is true
```

### Auto-recover rate-limit errors

```bash
celigo connections set <id> autoRecoverRateLimitErrors=true   # re-enable after the platform switched it off
celigo connections audit <id>                                 # the connection's audit log, where the concurrency adjustments appear
```

### Borrowing concurrency

```bash
celigo connections set <borrowerId> _borrowConcurrencyFromConnectionId=<parentId>
celigo connections set <parentId> http.concurrencyLevel=<the system's limit>
celigo connections set <borrowerId> _borrowConcurrencyFromConnectionId=null     # stop borrowing
```

### Wire-level debug logging

```bash
celigo connections enable-debug <id> [--duration <minutes>]   # default and maximum 60 minutes
celigo connections debug-logs <id> [--resource <exportOrImportId>]
celigo connections disable-debug <id>
celigo connections delete-debug-logs <id>                     # clear the captured logs
```

`enable-debug` PATCHes `debugDate` to now plus `--duration`, and `disable-debug` removes it. `--resource` narrows the shared log stream to one export's or import's traffic.

## iClients

```bash
# CRUD
celigo iclients list
celigo iclients get <id>
celigo iclients create < iclient.json
celigo iclients update <id> < iclient.json
celigo iclients delete <id>

celigo iclients set <id> oauth2.failPath=<path>     # the only field set can change
celigo iclients dependencies <id>                   # what references the iClient -- check before deleting or rotating it
```

See Writes above for how `update` treats an iClient's masked secrets.

### 3. Reference from the connection

Set `_iClientId` on the connection with `connections update` (it isn't a `set` field), then authorize the connection:

```bash
celigo connections authorize <connectionId>
```

## Common Errors

For `401 Unauthorized` on an OAuth connection, and for OAuth `invalid_grant`, re-authorize: `celigo connections authorize <id>`.
