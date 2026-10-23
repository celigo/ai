---
description: Author or debug a Celigo Handlebars expression (mapping, HTTP body, SQL, URI, filter, or file path) using the helper catalog.
---

Help me write (or fix) a Celigo Handlebars expression. Use the `writing-handlebars` skill for brace rules, the `record.` prefix (AFE 2.0), and context selection. For exact helper names, parameters, and examples, consult the Handlebars Helper Catalog at `mcp/resources/handlebars-helpers.md` (also served as `celigo://resources/handlebars-helpers`).

Steps:

1. Ask which **context** the expression runs in -- mapping extract, HTTP `relativeURI`/`body`, RDBMS `query`, output filter, or file path -- since that decides the brace style (`{{ }}` vs `{{{ }}}`) and escaping.
2. Ask for the input record shape (or a sample) if it matters.
3. Produce the expression, explain what each helper does, and show a worked **input -> output** example -- rendered with the Handlebars processor (`celigo processors invoke handlebars`, which saves and sends nothing) when you can.
4. Flag common pitfalls (double braces format for their field -- URL-encoded in a URI, quoted in SQL, JSON-escaped in a JSON body; `dateAdd` counting milliseconds unless a unit is named; `#compare` comparing two strings as text; a missing field rendering empty in a body or mapping but failing a URI, header or SQL query; a null field rendering the text `null` in a JSON body, though the processor renders it empty).
