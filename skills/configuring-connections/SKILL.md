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
celigo account deps connection <id>

# Find offline connections used by enabled flows, orphaned connections
celigo account lint

# Search marketplace for pre-built integration templates
celigo templates search "<application-name>"

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
celigo http-connectors search "<application-name>"
celigo http-connectors get <id> --full    # see auth config, endpoints, resources

# Search trading partner connectors (EDI, AS2, VAN)
celigo tp-connectors search "<application-name>"
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
celigo connections debug-enable <id> [--duration <minutes>]
celigo connections debug-disable <id>
celigo connections debug-logs <id>

# Integration-level connection management
celigo integrations register-connections <integrationId> <connectionIds...>
celigo integrations deregister-connections <integrationId> <connectionIds...>

# Replace connection across a flow's exports/imports
celigo flows replace-connection <flowId> <oldConnectionId> <newConnectionId>
```

Note: `connections set` and `iclients set` are not available because GET masks credentials as `"******"` -- the GET-modify-PUT pattern would corrupt stored secrets.

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

1. **GET masks credentials.** Passwords, tokens, and secrets are returned as `"******"`. Never round-trip a GET response back to PUT without restoring the real values. This is why `set` is excluded from the CLI for both resources.
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
