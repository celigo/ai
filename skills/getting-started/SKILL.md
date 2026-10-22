---
name: getting-started
description: Orientation for Celigo integrations -- core concepts, build order, account discovery, planning discipline, sandbox awareness, and which skill to use for each task. Start here when the task is unclear or the user is new to Celigo.
---

<!-- TIER:1 -->

# Getting Started with Celigo Integrations

## Core Concepts

Celigo integrations move data between external systems through a small set of resource types:

- **Connection** -- credentials and configuration that authenticate to an external system (Salesforce, NetSuite, HTTP API, database, FTP, etc.)
- **Export** -- data source step that fetches records from a connected system (or receives them via webhook)
- **Import** -- data destination step that writes records to a connected system
- **Flow** -- pipeline that connects exports to imports, with optional branching, transformation, and scripting
- **Integration** -- named container that groups related flows, connections, and resources
- **Script** -- JavaScript hook that runs at specific points in the data pipeline (preSavePage, preMap, postMap, postSubmit, postResponseMap)
- **API** -- custom HTTP endpoint that exposes integration logic for synchronous external consumption
- **Tool** -- reusable building block (input schema -> routers with lookups/imports -> output contract) callable from flows, APIs, AI agents, MCP servers, and other tools
- **AI agent** -- LLM-powered pipeline step (stored as an import) that classifies, extracts, summarizes, or generates data mid-pipeline
- **Guardrail** -- safety/compliance check (PII, moderation, AI evaluation) that flags records; the parent pipeline decides what happens to flagged records
- **Lookup cache** -- account-level key-value store for fast in-memory reference lookups (cross-reference IDs, large translation tables, dedup markers)
- **Sync** -- a Celigo Data Ingestion pipeline that replicates many tables from one source application into a data warehouse, with a historical backfill and schema-drift handling. It isn't a flow: it has no steps and lives in its own kind of integration ([building-syncs](../building-syncs/SKILL.md))
- **Topic** -- an Event Streams channel: a publisher step turns records into messages, and every listener flow receives all of them from its own position ([configuring-topics](../configuring-topics/SKILL.md))
- **Celigo Storage** -- file and folder storage built into the account, shared by flows, MCP servers, trading partners on the hosted SFTP server, and people ([managing-file-storage](../managing-file-storage/SKILL.md))

### How each surface is invoked

The three pipeline-carrying resources differ mainly in what starts them:

| Resource | Started by | Schedule/listeners | Runtime controls |
|---|---|---|---|
| **Flow** | Itself -- cron schedule, listener/webhook, or another flow chaining into it | Yes | Yes (`proceedOnFailure`, `skipRetries`, chaining, ...) |
| **API** | An external HTTP caller; the request IS the source record | No | No -- errors land on the fail response; retries are the caller's concern |
| **Tool** | A consumer -- flow step, AI agent, API, MCP server, or another tool | No | No -- the consumer decides error behavior |

"Every night at 2 AM" or "when a webhook fires" always points at a flow. "Reachable from outside Celigo over HTTP" points at an API. "Reusable from multiple places inside Celigo" points at a tool (and a recipe needed both inside and outside is a tool exposed behind an API).

## Build Order

Always build bottom-up. Resources reference each other, so dependencies must exist first:

```
1. Connection     (credentials for each system)
2. Export + Import (data source and destination steps, each referencing a connection)
3. Flow           (pipeline wiring exports to imports, inside an integration)
```

Never start by creating a flow -- its exports and imports must exist first, and those require connections. Every flow belongs to an integration: pick the one the work belongs to (or create it) and set `_integrationId` on each flow. Without it the flow lands in the account's "Standalone flows" integration, or the create fails with 422 `standalone_flows_not_supported`.

