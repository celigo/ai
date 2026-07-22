---
name: managing-api-tokens
description: Manage Celigo API tokens (the accesstoken resource) -- bearer credentials that authenticate inbound programmatic calls into integrator.io's REST API, custom APIs, and MCP servers. Covers personal access tokens (PATs) versus account-level API tokens, least-privilege scoping versus full access, the revoke-before-delete lifecycle, auto-purge expiry, and keeping token secrets out of chat. Use when creating, scoping, rotating, revoking, or deleting API tokens or PATs, or when distinguishing an integrator.io API token from a connection's OAuth access token.
---

<!-- TIER:1 -->

# Managing API Tokens

An API token (the API resource `accesstoken`, shown as **API tokens** in the UI) is a **bearer credential that authenticates programmatic calls _into_ Celigo** -- the native integrator.io REST API, any custom APIs you have built in the account, and your MCP servers. It is the machine-to-machine equivalent of a user login: where a person signs in through the UI, a script presents an API token. Managing tokens is an **owner/administrator** capability.

Two things to keep straight up front:

- **Direction is inbound.** An API token governs traffic coming *into* Celigo -- the opposite of connections and iClients, which authenticate Celigo's outbound calls *out to* external systems. This is the most common conceptual mix-up; see [API Token vs Connection OAuth Token](#api-token-vs-connection-oauth-token).
- **The token value is a real secret.** It is masked as `******` in normal responses and shown in full only once, at generation. Treat it like a password: never paste a real token into chat and never read one back.

Concerns when managing API tokens:

