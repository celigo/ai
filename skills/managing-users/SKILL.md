---
name: managing-users
description: Manage Celigo account users -- inviting users, updating permissions, configuring access levels (administrator, manage, monitor, integration-only), enforcing MFA/SSO, and disabling accounts. Use when adding team members, changing permissions, auditing access, or managing user lifecycle.
---

<!-- TIER:1 -->

# Managing Users

A user (internally called an "ashare") represents a **person's access grant** to a Celigo account, defining what they can see and do. Concerns when managing users:

- **Access strategy** -- choosing between account-wide access (administrator, manage, monitor) and per-integration access for least-privilege control
- **Integration-level permissions** -- granting manage or monitor access to specific integrations, optionally combined with account-wide monitor as a baseline
- **Security enforcement** -- requiring MFA or SSO per user to meet compliance requirements
- **Feature flags** -- controlling access to APIM features and whether monitor-level users can edit retry data
- **Lifecycle** -- inviting, disabling, and removing users as team composition changes

Users are an account administration concern, not a flow or integration resource.

## Access Strategies

There are four strategies for granting access. Choose based on the principle of least privilege.

### Administrator

Full account administration. Can edit all resources, manage users, and change account settings. Cannot transfer ownership or manage owner permissions.

### Manage (Account-Wide)

Can edit all integrations and resources. Cannot view or edit account settings or manage other users, and can invite users only while the account's invite policy lets every user invite (an account setting, changed in the UI).

### Monitor (Account-Wide)

Read-only plus operational access. Can view all integrations, run flows, and troubleshoot errors (retry/resolve). Cannot modify configurations, enable/disable flows, view connections, or see account API tokens. Optionally grant `allowToEditRetryData` so monitor users can edit retry payloads.

### Integration-Only (Custom)

No account-wide `accessLevel`. Access is granted per-integration via `integrationAccessLevel[]`, each entry specifying an integration ID and either `monitor` or `manage`. The user sees only the integrations they are granted.

For access to specific integrations only, **omit `accessLevel` entirely**. Any account-wide value, `monitor` included, shows the user every integration in the account, including ones created later, so adding one next to the per-integration grants widens access instead of limiting it.

A common hybrid pattern, for a user who should see everything: set `accessLevel: monitor` for baseline read-only access across all integrations, then use `integrationAccessLevel` to grant `manage` for specific integrations the user owns.

### Effective Permissions

A user's effective permissions are the **union** of both fields. On any integration granted by both, the **higher level wins** (`manage` over `monitor`). Account-wide `accessLevel` also covers every integration created later, whereas `integrationAccessLevel[]` applies only to the integrations explicitly listed and must be extended by hand as new integrations are added. In the UI these composed shapes surface as **Monitor all** (account-wide `monitor`), **Manage all** (account-wide `manage`), and **Custom** (per-integration only).

### Manage vs Monitor: Exact Allowances

The same two levels apply at both the account-wide and per-integration scopes. On the integrations each covers:

- **Manage** -- create, view, modify, and delete the integration's resources (connections, flows, exports, imports, APIs, Tools, scripts, lookup caches) and troubleshoot errors (retry, resolve, edit retry data, view error history). Cannot view or edit account-wide settings.
- **Monitor** -- view resources (read-only on configuration), run flows on demand, and retry/resolve errored records. By default cannot edit the retry-data payload being retried (grant `allowToEditRetryData` to allow it), cannot modify resource definitions, cannot enable/disable flows, and cannot change settings.

Manage and monitor users can't see or create account (service) tokens, but each can create and manage their own personal access tokens, which carry exactly their own permissions (see [managing-api-tokens](../managing-api-tokens/SKILL.md#personal-access-tokens-pats-vs-account-api-tokens)).

## Quick Reference

### Access Strategy Decision Matrix

| User needs to... | Strategy | `accessLevel` | `integrationAccessLevel` |
|---|---|---|---|
| Administer the account, manage users | Administrator | `administrator` | omit |
| Edit all integrations, no account admin | Manage | `manage` | omit |
| View all, run/retry flows, no edits | Monitor | `monitor` | omit |
| View all + manage specific integrations | Monitor + selective manage | `monitor` | `[{_integrationId, accessLevel: "manage"}]` |
| Access only specific integrations | Integration-only | omit (any value shows every integration) | `[{_integrationId, accessLevel}]` |

