---
name: building-b2b
description: Build Celigo B2B Manager EDI integrations -- trading partner onboarding, EDI profiles, file definitions, X12/EDIFACT flow patterns, and transaction monitoring. Use when onboarding partners, editing EDI flows, setting up parsing rules, or monitoring document exchange.
---

<!-- TIER:1 -->

# Building B2B / EDI Integrations

B2B Manager is Celigo's EDI hub for exchanging structured business documents with trading partners. It handles X12 (ANSI) and EDIFACT (UN) standards over FTP, AS2, and VAN connections.

An EDI integration has these Celigo-specific components:

- **Trading partner connector** -- a pre-built template (590+) defining the connection type, EDI profile defaults, and export/import field requirements for a specific trading partner
- **EDI profile** -- interchange envelope settings (ISA/GS for X12, UNB for EDIFACT) that identify sender/receiver and control document versioning
- **File definition** -- parsing and generation rules that describe the segment/element structure of a specific EDI document type (e.g. Costco 850, Walmart 856)
- **Connection** -- FTP, AS2, or VAN credentials for the trading partner's EDI endpoint
- **Exports and imports** -- file-based data sources/destinations that use file definitions to parse inbound EDI or generate outbound EDI
- **Flows** -- pipelines wiring exports and imports together with transformations

## EDI Standards

**X12 (ANSI ASC X12)** -- North American standard. Documents are **transaction sets** identified by 3-digit codes (850 = PO, 810 = Invoice, 856 = ASN, 997 = FA, 855 = PO Ack, 846 = Inventory, 860 = PO Change). 50+ additional types supported including healthcare (834/835/837), transportation (204/210/214), and supply chain (753/843/861). Envelope: ISA → GS → ST → segments → SE → GE → IEA. Versions: 4010, 5010, 4030, etc.

**EDIFACT (UN/EDIFACT)** -- International standard. Documents are **messages** identified by 6-letter codes (ORDERS, INVOIC, DESADV, ORDRSP, RECADV, INVRPT, PRICAT, CONTRL). Additional messages: INSDES, OSTRPT, PARTIN, DELJIT, PRODAT, DELFOR, SLSRPT. Envelope: UNB → UNH → segments → UNT → UNZ. Versions: D93A, D96A, D01B, etc.

## Quick Reference

### Resource Decision Matrix

| Task | Resource | CLI command | Schema |
|---|---|---|---|
| Discover partner templates | Trading partner connector | `tp-connectors search` | [tp-connector-request.yml](references/schemas/tp-connector-request.yml) |
| Define interchange envelope | EDI profile | `edi-profiles create` | [edi-profile-request.yml](references/schemas/edi-profile-request.yml) |
| Define document parsing/generation | File definition | `file-definitions create` | [file-definition-request.yml](references/schemas/file-definition-request.yml) |
| Monitor document exchange | EDI transaction | `edi-transactions list` | [edi-transaction.yml](references/schemas/edi-transaction.yml) |
| Connect to partner endpoint | Connection (FTP/AS2/VAN) | `connections create` | See configuring-connections |

### Minimum Required Fields

| Resource | Required |
|---|---|
| EDI profile (X12) | `name`, `fileType: "edix12"`, `tpInterchangeId`, `myInterchangeId`, `tpIdQualifier`, `myIdQualifier`, `tpGroupId`, `myGroupId`, `isa12` (version), `gs07`, `gs08` |
| EDI profile (EDIFACT) | `name`, `fileType: "edifact"`, `unb010_0001`, `unb010_0002`, `versionNumber`, `releaseNumber`, `controllingAgency` |
| File definition | `name`, `version: "2"`, `format` (e.g. `delimited/x12`), `delimited` block (rowSuffix, colDelimiter), `rules[]` |

### Schema Index

- [edi-profile-request.yml](references/schemas/edi-profile-request.yml) -- X12 ISA/GS and EDIFACT UNB fields
- [file-definition-request.yml](references/schemas/file-definition-request.yml) -- format, delimiters, rules structure
- [edi-transaction.yml](references/schemas/edi-transaction.yml) -- transaction query response shape
- [tp-connector-request.yml](references/schemas/tp-connector-request.yml) -- connector and supportedBy sections
- [tp-supported-by-section.yml](references/schemas/tp-supported-by-section.yml) -- connection, profile, export/import pre-configuration

## Related Skills

- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- FTP, AS2, and VAN connection types for trading partner endpoints
- [configuring-exports > Quick Reference](../configuring-exports/SKILL.md#quick-reference) -- file-based exports that parse inbound EDI using file definitions
- [configuring-imports > Quick Reference](../configuring-imports/SKILL.md#quick-reference) -- file-based imports that generate outbound EDI using file definitions
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring EDI exports and imports into flow pipelines
- [writing-scripts > Quick Reference](../writing-scripts/SKILL.md#quick-reference) -- preSavePage/postMap hooks for EDI record transformation and validation

<!-- TIER:2 -->

## How to Build an EDI Integration

### 1. Find the trading partner connector

Trading partner connectors are pre-built templates (590+) that define connection type, EDI profile defaults, and export/import config for a specific partner.

```bash
celigo tp-connectors search "costco"
celigo tp-connectors get <connectorId>
```

The connector's `supportedBy` object tells you what's pre-configured and what the user must provide for the connection, EDI profile, and exports/imports. See [tp-supported-by-section.yml](references/schemas/tp-supported-by-section.yml) for the full structure.

If no connector exists, build the connection, EDI profile, and file definitions from scratch.

### 2. Check for existing resources

Before creating anything, check what the account already has. EDI profiles are per-partner (one profile covers all document types), so duplicates waste control number sequences.

```bash
celigo account search "<partner-name>"
celigo edi-profiles list | grep -i "<partner-name>"
celigo file-definitions list | grep -i "<partner-name>"
celigo connections list | grep -i "<partner-name>"
```

### 3. Create the connection

Create an FTP, AS2, or VAN connection for the trading partner. Use the connector's `supportedBy.connection` for pre-configured fields. See [configuring-connections](../configuring-connections/SKILL.md) for full connection setup.

```bash
celigo connections create < connection.json
celigo connections ping <connectionId>
```

### 4. Create the EDI profile

The EDI profile defines the interchange envelope -- ISA/GS segments (X12) or UNB segment (EDIFACT). Read [edi-profile-request.yml](references/schemas/edi-profile-request.yml) for all fields.

Key X12 fields: `tpInterchangeId`/`myInterchangeId` (ISA06/ISA08), `tpIdQualifier`/`myIdQualifier` (ISA05/ISA07, e.g. ZZ = mutually defined), `isa12` (version, e.g. 00401), `isa15` (P = production, T = test), `controlNumber` (auto-incremented).

```bash
celigo edi-profiles create < profile.json
```

### 5. Create file definitions

Each document type (850, 810, 856, etc.) needs its own file definition with parsing/generation rules. Read [file-definition-request.yml](references/schemas/file-definition-request.yml) for the rules structure.

Key fields: `format` (`delimited/x12` or `delimited/edifact`), `globalId` (standard template reference, immutable), `delimited.rowSuffix` (segment terminator, `~` for X12), `delimited.colDelimiter` (element separator, `*` for X12), `rules[]` (hierarchical segment/element tree).

```bash
celigo file-definitions create < filedef.json
```

### 6. Create exports and imports

**Inbound EDI export** (reading from FTP/AS2): `adaptorType: "FTPExport"`, `file.type: "filedefinition"`, `file.fileDefinition._fileDefinitionId`, `_ediProfileId`, `ftp.directoryPath`.

**Outbound EDI import** (writing to FTP/AS2): `adaptorType: "FTPImport"`, same file definition and profile references.

See [configuring-exports](../configuring-exports/SKILL.md) and [configuring-imports](../configuring-imports/SKILL.md) for full field schemas.

### 7. Wire into flows

Typical patterns:

- **Inbound:** FTP export (parse EDI) → transform EDI fields to ERP → ERP import
- **Outbound:** ERP export → transform to EDI → FTP import (generate EDI)
- **997 FA:** auto-generate from `file.faAcknowledgement: true` on the inbound export

See [building-flows](../building-flows/SKILL.md) for scheduling, chaining, and error management.

## Monitoring EDI Transactions

B2B Manager tracks every EDI document processed. Key transaction fields: `documentType`, `documentNumber`, `direction` (Inbound/Outbound), `faStatus` (inProgress/notApplicable/notReceived/received/rejected), `controlNumber`, `s3Key`/`_flowJobId` (for raw file download).

```bash
celigo edi-transactions list
celigo edi-transactions list --file-type EDIFACT
celigo edi-transactions list --start-date 2026-01-01 --end-date 2026-01-31
```

## CLI Commands

### EDI Profiles
```bash
celigo edi-profiles list
celigo edi-profiles get <id>
celigo edi-profiles create < profile.json
celigo edi-profiles update <id> < profile.json
celigo edi-profiles set <id> <key>=<value> [<key2>=<value2> ...]
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
celigo tp-connectors search "<name>"
```

### EDI Transactions
```bash
celigo edi-transactions list
celigo edi-transactions list --file-type EDIFACT
celigo edi-transactions list --start-date <date> --end-date <date>
celigo edi-transactions list --limit <n>
```

### Downloading EDI Files
```bash
celigo jobs files <jobId>
celigo jobs download <jobId> --file-id <s3Key> -o output.edi
```

<!-- TIER:3 -->

## Pre-Submit Checklist

- [ ] EDI profile uses correct `fileType` (`edix12` or `edifact`) -- immutable after creation
- [ ] ISA IDs padded correctly (15 chars, right-padded with spaces)
- [ ] File definition `format` matches standard (`delimited/x12` or `delimited/edifact`)
- [ ] File definition `globalId` references the correct standard template -- immutable after creation
- [ ] Inbound exports do NOT use `type: "blob"` (skips parsing)
- [ ] `controlNumber` starts at 1 unless the partner requires a specific sequence
- [ ] Exports/imports reference both `_fileDefinitionId` and `_ediProfileId`

## Gotchas

1. **EDI profiles are per-partner, not per-document-type.** One profile covers all document types for a given partner. Search by partner name, not document type.
2. **ISA IDs are right-padded to 15 characters.** The API returns them padded; trimming is the caller's responsibility.
3. **`fileType` and `globalId` are immutable after creation.** Create a new resource if you need a different standard or template.
4. **File definitions differ by trading partner.** A Costco 850 and a Walmart 850 have different structures. Always use the correct partner-specific definition.
5. **Inbound vs outbound definitions are different.** Parsing and generation rules for the same document type are not interchangeable.
6. **Do not set `file.type: "filedefinition"` without a valid `_fileDefinitionId`.** Create without the `file` property and link afterward.
7. **FTP/AS2 exports must not use `type: "blob"` for EDI.** Blob mode skips parsing -- omit the `type` field so the file definition parser runs.
8. **`controlNumber` auto-increments.** Don't reset unless the partner requires it; duplicates cause rejections.
9. **997 FAs** are tracked per-transaction via `faStatus`. Auto-generate with `file.faAcknowledgement: true` on the inbound export.
10. **EDI transactions require an EDI license.** `edi-transactions list` only works for accounts with B2B Manager enabled.
