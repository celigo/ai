# Connect the Celigo MCP server

The **Celigo Platform MCP server** exposes your integrator.io account (integrations, flows, connections, errors, and more) to any MCP-capable AI client.

- **Endpoint:** `https://api.integrator.io/celigo-mcp` (US -- see [Regions](#regions))
- **Transport:** streamable HTTP
- **Auth:** OAuth -- you sign in to Celigo in the browser on first use. **No API token required.**

The fastest way in is a [one-click link](#one-click-setup): Celigo is listed in Claude's connectors directory, and Cursor and VS Code install the server from a link. If you use **Claude Code**, **Codex**, or **Grok Build**, the [Celigo plugin](../README.md#install-as-a-plugin) also configures this server for you. For any other client, add it manually with the copy-paste config below.

Step-by-step guides for every client live at [developer.celigo.com/mcp/connect](https://developer.celigo.com/mcp/connect).

## Regions

integrator.io accounts live in a specific region, and each region runs its own identity provider -- the OAuth sign-in only completes against the region that hosts your account. Use your region's endpoint:

| Region | MCP endpoint |
|---|---|
| US (default) | `https://api.integrator.io/celigo-mcp` |
| EU | `https://api.eu.integrator.io/celigo-mcp` |
| AU | `https://api.au.integrator.io/celigo-mcp` |
| CA | `https://api.ca.integrator.io/celigo-mcp` |

Every config example below shows the US endpoint -- swap in your region's URL. The [Celigo plugin](../README.md#install-as-a-plugin) has a region setting instead in Claude Code, Cursor, and Grok Build; in Codex it always uses the US endpoint. Everything else (transport, OAuth flow, tools) is identical across regions.

To work in more than one region at once, add each region as its own server under a different name, such as `Celigo-EU`; each one signs in separately.

## One-click setup

<!-- GitHub strips cursor:// and vscode: hrefs from rendered Markdown, so these links must stay on the https://cursor.com/install-mcp and https://vscode.dev/redirect wrappers. -->

**Claude** -- claude.ai, Claude Desktop, and the Claude mobile apps, plus Claude Code when you sign in to it with the same claude.ai subscription. Open Celigo's listing in Claude's connectors directory and select **Connect**. The listing offers the US and EU endpoints; pick yours when Claude asks which URL to use:

[![Add to Claude](https://img.shields.io/badge/Claude-Add_connector-D97757?style=flat-square&logo=claude&logoColor=white)](https://claude.ai/directory/connectors/celigo)

**Cursor:** [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=Celigo&config=eyJ1cmwiOiJodHRwczovL2FwaS5pbnRlZ3JhdG9yLmlvL2NlbGlnby1tY3AifQ%3D%3D)

**VS Code:** [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_server-0098FF?style=flat-square)](https://vscode.dev/redirect/mcp/install?name=Celigo&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.integrator.io%2Fceligo-mcp%22%7D)

The Cursor and VS Code buttons use the US endpoint. For another region:

| Region | Claude | Cursor | VS Code |
|---|---|---|---|
| EU | [Directory listing](https://claude.ai/directory/connectors/celigo) (pick the EU URL) | [Add to Cursor](https://cursor.com/install-mcp?name=Celigo&config=eyJ1cmwiOiJodHRwczovL2FwaS5ldS5pbnRlZ3JhdG9yLmlvL2NlbGlnby1tY3AifQ%3D%3D) | [Install in VS Code](https://vscode.dev/redirect/mcp/install?name=Celigo&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.eu.integrator.io%2Fceligo-mcp%22%7D) |
| AU | [Add custom connector](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Celigo&connectorUrl=https%3A%2F%2Fapi.au.integrator.io%2Fceligo-mcp) | [Add to Cursor](https://cursor.com/install-mcp?name=Celigo&config=eyJ1cmwiOiJodHRwczovL2FwaS5hdS5pbnRlZ3JhdG9yLmlvL2NlbGlnby1tY3AifQ%3D%3D) | [Install in VS Code](https://vscode.dev/redirect/mcp/install?name=Celigo&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.au.integrator.io%2Fceligo-mcp%22%7D) |
| CA | [Add custom connector](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Celigo&connectorUrl=https%3A%2F%2Fapi.ca.integrator.io%2Fceligo-mcp) | [Add to Cursor](https://cursor.com/install-mcp?name=Celigo&config=eyJ1cmwiOiJodHRwczovL2FwaS5jYS5pbnRlZ3JhdG9yLmlvL2NlbGlnby1tY3AifQ%3D%3D) | [Install in VS Code](https://vscode.dev/redirect/mcp/install?name=Celigo&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.ca.integrator.io%2Fceligo-mcp%22%7D) |

Claude's directory listing offers the US and EU endpoints. AU and CA aren't on it yet, so their Claude links open the **Add custom connector** dialog with that region's URL filled in. Every Cursor link installs under the name `Celigo`, so picking a different region replaces the existing entry rather than adding a second one.

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
| Claude (web, Desktop, mobile) | Connectors directory, or `claude_desktop_config.json` (Desktop) | `mcpServers` | n/a (bridge) | Native, or `mcp-remote` |

---

## Cursor

Easiest: use the **Add to Cursor** button in [One-click setup](#one-click-setup). Team admins can also add this repo as a team marketplace, which installs the full [Celigo plugin](../README.md#install-as-a-plugin); for an account outside the US, set the plugin's **Celigo region** (`CELIGO_API_HOST`) under Plugins -> Configure. To configure it by hand, add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

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

Easiest: install the [Celigo plugin](../README.md#install-as-a-plugin) and choose your region when it asks (or later with `/plugin configure celigo@celigo`). Otherwise add it via the CLI:

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

Installing Celigo from VS Code's MCP server gallery (`@mcp` in the Extensions view) always sets up the US endpoint. For another region, use your region's **Install in VS Code** link in [One-click setup](#one-click-setup), or put your region's URL in the config above.

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

These are the US values. Outside the US, all three URLs change, and so does the token path. Register the OAuth client in the same region:

| Region | MCP Server URL | Authorization URL | Token URL |
|---|---|---|---|
| EU | `https://api.eu.integrator.io/celigo-mcp` | `https://eu.integrator.io/oidc/auth` | `https://eu.integrator.io/oidc/token` |
| AU | `https://api.au.integrator.io/celigo-mcp` | `https://au.integrator.io/oidc/auth` | `https://au.integrator.io/oidc/token` |
| CA | `https://api.ca.integrator.io/celigo-mcp` | `https://ca.integrator.io/oidc/auth` | `https://ca.integrator.io/oidc/token` |

Gemini Enterprise appends the standard OAuth parameters (`client_id`, `redirect_uri`, `scope`) itself -- enter the authorization URL as a base URL with no query string. Only the `StreamableHTTP` transport is supported, which is what this server speaks.

Once the data store is created, add it to the Gemini Enterprise app so its agents can call the tools.

## Codex CLI

For a US account, the easiest way is the [Celigo plugin](../README.md#install-as-a-plugin), which bundles the US endpoint. For another region, or to configure it by hand, add to `~/.codex/config.toml` (global) or a trusted project's `.codex/config.toml`. The section name uses an underscore (`mcp_servers`); a `url` with no `command` makes it a streamable-HTTP server, and `auth = "oauth"` is the default:

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

## Claude and Claude Desktop

1. **Connectors directory (recommended, native):** [open Celigo in Claude's directory](https://claude.ai/directory/connectors/celigo) and select **Connect**, then complete OAuth. One connector covers claude.ai, Claude Desktop, and the mobile apps. On Team and Enterprise plans, an Owner adds it under Organization settings -> Connectors first. The listing offers the US and EU endpoints, so pick yours when Claude asks which URL to use. For AU or CA, use the regional **Add custom connector** link in [One-click setup](#one-click-setup).
2. **Bridge (Claude Desktop config file):** `claude_desktop_config.json` supports **local stdio servers only** (a raw remote `url` is silently ignored), so wrap the remote server with `mcp-remote`. Claude speaks stdio locally while the bridge handles OAuth:

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
