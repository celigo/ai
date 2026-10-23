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

See [request.yml](iclient-schemas/request.yml) for the full provider enum.

### 2. Build the iClient

Use the schema for the matching provider. All schemas are in [references/iclient-schemas/](iclient-schemas/):

| Provider | Schema | Key fields |
|---|---|---|
| Base fields (all) | [request.yml](iclient-schemas/request.yml) | `provider`, `name`, `formType` |
| Response shape | [response.yml](iclient-schemas/response.yml) | `_id`, `_userId`, timestamps |
| `custom_oauth2`, `google`, `azureoauth`, `shopify`, etc. | [oauth2.yml](iclient-schemas/oauth2.yml) | `clientId`, `clientSecret`, `scope`, `grantType`, token/refresh/revoke endpoints, PKCE |
| `netsuite` | [netsuite.yml](iclient-schemas/netsuite.yml) | `consumerKey`, `consumerSecret` |
| `salesforce` | [salesforce.yml](iclient-schemas/salesforce.yml) | `clientId`, `clientSecret`, optional `privateKey` for JWT bearer |
| `ebay`, `ebay-xml` | [ebay.yml](iclient-schemas/ebay.yml) | `appId`, `devId`, `certId` |
| `amazonmws` | [ebay.yml](iclient-schemas/ebay.yml) | `accessKeyId`, `secretKey` |
| `awsIam`, `azureserviceprincipal`, `googleserviceaccount` | [base.yml](iclient-schemas/base.yml) | `roleArn` and `externalId`; `tenantId`, `clientId`, and a `clientSecret` or `certificate`; `serviceAccountJSON` |

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

See [oauth2.yml](iclient-schemas/oauth2.yml) for the full field set.

### JWT-based auth

Some providers require a **JWT assertion** as part of the token request. Set `enableJWT: true` and populate the `jwt` block on the iClient; for Salesforce JWT bearer, supply the `privateKey` (see [salesforce.yml](iclient-schemas/salesforce.yml)). Handlebars templates reference the signed token via `{{{iClient.jwt.token}}}`. The `clientSecret` and private key are credentials -- the [Credential Discipline & Runtime Behavior](../SKILL.md#credential-discipline--runtime-behavior) rules apply: never paste them in chat.

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

Apart from a Google service account, changing an iClient's scopes, endpoints, or `validDomainNames` needs no secret from the user. A connection treats the mask the same way -- see [Credential Discipline](../SKILL.md#never-accept-or-echo-real-credentials-in-chat).

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