### Minimum Required Fields

Inviting a user requires at minimum:

- `emails` -- the addresses to invite (the only required field; `email`, one address, on the single-invite route)
- One of: `accessLevel` or `integrationAccessLevel` (technically optional; omitting both creates a user with no access)

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Invite fields:** [invite-request.yml](references/schemas/invite-request.yml) -- `POST /v1/invite/multiple` body (`emails[]`)
- **Update fields:** [request.yml](references/schemas/request.yml) -- `PUT /v1/ashares/{id}` body (accessLevel, integrationAccessLevel, MFA/SSO, feature flags)
- **Response shape:** [response.yml](references/schemas/response.yml) -- includes `accepted`, `dismissed`, `lastSignIn`, `sharedWithUser` embedded object

## Related Skills

- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- users with monitor access troubleshoot errors here
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- understanding what manage vs monitor users can do with flows
- [building-apis > Quick Reference](../building-apis/SKILL.md#quick-reference) -- APIM access controlled by `allowAccessToAPIM` flag
- [managing-network-policies > Where a Policy Applies](../managing-network-policies/SKILL.md#where-a-policy-applies) -- restrict where workspace users (and their personal access tokens) can sign in from, by IP
- [managing-end-users > How Access Composes](../managing-end-users/SKILL.md#how-access-composes) -- MCP end users: a separate record type with its own grants, groups and roles

<!-- TIER:2 -->

## How to Manage Users

### 1. Audit current users

Before inviting or changing permissions, understand the current state:

```bash
# List all users in the account, with complete records
celigo workspace-users list --fields all

# Get details for a specific user
celigo workspace-users get <id>
```

Review `accessLevel`, `integrationAccessLevel`, `accepted` (pending invitations), `disabled`, and `provisionedBy`. The default list rows omit `integrationAccessLevel`, `disabled`, `dismissed`, and `provisionedBy`, so without `--fields all` an integration-only user looks like a user with no access.

The account owner has no access record, so the list never shows them (the MCP server's `list_users` adds the owner as a row with `accessLevel: "owner"` and no `_ashareId`). Count the owner too when reviewing who can administer the account. No invite, update, disable, or delete applies to the owner, and only the owner can hand the account to someone else -- a transfer the receiving user accepts, which neither the CLI nor the MCP server offers.

### 2. Decide the access strategy

Use the [Access Strategy Decision Matrix](#access-strategy-decision-matrix) to determine the right level. Key considerations:

- **Start with the least privilege needed.** Integration-only access is safest for users who only work with specific integrations.
- **Monitor + selective manage** is the most common hybrid -- the user sees everything but can only edit their integrations.
- **Administrator should be rare.** Only for users who need to manage account settings and other users.

### 3. Invite a new user

Use the `invite` command (there is no `workspace-users create`: users join by invitation, or from the identity provider when the account provisions users through SCIM). The owner and administrators can invite; manage and monitor users can too while the account's invite policy lets every user invite. The invite body takes the same access fields as an update -- `accessLevel`, `integrationAccessLevel`, and `accountMFARequired` (the CLI's `--force-mfa`) -- so put the MFA requirement in the invite itself: a follow-up update has to resend the grants and the MFA flag, or it clears them (gotcha 2). The body for monitor access to one integration only, with MFA required, has no `accessLevel` at all:

```json
{
  "emails": ["user@example.com"],
  "integrationAccessLevel": [{ "_integrationId": "<integrationId>", "accessLevel": "monitor" }],
  "accountMFARequired": true
}
```

That's the body of the published invite route, `POST /v1/invite/multiple`, which the CLI sends. It answers 200 with one result per address, so read every result (see [Common Errors](#common-errors)). The MCP server's `manage_user` invites one address per call (`email`), with the same access fields in its `body`.

```bash
# Account-wide access
celigo workspace-users invite --email user@example.com --access-level monitor

# Integration-only access
celigo workspace-users invite --email user@example.com --integration <intId1>=manage --integration <intId2>=monitor

# Monitor baseline + manage for specific integrations
celigo workspace-users invite --email user@example.com --access-level monitor --integration <intId>=manage

# With security enforcement
celigo workspace-users invite --email user@example.com --access-level manage --force-mfa
celigo workspace-users invite --email user@example.com --access-level manage --force-sso

# One integration only, monitor access, MFA required (no --access-level)
celigo workspace-users invite --email user@example.com --integration <intId>=monitor --force-mfa
```

### 4. Update permissions for an existing user

Before re-levelling, disabling, or deleting a user, check `provisionedBy`. `scim` means the identity provider manages them: its next push overwrites `accessLevel` and the enabled state, so make durable changes (access level, deactivation) in the IdP and treat a change here as temporary. Integration-level grants made here are never touched by SCIM.

Use `set` for simple field changes or `update` for full replacement:

```bash
# Change access level
celigo workspace-users set <id> accessLevel=manage

# Enable MFA requirement
celigo workspace-users set <id> accountMFARequired=true

# Grant APIM access
celigo workspace-users set <id> allowAccessToAPIM=true

# Allow monitor user to edit retry data
celigo workspace-users set <id> allowToEditRetryData=true

# Full update (GET + modify + PUT for complex changes like integrationAccessLevel)
celigo workspace-users get <id> > user.json
# Edit user.json to add/modify integrationAccessLevel array
celigo workspace-users update <id> < user.json
```

### 5. Disable or remove a user

```bash
# Disable a user (preserves record, blocks access)
celigo workspace-users disable <id>

# Re-enable a disabled user
celigo workspace-users enable <id>

# Permanently remove a user from the account
celigo workspace-users delete <id>
```

Disabling is preferred over deleting when you may need to restore access later. `disable` and `enable` call the `PUT /v1/ashares/{id}/disable` toggle, the only way to change `disabled`: the CLI refuses `set <id> disabled=…` and names these commands, and a `disabled` field in an `update` body is accepted but not applied. `<id>` is the access-record `_id` from `workspace-users list` (the MCP server's `_ashareId`), not the person's user id, and a pending invitation can't be disabled until the user accepts or declines it. For a user with `provisionedBy: scim`, disable them in the identity provider: its next push overwrites the enabled state set here.

A user's personal access tokens follow the user record: disabling blocks them until the user is re-enabled, and deleting the user revokes them. Account API tokens stay valid whoever created them, and any administrator can reveal their values, so when an administrator leaves, rotate the ones they could have copied ([managing-api-tokens](../managing-api-tokens/SKILL.md#personal-access-tokens-pats-vs-account-api-tokens)).

Workspace users aren't the only people with access. MCP end users have their own access records, listed separately (`celigo end-users list`), and disabling or deleting a workspace user changes only the workspace record. When offboarding someone, check both lists -- an end-user record shows `hasWorkspaceShare: true` when the person also has a workspace record -- and revoke the end-user record too if their access should end (`celigo end-users revoke <ashareId>`; see [managing-end-users > 8. Suspend, revoke, or offboard](../managing-end-users/SKILL.md#8-suspend-revoke-or-offboard)).

## Celigo Support Access

Separate from inviting people, an account can let **Celigo's own support staff** sign in to troubleshoot. This appears on the Users page as a single built-in **Celigo Support** row (`support_access@celigo.com`), disabled by default, that an administrator enables like a toggle.

It is a **distinct resource from a user**: under the hood it is a *support share*, not an ashare, and there is exactly **one per account** (no per-person records). It is never invited or listed alongside the other users, and it is managed only in the UI: on that row, an administrator turns it on, changes its scope or expiry, and turns it off. API tokens can't reach it and neither the CLI nor the MCP server has a command for it, so an agent can recommend the settings but not apply them. To review what support staff did, filter the audit log by the support user (`celigo audit list --user-id support`; on the MCP server, `list_audit_log_entries` with `_byUserId: "support"`); changes to the grant itself are under resource type `supportshare` (`celigo audit list --resource-type supportshare`).

Its access model is **identical to a user**: compose `accessLevel` and `integrationAccessLevel` with the same shapes (account-wide, integration-only/Custom, or account-wide `monitor` + selective `manage`), and `allowToEditRetryData` behaves the same way.

The one real difference is that **expiry is mandatory**. Support access carries a `disableAfter` timestamp and auto-revokes when it passes; the Celigo UI recommends roughly 5 days. There is no default, so a duration must be set explicitly, and it can be revoked early at any time.

Whether non-administrators may turn support access on is an account setting (`allowAllToInviteSupport`, changed in the UI); no per-user permission controls it. The setting only lets them turn it on -- it doesn't grant support access by itself.

## CLI Commands

```bash
# CRUD (no "create" -- use "invite" instead)
celigo workspace-users list
celigo workspace-users get <id>
celigo workspace-users update <id> < user.json
celigo workspace-users set <id> key=value [key2=value2 ...]
celigo workspace-users delete <id>

# Disable / re-enable (the only way to change `disabled`)
celigo workspace-users disable <id> [-y]
celigo workspace-users enable <id>

# Invite
celigo workspace-users invite --email <email> [--access-level <level>] [--integration <id>=<level> ...]
  [--force-mfa] [--force-sso] [--allow-edit-retry-data]

# Re-send an invitation the user declined (dismissed: true only)
celigo workspace-users reinvite <id>

# Account context
celigo profile whoami                  # Resolve the active token to its user (returns v1/tokenInfo)
```

Every command here that changes a user needs a CLI profile in full mode (gotcha 11).

On the MCP server, `list_users` reads the users -- with the owner added, and without `accountMFARequired`, `accountSSORequired`, or `provisionedBy` -- and `manage_user` runs `invite`, `update_permissions`, `disable`, and `enable` on the `_ashareId` it lists. `update_permissions` sends exactly the `body` you give it (gotcha 2). It has no re-invite or delete: use the CLI or the UI for those.

<!-- TIER:3 -->

## Gotchas

1. **There is no `workspace-users create` command.** Use `celigo workspace-users invite` -- the API route is `POST /v1/invite/multiple` (one result per address), not `POST /v1/ashares`. The invite sends an email; the user appears with `accepted: false` until they accept.
2. **An update replaces the user's access settings.** Omitting `integrationAccessLevel` or `accountMFARequired` clears it (only `accountSSORequired` keeps its stored value). Read the user first and send `accessLevel`, the full `integrationAccessLevel`, and `accountMFARequired` on every update: `celigo workspace-users set` does this for you, and for `integrationAccessLevel` array changes use GET, modify, then `update`. Where you can't read `accountMFARequired` (the MCP server's `list_users` doesn't return it, and `manage_user`'s `update_permissions` sends exactly the `body` you give it), ask whether MFA must stay required and send it explicitly, or make the change in the UI or the CLI. An update can't leave a user with no access -- a body with neither `accessLevel` nor a non-empty `integrationAccessLevel` is refused -- so to remove all access, disable or delete the user.
3. **Omitting both `accessLevel` and `integrationAccessLevel` creates a useless invite.** The user will be in the account but have no access to anything. Always specify at least one.
4. **`integrationAccessLevel` is ignored when `accessLevel` is `manage` or `administrator`.** These levels already grant full access to all integrations. Only use `integrationAccessLevel` with `accessLevel: monitor` or with no `accessLevel`.
5. **Only a declined invitation can be re-sent.** `celigo workspace-users reinvite <id>` works for a user with `dismissed: true`; for anyone else it fails with 400 `User has not dismissed the invite.` A still-pending invitation has no re-send: if its email was lost, delete the pending record and invite the address again with the same access and MFA settings. Pending invitations don't count against any license limit (the license has no user count), so never delete other people's invitations to make room.
6. **Disabling blocks access but keeps the record.** The user cannot sign in or use the API, their personal access tokens included, until re-enabled. Use this instead of delete when you may need to restore access. Only `celigo workspace-users disable` / `enable` (the `PUT /v1/ashares/{id}/disable` toggle) change it -- the CLI refuses `set <id> disabled=true`, and a `disabled` field in an `update` body is ignored.
7. **MFA and SSO are per-user, per-account settings.** `accountMFARequired` and `accountSSORequired` on the user record control enforcement for that user in this specific account. SSO requires the account to have SSO configured first. While the account requires SSO for all users (Account > Security > Single sign-on, in the UI), that setting governs every user but the owner: an `accountSSORequired` you send is ignored and the stored value kept. The owner's SSO requirement is a separate setting only the owner changes. Resetting someone's MFA after a lost authenticator happens in the UI -- no API route or CLI command does it -- and `sharedWithUser.allowedToResetMFA` on the list says whether you may.
8. **The internal API resource is `ashares`, not `users`.** The CLI maps `celigo workspace-users` (named `celigo users` before 2026.8.7, still a hidden alias) to `/v1/ashares`. If scripting against the API directly, use the `ashares` endpoint.
9. **A user who can't see an integration has integration-level grants that don't list it.** Users with account-wide access see every integration, including new ones; integration-only users see just the ones they're granted. Answer with both the cause and the fix -- an administrator adds that integration to the user's grants -- and make the change only if asked (gotcha 2 applies).
10. **Celigo Support access is not a normal user.** It never appears in `celigo workspace-users list` and cannot be invited or fetched by id -- it is a single per-account support grant, managed only in the UI, that auto-revokes at its mandatory `disableAfter` expiry. See [Celigo Support Access](#celigo-support-access).
11. **Every user change needs a full-mode CLI profile.** `invite`, `reinvite`, `set`, `update`, `disable`, `enable`, and `delete` are refused under a read or operate profile (a workspace user has no operate-level fields), and raising a profile's mode is a person's step at a terminal. Say what's needed instead of working around the refusal.

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| Invite result `already has access` (a per-email status inside a successful response; the command still exits 0) | The address already has a user record in this account | Find it with `workspace-users list` and change its access with `set` or `update` instead of inviting again; after a batch invite, read every row's result |
| Invite result `status 422` for an address (the platform's `create_not_allowed`: "New accounts must be attached to a valid business email address.") | The address has no integrator.io login yet, and the platform creates new logins only for business email addresses | Invite the person's work address. The CLI prints only `status 422` for it |
| `400` on invite (the whole request refused) | A malformed body -- for example no `emails`, an `accessLevel` outside `monitor`, `manage`, `administrator`, or a malformed `integrationAccessLevel` | Fix the body; problems with one address come back inside the 200 instead (rows above) |
| `403 Forbidden` on invite or update | The caller isn't the owner or an administrator (a manage or monitor user can invite only while the account's invite policy lets every user invite) | Use an owner's or administrator's credentials, or have one of them make the change |
| `403 access_restricted` ("This request can only be made through the production environment.") on a user update | The token or profile belongs to a sandbox environment | Change users from production |
| `404 Not Found` on a user get, update, or disable | The person's user id (`sharedWithUser._id`, `_sharedWithUserId`, or the MCP server's `list_users` `_id`) sent instead of the access-record `_id`; an end user's id (these routes read workspace records only); or the user was deleted | Take the access-record `_id` from `workspace-users list` (`_ashareId` on the MCP server); look end users up with `celigo end-users list` |
| `400` or `422` on an update saying to provide account level or integration level access | The body grants no access: no `accessLevel`, and no or an empty `integrationAccessLevel` | Send the user's access with every update (gotcha 2); to remove all access, disable or delete the user |
| `400` "userType is immutable after creation." on an update | A body copied from a GET still carries `userType` | Remove `userType` before sending (the CLI's `set` and `update` drop it for you) |
| A user can't see an integration that others can | The user has integration-level access only (no account-wide `accessLevel`; shown as Custom in the UI, `tile` in some user listings), and their `integrationAccessLevel` doesn't list that integration -- typical for one created after the grant. Users with account-wide access see every integration | An administrator adds the integration to the user's grants: read the user, append the entry, and update with `accountMFARequired` resent (gotcha 2). Give account-wide access instead only if they should see everything |
| User invited but cannot sign in | The invitation is still pending (`accepted: false`) or was declined (`dismissed: true`); the user is `disabled: true`; or the invitee still owns integrations, flows, or syncs in their own account, which blocks accepting | Declined: `celigo workspace-users reinvite <id>`. Pending with the email lost: delete the record and invite again (gotcha 5). Disabled: `celigo workspace-users enable <id>`. Still owns resources: they transfer or delete them, then accept |
