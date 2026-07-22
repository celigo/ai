---
name: configuring-connections
description: Configure Celigo connections and iClients -- credential and configuration objects that authenticate to external systems. Use when creating or editing connections, choosing auth methods, setting up OAuth, managing iClients (shared credential stores), or troubleshooting connectivity.
---

<!-- TIER:1 -->

# Configuring Connections

A connection is a **credential and configuration object** that lets Celigo communicate with an external system. Every export and import references a connection via `_connectionId`. Connections must be created before the resources that use them.

Concerns when configuring a connection:

- **Authentication** -- choosing the right auth method (OAuth, token, basic, key-pair, certificate, etc.) and providing the correct credentials
- **Concurrency** -- how many parallel requests Celigo can make to the target system (`concurrencyLevel`). Can be shared across connections via `_borrowConcurrencyFromConnectionId`
- **Health monitoring** -- ping configuration to verify connectivity and detect credential expiration (`offline` status)
- **Pre-built connectors** -- HTTP connectors and trading partner connectors provide pre-configured auth, base URLs, and endpoint definitions for 550+ applications
- **Debug logging** -- temporary debug mode to capture raw request/response data for troubleshooting
- **iClients** -- reusable OAuth credential stores (client ID/secret, scopes, token endpoints) shared across connections. See [iClients section](#iclients-oauth-credential-stores) below.

Used across flows, APIs, and tools.

## Connection Types

| Target System | `type` | Schema | Notes |
|---|---|---|---|
| REST/GraphQL API (with connector) | `http` | [http.yml](references/schemas/http.yml) | `formType: "assistant"`, set `_httpConnectorId` |
| REST/GraphQL API (manual) | `http` | [http.yml](references/schemas/http.yml) | Three form types: `assistant`, `http`, `graph_ql` |
| NetSuite ERP | `netsuite` | [netsuite.yml](references/schemas/netsuite.yml) | Use `token-auto` for new connections |
| Salesforce CRM | `salesforce` | [salesforce.yml](references/schemas/salesforce.yml) | Use `packagedOAuth: true` for new connections |
| SQL Server, MySQL, Postgres, Oracle | `rdbms` | [rdbms.yml](references/schemas/rdbms.yml) | |
| Snowflake, BigQuery, Redshift | `rdbms` | [rdbms.yml](references/schemas/rdbms.yml) | Check sub-type in schema |
| Active Directory, Databricks, DB2 | `jdbc` | [jdbc.yml](references/schemas/jdbc.yml) | |
| MongoDB/Atlas | `mongodb` | [mongodb.yml](references/schemas/mongodb.yml) | |
| DynamoDB | `dynamodb` | [dynamodb.yml](references/schemas/dynamodb.yml) | |
| FTP/SFTP/FTPS server | `ftp` | [ftp.yml](references/schemas/ftp.yml) | Optional PGP encryption |
| Amazon S3 | `s3` | [s3.yml](references/schemas/s3.yml) | |
| Local filesystem | `filesystem` | [filesystem.yml](references/schemas/filesystem.yml) | Requires agent via `_agentId` |
| AS2 EDI partner | `as2` | [as2.yml](references/schemas/as2.yml) | |
| Celigo VAN (EDI hub) | `van` | [van.yml](references/schemas/van.yml) | |
| AI tool server (MCP) | `mcp` | [mcp.yml](references/schemas/mcp.yml) | |
| Stack-deployed connector | `wrapper` | [wrapper.yml](references/schemas/wrapper.yml) | |
| Legacy REST (do not use) | `rest` | [rest.yml](references/schemas/rest.yml) | Use `http` instead |

## Quick Reference

### Connection Type Decision Matrix

| Target system | Use type | Auth method | Read schema |
|---|---|---|---|
| Any REST/GraphQL API with a Celigo connector | `http` | Connector-defined (usually OAuth2 or token) | [http.yml](references/schemas/http.yml) |
| Any REST/GraphQL API without a connector | `http` | Token, basic, OAuth2, custom headers | [http.yml](references/schemas/http.yml) |
| NetSuite ERP | `netsuite` | `token-auto` (Celigo-managed TBA) | [netsuite.yml](references/schemas/netsuite.yml) |
| Salesforce CRM | `salesforce` | `packagedOAuth: true` (Celigo OAuth) | [salesforce.yml](references/schemas/salesforce.yml) |
| SQL databases (Postgres, MySQL, SQL Server, Oracle) | `rdbms` | Username/password + host/port | [rdbms.yml](references/schemas/rdbms.yml) |
| Snowflake / BigQuery / Redshift | `rdbms` | Key-pair or username/password | [rdbms.yml](references/schemas/rdbms.yml) |
| MongoDB / Atlas | `mongodb` | Connection string or host/credentials | [mongodb.yml](references/schemas/mongodb.yml) |
| FTP / SFTP / FTPS | `ftp` | Username/password or SSH key | [ftp.yml](references/schemas/ftp.yml) |
| Amazon S3 | `s3` | IAM access key or role ARN | [s3.yml](references/schemas/s3.yml) |
| MCP server | `mcp` | Varies (OAuth2 or token) | [mcp.yml](references/schemas/mcp.yml) |

### Minimum Required Fields

Every connection needs at minimum: `name`, `type`, and the type-specific config block.

| Type | Required fields |
|---|---|
| `http` (connector) | `name`, `type: "http"`, `http._httpConnectorId`, `http._httpConnectorVersionId`, connector-specific auth fields |
| `http` (manual) | `name`, `type: "http"`, `http.baseURI`, `http.auth.type`, auth credentials |
| `netsuite` | `name`, `type: "netsuite"`, `netsuite.account`, `netsuite.environment`, `netsuite.authType: "token-auto"`, `netsuite._iClientId` |
| `salesforce` | `name`, `type: "salesforce"`, `salesforce.sandbox` (boolean), `salesforce.packagedOAuth: true` |
| `rdbms` | `name`, `type: "rdbms"`, `rdbms.host`, `rdbms.port`, `rdbms.database`, `rdbms.user`, `rdbms.password` |
| `ftp` | `name`, `type: "ftp"`, `ftp.host`, `ftp.port`, `ftp.username`, auth (password or key) |
| `s3` | `name`, `type: "s3"`, `s3.region`, `s3.bucket`, IAM credentials |
| `mongodb` | `name`, `type: "mongodb"`, `mongodb.host` or `mongodb.connectionString` |

### Which Schemas to Read

**Rule:** Always read the base [request.yml](references/schemas/request.yml) for shared fields, then the type-specific schema for the connection type you are configuring.

### Schema Index

**Connection schemas** (in [references/schemas/](references/schemas/)):

- **Base fields (all connections):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **HTTP:** [http.yml](references/schemas/http.yml)
- **NetSuite:** [netsuite.yml](references/schemas/netsuite.yml)
- **Salesforce:** [salesforce.yml](references/schemas/salesforce.yml)
- **RDBMS:** [rdbms.yml](references/schemas/rdbms.yml)
- **JDBC:** [jdbc.yml](references/schemas/jdbc.yml)
- **MongoDB:** [mongodb.yml](references/schemas/mongodb.yml)
- **DynamoDB:** [dynamodb.yml](references/schemas/dynamodb.yml)
- **FTP:** [ftp.yml](references/schemas/ftp.yml)
- **S3:** [s3.yml](references/schemas/s3.yml)
- **Filesystem:** [filesystem.yml](references/schemas/filesystem.yml)
- **AS2:** [as2.yml](references/schemas/as2.yml)
- **VAN:** [van.yml](references/schemas/van.yml)
- **MCP:** [mcp.yml](references/schemas/mcp.yml)
- **Wrapper:** [wrapper.yml](references/schemas/wrapper.yml)
- **REST (legacy):** [rest.yml](references/schemas/rest.yml)
- **OAuth:** [oauth.yml](references/schemas/oauth.yml)
- **JWT:** [jwt.yml](references/schemas/jwt.yml)
- **SSL:** [ssl.yml](references/schemas/ssl.yml)

**iClient schemas** (in [references/iclient-schemas/](references/iclient-schemas/)):

- **Base fields:** [request.yml](references/iclient-schemas/request.yml)
- **Response shape:** [response.yml](references/iclient-schemas/response.yml)
- **OAuth2 providers:** [oauth2.yml](references/iclient-schemas/oauth2.yml)
- **NetSuite:** [netsuite.yml](references/iclient-schemas/netsuite.yml)
- **Salesforce:** [salesforce.yml](references/iclient-schemas/salesforce.yml)
- **eBay:** [ebay.yml](references/iclient-schemas/ebay.yml)

## Related Skills

- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- choosing the right export adaptor type and schema for a data source
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- choosing the right import adaptor type and schema for a data destination
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring connections, exports, and imports into a flow pipeline

<!-- TIER:2 -->

## How to Build a Connection

### 1. Identify the target system

What system do you need to connect to? This determines the connection type, auth method, and configuration shape.

### 2. Name the connection after the system, not the operation

Connection names should describe the **system and environment** -- not what a specific flow does with them. Connections are shared across exports, imports, and flows, so operation-specific names become misleading as soon as a second resource uses the same connection.

| Bad (operation-specific) | Good (system/environment) |
|---|---|
| `Shopify - Customer Upsert` | `Shopify - my-store` |
| `Microsoft Dynamics 365 Business Central - Companies Export` | `Microsoft Dynamics 365 Business Central - sandbox` |
| `Stripe - Invoice Fetch` | `Stripe - Production` |

If the account has multiple environments or instances of the same system, include the distinguishing detail (store name, environment, account ID). Otherwise just the system name is fine.

### 3. Check for existing connections

Before creating a new connection, check what already exists in the account and marketplace:

```bash
# Search the account for existing connections by name or keyword
celigo account search "<application-name>"

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

# Filter by type
celigo connections list | grep -i "<application-name>"
```

The account index auto-refreshes when stale (>4 hours). Force a fresh snapshot with `celigo account snapshot`.

Reusing an existing connection avoids duplicate credentials and shares concurrency.

**When presenting connection choices to the user**, filter out connections that are `offline: true` or have `status: "offline"`. Only show online/active connections as options. If ALL matching connections are offline, mention that and let the user decide whether to proceed with an offline connection or fix connectivity first.

### 4. Check for a pre-built connector and global iClient

For HTTP connections, search for a pre-built connector before configuring manually:

```bash
# Search HTTP connectors (550+ apps: Shopify, Stripe, HubSpot, etc.)
celigo http-connectors list
celigo http-connectors get <id> --full    # see auth config, endpoints, resources

# Search trading partner connectors (EDI, AS2, VAN)
celigo tp-connectors list
```

If an HTTP connector exists, set `http._httpConnectorId` and `http._httpConnectorVersionId` on the connection. The connector provides auth templates, base URL, and pre-built endpoints.

**Check for a global iClient.** Many pre-built connectors ship with a **global (Celigo-managed) iClient** -- a shared OAuth app registration that handles authorization out of the box (e.g., Microsoft Business Central, Shopify, Google). When a global iClient is available:

- Use it by default. Set `http.auth.type: "oauth"` with `http.auth.oauth.useIClientFields: true` and `http._iClientId` pointing to the global iClient ID.
- Do **not** fall back to static bearer token auth (`auth.type: "token"`) just because you don't have live credentials yet. The connection should be created with the correct OAuth auth shape and saved as `offline: true`.
- Only create a custom iClient if the customer has their own app registration (e.g., their own Azure AD app, Shopify private app) or if the global iClient doesn't have the required scopes/consent for their tenant.

To find existing global iClients, check any working connection in the account that uses the same connector -- its `http._iClientId` will reference the global iClient. You can also inspect the connector's auth configuration via `http-connectors get <id> --full`.

### 5. Choose the type, auth method, and build

Use the [Connection Types](#connection-types) table above to pick the `type` value and open the matching schema for available auth options and required fields.

Every connection needs at minimum: `name`, `type`, and the type-specific config block (`http{}`, `netsuite{}`, `ftp{}`, etc.).

**Offline connections must use the correct auth shape.** When creating a connection without live credentials (e.g., demo, placeholder, or pre-staging), always configure the full auth structure the connection will ultimately use -- OAuth type, iClient reference, grant type, etc. -- and save with `offline: true`. This ensures the connection can be authorized in place later without reconfiguration. Never substitute static token auth as a shortcut for an OAuth connection.

### 6. Test the connection

```bash
celigo connections ping <id>
```

For OAuth connections, authorize via browser first: `celigo connections authorize <id>`.

## CLI Commands

```bash
# CRUD
celigo connections list
celigo connections get <id>
celigo connections create < connection.json
celigo connections update <id> < connection.json
celigo connections delete <id>

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

Note: `connections set` and `iclients set` only apply PATCH-whitelisted fields (e.g. `name`, `debugDate`, `debugUntil`; iclients also `oauth2.failPath`). PATCH never re-sends the masked credentials GET returns as `"******"`, so it's safe. Any non-whitelisted field errors instead of falling back to a full PUT that would overwrite stored secrets -- use `update` (which guards against submitting masked values) for those.

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a connection, verify:

- [ ] `name` describes the system/environment, not a specific operation (e.g., "Shopify - my-store", not "Shopify - Customer Upsert")
- [ ] `type` matches the target system (see [Connection Types](#connection-types))
- [ ] Type-specific config block is present (`http{}`, `netsuite{}`, `rdbms{}`, etc.)
- [ ] Auth credentials are real values, not masked `"******"` from a prior GET
- [ ] For HTTP connectors: `http._httpConnectorId` and `http._httpConnectorVersionId` are set
- [ ] For OAuth connections: uses global iClient if connector provides one; custom iClient only when needed
- [ ] For OAuth connections: `auth.type` is `"oauth"` (not `"token"` with a static bearer), even if saving `offline: true`
- [ ] For NetSuite: `netsuite.authType` is `token-auto` (not deprecated `basic`)
- [ ] For RDBMS: host, port, database, user, and password are all provided

## Gotchas

These apply to **both connections and iClients** unless noted:

1. **GET masks credentials.** Passwords, tokens, and secrets are returned as `"******"`. Never round-trip a GET response back to PUT without restoring the real values. This is why `set` only PATCHes whitelisted non-credential fields, and `update` refuses a payload still containing `"******"` unless you pass `--force`.
2. **PUT erases omitted fields.** Always GET first, modify, then PUT the complete object.
3. **OAuth connections need browser authorization after creation.** Creating via API sets up the shell, but tokens come from a browser redirect. Use `celigo connections authorize <id>`.

Connections only:

4. **`rest` type is legacy.** Always use `type: "http"` for new REST connections.
5. **NetSuite `basic` auth is deprecated.** Use `token-auto` (Celigo-managed TBA) for new connections.
6. **Debug logs are connection-scoped.** Enabling debug captures request/response data for all flows using that connection.
7. **`_borrowConcurrencyFromConnectionId` shares slots.** The borrowing connection's `concurrencyLevel` is ignored.
8. **Name connections after the system, not the operation.** Connections are shared across resources. "Shopify - my-store" is correct; "Shopify - Customer Upsert" is not.
9. **Use the global iClient for OAuth connectors.** When a pre-built connector ships with a global iClient, use it with `auth.type: "oauth"` -- do not substitute `auth.type: "token"` with a static bearer token, even for offline/dummy connections. Static tokens expire and produce the wrong auth shape.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | Invalid or expired credentials | Verify auth credentials; for OAuth, re-run `celigo connections authorize <id>` |
| `403 Forbidden` | Valid credentials but insufficient permissions | Check the user/role permissions in the target system |
| `422 Unprocessable Entity` -- invalid type | `type` value is not recognized or misspelled | Use exact values from [Connection Types](#connection-types): `http`, `netsuite`, `salesforce`, `rdbms`, etc. |
| `422 Unprocessable Entity` -- missing fields | Required type-specific fields are absent | Check [Minimum Required Fields](#minimum-required-fields) for the connection type |
| `ping` returns `offline` | Connection created but cannot reach the target | Verify host/URL, credentials, firewall rules, and VPN/agent requirements |
| `ECONNREFUSED` / `ETIMEDOUT` | Network-level failure to target system | Check host/port, DNS resolution, firewall rules; for on-prem systems, verify `_agentId` is set |
| OAuth `invalid_grant` | Refresh token expired or revoked | Re-authorize: `celigo connections authorize <id>` |
| `"******"` saved as credential | Round-tripped a GET response back to PUT | Never PUT masked values; always provide real credentials on update |
| `429 Too Many Requests` | Destination rate limit exceeded | If auto-recover is enabled, the connection throttles and retries automatically; otherwise enable it or lower `concurrencyLevel`. See [Credential Discipline & Runtime Behavior](#credential-discipline--runtime-behavior) |

## Credential Discipline & Runtime Behavior

How connections behave once they exist -- the credential rules every update must follow, and the runtime model (state, queues, rate-limit recovery, debug) to reason about when troubleshooting.

### Never accept or echo real credentials in chat

Celigo requires the external system's credentials to be re-submitted on **every** connection update -- a security guardrail proving the person making the change controls the target system, not a UI quirk. Because chat conversations are logged in clear text, **never accept, request, or echo a real credential** (API key, OAuth token or client secret, SFTP password, cert key, AS2 cert pair) in chat.

- When updating a connection programmatically, send the credential fields as dummy/placeholder values so the non-credential changes the user asked for (rename, URL, concurrency) save normally. Then tell the user to finish the change by re-entering their real credentials in the Celigo UI. Signal this on **every** update, including trivial ones (renames, description tweaks) -- the user shouldn't have to remember which updates need a manual follow-up.
- If a user pastes a real credential, treat it as compromised, full stop. The only correct mitigation: (1) rotate the credential at the external system itself -- regenerate the API key, reset the OAuth grant, rotate the SFTP password, revoke and reissue the cert pair -- then (2) update the connection in the Celigo UI with the rotated value. This holds no matter how trivial the credential looks (a sandbox key, a stale password, a client secret the user thinks is unused).

The credentials live on the durable connection record; the runtime auth state (token still valid, cert still trusted, system reachable) is separate and ephemeral.

### Online / offline -- fix the shared connection, not each flow

A connection is **online** (credentials valid, target reachable, every dependent can run) or **offline** (token expired, API changed, network unreachable, credentials rotated without updating Celigo, cert expired). The connection resource exists in either state -- going offline doesn't delete it. Probe it with `celigo connections ping <id>`.

When a user reports "my flow is failing" and the root cause is the connection, **fix the shared connection, not each dependent flow.** One connection backs many consumers (flows, APIs, Tools, AI agents); every dependent recovers the moment the connection is back online. That one-fix-all-recover payoff is the whole point of the connection abstraction.

### Connections as concurrency queues -- throughput and governance

Every connection is backed by its own dedicated **FIFO queue**. Records routed through a connection land in its queue and process first-in, first-out. Two flows using the same connection **share one queue**; a flow that touches multiple connections lands in multiple queues (one per connection). This is the mental model for throughput, rate limits, and "why are my flows competing for capacity?"

`concurrencyLevel` sets how many messages from the queue process **in parallel** -- match it to the external system's published API governance limit (if the destination permits 25 parallel requests, set `concurrencyLevel: 25` to run at the ceiling without going over). Queue depth is **connection-level**, owned collectively by every consumer -- never attribute a deep queue to a single flow, and treat a deep queue as an explanation (work ahead in line), not a defect.

Throughput symptoms almost always point back to the connection, not the flow:

| Symptom | Likely cause / fix |
|---|---|
| Flow hitting rate limits | `concurrencyLevel` too high for what the destination permits, or auto-recover disabled |
| Flow slow / not keeping up | `concurrencyLevel` too low; the system permits more parallelism than the connection uses |
| Some flows starve others | High-volume flows share one connection's queue -- partition into separate connections (high-priority vs back-office) and set concurrency per priority |
| Need to throttle a system | Lower `concurrencyLevel` on the connection serving it |

### Auto-recover rate-limit errors

New connections enable **auto-recover rate limit errors** by default, with a per-adaptor target concurrency (HTTP default 25, FTP default 1, tunable per connection). On a rate-limit error (429 or equivalent), instead of piling errors into Open errors the connection throttles itself and recovers:

1. Drop effective concurrency to **1** and wait ~1 minute before retrying the errored record.
2. Each further rate-limit error **doubles** the wait (2, 4, 8, ... up to 1024 minutes) -- up to eleven attempts at concurrency 1, roughly 34 hours of accumulated backoff.
3. On a successful retry, walk concurrency **back up** toward the target (1 -> 2 -> 4 -> 8 -> ...). A rate-limit error mid-recovery restarts the dance from concurrency 1.
4. If the full sequence still hits rate-limit errors, the platform **auto-disables the setting on the connection** -- it must be re-enabled manually, and until then rate-limit errors flow into Open errors like any other failure.

Recovered records land in the **Resolved errors** tab (not Open errors), and the concurrency adjustments appear in the connection's **audit log**. Mid-run, disabling auto-recover cancels recovery (the flow continues at the target concurrency; unresolved rate-limit errors go to Open errors), and changing the target concurrency takes effect immediately for subsequent retries.

### Borrowing concurrency

When multiple connections point at the same system but the system enforces an **account-wide** rate limit, have them share one budget: set `_borrowConcurrencyFromConnectionId` on each borrowing connection to point at a parent, and set `concurrencyLevel` on the parent to the system's limit. All borrowers draw from that shared budget (a borrower's own `concurrencyLevel` is ignored). This fits the "partition by identity" pattern -- different credentials or teams, one global API limit. A borrowing connection has no auto-recover toggle of its own; the **parent connection's** auto-recover setting governs.

### Wire-level debug logging

When a flow fails in ways online/offline doesn't explain -- the target is reachable and credentials look fine, but records are rejected with cryptic errors or the wrong data comes back -- capture the raw traffic with the connection debugger:

```bash
celigo connections enable-debug <id> [--duration <minutes>]   # 15 min default, up to ~1 hour
celigo connections debug-logs <id>
celigo connections disable-debug <id>
```

- Captures every request/response through the connection with sensitive fields **masked**. Each entry carries an ISO date, a UUID pairing a request to its response, the resource type and id using the connection, and the request or response body (match a request to its response by shared UUID).
- Logs appear only once data is actually moving -- not for flows queued but not yet processing. Captured logs remain available for **24 hours** (or until cleared).
- Debug is **connection-scoped** -- it captures traffic for every flow using that connection.
- **Not supported** for DynamoDB, MongoDB, or wrapper connectors; fall back to test-mode flow runs, mock data, or the destination's own logs.
- The extra per-request capture adds noticeable lag on high-volume flows (millions of records). Enable it briefly during a representative test run, or narrow the source export's criteria so a small set exercises the connection inside the debug window, then turn it off so the flow runs at full speed.


---

# iClients (OAuth Credential Stores)

An iClient is a **reusable OAuth credential store** -- it holds the client ID, client secret, scopes, and provider-specific OAuth configuration that can be shared across multiple connections. Instead of embedding OAuth app credentials directly in each connection, you create one iClient and reference it.

## When Do You Need an iClient?

| Scenario | iClient needed? |
|---|---|
| HTTP connection with pre-built connector that has a global iClient | Use the **global iClient** -- set `http._iClientId` to the connector's built-in iClient ID. No custom iClient needed. |
| HTTP connection with OAuth2 using a custom app registration | Yes -- create a **custom iClient** with your clientId/clientSecret, reference via `http._iClientId` |
| Salesforce connection with `packagedOAuth: false` | Yes -- store Connected App credentials in iClient |
| NetSuite connection with `authType: "token-auto"` | Yes -- store integration record's consumer key/secret in iClient |
| HTTP connection with pre-built connector (no global iClient) | Maybe -- check if the connector's auth requires one |
| HTTP connection with token auth (no OAuth) | No -- credentials go directly on the connection |
| Database, FTP, or non-OAuth connections | No |

The rule of thumb: **if a global iClient exists for the connector, use it. If the connection uses OAuth and you're bringing your own app registration, create a custom iClient.**

## How iClients Relate to Connections

```
┌──────────────┐       _iClientId        ┌──────────────┐
│  Connection   │ ──────────────────────► │   iClient    │
│  (HTTP/SF/NS) │                         │  (OAuth app) │
└──────────────┘                          └──────────────┘
                                                │
                                    stores clientId, clientSecret,
                                    scopes, token/refresh/revoke
                                    endpoints, provider config
```

- **Connection** owns the concurrency, health monitoring, debug logging, and runtime config
- **iClient** owns the OAuth app registration credentials and flow configuration
- Multiple connections can share one iClient (e.g., multiple connections to the same OAuth app)

### Reference fields on connections

- **HTTP connections:** `http._iClientId` -- when `http.auth.type` is `oauth` and `oauth.useIClientFields: true`
- **NetSuite connections:** `netsuite._iClientId` -- when `authType: "token-auto"` (Celigo-managed TBA)
- **Salesforce connections:** uses iClient when `packagedOAuth: false` (custom Connected App)
- **MCP connections:** `mcp._iClientId` -- for OAuth-based MCP server auth

## How to Build an iClient

### 1. Determine the provider

The `provider` field selects which auth configuration is used:

| System | Provider value |
|---|---|
| Google APIs | `google` |
| Salesforce | `salesforce` |
| Azure AD / Microsoft | `azureoauth` |
| NetSuite (TBA) | `netsuite` |
| Shopify | `shopify` |
| Any custom OAuth2 API | `custom_oauth2` |
| eBay | `ebay` or `ebay-xml` |

See [request.yml](references/iclient-schemas/request.yml) for the full provider enum.

### 2. Build the iClient

Use the schema for the matching provider. All schemas are in [references/iclient-schemas/](references/iclient-schemas/):

| Provider | Schema | Key fields |
|---|---|---|
| Base fields (all) | [request.yml](references/iclient-schemas/request.yml) | `provider`, `name`, `formType` |
| Response shape | [response.yml](references/iclient-schemas/response.yml) | `_id`, `_userId`, timestamps |
| `custom_oauth2`, `google`, `azureoauth`, `shopify`, etc. | [oauth2.yml](references/iclient-schemas/oauth2.yml) | `clientId`, `clientSecret`, `scope`, `grantType`, token/refresh/revoke endpoints, PKCE |
| `netsuite` | [netsuite.yml](references/iclient-schemas/netsuite.yml) | `consumerKey`, `consumerSecret` |
| `salesforce` | [salesforce.yml](references/iclient-schemas/salesforce.yml) | `clientId`, `clientSecret`, optional `privateKey` for JWT bearer |
| `ebay`, `ebay-xml` | [ebay.yml](references/iclient-schemas/ebay.yml) | `appId`, `devId`, `certId` |
| `amazonmws` | [ebay.yml](references/iclient-schemas/ebay.yml) | `accessKeyId`, `secretKey` |

Every iClient needs at minimum: `provider` and the matching provider-specific config block (`oauth2{}`, `netsuite{}`, `salesforce{}`, etc.).

### 3. Reference from the connection

After creating the iClient, set the `_iClientId` on the connection (`http._iClientId`, `netsuite._iClientId`, `mcp._iClientId`).

For OAuth connections, authorize via browser: `celigo connections authorize <connectionId>`.

## custom_oauth2 and JWT-Based Auth

### `custom_oauth2` -- the generic OAuth2 escape hatch

Pick a **named `provider`** whenever one matches the system -- it carries provider-aware defaults and the correct sub-config shape. Reach for **`custom_oauth2`** only for OAuth2 APIs with no named provider; because nothing is preset, you supply the flow details yourself:

- `clientId` / `clientSecret` -- the registered app's credentials
- `scope` (+ `scopeDelimiter`) and `redirectUri` (must match the callback registered with the provider **exactly**)
- `grantType` -- `authorization-code`, `client-credentials`, or `password`
- token / refresh / revoke endpoints, plus `clientCredentialsLocation` (send client credentials in a basic-auth header vs the request body)
- PKCE settings where the provider requires them
- `validDomainNames` -- required for `custom_oauth2`; list each unique domain from your auth/token/revoke URLs (host only, no scheme or path)

See [oauth2.yml](references/iclient-schemas/oauth2.yml) for the full field set.

### JWT-based auth

Some providers require a **JWT assertion** as part of the token request. Set `enableJWT: true` and populate the `jwt` block on the iClient; for Salesforce JWT bearer, supply the `privateKey` (see [salesforce.yml](references/iclient-schemas/salesforce.yml)). Handlebars templates reference the signed token via `{{{iClient.jwt.token}}}`. The `clientSecret` and private key are credentials -- the [Credential Discipline & Runtime Behavior](#credential-discipline--runtime-behavior) rules apply: never paste them in chat.

## One iClient, Many Connections

An iClient is the **app registration, not an identity**. It holds the app's `clientId` / `clientSecret`, while the per-user access and refresh tokens produced by actually running the OAuth flow live on the **connection**, not the iClient. That's why the default is **one iClient, many connections** -- register the app once, store it as an iClient, and point every connection that should authenticate as that app at it via `_iClientId`. Ten Salesforce connections for ten different orgs can all share one iClient: same app, ten distinct authenticated identities.

Minting a separate iClient per connection duplicates the same `clientId` / `clientSecret` and multiplies rotation work. Reach for **distinct iClients** only when connections genuinely need *different registered apps* -- different developer accounts, different scope grants, separate rate-limit pools, or a hard separation between environments where each has its own provider-side app.

## Update an iClient in Place vs Create a New One

- **Secret rotated** (the provider reissued it, or it leaked) -> **update the existing iClient in place**. Every connection authenticating through it picks up the new secret with no retargeting.
- **The app itself changed** (a different registered app, a different developer account, a move to a new client ID) -> create a **new iClient**. The old one stays usable for connections still on the old app; connections migrate to the new one as needed.

Smell test (mirrors connections): renewing the same app's credentials -> update in place; switching to a different app -> new iClient.

## iClient CLI Commands

```bash
# CRUD
celigo iclients list
celigo iclients get <id>
celigo iclients create < iclient.json
celigo iclients update <id> < iclient.json
celigo iclients delete <id>
```

## iClient Gotchas

1. **`_httpConnectorId` is immutable.** Once an iClient is linked to an HTTP connector, it cannot be changed. Create a new iClient if you need a different connector.
2. **`provider` determines valid fields.** Setting `provider: "netsuite"` means the `netsuite` block is used; `provider: "custom_oauth2"` means the `oauth2` block. Mismatching provider and config block silently ignores the wrong block.
3. **Handlebars references use `{{{iClient.fieldName}}}`** to access values stored in `encrypted` or `unencrypted` objects. For JWT: `{{{iClient.jwt.token}}}`.
4. **`validDomainNames` is required for custom OAuth2.** Provide each unique domain from your auth/token/revoke URLs (without scheme or path).
5. **Deleting an iClient breaks referencing connections.** Connections that reference a deleted iClient will fail to authorize. Check for references before deleting.
6. **Editing a shared iClient's credentials affects every referencing connection.** Because one iClient backs many connections, rotating its `clientSecret` re-points OAuth for all of them at once. Confirm which connections depend on the iClient before changing it.
