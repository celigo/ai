# Storage Query

Storage Query runs one read-only SQL `SELECT` over files already in Celigo Storage -- CSV/TSV, JSON, NDJSON/JSONL, and Parquet -- without downloading them or building a flow. Nothing is written to storage. The query runs as a job: submit it, poll its status, then read the rows a page at a time.

There is no MCP tool for it. Use the CLI (`celigo storage query`) or the REST API (`POST /v1/storage/query`, then `GET /v1/storage/query/{_id}/status` and `GET /v1/storage/query/{_id}/results`).

## Before You Query

- **The license must include it.** The `filesql` entitlement (`celigo subscriptions licenses --jq '.[] | .filesql'`); without it every route answers 403 `STORAGE_QUERY_NOT_ENTITLED`.
- **Every submit spends an account-wide rate budget** -- accepted or refused alike, and shared by every caller on the account. Over it, a submit answers 429 `STORAGE_QUERY_SUBMIT_RATE_LIMITED` with a `Retry-After`. Fix a refused statement from its error message once; never retry it in a loop. Status and results reads have their own limit (429 `STORAGE_QUERY_RATE_LIMITED`).
- **The file must be `active`.** A file still uploading is refused at submit ("Upload for ... is not yet complete").
- **A query reads only what the caller can read.** A path outside the caller's reach answers exactly like a missing one: 404 `STORAGE_QUERY_SOURCE_NOT_FOUND`.

## Writing the Statement

- **Files are the tables.** Write the file's path from the storage root where a table name goes, quoted as an identifier: `FROM "Order to cash/inbound/orders.csv"`. Paths are case-sensitive, a leading `/` is optional, and a file inside an integration's system folder starts with that folder's name. The `path` a file's metadata returns is the path to use.
- **A folder ends with `/`.** `FROM "Order to cash/inbound/"` reads the folder's direct child files -- not its subfolders -- as one table; they must share one format. Without the slash the submit fails with 422 `STORAGE_NOT_A_FILE` ("Storage item ... is not a file"); a file path with one fails with `STORAGE_ITEM_NOT_FOLDER`. No wildcards: a `*` or `?` fails with `STORAGE_QUERY_INVALID_SOURCE`.
- **Read options are SQL, not request fields.** Pass the path to a reader function with named, literal options: `read_csv_auto('exports/inventory.csv', header = true, delim = ';')`. The readers are `read_csv`, `read_csv_auto`, `read_json`, `read_json_auto`, `read_ndjson`, `read_ndjson_auto`, and `read_parquet`, each with its own option allowlist; the reader must match the file's format.
- **Exactly one `SELECT`.** `DESCRIBE <query>` and `SUMMARIZE <query>` also work. Anything else -- a write, a second statement, a table function that isn't a reader (`unnest`, `generate_series`, and `range` are allowed), a function off the allowlist -- is refused at submit with no job created. A statement with no file is accepted only as a constant expression, such as `SELECT 1 AS one`.
- **Not queryable**: XLSX, XML, EDI, and plain text, and compressed files -- a `.csv.gz` is refused as an unsupported format even through `read_csv_auto(..., compression = 'gzip')`. Upload the uncompressed file instead.

## Types on the Wire

Whole numbers inferred from a CSV, JSON, or NDJSON file are `BIGINT`, and `BIGINT`, `UBIGINT`, `HUGEINT`, and `DECIMAL` values arrive as **strings** so nothing loses precision -- a `qty` column comes back as `"3"`, and `COUNT(*)` and `SUM` over integers as `"10"` and `"61"`. `TINYINT`, `SMALLINT`, `INTEGER`, `FLOAT`, `DOUBLE`, and `BOOLEAN` are JSON numbers and booleans; dates and timestamps are strings. When a caller needs a number, cast in the statement: `COUNT(*)::DOUBLE` arrives as `10`. The job's `columns` list each column's engine type.

## Jobs and Results

A submit answers 202 with `{jobId, status: "queued"}`. The job moves to `running`, then `completed` or `failed`; there is no cancel.

- **Completed** jobs carry `rowCount`, `pageCount`, `truncated`, `columns`, and `executionMs`. Read pages 1 to `pageCount` from the results route while `hasMore` is true. A page is a byte budget, not a row count, so one page can hold a very large result: bound it with `LIMIT`. `truncated: true` means the result hit the service's row cap -- narrow the query.
- **Failed** jobs carry `error.code` and `message` -- `STORAGE_QUERY_TIMEOUT` when the statement ran past its execution time (no partial result), `STORAGE_QUERY_EXECUTION_FAILED` when the engine rejected it while running (a column whose inferred type breaks part-way through a file, for example; read options such as `types`, `sample_size = -1`, or `all_varchar = true` get past it), `STORAGE_QUERY_JOB_INTERRUPTED` when the worker went away (resubmit).
- **The results route answers 409 `STORAGE_QUERY_JOB_NOT_READY`** while the job is queued or running, and permanently for a failed one.
- **Jobs expire** after a retention period; then their status and results answer 404. Read the rows before then -- re-submitting spends the budget again.

The number of files a statement may reference, the files a folder may hold, the total bytes read, and the statement's size are capped; the refusal of an exceeded cap names the current limit.

## With the CLI

```bash
celigo storage query 'SELECT item, qty FROM "Order to cash/inbound/orders.csv" ORDER BY qty DESC LIMIT 20'
celigo storage query -f query.sql -o rows.csv          # every row to a file (CSV for .csv, otherwise a JSON array)
celigo storage query '<sql>' --no-wait                  # print {jobId, status} right after the submit
celigo storage query-status <jobId>
celigo storage query-results <jobId> [--page <n> | --all | -o <path>]
```

`query` waits up to `--timeout` seconds (default 120) and prints up to 1000 rows inline; past that it prints the job envelope and how to save the rows, which stay on the server -- `query-results <jobId> -o rows.csv` saves them without a new submit. A failed job exits 1 with the platform's message. The flags and the `-o` path are checked before anything is submitted, so a bad flag or output path costs no budget.

## Not Available over MCP

Storage Query has no MCP tool. Use the CLI or the REST API.
