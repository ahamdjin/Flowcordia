import { createHash } from "node:crypto";

const CORRELATION_ID_MAX_LENGTH = 255;
const SUFFIX_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export function flowcordiaChildCorrelationId(parent: string, suffix: string): string {
  if (parent.length === 0 || parent.length > CORRELATION_ID_MAX_LENGTH) {
    throw new TypeError("Parent correlation ID is outside the durable boundary.");
  }
  if (!SUFFIX_PATTERN.test(suffix)) {
    throw new TypeError("Correlation suffix is invalid.");
  }
  const candidate = parent + ":" + suffix;
  if (candidate.length <= CORRELATION_ID_MAX_LENGTH) return candidate;
  const digest = createHash("sha256").update(parent, "utf8").digest("hex");
  return "request:" + digest + ":" + suffix;
}
