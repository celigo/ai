---
name: using-marketplace-templates
description: Find, install, and reuse pre-built integration blueprints from the Celigo Marketplace -- Templates (unlocked, fully editable, no ongoing updates) and Integration Apps (vendor-maintained, upgrade-protected, receive updates). Covers whole-template install versus copying a single element, how connections are mapped rather than copied, the dependency cascade, and when to start from a blueprint instead of building from scratch. Use when browsing the marketplace, installing a template or Integration App, or copying an existing flow, export, import, or connection into your own integration.
---

<!-- TIER:1 -->

# Using Marketplace Templates

The Celigo Marketplace is a catalog of **pre-built integration blueprints** -- packaged flows, exports, imports, connections, and scripts you can browse, install, or reuse instead of building from scratch. Each listing is one of three kinds: a **Template**, an **Integration App (IA)**, or an **AI Agent**. Most decisions come down to Templates vs Integration Apps.

## Templates vs Integration Apps

**Templates** are open, customizable blueprints. Every flow, export, import, and script ships into your account as your own editable resource -- rename, restructure, or rewrite anything. The trade-off: templates **receive no ongoing updates**. A template is a starting point, not a maintained product; if the source application's API changes, you carry the fix.

**Integration Apps (IAs)** are vendor-maintained, structure-locked products. Their core flows, mappings, and logic are **upgrade-protected** so Celigo (or a partner) can ship updates without breaking your customizations. The trade-off: you configure only what the IA exposes (settings, mappings, endpoints) and can't rewrite the core -- in exchange you inherit bug fixes and new features over time.

Choosing wrong has opposite failure modes: pick a template when you needed an IA and you own the integration forever with no upstream fixes; pick an IA when you needed a template and you hit the locked-component ceiling the moment you must customize beyond what it exposes. When unsure, list both and compare.

**AI Agents** are a third listing type -- browse them in the marketplace to see what's available.

## Whole Install vs Single-Element Copy

Two distinct operations, separated by intent:

- **Whole-template install** creates a brand-new integration containing fresh copies of every resource in the blueprint. Intent: "set up the whole integration." This runs in the **Celigo Marketplace UI installer** on the listing's preview page.
- **Single-element copy** drops ONE element -- a flow, export, import, connection, or script -- plus everything it depends on, into an integration you already have. Intent: "borrow one piece."

Recognize intent from wording: "install the X template" / "set up X from a template" -> whole install; "copy the Y flow from the X template" / "I just want the customer export" -> single-element copy.

## What Gets Copied vs Mapped

When resources land in your account, they fall into two camps:

- **Copied** -- flows, exports, imports, scripts, lookup caches, and response mappings become fresh resources you own. There is no link back to the blueprint: editing them doesn't touch the source, and editing the source wouldn't touch them.
- **Mapped** -- **connections are never copied.** The blueprint's connection ids are placeholders; install and copy resolve each one to a **real account connection** -- reusing a match (same type + endpoint shape) or creating a new one. Connections are shared resources, so copying them would just duplicate credentials pointing at the same endpoint.

A single-element copy pulls the full **dependency cascade**: copying a flow brings its exports, imports, scripts, and lookup exports -- each dragging in its connection (mapped) and hook scripts -- so you get a runnable element, not a half-wired fragment.

## Quick Reference

### Templates vs Integration Apps

| Dimension | Templates | Integration Apps (IAs) |
|---|---|---|
| After install | Fully unlocked -- every resource is yours to edit | Structure-locked -- core flows/mappings/logic are upgrade-protected |
| Ongoing updates | None -- a starting point you maintain | Vendor-maintained -- receives bug fixes and new features |
| Customization | Rename, restructure, rewrite anything | Configure only what the IA exposes (settings, mappings, endpoints) |
| If the source API changes | You fix it yourself | The vendor ships the update |
| Best for | A fast start you'll own and adapt | A supported product you don't need to rewrite |
| Install path | Marketplace UI installer (preview page) | Marketplace UI installer (multi-step wizard) |
| Single-element copy | Supported -- pull one element into your integration | Installed as a whole product |

