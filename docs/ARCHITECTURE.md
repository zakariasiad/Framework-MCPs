# Architecture

Framework-MCPs is a manifest-driven framework for generating and running MCP connectors. It separates what a connector can do from how it does it, and separates execution from policy decisions.

## Design goals

- Reusable: one framework can support many target systems.
- Safe by default: risky actions require explicit policy and approval hooks.
- Adapter-based: APIs, browsers, CLIs, databases, and files use different execution backends but expose the same MCP surface.
- Schema-first: tools have clear JSON Schema inputs and outputs.
- Testable: connectors can be validated without calling production systems.
- Transparent: users and clients can see what tools exist and what risk category each tool belongs to.

## High-level components

```text
MCP Client
   |
   | stdio or Streamable HTTP
   v
MCP Runtime
   |
   +-- Tool Registry
   +-- Schema Generator
   +-- Policy Engine
   +-- Approval Gateway
   +-- Secret Resolver
   +-- Adapter Router
           |
           +-- API Adapter
           +-- Browser Adapter
           +-- CLI Adapter
           +-- Database Adapter
           +-- File Adapter
```

## Component responsibilities

### MCP Runtime

Hosts the generated MCP server and exposes tools, resources, and prompts where appropriate. The MVP should focus on tools first.

Runtime responsibilities:

- Load connector manifests.
- Validate manifests against the connector schema.
- Register MCP tools in deterministic order.
- Dispatch tool calls to adapters.
- Return structured results when an output schema exists.
- Support stdio for local desktop clients.
- Support Streamable HTTP for hosted or team deployments.

### Tool Registry

Builds the list of available tools from connector manifests and auth scope. It should prevent naming collisions by prefixing tools with connector identifiers when necessary.

Example:

```text
notion.search_pages
acme_crm.get_customer
local_files.read_csv
```

### Schema Generator

Generates MCP-compatible `inputSchema` and optional `outputSchema` definitions.

Inputs can come from:

- Connector manifests.
- OpenAPI operations.
- GraphQL schema introspection.
- CLI help output plus manual annotations.
- Database metadata plus allowlisted query templates.
- File format definitions.

### Policy Engine

Classifies actions before execution.

Suggested policy labels:

- `read`: reads data without changing the target system.
- `write`: creates or updates data.
- `destructive`: deletes, overwrites, submits, purchases, sends, publishes, or triggers irreversible side effects.
- `credential_sensitive`: touches credentials, tokens, sessions, or secrets.
- `external`: talks to external networks or third-party systems.
- `local_system`: touches the user's local filesystem, processes, or apps.

### Approval Gateway

Sits between `tools/call` and adapter execution. It decides whether the call can proceed automatically or needs user confirmation.

Approval should be required for:

- Destructive actions.
- Financial or irreversible actions.
- Sending messages or publishing content.
- Browser workflows that submit forms.
- Shell or CLI calls that modify state.
- File writes outside a configured workspace.
- Any action using credentials for the first time.

### Secret Resolver

Provides credentials to adapters without exposing them to the model or logs.

MVP secret sources:

- Environment variables.
- Local encrypted secret store.
- Runtime-provided OAuth token.

Future secret sources:

- Cloud secret managers.
- Per-tenant vaults.
- Browser profile session brokers.

### Adapter Router

Routes a tool call to the correct adapter based on the connector manifest.

The adapter interface should be stable:

```ts
interface ConnectorAdapter {
  prepare(context: ConnectorContext): Promise<void>;
  execute(call: ToolCall, context: ConnectorContext): Promise<ToolResult>;
  cleanup?(context: ConnectorContext): Promise<void>;
}
```

## Data flow

1. Framework loads connector manifests.
2. Manifests are validated.
3. Schema generator creates MCP tool definitions.
4. MCP client lists tools.
5. Model requests a tool call.
6. Runtime validates input against schema.
7. Policy engine classifies risk.
8. Approval gateway confirms when needed.
9. Secret resolver injects credentials into the adapter context.
10. Adapter performs the operation.
11. Runtime validates output and returns MCP content and structured data.
12. Audit log records the action without leaking secrets.

## MVP technology choice

Recommended MVP stack:

- TypeScript for the first runtime and CLI.
- Official MCP TypeScript SDK.
- Playwright for browser automation.
- Ajv for JSON Schema validation.
- Zod or TypeBox for internal schema definitions.
- Node.js child process APIs for restricted CLI execution.
- SQLite or JSONL for local audit logs.

Python support can be added later for data-heavy adapters and enterprise automation workflows.
