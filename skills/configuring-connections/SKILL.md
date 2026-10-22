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
- **iClients** -- reusable credential stores shared across connections: an OAuth app registration (client ID/secret, scopes, token endpoints) or a cloud identity (AWS IAM role, Azure service principal, Google service account). See [iClients section](#iclients-shared-credential-stores) below.

Used across flows, APIs, and tools.

## How to Run the Steps

This skill names each step by what it reads or changes; the exact calls depend on how you reach the account. Read the one reference that matches your tools -- both follow the section and step names of this skill:

- **Celigo MCP tools** (`list_connections`, `upsert_connection`, `get_schema`, ...) -- [references/mcp.md](references/mcp.md)
- **The `celigo` CLI** -- [references/cli.md](references/cli.md)

Looking up connections, connectors, templates, and iClients only reads. Creating, updating, deleting, authorizing, registering a connection on an integration, and arming a debug window all write to the account -- do them when the user asked for the change. Diagnosing a connection only reads: when the user asks what's wrong or what to do about it, name the change and leave it to them. A single whitelisted field is a targeted change; anything else is a full-document update that sends every masked credential back exactly as read, which keeps the stored secrets, and never leaves one out -- see [Connection Operations](#connection-operations). An iClient's update works the same way -- see [iClient Operations](#iclient-operations).

## Connection Types

| Target System | `type` | Schema | Notes |
|---|---|---|---|
| REST/GraphQL API (with connector) | `http` | [http.yml](references/schemas/http.yml) | `formType: "assistant"`, set `_httpConnectorId` |
| REST/GraphQL API (manual) | `http` | [http.yml](references/schemas/http.yml) | Three form types: `assistant`, `http`, `graph_ql` |
| NetSuite ERP | `netsuite` | [netsuite.yml](references/schemas/netsuite.yml) | Use `token-auto` for new connections |
| Salesforce CRM | `salesforce` | [salesforce.yml](references/schemas/salesforce.yml) | Omit `salesforce._iClientId` to use Celigo's Connected App |
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

**GraphQL steps get their editor from the connection.** For a generic GraphQL API, create a `graph_ql` connection whose base URI is the GraphQL endpoint (the connection form can't switch an existing connection to it). For a connector with a GraphQL API, bind the connection to that API with `http._httpConnectorApiId` -- every step on the connection inherits it. GraphQL steps on a connection bound to the app's REST API post to the API root and every record fails (HTTP 406 on Shopify): add a second connection bound to the GraphQL API and re-point those steps to it, rather than replacing the connection on the whole flow.

## Quick Reference

### Connection Type Decision Matrix

| Target system | Use type | Auth method | Read schema |
|---|---|---|---|
| Any REST/GraphQL API with a Celigo connector | `http` | Connector-defined (usually OAuth2 or token) | [http.yml](references/schemas/http.yml) |
| Any REST/GraphQL API without a connector | `http` | `token`, `basic`, `oauth` (the app on an iClient), `custom` (headers or encrypted fields); also `oauth1`, `jwtbearer`, `cookie`, `digest`, `wsse`, and `awsiam` (an `awsIam` iClient) | [http.yml](references/schemas/http.yml) |
| NetSuite ERP | `netsuite` | `token-auto` (Celigo-managed TBA; only the account id) | [netsuite.yml](references/schemas/netsuite.yml) |
| Salesforce CRM | `salesforce` | OAuth through Celigo's Connected App, or the customer's via an iClient (`salesforce._iClientId`) | [salesforce.yml](references/schemas/salesforce.yml) |
| SQL databases (Postgres, MySQL, SQL Server, Oracle) | `rdbms` | Username/password + host/port | [rdbms.yml](references/schemas/rdbms.yml) |
| Snowflake / BigQuery / Redshift | `rdbms` | Snowflake: key pair or password · BigQuery: service-account key · Redshift: access-key pair or an AWS IAM role (no host or password) | [rdbms.yml](references/schemas/rdbms.yml) |
| MongoDB / Atlas | `mongodb` | Host list (`host:port`), username, password | [mongodb.yml](references/schemas/mongodb.yml) |
| FTP / SFTP / FTPS | `ftp` | Username/password or SSH key | [ftp.yml](references/schemas/ftp.yml) |
| Amazon S3 | `s3` | IAM access key pair, or an IAM role through an `awsIam` iClient | [s3.yml](references/schemas/s3.yml) |
| MCP server | `mcp` | `token`, `oauth` (an iClient), or `custom` | [mcp.yml](references/schemas/mcp.yml) |

Which of the two HTTP rows applies is determined by search, not preference: check for a pre-built connector first (search the HTTP connector catalog) and use the manual row only when no connector exists or it doesn't fit -- see [Check for a pre-built connector and global iClient](#4-check-for-a-pre-built-connector-and-global-iclient).

### Minimum Required Fields

Every connection needs at minimum: `name`, `type`, and the type-specific config block. Some of the fields below are required by the connection form rather than the API (each schema says which); send them anyway, or the connection won't connect.

| Type | Required fields |
|---|---|
| `http` (connector) | `name`, `type: "http"`, `http.formType: "assistant"` (`assistant_graphql` when the API is GraphQL), `http._httpConnectorId`, `http._httpConnectorVersionId`, `http._httpConnectorApiId` for a connector with more than one API, `http.baseURI`, `http.mediaType`, and the fields the connector's form asks for -- credentials, and settings such as `settings.storeName` |
| `http` (manual) | `name`, `type: "http"`, `http.baseURI`, `http.mediaType`, `http.auth.type` and its credentials |
| `netsuite` | `name`, `type: "netsuite"`, `netsuite.authType: "token-auto"`, `netsuite.account` (a non-production account's id carries its suffix, such as `123456_SB1`) |
| `salesforce` | `name`, `type: "salesforce"`, `salesforce.oauth2FlowType` (plus `salesforce.username` for `jwtBearerToken`), `salesforce.sandbox` |
| `rdbms` | `name`, `type: "rdbms"`, `rdbms.type`, then that database's fields in [rdbms.yml](references/schemas/rdbms.yml) -- BigQuery and Redshift take no host or password |
| `ftp` | `name`, `type: "ftp"`, `ftp.type` (`ftp`, `sftp`, `ftps`), `ftp.hostURI`, `ftp.username`, and `ftp.password` or (SFTP) `ftp.authKey` -- an unencrypted RSA key in PEM format (OpenSSH-format, passphrase-protected, and PuTTY keys aren't supported); leave `password` out for key-only SFTP |
| `s3` | `name`, `type: "s3"`, `s3.accessKeyId` and `s3.secretAccessKey`, or `s3.authType: "awsIam"` and `s3._iClientId` |
| `mongodb` | `name`, `type: "mongodb"`, `mongodb.host` (an array of `host:port`), `mongodb.username`, `mongodb.password` |

**NetSuite.** `token-auto` needs only the account: Celigo supplies the OAuth client, so a `token-auto` connection needs no iClient. REST steps (SuiteTalk records, SuiteQL, custom RESTlets) run on the same `netsuite` connection -- don't build an `http` connection for them (a REST step on one is refused with 422 `invalid_connection_type`). SuiteTalk and SuiteQL need NetSuite's REST Web Services feature; a NetSuite 403 `FEATURE_DISABLED` means it's off. `netsuite.suiteAppInstalled` reflects only the Celigo SuiteApp as detected at the last authentication and ignores the legacy bundle -- check the SuiteApp and the bundle live before calling either missing.

**Salesforce.** A connection authorizes through Celigo's Connected App unless `salesforce._iClientId` names an iClient holding the customer's own; don't send `packagedOAuth`, which the platform sets. Choose `oauth2FlowType`: `refreshToken` (browser authorization, the default) or `jwtBearerToken` (server-to-server; needs `username` and a Connected App with a digital certificate; a custom app's private key goes on its iClient). `sandbox` must match the org. Never write `salesforce.scope`: an empty list is normal, a save from the connection editor resets it, and a custom app's scopes live on its iClient.

**Celigo's own API** (lookup caches, jobs, Celigo Storage) is reached from a flow through a connection built from one of Celigo's two connectors. *Celigo APIs* (`assistant: "integratorceligoapi"`) authorizes with client credentials through Celigo's own iClient and needs `accessScope` on create -- `full`, `custom` (listed APIs, listeners, and Celigo Storage folder paths), or `integration` (listed integrations); a create without it is refused with 422 "Scope is required for this connection". The connection document never carries the scope -- read it from `GET /v1/accessScope/connections/{_id}`; storage paths are covered in [managing-file-storage](../managing-file-storage/SKILL.md#8-use-stored-files-in-a-flow). *Celigo integrator.io* (`integratorio`) takes an API token, which the user enters in the Celigo UI, and `settings.region` -- `.` for North America, `.eu.`, `.au.`, or `.ca.` -- which completes its base URI `https://api{{{connection.settings.region}}}integrator.io`.

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

**Match on identity, not on the name.** Names are free text: a connection named "Shopify" may point somewhere else, and a working one may be called "Prod store". For a pre-built HTTP connector the identity is `http._httpConnectorId`, plus `http._httpConnectorApiId` when the connector has several API groups (two connections of one connector can target different APIs). `assistant` is the legacy application id -- the connector's `legacyId` -- so a connection that carries only `assistant` belongs to the connector whose `legacyId` or `legacyIds` (in the connector list) holds it, and a legacy `rest` connection is the same family as `http`. For other types it's the `type` plus its target (the NetSuite account, the database host). Two connections of the same connector and API usually point at different tenants or environments -- read the base URI or account fields before picking one. When more than one fits, prefer the one the flow or Tool you're changing already uses; otherwise confirm with the user.

**When presenting connection choices to the user**, filter out connections that are `offline: true`. Only show online/active connections as options. If ALL matching connections are offline, mention that and let the user decide whether to proceed with an offline connection or fix connectivity first.

### 4. Check for a pre-built connector and global iClient

For HTTP connections, search for a pre-built connector before configuring manually. Configure by hand only when no connector exists for the application or the connector doesn't support the auth scheme or endpoints you need:

- **HTTP connectors** (550+ apps: Shopify, Stripe, HubSpot, etc.) -- find the connector for the application name or base URL, then read the matching connector in full to see its auth config, endpoints, and resources. Where your surface offers it, scaffold the connection from the connector's own form and preview the body before anything is created.
- **Trading partner connectors** (EDI, AS2, VAN) -- search the trading partner catalog. For a partner that has one -- every published connector is AS2 or FTP -- link the connection to it (`as2._tpConnectorId` or `ftp._tpConnectorId`; published connectors only) and take the partner's host and AS2 identifiers from the user -- the connector's connection form holds only template stand-ins ([building-b2b](../building-b2b/SKILL.md#3-create-the-connection)). `as2.as2Id` (unique across all integrator.io accounts; generated when omitted) and `as2.partnerId` are fixed at creation -- a later update ignores a new value -- so never invent them. A VAN connection's `as2Id` is unique and fixed the same way (omit it to have the network assign one), and the network assigns `mailboxId`.

If an HTTP connector exists, set `http._httpConnectorId` and `http._httpConnectorVersionId` on the connection, plus `http._httpConnectorApiId` when it has more than one API. The connector provides auth templates, base URL, and pre-built endpoints. The platform resolves the link on save: an id that doesn't resolve is dropped rather than refused, and a top-level `assistant` replaces the connector id you sent -- send `assistant` only as the connector's own `legacyId`, and never on an Azure Data Lake Storage Gen2 connection, where it drops the connector ids. Read the connection back to confirm the link. A setting the connector's base URI splices into the host takes the bare identifier: Shopify's base URI is `https://{{{connection.settings.storeName}}}.myshopify.com/...`, so `settings.storeName` is `my-store`, not `my-store.myshopify.com` -- a full hostname doubles the domain, and every request goes to a host that doesn't exist.

**Check for a global iClient.** Many pre-built connectors ship with a **global (Celigo-managed) iClient** -- a shared OAuth app registration that handles authorization out of the box (e.g., Microsoft Business Central, Shopify, Google). When a global iClient is available:

- Use it by default: `http.auth.type: "oauth"` with the OAuth fields the connector's connection form pre-configures, including `http._iClientId` where the form names the global iClient.
- Do **not** fall back to static bearer token auth (`auth.type: "token"`) just because you don't have live credentials yet. Create the connection with the correct OAuth auth shape; it stays offline until the user authorizes it.
- Only create a custom iClient if the customer has their own app registration (e.g., their own Azure AD app, Shopify private app) or if the global iClient doesn't have the required scopes/consent for their tenant. Point the connection at it with `http.auth.oauth.useIClientFields: true` and `http._iClientId`. The app can't live on the connection itself: an HTTP connection doesn't store an OAuth client id or secret sent on it (the save answers 201 without them), and its authorization then fails with `unknown http authURI`.

Find the global iClient in the connector's connection form (its full definition), not on another connection. A connector OAuth connection either leaves `http._iClientId` empty -- the global iClient is applied when the user authorizes -- or names Celigo's published iClient. That iClient lives in Celigo's account, so reading it from the customer's account returns 404 `invalid_ref`, and nothing on it can be changed. That's normal, not a deleted iClient; an Integration App's connections can point at their publisher's iClient the same way.

### 5. Choose the type, auth method, and build

Use the [Connection Types](#connection-types) table above to pick the `type` value and open the matching schema for available auth options and required fields.

Every connection needs at minimum: `name`, `type`, and the type-specific config block (`http{}`, `netsuite{}`, `ftp{}`, etc.).

**Placeholder connections must use the correct auth shape.** When creating a connection without live credentials (e.g., demo, placeholder, or pre-staging), always configure the full auth structure the connection will ultimately use -- OAuth type, iClient reference, grant type, etc. This ensures the connection can be authorized in place later without reconfiguration. Never substitute static token auth as a shortcut for an OAuth connection. Don't send `offline` either: it's read-only, and only the platform's connection test sets it. A save runs that test when the connection has one -- for HTTP, only when a ping is configured -- and the result arrives in the save's response or, when the target is slow to answer, seconds later as a `system` change in the audit log. A placeholder that has a test reads offline until the user enters the credentials or authorizes it; one without a test carries no `offline` flag at all.

**An OAuth connection on an existing iClient** takes the auth shape and the reference; the iClient supplies the client, the endpoints, and the grant type:

```json
{
  "name": "Acme ERP - Production",
  "type": "http",
  "http": {
    "formType": "http",
    "baseURI": "https://erp.example.com/api/v3",
    "mediaType": "json",
    "_iClientId": "<iClientId>",
    "auth": { "type": "oauth", "oauth": { "useIClientFields": true } }
  }
}
```

`_iClientId` sits on the `http` block, beside `auth`, not inside it. An authorization-code connection holds no tokens until a person authorizes it in a browser -- in the Celigo UI, or through your surface's authorize step (step 6) -- so finish by telling the user to do that.

### 6. Test the connection

Ping the connection to confirm it reaches the target system with its credentials. A ping answers HTTP 200 whether the test passed or failed, so read the body: `{code: 200}` is a pass and `{errors: [...]}` a failure -- `invalid_host` (DNS), `missing_token` (re-authorize), or a `401` with `source: application` (the remote system refused the credential). Each adaptor runs its own check: HTTP calls its configured ping endpoint -- with none configured, the test passes without sending any request -- databases open a driver session, MCP lists the server's tools (`mcp_tools_list_failed` when that list doesn't come back), NetSuite and Salesforce validate the token. A pass proves only what that check exercised; with no ping configured, or a ping endpoint that needs no auth, the first real request is the real test, so give an HTTP connection a ping on an endpoint that needs its credentials. An OAuth connection requests a token only after the target answers 401, so a ping that needs no auth passes without ever fetching one.

Authorization-code OAuth connections (and Salesforce's `refreshToken` flow) need a browser authorization first -- the tokens come from the provider's redirect, so a person completes it. The provider's app must list the redirect URI the authorization URL carries (`redirect_uri`; `https://integrator.io/connection/oauth2callback` on a North America account). The callback sets `needsAuthorization: false`; a connection never authorized has no such key, so its absence proves nothing. Each new authorization URL replaces the one before it: with PKCE (an iClient's `oauth2.pkceCodeChallengeMethod`, and every Salesforce connection) only the most recent URL can finish, so authorize once, in one window. An MCP connection authorizes the same way, through an iClient: Celigo doesn't discover a server's OAuth endpoints or register a client dynamically, so register an app with the vendor that lists the callback above, put its client and URLs on a `custom_oauth2` iClient, and expect the authorization to end with a tool listing that fails it when the server refuses the call. Client-credentials and password grants, Salesforce JWT bearer, and cloud-identity iClients need no browser step: the platform requests the token itself, and as with any connection, a test whose ping needs no auth doesn't prove those credentials. Not every surface can ping or authorize; your reference names the fallback.

## Connection Operations

Beyond building one, the operations on a connection are:

- **CRUD** -- list, read, create, update (a full-document replace), and delete
- **Test connectivity** -- ping
- **OAuth authorization** -- the browser flow that obtains the tokens
- **Debug** -- arm and disarm a debug window, and read the debug logs it captured
- **Integration-level connection management** -- register connections on an integration, or deregister them
- **Replace a connection** -- repoint steps to another connection in one call: every step of a flow, API, or Tool, or one export or import

**Targeted changes vs full updates.** Only PATCH-whitelisted fields can be changed on their own: `name`, the debug window (`debugDate`, `debugUntil`), the credential-free concurrency settings (`<adaptor>.concurrencyLevel`, `<adaptor>.targetConcurrencyLevel`, `_borrowConcurrencyFromConnectionId`, `autoRecoverRateLimitErrors` -- `<adaptor>` is the connection's `type` block, such as `http`; a path under another block is accepted and never read), and `endUserProvidedFields`. A PATCH never reads or re-sends the masked credentials GET returns as `"******"`, so it's safe. Every other field takes a full-document update: send each secret back as the masked `"******"` the GET returned, which keeps the stored secret, or as a new value. An omitted secret or a placeholder clears the stored credential -- see [Credential Discipline](#never-accept-or-echo-real-credentials-in-chat). iClients follow the same mask rule, with two provider exceptions -- see [iClient Operations](#iclient-operations).

**`endUserProvidedFields`** belongs only on a connection an MCP server collects end-user credentials for: list the credential and tenant fields each end user supplies on their own copy (`http.encrypted.apiKey`, `rdbms.user`). A path the account owns -- `type`, `_agentId`, `wrapper._stackId`, any `<adaptor>._iClientId` -- is refused with 422 `mcp_end_user_provided_field_not_allowed`. A full update that leaves the field out keeps it (send `null` to clear it), and any change to the list makes every end user set up again.

**Replacing a connection.** The replacement must be the same adaptor type (422 otherwise), and for HTTP it should reach the same application: each step keeps its relative URI, which was written for the old connection's API, so a swap between HTTP connections on different connectors breaks every step on its first run -- change each step's connection and endpoint together instead. Replacing a connection on a flow, or on one export or import, cancels the runs in flight. A replace changes only the steps of the flow, API, Tool, export, or import it runs on; check separately anything else that used the old connection, such as a Tool's per-consumer bindings, an AI agent's MCP connection, or a sync.

**Update in place or create a new one.** Rotate a credential in place: every step keeps working through the same connection. When the identity changes -- another account, store, user, or app -- create a new connection and replace it on the steps, so nothing silently starts reading or writing a different system.

**Deregistering** a connection from an integration is refused (400 `not_allowed`) while a step in the integration's flows, APIs, or Tools uses it, or an alias on the integration or one of its flows points at it. Replace the connection on those steps and retarget the aliases first; steps already in the recycle bin don't count. Deregistering never changes the connection itself.

**Deleting.** A connection delete is refused with 422 while anything still uses it, and the message names each blocker: every export or import on it, the flows they're steps of, and any connection that borrows its concurrency (clearing the borrow is enough). Registration on an integration doesn't block a delete, and neither do steps already in the recycle bin. A deleted connection stays in the recycle bin for 30 days and can be restored; purging it sooner needs the binned flows and steps that pointed at it purged first (422 `referenced by Export` otherwise).

**Integration App connections.** A connection with `_connectorId` belongs to an Integration App, which may lock some of its fields: a full update answers 200 but keeps the app's value for a locked field, and a targeted change of one is refused with 422. Read the connection back and report what didn't persist rather than retrying.

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or updating a connection, verify:

- [ ] `name` describes the system/environment, not a specific operation (e.g., "Shopify - my-store", not "Shopify - Customer Upsert")
- [ ] `type` matches the target system (see [Connection Types](#connection-types))
- [ ] Type-specific config block is present (`http{}`, `netsuite{}`, `rdbms{}`, etc.)
- [ ] On a create, auth credentials are real values (or placeholders on a connection nothing uses yet), never a `"******"` copied from another connection; on an update, each secret is this connection's own mask, exactly as read, or a new value -- never left out
- [ ] No credential the user pasted into chat is anywhere in the body -- a placeholder holds its place until the user enters the rotated one in the UI
- [ ] For HTTP: a pre-built connector search was done (the HTTP connector catalog); manual config only because none exists or it doesn't fit
- [ ] For HTTP connectors: `http._httpConnectorId` and `http._httpConnectorVersionId` are set
- [ ] Reusing an existing connection: it was matched on connector identity (`http._httpConnectorId` / `http._httpConnectorApiId`, or the type and target), not its name
- [ ] For OAuth connections: uses global iClient if connector provides one; custom iClient only when needed
- [ ] For OAuth connections: `auth.type` is `"oauth"` (not `"token"` with a static bearer), even on a placeholder nobody has authorized yet
- [ ] For OAuth through an existing iClient: `http._iClientId` on the `http` block, `http.auth.oauth.useIClientFields: true`, and the user told to authorize the connection
- [ ] For a customer's own OAuth app: the client id and secret are on a `custom_oauth2` iClient whose `validDomainNames` lists the OAuth URLs' registrable domains -- an HTTP connection doesn't keep them
- [ ] For a Celigo APIs connection: `accessScope` is in the create body
- [ ] No `offline` in the body -- it's read-only
- [ ] For NetSuite: `netsuite.authType` is `token-auto` (not deprecated `basic`), with `netsuite.account`
- [ ] For Salesforce: `oauth2FlowType` and `sandbox` set; no `packagedOAuth`
- [ ] For RDBMS: `rdbms.type` plus that database's required fields (BigQuery and Redshift take no host or password)

## Gotchas

These are connection gotchas. iClients follow the same mask rule, with two provider exceptions -- see [iClient Gotchas](#iclient-gotchas).

1. **GET masks credentials, and the mask keeps them.** Passwords, tokens, and secrets are returned as `"******"`. Sent back unchanged in a full update, the mask keeps the stored secret: the platform treats the mask on an encrypted field that already holds a secret as "unchanged". Leaving the field out clears it; on a static-token connection (no `refreshMethod`), an update without the token is refused with 422 instead. A full update that still contains `"******"` is refused unless it is explicitly forced or confirmed (your reference says how on each surface) -- for masks read from this connection, that is safe. Some tool descriptions and refusals still say to leave a secret out to keep it; that is out of date -- leaving it out is what clears it.
2. **PUT erases omitted fields.** Always GET first, modify, then PUT the complete object, with every secret either the mask you read or a new value. Leave out only the read-only fields the GET adds (`_id`, `createdAt`, `lastModified`, `offline`, `queues`, `sandbox`, `connectionRole`). For a rename, debug window, or concurrency change, make a targeted change instead -- no credentials involved.
3. **Authorization-code OAuth connections need browser authorization after creation.** Creating via API sets up the shell, but tokens come from a browser redirect, so a person has to complete the authorization. Say so when you report the new connection: it doesn't work until the user authorizes it in the Celigo UI. The scopes are requested at that moment (the authorization URL carries them): after adding a scope, authorize again, and never put a placeholder in a scope field. Client-credentials, password, Salesforce JWT bearer, and cloud-identity connections get their tokens without a browser.
4. **`rest` type is legacy.** Always use `type: "http"` for new REST connections.
5. **NetSuite `basic` auth is deprecated.** Use `token-auto` (Celigo-managed TBA) for new connections.
6. **Debug logs are connection-scoped.** Enabling debug captures request/response data for all flows using that connection.
7. **`_borrowConcurrencyFromConnectionId` shares slots.** The borrowing connection's `concurrencyLevel` is ignored, its work shares the parent's queue, and borrowing is one level -- see [Borrowing concurrency](#borrowing-concurrency).
8. **Name connections after the system, not the operation.** Connections are shared across resources. "Shopify - my-store" is correct; "Shopify - Customer Upsert" is not.
9. **Use the global iClient for OAuth connectors.** When a pre-built connector ships with a global iClient, use it with `auth.type: "oauth"` -- do not substitute `auth.type: "token"` with a static bearer token, even for offline/dummy connections. Static tokens expire and produce the wrong auth shape.
10. **An OAuth connection's `authURI` and `tokenURI` are fixed.** An update that changes either is refused with 422 ("Updating the value in tokenURI is not allowed for oauth connections due to security reasons"). For new OAuth URLs, create a new connection and replace it on the steps.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | Invalid or expired credentials | Verify auth credentials; for OAuth, re-authorize the connection in a browser |
| `403 Forbidden` | Valid credentials but insufficient permissions | Check the user/role permissions in the target system |
| `422 Unprocessable Entity` -- invalid type | `type` value is not recognized or misspelled | Use exact values from [Connection Types](#connection-types): `http`, `netsuite`, `salesforce`, `rdbms`, etc. |
| `422 Unprocessable Entity` -- missing fields | Required type-specific fields are absent | Check [Minimum Required Fields](#minimum-required-fields) for the connection type |
| Delete: 422 `<type> <id> must be deleted before you can delete connection <id>` | An export or import still uses the connection (the flow it's a step of is named too), or another connection borrows its concurrency | Replace the connection on those steps or delete them, and clear the borrower's `_borrowConcurrencyFromConnectionId` -- see Deleting under [Connection Operations](#connection-operations) |
| Deregister: 400 `The connection is being actively used by the integration` (or `referenced by an alias`) | A step in the integration's flows, APIs, or Tools uses it, or an alias points at it | Replace the connection on those steps, and retarget or remove the alias |
| Borrowing: 422 `already borrowing concurrency from another connection`, `there are already connections borowing from it`, or `cannot borrow concurrency from itself` | Borrowing is one level, and never from itself | Point every borrower at the one parent that borrows from nothing |
| iClient delete: 422 `this document is referenced by Connection : <id>` | A connection still points at the iClient -- possibly a deleted one in the recycle bin, which the dependency list doesn't show | Re-point that connection, or purge it from the recycle bin, then delete the iClient |
| A ping answers HTTP 200 with `errors` | The test failed: `invalid_host` (DNS), `missing_token` (not authorized), or `401` with `source: application` (the remote system refused the credential) | Fix the host or URL, re-authorize, or have the user re-enter the credential in the UI; for on-prem systems, check the agent |
| `ECONNREFUSED` / `ETIMEDOUT` | Network-level failure to target system | Check host/port and DNS resolution; if the target allows only approved IP addresses, it must allow Celigo's outbound ranges ([Partner IP allow lists](#partner-ip-allow-lists)) -- a network policy won't help; for on-prem systems, verify `_agentId` is set |
| OAuth `invalid_grant` | Refresh token expired or revoked | Re-authorize the connection in a browser |
| Authorizing: the provider answers `invalid_grant` ... `invalid code verifier` | A newer authorization URL was issued for this connection (another tab, a second try): with PKCE it replaced the stored code verifier | Close the other authorization windows and authorize again from one new URL |
| `token_extraction_failed` "Failed to extract token value from refresh token response", with HTML in `ResponseBody` | The token refresh got a web page, not JSON: the iClient's token or refresh URL points at a login or authorization page | Point the iClient's `token.uri` / `refresh.uri` at the provider's token endpoint |
| The user pastes a provider sign-in URL carrying `state` and `redirect_uri=.../connection/oauth2callback` | That's the start of an authorization, not its result | Ask what the provider's page showed after they signed in |
| Authorizing: 422 `Expected field: authURI in the Connection to be present.` | Not an authorization-code connection -- nothing to authorize in a browser | Client credentials, password, JWT bearer, and cloud identities get tokens on their own; test the connection instead |
| Authorizing: 422 `unknown http authURI: "<domain>"` | The connection has no iClient to authorize with -- an HTTP connection keeps no client id or secret of its own | Create a `custom_oauth2` iClient with the app and `validDomainNames`, and point the connection at it (`http._iClientId`, `useIClientFields: true`; `authURI` and `tokenURI` unchanged) |
| Authorizing or testing: `The domain of request url should be present in iClient.oauth2.validDomainNames` | The iClient's `validDomainNames` lacks the registrable domain of the authorization, token, or revoke URL | Add that registrable domain (`example.com`, not `auth.example.com`) to the iClient |
| 422 `Updating the value in tokenURI is not allowed for oauth connections` (or `authURI`) | An update changed an OAuth connection's token or authorization URL | Those URLs are fixed: create a new connection and replace it on the steps |
| 422 `Scope is required for this connection` | A Celigo APIs connection created without `accessScope` | Add `accessScope` -- see Celigo's own API under [Minimum Required Fields](#minimum-required-fields) |
| 422 `fileserver_loopback_not_supported` "This connection points at this environment's own Celigo file server ..." | An FTP connection's host and `@<identifier>` username are this environment's own Celigo file server | Don't connect to it: read the files from Celigo Storage in the flow ([managing-file-storage > 8. Use stored files in a flow](../managing-file-storage/SKILL.md#8-use-stored-files-in-a-flow)). Another environment's server on the same host, such as a trading partner's, is fine |
| NetSuite 403 `FEATURE_DISABLED` | NetSuite's REST Web Services feature is off (SuiteTalk and SuiteQL steps) | A NetSuite administrator enables it; custom RESTlets don't need it |
| Ping: `mcp_tools_list_failed` | The MCP server didn't return its tool list | Check `mcp.serverURL` and the token or OAuth iClient; authorize an OAuth server again |
| `"******"` saved as a connection credential (authentication fails after a save) | A mask was sent where no secret was stored: a create built from another connection's document, or a mask placed on a field that was empty | A mask keeps only a secret the field already holds; the real value has to go in that field, so the user enters it in the Celigo UI |
| `429 Too Many Requests` | Destination rate limit exceeded | If auto-recover is enabled, the connection throttles and retries automatically; to cap it lower, reduce `targetConcurrencyLevel` (`concurrencyLevel` is platform-managed while auto-recover is on). Otherwise enable auto-recover, with `targetConcurrencyLevel` in the same change, or lower `concurrencyLevel`. Both are credential-free targeted changes. If another connection reaches the same external account, they share its limit -- see [Connections as concurrency queues](#connections-as-concurrency-queues----throughput-and-governance) |

## Credential Discipline & Runtime Behavior

How connections behave once they exist -- the credential rules every update must follow, and the runtime model (state, queues, rate-limit recovery, debug) to reason about when troubleshooting.

### Never accept or echo real credentials in chat

A full connection update (PUT) carries every credential field, and each one goes back either as the masked `"******"` the GET returned, which keeps the stored secret, or as a new value. A new value is a real credential, and chat conversations are logged in clear text, so **never accept, request, or echo a real credential** (API key, OAuth token or client secret, SFTP password, cert key, AS2 cert pair) in chat.

- **Settings that never need credentials go through PATCH.** Rename, the debug window, the concurrency settings, borrowing, auto-recover, and `endUserProvidedFields` are targeted single-field changes (the whitelist is under [Connection Operations](#connection-operations)). PATCH never reads or changes the stored credentials, so these need no credential follow-up -- don't tell the user to re-enter anything after a rename or a concurrency change.
- **Everything else is a full update: send the secrets back as their masks.** Read the connection, change what you need, and send the complete document with every `"******"` left exactly as read -- each mask keeps its stored secret. Never drop a secret field to keep it, even where a tool's description says to: an omitted secret or a placeholder clears the stored credential and leaves the connection -- and every flow on it -- offline until someone re-enters it (a static-token connection, one with no `refreshMethod`, sent without its token is refused with 422 instead). That makes a base URI, endpoint, or header change safe as a full update. A credential or auth-type change needs the new secret, so describe it and have the user make it in the Celigo UI, where re-entering the credential (or re-authorizing, for OAuth) is part of the save. Placeholder credentials belong only on a connection nothing depends on yet, and the user must enter the real values in the UI before it works.
- If a user pastes a real credential, treat it as compromised, full stop. Never write it anywhere -- not into the secret field, a header, or any other field -- and never repeat it back. The only correct mitigation: (1) rotate the credential at the external system itself -- regenerate the API key, reset the OAuth grant, rotate the SFTP password, revoke and reissue the cert pair -- then (2) update the connection in the Celigo UI with the rotated value. This holds no matter how trivial the credential looks (a sandbox key, a stale password, a client secret the user thinks is unused).
- **A pasted credential doesn't stop the build.** Create the rest of the connection with the auth shape it needs and a placeholder such as `REPLACE_IN_CELIGO_UI` in the secret field -- for token auth the field can't simply be left empty: a create without a token is refused with 422 `Expected field: refreshMethod to be present.` Then tell the user three things: the pasted credential wasn't stored; it is compromised because it was shared in chat, so they rotate it at the external system; and they enter the rotated one on the connection in the Celigo UI, which is when the connection starts working.

The credentials live on the durable connection record; the runtime auth state (token still valid, cert still trusted, system reachable) is separate and ephemeral.

### Online / offline -- fix the shared connection, not each flow

A connection is **online** (credentials valid, target reachable, every dependent can run) or **offline** (token expired, API changed, network unreachable, credentials rotated without updating Celigo, cert expired). The connection resource exists in either state -- going offline doesn't delete it. Probe it with a ping, or read the connection's `offline` flag.

When a user reports "my flow is failing" and the root cause is the connection, **fix the shared connection, not each dependent flow.** One connection backs many consumers (flows, APIs, Tools, AI agents); every dependent recovers the moment the connection is back online. That one-fix-all-recover payoff is the whole point of the connection abstraction.

**Find out why it went offline before changing anything.** The connection's audit log shows when it flipped (`offline` set to `true`, source `system`) and, on an OAuth connection, the platform's token refreshes before that (system updates of `http.auth.token.token` and `refreshToken`). The errors its steps raised from then on name the cause: `invalid_grant` means the provider refused the refresh token (expired or revoked), which only a person re-authorizing the connection in a browser fixes; a 401 or 403 from the application means the credential or its permissions were refused; a timeout or `ECONNREFUSED` points at the network ([Partner IP allow lists](#partner-ip-allow-lists)).

### Connections as concurrency queues -- throughput and governance

Every connection is backed by its own dedicated **FIFO queue**. Work routed through a connection lands in its queue as messages and processes first-in, first-out. A message is a unit of work for one step -- an export's run, a page of records for an import or lookup, a retry, a webhook delivery -- not a record and not a whole run, so the queue's size (`queues[].size`, `-1` when it couldn't be read) counts messages. Two flows using the same connection **share one queue**; a flow that touches multiple connections lands in multiple queues (one per connection). This is the mental model for throughput, rate limits, and "why are my flows competing for capacity?"

`concurrencyLevel` sets how many messages from the queue process **in parallel** -- match the connection's ceiling to the external system's published API governance limit (if the destination permits 25 parallel requests, a ceiling of 25 runs at the limit without going over). While auto-recover is on (the default for new connections), the platform manages `concurrencyLevel` itself, so the ceiling you set is `targetConcurrencyLevel`; with auto-recover off, set `concurrencyLevel` directly. Both are targeted changes -- no credentials needed. Queue depth is **connection-level**, owned collectively by every consumer -- never attribute a deep queue to a single flow, and treat a deep queue as an explanation (work ahead in line), not a defect. The connection document reports the current depth (`queues[].size`). An FTP connection can also carry `ftp.multiThreadCount` (parallel transfer threads), which isn't patchable: it changes only through a full update, and a full update that leaves it out clears it.

**The ceiling is per connection, but some systems meter per account.** NetSuite has one concurrency pool per NetSuite account (the service tier's 5, 15, or 20, plus 10 per SuiteCloud Plus license; development and partner accounts are fixed at 5; shown at Setup > Integration > Integration Management > Integration Governance -- Celigo can't read it), shared by every connection to that account and by every caller outside Celigo. Before raising a NetSuite ceiling, total the ceilings of all connections on that account (a borrower counts under its parent), ask for the account's limit, and raise in small steps -- or put the limit on one parent and have the others borrow ([Borrowing concurrency](#borrowing-concurrency)). Over the limit, NetSuite rejects requests from every caller at once.

**Rate limits are shared the same way.** An API that limits requests per account or tenant counts every connection to that account together, whatever each connection's own ceiling: a second connection to the same account -- another team's flow, a new backfill -- can push the first into rate-limit errors with no change to the first. When a connection starts hitting rate limits, list the other connections with the same base URI or account and check what is running on them; to keep them under one limit, have them borrow from one parent ([Borrowing concurrency](#borrowing-concurrency)).

Throughput symptoms almost always point back to the connection, not the flow:

| Symptom | Likely cause / fix |
|---|---|
| Flow hitting rate limits | Concurrency ceiling too high for what the destination permits, or auto-recover disabled |
| Flow slow / not keeping up | Concurrency ceiling too low; the system permits more parallelism than the connection uses |
| Some flows starve others | High-volume flows share one connection's queue -- partition into separate connections (high-priority vs back-office) and set concurrency per priority |
| Need to throttle a system | Lower the ceiling on the connection serving it -- `targetConcurrencyLevel` while auto-recover is on, otherwise `concurrencyLevel` |

### Auto-recover rate-limit errors

New connections enable **auto-recover rate limit errors** by default, with a per-adaptor target concurrency (HTTP 25, FTP 1, most other adaptors 5; tunable per connection). On a rate-limit error (429 or equivalent), instead of piling errors into Open errors the connection throttles itself and recovers:

1. Drop effective concurrency to **1** and wait ~1 minute before retrying the errored record.
2. Each further rate-limit error **doubles** the wait (2, 4, 8, ... up to 1024 minutes) -- up to eleven attempts at concurrency 1, roughly 34 hours of accumulated backoff.
3. Once a minute passes at 1 without a rate-limit error, climb **back up** toward the target in steps of **25% of the target**, holding a minute at each step (target 25: 1 -> 7 -> 13 -> 19 -> 25). A rate-limit error mid-recovery restarts the dance from concurrency 1.
4. If the full sequence still hits rate-limit errors, the platform **auto-disables the setting on the connection** -- it must be re-enabled manually, and until then rate-limit errors flow into Open errors like any other failure.

Recovered records land in the **Resolved errors** tab (not Open errors), and the concurrency adjustments appear in the connection's **audit log**. While auto-recover is on, `concurrencyLevel` is platform-managed -- a PUT ignores a write to it and recovery moves it toward the target -- so the lever is `targetConcurrencyLevel`. Changing the target stops any recovery in progress and resets concurrency to the new value. Disabling auto-recover mid-run cancels recovery: unresolved rate-limit errors go to Open errors, the target is cleared, and `concurrencyLevel` stays wherever recovery left it -- possibly lowered -- so set it explicitly in the same change (both fields in one atomic PATCH). Re-enabling it copies the current `concurrencyLevel` into `targetConcurrencyLevel` -- after the platform switched it off, that's the level recovery left it at, usually 1 -- so when the user asks for it, set the target in the same PATCH. Before re-enabling it, find out why the backoff ran out -- for example, another connection to the same external account using up the shared limit (above).

### Borrowing concurrency

When multiple connections point at the same system but the system enforces an **account-wide** rate limit, have them share one budget: set `_borrowConcurrencyFromConnectionId` on each borrowing connection to point at a parent, and set the parent's ceiling to the system's limit (`targetConcurrencyLevel` while its auto-recover is on, otherwise `concurrencyLevel`). All borrowers draw from that shared budget (a borrower's own `concurrencyLevel` is ignored). This fits the "partition by identity" pattern -- different credentials or teams, one global API limit. A borrowing connection has no auto-recover toggle of its own; the **parent connection's** auto-recover setting governs.

A borrower drains through the parent's queue as well as its ceiling, so a busy borrower competes with the parent's own flows and undoes a split by priority -- settle that split before choosing the parent. Borrowing is one level: a connection that borrows can't be borrowed from (422 `connection_borrows_from_another`), one that others borrow from can't start borrowing (422 `connection_borrowed_by_another`), and a connection can't borrow from itself. A parent can't be deleted while anything borrows from it.

### Partner IP allow lists

When a partner restricts its server to approved IP addresses, Celigo's calls out to it (HTTP, FTP, SFTP, FTPS) time out or are refused until the partner allows Celigo's outbound ranges for the account's region, published in the Help Center article [Add integrator.io IPs to your allow list](https://docs.celigo.com/hc/en-us/articles/115003717028):

| Region (sign-in host) | Platform range | Disaster-recovery range |
|---|---|---|
| US (`integrator.io`) | `44.204.21.0/24` | `18.246.180.128/25` |
| EU (`eu.integrator.io`) | `3.79.248.128/26` | `3.254.10.128/26` |
| CA (`ca.integrator.io`) | `18.99.7.224/27` | `18.99.130.96/27` |
| AU (`au.integrator.io`) | `3.44.67.224/27` | `18.99.194.32/27` |

Send the partner both ranges for the region, and check the article for changes. Nothing on the Celigo side replaces that: a network policy restricts only callers coming in to Celigo -- API tokens, MCP servers, and sign-in ([managing-network-policies](../managing-network-policies/SKILL.md)) -- never a connection's outbound calls. A host that can't be reached from the internet at all needs an on-premise agent instead ([managing-on-premise-agents](../managing-on-premise-agents/SKILL.md)).

### Wire-level debug logging

When a flow fails in ways online/offline doesn't explain -- the target is reachable and credentials look fine, but records are rejected with cryptic errors or the wrong data comes back -- capture the raw traffic with the connection debugger: arm a debug window on the connection (up to about an hour), read the debug logs it captures, then disarm it.

- Captures every request/response through the connection with sensitive fields **masked**. Each entry is a header line -- the time, a trace key a request shares with its response, and the resource type and id using the connection (`ping` for a connection test) -- followed by the request (URL, method, headers, body) or the response. A response entry carries only headers and body, no HTTP status: read a failure from the body and from headers such as `Retry-After`.
- Logs appear only once data is actually moving -- not for flows queued but not yet processing. Captured logs remain available for **24 hours** (or until cleared).
- Debug is **connection-scoped** -- it captures traffic for every flow using that connection.
- **Not supported** for DynamoDB, MongoDB, or wrapper connectors; fall back to test-mode flow runs, mock data, or the destination's own logs.
- The extra per-request capture adds noticeable lag on high-volume flows (millions of records). Enable it briefly during a representative test run, or narrow the source export's criteria so a small set exercises the connection inside the debug window, then turn it off so the flow runs at full speed.


---

# iClients (Shared Credential Stores)

An iClient is a **reusable credential store** that can be shared across multiple connections. Most hold an OAuth app registration -- the client ID, client secret, scopes, and provider-specific OAuth configuration. Three hold a cloud identity instead: `awsIam` (an AWS IAM role Celigo assumes), `azureserviceprincipal` (a Microsoft Entra service principal), and `googleserviceaccount` (a Google Cloud service-account key). Instead of embedding app credentials directly in each connection, you create one iClient and reference it.

## When Do You Need an iClient?

| Scenario | iClient needed? |
|---|---|
| HTTP connection with pre-built connector that has a global iClient | Use the **global iClient** the connector's form names (or applies at authorization). No custom iClient needed. |
| HTTP connection with OAuth2 using a custom app registration | Yes -- create a **custom iClient** with your clientId/clientSecret, reference via `http._iClientId` (the connection itself doesn't keep a client id or secret) |
| Salesforce connection through the customer's own Connected App | Yes -- a `salesforce` iClient with the app's credentials, referenced by `salesforce._iClientId` (omit it to use Celigo's Connected App) |
| NetSuite connection with `authType: "token-auto"` | No -- Celigo supplies the OAuth client; the connection needs only `netsuite.account` |
| HTTP connection with pre-built connector (no global iClient) | Maybe -- check if the connector's auth requires one |
| HTTP connection with token auth (no OAuth) | No -- credentials go directly on the connection |
| Amazon S3, Redshift, or an AWS HTTP connector authenticating with an IAM role | Yes -- an `awsIam` iClient (`s3.authType: "awsIam"`, `rdbms.redshift.authType: "awsIam"`, or `http.auth.type: "awsiam"`) |
| SQL Server (cloud), Azure Synapse, or ADLS Gen2 with a service principal | Yes -- an `azureserviceprincipal` iClient (`rdbms.mssql.authType: "azure-service-principal"` on the databases) |
| Google Cloud Storage with a service-account key | Yes -- a `googleserviceaccount` iClient |
| Other database, FTP, or non-OAuth connections | No |

The rule of thumb: **if a global iClient exists for the connector, use it. If the connection uses OAuth and you're bringing your own app registration, or authenticates as a cloud identity, create an iClient.**

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
- **iClient** owns the app registration (or cloud identity) credentials and flow configuration
- Multiple connections can share one iClient (e.g., multiple connections to the same OAuth app)

### Reference fields on connections

- **HTTP connections:** `http._iClientId` -- when `http.auth.type` is `oauth` and `oauth.useIClientFields: true`, or `awsiam` (an `awsIam` iClient)
- **Salesforce connections:** `salesforce._iClientId` -- the customer's own Connected App; omit it to use Celigo's
- **MCP connections:** `mcp.http._iClientId` -- required when `mcp.http.auth.type` is `oauth` (MCP connections accept `token`, `oauth`, or `custom` auth)
- **S3 and RDBMS connections:** `s3._iClientId` or `rdbms._iClientId` -- an IAM role (S3, Redshift) or a service principal (SQL Server, Azure Synapse)
- **NetSuite connections:** a `token-auto` connection needs none -- Celigo supplies the OAuth client

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
| AWS IAM role (S3, Redshift, AWS HTTP connectors) | `awsIam` |
| Microsoft Entra service principal (SQL Server cloud, Azure Synapse, ADLS Gen2) | `azureserviceprincipal` |
| Google Cloud service account (Google Cloud Storage) | `googleserviceaccount` |

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
| `awsIam`, `azureserviceprincipal`, `googleserviceaccount` | [base.yml](references/iclient-schemas/base.yml) | `roleArn` and `externalId`; `tenantId`, `clientId`, and a `clientSecret` or `certificate`; `serviceAccountJSON` |

Every iClient needs at minimum: `provider` and the matching provider-specific config block (`oauth2{}`, `netsuite{}`, `salesforce{}`, etc.).

### 3. Reference from the connection

After creating the iClient, set the `_iClientId` on the connection (`http._iClientId`, `salesforce._iClientId`, `mcp.http._iClientId`, `s3._iClientId`, `rdbms._iClientId`).

For an authorization-code connection, then authorize the connection in a browser; client-credentials and cloud-identity connections need no authorization step.

## custom_oauth2 and JWT-Based Auth

### `custom_oauth2` -- the generic OAuth2 escape hatch

Pick a **named `provider`** whenever one matches the system -- it carries provider-aware defaults and the correct sub-config shape. Reach for **`custom_oauth2`** only for OAuth2 APIs with no named provider; because nothing is preset, you supply the flow details yourself:

- `clientId` / `clientSecret` -- the registered app's credentials
- `scope` (+ `scopeDelimiter`) and `redirectUri` (must match the callback registered with the provider **exactly**)
- `grantType` -- `authorizecode`, `clientcredentials`, or `password` (exact enum values)
- token / refresh / revoke endpoints, plus `clientCredentialsLocation` (send client credentials in a basic-auth header vs the request body)
- PKCE settings where the provider requires them
- `validDomainNames` -- the registrable domain of each OAuth URL (token, authorization, revoke): `microsoftonline.com` for `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token`, `example.co.uk` for `auth.example.co.uk`. A hostname never matches: the connection test fails with `[invalid_domain] … validDomainNames` and nothing is sent, and the authorization URL isn't issued either. Adding the API host's registrable domain is harmless.
- `accessTokenPath` / `refreshTokenPath` -- where the token endpoint's JSON response carries each token (`access_token`, `data.refresh_token`), not endpoint URLs; those go in `token.uri` and `refresh.uri`. `refreshTokenPath` is read on every refresh too: a refresh token found there (at `refresh_token` when unset) replaces the stored one, so a provider that rotates refresh tokens and nests the new one needs it, or the connection keeps sending the token it already used

See [oauth2.yml](references/iclient-schemas/oauth2.yml) for the full field set.

### JWT-based auth

Some providers require a **JWT assertion** as part of the token request. Set `enableJWT: true` and populate the `jwt` block on the iClient; for Salesforce JWT bearer, supply the `privateKey` (see [salesforce.yml](references/iclient-schemas/salesforce.yml)). Handlebars templates reference the signed token via `{{{iClient.jwt.token}}}`. The `clientSecret` and private key are credentials -- the [Credential Discipline & Runtime Behavior](#credential-discipline--runtime-behavior) rules apply: never paste them in chat.

## One iClient, Many Connections

An OAuth iClient is the **app registration, not an identity**. It holds the app's `clientId` / `clientSecret`, while the per-user access and refresh tokens produced by actually running the OAuth flow live on the **connection**, not the iClient. That's why the default is **one iClient, many connections** -- register the app once, store it as an iClient, and point every connection that should authenticate as that app at it via `_iClientId`. Ten Salesforce connections for ten different orgs can all share one iClient: same app, ten distinct authenticated identities.

Minting a separate iClient per connection duplicates the same `clientId` / `clientSecret` and multiplies rotation work. Reach for **distinct iClients** only when connections genuinely need *different registered apps* -- different developer accounts, different scope grants, separate rate-limit pools, or a hard separation between environments where each has its own provider-side app.

## Update an iClient in Place vs Create a New One

- **Secret rotated** (the provider reissued it, or it leaked) -> **update the existing iClient in place**. Every connection authenticating through it picks up the new secret with no retargeting.
- **The app itself changed** (a different registered app, a different developer account, a move to a new client ID) -> create a **new iClient**. The old one stays usable for connections still on the old app; connections migrate to the new one as needed.

Smell test (mirrors connections): renewing the same app's credentials -> update in place; switching to a different app -> new iClient.

## iClient Operations

iClients support list, read, create, update (a full-document replace), and delete. The only targeted single-field change is `oauth2.failPath`; every other change is a full-document update.

**An iClient update keeps secrets the same way a connection update does.** Send every secret field back exactly as the read returned it: the masked `"******"` keeps the stored secret. Never leave a secret out to keep it -- depending on the provider, the update is refused (an `oauth2` block without `clientSecret` gets 422 `missing_required_field`) or the secret isn't preserved. Two providers differ:

- **Google service account:** the key is never returned, and every update must carry the full JSON key (the mask or an omission fails with 422 `invalid_json_key`), so that change is the user's to make in the Celigo UI.
- **Azure service principal:** an omitted `clientSecret` or `certificate` is kept (the certificate is never returned, not even masked).

Apart from a Google service account, changing an iClient's scopes, endpoints, or `validDomainNames` needs no secret from the user. A connection treats the mask the same way -- see [Credential Discipline](#never-accept-or-echo-real-credentials-in-chat).

**Deleting an iClient** is refused with 422 (`this document is referenced by Connection : <id>`) while any connection points at it -- including a deleted connection still in the recycle bin, which the iClient's dependency list no longer shows. Re-point the connection, or purge the binned one first. The delete is permanent: iClients don't go to the recycle bin.

## iClient Gotchas

1. **`_httpConnectorId` is immutable.** Once an iClient is linked to an HTTP connector, it cannot be changed. Create a new iClient if you need a different connector.
2. **`provider` determines valid fields.** Setting `provider: "netsuite"` means the `netsuite` block is used; `provider: "custom_oauth2"` means the `oauth2` block. Mismatching provider and config block silently ignores the wrong block.
3. **Handlebars references use `{{{iClient.fieldName}}}`** to access values stored in `encrypted` or `unencrypted` objects. For JWT: `{{{iClient.jwt.token}}}`.
4. **`validDomainNames` holds registrable domains, never hostnames.** List the registrable domain of each token, authorization, and revoke URL (`microsoftonline.com`, not `login.microsoftonline.com`). A connection test or an authorization that fails with `[invalid_domain]` ("The domain of request url should be present in iClient.oauth2.validDomainNames") is fixed here, never on the connection.
5. **A referenced iClient can't be deleted, and a delete is permanent.** Every connection that points at it blocks the delete (422), a deleted one still in the recycle bin included -- see [iClient Operations](#iclient-operations). A deleted iClient can't be restored.
6. **Editing a shared iClient's credentials affects every referencing connection.** Because one iClient backs many connections, rotating its `clientSecret` re-points OAuth for all of them at once. Confirm which connections depend on the iClient before changing it.
7. **The mask keeps an iClient's secret; leaving it out doesn't.** Connections work the same way. On an update, send every secret field back exactly as read, the `"******"` included -- see [iClient Operations](#iclient-operations) for the two providers that differ.
8. **A 404 on a connector connection's iClient isn't a deleted iClient.** Celigo's published (global) iClient lives in Celigo's account, so reading it from the customer's account returns 404 `invalid_ref`. Don't replace it with a custom iClient unless the customer needs their own app.
9. **An `awsIam` iClient serves one connection family.** The role in `awsIam.roleArn` must be named for the family that assumes it -- `celigo-file-adaptor-` (S3), `celigo-data-warehouse-adaptor-` (Redshift), `celigo-http-adaptor-` (AWS HTTP connectors) -- so S3 and Redshift each need their own iClient; the connection save fails with 422 `invalid_field_value` on a wrong prefix, and with 422 `missing_required_field` while the iClient has no `roleArn`. `awsIam.externalId` is fixed at creation (an update keeps the stored value) and must match the `sts:ExternalId` condition in the role's trust policy. Leave access keys, or a database user and password, off a connection that authenticates as an IAM role or a service principal: the API stores them unused instead of refusing them. The connection forms offer a certificate service principal on SQL Server only; Azure Synapse and ADLS Gen2 take client-secret ones.
