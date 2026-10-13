import { createRequire } from "node:module";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ConnectorManifest } from "./manifest.js";
import { loadAndValidateManifest } from "./manifest.js";
import { createAuthHeaders, redactSecretValues } from "./secrets.js";

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

const CREDENTIAL_ARGUMENT_NAMES = new Set([
  "apikey", "apitoken", "accesstoken", "refreshtoken", "bearertoken",
  "authorization", "auth", "password", "passwd", "secret", "clientsecret",
  "credential", "credentials", "cookie", "sessioncookie",
]);

function hasCredentialArgument(schema: unknown): boolean {
  if (Array.isArray(schema)) return schema.some(hasCredentialArgument);
  const record = objectRecord(schema);
  if (!record) return false;
  const properties = objectRecord(record.properties);
  if (properties) {
    for (const [name, propertySchema] of Object.entries(properties)) {
      const normalized = name.toLowerCase().replace(/[-_]/g, "");
      if (CREDENTIAL_ARGUMENT_NAMES.has(normalized) || hasCredentialArgument(propertySchema)) return true;
    }
  }
  return ["items", "oneOf", "anyOf", "allOf"].some((key) => hasCredentialArgument(record[key]));
}

function isBlockedDomain(hostname: string, blocked: string[]): boolean {
  return blocked.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function assertExecutableReadOnlyApiTool(manifest: ConnectorManifest, tool: ConnectorTool): void {
  if (manifest.adapter.type !== "api") throw new Error("This runtime currently supports only API connectors.");
  if (manifest.auth && !["none", "apiKey", "bearerToken"].includes(manifest.auth.type)) {
    throw new Error("This runtime supports only none, apiKey, and bearerToken authentication.");
  }
  if (manifest.auth && manifest.auth.type !== "none" && !manifest.auth.secretRef) {
    throw new Error("Authenticated connector requires a secretRef.");
  }
  if (hasCredentialArgument(tool.inputSchema)) {
    throw new Error("Credential-like fields are not allowed in model-visible tool arguments; configure a runtime secretRef instead.");
  }
  if (tool.operation.type !== "http") throw new Error("This runtime supports only HTTP operations.");
  const method = String(tool.operation.method ?? "GET").toUpperCase();
  if (method !== "GET") throw new Error("Only HTTP GET operations are enabled in this MVP.");
  if (!tool.risk.readOnly || tool.risk.destructive || tool.risk.requiresApproval) {
    throw new Error("This tool is not eligible for automatic execution; writes and approval-required tools are blocked by default.");
  }
}

export function assertExecutableReadOnlyFileTool(manifest: ConnectorManifest, tool: ConnectorTool): void {
  if (manifest.adapter.type !== "file") throw new Error("This runtime supports only API and file connectors.");
  if (manifest.auth && manifest.auth.type !== "none") {
    throw new Error("File connectors do not support authentication in this runtime.");
  }
  if (tool.operation.type !== "fileRead") throw new Error("File connectors support only fileRead operations.");
  if (!tool.risk.readOnly || tool.risk.destructive || tool.risk.requiresApproval) {
    throw new Error("This file tool is not eligible for automatic execution.");
  }
  if (hasCredentialArgument(tool.inputSchema)) {
    throw new Error("Credential-like fields are not allowed in model-visible tool arguments; configure a runtime secretRef instead.");
  }
  if (!Array.isArray(manifest.adapter.workspaceRoots) || manifest.adapter.workspaceRoots.length === 0) {
    throw new Error("File connectors require at least one configured workspace root.");
  }
  if (typeof tool.operation.path !== "string" || !tool.operation.path.trim()) {
    throw new Error("File read operations require a relative operation.path.");
  }
  const format = tool.operation.format;
  if (format !== undefined && !["text", "json", "csv"].includes(String(format))) {
    throw new Error('File operation.format must be "text", "json", or "csv".');
  }
  if (format === "json" && extname(tool.operation.path).toLowerCase() !== ".json") {
    throw new Error('JSON parsing requires a .json operation.path.');
  }
  if (format === "csv" && extname(tool.operation.path).toLowerCase() !== ".csv") {
    throw new Error('CSV parsing requires a .csv operation.path.');
  }
}

function isWithinDirectory(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot));
}

function resolveFileTemplate(template: string, args: Record<string, unknown>): string {
  if (template.startsWith("/") || template.startsWith("\\\\") || isAbsolute(template) || /^[A-Za-z]:/.test(template)) {
    throw new Error("File paths must be relative to a configured workspace root.");
  }
  if (template.split(/[\\\\/]+/).includes("..")) throw new Error("File paths cannot contain parent-directory segments.");
  const expanded = template.replace(/\\{([A-Za-z0-9_]+)\\}/g, (_match, key: string) => {
    const value = args[key];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`Missing or invalid file path parameter: ${key}`);
    }
    const segment = String(value);
    if (!segment || segment === "." || segment === ".." || /[\\\\/\\u0000-\\u001f]/.test(segment) || /^[A-Za-z]:/.test(segment)) {
      throw new Error(`Unsafe file path parameter: ${key}`);
    }
    return segment;
  });
  if (/\\{[^}]+\\}/.test(expanded)) throw new Error("File path contains an unresolved parameter.");
  if (expanded.split(/[\\\\/]+/).some((segment) => segment.startsWith("."))) {
    throw new Error("Hidden files and directories are blocked by default.");
  }
  const basename = expanded.split(/[\\/]+/).pop()?.toLowerCase() ?? "";
  if (/^(credentials?|secrets?|passwords?|tokens?|api[-_]?keys?|service[-_]?account)(?:\..*)?$/.test(basename)) {
    throw new Error("Files with credential-related names are blocked by default.");
  }
  const extension = extname(expanded).toLowerCase();
  const allowedExtensions = new Set([".txt", ".md", ".json", ".csv", ".yaml", ".yml", ".xml", ".html", ".css", ".js", ".ts", ".py", ".ini", ".toml"]);
  if (!allowedExtensions.has(extension)) throw new Error("This file type is not enabled for reading.");
  return expanded;
}

