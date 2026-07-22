---
description: Build a Celigo field mapping (Mapper 2.0 / Transformation 2.0) -- extracts, lookups, conditionals, and response mapping.
---

Help me build a Celigo field mapping. Use the `writing-mappings` skill (Mapper 2.0, Transformation 2.0, lookups, response mapping) and the `writing-handlebars` skill for computed extracts.

Steps:

1. Ask for the **source** record shape and the **destination** fields (or a sample of each).
2. Ask about the mapping system in play -- Mapper 2.0 vs Mapper 1.0 (Salesforce/NetSuite), since the `record.` prefix rule differs.
3. Produce the mapping entries (`generate` / `extract`, hardcoded values, lookups, conditionals), explaining each.
4. Flag required-field gaps, type mismatches, and where a lookup or a script hook would be cleaner than an inline expression.
