---
name: configuring-ai-agents
description: Configure Celigo AI agent and guardrail imports -- LLM-powered steps that classify, extract, validate, or generate data within flows. Use when creating agent imports on any supported model provider, guardrails (PII, moderation), or configuring prompts, structured output, or BYOK connections.
---

<!-- TIER:1 -->

# Configuring AI Agents

An AI agent is an **LLM-powered import step** that processes records through an AI model instead of writing them to an external system. Records flow in, the model processes them according to instructions, and structured output flows back into the pipeline.

AI agents handle four concerns:

- **Prompt design** -- the system instruction that defines the model's behavior, goals, and constraints (up to 50 KB). The prompt receives each record as context and must produce output that downstream steps can consume
- **Structured output** -- `json_schema` output format forces the model to return data conforming to a JSON Schema, enabling reliable field extraction for mapping. `text` returns free-form responses. `blob` returns binary data (image generation)
- **Tool use** -- the model can call web search, MCP server tools, Celigo Tool resources, or image generation during processing. Tools extend the model's capabilities beyond its training data
- **Response mapping** -- extract fields from the model's response back into the record for downstream steps. Configured on the flow's `pageProcessors[]` entry, but planned when building the agent. The response is available via `_json`. Response mapping uses Transformation 1.0 syntax (extract/generate pairs)

AI agents do not require a `_connectionId` unless using BYOK (bring your own key). Without one, built-in providers use platform-managed credentials; catalog providers are BYOK-only and require one.

Used across flows, APIs, and tools.

## Two Types of AI Import

### AI Agent Imports

Invoke an LLM for classification, extraction, summarization, translation, or generation. `aiAgent.provider` takes any value in the enum in [aiagent.yml](references/schemas/aiagent.yml), and providers come in two families with different config formats:

- **Built-in providers** -- each has its own config block and runs on Celigo AI or BYOK credentials:
  - **OpenAI** (`provider: "openai"`) -- GPT models via the OpenAI Responses API, configured in `aiAgent.openai{}`. Supports reasoning effort control, structured JSON output, web search, MCP tools, Celigo Tools, and image generation.
  - **LiteLLM-backed providers** such as Gemini (`provider: "gemini"`) and Anthropic Claude (`provider: "anthropic"`) -- configured in `aiAgent.litellm{}`, with provider-specific settings under `litellm._overrides.<provider>`. Gemini adds Google Search grounding, URL context, and file search.
- **Catalog providers** -- the rest of the enum. They share a generic flat format (`model`, `modelOptions`, `instructions`, `output`, and the tool arrays directly on `aiAgent`) and are **BYOK-only**: saving one without a `_connectionId` fails with 422 `connection_required`.

The provider decides the format -- a block that doesn't match fails the save with 422 `invalid_provider_config_format`.

### Guardrail Imports

Safety and compliance checks applied to data flowing through integrations. Three sub-types:

- **ai_agent** -- uses an AI model to evaluate data against custom instructions (reuses the same `aiAgent` config as AI Agent imports)
- **pii** -- detects and optionally masks personally identifiable information (email, SSN, credit card, etc.)
- **moderation** -- checks content against moderation categories (hate speech, violence, harassment, etc.)

Guardrails do not require a `_connectionId` unless using BYOK for the `ai_agent` sub-type.

**AI agent vs guardrail:** pick by what the LLM produces. A guardrail renders a fixed **verdict** (`flagged: true|false` plus reasoning) that the parent's routing branches on -- reach for it when the user says "verify / check / validate / flag / screen". An AI agent step does **work** whose output flows onward as data -- reach for it when the user says "classify / extract / generate / summarize / decide". Guardrails flag; they never block on their own -- the parent flow/API/tool decides what happens to flagged records (see [configuring-guardrails](../configuring-guardrails/SKILL.md)).

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

