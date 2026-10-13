/**
 * Resolve runtime secrets from explicitly named environment variables.
 *
 * Secret references are metadata (for example, "env:ACME_API_TOKEN"), never
 * secret values. This provider deliberately does not support shell expansion,
 * file paths, URLs, dynamic imports, or arbitrary provider expressions.
 */
const ENV_REFERENCE = /^env:([A-Za-z_][A-Za-z0-9_]*)$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function parseEnvironmentSecretReference(reference: string): string {
  const match = ENV_REFERENCE.exec(reference);
  if (!match) {
    throw new Error("Invalid secret reference. Use env:VARIABLE_NAME.");
  }
  return match[1]!;
}

export function resolveEnvironmentSecret(
  reference: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const variableName = parseEnvironmentSecretReference(reference);
  const value = environment[variableName];
  if (typeof value !== "string" || value.length === 0) {
    // Do not include the configured value or environment contents in errors.
    throw new Error("Required secret is not configured in the runtime environment.");
  }
  if (CONTROL_CHARACTERS.test(value)) {
    throw new Error("Configured secret contains invalid control characters.");
  }
  return value;
}

export function createAuthHeaders(
  auth: { type: string; secretRef?: string } | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  if (!auth || auth.type === "none") return {};
  if (auth.type !== "apiKey" && auth.type !== "bearerToken") {
    throw new Error("This runtime supports only none, apiKey, and bearerToken authentication.");
  }
  if (!auth.secretRef) {
    throw new Error("Authenticated connector requires a secretRef.");
  }

  const secret = resolveEnvironmentSecret(auth.secretRef, environment);
  if (auth.type === "bearerToken") return { authorization: `Bearer ${secret}` };
  return { "x-api-key": secret };
}

/** Redact known credential strings from text returned by an upstream service. */
export function redactSecretValues(text: string, values: string[]): string {
  const unique = [...new Set(values.filter((value) => value.length > 0))].sort((a, b) => b.length - a.length);
  return unique.reduce((result, secret) => result.split(secret).join("[REDACTED]"), text);
}
