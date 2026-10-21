# Configuring Connections with the `celigo` CLI

The commands for each section of the configuring-connections skill. Section and step names match [SKILL.md](../SKILL.md). Before the first write of a session (create, update, set, delete, enable-debug, authorize, register), confirm which account the CLI targets -- see getting-started, "Which account the CLI targets".

## Writes: `set` and `update`

For most resource types, `celigo <type> set` does the GET, edit, and PUT for you. Connections and iClients are the exception, because their GET masks credentials: `set` applies only the PATCH-whitelisted fields, as one atomic PATCH that never re-sends the masks, and refuses any other field rather than fall back to a GET and PUT on its own; `update --force` is the deliberate way to send a document with its masks.

- **`connections set`** -- `name`, `debugDate`, `debugUntil`, `<adaptor>.concurrencyLevel`, `<adaptor>.targetConcurrencyLevel`, `_borrowConcurrencyFromConnectionId`, `autoRecoverRateLimitErrors`, `endUserProvidedFields`. `<adaptor>` is the connection's `type` block (`http.concurrencyLevel`); `field=null` removes the field.
- **`iclients set`** -- `oauth2.failPath` only.
- **`update`** sends the complete document (PUT) from stdin or `--file`, and refuses a body that still contains masked `"******"` values unless you pass `--force`. A mask sent back keeps the stored secret, so an update that changes other fields sends every secret field as read, with `--force`; an omitted or placeholder secret clears the stored one (SKILL.md, Credential Discipline). `set` stays the simpler path for the whitelisted fields.
- **`create`** refuses masked values with no override -- a new connection has no secret behind the mask.

**Updates send the masks back.** The platform keeps a connection or iClient secret whose field still carries the exact `******` mask, so a `connections update` or `iclients update` that changes other fields sends every secret field as read and passes `--force` to get past the mask check. Some CLI releases still warn that the PUT would write the masks over the secrets; it doesn't. Never drop a secret field instead: a connection clears an omitted secret (a static-token connection without its token is refused with 422), an `oauth2` iClient block without `clientSecret` is refused with 422 `missing_required_field`, and other iClient providers' secrets aren't preserved. A Google service account iClient needs its full JSON key on every update, so that change is the user's, in the Celigo UI, as is any new credential.

```bash
celigo connections set <id> name="Shopify - my-store"
celigo connections set <id> http.targetConcurrencyLevel=10   # http.concurrencyLevel once autoRecoverRateLimitErrors is false
celigo connections update <id> --file connection.json --force   # the complete document, every ****** left exactly as read
celigo iclients update <id> --file iclient.json --force   # every ****** left exactly as read
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

# List connections with their connector identity -- match on this, not on the name
celigo connections list --fields _id,name,type,offline,http._httpConnectorId,http._httpConnectorApiId,assistant
```

`account search`, `account dependencies`, and `account lint` read a local account index that auto-refreshes when it is older than 15 minutes (`CELIGO_INDEX_STALE_MINUTES`; `--no-refresh` skips the refresh). Force a fresh snapshot with `celigo account snapshot`. Before deleting a connection, ask the server rather than the index: `celigo connections dependencies <id>` walks every reference path, including ones the local graph can miss.

## 4. Check for a pre-built connector and global iClient

```bash
# Find the connector for an application name or a base URL, with what its form prescribes
celigo http-connectors match "<application-name-or-url>"

# Search HTTP connectors (550+ apps: Shopify, Stripe, HubSpot, etc.)
celigo http-connectors list [--search <term>]
celigo http-connectors get <id> --full    # see auth config, endpoints, resources

# Scaffold a connection from the connector's own form; --dry-run prints the body without creating it
celigo connections create --connector <id> [--api <apiId>] --name "<System> - <environment>" --dry-run

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

`authorize` opens the provider's authorization page in your browser (`--print-url` prints the URL instead), waits until the connection no longer needs authorization (`--timeout` defaults to 180 seconds), then pings it. `ping` reads the test's body, since a failed test still answers HTTP 200: it prints the errors and `Ping failed: <code> <message>` and exits 1. `ping --distributed` pings the Celigo distributed adaptor installed behind a NetSuite or Salesforce connection (the SuiteApp or bundle, or the Salesforce package) rather than the connection itself.

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

# Replace a connection: every step of a flow, API, or Tool, or one export or import
celigo flows replace-connection <flowId> <oldConnectionId> <newConnectionId>
celigo apis replace-connection <apiId> <connectionId> <newConnectionId>
celigo tools replace-connection <toolId> <connectionId> <newConnectionId>
celigo exports replace-connection <exportId> <newConnectionId>
celigo imports replace-connection <importId> <newConnectionId>
```

`apis connections <id>` and `tools connections <id>` list an API's or Tool's connections before you replace one. Same type isn't enough for HTTP -- see SKILL.md, Connection Operations.

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
celigo connections set <id> autoRecoverRateLimitErrors=true http.targetConcurrencyLevel=<n>   # re-enable with the target in the same PATCH: on its own it copies the current level (usually 1) into the target
celigo connections set <id> autoRecoverRateLimitErrors=false http.concurrencyLevel=<n>   # turn it off and set the level in one atomic PATCH
celigo connections audit <id>                                 # the connection's audit log, where the concurrency adjustments appear
```

### Borrowing concurrency

```bash
celigo connections set <borrowerId> _borrowConcurrencyFromConnectionId=<parentId>
celigo connections set <parentId> http.targetConcurrencyLevel=<the system's limit>   # while the parent's autoRecoverRateLimitErrors is true
celigo connections set <parentId> http.concurrencyLevel=<the system's limit>         # instead, when it is false
celigo connections set <borrowerId> _borrowConcurrencyFromConnectionId=null     # stop borrowing
```

### Wire-level debug logging

```bash
celigo connections enable-debug <id> [--duration <minutes>]   # default and maximum 60 minutes
celigo connections debug-logs <id> [--resource <exportOrImportId>]
celigo connections disable-debug <id>
celigo connections delete-debug-logs <id>                     # clear the captured logs
```

`enable-debug` PATCHes `debugDate` to now plus `--duration`, and `disable-debug` removes it. `debug-logs --resource <exportOrImportId>` narrows the shared log stream to one export's or import's traffic.

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

An `iclients update` sends every secret field back as the `******` it read, with `--force` -- see Writes above.

### 3. Reference from the connection

Set `_iClientId` on the connection with `connections update` (it isn't a `set` field), then authorize the connection:

```bash
celigo connections authorize <connectionId>
```

## Common Errors

For `401 Unauthorized` on an OAuth connection, and for OAuth `invalid_grant`, re-authorize: `celigo connections authorize <id>`.
