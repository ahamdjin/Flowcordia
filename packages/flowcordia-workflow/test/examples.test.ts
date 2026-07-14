import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseWorkflowDocument } from "../src/index.js";

const examplesDirectory = new URL("../examples/", import.meta.url);
const schemaUrl = new URL("../schema/0.1.json", import.meta.url);

describe("published workflow artifacts", () => {
  it("keeps every example valid", () => {
    const exampleFiles = readdirSync(examplesDirectory)
      .filter((file) => file.endsWith(".json"))
      .sort();

    expect(exampleFiles.length).toBeGreaterThan(0);
    for (const file of exampleFiles) {
      const result = parseWorkflowDocument(readFileSync(new URL(file, examplesDirectory), "utf8"));
      expect(result, `${file} should satisfy the workflow contract`).toEqual(
        expect.objectContaining({ success: true, issues: [] })
      );
    }
  });

  it("publishes the versioned JSON Schema next to the package", () => {
    const schema = JSON.parse(readFileSync(schemaUrl, "utf8")) as Record<string, unknown>;

    expect(schema).toEqual(
      expect.objectContaining({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://flowcordia.dev/schemas/workflow/0.1.json",
        additionalProperties: false,
      })
    );
  });
});