| Provider | Config path | Instructions field | Model field | Credentials |
|---|---|---|---|---|
| `openai` | `aiAgent.openai{}` | `openai.instructions` | `openai.model` | Celigo AI or BYOK |
| `gemini`, `anthropic` | `aiAgent.litellm{}` (+ `litellm._overrides.<provider>`) | `litellm._overrides.<provider>.systemInstruction` | `litellm.model` -- Gemini ids are stored without a `gemini/` prefix | Celigo AI or BYOK |
| Catalog providers (the rest of the enum) | Flat on `aiAgent` | `aiAgent.instructions` | `aiAgent.model` | BYOK only |

Model fields are open strings -- [aiagent.yml](references/schemas/aiagent.yml) carries current examples -- and each block's `tools[].type` enum lists the tool types that provider supports.

### Minimum Required Fields

**AiAgentImport:** `name`, `adaptorType: "AiAgentImport"`, `aiAgent.provider`, and the provider's config (`aiAgent.openai{}`, `aiAgent.litellm{}`, or the flat catalog format). Instructions and model are required within it; catalog providers also need `_connectionId`.

**GuardrailImport:** `name`, `adaptorType: "GuardrailImport"`, `guardrail.type`, and the sub-type config (`guardrail.pii{}`, `guardrail.moderation{}`, or `guardrail.aiAgent{}`).

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Base fields (all imports):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **AI agent config:** [aiagent.yml](references/schemas/aiagent.yml) -- provider, model, instructions, reasoning, temperature, output format, tools
- **Guardrail config:** [guardrail.yml](references/schemas/guardrail.yml) -- PII entities, moderation categories, AI-based validation, confidence threshold

### Input Fields

An AI agent step receives an in-flight record and maps parts of it into one of four input fields. The mapping destination dropdown shows exactly these four -- no more:

