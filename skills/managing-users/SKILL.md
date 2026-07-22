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

Read-only plus operational access. Can view all integrations, run flows, and troubleshoot errors (retry/resolve). Cannot modify configurations, enable/disable flows, or view connections and API tokens. Optionally grant `allowToEditRetryData` so monitor users can edit retry payloads.

### Integration-Only (Custom)

No account-wide `accessLevel`. Access is granted per-integration via `integrationAccessLevel[]`, each entry specifying an integration ID and either `monitor` or `manage`. The user sees only the integrations they are granted.

A common hybrid pattern: set `accessLevel: monitor` for baseline read-only access across all integrations, then use `integrationAccessLevel` to grant `manage` for specific integrations the user owns.

### Effective Permissions

A user's effective permissions are the **union** of both fields. On any integration granted by both, the **higher level wins** (`manage` over `monitor`). Account-wide `accessLevel` also covers every integration created later, whereas `integrationAccessLevel[]` applies only to the integrations explicitly listed and must be extended by hand as new integrations are added. In the UI these composed shapes surface as **Monitor all** (account-wide `monitor`), **Manage all** (account-wide `manage`), and **Custom** (per-integration only).

### Manage vs Monitor: Exact Allowances

The same two levels apply at both the account-wide and per-integration scopes. On the integrations each covers:

- **Manage** -- create, view, modify, and delete the integration's resources (connections, flows, exports, imports, APIs, Tools, scripts, lookup caches) and troubleshoot errors (retry, resolve, edit retry data, view error history). Cannot view or edit account-wide settings or API tokens (those stay with administrators and the owner).
- **Monitor** -- view resources (read-only on configuration), run flows on demand, and retry/resolve errored records. By default cannot edit the retry-data payload being retried (grant `allowToEditRetryData` to allow it), cannot modify resource definitions, cannot enable/disable flows, and cannot change settings.

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

<!-- TIER:2 -->

## How to Manage Users

### 1. Audit current users

Before inviting or changing permissions, understand the current state:

```bash
# List all users in the account
celigo users list

# Get details for a specific user
celigo users get <id>
```

Review `accessLevel`, `integrationAccessLevel`, `accepted` (pending invitations), and `disabled` status.

### 2. Decide the access strategy

Use the [Access Strategy Decision Matrix](#access-strategy-decision-matrix) to determine the right level. Key considerations:

- **Start with the least privilege needed.** Integration-only access is safest for users who only work with specific integrations.
- **Monitor + selective manage** is the most common hybrid -- the user sees everything but can only edit their integrations.
- **Administrator should be rare.** Only for users who need to manage account settings and other users.

### 3. Invite a new user

Use the `invite` command (there is no `users create` -- invitations are the only way to add users):

```bash
# Account-wide access
celigo users invite --email user@example.com --access-level monitor

# Integration-only access
celigo users invite --email user@example.com --integration <intId1>=manage --integration <intId2>=monitor

# Monitor baseline + manage for specific integrations
celigo users invite --email user@example.com --access-level monitor --integration <intId>=manage

# With security enforcement
celigo users invite --email user@example.com --access-level manage --force-mfa
celigo users invite --email user@example.com --access-level manage --force-sso
```

### 4. Update permissions for an existing user

Use `set` for simple field changes or `update` for full replacement:

```bash
# Change access level
celigo users set <id> accessLevel=manage

# Enable MFA requirement
celigo users set <id> accountMFARequired=true

# Grant APIM access
celigo users set <id> allowAccessToAPIM=true

# Allow monitor user to edit retry data
celigo users set <id> allowToEditRetryData=true

# Full update (GET + modify + PUT for complex changes like integrationAccessLevel)
celigo users get <id> > user.json
# Edit user.json to add/modify integrationAccessLevel array
celigo users update <id> < user.json
```

### 5. Disable or remove a user

```bash
# Disable a user (preserves record, blocks access)
celigo users set <id> disabled=true

# Re-enable a disabled user
celigo users set <id> disabled=false

# Permanently remove a user from the account
celigo users delete <id>
```

Disabling is preferred over deleting when you may need to restore access later.

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
celigo users list
celigo users get <id>
celigo users update <id> < user.json
celigo users set <id> key=value [key2=value2 ...]
celigo users delete <id>

# Invite
celigo users invite --email <email> [--access-level <level>] [--integration <id>=<level> ...]
  [--force-mfa] [--force-sso] [--allow-edit-retry-data]

# Account context
celigo profile whoami                  # Resolve the active token to its user (returns v1/tokenInfo)
```

<!-- TIER:3 -->

## Gotchas

1. **There is no `users create` command.** Use `celigo users invite` -- the API endpoint is `POST /v1/invite`, not `POST /v1/ashares`. The invite sends an email; the user appears with `accepted: false` until they accept.
2. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this automatically for simple field changes. For `integrationAccessLevel` array changes, use the GET-modify-PUT pattern with `update`.
3. **Omitting both `accessLevel` and `integrationAccessLevel` creates a useless invite.** The user will be in the account but have no access to anything. Always specify at least one.
4. **`integrationAccessLevel` is ignored when `accessLevel` is `manage` or `administrator`.** These levels already grant full access to all integrations. Only use `integrationAccessLevel` with `accessLevel: monitor` or with no `accessLevel`.
5. **Pending invitations consume a user slot.** Unaccepted invitations (`accepted: false`) count toward the account's user limit. Delete stale invitations to free slots.
6. **`disabled: true` blocks access but keeps the record.** The user cannot sign in or use the API. Use this instead of delete when you may need to restore access. Setting `disabled: false` re-enables the user.
7. **MFA and SSO are per-user, per-account settings.** `accountMFARequired` and `accountSSORequired` on the user record control enforcement for that user in this specific account. SSO requires the account to have SSO configured first.
8. **The internal API resource is `ashares`, not `users`.** The CLI maps `celigo users` to `/v1/ashares`. If scripting against the API directly, use the `ashares` endpoint.
9. **Celigo Support access is not a normal user.** It never appears in `celigo users list` and cannot be invited or fetched by id -- it is a single per-account support grant that auto-revokes at its mandatory `disableAfter` expiry. See [Celigo Support Access](#celigo-support-access).

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `409 Conflict` on invite | User already has access to the account | Use `users list` to find the existing user record; update permissions with `set` or `update` |
| `403 Forbidden` on invite or update | Current token does not have administrator access | Use a token from an administrator or owner account |
| `404 Not Found` on user get/update | Wrong user ID, or user was deleted | Verify ID with `users list` |
| `422 Validation Error` on invite | Missing email, invalid access level, or malformed `integrationAccessLevel` | Check `email` is present and `accessLevel` is one of: `monitor`, `manage`, `administrator` |
| User cannot see integrations | `integrationAccessLevel` entries reference wrong integration IDs | Verify integration IDs with `celigo integrations list`; update the user's access |
| User invited but cannot sign in | Invitation not accepted, or `disabled: true` | Check `accepted` field; resend invite or set `disabled=false` |
