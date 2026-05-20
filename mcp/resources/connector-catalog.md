---
uri: celigo://resources/connector-catalog
name: Connector Catalog
description: >-
  List of supported connection types, export adaptor types, import
  adaptor types, and pre-built connectors (550+ HTTP connectors, 590+
  trading partner connectors, 340+ marketplace templates).
mimeType: text/markdown
---
# Celigo Connector Catalog

## Overview

Celigo supports connecting to virtually any system through a combination of native connectors, pre-built HTTP connectors (550+), and trading partner connectors (590+). This catalog covers the built-in connection types and adaptor types available.

For the full list of pre-built HTTP connectors, use the `list_http_connectors` tool. (Trading partner / EDI connector tools are deferred from the current MCP scope; consult the Celigo UI or marketplace for the EDI catalog.)

## Connection Types

| Connection Type | `type` value | Target Systems | Auth Methods |
|----------------|-------------|----------------|-------------|
| **HTTP/REST/GraphQL** | `http` | Any REST, GraphQL, or webhook-based API | OAuth2, token, basic auth, API key, custom headers, client certificate |
| **NetSuite** | `netsuite` | Oracle NetSuite ERP | Token-Based Auth (TBA) via `token-auto` (recommended), SuiteApp |
| **Salesforce** | `salesforce` | Salesforce CRM | Packaged OAuth (recommended), custom Connected App |
| **RDBMS** | `rdbms` | SQL Server, MySQL, PostgreSQL, Oracle, Snowflake, BigQuery, Redshift | Username/password, key-pair (Snowflake), service account (BigQuery) |
| **JDBC** | `jdbc` | Active Directory, Databricks, DB2, and other JDBC-compatible databases | Username/password, connection string |
| **MongoDB** | `mongodb` | MongoDB, MongoDB Atlas | Connection string or host/credentials |
| **DynamoDB** | `dynamodb` | Amazon DynamoDB | IAM access key, role ARN |
| **FTP** | `ftp` | FTP, SFTP, FTPS servers | Username/password, SSH key. Optional PGP encryption |
| **S3** | `s3` | Amazon S3 | IAM access key, role ARN |
| **Filesystem** | `filesystem` | Local/on-premise filesystem | Requires on-premise agent (`_agentId`) |
| **AS2** | `as2` | AS2 EDI partners | Certificate-based |
| **VAN** | `van` | Celigo VAN (EDI hub) | Celigo-managed |
| **MCP** | `mcp` | AI tool servers (MCP protocol) | OAuth2 or token |
| **Wrapper** | `wrapper` | Stack-deployed custom connectors | Stack-defined |

> **Note:** The `rest` connection type is legacy — always use `http` for new REST/GraphQL connections.

## Export Adaptor Types

Exports fetch data from external systems. Choose based on the source system:

### Record-Based Exports
Actively fetch batches of records from an API or database on a schedule.

| Adaptor Type | Source System | Key Capabilities |
|-------------|--------------|-----------------|
| `HTTPExport` | REST/GraphQL APIs | Pagination, delta sync via Handlebars, file mode for cloud storage |
| `NetSuiteExport` | NetSuite ERP | Saved searches, restlets, SuiteQL, file cabinet |
| `SalesforceExport` | Salesforce CRM | SOQL, Bulk API, streaming/distributed |
| `RDBMSExport` | SQL databases | SQL SELECT, delta via date columns |
| `MongodbExport` | MongoDB | Aggregation pipeline, find queries, change streams |
| `JDBCExport` | JDBC databases | SQL queries via JDBC driver |
| `DynamodbExport` | Amazon DynamoDB | Scan, query operations |
| `WrapperExport` | Stack connectors | Custom pre-built adaptor (Walmart, BigCommerce) |

### Listener Exports
Receive data pushed from an external system — no polling.

| Adaptor Type | Source System | Key Capabilities |
|-------------|--------------|-----------------|
| `WebhookExport` | Any webhook sender | Inbound HTTP listener, no connection required |
| `AS2Export` | AS2 EDI partners | EDI file reception |
| Distributed exports | NetSuite, Salesforce | Real-time event-driven push via installed listeners |

### File Transfer Exports
Read and optionally parse files from remote storage.

