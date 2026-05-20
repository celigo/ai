---
name: writing-sql
description: >-
  Author SQL queries for Celigo RDBMS exports and imports — SELECT,
  INSERT, UPDATE, UPSERT, MERGE, delta, once, and bulk operations across
  Snowflake, Postgres, MySQL, MariaDB, SQL Server, Azure Synapse, Oracle,
  BigQuery, and Redshift. Covers query patterns, dialect differences,
  queryType selection, bulkInsert/bulkLoad, and the common gotchas.
---
You are a Celigo integration expert. The user needs help authoring or troubleshooting a SQL query for a Celigo RDBMS export or import — `SELECT`, `INSERT`, `UPDATE`, `UPSERT`, `MERGE`, delta, once, or bulk operations across Snowflake, Postgres, MySQL, MariaDB, SQL Server, Azure Synapse, Oracle, BigQuery, or Redshift. Use this reference to draft and validate the query. RDBMS queries are Handlebars templates — the platform evaluates expressions like `{{{record.fieldName}}}` at runtime, then executes the resulting SQL against the connected database. In Phase 1 you cannot apply changes directly; produce the SQL, explain what it does, and tell the user where to paste it.

For full Handlebars syntax (helpers, blocks, brace rules) see the `writing-handlebars` prompt.

## Quick Reference

### Context decision matrix

| Where | Field | Handlebars prefix | Braces | Example |
|---|---|---|---|---|
| Export query | `rdbms.query` | `record.` (parameterized) or none (standalone) | `{{{ }}}` | `SELECT * FROM orders WHERE id = {{{record.id}}}` |
| Export delta query | `rdbms.query` | platform-injected tokens | `{{ }}` or `{{{ }}}` | `WHERE updated_at > '{{lastExportDateTime}}'` |
| Export once mark-as-processed | `rdbms.once.query` | `record.` | `{{{ }}}` | `UPDATE orders SET exported = true WHERE id = {{{record.id}}}` |
| Import per_record query | `rdbms.query[]` | `record.` | `{{{ }}}` | `INSERT INTO users (name) VALUES ('{{{record.name}}}')` |
| Import per_page query | `rdbms.query[]` | `batch_of_records` + `record.` | `{{{ }}}` | `{{#each batch_of_records}}...{{{record.field}}}...{{/each}}` |
| Import bulk_load override | `rdbms.bulkLoad.overrideMergeQuery` | staging table ref | `{{ }}` | `MERGE INTO target USING {{import.rdbms.bulkLoad.preMergeTemporaryTable}}` |

### Key syntax rules

1. **Always use `record.` prefix** (AFE 2.0). Never bare `fieldName` or `data.fieldName`.
2. **Prefer triple braces `{{{ }}}`** for values in SQL. Double braces `{{ }}` auto-wrap values in single quotes in RDBMS context — this silently corrupts numeric values and breaks SQL syntax.
3. **Add your own quotes** for strings: `'{{{record.name}}}'`. Triple braces give you full control.
4. **No quotes** for numbers: `{{{record.quantity}}}`.
5. **Import `query` is an array of strings**, not a single string: `["INSERT INTO ..."]`.
6. **Nested fields** use dot notation: `{{{record.address.city}}}`.

## How to Write a SQL Query

### 1. Discover the schema

Use the MCP tools to find tables and columns before writing SQL:

| Need | Tool | Notes |
|---|---|---|
| Find the connection id and dialect | `list_connections` then `get_connection` | Inspect `type` (mysql/postgresql/mssql/snowflake/oracle/bigquery/redshift/azuresynapse) and the `rdbms` block |
| List tables and columns for a connection | `get_application_metadata` | Returns the connector's record types and fields — equivalent to the CLI's `celigo metadata types/fields` |
| See an existing export's SQL for reference | `get_export` | Inspect the `rdbms.query` and `rdbms.once.query` fields |
| Walk dependencies before editing | `get_flow` → `pageGenerators` / `pageProcessors` | Find which exports/imports a flow uses |

For Snowflake, use fully qualified names: `database.schema.table` (unless the connection sets a default schema).

### 2. Determine the query pattern

**Exports** — what kind of data fetch?

| Pattern | Export type | Query template |
|---|---|---|
| Full fetch | `type: null` | `SELECT columns FROM table WHERE conditions` |
| Delta / incremental | `type: "delta"` | `SELECT ... WHERE updated_at > '{{lastExportDateTime}}'` |
| Once (mark-as-processed) | `type: "once"` | `rdbms.query` = SELECT unprocessed; `rdbms.once.query` = UPDATE to mark processed |

**Imports** — what kind of write operation?

