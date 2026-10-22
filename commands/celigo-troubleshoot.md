---
description: Diagnose a failing, partial, empty, or stuck Celigo flow -- read its runs, errors, and execution logs, find the root cause, and say what to fix. Read-only until I ask for the fix.
---

Help me find out why a Celigo flow isn't doing what it should. Follow the `troubleshooting-flows` skill -- its Read Before You Answer order, Problem Categories, Error Diagnosis Framework, and Diagnostic Workflow -- and run its steps with the tools you have: the Celigo MCP server's tools (that skill's `references/mcp.md`) or the `celigo` CLI (`references/cli.md`). With neither, work from what I paste: error messages, a job summary, or the flow, export, or import JSON.

Start from what I've given you and what the account shows. Ask me only for what you can't find there:

- Which flow, in which account and environment (with an id or a name, look it up rather than asking)
- The symptom -- a failed run, some records erroring, a run that brought nothing, a stuck or slow run, a schedule that didn't fire, or wrong data with no errors
- When it started, and what changed around then (the audit log usually answers this)

Then:

1. Read the flow's latest runs and their per-step jobs (Diagnostic Workflow step 1), and name the problem category.
2. For errors, start with the step I mean -- for "the most recent error", the latest by time; otherwise the step with the most. Group its errors by message, read a few records' retry data and request/response, and read the configuration those errors point at: the mapping row, lookup, request body, filter, hook or connection (steps 2-4). Classify each error by its `classification`, not its HTTP status.
3. For an empty run, a stuck run, a missed schedule, or wrong output with no errors, use the skill's matching section (Empty Run, Stuck-Flow Triangulation, Missed Scheduled Runs, step 5's stage checks) and the execution logs of a run that captured them (step 6).
4. Report the root cause with the evidence for it, keeping what the reads prove apart from what you infer, and give the fix: the configuration change, or the record data to correct before a retry. Before suggesting a retry or a re-run, say what it will do: a retry fails again until the cause is fixed, and a re-run after a canceled or failed run can write again what an import already wrote.

Diagnosis is read-only. A test run (step 5) never calls the destination, but it reads the source and runs the flow's hooks for real -- say so before starting one. Wait for my yes before anything that writes: arming execution logging, running the flow, retrying or resolving errors, or changing configuration. Then follow steps 8 and 9: prove the fix on one record before retrying the rest.