function parseCsv(content: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]!;
    if (quoted) {
      if (char === '"') {
        if (content[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field); field = ""; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV file contains an unterminated quoted field.");
  if (field.length > 0 || row.length > 0) { row.push(field); if (row.some((cell) => cell.length > 0)) rows.push(row); }
  if (rows.length === 0) return [];
  const headers = rows[0]!.map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("CSV headers must be non-empty.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique.");
  const dataRows = rows.slice(1);
  if (dataRows.length > 5000) throw new Error("CSV file exceeds the 5000-row parsing limit.");
  return dataRows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${cells.length} columns; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, column) => [header, cells[column]!]));
  });
}

function formatFileContent(content: string, format: unknown): string {
  if (format === undefined || format === "text") return content;
  if (format === "json") {
    try { return JSON.stringify(JSON.parse(content) as unknown, null, 2); }
    catch { throw new Error("File was configured as JSON but does not contain valid JSON."); }
  }
  if (format === "csv") return JSON.stringify(parseCsv(content), null, 2);
  throw new Error('Unsupported file format; use "text", "json", or "csv".');
}
export async function executeFileRead(
  manifest: ConnectorManifest,
  tool: ConnectorTool,
  args: Record<string, unknown>,
): Promise<string> {
  assertExecutableReadOnlyFileTool(manifest, tool);
  const template = tool.operation.path as string;
  const relativePath = resolveFileTemplate(template, args);
  const roots = manifest.adapter.workspaceRoots as string[];
  const maxBytes = manifest.policy?.maxOutputBytes ?? 1048576;

  for (const configuredRoot of roots) {
    try {
      const root = await realpath(resolve(configuredRoot));
      if (!(await stat(root)).isDirectory()) continue;
      const candidate = resolve(root, relativePath);
      if (!isWithinDirectory(root, candidate)) continue;
      const target = await realpath(candidate);
      if (!isWithinDirectory(root, target)) continue;
      const info = await stat(target);
      if (!info.isFile()) continue;
      if (info.size > maxBytes) throw new Error(`File exceeds the configured ${maxBytes}-byte output limit.`);
      const content = await readFile(target, "utf8");
      if (Buffer.byteLength(content, "utf8") > maxBytes) {
        throw new Error(`File exceeds the configured ${maxBytes}-byte output limit.`);
      }
      return formatFileContent(content, tool.operation.format);
    } catch (error) {
      if (error instanceof Error && /^(File exceeds the configured|CSV |File was configured as JSON|Unsupported file format)/.test(error.message)) throw error;
      // Try the next explicitly configured root without exposing local paths.
    }
  }
  throw new Error("Requested file was not found within the configured workspace roots.");
}

function assertExecutableTool(manifest: ConnectorManifest, tool: ConnectorTool): void {
  if (manifest.adapter.type === "api") {
    assertExecutableReadOnlyApiTool(manifest, tool);
    return;
  }
  if (manifest.adapter.type === "file") {
    assertExecutableReadOnlyFileTool(manifest, tool);
    return;
  }
  throw new Error("This runtime currently supports only API and file connectors.");
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
  if (!allowedDomains || allowedDomains.length === 0) {
    throw new Error("policy.allowedDomains must contain at least one explicitly approved API host.");
  }
  if (isBlockedDomain(baseUrl.hostname, blockedDomains)) {
    throw new Error(`API host "${baseUrl.hostname}" is blocked by connector policy.`);
  }
  if (!allowedDomains.includes(baseUrl.hostname)) {
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
    return encodeURIComponent(segment);
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

export async function executeApiGet(
  manifest: ConnectorManifest,
  tool: ConnectorTool,
  args: Record<string, unknown>,
): Promise<unknown> {
  const url = resolveApiUrl(manifest, tool, args);
  const timeoutMs = manifest.policy?.timeoutMs ?? 30000;
  const maxOutputBytes = manifest.policy?.maxOutputBytes ?? 1048576;
  const authHeaders = createAuthHeaders(manifest.auth);
  const redactionValues = Object.values(authHeaders).flatMap((value) => [value, value.toLowerCase().startsWith("bearer ") ? value.slice(7) : value]);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json, text/plain;q=0.9, */*;q=0.1",
      "user-agent": "Framework-MCPs/0.1.0",
      ...authHeaders,
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Upstream API returned HTTP ${response.status}.`);
  const rawBody = await readLimitedBody(response, maxOutputBytes);
  const body = redactSecretValues(rawBody, redactionValues);
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
  // Refuse to publish tools whose policy or argument schema is not executable and safe.
  for (const tool of manifest.tools) assertExecutableTool(manifest, tool);
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
      const result = manifest.adapter.type === "file"
        ? await executeFileRead(manifest, tool, args)
        : await executeApiGet(manifest, tool, args);
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
