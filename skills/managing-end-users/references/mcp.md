# Managing End Users with the Celigo MCP Tools

The tool calls for each step of How to Manage End Users, for agents connected to the Celigo Platform MCP server. Step numbers match [SKILL.md](../SKILL.md).

## What the Server Can and Can't Do

The deployed server has **no end-user, group, role, grant or effective-access tools**, and its user tools are for workspace users only:

- `list_users` reads the workspace users (and the owner). End users never appear in it, so an empty or short result says nothing about who can use an MCP server.
- `manage_user` acts on workspace users. Its `invite` creates a **workspace** user -- never use it to give someone MCP access. Its `disable` and `enable` read the record through the workspace route first, which doesn't find an end user, and `update_permissions` takes only workspace access fields.

What it can do:

- **Maintain a server's capability sets** -- `upsert_mcp_server`, a full update of the server document (step 6).
- **Read the shapes** -- `get_schema({ target: "resource", name: "mcp-server" })` for the server document with its `permissionSets`, and `get_schema({ target: "resource", name: "enduser/<file>" })` with `enduser`, `group`, `role` or `resource-grant` for the end-user records.
- **Read change history** -- `list_audit_log_entries` with `resourceType` `group` or `role` (with old and new values), or `user` for end-user records (which shows that a record changed, not what changed).

For every other step, use the `celigo` CLI if you have it ([cli.md](cli.md)), or hand the step to the user in the integrator.io UI with the exact settings: the addresses, the groups, and the capabilities per server.

## 1. Check who has access

No tool lists end users, groups or roles. Ask the user, or read them with the CLI. `list_users` is no substitute (above).

## 2. Decide how to grant

Read the server to get the ids its capabilities take -- `tools[]._toolId`, `apis[]._apiId`, `prompts[]._id`, `resources[]._id`, and `permissionSets[]._id` for `pset:`:

```
list_mcp_servers({ _id: "<serverId>" })
```

## 3. Invite

No tool invites an end user. Give the user the addresses, the groups and the per-server capabilities to enter in the UI, or invite with the CLI. Don't fall back to `manage_user({ action: "invite" })`: that adds a workspace user.

## 4. Grant access on a server

No tool grants end-user access. Give the user the complete capabilities for each person or group on the server -- a grant on a server replaces their previous one there.

## 5. Manage groups and roles

No tool creates or edits groups or roles. Their history is readable:

```
list_audit_log_entries({ resourceType: "group", _resourceId: "<groupId>" })
list_audit_log_entries({ resourceType: "role" })
```

## 6. Grant through capability sets

Capability sets live in the server document, so this is the one end-user step the server can write. It's a full update: read the server, change `permissionSets`, and send the complete document back.

```
list_mcp_servers({ _id: "<serverId>" })
upsert_mcp_server({ _id: "<serverId>", body: <the complete server document, permissionSets edited> })
```

- Keep every existing set's `_id`. A set left out of the body -- or sent back renamed without its `_id` -- is removed, and every grant that named it is rewritten into the set's members' capabilities, which no longer follow any set.
- Send the document without its server-managed `_id`, `createdAt` and `lastModified`, and keep every other array: a full update empties each array it leaves out ([building-mcp-servers > Gotchas](../../building-mcp-servers/SKILL.md#gotchas)).
- Each set's items must already be on the server, and set names are unique on the server, ignoring case. `accessLevel` isn't stored.

Read the server back afterwards, and have the user (or the CLI) check effective access for the people the sets reach.

## 7. Check effective access

No tool compiles effective access. Use the CLI, or ask the user to check the server's users in the UI.

## 8. Suspend, revoke, or offboard

No tool suspends or revokes an end user -- `manage_user`'s `disable` can't find one. Hand both to the user (the UI) or use the CLI's `revoke`. For a person who also has workspace access, `manage_user` handles the workspace side ([managing-users](../../managing-users/SKILL.md)).

## 9. Manage end users' own connections

No tool lists, reads or deletes an end user's copy of a connection, and the connection tools don't return those copies. Use the CLI or the UI.
