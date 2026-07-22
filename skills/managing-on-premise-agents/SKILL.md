---
name: managing-on-premise-agents
description: Manage Celigo on-premise agents -- lightweight software you install on a host inside your own network that opens a secure OUTBOUND tunnel to integrator.io, letting the platform reach private systems (on-prem databases, file shares, internal apps) without opening inbound firewall ports. An on-premise agent is a connectivity resource on the `/agents` page -- not a stack (compute) and not an AI agent (LLM processing). Use when connecting to a system behind a firewall, installing or pairing an agent, rotating its access token, or diagnosing agent-offline flow failures.
---

<!-- TIER:1 -->

# Managing On-Premise Agents

An on-premise agent is a **secure tunnel between your own network and integrator.io**. You install a small piece of Celigo software on a Windows or Linux host *inside* your network; it dials **outbound** to integrator.io and holds the connection open so the platform can send work back through it. Because the agent reaches out to Celigo, you do **not** open inbound firewall ports or whitelist Celigo IP addresses to let the cloud reach private systems behind your firewall.

There are two things sharing the name -- keep them apart:

- **The installed software** -- the agent daemon running on a host inside your network. It maintains the tunnel and does the reaching.
- **The `/agents` resource** -- the *registration* of that daemon in integrator.io: a `name`, `description`, and pairing/health metadata. This is what you manage via the API and CLI.

Concerns when managing an on-premise agent:

- **Reachability** -- giving Celigo a path to systems that have no public endpoint (private DBs, file shares, internal apps)
- **Pairing** -- installing the software and configuring it with the agent's `accessToken` to bring the tunnel up
- **Health** -- heartbeats determine `offline`; a stopped host or service breaks every connection routed through the agent
- **Token lifecycle** -- rotating the sensitive `accessToken` (which authorizes a tunnel into your network) on exposure or on schedule

Referenced by connections via `_agentId`.

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
| On-prem / private database (SQL Server, Postgres) with no public listener | No | Yes |
| Oracle database | -- | Yes -- Oracle runs in agent mode only |
| Local host directory or mounted network file share | No | Yes |
| Internal-only application (including JDBC-accessible systems) | No | Yes |

### Minimum Required Fields

Creating an agent resource needs at minimum: `name`.

Optional but common: `description`.

### Connections That Route Through an Agent

A connection that needs private-network or filesystem access sets `_agentId` on the connection object. The agent supplies reachability; the connection supplies the target system's credentials and config.

| Connection | `_agentId` | Notes |
|---|---|---|
| `filesystem` | Required | Local/network file access always needs an agent |
| `jdbc` (`agent` / `activedirectory`) | Required | POST fails 422 without it |
| `rdbms` -- Oracle | Required | Oracle is agent-mode only; even a placeholder connection needs a real `_agentId` |
| `mongodb` -- on-premise instance | Required | Set `_agentId` for a private (non-cloud) instance |

