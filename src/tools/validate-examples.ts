import { relative, resolve } from "node:path";
import { findManifestFiles, loadAndValidateManifest } from "../manifest.js";

async function main(): Promise<void> {
  const root = process.cwd();
  const files = await findManifestFiles(root);
  if (files.length === 0) {
    console.error("No JSON/YAML example manifests found under examples/.");
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  for (const file of files) {
    try {
      const manifest = await loadAndValidateManifest(file);
      console.log(`✓ ${relative(root, file)} — ${manifest.id} (${manifest.tools.length} tool(s))`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${relative(root, file)} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\nValidated ${files.length} manifest(s); ${failures} failure(s).`);
  if (failures > 0) process.exitCode = 1;
}

void main();
