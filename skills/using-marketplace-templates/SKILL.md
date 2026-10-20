---
name: using-marketplace-templates
description: Find, install, and reuse pre-built integration blueprints from the Celigo Marketplace -- Templates (unlocked, fully editable, no ongoing updates) and Integration Apps (vendor-maintained, upgrade-protected, receive updates). Covers whole-template install versus copying a single element, how connections are mapped rather than copied, the dependency cascade, and when to start from a blueprint instead of building from scratch. Use when browsing the marketplace, installing a template or Integration App, or copying an existing flow, export, import, or connection into your own integration.
---

<!-- TIER:1 -->

# Using Marketplace Templates

The Celigo Marketplace is a catalog of **pre-built integration blueprints** -- packaged flows, exports, imports, connections, and scripts you can browse, install, or reuse instead of building from scratch. Each listing is one of three kinds: a **Template**, an **Integration App (IA)**, or an **AI Agent**. Most decisions come down to Templates vs Integration Apps.

## Templates vs Integration Apps

**Templates** are open, customizable blueprints. Every flow, export, import, and script ships into your account as your own editable resource -- rename, restructure, or rewrite anything. The trade-off: templates **receive no ongoing updates**. A template is a starting point, not a maintained product; if the source application's API changes, you carry the fix.

**Integration Apps (IAs)** are vendor-maintained, structure-locked products. Their core flows, mappings, and logic are **upgrade-protected** so Celigo (or a partner) can ship updates without breaking your customizations. The trade-off: you configure only what the IA exposes (settings, mappings, endpoints) and can't rewrite the core -- in exchange you inherit bug fixes and new features over time. An IA also sits outside cloning and ILM: to run one in another environment, install it there from the Marketplace (one license covers every environment) -- see [managing-integrations > Plain Integrations vs Integration Apps](../managing-integrations/SKILL.md#plain-integrations-vs-integration-apps).

Choosing wrong has opposite failure modes: pick a template when you needed an IA and you own the integration forever with no upstream fixes; pick an IA when you needed a template and you hit the locked-component ceiling the moment you must customize beyond what it exposes. When unsure, list both and compare.

**AI Agents** are a third listing type -- browse them in the marketplace to see what's available.

## Whole Install vs Borrowing One Piece

Two distinct intents:

- **Whole-template install** creates a brand-new integration containing fresh copies of every resource in the blueprint. Intent: "set up the whole integration." This runs in the **Celigo Marketplace UI installer** on the listing's preview page.
- **Borrowing one piece** brings a flow, export, import, or script into an integration you already have. Intent: "borrow one piece." No API call, CLI command or MCP tool copies one element out of a template. Read the template preview (every resource it would create, in write shape with placeholder ids) and create what you need yourself in dependency order -- scripts, then exports and imports, then the flow with `_integrationId` set -- replacing each placeholder connection id with one of your connections. Or install the whole template with your connections mapped and keep only what you need.

Recognize intent from wording: "install the X template" / "set up X from a template" -> whole install; "copy the Y flow from the X template" / "I just want the customer export" -> borrow one piece.

## What Gets Copied vs Mapped

When an install lands resources in your account, they fall into two camps:

- **Copied** -- flows, exports, imports, scripts, lookup caches, and response mappings become fresh resources you own. There is no link back to the blueprint: editing them doesn't touch the source, and editing the source wouldn't touch them.
- **Mapped** -- **connections are never copied, and nothing maps them for you.** The blueprint's connection ids are placeholders. Before an API install, pick or create the account connection for every connection the preview lists, then send a `connectionMap` with every template connection id as a key; a partial map is refused. A ZIP install creates new connections without credentials for any you leave out, and in the UI installer you should choose your existing connection instead of creating another.

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
| Borrowing one piece | Recreate it from the template preview | Installed as a whole product |

### Start From a Blueprint vs Build From Scratch

