import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const MAX_EVIDENCE_BYTES = 32 * 1024;

function rejectForbidden(
  value: unknown,
  forbiddenKey: RegExp,
  boundary: string,
  path: string[] = []
) {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      rejectForbidden(child, forbiddenKey, boundary, [...path, String(index)])
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKey.test(key)) {
      throw new TypeError(
        `${boundary} acceptance evidence contains forbidden field ${[...path, key].join(".")}.`
      );
    }
    rejectForbidden(child, forbiddenKey, boundary, [...path, key]);
  }
}

function requireSuccessfulApplicationIdentity(value: unknown, boundary: string): void {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${boundary} acceptance evidence must be an object.`);
  }
  const evidence = value as Record<string, unknown>;
  if (evidence.result !== "PASSED") return;
  if (evidence.stage !== "complete" || !SHA.test(String(evidence.applicationCommitSha ?? ""))) {
    throw new TypeError(
      `${boundary} passed evidence requires a complete stage and exact application commit.`
    );
  }
}

export async function writeBoundedFlowcordiaAcceptanceEvidence(input: {
  boundary: string;
  path: string;
  evidence: unknown;
  forbiddenKey: RegExp;
}): Promise<void> {
  requireSuccessfulApplicationIdentity(input.evidence, input.boundary);
  rejectForbidden(input.evidence, input.forbiddenKey, input.boundary);
  const content = `${JSON.stringify(input.evidence, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > MAX_EVIDENCE_BYTES) {
    throw new RangeError(`${input.boundary} acceptance evidence exceeds 32 KiB.`);
  }
  await mkdir(dirname(input.path), { recursive: true, mode: 0o700 });
  const temporary = `${input.path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, input.path);
}
