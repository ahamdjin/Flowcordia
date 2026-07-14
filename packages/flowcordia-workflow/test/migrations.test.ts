import { describe, expect, it } from "vitest";

import { migrateWorkflowDocument, type WorkflowMigration } from "../src/index.js";
import { createValidWorkflow } from "./fixtures.js";

const legacyMigration: WorkflowMigration = {
  fromVersion: "0.0",
  toVersion: "0.1",
  migrate(document) {
    const { title, ...rest } = document;
    return { ...rest, schemaVersion: "0.1", name: title };
  },
};

describe("migrateWorkflowDocument", () => {
  it("validates current documents without applying migrations", () => {
    const workflow = createValidWorkflow();

    expect(migrateWorkflowDocument(workflow)).toEqual({
      success: true,
      workflow,
      appliedMigrations: [],
      issues: [],
    });
  });

  it("runs explicit migrations without mutating the input", () => {
    const workflow = createValidWorkflow();
    const { name, ...legacyFields } = workflow;
    const legacy = { ...legacyFields, schemaVersion: "0.0", title: name };
    const snapshot = structuredClone(legacy);

    const result = migrateWorkflowDocument(legacy, [legacyMigration]);

    expect(result.success).toBe(true);
    expect(result.appliedMigrations).toEqual([{ fromVersion: "0.0", toVersion: "0.1" }]);
    expect(legacy).toEqual(snapshot);
  });

  it("reports a missing migration path", () => {
    const result = migrateWorkflowDocument({ ...createValidWorkflow(), schemaVersion: "9.9" });

    expect(result.success).toBe(false);
    expect(result.issues[0]?.code).toBe("migration_missing");
  });

  it("detects cycles and invalid migration output", () => {
    const cycle = migrateWorkflowDocument({ ...createValidWorkflow(), schemaVersion: "0.0" }, [
      {
        fromVersion: "0.0",
        toVersion: "0.2",
        migrate: (value) => ({ ...value, schemaVersion: "0.2" }),
      },
      {
        fromVersion: "0.2",
        toVersion: "0.0",
        migrate: (value) => ({ ...value, schemaVersion: "0.0" }),
      },
    ]);
    const invalid = migrateWorkflowDocument({ ...createValidWorkflow(), schemaVersion: "0.0" }, [
      { fromVersion: "0.0", toVersion: "0.1", migrate: () => [] },
    ]);

    expect(cycle.success).toBe(false);
    expect(cycle.issues.at(-1)?.code).toBe("migration_cycle");
    expect(invalid.success).toBe(false);
    expect(invalid.issues[0]?.code).toBe("migration_failed");
  });
});
