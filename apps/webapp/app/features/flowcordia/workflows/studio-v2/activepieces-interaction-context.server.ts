import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_DEPLOYMENT_CONTEXT_BYTES = 100 * 1024 * 1024;
const TRIGGER_SDK_VERSION = "4.5.0-rc.7";
const ACTIVEPIECES_FORMULA_VERSION = "0.2.0";
const ACTIVEPIECES_FORMULA_SOURCE_DIRECTORY =
  "studio-v2/activepieces-core-nodes/packages/core/formula/src";
const ACTIVEPIECES_LICENSE_PATH = "studio-v2/activepieces-core-nodes/LICENSE";
const ACTIVEPIECES_FORMULA_PACKAGE_DIRECTORY = "packages/activepieces-core-formula";
const FLOWCORDIA_PACKAGE_DIRECTORIES = [
  "packages/flowcordia-foundation",
  "packages/flowcordia-workflow",
  "packages/flowcordia-runtime",
] as const;

export const STUDIO_V2_ACTIVEPIECES_INTERACTION_TASK_ID =
  "flowcordia-studio-activepieces-interaction";

export interface StudioV2ActivepiecesInteractionContext {
  archivePath: string;
  contentLength: number;
  contentHash: string;
  generatedSource: string;
  cleanup(): Promise<void>;
}

function repositoryRoot(): string {
  return resolve(process.cwd(), "../..");
}

function activepiecesFormulaPackageManifest(): string {
  return `${JSON.stringify(
    {
      name: "@activepieces/core-formula",
      version: ACTIVEPIECES_FORMULA_VERSION,
      private: true,
      license: "MIT",
      type: "commonjs",
      main: "./src/index.ts",
      types: "./src/index.ts",
      dependencies: {
        dayjs: "1.11.9",
        "expr-eval": "2.0.2",
        tslib: "2.6.2",
      },
    },
    null,
    2
  )}\n`;
}

function packageManifest(pieceName: string, pieceVersion: string): string {
  return `${JSON.stringify(
    {
      name: "flowcordia-studio-v2-activepieces-interaction",
      private: true,
      type: "module",
      packageManager: "pnpm@10.33.2",
      engines: { node: ">=20.20.2" },
      dependencies: {
        "@activepieces/core-formula": "workspace:*",
        "@flowcordia/runtime": "workspace:*",
        "@flowcordia/workflow": "workspace:*",
        "@trigger.dev/sdk": TRIGGER_SDK_VERSION,
        [pieceName]: pieceVersion,
      },
    },
    null,
    2
  )}\n`;
}

function workspaceManifest(): string {
  return `packages:\n  - "packages/*"\n`;
}

function triggerConfig(projectExternalRef: string, pieceName: string): string {
  return `import { defineConfig } from "@trigger.dev/sdk";\n\nexport default defineConfig({\n  project: ${JSON.stringify(
    projectExternalRef
  )},\n  dirs: ["./trigger"],\n  runtime: "node-22",\n  build: {\n    external: ${JSON.stringify([pieceName])},\n  },\n});\n`;
}

function rootTsconfig(): string {
  return `${JSON.stringify(
    {
      extends: "./.configs/tsconfig.base.json",
      compilerOptions: {
        noEmit: true,
        module: "ESNext",
        moduleResolution: "Bundler",
      },
      include: ["trigger/**/*.ts", "trigger.config.ts"],
    },
    null,
    2
  )}\n`;
}

