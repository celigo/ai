# Configuring Topics with the `celigo` CLI

The commands for each step of How to Build an Event Stream, then for Messages and Positions, Diagnosing a Listener That Never Runs, and Delete, Restore, and Copies. Step numbers and headings match [SKILL.md](../SKILL.md). Before the first write of a session (create, update, set, register, publish, purge, delete), confirm which account the CLI targets -- see getting-started, "Which account the CLI targets".

## How `set` and `update` Write

- `celigo topics set <id> name=... description=...` sends one JSON Patch: `name` and `description` are the only patchable fields.
- `celigo topics set <id> retentionMs=...` (or `externalId=...`) does the GET, edits the field, and PUTs the complete topic back, so the other fields survive.
- `celigo topics update <id> < topic.json` PUTs exactly what you pipe in: a body without `description`, `externalId`, or `retentionMs` clears the first two and resets retention to 7 days. GET the topic first.

## 1. Plan publishers and listeners

```bash
celigo --jq '[.[] | {type, topics}]' subscriptions licenses    # topics.enabled, topicsAllowed, retentionCeilingDays
celigo topics list                                             # how many the account already holds
```

## 2. Check for an existing topic

```bash
celigo topics list                                  # id, name, retentionMs, externalId, lastModified
celigo topics list --external-id <key> [<key> ...]  # exact match; several values match any
celigo topics list --integration <integrationId>    # the topics registered on one integration
celigo topics get <topicId>
celigo topics dependencies <topicId>                # what publishes to and listens on it, and where it is registered
```

`topics list` sorts by name (`--sort-by lastModified` for newest first) and leaves out topics in the recycle bin. `dependencies` (alias `used-by`) answers `{}` for a topic nothing references -- and for an id that doesn't exist, so check the id.

## 3. Create the topic and register it

```bash
echo '{"name":"orders.created","description":"One message per order placed","retentionMs":604800000,"externalId":"orders-created","__integrationIds":["<integrationId>"]}' | celigo topics create
celigo integrations register-topics <integrationId> <topicId> [<topicId> ...]    # register an existing topic
celigo topics list --integration <integrationId>                                   # confirm the registration
```

The create reply doesn't echo `__integrationIds`; confirm with the list. A failed registration comes back in `__failedIntegrationRegistrations`, and the topic exists anyway. Saving a flow of the integration with a step bound to the topic also registers it.

## 4. Build the publisher

```bash
echo '{"name":"Publish order events","adaptorType":"TopicImport","topic":{"_topicId":"<topicId>"}}' | celigo imports create
echo '[{"orderId":"SO-1001","total":42.5}]' | celigo imports invoke <importId>    # publishes for real, to every subscribed flow
```

For one message per array element, add `"oneToMany": true, "pathToMany": "<arrayField>"` to the import. `imports invoke` reports one result per record; a test run (`celigo flows test-run`) publishes nothing.

## 5. Build the listener and its flow

```bash
echo '{"name":"Order events listener","adaptorType":"TopicExport","type":"stream","topic":{"_topicId":"<topicId>","startPosition":"latest","maxWaitTimeMs":30000}}' | celigo exports create
echo '{"name":"Fulfil orders","_integrationId":"<integrationId>","disabled":true,"pageGenerators":[{"_exportId":"<exportId>"}],"pageProcessors":[{"type":"import","_importId":"<importId>"}]}' | celigo flows create
```

## 6. Enable the flow to subscribe

```bash
celigo flows set <flowId> disabled=false                      # the transition subscribes the listener
celigo topics offsets <topicId> <exportId>                    # hasCursor turns true within about half a minute
echo '{"messages":[{"orderId":"test-order"}]}' | celigo topics publish <topicId>
celigo jobs list --type flow --flow <flowId>                  # the run follows about maxWaitTimeMs later
celigo jobs get <jobId>                                       # per-step counts: the export's numSuccess is the messages delivered
```

A flow created enabled, or a listener just repaired: `celigo flows set <flowId> disabled=true`, then `disabled=false`.

## Messages and Positions

```bash
echo '{"messages":[{"orderId":"SO-1001"},{"orderId":"SO-1002"}]}' | celigo topics publish <topicId>
celigo topics publish <topicId> --file messages.json
celigo topics messages <topicId> [--limit <n>] [--time-gt <epochMs>] [--time-lte <epochMs>]
celigo topics messages <topicId> --after-offset <cursor>    # the afterOffset value of the previous page's nextPageURL
celigo topics purge-messages <topicId> [-y]                 # irreversible
celigo topics offsets <topicId> <exportId>                  # {hasCursor, offset}
celigo topics audit <topicId>                               # change history, purges included
```

`topics publish` prints the per-message `responses[]` and exits 1, naming how many messages were rejected, when any message failed -- the others were published. `topics messages` returns `{messages: [{timestamp, payload}], nextPageURL}`, oldest first; take the next page's cursor from `nextPageURL` rather than computing it. `purge-messages` answers `{"deleted": true}` and asks for confirmation unless you pass `-y`.

## Diagnosing a Listener That Never Runs

```bash
celigo exports get <exportId>                          # adaptorType TopicExport, type stream, topic._topicId
celigo flows get <flowId>                              # disabled: false
celigo topics offsets <topicId> <exportId>             # hasCursor false: never subscribed
celigo topics messages <topicId> --limit 100           # what was published, with timestamps
celigo topics dependencies <topicId>                   # which imports publish to it
celigo jobs list --type flow --flow <flowId>
```

To repair a listener saved without `type: "stream"`: `celigo exports get <exportId> > listener.json`, add `"type": "stream"`, `celigo exports update <exportId> < listener.json`, then toggle the flow.

## Delete, Restore, and Copies

```bash
celigo topics dependencies <topicId>                                 # every export, import, and flow that blocks the delete
celigo integrations deregister-topics <integrationId> <topicId> [-y]
celigo topics delete <topicId> [-y]                                  # to the recycle bin; drops every registration
celigo recycle-bin list --type topics
celigo recycle-bin restore <topicId>                                 # then register-topics again
celigo recycle-bin purge <topicId> [-y]                              # for good, messages included -- purge its old steps first
```

A copy within the environment keeps the topic -- `celigo exports clone <exportId>`, `celigo imports clone <importId>`, `celigo flows clone <flowId> <integrationId> <environmentId>`. After a copy into another environment, read each topic step there (`celigo exports get`, `celigo imports get`) and set `topic._topicId` to a topic of that environment.
