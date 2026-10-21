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

Can edit all integrations and resources. Cannot view or edit account settings, invite users, or manage other users.

### Monitor (Account-Wide)

Read-only plus operational access. Can view all integrations, run flows, and troubleshoot errors (retry/resolve). Cannot modify configurations, enable/disable flows, view connections, or see account API tokens. Optionally grant `allowToEditRetryData` so monitor users can edit retry payloads.

### Integration-Only (Custom)

No account-wide `accessLevel`. Access is granted per-integration via `integrationAccessLevel[]`, each entry specifying an integration ID and either `monitor` or `manage`. The user sees only the integrations they are granted.

A common hybrid pattern: set `accessLevel: monitor` for baseline read-only access across all integrations, then use `integrationAccessLevel` to grant `manage` for specific integrations the user owns.

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
| Access only specific integrations | Integration-only | omit | `[{_integrationId, accessLevel}]` |

### Minimum Required Fields

Inviting a user requires at minimum:

- `email` -- the user's email address (the only required field)
- One of: `accessLevel` or `integrationAccessLevel` (technically optional; omitting both creates a user with no access)

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Invite fields:** [invite-request.yml](references/schemas/invite-request.yml) -- `POST /v1/invite` body
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

### 2. Decide the access strategy

Use the [Access Strategy Decision Matrix](#access-strategy-decision-matrix) to determine the right level. Key considerations:

- **Start with the least privilege needed.** Integration-only access is safest for users who only work with specific integrations.
- **Monitor + selective manage** is the most common hybrid -- the user sees everything but can only edit their integrations.
- **Administrator should be rare.** Only for users who need to manage account settings and other users.

### 3. Invite a new user

Use the `invite` command (there is no `workspace-users create`: users join by invitation, or from the identity provider when the account provisions users through SCIM):

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

Disabling is preferred over deleting when you may need to restore access later. `disable` and `enable` call the `PUT /v1/ashares/{id}/disable` toggle, the only way to change `disabled` -- a `disabled` value sent through `set` or `update` is accepted but not applied. `<id>` is the access-record `_id` from `workspace-users list`, and a pending invitation can't be disabled until the user accepts or declines it. For a user with `provisionedBy: scim`, disable them in the identity provider: its next push overwrites the enabled state set here.

Workspace users aren't the only people with access. MCP end users have their own access records, listed separately (`celigo end-users list`), and disabling or deleting a workspace user changes only the workspace record. When offboarding someone, check both lists -- an end-user record shows `hasWorkspaceShare: true` when the person also has a workspace record -- and revoke the end-user record too if their access should end (`celigo end-users revoke <ashareId>`; see [managing-end-users > 8. Suspend, revoke, or offboard](../managing-end-users/SKILL.md#8-suspend-revoke-or-offboard)).

## Celigo Support Access

Separate from inviting people, an account can let **Celigo's own support staff** sign in to troubleshoot. This appears on the Users page as a single built-in **Celigo Support** row (`support_access@celigo.com`), disabled by default, that an administrator enables like a toggle.

It is a **distinct resource from a user**: under the hood it is a *support share*, not an ashare, and there is exactly **one per account** (no per-person records) at a fixed, id-less endpoint. It is never invited or listed alongside the other users; instead an administrator operates the single grant directly:

- **Enable** -- turn it on or change its scope/expiry. This is an upsert -- calling it again overwrites the current grant.
- **Disable** -- revoke it (no id needed).
- **Describe** -- report whether it is enabled and, if so, its scope and expiry.

Its access model is **identical to a user**: compose `accessLevel` and `integrationAccessLevel` with the same shapes (account-wide, integration-only/Custom, or account-wide `monitor` + selective `manage`), and `allowToEditRetryData` behaves the same way.

The one real difference is that **expiry is mandatory**. Support access carries a `disableAfter` timestamp and auto-revokes when it passes; the Celigo UI recommends roughly 5 days. There is no default, so a duration must be set explicitly, and it can be revoked early at any time.

Two account/user controls are easy to confuse with enabling support access itself:

- **`allowAllToInviteSupport`** -- an account-level setting controlling whether non-administrators may enable support access at all.
- **Celigo Support invite permission** -- a per-user permission that lets a specific non-admin enable support access for the integrations they can already reach. Holding it does not grant support access; it only lets that user turn it on.

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

# Account context
celigo profile whoami                  # Resolve the active token to its user (returns v1/tokenInfo)
```

<!-- TIER:3 -->

## Gotchas

1. **There is no `workspace-users create` command.** Use `celigo workspace-users invite` -- the API endpoint is `POST /v1/invite`, not `POST /v1/ashares`. The invite sends an email; the user appears with `accepted: false` until they accept.
2. **An update replaces the user's access settings.** Omitting `integrationAccessLevel` or `accountMFARequired` clears it (only `accountSSORequired` keeps its stored value). Read the user first and send `accessLevel`, the full `integrationAccessLevel`, and `accountMFARequired` on every update: `celigo workspace-users set` does this for you, and for `integrationAccessLevel` array changes use GET, modify, then `update`. Where you can't read `accountMFARequired` (the MCP server's user list doesn't return it), ask whether MFA must stay required and send it explicitly, or make the change in the UI or the CLI.
3. **Omitting both `accessLevel` and `integrationAccessLevel` creates a useless invite.** The user will be in the account but have no access to anything. Always specify at least one.
4. **`integrationAccessLevel` is ignored when `accessLevel` is `manage` or `administrator`.** These levels already grant full access to all integrations. Only use `integrationAccessLevel` with `accessLevel: monitor` or with no `accessLevel`.
5. **Pending invitations consume a user slot.** Unaccepted invitations (`accepted: false`) count toward the account's user limit. Delete stale invitations to free slots.
6. **Disabling blocks access but keeps the record.** The user cannot sign in or use the API. Use this instead of delete when you may need to restore access. Only `celigo workspace-users disable` / `enable` (the `PUT /v1/ashares/{id}/disable` toggle) change it -- `set <id> disabled=true` is accepted and silently ignored.
7. **MFA and SSO are per-user, per-account settings.** `accountMFARequired` and `accountSSORequired` on the user record control enforcement for that user in this specific account. SSO requires the account to have SSO configured first.
8. **The internal API resource is `ashares`, not `users`.** The CLI maps `celigo workspace-users` (named `celigo users` before 2026.8.7, still a hidden alias) to `/v1/ashares`. If scripting against the API directly, use the `ashares` endpoint.
9. **Celigo Support access is not a normal user.** It never appears in `celigo workspace-users list` and cannot be invited or fetched by id -- it is a single per-account support grant that auto-revokes at its mandatory `disableAfter` expiry. See [Celigo Support Access](#celigo-support-access).

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| Invite result `already has access` (a per-email status inside a successful response; the command still exits 0) | The address already has a user record in this account | Find it with `workspace-users list` and change its access with `set` or `update` instead of inviting again; after a batch invite, read every row's result |
| `403 Forbidden` on invite or update | Current token does not have administrator access | Use a token from an administrator or owner account |
| `404 Not Found` on user get/update | Wrong user ID, or user was deleted | Verify ID with `workspace-users list` |
| `422 Validation Error` on invite | Missing email, invalid access level, or malformed `integrationAccessLevel` | Check `email` is present and `accessLevel` is one of: `monitor`, `manage`, `administrator` |
| User cannot see integrations | `integrationAccessLevel` entries reference wrong integration IDs | Verify integration IDs with `celigo integrations list`; update the user's access |
| User invited but cannot sign in | Invitation not accepted, or `disabled: true` | Check `accepted` field; resend the invite, or re-enable with `celigo workspace-users enable <id>` |
