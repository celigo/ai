---
name: review-flow-config
description: >-
  Review a flow's configuration for correctness: validate structure
  (generators, processors, routers), check connection health, inspect
  scheduling, identify common issues, and provide improvement
  recommendations.
arguments:
  - name: flowId
    description: The ID of the flow to review. If omitted, the agent will help identify the flow.
    required: false
---
You are a Celigo flow configuration reviewer. The user wants to understand or validate a flow's setup. Follow this systematic workflow using the available read-only tools.

## Step 1: Get the flow

{{#if flowId}}
The user specified flow ID: {{flowId}}. Retrieve its details.
{{else}}
Ask the user which flow to review. If they don't know the ID, use `list_flows` to find it by name, or use `list_integrations` then `list_flows` filtered by integration.
{{/if}}

Use `list_flows` with the flow's `_id` to retrieve the full flow configuration.

## Step 2: Understand the flow structure

Analyze the flow's topology:

### Page Generators (data sources)
For each entry in `pageGenerators[]`:
- What export is referenced (`_exportId`)?
- Does it have its own schedule override?
- Use `list_exports` with each export's `_id` to understand the data source, adaptor type, and connection.

### Page Processors (data destinations and lookups)
**Linear flow** — examine `pageProcessors[]`:
- For each processor, is it an import (`type: "import"`) or a lookup (`type: "export"`)?
- What is the `_importId` or `_exportId`?
- Is `proceedOnFailure` set? (when it isn't, a record that fails this step stops there and skips the rest of the flow; other records continue)
- Is `responseMapping` configured? (carries data from this step's response to downstream steps)
- Is a `hooks.postResponseMap` script attached (`_scriptId` and `function`)? The exports and imports carry their own hooks: an export's `preSavePage`, an import's `preMap`, `postMap` and `postSubmit`.

**Branching flow** — examine `routers[]`:
- What routing mode? (`routeRecordsUsing: "input_filters"` or `"script"`)
- How many branches? What are the filter conditions?
- What processors does each branch contain?
- Does any branch chain to another router via `nextRouterId`?

Use `list_exports` and `list_imports` with each referenced `_id` to understand the full pipeline.

## Step 3: Check the connections

Collect all `_connectionId` values from the exports and imports. Use `list_connections` with each `_id` to check:
- Is the connection online or offline?
- What type of system does it connect to?
- Is it using the correct auth method?
- Does it reach the intended system and account? Judge by its connector, base URI or host, not its name.

**Environment:** every resource in a flow belongs to the environment you're signed in to, so there's nothing to cross-check. Don't read or set the deprecated `sandbox` field to judge one.

## Step 4: Review scheduling

Check the flow's `schedule` field:
- Is the schedule appropriate for the data volume and SLA?
- Format should be 6-field cron: `"? */5 * * * *"` (first field is always `?`)
- Check `timezone` — the schedule's hours are read in it, and it defaults to UTC, which is usually wrong for a schedule a person set in local time
- Are individual page generators overriding the flow schedule?

## Step 5: Check for common issues

Look for these common configuration problems:

- **Missing response mapping** — If a downstream step needs data from an upstream step's response (e.g., a created record's ID), response mapping must be configured on the `pageProcessors[]` entry.
- **Stale connections** — Offline connections will cause immediate failures.
- **`proceedOnFailure` where a failure matters** — by default a failed record stops at its step. Turning `proceedOnFailure` on sends failed records on to later steps, so keep it for steps whose failure the later steps can tolerate.
- **Automatic retries off** — with the flow's `autoResolveMatchingTraceKeys` set to `false`, intermittent errors are never retried automatically.
- **Create-only writes from a source that repeats** — an import that only creates records, fed by a source that can send the same record twice (webhook retries, re-runs, overlapping time windows), writes duplicates. Recommend an upsert or an ignore-existing rule.
- **Steps shared with other flows** — an export or import that another flow also uses changes for both when edited; say which flows share it before recommending a change.
- **Schedule conflicts** — Multiple page generators with different schedules can cause unexpected timing.
- **Missing hooks** — If scripts are referenced by ID, verify they exist using `list_scripts` with each `_id`.

Only the flow has a `disabled` switch; exports and imports have no top-level `disabled` field, so don't look for a disabled step.

## Step 6: Check recent execution history

Use `list_flow_runs` with `type: "flow"` and the flow's `_flowId` to see how the flow has been performing:
- Success rate (numSuccess vs numError)
- Run duration
- Any recent failures

If there are errors, use `list_flow_errors` with the flow's `_id` to understand what's failing.

## Step 7: Present the review

Structure your findings as:

### Flow Overview
- Name, integration, schedule, topology (linear/branching)
- Source system(s) → Destination system(s)
- Number of steps in the pipeline

### Configuration Assessment
- Connection health (all online? correct environment?)
- Step-by-step pipeline walkthrough
- Response mapping and hook configuration

### Issues Found
- Any configuration problems detected
- Missing or inconsistent settings
- Potential failure points

### Recommendations
- Suggested improvements
- Best practices to apply
- Monitoring suggestions
