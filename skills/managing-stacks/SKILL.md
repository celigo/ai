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
- **References** -- a stack does nothing on its own. It matters only once a hook (via `_stackId` on an export/import) or a wrapper connection (via `wrapper._stackId`) points at it.

Stacks are a resource type in their own right. They are referenced by script hooks and by wrapper connections. No tool on the Celigo Platform MCP server reads or changes a stack or its token, so manage them with the CLI, the REST API (`/v1/stacks`) or the UI; over MCP, a hook's `_stackId` on its export or import and a wrapper connection's `wrapper._stackId` still show which stack they use.

## The Stack Is the Runtime, Not the Code

The distinction the whole domain hangs on:

- The **code** is the logic: a hook (a JavaScript function on an export/import -- `preMap`, `postSubmit`, etc.) or a connector **wrapper** (the server-side JavaScript that implements a custom adaptor). With a stack, that code lives on your server or Lambda, not in a Celigo script.
- The **stack** is *where that code runs*. A hook names either a script (`_scriptId`, run on Celigo's runtime) or a stack (`_stackId`), together with the `function` to call -- for a stack, a function your deployed extension exposes. A wrapper connection names its stack in `wrapper._stackId`, and its logic runs from the code deployed there.

So moving a hook onto a stack means deploying its function to the stack's runtime, then, in one update, replacing `_scriptId` with `_stackId` and setting `function` to the name the deployed code exposes (often not the script's function name). The API doesn't enforce the either/or: a hook saved with both ids answers 200 and keeps both, and then the script and the stack each list the step as a dependent, leaving it unclear which runs. After the move, changing what the hook does is a deployment to your server or Lambda, not script work. A stack is **bring-your-own-compute**: it supplies the environment, not the behavior.

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
| Installing a template, or cloning resources, whose preview says `stackRequired: true` (a hook or wrapper connection that runs on a stack) | Yes -- the Marketplace installer asks which stack to use; an API install or clone takes it as `_stackId` and fails with 400 `stack_not_found` without it, and every stack reference in the copy points at that one stack. `celigo templates install <id>` passes `_stackId` in the body you pipe; the CLI's `clone` commands don't send one ([using-marketplace-templates](../using-marketplace-templates/SKILL.md)) |
| Reaching a private database or app behind a firewall | No -- that's an on-premise agent, not a stack |

### server vs lambda

Neither is "better" -- it's a fit question based on where the team already runs infrastructure.

| | `server` | `lambda` |
|---|---|---|
| What it is | A self-hosted, always-on HTTP endpoint you run and patch | A serverless AWS Lambda function Celigo invokes |
| Scaling / uptime | You own it | AWS manages it |
| Access control | The system token (step 5) and your own firewall; `ipRanges` is deprecated | AWS IAM |
| Trade-offs | Full control, no cloud-provider coupling | Pay-per-invocation, but AWS coupling and cold starts |
| Leans toward | Teams with an existing managed server or non-AWS environment | Teams already deep in AWS |

### Minimum Required Fields

Every stack needs `name` and `type`. `framework` is `twoDotZero` (the only supported version). The rest depends on `type`:

| Type | Config block | Required fields |
|---|---|---|
| `server` | `server` | `hostURI` (the reachable HTTP(S) endpoint Celigo calls). `systemToken` is **auto-generated** -- you do not set it. Don't rely on `ipRanges`: it's deprecated, and the platform stores whatever it's sent without checking it. |
| `lambda` | `lambda` | `accessKeyId`, `secretAccessKey`, `awsRegion`, `functionName`. Optional `language` (`Node.js` default, or `C#` / `Java` / `Other`). |

- `awsRegion` is an enum (e.g. `us-east-1`, `us-west-2`, `eu-west-1`, `eu-central-1`, `ap-southeast-1`, ...).
- `functionName` accepts a Lambda function name or full ARN.
- Both secrets (`systemToken`, `secretAccessKey`) are masked as `******` in responses; an update sends them back that way (Gotcha 5).

### Referencing a Stack (`_stackId`)

A stack is inert until something points at it:

- **Hooks** -- an export/import hook definition names the stack with `_stackId` *instead of* `_scriptId`, plus the `function` your deployed extension exposes. Send one or the other: a hook sent with both keeps both.
- **Wrapper connections** -- a `wrapper` connection names the stack whose server-side JavaScript implements it in `wrapper._stackId`, inside the `wrapper` block, next to `wrapper.pingFunction`: the function on the stack that Celigo calls to test the connection. The connection form requires the stack for a standalone wrapper; an Integration App's wrapper connections (`_connectorId` set) omit it and take the ping function from the app.

To confirm what actually runs on a stack, list its dependents (`celigo stacks dependencies <id>`) -- the hooks and wrapper connections pointing at it.

## Related Skills

