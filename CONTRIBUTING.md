# Contributing to Celigo AI

Thank you for your interest in contributing to the Celigo AI skills repository.

## How to Contribute

1. Fork this repository
2. Create a branch for your change
3. Make your changes
4. Submit a pull request

## Skill Format

Each skill is a directory under `skills/` containing a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: skill-name
description: One-line description of when and why to use this skill.
---

# Skill Title

Skill content here...
```

### Required fields

- `name` — lowercase, hyphen-separated identifier
- `description` — brief explanation of what the skill does and when to use it

### Reference files

Supporting schemas and reference material go in a `references/` subdirectory within the skill folder.

Most schema files under `references/` are synced verbatim from
[celigo/integrator-api-specs](https://github.com/celigo/integrator-api-specs) — do not hand-edit
them; fix the source spec instead and run `node scripts/sync-schemas.mjs --ias <checkout>` (a
scheduled workflow also opens sync PRs automatically). `scripts/sync-map.json` records each file's
source, the hand-authored files with no spec source (`editorial`), and any files temporarily
quarantined on a known upstream bug. New schema files must be added to that map, and every schema
PR runs `scripts/lint-schemas.mjs`, which blocks known data-corrupting leak shapes.

## Guidelines

- Skills should teach AI agents how to build integrations on the Celigo platform
- Include both CLI and API/UI approaches where applicable
- Keep content factual and actionable — avoid marketing language
- Test that your skill works by installing it locally: `npx skills add ./`

## Questions?

Open a [discussion](https://github.com/celigo/ai/discussions) or reach out at support@celigo.com.
