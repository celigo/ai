---
name: using-marketplace-templates
description: Find, install, and reuse pre-built integration blueprints from the Celigo Marketplace -- Templates (unlocked, fully editable, no ongoing updates) and Integration Apps (vendor-maintained, upgrade-protected, receive updates). Covers whole-template install versus recreating a single element from the template preview, how connections are mapped rather than copied, and when to start from a blueprint instead of building from scratch. Use when browsing the marketplace, installing a template or Integration App, reusing one flow, export, or import from a template in your own integration, or checking what publishing your own templates and Integration Apps takes.
---

<!-- TIER:1 -->

# Using Marketplace Templates

The Celigo Marketplace is a catalog of **pre-built integration blueprints** -- packaged flows, exports, imports, connections, and scripts you can browse, install, or reuse instead of building from scratch. Each listing is a **Template** or an **Integration App (IA)** (`docType` `Template` or `Connector`). A template installs either an integration or an MCP server (its `type`), and the AI agent listings are integration templates tagged `aiagent` whose flows carry an AI agent step. Most decisions come down to Templates vs Integration Apps.

## Templates vs Integration Apps

**Templates** are open, customizable blueprints. Every flow, export, import, and script ships into your account as your own editable resource -- rename, restructure, or rewrite anything. The trade-off: templates **receive no ongoing updates**. A template is a starting point, not a maintained product; if the source application's API changes, you carry the fix.

**Integration Apps (IAs)** are vendor-maintained, structure-locked products. Their flows' steps, the connection each step uses, and the code the app ships are **upgrade-protected** so Celigo (or a partner) can ship updates without breaking your customizations. The trade-off: you change behavior through the app's settings and edit only what it leaves open, such as import mappings, and can't rewrite the core -- in exchange you inherit bug fixes and new features over time. See [Changing an Installed Integration App](#changing-an-installed-integration-app). An IA also sits outside cloning and ILM: to run one in another environment, install it there from the Marketplace (one license covers every environment) -- see [managing-integrations > Plain Integrations vs Integration Apps](../managing-integrations/SKILL.md#plain-integrations-vs-integration-apps).

Choosing wrong has opposite failure modes: pick a template when you needed an IA and you own the integration forever with no upstream fixes; pick an IA when you needed a template and you hit the locked-component ceiling the moment you must customize beyond what it exposes. When unsure, list both and compare.

**MCP-server templates** (`type: mcpserver`) install an MCP server, not an integration, through their own route (step 5).

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
| After install | Fully unlocked -- every resource is yours to edit | Structure-locked -- steps, their connections, and the app's endpoints and hooks are upgrade-protected |
| Ongoing updates | None -- a starting point you maintain | Vendor-maintained -- receives bug fixes and new features |
| Customization | Rename, restructure, rewrite anything | Change behavior through the app's settings; edit import mappings, lookups, input filters and response mappings |
| If the source API changes | You fix it yourself | The vendor ships the update |
| Best for | A fast start you'll own and adapt | A supported product you don't need to rewrite |
| Install path | Marketplace UI installer (preview page) | Marketplace UI installer (multi-step wizard) |
| Preview | `celigo templates preview <id>` -- every resource the install creates | None -- an IA's id answers 404 on the preview; read its listing and documentation |
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

List catalog entries and note each one's `docType` (Template or Integration App) and, for a template, its `type`.

```bash
celigo templates marketplace --include-connectors   # Templates and Integration Apps
celigo templates marketplace --type Template        # Templates only (the default without flags)
celigo templates marketplace --kind mcpserver       # only templates that install an MCP server
```

