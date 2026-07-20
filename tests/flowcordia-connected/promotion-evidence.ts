import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FlowcordiaPromotionAcceptanceEvidence } from "../../apps/webapp/app/features/flowcordia/acceptance/promotion-contract";

export async function writeFlowcordiaPromotionAcceptanceEvidence(
  path: string,
  evidence: FlowcordiaPromotionAcceptanceEvidence
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}