### Whole Install vs Single-Element Copy

| | Whole-template install | Single-element copy |
|---|---|---|
| Result | Brand-new integration with fresh copies of everything | One element (+ its dependencies) added to an existing integration |
| Runs in | Celigo Marketplace UI installer | Marketplace UI (into a chosen integration) |
| Connections | Mapped during the installer | Mapped to existing or newly created connections |
| Use when | You want the entire integration | You want to borrow one piece |

### Start From a Blueprint vs Build From Scratch

| Situation | Do this |
|---|---|
| A listing matches your source + destination and you want a fast start you'll own | Install a **Template** |
| You want a supported, auto-updated product and don't need to rewrite core logic | Install an **Integration App** |
| You only need one flow or step from an otherwise-unfit blueprint | **Copy that single element** into your integration |
| No listing matches, or requirements are highly custom | **Build from scratch** |

## Related Skills

- [getting-started > Build Order](../getting-started/SKILL.md#build-order) -- where installing from a blueprint fits versus building bottom-up
- [managing-integrations](../managing-integrations/SKILL.md) -- a whole-template install lands as a new integration you then organize and promote
- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connections are mapped, not copied; verify or create the ones an install needs
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- edit or extend a flow after it lands in your account
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- exports pulled in by the dependency cascade
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- imports pulled in by the dependency cascade
- [writing-scripts > Quick Reference](../writing-scripts/SKILL.md#quick-reference) -- hook scripts copied alongside flows and steps

<!-- TIER:2 -->

## How to Use a Marketplace Template

### 1. Check what already exists

Before installing anything, search the account so you don't duplicate an integration or connection you already have.

```bash
celigo account search "<keyword>"
```

### 2. Browse the marketplace

List catalog entries and note whether each is a Template or an Integration App.

```bash
celigo marketplace list
celigo marketplace list --type template
```

**UI (primary):** the Marketplace UI is the primary place to browse and install -- open the listing's preview page there.

### 3. Decide: Template, Integration App, or build from scratch

Use the [Quick Reference](#templates-vs-integration-apps) tables. Key questions:

- Do you need ongoing vendor updates (-> **Integration App**) or full control (-> **Template**)?
- Do you need the whole integration (-> **install**) or one piece (-> **copy**)?
- Does anything even match (-> otherwise **build from scratch**)?

### 4. Preview before you install

Inspect the blueprint's contents and the connections it expects before committing.

```bash
celigo templates preview <id> --summary
celigo templates preview <id> --model Connection
```

### 5. Install a whole template or Integration App

Whole-template and IA installs run in the **Celigo Marketplace UI installer** on the listing's preview page. The installer walks the multi-step wizard: mapping or creating connections, accepting the license, selecting a plan, and configuration.

Programmatic whole-install is not reliable. The simple install API (`POST /v1/integrations/template/{id}` with a `connectionMap` body) succeeds only for simple single-integration templates; most published blueprints ship as multi-step installers and are rejected. Use the UI installer.

### 6. Or copy a single element

When you only need one piece, copy that element into an existing integration. The copy pulls the element's full dependency cascade and **maps** its connections to your account's connections -- reusing a match or creating a new one. Choose the target integration up front; if you don't, the element lands standalone.

Copying a flow may create a flow grouping on the target through Celigo's **staged-changes** review. Accept the staged change in the UI before the grouping is usable, then continue.

### 7. Map connections, satisfy settings, then enable

After resources land in your account:

- Verify each **mapped connection** points at the right account connection (see configuring-connections).
- Populate any **settings references** the blueprint expects (e.g., `{{settings.integration.region}}`) on the target integration or flow grouping -- an unsatisfied reference blocks the flow from running.
- Verify structure, confirm **sandbox vs production** matches your environment, then enable the flows. Everything installed or copied is now an ordinary editable resource (IA core components remain locked).

## CLI Commands

```bash
# Browse the marketplace catalog
celigo marketplace list
celigo marketplace list --type template            # only Templates
celigo marketplace list --type integration-app     # only Integration Apps

# Check the account before installing (avoid duplicates)
celigo account search "<keyword>"

# Preview a blueprint's contents and dependencies
celigo templates preview <id>
celigo templates preview <id> --summary
celigo templates preview <id> --model Connection    # connections the blueprint expects

# Whole-template / Integration App install -> run in the Celigo Marketplace UI installer
#   (open the listing's preview page in the UI; programmatic whole-install is not
#    supported for multi-step templates)
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before installing a template or Integration App, or copying an element, verify:

- [ ] You searched the account first (`celigo account search`) so you don't duplicate an existing integration or connection
- [ ] You picked the right catalog type -- **Template** (you own and maintain it) vs **Integration App** (vendor-maintained, locked); the choice is hard to reverse
- [ ] You previewed the blueprint (`celigo templates preview <id> --summary`) and know which connections it expects
- [ ] You know which existing connections the install will map to, or that new ones must be created
- [ ] A target integration is chosen for a single-element copy (or you accept a standalone landing)
- [ ] Sandbox vs production is correct -- installed flows and connections must match your environment
- [ ] For a copy that creates a new flow grouping on an existing integration, you're ready to accept the staged change in the UI

## Gotchas

1. **Whole-template install runs in the Marketplace UI.** The simple install API handles only simple single-integration templates; most published blueprints ship as multi-step installers and fail programmatically. Install from the preview page in the UI.
2. **Templates receive no ongoing updates.** A template is a starting point you own and maintain -- if the source app's API changes, you fix it. Choose an Integration App when you need vendor-maintained updates.
3. **Integration Apps are structure-locked.** Core flows, mappings, and logic can't be rewritten -- you configure only what the IA exposes. Picking an IA when you need deep customization leaves you at the locked-component ceiling.
4. **Connections are mapped, not copied.** Install and copy resolve the blueprint's placeholder connection ids to real account connections -- reusing a matching one or creating a new one. You never get duplicate credentials pointing at the same endpoint.
5. **Copying one element brings its whole dependency closure.** Copying a flow drags in its exports, imports, scripts, and lookups (and their connections and hooks). You get a runnable element, not a half-wired piece.
6. **After install, everything is yours.** Installed and copied flows, exports, imports, and scripts are ordinary editable resources -- edit, delete, or run them like anything you built by hand. IA core components are the exception; they stay locked.
7. **Copying a flow may create a flow grouping via staged changes.** If the target integration lacks a grouping by the same name, the copy creates it through Celigo's staged-changes review. Accept the staged change in the UI before it's usable, then continue.
8. **Settings references may not carry over.** Template flows can reference integration or flow-grouping settings (e.g., `{{settings.integration.region}}`). If the owning resource didn't come along, populate those settings on the target before the copied element will run.
9. **Marketplace access is plan-gated.** Browsing, previewing, or installing may return `403 Forbidden` on plans without marketplace access.
10. **Lookup cache data only travels when flagged.** A lookup cache's data is included in a blueprint only when `includeDataInTemplatesAndCloning: true`; otherwise the cache lands empty.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `Install step is invalid: invalid templateZip` | Tried to install a multi-step template via the simple install API | Install from the listing's preview page in the Marketplace UI |
| `403 Forbidden` on marketplace list/preview/install | Marketplace access is plan-gated for the account or token | Use an account/plan with marketplace access, or contact your Celigo admin |
| Installed flow won't run -- missing setting | Blueprint referenced integration or flow-grouping settings that didn't come along | Populate the referenced `settings.<scope>` values on the target integration or flow grouping |
| Copied flow's grouping not visible to follow-up calls | A new flow grouping was created via staged changes and not yet accepted | Accept the staged change in the UI, then continue the copy |
| Duplicate connection after install | Created a new connection instead of mapping an existing one | Re-map the install to your existing connection -- connections are meant to be shared, not duplicated |
| Installed resource can't be edited | It's an Integration App core component (upgrade-protected), not a template resource | Customize via the IA's exposed settings and mappings, or use a Template when you need full control |
