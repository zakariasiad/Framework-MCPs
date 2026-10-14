# Runtime security and execution policy

This document describes the current enforcement boundary of Framework-MCPs. It is intentionally conservative: a manifest is configuration, not permission to bypass runtime checks.

## Default execution matrix

| Manifest policy | Tool risk | Current behavior |
| --- | --- | --- |
| `never` | Read-only, non-destructive, no approval required | May execute if the adapter's other restrictions pass |
| `onRisk` (default) | Low/medium, no approval flag, read-only and non-destructive | May execute if adapter checks pass |
| `onRisk` (default) | `requiresApproval`, destructive, high or critical risk | Blocked because interactive approval is not implemented |
| `always` | Any tool | Blocked because interactive approval is not implemented |

The runtime currently validates this policy when the server starts. As a result, a connector containing a tool that cannot execute automatically may be refused as a whole. This is deliberate fail-closed behavior; it avoids publishing a tool that the runtime cannot safely fulfill.

## Additional enforcement

- **API adapter:** HTTPS only, exact hostname allowlist, blocked-host checks, GET-only requests, no redirects, bounded timeout and response size.
- **File adapter:** read-only operations, configured workspace roots, path traversal and symlink containment checks, hidden/credential-related path blocking, extension allowlist, bounded reads and search budgets.
- **Tool schemas:** arguments are validated before execution. When `outputSchema` is declared, it must be a valid object schema; returned data is validated before structured output is emitted.
- **Connector lifecycle:** disabled connectors are refused, and duplicate tool names are rejected to avoid ambiguous MCP registrations.
- **Secrets:** credentials are supplied through runtime environment references rather than model-visible tool arguments; known secret values are redacted from API response text.

## Not yet implemented

- Interactive approval UI or approval callbacks
- Write-capable API operations
- Browser, arbitrary CLI, or database execution adapters
- Per-user authorization and tenant isolation
- Hosted HTTP transport and a cloud secret vault

Do not configure a high-risk operation and assume that a manifest flag creates an approval workflow. Until approval support exists, such execution remains blocked.
