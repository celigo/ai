# Connect the Celigo MCP server

The **Celigo Platform MCP server** exposes your integrator.io account (integrations, flows, connections, errors, and more) to any MCP-capable AI client.

- **Endpoint:** `https://api.integrator.io/celigo-mcp`
- **Transport:** streamable HTTP
- **Auth:** OAuth -- you sign in to Celigo in the browser on first use. **No API token required.**

If you use **Cursor** or **Claude Code**, the [Celigo plugin](../README.md#install-as-a-plugin) already configures this server for you. For any other client, add it manually with the copy-paste config below.

## Add to Cursor (one click)

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Celigo&config=eyJ1cmwiOiJodHRwczovL2FwaS5pbnRlZ3JhdG9yLmlvL2NlbGlnby1tY3AifQ==)

## Quick reference

| Client | Config location | Key | `type` field | OAuth |
|---|---|---|---|---|
| Cursor | `~/.cursor/mcp.json` (or the plugin) | `mcpServers` | none (inferred from `url`) | Native |
| Claude Code | `claude mcp add` (or the plugin) | `mcpServers` | `http` | Native |
| VS Code / Copilot | `.vscode/mcp.json` or user `mcp.json` | `servers` | `http` (required) | Native |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | none (`serverUrl`) | Native |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` | `http` | `/mcp auth Celigo` |
| Codex CLI | `~/.codex/config.toml` | `[mcp_servers.Celigo]` | none (`url`) | `codex mcp login Celigo` |
| Claude Desktop | Connectors UI, or `claude_desktop_config.json` | `mcpServers` | n/a (bridge) | Connectors UI (paid) or `mcp-remote` |

---

## Cursor

Easiest: install the [Celigo plugin](../README.md#install-as-a-plugin), or use the **Add to Cursor** button above. To configure it by hand, add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "Celigo": {
      "url": "https://api.integrator.io/celigo-mcp"
    }
  }
}
```

Cursor infers the remote transport from `url` and runs the OAuth flow automatically -- no `type` and no headers.

## Claude Code

Easiest: install the [Celigo plugin](../README.md#install-as-a-plugin). Otherwise add it via the CLI:

```bash
claude mcp add --transport http Celigo https://api.integrator.io/celigo-mcp
```

Then run `/mcp` in a session to complete the OAuth sign-in.

## VS Code / GitHub Copilot

Add to your workspace `.vscode/mcp.json` (commit it to share with the team) or your user config (Command Palette -> **MCP: Open User Configuration**). VS Code uses the `servers` key (not `mcpServers`) and **requires** `type`:

```json
{
  "servers": {
    "Celigo": {
      "type": "http",
      "url": "https://api.integrator.io/celigo-mcp"
    }
  }
}
```

VS Code 1.99+ auto-discovers the OAuth metadata (Dynamic Client Registration) and opens a browser on first use.

## Windsurf (Cascade)

Windsurf reads a single global file at `~/.codeium/windsurf/mcp_config.json` (no project-level config). The idiomatic key for a remote server is `serverUrl`:

```json
{
  "mcpServers": {
    "Celigo": {
      "serverUrl": "https://api.integrator.io/celigo-mcp"
    }
  }
}
```

Click **Refresh** in the Cascade MCP panel after saving. On Teams/Enterprise plans, an admin must enable remote (HTTP/SSE) transports.

## Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "Celigo": {
      "url": "https://api.integrator.io/celigo-mcp",
      "type": "http"
    }
  }
}
```

OAuth is **not** auto-triggered for a config-file server -- run `/mcp auth Celigo` inside the CLI to complete the browser flow. (Older Gemini builds used `httpUrl` instead of `url`; that still works but is deprecated.)

## Codex CLI

Add to `~/.codex/config.toml` (global) or a trusted project's `.codex/config.toml`. The section name uses an underscore (`mcp_servers`); a `url` with no `command` makes it a streamable-HTTP server, and `auth = "oauth"` is the default:

```toml
[mcp_servers.Celigo]
url = "https://api.integrator.io/celigo-mcp"
# auth = "oauth"  # default; then run: codex mcp login Celigo
```

Run `codex mcp login Celigo` to complete OAuth. If your Codex build predates native remote MCP, either enable the client feature at the **top** of `config.toml`:

```toml
[features]
rmcp_client = true
```

...or fall back to the `mcp-remote` bridge:

```toml
[mcp_servers.Celigo]
command = "npx"
args = ["-y", "mcp-remote", "https://api.integrator.io/celigo-mcp"]
```

## Claude Desktop

Claude Desktop's `claude_desktop_config.json` supports **local stdio servers only** -- a raw remote `url` is silently ignored. Two supported paths:

1. **Connectors UI (recommended, native):** Settings -> Connectors -> **Add custom connector** -> paste `https://api.integrator.io/celigo-mcp` -> complete OAuth. Requires a paid plan.
2. **Bridge (config file):** wrap the remote server with `mcp-remote` so Claude speaks stdio locally while the bridge handles OAuth:

```json
{
  "mcpServers": {
    "Celigo": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api.integrator.io/celigo-mcp"]
    }
  }
}
```

---

*The MCP server authenticates every request via OAuth against your integrator.io account; it holds no static API token. Never paste real API tokens or credentials into an MCP config file or a chat.*
