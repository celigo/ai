---
name: managing-stacks
description: Configure Celigo stacks -- pointers to your own compute environment (a self-hosted `server` or an AWS `lambda`) where Celigo runs extension code (script hooks and connector wrappers) instead of on its hosted JavaScript runtime. A stack stores the address and credentials of that runtime, not the code itself. Use when deciding whether you need a stack, choosing between `server` and `lambda` types, creating or updating a stack, or pointing a hook or wrapper at one via `_stackId`.
---

<!-- TIER:1 -->

# Managing Stacks

A stack is a **pointer to your own compute environment** where Celigo runs extension code -- the script hooks and connector wrappers that would otherwise run on Celigo's hosted JavaScript runtime. A stack holds the **address and credentials** of that environment, not the logic. At runtime, when a hook or wrapper is configured to use a stack, Celigo dispatches that function's execution to the stack instead of running it on its own managed runtime.

Concerns when managing stacks:

- **Necessity** -- most accounts never need a stack; the hosted runtime handles the vast majority of extension logic. A stack is for a real trigger (see the decision matrix).
- **Type and config** -- `server` (a self-hosted HTTP endpoint) or `lambda` (an AWS Lambda function), each with its own config block.
- **Credentials** -- a server carries an auto-generated `systemToken`; a lambda carries AWS keys. Both are masked in responses and demand credential discipline.
- **References** -- a stack does nothing on its own. It matters only once a hook (via `_stackId` on an export/import) or a wrapper connection (via `_stackId`) points at it.

Stacks are a resource type in their own right. They are referenced by script hooks and by wrapper connections.

## The Stack Is the Runtime, Not the Code

The distinction the whole domain hangs on:

- The **code** is the logic: a hook (a JavaScript function on an export/import -- `preMap`, `postSubmit`, etc.) or a connector **wrapper** (the server-side JavaScript that implements a custom adaptor). Hook logic is a script resource; wrapper logic belongs to the wrapper connection.
- The **stack** is *where that code runs*. A hook or wrapper points at a stack via `_stackId`. When set, Celigo dispatches that function's execution to the stack instead of its managed runtime.

So "edit what the hook does" is script work; "change *where* the hook runs" (managed runtime <-> a stack, or one stack <-> another) is what touches `_stackId`. A stack is **bring-your-own-compute**: it supplies the environment, not the behavior.

## Stack vs On-Premise Agent

Both put "your own infrastructure" in the loop, but for opposite reasons -- keep the boundary straight:

- A **stack** is about **compute** -- running *your extension code* (hooks/wrappers) on your server or Lambda.
- An **on-premise agent** is about **connectivity** -- a tunnel that lets Celigo *reach private apps or networks* behind your firewall (a database or app with no public endpoint).

"Run our code" -> stack. "Reach our private system" -> on-premise agent. A single flow can use both: an agent to reach a private database, and a stack to run a custom hook.

## Quick Reference

### Do You Need a Stack?

Default: **no.** Celigo's hosted JavaScript runtime runs hooks out of the box. Reach for a stack only on a real trigger:

| Situation | Need a stack? |
|---|---|
| A hook to transform, filter, or enrich records | No -- the hosted runtime handles it |
| Code that needs libraries, native dependencies, more memory, or longer execution than the sandbox allows | Yes |
| Compliance/security requirement that extension code *and the data it touches* never leave your environment | Yes |
| A custom connector implemented as a wrapper connection | Yes -- a wrapper runs on a stack you operate |
| Reaching a private database or app behind a firewall | No -- that's an on-premise agent, not a stack |

### server vs lambda

Neither is "better" -- it's a fit question based on where the team already runs infrastructure.

| | `server` | `lambda` |
|---|---|---|
| What it is | A self-hosted, always-on HTTP endpoint you run and patch | A serverless AWS Lambda function Celigo invokes |
| Scaling / uptime | You own it | AWS manages it |
| Access control | Optional `ipRanges` allow-list | AWS IAM |
| Trade-offs | Full control, no cloud-provider coupling | Pay-per-invocation, but AWS coupling and cold starts |
| Leans toward | Teams with an existing managed server or non-AWS environment | Teams already deep in AWS |

### Minimum Required Fields

Every stack needs `name` and `type`. `framework` is `twoDotZero` (the only supported version). The rest depends on `type`:

| Type | Config block | Required fields |
|---|---|---|
| `server` | `server` | `hostURI` (the reachable HTTP(S) endpoint Celigo calls). Optional `ipRanges` allow-list. `systemToken` is **auto-generated** -- you do not set it. |
| `lambda` | `lambda` | `accessKeyId`, `secretAccessKey`, `awsRegion`, `functionName`. Optional `language` (`Node.js` default, or `C#` / `Java` / `Other`). |

- `awsRegion` is an enum (e.g. `us-east-1`, `us-west-2`, `eu-west-1`, `eu-central-1`, `ap-southeast-1`, ...).
- `functionName` accepts a Lambda function name or full ARN.
- Both secrets (`systemToken`, `secretAccessKey`) are masked as `******` in responses.

