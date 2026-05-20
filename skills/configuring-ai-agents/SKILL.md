---
name: configuring-ai-agents
description: Configure Celigo AI agent and guardrail imports -- LLM-powered steps that classify, extract, validate, or generate data within flows. Use when creating agent imports (OpenAI, Gemini), guardrails (PII, moderation), or configuring prompts, structured output, or BYOK connections.
---

<!-- TIER:1 -->

# Configuring AI Agents

An AI agent is an **LLM-powered import step** that processes records through an AI model instead of writing them to an external system. Records flow in, the model processes them according to instructions, and structured output flows back into the pipeline.

AI agents handle four concerns:

- **Prompt design** -- the system instruction that defines the model's behavior, goals, and constraints (up to 50 KB). The prompt receives each record as context and must produce output that downstream steps can consume
- **Structured output** -- `json_schema` output format forces the model to return data conforming to a JSON Schema, enabling reliable field extraction for mapping. `text` returns free-form responses. `blob` returns binary data (image generation)
- **Tool use** -- the model can call web search, MCP server tools, Celigo Tool resources, or image generation during processing. Tools extend the model's capabilities beyond its training data
- **Response mapping** -- extract fields from the model's response back into the record for downstream steps. Configured on the flow's `pageProcessors[]` entry, but planned when building the agent. The response is available via `_json`. Response mapping uses Transformation 1.0 syntax (extract/generate pairs)

AI agents do not require a `_connectionId` unless using BYOK (bring your own key). Without one, platform-managed credentials are used.

Used across flows, APIs, and tools.

## Two Types of AI Import

### AI Agent Imports

Invoke an LLM for classification, extraction, summarization, translation, or generation. Two providers:

- **OpenAI** (`provider: "openai"`) -- GPT models via the OpenAI Responses API. Supports reasoning effort control, structured JSON output, web search, MCP tools, Celigo Tools, and image generation.
- **Gemini** (`provider: "gemini"`) -- Google Gemini models via LiteLLM proxy. Supports thinking config, Google Search grounding, URL context, file search, MCP tools, and Celigo Tools.

### Guardrail Imports

Safety and compliance checks applied to data flowing through integrations. Three sub-types:

- **ai_agent** -- uses an AI model to evaluate data against custom instructions (reuses the same `aiAgent` config as AI Agent imports)
- **pii** -- detects and optionally masks personally identifiable information (email, SSN, credit card, etc.)
- **moderation** -- checks content against moderation categories (hate speech, violence, harassment, etc.)

Guardrails do not require a `_connectionId` unless using BYOK for the `ai_agent` sub-type.

## Quick Reference

### Adaptor Decision Matrix

| You need... | Use adaptorType | Config block | Read schema |
|---|---|---|---|
| LLM classification, extraction, generation | `AiAgentImport` | `aiAgent{}` | [aiagent.yml](references/schemas/aiagent.yml) |
| PII detection or masking | `GuardrailImport` | `guardrail{}` | [guardrail.yml](references/schemas/guardrail.yml) |
| Content moderation | `GuardrailImport` | `guardrail{}` | [guardrail.yml](references/schemas/guardrail.yml) |
| AI-based custom validation | `GuardrailImport` with `guardrail.type: "ai_agent"` | `guardrail.aiAgent{}` | [guardrail.yml](references/schemas/guardrail.yml) + [aiagent.yml](references/schemas/aiagent.yml) |

`adaptorType` is **case-sensitive**: `AiAgentImport`, not `aiagentimport`.

### Provider Decision Matrix

| Provider | Config path | Instructions field | Models | Tool types |
|---|---|---|---|---|
| OpenAI | `aiAgent.openai{}` | `openai.instructions` | `gpt-4.1-mini`, `gpt-5-mini`, `gpt-5`, `gpt-4.1`, `gpt-5-pro`, `gpt-4.1-nano` | `web_search`, `mcp`, `tool`, `image_generation` |
| Gemini | `aiAgent.litellm{}` | `litellm._overrides.gemini.systemInstruction` | `gemini/gemini-2.5-pro`, `gemini/gemini-2.5-flash` | `googleSearch`, `urlContext`, `fileSearch`, `mcp`, `tool` |

### Minimum Required Fields

**AiAgentImport:** `name`, `adaptorType: "AiAgentImport"`, `aiAgent.provider`, and provider config (`aiAgent.openai{}` or `aiAgent.litellm{}`). Instructions and model are required within the provider block.

**GuardrailImport:** `name`, `adaptorType: "GuardrailImport"`, `guardrail.type`, and the sub-type config (`guardrail.pii{}`, `guardrail.moderation{}`, or `guardrail.aiAgent{}`).

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Base fields (all imports):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **AI agent config:** [aiagent.yml](references/schemas/aiagent.yml) -- provider, model, instructions, reasoning, temperature, output format, tools
- **Guardrail config:** [guardrail.yml](references/schemas/guardrail.yml) -- PII entities, moderation categories, AI-based validation, confidence threshold

