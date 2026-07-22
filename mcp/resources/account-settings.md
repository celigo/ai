---
uri: celigo://resources/account-settings
name: Account Settings Reference
description: >-
  Account-level and personal settings in Celigo integrator.io — subscription
  entitlements vs usage, audit log, data retention, execution-log preferences,
  environments, and MFA/security policy. Explains what each setting governs
  and which are administrator-only or read-only.
mimeType: text/markdown
---
# Celigo Account Settings Reference

An integrator.io account has exactly one account-level configuration (a singleton) plus a personal profile for each signed-in user. Settings therefore fall into two scopes: **personal** (your own profile, display preferences, and MFA) and **account-wide** (subscription, audit log, security, data retention, execution logging, and environments — settings that govern the whole org).

The personal-vs-account-wide split maps directly to who may change what. Account-wide settings are **administrator-only**; a non-admin user can view and change only their own personal settings.

## Two Scopes: Personal vs Account-Wide

### Personal — any user (about *you*)

- **Profile** — your name, company, role, phone, and timezone. Your email is *not* edited here — an email change requires a separate verification flow (UI only).
- **Preferences** — display settings: date/time format, color theme (light/dark), relative-vs-absolute timestamps, dashboard tile/list view, pinned integrations, and the legacy production/sandbox toggle (the `environment` preference).
- **Your MFA** — enabling or disabling multi-factor authentication for your own sign-in.
- **License-upgrade request** — a request submitted to the Celigo account team, not a self-service change (see Subscription).

### Account-Wide — administrator only (about *the org*)

- **Subscription & usage** — the plan's entitlements and current consumption.
- **Audit log** — the account-wide record of who changed what.
- **Account settings** — company name, invite policy, data retention, execution logging, account-wide MFA policy, and SSO configuration.
- **Environments** — the account's non-production environments (sandbox / development / staging).

## Subscription — Entitlements vs Usage

Subscription questions involve two layers that must not be conflated:

- **Entitlements (the license)** — what the plan *permits*. Each field is a limit or grant, not a live configuration value: number of flows, endpoints, agents, and environments; the data-retention ceiling; the AI credit balance; and whether add-ons such as API Management are included.
- **Usage (consumption)** — what is *actually* in use right now: flows enabled, endpoints consumed, API invocations this month.

"Am I over my limit?" is always a **comparison** of usage against the matching entitlement — never a single field. Because entitlement names are specific (for example, "API Management" refers to a particular add-on), read the field definitions before interpreting a value.

**Subscription is read-only.** You cannot change the plan through the API. Raising a limit — including a data-retention ceiling — is a **license-upgrade request** that a Celigo representative follows up on, not a settings edit.

## Audit Log

The audit log is the account-wide change history: who modified which resource, and when, across every resource type, plus sign-in events. Use it to answer questions like "who deleted that?" or "who changed this flow?"

Entries are filterable by resource type (`resourceType`), specific resource (`_resourceId`), acting user (`_byUserId`), `action`, `source`, and a time range (`from` / `to`). The audit log records *changes* and sign-ins; it is not a general product-usage or telemetry feed.

## Data Retention

Data retention is an account-wide setting that controls how long the account keeps execution data before it is automatically purged. It is bounded by the subscription's **data-retention ceiling** (an entitlement): a retention value beyond the licensed ceiling requires a license upgrade, not just a settings change.

Execution logs carry their own retention control as well — see the **Log retention period** under Execution Log Preferences below.

## Execution Log Preferences

The account's "Execution log preferences" page has three settings:

- **Basic logging** — on/off.
- **Store payloads** — on/off.
- **Log retention period** — how long execution logs are kept.

These preferences are stored **sparsely**. The platform omits `logging.mode` when Basic logging is off, and omits `logging.storePayload` when payload storage is off. A missing key is a definite **OFF**, not missing or unavailable data — read the resolved on/off state from the normalized `executionLogPreferences` block rather than treating an absent key as unknown.

Notes:

- The only account-level logging mode is `basic` (on/off). Per-flow log verbosity (Basic / Detailed, or inheriting the account level) is configured on each flow's own `logging.mode`, not here.
- **Store payloads is a prerequisite** for flows to use detailed or debug logging. If a flow cannot enable detailed/debug logging, check this account setting first.

## Environments — Sandbox vs Production

Two related but distinct concepts share the word "environment":

- **Legacy production/sandbox toggle** — the personal `environment` preference. On legacy accounts without named environments, this toggle is the source of truth for which environment your session is in.
- **Named environments** — the account's provisioned non-production environments (for example, Development and Staging). Managing named environments is administrator-only, and the number of environments is capped by a subscription entitlement.

Celigo enforces **strict separation** between sandbox and production: a sandbox connection can only be used by sandbox flows, and mixing sandbox and production resources causes runtime errors. "Which environment am I in?" is an identity/session question — your session operates within one specific environment.

## MFA & Security Policy

- **Per-user MFA (personal)** — each user turns multi-factor authentication on or off for their own sign-in.
- **Account-wide MFA policy (admin)** — governs everyone: whether trusted devices are allowed and how long a device stays trusted. "Enable my MFA" (personal) is not the same as "set our MFA policy" (account-wide).
- **MFA reset** — distinct from enable/disable, a reset requires the user's password for security and is performed in the UI, not through the API.
- **Invite policy (admin)** — whether all users may invite members or invitations are restricted to administrators. This is a *policy* setting; inviting a specific person is a separate user-management action, not an account setting.
- **SSO** — single sign-on configuration is account-wide. The SSO configuration is readable, but creating or editing SSO clients is a UI task.

## Read-Only & UI-Only Settings

Some requests belong to this domain but cannot be completed as a simple settings edit:

- **Subscription / entitlements** — read-only; changes are license-upgrade requests to Celigo.
- **Email address** — changing it requires a separate verification flow (UI).
- **MFA reset** — requires your password; performed in the UI.
- **SSO client configuration** — readable, but authored in the UI.

## Common Points of Confusion

- **Per-user MFA vs account-wide MFA policy** — turning on *your* MFA is personal; the trusted-device rules that apply to everyone are an admin policy.
- **Invite policy vs inviting a user** — the "who may invite members" *policy* is an account setting; inviting a specific person is user management.
- **Legacy toggle vs named environments** — the `environment` preference is the old production/sandbox switch and says nothing about named environments like Development or Staging.
- **Entitlement vs usage** — an entitlement is a limit or grant; usage is live consumption. "Over the limit?" is always a comparison of the two.
- **Account data retention vs per-flow error/log management** — retention and execution-log preferences are account settings; managing individual flow errors and per-flow log verbosity lives with flows.