**UI (primary):** the Marketplace UI is the primary place to browse and install -- open the listing's preview page there. Over the Celigo Platform MCP server, `list_marketplace` lists the catalog (Templates only unless you pass `includeConnectors` or `docType`); its rows carry `docType` but not `type`.

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
celigo templates preview <id> --model Integration    # the readme and the install steps
celigo platform get v1/templates/<id>/preview --jq '{type, stackRequired}'   # envelope fields the preview's rows leave out
```

- **Only templates have a preview.** An Integration App's id answers 404 `Template not found.`, which doesn't mean the listing is gone; for an app, read its listing and documentation instead.
- **Read the readme.** The template author's readme is on the preview's `Integration` object and usually lists prerequisites, required settings and post-install steps. A whole install keeps it on the new integration; when you recreate a piece, carry over what applies.
- **`type` decides the install route** (step 5): `integration` or `mcpserver`.
- **`stackRequired: true`** means a hook or wrapper connection in the template runs on a stack. The Marketplace installer asks for one; the API install takes it as `_stackId` beside the `connectionMap` (`celigo templates install <id>` sends the body you pipe as is) and fails with 400 `stack_not_found` without it ([managing-stacks](../managing-stacks/SKILL.md)).

Over MCP, `list_marketplace` with the template's `_id` returns the whole preview, `type` and `stackRequired` included.

### 5. Install a whole template or Integration App

Whole-template and IA installs run in the **Celigo Marketplace UI installer** on the listing's preview page. The installer walks the multi-step wizard: mapping or creating connections, accepting the license, selecting a plan, and configuration.

Programmatic whole-install works only for some templates. The one-shot install API (`POST /v1/integrations/template/{id}` with a `connectionMap` body) doesn't run a template's own install steps, so read the preview's `Integration` object first: if its `installSteps` include a step with `type: template_zip` -- most published templates have one -- the install is refused with 422 `Install step is invalid: invalid templateZip` and creates nothing. Install those from the UI installer. Over MCP, `install_template` is the same one-shot install, with the same `connectionMap`.

**An MCP-server template installs through its own route.** A template whose `type` is `mcpserver` takes no body and no connection map: `celigo mcp-servers install-template <id>`. A prompt-only template creates the MCP server, disabled; a tool-bearing one creates an integration in install mode, where its connections are mapped, and that integration's last step creates the disabled server ([building-mcp-servers](../building-mcp-servers/SKILL.md)). The integration route refuses an MCP-server template (400 `invalid_template`), the MCP-server route answers 404 for an integration template, and no MCP tool installs an MCP-server template.

**From a ZIP.** An integration downloaded with `celigo integrations download <id>` installs into another account or environment with `celigo templates install --zip <file>`; preview it first with `celigo templates preview --zip <file>` to list the connections to map. The ZIP carries no credentials, so a connection you don't map arrives without them.

**An install that timed out may have worked.** Each install request that reaches the platform creates another integration, and a gateway timeout (504) or a dropped connection doesn't mean it failed. Before any retry -- including when the user asks you to "run it again" -- look for what the first request would have created: an integration carrying the template's `_templateId` (usually under the template's name), created around the time of the request, with its flows (the audit log shows the creates). If it's there, the install went through: report it, and don't install again. If you can't tell either way -- a lookup fails, or the list is ambiguous -- ask the user before installing again.

### 6. Or borrow one piece

Nothing copies a single element out of a template, so recreate it from the preview. Read what you need (`celigo templates preview <id> --model Flow`, then the exports, imports and scripts the flow references) and create each piece yourself in dependency order: scripts, then exports and imports, then the flow. Replace each placeholder connection id with one of your connections, and point the flow at the ids your creates return.

Always set the target integration when you create a flow: without `_integrationId` the platform files it under the account's Standalone flows integration, or rejects it with 422 `standalone_flows_not_supported`.

### 7. Map connections, satisfy settings, then enable

After resources land in your account:

- Verify each **mapped connection** points at the right account connection (see configuring-connections).
- Populate any **settings references** the blueprint expects (e.g., `{{settings.integration.region}}`) on the target integration or flow grouping -- an unsatisfied reference blocks the flow from running.
- Verify structure, confirm **sandbox vs production** matches your environment, then enable the flows. Everything installed or recreated is now an ordinary editable resource (an Integration App's locked parts stay locked; see [Changing an Installed Integration App](#changing-an-installed-integration-app)).

## Changing an Installed Integration App

An Integration App locks its flows' steps, the connection each step uses, the endpoints and hooks the app ships (its own code), and some data-shaping settings. Its import mappings, lookups, input filters and response mappings stay editable. A write that changes a locked field isn't rejected: a PUT answers 200 and keeps the app's value (a PATCH of a locked field gets 422, a change to a flow's steps is refused, and a delete gets 403), so read the resource back after every change to an app's document.

Change the app's behavior through its settings, which the app's own code saves: the app's settings page in the UI, or the CLI's `celigo integrations settings <id>` followed by `celigo integrations persist-settings <id> <field>=<value>` (full mode). No MCP tool saves them, so over MCP send the user to the settings page. A plain write of `settings`, or an edit to the packaged step, skips that code. The save reports success even for a field it didn't store, so read the settings back to confirm each value; `persist-settings` does this and reports each field as saved, unchanged or not saved. A save can also reconfigure the app's flows, so treat it as a write to every flow the setting governs.

Running an app after it's installed -- refreshing a field's options, switching its flows through the app, dating its updates, editions and add-on licenses, uninstalling -- is in [managing-integrations > references/integration-apps.md](../managing-integrations/references/integration-apps.md).

## Publishing Your Own Templates and Integration Apps

`celigo templates list|get|create|update|delete` and the `celigo connectors` group are publisher operations: they manage what an account publishes to the Marketplace, not what it installs. A template record (`/v1/templates`) becomes a listing once its ZIP is uploaded and it's published (gotcha 12). A connector (`/v1/connectors`) is an Integration App's listing, with the integrations installed from it (`connectors install-base`), updates pushed to those installs (`connectors push-update`, which runs the app's update function on each one), and its licenses (`connectors licenses list|get|create|update|delete`, each tying one user to their own installed integration). Only accounts Celigo has enabled to publish -- Partner accounts -- can use them. On any other account they answer 403 `access_restricted` ("You don't have the required permission to perform the request. Please contact Celigo support."), even for its owner with a full-access token: the check is the account's publisher status, not a user permission or token scope, so nothing in the account fixes it. Browsing (`templates marketplace`, `templates preview`) and installing (`templates install`, `install_template` over MCP) never need it, and no MCP tool manages templates or connectors. To run an Integration App you installed, see [managing-integrations > references/integration-apps.md](../managing-integrations/references/integration-apps.md).

## CLI Commands

```bash
# Browse the marketplace catalog (Integration Apps are excluded unless asked for)
celigo templates marketplace --include-connectors  # Templates and Integration Apps
celigo templates marketplace --type Template       # only Templates
celigo templates marketplace --type Connector      # only Integration Apps
celigo templates marketplace --kind mcpserver      # only templates that install an MCP server