function interactionTaskSource(pieceName: string): string {
  return `import { createHash } from "node:crypto";
import { formulaEvaluator as activepiecesFormulaEvaluator } from "@activepieces/core-formula";
import {
  executeFlowcordiaActivepiecesAction,
  executeFlowcordiaActivepiecesAppEventParse,
  executeFlowcordiaActivepiecesAppEventVerify,
  executeFlowcordiaActivepiecesProperty,
  executeFlowcordiaActivepiecesTriggerDisable,
  executeFlowcordiaActivepiecesTriggerEnable,
  executeFlowcordiaActivepiecesTriggerHandshake,
  executeFlowcordiaActivepiecesTriggerRenew,
  executeFlowcordiaActivepiecesTriggerRun,
  executeFlowcordiaActivepiecesTriggerTest,
  inspectFlowcordiaActivepiecesTrigger,
  inspectFlowcordiaActivepiecesWebhookTrigger,
  isFlowcordiaActivepiecesHandshakeRequest,
} from "@flowcordia/runtime";
import type {
  FlowcordiaActivepiecesPropertyInteraction,
  FlowcordiaActivepiecesSimulationWakePayload,
  FlowcordiaActivepiecesTriggerInteraction,
  FlowcordiaActivepiecesTriggerPayload,
  FlowcordiaActivepiecesWebhookHandshakeConfiguration,
} from "@flowcordia/runtime";
import type { JsonValue, WorkflowNode } from "@flowcordia/workflow";
import { metadata, task, wait } from "@trigger.dev/sdk";

const PIECE_NAME = ${JSON.stringify(pieceName)};
const RESULT_LIMIT_BYTES = 64 * 1024;
const SIMULATION_TIMEOUT = "5m";

type InteractionPayload =
  | {
      requestId: string;
      kind: "property";
      interaction: FlowcordiaActivepiecesPropertyInteraction;
    }
  | {
      requestId: string;
      kind: "trigger_test";
      interaction: FlowcordiaActivepiecesTriggerInteraction;
    }
  | {
      requestId: string;
      kind: "trigger_inspect" | "trigger_webhook_inspect";
      interaction: FlowcordiaActivepiecesTriggerInteraction;
    }
  | {
      requestId: string;
      kind: "trigger_handshake";
      interaction: FlowcordiaActivepiecesTriggerInteraction;
    }
  | {
      requestId: string;
      kind: "trigger_renew";
      interaction: FlowcordiaActivepiecesTriggerInteraction;
    }
  | {
      requestId: string;
      kind: "app_event_parse";
      payload: FlowcordiaActivepiecesTriggerPayload;
    }
  | {
      requestId: string;
      kind: "app_event_verify";
      payload: FlowcordiaActivepiecesTriggerPayload;
      appWebhookUrl: string;
      webhookSecret: JsonValue;
    }
  | {
      requestId: string;
      kind: "trigger_simulation";
      environmentId: string;
      flowId: string;
      simulationId: string;
      interaction: FlowcordiaActivepiecesTriggerInteraction;
    }
  | {
      requestId: string;
      kind: "action_test";
      node: WorkflowNode;
      workflowInput: JsonValue;
      outputs: Record<string, JsonValue>;
    };

function connectionEnvironmentName(externalId: string): string {
  const digest = createHash("sha256").update(externalId).digest("hex").slice(0, 40).toUpperCase();
  return \`FLOWCORDIA_AP_CONNECTION_\${digest}\`;
}

async function resolveConnection(externalId: string): Promise<unknown> {
  const environmentName = connectionEnvironmentName(externalId);
  const raw = process.env[environmentName];
  if (!raw) throw new Error(\`Activepieces connection "\${externalId}" is unavailable.\`);
  return JSON.parse(raw) as unknown;
}

function activepiecesStoreKey(flowId: string, key: string, scope?: string): string {
  if (!key || typeof key !== "string" || key.length > 128) {
    throw new Error("Activepieces store key must contain between 1 and 128 characters.");
  }
  return scope === "COLLECTION" ? key : "flow_" + flowId + "/" + key;
}

async function activepiecesStoreRequest(input: {
  method: "GET" | "POST" | "DELETE";
  key: string;
  value?: unknown;
}): Promise<unknown> {
  const origin = process.env.TRIGGER_API_URL;
  const token = process.env.TRIGGER_SECRET_KEY;
  if (!origin || !token) {
    throw new Error(
      "Activepieces store requires Trigger.dev's built-in TRIGGER_API_URL and TRIGGER_SECRET_KEY runtime variables."
    );
  }
  const url = new URL("/api/v1/flowcordia/activepieces/store-entries", origin);
  url.searchParams.set("key", input.key);
  const response = await fetch(url, {
    method: input.method,
    headers: {
      authorization: "Bearer " + token,
      ...(input.method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(input.method === "POST" ? { body: JSON.stringify({ key: input.key, value: input.value }) } : {}),
  });
  if (input.method === "GET" && response.status === 404) return null;
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error("Activepieces store request failed with HTTP " + response.status + (details ? ": " + details : "."));
  }
  if (input.method === "DELETE") return null;
  const result = (await response.json()) as { value?: unknown };
  return result.value ?? null;
}

function writeResult(requestId: string, result: JsonValue): JsonValue {
  const serialized = JSON.stringify(result);
  if (Buffer.byteLength(serialized, "utf8") > RESULT_LIMIT_BYTES) {
    throw new Error("Activepieces Studio interaction result exceeds the bounded 64 KiB result limit.");
  }
  metadata.set("flowcordiaStudioInteraction", {
    schemaVersion: "0.1",
    requestId,
    status: "SUCCEEDED",
    result: serialized,
    updatedAt: new Date().toISOString(),
  });
  return result;
}

function simulationWebhookUrl(environmentId: string, simulationId: string): string {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new Error("APP_ORIGIN is required for Activepieces trigger simulation.");
  return new URL(
    \`/api/v1/flowcordia/studio-v2/activepieces-trigger-simulations/\${encodeURIComponent(environmentId)}/\${encodeURIComponent(simulationId)}\`,
    origin
  ).toString();
}

export const flowcordiaStudioActivepiecesInteraction = task({
  id: ${JSON.stringify(STUDIO_V2_ACTIVEPIECES_INTERACTION_TASK_ID)},
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  run: async (payload: InteractionPayload, { ctx }) => {
    const triggerInteraction = "interaction" in payload ? payload.interaction : undefined;
    const triggerFlowId =
      triggerInteraction && "flowId" in triggerInteraction && typeof triggerInteraction.flowId === "string"
        ? triggerInteraction.flowId
        : undefined;
    const services = {
      loadPiece: async (packageName: string) => {
        if (packageName !== PIECE_NAME) throw new Error("Interaction requested an undeployed Activepieces piece.");
        return import(packageName) as Promise<Record<string, unknown>>;
      },
      resolveConnection,
      formulaEvaluator: activepiecesFormulaEvaluator,
      projectId: process.env.TRIGGER_PROJECT_ID,
      projectExternalId: process.env.TRIGGER_PROJECT_REF,
      runId: ctx.run.id,
      serverApiUrl: process.env.APP_ORIGIN,
      serverPublicUrl: process.env.APP_ORIGIN,
      ...(triggerFlowId
        ? {
            store: {
              put: async (key: string, value: unknown, scope?: string) => {
                const storeKey = activepiecesStoreKey(triggerFlowId, key, scope);
                await activepiecesStoreRequest({ method: "POST", key: storeKey, value });
                return value;
              },
              get: async (key: string, scope?: string) =>
                activepiecesStoreRequest({
                  method: "GET",
                  key: activepiecesStoreKey(triggerFlowId, key, scope),
                }),
              delete: async (key: string, scope?: string) => {
                await activepiecesStoreRequest({
                  method: "DELETE",
                  key: activepiecesStoreKey(triggerFlowId, key, scope),
                });
              },
            },
          }
        : {}),
    };

    try {
      let result: JsonValue;
      switch (payload.kind) {
        case "property":
          result = await executeFlowcordiaActivepiecesProperty({ interaction: payload.interaction, services });
          break;
        case "trigger_test":
          result = await executeFlowcordiaActivepiecesTriggerTest({ interaction: payload.interaction, services });
          break;
        case "trigger_inspect":
          result = JSON.parse(JSON.stringify(await inspectFlowcordiaActivepiecesTrigger({ interaction: payload.interaction, services }))) as JsonValue;
          break;
        case "trigger_webhook_inspect":
          result = JSON.parse(JSON.stringify(await inspectFlowcordiaActivepiecesWebhookTrigger({ interaction: payload.interaction, services }))) as JsonValue;
          break;
        case "trigger_handshake":
          result = JSON.parse(JSON.stringify(await executeFlowcordiaActivepiecesTriggerHandshake({ interaction: payload.interaction, services }))) as JsonValue;
          break;
        case "trigger_renew":
          await executeFlowcordiaActivepiecesTriggerRenew({ interaction: payload.interaction, services });
          result = null;
          break;
        case "trigger_enable":
          result = JSON.parse(
            JSON.stringify(
              await executeFlowcordiaActivepiecesTriggerEnable({
                interaction: payload.interaction,
                services,
              })
            )
          ) as JsonValue;
          break;
        case "trigger_disable":
          await executeFlowcordiaActivepiecesTriggerDisable({
            interaction: payload.interaction,
            services,
          });
          result = null;
          break;
        case "trigger_run":
          result = await executeFlowcordiaActivepiecesTriggerRun({
            interaction: payload.interaction,
            services,
          });
          break;
        case "app_event_parse":
          result = JSON.parse(
            JSON.stringify(
              await executeFlowcordiaActivepiecesAppEventParse({
                pieceName: PIECE_NAME,
                payload: payload.payload,
                services,
              })
            )
          ) as JsonValue;
          break;
        case "app_event_verify":
          result = await executeFlowcordiaActivepiecesAppEventVerify({
            pieceName: PIECE_NAME,
            payload: payload.payload,
            appWebhookUrl: payload.appWebhookUrl,
            webhookSecret: payload.webhookSecret,
            services,
          });
          break;
        case "trigger_simulation": {
          const webhookUrl = simulationWebhookUrl(payload.environmentId, payload.simulationId);
          const interaction = { ...payload.interaction, webhookUrl };
          const webhookDescriptor = await inspectFlowcordiaActivepiecesWebhookTrigger({
            interaction,
            services,
          });
          const handshakeConfiguration =
            webhookDescriptor.handshakeConfiguration as FlowcordiaActivepiecesWebhookHandshakeConfiguration | null;
          let tokenSequence = 0;
          const createSimulationToken = () =>
            wait.createToken({
              timeout: SIMULATION_TIMEOUT,
              idempotencyKey:
                "flowcordia-studio-ap-simulation:" + payload.simulationId + ":" + String(tokenSequence++),
              idempotencyKeyTTL: "10m",
              tags: ["flowcordia-studio-v2", "activepieces-trigger-simulation"],
            });
          let token = await createSimulationToken();
          metadata.set("flowcordiaActivepiecesTriggerSimulation", {
            schemaVersion: "0.1",
            requestId: payload.requestId,
            simulationId: payload.simulationId,
            environmentId: payload.environmentId,
            flowId: payload.flowId,
            pieceName: payload.interaction.pieceName,
            triggerName: payload.interaction.triggerName,
            webhookUrl,
            waitTokenUrl: token.url,
            waitTokenId: token.id,
            status: "ARMING",
            updatedAt: new Date().toISOString(),
          });
          await metadata.flush();
          const enabled = await executeFlowcordiaActivepiecesTriggerEnable({ interaction, services });
          if (enabled.testStrategy !== "SIMULATION") {
            throw new Error(
              "Activepieces trigger " +
                payload.interaction.pieceName +
                "/" +
                payload.interaction.triggerName +
                " does not use SIMULATION testing."
            );
          }
          metadata.set("flowcordiaActivepiecesTriggerSimulation", {
            schemaVersion: "0.1",
            requestId: payload.requestId,
            simulationId: payload.simulationId,
            environmentId: payload.environmentId,
            flowId: payload.flowId,
            pieceName: payload.interaction.pieceName,
            triggerName: payload.interaction.triggerName,
            triggerType: enabled.triggerType,
            testStrategy: enabled.testStrategy,
            webhookUrl,
            waitTokenUrl: token.url,
            waitTokenId: token.id,
            schedule: enabled.schedule,
            appListeners: enabled.appListeners,
            status: "ARMED",
            updatedAt: new Date().toISOString(),
          });
          await metadata.flush();
          try {
            while (true) {
              const wakePayload = await wait
                .forToken<FlowcordiaActivepiecesSimulationWakePayload>(token)
                .unwrap();
              if (wakePayload.kind === "CANCEL") {
                result = [];
                metadata.set("flowcordiaActivepiecesTriggerSimulation", {
                  schemaVersion: "0.1",
                  requestId: payload.requestId,
                  simulationId: payload.simulationId,
                  environmentId: payload.environmentId,
                  flowId: payload.flowId,
                  pieceName: payload.interaction.pieceName,
                  triggerName: payload.interaction.triggerName,
                  triggerType: enabled.triggerType,
                  testStrategy: enabled.testStrategy,
                  webhookUrl,
                  waitTokenId: token.id,
                  schedule: enabled.schedule,
                  appListeners: enabled.appListeners,
                  status: "CANCELED",
                  updatedAt: new Date().toISOString(),
                });
                break;
              }
              if (
                isFlowcordiaActivepiecesHandshakeRequest({
                  payload: wakePayload.payload,
                  handshakeConfiguration,
                })
              ) {
                const response = await executeFlowcordiaActivepiecesTriggerHandshake({
                  interaction: { ...interaction, payload: wakePayload.payload },
                  services,
                });
                token = await createSimulationToken();
                metadata.set("flowcordiaActivepiecesTriggerSimulation", {
                  schemaVersion: "0.1",
                  requestId: payload.requestId,
                  simulationId: payload.simulationId,
                  environmentId: payload.environmentId,
                  flowId: payload.flowId,
                  pieceName: payload.interaction.pieceName,
                  triggerName: payload.interaction.triggerName,
                  triggerType: enabled.triggerType,
                  testStrategy: enabled.testStrategy,
                  webhookUrl,
                  waitTokenUrl: token.url,
                  waitTokenId: token.id,
                  schedule: enabled.schedule,
                  appListeners: enabled.appListeners,
                  callbackResult: { requestId: wakePayload.requestId, kind: "HANDSHAKE", response },
                  status: "ARMED",
                  updatedAt: new Date().toISOString(),
                });
                await metadata.flush();
                continue;
              }
              metadata.set("flowcordiaActivepiecesTriggerSimulation", {
                schemaVersion: "0.1",
                requestId: payload.requestId,
                simulationId: payload.simulationId,
                environmentId: payload.environmentId,
                flowId: payload.flowId,
                pieceName: payload.interaction.pieceName,
                triggerName: payload.interaction.triggerName,
                triggerType: enabled.triggerType,
                testStrategy: enabled.testStrategy,
                webhookUrl,
                waitTokenId: token.id,
                schedule: enabled.schedule,
                appListeners: enabled.appListeners,
                callbackResult: { requestId: wakePayload.requestId, kind: "EVENT_ACCEPTED" },
                status: "ARMED",
                updatedAt: new Date().toISOString(),
              });
              await metadata.flush();
              result = await executeFlowcordiaActivepiecesTriggerRun({
                interaction: { ...interaction, payload: wakePayload.payload },
                services,
              });
              const serialized = JSON.stringify(result);
              if (Buffer.byteLength(serialized, "utf8") > RESULT_LIMIT_BYTES) {
                throw new Error("Activepieces trigger simulation result exceeds the bounded 64 KiB result limit.");
              }
              metadata.set("flowcordiaActivepiecesTriggerSimulation", {
                schemaVersion: "0.1",
                requestId: payload.requestId,
                simulationId: payload.simulationId,
                environmentId: payload.environmentId,
                flowId: payload.flowId,
                pieceName: payload.interaction.pieceName,
                triggerName: payload.interaction.triggerName,
                triggerType: enabled.triggerType,
                testStrategy: enabled.testStrategy,
                webhookUrl,
                waitTokenId: token.id,
                schedule: enabled.schedule,
                appListeners: enabled.appListeners,
                callbackResult: { requestId: wakePayload.requestId, kind: "EVENT_ACCEPTED" },
                status: "COMPLETED",
                result: serialized,
                updatedAt: new Date().toISOString(),
              });
              break;
            }
          } finally {
            await executeFlowcordiaActivepiecesTriggerDisable({ interaction, services });
          }
          break;
        }
                case "action_test":
          result = await executeFlowcordiaActivepiecesAction({
            node: payload.node,
            workflowInput: payload.workflowInput,
            outputs: payload.outputs,
            services,
          });
          break;
      }
      return writeResult(payload.requestId, result);
    } catch (error) {
      if (payload.kind === "trigger_simulation") {
        metadata.set("flowcordiaActivepiecesTriggerSimulation", {
          schemaVersion: "0.1",
          requestId: payload.requestId,
          simulationId: payload.simulationId,
          environmentId: payload.environmentId,
          flowId: payload.flowId,
          pieceName: payload.interaction.pieceName,
          triggerName: payload.interaction.triggerName,
          status: "FAILED",
          message: error instanceof Error ? error.message.slice(0, 1000) : "Activepieces trigger simulation failed.",
          updatedAt: new Date().toISOString(),
        });
      }
      metadata.set("flowcordiaStudioInteraction", {
        schemaVersion: "0.1",
        requestId: payload.requestId,
        status: "FAILED",
        message: error instanceof Error ? error.message.slice(0, 1000) : "Activepieces interaction failed.",
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
  },
});
`;
}

