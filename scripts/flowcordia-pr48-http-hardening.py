from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:160]!r}")
    file.write_text(content.replace(old, new, 1))


runtime = "packages/flowcordia-runtime/src/runtime.ts"
replace_once(
    runtime,
    '''function isJsonContentType(value: string | null): boolean {\n  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();\n  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));\n}\n\n''',
    '''async function cancelResponseBody(response: Response): Promise<void> {\n  await response.body?.cancel().catch(() => undefined);\n}\n\n''',
)
replace_once(
    runtime,
    '''  if (contentLength && /^\\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {\n    throw new FlowcordiaHttpRuntimeError(\n      `HTTP response exceeds the configured ${maxBytes}-byte limit.`\n    );\n  }\n''',
    '''  if (contentLength && /^\\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {\n    await cancelResponseBody(response);\n    throw new FlowcordiaHttpRuntimeError(\n      `HTTP response exceeds the configured ${maxBytes}-byte limit.`\n    );\n  }\n''',
)
replace_once(
    runtime,
    '''  if (configuration.responseMode === "none") {\n    await response.body?.cancel().catch(() => undefined);\n    return null;\n  }\n\n  const text = await readBoundedResponseBody(response, configuration.maxResponseBytes);\n  if (!text) return null;\n  if (\n    configuration.responseMode === "text" ||\n    (configuration.responseMode === "auto" &&\n      !isJsonContentType(response.headers.get("content-type")))\n  ) {\n    return text;\n  }\n  try {\n    return jsonValue(JSON.parse(text));\n  } catch {\n    throw new FlowcordiaHttpRuntimeError("HTTP response was expected to contain valid JSON.");\n  }\n''',
    '''  if (configuration.responseMode === "none") {\n    await cancelResponseBody(response);\n    return null;\n  }\n\n  const text = await readBoundedResponseBody(response, configuration.maxResponseBytes);\n  if (!text) return null;\n  if (configuration.responseMode === "text") return text;\n  try {\n    return jsonValue(JSON.parse(text));\n  } catch {\n    if (configuration.responseMode === "auto") return text;\n    throw new FlowcordiaHttpRuntimeError("HTTP response was expected to contain valid JSON.");\n  }\n''',
)
replace_once(
    runtime,
    '''        if (response.status >= 300 && response.status < 400) {\n          throw new FlowcordiaHttpRuntimeError(\n            "HTTP redirects are not followed; call the final allowlisted HTTPS destination directly."\n          );\n        }\n        if (!response.ok) {\n          throw new FlowcordiaHttpRuntimeError(\n            `HTTP request failed with status ${response.status}.`\n          );\n        }\n''',
    '''        if (response.status >= 300 && response.status < 400) {\n          await cancelResponseBody(response);\n          throw new FlowcordiaHttpRuntimeError(\n            "HTTP redirects are not followed; call the final allowlisted HTTPS destination directly."\n          );\n        }\n        if (!response.ok) {\n          await cancelResponseBody(response);\n          throw new FlowcordiaHttpRuntimeError(\n            `HTTP request failed with status ${response.status}.`\n          );\n        }\n''',
)

compiler = "packages/flowcordia-runtime/src/compiler.ts"
replace_once(
    compiler,
    '''    `  authorizeHttp: (url) => {`,\n    `    const allowlist = (process.env.FLOWCORDIA_HTTP_HOST_ALLOWLIST ?? "")`,\n    `      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);`,\n    `    return url.protocol === "https:" && allowlist.includes(url.hostname.toLowerCase());`,\n    `  },`,\n''',
    '''    `  authorizeHttp: (url) => {`,\n    `    const origins = new Set((process.env.FLOWCORDIA_HTTP_ORIGIN_ALLOWLIST ?? "")`,\n    `      .split(",").map((origin) => origin.trim().toLowerCase().replace(/\\/$/, "")).filter(Boolean));`,\n    `    const legacyHosts = new Set((process.env.FLOWCORDIA_HTTP_HOST_ALLOWLIST ?? "")`,\n    `      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));`,\n    `    const legacyStandardHttps = url.protocol === "https:" && url.port === ""`,\n    `      && legacyHosts.has(url.hostname.toLowerCase());`,\n    `    return url.protocol === "https:"`,\n    `      && (origins.has(url.origin.toLowerCase()) || legacyStandardHttps);`,\n    `  },`,\n''',
)

