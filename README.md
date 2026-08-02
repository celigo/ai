# Celigo AI

One-stop shop for building integrations on the [Celigo](https://www.celigo.com) platform with AI.

[![skills.sh](https://skills.sh/b/celigo/ai)](https://skills.sh/celigo/ai)

This repo contains:

- **[Skills](#skills)** -- domain knowledge for AI coding assistants (Claude Code, Cursor, Codex, and [50+ more](https://github.com/vercel-labs/skills#compatibility))
- **[MCP Prompts & Resources](#mcp-prompts--resources)** -- content served by the Celigo MCP server

## Install Skills

```bash
npx skills add celigo/ai
```

### Install specific skills

```bash
# List available skills
npx skills add celigo/ai --list

# Install one skill
npx skills add celigo/ai --skill getting-started

# Install to a specific agent
npx skills add celigo/ai --skill configuring-exports -a claude-code
```

## Install as a Plugin

This repo is also a native plugin marketplace for Claude Code and Cursor, bundling all of the skills below plus the Celigo Platform MCP server.

**[Claude Code](https://code.claude.com)** -- in the app, or with the `claude` CLI:

```
/plugin marketplace add celigo/ai
/plugin install celigo@celigo
```

**[Cursor](https://cursor.com)** -- install **Celigo** from the Cursor plugin marketplace (Settings -> Plugins). Team admins can add this repo directly under Team Marketplaces.

**[Codex](https://developers.openai.com/codex)** -- run `codex plugin marketplace add celigo/ai`, then install **celigo** from the Plugins Directory in the ChatGPT desktop app.

For [50+ other agents](https://github.com/vercel-labs/skills#compatibility), use the [skills install](#install-skills) above.

Installing the plugin also configures the **Celigo Platform MCP server** (`https://api.integrator.io/celigo-mcp`). It authenticates via OAuth -- the first time an agent uses it, you'll be prompted to sign in to Celigo, so no API token is required.

The plugin ships the **US** endpoint. Each region runs its own identity provider, so if your account lives in the **EU**, the sign-in won't complete against it -- configure `https://api.eu.integrator.io/celigo-mcp` by hand instead. See [Regions](docs/connect-mcp.md#regions).

Using a different client -- VS Code, Windsurf, Gemini CLI, Codex CLI, or Claude Desktop? See **[Connect the Celigo MCP server](docs/connect-mcp.md)** for copy-paste config and a one-click *Add to Cursor* button.

## Skills

Skill how-tos show `celigo` CLI commands, but most operations map directly to the bundled Celigo Platform MCP server's tools (`list_*` / `upsert_*` / `delete_resource` / `run_flow` / `deploy_template`), so agents connected over MCP follow the same skills and translate the command blocks. A few admin surfaces (the local account index, API tokens, stacks, on-premise agents, users) remain CLI/REST/UI-only.

| Skill | Description |
|---|---|
| [getting-started](skills/getting-started/) | Core concepts, build order, account discovery, and which skill to use |
| [configuring-connections](skills/configuring-connections/) | Credentials, auth methods, OAuth, iClients |
| [configuring-exports](skills/configuring-exports/) | Data source steps -- REST, SOAP, database, file, webhook, delta sync |
| [configuring-imports](skills/configuring-imports/) | Data destination steps -- mappings, lookups, upsert logic |
| [building-flows](skills/building-flows/) | Pipelines wiring exports to imports -- scheduling, chaining, error management |
| [building-apis](skills/building-apis/) | Custom HTTP endpoints for synchronous external access |
| [building-tools](skills/building-tools/) | Reusable operations callable from flows, APIs, agents, and MCP servers |
| [building-mcp-servers](skills/building-mcp-servers/) | MCP endpoints exposing tools to external AI agents |
| [building-b2b](skills/building-b2b/) | EDI integrations -- trading partners, X12/EDIFACT, file definitions |
| [configuring-ai-agents](skills/configuring-ai-agents/) | LLM-powered import steps (OpenAI, Gemini) and guardrails |
| [configuring-filters](skills/configuring-filters/) | Expression and script filters on exports, imports, and branches |
| [configuring-guardrails](skills/configuring-guardrails/) | PII detection, content moderation, AI-based validation |
| [configuring-lookup-caches](skills/configuring-lookup-caches/) | In-memory key-value stores for fast lookups and dedup |
| [managing-users](skills/managing-users/) | User invitations, permissions, MFA/SSO, access levels |
| [managing-integrations](skills/managing-integrations/) | Integration containers, cloning, and lifecycle management (ILM) across environments |
| [managing-api-tokens](skills/managing-api-tokens/) | Inbound API tokens -- scoping, rotation, revoke/delete lifecycle |
| [managing-stacks](skills/managing-stacks/) | Bring-your-own compute for hooks and connector wrappers (server or AWS Lambda) |
| [managing-on-premise-agents](skills/managing-on-premise-agents/) | Secure connectivity to private systems behind a firewall |
| [using-marketplace-templates](skills/using-marketplace-templates/) | Install Templates and Integration Apps; copy prebuilt flows |
| [troubleshooting-flows](skills/troubleshooting-flows/) | Diagnosing failures, partial errors, stuck jobs, empty runs |
| [writing-mappings](skills/writing-mappings/) | Mapper 2.0, Transformation 2.0, lookups, response mapping |
| [writing-handlebars](skills/writing-handlebars/) | Dynamic template expressions for mappings, URIs, SQL, filters |
| [writing-scripts](skills/writing-scripts/) | JavaScript hooks -- preSavePage, preMap, postMap, postSubmit |
| [writing-sql](skills/writing-sql/) | SQL for RDBMS exports/imports across Snowflake, Postgres, MySQL, and more |

## Slash Commands

The plugin bundles slash commands for Cursor and Claude Code -- skills-backed authoring helpers that work without a connected account:

| Command | Description |
|---|---|
| `/celigo-plan-integration` | Plan a new integration from requirements (design + build order) |
| `/celigo-handlebars` | Author or debug a Handlebars expression |
| `/celigo-sql` | Write SQL for an RDBMS export/import |
| `/celigo-mapping` | Build a field mapping (Mapper 2.0) |
| `/celigo-review-config` | Review a pasted resource config against best practices |

## MCP Prompts & Resources

The [`mcp/`](mcp/) directory contains prompts and resources served by the Celigo MCP server via the MCP protocol's `prompts/list`, `prompts/get`, `resources/list`, and `resources/read` endpoints.

### Prompts

| Prompt | Description |
|---|---|
| [getting-started](mcp/prompts/getting-started.md) | Orientation for the Celigo MCP server -- core concepts, build order, tool inventory |
| [plan-new-integration](mcp/prompts/plan-new-integration.md) | Plan a new integration from requirements |
| [review-flow-config](mcp/prompts/review-flow-config.md) | Review an existing flow configuration |
| [troubleshoot-flow](mcp/prompts/troubleshoot-flow.md) | Diagnose a failing or misbehaving flow |
| [diagnose-connection](mcp/prompts/diagnose-connection.md) | Troubleshoot connection issues |
| [audit-account-health](mcp/prompts/audit-account-health.md) | Audit account health and find issues |
| [writing-handlebars](mcp/prompts/writing-handlebars.md) | Write Handlebars template expressions |
| [writing-sql](mcp/prompts/writing-sql.md) | Write SQL for RDBMS exports and imports |

### Resources

| Resource | URI |
|---|---|
| [Account Architecture Model](mcp/resources/account-architecture.md) | `celigo://resources/account-architecture` |
| [Account Settings Reference](mcp/resources/account-settings.md) | `celigo://resources/account-settings` |
| [API Reference](mcp/resources/api-reference.md) | `celigo://resources/api-reference` |
| [Connector Catalog](mcp/resources/connector-catalog.md) | `celigo://resources/connector-catalog` |
| [Error Patterns](mcp/resources/error-patterns.md) | `celigo://resources/error-patterns` |
| [Glossary](mcp/resources/glossary.md) | `celigo://resources/glossary` |
| [Handlebars Helper Catalog](mcp/resources/handlebars-helpers.md) | `celigo://resources/handlebars-helpers` |
| [Recycle Bin Reference](mcp/resources/recycle-bin.md) | `celigo://resources/recycle-bin` |
| [Tool Usage Guide](mcp/resources/tool-usage-guide.md) | `celigo://resources/tool-usage-guide` |

### Adding MCP content

See the [MCP README](mcp/README.md) for the frontmatter schema and how the Celigo MCP server consumes these files.

## Celigo CLI

The skills reference the [Celigo CLI](https://www.npmjs.com/package/celigo-cli) for examples. Install it with:

```bash
npm install -g celigo-cli
```

API and UI alternatives are noted where applicable.

## Links

- [Celigo Documentation](https://docs.celigo.com)
- [Celigo Developer Guide](https://developer.celigo.com)
- [Agent Skills Specification](https://agentskills.io)
- [Skills Directory](https://skills.sh)

## License

[MIT](LICENSE)