| Pattern | queryType | What to configure |
|---|---|---|
| INSERT with duplicate check | `["per_record"]` | `rdbms.query` with INSERT ... ON CONFLICT / ON DUPLICATE KEY |
| UPDATE | `["per_record"]` | `rdbms.query` with UPDATE ... WHERE |
| UPSERT / MERGE | `["per_record"]` or `["bulk_load"]` | per_record: `rdbms.query` with MERGE; bulk_load: `bulkLoad.primaryKeys` |
| Pure INSERT (no checking) | `["bulk_insert"]` | `rdbms.bulkInsert.tableName` and `batchSize` — no SQL needed |
| Bulk load with upsert | `["bulk_load"]` | `rdbms.bulkLoad.tableName` and `primaryKeys` — auto-generates MERGE |
| Custom bulk merge | `["bulk_load"]` | `bulkLoad.overrideMergeQuery: true` + custom SQL referencing staging table |

### 3. Write the SQL

Follow the database-specific [dialect patterns](#dialect-patterns) below. Use `{{{record.fieldName}}}` for runtime values.

### 4. Validate before handing off

Phase 1 cannot run the query directly. Before giving the user the final SQL:

- Walk the query mentally with a sample record from the upstream export.
- Confirm the dialect matches the connection's `type` (MERGE syntax differs by dialect).
- Verify each `{{{record.x}}}` corresponds to a field present in the source data — if you have a recent job for the upstream flow, call `get_job_errors` to see actual record shapes from any failed records.
- Tell the user to paste the SQL into the export's `rdbms.query` (or import's `rdbms.query[]`) field via the integrator.io UI, then run the flow once to confirm. Phase 2 update tools (`update_export`, `update_import`) will apply changes directly when they ship.

## Export Query Patterns

### Standard SELECT

```sql
SELECT id, name, email, status
FROM customers
WHERE status = 'ACTIVE'
ORDER BY id
```

### Delta export (incremental)

Use `{{lastExportDateTime}}` (platform-injected, not from a record). The token resolves to the timestamp of the last successful export run.

```sql
SELECT id, name, email, updated_at
FROM customers
WHERE updated_at > '{{lastExportDateTime}}'
ORDER BY updated_at ASC
```

For databases that need specific timestamp formats:

```sql
-- Snowflake
WHERE updated_at > TO_TIMESTAMP('{{lastExportDateTime}}', 'YYYY-MM-DD HH24:MI:SS')

-- MySQL
WHERE updated_at > STR_TO_DATE('{{lastExportDateTime}}', '%Y-%m-%d %H:%i:%s')

-- PostgreSQL
WHERE updated_at > '{{lastExportDateTime}}'::timestamp
```

### Once export (mark-as-processed)

Two queries work together. The export `rdbms.query` fetches unprocessed records; `rdbms.once.query` marks each one after a successful export.

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
  AND o.order_date > '{{lastExportDateTime}}'
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

All import queries use `{{{record.fieldName}}}` to inject values from incoming records. The `query` field is an **array of strings**.

### INSERT (per_record)

```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["INSERT INTO customers (name, email, phone) VALUES ('{{{record.name}}}', '{{{record.email}}}', '{{{record.phone}}}')"]
  }
}
```

### UPDATE (per_record)

```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["UPDATE customers SET name = '{{{record.name}}}', email = '{{{record.email}}}' WHERE id = {{{record.id}}}"]
  }
}
```

### UPSERT — database-specific

**MySQL** (ON DUPLICATE KEY UPDATE):

```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["INSERT INTO customers (id, name, email) VALUES ({{{record.id}}}, '{{{record.name}}}', '{{{record.email}}}') ON DUPLICATE KEY UPDATE name = '{{{record.name}}}', email = '{{{record.email}}}'"]
  }
}
```

**PostgreSQL** (ON CONFLICT):

```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["INSERT INTO customers (id, name, email) VALUES ({{{record.id}}}, '{{{record.name}}}', '{{{record.email}}}') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email"]
  }
}
```

**Snowflake** (MERGE):

```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["MERGE INTO customers AS t USING (SELECT {{{record.id}}} AS id, '{{{record.name}}}' AS name, '{{{record.email}}}' AS email) AS s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.name = s.name, t.email = s.email WHEN NOT MATCHED THEN INSERT (id, name, email) VALUES (s.id, s.name, s.email)"]
  }
}
```

**SQL Server** (MERGE):

