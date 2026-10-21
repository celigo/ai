# Managing Network Policies with the Celigo MCP Tools

The tool calls for each step of How to Manage Network Policies, for agents connected to the Celigo Platform MCP server. Step numbers match [SKILL.md](../SKILL.md).

## What the Server Can and Can't Do

The deployed server has **no network-policy tools**: no tool lists, reads, creates, edits or deletes a policy, or lists where one is assigned. Three things are within reach:

- **Assign or clear a policy on an MCP server** -- `upsert_mcp_server`, a full update of the server, given the policy's `_id` (step 4).
- **Read the policy's field rules** -- `get_schema({ target: "resource", name: "networkpolicy" })` returns the write body: `name`, `description`, `ipAllowList`, `ipDenyList` and their limits.
- **Read a policy's change history** -- `list_audit_log_entries({ resourceType: "networkpolicy" })`, plus `_resourceId` for one policy. Entries survive the policy's deletion.

For every other step, use the `celigo` CLI if you have it ([cli.md](cli.md)), or hand the step to the user in the integrator.io UI: work out the exact settings -- the name, the description, both lists -- and give them to the user to enter. Assigning a policy to an API token or to sign-in is UI-only on every surface.

## 1. Check what exists and where it's assigned

No tool lists policies or their assignments. Ask the user for the policy's name, `_id` and lists (or read them with the CLI). To see which MCP servers carry a policy, read each server: its `_networkPolicyId` is the assigned policy, and the field is absent when there is none.

```
list_mcp_servers({})                          // ids and names
list_mcp_servers({ _id: "<serverId>" })       // the full document, including _networkPolicyId
```

## 2. Decide the lists -- and check for lockout

The same check as in SKILL.md, done with the user: if the policy will cover the API token your MCP client signs in with, or workspace-user sign-in, the address you connect from has to stay on its allow list. Nothing over MCP reads a token's policy; ask the user to check the token on the API tokens page.

## 3. Create the policy

No tool creates a policy. Read the field rules with `get_schema({ target: "resource", name: "networkpolicy" })`, then give the user the settings to create it in the UI, or create it with the CLI. Ask for the new policy's `_id` if you're assigning it to a server next.

## 4. Assign it

Setting `_networkPolicyId` is a full update of the server: read it, set the field, and send the complete document back.

```
list_mcp_servers({ _id: "<serverId>" })
upsert_mcp_server({ _id: "<serverId>", body: <the complete server document, with "_networkPolicyId": "<policyId>"> })
```

Send the document without its server-managed `_id`, `createdAt` and `lastModified`, and keep every array it holds: a full update empties each array it leaves out -- tools, APIs, prompts, resources, connections, capability sets and traffic limits ([building-mcp-servers > Gotchas](../../building-mcp-servers/SKILL.md#gotchas)). Read the server back afterwards to confirm the policy and the arrays. A policy from another environment is refused with 422 `invalid_ref`.

Token and sign-in assignments: the UI.

## 5. Edit a policy

No tool edits a policy. Give the user the complete new lists -- a list sent on its own replaces the whole list -- or edit with the CLI's `set`.

## 6. Unassign or delete

**Unassign from an MCP server** with the same full update as step 4, sending `"_networkPolicyId": null`. Leaving the field out of the body keeps the policy assigned.

**Delete** -- no tool deletes a policy; `delete_resource` doesn't cover network policies. Before the user deletes one, list the MCP servers that carry it (step 1) and tell the user that deleting an assigned policy needs a forced delete, which lifts the restriction from every server, token and sign-in setting it guards. Save the lists first: a deleted policy can't be restored from the recycle bin today (SKILL.md, Gotchas).

## 7. Check whether a policy explains a refused caller

```
list_mcp_servers({ _id: "<serverId>" })                                          // its _networkPolicyId
list_audit_log_entries({ resourceType: "mcpserver", _resourceId: "<serverId>" }) // when the policy was set or changed
list_audit_log_entries({ resourceType: "networkpolicy", _resourceId: "<policyId>" })  // edits to the policy's lists
```

The policy's current lists aren't readable over MCP: get them from the user or the CLI, then compare them with the address the caller connects from.
