---
name: configuring-guardrails
description: Configure Celigo guardrail resources -- safety and compliance checks that validate data flowing through integrations. Use when creating or editing guardrails for PII detection, content moderation, or AI-based evaluation rules.
---

<!-- TIER:1 -->

# Configuring Guardrails

A guardrail is a **safety and compliance check** applied to data flowing through a Celigo integration. Guardrails are stored as imports with `adaptorType: "GuardrailImport"` and accessed via the `/v1/imports` API, but they have a dedicated page in the Celigo UI.

Guardrails handle three concerns:

- **Data validation** -- check records against rules before they reach downstream systems (PII detection, content moderation, or custom AI-based evaluation)
- **Confidence tuning** -- control sensitivity via `confidenceThreshold` (0 to 1, default 0.7). Lower values catch more issues but increase false positives
- **PII masking** -- optionally replace detected PII values with masked output (`pii.mask: true`) so sensitive data never reaches the destination

No `_connectionId` is required unless using BYOK credentials for the `ai_agent` type. Platform-managed credentials cover most use cases.

Guardrails are used across flows, APIs, and tools.

## Guardrails Flag, They Don't Enforce

The most important runtime semantic to internalize before designing a guardrail: **a guardrail produces a verdict; it does not act on the record.** Whether a flagged record gets blocked, routed to a review queue, dropped, retried, or forwarded with the verdict attached is decided by the **parent's** routing, branching, or filter structure -- the parent being a flow, an API endpoint, or a Tool -- not by the guardrail itself. The guardrail's job ends at "here is the structured JSON verdict"; everything downstream is the parent's responsibility.

