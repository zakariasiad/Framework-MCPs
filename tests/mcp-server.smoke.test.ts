import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

describe("MCP stdio smoke test", () => {
  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;

  afterEach(async () => {
    await client?.close().catch(() => undefined);
    await transport?.close().catch(() => undefined);
    client = undefined;
    transport = undefined;
  });

  it("starts the CLI runtime and lists tools through the MCP protocol", async () => {
    const manifest = resolve(process.cwd(), "examples/connectors/public-http-api.yaml");
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "src/cli.ts", "serve", manifest],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    client = new Client({ name: "framework-mcps-smoke-test", version: "0.1.0" });
    await client.connect(transport);

    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name)).toContain("public_http_demo.get_public_repository");
    expect(result.tools.every((tool) => !JSON.stringify(tool.inputSchema).match(/access[_-]?token|api[_-]?key|password|secret/i))).toBe(true);
  }, 15000);

  it("serves a restricted file-read tool through the MCP protocol", async () => {
    const manifest = resolve(process.cwd(), "examples/connectors/local-documents.yaml");
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "src/cli.ts", "serve", manifest],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    client = new Client({ name: "framework-mcps-file-smoke-test", version: "0.1.0" });
    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain("local_documents.read_lesson");
    const result = await client.callTool({ name: "local_documents.read_lesson", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.content.some((item) => item.type === "text" && item.text.includes("sample document"))).toBe(true);
  }, 15000);
});
