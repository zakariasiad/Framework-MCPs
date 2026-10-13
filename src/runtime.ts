import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ConnectorManifest } from "./manifest.js";
import { loadAndValidateManifest } from "./manifest.js";

type ConnectorTool = ConnectorManifest["tools"][number];
type JsonSchemaValidator = ((value: unknown) => boolean) & {
  errors?: Array<{ instancePath?: string; message?: string }>;
};
type AjvConstructor = new (options: { allErrors: boolean; strict: boolean }) => {
  compile(schema: Record<string, unknown>): JsonSchemaValidator;
};

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js") as AjvConstructor;
const ajvFormats = require("ajv-formats") as (ajv: InstanceType<typeof Ajv2020>) => void;

function validateArguments(schema: Record<string, unknown>, value: unknown): string | undefined {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajvFormats(ajv);
  const validate = ajv.compile(schema);
  if (validate(value)) return undefined;
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || "/"}: ${error.message ?? "invalid value"}`)
    .join("; ");
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isBlockedDomain(hostname: string, blocked: string[]): boolean {
  return blocked.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function assertExecutableReadOnlyApiTool(manifest: ConnectorManifest, tool: ConnectorTool): void {
  if (manifest.adapter.type !== "api") throw new Error("This runtime currently supports only API connectors.");
  if (manifest.auth && manifest.auth.type !== "none") {
    throw new Error("This runtime does not yet support authenticated connectors. Configure auth.type: none for this MVP.");
  }
  if (tool.operation.type !== "http") throw new Error("This runtime supports only HTTP operations.");
  const method = String(tool.operation.method ?? "GET").toUpperCase();
  if (method !== "GET") throw new Error("Only HTTP GET operations are enabled in this MVP.");
  if (!tool.risk.readOnly || tool.risk.destructive || tool.risk.requiresApproval) {
    throw new Error("This tool is not eligible for automatic execution; writes and approval-required tools are blocked by default.");
  }
}

export function resolveApiUrl(
  manifest: ConnectorManifest,
  tool: ConnectorTool,
  args: Record<string, unknown>,
): URL {
  assertExecutableReadOnlyApiTool(manifest, tool);
  const baseUrlValue = manifest.adapter.baseUrl;
  if (typeof baseUrlValue !== "string") throw new Error("API adapter requires adapter.baseUrl.");
  const baseUrl = new URL(baseUrlValue);
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
    throw new Error("API baseUrl must use HTTPS and must not contain embedded credentials.");
  }

  const allowedDomains = manifest.policy?.allowedDomains;
  const blockedDomains = manifest.policy?.blockedDomains ?? [];
  if (isBlockedDomain(baseUrl.hostname, blockedDomains)) {
    throw new Error(`API host "${baseUrl.hostname}" is blocked by connector policy.`);
  }
  if (allowedDomains && allowedDomains.length > 0 && !allowedDomains.includes(baseUrl.hostname)) {
    throw new Error(`API host "${baseUrl.hostname}" is not in policy.allowedDomains.`);
  }

  const pathTemplate = tool.operation.path;
  if (typeof pathTemplate !== "string" || !pathTemplate.startsWith("/") || pathTemplate.startsWith("//")) {
    throw new Error("HTTP operation path must be an absolute path beginning with one slash.");
  }
  if (pathTemplate.split("/").includes("..")) throw new Error("HTTP operation path cannot contain parent-directory segments.");

  const path = pathTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => {
    const value = args[key];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`Missing or invalid path parameter: ${key}`);
    }
    const segment = String(value);
    if (segment === "." || segment === ".." || segment.includes("\\")) {
      throw new Error(`Unsafe path parameter: ${key}`);
    }
    return encodeURIComponent(segment).replace(/\\./g, "%2E");
  });
  if (/\{[^}]+\}/.test(path)) throw new Error("HTTP operation contains an unresolved path parameter.");

  const basePath = baseUrl.pathname.replace(/\/$/, "");
  const url = new URL(`${basePath}/${path.replace(/^\//, "")}`, baseUrl.origin);
  if (url.hostname !== baseUrl.hostname || url.protocol !== "https:") {
    throw new Error("Resolved URL escaped the configured API origin.");
  }

  const queryMap = objectRecord(tool.operation.query);
  if (queryMap) {
    for (const [queryName, argumentName] of Object.entries(queryMap)) {
      const value = args[String(argumentName)];
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(queryName, String(item));
      } else if (typeof value === "object") {
        throw new Error(`Query parameter "${queryName}" must be a scalar or array.`);
      } else {
        url.searchParams.set(queryName, String(value));
      }
    }
  }
  return url;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new Error(`Response exceeds the configured ${maxBytes}-byte output limit.`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Response exceeds the configured ${maxBytes}-byte output limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

async function executeApiGet(
  manifest: ConnectorManifest,
  tool: ConnectorTool,
  args: Record<string, unknown>,
): Promise<unknown> {
  const url = resolveApiUrl(manifest, tool, args);
  const timeoutMs = manifest.policy?.timeoutMs ?? 30000;
  const maxOutputBytes = manifest.policy?.maxOutputBytes ?? 1048576;
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.1", "user-agent": "Framework-MCPs/0.1.0" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Upstream API returned HTTP ${response.status}.`);
  const body = await readLimitedBody(response, maxOutputBytes);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new Error("Upstream declared JSON but returned an invalid JSON response.");
    }
  }
  return body;
}

export async function startStdioServer(manifestPath: string): Promise<void> {
  const manifest = await loadAndValidateManifest(manifestPath);
  const server = new Server(
    { name: "framework-mcps", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const tools = manifest.tools.map((tool) => ({
    name: `${manifest.id}.${tool.name}`,
    description: tool.description,
    inputSchema: tool.inputSchema as { type: "object"; [key: string]: unknown },
  }));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const requestedName = request.params.name;
    const tool = manifest.tools.find((candidate) => `${manifest.id}.${candidate.name}` === requestedName);
    if (!tool) {
      return { content: [{ type: "text" as const, text: `Unknown tool: ${requestedName}` }], isError: true };
    }

    try {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      const validationError = validateArguments(tool.inputSchema, args);
      if (validationError) throw new Error(`Invalid tool arguments: ${validationError}`);
      const result = await executeApiGet(manifest, tool, args);
      return {
        content: [{ type: "text" as const, text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
