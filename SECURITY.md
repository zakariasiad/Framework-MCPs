# Security Policy

Framework-MCPs is a security-sensitive project because connectors may read private data, act on user accounts, execute local commands, access files, automate browsers, or query databases.

## Supported versions

The project is in pre-release design stage. Security reports are welcome for the main branch.

## Reporting a vulnerability

Please open a private security advisory on GitHub if available, or contact the maintainer privately before public disclosure.

Do not include real credentials, private data, cookies, or tokens in public issues.

## Security scope

In scope:

- Secret leakage.
- Unsafe command execution.
- Path traversal.
- Missing approval checks for write or destructive actions.
- Browser session leakage.
- Unsafe database query execution.
- Authentication or authorization bypass in the framework runtime.
- Prompt injection paths that cause unsafe tool execution.
- Missing tenant or user isolation in hosted mode.

Out of scope:

- Bypassing third-party websites, CAPTCHA, 2FA, paywalls, or anti-bot protections.
- Attacks requiring stolen credentials.
- Abuse of a connector intentionally configured to perform unsafe actions after explicit approval.
- Vulnerabilities in third-party services unless caused by Framework-MCPs behavior.

## Security expectations for connectors

Connectors should:

- Prefer official APIs.
- Use least-privilege credentials.
- Avoid storing raw secrets in manifests.
- Require approval for write and destructive actions.
- Respect target service permissions and terms.
- Use tests for negative safety cases.

Connectors must not:

- Bypass authentication or authorization.
- Extract passwords or session cookies for model use.
- Evade CAPTCHA, 2FA, paywalls, or bot detection.
- Run arbitrary shell commands without allowlists and approval.
- Read or write outside configured filesystem roots.
