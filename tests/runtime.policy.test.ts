import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseManifestText, validateManifest } from "../src/manifest.js";
import { assertAutomaticExecutionAllowed } from "../src/runtime.js";

const fixture = resolve(process.cwd(), "examples/connectors/public-http-api.yaml");

async function getManifest() {
  const source = await readFile(fixture, "utf8");
  const parsed = validateManifest(parseManifestText(source, fixture));
  if (!parsed.valid) throw new Error("Test fixture manifest is invalid");
  return parsed.manifest;
}

describe("approval policy enforcement", () => {
  it("blocks all automatic calls when policy requires approval always", async () => {
    const manifest = await getManifest();
    expect(() => assertAutomaticExecutionAllowed(
      { ...manifest, policy: { ...manifest.policy, defaultApproval: "always" } },
      manifest.tools[0]!,
    )).toThrow(/approval for every tool call/);
  });

  it("blocks high-risk tools under onRisk even if the tool flag is misconfigured", async () => {
    const manifest = await getManifest();
    const tool = { ...manifest.tools[0]!, risk: { ...manifest.tools[0]!.risk, level: "high" as const, requiresApproval: false } };
    expect(() => assertAutomaticExecutionAllowed(manifest, tool)).toThrow(/requires approval for this risk level/);
  });

  it("allows low-risk tools under onRisk policy", async () => {
    const manifest = await getManifest();
    expect(() => assertAutomaticExecutionAllowed(manifest, manifest.tools[0]!)).not.toThrow();
  });

  it("allows low-risk tools when the policy is never", async () => {
    const manifest = await getManifest();
    expect(() => assertAutomaticExecutionAllowed(
      { ...manifest, policy: { ...manifest.policy, defaultApproval: "never" } },
      manifest.tools[0]!,
    )).not.toThrow();
  });
});