tests = "packages/flowcordia-runtime/test/http-runtime.test.ts"
replace_once(
    tests,
    '''async function execute(\n  configuration: JsonObject,\n  fetch: typeof globalThis.fetch,\n  options: {\n    credentialReferences?: string[];\n    resolveCredential?(reference: string): Promise<JsonObject> | JsonObject;\n    signal?: AbortSignal;\n    payload?: JsonValue;\n  } = {}\n) {\n  return executeFlowcordiaWorkflow(\n    workflow(configuration, options.credentialReferences),\n    options.payload ?? { orderId: "order_123" },\n    createTriggerRuntimeAdapters({\n      fetch,\n      authorizeHttp: (url) => url.hostname === "api.example.com",\n      wait: async () => undefined,\n      resolveCredential: options.resolveCredential,\n    }),\n    { signal: options.signal }\n  );\n}\n\n''',
    '''async function execute(\n  configuration: JsonObject,\n  fetch: typeof globalThis.fetch,\n  options: {\n    credentialReferences?: string[];\n    resolveCredential?(reference: string): Promise<JsonObject> | JsonObject;\n    signal?: AbortSignal;\n    payload?: JsonValue;\n  } = {}\n) {\n  return executeFlowcordiaWorkflow(\n    workflow(configuration, options.credentialReferences),\n    options.payload ?? { orderId: "order_123" },\n    createTriggerRuntimeAdapters({\n      fetch,\n      authorizeHttp: (url) => url.hostname === "api.example.com",\n      wait: async () => undefined,\n      resolveCredential: options.resolveCredential,\n    }),\n    { signal: options.signal }\n  );\n}\n\nfunction cancelTrackedResponse(input: {\n  status: number;\n  headers?: HeadersInit;\n  body?: string;\n}) {\n  let cancelled = false;\n  const bytes = new TextEncoder().encode(input.body ?? "failure");\n  const stream = new ReadableStream<Uint8Array>({\n    start(controller) {\n      controller.enqueue(bytes);\n    },\n    cancel() {\n      cancelled = true;\n    },\n  });\n  return {\n    response: new Response(stream, { status: input.status, headers: input.headers }),\n    wasCancelled: () => cancelled,\n  };\n}\n\n''',
)
replace_once(
    tests,
    '''  });\n\n  it("does not send a body for GET or when body mode is disabled", async () => {\n''',
    '''  });\n\n  it("preserves legacy JSON parsing when an API omits the content type", async () => {\n    const fetch = vi.fn(async () =>\n      Promise.resolve(new Response('{"accepted":true}', { status: 200 }))\n    );\n\n    const result = await execute(\n      { method: "GET", url: "https://api.example.com/orders" },\n      fetch\n    );\n\n    expect(result).toMatchObject({ success: true, output: { accepted: true } });\n  });\n\n  it("does not send a body for GET or when body mode is disabled", async () => {\n''',
)
replace_once(
    tests,
    '''  it("rejects redirects instead of allowing an allowlist bypass", async () => {\n''',
    '''  it("fails explicit JSON mode when the response is not valid JSON", async () => {\n    const fetch = vi.fn(async () => Promise.resolve(new Response("not-json", { status: 200 })));\n\n    const result = await execute(\n      {\n        method: "GET",\n        url: "https://api.example.com/orders",\n        bodyMode: "none",\n        responseMode: "json",\n        timeoutSeconds: 30,\n        maxResponseBytes: 1_024,\n      },\n      fetch\n    );\n\n    expect(result).toMatchObject({ success: false, failedNodeId: "request" });\n    expect(result.traces.at(-1)?.message).toContain("expected to contain valid JSON");\n  });\n\n  it("rejects redirects instead of allowing an allowlist bypass", async () => {\n''',
)
replace_once(
    tests,
    '''  it("stops reading a response above the configured byte limit", async () => {\n''',
    '''  it("cancels rejected redirect, error, and declared-oversize response bodies", async () => {\n    const redirect = cancelTrackedResponse({\n      status: 302,\n      headers: { location: "https://untrusted.example.net/orders" },\n    });\n    const failed = cancelTrackedResponse({ status: 503 });\n    const oversized = cancelTrackedResponse({\n      status: 200,\n      headers: { "content-length": "10" },\n      body: "1234567890",\n    });\n    const fetch = vi\n      .fn<typeof globalThis.fetch>()\n      .mockResolvedValueOnce(redirect.response)\n      .mockResolvedValueOnce(failed.response)\n      .mockResolvedValueOnce(oversized.response);\n\n    await execute({ method: "GET", url: "https://api.example.com/orders" }, fetch);\n    await execute({ method: "GET", url: "https://api.example.com/orders" }, fetch);\n    await execute(\n      {\n        method: "GET",\n        url: "https://api.example.com/orders",\n        bodyMode: "none",\n        responseMode: "text",\n        timeoutSeconds: 30,\n        maxResponseBytes: 4,\n      },\n      fetch\n    );\n\n    expect(redirect.wasCancelled()).toBe(true);\n    expect(failed.wasCancelled()).toBe(true);\n    expect(oversized.wasCancelled()).toBe(true);\n  });\n\n  it("stops reading a response above the configured byte limit", async () => {\n''',
)
replace_once(
    tests,
    '''    expect(result.artifact.source).toContain('"maxResponseBytes": 1048576');\n  });\n''',
    '''    expect(result.artifact.source).toContain('"maxResponseBytes": 1048576');\n    expect(result.artifact.source).toContain("FLOWCORDIA_HTTP_ORIGIN_ALLOWLIST");\n    expect(result.artifact.source).toContain('url.port === ""');\n  });\n''',
)

