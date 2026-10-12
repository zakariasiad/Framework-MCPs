# Runtime and Deployment

Framework-MCPs should support both local and hosted execution. Local execution is useful for desktop clients and local files. Hosted execution is useful for teams, shared connectors, and web-accessible MCP clients.

## Runtime modes

### Local stdio mode

Best for:

- Desktop MCP clients.
- Local files.
- Local CLI tools.
- User-specific browser automation.
- Development and testing.

Characteristics:

- Runs as a child process launched by the MCP client.
- Communicates through stdio.
- Uses local environment variables or local secret storage.
- Has access only to configured workspace paths and allowlisted commands.

### Hosted Streamable HTTP mode

Best for:

- Team deployments.
- Shared API connectors.
- Web services.
- Multi-user environments.
- Centralized audit logging.

Characteristics:

- Runs as an HTTP service.
- Authenticates every request.
- Uses per-user or per-tenant credentials.
- Can scale horizontally if state is externalized.
- Needs stricter network, tenant, and audit boundaries.

## Runtime packages

Recommended future package layout:

```text
packages/
  core/              # manifest loading, policy, registry, shared types
  runtime-stdio/     # local stdio server
  runtime-http/      # Streamable HTTP server
  adapter-api/       # REST, GraphQL, OpenAPI
  adapter-browser/   # Playwright workflows
  adapter-cli/       # restricted command runner
  adapter-files/     # safe file access
  adapter-db/        # SQL and database templates
  cli/               # developer command line
```

## CLI commands

Future CLI shape:

```text
fmcp init
fmcp validate ./connectors/acme.yaml
fmcp inspect ./connectors/acme.yaml
fmcp run --stdio ./connectors/acme.yaml
fmcp run --http ./connectors/acme.yaml --port 3333
fmcp test ./connectors/acme.yaml
fmcp generate openapi ./openapi.json --out ./connectors/acme.yaml
```

## Configuration

Configuration should be split into:

- Connector manifests: portable connector definitions.
- Runtime config: deployment-specific settings.
- Secret config: references to secrets, never raw values in committed manifests.
- Policy config: organization or user-level rules.

Example runtime config:

```yaml
runtime:
  mode: stdio
  auditLog: ./.fmcp/audit.jsonl
  workspaceRoots:
    - ./examples/data
  approval:
    mode: interactive
  secrets:
    provider: env
```

## State management

The framework should avoid implicit connection state. When state is needed, use explicit handles with scoped authorization checks.

Examples:

- Browser session handle.
- Temporary file handle.
- Import job handle.
- Database transaction handle.

Rules:

- Handles must be opaque.
- Handles must expire.
- Handles must be bound to the caller identity where auth exists.
- Possession of a handle must not replace authorization.

## Deployment options

### Developer local

- Single user.
- stdio transport.
- Environment variable secrets.
- Local audit log.
- Best for early MVP.

### Team self-hosted

- Streamable HTTP transport.
- OAuth or reverse-proxy identity.
- Central secret provider.
- Central audit log.
- Tenant-aware policies.

### Containerized runtime

- One or more connectors per container.
- Network egress allowlists.
- Read-only filesystem where possible.
- Mounted workspace only when needed.
- Browser adapter runs in a hardened container profile.

### Serverless or edge

Useful for pure API connectors, but not ideal for browser automation or local CLI connectors.

Limitations:

- Browser automation may exceed runtime limits.
- Local files and CLIs are not available.
- Long-running workflows need task or job support.
- Secret and session management must be externalized.

## Observability

Minimum observability:

- Structured logs.
- Audit logs.
- Tool call duration.
- Adapter error type.
- Approval decisions.
- Rate limit events.
- Secret resolution failures without secret values.

Optional future observability:

- OpenTelemetry traces.
- Connector health checks.
- Browser trace artifacts for development mode.
- Policy decision reports.

## Rate limits and quotas

The runtime should support:

- Per-tool rate limits.
- Per-connector rate limits.
- Per-user rate limits in hosted mode.
- External API backoff.
- Browser navigation throttling.
- Output size limits.

## Failure behavior

Default failure behavior should be conservative:

- Invalid manifest: connector does not load.
- Missing secret: protected tools are disabled or return authorization required.
- Ambiguous policy: approval required or tool disabled.
- Adapter timeout: cancel and return a tool execution error.
- Output validation failure: return an error and log details without leaking sensitive data.
