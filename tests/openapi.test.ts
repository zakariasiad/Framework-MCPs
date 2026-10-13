import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateManifestFromOpenApi } from "../src/openapi.js";
import { resolveApiUrl } from "../src/runtime.js";
import { parseManifestText, validateManifest } from "../src/manifest.js";

describe("OpenAPI connector generation", () => {
  async function fixture() {
    const path = resolve(process.cwd(), "examples/openapi/sample-catalog.yaml");
    return parseManifestText(await readFile(path, "utf8"), path);
  }

  it("generates a valid draft manifest from GET operations", async () => {
    const generated = generateManifestFromOpenApi(await fixture());
    expect(generated.manifest.id).toBe("sample_catalog_api");
    expect(generated.manifest.auth?.type).toBe("none");
    expect(generated.manifest.tools).toHaveLength(1);
    expect(generated.manifest.tools[0]?.name).toBe("getitem");
    expect(generated.manifest.tools[0]?.operation).toMatchObject({
      type: "http",
      method: "GET",
      path: "/items/{itemId}",
      query: { locale: "locale" },
    });
    expect(generated.manifest.tools[0]?.inputSchema).toMatchObject({
      type: "object",
      required: ["itemId"],
      properties: { itemId: { type: "string" }, locale: { type: "string", enum: ["en", "fr"] } },
    });
    expect(generated.warnings.some((warning) => warning.includes("POST /items/{itemId}"))).toBe(true);
    expect(validateManifest(generated.manifest).valid).toBe(true);
    const url = resolveApiUrl(generated.manifest, generated.manifest.tools[0]!, { itemId: "sku 42", locale: "fr" });
    expect(url.toString()).toBe("https://catalog.example.com/v1/items/sku%2042?locale=fr");
  });

  it("rejects non-HTTPS server URLs", () => {
    expect(() => generateManifestFromOpenApi({
      openapi: "3.0.3",
      info: { title: "Unsafe API", version: "1.0.0" },
      servers: [{ url: "http://example.com" }],
      paths: { "/items": { get: { responses: { "200": { description: "ok" } } } } },
    })).toThrow(/must be HTTPS/);
  });

  it("omits secured operations from the unauthenticated runtime draft", () => {
    const generated = generateManifestFromOpenApi({
      openapi: "3.0.3",
      info: { title: "Secured API", version: "1.0.0" },
      servers: [{ url: "https://example.com" }],
      security: [{ bearerAuth: [] }],
      paths: {
        "/private": { get: { operationId: "privateData", responses: { "200": { description: "ok" } } } },
        "/public": { get: { operationId: "publicData", security: [], responses: { "200": { description: "ok" } } } }
      }
    });
    expect(generated.manifest.tools.map((tool) => tool.name)).toEqual(["publicdata"]);
    expect(generated.warnings.some((warning) => warning.includes("authenticated GET /private"))).toBe(true);
  });

  it("rejects documents without supported GET operations", () => {
    expect(() => generateManifestFromOpenApi({
      openapi: "3.0.3",
      info: { title: "Write-only API", version: "1.0.0" },
      servers: [{ url: "https://example.com" }],
      paths: { "/items": { post: { responses: { "201": { description: "created" } } } } },
    })).toThrow(/No supported GET operations/);
  });

  it("rejects unresolved external references", () => {
    expect(() => generateManifestFromOpenApi({
      openapi: "3.0.3",
      info: { title: "Referenced API", version: "1.0.0" },
      servers: [{ url: "https://example.com" }],
      paths: { "/items": { get: {
        parameters: [{ $ref: "https://example.com/openapi.json#/components/parameters/limit" }],
        responses: { "200": { description: "ok" } },
      } } },
    })).toThrow(/External OpenAPI reference/);
  });
});
