# Managing File Storage with the `celigo` CLI

The commands for each step of How to Manage Stored Files. Step numbers match [SKILL.md](../SKILL.md). Before the first write of a session (upload, replace, create-folder, set, move, copy, merge, delete, restore, purge), confirm which account the CLI targets -- see getting-started, "Which account the CLI targets".

## Modes

The profile's mode gates storage writes:

- **Any mode** -- the reads: `storage list|search|get|download|query|query-status|query-results`, `recycle-bin list|get`, `file-server get`, `file-server accounts list|get`, and `platform get`.
- **Operate or full** -- `storage upload`, `storage replace`, and `storage cancel-upload`, which change a file's bytes.
- **Full** -- what changes the tree or removes something: `storage create-folder|move|copy|merge|delete`, a rename with `storage set`, `recycle-bin restore|purge`, and every `file-server` write.

A command the mode refuses names the mode it needs. Tell the user what was blocked; never change the mode to get past it ([getting-started > Working on a Live Account](../../getting-started/SKILL.md#working-on-a-live-account)).

The CLI prints the API's message without its error code: `(403): Forbidden: System items cannot be modified or deleted` is `STORAGE_SYSTEM_ITEM_PROTECTED`, `(409): An item named "..." already exists in this folder` is `STORAGE_ITEM_ALREADY_EXISTS`, and `(404): Not found: Parent folder not found` is `STORAGE_PARENT_NOT_FOUND`. An upload's per-file refusal prints the code.

## 1. Find the item and its id

```bash
celigo storage list                                  # the account root: integration system folders and root items
celigo storage list --parent <folderId>              # one folder's direct children
celigo storage search "<name words>"                 # names with any of the words, account-wide, each with its location
celigo storage get <fileId> [<fileId> ...]           # metadata and path of up to 100 files
celigo storage list --jq '[.[] | select(._integrationId == "<integrationId>")]'   # an integration's system folder
```

`list` and `search` fetch every page and take `--mime <types...>`, `--sort name|lastModified`, `--order asc|desc`, `--modified-gte <iso>`, and `--modified-lte <iso>`; `--parent root` is the same as leaving it out. `get` answers for files only: a folder id fails the whole request with `(422): Validation error: File not found` (`--no-fail-fast` reports it inline as `notFound` instead), so read a folder's metadata from its parent's listing. `--fields` narrows `get` to some of `name`, `description`, `size`, `mimeType`, `type`, `status`, `_parentId`, `__ancestorIds`, and `path`.

For an exact, case-sensitive name match inside one folder, use the API's `name` filter:

```bash
celigo platform get "v1/storage/items?_parentId=<folderId>&name=<exact name>"
```

## 2. Check the quota before a large upload

```bash
celigo platform get v1/storage/usage                  # account-wide: activeUsage, recycleBinUsage, totalUsage, maxAllowedUsage, hardLimit, isOverage, overage
celigo platform get v1/storage/usage/environments     # the active and recycle-bin split per environment
celigo subscriptions licenses --jq '.[] | {storage, filesql, fileserver}'   # the allowance (in GB) and the Storage Query and file-server entitlements
```

`celigo subscriptions usage` also carries the per-environment figures, under `storage`.

## 3. Upload a file or create a folder

```bash
celigo storage create-folder "<name>" --parent <folderId>
celigo storage upload ./orders.csv --parent <folderId> [--name "<stored name>"]
celigo storage get <fileId> --fields name,status,size     # until status is active
```

Leave out `--parent` (or pass `root`) for the account root. `upload` chooses a single PUT or a multipart upload by size, guesses the media type from the extension, and prints the new id. A name taken in the folder fails before any bytes move: `Could not initiate upload of <name>: STORAGE_ITEM_ALREADY_EXISTS`. An empty local file is refused -- storage holds no 0-byte files. When a multipart upload starts, the CLI prints the pending item's id; Ctrl-C cancels it, and an upload interrupted any other way is discarded with `celigo storage cancel-upload <fileId>`.

## 4. Organize: rename, move, copy, merge

```bash
celigo storage set <id> name="<new name>" [description="<note>"]
celigo storage move <id> --to <folderId|root> [--name "<new name>"]
celigo storage move <id1> <id2> <id3> --to <folderId>      # up to 100 at once
celigo storage copy <fileId> --to <folderId|root> [--name "<name>"]
celigo storage merge <sourceFolderId> --to <destinationFolderId>
```

- `set` sends only `name` and `description` (`description=""` clears it); any other field is refused.
- `move` with several ids, or with `--name`, uses the bulk route: the destination is checked once, then each item moves or fails on its own. The command prints a result per id and exits 1 if any item failed.
- `copy` needs `--to`, even to copy within the same folder. Without `--name` the copy is called `Clone - <name>`.
- `merge` prints a `folderMerge` job receipt and returns at once; list the destination to see the contents arrive and the source folder disappear.

## 5. Replace a file's content (keep every reference)

```bash
celigo storage download <fileId> ./before/       # keep the old bytes first, if anyone may need them
celigo storage replace <fileId> ./orders-v2.csv
celigo storage get <fileId> --fields status,size
```

The stored name and folder stay whatever the local file is called. The media type changes when the local file's extension maps to a known one, so replace a `.csv` with a `.csv`. An interrupted multipart replace leaves nothing to cancel: the file keeps its previous content, so run the replace again.

## 6. Download a file or a whole folder

```bash
celigo storage download <fileId>                       # to the stored file name in the current directory
celigo storage download <fileId> ./downloads/          # into a directory; '-' writes to stdout
celigo storage download <folderId> --folder            # the folder and everything beneath it as <folder name>.zip
```

An existing local file is never overwritten without `--force`.

## 7. Delete, restore, purge

Before deleting, look for references:

```bash
celigo mcp-servers list --fields all --jq '[.[] | {_id, name, files: [.resources[]?._fileId]}]'
celigo file-server accounts list --jq '[.[] | {login, _homeFolderId, homeFolderPath}]'
celigo connections list --jq '[.[] | select(.assistant == "integratorceligoapi") | {_id, name}]'   # then the exports and imports on those connections
```

Then:

```bash
celigo storage delete <id>                       # to the recycle bin; asks first (-y skips)
celigo recycle-bin list --type storage           # directly deleted storage items, with deletedAt and deletedBy
celigo recycle-bin get <id>
celigo recycle-bin restore <id>
celigo recycle-bin restore <id> --file restore.json     # restore.json: {"name": "<new name>"} -- when the old name is taken
celigo recycle-bin purge <id>                    # irreversible; asks first (-y skips)
```

`recycle-bin restore` and `purge` look the id up in the bin, see the `StorageItem` model, and call the storage restore and purge for you. `--cascade` is for other resource types: a storage folder brings back its contents without it. A file removed by its folder's delete isn't in the bin listing, so `restore` answers `No recycle-bin entry found` -- restore the folder.

## 8. Use stored files in a flow

```bash
celigo platform get v1/accessScope/connections/<connectionId>    # a Celigo APIs connection's stored scope: scope, fileStoragePaths
celigo exports set <exportId> file.skipDelete=true               # keep the source files after the export reads them
```

The step shapes, and how to create the connection, are in **configuring-exports**, **configuring-imports**, and **configuring-connections**.

## 9. Query a file with SQL

See [storage-query.md](storage-query.md).

## 10. Give a trading partner SFTP access

See [file-server.md](file-server.md).