### Referencing a Stack (`_stackId`)

A stack is inert until something points at it:

- **Hooks** -- an export/import hook definition carries an optional `_stackId` alongside its `_scriptId` and `function`. Set it to dispatch that hook to the stack.
- **Wrapper connections** -- a `wrapper`-type connection sets `_stackId` to the stack whose server-side JavaScript implements the connection. Required by the connection form for standalone wrappers.

To confirm what actually runs on a stack, list its dependents (`GET /v1/stacks/{id}/dependencies`) -- the hooks and wrapper connections pointing at it.

## Related Skills

- [configuring-connections > Connection Types](../configuring-connections/SKILL.md#connection-types) -- `wrapper` connections whose custom-connector code runs on a stack referenced by `_stackId`
- [writing-scripts > How to Write a Script](../writing-scripts/SKILL.md#how-to-write-a-script) -- the hook logic dispatched to a stack; a hook points at one via `_stackId`
- [managing-on-premise-agents](../managing-on-premise-agents/SKILL.md) -- the connectivity counterpart: a stack runs *your code*, an on-premise agent *reaches your private systems*
- [getting-started > Core Concepts](../getting-started/SKILL.md#core-concepts) -- where stacks fit among the core resource types

<!-- TIER:2 -->

## How to Manage a Stack

### 1. Confirm you actually need one

Use the [Do You Need a Stack?](#do-you-need-a-stack) matrix. When a user asks "should I set up a stack for this hook," the honest first answer is usually "probably not -- the managed runtime handles it," then escalate only if heavier/specialized code, a compliance requirement, or a custom connector wrapper is genuinely in play. If the real need is reaching a private system, that's an on-premise agent, not a stack.

### 2. Choose the type

Use the [server vs lambda](#server-vs-lambda) matrix. Pick by where the team already runs infrastructure and how they want to operate it.

### 3. Check for existing stacks

Before creating a new one, look for a stack you can reuse:

```bash
celigo stacks list
celigo account search "stack"
celigo account search "<keyword related to the extension>"
```

### 4. Create the stack

Data blocks differ by `type`. Create the metadata; the runtime code is deployed and owned separately.

```bash
# server stack -- systemToken is auto-generated, do not include it
echo '{"name":"Order Enrichment Server","type":"server","framework":"twoDotZero","server":{"hostURI":"https://ext.example.com"}}' | celigo stacks create

# server stack with an IP allow-list
echo '{"name":"Order Enrichment Server","type":"server","framework":"twoDotZero","server":{"hostURI":"https://ext.example.com","ipRanges":["203.0.113.0/24"]}}' | celigo stacks create

# lambda stack -- enter the AWS secret via a local, untracked file; never paste real secrets into chat
celigo stacks create < lambda-stack.json
```

Example `lambda-stack.json` (use a placeholder here and supply the real key only in a local file or the UI):

```json
{
  "name": "Order Enrichment Lambda",
  "type": "lambda",
  "framework": "twoDotZero",
  "lambda": {
    "accessKeyId": "<aws-access-key-id>",
    "secretAccessKey": "<aws-secret-access-key>",
    "awsRegion": "us-east-1",
    "functionName": "celigo-order-enrichment",
    "language": "Node.js"
  }
}
```

### 5. Wire up authentication

- **server** -- the `systemToken` is generated on creation. Retrieve the unmasked value from the UI (the stack's "Show token" action) or via `GET /v1/stacks/{id}/systemToken`, then set it as the `INTEGRATOR_EXTENSION_SYSTEM_TOKEN` environment variable on every server that runs the extension code. To rotate it, use `DELETE /v1/stacks/{id}/systemToken` (the old token is invalidated immediately) and re-fetch the new one.
- **lambda** -- the AWS IAM user behind `accessKeyId` / `secretAccessKey` must have the `lambda:InvokeFunction` permission for the target function, and `awsRegion` must match where the function is deployed.

### 6. Point a hook or wrapper at the stack

The stack only runs code once referenced:

- **Hook** -- add `_stackId` to the hook definition on the export/import (alongside `_scriptId` and `function`). See [writing-scripts > How to Write a Script](../writing-scripts/SKILL.md#how-to-write-a-script) for hook wiring.
- **Wrapper connection** -- set `_stackId` on the `wrapper` connection. See [configuring-connections > Connection Types](../configuring-connections/SKILL.md#connection-types). A wrapper stack must expose a `ping` function so Celigo can health-check the connection.

### 7. Verify

Confirm the expected hooks and wrapper connections reference the stack before relying on it:

```bash
celigo stacks get <id>
celigo account dependencies stack <id>
```

## CLI Commands

```bash
# CRUD
celigo stacks list
celigo stacks get <id>
celigo stacks create < stack.json
celigo stacks update <id> < stack.json
celigo stacks delete <id> [-y]

# Discover existing stacks across the account
celigo account search "<keyword>"
```

UI/API alternatives worth knowing (no dedicated CLI subcommand -- use the UI or the API directly):

- Retrieve the server system token: `GET /v1/stacks/{id}/systemToken` (or "Show token" in the UI).
- Rotate the server system token: `DELETE /v1/stacks/{id}/systemToken`.
- List dependents: `GET /v1/stacks/{id}/dependencies`.

<!-- TIER:3 -->

## Pre-Submit Checklist

- [ ] Confirmed a stack is genuinely needed (heavier/specialized code, compliance, or a custom connector wrapper) -- not a routine hook the hosted runtime could handle.
- [ ] Correct `type` chosen (`server` vs `lambda`) based on where the team operates infrastructure.
- [ ] `framework` set to `twoDotZero`.
- [ ] `server`: `hostURI` is reachable over HTTPS; if `ipRanges` is set, Celigo's egress IPs are included.
- [ ] `server`: `systemToken` retrieved (not set) and configured as `INTEGRATOR_EXTENSION_SYSTEM_TOKEN` on the runtime.
- [ ] `lambda`: `awsRegion`, `functionName`, and AWS keys supplied; IAM user has `lambda:InvokeFunction`.
- [ ] No secret pasted into chat or a tracked file; AWS `secretAccessKey` entered via the UI or a local, untracked file only.
- [ ] The consuming hook (`_stackId` on the export/import hook) or wrapper connection (`_stackId`) actually points at this stack.
- [ ] Dependents verified so you know exactly what runs on the stack.

## Gotchas

1. **A stack is the runtime, not the code.** It does nothing visible until a hook or wrapper references it via `_stackId`. Creating a stack alone changes no behavior.
2. **Most accounts don't need one.** Hooks run on Celigo's hosted JavaScript runtime by default. Only escalate to a stack on a real trigger.
3. **The server `systemToken` is auto-generated -- you don't set it.** Retrieve it via `GET /v1/stacks/{id}/systemToken` (or the UI), store it as `INTEGRATOR_EXTENSION_SYSTEM_TOKEN` on your server, and rotate with `DELETE /v1/stacks/{id}/systemToken` when needed.
4. **Never paste secrets into chat.** Both the `systemToken` and the AWS `secretAccessKey` are secrets returned masked as `******`. A secret pasted into a logged conversation is compromised -- rotate it (recycle the system token, or rotate the AWS key) and re-enter it via the UI.
5. **Don't write the masked `******` back as a real credential.** `secretAccessKey` is write-only; to change it, send the real value. To keep the existing value, supply the real value again or edit through the UI -- never persist the literal `******`.
6. **PUT clears omitted optional fields.** Updating a stack replaces it: for example, omitting `framework` on update clears a previously set value. GET the stack, modify, then PUT the full object.
7. **`twoDotZero` is the only supported framework version.** There is no other valid value.
8. **`lambda` needs `lambda:InvokeFunction`.** The IAM user must be allowed to invoke the function, `functionName` (name or ARN) must exist in the specified `awsRegion`, and `language` must match the deployed function.
9. **Stack != on-premise agent.** Don't create a stack to reach a private database -- that's connectivity, which is an on-premise agent's job. A stack is compute for *your code*.
10. **Delete is a soft delete (30-day recycle bin), and dependents block it.** A stack still referenced by hooks or wrapper connections cannot be deleted until those references are repointed or removed.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `422` `missing_required_field` on create | `type: server` without `server.hostURI`, or `type: lambda` missing `accessKeyId` / `secretAccessKey` / `awsRegion` / `functionName` | Provide the full config block for the chosen `type`; the error's `field` names the missing path |
| `422` dependency-conflict on delete | Hooks or wrapper connections still reference the stack via `_stackId` | Repoint or remove the dependents first; list them via `GET /v1/stacks/{id}/dependencies` |
| Hook or wrapper still runs on Celigo's runtime | `_stackId` not set on the hook definition or the wrapper connection | Set `_stackId` on the hook (export/import) or the `wrapper` connection |
| `404` "Stack of type server not found." on systemToken | Requested a system token for a `lambda` stack (or wrong ID) | System tokens exist only for `server` stacks; verify the `_id` and `type` |
| Server calls fail / `401` from your server | Your server isn't validating the current `systemToken`, or the token was rotated | Fetch the current token via `GET /v1/stacks/{id}/systemToken` and set `INTEGRATOR_EXTENSION_SYSTEM_TOKEN` |
| Lambda `AccessDenied` / not invoked | IAM user lacks `lambda:InvokeFunction`, wrong `awsRegion`, or bad keys | Grant `lambda:InvokeFunction`, confirm the region matches the function, re-enter the AWS keys |
| Wrapper connection shows offline | The stack's `ping` function is missing or unreachable | Implement the `ping` function in the extension; Celigo re-pings offline connections hourly with exponential backoff |
