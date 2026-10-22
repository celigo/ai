# The State Store

The state store keeps small JSON values under named keys between flow runs: a cursor or watermark, a sequence number, a marker one run leaves for the next. The published API prefers a lookup cache for new work; the state store remains supported for the flows and scripts that already use it, and no plan feature gates it, as the license's `lookupCache` flag gates caches.

For a date watermark, check first whether the export can keep it: a delta export's own checkpoint needs no store ([configuring-exports > Delta windows and the checkpoint](../../configuring-exports/SKILL.md#delta-windows-and-the-checkpoint)).

| Need | Use |
|---|---|
| A cursor or marker in new work | A lookup cache entry (this skill) |
| More than 10 values on one resource, or values mappings look up by key | A lookup cache |
| A flow or script that already keeps state | The state store, as it is |
| A cursor on an account whose plan has no lookup caches | The state store |

## Keys and Values

- **Two scopes.** Global keys belong to the account; resource keys belong to one export, import or integration. A resource's keys never appear in the global list, and the same name can exist in both scopes.
- **A value is a non-empty JSON object or array**, read back as written. A bare string, number, boolean or `null` is refused with 400 (a JSON parse error such as `Unexpected token '"', ""x"" is not valid JSON`), and `{}` or `[]` with 422 `missing_request_body` ("Please send state as request body in the PUT request."). An array of primitives (`[1]`) is accepted. Wrap a single value: `{"cursor": "2026-10-22T00:00:00.000Z"}`.
- **A write creates the key or replaces its whole value.** The PUT answers plain text, `Created` (201) or `OK` (200); there's no partial update, so send the full value every time.
- **At most 10 keys per export, import or integration.** An eleventh key is refused with 422 `limit_reached` ("Cannot save state, allowed number of states already reached for export : <id>"); replacing an existing key still works. Global keys stop at 100.
- **Only exports, imports and integrations hold state.** Any other type answers 403 `invalid_ref` ("State not available for the given model."), and an id that doesn't exist answers 404 ("Export not found.").
- **Keys don't expire.** A key stays until it's deleted, or its resource's keys are purged.

## CLI and REST

```bash
celigo state list                                                          # global key names, not values
echo '{"cursor":"2026-10-22T00:00:00.000Z"}' | celigo state set <key>       # create or replace
celigo state get <key>
celigo state delete <key> -y
celigo state list --resource-type exports --resource-id <exportId>         # exports, imports or integrations
echo '{"cursor":"2026-10-22T00:00:00.000Z"}' | celigo state set <key> --resource-type exports --resource-id <exportId>
celigo state purge --resource-type exports --resource-id <exportId> -y     # every key of that resource only
```

**Never run `celigo state purge` without `--resource-type` and `--resource-id`.** Without them it deletes every global key in the account, irreversibly. With both, it clears only that resource's keys; other resources' keys and the global keys stay. The CLI refuses one flag without the other, and refuses any resource type but `exports`, `imports` and `integrations`.

The routes: `/v1/state` (GET lists, DELETE purges) and `/v1/state/{key}` (GET, PUT, DELETE) for global keys; `/v1/{exports|imports|integrations}/{_id}/state` and `.../state/{key}` the same way for one resource. A list with no keys answers 204, which the CLI prints as `{"keys": []}`. No MCP tool reads or writes state.

## From a Script

`state` in `integrator-api` has four calls, all on one resource's keys; none reads or writes global keys.

| Call | Returns | When the key is missing |
|---|---|---|
| `state.getKeysForResource({ resourceType, _id })` | `{ keys: [...] }` | -- |
| `state.getForResource({ resourceType, _id, key })` | the stored object or array | throws `State not found for key.` |
| `state.putForResource({ resourceType, _id, key, value })` | nothing | creates it |
| `state.deleteForResource({ resourceType, _id, key })` | nothing | throws |

```javascript
import { state } from 'integrator-api'

export function preSavePage (options) {
  const ref = { resourceType: 'exports', _id: options._exportId, key: 'watermark' }
  let saved = null
  try {
    saved = state.getForResource(ref)                       // { lastSeen } from an earlier run
  } catch (e) {
    if (e.message !== 'State not found for key.') throw e   // the first run has no key yet
  }
  // ... use saved, then store this run's position
  state.putForResource(Object.assign({ value: { lastSeen: options.job.startedAt } }, ref))
  return { data: options.data, errors: options.errors, abort: false }
}
```

- **The resource must belong to the hook's integration:** its own export or import, another one the integration's flows use, or the integration itself (`resourceType: 'integrations'`, `_id: options._integrationId`). Anything else throws `export: <id> doesn't belong to this integration. Check and use the correct export.` (code `permission_denied`).
- **The keys are the ones the CLI and the REST routes read and write**, so a key set by hand is what the next run reads.
- **A write lands at once**, before the page reaches the flow's later steps, and nothing rolls it back when they fail. If a later step fails after the watermark moved, retry that step's errors: a fresh run would start past those records.
- **A hook runs once per page**, so in a run of several pages each page reads what the page before it wrote. A hook that filters records by the watermark and moves it on every page drops a later page's older records, unless the source returns records oldest first.
- **Bad values throw:** a primitive throws the 400 parse error, and an empty object or array a bare `Error response from API.`