| Field | Type | Purpose |
|---|---|---|
| `text` | string | Free text for the model to reason over. The most common input |
| `record` | object or array | The full structured record (or part of it) as JSON. Use when the model needs to see multiple fields together |
| `files` | array of `{ name, blobKey }` | File references. Which types the model can read depends on the account's document-processing setting (below the table) |
| `conversationHistoryId` | string | Stable per-conversation identifier that retains and replays history across runs (see [Conversation History](#conversation-history)) |

If no input mapping is defined, the agent receives the un-mapped in-flight record as `record` by default.

What `files` can read depends on the account's **Intelligent document processing** setting (My Account > Company > AI settings). It's off by default and account-wide; only an owner or administrator can change it, in the UI; and an API token can't read it, so ask the user. With it off, the model's own file support decides: PDFs, PNG, JPG and WEBP images, and text are supported, and other types can fail the record (TIFF does). With it on, Celigo extracts text and tables from PDFs, scans and office files before the model sees them, and charges the extraction in AI credits.

### Output Formats

The output format determines both what the model returns and which response variable carries it into response mapping:

| Format | Response variable | Use for |
|---|---|---|
| `text` | `_text` | Free-form text -- summaries, generated content, classifications parsed downstream |
| `json_schema` | `_json` | Structured JSON conforming to a schema. Use when downstream steps need consistent fields. With `strict: true`, non-conforming outputs fail rather than pass through |
| `blob` | `blobKey` | Binary content stored in Celigo blob storage that downstream steps fetch or forward. Used for image generation |

The response-mapping dropdown only shows the response field the chosen output format can produce.

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

Decide, too, which records need the model at all. An input filter on the agent step (`filter`, as on any import; see [configuring-filters](../configuring-filters/SKILL.md#import-filter-import-filter)) skips the model for the rest, and it is the cheapest cost control. Skipped records still continue down the flow with the agent's response-mapped fields empty, so give every later step that writes those fields its own filter, such as `["notempty", ["string", ["extract", "ai_category"]]]`.

### 2. Check for existing patterns

```bash
# Search for existing AI agents in the account
celigo ai-agents list

# Search across the entire account
celigo account search "ai agent"
celigo account search "<task keyword>"
```

### 3. Choose the provider and model

Use **OpenAI** for most tasks -- it has broader tool support and reasoning controls. Use **Gemini** when you need Google Search grounding, URL context retrieval, or file search, and **Anthropic** when the user wants Claude. Use a catalog provider only when the user brings that vendor's API key.

Within each provider, choose the model based on the task complexity:

- **Simple tasks** (classification, routing): use the provider's smaller, faster models
- **Complex tasks** (multi-step reasoning, extraction): use its larger models
- **Cost-sensitive**: smaller models process faster and cost less

On Celigo AI (no BYOK connection) the model must be one the platform hosts for that provider. The save doesn't check this: an unhosted model saves, and the agent's first run fails with 422 `invalid_model`, whose message lists the hosted models. Don't pick model names from memory -- check the examples in [aiagent.yml](references/schemas/aiagent.yml), an existing working agent, or that error message.

### 4. Write the instructions

The system instruction is the most important configuration. Be specific about the task, expected input shape, and desired output. Include examples for complex tasks. Set constraints for edge cases (empty fields, invalid data). Keep instructions focused on a single responsibility per agent.

### 5. Configure the output format

Three options:

- **`json_schema`** -- forces structured JSON output conforming to a schema. Use this whenever downstream steps need to map specific fields from the response. Define the schema in `output.format.jsonSchema` (OpenAI) or `litellm.responseFormat.jsonSchema` (LiteLLM providers)
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

By default, AI agents use platform-managed credentials. To use your own API key, create an HTTP connection with your provider's API key and set `_connectionId` on the import, or use `celigo ai-agents replace-connection <agentId> <connectionId>`.

### 9. Build the JSON

Read the schema files from the [Schema Index](#schema-index). Start with [request.yml](references/schemas/request.yml) for base fields, then [aiagent.yml](references/schemas/aiagent.yml) for the provider configuration block.

## Celigo AI vs BYOK

Cutting across the built-in providers is a second decision: run the agent on **Celigo AI** (platform-managed credentials) or **BYOK** (bring your own key). Catalog providers have no Celigo AI option -- they are always BYOK.

- **Celigo AI** -- no API key to manage. The trade is restriction: model choice is limited to the models the platform hosts for each provider (the `invalid_model` error message lists them), and usage counts against the account's monthly AI token quota
- **BYOK** -- the agent uses your own API key (configured on a connection; see step 8 above). Any model the provider supports is available -- new releases, fine-tuned models, models off Celigo's curated list -- and quota and rate limiting move to your provider account

Default to **Celigo AI** for prototyping, low-volume agents, and agents happy with the curated model list. Reach for **BYOK** when you need a model that isn't on the list, when volume would exceed the monthly token quota, or when you want costs to land on your existing AI vendor billing.

Switching between Celigo AI and BYOK -- or changing the model -- can drop configuration that no longer applies: `serviceTier` is BYOK-only, `reasoning.effort` applies only to reasoning-capable models, and image modalities apply only to image-capable Gemini models. It is not a one-knob change.

## Conversation History

By default, AI agent steps are **stateless** -- each record is its own conversation and the agent has no memory of previous records. This keeps behavior reproducible and cost predictable.

To make an agent **stateful**, map a stable per-conversation identifier into its `conversationHistoryId` input field -- a Slack thread ID, session UUID, customer ID, or ticket number, whatever is unique per conversation. Celigo retains the conversation history for that identifier and replays it on subsequent calls, so the agent sees prior turns. Mapping `record.slack_thread_id`, for example, makes every reply in a Slack thread aware of the earlier messages.

The identifier is scoped **per user and per agent**: the same string used by two different agents is two separate conversations, and the same agent used by two different users is two separate conversations. The retained history is not accessible through public APIs or the UI -- it exists for the model to read, not for users to browse -- and idle conversations age out via a TTL that resets on each update.

## Capability Check Before Building

Before building an agent, walk through each action the requirement says the agent should perform and confirm each one maps to a capability the agent will actually have at runtime. The goal is to surface gaps early, not to refuse capabilities.

Capabilities come from three places:

- **Native to the chosen model** -- OpenAI's `web_search` and `image_generation`; Gemini's `googleSearch`, `urlContext`, `fileSearch`, and image-modality output
- **Tools wired into the agent** -- `mcp` tools and Celigo Tools
- **Downstream steps in the parent** -- rendering output, writing to a destination, notifying a recipient (same shape whether the parent is a flow, API endpoint, or Tool)

For each action, ask which of the three covers it; if none do, that is a gap to raise before building. A common example is "generate a PDF invoice": no provider ships PDF rendering as a native capability, so the right shape is the agent emitting structured invoice content (`json_schema` output) with a downstream step or Celigo Tool rendering the PDF. Equally, don't enable capabilities the requirement didn't ask for -- "classify support tickets" needs text classification (native), not `web_search` "just in case."

## How to Build a Guardrail

### 1. Choose the guardrail type

- **`pii`** -- detect (and optionally mask) personally identifiable information. Configure which entity types to scan for in `guardrail.pii.entities`. Note: `mask: true` returns the redacted payload under a `masked` response field -- downstream steps only see it if you author a response-mapping write-back (see [configuring-guardrails > PII: mask vs flag](../configuring-guardrails/SKILL.md#pii-mask-vs-flag))
- **`moderation`** -- check content against harmful categories. Configure which categories in `guardrail.moderation.categories`
- **`ai_agent`** -- custom AI-powered validation using the same LLM configuration as AI Agent imports

### 2. Set the confidence threshold

`guardrail.confidenceThreshold` (0 to 1, default 0.7) controls sensitivity. Lower values catch more potential issues but increase false positives.

### 3. Build the JSON

Read [guardrail.yml](references/schemas/guardrail.yml) for all configuration options. For the `ai_agent` sub-type, also read [aiagent.yml](references/schemas/aiagent.yml).

## CLI Commands

Invoking a saved agent, or previewing an agent document (`invoke` with no id, given `{"import": <agent document>, "data": [records]}`), creates no job, but it is a real run: the model is called and billed (in AI credits on Celigo AI; the key's owner pays on BYOK), and its tools (MCP servers, Celigo Tools, web search) act for real. Invoke an agent whose tools can write only with the user's go-ahead. To test the flow around it without calling the model, give the agent a `mockResponse` and test-run the flow (`celigo flows test-run <flowId> --export <exportId>`).

```bash
# CRUD -- AI Agents
celigo ai-agents list
celigo ai-agents get <id>
celigo ai-agents create < agent.json
celigo ai-agents update <id> < agent.json
celigo ai-agents set <id> key=value [key2=value2 ...]
celigo ai-agents delete <id> [-y]

# Invoke: no job, but a real, billed run whose tools act
echo '[{"text":"classify this"}]' | celigo ai-agents invoke <id>

# Clone and connection management
celigo ai-agents clone <id>
celigo ai-agents replace-connection <id> <newConnectionId>

# Debug
celigo ai-agents enable-debug <id> [--duration <minutes>]
celigo ai-agents disable-debug <id>

# CRUD -- Guardrails
celigo guardrails list
celigo guardrails get <id>
celigo guardrails create < guardrail.json
celigo guardrails update <id> < guardrail.json
celigo guardrails set <id> key=value [key2=value2 ...]
celigo guardrails delete <id> [-y]

# Invoke: no job, but a real run (an ai_agent guardrail calls the model and is billed)
echo '[{"text":"check this content"}]' | celigo guardrails invoke <id>

# Clone and connection management
celigo guardrails clone <id>
celigo guardrails replace-connection <id> <newConnectionId>

# Debug
celigo guardrails enable-debug <id> [--duration <minutes>]
celigo guardrails disable-debug <id>

# Discovery
celigo account search "<keyword>"
celigo templates marketplace
```

<!-- TIER:3 -->

## Pre-Submit Checklist

### Required (AI Agent)
- [ ] `adaptorType` is exactly `AiAgentImport` (case-sensitive)
- [ ] `aiAgent.provider` is a value in the schema enum, and the config format matches it (`openai{}`, `litellm{}`, or the flat catalog format)
- [ ] Instructions are set (`aiAgent.openai.instructions`, `aiAgent.litellm._overrides.<provider>.systemInstruction`, or `aiAgent.instructions` for a catalog provider)
- [ ] Model is set (`aiAgent.openai.model`, `aiAgent.litellm.model`, or `aiAgent.model`) -- on Celigo AI, one the platform hosts
- [ ] Catalog provider: `_connectionId` points at a BYOK connection
- [ ] If using `json_schema` output: schema is defined in `output.format.jsonSchema` (OpenAI) or `responseFormat.jsonSchema` (LiteLLM providers)

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
2. **Each provider family has its own config path.** OpenAI instructions are at `aiAgent.openai.instructions`; Gemini and Anthropic instructions are at `aiAgent.litellm._overrides.<provider>.systemInstruction`; catalog providers use `aiAgent.instructions`. Using the wrong path silently produces an agent with no instructions.
3. **Gemini model IDs have no `gemini/` prefix.** The platform stores them bare (`gemini-2.5-flash`), and the provider is already selected by `aiAgent.provider`.
4. **`json_schema` output without a schema definition returns unpredictable JSON.** Always define `jsonSchema` when using `json_schema` output format.
5. **Response mapping is on the flow, not the agent.** AI responses are available via `_json` in the flow's `pageProcessors[]` response mapping. Putting mapping config on the agent itself has no effect.
6. **MCP tool connections must be type `mcp`.** Regular HTTP connections cannot be used as `_mcpConnectionId` even if they point to an MCP server URL.
7. **Output is capped at 5000 tokens unless you set it.** An OpenAI agent created without `maxOutputTokens` is saved with 5000, and the schema gives Gemini's and Anthropic's `maxCompletionTokens` the same default. Raise it for long extractions (the schema allows up to 128000; the model's own limit may be lower). A guardrail gets no server-written cap.
8. **An unhosted model saves but fails at run time.** On Celigo AI (no BYOK connection) the model must be one the platform hosts for that provider. The save doesn't check it -- nothing is swapped or corrected -- and the agent's first run fails with 422 `invalid_model`, whose message lists the hosted models. With BYOK, the model string passes through to the provider as-is.
9. **Unmapped inputs default to `record`.** With no input mapping defined, the entire in-flight record is passed to the agent as `record`. Convenient for prototypes, but map `text`, `record`, or `files` explicitly for precise control over what the model sees.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 `adaptorType invalid` | Wrong case | Use `AiAgentImport` or `GuardrailImport` exactly |
| Truncated AI response | Output cap too low: `maxOutputTokens` (OpenAI) or `maxCompletionTokens` (Gemini, Anthropic), 5000 unless set | Raise it to fit the expected response, up to 128000 |
| Empty or nonsensical output | Missing or vague instructions | Write specific instructions with expected input/output format |
| `_mcpConnectionId invalid` | Wrong connection type | Use an MCP connection, not HTTP |
| 422 `invalid_model` on the first run | Model the platform doesn't host, on Celigo AI credentials (the save doesn't check) | Use a model the error message lists, or add a BYOK connection |
| 422 `connection_required` on save | Catalog provider without a `_connectionId` | Add an HTTP connection with the vendor's API key and set it on the agent |
| 422 `invalid_provider_config_format` | Config block doesn't match `aiAgent.provider` | Use `openai{}` for OpenAI, `litellm{}` for Gemini/Anthropic, the flat format for catalog providers |
| `_toolId not found` | Tool resource deleted or wrong ID | Verify tool exists with `celigo tools get <id>` |
| Guardrail flags everything | `confidenceThreshold` too low | Increase threshold (e.g., 0.7 to 0.9) |
| Guardrail misses obvious PII | Missing entity types | Add all relevant entity types to `guardrail.pii.entities[]` |
