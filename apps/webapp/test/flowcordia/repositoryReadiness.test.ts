import { describe, expect, it } from "vitest";
import { inspectFlowcordiaTaskDiscovery } from "../../app/features/flowcordia/workflows/readiness/configuration";
import {
  presentFlowcordiaRepositoryReadiness,
  summarizeFlowcordiaRepositoryReadiness,
} from "../../app/features/flowcordia/workflows/readiness/presentation";
import { parseFlowcordiaRepositoryReadinessCommand } from "../../app/features/flowcordia/workflows/readiness/protocol";

describe("Flowcordia repository readiness", () => {
  it("accepts default Trigger.dev task discovery", () => {
    expect(
      inspectFlowcordiaTaskDiscovery(`
        import { defineConfig } from "@trigger.dev/sdk/v3";
        export default defineConfig({ project: "proj_123" });
      `)
    ).toEqual({
      state: "PASSED",
      message: "Trigger.dev default task discovery includes trigger/flowcordia.",
    });
  });

  it("accepts explicit generated-task directories", () => {
    expect(
      inspectFlowcordiaTaskDiscovery(`
        export default defineConfig({
          dirs: ["./jobs", "./trigger/"],
        });
      `).state
    ).toBe("PASSED");
    expect(
      inspectFlowcordiaTaskDiscovery(`
        export default defineConfig({
          dirs: ["trigger/flowcordia"],
        });
      `).state
    ).toBe("PASSED");
  });

  it("blocks explicit or dynamic directories that cannot discover generated tasks", () => {
    expect(
      inspectFlowcordiaTaskDiscovery(`
        export default defineConfig({ dirs: ["src/tasks"] });
      `)
    ).toMatchObject({ state: "BLOCKED" });
    expect(
      inspectFlowcordiaTaskDiscovery(`
        const dirs = ["trigger"];
        export default defineConfig({ dirs });
      `)
    ).toMatchObject({ state: "BLOCKED" });
    expect(
      inspectFlowcordiaTaskDiscovery(`
        const config = { dirs: ["trigger"] };
        export default defineConfig(config);
      `)
    ).toMatchObject({ state: "BLOCKED" });
  });

  it("blocks ambiguous configuration composition", () => {
    expect(
      inspectFlowcordiaTaskDiscovery(`
        const base = { dirs: ["trigger"] };
        export default defineConfig({ ...base, project: "proj_123" });
      `)
    ).toMatchObject({ state: "BLOCKED" });
    expect(
      inspectFlowcordiaTaskDiscovery(`
        export default defineConfig({ ["dirs"]: ["trigger"] });
      `)
    ).toMatchObject({ state: "BLOCKED" });
    expect(
      inspectFlowcordiaTaskDiscovery(`
        export default defineConfig({ project: "one" });
        defineConfig({ project: "two" });
      `)
    ).toMatchObject({ state: "BLOCKED" });
  });

  it("ignores comments, strings, and nested unrelated dirs", () => {
    expect(
      inspectFlowcordiaTaskDiscovery(`
        // dirs: ["src/tasks"]
        const note = "dirs: ['src/tasks']";
        export default defineConfig({
          project: "proj_123",
          build: { dirs: ["src/build-extensions"] },
        });
      `).state
    ).toBe("PASSED");
  });

  it("requires one exact bounded readiness command", () => {
    expect(parseFlowcordiaRepositoryReadinessCommand('{"operation":"check"}')).toEqual({
      success: true,
    });
    expect(
      parseFlowcordiaRepositoryReadinessCommand(
        '{"operation":"check","repository":"browser-controlled"}'
      )
    ).toMatchObject({ success: false });
    expect(parseFlowcordiaRepositoryReadinessCommand('{"operation":"other"}')).toMatchObject({
      success: false,
    });
    expect(parseFlowcordiaRepositoryReadinessCommand("not-json")).toMatchObject({
      success: false,
    });
  });

  it("orders checks, bounds messages, and fails closed", () => {
    const projection = presentFlowcordiaRepositoryReadiness({
      checkedAt: new Date("2026-07-19T18:00:00.000Z"),
      repository: {
        owner: "flowcordia",
        name: "reference",
        branch: "main",
        commitSha: "a".repeat(40),
      },
      checks: [
        {
          id: "preview-deployments",
          label: "Preview deployments",
          state: "PASSED",
          message: "Enabled",
        },
        {
          id: "repository-binding",
          label: "Repository binding",
          state: "BLOCKED",
          message: "x".repeat(2_000),
        },
      ],
    });

    expect(projection.state).toBe("BLOCKED");
    expect(projection.checks.map((check) => check.id)).toEqual([
      "repository-binding",
      "preview-deployments",
    ]);
    expect(projection.checks[0]?.message).toHaveLength(500);
    expect(summarizeFlowcordiaRepositoryReadiness([])).toBe("READY");
    expect(
      summarizeFlowcordiaRepositoryReadiness([
        {
          id: "repository-binding",
          label: "Repository binding",
          state: "UNAVAILABLE",
          message: "Unavailable",
        },
      ])
    ).toBe("UNAVAILABLE");
  });

  it("rejects duplicate browser projection checks", () => {
    expect(() =>
      presentFlowcordiaRepositoryReadiness({
        checkedAt: new Date(),
        repository: null,
        checks: [
          {
            id: "repository-binding",
            label: "Repository binding",
            state: "PASSED",
            message: "One",
          },
          {
            id: "repository-binding",
            label: "Repository binding",
            state: "PASSED",
            message: "Two",
          },
        ],
      })
    ).toThrow("Duplicate Flowcordia repository readiness check");
  });
});