- **Token kind** -- a **personal access token (PAT)** tied to your own user vs an **account API token** owned by the account. See [Personal Access Tokens (PATs) vs Account API Tokens](#personal-access-tokens-pats-vs-account-api-tokens).
- **Access scope** -- `fullAccess` (whole account) vs least-privilege resource scoping (`_connectionIds`, `_exportIds`, `_importIds`, `_apiIds`, `_mcpServerIds`). The two are mutually exclusive.
- **Lifecycle** -- generate, revoke, delete (a token must be revoked before it can be deleted).
- **Expiry** -- optional `autoPurgeAt` self-destruct for short-lived tokens.
- **Secret handling** -- capture the value once at generation; rotate rather than reuse a leaked token.
- **Auto-managed variants** -- connector integration tokens and APIM tokens you do not hand-craft.

API tokens are an account-administration concern, not a flow or integration resource.

## What API Tokens Are For

Anything that needs to talk to Celigo without a human at a keyboard:

- **CI/CD pipelines** -- a deploy step that clones an integration, flips a setting, or runs a flow on release.
- **Monitoring and alerting** -- a script polling flow or error state and paging on failures, or pushing metrics to an observability stack.
- **Calling your custom APIs and MCP servers** -- external callers authenticate into APIs and MCP servers you have published using an API token (one of an MCP server's accepted auth modes).
- **Ad-hoc API access** -- hitting the integrator.io REST API from Postman, a notebook, or a one-off script.

When a user says "a token for our script", "authenticate our pipeline to Celigo", "call the Celigo API from our server", or "let our monitoring hit the API" -- that is an API token.

## API Token vs Connection OAuth Token

"Access token" is overloaded -- the underlying resource is even named `accesstoken` -- so this is the mix-up to head off first. Same two words, opposite directions, different resources:

| | integrator.io API token | Connection OAuth access token |
|---|---|---|
| Direction | **Inbound** -- authenticates calls *into* Celigo | **Outbound** -- authenticates Celigo's calls *out to* an external system |
| Proves identity | An external caller → Celigo | Celigo → the external system |
| Lives on | The account (`accesstoken` resource -- this skill) | A specific connection (produced by its OAuth flow, optionally via an iClient) |
| Managed with | This skill | [configuring-connections](../configuring-connections/SKILL.md) |

The test: **who is proving identity to whom?** An external caller proving it may use *your* account = API token (this skill). Celigo proving it may call *their* system = the connection's OAuth token.

It is also distinct from **user permissions**: a user record is a *person's* access to the account; an API token is a *machine's*. See [managing-users](../managing-users/SKILL.md).

## Personal Access Tokens (PATs) vs Account API Tokens

Celigo has two kinds of inbound bearer token. Both live under the account's **API tokens** view, and both are sent the same way (`Authorization: Bearer <token>`) -- the integrator.io REST API and the Celigo CLI accept either:

| | Personal access token (PAT) | Account API token |
|---|---|---|
| Who can create one | Any user in the account -- including manage and monitor roles | Owner/administrator only |
| Whose access it grants | Yours -- it inherits your own effective permissions | The account's -- `fullAccess` or an explicit resource-id allow-list |
| Scoping | None to configure -- it always mirrors what you can do | `fullAccess` vs scope arrays (this skill's main concern) |
| Expiry | **Defaults to 90 days**; `autoPurgeAt` up to 90 days out | Optional `autoPurgeAt` up to 30 days out; otherwise long-lived |
| Managed by | The owning user only -- other users' PATs are listed but read-only to you | Any owner/administrator |
| Best for | Your own CLI profile, scripts, and ad-hoc API calls | Shared automation: CI/CD, monitoring, external callers of APIs and MCP servers |

Rule of thumb: **a PAT authenticates *you*; an account API token authenticates *a system*.** A PAT is the quick self-service option -- generate one for yourself and go -- but it is bound to your account membership (`tokenType: "ashare"`): it tracks your permission changes immediately, stops working if your membership is removed, and its 90-day default expiry *will* arrive mid-quarter. For automation that must outlive any one person -- CI/CD especially -- prefer a least-privilege account API token, or at minimum calendar the PAT rotation.

## Token Anatomy

| Field | Type | Purpose |
|---|---|---|
| `name` / `description` | string | What the token is for -- the only thing identifying it in the UI and audit logs. Use a purpose name (`CI/CD Pipeline`, `Prod Monitoring`). |
| `token` | string (secret) | The bearer value. **Masked as `******`** in standard responses; the real value is shown only at generation. |
| `fullAccess` | boolean | Token can reach any resource in the account. Mutually exclusive with the scope arrays. |
| `_connectionIds`, `_exportIds`, `_importIds`, `_apiIds`, `_mcpServerIds` | array of ids | Least-privilege scope -- the token reaches only the listed resources. Mutually exclusive with `fullAccess`. |
| `revoked` | boolean | `true` disables the token (authentication stops immediately). Must be `true` before the token can be deleted. |
| `autoPurgeAt` | timestamp | Optional self-destruct time (within 30 days for account API tokens; up to 90 days for PATs). The record is removed automatically once it passes. |
| `apim` | boolean | Marks an APIM-managed token. **APIM tokens cannot be deleted.** |
| `_integrationId` / `_connectorId` | id | Present on auto-managed connector integration tokens (set by the platform, not hand-crafted). |
| `tokenType` / `_aShareId` | string / id | Present on PATs: `tokenType: "ashare"` binds the token to the creating user's account membership. Absent on account API tokens. |

The shape to remember: **a named secret, plus an access scope that is either everything (`fullAccess`) or an explicit allow-list of resource ids.**

## Quick Reference

### Access Scope Decision Matrix

| The token will... | Scope | Set |
|---|---|---|
| Serve one automation touching specific resources | Least-privilege (default) | One or more of `_connectionIds`, `_exportIds`, `_importIds`, `_apiIds`, `_mcpServerIds`; omit `fullAccess` |
| Call one custom API or one MCP server | Least-privilege | `_apiIds` or `_mcpServerIds` scoped to that resource |
| Run genuinely account-wide automation (backup/export tool, admin provisioning) | Full access (the exception) | `fullAccess: true`; omit all scope arrays |

Default toward least privilege: scope a token to exactly the resources its automation touches. A monitoring script that reads two flows' errors does not need account-wide access. Reserve `fullAccess` for automation that would be impractical to enumerate, and treat those tokens as the highest-value secrets to rotate and audit.

### Minimum Fields

Generating a token requires at minimum:

- `name` -- a purpose-descriptive label (strongly recommended; it is the only identifier in the UI and audit logs)
- Exactly one access model: `fullAccess: true` **or** at least one scope array (`_connectionIds`, `_exportIds`, `_importIds`, `_apiIds`, `_mcpServerIds`). Setting both fails validation.

You never supply the `token` value -- it is generated by the platform and returned masked.

### When You Need This Skill

- Creating, scoping, rotating, revoking, or deleting an API token
- A script, pipeline, monitor, or external client must authenticate *into* integrator.io
- Choosing between a personal access token and an account API token
- Deciding between account-wide and scoped programmatic access
- Untangling an "access token" question -- is it inbound (this skill) or a connection's outbound OAuth token (see [configuring-connections](../configuring-connections/SKILL.md))

## Related Skills

- [managing-users > Access Strategy Decision Matrix](../managing-users/SKILL.md#access-strategy-decision-matrix) -- API tokens authenticate *machines*; user records authenticate *people*. Both are owner/administrator-controlled access.
- [configuring-connections > iClients (OAuth Credential Stores)](../configuring-connections/SKILL.md#iclients-oauth-credential-stores) -- a connection's OAuth access token authenticates Celigo's *outbound* calls; do not confuse it with an inbound API token.
- [building-apis > API Modes](../building-apis/SKILL.md#api-modes) -- custom APIs have no authentication of their own; callers authenticate with an API token.
- [building-mcp-servers > How to Build an MCP Server](../building-mcp-servers/SKILL.md#how-to-build-an-mcp-server) -- MCP servers accept an API token as one of their auth modes.

<!-- TIER:2 -->

## How to Manage API Tokens

### 1. Confirm this is an inbound-auth need

Before generating anything, confirm the requirement is a *machine calling into Celigo*. If instead something needs to authenticate *out to* an external system (Salesforce, NetSuite, an HTTP API), that is a connection's OAuth access token -- not an API token. Use [configuring-connections](../configuring-connections/SKILL.md). See [API Token vs Connection OAuth Token](#api-token-vs-connection-oauth-token).

Then decide the token kind. For *your own* CLI profile, scripts, or ad-hoc calls, the fastest path is a **personal access token** -- self-service in the UI, no scoping to design, 90-day default expiry. For shared or long-lived automation, continue below with an **account API token**. See [Personal Access Tokens (PATs) vs Account API Tokens](#personal-access-tokens-pats-vs-account-api-tokens).

### 2. Audit existing tokens

```bash
celigo accesstokens list
celigo accesstokens get <id>
```

Review `name`/`description` (is the purpose clear?), `fullAccess` vs the scope arrays, `revoked`, `autoPurgeAt`, and whether it is an auto-managed `apim` or connector token. Revoke or purge stale tokens you no longer recognize.

### 3. Decide the scope

Use the [Access Scope Decision Matrix](#access-scope-decision-matrix). The honest question when someone asks for a token is "what will it actually call?" -- then scope to exactly that. Default to one or more scope arrays; reserve `fullAccess` for genuinely account-spanning automation.

Scope arrays hold real resource `_id`s. If you only have resource names, resolve them to ids first, then place the ids in the arrays:

```bash
celigo account search "<resource-name>"
```

If you cannot resolve the ids up front, generate the token and add scope in the UI rather than leaving it `fullAccess` by default.

### 4. Generate the token (one per consumer)

Default to **one token per consumer** -- per pipeline, per script, per external client. Independent tokens mean a leak or decommission affects exactly one consumer (you revoke that token and nothing else breaks) and the audit log attributes activity to the right caller. A single shared token turns every revocation into an outage for all of them.

Build the token JSON (`name`/`description`, plus either `fullAccess: true` or the scope arrays) and create it:

```bash
celigo accesstokens create < token.json
```

**Capture the secret once.** The generated `token` value is shown only at creation and masked (`******`) forever after. Copy it directly into the consuming system's secret store -- never into chat, a ticket, or a commit. Creating is not idempotent: a create that appears to fail may still have minted a token, so verify with `celigo accesstokens list` before retrying rather than minting a duplicate.

### 5. Set an expiry for temporary access

For a contractor engagement, a one-off migration, or a demo, set `autoPurgeAt` (within 30 days for account API tokens; PATs allow up to 90 and default to 90) so the token cleans itself up instead of lingering as a forgotten standing credential:

```bash
celigo accesstokens get <id> > token.json
# set "autoPurgeAt" to an ISO timestamp within the next 30 days
celigo accesstokens update <id> < token.json
```

For ongoing automation a permanent token is fine -- pair it with a rotation habit: generate the replacement, cut the consumer over, then revoke the old one.

### 6. Revoke, then delete

Revoke and delete are **sequential, not alternatives**:

- **Revoke** the instant a token leaks or its consumer is retired. Authentication stops immediately while the record (and its audit trail) is preserved. Revoking is just an update that sets `revoked: true`:

```bash
celigo accesstokens get <id> > token.json
# set "revoked": true in token.json
celigo accesstokens update <id> < token.json
```

- **Delete** only after the token is revoked -- revoke-before-delete is enforced. Deletion is a soft delete; the record is purged permanently 30 days later:

```bash
celigo accesstokens delete <id>
```

APIM tokens (`apim: true`) are the exception: they cannot be deleted at all -- revoking is the only lever.

## CLI Commands

```bash
# CRUD
celigo accesstokens list
celigo accesstokens get <id>
celigo accesstokens create < token.json        # generates the secret; shown only once
celigo accesstokens update <id> < token.json    # rename, re-scope, set autoPurgeAt, or revoke (revoked: true)
celigo accesstokens delete <id>                  # only after revoked: true; APIM tokens cannot be deleted

# Resolve resource names to ids for scope arrays
celigo account search "<resource-name>"
```

**UI alternative:** manage tokens under the account's **API tokens** view -- both PATs and account API tokens live there, and it is where you generate a PAT for yourself. The UI is the easiest place to copy a freshly generated token value into a secret store.

**API alternative:** the same resource is the integrator.io REST `accesstoken` type (plural path `/v1/accesstokens`): `POST` to generate, `PUT .../{id}` to update or revoke (`revoked: true`), `DELETE .../{id}` after revoking.

<!-- TIER:3 -->

## Pre-Submit Checklist

Before generating or updating an API token, verify:

- [ ] `name`/`description` states the token's purpose and consumer (it is the only identifier in audit logs)
- [ ] Exactly one access model is set -- `fullAccess: true` **or** scope arrays, never both (setting both fails validation)
- [ ] `fullAccess` is justified by genuinely account-wide automation; otherwise scope to specific resource ids
- [ ] Scope arrays contain real resource `_id`s (resolved from names), not placeholders
- [ ] For temporary access, `autoPurgeAt` is set and within 30 days
- [ ] The consumer gets its own token (not a shared one) so revocation stays isolated
- [ ] You are ready to capture the generated secret into a secret store -- not chat, tickets, or commits
- [ ] To delete: the token is already `revoked: true` and is not an `apim` token (which cannot be deleted)

## Gotchas

1. **API token = inbound; connection OAuth token = outbound.** The single most common mix-up. If the thing authenticating is Celigo reaching *out* to another system, it is a connection's OAuth token, not an API token. See [API Token vs Connection OAuth Token](#api-token-vs-connection-oauth-token).
2. **The token value is a secret -- never echo it.** It is masked as `******` in responses and shown in full only at generation. Never accept a token value in chat and never read one back. If a user pastes a real token, treat it as compromised: revoke it and generate a new one rather than reuse it.
3. **Capture the secret at generation -- it is shown only once.** After creation the value is masked forever. If it was not captured, you must generate a replacement.
4. **`fullAccess` and the scope arrays are mutually exclusive.** Setting `fullAccess: true` alongside any of `_connectionIds`/`_exportIds`/`_importIds`/`_apiIds`/`_mcpServerIds` fails validation. Choose one model.
5. **Revoke before delete -- always.** A token must be `revoked: true` before it can be deleted; the platform enforces the order. Revoke is the instant safety action (authentication stops immediately, record preserved); delete is later cleanup (soft delete, purged after 30 days).
6. **APIM tokens cannot be deleted.** Tokens marked `apim: true` are managed by API management and have no delete path. Revoking is the only lever.
7. **Auto-managed tokens are not hand-crafted.** Connector integration tokens (carrying `_integrationId`/`_connectorId`) and APIM tokens (`apim: true`) are created by the platform -- do not try to author or duplicate them by hand.
8. **`autoPurgeAt` must be within 30 days -- 90 for PATs.** It is meant for short-lived tokens; a value further out is rejected. It self-deletes the record when it passes.
9. **Creating is not idempotent.** A create that appears to fail may still have minted a live token. Verify with `celigo accesstokens list` before retrying, or you may leave an orphaned credential.
10. **GET masks the secret; PUT replaces the record.** `celigo accesstokens get` returns `token` as `******`, and update is a full PUT that erases omitted fields. GET first, change only the intended fields (scope, `revoked`, `autoPurgeAt`), then update -- and never treat the masked value as the real secret.
11. **A PAT is yours alone -- other users' PATs are read-only.** Every member's PATs appear in the account's API tokens list, but only the owning user can edit, revoke, or delete one (anyone else gets "This personal access token is owned by another user"). A credential the team must manage jointly should be an account API token.
12. **A PAT rides the owner's permissions -- and their 90-day clock.** It inherits whatever the creating user can do (no scoping available), tracks permission changes immediately, stops working if the membership is removed, and expires after 90 days by default. Don't bury one in CI: use a scoped account API token there, or calendar the rotation.

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `422` validation error on create | Both `fullAccess` and a scope array set, or neither | Set exactly one: `fullAccess: true` **or** at least one scope array |
| `422` invalid `autoPurgeAt` | Timestamp is in the past or more than 30 days out | Use an ISO timestamp within the next 30 days |
| `403 Forbidden` creating or managing a token | Caller is not an owner/administrator | Use a token or login with owner/administrator access |
| Delete rejected / token will not delete | Token is not revoked yet, or it is an `apim` token | Set `revoked: true` first; APIM tokens cannot be deleted (revoke instead) |
| `401 Unauthorized` from a script using the token | Token is `revoked`, purged, or expired via `autoPurgeAt` (PATs expire after 90 days by default) | Check `revoked`/`autoPurgeAt`; generate a replacement if it was purged |
| "This personal access token is owned by another user" | Editing, revoking, or deleting a PAT you do not own | Have the owning user manage it; for jointly managed credentials use an account API token |
| Token authenticates but `403` on a specific resource | Resource is outside the token's scope | Add the resource id to the appropriate scope array, or widen scope deliberately |
| Scope seems ignored / token still account-wide | `fullAccess: true` is still set alongside scope arrays | Remove `fullAccess`; scope arrays only apply when `fullAccess` is not set |
| Lost the token value | Secret was not captured at generation (masked thereafter) | Generate a replacement token and revoke the old one |
