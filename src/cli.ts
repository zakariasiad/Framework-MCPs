#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { stringify as stringifyYaml } from "yaml";
import { generateManifestFromOpenApi } from "./openapi.js";
import { loadAndValidateManifest, parseManifestText, validateManifest } from "./manifest.js";
import { startStdioServer } from "./runtime.js";

function usage(): void {
  console.log(`Framework-MCPs — connector manifest tools

Usage:
  fmcp validate <manifest.json|manifest.yaml>
  fmcp list-tools <manifest.json|manifest.yaml>
  fmcp serve <manifest.json|manifest.yaml>
  fmcp import-openapi <openapi.json|openapi.yaml> [output.yaml]
  fmcp --help

Commands:
  validate       Parse and validate a connector manifest.
  list-tools     Validate a manifest and print declared tool names and risk levels.
  serve          Start the read-only HTTP MCP server over stdio.
  import-openapi Generate a draft connector manifest from OpenAPI 3.x (GET operations only).
`);
}

async function main(): Promise<void> {
  const [command, file, outputFile] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h" || command === "help") {
    usage();
    return;
  }
  if (!["validate", "list-tools", "serve", "import-openapi"].includes(command)) {
    console.error(`Unknown command: ${command}\n`);
    usage();
    process.exitCode = 2;
    return;
  }
  if (!file) {
    console.error(`Missing input file for "${command}".\n`);
    usage();
    process.exitCode = 2;
    return;
  }

  try {
    if (command === "import-openapi") {
      const source = await readFile(file, "utf8");
      const parsed = parseManifestText(source, file);
      const generated = generateManifestFromOpenApi(parsed);
      const validation = validateManifest(generated.manifest);
      if (!validation.valid) {
        const details = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        throw new Error(`Generated manifest failed validation: ${details}`);
      }
      const yaml = stringifyYaml(generated.manifest);
      if (outputFile) {
        await writeFile(outputFile, yaml, "utf8");
        console.log(`Generated draft manifest: ${outputFile}`);
      } else {
        process.stdout.write(yaml);
      }
      for (const warning of generated.warnings) console.error(`Warning: ${warning}`);
      console.error(`Generated ${generated.manifest.tools.length} GET tool(s) from ${file}.`);
      return;
    }

    if (command === "serve") {
      await startStdioServer(file);
      return;
    }

    const manifest = await loadAndValidateManifest(file);
    if (command === "validate") {
      console.log(`✓ Valid connector manifest: ${manifest.id} (${manifest.name})`);
      console.log(`  Version: ${manifest.version}`);
      console.log(`  Adapter: ${manifest.adapter.type}`);
      console.log(`  Tools:   ${manifest.tools.length}`);
      return;
    }
    for (const tool of manifest.tools) {
      console.log(`${manifest.id}.${tool.name}\t[${tool.risk.level}]\t${tool.title}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
