# Configuring Topics with the Celigo MCP Tools

The tool calls for each step of How to Build an Event Stream, then for Messages and Positions, Diagnosing a Listener That Never Runs, and Delete, Restore, and Copies, for agents connected to the Celigo Platform MCP server. Step numbers and headings match [SKILL.md](../SKILL.md).

**The deployed server has no topic tools.** It writes and reads the listener and publisher steps and their flows, but it can't create, read, update, register, publish to, read the messages of, purge, or delete a topic, or read a listener's position. For those, use the CLI ([cli.md](cli.md)), the Celigo UI, or the REST API (`/v1/topics`, `/v1/integrations/{_id}/topics`) -- see Not Available over MCP.

## Ids

- No tool lists topics or reads one. A topic's `_id` reaches you three ways: the user gives it, an integration lists its registered topics in `_registeredTopicIds` (`list_integrations({ _id: "<integrationId>" })`), or an existing step carries it in `topic._topicId` (`list_exports({ _id })`, `list_imports({ _id })`). None of these gives the topic's name or retention.
- `topic._topicId` is always the topic's `_id`, never its name.
- `delete_resource` takes `"exports"`, `"imports"`, and `"flows"`; topics aren't among its resource types.

## How Writes Work

- `upsert_export` and `upsert_import` without an `_id` create the step; with an `_id` they replace the whole document -- read it first with `list_exports` / `list_imports` and the `_id`. Exports and imports have no patch tool.
- `patch_flow` changes `/disabled`, which is what subscribes a listener (step 6).
- Read a step's schema first: `get_schema({ target: "resource", name: "export/topic" })` for the listener's `topic` object, `get_schema({ target: "resource", name: "import/topic" })` for the publisher's.

## 1. Plan publishers and listeners

Whether the license includes Event Streams, and the topic quota, aren't readable over MCP -- ask the user, or read the license with the CLI.

## 2. Check for an existing topic

```
list_integrations({ _id: "<integrationId>" })    // _registeredTopicIds: the topics this integration's flows may use
list_exports({ _id: "<exportId>" })               // an existing listener's topic._topicId
```

To see what already listens on or publishes to a topic, list exports and imports and match `topic._topicId` client-side (`adaptorType` `TopicExport` / `TopicImport`).

## 3. Create the topic and register it

Not available over MCP. Have the user create the topic in the Celigo UI or with the CLI, then use its `_id`. Registration on the flow's integration happens on its own when you save the flow with a step bound to the topic (step 5).

## 4. Build the publisher

```
get_schema({ target: "resource", name: "import/topic" })
upsert_import({ body: { name: "Publish order events", adaptorType: "TopicImport", topic: { _topicId: "<topicId>" } } })
```

No `_connectionId`. For one message per array element, add `oneToMany: true` and `pathToMany`. No MCP tool invokes an import, and a flow publishes only on a real run -- `run_flow` on the publishing flow publishes to every subscribed flow, so confirm first.

## 5. Build the listener and its flow

```
get_schema({ target: "resource", name: "export/topic" })
upsert_export({ body: { name: "Order events listener", adaptorType: "TopicExport", type: "stream", topic: { _topicId: "<topicId>", startPosition: "latest" } } })
upsert_flow({ body: { name: "Fulfil orders", _integrationId: "<integrationId>", disabled: true, pageGenerators: [{ _exportId: "<exportId>" }], pageProcessors: [{ type: "import", _importId: "<importId>" }] } })
list_integrations({ _id: "<integrationId>" })    // the topic now appears in _registeredTopicIds
```

## 6. Enable the flow to subscribe

```
patch_flow({ _id: "<flowId>", body: [{ op: "replace", path: "/disabled", value: false }] })
list_flow_runs({ type: "flow", _flowId: "<flowId>", limit: 5 })    // after the next publish, a run about maxWaitTimeMs later
list_flow_runs({ _id: "<jobId>" })                                  // children[]: the export's numSuccess is the messages delivered
```

A flow created enabled, or a listener just repaired: `patch_flow` `/disabled` to `true`, then to `false`. Publishing a test message isn't available over MCP; have the user publish one, or run a publishing flow.

## Messages and Positions

Publishing, reading messages, purging, and reading a listener's position are not available over MCP. A topic's change history, purges included, is in the audit log:

```
list_audit_log_entries({ resourceType: "topic", _resourceId: "<topicId>" })
```

## Diagnosing a Listener That Never Runs

```
list_exports({ _id: "<exportId>" })                                  // adaptorType TopicExport, type stream, topic._topicId
list_flows({ _id: "<flowId>" })                                      // disabled: false
list_flow_runs({ type: "flow", _flowId: "<flowId>", limit: 10 })
list_flow_errors({ _id: "<flowId>" })                                // the flow's open errors, per step
```

To repair a listener saved without `type: "stream"`, read it, then `upsert_export` with its `_id` and the complete document plus `type: "stream"`, and toggle the flow. Whether the listener ever subscribed (its position) and what was published (the topic's messages) need the CLI or the UI.

## Delete, Restore, and Copies

```
delete_resource({ resourceType: "flows", _id: "<flowId>" })
delete_resource({ resourceType: "exports", _id: "<exportId>" })
delete_resource({ resourceType: "imports", _id: "<importId>" })
```

`delete_resource` reports dependents in `warnings` but deletes anyway -- confirm each target with the user. Deleting, deregistering, restoring, or purging the topic itself is not available over MCP. Cloning isn't either; after the user copies a flow into another environment, read each topic step there and set `topic._topicId` to a topic of that environment with `upsert_export` / `upsert_import`.

## Not Available over MCP

- **Creating, reading, updating, or listing topics** -- the CLI's `topics list|get|create|update|set`, the UI, or `GET|POST /v1/topics`, `GET|PUT|PATCH /v1/topics/{_id}`.
- **Registering or deregistering a topic** on an integration -- the CLI's `integrations register-topics` / `deregister-topics`, or `PUT|DELETE /v1/integrations/{_id}/topics/{_topicId}/register`. Saving a flow with a bound step registers the topic.
- **Publishing** -- the CLI's `topics publish` or `imports invoke` on a publisher, or `POST /v1/topics/{_id}/publish`.
- **Reading messages** and **purging them** -- the CLI's `topics messages` / `topics purge-messages`, or `GET|DELETE /v1/topics/{_id}/messages`.
- **A listener's position** -- the CLI's `topics offsets`, or `GET /v1/topics/{_id}/exports/{_exportId}/offsets`.
- **A topic's dependencies** -- the CLI's `topics dependencies`, or match `topic._topicId` across exports and imports.
- **The license's Event Streams entitlement and quota** -- the CLI's `subscriptions licenses`, or `GET /v1/licenses`.
- **Deleting, restoring, or purging a topic** -- the CLI's `topics delete` and `recycle-bin restore|purge`, the UI, or `DELETE /v1/topics/{_id}` and the `/v1/recycleBinTTL/topics/{_id}` routes.
- **Cloning a flow, export, or import** -- the CLI, the UI, or the REST API (`POST /v1/flows/{_id}/clone`).

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
