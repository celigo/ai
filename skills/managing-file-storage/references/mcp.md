# Managing File Storage with the Celigo MCP Tools

The tool calls for each step of How to Manage Stored Files, for agents connected to the Celigo Platform MCP server. Step numbers match [SKILL.md](../SKILL.md). The server covers browsing, upload, rename, move, content replace, download, delete, and restore. It has no tool for copy, merge, purge, the quota, Storage Query, or the file server -- see Not Available over MCP.

## Ids

- Every item `list_storage_items` returns carries its `_id`. There is no get-by-id: read one item by listing its folder or searching its name.
- `delete_resource` takes `resourceType: "storage-items"`.
- Elsewhere, a storage id appears as an MCP server's `resources[]._fileId` and a file-server partner account's `_homeFolderId`.

## How Writes Work

`upsert_storage_item` picks the operation from the fields you send:

- **No `_id` -- create.** A folder is `type: "folder"` plus `name`. A file is `name` plus `content` (UTF-8 text) or `contentBase64` (binary), inline up to 4 MB by default; the server moves the bytes to storage for you.
- **With `_id` -- update.** `name` and `description` rename and describe, `_parentId` moves (`null` is the account root), and `content` or `contentBase64` replaces the file's bytes. Fields combine in one call; the rename and move run before the content replace, and a failure part-way names what was already applied.
- **Larger files -- `presignedUpload`.** The tool returns presigned S3 URLs, and your client sends the bytes from disk itself, with any `requiredHeaders` the tool returns. For a multipart upload, keep each part's ETag, post the ordered completion to `completeUrl`, and ask for more part URLs with `stage: "continue"`. The URLs are temporary credentials: use them at once, and never print, log, or store them.

A new or replaced file comes back `status: "pending"`. A `description` sent with a new upload isn't saved -- the result carries a `_warning` -- so set it in a second call once the file is active.

## 1. Find the item and its id

```
list_storage_items({})                                    // the account root: integration system folders and root items
list_storage_items({ _parentId: "<folderId>" })           // one folder's children, plus the breadcrumb to it
list_storage_items({ search: "<name words>" })            // names with any of the words, account-wide; each hit carries location
list_storage_items({ _parentId: "<folderId>", type: "file", mimeType: "text/csv", sort_by: "lastModified", sort_order: "desc", limit: 100 })
```

Page with `nextCursor`, passed back as `cursor`; the filters travel inside it. There is no exact-name, integration, or prefix filter: list the folder and match client-side. An integration's folder is the root item whose `_integrationId` matches. When Celigo Storage isn't available on the account or environment, the tool answers an empty list with a `_warning` rather than an error -- that's not an empty folder.

## 2. Check the quota before a large upload

Not available over MCP -- see below.

## 3. Upload a file or create a folder

```
upsert_storage_item({ type: "folder", name: "inbound", _parentId: "<folderId>" })
upsert_storage_item({ name: "orders.csv", content: "id,qty\n1,3\n", mimeType: "text/csv", _parentId: "<folderId>" })
upsert_storage_item({ name: "invoice.pdf", contentBase64: "<base64>", mimeType: "application/pdf", _parentId: "<folderId>" })
upsert_storage_item({ name: "export.zip", _parentId: "<folderId>", presignedUpload: { operation: "create", stage: "start", uploadType: "single", size: <bytes> } })
list_storage_items({ _parentId: "<folderId>" })           // until the file's status is active
```

Prefer `content` for text formats; base64 costs about a third more. A name already taken in the folder is refused -- to update that file, send its `_id` with the new content (step 5). Abandon a pending multipart upload of a new file with `cancel_storage_upload({ _id: "<pendingFileId>" })`.

## 4. Organize: rename, move, copy, merge

```
upsert_storage_item({ _id: "<id>", name: "<new name>" })               // rename; add description to describe
upsert_storage_item({ _id: "<id>", _parentId: "<folderId>" })          // move; _parentId: null for the account root
```

One item per call -- no bulk move. A rename sent with a move happens first, in the current folder, so it can resolve a name collision at the destination. Copy and merge are not available over MCP.

