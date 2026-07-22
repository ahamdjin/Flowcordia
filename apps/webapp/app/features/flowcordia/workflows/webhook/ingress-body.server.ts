export type FlowcordiaBoundedWebhookBodyResult =
  | { success: true; body: Uint8Array }
  | {
      success: false;
      code: "invalid_content_length" | "unsupported_content_encoding" | "body_too_large";
    };

const CONTENT_LENGTH_PATTERN = /^(0|[1-9]\d{0,15})$/;

export async function readFlowcordiaBoundedWebhookBody(
  request: Request,
  maxBodyBytes: number
): Promise<FlowcordiaBoundedWebhookBodyResult> {
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) {
    throw new TypeError("Webhook body limit is invalid.");
  }

  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    return { success: false, code: "unsupported_content_encoding" };
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!CONTENT_LENGTH_PATTERN.test(declaredLength)) {
      return { success: false, code: "invalid_content_length" };
    }
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length)) {
      return { success: false, code: "invalid_content_length" };
    }
    if (length > maxBodyBytes) return { success: false, code: "body_too_large" };
  }

  if (!request.body) return { success: true, body: new Uint8Array() };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      total += chunk.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel("Flowcordia webhook body limit exceeded");
        return { success: false, code: "body_too_large" };
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { success: true, body };
}