Wiring `_agentId` onto a connection is a connection-configuration task -- see [configuring-connections](../configuring-connections/SKILL.md#how-to-build-a-connection).

### Health & Metadata Fields

These are server-managed (read-only) on the response -- you do not set them:

| Field | Meaning |
|---|---|
| `accessToken` | Sensitive pairing token generated on create; reconfigure the installed agent when it changes |
| `lastHeartbeatAt` | Timestamp of the last heartbeat received from the installed agent |
| `offline` | Derived from heartbeats -- `true` when heartbeats stop (host down, service stopped, network blip) |
| `version` | Agent software version reported by the host |
| `clientDetails` | Runtime/host details reported by the installed agent |

## Related Skills

- [configuring-connections > How to Build a Connection](../configuring-connections/SKILL.md#how-to-build-a-connection) -- setting `_agentId` on filesystem, JDBC, Oracle, and on-prem MongoDB connections
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
celigo agents list

# Search the account
celigo account search "agent"
celigo account search "<network location or data center name>"
```

### 3. Create the agent resource

Create the registration first. The response includes a sensitive `accessToken` used to pair the installed software -- capture it now.

```bash
# Create a new agent registration
echo '{"name":"On-Prem DC1 - Oracle & File Share","description":"Tunnel for the datacenter-1 private network"}' | celigo agents create
```

### 4. Install the agent software on a host inside the network

Download and install the Celigo agent software on a Windows or Linux host that can reach the private systems. This step happens **on the host and through the integrator.io UI** (which provides the installer download) -- not via the CLI.

### 5. Pair the installed agent with the access token

Configure the installed agent with the `accessToken` from step 3. This pairs the daemon to the `/agents` resource and brings the outbound tunnel up. Heartbeats begin flowing once it connects.

### 6. Verify the agent is online

```bash
# Confirm the resource shows heartbeats and is not offline
celigo agents get <id>
```

Check that `offline` is `false` and `lastHeartbeatAt` is recent. `version` and `clientDetails` confirm what is running on the host.

### 7. Reference the agent from connections

On each connection that needs private-network access, set `_agentId` to this agent's `_id`. This applies to `filesystem` (required), `jdbc` agent/activedirectory, Oracle `rdbms`, and on-premise `mongodb` connections. See [configuring-connections](../configuring-connections/SKILL.md#how-to-build-a-connection). For Oracle, install and pair the agent **before** creating the connection -- Oracle rejects even a placeholder connection without a real `_agentId`.

## Rotating the Access Token

Rotate when the token may be exposed or on a security schedule. Rotation **regenerates the `accessToken` and invalidates the previous one**, so the installed agent must be reconfigured with the new token and will reconnect only after re-pairing -- expect a brief disconnect.

Rotation and installer download are **platform actions** (integrator.io UI / API), not CLI CRUD operations. Plan a rotation for a quiet window and have access to the host so the new token can be applied promptly. Treat the token like any credential.

## Running More Than One Agent

Default to **one agent per network location**. Reasons to run more are about topology and resilience, not raw volume:

- **Segmentation** -- an agent in each network segment or data center it must reach.
- **Availability** -- a second agent so one host going down does not take all private-system connectivity with it.

## CLI Commands

```bash
# CRUD
celigo agents list
celigo agents get <id>
celigo agents create < agent.json
celigo agents update <id> < agent.json
celigo agents delete <id> [-y]

# Discovery
celigo account search "<keyword>"
```

Note: only `name` and `description` are writable. Installing/pairing the agent software and rotating the `accessToken` are done through the integrator.io UI on the host, not the CLI.

<!-- TIER:3 -->

## Pre-Submit Checklist

Before creating or wiring up an on-premise agent, verify:

- [ ] The target is genuinely private -- a public SaaS API or public cloud database needs no agent
- [ ] `name` identifies the network location it serves (e.g. "On-Prem DC1"), not a single flow or operation
- [ ] The `accessToken` from create was captured and applied to the installed software
- [ ] `celigo agents get <id>` shows `offline: false` with a recent `lastHeartbeatAt` before relying on it
- [ ] For Oracle: the agent is installed and paired **before** the connection is created
- [ ] Dependent connections set `_agentId` to this agent's `_id` (`filesystem`, JDBC agent/activedirectory, Oracle `rdbms`, on-prem `mongodb`)

## Gotchas

1. **"Agent" is overloaded.** An on-premise agent (`/agents`, connectivity) is not a stack (compute) and not an AI agent (`/aiagents`, LLM processing). Confirm which one is meant before acting.
2. **The tunnel is outbound-only.** The agent dials out to integrator.io; you never open inbound firewall ports or whitelist Celigo IPs to reach private systems.
3. **The resource is not the software.** Creating the `/agents` resource only registers it and mints a token. Nothing connects until you install the software on a host and pair it with the `accessToken`.
4. **Agent offline breaks dependent flows -- fix the agent, not the flow.** When a flow to a private system fails and credentials look fine, check whether the agent is `offline` (host down, service stopped, network blip). Bringing the agent back online recovers every connection routed through it.
5. **Rotating the token forces a re-pair.** Rotation invalidates the old token; the installed agent must be reconfigured with the new one and reconnects only after re-pairing. Rotate during a quiet window.
6. **The `accessToken` is a credential.** It authorizes a tunnel into your network. Do not commit or share it; rotate it if it may have been exposed.
7. **Oracle is agent-mode only.** Oracle `rdbms` connections always require a real `_agentId` -- you cannot create even a placeholder Oracle connection without an installed agent first.
8. **One agent can serve many connections.** Add more agents for network segmentation or availability, not just for throughput.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| Agent shows `offline: true` | Heartbeats stopped -- host down, service stopped, or network interruption | Restart the agent software on the host; confirm outbound connectivity to integrator.io, then re-check `lastHeartbeatAt` |
| Flows to a private system suddenly fail; credentials fine | The shared agent is offline | Check `celigo agents get <id>`; bring the agent back online rather than editing each connection |
| Installed agent will not connect after rotation | Old, invalidated token still configured on the host | Reconfigure the agent with the new `accessToken` and let it re-pair |
| `422` creating an Oracle / JDBC / filesystem connection -- `_agentId` missing | The connection type requires an agent but none is referenced | Install and pair an agent, then set `_agentId` on the connection |
| Connection routed through agent times out (`ETIMEDOUT`) | Agent host cannot reach the target system on the private network | Verify the host can reach the target's host/port; check internal firewall/routing between the agent host and the system |
| `404` on agent get/update | Wrong agent ID or the agent was deleted | Verify the ID with `celigo agents list` |