## 5. Replace a file's content (keep every reference)

```
get_storage_file_download_url({ _id: "<fileId>" })                     // keep the old bytes first, if anyone may need them
upsert_storage_item({ _id: "<fileId>", content: "<the new text>" })    // or contentBase64; mimeType optional
upsert_storage_item({ _id: "<fileId>", presignedUpload: { operation: "replace", stage: "start", uploadType: "single", size: <bytes> } })
```

Never call `cancel_storage_upload` on a replace -- it's only for abandoning a new file's multipart upload. If a replace's transfer fails, the file keeps its previous content but can stay `pending` until the abandoned upload URL expires.

## 6. Download a file or a whole folder

```
get_storage_file_download_url({ _id: "<fileId>" })    // { downloadUrl, expiresIn }
```

Fetch the bytes with a plain GET on `downloadUrl`, with no authorization header -- the content never passes through the tool. Anyone holding the URL can read the file until it expires, so hand it over or use it promptly. Files only; a folder zip is not available over MCP.

## 7. Delete, restore, purge

Before deleting, look for references: MCP servers' `resources[]._fileId` (`list_mcp_servers({ _id })`), and the exports and imports on Celigo APIs connections (`list_connections`, `list_exports`, `list_imports`, matching `_connectionId`). File-server home folders can't be read over MCP.

```
delete_resource({ resourceType: "storage-items", _id: "<id>" })     // to the recycle bin for 30 days
list_storage_items({ deleted: true })                                // the storage recycle bin, newest deletion first, with deletedAt and deletedBy
restore_storage_item({ _id: "<id>" })                                // back to its folder, with its _id
```

- **`delete_resource` returns empty `warnings` for storage items.** The dependency check it runs isn't served for storage, so an empty map proves nothing -- look for references first, as above.
- **A restore whose name was taken stays refused.** `restore_storage_item` can't send a new name, so a 409 `STORAGE_ITEM_ALREADY_EXISTS` stands until the live item that took the name is renamed (`upsert_storage_item({ _id, name })`); then restore. Restoring under a new name is the CLI's `recycle-bin restore --file`.
- **No purge.** Deleted items keep counting toward the quota until they expire after 30 days, or until the user purges them in the UI or with the CLI.
- Only directly deleted items are listed and restorable; a folder's restore brings back its contents asynchronously, so a listing taken straight after may be incomplete.

## 8. Use stored files in a flow

Build the steps with `upsert_export` and `upsert_import` (file mode, `http.type: "file"`) on a Celigo APIs connection created with `upsert_connection` and its `accessScope`; see **configuring-exports**, **configuring-imports**, and **configuring-connections**. No tool reads a connection's stored scope back -- the connection document never carries it.

## 9. Query a file with SQL

Not available over MCP -- see below.

## 10. Give a trading partner SFTP access

Not available over MCP -- see below.

## Not Available over MCP

- **Copy and merge** -- the CLI (`celigo storage copy`, `celigo storage merge`), the UI, or the REST API (`POST /v1/storage/items/{_id}/copy`, `POST /v1/storage/items/{_id}/merge`).
- **Purge** -- the CLI's `celigo recycle-bin purge`, or the UI.
- **Restoring under a new name** -- the CLI's `celigo recycle-bin restore <id> --file`, or rename the item that took the name and restore with `restore_storage_item`.
- **The quota** (`GET /v1/storage/usage`, `/v1/storage/usage/environments`) -- the CLI's `celigo platform get`, or the UI's subscription page.
- **Bulk move, exact-name and integration filters, and file metadata by id** -- one `upsert_storage_item` per item, and client-side matching on listings; or the CLI.
- **Folder download as a zip** -- the CLI's `celigo storage download --folder`, or the UI.
- **Storage Query** -- the CLI or the REST API ([storage-query.md](storage-query.md)).
- **The file server and partner accounts** -- the CLI or the REST API, with a full-access token ([file-server.md](file-server.md)).
- **A connection's stored `accessScope`** -- the CLI (`celigo platform get v1/accessScope/connections/<id>`) or the UI.

If a tool misbehaves or lacks something you needed, report it with `submit_feedback`.
