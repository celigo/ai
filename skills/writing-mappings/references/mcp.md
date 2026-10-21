# Writing Mappings with the Celigo MCP Tools

The tool calls for each step of the writing-mappings workflows, for agents connected to the Celigo Platform MCP server. Section names and step numbers match [SKILL.md](../SKILL.md).

## Ids

- A flow's steps are the exports in `pageGenerators[]` and the lookups and imports in `pageProcessors[]` (each entry's `_exportId` or `_importId`) of `list_flows({ _id })`. In a flow with `routers[]`, the steps sit under `routers[].branches[].pageProcessors[]` instead. A step's response mapping is on its entry there.
- Metadata is read through a connection id -- the export's or import's `_connectionId` -- not through the export or import id.
- In `get_schema({ target: "resource", name: "import/<sub-schema>" })`, the sub-schema is the lowercase name of the family's adaptor schema (`http`, `rdbms`, `ftp`, `salesforce`, `netsuitedistributed`, ...), not the document's `adaptorType` value (`HTTPImport`). Ask for `name: "import"` alone to get the family schema and its `availableSubSchemas`.

## Mapper 2.0 Workflow

### 1. Check the existing resource

```
list_imports({ _id: "<importId>" })    // mappings[] is Mapper 2.0; mapping.fields[] (netsuite_da.mapping on NetSuite) is 1.0
```

Exports and imports have no name filter. Without an id, find the step through its flow, or list and match names yourself:

```
list_flows({ name: "<keyword>" })                    // server-side match on the flow name
list_flows({ _id: "<flowId>" })                      // the steps' _exportId / _importId
list_imports({ include: "_id,name,adaptorType" })    // every import, projected -- match the name client-side
```

### 2. Understand the source data shape

No MCP tool invokes an export (see Not Available over MCP). Read the source system's metadata instead -- or, when the step has errors, the real records it failed on:

```
get_schema({ target: "connector", name: "<sourceConnectionId>" })                                        // the app's record types, fields, picklists
list_flow_errors({ _id: "<flowId>", _stepId: "<importId>", limit: 5 })                                   // each error's retryDataKey
get_flow_error_retry_data({ _id: "<flowId>", _stepId: "<importId>", retryDataKey: "<retryDataKey>" })    // that record (data) as it reached the step
```

The metadata comes back in one block -- there is no per-entity call and no cache refresh.

### 3. Understand the target data shape

```
get_schema({ target: "connector", name: "<targetConnectionId>" })
```

### 6. Add lookups for value translation

```
list_lookup_caches({})                                           // the cache a dynamic lookup's _lookupCacheId names
list_lookup_cache_data({ _id: "<cacheId>", keys: ["<key>"] })    // check that a key resolves
```

## Transformation 2.0 Workflow

### 1. Check the existing resource

```
list_exports({ _id: "<exportId>" })    // transform{}
```

Find an export without its id the same way as an import (Mapper 2.0 step 1), with `list_exports`.

## Mapper 1.0 Reference (NetSuite and Salesforce)

```
get_schema({ target: "connector", name: "<connectionId>" })
```

Look in the returned metadata for the NetSuite record type's field IDs (the exact `searchField` / `resultField` values) and sublists, or the Salesforce object's relationship fields. When what you need is not in that block, see Not Available over MCP.

## Response Mapping Reference (Transformation 1.0)

A response mapping is part of the flow, so changing one replaces the flow:

```
list_flows({ _id: "<flowId>" })
upsert_flow({ _id: "<flowId>", body: <the complete flow, the step's responseMapping edited> })
```

- PUT replaces the whole flow, every step's `responseMapping` with it: a step sent without one resets to empty `{ fields: [], lists: [] }`. Send every step back as you fetched it.
- Keep `fields` and `lists` bare arrays. The API accepts an object wrapper and erases the step's mappings; the CLI refuses that shape, `upsert_flow` does not.
- Test runs never execute imports, so an `extract: "id"` from an import's response merges nothing in a test run, though it works on real runs.

## Save the Change

No MCP tool patches an import or an export, and `patch_flow` takes no step paths, so every mapping, transform, or response-mapping change is a full replace:

```
get_schema({ target: "resource", name: "import/http" })    // the adaptor's JSON schema
list_imports({ _id: "<importId>" })
upsert_import({ _id: "<importId>", body: <the complete import, mappings edited> })
upsert_export({ _id: "<exportId>", body: <the complete export, transform edited> })
```

The schema call works the same way for `export` and `flow`. Mapper 2.0 is the top-level `mappings[]` array and `mapping` is Mapper 1.0 -- keep whichever the import already uses.

- PUT replaces the whole document and erases whatever you leave out -- drop `netsuite_da.mapping.lists` or `_connectionId` and it is gone. Send back everything you fetched, minus the server-managed `_id`, `lastModified`, and `createdAt`. The CLI's `set` does this read-edit-write for you; over MCP it is yours to do.
- Mappings are not masked, so an import, export, or flow survives the round trip. A connection document masks its credentials as `******`; sent back as read, a mask keeps its stored secret. Of the write tools, only `upsert_connection` refuses a mask without `force: true`, while the CLI checks every document; if an import, export, or flow you fetched carries `******`, ask the user before sending it back.
- `upsert_import` and `upsert_export` don't check whether an Integration App owns the document (`_connectorId` set). The CLI refuses that write by default because a raw PUT bypasses the app's connector code -- confirm with the user before replacing one.

## Check the Change

No MCP tool test-runs a flow. After saving, have the user test-run it in the Celigo UI, or test-run it with the CLI, which also reads each stage's input and output. A test run never executes the flow's imports, but it still calls the connected systems for the steps it runs: confirm with the user before test-running a flow whose steps write.

To see the mapped record over MCP, the flow has to run for real with execution logging armed -- the import's `apiCall` stage then holds the request it sent (**troubleshooting-flows**, [step 6](../../troubleshooting-flows/references/mcp.md#6-execution-logs)). A real run writes to the destination, so that is the user's call.

## Not Available over MCP

- **Invoking an export** to see the records it returns (Mapper 2.0 step 2). Use the CLI (`celigo exports invoke <exportId>`), REST (`POST /v1/exports/{_id}/invoke`), or the export's preview in the UI.
- **A keyword search across resource types** (step 1) -- filter flows by name, or list imports and exports and match names client-side.
- **Per-entity metadata reads and a metadata cache refresh.** When the metadata block lacks a record type's fields, NetSuite sublists, or Salesforce relationships, use the CLI (`celigo metadata fields <connectionId> <entityType> --refresh`) or the UI.
- **Previewing an unsaved mapping** against sample records. The UI's import editor Preview composes the destination request without sending it (REST: `POST /v1/pageProcessors/preview` with `options: { preview: true }` on the target step's `pageProcessorMap` entry; `sendAndPreview` sends it -- a real write). The CLI has no command for it either. Over MCP, save the change and have the flow test-run (Check the Change).
- **Test runs** and **a test run's per-stage results** -- the UI, or the CLI's `celigo flows test-run` and `celigo flows test-run-step-results`.

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
