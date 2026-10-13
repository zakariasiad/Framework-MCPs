import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseManifestText, validateManifest } from "../src/manifest.js";
import { assertConnectorCanServe, executeApiGet } from "../src/runtime.js";

const fixture = resolve(process.cwd(), "examples/connectors/public-http-api.yaml");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("connector serving guards", () => {
  it("refuses connectors explicitly marked disabled", async () => {
    const source = await readFile(fixture, "utf8");
    const parsed = validateManifest(parseManifestText(source, fixture));
    if (!parsed.valid) throw new Error("Test fixture manifest is invalid");
    expect(() => assertConnectorCanServe({ ...parsed.manifest, status: "disabled" }))
      .toThrow(/connector is disabled/);
  });

  it("refuses duplicate tool names before registering MCP tools", async () => {
    const source = await readFile(fixture, "utf8");
    const parsed = validateManifest(parseManifestText(source, fixture));
    if (!parsed.valid) throw new Error("Test fixture manifest is invalid");
    const duplicateTools = [...parsed.manifest.tools, { ...parsed.manifest.tools[0]! }];
    expect(() => assertConnectorCanServe({ ...parsed.manifest, tools: duplicateTools }))
      .toThrow(/Duplicate tool name/);
  });

  it("allows draft connectors for local development unless explicitly disabled", async () => {
    const source = await readFile(fixture, "utf8");
    const parsed = validateManifest(parseManifestText(source, fixture));
    if (!parsed.valid) throw new Error("Test fixture manifest is invalid");
    expect(() => assertConnectorCanServe({ ...parsed.manifest, status: "draft" })).not.toThrow();
  });
});

describe("authenticated API runtime", () => {
  it("sends an environment-backed bearer token and redacts echoed credentials", async () => {
    const source = await readFile(fixture, "utf8");
    const parsed = validateManifest(parseManifestText(source, fixture));
    if (!parsed.valid) throw new Error("Test fixture manifest is invalid");
    const manifest = {
      ...parsed.manifest,
      auth: { type: "bearerToken", secretRef: "env:API_TOKEN" },
    };
    vi.stubEnv("API_TOKEN", "super-secret-token");

    let capturedAuthorization: string | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedAuthorization = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({
        authorization: "Bearer super-secret-token",
        echoed: "super-secret-token",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    const result = await executeApiGet(manifest, manifest.tools[0]!, { owner: "openai", repo: "sdk" }) as Record<string, unknown>;
    expect(capturedAuthorization).toBe("Bearer super-secret-token");
    expect(result).toEqual({
      authorization: "[REDACTED]",
      echoed: "[REDACTED]",
    });
  });

  it("does not call the network if a referenced secret is missing", async () => {
    const source = await readFile(fixture, "utf8");
    const parsed = validateManifest(parseManifestText(source, fixture));
    if (!parsed.valid) throw new Error("Test fixture manifest is invalid");
    const manifest = {
      ...parsed.manifest,
      auth: { type: "bearerToken", secretRef: "env:ABSENT_TOKEN" },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ABSENT_TOKEN", "");

    await expect(executeApiGet(manifest, manifest.tools[0]!, { owner: "openai", repo: "sdk" }))
      .rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
