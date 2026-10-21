# Managing Network Policies with the `celigo` CLI

The commands for each step of How to Manage Network Policies. Step numbers match [SKILL.md](../SKILL.md). Before the first write of a session, confirm which account and environment the CLI targets (`celigo profile whoami`) -- each environment has its own policies.

## How `set` and `update` Write

- `celigo network-policies set <id> key=value [...]` applies `name`, `description`, `ipAllowList` and `ipDenyList` as one atomic PATCH and keeps every other field. A list value replaces that whole list (`'ipAllowList=["10.0.0.0/8","203.0.113.5"]'`), `description=null` removes the description, and an index path such as `'ipDenyList[1]=null'` drops that one entry and keeps the rest.
- `celigo network-policies update <id> < policy.json` PUTs exactly the body you pipe in. A list the body leaves out is emptied and a missing `description` is removed -- the command exits 0 without a warning. Prefer `set`.
- `celigo mcp-servers set <serverId> _networkPolicyId=...` is one PATCH on the server (`_networkPolicyId` is on its PATCH whitelist with `name`, `disabled` and `policies`); nothing else on the server is sent or changed.

## 1. Check what exists and where it's assigned

```bash
celigo network-policies list                                  # id, name, both lists, lastModified
celigo network-policies list --fields all --sort-by name
celigo network-policies get <policyId>
celigo network-policies dependencies <policyId>               # alias: used-by
```

`dependencies` prints `{mcpservers, accesstokens, account: {workspaceUsers, workspaceUserEnvironments, endUsers, endUserEnvironments}}` -- every key present, empty when unassigned. With `--format table` it prints one row per assignment (`mcpServer`, `apiToken`, `workspaceUserSignIn`, `endUserSignIn`), or "Not assigned anywhere."

## 2. Decide the lists -- and check for lockout

```bash
celigo profile whoami                                         # token._id and token.name: the API token this profile uses
celigo network-policies dependencies <policyId>               # is that token under accesstokens?
```

If the profile's token is among the policy's `accesstokens`, or the profile uses a personal access token and the policy restricts workspace-user sign-in (`account.workspaceUsers`), keep the address this machine connects from on the allow list.

## 3. Create the policy

```bash
celigo network-policies create < policy.json                  # or --file policy.json
```

```json
{
  "name": "Corporate VPN egress",
  "description": "Office and VPN egress ranges.",
  "ipAllowList": ["203.0.113.0/24", "2001:db8::/32"],
  "ipDenyList": ["203.0.113.66"]
}
```

The output is the stored policy (`203.0.113.66` comes back as `203.0.113.66/32`). A refusal exits 1 with the platform's message, e.g. `(409): A network policy with this name already exists in the account.`

## 4. Assign it

```bash
celigo mcp-servers set <serverId> _networkPolicyId=<policyId>
celigo network-policies dependencies <policyId>               # the server is listed under mcpservers
```

There's no CLI command for a token's or sign-in policy -- walk the user through the integrator.io UI.

## 5. Edit a policy

```bash
celigo network-policies set <policyId> 'ipAllowList=["10.0.0.0/8","203.0.113.5"]'   # replaces the allow list
celigo network-policies set <policyId> 'ipDenyList[1]=null'                          # drops one deny entry
celigo network-policies set <policyId> name="Corporate VPN egress (EU)" description=null
celigo network-policies audit <policyId>                                             # change history, newest first
```

## 6. Unassign or delete

```bash
celigo mcp-servers set <serverId> _networkPolicyId=null       # unassigns (a PATCH remove)
celigo network-policies get <policyId> > policy-backup.json   # keep the lists before deleting
celigo network-policies delete <policyId>                     # refused while assigned: 409, exit 1, and a hint naming dependencies and --force
celigo network-policies delete <policyId> --force             # clears every assignment, then deletes (-y skips the prompt)
```

After the delete, `network-policies get` and `network-policies audit` answer 404; the history stays in the account audit log:

```bash
celigo audit list --resource-type networkpolicy --jq '.[] | select(._resourceId == "<policyId>")'
```

Don't use `celigo recycle-bin` for network policies: `recycle-bin list --type networkpolicies` currently lists the environment's live policies and leaves the deleted ones out, so `recycle-bin restore` and `purge` can't find a deleted policy ("No recycle-bin entry found"), and they refuse a live one with 404. To bring a policy back, create it again (step 3) with the backup's `name`, `description` and both lists -- the name is free once the policy is deleted.

## 7. Check whether a policy explains a refused caller

```bash
celigo mcp-servers get <serverId> --jq '._networkPolicyId'    # null when the server has no policy
celigo network-policies get <policyId>
celigo network-policies dependencies <policyId>               # the tokens and sign-in settings it also restricts
```

A token's own policy is shown only in the UI, on the API tokens page.
