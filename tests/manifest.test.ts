import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseManifestText, validateManifest } from "../src/manifest.js";

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
