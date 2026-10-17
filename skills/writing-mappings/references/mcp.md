# Writing Mappings with the Celigo MCP Tools

The tool calls for each step of the writing-mappings workflows, for agents connected to the Celigo Platform MCP server. Section names and step numbers match [SKILL.md](../SKILL.md).

## Ids

- A flow's steps are the exports in `pageGenerators[]` and the lookups and imports in `pageProcessors[]` (each entry's `_exportId` or `_importId`) of `get_resource({ resourceType: "flows", _id })`. In a flow with `routers[]`, the steps sit under `routers[].branches[].pageProcessors[]` instead. A step's response mapping is on its entry there.
- Metadata is read through a connection id -- the export's or import's `_connectionId` -- not through the export or import id.
- With `schema: true`, `adaptorType` is the lowercase name of the family's sub-schema (`http`, `rdbms`, `ftp`, `salesforce`, `netsuitedistributed`, ...), not the document's `adaptorType` value (`HTTPImport`). Leave it out to get the family schema and its `availableSubSchemas`.

## Mapper 2.0 Workflow

### 1. Check the existing resource

```
get_resource({ resourceType: "imports", _id: "<importId>" })    // mappings[] is Mapper 2.0; mapping.fields[] (netsuite_da.mapping on NetSuite) is 1.0
```

Exports and imports have no name filter. Without an id, find the step through its flow, or list and match names yourself:

```
list_resources({ resourceType: "flows", name: "<keyword>" })                    // server-side substring match on the flow name
get_resource({ resourceType: "flows", _id: "<flowId>" })                         // the steps' _exportId / _importId
list_resources({ resourceType: "imports", include: "_id,name,adaptorType" })    // every import, projected -- match the name client-side
```

### 2. Understand the source data shape

No MCP tool invokes an export (see Not Available over MCP). Read the source system's metadata instead -- or, when the step has errors, the real records it failed on:

```
get_resource({ resourceType: "connections", _id: "<sourceConnectionId>", includeMetadata: true })   // the connection plus the app's record types, fields, picklists
list_flow_errors({ _id: "<flowId>", _stepId: "<importId>", limit: 5 })                             // each error's retryDataKey
list_flow_errors({ _id: "<flowId>", _stepId: "<importId>", retryDataKey: "<retryDataKey>" })       // that record (data) as it reached the step
```

`includeMetadata` returns the application's metadata in one block -- there is no per-entity call and no cache refresh. The response is a connection document whose credentials come back masked as `******`: read it, never send it back.

### 3. Understand the target data shape

```
get_resource({ resourceType: "connections", _id: "<targetConnectionId>", includeMetadata: true })
```

### 6. Add lookups for value translation

```
list_resources({ resourceType: "lookup-caches" })                 // the cache a dynamic lookup's _lookupCacheId names
list_lookup_cache_data({ _id: "<cacheId>", keys: ["<key>"] })     // check that a key resolves
```

## Transformation 2.0 Workflow

### 1. Check the existing resource

```
get_resource({ resourceType: "exports", _id: "<exportId>" })    // transform{}
```

Find an export without its id the same way as an import (Mapper 2.0 step 1), with `resourceType: "exports"`.

## Mapper 1.0 Reference (NetSuite and Salesforce)

```
get_resource({ resourceType: "connections", _id: "<connectionId>", includeMetadata: true })
```

Look in the returned `metadata` for the NetSuite record type's field IDs (the exact `searchField` / `resultField` values) and sublists, or the Salesforce object's relationship fields. When what you need is not in that block, see Not Available over MCP.

## Response Mapping Reference (Transformation 1.0)

A response mapping is part of the flow, so changing one replaces the flow:

```
get_resource({ resourceType: "flows", _id: "<flowId>" })
update_resource({ resourceType: "flows", _id: "<flowId>", body: <the complete flow, the step's responseMapping edited> })
```

