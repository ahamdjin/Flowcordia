import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const FLOWCORDIA_OPERATIONS_HEALTH_PATH = "/tmp/flowcordia/operations-health.json";
export const FLOWCORDIA_OPERATIONS_HEALTH_INTERVAL_MS = 10_000;

export interface FlowcordiaOperationsLocalHealth {
  start(): void;
  stop(): void;
}

const APPLICATION_SHA = /^[0-9a-f]{40}$/;

export function createFlowcordiaOperationsLocalHealth(input: {
  applicationCommitSha: string;
  path?: string;
  intervalMs?: number;
  now?: () => Date;
}): FlowcordiaOperationsLocalHealth {
  if (
    !APPLICATION_SHA.test(input.applicationCommitSha) ||
    /^([0-9a-f])\1{39}$/.test(input.applicationCommitSha)
  ) {
    throw new TypeError("Flowcordia operations health application revision is invalid.");
  }

  const path = input.path ?? FLOWCORDIA_OPERATIONS_HEALTH_PATH;
  const intervalMs = input.intervalMs ?? FLOWCORDIA_OPERATIONS_HEALTH_INTERVAL_MS;
  const now = input.now ?? (() => new Date());
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const pulse = () => {
    const checkedAt = now();
    if (Number.isNaN(checkedAt.getTime())) {
      throw new TypeError("Flowcordia operations health time is invalid.");
    }
    const temporary = `${path}.tmp-${process.pid}`;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(
      temporary,
      `${JSON.stringify({
        schemaVersion: "0.1",
        state: "READY",
        applicationCommitSha: input.applicationCommitSha,
        checkedAt: checkedAt.toISOString(),
      })}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
    renameSync(temporary, path);
  };

  return {
    start() {
      if (timer || stopped) return;
      pulse();
      timer = setInterval(pulse, intervalMs);
      timer.unref();
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      rmSync(path, { force: true });
    },
  };
}
