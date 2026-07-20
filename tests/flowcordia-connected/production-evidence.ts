import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FlowcordiaProductionAcceptanceEvidence } from "../../apps/webapp/app/features/flowcordia/acceptance/production-contract";

const FORBIDDEN_KEY =
  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|policyId|installationId|workerId|databaseId|provider|stack|rawError/i;

function rejectForbidden(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectForbidden(child, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new TypeError(
        `Production acceptance evidence contains forbidden field ${[...path, key].join(".")}.`
      );
    }
    rejectForbidden(child, [...path, key]);
  }
}

export async function writeFlowcordiaProductionAcceptanceEvidence(
  path: string,
  evidence: FlowcordiaProductionAcceptanceEvidence
): Promise<void> {
  rejectForbidden(evidence);
  const content = `${JSON.stringify(evidence, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > 32 * 1_024) {
    throw new RangeError("Production acceptance evidence exceeds 32 KiB.");
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
}