```json
{
  "rdbms": {
    "queryType": ["per_record"],
    "query": ["MERGE INTO customers AS t USING (SELECT {{{record.id}}} AS id, '{{{record.name}}}' AS name, '{{{record.email}}}' AS email) AS s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.name = s.name, t.email = s.email WHEN NOT MATCHED THEN INSERT (id, name, email) VALUES (s.id, s.name, s.email);"]
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

For pure INSERTs with no duplicate checking, use `bulkInsert` — the platform generates the SQL:

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

Column mapping comes from `mappings[]` on the import (Mapper 2.0). Each mapping's `generate` value must match a column name in the target table.

### Bulk load with auto-generated MERGE

For high-volume upsert on Snowflake or Azure Synapse, use `bulkLoad` with `primaryKeys`:

```json
{
  "rdbms": {
    "queryType": ["bulk_load"],
    "bulkLoad": {
      "tableName": "WAREHOUSE.PUBLIC.CUSTOMERS",
      "primaryKeys": "id"
    }
  }
}
```

The platform stages data into a temporary table, then auto-generates a MERGE using the primary keys. For composite keys: `"primaryKeys": "order_id,product_id"`.

### Bulk load with custom merge

When the auto-generated MERGE isn't sufficient (conditional updates, ignore-existing, multi-table ops), override it:

```json
{
  "rdbms": {
    "queryType": ["bulk_load"],
    "bulkLoad": {
      "tableName": "WAREHOUSE.PUBLIC.CUSTOMERS",
      "primaryKeys": "id",
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
    "query": ["INSERT INTO customers (name, email) VALUES {{#each batch_of_records}}('{{{record.name}}}', '{{{record.email}}}'){{#unless @last}},{{/unless}}{{/each}}"]
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

-- QUALIFY for window function filtering
SELECT * FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) = 1

-- Timestamp handling
WHERE updated_at > TO_TIMESTAMP('{{lastExportDateTime}}', 'YYYY-MM-DD"T"HH24:MI:SS')

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
INSERT INTO customers (id, name, email) VALUES ({{{record.id}}}, '{{{record.name}}}', '{{{record.email}}}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email

-- Array operations
SELECT * FROM users WHERE 'admin' = ANY(roles)

-- CTEs
WITH recent_orders AS (
  SELECT * FROM orders WHERE order_date > '{{lastExportDateTime}}'
)
SELECT c.name, r.total FROM customers c JOIN recent_orders r ON c.id = r.customer_id
```

### MySQL / MariaDB

```sql
-- ON DUPLICATE KEY UPDATE for upsert
INSERT INTO customers (id, name, email)
VALUES ({{{record.id}}}, '{{{record.name}}}', '{{{record.email}}}')
ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email)

-- JSON_EXTRACT for JSON columns
SELECT JSON_EXTRACT(data, '$.name') AS name FROM customers

-- GROUP_CONCAT for string aggregation
SELECT customer_id, GROUP_CONCAT(product_name SEPARATOR ', ') AS products
FROM order_items GROUP BY customer_id

-- IFNULL for null handling
SELECT IFNULL(middle_name, '') AS middle_name FROM users

-- Timestamp formatting
WHERE updated_at > STR_TO_DATE('{{lastExportDateTime}}', '%Y-%m-%d %H:%i:%s')
```

### SQL Server / Azure Synapse

```sql
-- MERGE with required semicolon terminator
MERGE INTO customers AS t
USING (SELECT {{{record.id}}} AS id, '{{{record.name}}}' AS name) AS s
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
MERGE INTO customers t USING (SELECT {{{record.id}}} AS id, '{{{record.name}}}' AS name FROM dual) s
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
WHERE updated_at > TIMESTAMP('{{lastExportDateTime}}')
```

### Redshift

```sql
-- PostgreSQL-based syntax
SELECT * FROM orders WHERE status = 'ACTIVE'

-- LISTAGG for string aggregation
SELECT customer_id, LISTAGG(product_name, ', ') WITHIN GROUP (ORDER BY product_name)
FROM order_items GROUP BY customer_id

-- COPY-oriented — bulk_load uses Redshift COPY under the hood
-- For custom merge logic, use overrideMergeQuery with staging table reference
```

## Pre-Submit Checklist

### Export queries
- [ ] **SELECT query is syntactically valid** for the target database dialect.
- [ ] **Delta uses `{{lastExportDateTime}}`** in the query, NOT a `delta` object inside `rdbms`.
- [ ] **Once export has both queries** — `rdbms.query` for SELECT and `rdbms.once.query` for UPDATE.
- [ ] **Table and column names exist** — verify with `get_application_metadata` for the connection.
- [ ] **Snowflake uses fully qualified names** — `database.schema.table` unless the connection sets defaults.

### Import queries
- [ ] **`query` is an array of strings** — `["INSERT INTO ..."]`, not `"INSERT INTO ..."`.
- [ ] **`queryType` matches the operation** — `["per_record"]` for UPDATE/UPSERT, `["bulk_insert"]` for pure INSERT, `["bulk_load"]` for high-volume.
- [ ] **All `{{{record.fieldName}}}` paths match incoming data** — confirm by walking the upstream export's `mockOutput` / sample records.
- [ ] **Strings are quoted, numbers are not** — `'{{{record.name}}}'` vs `{{{record.id}}}`.
- [ ] **Uses `record.` prefix** — not bare `fieldName` or `data.fieldName`.
- [ ] **Uses triple braces `{{{ }}}`** — double braces auto-wrap in quotes, breaking numeric values and SQL syntax.
- [ ] **`bulkInsert` / `bulkLoad` not set alongside `query`** — these are mutually exclusive with the `query` field (except `overrideMergeQuery`).

### Cross-resource
- [ ] **Connection type is RDBMS** — `type` on the connection matches one of: mysql, mariadb, postgresql, mssql, azuresynapse, oracle, snowflake, bigquery, redshift.
- [ ] **SQL dialect matches the database** — MERGE syntax differs between Snowflake, SQL Server, Oracle, PostgreSQL.

## Gotchas

1. **Double braces auto-format in RDBMS.** `{{record.name}}` outputs `'value'` (wrapped in quotes). `{{{record.name}}}` outputs `value` (raw). Use triple braces and add your own quotes for strings — this gives you control and avoids double-quoting or broken numeric values.
2. **Import `query` must be an array.** `"query": "INSERT INTO ..."` fails silently or throws a Cast error. Always use `["INSERT INTO ..."]`.
3. **`queryType` values are specific.** Use `["per_record"]`, `["bulk_insert"]`, `["per_page"]`, `["bulk_load"]`. Do NOT use `["INSERT"]` or `["UPDATE"]` as standalone values.
4. **Snowflake rejects legacy `queryType` values on PUT.** `insert` / `update` may work on POST but fail on PUT. Use `per_record` or `bulk_insert` from the start.
5. **Missing `record.` prefix produces empty values.** `{{{name}}}` resolves to nothing. Always use `{{{record.name}}}`.
6. **Snowflake requires fully qualified table names.** `database.schema.table` unless the connection sets a default schema. Unqualified names fail silently or hit the wrong table.
7. **`per_page` has a different Handlebars context.** The context is `batch_of_records`, not a single record. Use `{{#each batch_of_records}}...{{{record.fieldName}}}...{{/each}}`.
8. **`bulkLoad.overrideMergeQuery` references a staging table.** Use `{{import.rdbms.bulkLoad.preMergeTemporaryTable}}` — not the target table name.
9. **SQL Server MERGE requires a semicolon terminator.** Missing `;` at the end causes syntax errors.
10. **`once.query` runs per record, not per batch.** The `{{record.id}}` in the once query refers to the current exported record. Don't write batch UPDATE statements here.
11. **Don't put delta config inside `rdbms`.** There's no `rdbms.delta` property. Delta is handled by embedding `{{lastExportDateTime}}` directly in the SQL query text.
12. **NULL handling varies by dialect.** Use `NVL` (Oracle), `IFNULL` (MySQL), `COALESCE` (standard / Snowflake / PostgreSQL / SQL Server). Don't assume one works everywhere.

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `Cast error` or `Invalid query format` | `query` is a string instead of an array | Change to `["SQL here"]` |
| Empty values in SQL / `NULL` where data expected | Missing `record.` prefix in Handlebars | Use `{{{record.fieldName}}}` |
| `'42'` instead of `42` for numeric field | Double braces auto-quoting | Switch to triple braces `{{{ }}}` |
| `Compilation error: Object does not exist` (Snowflake) | Unqualified table name | Use `database.schema.table` |
| `Invalid value for queryType` on PUT | Legacy `insert` / `update` queryType | Use `per_record` or `bulk_insert` |
| `Merge statement must be terminated by ;` (SQL Server) | Missing semicolon at end of MERGE | Add `;` after the final clause |
| `Ambiguous column reference` | JOIN without table alias | Prefix columns with table aliases |
| `Syntax error near ON DUPLICATE KEY` | Using MySQL syntax on PostgreSQL / Snowflake | Use the correct dialect: `ON CONFLICT` (Postgres) or `MERGE` (Snowflake) |
| `Column count doesn't match value count` | Mismatch between INSERT columns and VALUES | Verify column list matches the number of `{{{record.x}}}` values |
| `Permission denied for table` | Connection user lacks INSERT / UPDATE grants | Check database permissions for the connection user |
