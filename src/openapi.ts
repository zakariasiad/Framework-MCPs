import type { ConnectorManifest } from "./manifest.js";

type JsonObject = Record<string, unknown>;
type OpenApiOptions = {
  id?: string;
  name?: string;
  version?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
};
type GeneratedOperation = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema?: JsonObject;
  risk: ConnectorManifest["tools"][number]["risk"];
  operation: { type: "http"; method: "GET"; path: string; query?: Record<string, string> };
};
export type OpenApiGenerationResult = {
  manifest: ConnectorManifest;
  warnings: string[];
};

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function slug(value: string, fallback: string): string {
  const result = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
  return /^[a-z]/.test(result) && result.length >= 2 ? result : fallback;
}

function resolveLocalRef(value: unknown, root: JsonObject, seen = new Set<string>()): unknown {
  const current = object(value);
  if (!current) return value;
  const ref = stringValue(current.$ref);
  if (ref) {
    if (!ref.startsWith("#/")) throw new Error(`External OpenAPI reference is not supported: ${ref}`);
    if (seen.has(ref)) throw new Error(`Circular OpenAPI reference is not supported: ${ref}`);
    const target = ref.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
      .reduce<unknown>((node, key) => object(node)?.[key], root);
    if (target === undefined) throw new Error(`Unresolved OpenAPI reference: ${ref}`);
    const nextSeen = new Set(seen);
    nextSeen.add(ref);
    const resolved = resolveLocalRef(target, root, nextSeen);
    const siblings = Object.fromEntries(Object.entries(current).filter(([key]) => key !== "$ref"));
    return { ...(object(resolved) ?? {}), ...(object(resolveNested(siblings, root, nextSeen)) ?? {}) };
  }
  return resolveNested(current, root, seen);
}

function resolveNested(value: unknown, root: JsonObject, seen: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveLocalRef(item, root, seen));
  const current = object(value);
  if (!current) return value;
  return Object.fromEntries(Object.entries(current).map(([key, item]) => [key, resolveLocalRef(item, root, seen)]));
}

function toJsonSchema(value: unknown, root: JsonObject): JsonObject {
  const resolved = object(resolveLocalRef(value, root)) ?? {};
  const allowed = new Set([
    "type", "title", "description", "default", "enum", "const", "format",
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength",
    "maxLength", "pattern", "minItems", "maxItems", "uniqueItems", "items",
    "properties", "required", "additionalProperties", "nullable", "oneOf", "anyOf", "allOf",
  ]);
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(resolved)) {
    if (!allowed.has(key)) continue;
    if (key === "properties") {
      const propertyMap = object(item);
      if (propertyMap) {
        result.properties = Object.fromEntries(Object.entries(propertyMap).map(([name, schema]) => [name, toJsonSchema(schema, root)]));
      }
    } else if (key === "items" || key === "additionalProperties") {
      result[key] = typeof item === "boolean" ? item : toJsonSchema(item, root);
    } else if (["oneOf", "anyOf", "allOf"].includes(key) && Array.isArray(item)) {
      result[key] = item.map((schema) => toJsonSchema(schema, root));
    } else {
      result[key] = item;
    }
  }
  if (result.nullable === true && typeof result.type === "string") {
    result.type = [result.type, "null"];
    delete result.nullable;
  }
  return result;
}

function operationName(operation: JsonObject, method: string, path: string): string {
  const source = stringValue(operation.operationId) ?? `${method}_${path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "_")}`;
  return slug(source, "get_resource");
}

function inferAuth(root: JsonObject): ConnectorManifest["auth"] {
  const components = object(root.components);
  const schemes = object(components?.securitySchemes);
  if (!schemes || Object.keys(schemes).length === 0) return { type: "none" };
  for (const value of Object.values(schemes)) {
    const scheme = object(value);
    if (!scheme) continue;
    if (scheme.type === "http" && scheme.scheme === "bearer") return { type: "bearerToken" };
    if (scheme.type === "apiKey") return { type: "apiKey" };
    if (scheme.type === "oauth2" || scheme.type === "openIdConnect") return { type: "oauth2" };
  }
  return { type: "environment" };
}