architecture = "flowcordia/architecture/approved-node-catalog.md"
replace_once(
    architecture,
    '''The generated task resolves the configured hostname against `FLOWCORDIA_HTTP_HOST_ALLOWLIST`. The live adapter then:\n''',
    '''The generated task first resolves the configured exact origin against `FLOWCORDIA_HTTP_ORIGIN_ALLOWLIST`. Existing `FLOWCORDIA_HTTP_HOST_ALLOWLIST` entries remain a compatibility fallback only for standard HTTPS on port 443; non-standard ports require an exact origin entry. The live adapter then:\n''',
)
replace_once(
    architecture,
    '''7. streams the response only to the configured byte limit;\n8. returns the selected JSON, text, auto, or no-body representation.\n''',
    '''7. cancels rejected redirect, non-success, ignored, and declared-oversize response bodies before returning control to the worker pool;\n8. streams accepted responses only to the configured byte limit;\n9. preserves legacy JSON-first auto parsing while explicit JSON mode remains strict.\n''',
)

test_matrix = "flowcordia/testing/http-api-node-test-matrix.md"
replace_once(
    test_matrix,
    '''- The exact destination is authorized and redirects use manual handling.\n- Workflow cancellation reaches the active fetch and timeout aborts the request.\n- Response streaming stops above the configured byte limit.\n- Auto, JSON, text, and no-body response semantics are deterministic.\n''',
    '''- The exact origin is authorized; legacy host entries apply only to standard HTTPS, and redirects use manual handling.\n- Workflow cancellation reaches the active fetch and timeout aborts the request.\n- Redirect, non-success, ignored, and declared-oversize bodies are cancelled before the worker continues.\n- Response streaming stops above the configured byte limit.\n- Legacy JSON-first auto behavior, strict JSON, text, and no-body response semantics are deterministic.\n''',
)

runtime_readme = "packages/flowcordia-runtime/README.md"
replace_once(
    runtime_readme,
    '''The live HTTP adapter parses the same versioned configuration used by Studio and the compiler. It authorizes the exact HTTPS destination before fetching, sets `redirect: "manual"`, propagates workflow cancellation, applies a 1–300 second timeout, and streams at most the configured 1–5,242,880 response bytes. Request bodies are either the current workflow input serialized as JSON or absent. Responses may be selected as JSON, text, content-type-driven auto, or ignored. Generated tasks contain normalized defaults, while structural preview remains network-free.\n''',
    '''The live HTTP adapter parses the same versioned configuration used by Studio and the compiler. It authorizes an exact HTTPS origin before fetching; the legacy hostname allowlist remains compatible only with standard port 443. It sets `redirect: "manual"`, propagates workflow cancellation, applies a 1–300 second timeout, cancels rejected or ignored response bodies, and streams at most the configured 1–5,242,880 response bytes. Request bodies are either the current workflow input serialized as JSON or absent. Auto mode preserves the earlier JSON-first behavior and falls back to text, while explicit JSON remains strict; text and no-body modes are deterministic. Generated tasks contain normalized defaults, while structural preview remains network-free.\n''',
)
