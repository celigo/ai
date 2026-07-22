---
uri: celigo://resources/account-architecture
name: Account Architecture Model
description: >-
  How to reason about a Celigo account as a dependency graph rather than a flat
  list — reading the resource hierarchy, trusting dependency edges over names,
  and assessing blast radius and risk by traffic and dependents.
mimeType: text/markdown
---
# Account Architecture Model

A Celigo account is best understood not as a flat list of resources but as a **graph of dependencies**. Resources reference each other, and the edges between them — not the label on any single resource — tell you what an account actually does and what happens when you change it. This reference explains how to read that graph, why to trust dependency edges over names, and how to reason about blast radius and risk.

## The account as a dependency graph

The backbone runs top-down, from the business boundary to the credentials and infrastructure each step ultimately depends on:

```
Integration
  → Flow / API / Tool          (the three composite executable parents)
     → (routers → branches) → steps:
          Export / Listener / Lookup / Import
          + AI-agent / Guardrail / Tool steps   (persisted as imports)
        → Connection
           → Agent / Stack / iClient / borrowed concurrency

MCP server → publishes Tools / APIs to external clients
```

How to read each layer:

- **Integrations** — usually the business or workspace boundary, the unit teams organize around. Every flow belongs to one via `_integrationId`.
- **Flows, APIs, and Tools** — the three composite execution parents. They share the same internal shape (`routers → branches → page-processor steps`). A `Flow` runs on a schedule or event; an `API` serves inbound requests; a `Tool` is a reusable callable unit other resources embed. A question about "what runs" may anchor on any of the three, not just flows.
- **Steps** (exports, listeners, lookups, imports) — reveal what systems a parent *actually* touches, which is stronger evidence than the parent's name. AI-agent, guardrail, and tool steps are persisted as imports under the hood, so they appear in the graph as import nodes rather than a distinct type.
- **Connections** — the strongest anchor for system identity. For a technology question ("which flows use Shopify?"), the connection and its resolved `application` is the truth; the flow name is only a hint. Every export and import references a connection via `_connectionId`.
- **MCP servers** — a top-level resource that publishes Tools and APIs out to external clients. It is a *consumer* of those resources, not a step inside a flow.
- **Scripts, lookup caches, agents, stacks, and iClients** — *shared* dependencies that are easy to miss. One of them can be used by many flows at once, so a change to a single shared node ripples widely.
- **Flow chaining** — creates *indirect* dependencies: a change to one flow can affect another that is triggered downstream, beyond anything visible in a single flow's own config.

## Trust the graph, not the names

The core discipline: **trust the graph more than the names.** Flow names are hints; connections, steps, and dependency edges are evidence. A flow called `Daily Sync` tells you nothing about which systems it touches — the connection it routes through does. When a name and the graph disagree, believe the graph.

## Reasoning about the graph

- **Anchor on the right starting point.** Every question has a natural anchor: a *system/technology* question anchors on a `Connection`; an *operational pipeline* question on a `Flow`; a *blast-radius* question on the resource being changed; a *literal config value* on a text search. Picking the anchor is most of the work.
- **Traverse only as far as the question needs.** A full impact chain calls for one thorough blast-radius traversal; a local "what does this flow do?" needs only a single hop around the resource. Don't over-traverse.
- **Think in subgraphs, not single nodes.** A breakage or risk question is about a *neighborhood*: what the resource uses, what uses it, what changed recently, and how much traffic flows through it. The answer lives in the subgraph, not the one node you started from.
- **Separate facts from interpretation.** Be explicit about what the graph *proves* versus what you *infer*. A change and a failure close together in time is a *likely* cause, not a proven one; overclaiming causality is the fastest way to mislead.

## Blast radius and impact

When you change, disable, or delete a resource, its impact is the set of things that depend on it:

- **Direct dependents** — resources that reference it explicitly, such as an export or import pointing at a `Connection` via `_connectionId`, or a flow that embeds a `Tool`.
- **Indirect dependents** — reached through chaining. A downstream flow triggered by the one you changed is in the blast radius even though nothing in the changed flow's own config names it.
- **Shared dependencies amplify blast radius.** Scripts, lookup caches, connections, stacks, agents, and iClients can each be used by many resources, so editing one shared node can affect every resource that references it. Enumerate direct dependents first, then follow chains outward for indirect ones.

## Quantifying risk by traffic

Structure alone doesn't tell you how *urgent* a risk is — traffic does.

- A brittle, low-volume flow is **technical debt**: worth fixing, rarely an emergency.
- The same brittleness on a high-volume flow is **operational risk**: a failure there affects far more records and downstream systems.

The structural finding is identical; the volume flowing through the node is what makes it urgent or not. When ranking risks or dependents, reach for real traffic and volume numbers rather than ordering by structure or name relevance alone. Call out high-traffic dependents first.

## Edges of the model

A few things bound what the dependency graph shows:

- **Not every config detail is a node.** Some elements are sub-components rather than first-class nodes — an async helper, for example, is a sub-component of an export or import (referenced via `http._asyncHelperId`), not a standalone node in the graph.
- **Scoped visibility.** With integration-scoped access, dependency and impact analysis stops at that visibility boundary — treat results as scoped to what you can see rather than account-global.
