---
name: managing-api-tokens
description: Manage Celigo API tokens (the accesstoken resource) -- bearer credentials that authenticate inbound programmatic calls into integrator.io's REST API, custom APIs, and MCP servers. Covers personal access tokens (PATs) versus account-level API tokens, least-privilege scoping versus full access, the revoke-before-delete lifecycle, auto-purge expiry, and keeping token secrets out of chat. Use when creating, scoping, rotating, revoking, or deleting API tokens or PATs, or when distinguishing an integrator.io API token from a connection's OAuth access token.
---

<!-- TIER:1 -->

# Managing API Tokens

An API token (the API resource `accesstoken`, shown as **API tokens** in the UI) is a **bearer credential that authenticates programmatic calls _into_ Celigo** -- the native integrator.io REST API, any custom APIs you have built in the account, and your MCP servers. It is the machine-to-machine equivalent of a user login: where a person signs in through the UI, a script presents an API token. Account API tokens are created by the owner or an administrator; personal access tokens are self-service for administrators, manage, and monitor users. Either kind is managed only in the integrator.io UI -- see [Where Tokens Are Managed](#where-tokens-are-managed).

Two things to keep straight up front:

- **Direction is inbound.** An API token governs traffic coming *into* Celigo -- the opposite of connections and iClients, which authenticate Celigo's outbound calls *out to* external systems. This is the most common conceptual mix-up; see [API Token vs Connection OAuth Token](#api-token-vs-connection-oauth-token).
- **The token value is a real secret.** It is masked as `******` in API responses; only the UI's show-token action reveals it, and only to users who may manage the token (for a PAT, only its creator). Treat it like a password: never paste a real token into chat and never read one back.

Concerns when managing API tokens:

- **Token kind** -- a **personal access token (PAT)** tied to your own user vs an **account API token** owned by the account. See [Personal Access Tokens (PATs) vs Account API Tokens](#personal-access-tokens-pats-vs-account-api-tokens).
- **Access scope** -- `fullAccess` (whole account) vs least-privilege resource scoping (`_connectionIds`, `_exportIds`, `_importIds`, `_apiIds`, `_mcpServerIds`, `_topicIds`, `_fileStoragePaths`). The two are mutually exclusive.
- **Where it may connect from** -- an account API token can be limited to known IP ranges by assigning it a network policy (`_networkPolicyId`).
- **Lifecycle** -- generate, revoke (and reactivate), delete (a token must be revoked before it can be deleted).
- **Expiry** -- optional `autoPurgeAt` self-destruct for short-lived tokens.
- **Secret handling** -- move the value straight from the UI into the consumer's secret store; rotate rather than reuse a leaked token.
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

Celigo has two kinds of inbound bearer token: the personal access token, and the account API token, which the platform calls a *service token* (`GET /v1/tokenInfo` reports one as `token.type: "service"`). Both live under the account's **API tokens** view, and both are sent the same way (`Authorization: Bearer <token>`) -- the integrator.io REST API and the Celigo CLI accept either:

| | Personal access token (PAT) | Account API token |
|---|---|---|
| Who can create one | Administrators, manage, and monitor users, each for themselves -- not the account owner, and never on another user's behalf | Owner/administrator only |
| Whose access it grants | Yours -- it inherits your own effective permissions | The account's -- `fullAccess` or an explicit resource-id allow-list |
| Scoping | None to configure -- it always mirrors what you can do | `fullAccess` vs scope arrays (this skill's main concern) |
| Expiry | **Defaults to 90 days**; `autoPurgeAt` up to 90 days out | Optional `autoPurgeAt` up to 30 days out; otherwise long-lived |
| Managed by | Its creator. An administrator can also revoke it, but can't change it or reveal its value; manage and monitor users see only their own PATs | Any owner/administrator |
| Best for | Your own scripts and ad-hoc API calls | Shared automation: CI/CD, monitoring, external callers of APIs and MCP servers |

Rule of thumb: **a PAT authenticates *you*; an account API token authenticates *a system*.** A PAT is the quick self-service option -- generate one for yourself and go -- but it is bound to your account membership (`tokenType: "ashare"`): it tracks your permission changes immediately, is blocked while your user is disabled and revoked when your user is deleted, and its 90-day default expiry *will* arrive mid-quarter. For automation that must outlive any one person -- CI/CD especially -- prefer a least-privilege account API token, or at minimum calendar the PAT rotation. The account owner can't create a PAT at all, so the owner's scripts use an account API token.

A person's own work in the CLI needs no token: `celigo login` (CLI 2026.10.1 and later) signs in through the browser with OAuth and, like a PAT, carries the signed-in person's own permissions -- the owner's included -- with no token to generate, hand over, or rotate. Tokens are for what runs without a person.

## Token Anatomy

| Field | Type | Purpose |
|---|---|---|
| `name` / `description` | string | What the token is for -- the only thing identifying it in the UI and audit logs. Use a purpose name (`CI/CD Pipeline`, `Prod Monitoring`). |
| `token` | string (secret) | The bearer value. **Masked as `******`** in API responses; the UI's show-token action reveals it to users who may manage the token. |
| `fullAccess` | boolean | Token can reach any resource in the account. Mutually exclusive with the scope arrays. |
| `_connectionIds`, `_exportIds`, `_importIds`, `_apiIds`, `_mcpServerIds`, `_topicIds` | array of ids | Least-privilege scope -- the token reaches only the listed resources (for `_topicIds`, it publishes to and reads only those Event Streams topics). Mutually exclusive with `fullAccess`. |
| `_fileStoragePaths` | array of paths | Celigo Storage folders the token may reach, each with everything beneath it: at most 7, each starting and ending with `/`. Mutually exclusive with `fullAccess`. |
| `_networkPolicyId` | id | The network policy whose IP allow and deny lists gate every request made with this token. Account API tokens only: a PAT follows the workspace-user sign-in policy instead. Assigned on the token in the UI. |
| `revoked` | boolean | `true` disables the token (authentication stops immediately). Must be `true` before the token can be deleted. A revoked token can be reactivated (`revoked` back to `false`) until it's deleted. |
| `autoPurgeAt` | timestamp | Optional self-destruct time (within 30 days for account API tokens; up to 90 days for PATs). The record is removed automatically once it passes. |
| `apim` | boolean | Marks an APIM-managed token. **APIM tokens cannot be deleted.** |
| `_integrationId` / `_connectorId` | id | Present on auto-managed connector integration tokens (set by the platform, not hand-crafted). |
| `tokenType` / `_aShareId` | string / id | Present on PATs: `tokenType: "ashare"` binds the token to the creating user's account membership. Absent on account API tokens. |

The shape to remember: **a named secret, plus an access scope that is either everything (`fullAccess`) or an explicit allow-list of resource ids.**

## Quick Reference

### Access Scope Decision Matrix

| The token will... | Scope | Set |
|---|---|---|
| Serve one automation touching specific resources | Least-privilege (default) | One or more of `_connectionIds`, `_exportIds`, `_importIds`, `_apiIds`, `_mcpServerIds`, `_topicIds`, `_fileStoragePaths`; omit `fullAccess` |
| Call one custom API or one MCP server | Least-privilege | `_apiIds` or `_mcpServerIds` scoped to that resource |
| Be used only from known addresses (a partner's or a pipeline's IP ranges) | Any scope, plus a network policy | A network policy listing those ranges, assigned to the token (`_networkPolicyId`). A custom API has no IP setting of its own, so the restriction goes on the token its callers use |
| Run genuinely account-wide automation (backup/export tool, admin provisioning) | Full access (the exception) | `fullAccess: true`; omit all scope arrays |
| Manage the Celigo-hosted SFTP file server or its partner accounts | Full access (required) | `fullAccess: true` -- every file-server route refuses a scoped token with 403 `FILESERVER_FULL_ACCESS_TOKEN_REQUIRED` ([managing-file-storage](../managing-file-storage/references/file-server.md)) |

Default toward least privilege: scope a token to exactly the resources its automation touches. A monitoring script that reads two flows' errors does not need account-wide access. Reserve `fullAccess` for automation that would be impractical to enumerate, and treat those tokens as the highest-value secrets to rotate and audit.

### Minimum Fields

Generating a token requires at minimum:

- `name` -- a purpose-descriptive label (strongly recommended; it is the only identifier in the UI and audit logs)
- Exactly one access model: `fullAccess: true` **or** at least one scope array (`_connectionIds`, `_exportIds`, `_importIds`, `_apiIds`, `_mcpServerIds`, `_topicIds`, `_fileStoragePaths`). Setting both fails validation.

You never supply the `token` value -- it is generated by the platform and returned masked.

### When You Need This Skill

- Creating, scoping, rotating, revoking, or deleting an API token
- A script, pipeline, monitor, or external client must authenticate *into* integrator.io
- Choosing between a personal access token and an account API token
- Deciding between account-wide and scoped programmatic access
- Untangling an "access token" question -- is it inbound (this skill) or a connection's outbound OAuth token (see [configuring-connections](../configuring-connections/SKILL.md))

## Related Skills

- [managing-users > Access Strategy Decision Matrix](../managing-users/SKILL.md#access-strategy-decision-matrix) -- API tokens authenticate *machines*; user records authenticate *people*. Account API tokens and user records are both owner/administrator-controlled access.
- [configuring-connections > iClients (Shared Credential Stores)](../configuring-connections/SKILL.md#iclients-shared-credential-stores) -- a connection's OAuth access token authenticates Celigo's *outbound* calls; do not confuse it with an inbound API token.
- [building-apis > API Modes](../building-apis/SKILL.md#api-modes) -- custom APIs have no authentication of their own; callers authenticate with an API token.
- [building-mcp-servers > How to Build an MCP Server](../building-mcp-servers/SKILL.md#how-to-build-an-mcp-server) -- MCP servers accept an API token as one of their auth modes.
- [managing-network-policies > Where a Policy Applies](../managing-network-policies/SKILL.md#where-a-policy-applies) -- limit where an account API token may connect from (an IP allow/deny list set on the token in the UI); personal access tokens follow the workspace-user sign-in policy instead.

<!-- TIER:2 -->

## How to Manage API Tokens

### 1. Confirm this is an inbound-auth need

Before generating anything, confirm the requirement is a *machine calling into Celigo*. If instead something needs to authenticate *out to* an external system (Salesforce, NetSuite, an HTTP API), that is a connection's OAuth access token -- not an API token. Use [configuring-connections](../configuring-connections/SKILL.md). See [API Token vs Connection OAuth Token](#api-token-vs-connection-oauth-token).

Then decide whether a token is needed, and which kind. *Your own* work in the CLI needs none: sign in with `celigo login`. For your own scripts or ad-hoc calls, the fastest path is a **personal access token** -- self-service in the UI, no scoping to design, 90-day default expiry (the account owner can't create one and uses an account API token instead). For shared or long-lived automation, continue below with an **account API token**. See [Personal Access Tokens (PATs) vs Account API Tokens](#personal-access-tokens-pats-vs-account-api-tokens).

Every step below happens in the integrator.io UI, on the account's **API tokens** page -- there is no CLI or API path (see [Where Tokens Are Managed](#where-tokens-are-managed)). An agent's job is to work out the right settings and walk the user through them.

### 2. Audit existing tokens

On the API tokens page (the owner and administrators see every token; manage and monitor users see only their own PATs), review `name`/`description` (is the purpose clear?), `fullAccess` vs the scope arrays, `revoked`, `autoPurgeAt`, and whether it is an auto-managed `apim` or connector token. Revoke or purge stale tokens you no longer recognize.

### 3. Decide the scope

Use the [Access Scope Decision Matrix](#access-scope-decision-matrix). The honest question when someone asks for a token is "what will it actually call?" -- then scope to exactly that. Default to one or more scope arrays; reserve `fullAccess` for genuinely account-spanning automation.

Scope arrays hold real resource `_id`s. If you only have resource names, resolve them to ids first, then place the ids in the arrays:

```bash
celigo account search "<resource-name>"
```

If you cannot resolve the ids up front, generate the token and add scope in the UI rather than leaving it `fullAccess` by default.

### 4. Generate the token (one per consumer)

Default to **one token per consumer** -- per pipeline, per script, per external client. Independent tokens mean a leak or decommission affects exactly one consumer (you revoke that token and nothing else breaks) and the audit log attributes activity to the right caller. A single shared token turns every revocation into an outage for all of them.

Generate it in the environment its consumer calls. A token is bound to the environment it was created in (`GET /v1/tokenInfo` names it), so a script that works against a sandbox needs a token created in that sandbox.

Generate it on the API tokens page with a purpose name and the access model you chose: full access, or the specific connections, exports, imports, APIs, MCP servers, Event Streams topics and Celigo Storage folders it may reach. When the consumer calls from known addresses -- a partner's egress range, a CI runner's -- also pick a network policy that lists them, so requests with the token from anywhere else are refused. The token takes a policy, never an address range: list the account's network policies, name the one that already covers the range, or have one created first ([managing-network-policies](../managing-network-policies/SKILL.md#where-a-policy-applies)).

**Move the secret straight to its consumer.** Copy the generated value directly into the consuming system's secret store -- never into chat, a ticket, or a commit. Afterward the value stays masked (`******`) everywhere except the UI's show-token action. Generating is not idempotent: if a generate appears to fail, check the token list before trying again rather than minting a duplicate.

### 5. Set an expiry for temporary access

For a contractor engagement, a one-off migration, or a demo, set the token's auto-purge date (`autoPurgeAt`: within 30 days for account API tokens; PATs allow up to 90 and default to 90) so the token cleans itself up instead of lingering as a forgotten standing credential.

For ongoing automation a permanent token is fine -- pair it with a rotation habit: generate the replacement, cut the consumer over, then revoke the old one. Don't rotate a token in use with the UI's reset action: it regenerates the value in place, so every consumer still holding the old value fails at once. A token's kind is fixed at creation, too: to move from a PAT to an account API token, or back, generate the other kind.

### 6. Revoke, then delete

Revoke and delete are **sequential, not alternatives**:

- **Revoke** the instant a token leaks or its consumer is retired. Authentication stops immediately while the record (and its audit trail) is preserved. Revoking sets `revoked: true`; an administrator can revoke another user's PAT. A revoked token can be reactivated in the UI (`revoked` back to `false`) -- useful when a token still in use was revoked too early, never for one that leaked.
- **Delete** only after the token is revoked -- revoke-before-delete is enforced. Delete is final: the recycle bin doesn't take API tokens, so a deleted token can't be restored. Revoke is the step you can undo.

APIM tokens (`apim: true`) are the exception: they cannot be deleted at all -- revoking is the only lever.

### 7. Diagnose a caller's 401

When a caller that used to work gets `401` (`Bearer Authentication Failed`) on every call, the token it sends no longer authenticates. You can't read the token through the API, and a call refused at authentication leaves no entry in a custom API's request log, so the evidence is in the audit log: read the entries for resource type `accesstoken` from around when the 401s began.

- A **revocation** is an `update` whose field change takes `revoked` from `false` to `true`, with who made it and when; a **reactivation** is the reverse.
- A `create`, often followed by a `view` (someone revealing the new value), just before a revocation is a rotation done out of order: the old token was revoked before its consumer switched to the new one.

Fix it by getting the caller a working token: the replacement, revealed in the UI by someone who may manage it and handed over through a secret store, or the old token reactivated while the caller switches, if it wasn't compromised. A 401 at the door is about the caller's token; the connections the API's flow uses aren't involved.

## Where Tokens Are Managed

Only in the integrator.io UI, on the account's **API tokens** page -- PATs and account API tokens both live there. The CLI has no token commands and the MCP server has no token tools, and the REST endpoints (`/v1/accesstokens`) reject every bearer-token caller -- API tokens and PATs alike -- with `403 not_allowed`. A token can authenticate calls to other resources, but no script, CLI profile, or MCP session can list, generate, revoke, or delete tokens. When a user asks an agent to manage a token, the agent decides the settings -- name, scope, expiry, network policy -- and the user applies them in the UI. Say so plainly, and never report a token as created.

The CLI still helps you prepare: resolve resource names into the ids a scoped token needs, and find out which token a profile or script holds. `GET /v1/tokenInfo`, called with that token (`celigo profile whoami` for a CLI profile), returns the user acting through it and the environment it's bound to, and for an account API token its name, `_id`, and whether it has full access -- enough to name the token to revoke or re-scope in the UI.

```bash
celigo account search "<resource-name>"
celigo profile whoami
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before generating or updating an API token, verify:

- [ ] `name`/`description` states the token's purpose and consumer (it is the only identifier in audit logs)
- [ ] Exactly one access model is set -- `fullAccess: true` **or** scope arrays, never both (setting both fails validation)
- [ ] `fullAccess` is justified by genuinely account-wide automation; otherwise scope to specific resource ids
- [ ] Scope arrays contain real resource `_id`s (resolved from names), not placeholders
- [ ] For temporary access, `autoPurgeAt` is set and within 30 days
- [ ] The consumer gets its own token (not a shared one) so revocation stays isolated
- [ ] The token is generated in the environment its consumer calls (a sandbox script needs a sandbox token)
- [ ] You are ready to capture the generated secret into a secret store -- not chat, tickets, or commits
- [ ] To delete: the token is already `revoked: true`, is not an `apim` token (which cannot be deleted), and will never be needed again (a deleted token can't be restored)

## Gotchas

1. **API token = inbound; connection OAuth token = outbound.** The single most common mix-up. If the thing authenticating is Celigo reaching *out* to another system, it is a connection's OAuth token, not an API token. See [API Token vs Connection OAuth Token](#api-token-vs-connection-oauth-token).
2. **The token value is a secret -- never echo it.** It is masked as `******` in API responses and revealed only through the UI's show-token action. Never accept a token value in chat and never read one back. If a user pastes a real token, treat it as compromised: revoke it and generate a new one rather than reuse it.
3. **Only the UI reveals the value.** The show-token action works for users who may manage the token -- and a PAT's value only for its creator, never for an administrator. If you can't reveal it, generate a replacement.
4. **`fullAccess` and the scope arrays are mutually exclusive.** Setting `fullAccess: true` alongside any of `_connectionIds`/`_exportIds`/`_importIds`/`_apiIds`/`_mcpServerIds`/`_topicIds`/`_fileStoragePaths` fails validation. Choose one model.
5. **Revoke before delete -- always.** A token must be `revoked: true` before it can be deleted; the platform enforces the order. Revoke is the instant safety action (authentication stops immediately, record preserved, reversible); delete is final cleanup (the recycle bin doesn't take tokens, so a deleted token can't be restored).
6. **APIM tokens cannot be deleted.** Tokens marked `apim: true` are managed by API management and have no delete path. Revoking is the only lever.
7. **Auto-managed tokens are not hand-crafted.** Connector integration tokens (carrying `_integrationId`/`_connectorId`) and APIM tokens (`apim: true`) are created by the platform -- do not try to author or duplicate them by hand.
8. **`autoPurgeAt` must be within 30 days -- 90 for PATs.** It is meant for short-lived tokens; a value further out is rejected. It self-deletes the record when it passes.
9. **Creating is not idempotent.** A generate that appears to fail may still have minted a live token. Check the API tokens list before retrying, or you may leave an orphaned credential.
10. **Tokens can't manage tokens.** `/v1/accesstokens` rejects every bearer-token caller with `403 not_allowed`, and neither the CLI nor the MCP server has token commands. Don't script token creation or rotation -- it happens in the UI, signed in as a user. A token can still identify itself: `GET /v1/tokenInfo` (`celigo profile whoami`) names the token a caller holds.
11. **A PAT belongs to its creator.** Only the creator can edit, reveal, reset, or delete it; an administrator sees every PAT and can revoke one, but can't otherwise change it or reveal its value. Manage and monitor users see only their own PATs. A credential the team must manage jointly should be an account API token.
12. **A PAT rides the owner's permissions -- and their 90-day clock.** It inherits whatever the creating user can do (no scoping available), tracks permission changes immediately, is blocked while the creator is disabled (until re-enabled) and revoked when the creator is deleted, and expires after 90 days by default. Don't bury one in CI: use a scoped account API token there, or calendar the rotation.
13. **An account API token can be IP-restricted -- through a network policy.** Assign the token a network policy that lists the caller's ranges, in the UI with its other settings; every request made with the token is checked against it. A custom API has no IP setting of its own, so the token is where the restriction goes. A PAT has no policy of its own and follows the workspace-user sign-in policy.
14. **Revoked isn't final until deleted.** A revoked token can be reactivated, which is how a rotation done out of order gets undone while the consumer switches. Never reactivate a token that leaked.
15. **Account API tokens outlive the people who made them.** Disabling or deleting a user stops only that user's PATs. Any administrator can reveal any account API token's value, so when an administrator leaves, rotate the account API tokens they could have copied.

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `422` validation error on create | Both `fullAccess` and a scope array set, or neither | Set exactly one: `fullAccess: true` **or** at least one scope array |
| `422` invalid `autoPurgeAt` | Timestamp is in the past or more than 30 days out | Use an ISO timestamp within the next 30 days |
| `403 not_allowed` from `/v1/accesstokens` | A bearer-token caller (API token or PAT) -- every one is refused | Manage tokens in the integrator.io UI, signed in as a user |
| No option to generate an account API token, or no PAT option | Account API tokens need owner or administrator access; the account owner can't create a PAT | Ask an administrator for an account API token, or (non-owners) generate a PAT for yourself |
| Delete rejected / token will not delete | Token is not revoked yet, or it is an `apim` token | Set `revoked: true` first; APIM tokens cannot be deleted (revoke instead) |
| `401 Unauthorized` (`Bearer Authentication Failed`) for a caller that used to work | Token is `revoked`, deleted, or purged via `autoPurgeAt` (PATs expire after 90 days by default); deleting a user also revokes that user's PATs | Read the audit log's `accesstoken` entries from when the 401s began (step 7) -- the token can't be read through the API, and refused calls aren't in the API's request log. Give the caller the replacement, or reactivate a revoked token that wasn't compromised |
| Requests with the token refused from some addresses only | The token's network policy doesn't allow the caller's address | Compare the caller's egress address with the policy's lists ([managing-network-policies](../managing-network-policies/SKILL.md#where-a-policy-applies)) |
| "This personal access token is owned by another user" | Changing, revealing, or deleting a PAT you didn't create (an administrator can only revoke it) | Have the creator manage it; for jointly managed credentials use an account API token |
| Token authenticates but `403` on a specific resource | Resource is outside the token's scope | Add the resource id to the appropriate scope array, or widen scope deliberately |
| `403 FILESERVER_FULL_ACCESS_TOKEN_REQUIRED` | A scoped token on the hosted SFTP file server's API, which takes only full-access tokens | Use a full-access account API token for file-server calls ([managing-file-storage](../managing-file-storage/references/file-server.md)) |
| Scope seems ignored / the caller reaches more than the token's scope | The caller presents a different token: a full-access one, or a PAT, which carries its creator's permissions (one token can't hold both `fullAccess` and scope arrays) | Find out which token the caller sends with `GET /v1/tokenInfo` (`celigo profile whoami` for a CLI profile), then give the caller the scoped account API token (a PAT can't be scoped) |
| Lost the token value | It's masked everywhere except the UI's show-token action | Reveal it in the UI if you may manage the token; otherwise generate a replacement and revoke the old one |
