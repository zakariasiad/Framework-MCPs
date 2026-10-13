# Connector Types

> **Current runtime status:** read-only HTTPS GET API connectors and a restricted local file-read adapter are implemented. Browser, CLI, database, write operations, and hosted transport remain design targets, not supported runtime features yet.

Framework-MCPs supports multiple connector families because different systems expose different access surfaces. The framework should prefer the most stable and authorized surface available.

## Selection order

Use this order when designing a connector:

1. Official API or SDK.
2. Stable export/import format.
3. Database or file interface controlled by the user.
4. Local CLI or documented automation interface.
5. Browser automation as a last resort.

Browser automation is useful, but it is the least stable and often has the highest security, reliability, and terms-of-service risk.

## Official API connectors

Use for systems with REST, GraphQL, OpenAPI, RPC, or SDK access.

Best for:

- SaaS products with documented APIs.
- Public data sources.
- Internal company services.
- Systems with OAuth or API key support.

Capabilities:

- Generate tool schemas from OpenAPI or GraphQL.
- Map HTTP requests and responses into MCP tool calls.
- Support pagination, filters, and typed outputs.
- Use OAuth scopes or API key permissions.

Risks:

- Over-broad OAuth scopes.
- Rate limit abuse.
- Unsafe write endpoints.
- Returning sensitive data to the model.

Default policy:

- `GET` and safe query operations can be read-only.
- `POST`, `PUT`, `PATCH`, and `DELETE` require explicit classification.
- Delete, publish, send, purchase, invite, permission, and payment operations require approval.

## Browser automation connectors

Use for websites without APIs when the user has legitimate access and the workflow is allowed.

Best for:

- Internal dashboards.
- Legacy web apps.
- Read-only extraction from user-authorized pages.
- Controlled form workflows with explicit approval.

Capabilities:

- Use Playwright to navigate pages.
- Extract structured data from DOM or accessible selectors.
- Fill forms when authorized.
- Capture screenshots for debugging during connector development.

Risks:

- Fragile selectors and UI changes.
- Hidden side effects from clicking buttons.
- Session cookie exposure.
- Prompt injection through page content.
- Terms-of-service violations.
- Bot detection and rate limits.

Default policy:

- Reading visible page content can be read-only if authorized.
- Form submission, deletion, purchase, publishing, sending, and settings changes require approval.
- CAPTCHA, 2FA, login bypass, paywall bypass, hidden scraping, and anti-bot evasion are not supported.

## CLI and local application connectors

Use for installed command-line tools or documented local automation interfaces.

Best for:

- Developer tools.
- Local converters.
- Build tools.
- Internal automation scripts.
- Desktop apps with official CLI control.

Capabilities:

- Expose allowlisted commands as MCP tools.
- Validate arguments with JSON Schema.
- Run commands in restricted working directories.
- Enforce timeouts and output limits.
- Support dry-run mode when available.

Risks:

- Shell injection.
- File deletion or modification.
- Reading secrets from local files.
- Long-running or resource-heavy processes.

Default policy:

- Avoid shell string execution.
- Execute binaries with argument arrays.
- Require explicit allowlists.
- Require approval for writes, deletes, network calls, package installation, or process control.

## Database connectors

Use for databases the user owns or is authorized to access.

Best for:

- Internal reporting.
- Operational dashboards.
- Data lookup tools.
- Controlled admin workflows.

Capabilities:

- Expose allowlisted query templates.
- Validate parameters.
- Return structured results.
- Enforce row limits and timeouts.
- Support read-only database users.

Risks:

- Data exfiltration.
- Arbitrary SQL generation.
- Slow or expensive queries.
- Write or destructive SQL.

Default policy:

- Use read-only credentials by default.
- Prefer query templates over arbitrary SQL.
- Block multi-statement SQL unless explicitly enabled.
- Require approval for writes and schema changes.

## File connectors

Use for local or mounted files the user wants to expose safely.

Best for:

- CSV, JSON, Markdown, text, and config files.
- Local project documentation.
- Data transformation tasks.
- Controlled file search.

Current implementation:

- Reads a manifest-declared relative path under an explicitly configured workspace root.
- Supports a limited allowlist of text-like extensions.
- Blocks hidden paths and parent-directory traversal, checks resolved paths remain within the root, and enforces output-size limits.

Planned capabilities:

- Parse structured formats.
- Expose search, summarize, filter, and transform tools.
- Optionally write generated files to a safe output directory.

Risks:

- Path traversal.
- Secret leakage.
- Accidental overwrite.
- Reading files outside the intended workspace.

Default policy:

- Use workspace allowlists.
- Deny paths outside configured roots.
- Never read common secret files by default.
- Require approval for file writes, overwrite, move, and delete operations.

## Hybrid connectors

Some systems need multiple adapters.

Examples:

- API for reads, browser automation for one workflow missing from the API.
- Database for reporting, CLI for maintenance tasks.
- File adapter for imports, API adapter for uploads.

Hybrid connectors should keep each tool bound to one adapter and one policy classification. Avoid hiding multiple side effects behind a single vague tool.
