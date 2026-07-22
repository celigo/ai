---
description: Author or debug a Celigo Handlebars expression (mapping, HTTP body, SQL, URI, filter, or file path) using the helper catalog.
---

Help me write (or fix) a Celigo Handlebars expression. Use the `writing-handlebars` skill for brace rules, the `record.` prefix (AFE 2.0), and context selection. For exact helper names, parameters, and examples, consult the Handlebars Helper Catalog at `mcp/resources/handlebars-helpers.md` (also served as `celigo://resources/handlebars-helpers`).

Steps:

1. Ask which **context** the expression runs in -- mapping extract, HTTP `relativeURI`/`body`, RDBMS `query`, output filter, or file path -- since that decides the brace style (`{{ }}` vs `{{{ }}}`) and escaping.
2. Ask for the input record shape (or a sample) if it matters.
3. Produce the expression, explain what each helper does, and show a worked **input -> output** example.
4. Flag common pitfalls (double-brace auto-formatting, `dateAdd` milliseconds, lexicographic `compare`, missing-field empty output).
