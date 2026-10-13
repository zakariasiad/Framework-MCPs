import { describe, expect, it } from "vitest";
import { createAuthHeaders, parseEnvironmentSecretReference, resolveEnvironmentSecret } from "../src/secrets.js";

describe("environment secret provider", () => {
  it("accepts a strict environment-variable reference", () => {
    expect(parseEnvironmentSecretReference("env:ACME_API_TOKEN")).toBe("ACME_API_TOKEN");
    expect(resolveEnvironmentSecret("env:ACME_API_TOKEN", { ACME_API_TOKEN: "example-token" })).toBe("example-token");
  });

  it.each(["ACME_API_TOKEN", "env:", "env:1TOKEN", "env:API-TOKEN", "file:/tmp/token", "env:API_TOKEN\n"])(
    "rejects unsupported reference %j",
    (reference) => {
      expect(() => parseEnvironmentSecretReference(reference)).toThrow(/Invalid secret reference/);
    },
  );

  it("fails closed when a referenced environment variable is missing", () => {
    expect(() => resolveEnvironmentSecret("env:MISSING_TOKEN", {})).toThrow(/not configured/);
    expect(() => resolveEnvironmentSecret("env:MISSING_TOKEN", {})).not.toThrowError("undefined");
  });

  it("rejects empty and control-character secret values", () => {
    expect(() => resolveEnvironmentSecret("env:EMPTY", { EMPTY: "" })).toThrow(/not configured/);
    expect(() => resolveEnvironmentSecret("env:BAD", { BAD: "token\r\nInjected: yes" })).toThrow(/control characters/);
  });

  it("builds bearer and API-key headers without returning the raw secret separately", () => {
    expect(createAuthHeaders({ type: "bearerToken", secretRef: "env:TOKEN" }, { TOKEN: "sensitive" }))
      .toEqual({ authorization: "Bearer sensitive" });
    expect(createAuthHeaders({ type: "apiKey", secretRef: "env:TOKEN" }, { TOKEN: "sensitive" }))
      .toEqual({ "x-api-key": "sensitive" });
    expect(createAuthHeaders({ type: "none" }, { TOKEN: "sensitive" })).toEqual({});
  });

  it("does not echo secret values in configuration errors", () => {
    const secret = "never-log-this-value";
    expect(() => createAuthHeaders({ type: "oauth2", secretRef: "env:TOKEN" }, { TOKEN: secret }))
      .toThrow(/only none, apiKey, and bearerToken/);
    expect(() => createAuthHeaders({ type: "bearerToken", secretRef: "env:MISSING" }, {}))
      .toThrowError(/not configured/);
  });
});
