# Celigo AI

Domain knowledge and tools for building integrations on the [Celigo](https://www.celigo.com) platform with AI coding assistants.

[![skills.sh](https://skills.sh/b/celigo/ai)](https://skills.sh/celigo/ai)

## Install Skills

```bash
npx skills add celigo/ai
```

This installs Celigo integration skills into your AI coding assistant ([Claude Code](https://claude.ai/claude-code), [Cursor](https://cursor.com), [Codex](https://openai.com/codex), and [50+ more](https://github.com/vercel-labs/skills#compatibility)).

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
