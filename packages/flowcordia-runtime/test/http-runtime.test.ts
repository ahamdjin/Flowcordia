import type { JsonObject, JsonValue, WorkflowDefinition } from "@flowcordia/workflow";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compileWorkflowToTriggerTask,
  createTriggerRuntimeAdapters,
  executeFlowcordiaWorkflow,
} from "../src/index.js";

function workflow(configuration: JsonObject, credentialReferences?: string[]): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "http_contract",
    name: "HTTP contract",
    nodes: [
      {
        id: "start",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "request",
        kind: "action",
        operation: "action.http",
        position: { x: 240, y: 0 },
        configuration,
        ...(credentialReferences ? { credentialReferences } : {}),
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 480, y: 0 },
        configuration: {},
      },
    ],
    edges: [
      { id: "start_to_request", source: "start", target: "request" },
      { id: "request_to_output", source: "request", target: "output" },
    ],
  };
}

async function execute(
  configuration: JsonObject,
  fetch: typeof globalThis.fetch,
  options: {
    credentialReferences?: string[];
    resolveCredential?(reference: string): Promise<JsonObject> | JsonObject;
    signal?: AbortSignal;
    payload?: JsonValue;
  } = {}
) {
  return executeFlowcordiaWorkflow(
    workflow(configuration, options.credentialReferences),
    options.payload ?? { orderId: "order_123" },
    createTriggerRuntimeAdapters({
      fetch,
      authorizeHttp: (url) => url.hostname === "api.example.com",
      wait: async () => undefined,
      resolveCredential: options.resolveCredential,
    }),
    { signal: options.signal }
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Flowcordia live HTTP runtime", () => {
  it("normalizes legacy configuration and sends bounded JSON input without redirects", async () => {
    const fetch = vi.fn(async () =>
      Promise.resolve(
        new Response('{"accepted":true}', {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    const result = await execute(
      { method: " post ", url: " https://api.example.com/orders " },
      fetch
    );

    expect(result).toMatchObject({ success: true, output: { accepted: true } });
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://api.example.com/orders"),
      expect.objectContaining({
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json" },
        body: '{"orderId":"order_123"}',
        signal: expect.anything(),
      })
    );
  });

  it("does not send a body for GET or when body mode is disabled", async () => {
    const fetch = vi.fn(async () => Promise.resolve(new Response(null, { status: 204 })));

    await execute({ method: "GET", url: "https://api.example.com/orders" }, fetch);
    await execute(
      {
        method: "POST",
        url: "https://api.example.com/orders",
        bodyMode: "none",
        responseMode: "none",
        timeoutSeconds: 30,
        maxResponseBytes: 1_024,
      },
      fetch
    );

    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("body");
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({});
    expect(fetch.mock.calls[1]?.[1]).not.toHaveProperty("body");
  });

  it("honors explicit text response mode even for a JSON media type", async () => {
    const fetch = vi.fn(async () =>
      Promise.resolve(
        new Response('{"accepted":true}', {
          status: 200,
          headers: { "content-type": "application/problem+json" },
        })
      )
    );

    const result = await execute(
      {
        method: "GET",
        url: "https://api.example.com/orders",
        bodyMode: "none",
        responseMode: "text",
        timeoutSeconds: 30,
        maxResponseBytes: 1_024,
      },
      fetch
    );

    expect(result).toMatchObject({ success: true, output: '{"accepted":true}' });
  });

  it("rejects redirects instead of allowing an allowlist bypass", async () => {
    const fetch = vi.fn(async () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://untrusted.example.net/orders" },
        })
      )
    );

    const result = await execute({ method: "GET", url: "https://api.example.com/orders" }, fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(result).toMatchObject({ success: false, failedNodeId: "request" });
    expect(result.traces.at(-1)?.message).toContain("redirects are not followed");
  });

  it("stops reading a response above the configured byte limit", async () => {
    const fetch = vi.fn(async () => Promise.resolve(new Response("12345", { status: 200 })));

    const result = await execute(
      {
        method: "GET",
        url: "https://api.example.com/orders",
        bodyMode: "none",
        responseMode: "text",
        timeoutSeconds: 30,
        maxResponseBytes: 4,
      },
      fetch
    );

    expect(result).toMatchObject({ success: false, failedNodeId: "request" });
    expect(result.traces.at(-1)?.message).toContain("4-byte limit");
  });

  it("aborts a request at its configured timeout", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      async (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        })
    );

    const execution = execute(
      {
        method: "GET",
        url: "https://api.example.com/orders",
        bodyMode: "none",
        responseMode: "auto",
        timeoutSeconds: 1,
        maxResponseBytes: 1_024,
      },
      fetch
    );
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await execution;

    expect(result).toMatchObject({ success: false, failedNodeId: "request" });
    expect(result.traces.at(-1)?.message).toContain("timed out after 1 seconds");
  });

  it("propagates workflow cancellation into the active request", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      async (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        })
    );

    const execution = execute({ method: "GET", url: "https://api.example.com/orders" }, fetch, {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort();
    const result = await execution;

    expect(result).toMatchObject({ success: false, failedNodeId: "request" });
    expect(result.traces.at(-1)?.message).toBe("HTTP request was cancelled.");
  });

  it("rejects forbidden and duplicate credential headers before fetching", async () => {
    const fetch = vi.fn(async () => Promise.resolve(new Response(null, { status: 204 })));
    const duplicate = await execute(
      { method: "GET", url: "https://api.example.com/orders" },
      fetch,
      {
        credentialReferences: ["billing", "crm"],
        resolveCredential: (reference) => ({
          headers: { [reference === "billing" ? "Authorization" : "authorization"]: reference },
        }),
      }
    );
    const forbidden = await execute(
      { method: "GET", url: "https://api.example.com/orders" },
      fetch,
      {
        credentialReferences: ["billing"],
        resolveCredential: () => ({ headers: { "transfer-encoding": "chunked" } }),
      }
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(duplicate.traces.at(-1)?.message).toContain('both provide the "authorization" header');
    expect(forbidden.traces.at(-1)?.message).toContain("forbidden header");
  });
});

describe("Flowcordia HTTP compilation", () => {
  it("serializes the normalized runtime contract into generated repository code", () => {
    const result = compileWorkflowToTriggerTask(
      workflow({ method: " post ", url: " https://api.example.com/orders " })
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artifact.source).toContain('"method": "POST"');
    expect(result.artifact.source).toContain('"bodyMode": "input"');
    expect(result.artifact.source).toContain('"responseMode": "auto"');
    expect(result.artifact.source).toContain('"timeoutSeconds": 30');
    expect(result.artifact.source).toContain('"maxResponseBytes": 1048576');
  });

  it("rejects unknown HTTP configuration and fragment destinations before code generation", () => {
    const result = compileWorkflowToTriggerTask(
      workflow({
        method: "GET",
        url: "https://api.example.com/orders#secret",
        followRedirects: true,
      })
    );

    expect(result).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ code: "invalid_configuration", nodeId: "request" })],
    });
  });
});