## Related Skills

- [configuring-imports > AI Imports](../configuring-imports/SKILL.md#ai-imports) -- how AI agents fit within the broader import category
- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- MCP connections for tool use, HTTP connections for BYOK
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring AI agents into flow pipelines
- [building-tools > Tool Concepts](../building-tools/SKILL.md#tool-concepts) -- building Celigo Tools that AI agents can invoke
- [writing-mappings > Response Mapping Reference](../writing-mappings/SKILL.md#response-mapping-reference-transformation-10) -- extracting fields from AI responses
- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- diagnosing AI agent failures
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- dynamic expressions in AI prompts and field values

<!-- TIER:2 -->

## How to Build an AI Agent

### 1. Determine the task

What should the AI model do with each record? Common patterns: classification (sentiment, routing), extraction (invoice parsing, address normalization), validation (business rules), generation (translations, summaries), enrichment (web search augmentation). The task determines the provider, model, output format, and whether tools are needed.

### 2. Check for existing patterns

```bash
# Search for existing AI agents in the account
celigo agents list

# Search across the entire account
celigo account search "ai agent"
celigo account search "<task keyword>"
```

### 3. Choose the provider and model

Use **OpenAI** for most tasks -- it has broader tool support and reasoning controls. Use **Gemini** when you need Google Search grounding, URL context retrieval, or file search.

Within each provider, choose the model based on the task complexity:

- **Simple tasks** (classification, routing): use smaller models (`gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-5-mini`, `gpt-5-nano`)
- **Complex tasks** (multi-step reasoning, extraction): use larger models (`gpt-4.1`, `gpt-5`, `gpt-5-pro`)
- **Cost-sensitive**: smaller models process faster and cost less

### 4. Write the instructions

The system instruction is the most important configuration. Be specific about the task, expected input shape, and desired output. Include examples for complex tasks. Set constraints for edge cases (empty fields, invalid data). Keep instructions focused on a single responsibility per agent.

### 5. Configure the output format

Three options:

- **`json_schema`** -- forces structured JSON output conforming to a schema. Use this whenever downstream steps need to map specific fields from the response. Define the schema in `output.format.jsonSchema` (OpenAI) or `responseFormat.jsonSchema` (Gemini)
- **`text`** -- free-form text response. Use for summarization, translation, or when the entire response is one field
- **`blob`** -- binary output (image generation use cases)

For `json_schema`, set `strict: true` if you need guaranteed schema conformance (slightly higher latency).

### 6. Tune parameters

- **`reasoning.effort`** (OpenAI) or **`thinkingConfig.thinkingLevel`** (Gemini) -- controls depth of reasoning. Use `"medium"` for most tasks; `"low"` for simple classification; `"high"` for complex analysis
- **`temperature`** -- `0.2` for deterministic output (data extraction, classification); `1.0+` for creative generation
- **`maxOutputTokens`** / **`maxCompletionTokens`** -- set based on expected response size. `1000` for short classifications; `5000-20000` for detailed extractions; `100000+` for long-form generation

### 7. Add tools (if needed)

Tools extend what the model can do during processing:

- **`web_search`** (OpenAI) / **`googleSearch`** (Gemini) -- search the web for current information to enrich records
- **`mcp`** -- connect to an MCP server for external tool calls. Requires an MCP connection (`_mcpConnectionId`). Optionally restrict with `allowedTools`
- **`tool`** -- invoke a Celigo Tool resource. Reference via `_toolId`. Supports per-agent `overrides`
- **`image_generation`** (OpenAI) -- generate images from text descriptions
- **`urlContext`** (Gemini) -- fetch and process URL content
- **`fileSearch`** (Gemini) -- search uploaded files

### 8. Configure BYOK (optional)

By default, AI agents use platform-managed credentials. To use your own API key, create an HTTP connection with your provider's API key and set `_connectionId` on the import, or use `celigo agents replace-connection <agentId> <connectionId>`.

### 9. Build the JSON

Read the schema files from the [Schema Index](#schema-index). Start with [request.yml](references/schemas/request.yml) for base fields, then [aiagent.yml](references/schemas/aiagent.yml) for the provider configuration block.

## How to Build a Guardrail

### 1. Choose the guardrail type

- **`pii`** -- detect (and optionally mask) personally identifiable information. Configure which entity types to scan for in `guardrail.pii.entities`
- **`moderation`** -- check content against harmful categories. Configure which categories in `guardrail.moderation.categories`
- **`ai_agent`** -- custom AI-powered validation using the same LLM configuration as AI Agent imports

### 2. Set the confidence threshold

`guardrail.confidenceThreshold` (0 to 1, default 0.7) controls sensitivity. Lower values catch more potential issues but increase false positives.

### 3. Build the JSON

Read [guardrail.yml](references/schemas/guardrail.yml) for all configuration options. For the `ai_agent` sub-type, also read [aiagent.yml](references/schemas/aiagent.yml).

## CLI Commands

```bash
# CRUD -- AI Agents
celigo agents list
celigo agents get <id>
celigo agents create < agent.json
celigo agents update <id> < agent.json
celigo agents set <id> key=value [key2=value2 ...]
celigo agents delete <id> [-y]

# Invoke (test without creating a job)
echo '[{"text":"classify this"}]' | celigo agents invoke <id>

# Clone and connection management
celigo agents clone <id>
celigo agents replace-connection <id> <newConnectionId>

# Debug
celigo agents debug-enable <id> [--duration <minutes>]
celigo agents debug-disable <id>

# CRUD -- Guardrails
celigo guardrails list
celigo guardrails get <id>
celigo guardrails create < guardrail.json
celigo guardrails update <id> < guardrail.json
celigo guardrails set <id> key=value [key2=value2 ...]
celigo guardrails delete <id> [-y]

# Invoke (test without creating a job)
echo '[{"text":"check this content"}]' | celigo guardrails invoke <id>

# Clone and connection management
celigo guardrails clone <id>
celigo guardrails replace-connection <id> <newConnectionId>

# Debug
celigo guardrails debug-enable <id> [--duration <minutes>]
celigo guardrails debug-disable <id>

# Discovery
celigo account search "<keyword>"
celigo templates search "<name>"
```

<!-- TIER:3 -->

## Pre-Submit Checklist

### Required (AI Agent)
- [ ] `adaptorType` is exactly `AiAgentImport` (case-sensitive)
- [ ] `aiAgent.provider` is set (`"openai"` or `"gemini"`)
- [ ] Instructions are set (`aiAgent.openai.instructions` or `aiAgent.litellm._overrides.gemini.systemInstruction`)
- [ ] Model is set (`aiAgent.openai.model` or `aiAgent.litellm.model`)
- [ ] If using `json_schema` output: schema is defined in `output.format.jsonSchema` (OpenAI) or `responseFormat.jsonSchema` (Gemini)

### Required (Guardrail)
- [ ] `adaptorType` is exactly `GuardrailImport` (case-sensitive)
- [ ] `guardrail.type` is set (`"ai_agent"`, `"pii"`, or `"moderation"`)
- [ ] Sub-type config is present: `guardrail.pii.entities[]` for PII, `guardrail.moderation.categories[]` for moderation, `guardrail.aiAgent{}` for AI validation

### Cross-resource consistency
- [ ] If using BYOK: `_connectionId` references a valid HTTP connection with the provider's API key
- [ ] If using MCP tools: `_mcpConnectionId` references a valid MCP connection
- [ ] If using Celigo Tools: `_toolId` references a valid Tool resource
- [ ] If response mapping needed: configured on the flow's `pageProcessors[]` entry, not on the agent itself

## Gotchas

1. **PUT erases omitted fields.** Always GET first, modify, then PUT. The `set` command handles this.
2. **OpenAI and Gemini use different config paths.** OpenAI instructions are at `aiAgent.openai.instructions`; Gemini instructions are at `aiAgent.litellm._overrides.gemini.systemInstruction`. Using the wrong path silently produces an agent with no instructions.
3. **Gemini model IDs require the `gemini/` prefix.** Use `gemini/gemini-2.5-pro`, not `gemini-2.5-pro`. Without the prefix, LiteLLM cannot route to the correct provider.
4. **`json_schema` output without a schema definition returns unpredictable JSON.** Always define `jsonSchema` when using `json_schema` output format.
5. **Response mapping is on the flow, not the agent.** AI responses are available via `_json` in the flow's `pageProcessors[]` response mapping. Putting mapping config on the agent itself has no effect.
6. **MCP tool connections must be type `mcp`.** Regular HTTP connections cannot be used as `_mcpConnectionId` even if they point to an MCP server URL.
7. **`maxOutputTokens` defaults to 1000.** For complex extractions or long-form generation, increase this or the response will be truncated silently.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 `adaptorType invalid` | Wrong case | Use `AiAgentImport` or `GuardrailImport` exactly |
| Truncated AI response | `maxOutputTokens` too low | Increase to match expected response size |
| Empty or nonsensical output | Missing or vague instructions | Write specific instructions with expected input/output format |
| `_mcpConnectionId invalid` | Wrong connection type | Use an MCP connection, not HTTP |
| `_toolId not found` | Tool resource deleted or wrong ID | Verify tool exists with `celigo tools get <id>` |
| Guardrail flags everything | `confidenceThreshold` too low | Increase threshold (e.g., 0.7 to 0.9) |
| Guardrail misses obvious PII | Missing entity types | Add all relevant entity types to `guardrail.pii.entities[]` |
