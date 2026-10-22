# Operating an Integration App

An Integration App is an integration installed from the Marketplace whose flows, steps and connections belong to the app, a product its publisher maintains and updates. This reference covers working on one after it's installed: recognizing its resources, changing its settings, what it locks, turning its flows on and off, versions and updates, environments and stores, editions and licenses, and uninstalling. What a particular app's settings and flows do is in that app's own documentation; installing one is in [using-marketplace-templates](../../using-marketplace-templates/SKILL.md).

- **CLI:** `celigo integrations settings`, `refresh-settings-metadata` and `persist-settings` work the app's settings form, the resource commands read and write its documents, and `celigo audit list --source connector` shows the app's own changes.
- **MCP:** the deployed server reads an app's integration, flows and steps like any others (`list_integrations` with the integration's `_id` returns the whole document) and its audit log (`list_audit_log_entries` with `source: "connector"`). No tool saves an app's settings or switches its flows through the app, and `upsert_integration` is a full update that stores `settings` without running the app's code, so hand those changes to the app's page in the UI or to the CLI.

## Recognizing an App's Resources

`_connectorId` marks them: it's on the app's integration and on the flows, exports, imports and connections the app installed. It's read-only; never set it. The installer fields aren't markers: `mode`, `install`, `installSteps` and `_templateId` also appear on plain integrations made by the UI's clone-and-install.

An app keeps its settings form in the integration's `settings` (`settings.general` and `settings.sections[]`: tabs, nested sections, then fields; a flow's own fields sit in its `settings[]`). A multi-store app (`settings.supportsMultiStore: true`) has one `settings.sections[]` entry per store.

## Changing Settings

The app's own code saves its settings: it validates the values, rewrites the integration's settings and can reconfigure the flows they govern. That's the app's settings page in the UI, or:

```bash
celigo integrations settings <id>                       # every field: name, label, type, value, section, store, refreshable
celigo integrations settings <id> --field-name <name>   # one field's whole definition, options included
celigo integrations refresh-settings-metadata <id> --field-name <name>   # re-pull the field's options (the UI's Refresh)
celigo integrations persist-settings <id> <name>=<value> [--store <storeId>]   # save through the app (the UI's Save); full mode
```

- **Read every value back.** The save answers success even for a field it didn't store -- an unknown name, or a multi-store value that isn't nested under its store id -- so `persist-settings` resolves each name against the form first, re-reads the integration afterwards, and reports every field `saved`, `unchanged` or `not-saved`; trust that report, not the response. A plain write of `settings` (`integrations set` or `update`, or MCP's `upsert_integration`) stores the values without running the app's code.
- **Treat a save as a write to every flow the setting governs**, since the app's code may reconfigure them.
- **Option lists hold what the app last fetched.** After creating a saved search, location or similar in the connected system, refresh that field before choosing the new entry. A static map's refresh writes the new list into the integration; a select's doesn't.
- **Value shapes:** a select that yields a value and a label takes `{"id": …, "label": …}`, and a static map takes `{"map": {…}, "default": …, "allowFailures": …}`. A masked value (`******`) is refused before anything is sent, because the app would store it as the setting.
- **In a pulled tree**, `celigo push --allow-connector-settings` saves the values edited in the app's `integration.json` the same way (one save per store, each read back) and refuses any other change to that file.

## What the App Locks

What's locked, what stays editable, and how a locked write answers are in [using-marketplace-templates > Changing an Installed Integration App](../../using-marketplace-templates/SKILL.md#changing-an-installed-integration-app). The rule that matters most: a PUT that changes a locked field answers 200 and keeps the app's value, so read the resource back after every change to an app's document. What the tools add:

- `celigo <type> set` and `update` compare the reply with what they sent: they name every field the platform kept on stderr (`the platform kept its own value for <fields> — the Integration App locks it`) and exit 1. Don't repeat that write; change the behavior through the app's settings, or build a companion flow outside the app.
- `celigo push` leaves an app's documents alone unless you pass `--allow-connector-resources`, and a field the platform kept fails that item.
- The audit log tells the app's own writes from the account's: entries with `source: connector` are the app's, and `ui`, `api`, `cli`, `mcp` or `script` entries are changes made in the account.

## Turning Flows On and Off

Switch an app's flow with the app's own toggle, which saves through the app like a setting, so the app's code runs for it. In the UI that's the flow's switch on the app's page. From the CLI it's a raw `persist-settings` body, which the CLI checks against the flow afterwards:

```bash
# toggle.json: {"pending": {"flowId": "<flowId>", "disabled": true}}
#   (a multi-store app nests it under the store: {"pending": {"<storeId>": {"flowId": "<flowId>", "disabled": true}}})
celigo integrations persist-settings <id> --file toggle.json
```

A direct flow write (`celigo flows set <flowId> disabled=true`, or a PATCH of the flow) changes the flow without the app's code.

## Versions and Updates

- The app's publisher pushes new versions to installs (through its own update code); the integration API has no call that installs, chooses or reverts a version.
- `version` on the integration is the installed version. No API field holds the newest available one, so whether a newer release exists can't be read from the platform.
- To date an update, read the integration's audit log for `version` changes from source `connector`: `celigo audit list --resource-type integrations --resource-id <id> --source connector`, or over MCP `list_audit_log_entries` with `resourceType: "integration"`, `_resourceId` and `source: "connector"`. Each version step is an entry, and one update run often writes several in a row. `lastModified` moves on any write, `updateInProgress` can flip without a version change, and `resolvedAt` may be missing, so none of them dates an update.

## Environments and Stores

An app sits outside cloning and lifecycle management: it's installed in each environment from the Marketplace, under one license, and new stores or accounts come through the app's own Add store flow (see [Plain Integrations vs Integration Apps](../SKILL.md#plain-integrations-vs-integration-apps)). Each extra store is licensed as an add-on on the app's license (below).

## Editions and Licenses

- The app's license is one of the account's licenses (`celigo subscriptions licenses`): the entry whose `_integrationId` is this integration (`type` `connector`, `integrationApp` or `integrationAppChild`). `opts.connectorEdition` is the licensed edition (for example `standard`, `premium` or `enterprise`), and `opts.addonLicenses` lists the add-ons, such as extra stores (`type: store`).
- Changing the edition is the app's own workflow, started from the app in the UI: it runs the integration's `changeEditionSteps`, and `pendingLicense` describes a change in progress. The API's `POST /v1/integrations/{_id}/changeEdition` starts one on an app that supports edition changes (422 `invalid_integration_app` otherwise); no CLI command or MCP tool calls it. Writing the integration's own fields changes nothing that's licensed.

## Uninstalling

Uninstalling is the app's own workflow in the UI. It runs the integration's `uninstallSteps` and the app's uninstall code, and the integration's `mode` reads `uninstall` while it's in progress. No CLI command or MCP tool uninstalls an app, and deleting the app's documents directly is refused (403).