| Adaptor Type | Source System | Key Capabilities |
|-------------|--------------|-----------------|
| `FTPExport` | FTP/SFTP servers | CSV, XML, JSON, XLSX, EDI file parsing |
| `S3Export` | Amazon S3 | Object retrieval with parsing |
| `FileSystemExport` | Local filesystem | Requires on-premise agent |
| `SimpleExport` | Manual upload | Data loader, no connection needed |

## Import Adaptor Types

Imports write data to external systems. Choose based on the destination system:

### Record-Based Imports
Submit structured records to APIs, databases, or ERPs.

| Adaptor Type | Destination System | Key Capabilities |
|-------------|-------------------|-----------------|
| `HTTPImport` | REST/GraphQL APIs | POST, PUT, PATCH, DELETE; connector-assisted or manual |
| `NetSuiteDistributedImport` | NetSuite ERP | High-performance SuiteApp writes (add, update, upsert, delete, attach, detach) |
| `SalesforceImport` | Salesforce CRM | SOAP, REST, Bulk, Composite Record API |
| `RDBMSImport` | SQL databases | `per_record`, `bulk_insert`, or `bulk_load` query types |
| `MongodbImport` | MongoDB | Insert, update, upsert, delete |
| `DynamodbImport` | Amazon DynamoDB | Put, update, delete items |
| `JDBCImport` | JDBC databases | SQL insert/update via JDBC |
| `WrapperImport` | Stack connectors | Custom pre-built adaptor |

### File-Based Imports
Write or upload files to remote storage.

| Adaptor Type | Destination System | Key Capabilities |
|-------------|-------------------|-----------------|
| `FTPImport` | FTP/SFTP servers | CSV, XML, JSON, XLSX, EDI file generation and upload |
| `S3Import` | Amazon S3 | Object upload |
| `AS2Import` | AS2 EDI partners | EDI file transmission |
| `FileSystemImport` | Local filesystem | Requires on-premise agent |
| `HTTPImport` (file mode) | Cloud storage APIs | Google Drive, Box, Dropbox, Azure Blob file upload |

### AI Imports
Invoke AI models for classification, extraction, or safety checks.

| Adaptor Type | Purpose | Key Capabilities |
|-------------|---------|-----------------|
| `AiAgentImport` | LLM processing | OpenAI and Gemini models, structured output, tool use, reasoning |
| `GuardrailImport` | Safety checks | PII detection, content moderation, custom AI validation |

### Utility Imports
| Adaptor Type | Purpose | Key Capabilities |
|-------------|---------|-----------------|
| `ToolImport` | Invoke a Celigo Tool | Reusable operation blocks |

## Pre-Built Connectors

### HTTP Connectors (550+)
Pre-built connector definitions for common REST APIs. These provide pre-configured auth templates, base URLs, endpoint definitions, and resource schemas. Popular connectors include:

Shopify, Stripe, HubSpot, Salesforce Marketing Cloud, Microsoft Dynamics 365 Business Central, QuickBooks Online, Xero, Zendesk, ServiceNow, Jira, GitHub, Slack, Google Workspace, Amazon (Seller/Vendor Central), eBay, Magento, BigCommerce, WooCommerce, Square, PayPal, Twilio, SendGrid, Mailchimp, DocuSign, Box, Dropbox, Google Drive, OneDrive, Coupa, SAP, Workday, and many more.

Use the `list_http_connectors` tool to search and discover available connectors.

### Trading Partner Connectors (590+)
Pre-configured connection templates for onboarding EDI trading partners. Cover X12 and EDIFACT document standards including:

- **X12:** 850 (Purchase Order), 810 (Invoice), 856 (Ship Notice), 997 (Acknowledgment), 820 (Payment), 855 (PO Acknowledgment), 860 (PO Change), and more.
- **EDIFACT:** ORDERS, INVOIC, DESADV, CONTRL, APERAK, and more.

> EDI / trading partner connector lookup tools are not exposed by the current MCP scope. Browse the catalog via the Celigo UI when working on EDI integrations.

## Marketplace Templates (340+)
Pre-built integration templates that can be installed directly into an account. Templates provide complete flow configurations for common integration patterns between popular applications.

Use the `list_templates` tool to discover available templates. Always check templates before building integrations from scratch. (Detailed template metadata and template installation are deferred from the current MCP scope; users follow up in the Celigo UI to install.)
