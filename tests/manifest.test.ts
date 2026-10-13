import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseManifestText, validateManifest } from "../src/manifest.js";
import { resolveApiUrl, assertExecutableReadOnlyApiTool } from "../src/runtime.js";

const schemaExamplePath = resolve(process.cwd(), "examples/connectors/public-http-api.yaml");

describe("connector manifest validation", () => {
  it("accepts the documented HTTP API example", async () => {
    const source = await readFile(schemaExamplePath, "utf8");
    const result = validateManifest(parseManifestText(source, schemaExamplePath));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.manifest.id).toBe("public_http_demo");
      expect(result.manifest.tools).toHaveLength(1);
    }
  });

  it("rejects an unknown adapter type", () => {
    const result = validateManifest({
      schemaVersion: "0.1.0",
      id: "bad_adapter",
      name: "Bad Adapter",
      version: "1.0.0",
      adapter: { type: "magic" },
      tools: [{
        name: "read",
        title: "Read",
        description: "Read something",
        inputSchema: { type: "object" },
        risk: { level: "low", readOnly: true, destructive: false, idempotent: true, external: false, requiresApproval: false },
        operation: { type: "fileRead" },
      }],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a connector with no tools", () => {
    const result = validateManifest({
      schemaVersion: "0.1.0",
      id: "empty_connector",
      name: "Empty Connector",
      version: "1.0.0",
      adapter: { type: "api" },
      tools: [],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects missing risk metadata", () => {
    const result = validateManifest({
      schemaVersion: "0.1.0",
      id: "unsafe_connector",
      name: "Unsafe Connector",
      version: "1.0.0",
      adapter: { type: "api" },
      tools: [{
        name: "delete_everything",
        title: "Delete",
        description: "An invalid tool",
        inputSchema: { type: "object" },
        operation: { type: "http" },
      }],
    });
    expect(result.valid).toBe(false);
  });
});

describe("read-only API runtime policy", () => {
  async function exampleManifest() {
    const source = await readFile(schemaExamplePath, "utf8");
    const result = validateManifest(parseManifestText(source, schemaExamplePath));
    if (!result.valid) throw new Error("Test fixture manifest is invalid");
    return result.manifest;
  }

  it("resolves and safely encodes path parameters", async () => {
    const manifest = await exampleManifest();
    const tool = manifest.tools[0]!;
    const url = resolveApiUrl(manifest, tool, { owner: "open ai", repo: "Framework-MCPs" });
    expect(url.toString()).toBe("https://api.github.com/repos/open%20ai/Framework-MCPs");
  });

  it("rejects non-GET operations", async () => {
    const manifest = await exampleManifest();
    const tool = { ...manifest.tools[0]!, operation: { ...manifest.tools[0]!.operation, method: "DELETE" } };
    expect(() => assertExecutableReadOnlyApiTool(manifest, tool)).toThrow(/Only HTTP GET/);
  });

  it("rejects a base URL outside the allowlist", async () => {
    const manifest = await exampleManifest();
    const restricted = { ...manifest, adapter: { ...manifest.adapter, baseUrl: "https://example.org" } };
    expect(() => resolveApiUrl(restricted, manifest.tools[0]!, { owner: "x", repo: "y" })).toThrow(/allowedDomains/);
  });
});
