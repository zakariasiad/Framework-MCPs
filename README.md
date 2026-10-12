# Framework-MCPs

Framework-MCPs is an open-source framework for building Model Context Protocol (MCP) connectors for websites, APIs, local tools, desktop/web software, databases, and files that do not yet provide native MCP support.

The goal is not to create one MCP server for one website. The goal is to provide a reusable connector framework that can generate safe, testable, and maintainable MCP servers from connector manifests, adapters, schemas, and policy rules.

## Why this project exists

Many useful services and applications expose data or actions but do not offer MCP servers. Some have official APIs, some only have a web UI, some work through local CLIs, and some live in files or databases. Framework-MCPs provides a structured way to wrap those systems as MCP tools while keeping authentication, permissions, testing, and user approval boundaries explicit.

## Core idea

Framework-MCPs turns a connector definition into MCP capabilities:

1. A connector manifest describes the target system, tools, auth, risk level, and runtime adapter.
2. An adapter executes the requested action through an official API, browser automation, local CLI, database driver, or file interface.
3. A schema generator exposes each action as an MCP tool with JSON Schema input and output contracts.
4. A policy engine decides whether the action is read-only, write, destructive, external, or sensitive.
5. A runtime hosts the generated MCP server through stdio for local use or Streamable HTTP for hosted use.

## Connector types

Framework-MCPs is designed around four first-class connector families:

- Official API connectors: REST, GraphQL, OpenAPI, SDK-based integrations.
- Browser automation connectors: Playwright-driven workflows for sites without APIs, limited to actions allowed by the user and the site's terms.
- CLI and local application connectors: wrappers around installed command-line tools or controlled local app workflows.
- Database and file adapters: safe access to SQL databases, document stores, local files, CSV, JSON, spreadsheets, and domain-specific files.

## What is feasible

Feasible automation includes:

- Reading public pages or authenticated pages the user has legitimate access to.
- Calling official APIs with user-provided credentials.
- Automating browser flows that a user could perform manually, with visible permissions and rate limits.
- Running local CLIs in a restricted workspace.
- Querying databases or files through allowlisted operations.
- Generating MCP tools from OpenAPI specs, GraphQL schemas, CLI help output, SQL metadata, or declarative manifests.

## What is not supported

Framework-MCPs must not be used for:

- Bypassing login, paywalls, CAPTCHA, 2FA, bot protections, or access controls.
- Scraping data that the user is not allowed to access.
- Evading a website's robots, terms, rate limits, or technical restrictions.
- Capturing passwords, session cookies, or private tokens without explicit user consent.
- Running arbitrary shell commands without policy checks and user approval.
- Performing destructive actions without a clear confirmation boundary.

## MVP scope

The first MVP should prove the framework with a small but complete vertical slice:

- Manifest format for connectors and tools.
- TypeScript runtime using the official MCP SDK.
- HTTP API adapter.
- Browser automation adapter using Playwright.
- Local CLI adapter with command allowlists.
- File adapter for local JSON/CSV/text reads.
- Tool schema generation from manifests and OpenAPI fragments.
- Secret handling through environment variables or a pluggable secret provider.
- Policy engine for read/write/destructive/sensitive actions.
- Approval hooks before write, destructive, external, or credential-sensitive operations.
- Unit tests, adapter contract tests, and recorded workflow tests.

## Repository structure

```text
.
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONNECTOR_TYPES.md
│   ├── FEASIBILITY.md
│   ├── MVP.md
│   ├── RUNTIME_DEPLOYMENT.md
│   ├── SECURITY_MODEL.md
│   └── TOOL_SCHEMA_GENERATION.md
├── examples/
│   └── connectors/
├── schemas/
│   └── connector.manifest.schema.json
├── CONTRIBUTING.md
├── LICENSE
├── README.md
└── SECURITY.md
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [MVP Plan](docs/MVP.md)
- [Connector Types](docs/CONNECTOR_TYPES.md)
- [Tool Schema Generation](docs/TOOL_SCHEMA_GENERATION.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Runtime and Deployment](docs/RUNTIME_DEPLOYMENT.md)
- [Feasibility and Limitations](docs/FEASIBILITY.md)

## Status

This project is at the product and technical design stage. The initial repository defines the vision, architecture, security model, connector manifest, and MVP plan before implementation begins.

## License

MIT License. See [LICENSE](LICENSE).
