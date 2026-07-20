import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FlowcordiaConnectedAcceptanceEvidence } from "../../apps/webapp/app/features/flowcordia/acceptance/contract";

export async function writeFlowcordiaConnectedAcceptanceEvidence(
  path: string,
  evidence: FlowcordiaConnectedAcceptanceEvidence
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}