export function generateManifestFromOpenApi(
  input: unknown,
  options: OpenApiOptions = {},
): OpenApiGenerationResult {
  const root = object(input);
  if (!root) throw new Error("OpenAPI document must be a JSON object.");
  const openapi = stringValue(root.openapi);
  if (!openapi || !/^3\./.test(openapi)) throw new Error("Only OpenAPI 3.x documents are supported.");
  const info = object(root.info);
  const paths = object(root.paths);
  if (!info || !paths) throw new Error("OpenAPI document must include info and paths objects.");

  const servers = Array.isArray(root.servers) ? root.servers : [];
  const firstServer = object(servers[0]);
  const serverUrl = stringValue(firstServer?.url);
  if (!serverUrl) throw new Error("OpenAPI document must define a root-level servers[0].url.");
  let baseUrl: URL;
  try {
    baseUrl = new URL(serverUrl);
  } catch {
    throw new Error("OpenAPI server URL is invalid.");
  }
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("OpenAPI server URL must be HTTPS and must not contain credentials, query, or fragment.");
  }

  const warnings: string[] = [];
  const tools: GeneratedOperation[] = [];
  const httpMethods = new Set(["get", "put", "post", "delete", "patch", "options", "head", "trace"]);
  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = object(resolveLocalRef(rawPathItem, root));
    if (!pathItem) continue;
    const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method.toLowerCase())) continue;
      const operation = object(resolveLocalRef(rawOperation, root));
      if (!operation) continue;
      if (method.toLowerCase() !== "get") {
        warnings.push(`Skipped ${method.toUpperCase()} ${path}: this generator currently emits read-only GET tools only.`);
        continue;
      }

      const operationSecurity = operation.security === undefined ? root.security : operation.security;
      if (Array.isArray(operationSecurity) && operationSecurity.length > 0) {
        warnings.push(`Skipped authenticated GET ${path}: authenticated execution is not implemented yet.`);
        continue;
      }

      const parameters = [
        ...pathParameters,
        ...(Array.isArray(operation.parameters) ? operation.parameters : []),
      ].map((parameter) => object(resolveLocalRef(parameter, root))).filter((parameter): parameter is JsonObject => Boolean(parameter));
      const properties: JsonObject = {};
      const required: string[] = [];
      const query: Record<string, string> = {};
      for (const parameter of parameters) {
        const name = stringValue(parameter.name);
        const location = stringValue(parameter.in);
        if (!name || !location || !["path", "query"].includes(location)) {
          if (location === "header" || location === "cookie") warnings.push(`Skipped unsupported parameter in ${method.toUpperCase()} ${path}.`);
          continue;
        }
        const schema = toJsonSchema(parameter.schema ?? { type: "string" }, root);
        properties[name] = { ...schema, ...(stringValue(parameter.description) ? { description: parameter.description } : {}) };
        if (location === "path" || parameter.required === true) required.push(name);
        if (location === "query") query[name] = name;
      }

      const inputSchema: JsonObject = { type: "object", properties, additionalProperties: false };
      if (required.length) inputSchema.required = [...new Set(required)];

      const responses = object(operation.responses);
      const success = responses && Object.entries(responses).find(([code]) => /^2\d\d$/.test(code));
      const successResponse = object(success?.[1]);
      const content = object(successResponse?.content);
      const jsonContent = object(content?.["application/json"]) ?? object(content?.["application/*+json"]);
      const responseSchema = jsonContent?.schema;
      let outputSchema: JsonObject | undefined;
      if (responseSchema) {
        try { outputSchema = toJsonSchema(responseSchema, root); }
        catch (error) { warnings.push(`Could not resolve response schema for ${method.toUpperCase()} ${path}: ${String(error)}`); }
      }

      const name = operationName(operation, method, path);
      if (tools.some((tool) => tool.name === name)) {
        throw new Error(`Duplicate generated tool name "${name}". Set unique operationId values in the OpenAPI document.`);
      }
      tools.push({
        name,
        title: (stringValue(operation.summary) ?? name).slice(0, 120),
        description: (stringValue(operation.description) ?? stringValue(operation.summary) ?? `Read data from ${path}`).slice(0, 2000),
        inputSchema,
        ...(outputSchema ? { outputSchema } : {}),
        risk: {
          level: "low",
          readOnly: true,
          destructive: false,
          idempotent: true,
          external: true,
          requiresApproval: false,
          dataSensitivity: "public",
        },
        operation: {
          type: "http",
          method: "GET",
          path,
          ...(Object.keys(query).length ? { query } : {}),
        },
      });
    }
  }
  if (tools.length === 0) throw new Error("No supported GET operations were found in this OpenAPI document.");

  const id = slug(options.id ?? stringValue(info.title) ?? "openapi_connector", "openapi_connector");
  const infoVersion = stringValue(info.version);
  const manifest: ConnectorManifest = {
    schemaVersion: "0.1.0",
    id,
    name: (options.name ?? stringValue(info.title) ?? "OpenAPI Connector").slice(0, 120),
    description: stringValue(info.description) ?? "Generated from an OpenAPI 3.x document. Review before use.",
    version: options.version ?? (infoVersion && /^\d+\.\d+\.\d+$/.test(infoVersion) ? infoVersion : "0.1.0"),
    status: "draft",
    adapter: { type: "api", baseUrl: baseUrl.toString().replace(/\/$/, "") },
    auth: inferAuth(root),
    policy: {
      defaultApproval: "onRisk",
      allowedDomains: [baseUrl.hostname],
      blockedDomains: [],
      timeoutMs: options.timeoutMs ?? 10000,
      maxOutputBytes: options.maxOutputBytes ?? 262144,
    },
    tools: tools as ConnectorManifest["tools"],
  };
  warnings.unshift("Generated connector is a draft. Review paths, schemas, authentication, and permissions before enabling it.");
  if (manifest.auth?.type !== "none") {
    warnings.push(`Detected authentication type "${manifest.auth?.type}". The current runtime does not execute authenticated requests; configure secrets only after adding and reviewing an auth provider.`);
  }
  return { manifest, warnings };
}
