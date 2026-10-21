# Writing Mappings with the `celigo` CLI

The commands for each step of the writing-mappings workflows. Section names and step numbers match [SKILL.md](../SKILL.md). Before the first write of a session (`set`, `update`), confirm which account the CLI targets -- see getting-started, "Which account the CLI targets".

## Mapper 2.0 Workflow

### 1. Check the existing resource

```bash
celigo account search <keyword>              # Find imports/exports by name
celigo imports get <importId>                 # Inspect existing import (check mappings vs mapping)
```

`account search` searches a local index of the account and refreshes it first when it is stale (`--no-refresh` skips that). Narrow it with `--type import` (or `export`, `flow`, ...) and `--limit <n>` (default 20).

### 2. Understand the source data shape

```bash
celigo exports invoke <exportId>              # See real source records
celigo metadata fields <sourceConnectionId> <entityType>
```

`exports invoke <exportId>` runs the saved export exactly as stored and returns its records without creating a job. A piped body is ignored when you pass an id; `--all` pages through every result. The records come back after the export's transform, without what earlier steps' response mappings add -- for the record exactly as it reaches the import, test-run the flow and read the import's `mapping` stage input (Check the Change).

### 3. Understand the target data shape

```bash
celigo metadata types <targetConnectionId>               # List entity types
celigo metadata fields <targetConnectionId> <entityType> # List fields for an entity
```

`metadata` works only on NetSuite, Salesforce, and RDBMS connections. `types` lists NetSuite record types and saved searches, Salesforce sObjects, or RDBMS tables; `fields` lists one entity's fields (for RDBMS, a table's columns -- if none come back, qualify the table as `database.schema.table`). `--refresh` bypasses the metadata cache.

### 6. Add lookups for value translation

```bash
celigo lookup-caches list                                            # Find the cache a cached lookup's _lookupCacheId names
echo '{"keys":["<key>"]}' | celigo lookup-caches get-data <cacheId>  # Check that a key resolves
```

## Transformation 2.0 Workflow

### 1. Check the existing resource

```bash
celigo exports get <exportId>                 # Inspect existing export (check transform)
celigo account search <keyword>
```

## Mapper 1.0 Reference (NetSuite and Salesforce)

```bash
celigo metadata fields <connectionId> <recordType>    # NetSuite: the id column is the field ID that generate, searchField and resultField take (name is the label); sublists appear as field groups
celigo metadata fields <connectionId> <sObjectType>   # Salesforce: relationship fields and child objects; a child list's lists[].generate is the child relationship name
```

## Response Mapping Reference (Transformation 1.0)

A response mapping is part of the flow, so you change it through the flow:

```bash
celigo flows get <flowId>
celigo flows set <flowId> 'pageProcessors[<n>].responseMapping=file://./response-mapping.json'
celigo flows update <flowId> < flow.json
```

In a flow with routers, the step is at `routers[<r>].branches[<b>].pageProcessors[<n>]`. Both `set` and `update` refuse a `responseMapping` whose `fields` or `lists` is an object or null -- the platform would accept it and erase the step's mappings.

## Save the Change

```bash
celigo imports set <importId> <key>=<value> [<key2>=<value2> ...]   # Field-level edit (dot/bracket paths, JSON values)
celigo exports set <exportId> <key>=<value> [<key2>=<value2> ...]
celigo imports update <importId> < import.json                      # Full PUT replace from stdin JSON
celigo exports update <exportId> < export.json
```

`set` does the GET, edit, and PUT for you. It PATCHes only whitelisted fields -- `debugUntil` on imports, `debugUntil` and `assistantMetadata` on exports -- so every mapping or transform assignment is written back with the complete document. Values are parsed as JSON (with a string fallback), `null` removes a field, and `<key>=file://<path>` loads the value from a file: the easy way to replace a whole `mappings` array or `transform` object. `set` writes the value at the path as given and merges nothing, so a `mappings` value must hold every row you keep, not just the new one. To add one row, assign it at the next index -- `'mappings[<n>]=file://./row.json'`, with `<n>` the current row count (`transform.expression.rulesTwoDotZero.mappings[<n>]` on an export). `update` sends its body as the complete document, so start from the `get` output.

Both refuse to send the masked `******` placeholder (`update --force` sends it anyway). On an Integration App's import, export, or flow (`_connectorId` set) the platform answers 200 but keeps its own value for every field the app locks, so read the document back after a write; from CLI 2026.10.1, `set` and `update` name the fields it kept on stderr and exit 1.

## Check the Change

```bash
celigo flows test-run <flowId> --export <exportId>
celigo flows test-run-step-results <flowId> <runId> <importId>
```

`test-run` returns `metadata`, `flowJob`, and `childJobs` -- the run id is `flowJob._id`; `test-run-step-results` returns the step's stages as `{name, input, output, errors}`. Read the import's `mapping` stage: its `input` is the record as it reached the import, its `output` the mapped record. A transform runs as `transformTwoDotZero`, an import's response transform as `responseTransformation`, and a response mapping as `responseMap`. An enabled flow test-runs as well as a disabled one, so there is nothing to switch off first (live-verified 2026-10-14; CLI 2026.9.x's help still says the flow must be disabled).

A test run never sends the import: its `request` stage shows an `http.body` template unrendered, and `response` is the saved `mockResponse` or a placeholder. It maps only the first page of records. It also saves the records each export returned as that export's `mockOutput`, and later test runs replay them instead of calling the source: a re-run maps the same records, a transform that reads response headers gets none, and a `modify` transform runs again on its own output. Remove `mockOutput` from the export to read the source again.