This split is deliberate. It keeps every guardrail composable across many parents (the same `Customer PII Scanner` can flag for review in one flow, block writes in an API endpoint, and gate a Tool's output in a third place), keeps each guardrail's contract narrow and testable, and keeps audit trails clean. A requirement like "block any records with PII" or "route flagged tickets to a Slack channel" is really two decisions: the guardrail's narrow check, and the parent's routing. Build the guardrail with its check; design the routing in the parent.

Nothing the guardrail returns reaches downstream steps unless the parent authors a response mapping that extracts it.

## Three Types of Guardrail

### PII Detection

Detect personally identifiable information in records. Configure which entity types to scan for (email addresses, SSNs, credit card numbers, phone numbers, etc.) and whether to mask detected values. Requires at least one entity type in `guardrail.pii.entities[]`.

### Content Moderation

Check content against harmful categories (hate speech, violence, harassment, sexual content, self-harm, illicit activity). Requires at least one category in `guardrail.moderation.categories[]`.

### AI Agent Evaluation

Use an AI model (OpenAI) to evaluate data against custom instructions. Configured via `guardrail.aiAgent` (same schema as `AiAgentImport`). Supports model selection, temperature, structured output, and reasoning. Without a BYOK connection, only platform-supported OpenAI models are available.

## Quick Reference

### Type Decision Matrix

| You need to... | Use `guardrail.type` | Configure | Read schema |
|---|---|---|---|
| Detect/mask PII (emails, SSNs, credit cards) | `pii` | `guardrail.pii.entities[]`, `guardrail.pii.mask` | [guardrail.yml](references/schemas/guardrail.yml) |
| Block harmful content (hate, violence) | `moderation` | `guardrail.moderation.categories[]` | [guardrail.yml](references/schemas/guardrail.yml) |
| Custom AI-based validation rules | `ai_agent` | `guardrail.aiAgent` (provider, model, instructions) | [guardrail.yml](references/schemas/guardrail.yml) + [aiagent.yml](references/schemas/aiagent.yml) |

### Minimum Required Fields

Every guardrail needs:

- `name` -- human-readable label
- `adaptorType` -- always `"GuardrailImport"`
- `guardrail.type` -- `"pii"`, `"moderation"`, or `"ai_agent"`
- Type-specific config -- `guardrail.pii{}`, `guardrail.moderation{}`, or `guardrail.aiAgent{}`

No `_connectionId` required unless using BYOK for `ai_agent`.

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Base fields (all imports):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **Guardrail config:** [guardrail.yml](references/schemas/guardrail.yml) -- type, confidenceThreshold, pii, moderation
- **AI agent config:** [aiagent.yml](references/schemas/aiagent.yml) -- provider, model, instructions, tools, structured output (shared with AiAgentImport)

## Related Skills

- [configuring-imports > AI Imports](../configuring-imports/SKILL.md#ai-imports) -- guardrails are a category of import; see imports for the broader context
- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- BYOK connection setup for ai_agent guardrails
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring guardrails into flow pipelines as page processors
- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- diagnosing guardrail-related failures
- [configuring-ai-agents > Quick Reference](../configuring-ai-agents/SKILL.md#quick-reference) -- AI agent imports share the same LLM plumbing; guardrails add safety constraints

<!-- TIER:2 -->

## How to Build a Guardrail

### 1. Determine the compliance requirement

What kind of check do you need? PII detection (scan for sensitive data), content moderation (block harmful content), or custom AI evaluation (apply business-specific rules)?

### 2. Check for existing guardrails

Before building from scratch, see what already exists in the account:

```bash
# List all guardrails
celigo guardrails list

# Search the account for guardrail-related resources
celigo account search "guardrail"
celigo account search "pii"
celigo account search "moderation"
```

### 3. Choose the guardrail type

Refer to the [Type Decision Matrix](#type-decision-matrix). Each type has a distinct configuration shape.

### 4. Configure type-specific settings

- **PII:** Choose entity types to detect. Start with the most common: `email_address`, `phone_number`, `credit_card_number`, `persons_name`, `us_social_security_number`. Enable `mask: true` if PII should be redacted before reaching downstream steps.
- **Moderation:** Choose categories. The core three are `hate`, `violence`, `harassment`. Add others as needed.
- **AI agent:** Write clear instructions for the model. Only OpenAI is supported for guardrails today. Without a BYOK connection, platform-supported OpenAI models are: gpt-5, gpt-5-pro, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano.

### 5. Set the confidence threshold

Default is 0.7. For stricter compliance, raise to 0.8-0.9. For broader detection with more false positives, lower to 0.4-0.5. Read the `confidenceThreshold` field in [guardrail.yml](references/schemas/guardrail.yml).

### 6. Build the guardrail JSON

Reference the [Schema Index](#schema-index). Always read [request.yml](references/schemas/request.yml) for base fields, [guardrail.yml](references/schemas/guardrail.yml) for the guardrail config, and [aiagent.yml](references/schemas/aiagent.yml) if using `ai_agent` type.

## CLI Commands

```bash
# CRUD
celigo guardrails list
celigo guardrails get <id>
celigo guardrails create < guardrail.json
celigo guardrails update <id> < guardrail.json
celigo guardrails set <id> key=value [key2=value2 ...]
celigo guardrails delete <id> [-y]

# Invoke (test a guardrail against sample data)
echo '[{"name":"John","email":"john@example.com"}]' | celigo guardrails invoke <id>

# Clone and connection management
celigo guardrails clone <id>
celigo guardrails replace-connection <id> <newConnectionId>

# Discovery
celigo guardrails list
celigo account search "guardrail"

# Debug
celigo guardrails enable-debug <id> [--duration <minutes>]
celigo guardrails disable-debug <id>
```

## Configuring Each Type in Depth

`pii` and `moderation` are **local deterministic classifiers** -- the same input always produces the same output, with no LLM call, no token cost, and no model latency. `ai_agent` is a **real LLM call per record**, with the cost and variance that implies. Prefer the cheaper type whenever the requirement fits; `ai_agent` is the catch-all, not the default:

```
pii  >  moderation  >  ai_agent
```

The three types are mutually exclusive -- a single guardrail cannot be both PII detection and moderation. When two orthogonal checks are needed, that is two guardrail steps in series, not one guardrail (see [Placement in the Parent Pipeline](#placement-in-the-parent-pipeline)). The choice is about *what* is being detected, not how the requirement is worded: a natural-language description still resolves to `pii` when it is about PII.

### PII: mask vs flag

After the entity list, the most-tuned knob on a PII guardrail is `mask`:

- **`mask: false`** (default) -- detections are flagged in the verdict; the data passes through unchanged, and downstream routing decides what to do.
- **`mask: true`** -- detections are flagged AND a redacted payload is returned under a **`masked`** field on the guardrail's response. This is **not** automatic in-place replacement -- the guardrail does not rewrite the in-flight record. For the downstream system to receive the redacted values, the parent must author a response mapping on the guardrail step that extracts `masked` back onto the record, and, for record-mode masking, a `postResponseMap` hook that overwrites the original PII fields with the masked values. A `mask: true` guardrail without that parent-side write-back still ships raw PII downstream.

Default to flag-only for review-style use cases where a reviewer needs to see the actual data. Default to `mask: true` for trust-boundary use cases -- third-party analytics, AI vendors, partner integrations, public reports -- where the destination should not see raw values even when the record passes. When in doubt and the destination is external, mask.

The `pii.entities[]` enum is broad and fixed by the platform: universal entity types (email, phone, credit card, SSN, name, address, passport, IP address, and more) plus country-specific identifiers across the US, UK, EU, India, Australia, Korea, Singapore, and others. Map the requirement to the closest enum value rather than switching to `ai_agent` when a named entity is not a perfect match.

### Moderation: categories

The `moderation.categories[]` enum is fixed. Top-level categories are `sexual`, `hate`, `harassment`, `self_harm`, `violence`, and `illicit`, each with finer sub-categories (for example `hate_threatening`, `violence_graphic`, `self_harm_intent`). Requirements are usually described in everyday vocabulary rather than enum values, so map liberally:

- "explicit", "obscene", "vulgar", "NSFW" -> `sexual` and/or `harassment`
- "abusive", "insulting", "bullying", "toxic" -> `harassment`
- "hateful", "discriminatory", "racist", "sexist" -> `hate`
- "threatening", "intimidating" -> `harassment_threatening` or `violence`
- "suicide", "self-injury" -> `self_harm`
- "drugs", "weapons", "illegal activity" -> `illicit`

Do not invent category strings; the enum is fixed. When a requirement spans multiple categories, list all of them. Switch to `ai_agent` only when the policy is genuinely domain-specific (for example flagging content that mentions a competitor by name) -- that is a business rule, not a content-safety category.

### AI Agent: natural-language rules

Pick `ai_agent` only when the check needs judgment that does not fit `pii` or `moderation`: domain-specific compliance (HIPAA, SOX, GDPR), business-policy validation (price bounds, approval thresholds, discount rules), data-quality assertions, or any "evaluate against these custom rules" framing with no `pii.entities` or `moderation.categories` analogue.

The output format is **fixed** to a specific JSON shape and is not configurable. Every `ai_agent` guardrail returns:

```json
{
  "flagged": true,
  "reasoning": "Short explanation of why."
}
```

The fixed shape is what makes the verdict consumable by the parent's routers and filters without extra parsing. Do not describe an output schema in the instructions -- the engine constrains the output itself.

The instructions are the heart of an `ai_agent` guardrail. Good instructions:

- **State the rule clearly.** For example, "flag orders where discount > 30% AND customer account age < 90 days." Do not bury the rule in prose.
- **Define both outcomes.** Say what `flagged: true` and `flagged: false` each mean, including what belongs in `reasoning` for each.
- **Show, don't just tell.** A handful of input-to-output examples -- a clear pass, a clear fail, a borderline case -- do more than a paragraph of description.
- **Handle malformed input.** For example, "if the `discount` field is missing, return `flagged: true` with reasoning 'discount field missing -- cannot evaluate.'"

Some AI-agent capabilities deliberately do not apply to guardrails: no tools (no web search, MCP, Celigo Tools, or image generation) and no image or blob output -- the output is always the fixed `{flagged, reasoning}` JSON. Wanting any of those is a sign the design is really an AI agent step followed by a guardrail, not one `ai_agent` guardrail doing both.

## Confidence Threshold

Every guardrail has a `confidenceThreshold` (0.0 to 1.0, default 0.7), the single most-tuned knob across all three types. Detections at or above the threshold are flagged; below it, they are ignored.

- **Lower threshold** (for example 0.5) -- catches more potential issues but raises the false-positive rate. Use when missing a real issue is more expensive than reviewing a false flag (compliance or safety where human review is cheap).
- **Higher threshold** (for example 0.9) -- catches fewer issues, only high-confidence ones. Use when false positives are expensive, so auto-blocking does not trip on borderline cases.
- **Default 0.7** -- the sensible middle. Most production guardrails start here and tune from data.

For `pii` and `moderation`, the threshold is interpreted by the local classifier directly. For `ai_agent`, the model is instructed to include a confidence in its verdict and the same threshold applies.

## Input Modes -- What the Guardrail Evaluates

What a guardrail evaluates is shaped by which input field the mapping populates. There are four modes:

- **`record`** -- the in-flight record as stringified JSON. Use when the check spans the structured fields together (most `pii` cases scanning multiple fields, most business-rule `ai_agent` checks).
- **`text`** -- a single string, such as a ticket body, a chat message, or a generated paragraph. Use when the check is over one body of text (most `moderation` cases, and content screening before or after an AI agent).
- **`blob`** -- file content (PDFs, images) for the classifier or model to evaluate. Useful for `pii` or `moderation` over uploaded documents. Unsupported file types fail the record.
- **`conversationHistoryId`** -- a stable identifier so an `ai_agent` guardrail can reason against prior conversation history when the policy calls for it.

Modes can mix in a single record. **Mixed mode** (`record` + `text` + `blob` together) is common when the check needs structured data plus explanatory text plus reference documents -- for example a contract-compliance guardrail evaluating an order with the contract attached. Populate multiple destinations in the mapping and the runtime stitches them together.

If no mapping is defined, the guardrail evaluates the un-mapped in-flight record as `record` by default -- fine for prototypes, less precise than mapping explicitly.

## Placement in the Parent Pipeline

Guardrails are steps in flows, API endpoints, and Tools. They run per-record, return a verdict, and the parent's downstream structure (router, filter, next-step wiring) decides what happens next. Recurring placement patterns:

- **Right after the source, before expensive processing.** Run source records through a guardrail before routing clean records onward and flagged records to a review queue -- catching bad content early avoids wasting AI agent spend on records that should not be processed.
- **Right before an AI agent step.** Protect the model from unsafe inputs before it sees them: PII scrubbing keeps customer data out of inference, moderation catches toxic prompts, and an `ai_agent` guardrail can catch prompt-injection signals.
- **Right before the destination, gating what gets written.** Run records through a PII guardrail before pushing to a third-party warehouse or partner system so nothing leaks across the trust boundary.
- **Right after an AI agent step, validating model output.** A moderation guardrail after a content-generating agent verifies the output meets safety standards before it ships.

### Running Two Guardrails in Series

When a requirement names more than one orthogonal check (for example "flag PII OR explicit content"), build two guardrails in series -- a `pii` guardrail followed by a `moderation` guardrail -- with a router that branches on either being flagged. Run cheap deterministic classifiers first (`pii` then `moderation`) and the expensive `ai_agent` last, each guardrail short-circuiting the chain by routing flagged records elsewhere. The chained pattern (`pii -> moderation -> custom policy`) is common for layered defense.

Prefer chained simple guardrails over one `ai_agent` doing everything: chaining is cheaper (zero LLM calls for the deterministic steps), more predictable, easier to debug (you know which check flagged the record), and easier to evolve. Reach for a single `ai_agent` guardrail only when the rules genuinely inter-relate -- "reject orders where discount AND customer-age trigger together" is one rule, not two.

A guardrail is one layer in a defense-in-depth approach, never the only defense for high-stakes compliance or safety -- even deterministic classifiers have false negatives. Combine guardrails with downstream filters, review queues, and platform controls such as encryption, access control, and audit logs.

<!-- TIER:3 -->

## Gotchas

1. **Guardrails are imports.** They use `adaptorType: "GuardrailImport"` and live at `/v1/imports`. The CLI `guardrails` command is a virtual view that filters by adaptor type, but the underlying API is the imports endpoint.
2. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this.
3. **BYOK model restrictions.** Without a BYOK connection, `ai_agent` guardrails are limited to platform-supported models. Setting an unsupported model returns a validation error. Add a connection first if you need a non-standard model.
4. **At least one entity or category required.** PII guardrails need at least one entry in `pii.entities[]`; moderation guardrails need at least one in `moderation.categories[]`. Empty arrays fail validation.
5. **Platform-managed credentials cover most cases.** BYOK connections are rare for guardrails. Don't add a `_connectionId` unless the user specifically needs a custom API key.
6. **Masking is off by default.** PII guardrails default to `mask: false` (flag-only mode). Set `mask: true` explicitly if detected PII should be redacted in the output.
7. **`mask: true` does not rewrite the record in place.** It returns a redacted payload under a `masked` field; the parent must author a response mapping (and a `postResponseMap` hook for record-mode masking) to write those values back onto the record. Without that parent-side write-back, raw PII still ships downstream.
8. **The verdict only propagates if the parent maps it.** Nothing the guardrail returns (`flagged`, `masked`) reaches downstream steps unless the parent authors a response mapping that extracts it -- guardrails flag, the parent enforces.
9. **`ai_agent` output shape is fixed.** Every `ai_agent` guardrail returns `{ flagged, reasoning }`. Do not specify an output schema in the instructions, and do not expect tools or image/blob output on the guardrail side.
10. **A guardrail is one layer, not the whole defense.** Even deterministic `pii` and `moderation` classifiers produce false negatives. Pair guardrails with downstream filters, review queues, and platform controls for high-stakes compliance or safety.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 `guardrail.type required` | Missing `guardrail.type` field | Set `guardrail.type` to `"pii"`, `"moderation"`, or `"ai_agent"` |
| 422 `entities required` | PII guardrail with empty entities array | Add at least one entity to `guardrail.pii.entities[]` |
| 422 `categories required` | Moderation guardrail with empty categories | Add at least one category to `guardrail.moderation.categories[]` |
| 422 `model not supported` | AI agent using unsupported model without BYOK | Use a platform-supported model or add a BYOK connection |
| 422 `adaptorType invalid` | Wrong case on adaptor type | Use exact case: `GuardrailImport` |
