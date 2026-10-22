# Account and Environments

What belongs to the account as a whole: its environments, its settings, its subscription and usage, and the audit log. Reading these needs no special care; changing an environment is account administration (owner or administrator), and account settings change only in the UI.

- **CLI:** `celigo environments`, `celigo subscriptions`, `celigo audit`, and `celigo profile whoami` for where a profile points.
- **MCP:** `list_environments` (list only) and `list_audit_log_entries`. The MCP server has no tool for licenses or usage, or for creating, enabling or disabling an environment; use the CLI, the REST API, or the UI.

## Environments

An environment (Production, a sandbox, Development, ...) is an isolated partition of the account with its own users, integrations, connections and flows, under the account's one license. A token, a CLI profile or an MCP connection reaches exactly one: `celigo profile whoami` names the account and environment, and a sandbox has its own token at the same regional host.

Nothing crosses environments. From one environment, another's integration answers its GET and `dependencies` with 404 "Integration not found.", its flow listing comes back empty, and its revision reads (`integrations revisions`, `revision`, `revision-diff`, `revision-errors`) answer 400 "The integration does not belong to the current environment". So an id the user copied from another environment isn't missing: use that environment's profile or token.

```bash
celigo environments list                 # every environment of the account; needs the environments feature
celigo environments get <id>
echo '{"name":"QA"}' | celigo environments create
celigo environments enable <id>          # a new environment starts disabled
celigo environments disable <id>
```

- Accounts without the environments feature answer `feature_not_enabled` to the list (`list_environments` returns an empty list with a `_warning`).
- Environments are managed from production. A sandbox's own token can list them, but get, create, update, enable and disable answer 403 `access_restricted` ("This request can only be made through the production environment."), and so does the list for a workspace user working in a sandbox. Only the owner and administrators can list them at all.
- A new environment starts disabled; `name` is required and unique in the account.
- Production can't be disabled (400 `disable_not_allowed`), and an environment with pending user invitations can't be disabled until they're resolved.
- There's no API call that deletes an environment.
- How many environments the account may have is a license limit (`celigo subscriptions licenses`).
- Creating, enabling and disabling are account administration: the CLI needs full mode for them.

