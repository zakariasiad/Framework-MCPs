# Framework-MCPs

**Turn authorized software capabilities into reusable Model Context Protocol (MCP) tools.**

Framework-MCPs is an open-source, manifest-driven framework intended to help developers expose APIs, websites, command-line tools, databases, and files to compatible AI clients through a consistent MCP interface.

The goal is bigger than building a separate MCP server for every service: define a connector once, validate its capabilities and permissions, route execution through the appropriate adapter, and make the resulting tools reusable and maintainable.

> **Project status: early MVP.** The repository now includes manifest validation, a read-only MCP stdio runtime for public HTTPS GET APIs, an OpenAPI 3.x-to-manifest generator, tests, and CI. This is not yet a general-purpose adapter framework: authenticated APIs and browser, CLI, database, file, write-operation, hosted HTTP, and approval-UI support remain unimplemented.

## Why Framework-MCPs?

Useful software does not always provide an MCP server. Some systems have an API, some expose only a browser interface, and others are accessible through a local CLI, database, or file. Integrating each one independently creates repeated work and inconsistent security controls.

Framework-MCPs aims to provide shared infrastructure for:

- **Connector manifests** that describe tools, schemas, authentication references, adapter settings, and risk.
- **MCP tool registration** from validated connector definitions.
- **Adapter-based execution** for APIs, browser workflows, CLI commands, databases, and files.
- **Policy enforcement** for permissions, risk levels, allowlists, limits, and approvals.
- **Secret isolation** so credentials are resolved by the runtime instead of being exposed as model-visible tool arguments.
- **Testing and reuse** so connector definitions can be validated and shared rather than treated as one-off scripts.

## How it is intended to work

```text
Connector definition / OpenAPI specification
                    |
                    v
          Parse and validate manifest
                    |
                    v
             Tool registry
                    |
                    v
        MCP runtime and input validation
                    |
                    v
       Policy check + approval when needed
                    |
                    v
             Adapter router
       /       /       |       \       \
     API    Browser    CLI   Database   Files
                    |
                    v
         Structured MCP tool result
```

1. **Define:** create a connector manifest or import a supported specification.
2. **Validate:** check the connector and tool schemas before execution.
3. **Register:** expose the declared capabilities as MCP tools.
4. **Authorize:** apply least-privilege policy and request confirmation for risky actions.
5. **Execute:** route the call to the selected adapter with credentials supplied by a secret provider.
6. **Return and audit:** return bounded, structured results and record action metadata without logging secrets.

This is the intended architecture; implementation completeness must be assessed against the current code and tests.

## Planned connector types

| Connector type | Intended use | Initial safety boundary |
|---|---|---|
| HTTP/API | REST APIs and operations described by OpenAPI; other protocols can follow | Explicit hosts, methods, timeouts, and secret references |
| Browser | User-authorized workflows on websites without a suitable API | Isolated contexts, rate limits, and approval before consequential submissions |
| CLI | Wrap installed command-line tools | Command allowlists, argument arrays, restricted working directory, timeout, and output caps |
| Files | Read selected local text, JSON, CSV, and Markdown files | Workspace roots, path validation, and deny-by-default access |
| Database | Expose allowlisted queries and metadata | Read-only access by default, parameterized queries, row limits, and timeouts |

Prefer a stable official API over browser automation whenever one is available. Connector generation should produce a reviewable draft, not silently grant broad access.

## Security principles

Framework-MCPs is designed around a deny-by-default model:

- Apply least privilege and prefer read-only operations.
- Validate tool inputs against schemas before dispatch.
- Keep secrets outside model-visible arguments and redact them from logs.
- Restrict network destinations, file paths, and local commands.
- Require explicit approval for destructive, financial, externally visible, or otherwise high-risk side effects.
- Treat retrieved pages, files, messages, and database content as untrusted data.
- Fail closed when a required policy or permission decision is missing.
- Apply timeouts, output-size limits, and rate limits.

The framework must not bypass authentication, CAPTCHA, paywalls, 2FA, access controls, or a target site's technical restrictions. It must not access data without authorization or execute arbitrary shell commands without policy checks.

See [Security Model](docs/SECURITY_MODEL.md) and [Authentication and Secrets](docs/AUTH_SECRETS.md).

## Current repository contents