function shouldCopyPackagePath(source: string): boolean {
  const normalized = source.replaceAll("\\", "/");
  return !["/node_modules/", "/dist/", "/.turbo/", "/coverage/", "/.git/"].some((segment) =>
    normalized.includes(segment)
  );
}

async function assertReadableFile(path: string): Promise<void> {
  try {
    await readFile(path);
  } catch {
    throw new Error(
      `Studio V2 Activepieces interactions require Flowcordia package source at ${path}. Reinstall the complete Flowcordia application bundle.`
    );
  }
}

async function createPortableArchive(input: {
  contextDirectory: string;
  archivePath: string;
}): Promise<void> {
  await execFileAsync(
    "tar",
    [
      "--create",
      "--gzip",
      "--file",
      input.archivePath,
      "--directory",
      input.contextDirectory,
      "--sort=name",
      "--mtime=@0",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      ".",
    ],
    { maxBuffer: 1024 * 1024 }
  );
}

export async function createStudioV2ActivepiecesInteractionContext(input: {
  pieceName: string;
  pieceVersion: string;
  projectExternalRef: string;
}): Promise<StudioV2ActivepiecesInteractionContext> {
  if (!input.pieceName.startsWith("@activepieces/piece-")) {
    throw new Error("Studio interaction piece must be an official Activepieces piece package.");
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(input.pieceVersion)) {
    throw new Error("Studio interaction piece version must be exact semantic versioning.");
  }

  const root = repositoryRoot();
  await assertReadableFile(join(root, ".configs", "tsconfig.base.json"));
  for (const packageDirectory of FLOWCORDIA_PACKAGE_DIRECTORIES) {
    await assertReadableFile(join(root, packageDirectory, "package.json"));
  }
  await assertReadableFile(join(root, ACTIVEPIECES_FORMULA_SOURCE_DIRECTORY, "index.ts"));
  await assertReadableFile(join(root, ACTIVEPIECES_LICENSE_PATH));

  const generatedSource = interactionTaskSource(input.pieceName);
  const contentHash = createHash("sha256")
    .update(`${input.pieceName}\0${input.pieceVersion}\0${generatedSource}`)
    .digest("hex");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "flowcordia-studio-v2-interaction-"));
  const contextDirectory = join(temporaryRoot, "context");
  const archivePath = join(temporaryRoot, "context.tar.gz");

  try {
    await mkdir(join(contextDirectory, "trigger"), { recursive: true });
    await mkdir(join(contextDirectory, ".configs"), { recursive: true });
    await writeFile(
      join(contextDirectory, "package.json"),
      packageManifest(input.pieceName, input.pieceVersion),
      "utf8"
    );
    await writeFile(join(contextDirectory, "pnpm-workspace.yaml"), workspaceManifest(), "utf8");
    await writeFile(
      join(contextDirectory, "trigger.config.ts"),
      triggerConfig(input.projectExternalRef, input.pieceName),
      "utf8"
    );
    await writeFile(join(contextDirectory, "tsconfig.json"), rootTsconfig(), "utf8");
    await writeFile(
      join(contextDirectory, "trigger", "flowcordia-activepieces-interaction.ts"),
      generatedSource,
      "utf8"
    );
    await cp(
      join(root, ".configs", "tsconfig.base.json"),
      join(contextDirectory, ".configs", "tsconfig.base.json")
    );

    for (const packageDirectory of FLOWCORDIA_PACKAGE_DIRECTORIES) {
      const destination = join(contextDirectory, packageDirectory);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(root, packageDirectory), destination, {
        recursive: true,
        filter: shouldCopyPackagePath,
      });
    }

    const formulaPackageDirectory = join(contextDirectory, ACTIVEPIECES_FORMULA_PACKAGE_DIRECTORY);
    await mkdir(join(formulaPackageDirectory, "src"), { recursive: true });
    await cp(
      join(root, ACTIVEPIECES_FORMULA_SOURCE_DIRECTORY),
      join(formulaPackageDirectory, "src"),
      { recursive: true, filter: shouldCopyPackagePath }
    );
    await cp(join(root, ACTIVEPIECES_LICENSE_PATH), join(formulaPackageDirectory, "LICENSE"));
    await writeFile(
      join(formulaPackageDirectory, "package.json"),
      activepiecesFormulaPackageManifest(),
      "utf8"
    );

    await createPortableArchive({ contextDirectory, archivePath });
    const archive = await stat(archivePath);
    if (archive.size <= 0 || archive.size > MAX_DEPLOYMENT_CONTEXT_BYTES) {
      throw new Error(
        `Studio V2 Activepieces interaction context must be between 1 byte and ${MAX_DEPLOYMENT_CONTEXT_BYTES} bytes.`
      );
    }

    return {
      archivePath,
      contentLength: archive.size,
      contentHash,
      generatedSource,
      async cleanup() {
        await rm(temporaryRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export const studioV2ActivepiecesInteractionContextContract = {
  maxBytes: MAX_DEPLOYMENT_CONTEXT_BYTES,
  resultLimitBytes: 64 * 1024,
  triggerSdkVersion: TRIGGER_SDK_VERSION,
  taskId: STUDIO_V2_ACTIVEPIECES_INTERACTION_TASK_ID,
  activepiecesFormulaSourceDirectory: ACTIVEPIECES_FORMULA_SOURCE_DIRECTORY,
};
