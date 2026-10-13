import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ConnectorManifest } from "../src/manifest.js";
import { executeFileRead } from "../src/runtime.js";

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

  it("blocks parent-directory traversal and hidden files", async () => {
    const root = await makeRoot();
    const traversal = await fixture(root, "../outside.txt");
    await expect(executeFileRead(traversal, traversal.tools[0]!, {})).rejects.toThrow();
    const hidden = await fixture(root, ".env");
    await expect(executeFileRead(hidden, hidden.tools[0]!, {})).rejects.toThrow(/Hidden files/);
  });

  it("blocks unsupported extensions and files over the configured limit", async () => {
    const root = await makeRoot();
    await writeFile(join(root, "payload.bin"), "data", "utf8");
    const binary = await fixture(root, "payload.bin");
    await expect(executeFileRead(binary, binary.tools[0]!, {})).rejects.toThrow(/file type is not enabled/);
    await writeFile(join(root, "large.md"), "x".repeat(1100), "utf8");
    const oversized = await fixture(root, "large.md");
    await expect(executeFileRead(oversized, oversized.tools[0]!, {})).rejects.toThrow(/output limit/);
  });
});
