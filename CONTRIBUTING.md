# Contributing

Thank you for helping build Framework-MCPs.

This project is early. Contributions should prioritize clear architecture, safety, tests, and reusable connector patterns over one-off integrations.

## Contribution principles

- Prefer official APIs over browser automation.
- Keep connectors least-privilege by default.
- Treat generated connector manifests as drafts until reviewed.
- Add tests for safety boundaries, not only happy paths.
- Do not commit real credentials, tokens, cookies, or private data.
- Document limitations honestly.

## Good first contribution areas

- Improve connector manifest examples.
- Add local test fixtures.
- Add schema validation tests.
- Draft adapter interfaces.
- Improve documentation for a connector type.
- Add security test cases.

## Connector contribution checklist

Before proposing a connector, include:

- Target system name and access method.
- Connector type: API, browser, CLI, database, file, or hybrid.
- Authentication model.
- Required scopes or permissions.
- Tool list with risk classification.
- Approval requirements.
- Rate limit assumptions.
- Feasibility score.
- Tests or fixture plan.

## Code style

The initial implementation uses TypeScript and Node.js. When adding code, prefer:

- Clear types.
- Small adapter interfaces.
- JSON Schema validation.
- No shell string construction from user input.
- Explicit error categories.
- Secret redaction in logs.

## Pull request expectations

A pull request should include:

- Clear description of the change.
- Linked issue or design note when relevant.
- Tests for new behavior.
- Security considerations for new adapters or tools.
- Documentation updates for user-facing behavior.

## Security-sensitive changes

Changes touching auth, secrets, browser sessions, CLI execution, filesystem access, database access, or approval policy should include negative tests.

Examples:

- Refusing path traversal.
- Blocking unapproved destructive actions.
- Redacting secrets.
- Restricting command execution.
- Enforcing output limits.
