# Celigo AI

One-stop shop for building integrations on the [Celigo](https://www.celigo.com) platform with AI.

[![skills.sh](https://skills.sh/b/celigo/ai)](https://skills.sh/celigo/ai)

This repo contains:

- **[Skills](#skills)** -- domain knowledge for AI coding assistants (Claude Code, Cursor, Codex, and [50+ more](https://github.com/vercel-labs/skills#compatibility))
- **[MCP Prompts & Resources](#mcp-prompts--resources)** -- content served by the Celigo MCP server (Ora)

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

## Skills

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
| [troubleshooting-flows](skills/troubleshooting-flows/) | Diagnosing failures, partial errors, stuck jobs, empty runs |
| [writing-mappings](skills/writing-mappings/) | Mapper 2.0, Transformation 2.0, lookups, response mapping |
| [writing-handlebars](skills/writing-handlebars/) | Dynamic template expressions for mappings, URIs, SQL, filters |
| [writing-scripts](skills/writing-scripts/) | JavaScript hooks -- preSavePage, preMap, postMap, postSubmit |
| [writing-sql](skills/writing-sql/) | SQL for RDBMS exports/imports across Snowflake, Postgres, MySQL, and more |

## MCP Prompts & Resources

The [`mcp/`](mcp/) directory contains prompts and resources served by the Celigo MCP server (Ora) via the MCP protocol's `prompts/list`, `prompts/get`, `resources/list`, and `resources/read` endpoints.

### Prompts

| Prompt | Description |
|---|---|
| [getting-started](mcp/prompts/getting-started.md) | Orientation for the Ora MCP server -- core concepts, build order, tool inventory |
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
| [API Reference](mcp/resources/api-reference.md) | `celigo://resources/api-reference` |
| [Connector Catalog](mcp/resources/connector-catalog.md) | `celigo://resources/connector-catalog` |
| [Error Patterns](mcp/resources/error-patterns.md) | `celigo://resources/error-patterns` |
| [Glossary](mcp/resources/glossary.md) | `celigo://resources/glossary` |
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
