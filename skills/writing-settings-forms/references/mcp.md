# Writing Settings Forms with the Celigo MCP Tools

The tool calls for each step of How to Build a Settings Form, then How to Check a Form, for agents connected to the Celigo Platform MCP server. Step numbers and headings match [SKILL.md](../SKILL.md).

**The deployed server writes forms only by full replacement.** `upsert_integration`, `upsert_flow`, `upsert_export`, `upsert_import`, `upsert_connection`, and `upsert_iclient` with an `_id` replace the whole document, `settingsForm` and `settings` included, and `patch_flow` can't reach either field. The server can't preview a dropdown's export, run an init function, or render a template -- see Not Available over MCP.

## Ids and Reads

- Read one resource with its `_id` -- `list_integrations`, `list_flows`, `list_exports`, `list_imports`, `list_connections`, or `list_iclients` with `{ _id }` -- to get the whole document: `settingsForm`, `settings`, and everything a full update must send back. Listing integrations, flows, exports, or imports without an `_id` returns summary rows without either field.
- A flow group lives in its integration: `list_integrations({ _id: "<integrationId>" })` returns `flowGroupings[]`, each with its `_id`, `name`, `settings`, and `settingsForm`. A flow names its group in `_flowGroupingId`.
- `get_schema({ target: "resource", name: "common/form" })` returns the form schema, and `name: "common/settings"` the description of `settings` and its scope keys.

## How Writes Work

- `upsert_<type>` without an `_id` creates the resource; with an `_id` it replaces the whole document. Read the resource first, change `settingsForm` and `settings` in it, and send the complete document back. A body without `settingsForm` or `settings` erases them, and a `settingsForm` without `init` removes the init script.
- `patch_flow` changes only the paths the platform's flow patch allows (`/name`, `/description`, `/disabled`, `/logging/debugUntil`, `/logging/mode`, `/runPageGeneratorsInParallel`, `/aiDescription`, `/schedule`, `/timezone`): a patch of `/settings` or `/settingsForm` is refused with 422. Use `upsert_flow`.
- No other resource has a patch tool, so every form change on an integration, a flow group, an export, an import, a connection, or an iClient is a full upsert.
- **Connections** carry masked secrets: `upsert_connection` with an `_id` takes the complete document with every `******` left as read, and `force: true`. **iClients** take every secret field as read (no `force`). See [configuring-connections > Writes](../../configuring-connections/references/mcp.md#writes) before updating either.

## 1. Decide the scope

```
list_integrations({ _id: "<integrationId>" })    // settings, settingsForm, flowGroupings[] with each group's settings and form
list_flows({ _id: "<flowId>" })                   // _flowGroupingId: the flow's group
```

To add a flow group, send `upsert_integration` the complete integration with a new `flowGroupings` entry (`{ name: "<name>" }`, no `_id`); the reply carries the group's `_id`. Put a flow in it by saving the flow with `upsert_flow` and that `_flowGroupingId`.

## 2. Read the resource

```
list_flows({ _id: "<flowId>" })           // likewise list_integrations, list_exports, list_imports, list_connections, list_iclients
get_schema({ target: "resource", name: "common/form" })
```

## 3–5. Write the fields, lay them out, add conditions

Build the form object (`{ form: { fieldMap, layout }, init? }`) in the conversation. Nothing on the server checks it against the form rules: do the checks in How to Check a Form.

## 6. Build the dynamic fields

Write each `exportSelect`'s `resource.virtual` (and a `staticMap` column's `keyResource` / `valueResource`) as an export body that returns `label` / `value` records. Previewing it isn't available over MCP: have the user preview it with the CLI or open the form in the UI after saving, and read the dropdown.

## 7. Add an init script (optional)

```
upsert_script({ body: { name: "Order settings - initForm", content: "function initForm(options) { ... return form; }" } })
```

Then set `settingsForm.init` to `{ _scriptId: "<scriptId>", function: "initForm" }` in the resource's full update (step 8). A `_scriptId` the account doesn't own is refused with 422. Running the function before you save isn't available over MCP.

## 8. Save the form and the values together

```
upsert_flow({ _id: "<flowId>", body: <the complete flow, with settingsForm and settings> })
upsert_integration({ _id: "<integrationId>", body: <the complete integration; a group's form and values in its flowGroupings[] entry> })
upsert_export({ _id: "<exportId>", body: <the complete export> })            // likewise upsert_import
upsert_connection({ _id: "<connectionId>", force: true, body: <the complete connection, every ****** left exactly as read> })
upsert_iclient({ _id: "<iClientId>", body: <the complete iClient, secret fields as read> })
```

Leave out the read-only fields a read returns (`_id` goes in the tool's own argument, not the body; `lastModified`, `createdAt`). Send every `flowGroupings[]` entry back with its `_id` -- an entry without one is a new group.

## 9. Read the values in steps

Reference each value through its scope key (SKILL.md, The Seven Scopes) in the steps you build with `upsert_export`, `upsert_import`, and `upsert_flow`.

## How to Check a Form

1. **Read the resource back** with `list_<type>({ _id })` and compare `settingsForm` and `settings` with what you sent; then check the form yourself as SKILL.md describes. The save validates nothing against the form.
2. **Steps 2–4 of SKILL.md's checks** -- previewing an inline export, running the init function, rendering a template with settings -- need the CLI or the UI.
3. **Open the form in the UI**, or ask the user to: only the UI renders it.

## Not Available over MCP

- **Previewing an export** -- an `exportSelect`'s or a `staticMap` column's inline export -- the CLI's `exports invoke --file`, the UI, or `POST /v1/exports/preview`.
- **Running an init function** -- the CLI's `processors invoke javascript`; the UI runs it each time it opens the form.
- **Rendering a template with settings** -- the CLI's `processors invoke handlebars`.
- **Invoking an export or import** to see settings render -- the CLI's `exports invoke` and `imports invoke` (with `--integration` and `--flow` for the flow's settings).
- **Patching an integration's `settings` or `flowGroupings` alone** -- the CLI's `integrations set`, or `PATCH /v1/integrations/{_id}`; over MCP it's a full `upsert_integration`.
- **Assigning flows to a group through its own route** -- the CLI's `flows set-group`; over MCP, `upsert_flow` with `_flowGroupingId`.
- **Integration App settings** -- the CLI's `integrations settings`, `refresh-settings-metadata`, and `persist-settings`, or the app's settings page ([managing-integrations > Integration Apps](../../managing-integrations/references/integration-apps.md)).

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
