import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
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