- [configuring-connections > Connection Types](../configuring-connections/SKILL.md#connection-types) -- `wrapper` connections whose custom-connector code runs on a stack referenced by `wrapper._stackId`
- [writing-scripts > How to Write a Script](../writing-scripts/SKILL.md#how-to-write-a-script) -- hooks that run as Celigo scripts; a hook on a stack names `_stackId` instead of `_scriptId`
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

`celigo stacks list` also shows stacks other users have shared with you (`shared: true`). Sharing one goes through the API: `POST /v1/stacks/{_id}/invite` with the user's email creates a pending share they must accept. No CLI command or MCP tool shares a stack, and a stack behind an Integration App can't be shared.

### 4. Create the stack

Data blocks differ by `type`. Create the metadata; the runtime code is deployed and owned separately.

```bash
# server stack -- systemToken is auto-generated, do not include it
echo '{"name":"Order Enrichment Server","type":"server","framework":"twoDotZero","server":{"hostURI":"https://ext.example.com"}}' | celigo stacks create

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

- **server** -- the `systemToken` is generated on creation. Retrieve the unmasked value from the UI (the stack's "Show token" action) or with `celigo stacks token <id>`, then set it as the `INTEGRATOR_EXTENSION_SYSTEM_TOKEN` environment variable on every server that runs the extension code. To rotate it, run `celigo stacks rotate-token <id>` (the old token is invalidated immediately) and re-fetch the new one. Both commands print or replace a secret, so have the user run them where the value goes straight into the server's environment, not into a chat.
- **lambda** -- the AWS IAM user behind `accessKeyId` / `secretAccessKey` must have the `lambda:InvokeFunction` permission for the target function, and `awsRegion` must match where the function is deployed.

### 6. Point a hook or wrapper at the stack

The stack only runs code once referenced:

- **Hook** -- deploy the hook function to the stack's runtime, then set `_stackId` on the hook definition on the export/import in place of `_scriptId`, with `function` naming the deployed function. A hook can't be patched on its own, so this is a full update of the export or import: read it, change only the hook (remove `_scriptId`, add `_stackId`, set `function`), and write the whole document back. Leave the script itself alone unless the user asks; other steps may still use it. See [writing-scripts > How to Write a Script](../writing-scripts/SKILL.md#how-to-write-a-script) for hook wiring.
- **Wrapper connection** -- set `wrapper._stackId` on the `wrapper` connection, and `wrapper.pingFunction` to the function your extension exposes for the connection test (Test Connection, or `celigo connections ping <id>`, calls it). See [configuring-connections > Connection Types](../configuring-connections/SKILL.md#connection-types).

### 7. Verify

Confirm the expected hooks and wrapper connections reference the stack before relying on it:

```bash
celigo stacks get <id>
celigo stacks dependencies <id>    # the live list, including wrapper connections
```

## CLI Commands

```bash
# CRUD
celigo stacks list
celigo stacks get <id>
celigo stacks create < stack.json
celigo stacks update <id> --file stack.json --force   # the GET body, masks left as read (Gotcha 5)
celigo stacks delete <id> [-y]

# Token and dependents (the token is server stacks only)
celigo stacks token <id>               # prints the unmasked systemToken -- keep it out of chat
celigo stacks rotate-token <id> [-y]   # old token invalid immediately; re-run `token`
celigo stacks dependencies <id>        # hooks and wrapper connections using the stack
celigo stacks audit <id>

# Discover existing stacks across the account
celigo account search "<keyword>"
```

`celigo stacks token` and `rotate-token` call `GET` and `DELETE /v1/stacks/{id}/systemToken`; the UI's "Show token" action is the alternative.

<!-- TIER:3 -->

## Pre-Submit Checklist

- [ ] Confirmed a stack is genuinely needed (heavier/specialized code, compliance, or a custom connector wrapper) -- not a routine hook the hosted runtime could handle.
- [ ] Correct `type` chosen (`server` vs `lambda`) based on where the team operates infrastructure.
- [ ] `framework` set to `twoDotZero`.
- [ ] `server`: `hostURI` is reachable over HTTPS; a firewall in front of it allows Celigo's published addresses ([configuring-connections > Partner IP allow lists](../configuring-connections/SKILL.md#partner-ip-allow-lists)), not the deprecated `ipRanges`.
- [ ] `server`: `systemToken` retrieved (not set) and configured as `INTEGRATOR_EXTENSION_SYSTEM_TOKEN` on the runtime.
- [ ] `lambda`: `awsRegion`, `functionName`, and AWS keys supplied; IAM user has `lambda:InvokeFunction`.
- [ ] No secret pasted into chat or a tracked file; AWS `secretAccessKey` entered via the UI or a local, untracked file only.
- [ ] The consuming hook (`_stackId` on the export/import hook) or wrapper connection (`wrapper._stackId`, with `wrapper.pingFunction` set) actually points at this stack.
- [ ] An update sends the stack as read, masks included (`celigo stacks update <id> --file stack.json --force`), never with `secretAccessKey` left out.
- [ ] Dependents verified so you know exactly what runs on the stack.

## Gotchas

1. **A stack is the runtime, not the code.** It does nothing visible until a hook or wrapper references it via `_stackId`. Creating a stack alone changes no behavior.
2. **Most accounts don't need one.** Hooks run on Celigo's hosted JavaScript runtime by default. Only escalate to a stack on a real trigger.
3. **The server `systemToken` is auto-generated -- you don't set it.** Retrieve it with `celigo stacks token <id>` (or the UI), store it as `INTEGRATOR_EXTENSION_SYSTEM_TOKEN` on your server, and rotate with `celigo stacks rotate-token <id>` when needed.
4. **Never paste secrets into chat.** Both the `systemToken` and the AWS `secretAccessKey` are secrets returned masked as `******`. A secret pasted into a logged conversation is compromised -- rotate it (recycle the system token, or rotate the AWS key) and re-enter it via the UI.
5. **An update sends the secrets back as their masks.** A GET returns `lambda.secretAccessKey` and `server.systemToken` as `******`. On a PUT the mask keeps the stored AWS secret, and leaving `secretAccessKey` out is refused (422 `secretAccessKey is not provided for the stack of type lambda.`). `server.systemToken` is ignored whatever the body holds, so only `rotate-token` changes it. To change the AWS secret, send the new value from a local, untracked file.
6. **PUT clears omitted optional fields.** Updating a stack replaces it: for example, omitting `framework` on update clears a previously set value. GET the stack, modify, then PUT the full object: `celigo stacks update <id> --file stack.json --force`. The CLI's mask check refuses that body without `--force`, and `celigo stacks set` refuses every stack, since both types come back masked.
7. **`twoDotZero` is the only supported framework version.** There is no other valid value.
8. **`lambda` needs `lambda:InvokeFunction`.** The IAM user must be allowed to invoke the function, `functionName` (name or ARN) must exist in the specified `awsRegion`, and `language` must match the deployed function.
9. **Stack != on-premise agent.** Don't create a stack to reach a private database -- that's connectivity, which is an on-premise agent's job. A stack is compute for *your code*.
10. **Delete is a soft delete (30-day recycle bin), and dependents block it.** A stack still referenced by hooks or wrapper connections cannot be deleted until those references are repointed or removed.
11. **A hook names one runtime, and the API won't choose for you.** A hook saved with both `_scriptId` and `_stackId` answers 200 and stores both. When moving a hook onto a stack, remove `_scriptId` in the same update, and set `function` to the stack's function name.
12. **A stack belongs to one environment.** Each environment keeps its own resources, so the hooks and wrappers in a sandbox need a stack registered in that sandbox, with its own system token (or AWS keys) on the runtime it points at. `celigo promote` never copies a stack: it binds each one to the target's single stack of the same name and type, or the one you pin with `--map`, and otherwise refuses unless `--create-connections` makes a credential-less shell there for you to finish.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `422` `missing_required_field` on create | `type: server` without `server.hostURI`, or `type: lambda` missing `accessKeyId` / `secretAccessKey` / `awsRegion` / `functionName` | Provide the full config block for the chosen `type`; the error's `field` names the missing path |
| `422` dependency-conflict on delete | Hooks or wrapper connections still reference the stack via `_stackId` | Repoint or remove the dependents first; list them with `celigo stacks dependencies <id>` |
| Hook or wrapper still runs on Celigo's runtime | `_stackId` not set on the hook definition, or `wrapper._stackId` not set on the wrapper connection | Set `_stackId` on the hook (export/import) or `wrapper._stackId` on the connection |
| `422` `secretAccessKey is not provided for the stack of type lambda.` on update | The PUT left the AWS secret out | Send the stack as read, with `secretAccessKey` still `******` (the mask keeps the stored secret), or a new value |
| `Refusing to update stack ...: payload contains masked credential values`, or `Cannot set ... on a stack via 'set'` | The CLI checks for masks before it sends anything | Send the GET body with `celigo stacks update <id> --file stack.json --force`; the masks keep the stored secrets (Gotcha 5) |
| Both the script's and the stack's dependencies list the same step | The hook was saved with both `_scriptId` and `_stackId` | Update the step again with the hook naming only `_stackId` and the stack's `function` |
| `404` "Stack of type server not found." on systemToken | Requested a system token for a `lambda` stack (or wrong ID) | System tokens exist only for `server` stacks; verify the `_id` and `type` |
| Server calls fail / `401` from your server | Your server isn't validating the current `systemToken`, or the token was rotated | Fetch the current token with `celigo stacks token <id>` and set `INTEGRATOR_EXTENSION_SYSTEM_TOKEN` |
| Lambda `AccessDenied` / not invoked | IAM user lacks `lambda:InvokeFunction`, wrong `awsRegion`, or bad keys | Grant `lambda:InvokeFunction`, confirm the region matches the function, re-enter the AWS keys |
| Wrapper connection shows offline | The function `wrapper.pingFunction` names is missing from the extension, or the stack's runtime is unreachable | Expose that function (or correct the name) and make the runtime reachable, then test the connection again (`celigo connections ping <id>`) |
