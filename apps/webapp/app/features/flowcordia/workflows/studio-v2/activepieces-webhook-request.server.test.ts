import { beforeEach, describe, expect, it, vi } from "vitest";

const stepFileMocks = vi.hoisted(() => ({
  save: vi.fn(),
}));

vi.mock("./activepieces-step-files.server", () => ({
  saveStudioV2ActivepiecesStepFile: stepFileMocks.save,
  studioV2ActivepiecesMaxFileBytes: () => 25 * 1024 * 1024,
}));

import { convertStudioV2ActivepiecesWebhookRequest } from "./activepieces-webhook-request.server";

const storage = {
  environmentId: "env_123",
  workflowId: "flow_123",
  publicOrigin: "https://flowcordia.test",
};

describe("Studio V2 Activepieces webhook request conversion", () => {
  beforeEach(() => {
    stepFileMocks.save.mockReset();
    stepFileMocks.save.mockResolvedValue({
      fileId: "file_123",
      readUrl: "https://flowcordia.test/api/v1/flowcordia/activepieces/files/file_123?token=signed",
      size: 3,
    });
  });

  it("maps binary bodies to an Activepieces FLOW_STEP_FILE URL and omits rawBody", async () => {
    const request = new Request("https://flowcordia.test/hook?source=provider", {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: new Uint8Array([1, 2, 3]),
    });

    const result = await convertStudioV2ActivepiecesWebhookRequest(request, storage);

    expect(result).toEqual({
      method: "POST",
      headers: expect.objectContaining({ "content-type": "application/pdf" }),
      queryParams: { source: "provider" },
      body: {
        fileUrl:
          "https://flowcordia.test/api/v1/flowcordia/activepieces/files/file_123?token=signed",
      },
    });
    expect(stepFileMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: "env_123",
        workflowId: "flow_123",
        publicOrigin: "https://flowcordia.test",
        fileName: "file.pdf",
        contentType: "application/pdf",
      })
    );
  });

  it("maps multipart files to read URLs and preserves repeated fields as arrays", async () => {
    const form = new FormData();
    form.append("tag", "one");
    form.append("tag", "two");
    form.append("upload", new Blob(["abc"], { type: "text/plain" }), "message.txt");
    const request = new Request("https://flowcordia.test/hook", {
      method: "POST",
      body: form,
    });

    const result = await convertStudioV2ActivepiecesWebhookRequest(request, storage);

    expect(result.body).toEqual({
      tag: ["one", "two"],
      upload: "https://flowcordia.test/api/v1/flowcordia/activepieces/files/file_123?token=signed",
    });
    expect(result).not.toHaveProperty("rawBody");
    expect(stepFileMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "message.txt",
        contentType: "text/plain",
        declaredSize: 3,
      })
    );
  });

  it("keeps rawBody for JSON payloads", async () => {
    const request = new Request("https://flowcordia.test/hook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"hello":"world"}',
    });

    await expect(convertStudioV2ActivepiecesWebhookRequest(request, storage)).resolves.toEqual({
      method: "POST",
      headers: expect.objectContaining({ "content-type": "application/json" }),
      queryParams: {},
      body: { hello: "world" },
      rawBody: '{"hello":"world"}',
    });
    expect(stepFileMocks.save).not.toHaveBeenCalled();
  });
});
