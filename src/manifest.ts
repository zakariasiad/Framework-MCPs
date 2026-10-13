import { readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse as parseYaml } from "yaml";

export type ConnectorManifest = {
  schemaVersion: string;
  id: string;
  name: string;
  description?: string;
  version: string;
  status?: "draft" | "reviewed" | "enabled" | "disabled";
  adapter: { type: "api" | "browser" | "cli" | "database" | "file"; [key: string]: unknown };
  auth?: { type: string; secretRef?: string; scopes?: string[] };
  policy?: {
    defaultApproval?: "never" | "onRisk" | "always";
    allowedDomains?: string[];
    blockedDomains?: string[];
    maxOutputBytes?: number;
    timeoutMs?: number;
  };
  tools: Array<{
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    risk: {
      level: "low" | "medium" | "high" | "critical";
      readOnly: boolean;
      destructive: boolean;
      idempotent: boolean;
      external: boolean;
      requiresApproval: boolean;
      dataSensitivity?: string;
    };
    operation: { type: string; [key: string]: unknown };
  }>;
};

export type ValidationIssue = { path: string; message: string };

function schemaCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    resolve(process.cwd(), "schemas/connector.manifest.schema.json"),
    resolve(here, "../schemas/connector.manifest.schema.json"),
    resolve(here, "../../schemas/connector.manifest.schema.json"),
  ];
}

export function loadManifestSchema(): Record<string, unknown> {
  const path = schemaCandidates().find((candidate) => existsSync(candidate));
  if (!path) {
    throw new Error("Cannot find schemas/connector.manifest.schema.json. Run the command from the repository root or reinstall the package with its schemas.");
  }
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}


const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(loadManifestSchema());

export function parseManifestText(text: string, filename = "connector.yaml"): unknown {
  const extension = extname(filename).toLowerCase();
  if (extension === ".json") return JSON.parse(text);
  if (extension === ".yaml" || extension === ".yml") return parseYaml(text);
  throw new Error(`Unsupported manifest format "${extension || "(no extension)"}"; use .json, .yaml, or .yml.`);
}

export function validateManifest(value: unknown): { valid: true; manifest: ConnectorManifest } | { valid: false; issues: ValidationIssue[] } {
  if (validateSchema(value)) {
    return { valid: true, manifest: value as ConnectorManifest };
  }
  return {
    valid: false,
    issues: (validateSchema.errors ?? []).map((error) => ({
      path: error.instancePath || "/",
      message: error.message ?? "Invalid value",
    })),
  };
}

export async function loadAndValidateManifest(path: string): Promise<ConnectorManifest> {
  const absolutePath = resolve(path);
  const source = await readFile(absolutePath, "utf8");
  let parsed: unknown;
  try {
    parsed = parseManifestText(source, absolutePath);
  } catch (error) {
    throw new Error(`Could not parse manifest "${path}": ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = validateManifest(parsed);
  if (!result.valid) {
    const details = result.issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join("\n");
    throw new Error(`Manifest validation failed for "${path}":\n${details}`);
  }
  return result.manifest;
}

export async function findManifestFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && /\.(json|ya?ml)$/i.test(entry.name) && path.replaceAll("\\", "/").includes("/examples/")) found.push(path);
    }
  }
  await visit(resolve(root));
  return found.sort();
}
