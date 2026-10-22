---
name: configuring-ai-agents
description: Configure Celigo AI agent imports -- LLM-powered steps that classify, extract, or generate data within flows. Use when creating agent imports on any supported model provider, or configuring prompts, structured output, tools, or BYOK connections. For guardrails (PII, moderation, policy verdicts), use configuring-guardrails.
---

<!-- TIER:1 -->

# Configuring AI Agents

An AI agent is an **LLM-powered import step** that processes records through an AI model instead of writing them to an external system. Records flow in, the model processes them according to instructions, and structured output flows back into the pipeline.

AI agents handle four concerns:

- **Prompt design** -- the system instruction that defines the model's behavior, goals, and constraints (up to 1,000,000 characters on the built-in providers). The prompt receives each record as context and must produce output that downstream steps can consume
- **Structured output** -- `json_schema` output format forces the model to return data conforming to a JSON Schema, enabling reliable field extraction for mapping. `text` returns free-form responses. `blob` returns binary data (image generation)
- **Tool use** -- the model can call web search, MCP server tools, Celigo Tool resources, or image generation during processing. Tools extend the model's capabilities beyond its training data
- **Response mapping** -- extract fields from the model's response back into the record for downstream steps. Configured on the flow's `pageProcessors[]` entry as `{"fields": [{"extract": "_json.category", "generate": "category"}]}`, but planned when building the agent. A `json_schema` response is available via `_json`

AI agents do not require a `_connectionId` unless using BYOK (bring your own key). Without one, built-in providers use platform-managed credentials; catalog providers are BYOK-only and require one.

Used across flows, APIs, and tools. An agent has no trigger or schedule of its own: it runs when one of those hands it a record, or when a chat request sends it a message. A request like "every morning" or "whenever an order arrives" needs the parent flow built too, with the agent as one of its steps.

## AI Agent Imports

Invoke an LLM for classification, extraction, summarization, translation, or generation. `aiAgent.provider` takes any value in the enum in [aiagent.yml](references/schemas/aiagent.yml), and providers come in two families with different config formats:

- **Built-in providers** -- each has its own config block and runs on Celigo AI or BYOK credentials:
  - **OpenAI** (`provider: "openai"`) -- GPT models via the OpenAI Responses API, configured in `aiAgent.openai{}`. Supports reasoning effort control, structured JSON output, web search, MCP tools, Celigo Tools, and image generation.
  - **LiteLLM-backed providers** such as Gemini (`provider: "gemini"`) and Anthropic Claude (`provider: "anthropic"`) -- configured in `aiAgent.litellm{}`, with provider-specific settings under `litellm._overrides.<provider>`. Gemini adds Google Search grounding, URL context, and file search.
- **Catalog providers** -- the rest of the enum. They share a generic flat format (`model`, `modelOptions`, `instructions`, `output`, and the tool arrays directly on `aiAgent`) and are **BYOK-only**: saving one without a `_connectionId` fails with 422 `connection_required`.

The provider decides the format -- a block that doesn't match fails the save with 422 `invalid_provider_config_format`.

## Agent or Guardrail?

Pick by what the LLM produces. A guardrail (`GuardrailImport`) renders a **verdict** (`flagged: true|false`) that the parent's routing branches on -- reach for it when the user says "verify / check / validate / flag / screen". An AI agent step does **work** whose output flows onward as data -- reach for it when the user says "classify / extract / generate / summarize / decide". Guardrails flag; they never block on their own -- the parent flow/API/tool decides what happens to flagged records. Everything about building one -- the `pii`, `moderation` and `ai_agent` types, masking, input modes, thresholds, its CLI commands and errors -- is in [configuring-guardrails](../configuring-guardrails/SKILL.md).

## Quick Reference

### Adaptor Decision Matrix

| You need... | Use adaptorType | Config block | Read schema |
|---|---|---|---|
| LLM classification, extraction, generation | `AiAgentImport` | `aiAgent{}` | [aiagent.yml](references/schemas/aiagent.yml) |
| A verdict to route on: PII, moderation, or a policy check | `GuardrailImport` | `guardrail{}` | [configuring-guardrails](../configuring-guardrails/SKILL.md) |

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

