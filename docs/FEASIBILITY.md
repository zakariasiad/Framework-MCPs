# Feasibility and Limitations

Framework-MCPs can make many systems accessible through MCP, but it cannot turn every website or application into a safe and reliable connector. The framework must distinguish legitimate automation from unsupported or impossible access.

## Feasible automation

### Official APIs

Highly feasible when:

- The service provides stable API documentation.
- The user has valid credentials.
- Required scopes are available.
- Rate limits allow the intended workflow.

Examples:

- Search records.
- Read account data.
- Create tickets.
- Update allowed fields.
- Upload files through documented endpoints.

### Browser automation

Feasible when:

- The user can access the website normally.
- The workflow is allowed by the site.
- The UI is stable enough to automate.
- The action is not blocked by CAPTCHA, 2FA, or anti-bot controls.
- The framework can ask approval before side effects.

Examples:

- Read data from an internal dashboard.
- Export a report through a user-visible UI.
- Fill a form in a controlled internal app after approval.

### Local CLI and apps

Feasible when:

- The software provides a CLI or documented local automation interface.
- Commands can be allowlisted.
- Arguments can be validated.
- The process can run inside a restricted workspace.

Examples:

- Convert a document.
- Run a local project report.
- Query a local tool for status.
- Execute a safe build or lint command.

### Databases and files

Feasible when:

- The user owns or is authorized to access the data.
- Access is scoped to specific files, directories, tables, views, or query templates.
- Sensitive fields can be redacted or excluded.
- Row limits and output limits are enforced.

Examples:

- Search CSV records.
- Read JSON configuration.
- Query a read-only reporting view.
- Generate a summary from approved files.

## Unsupported access

Framework-MCPs should explicitly refuse:

- Login bypass.
- CAPTCHA bypass.
- 2FA bypass.
- Paywall bypass.
- Bot-detection evasion.
- Session cookie theft.
- Password extraction.
- Hidden scraping of data the user cannot normally access.
- Circumventing rate limits or technical blocks.
- Actions that violate the target service's terms or the user's permissions.

## Technically possible but unsafe by default

Some actions may be technically possible but should be blocked unless explicitly configured and approved.

Examples:

- Deleting records.
- Sending emails or messages.
- Publishing public content.
- Changing permissions.
- Running shell commands.
- Installing packages.
- Downloading large datasets.
- Writing to production databases.
- Moving or overwriting files.

## Reliability limitations

### Browser connectors are fragile

Web UIs change. Selectors break. Layouts differ by account, language, viewport, and A/B test. Browser connectors need maintenance and tests.

Mitigation:

- Prefer APIs when available.
- Use stable selectors when possible.
- Test against fixtures.
- Keep workflows small.
- Provide clear error messages when a page changes.

### Generated connectors require review

AI can help draft connector manifests, but generated connectors can be wrong, overbroad, or unsafe.

Mitigation:

- Keep generated connectors disabled by default.
- Require schema validation.
- Require policy review.
- Run contract tests.
- Use least privilege credentials.

### Authentication is not universal

Every service handles auth differently. Some use OAuth, some API keys, some SSO, some browser sessions, and some local credentials.

Mitigation:

- Start with environment variables and OAuth bearer tokens.
- Add pluggable secret providers.
- Avoid storing browser cookies directly.
- Document unsupported auth flows per connector.

### Legal and terms constraints matter

A connector can be technically possible and still inappropriate to run.

Mitigation:

- Require connector authors to document the intended use.
- Avoid scraping protected third-party services by default.
- Respect rate limits, robots guidance where relevant, and service terms.
- Prefer official APIs.

## Feasibility scoring

Each connector should have a feasibility score before implementation.

Suggested scale:

- `A`: Official API, stable schema, clear auth, low side-effect risk.
- `B`: API exists but schema or permissions need manual work.
- `C`: Browser automation for stable internal UI or local fixture.
- `D`: Browser automation for changing third-party UI, high maintenance.
- `F`: Requires bypassing access controls, anti-bot systems, CAPTCHA, 2FA, paywalls, or unauthorized data access.

Only `A`, `B`, and carefully scoped `C` connectors should be part of the MVP.
