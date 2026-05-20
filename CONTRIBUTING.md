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

## Guidelines

- Skills should teach AI agents how to build integrations on the Celigo platform
- Include both CLI and API/UI approaches where applicable
- Keep content factual and actionable — avoid marketing language
- Test that your skill works by installing it locally: `npx skills add ./`

## Questions?

Open a [discussion](https://github.com/celigo/ai/discussions) or reach out at support@celigo.com.
