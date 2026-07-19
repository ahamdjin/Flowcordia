import { readFileSync } from "node:fs";

import { parseWorkflowDocument } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { compileWorkflowToTriggerTask } from "../src/index.js";

const examplesDirectory = new URL("../../flowcordia-workflow/examples/", import.meta.url);

function readExample(file: string) {
  return parseWorkflowDocument(readFileSync(new URL(file, examplesDirectory), "utf8"));
}

describe("published Flowcordia examples", () => {
  it.each(["scheduled-code.json", "webhook-http.json"])(
    "keeps %s executable by the current compiler",
    (file) => {
      const parsed = readExample(file);

      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(compileWorkflowToTriggerTask(parsed.workflow)).toMatchObject({ success: true });
    }
  );

  it("keeps the approval example explicitly outside the delivered runtime subset", () => {
    const parsed = readExample("approval-email.json");

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const compiled = compileWorkflowToTriggerTask(parsed.workflow);
    expect(compiled.success).toBe(false);
    if (compiled.success) return;
    expect(compiled.issues.map((issue) => issue.nodeId).sort()).toEqual([
      "draft_ready",
      "review_message",
      "send_email",
    ]);
  });
});
