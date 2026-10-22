# Writing Settings Forms with the `celigo` CLI

The commands for each step of How to Build a Settings Form, then How to Check a Form. Step numbers and headings match [SKILL.md](../SKILL.md). Before the first write of a session (set, update, create), confirm which account the CLI targets with one `celigo profile whoami` (the account, environment and token it authenticates as) -- see getting-started, "Which account the CLI targets".

## How `set` and `update` Write These Fields

| Group | `set <id> settings.<key>=...` | `set <id> settingsForm...=file://...` | `set <id> settings=<object>` |
|---|---|---|---|
| `integrations` | GET, edit, PUT: the other keys stay | GET, edit, PUT | One PATCH of the whole object: keys you leave out are removed |
| `flows`, `exports`, `imports` | GET, edit, PUT: the other keys stay | GET, edit, PUT | GET, edit, PUT: the object is replaced, so keys you leave out are removed |
| `connections`, `iclients` | Refused | Refused | Refused |

- `set <id> settingsForm=file://form.json` replaces the whole `settingsForm`, so an `init` it doesn't carry is removed. `set <id> settingsForm.form=file://form.json` changes the form and keeps `init`.
- `integrations set <id> 'flowGroupings[<n>].settingsForm=file://form.json'` and `'flowGroupings[<n>].settings.<key>=...'` edit one flow group with a GET, edit, PUT; `<n>` is the group's position in the integration's `flowGroupings`. `integrations set <id> flowGroupings=file://groups.json` PATCHes the whole array: send every group with its `_id`, `name`, `settings`, and `settingsForm`.
- `<group> update <id> --file doc.json` PUTs exactly what you send: a document without `settingsForm` or `settings` erases them. Read the resource first.
- **Connections and iClients:** `set` refuses both fields, because their reads mask secrets. Change them with a full update that sends every `******` back exactly as read, with `--force` -- see [configuring-connections > Writes](../../configuring-connections/references/cli.md#writes-set-and-update).
- **Integration Apps:** `integrations settings`, `refresh-settings-metadata`, and `persist-settings` work an app's settings, not a settings form -- see [managing-integrations > Integration Apps](../../managing-integrations/references/integration-apps.md).

## 1. Decide the scope

```bash
celigo integrations get <integrationId>                          # settings, settingsForm, and flowGroupings[] with each group's settings and form
celigo integrations flow-groups <integrationId>                  # the groups' ids and names
celigo integrations create-flow-group <integrationId> "<name>"
celigo flows set-group <flowGroupingId> <flowId> [<flowId> ...]   # put flows in the group
```

## 2. Read the resource

```bash
celigo integrations get <integrationId> > integration.json
celigo flows get <flowId> > flow.json          # likewise exports, imports, connections, iclients
celigo --jq '{settingsForm, settings}' flows get <flowId>
```

## 3–5. Write the fields, lay them out, add conditions

Write the form in a local file (`form.json` holds `{"fieldMap": {...}, "layout": {...}}`, the content of `settingsForm.form`). No command checks it against the form rules: do the checks in How to Check a Form.

## 6. Build the dynamic fields

Save each inline export -- an `exportSelect`'s `resource.virtual`, a `staticMap` column's `keyResource.virtual` or `valueResource.virtual` -- in its own file with `"test": {"limit": 100}` added, and preview it:

```bash
celigo exports invoke --file warehouse-export.json    # previews the export document: data must be label/value records
```

The preview runs the export's transform, output filter, and preSavePage hook, and nothing is saved. Without `test.limit` it returns one record.

## 7. Add an init script (optional)

```bash
celigo scripts create --file init-script.json          # {"name": "Order settings - initForm", "content": "function initForm(options) { ... }"}
celigo processors invoke javascript --file init-test.json
celigo integrations set <integrationId> settingsForm.init._scriptId=<scriptId> settingsForm.init.function=initForm
```

`init-test.json` is `{"rules": {"function": "initForm", "code": "<the script source>"}, "data": <the options the function gets>}` -- see How to Check a Form. A `_scriptId` the account doesn't own fails the `set` with 422.

## 8. Save the form and the values together

```bash
# keep the existing values and add new ones
celigo flows set <flowId> settingsForm.form=file://form.json settings.region=eu settings.vatNumber=EU123
# or replace all the values
celigo flows set <flowId> settingsForm.form=file://form.json 'settings={"region": "eu", "vatNumber": "EU123"}'
# a flow group: the second group in flowGroupings
celigo integrations set <integrationId> 'flowGroupings[1].settingsForm=file://group-form.json' 'flowGroupings[1].settings.region=eu'
```

`settingsForm.form=` takes the content of `form` (`fieldMap` and `layout`); `settingsForm=` takes `{"form": {...}, "init": {...}}`. One `set` with several assignments sends one write.

To change one field, set only its entry. `set` reads the resource, replaces that entry and saves the rest as read, so the other fields and the layout stay as they are:

```bash
celigo flows set <flowId> settingsForm.form.fieldMap.warehouse=file://warehouse-field.json   # the field's entry: {"id": "warehouse", "type": "exportSelect", ...}
```

A connection or an iClient takes a full update:

```bash
celigo connections get <connectionId> > connection.json
# edit settingsForm and settings in connection.json; leave every ****** as read
celigo connections update <connectionId> --file connection.json --force
celigo iclients get <iClientId> > iclient.json
celigo iclients update <iClientId> --file iclient.json --force
```

## 9. Read the values in steps

Nothing CLI-specific: steps reference `settings.<scope>.<name>` (SKILL.md, The Seven Scopes). To see a saved import render them as a flow step, see step 4 of How to Check a Form.

## How to Check a Form

```bash
# 1. read back what was stored
celigo --jq '{settingsForm, settings}' exports get <exportId>
celigo --jq '.flowGroupings[] | {name, settings, settingsForm}' integrations get <integrationId>

# 2. preview each inline export, with "test": {"limit": 100}
celigo exports invoke --file warehouse-export.json

# 3. run the init function on a hand-built options object
celigo processors invoke javascript --file init-test.json

# 4. render a template that reads settings -- stateless, nothing saved or sent
echo '{"rules": {"template": "{\"region\": \"{{settings.flow.region}}\"}", "resultMode": "text"},
       "data": {"record": {"id": "test-1"}, "settings": {"flow": {"region": "eu"}}}}' | celigo processors invoke handlebars
# an unsaved export with "settings" in the document renders settings.export from it
celigo exports invoke --file export-with-settings.json
# a saved import as a step of its flow: settings.integration, .flowGrouping, .flow and .import all render.
# A real write -- every piped record is sent to the destination, so use a test destination
echo '[{"id": "test-1"}]' | celigo imports invoke <importId> --connection <connectionId> --integration <integrationId> --flow <flowId>
```

In step 3, `data` is what `options` holds when the form opens: `{"resource": <the resource, with its settingsForm and settings>, "sandbox": false}`, plus `"parentResource": <the integration>` for a flow group's form. The reply's `data` is the form the function returns; a throw comes back as 422 with the thrown message.

An `imports invoke <importId>` without `--integration` and `--flow` sees only the step's own settings: `settings.integration`, `settings.flowGrouping`, and `settings.flow` come out empty. So does a saved `exports invoke <exportId>`.
