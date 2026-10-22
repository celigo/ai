# Settings Forms

A settings form (`settingsForm`) is the form the Celigo UI shows to collect a resource's `settings`: which fields appear, their labels and choices, how they're laid out, and which show when. Integrations, flows, exports, imports, connections and iClients can each carry one, and so can each of an integration's flow groups. An Integration App's settings are driven by the app's own code instead -- see [integration-apps.md](integration-apps.md).

## What the Form Does and Doesn't Do

- **It shapes the UI only.** An API or CLI write of `settings` doesn't go through the form: it stores the object it's given, even without a field the form marks `required`, and keeps keys the form doesn't define.
- **The save doesn't check the form either.** A layout entry or a `visibleWhen` condition that names a field missing from `fieldMap` is stored as sent. Only the UI renders the form, so open it there after changing it.
- **The values are what the flows read.** Steps read them at run time by scope -- `settings.integration.<key>`, `settings.flowGrouping.<key>`, `settings.flow.<key>`, the connection's and iClient's, and the step's own `settings.export.<key>` or `settings.import.<key>` ([writing-handlebars > Context Decision Matrix](../../writing-handlebars/SKILL.md#context-decision-matrix-afe-20), [writing-scripts](../../writing-scripts/SKILL.md)). When you add or rename a field, write the matching `settings` value too, and read the resource back.

## The Shape

```json
{
  "settingsForm": {
    "form": {
      "fieldMap": {
        "region": {
          "id": "region", "name": "region", "type": "select", "label": "Region", "required": true,
          "options": [{ "items": [{ "label": "United States", "value": "us" }, { "label": "Europe", "value": "eu" }] }]
        },
        "vatNumber": {
          "id": "vatNumber", "name": "vatNumber", "type": "text", "label": "VAT number",
          "visibleWhen": [{ "field": "region", "is": ["eu"] }]
        }
      },
      "layout": { "type": "column", "containers": [{ "type": "box", "label": "General", "fields": ["region", "vatNumber"] }] }
    }
  },
  "settings": { "region": "us" }
}
```

- **`form.fieldMap`** -- one entry per field, keyed by the field's id. A field's `name` is the key its value is saved under in `settings`, and its `id` is how the layout and conditions refer to it, so give each field the same string for its `fieldMap` key, `id` and `name`.
- **`type`** -- `text`, `checkbox`, `radiogroup`, `relativeuri`, `editor`, `keyvalue`, `select`, `multiselect`, `toggle`, `datetime`, `date`, `exportSelect` (a dropdown whose options are records an export returns) or `staticMap` (a two-column table that pairs source and destination values). `label`, `description`, `helpText` and `required` (default `false`) apply to every type.
- **`options`** -- the choices of a `select`, `multiselect`, `radiogroup` or `toggle`: groups (`{"items": [...]}`, each item a string or a `{label, value}` pair) or bare `{label, value}` entries.
- **`visibleWhen`** -- shows the field only while another field (`field`, by id) holds one of the listed values (`is`).
- **`form.layout`** -- a `type` (`column`, `collapse`, `box`, `indent`, `tabWithoutSave`, `verticalTabWithoutSave`) and `containers`, each listing field ids in `fields`; every id there must be a `fieldMap` key.
- **`settingsForm.init`** -- `{"_scriptId": "<scriptId>", "function": "<name>"}`: a script function that runs when the form loads. It receives `options.resource` (and the parent and grandparent resources) and returns the form to render; a throw shows the user an error.
