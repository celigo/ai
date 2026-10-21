# Reading and Writing a Cache from Flow Steps

A flow reads and writes a lookup cache with ordinary HTTP steps on a connection to Celigo's own API -- no script and no special step type. [configuring-connections > Minimum Required Fields](../../configuring-connections/SKILL.md#minimum-required-fields) says how to build that connection. The steps call the cache's data routes, so the bodies and replies are the API's own ([SKILL.md > Data Operations](../SKILL.md#data-operations)).

| Step | Request | Reply |
|---|---|---|
| Lookup step: one record's entry | `POST /v1/lookupcaches/<cacheId>/getData`, body `{"keys": ["{{record.<keyField>}}"]}` | `{"success": true, "data": [{"key": ..., "value": ...}]}`; a key that isn't there comes back as `{"key": ..., "error": {"message": ...}}` |
| Export: the cache as the flow's source | `POST /v1/lookupcaches/<cacheId>/getData`, body `{}`, `http.response.resourcePath: "data"` | One record per entry (`key`, `value`): up to about 1000, in no particular order |
| Import: write entries | `POST /v1/lookupcaches/<cacheId>/data`, body `{"data": [{"key": "{{record.<keyField>}}", "value": {...}}]}` | `{"success": true, "data": [{"key": ..., "success": true}]}` |

- **Read the value, not the entry.** A keyed read answers a miss with an entry too, carrying `error` instead of `value`, so response-map `data[0].value` (or a field inside it). `data[0]` and `data` are never empty.
- **One bad entry fails the whole write.** A top-level array value, an object with its own `key` property, or an empty, missing or over-255-character key refuses the batch with 400, and nothing in it is written ([SKILL.md > Gotchas](../SKILL.md#gotchas)).
- **A write is an upsert.** To claim a key once, as a deduplication ledger does, make the write one import step with `ignoreExisting`, a `getData` lookup and `idLockTemplate` ([SKILL.md > Deduplication Ledger](../SKILL.md#deduplication-ledger)).
- **State tracking needs no hook.** A lookup step on `getData`, a router on the looked-up value, and a write import cover most of it.
- **Removing keys** is `DELETE /v1/lookupcaches/<cacheId>/data` with `{"keys": [...]}`. It reports `success: true` for every key sent, including keys that weren't there.

Write the JSON bodies with double braces: in a JSON body they're JSON-escaped, so a value holding a quote keeps the body valid ([configuring-imports > Gotchas](../../configuring-imports/SKILL.md#gotchas)). An import's `http.body` renders against the mapped record, so name the mapped fields there ([writing-handlebars > Import bubble](../../writing-handlebars/SKILL.md#import-bubble-httpimport-netsuitedistributedimport-etc)).