The `sandbox` field on flows and connections is a deprecated legacy marker, not an environment switch ([SKILL.md > Sandbox vs Production](../SKILL.md#sandbox-vs-production)).

## Account Settings

The account's settings are set by an owner or administrator in the UI, on the account settings pages; an API token can't read or change them (`GET /v1/accountSettings` answers 404). They include:

- **Data retention** -- how long run history, error data and EDI documents are kept: 30, 60, 90 or 180 days, at most the license's `maxAllowedDataRetention`. A change applies to data stored from then on.
- **Execution log preferences** -- whether payloads are stored, and how long execution logs are kept (7 to 180 days, at most the data retention). Detailed and debug logging on a flow need payload storage on -- and the plan first: the license's `logging` block says whether execution logging is in the plan at all (`enabled`), the highest persistent mode (`maxLogMode`; a time-boxed debug window isn't held to it), and the longest debug window (`maxDebugDuration`, minutes).
- **Invite policy, MFA policy and single sign-on** -- who may invite users, whether trusted devices are allowed, and the SSO setup. Inviting a particular person is user management ([managing-users](../../managing-users/SKILL.md)).

When a task depends on one of these, say which setting to check or change and where, and let the user do it.

## Subscription and Usage

The license says what the plan permits; usage says what's in use. "Are we over the limit?" is always a comparison of the two.

```bash
celigo subscriptions licenses                 # entitlements: flows, endpoints, environments, concurrency, data retention, add-ons such as lookup caches
celigo subscriptions entitlement-usage        # usage against those entitlements, in the environment you call from
celigo subscriptions historical-usage         # per month, newest first: allocated vs used flows, endpoints, agents, API calls, sync volume, cache units
celigo subscriptions api-usage                # this month's API calls in this environment, one row per endpoint called
celigo subscriptions api-usage-summary        # API calls per month, all environments, with each month's allowance
celigo subscriptions api-usage-environments   # this month's API calls per environment, idle ones included
celigo subscriptions usage                    # every usage source in one object; any the license lacks shows as an inline error
```

Flow, endpoint and agent allowances are counted per environment, each as a base count (`num*`) plus add-ons (`numAddOn*`); a base of 0 can still mean capacity from add-ons or a contract. An endpoint is a distinct connected application, not a connection: `endpointUsage.endpoints[]` lists each one with the connections behind it. On a license that meters flow runs, `flowUsage.numEnabled` counts the flows that ran in the billing period, and `flowUsage.flows[]` can include flows deleted since (`isDeleted`).

**API usage** counts invocations of custom APIs and of exports and imports run on their own through the API (`celigo exports invoke` and `imports invoke` count), and resets on the 1st. `api-usage` rows carry `method`, `relativeURI`, `metadata.name`, `metadata.type` (`export`, `import`, `virtualExport`, `virtualImport`, `apiBuilder`, ...) and `ioInvocationCount`. `api-usage-summary` covers the current month and the 13 before it, with `invocationCount` and `entitlements` as numeric strings. To narrow it, `celigo platform get 'v1/apis/usage/summary?from=2026/07&to=2026/09'`; a range it can't serve silently returns the default 14 months, so check the first and last `year`/`month`. `historical-usage` numbers months from 1 (the `usage` key of `subscriptions usage` numbers them from 0); only licenses that meter flow runs keep it, and elsewhere it can fail with a 500, so answer from `entitlement-usage`.

**"Are we near our plan limits?"** Read `licenses` and `entitlement-usage` from the environment in question and compare each allowance, base plus add-ons, with its use. Flow, endpoint and agent counts sit under `production` in the block the account license's `type` names (`platform`, `endpoint` or `integrator`):

| Limit | Allowance (`licenses`) | In use (`entitlement-usage`) |
|---|---|---|
| Flows, endpoints, agents | `numFlows`, `numEndpoints`, `numAgents`, each plus its `numAddOn*` | `flowUsage.numEnabled`, `endpointUsage.numConsumed`, `agentUsage.numActive` |
| Environments | `numEnvironments` in the same block | `environmentUsage.numEnabled` |
| Trading partners, EDI document types | `edi.numTradingPartners`, `edi.numDocumentTypes`, each plus its `numAddOn*` | `ediTradingPartnerUsage.numConsumed`, `ediDocumentTypeUsage.numConsumed` |
| Lookup-cache units, per month | `lookupCacheUsage.numUnits` + `numAddOnUnits` | `lookupCacheUsage.numUnits` |
| Data Ingestion rows, per month | `di.volume` + `volumeAddOn` | `syncUsage.volume` |
| API calls, per month | `api.numInvocations` + `numAddOnInvocations` | `invocationCount` in the newest `api-usage-summary` row, against its `entitlements` |
| AI agents | `aiAgentsPrepaidBalance` (credits left) | `aiAgentsActionsUsage` (actions this billing period) |

For a monthly limit, say how far into the month the count is, and read the trend in `historical-usage`.

The subscription is read-only through the API. A plan change or a higher limit is a license-upgrade request made in the UI, which a Celigo representative follows up on.

## Audit Log

The audit log is the account's append-only record of configuration changes and account events: who changed which resource, when, and the field-level changes. It keeps at least a year of history, shows secret values masked as `******`, and names each entry's user by their current name and email.

```bash
celigo audit list --time-gte 2026-10-01T00:00:00Z                          # newest first, across the account
celigo audit list --resource-type flows --resource-id <flowId>             # one flow, with its exports, imports, connections and scripts
celigo audit list --resource-type connections --action update --limit 50
celigo audit download                                                      # a CSV download URL (up to about 20,000 rows)
celigo flows audit <flowId>                                                # the same per-resource history, by group
```

Filtering by type and id together reads the resource and its descendants; `--source` and `--action` take several values. `list_audit_log_entries` takes `resourceType` (with an optional `_resourceId`), `_byUserId`, `source`, `action`, `from` / `to` and `limit` (50 by default), and returns `{ items, hasMore, paginationNote }`, newest first.

Not every write leaves an entry: some platform-side writes to a resource move its `lastModified` without one, so an unexplained `lastModified` is not proof that a person changed it.
