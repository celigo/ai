# The Celigo-Hosted SFTP File Server

Each environment can run one Celigo-hosted SFTP server for trading partners. Every partner account is rooted in a Celigo Storage folder: what the partner uploads appears in that folder, and what you put in it is what the partner can download. The files are ordinary stored files, which flows, MCP servers, and people reach like any other.

There is no MCP tool for the file server. Use the CLI (`celigo file-server`) or the REST API (`/v1/mft/fileserver`, `/v1/mft/fileserver/accounts`).

## Before You Start

- **The license needs the file server add-on** (`fileserver.enabled`, read with `celigo subscriptions licenses --jq '.[] | .fileserver'`). Without it, reading the server returns a reduced object with `entitled: false`, and every write answers 403 `FILESERVER_NOT_ENTITLED`.
- **A sandbox can't run a server** (403 `FILESERVER_NOT_ENTITLED`).
- **Every route needs a full-access API token.** A token scoped to resources or storage folder paths gets 403 `FILESERVER_FULL_ACCESS_TOKEN_REQUIRED` -- the one place least privilege doesn't apply ([managing-api-tokens](../../managing-api-tokens/SKILL.md)).
- **Passwords never go through chat.** A partner's password is a credential: don't ask for one, accept one, or put one in a command line. The CLI reads it from a prompt that doesn't echo, or from stdin. If a user pastes one, treat it as compromised and set a new one.

## The Server

Read it first: `enabled`, the permanent `identifier`, the `endpoint` partners connect to (a host shared by the region, port 22), the host-key `hostKeyFingerprints` partners should pin, the `loginFormat` (`<username>@<identifier>`), and the effective `limits` -- `maxAccounts`, `maxConcurrentSessionsPerAccount`, and `maxFileSizeBytes`. An entitled environment whose server was never enabled answers 404 `FILESERVER_NOT_FOUND`.

- **The first enable claims the identifier, for good.** 3 to 30 lowercase letters, digits, or hyphens (no leading or trailing hyphen), unique in the region (409 `FILESERVER_IDENTIFIER_TAKEN`), and never changeable afterwards (422 `FILESERVER_IDENTIFIER_IMMUTABLE`). It's part of every partner's login, so choose a long-lived company handle -- and confirm it with the user. Later enables omit it. Every enable checks the account's Celigo Storage entitlement and returns the storage usage with the server.
- **Disabling** keeps the identifier, every account, and every password, refuses new logins, and ends every open partner session. Repeating it changes nothing.

## Partner Accounts

| Field | Meaning |
|---|---|
| `username` | 3 to 32 lowercase letters, digits, or hyphens; unique in the environment, disabled accounts included (409 `FILESERVER_USERNAME_TAKEN`) |
| `login` | What the partner types: `<username>@<identifier>` |
| `_homeFolderId` | The storage folder that is the root of every session -- an active folder in the same environment. The partner reaches nothing outside it |
| `homeFolderPath` | That folder's current path, for display; it follows renames and moves |
| `enabled` | New accounts start enabled. Re-enabling counts against `maxAccounts` and needs a password set |
| `passwordSet` | Whether a password exists -- the password itself is never returned |
| `overCap` | `true` when the cap was lowered below the enabled accounts and this one's logins are refused |
| `lastConnectedAt` | The partner's most recent successful login, `null` until the first |

- **The password policy**: at least 12 characters (at most 256) with an upper- and a lower-case letter, a digit, and a symbol. A weaker one fails with 422 `FILESERVER_WEAK_PASSWORD`, which lists every rule broken. An enabled account always keeps a password: clearing one is allowed only while the account is disabled.
- **The home folder is protected while the account exists.** The folder and every folder above it refuse deletion with 403 `STORAGE_SFTP_HOME_FOLDER_PROTECTED` -- disabled accounts count too -- but can still be renamed or moved, and the account follows by id. Delete the account, or point it at another folder, before deleting the folder.
- **Changes end the account's open sessions**: disabling it, setting or clearing its password, or moving it to another home folder. A rename keeps its `_id` and changes its login, so tell the partner.
- **Deleting an account is permanent** -- no recycle bin. Its home folder and files stay, and the folder becomes deletable again. To restore access, create the account again.
- **A malformed `_homeFolderId`** (not a 24-character id) answers 503 `FILESERVER_STORAGE_UNAVAILABLE`, as if storage were down; the CLI refuses it first.

## Getting Partner Files into Flows

A partner's uploads are stored files in the home folder. A flow reads them through a Celigo APIs connection with a file-mode export on that folder -- with the EDI profile on the export for EDI ([building-b2b](../../building-b2b/SKILL.md)) -- and writes files for the partner to download through a file-mode import into it. A Celigo APIs connection with a `custom` scope needs the folder's path in its `_fileStoragePaths`. Leave the export's `file.skipDelete` off only if the flow should consume the partner's uploads (see [SKILL.md](../SKILL.md), step 8).

## With the CLI

Every write below needs full mode ([cli.md](cli.md), Modes).

```bash
celigo file-server get                                       # state, identifier, endpoint, fingerprints, login format, limits
celigo file-server enable --identifier <identifier>          # the first enable; asks to confirm the permanent identifier
celigo file-server enable                                    # a later enable
celigo file-server disable                                   # asks first (-y skips)

celigo file-server accounts list                             # every account, oldest first, with overCap
celigo file-server accounts get <accountId>
celigo file-server accounts create --username <username> --home-folder <folderId>          # prompts twice for the password, without echo
printf '%s' "$PARTNER_PASSWORD" | celigo file-server accounts create --username <username> --home-folder <folderId> --password-stdin
celigo file-server accounts set <accountId> enabled=false    # also username=..., _homeFolderId=...
celigo file-server accounts set-password <accountId>         # prompts; --password-stdin reads stdin; --clear removes it (disabled accounts only)
celigo file-server accounts delete <accountId>               # permanent; asks first (-y skips)
```

`accounts set` sends only the fields you assign; the password is never a field there. A password comes from the prompt or stdin only -- never a flag value. Find a home folder's id with `celigo storage list` ([cli.md](cli.md), step 1).

## Not Available over MCP

The file server and its partner accounts have no MCP tools. Use the CLI or the REST API with a full-access token, or the UI.
