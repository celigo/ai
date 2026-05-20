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
celigo guardrails debug-enable <id> [--duration <minutes>]
celigo guardrails debug-disable <id>
```

<!-- TIER:3 -->

## Gotchas

1. **Guardrails are imports.** They use `adaptorType: "GuardrailImport"` and live at `/v1/imports`. The CLI `guardrails` command is a virtual view that filters by adaptor type, but the underlying API is the imports endpoint.
2. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this.
3. **BYOK model restrictions.** Without a BYOK connection, `ai_agent` guardrails are limited to platform-supported models. Setting an unsupported model returns a validation error. Add a connection first if you need a non-standard model.
4. **At least one entity or category required.** PII guardrails need at least one entry in `pii.entities[]`; moderation guardrails need at least one in `moderation.categories[]`. Empty arrays fail validation.
5. **Platform-managed credentials cover most cases.** BYOK connections are rare for guardrails. Don't add a `_connectionId` unless the user specifically needs a custom API key.
6. **Masking is off by default.** PII guardrails default to `mask: false` (flag-only mode). Set `mask: true` explicitly if detected PII should be redacted in the output.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 `guardrail.type required` | Missing `guardrail.type` field | Set `guardrail.type` to `"pii"`, `"moderation"`, or `"ai_agent"` |
| 422 `entities required` | PII guardrail with empty entities array | Add at least one entity to `guardrail.pii.entities[]` |
| 422 `categories required` | Moderation guardrail with empty categories | Add at least one category to `guardrail.moderation.categories[]` |
| 422 `model not supported` | AI agent using unsupported model without BYOK | Use a platform-supported model or add a BYOK connection |
| 422 `adaptorType invalid` | Wrong case on adaptor type | Use exact case: `GuardrailImport` |
