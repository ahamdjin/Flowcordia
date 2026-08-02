import type { FlowcordiaActivepiecesRuntimeServices } from "./activepieces.js";

type UnknownRecord = Record<string, unknown>;

export interface FlowcordiaTriggerWaitToken {
  id: string;
  url: string;
}

export interface FlowcordiaTriggerWaitTokenResult {
  ok: boolean;
  output?: unknown;
  error?: unknown;
}

export interface FlowcordiaActivepiecesTriggerWaitAdapter {
  createToken(input: {
    timeout: string;
    idempotencyKey: string;
    idempotencyKeyTTL: string;
    tags: string[];
  }): Promise<FlowcordiaTriggerWaitToken>;
  forToken(id: string): Promise<FlowcordiaTriggerWaitTokenResult>;
  until(date: Date): Promise<void>;
}

interface DelayWaitpoint {
  kind: "DELAY";
  resumeAt: Date;
}

interface WebhookWaitpoint {
  kind: "WEBHOOK";
}

type WaitpointRecord = DelayWaitpoint | WebhookWaitpoint;

function parseWaitpointInput(input: UnknownRecord):
  | { type: "DELAY"; resumeAt: Date }
  | { type: "WEBHOOK" } {
  if (input.type === "DELAY") {
    if (typeof input.resumeDateTime !== "string" || input.resumeDateTime.trim().length === 0) {
      throw new Error("Activepieces DELAY waitpoints require resumeDateTime.");
    }
    const resumeAt = new Date(input.resumeDateTime);
    if (!Number.isFinite(resumeAt.getTime())) {
      throw new Error("Activepieces DELAY waitpoint resumeDateTime is invalid.");
    }
    return { type: "DELAY", resumeAt };
  }
  if (input.type === "WEBHOOK") return { type: "WEBHOOK" };
  throw new Error("Activepieces waitpoint type must be DELAY or WEBHOOK.");
}

function callbackUrlForToken(tokenUrl: string): string {
  const target = new URL(tokenUrl);
  if (!/^\/api\/v1\/waitpoints\/tokens\/waitpoint_[A-Za-z0-9_-]+\/callback\/[A-Za-z0-9_-]+$/.test(target.pathname)) {
    throw new Error("Trigger.dev returned an unexpected waitpoint callback URL.");
  }
  if (target.search.length > 0 || target.hash.length > 0) {
    throw new Error("Trigger.dev waitpoint callback URL must not contain query or fragment data.");
  }
  const encodedTarget = Buffer.from(target.toString(), "utf8").toString("base64url");
  return new URL(`/api/v1/flowcordia/activepieces/callbacks/${encodedTarget}`, target.origin).toString();
}

function buildResumeUrl(
  baseUrl: string,
  params: { queryParams: Record<string, string>; sync?: boolean }
): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params.queryParams)) url.searchParams.set(key, value);
  if (params.sync === true) url.searchParams.set("sync", "true");
  return url.toString();
}

export function createFlowcordiaActivepiecesTriggerRuntimeServices(input: {
  runId: string;
  wait: FlowcordiaActivepiecesTriggerWaitAdapter;
  webhookTimeout?: string;
}): Partial<FlowcordiaActivepiecesRuntimeServices> {
  const waitpoints = new Map<string, WaitpointRecord>();
  let sequence = 0;

  return {
    async createWaitpoint(rawInput) {
      const parsed = parseWaitpointInput(rawInput);
      sequence += 1;

      if (parsed.type === "DELAY") {
        const id = `flowcordia_delay_${input.runId}_${sequence}`;
        waitpoints.set(id, { kind: "DELAY", resumeAt: parsed.resumeAt });
        return {
          id,
          resumeUrl: "",
          buildResumeUrl: () => "",
        };
      }

      const token = await input.wait.createToken({
        timeout: input.webhookTimeout ?? "30d",
        idempotencyKey: `flowcordia-activepieces-waitpoint:${input.runId}:${sequence}`,
        idempotencyKeyTTL: "30d",
        tags: ["flowcordia:activepieces-waitpoint"],
      });
      const resumeUrl = callbackUrlForToken(token.url);
      waitpoints.set(token.id, { kind: "WEBHOOK" });
      return {
        id: token.id,
        resumeUrl,
        buildResumeUrl: (params) => buildResumeUrl(resumeUrl, params),
      };
    },

    async awaitWaitpoint(waitpointId) {
      const waitpoint = waitpoints.get(waitpointId);
      if (!waitpoint) throw new Error(`Unknown Activepieces waitpoint "${waitpointId}".`);

      try {
        if (waitpoint.kind === "DELAY") {
          await input.wait.until(waitpoint.resumeAt);
          return {};
        }

        const completed = await input.wait.forToken(waitpointId);
        if (!completed.ok) {
          throw completed.error instanceof Error
            ? completed.error
            : new Error(`Activepieces waitpoint "${waitpointId}" timed out.`);
        }
        return completed.output ?? {};
      } finally {
        waitpoints.delete(waitpointId);
      }
    },
  };
}
