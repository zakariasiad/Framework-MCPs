import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ConnectorManifest } from "../src/manifest.js";
import { executeFileRead, executeFileSearch } from "../src/runtime.js";

let roots: string[] = [];

async function fixture(root: string, operationPath: string): Promise<ConnectorManifest> {
  return {
    schemaVersion: "0.1.0",
    id: "file_test",
    name: "File test",
    version: "0.1.0",
    adapter: { type: "file", workspaceRoots: [root] },
    policy: { maxOutputBytes: 1024, timeoutMs: 10000 },
    tools: [{
      name: "read",
      title: "Read text",
      description: "Read a text file from the configured workspace.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      risk: { level: "low", readOnly: true, destructive: false, idempotent: true, external: false, requiresApproval: false },
      operation: { type: "fileRead", path: operationPath },
    }],
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fmcp-test-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

describe("file-read adapter", () => {
  it("reads a text file under an explicitly configured root", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "lesson.md"), "lesson content", "utf8");
    const manifest = await fixture(root, "docs/lesson.md");
    await expect(executeFileRead(manifest, manifest.tools[0]!, {})).resolves.toBe("lesson content");
  });

  it("resolves safe file path parameters and blocks traversal values", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "intro.md"), "parameterized content", "utf8");
    const manifest = await fixture(root, "docs/{filename}.md");
    manifest.tools[0]!.inputSchema = {
      type: "object",
      properties: { filename: { type: "string" } },
      required: ["filename"],
      additionalProperties: false,
    };
    await expect(executeFileRead(manifest, manifest.tools[0]!, { filename: "intro" }))
      .resolves.toBe("parameterized content");
    await expect(executeFileRead(manifest, manifest.tools[0]!, { filename: "../outside" }))
      .rejects.toThrow(/Unsafe file path parameter/);
  });

  it("blocks parent-directory traversal and hidden files", async () => {
    const root = await makeRoot();
    const traversal = await fixture(root, "../outside.txt");
    await expect(executeFileRead(traversal, traversal.tools[0]!, {})).rejects.toThrow();
    const hidden = await fixture(root, ".env");
    await expect(executeFileRead(hidden, hidden.tools[0]!, {})).rejects.toThrow(/Hidden files/);
  });

  it("does not follow symbolic links outside the workspace", async () => {
    const root = await makeRoot();
    const external = await makeRoot();
    await writeFile(join(external, "external.md"), "external content", "utf8");
    await symlink(join(external, "external.md"), join(root, "linked.md"));
    const manifest = await fixture(root, "linked.md");
    await expect(executeFileRead(manifest, manifest.tools[0]!, {}))
      .rejects.toThrow(/not found within the configured workspace roots/);
  });

  it("fails closed for authenticated file connectors and missing workspace roots", async () => {
    const root = await makeRoot();
    const authenticated = await fixture(root, "lesson.md");
    authenticated.auth = { type: "bearerToken", secretRef: "env:FILE_TOKEN" };
    await expect(executeFileRead(authenticated, authenticated.tools[0]!, {}))
      .rejects.toThrow(/do not support authentication/);

    const noRoots = await fixture(root, "lesson.md");
    noRoots.adapter = { type: "file", workspaceRoots: [] };
    await expect(executeFileRead(noRoots, noRoots.tools[0]!, {}))
      .rejects.toThrow(/at least one configured workspace root/);
  });

  it("parses JSON and CSV into bounded structured JSON output", async () => {
    const root = await makeRoot();
    await writeFile(join(root, "data.json"), '{"items":[1,2]}', "utf8");
    const jsonManifest = await fixture(root, "data.json");
    jsonManifest.tools[0]!.operation.format = "json";
    await expect(executeFileRead(jsonManifest, jsonManifest.tools[0]!, {}))
      .resolves.toBe(JSON.stringify({ items: [1, 2] }, null, 2));

    await writeFile(join(root, "people.csv"), 'name,note\nAlice,"hello, world"\nBob,"said ""hi"""\n', "utf8");
    const csvManifest = await fixture(root, "people.csv");
    csvManifest.tools[0]!.operation.format = "csv";
    const parsed = await executeFileRead(csvManifest, csvManifest.tools[0]!, {});
    expect(JSON.parse(parsed)).toEqual([
      { name: "Alice", note: "hello, world" },
      { name: "Bob", note: 'said "hi"' },
    ]);
  });

  it("rejects malformed structured files with a safe error", async () => {
    const root = await makeRoot();
    await writeFile(join(root, "bad.csv"), "name,age\nAlice\n", "utf8");
    const manifest = await fixture(root, "bad.csv");
    manifest.tools[0]!.operation.format = "csv";
    await expect(executeFileRead(manifest, manifest.tools[0]!, {})).rejects.toThrow(/expected 2/);
  });

  it("searches allowed text files and returns bounded line matches", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "lesson.md"), "first line\nRobotics club project\nlast line\n", "utf8");
    await writeFile(join(root, "credentials.json"), '{"query":"Robotics club project"}', "utf8");
    const manifest = await fixture(root, "");
    const tool = manifest.tools[0]!;
    tool.inputSchema = {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200 },
        maxResults: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["query"],
      additionalProperties: false,
    };
    tool.operation = { type: "fileSearch", directory: "docs" };
    const output = JSON.parse(await executeFileSearch(manifest, tool, { query: "robotics" })) as {
      matches: Array<{ path: string; line: number; snippet: string }>;
      truncated: boolean;
    };
    expect(output.matches).toEqual([{ path: "docs/lesson.md", line: 2, snippet: "Robotics club project" }]);
    expect(output.truncated).toBe(false);
  });

  it("does not search through a symlinked directory outside the workspace", async () => {
    const root = await makeRoot();
    const external = await makeRoot();
    await writeFile(join(external, "outside.md"), "confidential needle", "utf8");
    await symlink(external, join(root, "linked-directory"), "dir");
    const manifest = await fixture(root, "");
    const tool = manifest.tools[0]!;
    tool.inputSchema = {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    };
    tool.operation = { type: "fileSearch", directory: "linked-directory" };
    const output = JSON.parse(await executeFileSearch(manifest, tool, { query: "needle" })) as { matches: unknown[] };
    expect(output.matches).toEqual([]);
  });

  it("blocks traversal directories and invalid file search limits", async () => {
    const root = await makeRoot();
    const manifest = await fixture(root, "");
    const tool = manifest.tools[0]!;
    tool.inputSchema = {
      type: "object",
      properties: { query: { type: "string" }, maxResults: { type: "integer", minimum: 1, maximum: 100 } },
      required: ["query"],
      additionalProperties: false,
    };
    tool.operation = { type: "fileSearch", directory: "../" };
    await expect(executeFileSearch(manifest, tool, { query: "needle" })).rejects.toThrow(/parent or hidden directories/);
    tool.operation = { type: "fileSearch" };
    await expect(executeFileSearch(manifest, tool, { query: "needle", maxResults: 1000 })).rejects.toThrow(/between 1 and 100/);
  });

  it("blocks unsupported extensions and files over the configured limit", async () => {
    const root = await makeRoot();
    await writeFile(join(root, "payload.bin"), "data", "utf8");
    const binary = await fixture(root, "payload.bin");
    await expect(executeFileRead(binary, binary.tools[0]!, {})).rejects.toThrow(/file type is not enabled/);
    await writeFile(join(root, "credentials.json"), '{"api_key":"placeholder"}', "utf8");
    const credentials = await fixture(root, "credentials.json");
    await expect(executeFileRead(credentials, credentials.tools[0]!, {})).rejects.toThrow(/credential-related names/);
    await writeFile(join(root, "large.md"), "x".repeat(1100), "utf8");
    const oversized = await fixture(root, "large.md");
    await expect(executeFileRead(oversized, oversized.tools[0]!, {})).rejects.toThrow(/output limit/);
  });
});
