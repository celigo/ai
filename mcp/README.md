# MCP Prompts & Resources

MCP **prompts** and **resources** consumed by the Celigo MCP server.

This directory is the single source of truth for the markdown bodies and metadata that the MCP server advertises through the protocol's `prompts/list`, `prompts/get`, `resources/list`, and `resources/read` requests. Each `.md` file is self-describing -- metadata lives as YAML frontmatter at the top of the file, so adding or editing a prompt/resource is a single-file change with no separate registry to maintain.

## Layout

```
mcp/
├── prompts/<name>.md      # prompt body with YAML frontmatter
└── resources/<name>.md    # resource body with YAML frontmatter
```

The Celigo MCP server clones this repo at build time (sparse checkout of `mcp/`), copies it into the runtime image, and the prompt/resource handlers scan each directory, parse the frontmatter, and build the in-memory registry at startup.

## Frontmatter schema

### Prompts (`prompts/*.md`)

```yaml
---
name: <unique snake-or-kebab-case identifier>
description: <1-2 sentence summary shown in prompts/list>
arguments:                          # optional -- omit if no arguments
  - name: <argName>
    description: <what it is>
    required: <true|false>
---
<prompt body in Markdown>
```

### Resources (`resources/*.md`)

```yaml
---
uri: celigo://resources/<slug>
name: <human-readable name>
description: <1-2 sentence summary>
mimeType: text/markdown             # currently always text/markdown
---
<resource body in Markdown>
```

### Templating in prompt bodies

Prompt bodies may contain two kinds of substitutions, evaluated by the server's `renderTemplate` before the prompt is returned:

| Syntax | Behavior |
|---|---|
| `{{var}}` | Replaced with the argument value, **only if `var` is in the prompt's `arguments` list**. Unknown names are left untouched (so literal Handlebars examples are preserved). |
| `{{#if var}}...{{else}}...{{/if}}` | Truthy when the argument is non-empty after trim. Same `arguments`-only guard. |

## Adding a new prompt

1. Create `mcp/prompts/<your-prompt>.md` with the frontmatter block at the top.
2. Open a PR. Once merged, the Celigo MCP server's next build will auto-discover it.

## Adding a new resource

1. Create `mcp/resources/<your-resource>.md` with the frontmatter block. Pick a stable `celigo://resources/<slug>` URI -- clients pin to it.
2. PR the change.
