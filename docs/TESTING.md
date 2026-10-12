# Testing Strategy

Framework-MCPs needs strong tests because connectors can touch real accounts, files, commands, browsers, and databases. Tests should prove both functionality and safety boundaries.

## Test pyramid

### Unit tests

Use for pure framework logic.

Targets:

- Manifest parsing.
- Manifest validation.
- Tool name generation.
- JSON Schema generation.
- Risk classification.
- Approval decision logic.
- Secret redaction.
- Path validation.

### Adapter contract tests

Every adapter should pass the same contract shape:

- Receives validated tool input.
- Receives secrets through context only.
- Respects timeout and output limits.
- Returns structured results.
- Returns safe errors.
- Cleans up temporary resources.

### Integration tests

Use local fixtures instead of real services where possible.

Targets:

- Local HTTP test server.
- Local static website for browser workflows.
- Temporary directory for file adapter.
- SQLite database for database adapter.
- Fake CLI command for CLI adapter.

### End-to-end MCP tests

Validate full MCP behavior:

- `tools/list` returns expected tools.
- `tools/call` validates arguments.
- Read-only tools execute without approval when policy allows it.
- Risky tools request approval or are blocked.
- Tool results match output schemas.
- Errors are returned as tool execution errors when recoverable.

## Security tests

Security tests should be first-class, not optional.

Required negative tests:

- Path traversal is blocked.
- Secret values are redacted from logs and errors.
- Arbitrary shell commands are blocked.
- CLI shell interpolation is not used.
- Writes require approval.
- Destructive actions require approval.
- Browser submit actions require approval.
- SQL templates reject unbound or unexpected parameters.
- Output size limits are enforced.
- Missing policy fails closed.

## Browser workflow tests

Browser tests should run against local fixtures first.

Recommended fixtures:

- Login-required sample app.
- Dashboard page with stable selectors.
- Form submission page.
- Delete button page that must require approval.
- Page containing malicious prompt-injection text to verify it is treated as data.

## Recorded API tests

For API connectors, use recorded responses only after redaction.

Rules:

- Never commit real tokens.
- Redact IDs when needed.
- Keep fixtures small.
- Include rate limit and error responses.
- Test retries and backoff without hitting real APIs.

## Approval tests

Approval tests should verify the policy engine and approval gateway together.

Scenarios:

- Read-only API call proceeds.
- Write API call pauses for approval.
- Destructive call is blocked when approvals are disabled.
- Approved action records an audit entry.
- Denied action does not call the adapter.

## CI strategy

MVP CI should run:

- Manifest schema validation.
- Markdown checks.
- Unit tests.
- Adapter contract tests with local fixtures.
- Security negative tests.

CI should not require production credentials.

## Manual testing

Some workflows need manual checks during development:

- OAuth login flows.
- Browser workflows against real third-party sites.
- Desktop app integrations.
- Production deployment configuration.

Manual tests should be documented as repeatable checklists before a connector is marked `enabled`.
