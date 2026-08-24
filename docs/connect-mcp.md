# Connect the Celigo MCP server

The **Celigo Platform MCP server** exposes your integrator.io account (integrations, flows, connections, errors, and more) to any MCP-capable AI client.

- **Endpoint:** `https://api.integrator.io/celigo-mcp` (US -- see [Regions](#regions))
- **Transport:** streamable HTTP
- **Auth:** OAuth -- you sign in to Celigo in the browser on first use. **No API token required.**

If you use **Cursor** or **Claude Code**, the [Celigo plugin](../README.md#install-as-a-plugin) already configures this server for you. For any other client, add it manually with the copy-paste config below.

## Regions

integrator.io accounts live in a specific region, and each region runs its own identity provider -- the OAuth sign-in only completes against the region that hosts your account. Use your region's endpoint:

| Region | MCP endpoint |
|---|---|
| US (default) | `https://api.integrator.io/celigo-mcp` |
| EU | `https://api.eu.integrator.io/celigo-mcp` |
| AU | `https://api.au.integrator.io/celigo-mcp` |
| CA | `https://api.ca.integrator.io/celigo-mcp` |

Every config example below shows the US endpoint -- swap in your region's URL. Everything else (transport, OAuth flow, tools) is identical across regions.

## Add to Cursor (one click)

**US:** [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Celigo&config=eyJ1cmwiOiJodHRwczovL2FwaS5pbnRlZ3JhdG9yLmlvL2NlbGlnby1tY3AifQ==)

**EU:** [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Celigo&config=eyJ1cmwiOiJodHRwczovL2FwaS5ldS5pbnRlZ3JhdG9yLmlvL2NlbGlnby1tY3AifQ==)

**AU:** [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Celigo&config=eyJ1cmwiOiJodHRwczovL2FwaS5hdS5pbnRlZ3JhdG9yLmlvL2NlbGlnby1tY3AifQ==)

**CA:** [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Celigo&config=eyJ1cmwiOiJodHRwczovL2FwaS5jYS5pbnRlZ3JhdG9yLmlvL2NlbGlnby1tY3AifQ==)

All four install under the name `Celigo`, so picking a different region replaces the existing entry rather than adding a second one.

## Quick reference

| Client | Config location | Key | `type` field | OAuth |
|---|---|---|---|---|
| Cursor | `~/.cursor/mcp.json` (or the plugin) | `mcpServers` | none (inferred from `url`) | Native |
| Claude Code | `claude mcp add` (or the plugin) | `mcpServers` | `http` | Native |
| VS Code / Copilot | `.vscode/mcp.json` or user `mcp.json` | `servers` | `http` (required) | Native |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | none (`serverUrl`) | Native |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` | `http` | `/mcp auth Celigo` |
| Gemini Enterprise | Google Cloud console (admin) | Custom MCP Server data store | n/a | OAuth client (manual) |
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

## Gemini Enterprise

Gemini Enterprise has no public MCP directory -- a Google Cloud admin registers the server once for the whole organization, and it then becomes available to that org's agents. This is an admin task, not a per-user one.

Unlike every other client on this page, Gemini Enterprise does **not** support Dynamic Client Registration, so you must create an OAuth client in Celigo first and paste its credentials into the console.

In the Google Cloud console, go to your Gemini Enterprise app -> **Data Stores** -> **Add data source**, search for **Custom MCP Server**, and click **Add MCP server**:

| Field | Value |
|---|---|
| MCP Server URL | `https://api.integrator.io/celigo-mcp` |
| Authorization URL | `https://integrator.io/oidc/auth` |
| Token URL | `https://integrator.io/oidc/global/token` |
| Scopes | `mcp:read mcp:write` |
| Client ID / Client Secret | From the OAuth client you registered in Celigo |

Gemini Enterprise appends the standard OAuth parameters (`client_id`, `redirect_uri`, `scope`) itself -- enter the authorization URL as a base URL with no query string. Only the `StreamableHTTP` transport is supported, which is what this server speaks.

Once the data store is created, add it to the Gemini Enterprise app so its agents can call the tools.

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
