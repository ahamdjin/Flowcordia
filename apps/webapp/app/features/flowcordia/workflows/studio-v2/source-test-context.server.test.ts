import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  createStudioV2SourceTestContext,
  studioV2SourceTestIdentity,
} from "./source-test-context.server";

const execFileAsync = promisify(execFile);

describe("Studio V2 Source Trigger context", () => {
  it("packages the full TypeScript project and exact dependencies", async () => {
    const sourceProject = {
      entrypoint: "/src/index.ts",
      files: {
        "/src/index.ts": {
          code: 'import { z } from "zod";\nexport default async (ctx: FlowcordiaContext) => z.object({ input: z.unknown() }).parse({ input: ctx.input });\n',
        },
        "/src/helper.ts": { code: "export const helper = true;\n" },
      },
      dependencies: { zod: "3.25.76" },
      credentialReferences: ["billing-api"],
    };

    const context = await createStudioV2SourceTestContext({
      projectExternalRef: "proj_flowcordia_test",
      sourceProject,
    });
    try {
      expect(context.contentHash).toBe(studioV2SourceTestIdentity(sourceProject));
      const { stdout } = await execFileAsync("tar", ["-tzf", context.archivePath]);
      const files = stdout.replaceAll("\\", "/");
      expect(files).toContain("./source/src/index.ts");
      expect(files).toContain("./source/src/helper.ts");
      expect(files).toContain("./source/flowcordia.d.ts");
      expect(files).toContain("./trigger/source-test.ts");
      expect(files).toContain("./packages/flowcordia-workflow/");
    } finally {
      await context.cleanup();
    }
  }, 15_000);
});
