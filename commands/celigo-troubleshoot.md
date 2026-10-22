---
description: Diagnose a failing, partial, empty, or stuck Celigo flow -- read its runs, errors, and execution logs, find the root cause, and say what to fix. Read-only until I ask for the fix.
---

Help me find out why a Celigo flow isn't doing what it should. Follow the `troubleshooting-flows` skill -- its Problem Categories, Error Diagnosis Framework, and Diagnostic Workflow -- and run its steps with the tools you have: the Celigo MCP server's tools (that skill's `references/mcp.md`) or the `celigo` CLI (`references/cli.md`). With neither, work from what I paste: error messages, a job summary, or the flow, export, or import JSON.

First, confirm (ask me for anything I haven't already given):

- Which flow, in which account and environment
- The symptom -- a failed run, some records erroring, a run that brought nothing, a stuck or slow run, a schedule that didn't fire, or wrong data with no errors
- When it started, and what changed around then

Then:

1. Read the flow's latest runs and their per-step jobs (Diagnostic Workflow step 1), and name the problem category.
2. For errors, start with the step that has the most, group its errors by message, and read a few records' retry data and request/response (steps 2-4). Classify each error by its `classification`, not its HTTP status.
3. For an empty run, a stuck run, a missed schedule, or wrong output with no errors, use the skill's matching section (Empty Run, Stuck-Flow Triangulation, Missed Scheduled Runs, step 5's stage checks) and the execution logs of a run that captured them (step 6).
4. Report the root cause with the evidence for it, keeping what the reads prove apart from what you infer, and give the fix: the configuration change, or the record data to correct before a retry.

Diagnosis is read-only. A test run (step 5) never calls the destination, but it reads the source and runs the flow's hooks for real -- say so before starting one. Wait for my yes before anything that writes: arming execution logging, running the flow, retrying or resolving errors, or changing configuration. Then follow steps 8 and 9: prove the fix on one record before retrying the rest.
