# MVP Plan

The MVP should prove that Framework-MCPs can turn connector definitions into safe MCP tools across multiple connector families. It should not try to support every website or every application immediately.

## MVP outcome

A developer can create a connector manifest, run the framework, and expose a small set of MCP tools through stdio or Streamable HTTP.

A user can see which tools exist, what they do, what credentials they require, and which calls need approval before execution.

## Phase 0: Repository foundation

Deliverables:

- Project README.
- Architecture documentation.
- Connector manifest schema.
- Security model.
- Example connector manifests.
- Contribution and security policies.

Success criteria:

- A new contributor understands the project's purpose in under 10 minutes.
- The project clearly distinguishes supported automation from unsupported access bypasses.

## Phase 1: Manifest and tool registry

Deliverables:

- JSON Schema for connector manifests.
- Manifest loader.
- Manifest validator.
- Tool registry.
- Tool name collision handling.
- Risk classification fields.

Success criteria:

- A connector manifest can define at least three tools.
- Invalid manifests fail with useful validation errors.
- Tool definitions are deterministic and MCP-compatible.

## Phase 2: HTTP API adapter

Deliverables:

- [x] Read-only REST GET adapter with path and query mapping.
- [x] Environment-backed API key and bearer-token headers.
- [x] Bounded response bodies, timeouts, redirect rejection, and known-secret redaction.
- [x] OpenAPI import prototype for public GET operations.
- [ ] Structured output-schema validation and request-body mapping.
- [ ] OAuth authorization and token lifecycle.

Success criteria:

- A simple REST service can be exposed as MCP tools from a manifest.
- Secrets are never printed in logs or tool results.
- Read and write tools get different policy handling.

## Phase 3: Browser automation adapter

Deliverables:

- Playwright-based browser adapter.
- Browser context lifecycle.
- Selector/action workflow manifest.
- Screenshot and DOM snapshot debugging for development.
- Approval before form submit, purchase, delete, send, publish, or irreversible actions.

Success criteria:

- A connector can log into a user-authorized site and read allowed data.
- A connector can execute a simple workflow only after policy approval.
- The adapter refuses CAPTCHA bypass, 2FA bypass, hidden session theft, and unauthorized scraping.

## Phase 4: CLI and local app adapter

Deliverables:

- Restricted command runner.
- Command allowlist.
- Argument schema validation.
- Working directory restrictions.
- Timeout and output size limits.
- Dry-run support when the underlying command supports it.

Success criteria:

- A connector can wrap a safe local CLI command as an MCP tool.
- Shell injection is prevented by avoiding string-built shell commands.
- Risky commands require approval.

## Phase 5: File and database adapters

Deliverables:

- [x] Restricted read-only file adapter for approved text-like extensions.
- [x] Workspace-root enforcement, traversal and hidden-file blocking, real-path containment, and output limits.
- [ ] Structured CSV/JSON parsing and controlled file search.
- [ ] Optional write support behind policy approval.
- [ ] SQL adapter using query templates, not arbitrary model-generated SQL by default.
- [ ] Database connection secret handling.

Success criteria:

- The framework can expose safe file reads as MCP tools.
- Database tools can run allowlisted read queries.
- Write queries are disabled by default and require explicit policy.

## Phase 6: Testing and quality

Deliverables:

- [x] Unit tests for manifest validation and OpenAPI generation.
- [x] API auth, output redaction, allowlist, and path policy tests.
- [x] File-read tests for traversal, hidden files, extensions, and output limits.
- [x] MCP stdio client smoke test.
- [ ] Broader adapter contract tests and recorded HTTP tests.
- [ ] Browser workflow tests against local fixtures.
- [ ] Security tests for blocked commands and approval enforcement.

Success criteria:

- All MVP adapters have positive and negative tests.
- Security boundary tests fail closed.
- Example connectors run in CI without real secrets.

## MVP non-goals

The MVP should not attempt to:

- Support every authentication flow.
- Bypass anti-bot systems or CAPTCHA.
- Automate websites without user authorization.
- Infer reliable browser workflows from natural language alone.
- Run arbitrary shell commands.
- Generate perfect connectors without review.
- Replace official APIs when a stable API exists.

## Recommended first demo connectors

1. Public HTTP API demo: read-only weather, GitHub public repository metadata, or another public API.
2. Local file demo: read a CSV file and expose search/filter tools.
3. Browser demo: local test website or sandbox app, not a real third-party service at first.
4. CLI demo: wrap a harmless command such as a project linter or local text converter.

## Definition of done for MVP

- A developer can install the framework locally.
- A developer can run at least four connector examples.
- Generated MCP tools include input schemas, output schemas where possible, and risk annotations.
- Read-only calls can run without approval when policy allows it.
- Write and destructive calls are blocked or require approval.
- Secrets are resolved outside model-visible arguments.
- Tests verify the main security boundaries.
