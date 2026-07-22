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
| Discover partner templates | Trading partner connector | `tp-connectors list` | [tp-connector-request.yml](references/schemas/tp-connector-request.yml) |
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
celigo tp-connectors list
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

## Document Grammar vs Partner Identity

The most important conceptual split in Celigo's EDI model:

- The **file definition** owns the *document grammar* -- the segments, elements, loops, and envelope structure of one document type (850, 810, ORDERS), one per document type **and direction**.
- The **EDI profile** owns the *partner identity* -- the interchange IDs, qualifiers, group IDs, version, and control settings that fill that envelope. One profile per trading partner, per EDI standard, no matter how many document types you exchange.

The two meet at runtime. Envelope elements in a file definition's rules don't hardcode identity values -- they carry `{{{ediProfile.…}}}` references, and the platform substitutes the values from the profile linked on the export/import (`_ediProfileId`). On **parse** (inbound), the substituted values are validated against the actual file bytes -- a mismatch fails the document with an EDI-profile validation error (an identity problem, not a grammar problem). On **generate** (outbound), the values are written into the envelope of the file being produced.

A file-based EDI step therefore needs **both** resources: the platform rejects an X12/EDIFACT file definition that has no linked profile. Sequence the profile before the exports/imports that reference it, exactly as you would a connection.

### One Profile, Both Directions

A profile is direction-agnostic. Its fields are labeled by *whose* identity they hold (`tp*` vs `my*`), not by sender/receiver position. On an inbound parse the partner is the sender, so the file definition's rules bind the sender slots to the `tp*` values and the receiver slots to `my*`; on an outbound generate the orientation flips (sender → `my*`, receiver → `tp*`). One partner profile serves the 850s coming in and the 810s going out. This is a notable asymmetry with file definitions, which come in **separate parse and generate variants** per document type -- parse rules tolerate what partners send, generate rules must produce exactly what partners require.

## Sourcing EDI Resources

### Generating an EDI Profile from a Sample File

The fastest correct path to a new profile is **not** hand-copying values out of a companion guide -- it's parsing a real file. Given a sample EDI file from the partner, the platform reads the interchange envelope (ISA/GS for X12, UNB for EDIFACT -- the standard is auto-detected from the first characters) and extracts the envelope fields into a ready-to-review profile.

- Review the extracted values before creating -- especially the usage indicator (`isa15`, `T` vs `P`) and the qualifiers -- since they reflect that one file.
- The extraction produces no `name`; supply one, favoring the partner-name convention (e.g. "Acme Corp X12").
- A file the partner *sent you* has the partner in the sender slots. When it's ambiguous, confirm which direction the sample flows -- what you receive vs what you must produce.

### Never Start EDI from Scratch -- Begin from a Template

Celigo ships a global catalog of pre-built EDI templates -- X12 and EDIFACT document definitions, many vendor-specific (per-retailer 850 variants and the like), each tagged with vendor, document type, and direction. Templates are instantiated **into** account-level file definitions, which you then customize to the partner's companion guide. Canonical sourcing order:

1. An account-level file definition of the **same document type** already exists → reuse it or use it as the base.
2. A global template matches → instantiate it into the account and customize from there.
3. Build from scratch → last resort, for documents no template covers.

**Same-type rule:** a file definition is only a valid base for the *same transaction set type*. An existing 850 is a fine starting point for another partner's 850; an 860 is **not** a starting point for an 850 -- different documents, different segment structures. Hand-building a rules tree when a template exists invites subtle mistakes in envelope close rules and element conventions.

For onboarding a **whole partner** (not just one document), prefer a trading partner connector -- it provisions the connection, export, import, and EDI profile together with the partner-specific fields the user must set (see step 1). Build individual EDI steps directly only when adding one document flow against an already-onboarded partner.

## Functional Acknowledgements (997 / CONTRL)

Functional acknowledgements -- `997` (X12) and `CONTRL` (EDIFACT) -- are how EDI parties confirm receipt of an interchange. They are **ordinary file definitions** with the `documentType` field set (`997` or `CONTRL`), not a separate resource type. Accounts exchanging EDI typically wire them in **both directions**: generate an acknowledgement for every interchange you receive, and parse the acknowledgements your partner returns for the documents you send.

The generate side can be automated on the inbound export -- set `file.faAcknowledgement: true` so the platform emits the 997/CONTRL for each parsed interchange (see step 7). Track acknowledgement state per document via `faStatus` (see Monitoring EDI Transactions).

## Strict Validation and the Skip Flags

EDI parsing validates inbound files against both the EDI standard and the linked profile. Two file-definition flags relax that:

- `skipEDIValidation` -- skip structural validation against the EDI standard.
- `skipEDIProfileValidation` -- skip validation of the envelope against the linked EDI profile.

They exist because real-world partners send files that violate the standard or mismatch the declared profile. Treat them as a pragmatic escape hatch, **not a default**: prefer fixing the rules (or the profile) so validation passes -- it catches real partner errors. Reach for the skip flags only when a partner's non-conformance is confirmed, acknowledged, and not going to be fixed on their side.

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
celigo tp-connectors list
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
celigo jobs download-files <jobId>
celigo jobs download-files <jobId> --file-id <s3Key> -o output.edi
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
- [ ] File definition sourced from a same-type template or existing definition, not hand-built from scratch
- [ ] `skipEDIValidation` / `skipEDIProfileValidation` left off unless partner non-conformance is confirmed and acknowledged
- [ ] File definition used only for marker-based, fixed-width, or EDI files -- plain same-column CSVs use the step's `file.csv` options; JSON/XML/XLSX use step-level parser config
- [ ] Checked what else references a shared file definition (`celigo account dependencies`) before editing it -- cloned instead when the change serves only one consumer

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
11. **`skipEDIValidation` / `skipEDIProfileValidation` are escape hatches, not defaults.** They skip validation against the standard and against the linked profile, respectively. Prefer fixing the rules or the profile; reach for them only when partner non-conformance is confirmed, acknowledged, and won't be fixed on their side.
12. **Never hand-build an EDI file definition when a template exists.** Instantiate the matching global template (same document type and direction) and customize. A file definition is only a valid base for the same transaction set type -- an 850 for another 850, never an 860 for an 850.
13. **Functional acknowledgements are file definitions.** `997` (X12) and `CONTRL` (EDIFACT) are file definitions with `documentType` set, typically wired in both directions -- generate one for each interchange received, parse the ones the partner returns.
14. **File definitions are shared resources -- an edit hits every referencing step.** Several exports/imports can point at the same definition (a partner's inbound 850 export and a re-process flow, or many flows generating one house format). If the change corrects the grammar for everyone (companion-guide update, mis-declared segment), edit in place. If it serves one consumer (a one-partner variant), clone the definition, modify the clone, and re-link only that step. Check what references the definition (`celigo account dependencies`) before editing or deleting.
15. **A marker-less CSV is not a file-definition job.** The structured file parser expects a literal row-type marker on every row (`HDR`/`LIN`, `A`/`B`), fixed-width slices, or EDI envelopes -- feeding it a plain same-column CSV parses wrong, typically collapsing everything into a single record. Plain CSV/TSV belongs to the step's `file.csv` options (`hasHeaderRow`, delimiters); JSON, XML, and XLSX belong to step-level parser config, never a file definition.
