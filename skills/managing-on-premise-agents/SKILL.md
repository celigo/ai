---
name: managing-on-premise-agents
description: Manage Celigo on-premise agents -- lightweight software you install on a host inside your own network that opens a secure OUTBOUND tunnel to integrator.io, letting the platform reach private systems (on-prem databases, file shares, internal apps) without opening inbound firewall ports. An on-premise agent is a connectivity resource on the `/agents` page -- not a stack (compute) and not an AI agent (LLM processing). Use when connecting to a system behind a firewall, installing or pairing an agent, rotating its access token, or diagnosing agent-offline flow failures.
---

<!-- TIER:1 -->

# Managing On-Premise Agents

An on-premise agent is a **secure tunnel between your own network and integrator.io**. You install a small piece of Celigo software on a Windows or Linux host *inside* your network; it dials **outbound** to integrator.io and holds the connection open so the platform can send work back through it. Because the agent reaches out to Celigo, you open **no inbound** firewall ports for it; a network that restricts outbound traffic only has to let the agent host reach Celigo (see Gotcha 2).

There are two things sharing the name -- keep them apart:

- **The installed software** -- the agent daemon running on a host inside your network. It maintains the tunnel and does the reaching.
- **The `/agents` resource** -- the *registration* of that daemon in integrator.io: a `name`, `description`, and pairing/health metadata. This is what you manage via the API and CLI.

Concerns when managing an on-premise agent:

- **Reachability** -- giving Celigo a path to systems that have no public endpoint (private DBs, file shares, internal apps)
- **Pairing** -- installing the software and configuring it with the agent's access token to bring the tunnel up
- **Health** -- heartbeats determine `offline`; a stopped host or service breaks every connection routed through the agent
- **Token lifecycle** -- rotating the sensitive access token (which authorizes a tunnel into your network) on exposure or on schedule

Referenced by connections via `_agentId`.

The agent resource is read and managed with the CLI, the REST API (`/v1/agents`) or the UI; no MCP tool reads it, and its id isn't an AI agent's, so don't look it up among AI agents. Over MCP, the connections that carry its `_agentId`, their `offline` flag, and the `agent_not_running` errors on their flows say what you need to know.

## On-Premise Agent vs Stack vs AI Agent

The word "agent" is overloaded in Celigo. An on-premise agent is **none** of the others:

| Term | What it is | About |
|---|---|---|
| **On-premise agent** (`/agents`) | Network tunnel daemon installed inside your network | **Connectivity** -- reach private systems behind your firewall |
| **Stack** | Runs your extension code (hooks/wrappers) on your own server or AWS Lambda | **Compute** -- run your custom code |
| **AI agent** (`/aiagents`) | LLM processor that classifies or transforms records inside a flow | **AI processing** of records |

Smell test: if it is about *reaching a system on a private network*, it is an on-premise agent. If it is about *running your custom code*, that is a stack. If it is about *an LLM doing work on records*, that is an AI agent. A single flow can use both an agent (to reach a private database) and a stack (to run a custom hook). When a request just says "the agent," confirm which one is meant before acting.

## Quick Reference

### Do You Need an On-Premise Agent?

The deciding question: **is the system reachable from the public internet, or only from inside your network?**

| Target system | Public endpoint? | Agent needed? |
|---|---|---|
| Public SaaS API (Salesforce, Shopify, Stripe, public REST) | Yes | No -- Celigo's cloud connects directly |
| Cloud database with a public endpoint | Yes | No |
| On-prem / private database (SQL Server, MySQL, Postgres, MongoDB) with no public listener | No | Yes |
| Oracle database | -- | Yes -- Oracle runs in agent mode only |
| Local host directory or mounted network file share | No | Yes |
| Internal-only application -- an HTTP/REST or SOAP API on the private network, or a JDBC-accessible system | No | Yes |

### Minimum Required Fields

Creating an agent resource needs at minimum: `name`.

Optional but common: `description`.

### Connections That Route Through an Agent

A connection that needs private-network or filesystem access sets `_agentId` on the connection object. The agent supplies reachability; the connection supplies the target system's credentials and config.

| Connection | `_agentId` | Notes |
|---|---|---|
| `filesystem` | Required | Local/network file access always needs an agent |
| `jdbc` (`agent` / `activedirectory`) | Required | POST fails 422 without it; other JDBC types commonly run on an agent too |
| `rdbms` -- Oracle | Required | Oracle is agent-mode only; even a placeholder connection needs a real `_agentId` |
| `rdbms` -- SQL Server, MySQL, PostgreSQL on a private network | Set for an on-premise instance | The connection's on-premise mode. SQL Server through an agent uses database-user (`basic`) auth only, and a create still needs `password` (422 `Expected field: password to be present.` without it) |
| `mongodb` -- on-premise instance | Required for a private instance | Cloud-reachable instances (including Atlas) need no agent |
| `http` -- an API reachable only inside the network | Set for an on-premise endpoint | The connection's on-premise mode: `baseURI` is the address as the agent host sees it (an internal hostname, or `localhost` on the agent host itself). With OAuth, the agent performs the token exchange locally, so the authorization server can be private too |