### Schema Index

All schemas are in [references/schemas/](references/schemas/):

- **Base fields (all imports):** [request.yml](references/schemas/request.yml)
- **Response shape:** [response.yml](references/schemas/response.yml)
- **AI agent config:** [aiagent.yml](references/schemas/aiagent.yml) -- provider, model, instructions, reasoning, temperature, output format, tools

### Input Fields

An AI agent step receives an in-flight record and maps parts of it into one of four input fields. The mapping destination dropdown shows exactly these four -- no more:

| Field | Type | Purpose |
|---|---|---|
| `text` | string | Free text for the model to reason over. The most common input |
| `record` | object or array | The full structured record (or part of it) as JSON. Use when the model needs to see multiple fields together |
| `files` | array of `{ name, blobKey }` | File references. Which types the model can read depends on the account's document-processing setting (below the table) |
| `conversationHistoryId` | string | Stable per-conversation identifier that retains and replays history across runs (see [Conversation History](#conversation-history)) |

A mapped record with none of `text`, `record` or `files` is sent whole, as JSON. So with no input mapping the agent gets the in-flight record as JSON -- unless the record has its own top-level `text`, `record` or `files` field, which is then its only input; map explicitly when records carry one.

An agent's input mapping is Mapper 2.0 `mappings` rows. With `inputContext: "envelope"` their `extract` paths read the run's envelope (`$.record.<field>`, `$.settings.<field>`) instead of the bare record. As on other imports, `hooks.preMap`, `hooks.postMap` and `hooks.postSubmit` can reshape records around the model call; agents have no `postAggregate` hook (see [writing-scripts](../writing-scripts/SKILL.md)).

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
- [configuring-guardrails](../configuring-guardrails/SKILL.md) -- guardrail steps that flag records (PII, moderation, policy checks), often placed before or after an agent
- [configuring-connections > Quick Reference](../configuring-connections/SKILL.md#quick-reference) -- MCP connections for tool use, HTTP connections for BYOK
- [building-flows > How to Build a Flow](../building-flows/SKILL.md#how-to-build-a-flow) -- wiring AI agents into flow pipelines
- [building-tools > Tool Concepts](../building-tools/SKILL.md#tool-concepts) -- building Celigo Tools that AI agents can invoke
- [writing-mappings > Response Mapping Reference](../writing-mappings/SKILL.md#response-mapping-reference-transformation-10) -- extracting fields from AI responses
- [troubleshooting-flows > Diagnostic Workflow](../troubleshooting-flows/SKILL.md#diagnostic-workflow) -- diagnosing AI agent failures
- [writing-handlebars > Quick Reference](../writing-handlebars/SKILL.md#quick-reference) -- dynamic expressions in AI prompts and field values

<!-- TIER:2 -->

## How to Build an AI Agent

### 1. Determine the task

What should the AI model do with each record? Common patterns: classification (sentiment, routing), extraction (invoice parsing, address normalization), validation (business rules; when the result is only pass or fail, see [Agent or Guardrail?](#agent-or-guardrail)), generation (translations, summaries), enrichment (web search augmentation). The task determines the provider, model, output format, and whether tools are needed.

Decide, too, which records need the model at all. An input filter on the agent step (`filter`, as on any import; see [configuring-filters](../configuring-filters/SKILL.md#import-filter-import-filter)) skips the model for the rest, and it is the cheapest cost control. Skipped records still continue down the flow with the agent's response-mapped fields empty, so give every later step that writes those fields its own filter, such as `["notempty", ["string", ["extract", "ai_category"]]]`.

To judge each item of an array on its own (each order line, say), set `oneToMany: true` and `pathToMany` to the array's field on the agent. Each item then becomes its own record and its own billed model call, carrying the parent's other fields under `_PARENT`, and the items are joined back into the parent record, with their response-mapped fields, before the next step ([one-to-many.yml](references/common-schemas/one-to-many.yml)).

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

On Celigo AI (no BYOK connection) the model must be one the platform hosts for that provider, and the save checks it: a create or update with any other model fails with 422 `Model "<model>" is not supported. Please choose a supported model and test your agent configuration.` The message doesn't list the hosted models, so don't pick names from memory -- use an example from [aiagent.yml](references/schemas/aiagent.yml) or the model of an existing working agent. With BYOK, a model off the hosted list saves and passes through to the provider as-is.

### 4. Write the instructions

The system instruction is the most important configuration. Be specific about the task, expected input shape, and desired output. Include examples for complex tasks. Set constraints for edge cases (empty fields, invalid data). Keep instructions focused on a single responsibility per agent.

### 5. Configure the output format

Three options:

- **`json_schema`** -- forces structured JSON output conforming to a schema. Use this whenever downstream steps need to map specific fields from the response. Where it goes depends on the provider family: `aiAgent.openai.output.format` (OpenAI), `aiAgent.litellm.responseFormat` (Gemini, Anthropic), or `aiAgent.output.format` (catalog providers), each holding `type: "json_schema"`, `name`, `strict` and `jsonSchema`. `litellm.responseFormat` holds them directly, with no `format` level inside it
- **`text`** -- free-form text response. Use for summarization, translation, or when the entire response is one field
- **`blob`** -- binary output (image generation use cases), on OpenAI and Gemini only: the save refuses it with 422 on Anthropic and on catalog providers

For `json_schema`, set `strict: true` if you need guaranteed schema conformance (slightly higher latency). On a built-in provider, when you write `jsonSchema` yourself, set `schemaMode: "json"` beside it and send it again on every full update: a PUT that omits it clears it, and without it the UI opens the schema in its visual editor, whose next save drops keywords that editor doesn't keep (`format`, `const`, `$ref`, `anyOf`, `additionalProperties`, ...) and turns `integer` into `number`. On OpenAI, a root-level `additionalProperties` is dropped from `jsonSchema` on save (nested ones stay) and strict runs still return conforming JSON, so don't chase it in a read-back.

### 6. Tune parameters

- **`reasoning.effort`** (OpenAI) or **`thinkingConfig.thinkingLevel`** (Gemini) -- controls depth of reasoning. Use `"medium"` for most tasks; `"low"` for simple classification; `"high"` for complex analysis. OpenAI `-pro` models start at `"medium"`: `"low"` saves, but the run is refused. Claude's is `_overrides.anthropic.thinkingConfig`: `type: "enabled"` with `budgetTokens` (1024 or more; the save refuses `enabled` without it), or `type: "adaptive"` with an `effort`
- **`temperature`** -- `0.2` for deterministic output (data extraction, classification); up to `1.0` for creative generation. Anthropic accepts only 0 to 1 (a higher value fails the save); OpenAI and Gemini go up to 2. Leave `topK` off Claude models released after Claude Opus 4.6, which refuse it at run time
- **`maxOutputTokens`** / **`maxCompletionTokens`** -- set based on expected response size. `1000` for short classifications; `5000-20000` for detailed extractions; `100000+` for long-form generation

### 7. Add tools (if needed)

Tools extend what the model can do during processing:

- **`web_search`** (OpenAI) / **`googleSearch`** (Gemini) / **`webSearch`** (Anthropic) -- search the web for current information to enrich records. Anthropic's takes `allowedDomains` or `blockedDomains`, not both
- **`code_execution`** (OpenAI) / **`codeExecution`** (Gemini, Anthropic) -- the provider's built-in code execution, on BYOK only: on Celigo AI the save accepts it, but the run is refused with 422 `Code Execution requires a BYOK connection.` Send only `{"type": ...}`, in the provider's spelling (the other one fails the save with 422)
- **`mcp`** -- connect to an MCP server for external tool calls. Requires an MCP connection (`_mcpConnectionId`). Optionally restrict with `allowedTools`
- **`tool`** -- invoke a Celigo Tool resource. Reference via `_toolId`. Supports per-agent `overrides`
- **`image_generation`** (OpenAI) -- generate images from text descriptions
- **`urlContext`** (Gemini) -- fetch and process URL content
- **`fileSearch`** (Gemini) -- search uploaded files

An MCP connection can also give the agent **prompts** (`"prompts": [{"type": "mcp", "mcp": {"_mcpConnectionId": "...", "allowedPrompts": ["..."]}}]`) and read-only **resources**, such as a policy document someone else maintains (`"resources": [{"type": "mcp", "mcp": {"_mcpConnectionId": "...", "allowedResources": [{"name": "...", "uri": "..."}]}}]`, at least one entry). Both sit beside `tools` in the provider's block. The save checks only their shape and that the connection exists, so copy prompt names and resource URIs from the server's catalog. The run does contact the server: when it can't be reached, each record fails with `mcp_connection_error` before the model is called.

### 8. Configure BYOK (optional)

By default, AI agents use platform-managed credentials. To use your own API key, create an HTTP connection with your provider's API key and set `_connectionId` on the import, or use `celigo ai-agents replace-connection <agentId> <connectionId>`.

### 9. Build the JSON

Read the schema files from the [Schema Index](#schema-index). Start with [request.yml](references/schemas/request.yml) for base fields, then [aiagent.yml](references/schemas/aiagent.yml) for the provider configuration block.

An Anthropic agent on the customer's own key, returning JSON. Everything the model needs sits in `aiAgent.litellm`:

```json
{
  "name": "Classify support tickets",
  "adaptorType": "AiAgentImport",
  "_connectionId": "<connection holding the Anthropic API key>",
  "aiAgent": {
    "provider": "anthropic",
    "litellm": {
      "model": "claude-sonnet-4-6",
      "temperature": 0.2,
      "maxCompletionTokens": 2000,
      "responseFormat": {
        "type": "json_schema",
        "schemaMode": "json",
        "name": "ticket_class",
        "strict": true,
        "jsonSchema": {
          "type": "object",
          "properties": {
            "category": {"type": "string", "enum": ["billing", "shipping", "other"]},
            "summary": {"type": "string"}
          },
          "required": ["category", "summary"],
          "additionalProperties": false
        }
      },
      "_overrides": {
        "anthropic": {"systemInstruction": "Classify the support ticket and summarize it in one sentence."}
      }
    }
  }
}
```

A Gemini agent is the same with `provider: "gemini"`, a Gemini `litellm.model` and the instructions in `_overrides.gemini.systemInstruction`. An OpenAI agent puts `model`, `instructions` and `output.format` (the same `type`, `name`, `strict` and `jsonSchema`) in `aiAgent.openai`. Nothing goes flat on `aiAgent` for these three providers: `aiAgent.model`, `aiAgent.instructions` and `aiAgent.output` are the catalog providers' format.

## Celigo AI vs BYOK

Cutting across the built-in providers is a second decision: run the agent on **Celigo AI** (platform-managed credentials) or **BYOK** (bring your own key). Catalog providers have no Celigo AI option -- they are always BYOK.

- **Celigo AI** -- no API key to manage. The trade is restriction: model choice is limited to the models the platform hosts for each provider (the save refuses any other), and runs are charged in AI credits against the account's prepaid AI-agent balance (`aiAgentsPrepaidBalance` in `celigo subscriptions licenses`), tool charges included. Once the balance reaches zero, runs are refused with 402 `insufficient_credits`. The account's AI agent actions are also counted per billing period, MCP tool calls and resource reads included (`aiAgentsActionsUsage` in `celigo subscriptions entitlement-usage`)
- **BYOK** -- the agent uses your own API key (configured on a connection; see step 8 above). Any model the provider supports is available -- new releases, fine-tuned models, models off Celigo's curated list -- and the provider bills the key's owner: the credit balance doesn't gate the run, and rate limits are your provider account's

Default to **Celigo AI** for prototyping, low-volume agents, and agents happy with the curated model list. Reach for **BYOK** when you need a model that isn't on the list, when volume would drain the prepaid credit balance, or when you want costs to land on your existing AI vendor billing.

Switching between Celigo AI and BYOK -- or changing the model -- can drop configuration that no longer applies: `serviceTier` is BYOK-only, `reasoning.effort` applies only to reasoning-capable models, and image modalities apply only to image-capable Gemini models. It is not a one-knob change.

## Conversation History

By default, AI agent steps are **stateless** -- each record is its own conversation and the agent has no memory of previous records. This keeps behavior reproducible and cost predictable.

To make an agent **stateful**, map a stable per-conversation identifier into its `conversationHistoryId` input field -- a Slack thread ID, session UUID, customer ID, or ticket number, whatever is unique per conversation. Celigo retains the conversation history for that identifier and replays it on subsequent calls, so the agent sees prior turns. Mapping `record.slack_thread_id`, for example, makes every reply in a Slack thread aware of the earlier messages.

The identifier is scoped **per user and per agent**: the same string used by two different agents is two separate conversations, and the same agent used by two different users is two separate conversations. The retained history can't be read back through the API, and it doesn't appear in the agent's Conversation history in the UI, which lists only conversations started there -- it exists for the model to read, not for users to browse -- and idle conversations age out via a TTL that resets on each update.

## Capability Check Before Building

Before building an agent, walk through each action the requirement says the agent should perform and confirm each one maps to a capability the agent will actually have at runtime. The goal is to surface gaps early, not to refuse capabilities.

Capabilities come from three places:

- **Native to the chosen model** -- OpenAI's `web_search` and `image_generation`; Gemini's `googleSearch`, `urlContext`, `fileSearch`, and image-modality output; Anthropic's `webSearch`; code execution on all three, with BYOK
- **Tools wired into the agent** -- `mcp` tools and Celigo Tools (MCP prompts and resources are read-only content, not actions)
- **Downstream steps in the parent** -- rendering output, writing to a destination, notifying a recipient (same shape whether the parent is a flow, API endpoint, or Tool)

For each action, ask which of the three covers it; if none do, that is a gap to raise before building. A common example is "generate a PDF invoice": no provider ships PDF rendering as a native capability, so the right shape is the agent emitting structured invoice content (`json_schema` output) with a downstream step or Celigo Tool rendering the PDF. Equally, don't enable capabilities the requirement didn't ask for -- "classify support tickets" needs text classification (native), not `web_search` "just in case."

## CLI Commands

Invoking a saved agent, or previewing an agent document (`invoke` with no id, given `{"import": <agent document>, "data": [records]}`), creates no job, but it is a real run: the model is called and billed (in AI credits on Celigo AI; the key's owner pays on BYOK), and its tools (MCP servers, Celigo Tools, web search) act for real. Invoke an agent whose tools can write only with the user's go-ahead. A preview evaluates only the first record; invoke the saved agent by id to run several. To test the flow around it without calling the model, give the agent a `mockResponse` of result records (`[{"statusCode": 200, "_json": {...}}]`, or `_text` for text output; any other shape fails the save with 422 `Mock Response must be in integrator.io canonical format.`) and test-run the flow (`celigo flows test-run <flowId> --export <exportId>`). The test run uses the mock instead of the model, so it costs nothing and proves nothing about the prompt.

Debug logs are captured by whatever runs the agent: `celigo ai-agents enable-debug <id>` opens a window of up to 60 minutes, and you read the requests from the flow, API or Tool that ran it (`celigo flows debug-requests <flowId> <agentId>`, or `celigo apis debug-requests` / `celigo tools debug-requests`). The chat routes (`POST /v1/imports/{_id}/aiagents/chat` for a saved agent, `POST /v1/aiagents/chat` for an unsaved document) and `POST /v1/imports/preview/compare` (several agent documents side by side on the same data) have no CLI command. A chat turn runs the agent alone, without its filter, mappings, hooks or response mapping, and like an invoke it is billed and its tools act.

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
- [ ] If using `json_schema` output: schema is defined in `aiAgent.openai.output.format.jsonSchema` (OpenAI), `aiAgent.litellm.responseFormat.jsonSchema` (Gemini, Anthropic; no `format` level), or `aiAgent.output.format.jsonSchema` (catalog providers), with `type: "json_schema"` and `name` beside it (and, on a built-in provider, `schemaMode: "json"` when you wrote the schema yourself)

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
7. **Output is capped at 5000 tokens unless you set it.** An agent created without a cap is saved with 5000: `maxOutputTokens` on OpenAI, `litellm.maxCompletionTokens` on Gemini and Anthropic. Raise it for long extractions (the schema allows up to 128000; the model's own limit may be lower).
8. **The save refuses a model the platform doesn't host.** On Celigo AI (no BYOK connection), a create or update with an unhosted model fails with 422 `Model "<model>" is not supported...`, and nothing is swapped or corrected. The message doesn't list the hosted models: use the schema's examples or a working agent's model. With BYOK, a model off the hosted list saves and passes through to the provider as-is.
9. **Unmapped inputs default to `record`.** With no input mapping defined, the entire in-flight record is passed to the agent as `record`. Convenient for prototypes, but map `text`, `record`, or `files` explicitly for precise control over what the model sees.
10. **A Claude agent's preview shows empty `instructions`.** The preview's `request` stage carries `"instructions": ""` for an Anthropic agent; its prompt travels in `_overrides.anthropic.systemInstruction` and is applied. Don't read the empty field as a missing prompt.
11. **Some settings save and fail only when the agent runs.** The save checks shape, the hosted model and a few provider rules, not every model's limits: `reasoning.effort: "low"` on an OpenAI `-pro` model saves and the run is refused (`Supported values are: 'medium', 'high', and 'xhigh'`), and so are `topK` on newer Claude models and a code-execution tool on Celigo AI. Preview the agent on one record before wiring it into a flow.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 422 `adaptorType invalid` | Wrong case | Use `AiAgentImport` exactly |
| Truncated AI response | Output cap too low: `maxOutputTokens` (OpenAI) or `maxCompletionTokens` (Gemini, Anthropic), 5000 unless set | Raise it to fit the expected response, up to 128000 |
| Empty or nonsensical output | Missing or vague instructions | Write specific instructions with expected input/output format |
| `_mcpConnectionId invalid` | Wrong connection type | Use an MCP connection, not HTTP |
| 402 `insufficient_credits` "Credits Usage limit reached. Further execution is blocked. Purchase additional AI Credits to restore execution." | The account's prepaid AI-agent balance is used up (Celigo AI only) | Buy more AI credits, or move the agent to BYOK |
| 403 `agents_disabled` "AI Agents are disabled for this account." | The account's license has AI agent use turned off (`aiAgentsCredits.allowedConsumption: false` in `celigo subscriptions licenses`), BYOK included | It's a license setting: ask the account's Celigo contact; nothing on the agent fixes it |
| 422 `Model "<model>" is not supported...` on save (a preview: `Run blocked: model "<model>" is not supported...`) | Model the platform doesn't host, on Celigo AI credentials | Use a model from the schema's examples or a working agent, or add a BYOK connection |
| 422 `connection_required` on save | Catalog provider without a `_connectionId` | Add an HTTP connection with the vendor's API key and set it on the agent |
| 422 `invalid_provider_config_format` | Config block doesn't match `aiAgent.provider` | Use `openai{}` for OpenAI, `litellm{}` for Gemini/Anthropic, the flat format for catalog providers |
| 422 `<id> is not a valid aiAgent.openai.tools.0.mcp._mcpConnectionId` (the path names the array and index) | The MCP connection or Tool (`_toolId`) that entry references doesn't exist | Check the id with `celigo connections get <id>` or `celigo tools get <id>` |
| Records fail with `mcp_connection_error` (a preview: 422 `MCP server connection failed`) | The MCP server the agent's prompts or resources point at can't be reached | Check the MCP connection's `serverURL` and auth, and ping it |
| 422 `Mock Response must be in integrator.io canonical format.` | `mockResponse` holds bare result objects | Write result records: `[{"statusCode": 200, "_json": {...}}]`, or `_text` for text output |
| 422 on an Anthropic save: `temperature` must be between 0 and 1, or `blob` output is not supported | Settings other providers accept | Keep `temperature` within 0 to 1; use `text` or `json_schema` output |
| 422 `Code Execution requires a BYOK connection.` on a run or preview | A code-execution tool on Celigo AI credentials (the save accepted it) | Add a BYOK connection, or remove the tool |
