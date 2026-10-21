# Paginating a Builder API

Cursor pagination returns a large lookup result one page per call instead of draining the whole source. It's off until you turn it on, and only builder-mode APIs have it. Field rules are under `pagination` in [base.yml](schemas/base.yml).

## What it pages

- The first lookup (export step) in `builder.routers` is the volume driver: each call returns one source page of that export.
- That export must page on its own: an HTTP export with `http.paging` (such as `method: "page"`), or a Salesforce or NetSuite export with paging. Otherwise turning pagination on fails with 422 `api_pagination_source_not_paged` (an HTTP lookup without paging: "The lookup must have paging configured."), `api_pagination_adapter_not_supported` (any other adaptor) or `api_pagination_no_volume_driver` (no lookup).
- The success response needs a body. A `204` returns nothing, so the cursor is lost with it.
- Script-mode APIs never paginate: a create or update drops `pagination`, and patching `pagination.enabled` answers 422 `api_pagination_builder_only`.

## Turning it on and off

- `celigo apis set <id> pagination.enabled=true` (a PATCH of `/pagination/enabled`). A full update that omits `pagination` keeps the stored value; send `"pagination": {"enabled": null}` to clear it.
- Turn pagination off before you remove paging from the volume-driver export. If the export loses its paging while pagination is on, the export save still succeeds, but every call then fails with 400 `api_pagination_source_not_paged` and every save of the API is refused with the same code as a 422.
- Test runs never paginate: their success response carries no `pagination` object, and a `Celigo-Next-Cursor` header in `mockRequest.headers` isn't checked.

## What callers do

- A paged response keeps its own keys at the root and gains `"pagination": {"has_more": true, "next_cursor": "..."}`. The last page has `"has_more": false` and no `next_cursor`.
- For the next page, the caller resends the identical request -- same method, path, query string and body -- with the cursor in the `Celigo-Next-Cursor` header. A `next_cursor` in the body is ordinary payload (it returns the first page again), and a changed path, query or body fails with 400 `cursor_filter_mismatch`.
- Other cursor faults answer 400: `invalid_cursor_format`, `cursor_signature_invalid`, `cursor_version_unsupported`, `cursor_api_mismatch`, and `cursor_not_supported_for_api` when pagination is off. An expired cursor answers 410 `cursor_expired`.
- Saving the volume-driver export, even unchanged, ends every walk in progress: the next call with an old cursor returns 200 with an empty last page, `{"pagination": {"has_more": false}}`. Restart from the first page. Saving the API itself leaves cursors valid.
- A response hook that turns the body into something other than an object fails the call with 422 `api_pagination_response_not_object`.