- PUT replaces the whole flow, every step's `responseMapping` with it: a step sent without one resets to empty `{ fields: [], lists: [] }`. Send every step back as you fetched it.
- Keep `fields` and `lists` bare arrays. The API accepts an object wrapper and erases the step's mappings; the CLI refuses that shape, `update_resource` does not.
- Test runs never execute imports, so an `extract: "id"` from an import's response merges nothing in a test run, though it works on real runs.

## Save the Change

`patch_resource` can't change a mapping: its whitelist allows only `/debugUntil` on imports, `/debugUntil` and `/assistantMetadata` on exports, and no step paths on flows, and it rejects any other path before calling the API. Every mapping, transform, or response-mapping change is a full replace:

```
get_resource({ resourceType: "imports", schema: true, adaptorType: "http" })    // the family's JSON schema, guidance, and write notes
get_resource({ resourceType: "imports", _id: "<importId>" })
update_resource({ resourceType: "imports", _id: "<importId>", body: <the complete import, mappings edited> })
update_resource({ resourceType: "exports", _id: "<exportId>", body: <the complete export, transform edited> })
```

The schema call works the same way for `exports` and `flows`. The imports write note says field mappings go in `mapping`; Mapper 2.0 is the top-level `mappings[]` array and `mapping` is Mapper 1.0 -- keep whichever the import already uses.

- PUT replaces the whole document and erases whatever you leave out -- drop `netsuite_da.mapping.lists` or `_connectionId` and it is gone. Send back everything you fetched, minus the server-managed `_id`, `lastModified`, and `createdAt`. The CLI's `set` does this read-edit-write for you; over MCP it is yours to do.
- `update_resource` dry-runs the document upstream before writing, so a document the API rejects comes back as an error without a write.
- Mappings are not masked, so an import, export, or flow survives the round trip. A connection document masks its credentials as `******` -- never send one back. `update_resource` rejects the mask only on connections and iClients, while the CLI checks every document; if a document you fetched carries `******` anywhere, stop and ask the user rather than sending it.
- `update_resource` doesn't check whether an Integration App owns the document (`_connectorId` set). The CLI refuses that write by default because a raw PUT bypasses the app's connector code -- confirm with the user before replacing one.

## Check the Change

```
test_run({ resourceType: "flows", _id: "<flowId>" })
```

The test run executes the flow inline against its saved configuration -- save first -- and returns a `runId`, `metadata` (the stage names each step produced), and the test `flowJob` and `childJobs` with their record and error counts. It stays out of `list_flow_runs` and never executes the flow's imports, but it still calls the connected systems for the steps it runs: confirm with the user before test-running a flow whose steps write.

No MCP tool reads a test run's per-stage input and output. To see the mapped record itself, the flow has to run for real with execution logging armed -- the import's `apiCall` stage then holds the request it sent (**troubleshooting-flows**, [step 6](../../troubleshooting-flows/references/mcp.md#6-execution-logs)). A real run writes to the destination, so that is the user's call.

## Not Available over MCP

- **Invoking an export** to see the records it returns (Mapper 2.0 step 2). Use the CLI (`celigo exports invoke <exportId>`), REST (`POST /v1/exports/{_id}/invoke`), or the export's preview in the UI.
- **A keyword search across resource types** (step 1) -- filter flows by name, or list imports and exports and match names client-side.
- **Per-entity metadata reads and a metadata cache refresh.** When the `includeMetadata` block lacks a record type's fields, NetSuite sublists, or Salesforce relationships, use the CLI (`celigo metadata fields <connectionId> <entityType> --refresh`) or the UI.
- **Previewing an unsaved mapping** against sample records. The UI's import editor Preview composes the destination request without sending it (REST: `POST /v1/pageProcessors/preview` with `options: { preview: true }` on the target step's `pageProcessorMap` entry; `sendAndPreview` sends it -- a real write). The CLI has no command for it either. Over MCP, save the change and test-run the flow.
- **A test run's per-stage results** -- the CLI's `celigo flows test-run-step-results` reads them.

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
