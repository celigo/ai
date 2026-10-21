---
name: building-b2b
description: Build Celigo B2B Manager EDI integrations -- trading partner onboarding, EDI profiles, file definitions, X12/EDIFACT flow patterns, and transaction monitoring. Use when onboarding partners, editing EDI flows, setting up parsing rules, or monitoring document exchange.
---

<!-- TIER:1 -->

# Building B2B / EDI Integrations

B2B Manager is Celigo's EDI hub for exchanging structured business documents with trading partners. It handles X12 (ANSI) and EDIFACT (UN) standards over FTP/SFTP, AS2, S3 and VAN connections, and over the folder (file) mode of cloud file providers such as Google Drive, Box, Dropbox, Azure Blob, Google Cloud Storage and Celigo Storage.

An EDI integration has these Celigo-specific components:

- **Trading partner connector** -- a pre-built template (590+) defining the connection type, EDI profile defaults, and export/import field requirements for a specific trading partner
- **EDI profile** -- interchange envelope settings (ISA/GS for X12, UNB for EDIFACT) that identify sender/receiver and control document versioning
- **File definition** -- parsing and generation rules that describe the segment/element structure of a specific EDI document type (e.g. one trading partner's 850 or 856)
- **Connection** -- FTP, AS2, S3, VAN or cloud file-provider credentials for the trading partner's EDI endpoint
- **Exports and imports** -- file-based data sources/destinations that use file definitions to parse inbound EDI or generate outbound EDI
- **Flows** -- pipelines wiring exports and imports together with transformations

## EDI Standards

**X12 (ANSI ASC X12)** -- North American standard. Documents are **transaction sets** identified by 3-digit codes (850 = PO, 810 = Invoice, 856 = ASN, 997 = FA, 855 = PO Ack, 846 = Inventory, 860 = PO Change). 50+ additional types supported including healthcare (834/835/837), transportation (204/210/214), and supply chain (753/843/861). Envelope: ISA → GS → ST → segments → SE → GE → IEA. Versions: 4010, 5010, 4030, etc.

**EDIFACT (UN/EDIFACT)** -- International standard. Documents are **messages** identified by 6-letter codes (ORDERS, INVOIC, DESADV, ORDRSP, RECADV, INVRPT, PRICAT, CONTRL). Additional messages: INSDES, OSTRPT, PARTIN, DELJIT, PRODAT, DELFOR, SLSRPT. Envelope: UNB → UNH → segments → UNT → UNZ. Versions: D93A, D96A, D01B, etc.

## Quick Reference

### Resource Decision Matrix

| Task | Resource | CLI command | Schema |
|---|---|---|---|
| Discover partner templates | Trading partner connector | `tp-connectors list` | [tp-connector-request.yml](references/schemas/tp-connector-request.yml) |
| Define interchange envelope | EDI profile | `edi-profiles create` | [edi-profile-request.yml](references/schemas/edi-profile-request.yml) |
| Define document parsing/generation | File definition | `file-definitions create` | [file-definition-request.yml](references/schemas/file-definition-request.yml) |
| Monitor document exchange | EDI transaction | `edi-transactions list` | [edi-transaction.yml](references/schemas/edi-transaction.yml) |
| Connect to partner endpoint | Connection (FTP, AS2, S3, VAN or a file provider) | `connections create` | See configuring-connections |

### Minimum Required Fields

| Resource | Required |
|---|---|
| EDI profile (X12) | To save: `name`, `fileType: "edix12"`. Before it parses or generates a file: `tpInterchangeId`, `myInterchangeId`, `tpIdQualifier`, `myIdQualifier`, `tpGroupId`, `myGroupId`, `isa01`–`isa04` (checked against every inbound file), `isa12` (version), `gs07`, `gs08`. Take the IDs from the partner's guide, a sample file or the connector; leave any nobody has supplied empty and ask -- never invent one |
| EDI profile (EDIFACT) | To save: `name`, `fileType: "edifact"`. Before use: `unb010_0001`, `unb010_0002`, `versionNumber`, `releaseNumber`, `controllingAgency` |
| File definition (X12/EDIFACT) | `name`, `version: "2"`, `format` (e.g. `delimited/x12`), `globalId` (X12/EDIFACT on EDI-licensed accounts), `delimited` block (`rowDelimiter`, `rowSuffix`, `colDelimiter`), `rules[]` (20 KB at most, serialized) |
| File definition (fixed-width) | `name`, `format: "fixed"`, `version: "1"`, `fixed.rowDelimiter`, `fixed.paddingChar`, and `rules[]` declaring every column of the line in order, each with a `length` -- including a placeholder element for positions you don't need (`startPosition` is ignored). A create or update missing `version`, `rowDelimiter` or `paddingChar` is refused with 422 |

### Schema Index

- [edi-profile-request.yml](references/schemas/edi-profile-request.yml) -- X12 ISA/GS and EDIFACT UNB fields
- [file-definition-request.yml](references/schemas/file-definition-request.yml) -- format, delimiters, rules structure
- [edi-transaction.yml](references/schemas/edi-transaction.yml) -- transaction query response shape
- [tp-connector-request.yml](references/schemas/tp-connector-request.yml) -- connector and supportedBy sections
- [tp-supported-by-section.yml](references/schemas/tp-supported-by-section.yml) -- connection, profile, export/import pre-configuration

## Related Skills

- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- FTP, AS2, and VAN connection types for trading partner endpoints
- [managing-file-storage > The Celigo-Hosted SFTP File Server](../managing-file-storage/references/file-server.md) -- partner SFTP accounts whose files land in Celigo Storage
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- file-based exports that parse inbound EDI using file definitions
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- file-based imports that generate outbound EDI using file definitions
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring EDI exports and imports into flow pipelines
- [writing-scripts > Quick Reference](../writing-scripts/SKILL.md#quick-reference) -- preSavePage/postMap hooks for EDI record transformation and validation

<!-- TIER:2 -->

## How to Build an EDI Integration

### 1. Find the trading partner connector

Trading partner connectors are pre-built templates (590+) that define connection type, EDI profile defaults, and export/import config for a specific partner. A connector is a template you link to; no API call installs it. In the UI, trading partner onboarding builds the resources from it and prompts for the values the connector leaves to the user. Through the API or CLI you create each resource yourself (steps 3–6) and link the connection to the connector (step 3).

```bash
celigo tp-connectors list
celigo tp-connectors get <connectorId>
```

The connector's `supportedBy` object tells you what's pre-configured and what the user must provide for the connection, EDI profile, and exports/imports. See [tp-supported-by-section.yml](references/schemas/tp-supported-by-section.yml) for the full structure. The list is a summary without `supportedBy`, so fetch the connector you need by id. Each connector is one transport, region and business model for a partner; a partner's variants share its `baseName`, and `celigo tp-connectors list --distinct` lists those partner names.

If no connector fits, create the connection, EDI profile, exports and imports yourself, and still source the file definitions from a template or an existing definition (see [Sourcing EDI Resources](#sourcing-edi-resources)).

### 2. Check for existing resources

Before creating anything, check what the account already has. EDI profiles are per-partner (one profile covers all document types), so duplicates waste control number sequences. File definitions and EDI profiles are account-level -- no integration owns them -- so list them all rather than by integration, and choose a definition by partner, document type and direction.

When a partner already has a flow for another document, model the new export or import on it but don't copy everything: reuse its connection, its EDI profile and, inbound, its acknowledgement listener (`_postParseListenerId`), and take the file definition for the new document type -- another document type's definition won't parse it.

```bash
celigo account search "<partner-name>"
celigo edi-profiles list | grep -i "<partner-name>"
celigo file-definitions list | grep -i "<partner-name>"
celigo connections list | grep -i "<partner-name>"
```

### 3. Create the connection

Create the connection for the partner's transport: FTP/SFTP, AS2, S3, VAN, or a cloud file provider in folder mode. See [configuring-connections](../configuring-connections/SKILL.md) for full connection setup.

With a trading partner connector, link the connection to it: set `<transport>._tpConnectorId` on an `as2`, `ftp` or `s3` connection. The connector must be published (an unknown or unpublished id is rejected with 422 `tpconnector_not_found`), and VAN connections have no link field. Then set the fields the connector's `supportedBy.connection.fieldsUserMustSet` lists: the partner's real host and identity.

**Never copy the connector's pre-configured connection values onto the connection.** Apart from the transport type, they're template stand-ins, such as a placeholder AS2 partner ID and a staging AS2 URL. An AS2 connection's `partnerId` can't be changed once the connection exists -- an update with a different value is silently ignored -- so a copied placeholder is permanent, and fixing it takes a new connection. Get the partner's real AS2 ID before you create an AS2 connection.

```bash
celigo connections create --tp-connector <id or name> < connection.json   # sets <transport>._tpConnectorId, copies none of the stand-ins, and lists the fields left to set
celigo connections ping <connectionId>
```

### 4. Create the EDI profile

The EDI profile defines the interchange envelope -- ISA/GS segments (X12) or UNB segment (EDIFACT). Read [edi-profile-request.yml](references/schemas/edi-profile-request.yml) for all fields.

Key X12 fields: `tpInterchangeId`/`tpIdQualifier` (the partner's ID and its qualifier, e.g. ZZ = mutually defined) and `myInterchangeId`/`myIdQualifier` (yours). On files you receive the partner is the sender (ISA05/ISA06) and you the receiver (ISA07/ISA08); on files you generate it's the reverse. Also `isa01`–`isa04` (the parser checks the file's ISA01–ISA04 against them), `isa12` (version, e.g. 00401), `isa15` (P = production, T = test) and `controlNumber` (auto-incremented). Store interchange IDs unpadded (see gotcha 2).

With a trading partner connector, start from it: `edi-profiles create --tp-connector` fills the partner's envelope defaults (file type, X12 version, ISA/GS flags and qualifiers), never your own IDs, and lists on stderr the IDs left for you to supply. Check its `--dry-run` body first: some connector forms prescribe spaces for `isa02`/`isa04` or a padded partner ID, which inbound parsing rejects, so set those to `""` and the unpadded ID.

```bash
celigo edi-profiles create --tp-connector <id or name> --name "<Partner> X12" --dry-run   # inspect, then run without --dry-run
celigo edi-profiles create < profile.json
```

### 5. Create file definitions

Each document type (850, 810, 856, etc.) needs its own file definition with parsing/generation rules. Read [file-definition-request.yml](references/schemas/file-definition-request.yml) for the rules structure.

Key fields: `format` (`delimited/x12` or `delimited/edifact`), `globalId` (the standard document it implements; required on EDI-licensed accounts and immutable -- see [Sourcing EDI Resources](#sourcing-edi-resources)), `delimited.rowDelimiter` (what the parser splits segments on), `delimited.rowSuffix` (what generation appends after each segment, `~` for X12), `delimited.colDelimiter` (element separator, `*` for X12), `rules[]` (hierarchical segment/element tree). When each segment ends with `~` and a line break, set `rowDelimiter` to `~\n` (or `~\r\n`): a bare `~` leaves the line break on the next segment, and the parse fails at line 2 (`Required rule must have the respective row in the source file`).

A fixed-width definition (`format: "fixed"`) is read in element order: the parser ignores `startPosition` (and the legacy `start`/`end`), so a definition that skips a column misparses with no error. Declare every column of the line in order, including the ones you don't need: a run of positions you skip still takes a placeholder element of that width (it comes through as a field of its own). Give every element a `length` from 1 to 512. A save needs `version` (`"1"` on fixed-width definitions), `fixed.rowDelimiter` and `fixed.paddingChar`; without them it's refused with 422. Rows that carry no row-type marker need `ignoreIdentifier: true` on the row rule, inside a container (gotcha 18): without it they parse to one empty record, with no error. A one-time header line takes its own plain rule (not a container) with a marker element, ahead of the records container or wrapping it. `ignore: true` leaves an element out of the record while keeping its width.

A line break after the last row is read as one more, empty row. With a required row rule the parse fails at that line (`Required rule must have the respective row in the source file. ... for line: <n>`); otherwise the last record comes back as `{}`. Set `skipIntermittentEmptyLines: true` on the definition to drop empty lines, including that one.

Before linking a definition to a step, test it with the profile attached: parse the partner's sample, or generate from sample records and treat empty output as a failure. Without a profile the parser skips the envelope check, so a profile mismatch would only surface in the run. An envelope, profile or standard violation fails the whole call with a 422 that names the segment, element and value (see [Common Errors](#common-errors)); check `recordLevelErrors` on a 200 as well.

```bash
celigo file-definitions create < filedef.json
celigo processors parse edi sample.edi --file-definition-id <id> --edi-profile-id <profileId>   # or --file-definition <filedef.json>; also parses fixed-width
celigo processors generate edi records.json --file-definition <rules.json> --edi-profile-id <profileId> --jq .data
```

### 6. Create exports and imports

EDI runs on any file transport that carries an EDI profile: FTP/SFTP, AS2, S3, and the folder (file) mode of cloud file providers (Google Drive, Box, Dropbox, Azure Blob, Google Cloud Storage and Celigo Storage, with `http.type: "file"`). VAN connections exchange EDI too. Use `FTPExport`/`FTPImport` (with `ftp.directoryPath`), `AS2Export`/`AS2Import` (the transport settings live on the AS2 connection, so there's no directory path), `S3Export`/`S3Import`, or `HTTPExport`/`HTTPImport` in file mode. A records-mode HTTP step can't take a profile: the save is refused with `not_supported`.

**Inbound EDI export:** `file.type: "filedefinition"`, `file.fileDefinition._fileDefinitionId` and `_ediProfileId`, on one of the adaptors above.

**Outbound EDI import:** the same file definition and profile references, plus how a run's records become files: `file.aggregation.type: "page"` with `file.skipAggregation: true` (one file per page), or `"key"` with `false` (one file per document key; B2B Manager accounts only). The key comes from the file definition's document type, so there's no key field to set. `"all"` isn't allowed for EDI, and a `page` import saved without `skipAggregation: true` fails with 422 `not_supported` ("Aggregation is not supported for EDI files, please set skipAggregation to true in Imports").

See [configuring-exports](../configuring-exports/SKILL.md) and [configuring-imports](../configuring-imports/SKILL.md) for full field schemas.

### 7. Wire into flows

Typical patterns:

- **Inbound:** FTP export (parse EDI) → transform EDI fields to ERP → ERP import
- **Outbound:** ERP export → transform to EDI → FTP import (generate EDI)
- **997 FA:** a separate acknowledgement flow (a listener source, then an import that generates the 997), which the inbound export calls through `_postParseListenerId` -- see [Functional Acknowledgements](#functional-acknowledgements-997--contrl)

See [building-flows](../building-flows/SKILL.md) for scheduling, chaining, and error management.

## Document Grammar vs Partner Identity

The most important conceptual split in Celigo's EDI model:

- The **file definition** owns the *document grammar* -- the segments, elements, loops, and envelope structure of one document type (850, 810, ORDERS), one per document type **and direction**.
- The **EDI profile** owns the *partner identity* -- the interchange IDs, qualifiers, group IDs, version, and control settings that fill that envelope. One profile per trading partner, per EDI standard, no matter how many document types you exchange.

The two meet at runtime. Envelope elements in a file definition's rules don't hardcode identity values -- they carry `{{{ediProfile.…}}}` references, and the platform substitutes the values from the profile linked on the export/import (`_ediProfileId`). On **parse** (inbound), the substituted values are validated against the actual file bytes -- a mismatch fails the document with an EDI-profile validation error (an identity problem, not a grammar problem). On **generate** (outbound), the values are written into the envelope of the file being produced.

A file-based EDI step therefore needs **both** resources: the platform rejects an X12/EDIFACT file definition that has no linked profile. Sequence the profile before the exports/imports that reference it, exactly as you would a connection.

When you write a binding yourself, use only keys the profile has. For X12 those are `tpInterchangeId`, `myInterchangeId`, `tpIdQualifier`, `myIdQualifier`, `tpGroupId`, `myGroupId`, `isa01`–`isa04`, `isa11`, `isa12`, `isa14`–`isa16`, `gs07`, `gs08` and `controlNumber`; the EDIFACT keys are in [rules.yml](references/filedefinition-schemas/rules.yml). There are no `isa05`–`isa08` keys: the qualifier and ID positions bind to the `tp*` or `my*` pair, by direction. Leave the date, time and control bindings a Celigo template ships with as they are. An unknown key saves, then fails the parse, and generation returns an empty file without an error, so test every definition before linking it (step 5).

### One Profile, Both Directions

A profile is direction-agnostic. Its fields are labeled by *whose* identity they hold (`tp*` vs `my*`), not by sender/receiver position. On an inbound parse the partner is the sender, so the file definition's rules bind the sender slots to the `tp*` values and the receiver slots to `my*`; on an outbound generate the orientation flips (sender → `my*`, receiver → `tp*`). One partner profile serves the 850s coming in and the 810s going out. This is a notable asymmetry with file definitions, which come in **separate parse and generate variants** per document type -- parse rules tolerate what partners send, generate rules must produce exactly what partners require.

## Sourcing EDI Resources

### Building an EDI Profile from a Sample File

The fastest correct path to a new profile is **not** hand-copying values out of a companion guide -- it's reading a real file from the partner. No public API route, CLI command or MCP tool extracts a profile from a file, so read the envelope yourself. On an X12 file the partner sent you:

| File | Profile field |
|---|---|
| ISA01–ISA04 | `isa01`–`isa04` (a blank ISA02/ISA04 becomes `""`) |
| ISA05 / ISA06 | `tpIdQualifier` / `tpInterchangeId`, trimmed |
| ISA07 / ISA08 | `myIdQualifier` / `myInterchangeId`, trimmed |
| ISA11, ISA12, ISA14–ISA16 | `isa11`, `isa12`, `isa14`–`isa16` |
| GS02 / GS03, GS07 / GS08 | `tpGroupId` / `myGroupId`, `gs07` / `gs08` |

Then parse the sample with the new profile attached (step 5): an envelope value that doesn't match fails with a 422 naming it.

- Review the values before creating -- especially the usage indicator (`isa15`, `T` vs `P`) and the qualifiers -- since they reflect that one file.
- Name the profile after the partner (e.g. "Acme Corp X12").
- A file the partner *sent you* has the partner in the sender slots. When it's ambiguous, confirm which direction the sample flows -- what you receive vs what you must produce.

### Never Start EDI from Scratch -- Begin from a Template

Celigo ships a global catalog of pre-built EDI templates -- X12 and EDIFACT document definitions, many vendor-specific (per-retailer 850 variants and the like), each tagged with vendor, document type, and direction. Templates are instantiated **into** account-level file definitions, which you then customize to the partner's companion guide. The catalog is browsable only in the UI; an API token can't list it. Canonical sourcing order:

1. An account-level file definition of the **same document type** already exists → reuse it or use it as the base.
2. A global template matches → have the user add it in the UI, then customize the definition it creates.
3. No template fits, but the partner has a specification PDF → generate rules from it: `celigo file-definition-rules generate <guide.pdf> --document-type 850`. It runs asynchronously, saves nothing, and allows 10 submissions an hour; create the definition from its `generationFdr` (`--jq .generationFdr`), adding a `globalId` copied from an existing definition of the same document, then parse a sample.
4. Build from scratch → last resort, for documents no template covers.

On EDI-licensed accounts an X12 or EDIFACT file definition needs a `globalId` from Celigo's standard-document registry: a create without one fails with `global_id_not_provided`, an invented one with `invalid_global_id`, and it can't be changed later. With an API token, reuse the `globalId` of an existing definition for the same document type, or ask the user to add the template in the UI.

**Same-type rule:** a file definition is only a valid base for the *same transaction set type*. An existing 850 is a fine starting point for another partner's 850; an 860 is **not** a starting point for an 850 -- different documents, different segment structures. Hand-building a rules tree when a template exists invites subtle mistakes in envelope close rules and element conventions.

For onboarding a **whole partner** (not just one document), start from the partner's trading partner connector (see step 1). It provisions nothing by itself: in the UI, trading partner onboarding builds the resources from it and prompts for what it leaves to the user; through the API or CLI you create the connection, EDI profile, exports and imports yourself and link the connection to the connector (step 3). Build individual EDI steps directly only when adding one document flow against an already-onboarded partner.

## Functional Acknowledgements (997 / CONTRL)

Functional acknowledgements -- `997` (X12) and `CONTRL` (EDIFACT) -- are how EDI parties confirm receipt of an interchange. They are **ordinary file definitions** with the `documentType` field set (`997` or `CONTRL`), not a separate resource type. Accounts exchanging EDI typically wire them in **both directions**: generate an acknowledgement for every interchange you receive, and parse the acknowledgements your partner returns for the documents you send.

The generate side is a **separate acknowledgement flow** in the same integration. Its source is a listener -- an export with `type: "webhook"` and `webhook.provider: "integrator-extension"` -- and its import generates the acknowledgement with a file definition whose `documentType` is `997` (or `CONTRL`) and sends it to the partner. Point the inbound EDI export's `_postParseListenerId` at that listener (the UI's **Send functional acknowledgment** option): the platform calls it once per parsed file, on success and on failure, with any parse errors in the payload. `_postParseListenerId` is accepted only on FTP, AS2, S3, and HTTP file-mode exports, and any other kind of listener is rejected with `invalid_post_parse_listener`. There is no `file.faAcknowledgement` setting. Track acknowledgement state per document via `faStatus` (see Monitoring EDI Transactions).

## Strict Validation and the Skip Flags

EDI parsing validates inbound files against both the EDI standard and the linked profile. Two file-definition flags relax that:

- `skipEDIValidation` -- skip structural validation against the EDI standard.
- `skipEDIProfileValidation` -- skip validation of the envelope against the linked EDI profile.

They exist because real-world partners send files that violate the standard or mismatch the declared profile. Treat them as a pragmatic escape hatch, **not a default**: prefer fixing the rules (or the profile) so validation passes -- it catches real partner errors. Reach for the skip flags only when a partner's non-conformance is confirmed, acknowledged, and not going to be fixed on their side. A definition you inherit may already have them on; turning them off changes which partner files it accepts, so parse recent files from every partner that uses it with the flags off before saving that change.

## Monitoring EDI Transactions

The full reference -- every query rule, acknowledgements and AS2 receipts, the files behind a record, the CSV export, retention, and the CLI and MCP call for each -- is [references/monitoring.md](references/monitoring.md).

B2B Manager tracks every EDI document processed. Key transaction fields: `documentType`, `documentNumber`, `direction` (Inbound/Outbound), `faStatus` (`inProgress` / `notApplicable` / `notReceived` / `accepted` / `acceptedWithErrors` / `rejected` / `failed`), `mdnStatus` (`received` / `sent`, AS2 only), `controlNumber`, `s3Key`/`_flowJobId` (the document's raw file), `faS3Key`/`_faFlowJobId` (the partner's acknowledgement file; see [Downloading EDI Files](#downloading-edi-files)). Records and their files expire after the account's data retention period (30 to 180 days; a record's restarts whenever it changes), so an old document may no longer be there.

The transaction query filters server-side only on `fileType` (X12 unless you ask for EDIFACT), one search field (`documentNumber`, or the sender or receiver id: `interchangeSenderId` / `interchangeReceiverId` for X12, `unbSenderId` / `unbReceiverId` for EDIFACT), `faStatus` (an array) and the `lastModified` window. `direction`, `documentType` and `_integrationId` are accepted but ignored, so filter on them yourself and keep paging (the response's `pageToken`) before concluding nothing matched. Called directly, the API searches only the last 24 hours when you omit the window (the CLI sends 30 days); search values need 3+ characters besides the `*`, are matched in upper case, ignore ISA padding and allow one trailing `*` (a search with it takes a `limit` of 100 at most). The CLI applies `--direction`, `--document-type` and `--integration` to the one page it fetches and warns when more exist: narrow the window or raise `--limit` (up to 1000).

```bash
celigo edi-transactions list
celigo edi-transactions list --file-type EDIFACT
celigo edi-transactions list --modified-gte 2026-01-01T00:00:00Z --modified-lte 2026-01-31T23:59:59Z
celigo edi-transactions list --document-number <number>
```

**Why a partner rejected a document.** A transaction with `faStatus: rejected` has FA details: the errors from the partner's acknowledgement for that one transaction -- segment, element, error message and the data in error (`GET /v1/ediTransactions/{_id}/faDetails?fileType=X12`, or `EDIFACT`). They exist only for rejected transactions: asking for any other transaction's details answers 400, and a batch read that includes one fails as a whole. So find the rejected transactions first (filter on `faStatus: rejected`), then read each one's details. Then trace the element the partner named to its source: the outbound step's mapping for that element, and the field it reads on the rejected records, compared with an accepted one. The fix is in that data or that mapping, followed by a resend. Setting `faStatus` to `accepted` by hand changes only the record; the partner still rejected the document.

**Following an order across documents.** Transaction records can carry lifecycle fields: `referenceDocumentNumber` (the documents this one refers back to, as upper-cased `<qualifier> <number>` strings such as `PO 4500012345`; present only when the file definition extracted a reference), `partnerPairKey` (shared by every document between the same two trading partners; present when the flow resolved the partner), `tradingPartnerName`, and `lifecycleStatus` (the order step a document represents, such as `PO received` or `ASN sent`). The query can't filter on them, so read them from the records a date-window or document-number query returns, and check that they're there before relying on them: records that predate lifecycle tracking, and document types outside the order cycle, don't have them. Without them, query the PO number with no document-type filter, and present same-number 855, 856 and 810 matches as likely, not confirmed, since partners often number shipments and invoices their own way.

## CLI Commands

### EDI Profiles
```bash
celigo edi-profiles list
celigo edi-profiles get <id>
celigo edi-profiles create < profile.json
celigo edi-profiles update <id> < profile.json
celigo edi-profiles set <id> <key>=<value> [<key2>=<value2> ...]
celigo edi-profiles dependencies <id>   # what uses the profile; check before changing its IDs
celigo edi-profiles delete <id>
```

### File Definitions
```bash
celigo file-definitions list
celigo file-definitions get <id>
celigo file-definitions create < filedef.json
celigo file-definitions update <id> < filedef.json
celigo file-definitions set <id> <key>=<value> [<key2>=<value2> ...]
celigo file-definitions delete <id>
```

### Trading Partner Connectors
```bash
celigo tp-connectors list
celigo tp-connectors get <id>
```

### EDI Transactions
```bash
celigo edi-transactions list
celigo edi-transactions list --file-type EDIFACT
celigo edi-transactions list --modified-gte <iso> --modified-lte <iso>   # lastModified window; default is the last 30 days
celigo edi-transactions list --limit <n>
celigo edi-transactions list --document-number <number>                   # 3+ characters; a trailing * caps --limit at 100
celigo edi-transactions list --direction Outbound --document-type 810     # applied to the one page fetched
celigo edi-transactions fa-detail <id> [--file-type EDIFACT]              # why the partner rejected it (rejected transactions only; X12 by default)
celigo edi-transactions mdn-detail <id>                                   # the AS2 receipt
celigo edi-transactions update-fa-status --file body.json                 # sets accepted/rejected by hand; read back after
celigo edi-transactions download-file <documentNumber> --document-type 850
celigo edi-transactions export --start <epoch-ms> --end <epoch-ms>        # CSV URL, valid 15 minutes; last 24 hours by default
```

### Downloading EDI Files

Download a transaction's files through the run that stored them, pairing each key with its own job: the document with `_flowJobId` and `s3Key`, the partner's acknowledgement (997/CONTRL) with `_faFlowJobId` and `faS3Key`. `GET /v1/ediTransactions/{_id}/ediFile?type=fa` (or `type=nonFa` for the document) also returns a signed URL for one transaction's file; the CLI reaches it with `celigo platform get`, and the MCP routes are in [references/monitoring.md](references/monitoring.md#files). With the document's `_flowJobId`, an `faS3Key` returns nothing, which is not proof the file is gone. One acknowledgement file can cover many transactions, which then share its `faS3Key`.

```bash
celigo jobs download-files <jobId>                                          # signed URLs for the run's files
celigo jobs download-files <_flowJobId> --file-id <s3Key> -o document.edi
celigo jobs download-files <_faFlowJobId> --file-id <faS3Key> -o ack.edi
```

<!-- TIER:3 -->

## Pre-Submit Checklist

- [ ] EDI profile uses correct `fileType` (`edix12` or `edifact`) -- immutable after creation
- [ ] X12 profile has `isa01`–`isa04`, a blank `isa02`/`isa04` stored as `""`, and interchange IDs unpadded (see gotcha 2)
- [ ] Outbound X12: the generate definition gives ISA01–ISA08 a `maxLength`, and a generated sample's ISA is 106 characters
- [ ] Outbound EDI import sends `file.aggregation.type: "page"` with `file.skipAggregation: true`, or `"key"` with `false`
- [ ] File definition `format` matches standard (`delimited/x12` or `delimited/edifact`)
- [ ] File definition `globalId` references the correct standard template -- immutable after creation
- [ ] `delimited.rowDelimiter` matches how the partner ends segments (`~\n` when each `~` is followed by a line break)
- [ ] Fixed-width: `version`, `fixed.rowDelimiter` and `fixed.paddingChar` are set, every column of the line is declared in order (unneeded positions as placeholder elements), marker-less rows have `ignoreIdentifier: true`, and `skipIntermittentEmptyLines` is on if files end with a line break
- [ ] Parsed the partner's sample, or generated from sample records, with the profile attached before linking the definition; empty output counted as a failure
- [ ] Inbound exports do NOT use `type: "blob"` (skips parsing)
- [ ] `controlNumber` starts at 1 unless the partner requires a specific sequence
- [ ] Exports/imports reference both `_fileDefinitionId` and `_ediProfileId`
- [ ] File definition sourced from a same-type template or existing definition, not hand-built from scratch
- [ ] `skipEDIValidation` / `skipEDIProfileValidation` left off unless partner non-conformance is confirmed and acknowledged
- [ ] File definition used only for marker-based, fixed-width, or EDI files -- plain same-column CSVs use the step's `file.csv` options; JSON/XML/XLSX use step-level parser config
- [ ] Checked what else references a shared file definition (`celigo file-definitions dependencies <id>`) before editing it -- cloned instead when the change serves only one consumer
- [ ] Checked what uses a shared EDI profile (`celigo edi-profiles dependencies <id>`) before changing its IDs or qualifiers

## Gotchas

1. **EDI profiles are per-partner, not per-document-type.** One profile covers all document types for a given partner. Search by partner name, not document type.
2. **Store a blank ISA02/ISA04 as `""` and interchange IDs unpadded; inbound transaction records show the IDs padded.** Parsing checks the file's ISA01–ISA04 and ISA06/ISA08 against the profile, trimming the file's values but not the profile's. A profile holding `" "` or ten spaces for `isa02`/`isa04` (as some connector forms prescribe), or an ID padded to 15 characters, fails every inbound file with 422 "... doesn't match with the expected data in the EDI profile". Use `""` for `isa02`/`isa04` when ISA01/ISA03 are `00`. Generating, the X12 generator pads each ISA element to the `maxLength` the generate definition gives it (an empty ISA02/ISA04 only while those elements keep their standard names, "Authorization Information" and "Security Information"). Without it, `""` comes out empty and an ID as short as it is, and Celigo's own parser rejects that ISA: check that a generated sample's ISA is 106 characters, terminator included, before the first send. Inbound transaction records keep ISA06/ISA08 as received, padded to 15 characters; outbound records store the configured ID unpadded. Trim before comparing.
3. **`fileType` and `globalId` are immutable after creation.** Create a new resource if you need a different standard or template.
4. **File definitions differ by trading partner.** Two partners' 850s can have different structures. Always use the correct partner-specific definition.
5. **Inbound vs outbound definitions are different.** Parsing and generation rules for the same document type are not interchangeable.
6. **Do not set `file.type: "filedefinition"` without a valid `_fileDefinitionId`.** Create without the `file` property and link afterward.
7. **FTP/AS2 exports must not use `type: "blob"` for EDI.** Blob mode skips parsing -- omit the `type` field so the file definition parser runs.
8. **`controlNumber` auto-increments.** Don't reset unless the partner requires it; duplicates cause rejections.
9. **997 FAs** are tracked per-transaction via `faStatus`. Generate them with a separate listener-sourced acknowledgement flow wired through the inbound export's `_postParseListenerId` -- no flag on the export emits them by itself.
10. **EDI transactions require an EDI license.** `edi-transactions list` only works for accounts with B2B Manager enabled.
11. **`skipEDIValidation` / `skipEDIProfileValidation` are escape hatches, not defaults.** They skip validation against the standard and against the linked profile, respectively. Prefer fixing the rules or the profile; reach for them only when partner non-conformance is confirmed, acknowledged, and won't be fixed on their side.
12. **Never hand-build an EDI file definition when a template exists.** Start from the matching global template (same document type and direction), which the user adds from the UI's catalog, or from an existing definition of the same type, and customize. A file definition is only a valid base for the same transaction set type -- an 850 for another 850, never an 860 for an 850.
13. **Functional acknowledgements are file definitions.** `997` (X12) and `CONTRL` (EDIFACT) are file definitions with `documentType` set, typically wired in both directions -- generate one for each interchange received, parse the ones the partner returns.
14. **File definitions are shared resources -- an edit hits every referencing step.** Several exports/imports can point at the same definition (a partner's inbound 850 export and a re-process flow, or many flows generating one house format). If the change corrects the grammar for everyone (companion-guide update, mis-declared segment), edit in place. If it serves one consumer (a one-partner variant), clone the definition, modify the clone, and re-link only that step. Check what references the definition (`celigo file-definitions dependencies <id>`) before editing or deleting.
15. **A marker-less CSV is not a file-definition job.** The structured file parser expects a literal row-type marker on every row (`HDR`/`LIN`, `A`/`B`), fixed-width slices, or EDI envelopes -- feeding it a plain same-column CSV parses wrong, typically collapsing everything into a single record. Plain CSV/TSV belongs to the step's `file.csv` options (`hasHeaderRow`, delimiters); JSON, XML, and XLSX belong to step-level parser config, never a file definition.
16. **An AS2 connection's `partnerId` is permanent.** It can't be changed after the connection is created: an update with a different value is silently ignored. A trading partner connector's placeholder partner ID copied onto a connection stays there for good, so link the connector instead of copying its values (step 3), and create an AS2 connection only once you have the partner's real AS2 ID. A wrong one means a new connection, then moving each flow's steps to it (`celigo flows replace-connection <flowId> <oldConnectionId> <newConnectionId>`).
17. **An EDI profile is shared like a file definition.** An ID or qualifier change hits every step that uses the profile at once, and inbound files fail validation until the partner actually sends the new values. Check what uses the profile (`celigo edi-profiles dependencies <id>`) and time identity changes to the partner's cutover.
18. **Only an elements-less container repeats.** A row rule repeats only inside a `container: true` wrapper that has a group `name`, a `maxOccurrence` above 1 and no `elements` key, with the row marker on its child rule. A marker rule outside such a wrapper, or inside one whose `maxOccurrence` is 1 or unset (the default), matches one row: a fixed-width or delimited file drops the rest without an error, and an X12 parse fails at the next row (`Mandatory segment "SE" is missing on line: <n>`). `container: true` on a rule that has elements isn't a loop. Keep the marker element's `name` equal to its `value`, and give header and detail rows their own levels: a renamed marker, or one container holding mixed row types, parses to an empty record with no error. A save checks almost none of this (it refuses only `maxOccurrence: 0` and duplicate element names in one rule), so parse a sample after every rules edit.
19. **The standard has three spellings.** Transaction queries, FA details and FA status updates take `X12` / `EDIFACT`; profiles take `edix12` / `edifact` (a profile created with `X12` is refused: 422 "X12 is not a valid file type"); file definitions take `format: "delimited/x12"` / `"delimited/edifact"`. A document type is a code such as `850` or `ORDERS`, never `X12`.

## Common Errors

Parse and generate messages as the stateless `processors parse edi` / `generate edi` calls return them.

| Error | Cause | Fix |
|---|---|---|
| 422 `<element> with data <value> in the EDI file doesn't match with the expected data in the EDI profile.` | The profile's value for that envelope element differs from the file's: `isa02`/`isa04` holding spaces, an interchange ID stored padded or wrong, or `isa01`–`isa04` missing | `""` for a blank ISA02/ISA04, IDs unpadded, the other values copied from the file ([gotcha 2](#gotchas)) |
| 422 `Mandatory segment "<segment>" is missing on line: <n>` | The file lacks that segment, or the row on line `<n>` repeats a segment the rules don't let repeat: outside a container, or under one whose `maxOccurrence` is 1 or unset | Wrap the repeating row's rule in an elements-less container with `maxOccurrence` above 1 ([gotcha 18](#gotchas)) |
| 422 `Max no. of occurrences for segment "<name>" is applicable only if it is a container/loop.` | `maxOccurrence` above 1 on a rule that has elements | Move it to an elements-less `container: true` wrapper |
| 422 `Cannot read properties of undefined (reading 'name')` | A rule with `elements: []` | Omit `elements` on a wrapper rule |
| 422 `Sibling element names need to be unique. Duplicate "<name>" found in elements: [<i>, <j>]` (save or parse) | Two elements in one rule share a `name`, such as both ID qualifiers named "Interchange ID Qualifier" | Give each a distinct name |
| 422 `Required rule must have the respective row in the source file` | `delimited.rowDelimiter` doesn't match how the file ends segments, or a trailing line break meets a required rule | `~\n` (or `~\r\n`) as the row delimiter; `skipIntermittentEmptyLines: true` (step 5) |
| 422 `Min. length not met for the field "ISA06"` | A short envelope element, typically an unpadded ID from a generate definition without `maxLength` | Give the generate definition's ISA elements a `maxLength` ([gotcha 2](#gotchas)) |
| 422 `Max. length not met for the field "<name>"` (generate) | A value longer than the element's `maxLength`, such as a parse definition's literal `ISA01` values used to generate | Generate with a generate definition |
| 422 `X12 is not a valid file type` | A profile created with the transaction spelling of the standard | `fileType: "edix12"` or `"edifact"` ([gotcha 19](#gotchas)) |
| 422 `not_supported` "Aggregation is not supported for EDI files, please set skipAggregation to true in Imports" | An outbound EDI import without the page/key aggregation pair | `"page"` with `skipAggregation: true`, or `"key"` with `false` (step 6) |
| 422 `global_id_not_provided` / `invalid_global_id` | An X12/EDIFACT definition on an EDI-licensed account without a registry `globalId` | Copy the `globalId` of an existing definition for the same document ([Sourcing EDI Resources](#sourcing-edi-resources)) |
