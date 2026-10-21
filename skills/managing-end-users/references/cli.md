# Managing End Users with the `celigo` CLI

The commands for each step of How to Manage End Users. Step numbers match [SKILL.md](../SKILL.md). Before the first write of a session, confirm which account and environment the CLI targets (`celigo profile whoami`).

## What the Commands Cover

- `celigo end-users` has `list`, `effective-access`, `invite`, `revoke`, `connection` and `delete-connection` -- no `get`, no update, no suspend. `<ashareId>` is the `_id` from `end-users list`.
- `celigo groups` and `celigo roles` are full CRUD; `groups` adds `add-members` and `remove-members`. Neither has a PATCH whitelist: `set` does the GET, edits the named fields, and PUTs the complete document back, so the other fields survive. `update` PUTs exactly the body you pipe in and erases what it leaves out.
- Grants on one server go through `celigo mcp-servers assign-end-users` and `assign-groups`; who can reach a server through `celigo mcp-servers effective-access`.
- CLI 2026.10.1's help for `--grant` and `--capabilities` lists only `tool:`, `api:` and `pset:`, but the strings pass through: `prompt:all`, `prompt:<id>`, `resource:all` and `resource:<id>` are accepted too.
- The workspace-user commands don't reach end users: `celigo workspace-users disable <ashareId>` reads the record through the workspace route first and stops at 404 "AShare not found.".

## 1. Check who has access

```bash
celigo end-users list                           # the account owner is never listed
celigo end-users list --provisioned-by jit      # or invite; scim records appear only unfiltered
celigo groups list --fields all
celigo roles list --fields all
```

## 2. Decide how to grant

The ids a capability takes are in the server document: `tools[]._toolId`, `apis[]._apiId`, `prompts[]._id`, `resources[]._id`, and `permissionSets[]._id` for `pset:`.

```bash
celigo mcp-servers get <serverId>
```

## 3. Invite

```bash
celigo end-users invite --email person@example.com --name "Ana Example" --grant <serverId>=tool:all,api:all
celigo end-users invite --email a@example.com --email b@example.com --group <groupId>
celigo end-users invite --email person@example.com --grant all=tool:all          # all = every MCP server in the account
```

- Each `--email` gets a real invitation email.
- One address prints `{_userId, _ashareId, status: "invited"}` -- `_ashareId` is the new record's id (`_userId` is the account's). An address that already has a record fails with `(409): An end-user share for this user already exists in this account.` and exit 1.
- Two or more addresses use the bulk endpoint: `{summary, results}` with one outcome per address, and exit 1 when any failed. `--name` works only on a single invite, and there's no command to set the display name later.
- `--group` and `--grant` repeat, and apply to every address.

## 4. Grant access on a server

```bash
celigo mcp-servers assign-end-users <serverId> <ashareId> [<ashareId> ...] --capabilities tool:all,api:all,prompt:all,resource:all
celigo mcp-servers assign-groups <serverId> <groupId> [<groupId> ...] --capabilities pset:<setId>
celigo mcp-servers effective-access <serverId>
```

Each call replaces the listed targets' grant on that server with exactly `--capabilities` (at least one); the reply shows each target's resulting grants. No command removes a grant or edits an end user's grants on other servers -- revoke the record, or change it in the UI.

## 5. Manage groups and roles

```bash
celigo groups create < group.json                          # {"name": "Finance", "description": "..."}
celigo groups add-members <groupId> <ashareId> [<ashareId> ...]
celigo groups remove-members <groupId> <ashareId> [<ashareId> ...]
celigo groups set <groupId> '_roleIds=["<roleId>"]'        # pin a role; the rest of the group is kept
celigo groups get <groupId>
celigo groups delete <groupId>

celigo roles create < role.json
celigo roles set <roleId> description="Read access to finance tools"
celigo roles delete <roleId>
```

```json
{
  "name": "Finance tools",
  "description": "Read access to finance MCP tools",
  "resourceGrants": [
    { "resourceType": "mcpServer", "_resourceId": "<serverId>", "capabilities": ["pset:<setId>"] }
  ]
}
```

`add-members` and `remove-members` answer `{updated: n}`, where `n` counts every listed id, including ones already in (or already out of) the group. To change a group's or role's grants by hand, `get` it, edit `resourceGrants`, and `update` it with the complete document.

Change history for groups and roles, with old and new values:

```bash
celigo audit list --resource group:<groupId>      # not --resource-type with --resource-id: that route answers 500 for groups
celigo audit list --resource-type role
```

## 6. Grant through capability sets

Add, edit or remove sets in the server document with a full round trip, keeping every set's `_id`:

```bash
celigo mcp-servers get <serverId> > server.json
# edit permissionSets in server.json -- keep each existing set's _id
celigo mcp-servers update <serverId> < server.json
```

CLI 2026.10.1's `mcp-servers update --help` warns that dropping a set "orphans" its `pset:` grants; they are in fact rewritten into the set's members' capabilities (SKILL.md, step 6). `celigo mcp-servers set` on any other field keeps the sets, since it round-trips the whole document.

## 7. Check effective access

```bash
celigo mcp-servers effective-access <serverId>     # every end user who can reach the server, with each item's source
celigo end-users effective-access <ashareId>       # one person: groups, roles, granted and denied items per server
```

## 8. Suspend, revoke, or offboard

```bash
celigo end-users revoke <ashareId>                 # asks to confirm; -y skips
celigo end-users list                              # the record is gone
```

Suspending (keeping the grants) has no CLI command -- use the UI's toggle on the end user. For the workspace side of an offboarding, see managing-users.

## 9. Manage end users' own connections

```bash
celigo mcp-servers connections <serverId> --end-users   # each end user's copy; _userId is the end user
celigo end-users connection <connectionId>               # one copy, credentials masked
celigo end-users delete-connection <connectionId>        # the end user connects again on next use; -y skips the prompt
```