# Check the account before installing (avoid duplicates)
celigo account search "<keyword>"

# Preview a blueprint's contents and dependencies (Templates only; an Integration App 404s)
celigo templates preview <id>
celigo templates preview <id> --summary
celigo templates preview <id> --model Connection    # connections the blueprint expects
celigo templates preview <id> --model Integration   # readme and install steps
celigo platform get v1/templates/<id>/preview --jq '{type, stackRequired}'

# Whole-template / Integration App install -> run in the Celigo Marketplace UI installer
#   (open the listing's preview page in the UI). The one-shot install below refuses a
#    template with a template_zip install step (celigo templates preview <id> --model Integration);
#    map every connection the preview lists, and never retry blindly (each request installs again):
echo '{"connectionMap":{"<sourceConnId>":"<targetConnId>"}}' | celigo templates install <id>

# An MCP-server template (type mcpserver): no body, no connection map
celigo mcp-servers install-template <id>

# An integration's ZIP into another account or environment
celigo integrations download <id> -o <file.zip>
celigo templates preview --zip <file.zip> --model Connection
celigo templates install --zip <file.zip> --file map.json   # map.json: {"connectionMap": {...}}

# Integration App settings: list the fields, then save through the app's own code (full mode)
celigo integrations settings <id>
celigo integrations persist-settings <id> <field>=<value>
```

<!-- TIER:3 -->

## Pre-Submit Checklist

Before installing a template or Integration App, or recreating a piece of a template, verify:

- [ ] You searched the account first (`celigo account search`) so you don't duplicate an existing integration or connection
- [ ] You picked the right catalog type -- **Template** (you own and maintain it) vs **Integration App** (vendor-maintained, locked); the choice is hard to reverse
- [ ] You previewed a template's blueprint (`celigo templates preview <id> --summary`) and know which connections it expects, its `type` and whether it needs a stack (`stackRequired`); an Integration App has no preview, so you read its listing instead
- [ ] An MCP-server template (`type: mcpserver`) goes through `celigo mcp-servers install-template`, not `templates install`
- [ ] Every connection the preview lists has an account connection to map it to -- an API install refuses a partial `connectionMap`
- [ ] Every flow you recreate has its target `_integrationId` set
- [ ] Sandbox vs production is correct -- installed flows and connections must match your environment
- [ ] After a timeout or unclear error, you looked for the new integration before retrying the install

## Gotchas

1. **Whole-template install runs in the Marketplace UI.** The one-shot install API doesn't run a template's install steps: a template whose preview `Integration` lists a `template_zip` install step (most published templates) is refused with nothing created. Install from the preview page in the UI.
2. **Templates receive no ongoing updates.** A template is a starting point you own and maintain -- if the source app's API changes, you fix it. Choose an Integration App when you need vendor-maintained updates.
3. **Integration Apps are structure-locked, and a locked write still answers 200.** The app locks its flows' steps, each step's connection, and its own endpoints and hooks; import mappings, lookups, input filters and response mappings stay editable. A PUT that changes a locked field keeps the app's value and answers 200, so read the resource back after every change. Picking an IA when you need deep customization leaves you at the locked-component ceiling.
4. **Nothing maps connections for you.** An API install needs a `connectionMap` with every template connection id as a key: a missing map is refused with `invalid_connectionMap`, and one that doesn't match the template's connections with `invalid_connectionId`. A ZIP install creates credential-less connections for any you leave out, and the UI installer lets you pick an existing connection or create one -- pick yours, or you'll end up with a duplicate.
5. **Nothing copies a single element out of a template.** No API call, CLI command or MCP tool does it. Recreate the piece from the preview in dependency order -- scripts, then exports and imports, then the flow with `_integrationId` set -- with your own connections, or install the whole template and keep what you need.
6. **After install, everything is yours.** Installed and recreated flows, exports, imports, and scripts are ordinary editable resources -- edit, delete, or run them like anything you built by hand. An Integration App's locked parts are the exception (gotcha 3).
7. **Every install request creates a new integration.** Installs aren't idempotent: each request that reaches the platform creates another integration (or MCP server). After a timeout or an unclear error, look for the new integration (the template's `_templateId`, a `createdAt` near the request) before trying again; a blind retry installs a duplicate.
8. **Settings references may not carry over.** Template flows can reference integration or flow-grouping settings (e.g., `{{settings.integration.region}}`). When you recreate a piece, the owning resource doesn't come along: populate those settings on the target before the piece will run.
9. **A 403 on install, or on an MCP-server template's preview, is a user permission, not a plan limit.** It means this user isn't allowed to install templates: a monitor user, or a user with access to specific integrations only, whose access doesn't allow creating integrations (the owner, administrators and manage users always may). An integration template's preview needs no such permission. An account owner or administrator can grant that or run the install. A 403 `access_restricted` from the template-management calls (`celigo templates list`, `create`, `update`, `delete`) or the `celigo connectors` group is different: those are publisher operations, open only to Partner accounts ([Publishing Your Own Templates and Integration Apps](#publishing-your-own-templates-and-integration-apps)).
10. **Lookup cache data only travels when flagged.** A lookup cache's data is included in a blueprint only when `includeDataInTemplatesAndCloning: true`; otherwise the cache lands empty.
11. **Change an Integration App through its settings, and treat each save as a write.** A plain write of `settings`, or an edit to the packaged step, skips the app's own code. Save through the app's settings page or `celigo integrations persist-settings`, then read the values back: the save reports success even for a field it didn't store, and it can reconfigure the flows the setting governs.
12. **Publishing a template takes an uploaded ZIP.** On a Partner account (gotcha 9), a template is created, then its ZIP is uploaded, then it's published: `published: true` is accepted only after the upload, and the ZIP decides the template's `type`. The CLI's `templates create`/`update` manage the record but upload no ZIP; an MCP server's ZIP comes from `celigo mcp-servers download` ([building-mcp-servers](../building-mcp-servers/SKILL.md)).

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `Install step is invalid: invalid templateZip` | The template's install steps include a `template_zip` step, which only the Marketplace installer runs; nothing was created | Install from the listing's preview page in the Marketplace UI |
| `504 Gateway Timeout` or a dropped connection on install | The response was lost; the install itself may have completed | Look for the integration it would have created (the template's `_templateId`, a recent `createdAt`) and its flows before any retry; a second install creates a duplicate |
| `403` on install, or on an MCP-server template's preview | This user isn't allowed to install templates (a monitor user, or one limited to specific integrations, whose access doesn't allow creating integrations) | Ask an account owner or administrator to grant that or run the install |
| `403 access_restricted` on `celigo templates list`, `create`, `update` or `delete`, or on `celigo connectors list`, `get`, `create`, `update`, `delete`, `install-base` or `push-update` | Publishing templates and Integration Apps needs an account Celigo has enabled to publish (a Partner account); the owner and full-access tokens get it too | Nothing to change in the account: browse with `celigo templates marketplace`, and ask Celigo about publishing |
| Installed flow won't run -- missing setting | Blueprint referenced integration or flow-grouping settings that didn't come along | Populate the referenced `settings.<scope>` values on the target integration or flow grouping |
| `invalid_connectionMap` or `invalid_connectionId` on install | The `connectionMap` is missing, or its keys don't match the template's connections | List the connections the template expects (`celigo templates preview <id> --model Connection`) and map every one |
| `400` `invalid_template` ("MCP server templates cannot be installed through the Integration template path.") | The template's `type` is `mcpserver` | Install it with `celigo mcp-servers install-template <id>` |
| `404` on `mcp-servers install-template` | The template installs an integration, not an MCP server | Install it with `celigo templates install <id>` and a `connectionMap`, or in the Marketplace UI |
| `404` `Template not found.` previewing an Integration App | Only templates have a preview | Read the app's listing and documentation; install it from the Marketplace UI |
| Duplicate connection after install | The install created a new connection instead of using your existing one | Point the installed flows at your existing connection (`celigo flows replace-connection <flowId> <duplicateConnectionId> <existingConnectionId>`), check nothing else uses the duplicate (`celigo connections dependencies <duplicateConnectionId>`), then delete it |
| Installed resource can't be edited | It's an Integration App core component (upgrade-protected), not a template resource | Change it through the app's settings, edit what the app leaves open (mappings, lookups, filters), or use a Template when you need full control |
| An edit to an Integration App resource "succeeds" but nothing changed | The app locks that field | Change it through the app's settings, or build a companion flow outside the app |
| An Integration App settings save reports success but the value didn't change | The field name or shape didn't match the app's form (a multi-store app nests values under the store id), so nothing was stored | List the fields with `celigo integrations settings <id>` and save with `celigo integrations persist-settings`, which reports each field |
