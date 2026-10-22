---
name: writing-sql
description: Write SQL queries for Celigo RDBMS exports and imports -- SELECT, INSERT, UPDATE, UPSERT, MERGE, delta, once, and bulk operations across Snowflake, Postgres, MySQL, SQL Server, Oracle, BigQuery, and Redshift. Use when editing rdbms.query or troubleshooting SQL errors.
---

<!-- TIER:1 -->

# Writing SQL for RDBMS Integrations

RDBMS exports and imports use SQL queries to read from and write to relational databases. Queries are Handlebars templates -- the platform evaluates expressions like `{{{record.fieldName}}}` at runtime, then executes the resulting SQL against the connected database.

This skill covers **what SQL to write and how to write it**. For which adaptor type to use, connection setup, and queryType selection, see the related skills below. When the task is to create an export or import, create it with the query in place rather than handing back the SQL -- [Delta export](#delta-export-incremental) shows a complete export.

## Quick Reference

### Context decision matrix

| Where | Field | Handlebars prefix | Braces | Example |
|---|---|---|---|---|
| Export query | `rdbms.query` | `record.` (parameterized) or none (standalone) | `{{{ }}}` | `SELECT * FROM orders WHERE id = {{{record.id}}}` |
| Export delta query | `rdbms.query` | platform-injected tokens | `{{ }}` (adds the quotes) | `WHERE updated_at > {{lastExportDateTime}}` |
| Export once mark-as-processed | `rdbms.once.query` | `record.` | `{{{ }}}` | `UPDATE orders SET exported = true WHERE id = {{{record.id}}}` |
| Import per_record query | `rdbms.query[]` | `record.` | `{{ }}` strings, `{{{ }}}` numbers | `INSERT INTO users (name, age) VALUES ({{record.name}}, {{{record.age}}})` |
| Import per_page query | `rdbms.query[]` | `batch_of_records` + `record.` | `{{ }}` strings, `{{{ }}}` numbers | `{{#each batch_of_records}}...{{record.field}}...{{/each}}` |
| Import bulk_load override | `rdbms.bulkLoad.overrideMergeQuery` | staging table ref | `{{ }}` | `MERGE INTO target USING {{import.rdbms.bulkLoad.preMergeTemporaryTable}}` |

### Key syntax rules

1. **Always use `record.` prefix** (AFE 2.0). Never bare `fieldName` or `data.fieldName`.
2. **Double braces quote strings for you.** `{{record.name}}` renders a single-quoted SQL string literal with embedded quotes doubled (`O'Neil Co` renders `'O''Neil Co'`), and so does every other string an expression produces: helper output such as `{{dateFormat ...}}` or `{{jsonSerialize ...}}`, and `{{this}}` inside `{{#each}}`. Use it for string and date values, including `{{lastExportDateTime}}`, and never add quotes around it -- `'{{record.name}}'` renders doubled quotes. On Snowflake, a value holding a backslash needs another form ([gotcha 13](#gotchas)).
3. **Triple braces are raw.** Use `{{{ }}}` for numbers (`{{{record.quantity}}}` -- a number that arrives as a string, `"5"`, renders `'5'` in double braces; JSON numbers and booleans render bare either way), identifiers such as table or column names, and SQL fragments you built yourself. Never wrap a triple-brace string in single quotes of your own (`'{{{record.name}}}'`): the first apostrophe in the data breaks the statement and leaves it open to SQL injection. (Snowflake's dollar-quoted constants are the one exception, in gotcha 13.)
4. **Import `query` is an array of strings**, not a single string: `["INSERT INTO ..."]`.
5. **Nested fields** use dot notation: `{{record.address.city}}`.

### Related skills

- [configuring-exports > RDBMS](../configuring-exports/SKILL.md) -- adaptorType, delta/once mode, export-level config
- [configuring-imports > RDBMS](../configuring-imports/SKILL.md) -- queryType decision tree, bulkInsert/bulkLoad config
- [writing-handlebars](../writing-handlebars/SKILL.md) -- full Handlebars syntax, helpers, block expressions
- [configuring-connections > RDBMS](../configuring-connections/SKILL.md) -- database connection setup

### Schema reference

- [rdbms-export.yml](references/schemas/rdbms-export.yml) -- export query and once fields
- [rdbms-import.yml](references/schemas/rdbms-import.yml) -- import query, queryType, bulkInsert, bulkLoad fields

<!-- TIER:2 -->

## How to Write a SQL Query

### 1. Discover the schema

Query the live database to find tables and columns before writing SQL:

```bash
celigo metadata types <connectionId>                    # List tables
celigo metadata fields <connectionId> <tableName>       # List columns and types
```

For Snowflake, use fully qualified names: `database.schema.table`.

### 2. Determine the query pattern

**Exports** -- what kind of data fetch?

| Pattern | Export type | Query template |
|---|---|---|
| Full fetch | `type: null` | `SELECT columns FROM table WHERE conditions` |
| Delta/incremental | `type: "delta"` | `SELECT ... WHERE updated_at > {{lastExportDateTime}}` |
| Once (mark-as-processed) | `type: "once"` | `rdbms.query` = SELECT unprocessed; `rdbms.once.query` = UPDATE to mark processed |

**Imports** -- what kind of write operation? (The `bulk_load` rows apply to Snowflake, Google BigQuery, Microsoft SQL Server on a cloud connection, Azure Synapse and Amazon Redshift, and to NSAW through the JDBC import.) Pick the fastest type the operation allows: `bulk_load` where the database has it, `bulk_insert` for pure inserts, then `per_page` -- one statement per page, rendered against `batch_of_records`, so it must cover the whole batch -- and `per_record` when the SQL can't be written for a page.

| Pattern | queryType | What to configure |
|---|---|---|
| INSERT with duplicate check | `["per_page"]` or `["per_record"]` | `rdbms.query` with INSERT ... ON CONFLICT / ON DUPLICATE KEY -- per_page as one multi-row statement |
| UPDATE | `["per_page"]` or `["per_record"]` | `rdbms.query` with UPDATE ... WHERE, or one statement that updates the whole page |
| UPSERT / MERGE | `["bulk_load"]`, else `["per_page"]` or `["per_record"]` | bulk_load: `bulkLoad.primaryKeys`; otherwise `rdbms.query` with MERGE or ON CONFLICT |
| Pure INSERT (no checking) | `["bulk_insert"]` | `rdbms.bulkInsert.tableName` and `batchSize` -- no SQL needed |
| Bulk load with upsert | `["bulk_load"]` | `rdbms.bulkLoad.tableName` and `primaryKeys` -- auto-generates MERGE |
| Custom bulk merge | `["bulk_load"]` | `bulkLoad.overrideMergeQuery: true` + custom SQL referencing staging table |

### 3. Write the SQL

Follow the database-specific [dialect patterns](#dialect-patterns) below. Inject runtime values with `{{record.fieldName}}` for strings and dates and `{{{record.fieldName}}}` for numbers and identifiers (see [Key syntax rules](#key-syntax-rules)).

### 4. Test the query

An export query can be tried before it's saved: a preview of an unsaved export document runs its query and saves nothing. For a delta query, give the document `postData` with both variables, or they render empty and the SQL doesn't compile ([Delta export](#delta-export-incremental)).

```bash
# Test an export query -- invoke returns real data
celigo exports invoke <exportId>
celigo exports invoke --file export.json    # an unsaved document; nothing is saved

# Test an import -- a real write: the records are written to the database
echo '[{"name":"test","email":"test@example.com"}]' | celigo imports invoke <importId>
```

Nothing shows an import's SQL without running it. A flow test run never executes imports, an import preview (`celigo imports invoke` with a document) answers 422 `invalid_adaptor` for an RDBMS import, and the Handlebars processor HTML-escapes values instead of quoting them (`O'Neil & Co` renders `O&#x27;Neil &amp; Co`), so its output isn't what the database receives. Check the statement in the import editor's SQL preview, then run one record against a test table.

## Export Query Patterns

### Standard SELECT

```sql
SELECT id, name, email, status
FROM customers
WHERE status = 'ACTIVE'
ORDER BY id
```

### Delta export (incremental)

Use `{{lastExportDateTime}}` (platform-injected, not from a record). It is the start of the run's window: the end of the last run that exported records, or `delta.startDate` on a new export's first run. It renders as a quoted ISO 8601 UTC literal with milliseconds (`'2026-01-15T00:00:00.000Z'`), so don't add quotes of your own: `'{{lastExportDateTime}}'` doubles the quotes, and a bare `{{{lastExportDateTime}}}` is an unquoted timestamp -- both are SQL errors. `{{currentExportDateTime}}` is the window's end; never use it as the lower bound.

Set `delta.startDate` on the export. Without it, the first run's `{{lastExportDateTime}}` is the run's own time, and the first run exports nothing. A complete delta export:

```json
{
  "name": "Changed customers",
  "adaptorType": "RDBMSExport",
  "_connectionId": "<rdbmsConnectionId>",
  "type": "delta",
  "delta": { "startDate": "2026-10-01T00:00:00.000Z" },
  "rdbms": { "query": "SELECT id, name, email, updated_at FROM customers WHERE updated_at > {{lastExportDateTime}} ORDER BY updated_at ASC" }
}
```

Snowflake compares the literal with a timestamp column directly. Where the database needs a timestamp value or another format:

```sql
-- Snowflake: let TO_TIMESTAMP detect the ISO 8601 format (a 'YYYY-MM-DD HH24:MI:SS' mask returns null or fails)
WHERE updated_at > TO_TIMESTAMP({{lastExportDateTime}})

-- PostgreSQL: cast to timestamptz -- ::timestamp ignores the trailing Z
WHERE updated_at > {{lastExportDateTime}}::timestamptz

-- MySQL and others: set delta.dateFormat on the export (e.g. "YYYY-MM-DD HH:mm:ss"),
-- which formats both variables in the query, then compare directly
WHERE updated_at > {{lastExportDateTime}}
```

A preview of an unsaved export document renders both variables empty and unquoted, so the query fails there unless the document supplies both in `postData` ([configuring-exports > Gotchas](../configuring-exports/SKILL.md#gotchas), 18). In a flow run, remember that a run given its own window (`flows run --start-time/--end-time`) leaves the checkpoint at its end time.

### Once export (mark-as-processed)

Two queries work together. The export `rdbms.query` fetches unprocessed records; `rdbms.once.query` marks each one after successful export.

```json
{
  "type": "once",
  "rdbms": {
    "query": "SELECT id, name, email FROM orders WHERE exported = false",
    "once": {
      "query": "UPDATE orders SET exported = true WHERE id = {{{record.id}}}"
    }
  }
}
```

### JOINs

```sql
SELECT o.id, o.order_date, c.name AS customer_name, c.email,
       p.product_name, oi.quantity, oi.unit_price
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
WHERE o.status = 'SHIPPED'
  AND o.order_date > {{lastExportDateTime}}
```

### Aggregations

```sql
SELECT customer_id, COUNT(*) AS order_count, SUM(total) AS lifetime_value
FROM orders
WHERE status IN ('COMPLETED', 'SHIPPED')
GROUP BY customer_id
HAVING SUM(total) > 1000
```

## Import Query Patterns

All import queries inject values from incoming records with `record.` paths -- `{{ }}` for strings and dates (quoted and escaped for you), `{{{ }}}` for numbers. The `query` field is an **array of strings**.

### INSERT (per_record)

```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["INSERT INTO customers (name, email, phone) VALUES ({{record.name}}, {{record.email}}, {{record.phone}})"]
  }
}
```

### UPDATE (per_record)

```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["UPDATE customers SET name = {{record.name}}, email = {{record.email}} WHERE id = {{{record.id}}}"]
  }
}
```

### UPSERT -- database-specific

**MySQL** (ON DUPLICATE KEY UPDATE):
```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["INSERT INTO customers (id, name, email) VALUES ({{{record.id}}}, {{record.name}}, {{record.email}}) ON DUPLICATE KEY UPDATE name = {{record.name}}, email = {{record.email}}"]
  }
}
```

**PostgreSQL** (ON CONFLICT):
```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["INSERT INTO customers (id, name, email) VALUES ({{{record.id}}}, {{record.name}}, {{record.email}}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email"]
  }
}
```

**Snowflake** (MERGE):
```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["MERGE INTO customers AS t USING (SELECT {{{record.id}}} AS id, {{record.name}} AS name, {{record.email}} AS email) AS s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.name = s.name, t.email = s.email WHEN NOT MATCHED THEN INSERT (id, name, email) VALUES (s.id, s.name, s.email)"]
  }
}
```

**SQL Server** (MERGE):
```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["MERGE INTO customers AS t USING (SELECT {{{record.id}}} AS id, {{record.name}} AS name, {{record.email}} AS email) AS s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.name = s.name, t.email = s.email WHEN NOT MATCHED THEN INSERT (id, name, email) VALUES (s.id, s.name, s.email);"]
  }
}
```

### Multiple statements (per_record)

When you need to run multiple SQL statements per record, add them as separate array elements:

```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": [
      "INSERT INTO orders (id, customer_id, total) VALUES ({{{record.orderId}}}, {{{record.customerId}}}, {{{record.total}}})",
      "UPDATE customers SET last_order_date = CURRENT_TIMESTAMP WHERE id = {{{record.customerId}}}"
    ]
  }
}
```

### Bulk insert (no SQL needed)

For pure INSERTs with no duplicate checking, use `bulkInsert` -- the platform generates the SQL:

```json
{
  "rdbms": {
    "queryType": ["bulk_insert"],
    "bulkInsert": {
      "tableName": "customers",
      "batchSize": "1000"
    }
  }
}
```

Column mapping comes from `mappings[]` on the import (Mapper 2.0). Each mapping's `generate` value must match a column name in the target table, and each needs a `dataType` -- `string`, `number` or `boolean` for a column value; a timestamp is a `string`, since there is no date type (see [writing-mappings](../writing-mappings/SKILL.md)).

### Bulk load with auto-generated MERGE

`bulk_load` is available on Snowflake, Google BigQuery, Microsoft SQL Server (a cloud connection, not one through an on-premise agent), Azure Synapse and Amazon Redshift, and on NSAW through the JDBC import. Redshift needs no AWS setup for it: Celigo stages the files and Redshift loads them with COPY. The import form shows the option on BigQuery, SQL Server, Synapse and Redshift only when it's enabled for the account, but the API accepts the import either way. On other databases (MySQL, MariaDB, PostgreSQL, Oracle), use `bulk_insert` for pure inserts and `per_page` or `per_record` SQL for updates and upserts. On a supported database, a high-volume upsert uses `bulkLoad` with `primaryKeys`, an array of column names:

```json
{
  "rdbms": {
    "queryType": ["bulk_load"],
    "bulkLoad": {
      "tableName": "WAREHOUSE.PUBLIC.CUSTOMERS",
      "primaryKeys": ["ID"]
    }
  }
}
```

The platform stages data into a temporary table, then auto-generates a MERGE using the primary keys. `primaryKeys` is an array even for one column, never a string; for composite keys, list each column: `"primaryKeys": ["ORDER_ID", "PRODUCT_ID"]`. Without `primaryKeys` the load is a plain insert, and without `tableName` the save is refused with 422 "rdbms imports require a tableName."

### Bulk load with custom merge

When the auto-generated MERGE isn't sufficient (conditional updates, ignore-existing, multi-table ops), override it:

```json
{
  "rdbms": {
    "queryType": ["bulk_load"],
    "bulkLoad": {
      "tableName": "WAREHOUSE.PUBLIC.CUSTOMERS",
      "primaryKeys": ["ID"],
      "overrideMergeQuery": true
    }
  }
}
```

The custom SQL goes in the `rdbms.query` field (yes, even with `bulkLoad`). Reference the staging table via `{{import.rdbms.bulkLoad.preMergeTemporaryTable}}`:

```sql
MERGE INTO WAREHOUSE.PUBLIC.CUSTOMERS AS t
USING {{import.rdbms.bulkLoad.preMergeTemporaryTable}} AS s
ON t.id = s.id
WHEN MATCHED AND s.updated_at > t.updated_at THEN
  UPDATE SET t.name = s.name, t.email = s.email, t.updated_at = s.updated_at
WHEN NOT MATCHED THEN
  INSERT (id, name, email, updated_at) VALUES (s.id, s.name, s.email, s.updated_at)
```

### per_page batch operations

`per_page` gives you the entire page of records as `batch_of_records`. Use `{{#each}}` to iterate:

```json
{
  "rdbms": {
    "queryType": ["per_page"],
    "query": ["INSERT INTO customers (name, email) VALUES {{#each batch_of_records}}({{record.name}}, {{record.email}}){{#unless @last}},{{/unless}}{{/each}}"]
  }
}
```

## Dialect Patterns

### Snowflake

```sql
-- Fully qualified table names (required unless connection sets default schema)
SELECT * FROM MY_DATABASE.MY_SCHEMA.MY_TABLE

-- FLATTEN for semi-structured data (VARIANT columns)
SELECT f.value:name::STRING AS name, f.value:email::STRING AS email
FROM MY_TABLE, LATERAL FLATTEN(input => MY_TABLE.json_column) f

-- JSON into a VARIANT column: a dollar-quoted constant keeps every character, while
-- PARSE_JSON({{jsonSerialize record.payload}}) fails on a double quote or line break in the data (gotcha 13)
INSERT INTO MY_DATABASE.MY_SCHEMA.EVENTS (PAYLOAD) SELECT PARSE_JSON($${{{jsonSerialize record.payload}}}$$)

-- QUALIFY for window function filtering
SELECT * FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) = 1

-- Timestamp handling: the delta literal compares directly, or let TO_TIMESTAMP detect its format
WHERE updated_at > TO_TIMESTAMP({{lastExportDateTime}})

-- Case: Snowflake uppercases unquoted identifiers. Use double quotes to preserve case
SELECT "camelCaseColumn" FROM "MixedCaseTable"
```

### PostgreSQL

```sql
-- JSONB operators
SELECT data->>'name' AS name, data->'address'->>'city' AS city
FROM customers WHERE data @> '{"active": true}'

-- ILIKE for case-insensitive matching
SELECT * FROM products WHERE name ILIKE '%widget%'

-- ON CONFLICT for upsert
INSERT INTO customers (id, name, email) VALUES ({{{record.id}}}, {{record.name}}, {{record.email}})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email

-- Array operations
SELECT * FROM users WHERE 'admin' = ANY(roles)

-- CTEs
WITH recent_orders AS (
  SELECT * FROM orders WHERE order_date > {{lastExportDateTime}}
)
SELECT c.name, r.total FROM customers c JOIN recent_orders r ON c.id = r.customer_id
```

### MySQL / MariaDB

```sql
-- ON DUPLICATE KEY UPDATE for upsert
INSERT INTO customers (id, name, email)
VALUES ({{{record.id}}}, {{record.name}}, {{record.email}})
ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email)

-- JSON_EXTRACT for JSON columns
SELECT JSON_EXTRACT(data, '$.name') AS name FROM customers

-- GROUP_CONCAT for string aggregation
SELECT customer_id, GROUP_CONCAT(product_name SEPARATOR ', ') AS products
FROM order_items GROUP BY customer_id

-- IFNULL for null handling
SELECT IFNULL(middle_name, '') AS middle_name FROM users

-- Delta timestamps: set delta.dateFormat "YYYY-MM-DD HH:mm:ss" on the export, then compare directly
WHERE updated_at > {{lastExportDateTime}}
```

### SQL Server / Azure Synapse

```sql
-- MERGE with required semicolon terminator
MERGE INTO customers AS t
USING (SELECT {{{record.id}}} AS id, {{record.name}} AS name) AS s
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET t.name = s.name
WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);

-- TOP instead of LIMIT
SELECT TOP 100 * FROM orders ORDER BY order_date DESC

-- STRING_AGG for string aggregation (SQL Server 2017+)
SELECT customer_id, STRING_AGG(product_name, ', ') AS products
FROM order_items GROUP BY customer_id

-- CROSS APPLY for row-valued functions
SELECT c.name, o.total FROM customers c
CROSS APPLY (SELECT TOP 1 * FROM orders WHERE customer_id = c.id ORDER BY order_date DESC) o

-- Bracket identifiers for reserved words or special characters
SELECT [order], [name] FROM [my-table]
```

### Oracle

```sql
-- NVL for null handling
SELECT NVL(middle_name, '') AS middle_name FROM users

-- ROWNUM for limiting results (pre-12c)
SELECT * FROM (SELECT * FROM orders ORDER BY order_date DESC) WHERE ROWNUM <= 100

-- FETCH FIRST for limiting results (12c+)
SELECT * FROM orders ORDER BY order_date DESC FETCH FIRST 100 ROWS ONLY

-- LISTAGG for string aggregation
SELECT customer_id, LISTAGG(product_name, ', ') WITHIN GROUP (ORDER BY product_name)
FROM order_items GROUP BY customer_id

-- MERGE
MERGE INTO customers t USING (SELECT {{{record.id}}} AS id, {{record.name}} AS name FROM dual) s
ON (t.id = s.id)
WHEN MATCHED THEN UPDATE SET t.name = s.name
WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name)
```

### BigQuery

```sql
-- Backtick identifiers
SELECT * FROM `project.dataset.table`

-- UNNEST for array columns
SELECT * FROM `orders`, UNNEST(items) AS item

-- STRUCT access
SELECT address.city, address.state FROM customers

-- SAFE_DIVIDE to avoid division by zero
SELECT SAFE_DIVIDE(revenue, orders) AS avg_order_value FROM metrics

-- Timestamp handling
WHERE updated_at > TIMESTAMP({{lastExportDateTime}})
```

### Redshift

```sql
-- PostgreSQL-based syntax
SELECT * FROM orders WHERE status = 'ACTIVE'

-- LISTAGG for string aggregation
SELECT customer_id, LISTAGG(product_name, ', ') WITHIN GROUP (ORDER BY product_name)
FROM order_items GROUP BY customer_id

-- bulk_load works on Redshift with no AWS setup (Celigo stages the files, Redshift loads them with COPY)
```

<!-- TIER:3 -->

## Pre-Submit Checklist

### Export queries
- [ ] **SELECT query is syntactically valid** for the target database dialect
- [ ] **Delta uses `{{lastExportDateTime}}`** in the query, NOT a `delta` object inside `rdbms` -- double braces with no quotes of your own, and the export's top-level `delta.startDate` set so the first run isn't empty
- [ ] **Once export has both queries** -- `rdbms.query` for SELECT and `rdbms.once.query` for UPDATE
- [ ] **Table and column names exist** -- verify with `celigo metadata types/fields <connectionId>`
- [ ] **Snowflake uses fully qualified names** -- `database.schema.table` unless the connection sets defaults

### Import queries
- [ ] **`query` is an array of strings** -- `["INSERT INTO ..."]`, not `"INSERT INTO ..."`
- [ ] **`queryType` is one value that fits the operation** -- `["bulk_load"]` on Snowflake, BigQuery, SQL Server (cloud connection), Azure Synapse, Redshift or NSAW, `["bulk_insert"]` for pure INSERT, `["per_page"]` or `["per_record"]` for UPDATE/UPSERT elsewhere; never the legacy `INSERT`/`UPDATE`
- [ ] **`bulkLoad.primaryKeys` is an array** -- `["ORDER_ID"]`, not `"ORDER_ID"`; set it for an upsert, with `bulkLoad.tableName`
- [ ] **All `record.` paths match incoming data** -- invoke the upstream export to verify field names
- [ ] **Strings and dates use double braces, numbers and identifiers use triple** -- `{{record.name}}` vs `{{{record.id}}}`
- [ ] **No quotes of your own** around either form -- double braces already quote, and a hand-quoted `'{{{record.name}}}'` breaks on an apostrophe
- [ ] **Snowflake values that can hold a backslash, double quote or line break** (JSON above all) use a dollar-quoted constant, `$${{{...}}}$$`, not double braces (gotcha 13)
- [ ] **Uses `record.` prefix** -- not bare `fieldName` or `data.fieldName`
- [ ] **bulkInsert/bulkLoad not set alongside query** -- these are mutually exclusive with the `query` field (except `overrideMergeQuery`)

### Cross-resource
- [ ] **Connection takes SQL** -- `type` is `rdbms` and `rdbms.type` names the database (mysql, mariadb, postgresql, mssql, azuresynapse, oracle, snowflake, bigquery, redshift). JDBC connections (`type: "jdbc"`, with `jdbc.type` such as netsuitejdbc, db2, workday or databricks) also take SQL: exports in `jdbc.query` (plus `jdbc.once.query` for once exports), imports in `jdbc.query` according to `jdbc.queryType`
- [ ] **SQL dialect matches the database** -- MERGE syntax differs between Snowflake, SQL Server, Oracle, PostgreSQL

## Gotchas

1. **Double braces quote and escape in RDBMS.** `{{record.name}}` outputs `'value'` -- a SQL string literal with embedded quotes doubled (`O'Neil Co` becomes `'O''Neil Co'`). `{{{record.name}}}` outputs `value` (raw). Use double braces for strings and dates with no quotes of your own, and triple braces for numbers and identifiers. Wrapping either in your own quotes breaks: `'{{record.name}}'` double-quotes the value, and `'{{{record.name}}}'` fails on the first apostrophe in the data.
2. **Import `query` must be an array.** `"query": "INSERT INTO ..."` fails silently or throws a Cast error. Always use `["INSERT INTO ..."]`.
3. **`queryType` takes one value, fastest first.** `["bulk_load"]` where the database has it, `["bulk_insert"]` for pure inserts, then `["per_page"]`, then `["per_record"]` when the SQL can't be written for a page ([step 2](#2-determine-the-query-pattern)). Never combine values.
4. **Legacy `queryType` values are refused on every save.** A create or update whose `queryType` holds `INSERT` (or the retired `MERGE`, `COPY` or `BULK INSERT`) fails with a 422 saying those query types are deprecated, on any database; a lowercase string such as `insert` fails as not a valid enum value. `UPDATE` is a legacy value too -- use `per_record` or `per_page`.
5. **An unresolvable reference fails the step.** Query rendering is strict: a bare `{{name}}` (no `record.` prefix), or `record.*` when the arriving record is a grouped array (which binds `rows` instead), fails with `cannot_evaluate_handlebars` rather than rendering empty. Always use `record.name`, or `rows.0.name` / `{{#each rows}}` for grouped input.
6. **Snowflake requires fully qualified table names.** `database.schema.table` unless the connection sets a default schema. Unqualified names fail silently or hit the wrong table.
7. **`per_page` has a different Handlebars context.** The context is `batch_of_records`, not a single record. Use `{{#each batch_of_records}}...{{record.fieldName}}...{{/each}}`.
8. **`bulkLoad.overrideMergeQuery` references a staging table.** Use `{{import.rdbms.bulkLoad.preMergeTemporaryTable}}` -- not the target table name.
9. **SQL Server MERGE requires a semicolon terminator.** Missing `;` at the end causes syntax errors.
10. **`once.query` runs per record, not per batch.** The `{{record.id}}` in the once query refers to the current exported record. Don't write batch UPDATE statements here.
11. **Don't put delta config inside `rdbms`.** There's no `rdbms.delta` property. Delta is handled by embedding `{{lastExportDateTime}}` directly in the SQL query text.
12. **NULL handling varies by dialect.** Use `NVL` (Oracle), `IFNULL` (MySQL), `COALESCE` (standard/Snowflake/PostgreSQL/SQL Server). Don't assume one works everywhere.
13. **On Snowflake, a double-brace value with a backslash arrives changed.** The quoting doubles apostrophes but leaves backslashes, and Snowflake reads them as escape sequences: `C:\temp\new` arrives with a tab and a line break in it, and no error is raised. For the same reason `PARSE_JSON({{jsonSerialize record.payload}})` fails with 422 `Error parsing JSON` when a string in the payload holds a double quote or a line break (`jsonSerialize` escapes them with backslashes), and a backslash in the payload is changed. For values that can hold these characters -- JSON above all -- use a dollar-quoted constant with triple braces, which Snowflake reads as is: `PARSE_JSON($${{{jsonSerialize record.payload}}}$$)`, or `$${{{record.path}}}$$` for a string. A `$$` in the data would end the constant, so keep this form to data that can't contain one.

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `Cast error` or `Invalid query format` | `query` is a string instead of an array | Change to `["SQL here"]` |
| `cannot_evaluate_handlebars` | A reference the query can't resolve -- missing `record.` prefix, or `record.*` on a grouped record | Use `record.fieldName`; for grouped input, `rows.0.fieldName` or `{{#each rows}}` |
| `'42'` instead of `42` for numeric field | Double braces quote a number that arrives as a string (`"42"`); JSON numbers render bare | Switch to triple braces `{{{ }}}` |
| `''value''`, or a syntax error at a quote | Quotes added around a double-brace value, or a hand-quoted triple-brace value hit an apostrophe | Use `{{record.field}}` with no quotes of your own |
| 422 `Error parsing JSON: missing comma` or `unterminated string` (Snowflake `PARSE_JSON`) | `PARSE_JSON({{jsonSerialize ...}})` on data holding a double quote or line break: Snowflake reads the backslash escapes in the quoted literal | `PARSE_JSON($${{{jsonSerialize record.payload}}}$$)` (gotcha 13) |
| Text in Snowflake lost its backslashes or gained tabs and line breaks (`C:\temp` arrives as `C:`, a tab, `emp`) | A double-brace value holding backslashes | A dollar-quoted constant, `$${{{record.field}}}$$` (gotcha 13) |
| `Compilation error: Object does not exist` (Snowflake) | Unqualified table name | Use `database.schema.table` |
| 422 `Import query types "BULK INSERT", "INSERT", "MERGE", "COPY" are deprecated` | `queryType` holds a legacy value -- refused on every save, on any database | Use `per_record`, `per_page`, `bulk_insert` or `bulk_load` |
| 422 `is not a valid enum value for path rdbms.queryType.0` | A lowercase or unknown value such as `insert` | Use one of `per_record`, `per_page`, `first_page`, `bulk_insert`, `bulk_load` |
| `Merge statement must be terminated by ;` (SQL Server) | Missing semicolon at end of MERGE | Add `;` after the final clause |
| `Ambiguous column reference` | JOIN without table alias | Prefix columns with table aliases |
| `Syntax error near ON DUPLICATE KEY` | Using MySQL syntax on PostgreSQL/Snowflake | Use the correct dialect: `ON CONFLICT` (Postgres) or `MERGE` (Snowflake) |
| `Column count doesn't match value count` | Mismatch between INSERT columns and VALUES | Verify column list matches the number of `record.x` values |
| `Permission denied for table` | Connection user lacks INSERT/UPDATE grants | Check database permissions for the connection user |
