import { describe, expect, it } from "vitest";
import { validateToolOutput } from "../src/runtime.js";

describe("MCP tool output schema validation", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["id", "name"],
    properties: {
      id: { type: "integer", minimum: 1 },
      name: { type: "string", minLength: 1 },
    },
  };

  it("accepts structured results matching the declared output schema", () => {
    expect(validateToolOutput(schema, { id: 42, name: "example" })).toBeUndefined();
  });

  it("rejects missing required fields and invalid property types", () => {
    expect(validateToolOutput(schema, { id: "42" })).toMatch(/required property|must have required property/);
  });

  it("rejects undeclared fields when additionalProperties is false", () => {
    expect(validateToolOutput(schema, { id: 42, name: "example", secret: "unexpected" })).toMatch(/must NOT have additional properties/);
  });

  it("reports invalid output schemas clearly", () => {
    expect(() => validateToolOutput({ type: "not-a-json-schema-type" }, {})).toThrow(/Invalid tool outputSchema/);
  });
});
