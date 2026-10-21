# Monitoring EDI Transactions

B2B Manager keeps one transaction record per X12 transaction set or EDIFACT message that a flow parses or generates. The platform creates the records; you can query them, set one field (`faStatus`) by hand, and download the files behind them. The account needs B2B Manager.

- **CLI:** `celigo edi-transactions` (`list`, `fa-detail`, `mdn-detail`, `update-fa-status`, `download-file`, `export`) and `celigo jobs download-files`.
- **MCP:** `list_edi_transactions` (query, one record, FA and MDN details, the document's download URL) and `update_edi_fa_status` (write). The MCP server has no tool for the CSV export or the document-number download; use the CLI or the REST API for those.

## What a Record Holds

The envelope, not the document: `documentType`, `documentNumber`, `direction` (`Inbound` / `Outbound`), `faStatus`, `mdnStatus` (AS2), the control numbers (`controlNumber.interchange` / `group` / `transactionSet` on X12, `unb` / `ung` / `unh` on EDIFACT), the sender and receiver IDs (`isaSenderId` / `isaReceiverId` and `gsSenderId` / `gsReceiverId` on X12, `unbSenderId` / `unbReceiverId` on EDIFACT), the file keys with the runs that stored them (`s3Key` + `_flowJobId`, `faS3Key` + `_faFlowJobId`, `mdnS3Key`) and `lastModified`. Newer records can carry the lifecycle fields ([Following an order across documents](../SKILL.md#monitoring-edi-transactions)). Schema: [edi-transaction.yml](schemas/edi-transaction.yml).

- **No line items or amounts.** They're only in the raw file: download it.
- **No flow ID.** `_integrationId` names the integration (absent when the flow ran outside one) and `_flowJobId` the run; `celigo jobs get <_flowJobId>` gives the flow.
- **`documentType` is free-form.** Partner-specific codes (`PO`, `SH`) appear next to `850` and `ORDERS`.
- **`documentNumber` can be missing or empty** -- on most 997/CONTRL acknowledgements and on any document whose file definition extracts no number.
- **IDs and control numbers as stored:** inbound `isaSenderId` / `isaReceiverId` keep the file's 15-character padding (outbound records store the configured ID unpadded), and `controlNumber.transactionSet` can end in a terminator (`"0004~\r"`). Trim before comparing.

## Finding Records

The query (`POST /v1/ediTransactions/query`) applies only:

- `fileType` -- one standard per call; `X12` when omitted, so ask for `EDIFACT` separately.
- **One** search field: `documentNumber`, or the sender or receiver ID (`interchangeSenderId` / `interchangeReceiverId` on X12, `unbSenderId` / `unbReceiverId` on EDIFACT).
- `faStatus` -- an array.
- `startDate` / `endDate` -- the `lastModified` window, epoch milliseconds. Called directly with neither, it covers the last 24 hours; `endDate` without `startDate` is refused.

`direction`, `documentType` and `_integrationId` are accepted and ignored. Filter the returned rows on them yourself, and follow `pageToken.next` (newest first, `limit` up to 1000) before concluding nothing matched. A search value needs at least 3 characters besides a trailing `*`; `*` is allowed only at the end, and a search with it takes a `limit` of at most 100.

```bash
celigo edi-transactions list --modified-gte 2026-10-01T00:00:00Z --modified-lte 2026-10-21T23:59:59Z --limit 1000
celigo edi-transactions list --document-number "PO-4500*" --limit 100           # 3+ characters before the *
celigo edi-transactions list --file-type EDIFACT --direction Inbound --document-type ORDERS
celigo edi-transactions list --jq '[.[] | select(.faStatus == "rejected")]'      # there is no --fa-status flag
```

The CLI sends a 30-day window by default and returns one page. It applies `--direction`, `--document-type` and `--integration` to that page and warns on stderr when more records exist; it has no page token, so narrow the window or raise `--limit`. It has no flag for `faStatus` or the sender and receiver IDs.

`list_edi_transactions` takes `fileType`, `documentNumber`, `startDate` / `endDate` (ISO-8601 or epoch milliseconds; the last 30 days by default), `limit` (100 by default) and `cursor` (the previous `nextCursor`), and returns `{ ediTransactions, hasMore, nextCursor }`. It passes `direction`, `documentType` and `_integrationId` to the query unapplied, so filter the rows it returns, and it has no `faStatus` or sender/receiver parameter. With `_id` it scans the log for that one record without the 30-day default: also pass the record's `fileType` and a `startDate` before its `lastModified`.

## Acknowledgements (997 / CONTRL)

`faStatus` changes in place when a run processes the partner's 997 or CONTRL. That run becomes the record's `_faFlowJobId`; the flow that sent the document doesn't run again. `notApplicable` means the document is itself an acknowledgement or none is expected. A record that stays `inProgress` (awaiting) or `notReceived` (expected, not received): check that the flow that parses the partner's acknowledgements ran and parsed that file before concluding the partner never sent one.

**Why a partner rejected a document.** FA details exist only for `rejected` transactions: the partner's errors for that transaction set, as `faDetails` → `Group[]` → `Transaction[]` → `Errors[]` with `Segment ID`, `Element ID`, `Error message` and `Data in error`. Any other status answers 400, and the call needs the transaction's own `fileType` (404 without it). `acceptedWithErrors` has no details: read the acknowledgement file itself.

```bash
celigo edi-transactions fa-detail <id> --file-type X12
```

Through MCP, `list_edi_transactions` with `_id` and `includeFaDetails: true`. On a list page, `includeFaDetails` asks for every row's details, and a single row that isn't `rejected` fails the whole call.

**Recording an acknowledgement by hand** (a write: confirm with the user). Only `accepted` and `rejected` can be set. Other values and unknown IDs are skipped, and the call still answers 200 with `{"ediTransactions": []}`, so read the records back. It changes the record only; the partner's own acknowledgement stands.

```bash
echo '{"fileType": "X12", "ediTransactions": [{"_id": "<id>", "faStatus": "accepted"}]}' | celigo edi-transactions update-fa-status
```

Through MCP, `update_edi_fa_status` with the same body.

**AS2 receipts.** `mdnStatus` is `received` on an outbound record (the partner returned an MDN) and `sent` on an inbound one. `celigo edi-transactions mdn-detail <id>` (MCP: `includeMdn: true`) returns the raw MDN (`mdnStatusMessage`), its `mdnTimestamp` and `mdnDisposition`: `processed`, `warning`, `error` or `failure`.

## Files

| File | CLI | MCP |
|---|---|---|
| The document | `celigo jobs download-files <_flowJobId> --file-id <s3Key> -o doc.edi`, or `celigo edi-transactions download-file <documentNumber> --document-type <code>` | `list_edi_transactions` with `_id` and `includeFiles: true` (`ediFileSignedURL`) |
| The partner's acknowledgement | `celigo jobs download-files <_faFlowJobId> --file-id <faS3Key> -o ack.edi` | `list_flow_runs` with `_id` set to the `_faFlowJobId` and `includeFiles: true` (that run's file URLs) |

- **Pair each key with its own run.** The document's run returns nothing for an `faS3Key`, which doesn't mean the file is gone. One acknowledgement file can cover many transactions, which then share its `faS3Key`.
- **`download-file` looks the document up by number and type.** It needs a `documentNumber` (most acknowledgements have none) and a document code such as `850` or `ORDERS`; `X12` answers 400.
- **By transaction id:** `GET /v1/ediTransactions/{_id}/ediFile?type=nonFa` (the document) or `type=fa` (the acknowledgement) also answers on the token API -- `celigo platform get "v1/ediTransactions/<id>/ediFile?type=fa"` -- and returns a signed URL. The MCP server has no tool for it.
- Signed URLs are short-lived: fetch the file at once and don't store the URL.

## Exporting the Log

```bash
celigo edi-transactions export --file-type X12 --start <epoch-ms> --end <epoch-ms>
```

It prints `{url}`, a CSV of the window that stays valid for 15 minutes. Without `--start` / `--end` it covers the last 24 hours, and `--end` needs `--start`. X12 and EDIFACT are separate logs with different columns. A window that matches more records than the server allows fails with `exceeded_max_ediTransactions`: narrow it.

## Retention

Records and their files -- documents, acknowledgements, MDNs -- are kept for the account's data retention period: 30, 60, 90 or 180 days, with the license setting the ceiling. A record's period restarts whenever it changes (an `faStatus` update, for one); a file's counts from when it was stored, so a record can outlive its file. Expired records drop out of queries and don't go to the recycle bin. A download that answers not found for an old document may simply have aged out.

## Watching for Problems

Nothing notifies you when a transaction changes: notification subscriptions cover integrations, flows and connections. To watch for rejections, query on a schedule (for example the last day's records with `faStatus` `rejected` or `failed`), and subscribe to the acknowledgement flow's errors so a failed acknowledgement run is noticed.

## Common Problems

| Symptom | Cause | Fix |
|---|---|---|
| 400 `Invalid search api body provided, the search query string length should not be less than 3` | Search value under 3 characters (a trailing `*` doesn't count) | Search a longer value, or list a window and filter |
| 400 `Invalid search api body provided, the limit provided should not be more than 100` | A `*` search with `limit` above 100 | `--limit 100` or less |
| 400 `Invalid search api body provided, "*" is only expected at the end of the string` | `*` inside the value | Only a trailing `*` |
| 400 `Functional Acknowledgement Details can only be retrieved for a transaction with "FA Status" as "Rejected".` | FA details asked for a transaction that isn't `rejected` (on MCP, any row of an `includeFaDetails` page) | Ask for rejected transactions only; read the acknowledgement file for `acceptedWithErrors` |
| 404 `EdiTransaction not found.` from FA details | Unknown ID, or the `fileType` parameter missing | Pass the record's own `fileType` |
| 400 `X12 is not a valid document type. Please verify the value and try again.` | `download-file` given the standard instead of a document code | `--document-type 850` (or `ORDERS`, …) |
| 404 `No transaction was found matching the provided document type and document number.` | Wrong number or type, or the record aged out | Check the record in a query; download by run instead |
| `exceeded_max_ediTransactions` from `export` | The window holds more records than the export allows | Narrow `--start` / `--end` |
| An FA status update returns `{"ediTransactions": []}` | Nothing matched: unknown IDs, or a value other than `accepted` / `rejected` | Fix the body and read the records back |
| An empty list, no error | The window (24 hours when the API gets no dates), the standard (X12 by default), or a direction/type/integration filter applied to one page | Widen the window, query each standard, page through |
