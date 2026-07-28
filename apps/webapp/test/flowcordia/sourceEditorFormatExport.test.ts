import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
  "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowSourceWorkspace.tsx",
  "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowSourceWorkspace.safety.test.ts",
  "apps/webapp/app/features/flowcordia/workflows/studio/source-editor-safety.ts",
  "apps/webapp/app/features/flowcordia/workflows/studio/source-editor-safety.test.ts",
];

describe("source editor formatter export", () => {
  it("exports the exact repository formatter result", () => {
    execFileSync("pnpm", ["exec", "oxfmt", ...files], {
      cwd: process.cwd().replace(/\/apps\/webapp$/, ""),
      stdio: "pipe",
    });

    const formatted = Object.fromEntries(
      files.map((path) => [path, readFileSync(path, "utf8")])
    );
    const payload = Buffer.from(JSON.stringify(formatted)).toString("base64");

    console.log(`FLOWCORDIA_SOURCE_EDITOR_FORMATTED:${payload}`);
    expect(Object.keys(formatted)).toEqual(files);
  });
});