| Situation | Do this |
|---|---|
| A listing matches your source + destination and you want a fast start you'll own | Install a **Template** |
| You want a supported, auto-updated product and don't need to rewrite core logic | Install an **Integration App** |
| You only need one flow or step from an otherwise-unfit blueprint | **Recreate that piece** from the template preview, with your own connections |
| No listing matches, or requirements are highly custom | **Build from scratch** |

## Related Skills

- [getting-started > Build Order](../getting-started/SKILL.md#build-order) -- where installing from a blueprint fits versus building bottom-up
- [managing-integrations](../managing-integrations/SKILL.md) -- a whole-template install lands as a new integration you then organize and promote
- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- connections are mapped, not copied; verify or create the ones an install needs
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- edit or extend a flow after it lands in your account
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- exports an install brings in, or that you recreate from a preview
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- imports an install brings in, or that you recreate from a preview
- [writing-scripts > Quick Reference](../writing-scripts/SKILL.md#quick-reference) -- hook scripts that come with installed or recreated flows and steps

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
celigo templates marketplace --include-connectors   # Templates and Integration Apps
celigo templates marketplace --type Template        # Templates only (the default without flags)
```

**UI (primary):** the Marketplace UI is the primary place to browse and install -- open the listing's preview page there.

### 3. Decide: Template, Integration App, or build from scratch

Use the [Quick Reference](#templates-vs-integration-apps) tables. Key questions:

- Do you need ongoing vendor updates (-> **Integration App**) or full control (-> **Template**)?
- Do you need the whole integration (-> **install**) or one piece (-> **recreate it from the preview**)?
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

### 6. Or borrow one piece

Nothing copies a single element out of a template, so recreate it from the preview. Read what you need (`celigo templates preview <id> --model Flow`, then the exports, imports and scripts the flow references) and create each piece yourself in dependency order: scripts, then exports and imports, then the flow. Replace each placeholder connection id with one of your connections, and point the flow at the ids your creates return.

Always set the target integration when you create a flow: without `_integrationId` the platform files it under the account's Standalone flows integration, or rejects it with 422 `standalone_flows_not_supported`.

### 7. Map connections, satisfy settings, then enable

After resources land in your account:

- Verify each **mapped connection** points at the right account connection (see configuring-connections).
- Populate any **settings references** the blueprint expects (e.g., `{{settings.integration.region}}`) on the target integration or flow grouping -- an unsatisfied reference blocks the flow from running.
- Verify structure, confirm **sandbox vs production** matches your environment, then enable the flows. Everything installed or recreated is now an ordinary editable resource (IA core components remain locked).

## CLI Commands

```bash
# Browse the marketplace catalog (Integration Apps are excluded unless asked for)
celigo templates marketplace --include-connectors  # Templates and Integration Apps
celigo templates marketplace --type Template       # only Templates
celigo templates marketplace --type Connector      # only Integration Apps

# Check the account before installing (avoid duplicates)
celigo account search "<keyword>"

# Preview a blueprint's contents and dependencies
celigo templates preview <id>
celigo templates preview <id> --summary
celigo templates preview <id> --model Connection    # connections the blueprint expects

# Whole-template / Integration App install -> run in the Celigo Marketplace UI installer
#   (open the listing's preview page in the UI; programmatic whole-install is not
#    supported for multi-step templates). Simple single-integration templates only;
#    map every connection the preview lists, and never retry blindly (each request installs again):
echo '{"connectionMap":{"<sourceConnId>":"<targetConnId>"}}' | celigo templates install <id>
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before installing a template or Integration App, or recreating a piece of a template, verify:

- [ ] You searched the account first (`celigo account search`) so you don't duplicate an existing integration or connection
- [ ] You picked the right catalog type -- **Template** (you own and maintain it) vs **Integration App** (vendor-maintained, locked); the choice is hard to reverse
- [ ] You previewed the blueprint (`celigo templates preview <id> --summary`) and know which connections it expects
- [ ] Every connection the preview lists has an account connection to map it to -- an API install refuses a partial `connectionMap`
- [ ] Every flow you recreate has its target `_integrationId` set
- [ ] Sandbox vs production is correct -- installed flows and connections must match your environment
- [ ] After a timeout or unclear error, you looked for the new integration before retrying the install

## Gotchas

1. **Whole-template install runs in the Marketplace UI.** The simple install API handles only simple single-integration templates; most published blueprints ship as multi-step installers and fail programmatically. Install from the preview page in the UI.
2. **Templates receive no ongoing updates.** A template is a starting point you own and maintain -- if the source app's API changes, you fix it. Choose an Integration App when you need vendor-maintained updates.
3. **Integration Apps are structure-locked.** Core flows, mappings, and logic can't be rewritten -- you configure only what the IA exposes. Picking an IA when you need deep customization leaves you at the locked-component ceiling.
4. **Nothing maps connections for you.** An API install needs a `connectionMap` with every template connection id as a key: a missing map is refused with `invalid_connectionMap`, and one that doesn't match the template's connections with `invalid_connectionId`. A ZIP install creates credential-less connections for any you leave out, and the UI installer lets you pick an existing connection or create one -- pick yours, or you'll end up with a duplicate.
5. **Nothing copies a single element out of a template.** No API call, CLI command or MCP tool does it. Recreate the piece from the preview in dependency order -- scripts, then exports and imports, then the flow with `_integrationId` set -- with your own connections, or install the whole template and keep what you need.
6. **After install, everything is yours.** Installed and recreated flows, exports, imports, and scripts are ordinary editable resources -- edit, delete, or run them like anything you built by hand. IA core components are the exception; they stay locked.
7. **Every install request creates a new integration.** Installs aren't idempotent: each request that reaches the platform creates another integration (or MCP server). After a timeout or an unclear error, look for the new integration before trying again; a blind retry installs a duplicate.
8. **Settings references may not carry over.** Template flows can reference integration or flow-grouping settings (e.g., `{{settings.integration.region}}`). When you recreate a piece, the owning resource doesn't come along: populate those settings on the target before the piece will run.
9. **A 403 on preview or install is a user permission, not a plan limit.** It means this user isn't allowed to install published templates: typically a monitor user, or a user with access to specific integrations only, who isn't allowed to create integrations. An account owner or administrator can grant that or run the install. A 403 `access_restricted` from the template-management calls (`celigo templates list`, `create`, `update`, `delete`) is different: managing and publishing your own templates needs a Partner account.
10. **Lookup cache data only travels when flagged.** A lookup cache's data is included in a blueprint only when `includeDataInTemplatesAndCloning: true`; otherwise the cache lands empty.

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `Install step is invalid: invalid templateZip` | Tried to install a multi-step template via the simple install API | Install from the listing's preview page in the Marketplace UI |
| `403` on template preview or install | This user isn't allowed to install published templates (typically a monitor user, or one limited to specific integrations who can't create integrations) | Ask an account owner or administrator to grant that or run the install |
| `403 access_restricted` on `celigo templates list`, `create`, `update` or `delete` | Managing and publishing your own templates needs a Partner account | Browse published templates with `celigo templates marketplace` instead |
| Installed flow won't run -- missing setting | Blueprint referenced integration or flow-grouping settings that didn't come along | Populate the referenced `settings.<scope>` values on the target integration or flow grouping |
| `invalid_connectionMap` or `invalid_connectionId` on install | The `connectionMap` is missing, or its keys don't match the template's connections | List the connections the template expects (`celigo templates preview <id> --model Connection`) and map every one |
| Duplicate connection after install | The install created a new connection instead of using your existing one | Point the installed flows at your existing connection (`celigo flows replace-connection <flowId> <duplicateConnectionId> <existingConnectionId>`), check nothing else uses the duplicate (`celigo connections dependencies <duplicateConnectionId>`), then delete it |
| Installed resource can't be edited | It's an Integration App core component (upgrade-protected), not a template resource | Customize via the IA's exposed settings and mappings, or use a Template when you need full control |
