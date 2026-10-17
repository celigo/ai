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

## How to Run the Steps

This skill names each step by what it reads or changes; the exact calls depend on how you reach the account. Read the one reference that matches your tools -- both follow the section and step names of this skill:

- **Celigo MCP tools** (`list_resources`, `get_resource`, `patch_resource`, `update_resource`, ...) -- [references/mcp.md](references/mcp.md)
- **The `celigo` CLI** -- [references/cli.md](references/cli.md)

Looking up connections, connectors, templates, and iClients only reads. Creating, updating, deleting, authorizing, registering a connection on an integration, and arming a debug window all write to the account -- do them when the user asked for the change. A single whitelisted field is a targeted change; anything else is a full-document update that must never carry the masked credentials back -- see [Connection Operations](#connection-operations).

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

Which of the two HTTP rows applies is determined by search, not preference: check for a pre-built connector first (search the HTTP connector catalog) and use the manual row only when no connector exists or it doesn't fit -- see [Check for a pre-built connector and global iClient](#4-check-for-a-pre-built-connector-and-global-iclient).

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

- **configuring-exports** ([Quick Reference](../configuring-exports/SKILL.md#quick-reference)) -- choosing the right export adaptor type and schema for a data source
- **configuring-imports** ([Quick Reference](../configuring-imports/SKILL.md#quick-reference)) -- choosing the right import adaptor type and schema for a data destination
- **building-flows** ([How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow)) -- wiring connections, exports, and imports into a flow pipeline

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

- **Existing connections** -- search the account by application keyword, and list the connections with their connector identity -- match on that, not on the name (below).
- **What uses a connection** -- the exports and imports that reference it.
- **Connection health** -- offline connections that enabled flows still use, and orphaned connections that nothing uses.
- **Marketplace templates** -- search the marketplace for pre-built integration templates, and preview a template's connection model (the connections an install would need).

Reusing an existing connection avoids duplicate credentials and shares concurrency.

**Match on identity, not on the name.** Names are free text: a connection named "Shopify" may point somewhere else, and a working one may be called "Prod store". For a pre-built HTTP connector the identity is `http._httpConnectorId`, plus `http._httpConnectorApiId` when the connector has several API groups (two connections of one connector can target different APIs); `assistant` is the legacy application id. For other types it's the `type` plus its target (the NetSuite account, the database host). Two connections of the same connector and API usually point at different tenants or environments -- read the base URI or account fields before picking one, and confirm with the user when more than one fits.

**When presenting connection choices to the user**, filter out connections that are `offline: true` or have `status: "offline"`. Only show online/active connections as options. If ALL matching connections are offline, mention that and let the user decide whether to proceed with an offline connection or fix connectivity first.

### 4. Check for a pre-built connector and global iClient

For HTTP connections, search for a pre-built connector before configuring manually. Configure by hand only when no connector exists for the application or the connector doesn't support the auth scheme or endpoints you need:

- **HTTP connectors** (550+ apps: Shopify, Stripe, HubSpot, etc.) -- find the connector for the application name or base URL, then read the matching connector in full to see its auth config, endpoints, and resources. Where your surface offers it, scaffold the connection from the connector's own form and preview the body before anything is created.
- **Trading partner connectors** (EDI, AS2, VAN) -- search the trading partner catalog.

If an HTTP connector exists, set `http._httpConnectorId` and `http._httpConnectorVersionId` on the connection. The connector provides auth templates, base URL, and pre-built endpoints.

**Check for a global iClient.** Many pre-built connectors ship with a **global (Celigo-managed) iClient** -- a shared OAuth app registration that handles authorization out of the box (e.g., Microsoft Business Central, Shopify, Google). When a global iClient is available:

- Use it by default. Set `http.auth.type: "oauth"` with `http.auth.oauth.useIClientFields: true` and `http._iClientId` pointing to the global iClient ID.
- Do **not** fall back to static bearer token auth (`auth.type: "token"`) just because you don't have live credentials yet. The connection should be created with the correct OAuth auth shape and saved as `offline: true`.
- Only create a custom iClient if the customer has their own app registration (e.g., their own Azure AD app, Shopify private app) or if the global iClient doesn't have the required scopes/consent for their tenant.

To find existing global iClients, check any working connection in the account that uses the same connector -- its `http._iClientId` will reference the global iClient. You can also inspect the connector's auth configuration in its full definition. A connector OAuth connection that shows `http._iClientId` empty at rest may be authorizing through the connector's global iClient, which is resolved at authorize time -- the connector's definition tells you which.

### 5. Choose the type, auth method, and build

Use the [Connection Types](#connection-types) table above to pick the `type` value and open the matching schema for available auth options and required fields.

Every connection needs at minimum: `name`, `type`, and the type-specific config block (`http{}`, `netsuite{}`, `ftp{}`, etc.).

**Offline connections must use the correct auth shape.** When creating a connection without live credentials (e.g., demo, placeholder, or pre-staging), always configure the full auth structure the connection will ultimately use -- OAuth type, iClient reference, grant type, etc. -- and save with `offline: true`. This ensures the connection can be authorized in place later without reconfiguration. Never substitute static token auth as a shortcut for an OAuth connection.

### 6. Test the connection

Ping the connection to confirm it reaches the target system with its credentials.

For OAuth connections, authorize via browser first -- the tokens come from the provider's redirect, so a person completes it. Not every surface can ping or authorize; your reference names the fallback.

## Connection Operations

Beyond building one, the operations on a connection are:

- **CRUD** -- list, read, create, update (a full-document replace), and delete
- **Test connectivity** -- ping
- **OAuth authorization** -- the browser flow that obtains the tokens
- **Debug** -- arm and disarm a debug window, and read the debug logs it captured
- **Integration-level connection management** -- register connections on an integration, or deregister them
- **Replace a connection across a flow** -- swap one connection for another on every export and import of the flow

**Targeted changes vs full updates.** Only PATCH-whitelisted fields can be changed on their own: `name`, the debug window (`debugDate`, `debugUntil`), the credential-free concurrency settings (`<adaptor>.concurrencyLevel`, `<adaptor>.targetConcurrencyLevel`, `_borrowConcurrencyFromConnectionId`, `autoRecoverRateLimitErrors` -- `<adaptor>` is the connection's `type` block, such as `http`), and `endUserProvidedFields`; on iClients, only `oauth2.failPath`. A PATCH never reads or re-sends the masked credentials GET returns as `"******"`, so it's safe. Every other field takes a full-document update, which needs the real credentials: a full update that echoes the masked values, omits the secret, or carries a placeholder clears the stored credential -- see [Credential Discipline](#never-accept-or-echo-real-credentials-in-chat).

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a connection, verify:

- [ ] `name` describes the system/environment, not a specific operation (e.g., "Shopify - my-store", not "Shopify - Customer Upsert")
- [ ] `type` matches the target system (see [Connection Types](#connection-types))
- [ ] Type-specific config block is present (`http{}`, `netsuite{}`, `rdbms{}`, etc.)
- [ ] Auth credentials are real values, not masked `"******"` from a prior GET
- [ ] For HTTP: a pre-built connector search was done (the HTTP connector catalog); manual config only because none exists or it doesn't fit
- [ ] For HTTP connectors: `http._httpConnectorId` and `http._httpConnectorVersionId` are set
- [ ] Reusing an existing connection: it was matched on connector identity (`http._httpConnectorId` / `http._httpConnectorApiId`, or the type and target), not its name
- [ ] For OAuth connections: uses global iClient if connector provides one; custom iClient only when needed
- [ ] For OAuth connections: `auth.type` is `"oauth"` (not `"token"` with a static bearer), even if saving `offline: true`
- [ ] For NetSuite: `netsuite.authType` is `token-auto` (not deprecated `basic`)
- [ ] For RDBMS: host, port, database, user, and password are all provided

## Gotchas

These apply to **both connections and iClients** unless noted:

1. **GET masks credentials.** Passwords, tokens, and secrets are returned as `"******"`. Never round-trip a GET response back to PUT without restoring the real values. This is why targeted changes are limited to whitelisted non-credential fields, and why a full update that still contains `"******"` is refused unless it is explicitly forced or confirmed (your reference says how on each surface).
2. **PUT erases omitted fields.** Always GET first, modify, then PUT the complete object with the real credentials. For a rename, debug window, or concurrency change, make a targeted change instead -- no credentials involved.
3. **OAuth connections need browser authorization after creation.** Creating via API sets up the shell, but tokens come from a browser redirect, so a person has to complete the authorization.

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
| `401 Unauthorized` | Invalid or expired credentials | Verify auth credentials; for OAuth, re-authorize the connection in a browser |
| `403 Forbidden` | Valid credentials but insufficient permissions | Check the user/role permissions in the target system |
| `422 Unprocessable Entity` -- invalid type | `type` value is not recognized or misspelled | Use exact values from [Connection Types](#connection-types): `http`, `netsuite`, `salesforce`, `rdbms`, etc. |
| `422 Unprocessable Entity` -- missing fields | Required type-specific fields are absent | Check [Minimum Required Fields](#minimum-required-fields) for the connection type |
| A ping returns `offline` | Connection created but cannot reach the target | Verify host/URL, credentials, firewall rules, and VPN/agent requirements |
| `ECONNREFUSED` / `ETIMEDOUT` | Network-level failure to target system | Check host/port, DNS resolution, firewall rules; for on-prem systems, verify `_agentId` is set |
| OAuth `invalid_grant` | Refresh token expired or revoked | Re-authorize the connection in a browser |
| `"******"` saved as credential | Round-tripped a GET response back to PUT | Never PUT masked values; always provide real credentials on update |
| `429 Too Many Requests` | Destination rate limit exceeded | If auto-recover is enabled, the connection throttles and retries automatically; to cap it lower, reduce `targetConcurrencyLevel` (`concurrencyLevel` is platform-managed while auto-recover is on). Otherwise enable auto-recover or lower `concurrencyLevel`. Both are credential-free targeted changes. See [Credential Discipline & Runtime Behavior](#credential-discipline--runtime-behavior) |

## Credential Discipline & Runtime Behavior

How connections behave once they exist -- the credential rules every update must follow, and the runtime model (state, queues, rate-limit recovery, debug) to reason about when troubleshooting.

### Never accept or echo real credentials in chat

A full connection update (PUT) must re-submit the external system's real credentials -- a security guardrail proving the person making the change controls the target system, not a UI quirk. Because chat conversations are logged in clear text, **never accept, request, or echo a real credential** (API key, OAuth token or client secret, SFTP password, cert key, AS2 cert pair) in chat.

- **Settings that never need credentials go through PATCH.** Rename, the debug window, the concurrency settings, borrowing, auto-recover, and `endUserProvidedFields` are targeted single-field changes (the whitelist is under [Connection Operations](#connection-operations)). PATCH never reads or changes the stored credentials, so these need no credential follow-up -- don't tell the user to re-enter anything after a rename or a concurrency change.
- **Everything else is a full update, and only the real secret makes it safe.** A PUT that echoes the masked `"******"`, omits the secret, or carries a placeholder clears the stored credential and leaves the connection -- and every flow on it -- offline until someone re-enters it. For a base URI, endpoint, auth-setting, or credential change on a connection that's in use, describe the exact change and have the user make it in the Celigo UI, where re-entering the credential (or re-authorizing, for OAuth) is part of the save. Placeholder credentials belong only on a connection nothing depends on yet, and the user must enter the real values in the UI before it works.
- If a user pastes a real credential, treat it as compromised, full stop. The only correct mitigation: (1) rotate the credential at the external system itself -- regenerate the API key, reset the OAuth grant, rotate the SFTP password, revoke and reissue the cert pair -- then (2) update the connection in the Celigo UI with the rotated value. This holds no matter how trivial the credential looks (a sandbox key, a stale password, a client secret the user thinks is unused).

The credentials live on the durable connection record; the runtime auth state (token still valid, cert still trusted, system reachable) is separate and ephemeral.

### Online / offline -- fix the shared connection, not each flow

A connection is **online** (credentials valid, target reachable, every dependent can run) or **offline** (token expired, API changed, network unreachable, credentials rotated without updating Celigo, cert expired). The connection resource exists in either state -- going offline doesn't delete it. Probe it with a ping, or read the connection's `offline` flag.

When a user reports "my flow is failing" and the root cause is the connection, **fix the shared connection, not each dependent flow.** One connection backs many consumers (flows, APIs, Tools, AI agents); every dependent recovers the moment the connection is back online. That one-fix-all-recover payoff is the whole point of the connection abstraction.

### Connections as concurrency queues -- throughput and governance

Every connection is backed by its own dedicated **FIFO queue**. Records routed through a connection land in its queue and process first-in, first-out. Two flows using the same connection **share one queue**; a flow that touches multiple connections lands in multiple queues (one per connection). This is the mental model for throughput, rate limits, and "why are my flows competing for capacity?"

`concurrencyLevel` sets how many messages from the queue process **in parallel** -- match the connection's ceiling to the external system's published API governance limit (if the destination permits 25 parallel requests, a ceiling of 25 runs at the limit without going over). While auto-recover is on (the default for new connections), the platform manages `concurrencyLevel` itself, so the ceiling you set is `targetConcurrencyLevel`; with auto-recover off, set `concurrencyLevel` directly. Both are targeted changes -- no credentials needed. Queue depth is **connection-level**, owned collectively by every consumer -- never attribute a deep queue to a single flow, and treat a deep queue as an explanation (work ahead in line), not a defect. The connection document reports the current depth (`queues[].size`).

Throughput symptoms almost always point back to the connection, not the flow:

| Symptom | Likely cause / fix |
|---|---|
| Flow hitting rate limits | Concurrency ceiling too high for what the destination permits, or auto-recover disabled |
| Flow slow / not keeping up | Concurrency ceiling too low; the system permits more parallelism than the connection uses |
| Some flows starve others | High-volume flows share one connection's queue -- partition into separate connections (high-priority vs back-office) and set concurrency per priority |
| Need to throttle a system | Lower the ceiling on the connection serving it -- `targetConcurrencyLevel` while auto-recover is on, otherwise `concurrencyLevel` |

### Auto-recover rate-limit errors

New connections enable **auto-recover rate limit errors** by default, with a per-adaptor target concurrency (HTTP default 25, FTP default 1, tunable per connection). On a rate-limit error (429 or equivalent), instead of piling errors into Open errors the connection throttles itself and recovers:

1. Drop effective concurrency to **1** and wait ~1 minute before retrying the errored record.
2. Each further rate-limit error **doubles** the wait (2, 4, 8, ... up to 1024 minutes) -- up to eleven attempts at concurrency 1, roughly 34 hours of accumulated backoff.
3. Once a minute passes at 1 without a rate-limit error, climb **back up** toward the target in steps of **25% of the target**, holding a minute at each step (target 25: 1 -> 7 -> 13 -> 19 -> 25). A rate-limit error mid-recovery restarts the dance from concurrency 1.
4. If the full sequence still hits rate-limit errors, the platform **auto-disables the setting on the connection** -- it must be re-enabled manually, and until then rate-limit errors flow into Open errors like any other failure.

Recovered records land in the **Resolved errors** tab (not Open errors), and the concurrency adjustments appear in the connection's **audit log**. While auto-recover is on, `concurrencyLevel` is platform-managed -- a PUT ignores a write to it and recovery moves it toward the target -- so the lever is `targetConcurrencyLevel`. Changing the target stops any recovery in progress and resets concurrency to the new value. Disabling auto-recover mid-run cancels recovery: unresolved rate-limit errors go to Open errors, the target is cleared, and `concurrencyLevel` stays wherever recovery left it -- possibly lowered -- so set it explicitly in the same change (both fields in one atomic PATCH).

### Borrowing concurrency

When multiple connections point at the same system but the system enforces an **account-wide** rate limit, have them share one budget: set `_borrowConcurrencyFromConnectionId` on each borrowing connection to point at a parent, and set the parent's ceiling to the system's limit (`targetConcurrencyLevel` while its auto-recover is on, otherwise `concurrencyLevel`). All borrowers draw from that shared budget (a borrower's own `concurrencyLevel` is ignored). This fits the "partition by identity" pattern -- different credentials or teams, one global API limit. A borrowing connection has no auto-recover toggle of its own; the **parent connection's** auto-recover setting governs.

### Wire-level debug logging

When a flow fails in ways online/offline doesn't explain -- the target is reachable and credentials look fine, but records are rejected with cryptic errors or the wrong data comes back -- capture the raw traffic with the connection debugger: arm a debug window on the connection (up to about an hour), read the debug logs it captures, then disarm it.

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

For OAuth connections, then authorize the connection via browser.

## custom_oauth2 and JWT-Based Auth

### `custom_oauth2` -- the generic OAuth2 escape hatch

Pick a **named `provider`** whenever one matches the system -- it carries provider-aware defaults and the correct sub-config shape. Reach for **`custom_oauth2`** only for OAuth2 APIs with no named provider; because nothing is preset, you supply the flow details yourself:

- `clientId` / `clientSecret` -- the registered app's credentials
- `scope` (+ `scopeDelimiter`) and `redirectUri` (must match the callback registered with the provider **exactly**)
- `grantType` -- `authorizecode`, `clientcredentials`, or `password` (exact enum values)
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

## iClient Operations

iClients support list, read, create, update (a full-document replace), and delete. The only targeted single-field change is `oauth2.failPath`; every other change is a full-document update, and the masked-credential rules in [Gotchas](#gotchas) apply. How an update keeps an iClient's stored secrets differs from a connection's -- your reference says how.

## iClient Gotchas

1. **`_httpConnectorId` is immutable.** Once an iClient is linked to an HTTP connector, it cannot be changed. Create a new iClient if you need a different connector.
2. **`provider` determines valid fields.** Setting `provider: "netsuite"` means the `netsuite` block is used; `provider: "custom_oauth2"` means the `oauth2` block. Mismatching provider and config block silently ignores the wrong block.
3. **Handlebars references use `{{{iClient.fieldName}}}`** to access values stored in `encrypted` or `unencrypted` objects. For JWT: `{{{iClient.jwt.token}}}`.
4. **`validDomainNames` is required for custom OAuth2.** Provide each unique domain from your auth/token/revoke URLs (without scheme or path).
5. **Deleting an iClient breaks referencing connections.** Connections that reference a deleted iClient will fail to authorize. Check for references before deleting.
6. **Editing a shared iClient's credentials affects every referencing connection.** Because one iClient backs many connections, rotating its `clientSecret` re-points OAuth for all of them at once. Confirm which connections depend on the iClient before changing it.
