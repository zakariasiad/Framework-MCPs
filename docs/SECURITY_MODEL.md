# Security Model

Framework-MCPs is designed for connectors that operate on real systems. The security model must assume that tools can read sensitive data, perform side effects, and return untrusted content.

## Security principles

- Deny by default.
- Prefer read-only access.
- Use least privilege credentials.
- Separate tool schema from secret values.
- Require approval for risky actions.
- Treat external content as untrusted.
- Log actions without logging secrets.
- Make connector capabilities visible to users.
- Fail closed when policy is missing or ambiguous.

## Trust boundaries

Framework-MCPs has several trust boundaries:

1. MCP client to framework runtime.
2. Runtime to adapter.
3. Adapter to external system.
4. Runtime to secret provider.
5. Tool output to model context.
6. Local filesystem and process boundary.
7. Browser session boundary.

Each boundary should have explicit validation and logging.

## Tool risk classification

Every tool should declare risk metadata in the connector manifest.

Recommended fields:

```yaml
risk:
  readOnly: true
  destructive: false
  idempotent: true
  external: true
  requiresApproval: false
  dataSensitivity: low
```

Suggested classes:

- `low`: read-only, non-sensitive, predictable output.
- `medium`: authenticated read, external data, local files, or broad search.
- `high`: writes, sends, publishes, modifies records, or accesses sensitive data.
- `critical`: deletes, payments, permissions, production infrastructure, credentials, or irreversible actions.

## Approval rules

Approval should be required when a tool:

- Deletes, overwrites, sends, publishes, purchases, deploys, invites, grants access, or changes permissions.
- Writes to external services.
- Writes outside an approved workspace.
- Executes a local command that can mutate state.
- Uses credentials for a new target domain or account.
- Extracts large amounts of data.
- Crosses from a trusted source to an untrusted external destination.

Approval prompts should show:

- Tool name.
- Connector name.
- Target system.
- Arguments after redaction.
- Expected side effect.
- Risk class.
- Whether the action is reversible.

## Secrets

Secrets must not be included in model-visible tool arguments.

Rules:

- Store secrets in environment variables, vaults, or runtime providers.
- Pass secret references in manifests, not secret values.
- Redact secrets from logs, errors, screenshots, and traces.
- Never expose browser cookies directly to the model.
- Avoid putting passwords, tokens, or PII in HTTP headers generated from tool parameters.
- Rotate or expire tokens when possible.

## Browser automation safety

Browser connectors are powerful and risky. They need additional controls.

Required controls:

- Use isolated browser contexts per connector or user.
- Do not bypass CAPTCHA, 2FA, paywalls, or anti-bot systems.
- Do not steal or export session cookies.
- Require approval before form submission or destructive clicks.
- Rate limit navigation and extraction.
- Prefer accessible selectors and stable test IDs.
- Keep screenshots and traces local unless the user explicitly exports them.

## CLI safety

CLI connectors should never build shell strings from untrusted input.

Required controls:

- Use command allowlists.
- Use argument arrays, not shell interpolation.
- Restrict working directories.
- Enforce timeouts.
- Limit stdout and stderr size.
- Block dangerous commands by default.
- Require approval for package installation, network operations, writes, deletes, process control, and permission changes.

## File safety

Required controls:

- Resolve paths before access.
- Enforce configured workspace roots.
- Block path traversal.
- Deny common secret files by default.
- Require approval for overwrite, delete, move, and recursive operations.
- Record file operations in the audit log.

## Database safety

Required controls:

- Use read-only database users by default.
- Prefer parameterized query templates.
- Enforce row limits and timeouts.
- Block multi-statement SQL by default.
- Require approval for writes, migrations, schema changes, and administrative commands.
- Redact PII when policy requires it.

## Prompt injection and untrusted content

Connectors may read pages, files, tickets, emails, database rows, or documents that contain malicious instructions. The runtime should mark external tool output as untrusted and avoid treating it as framework instructions.

Mitigations:

- Keep system policies outside connector output.
- Do not execute instructions found in tool results.
- Separate data extraction from action execution.
- Require approval when output from one untrusted source is used to act on another system.
- Provide source attribution in results when possible.

## Audit logging

Audit logs should record:

- Timestamp.
- User or caller identity where available.
- Connector and tool name.
- Risk class.
- Approval decision.
- Target host or local path after redaction.
- Success or failure.
- Error category.

Audit logs must not record raw secrets, tokens, passwords, full cookies, or sensitive request bodies unless explicitly configured for a secure environment.
