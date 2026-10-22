# The CLI Tree Workflow

`celigo pull` writes an account -- or one integration and everything it references -- to disk as a folder of per-resource JSON files. You edit the files, review them in Git, compare them with the live account, and `celigo push` them back, or `celigo promote` them into another account or environment. It's the file-based alternative to the lifecycle tools (snapshots, and pulls and reverts in the UI) for teams that keep integrations in Git and CI.

It's CLI only: the tree is local files the CLI manages. On the MCP server, change the live documents instead (read, edit, write back) and promote through the UI's clone and pull.

Promoted copies aren't lifecycle-linked to their source -- promote creates and updates plain copies -- so pick one promotion path per integration ([lifecycle-management.md > Environment promotion](lifecycle-management.md#environment-promotion)).

## The Commands

| Command | Touches | What it does |
|---|---|---|
| `celigo pull [--integration <id>] [--dir <path>]` | reads the account, writes files | Downloads the tree. Incremental: unchanged files stay untouched, and a file you edited is never overwritten without `--force` (`pull --force <path>` resets one). `--prune` deletes local files whose resource is gone. |
| `celigo status` | offline | What changed in the tree since the last pull. |
| `celigo diff [refs...]` | reads the account | Compares the files you changed (or the refs you name) with the live account. |
| `celigo lint [refs...]` | offline | Checks the documents against the published API schemas and a set of logic rules: a hook naming a function its script lacks, a script that doesn't parse, a `lookupName` with no lookup, a dangling `nextRouterId`, a Handlebars template that doesn't compile. |
| `celigo push [--dry-run] [refs...]` | writes the account | Updates changed resources, creates new files that have no `_id`, and with `--prune` deletes resources whose files you removed. |
| `celigo promote --to <profile> [--dry-run]` | writes another account or environment | Creates what the target lacks and updates what it holds, with every reference remapped to the target's ids. |
| `celigo resolve <ref>` | offline | Prints the file behind a ref (`type:id`, a bare id, or a link file). |

`status` and `diff` take `--exit-code`, and `lint` takes `--strict`, for CI gates. Refs narrow `diff`, `lint`, `push` and `promote` to the named files or resources.

## The Tree

- **One folder per resource, named after it, with a fixed file name inside:** `integrations/<name>/integration.json`, its flows under `integrations/<name>/flows/<flow>/flow.json`, `exports/<name>/export.json`, `connections/<name>/connection.json`. A script's code is `script.js` beside `script.json`, and an AI agent's prompt is `instructions.md` beside `ai-agent.json`. Two resources with one name get an id suffix (`exports/<name>__<suffix>/`).
- **References are link files:** a flow's folder links to its exports and imports. `--no-symlinks` on the first pull writes `.link.json` pointers instead of symlinks -- use it for a tree in Git, since a symlink doesn't survive every checkout; the style is recorded and sticks.
- **State lives in `.celigo/`:** commit `manifest.json` (the tree's lock tokens and file hashes); `.celigo/local/` is per machine and never committed (pull writes a `.gitignore` for it).
- **The folder name is derived from the resource's `name`.** Renaming the folder doesn't rename the resource -- edit `name` in the file and push.
- **The tree is bound to the account it was pulled from:** `pull`, `diff` and `push` refuse a profile that reaches another account.

## A Change, End to End

```bash
export CELIGO_PROFILE=<profile>                  # one profile for this shell
celigo pull --integration <id> --no-symlinks     # first pull of a Git-tracked tree
git add -A && git commit -m "Pull <integration>"
# ... edit the files ...
celigo status                                    # what you changed (offline)
celigo diff                                      # those files against the live account
celigo lint                                      # schemas and logic rules (offline)
celigo push --dry-run                            # the exact change set; nothing is written
celigo push                                      # writes, then stores the server's copies
```

Push prints its plan before writing, and it refuses, at plan time:

- an update or a `--prune` delete when the server's copy changed since your last pull -- pull again and reconcile (`--force-remote` overwrites);
- a masked `******` value in a document it would create, or in a connection's or iClient's update, and a value that isn't a string in a field the platform encrypts;
- a document the logic lint fails (`--allow-lint-errors` sends it anyway; schema findings never block);
- a new file whose name an untracked resource on the server already has (`--allow-duplicate-names`).

Push needs full mode. An Integration App's documents are pull-only unless you pass `--allow-connector-resources` or `--allow-connector-settings` ([integration-apps.md](integration-apps.md)). After each update push reads the resource once more, to catch another writer overwriting it (`--no-verify` skips that).

## Promoting to Another Environment

`celigo promote --to <profile>` writes the tree into the account or environment that profile reaches -- sandbox to production in one account, or one account to another. The source tree isn't touched.

- **The map is a file.** `.celigo/targets/<name>.json` records which target copy each source resource became; commit it, so the next promote updates those copies instead of creating more.
- **Credentials never travel.** Each connection, iClient, MCP OAuth provider, stack and on-premise agent the promoted documents reference resolves to a pin (`--map connection/<path-or-id>=<targetId>`), the binding an earlier promote recorded, or exactly one resource of the same name and kind in the target. With none, the promote refuses it and everything that depends on it, unless `--create-connections` creates a credential-less shell there whose secrets read `REPLACE-IN-UI` -- the user enters the real ones in the target.
- **A target that already has hand-built copies:** `--adopt-by-name` maps a same-named resource to the source file and updates it, instead of refusing to create a second one beside it. Run a `--dry-run` first and decide per resource.
- **Plan first, like push.** `--dry-run` stops after the plan; a target copy that changed since the last promote is refused (`celigo diff --target <name>` shows how, `--force-remote` overwrites).
- **The target's own rules.** Promote needs full mode on the target profile. Under `profile_pin_policy = strict`, a target that isn't the active profile needs a person at the terminal to type its name -- an agent doesn't switch profiles or change the policy to get past it.
- **What stays behind:** an Integration App's documents (install the app in the target, or change that install from a tree of its own), lookup-cache entries (load them in the target with `celigo lookup-caches put-data`), and Celigo Storage files.