- `src/openapi.ts` — OpenAPI 3.x import and draft manifest generation for GET operations.
- `src/runtime.ts` — read-only HTTPS GET MCP stdio runtime with URL allowlists, query/path parameters, timeouts, and output limits.
- `src/cli.ts` — manifest validation, tool listing, OpenAPI import, and stdio serving.
- `schemas/connector.manifest.schema.json` — connector manifest schema.
- `examples/openapi/sample-catalog.yaml` — OpenAPI generator fixture.
- `examples/connectors/` — example connector definitions.
- `docs/ARCHITECTURE.md` — component boundaries and execution flow.
- `docs/MVP.md` — phased MVP plan and acceptance criteria.
- `docs/CONNECTOR_TYPES.md` — connector types and trade-offs.
- `docs/TOOL_SCHEMA_GENERATION.md` — schema-generation design.
- `docs/AUTH_SECRETS.md` — authentication and secret handling.
- `docs/SECURITY_MODEL.md` — policy and security boundaries.
- `docs/TESTING.md` — testing strategy.
- `docs/RUNTIME_DEPLOYMENT.md` — runtime and deployment design.
- `docs/FEASIBILITY.md` — feasibility, constraints, and limitations.
- `CONTRIBUTING.md` — contribution guidance.
- `SECURITY.md` — security reporting guidance.

## Roadmap

### Phase 1 — Prove one complete path
- [x] Load and validate a manifest.
- [x] Register tools deterministically.
- [x] Run a real MCP server with a read-only HTTP API connector.
- [x] Add automated tests, CI, and setup instructions.
- [ ] Add a full MCP client integration smoke test.

### Phase 2 — Make the core reliable
- Enforce input validation and runtime policy.
- Resolve secrets without exposing their values.
- Add bounded outputs, timeouts, structured errors, and audit events.
- Test positive and negative security cases.

### Phase 3 — Generate connectors
- [x] Import a useful subset of OpenAPI 3.x.
- [x] Generate reviewable draft manifests for GET operations.
- [x] Warn when non-GET operations are skipped.
- [ ] Expand coverage for advanced parameter serialization, callbacks, webhooks, and external references.

### Phase 4 — Expand adapters
- Add tested file and restricted CLI adapters.
- Add browser workflows against local test fixtures.
- Add database access using allowlisted query templates.

### Phase 5 — Support reuse and operations
- Version connector packages and define compatibility rules.
- Add examples, diagnostics, connector validation, and CI.
- Evaluate local and hosted runtime deployment.

These phases are priorities, not a promise that all features are currently implemented.

## Getting started

Requirements: Node.js 20.11 or newer and npm.

Clone the repository, install dependencies, and run the manifest tools:

```bash
git clone https://github.com/zakariasiad/Framework-MCPs.git
cd Framework-MCPs
npm install
npm run typecheck
npm test
npm run validate:examples
npm run build
```

The CLI supports manifest validation, listing declared tools, importing OpenAPI, and starting the read-only stdio runtime:

```bash
npm run dev -- validate examples/connectors/public-http-api.yaml
npm run dev -- list-tools examples/connectors/public-http-api.yaml
npm run dev -- serve examples/connectors/public-http-api.yaml
npm run dev -- import-openapi examples/openapi/sample-catalog.yaml generated/catalog.yaml
```

The OpenAPI importer supports OpenAPI 3.x documents with a root HTTPS server URL and emits draft manifests for GET operations. It resolves local component references, creates path/query input schemas, and warns about skipped non-GET operations. Review every generated manifest before use. External references and advanced OpenAPI serialization rules are not supported.

The stdio runtime can execute allowlisted HTTPS GET operations for API connectors with `auth.type: none`. It supports scalar/array query values and path parameters, validates tool arguments, bounds response bodies, and rejects redirects. Authenticated connectors, write operations, browser/CLI/database/file adapters, hosted HTTP transport, and a full approval UI are not implemented yet. Risky operations are blocked rather than silently executed. Do not put real credentials in example manifests.

At this stage, also review the schema, examples, and design documents:

1. Read [Architecture](docs/ARCHITECTURE.md).
2. Review the [connector manifest schema](schemas/connector.manifest.schema.json).
3. Explore [example connectors](examples/connectors/).
4. Follow the [MVP plan](docs/MVP.md).
5. Read the [contribution guide](CONTRIBUTING.md).

A passing manifest validation only confirms the manifest matches the schema; it does not prove the upstream API behaves as expected or that the connector is appropriate for production. Generated connectors are drafts and require human review.

## Development principles

- TypeScript and Node.js are the planned first runtime.
- Prefer the official MCP SDK and standard JSON Schema contracts.
- Prefer official APIs over browser automation.
- Keep adapters small and independently testable.
- Use explicit error categories and deterministic tool names.
- Never build shell commands by interpolating untrusted input.
- Test denial paths and failure cases, not only successful calls.
- Keep docs, examples, and the manifest schema aligned.

## Contributing

Issues and pull requests are welcome. Useful early contributions include schema tests, fixture services, OpenAPI import experiments, security test cases, adapter contracts, and documentation improvements.

Before contributing a connector, document its target, access method, authentication requirements, permissions, tool risk, approval rules, rate limits, and test plan. Never commit real credentials, session cookies, or private data.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