The schemas' `_agentId` description lists only the types where an agent is **required**. Celigo documents agent support for SQL databases, MongoDB, DynamoDB, and HTTP connections, in addition to filesystem and JDBC.

Wiring `_agentId` onto a connection is a connection-configuration task -- see [configuring-connections](../configuring-connections/SKILL.md#how-to-build-a-connection).

### Health & Metadata Fields

These are server-managed (read-only) on the response -- you do not set them:

| Field | Meaning |
|---|---|
| `lastHeartbeatAt` | Timestamp of the last heartbeat received from the installed agent |
| `offline` | Derived from heartbeats -- `true` when heartbeats stop (host down, service stopped, network blip) |
| `version` | Agent software version reported by the host |

The pairing **access token** is not on the resource at all -- create, get, and update never return it. Read it with `celigo on-premise-agents token <id>` (`GET /v1/agents/{id}/display-token`).

## Related Skills

- [configuring-connections > How to Build a Connection](../configuring-connections/SKILL.md#how-to-build-a-connection) -- setting `_agentId` on filesystem, JDBC, database, MongoDB, and HTTP connections that reach a private network
- [managing-stacks](../managing-stacks/SKILL.md) -- the compute counterpart; use a stack to run custom code, an agent to reach private systems
- [configuring-ai-agents](../configuring-ai-agents/SKILL.md) -- the *AI* agent (LLM processor), a different resource despite the shared name
- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- diagnosing flow failures caused by an offline agent
- [getting-started > Which Skill to Use](../getting-started/SKILL.md#which-skill-to-use) -- orientation across resource types

<!-- TIER:2 -->

## How to Set Up an On-Premise Agent

### 1. Confirm you actually need one

Only when the target system is not reachable from the public internet (see [Do You Need an On-Premise Agent?](#do-you-need-an-on-premise-agent)). Public SaaS APIs and cloud databases with public endpoints need no agent.

### 2. Check for an existing agent

A single agent can back many connections -- every flow that reaches systems on that network can route through it. Reuse before creating:

```bash
# List all on-premise agents
celigo on-premise-agents list

# Search the account
celigo account search "agent"
celigo account search "<network location or data center name>"
```

### 3. Create the agent resource

Create the registration first. The response is the agent record **without** its access token -- read the token separately when you're ready to pair.

```bash
# Create a new agent registration
echo '{"name":"On-Prem DC1 - Oracle & File Share","description":"Tunnel for the datacenter-1 private network"}' | celigo on-premise-agents create
```

### 4. Install the agent software on a host inside the network

Download and install the Celigo agent software on a Windows or Linux host that can reach the private systems. The installer download is a short-lived (about 15 minutes) pre-signed URL:

```bash
celigo on-premise-agents installer-url <id> --os linux     # or --os windows
```

Running the installer happens **on the host** -- the CLI only fetches the download link.

### 5. Pair the installed agent with the access token

Configure the installed agent with the agent's access token. This pairs the daemon to the `/agents` resource and brings the outbound tunnel up. Heartbeats begin flowing once it connects.

```bash
celigo on-premise-agents token <id>     # prints the access token
```

The command prints the secret, so have the user run it on the host (or read the token in the UI) and enter it straight into the agent's configuration -- don't run it where the value lands in a chat transcript.

### 6. Verify the agent is online

```bash
# Confirm the resource shows heartbeats and is not offline
celigo on-premise-agents get <id>
```

Check that `offline` is `false` and `lastHeartbeatAt` is recent. `version` confirms what is running on the host.

### 7. Reference the agent from connections

On each connection that needs private-network access, set `_agentId` to this agent's `_id`. This applies to `filesystem`, `jdbc` agent/activedirectory, and Oracle `rdbms` connections (required), and to any private SQL Server, MySQL, PostgreSQL, MongoDB, or HTTP endpoint (see [Connections That Route Through an Agent](#connections-that-route-through-an-agent)). See [configuring-connections](../configuring-connections/SKILL.md#how-to-build-a-connection). For Oracle, install and pair the agent **before** creating the connection -- Oracle rejects even a placeholder connection without a real `_agentId`.

`_agentId` is a top-level field of the connection, beside `type`; the host in the connection's own block is the address as the agent host sees it. Routing through an agent doesn't waive the database credentials: a SQL Server create without `password` is refused with 422. When the user will enter the password themselves, create the connection with a placeholder and tell them to replace it in the connection's settings in the Celigo UI -- the connection stays offline until they do. Never ask for the password in chat.

## Rotating the Access Token

Rotate when the token may be exposed or on a security schedule. Rotation **regenerates the access token and invalidates the previous one immediately**, so the installed agent disconnects and reconnects only after it is reconfigured with the new token -- expect a brief outage for every connection routed through it.

```bash
celigo on-premise-agents rotate-token <id>     # PUT /v1/agents/{id}/change-token; prints the new token
```

The rotation itself is an API call; applying the new token happens **on the host**. Like `token`, the command prints the secret -- have the user run it where the value goes straight into the host's configuration, during a quiet window.

## Running More Than One Agent

Default to **one agent per network location**. Reasons to run more are about topology and resilience, not raw volume:

- **Segmentation** -- an agent in each network segment or data center it must reach.
- **Availability** -- a second agent so one host going down does not take all private-system connectivity with it.

## CLI Commands

```bash
# CRUD
celigo on-premise-agents list
celigo on-premise-agents get <id>
celigo on-premise-agents create < agent.json
celigo on-premise-agents update <id> < agent.json
celigo on-premise-agents delete <id> [-y]
celigo on-premise-agents dependencies <id>       # connections that use it -- empty means safe to delete

# Token and installer
celigo on-premise-agents token <id>              # prints the access token (never on get/create) -- keep it out of chat
celigo on-premise-agents rotate-token <id>       # prints a new token; the old one stops working immediately
celigo on-premise-agents installer-url <id> --os <linux|windows>

# Discovery
celigo account search "<keyword>"
```

Note: only `name` and `description` are writable. Installing the software and applying a token happen on the host.

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or wiring up an on-premise agent, verify:

- [ ] The target is genuinely private -- a public SaaS API or public cloud database needs no agent
- [ ] `name` identifies the network location it serves (e.g. "On-Prem DC1"), not a single flow or operation
- [ ] The access token (`celigo on-premise-agents token <id>`) was applied to the installed software
- [ ] `celigo on-premise-agents get <id>` shows `offline: false` with a recent `lastHeartbeatAt` before relying on it
- [ ] For Oracle: the agent is installed and paired **before** the connection is created
- [ ] Dependent connections set `_agentId` to this agent's `_id` (see [Connections That Route Through an Agent](#connections-that-route-through-an-agent))

## Gotchas

1. **"Agent" is overloaded.** An on-premise agent (`/agents`, connectivity) is not a stack (compute) and not an AI agent (`/aiagents`, LLM processing). Confirm which one is meant before acting.
2. **The tunnel is outbound-only.** The agent dials out to integrator.io, so no inbound firewall port opens for it -- not the database's port either. A network that restricts outbound traffic must let the agent host connect out over HTTPS (443) and SSH (22) to Celigo's published addresses for its region: the integrator.io addresses for HTTPS and the agent-extension server addresses for SSH, listed in Celigo's on-premise agent documentation.
3. **The resource is not the software.** Creating the `/agents` resource only registers it and mints a token -- which the create response doesn't include (`celigo on-premise-agents token <id>` reads it). Nothing connects until you install the software on a host and pair it with that token.
4. **Agent offline breaks dependent flows -- fix the agent, not the flow.** When a flow to a private system fails (`agent_not_running`) and credentials look fine, check whether the agent is `offline` (host down, service stopped, network blip). Bringing the agent back online recovers every connection routed through it; rotating its token or recreating the connections doesn't.
5. **Rotating the token forces a re-pair.** `rotate-token` invalidates the old token immediately; the installed agent must be reconfigured with the new one and reconnects only after re-pairing. Rotate during a quiet window.
6. **The access token is a credential.** It authorizes a tunnel into your network. Do not commit or share it; rotate it if it may have been exposed.
7. **Oracle is agent-mode only.** Oracle `rdbms` connections always require a real `_agentId` -- you cannot create even a placeholder Oracle connection without an installed agent first.
8. **One agent can serve many connections.** Add more agents for network segmentation or availability, not just for throughput.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| Agent shows `offline: true` | Heartbeats stopped -- host down, service stopped, or network interruption | Restart the agent software on the host; confirm outbound connectivity to integrator.io, then re-check `lastHeartbeatAt` |
| Flows to a private system suddenly fail; credentials fine | The shared agent is offline | Check `celigo on-premise-agents get <id>`; bring the agent back online rather than editing each connection |
| `agent_not_running` -- "Unable to connect to Agent with id: <id>, make sure you installed it properly and it is running." -- on a connection test or a flow's errors; the agent's connections go `offline: true` | The agent isn't connected: its host or service stopped, or a firewall or proxy blocks its outbound connection. The agent shows `offline: true`, and `lastHeartbeatAt` says when it stopped | Restart the agent on its host and check its outbound access (Gotcha 2); every connection through it recovers once it reconnects. Don't rotate the agent's token -- that also cuts off the agent until it's re-paired -- and don't recreate the connections, which would route through the same agent |
| `422` "Expected field: password to be present." creating a SQL Server connection through an agent | The agent doesn't replace the database credentials | Send a placeholder password and have the user enter the real one in the Celigo UI |
| Installed agent will not connect after rotation | Old, invalidated token still configured on the host | Reconfigure the agent with the new token (`celigo on-premise-agents token <id>`) and let it re-pair |
| `422` creating an Oracle / JDBC / filesystem connection -- `_agentId` missing | The connection type requires an agent but none is referenced | Install and pair an agent, then set `_agentId` on the connection |
| Connection routed through agent times out (`ETIMEDOUT`) | Agent host cannot reach the target system on the private network | Verify the host can reach the target's host/port; check internal firewall/routing between the agent host and the system |
| `404` on agent get/update | Wrong agent ID or the agent was deleted | Verify the ID with `celigo on-premise-agents list` |
