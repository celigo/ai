# integrator-api Module Reference

What the `integrator-api` calls a hook makes can reach, what they return, and how they fail -- as observed from hooks in real flow runs and through the JavaScript processor ([SKILL.md > 6. Test and iterate](../SKILL.md#6-test-and-iterate)). Calls not listed here (`putData`, `state`, `flows.run` and the rest) aren't covered.

Every call runs for real, test mode included: an `imports.run` sends to the destination and a cache write changes the cache. While iterating, point calls at scratch resources ([SKILL.md > Authoring Against Sample Data](../SKILL.md#authoring-against-sample-data)).

## What a Call Can Reach

A call resolves against the integration the hook is running in (`options._integrationId`), not against the script:

| Target | Reachable when | Otherwise the call throws |
|---|---|---|
| Lookup cache | it's registered to that integration (`celigo integrations register-lookup-caches <integrationId> <cacheId>`) | `lookupcache: <id> doesn't belong to this integration. Check and use the correct lookupcache.` |
| Export (`exports.run`) | one of the integration's flows uses it | `export: <id> doesn't belong to this integration. Check and use the correct export.` |
| Import (`imports.run`) | one of the integration's flows uses it | `import: <id> doesn't belong to this integration. Check and use the correct import.` |

Resource CRUD (`find`, `get`, `create`, `update`, `patch`, `delete`) isn't available from a hook at all -- see [SKILL.md > integrator-api](../SKILL.md#integrator-api).

## What Calls Return

- **`lookupcaches.getData({ _id, keys })`** returns `{ success, data }` with one entry per requested key: a hit is `{ key, value }`, a miss is `{ key, error: { message } }` ("The requested key does not match any entry in the lookup cache. Check the key."). Misses are reported, not dropped, and the order isn't guaranteed: index the entries by `key` and branch on `error`.
- **`exports.run({ _id })`** returns `{ data, dataURIs }`, the export's records in `data`.
- **`imports.run({ _id, data })`** returns an array with one result per record sent, each `{ statusCode, id, _json, _headers }`.

A `getData` followed by a cache write is no lock -- see [SKILL.md gotcha 20](../SKILL.md#gotchas).

## Errors

| Message | Cause | Fix |
|---|---|---|
| `<type>: <id> doesn't belong to this integration` | The cache isn't registered to the running integration, or none of its flows uses the export or import | Register the cache, or call a step this integration's flows use ([What a Call Can Reach](#what-a-call-can-reach)) |
| `ReferenceError: lookupcaches is not defined` | The module object the call uses wasn't imported | Add it to the import: `import { lookupcaches } from 'integrator-api'` |
| `Cannot find module <name>` | The import names a module that doesn't exist (a misspelled `integrator-api`) | Fix the module name; the three built-ins are `integrator-api`, `dayjs` and `sjcl` |
