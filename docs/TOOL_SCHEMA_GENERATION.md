# Tool Schema Generation

Framework-MCPs should generate MCP tool definitions from connector manifests and structured source metadata. The goal is to reduce manual work while keeping human review and security policy explicit.

## MCP tool shape

Each generated tool should include:

- `name`: stable tool identifier.
- `title`: human-readable label.
- `description`: clear behavior and limitations.
- `inputSchema`: JSON Schema for tool arguments.
- `outputSchema`: optional JSON Schema for structured results.
- `annotations`: risk and behavior hints when supported by the runtime and client.

The framework should always validate tool inputs before adapter execution.

## Generation sources

### Connector manifest

The manifest is the source of truth for the MVP.

Use it when:

- The target system has no formal schema.
- Browser or CLI workflows need manual definition.
- Security policy requires explicit review.

### OpenAPI

OpenAPI can generate HTTP API tools.

Mapping:

- Operation ID becomes tool name when present.
- Path/query/header/body parameters become input schema fields.
- Response schemas become output schemas when available.
- OAuth scopes become tool auth requirements.
- HTTP method and path inform default risk classification.

OpenAPI import must still require review before enabling write or destructive operations.

### GraphQL

GraphQL can generate query and mutation tools.

Mapping:

- Queries default to read operations.
- Mutations default to write or destructive until manually classified.
- Input types map to JSON Schema.
- Selection sets should be constrained to avoid excessive data exposure.

### CLI help output

CLI tools rarely expose perfect machine-readable schemas.

Recommended approach:

- Start with a manual manifest.
- Optionally parse help output to suggest arguments.
- Require human review before enabling execution.
- Keep every command in an allowlist.

### Browser workflows

Browser workflows should be defined manually first.

A browser workflow schema should include:

- Start URL or route pattern.
- Required auth state.
- Steps.
- Selectors.
- Extraction targets.
- Side-effect boundaries.
- Approval points.
- Expected output schema.

AI-assisted browser workflow generation can be added later, but generated workflows must be reviewed before use.

### Database metadata

Database metadata can suggest tools, but should not automatically expose arbitrary tables.

Recommended approach:

- Generate candidate read-only query templates.
- Require allowlist approval per table or view.
- Enforce row limits and parameterized inputs.
- Disable write queries by default.

## Naming rules

Tool names should be stable and readable.

Recommended format:

```text
connector_id.action_name
```

Examples:

```text
github.get_repository
crm.search_customers
browser_portal.read_invoice
local_files.search_csv
```

Avoid names that are vague or too powerful:

```text
run_anything
admin_action
do_task
click_button
execute_sql
```

## Input schema rules

- Use JSON Schema object inputs.
- Set `additionalProperties: false` where practical.
- Validate required fields.
- Add descriptions for fields that affect side effects.
- Do not include secret values in schema fields.
- Use enums for constrained actions.
- Use string formats for dates, URLs, emails, and IDs when helpful.
- Add length and range limits for user-controlled values.

## Output schema rules

- Prefer structured output for data tools.
- Include source references where possible.
- Include timestamps when data freshness matters.
- Return partial results explicitly.
- Keep raw HTML, screenshots, and logs out of normal outputs unless requested.
- Redact secrets and sensitive fields.

## Risk inference

The framework can infer initial risk, but human review should override it.

Default inference examples:

- HTTP `GET`: read-only unless endpoint semantics say otherwise.
- HTTP `POST`: write unless explicitly marked as safe.
- HTTP `DELETE`: destructive.
- GraphQL query: read-only.
- GraphQL mutation: write or destructive.
- CLI command: local-system and requires review.
- Browser click on submit/delete/send/publish/purchase: approval required.
- File read: local-system read.
- File write/delete: write or destructive.
- SQL SELECT: read-only if parameterized and allowlisted.
- SQL INSERT/UPDATE/DELETE/DDL: write or destructive.

## Review workflow

Generated tools should move through states:

1. `draft`: generated but not executable.
2. `reviewed`: schema and policy reviewed.
3. `enabled`: available to MCP clients.
4. `disabled`: blocked by policy or operator decision.

For open-source safety, example generated connectors should default to `draft` unless they target local fixtures or public test APIs.

## Versioning

Connector manifests should include a version.

Versioning rules:

- Breaking changes to tool names, input schemas, or output schemas require a major connector version bump.
- Additive optional fields can be minor changes.
- Documentation-only updates can be patch changes.

## Validation pipeline

Before enabling a connector:

1. Validate manifest schema.
2. Validate tool names.
3. Validate input and output schemas.
4. Validate risk metadata.
5. Check required secrets exist without exposing values.
6. Run adapter dry-run if available.
7. Run contract tests.
8. Produce a connector review report.
