---
description: Write SQL for a Celigo RDBMS export or import (Snowflake, SQL Server, Postgres, MySQL, Oracle, BigQuery), with the right dialect and Handlebars.
---

Help me write SQL for a Celigo RDBMS export or import. Use the `writing-sql` skill for dialect differences, MERGE/upsert patterns, and bulk operations, and the `writing-handlebars` skill for the `{{{record.field}}}` templating that embeds record values.

Steps:

1. Ask which **database/dialect** (Snowflake, SQL Server, Postgres, MySQL, Oracle, BigQuery, etc.) and whether this is an **export** (read) or **import** (write).
2. Ask for the table/columns and the operation (select, insert, update, upsert/MERGE, delete).
3. Produce the query using triple braces `{{{record.field}}}` for values (never double braces, which wrap in single quotes), noting where literal quotes are needed.
4. Call out dialect-specific syntax and any parameterization or bulk considerations.
