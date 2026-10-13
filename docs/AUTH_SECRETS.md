# Authentication and Secrets

Framework-MCPs must support many authentication models without exposing secrets to language models or committed connector manifests.

## Goals

- Keep secret values out of manifests.
- Keep secret values out of model-visible tool arguments.
- Support per-user credentials where possible.
- Support least-privilege scopes.
- Make auth requirements visible before a tool is called.
- Allow connectors to be developed without production credentials.

## Current runtime support

Only `none`, `apiKey`, and `bearerToken` are executable, and only for allowlisted HTTPS GET operations. Other auth types fail closed. Use the `env:` prefix explicitly; plain variable names are not accepted.

## Supported MVP auth types

### None

Use for public APIs, local files, and local fixtures.

```yaml
auth:
  type: none
```

### API key

Use when a service requires a static API key.

```yaml
auth:
  type: apiKey
  secretRef: env:ACME_API_KEY
```

The runtime resolves `env:VARIABLE_NAME` references from its process environment. API keys use the `x-api-key` header.

### Bearer token

Use for services where the user or deployment provides a bearer token.

```yaml
auth:
  type: bearerToken
  secretRef: env:ACME_BEARER_TOKEN
```

### OAuth 2.x

Use for services with delegated user authorization.

```yaml
auth:
  type: oauth2
  scopes:
    - tickets:read
    - tickets:write
```

MVP can start by accepting externally supplied tokens. A later version can implement the full authorization flow.

### Browser session

Use for browser automation where the user has an authorized browser session.

```yaml
auth:
  type: browserSession
  secretRef: user-managed-browser-session
```

Browser sessions must not expose raw cookies to the model or connector manifest.

### Database connection

Use for database adapters.

```yaml
auth:
  type: databaseConnection
  secretRef: REPORTING_DB_URL
```

Read-only database credentials are strongly preferred.

## Secret providers

MVP providers:

- Environment variables.
- Local encrypted file store.
- Runtime-injected request context.

Future providers:

- Cloud secret managers.
- Operating system credential stores.
- Team vaults.
- OAuth token brokers.

## Secret reference rules

- `secretRef` names the secret; it is not the secret value.
- Secret values are resolved only at execution time.
- Secret values are available only to the adapter that needs them.
- Secret values must be redacted from logs and errors.
- Secret values must not be returned as tool output.

## Scope strategy

Use progressive least privilege:

- Start with read-only scopes.
- Ask for write scopes only when a write tool is enabled.
- Ask for destructive scopes only for explicit destructive tools.
- Do not request broad admin scopes for normal read operations.

## Per-tool authorization

Different tools in one connector may require different scopes.

Example:

```yaml
tools:
  - name: list_tickets
    auth:
      scopes: [tickets:read]
  - name: create_ticket
    auth:
      scopes: [tickets:write]
```

The tool registry should hide or disable tools that the caller is not authorized to use.

## Browser session handling

Browser sessions are not normal API tokens. They may include cookies, local storage, and SSO state.

Rules:

- Do not export cookies as text.
- Do not print session state in logs.
- Isolate browser contexts by user and connector.
- Require re-authentication when the target site requires it.
- Refuse to bypass 2FA or CAPTCHA.
- Make it clear when a browser tool acts as the user.

## Development mode

Development mode should support fake or local credentials.

Recommended patterns:

- `.env.example` with variable names only.
- Local fixtures that require no secrets.
- Mock OAuth tokens for tests.
- Recorded HTTP responses with secret redaction.

## Production mode

Production mode should add:

- Strong secret provider.
- Per-user identity.
- Per-tenant isolation.
- Token expiry and refresh handling.
- Audit logs for credential use.
- Domain allowlists for outbound requests.