At each layer, match the connector to the target application -- raw HTTP is the fallback, not the default. Use the application-specific adaptor when one exists (NetSuite, Salesforce, databases, FTP/S3); otherwise check for a pre-built HTTP connector (550+ apps: `celigo http-connectors match <url-or-name>` finds the one for an API and what its connection form needs -- `list` is abridged, with no base URIs or auth); hand-write HTTP config only when neither covers the target. See [configuring-connections](../configuring-connections/SKILL.md#4-check-for-a-pre-built-connector-and-global-iclient) and the adaptor decision matrices in [configuring-exports](../configuring-exports/SKILL.md#adaptor-decision-matrix) / [configuring-imports](../configuring-imports/SKILL.md#adaptor-decision-matrix).

For APIs and tools, the same principle applies: build the connections, exports, and imports that the API/tool will use, then wire them into the API/tool definition.

**Undo in reverse.** Keep a list of every resource you create (type, `_id`, name) and report it when you finish. To take a build down, delete in the reverse order -- flows, then exports and imports, then scripts and connections, then iClients, and the integration last. A delete is refused (422, naming each blocker) while something still uses the resource: a connection while an export, import or flow uses it, an integration while it holds a flow. A resource deleted to the recycle bin still blocks deleting an iClient it uses and purging anything it points at, so purge in the same order.

<!-- TIER:2 -->

## First Steps

### 0. Pick your surface: CLI or MCP

There are two ways to run the operations these skills describe:

- **The Celigo CLI** (`celigo ...`).
- **The Celigo Platform MCP server** -- if your agent is connected to it, the operations are MCP tools: `list_<type>` lists a resource family or, with an `_id`, reads one document; `upsert_<type>` creates (no `_id`) or replaces a whole document (with `_id`); `patch_flow` changes whitelisted flow fields in place; and `delete_resource` deletes. `run_flow`, `cancel_flow_run`, `list_flow_runs`, `list_current_jobs`, `list_flow_errors`, `triage_flow_errors`, `list_execution_logs`, `install_template`, and `get_schema` cover running, monitoring, error handling, deploying, and schema lookups; `list_users` / `manage_user` cover users, and `search_docs` covers `celigo docs search`.

A skill with a `references/mcp.md` and `references/cli.md` describes each step by what it reads or changes and keeps the exact calls in those two files -- read the one that matches your tools. Skills without them still show `celigo` commands; on MCP, map each command onto the tools above: `list_<type>` / `upsert_<type>` replace `celigo <type> list|get|create|update`, `delete_resource` replaces `celigo <type> delete`, and `triage_flow_errors` covers `celigo flows retry-errors|resolve-errors|assign-errors|tag-errors`. Change a single flow field with `patch_flow` rather than a read and a full `upsert_flow`; no other resource has a patch tool.

A few operations are CLI-only (no MCP tool): the local account index (`celigo account snapshot|search|dependencies|lint`), stacks, on-premise agents, and the recycle bin (`celigo recycle-bin restore|purge`; the MCP server restores only Celigo Storage files and folders). For those, use the CLI, the integrator.io REST API, or the UI. API tokens are managed only in the UI -- there is no CLI command or MCP tool, and the REST endpoints refuse bearer-token callers (see [managing-api-tokens](../managing-api-tokens/SKILL.md#where-tokens-are-managed)).

Syncs ([building-syncs](../building-syncs/SKILL.md)), Event Streams topics ([configuring-topics](../configuring-topics/SKILL.md)), network policies ([managing-network-policies](../managing-network-policies/SKILL.md)), end users with their groups and roles ([managing-end-users](../managing-end-users/SKILL.md)), and Storage Query and the hosted SFTP file server ([managing-file-storage](../managing-file-storage/SKILL.md); Celigo Storage files and folders do have MCP tools) have no MCP tools either, and each of those skills' `references/mcp.md` says what the server can still do around them.

### 1. Configure the CLI

The person sets up the credential, in their own terminal -- not the agent:

```bash
celigo login                                   # Sign in through the browser (OAuth): no token to copy
celigo profile add <name>                      # Or a profile with an API token, typed at the prompt
celigo profile whoami                          # Which account and environment the profile reaches
```

Never ask for a token in chat or put one on a command line you run; a token pasted into the conversation is compromised -- ask the person to replace it ([managing-api-tokens](../managing-api-tokens/SKILL.md)). The base URL selects only the region: `https://api.integrator.io` by default, or `https://api.eu.integrator.io`, `https://api.au.integrator.io`, or `https://api.ca.integrator.io`, given when the profile is made (`celigo --base-url <url> login`, or `profile add <name> --api-base-url <url>`; a signed-in profile keeps its session's host). The credential selects the account and environment -- a sandbox has its own token at the same host -- and `celigo profile whoami` names the account and environment a profile reaches.

A profile's API token can be either kind from **Resources > API tokens**: a **personal access token** (administrators, manage, and monitor users each generate their own -- the account owner can't; inherits your own permissions; expires after 90 days by default) or an **account API token** (owner/admin-created, scopeable, long-lived -- prefer it for CI; the only kind the owner can have). See [managing-api-tokens](../managing-api-tokens/SKILL.md).

**Which account the CLI targets.** The CLI keeps one **profile** per account or environment (`celigo profile list`; each holds its own token). Every command resolves its profile as `--profile` > `CELIGO_PROFILE` > the machine-wide **active profile** that `celigo profile use <name>` selects. A person switching with `profile use` moves every session that did NOT pin a profile -- a session still passing `--profile <name>` keeps hitting `<name>`. An agent once carried a stale `--profile` for a day and wrote flows into another customer's account while the person believed their switch had moved it. Rules:

1. **Confirm the target before the first write of a session** -- run `celigo profile whoami`, and read the `celigo: profile '<name>' → <host>` line every write prints on stderr. If it names a profile other than the one the user means, stop and ask.
2. **Do not pass `--profile` unless the user asked for that specific profile in this request.** Work on the active profile. If a session must stay on one account, bind it once with `export CELIGO_PROFILE=<name>` rather than repeating the flag -- a repeated flag is how a stale value survives a switch.
3. **`(pinned with --profile; the active profile is '<other>')` on a stderr line is a stop sign** (CLI 2026.9.2 and later, printed on reads too): the person switched profiles and your pin did not follow. Ask which account they mean before the next command. Under `profile_pin_policy = strict` the CLI refuses such a command outright -- do not run `celigo profile use`, change `profile_pin_policy`, or edit `~/.celigo/config.json` to get past it; which account a machine targets is the person's decision, never the agent's. A machine-wide policy file can force `strict` too (`/etc/celigo/policy.json`, or `%ProgramData%\Celigo\policy.json` on Windows); the CLI never changes it, and neither do you.
4. **Never run `config set api_token` or `profile use` in response to an error.** `Profile 'x' does not exist` means the NAME is wrong, not the token; `celigo profile list` shows what exists -- pick from it, never guess a name.

### 2. Build the Account Index

The account index is a local snapshot of the account's resources -- the ones your credential may read. It enables fast search, dependency analysis, and linting without repeated API calls.

```bash
celigo account snapshot                        # Fetch all resources, build dependency graph
celigo account search <keyword>                # Find resources by name or keyword
celigo account dependencies <type> <id>        # Show what a resource uses and what uses it
celigo account lint                            # Find orphaned resources, offline connections, untriggered flows
celigo account stats                           # Resource counts by type
```

The index auto-refreshes when stale (default: 15 minutes, configurable via `CELIGO_INDEX_STALE_MINUTES`). Commands that depend on the index refresh it automatically unless `--no-refresh` is passed.

### 3. Discover Before Building

Before creating new resources, always check what already exists:

- `celigo account search "customer sync"` -- find existing flows, exports, imports by keyword
- `celigo account dependencies flow <id>` -- see the full resource tree for an existing flow
- `celigo account lint` -- identify orphaned exports/imports you might reuse

**No match isn't proof of absence.** A scoped token or an integration-level user sees only what it may access, and the index is complete only for that credential (`account snapshot` notes the types it couldn't read). And one list request returns a single page -- 1,000 exports or imports at most -- with HTTP 200 and no warning: `celigo <type> list` follows the pages, but `--limit` and `celigo platform get` read one, and the MCP server's `list_<type>` tools return one page with `hasMore` and `nextCursor`. Before treating a resource the user named as missing, read it by its id or read every page, say it may be outside your access, and ask before creating a replacement.

**Find the copy that runs.** Searches often return several copies of one flow: clones are named `Clone - <source name>` by default, and people add their initials, an environment prefix or `V2`. Before changing or describing "the" flow, find the one that runs -- enabled, scheduled or started by another flow's `_runNextFlowIds`, with recent runs -- and confirm it with the user.

### 4. Review an Account's Health

Asked how an account is doing, read -- change nothing until the user picks a fix:

1. **Inventory** -- `celigo account snapshot`, then `celigo account stats`.
2. **Lint** -- `celigo account lint` reports offline connections that enabled flows use, orphaned exports, imports and connections, and enabled flows with no trigger. It doesn't look for duplicates or hand-built HTTP: list the HTTP connections with no `http._httpConnectorId` and run `celigo http-connectors match <baseURI>` on each, and look for several connections to the same application and account.
3. **Errors** -- `celigo integrations errors <id>` per integration (open errors per flow), then [troubleshooting-flows](../troubleshooting-flows/SKILL.md) for the worst.
4. **Anomalies** -- judge each flow against its own history, not against other flows: `celigo jobs run-stats` (per-flow totals for the last 24 hours) beside that flow's earlier runs (`celigo jobs list --type flow --flow <id> --created-gte <iso>`), and `celigo flows run-stats <flowId>` for its run times over up to 90 days.
5. **Recent changes** -- `celigo audit list --time-gte <iso>` for the account, or `--resource-type flows --resource-id <id>` for one flow with its exports, imports and scripts.
6. **Blast radius** -- before recommending a change, `celigo account dependencies <type> <id>` lists what uses the resource.

On the MCP server, `list_integrations`, `list_flows` (`hasOpenErrors: true` lists the flows with open errors, most first), `list_connections` (`offline`), `list_flow_runs` and `list_audit_log_entries` cover steps 3-5; the account index, lint, dependencies and run statistics have no MCP tool.

## Planning Discipline

Before writing any JSON or CLI commands, answer these questions:

**What kind of operation is this?**

- **Modifying an existing resource's config** (export settings, import mappings, scripts) -- work on the resource directly with `celigo <type> set` or `celigo <type> get` + edit + `celigo <type> update`. Don't rebuild the flow
- **Modifying an existing flow's structure** (add/remove steps, change schedule) -- GET the flow, modify the structure, PUT it back
- **Building something new where every step is clear** -- the user named the systems, the records, the trigger and how duplicates are handled: build directly, bottom-up
- **Any ambiguity about what to build** -- design first (see below)

Whichever it is, on a live account follow [Working on a Live Account](#working-on-a-live-account).

**Steps before scripts.** Build the logic from steps -- exports, lookups, imports, routers, mappings, transforms, Handlebars -- and keep a script for what no step can express, in the smallest hook that does it. Before moving branching, state or a call a step could make into a script, ask the user and name the step you ruled out. "The API can't create that step" is a claim to check, not a reason: lookup-cache reads and writes, for one, are ordinary HTTP steps on a connection to Celigo's own API ([configuring-lookup-caches > flow steps](../configuring-lookup-caches/references/flow-steps.md)).

**A vague request to build something** ("get our Shopify orders into NetSuite", "sync X to Y") always starts the same way, and writes nothing:

1. **Read what exists**, before you reply: the connections (which systems are already connected, and to which accounts -- often both a production and a sandbox account), the integrations, and their flows (one may already move this data, or a related record). Don't answer with a promise to look.
2. **Reply with a plan:** the connections you'd reuse, the export, import and flow you'd create, and the open questions that decide them -- what triggers it and how often; which records (statuses, a start date); how a record that was already written is recognized, so a re-run doesn't duplicate it (the destination's external ID or upsert key); and where to test it (a sandbox account's connection, or the flow created disabled).
3. **Wait for the answers** before creating anything.

**Design checklist (when ambiguity exists):**

- What source systems? What destination systems?
- What data moves between them, in which direction?
- How often? (cron schedule, webhook trigger, on-demand)
- What happens when a step fails, and who hears about it? (`proceedOnFailure`; the platform's own notices are notification emails and long-runtime alerts -- a chat or webhook alert is a flow you build, see [troubleshooting-flows > Alerts and Notifications](../troubleshooting-flows/SKILL.md#alerts-and-notifications))
- Do downstream steps need data from upstream responses? (response mapping)
- Is this a one-off or a reusable template? (abstract/instance flow)
- Production or a sandbox? Each environment is reached with its own token or profile; the `sandbox` field doesn't choose it (see [Sandbox vs Production](#sandbox-vs-production))
- Can the same record arrive twice -- webhook retries, re-runs, overlapping flows? Then the write must be idempotent ([configuring-imports > Writing Exactly Once](../configuring-imports/SKILL.md#writing-exactly-once))

## Working on a Live Account

Every account you reach through the CLI or the API is a real one -- production flows, real credentials, systems other people depend on. Five rules:

1. **State the plan, then confirm each risky write.** Before a multi-step change, say what you'll create, change, or delete, and in which account. For a new build whose details the user left open, the whole plan waits for a yes ([Planning Discipline](#planning-discipline)). Otherwise, ask and wait for a yes before any of these:
   - deleting anything you didn't create in this conversation
   - enabling or disabling a production flow
   - changing a connection's credentials, base URI, or auth
   - running a flow, or invoking an export or import, against a live system the user didn't name
   - bulk operations -- retrying, resolving, or purging many errors; one change applied across many resources
   - anything on an Integration App (its resources carry `_connectorId`)

   Reads need no confirmation. When the CLI asks to confirm and there's no terminal, it refuses rather than guessing: put the question to the user, and add `-y` only once they've approved that exact command. Never change the CLI's mode (`celigo config set mode`, or `CELIGO_MODE`) to get past a read-mode refusal -- tell the user what it blocked.
2. **Change the live document; never rebuild it.** Start from a fresh GET, change only the fields the task needs, and write that back -- `celigo <type> set` for a few fields, or GET, edit, and `celigo <type> update` for more. Never PUT a body rebuilt from memory, a template, or an older copy: PUT replaces the whole document and drops whatever you didn't carry -- mappings, hooks, settings someone else added since.
3. **Read back after every save.** A 200 doesn't prove the change landed as meant: some fields are ignored silently on some routes (a flow's `logging` is ignored in POST and PUT bodies; only PATCH sets it), read-only fields such as a connection's `offline` are dropped, and on an Integration App's documents (`_connectorId`) a full update keeps the app's value for every field it locks. GET the resource and check the fields you changed, and that nothing else moved. `celigo <type> set` checks part of this itself: `not stored <field>` on stderr, with exit 1, means the server kept its old value -- don't repeat the same write. It can't see a field the reply simply leaves out, so read that one back yourself.
4. **Fix in place; never delete and recreate.** A recreated resource gets a new `_id`, and what pointed at the old one doesn't follow: flow steps, `_connectionId` / `_exportId` / `_importId` references, `_runNextFlowIds`, delta checkpoints, open errors and their retry data. Some deletes can't be undone: an iClient or a user is deleted for good, a sync never enters the recycle bin, and the bin doesn't serve access tokens or HTTP connectors. Most other resources stay restorable for 30 days: if one was deleted by mistake, `celigo recycle-bin restore <id> --cascade` brings it back with the same `_id`, together with what was deleted with it -- a plain restore fails with `descendants_not_restored` while any of those is still in the bin.
5. **Pick connections by connector identity, not by name.** A connection's name is free text; its connector (`http._httpConnectorId`, plus `http._httpConnectorApiId` for multi-API connectors) or its type and target says what it actually reaches. See [configuring-connections > Check for existing connections](../configuring-connections/SKILL.md#3-check-for-existing-connections).

<!-- TIER:3 -->

## Sandbox vs Production

Each environment (Production, a sandbox, Development, ...) is an isolated partition of the account with its own connections, flows, and users, reached with its own token or profile. Nothing crosses environments, so an id from another environment isn't found here (an integration's GET answers 404) -- that's scoping, not absence. Environments, account settings, licenses and usage, and the audit log are covered in [references/account-and-environments.md](references/account-and-environments.md).

The `sandbox` field is a deprecated legacy marker: honored only when a flow is created (and refused without a sandbox subscription), ignored on update, and read-only on connections. Never set it to move a resource or to mark which environment it belongs to; `celigo profile whoami` names the environment a profile reaches.

When testing, always create flows with `disabled: true` and verify before enabling.

## Which Skill to Use

| Task | Skill | Key sections |
|---|---|---|
| Set up credentials for an external system | [configuring-connections](../configuring-connections/SKILL.md) | Connection Type Decision Matrix, iClients |
| Fetch data from a system (export) | [configuring-exports](../configuring-exports/SKILL.md) | Adaptor Decision Matrix, Export Execution Pipeline |
| Write data to a system (import) | [configuring-imports](../configuring-imports/SKILL.md) | Adaptor Decision Matrix, Import Execution Pipeline |
| Wire exports to imports in a pipeline | [building-flows](../building-flows/SKILL.md) | Flow Topologies, How to Build a Flow |
| Replicate application tables into a data warehouse (Data Ingestion) | [building-syncs](../building-syncs/SKILL.md) | Sync or Flow?, How to Build a Sync |
| Build a synchronous HTTP endpoint | [building-apis](../building-apis/SKILL.md) | Builder vs Script mode, API Execution Pipeline |
| Build a reusable operation | [building-tools](../building-tools/SKILL.md) | Tool Concepts, Tool Execution Pipeline |
| Map fields between source and destination | [writing-mappings](../writing-mappings/SKILL.md) | Mapper 2.0 Workflow, Transformation 2.0 |
| Write dynamic expressions in configs | [writing-handlebars](../writing-handlebars/SKILL.md) | Helper Catalog, Expression Patterns |
| Build the form that collects a resource's settings, or read its values in steps | [writing-settings-forms](../writing-settings-forms/SKILL.md) | The Seven Scopes, How to Build a Settings Form |
| Write JavaScript hooks | [writing-scripts](../writing-scripts/SKILL.md) | Hook Point Decision Matrix |
| Set up EDI/B2B trading partner integrations | [building-b2b](../building-b2b/SKILL.md) | EDI Standards, Trading Partner Onboarding |
| Debug a failing flow | [troubleshooting-flows](../troubleshooting-flows/SKILL.md) | Error Diagnosis Framework, Diagnostic Workflow, Error Lifecycle and Retries |
| Stop duplicate records at the destination | [configuring-imports](../configuring-imports/SKILL.md) | Writing Exactly Once; [building-flows > Duplicate Records](../building-flows/SKILL.md#duplicate-records) |
| Configure filters on exports or imports | [configuring-filters](../configuring-filters/SKILL.md) | Expression Syntax, Filter Placement |
| Set up AI-powered import processing | [configuring-ai-agents](../configuring-ai-agents/SKILL.md) | Provider Decision Matrix |
| Add PII/moderation/policy checks | [configuring-guardrails](../configuring-guardrails/SKILL.md) | Type Decision Matrix, Guardrails Flag, They Don't Enforce |
| Configure lookup caches | [configuring-lookup-caches](../configuring-lookup-caches/SKILL.md) | How to Build a Lookup Cache |
| Publish events once for several flows to consume (Event Streams topics) | [configuring-topics](../configuring-topics/SKILL.md) | How to Build an Event Stream, Diagnosing a Listener That Never Runs |
| Expose tools via MCP for AI agents | [building-mcp-servers](../building-mcp-servers/SKILL.md) | How to Build an MCP Server |
| Manage account users and access | [managing-users](../managing-users/SKILL.md) | Access Strategy Decision Matrix |
| Give people or teams access to an MCP server (end users, groups, roles) | [managing-end-users](../managing-end-users/SKILL.md) | How Access Composes, How to Manage End Users |
| Organize flows/APIs in a container; clone or promote across environments | [managing-integrations](../managing-integrations/SKILL.md) | Clone Decision Matrix, ILM Reference |
| Store, find, restore, or query files in Celigo Storage; give partners SFTP access | [managing-file-storage](../managing-file-storage/SKILL.md) | Which Operation, How to Manage Stored Files |
| Install a prebuilt Template or Integration App from the Marketplace | [using-marketplace-templates](../using-marketplace-templates/SKILL.md) | Templates vs Integration Apps |
| Create inbound API tokens for scripts, pipelines, or MCP servers | [managing-api-tokens](../managing-api-tokens/SKILL.md) | Access Scope Decision Matrix |
| Restrict API tokens, MCP servers, or sign-in to known IP ranges | [managing-network-policies](../managing-network-policies/SKILL.md) | How a Policy Decides, Where a Policy Applies |
| Run extension code on your own server or AWS Lambda | [managing-stacks](../managing-stacks/SKILL.md) | Do You Need a Stack?, server vs lambda |
| Reach a private system behind your firewall | [managing-on-premise-agents](../managing-on-premise-agents/SKILL.md) | Do You Need an On-Premise Agent? |
| Restore a deleted resource; environments, account settings, licenses, the audit log; review an account's health | this skill | [Working on a Live Account](#working-on-a-live-account) rule 4, [references/account-and-environments.md](references/account-and-environments.md), [Review an Account's Health](#4-review-an-accounts-health) |

## When No Skill Covers the Shape

The reference schemas shipped with these skills cover the high-stakes shapes where guessing corrupts data, not the whole API surface. When you need a field or resource no skill documents, use the live sources — in this order:

1. **A real resource is ground truth.** `celigo <type> get <id>` returns the exact wire shape; request bodies for `create`/`update` are exactly what GET returns. Copying a live resource beats any documentation. A GET leaves out a field nobody set rather than returning `false` or `null` -- most flows have no `runPageGeneratorsInParallel`, for example. A missing field has its documented default (the schemas give it, and it isn't always off), and a flag described as "when true, ..." is off while it's absent. Don't read absence as unknown, and don't add a field to a write just to restate its default.
2. **The developer docs are agent-native and always current.** Every API reference page is fetchable as markdown — append `.md` to any page URL (e.g. `https://developer.celigo.com/api/api-reference/flows.md`), start from the index at `https://developer.celigo.com/llms.txt`, or ask a direct question: `GET https://developer.celigo.com/readme.md?ask=<question>`.
3. **Prefer a shipped schema when one exists** — schemas under each skill's `references/` are synced from the API specs and reviewed before shipping, and their `x-celigo-ai-guidance` notes carry hazards the raw docs don't.
