import {
  parseFlowcordiaActivepiecesPieceConfiguration,
  type FlowcordiaActivepiecesPieceConfiguration,
  type JsonObject,
  type JsonValue,
  type WorkflowNode,
} from "@flowcordia/workflow";

const CONNECTION_REFERENCE = /^\{\{connections\['([^']+)'\]\}\}$/;

type UnknownRecord = Record<string, unknown>;

export interface FlowcordiaActivepiecesFormulaEvaluator {
  evaluate(input: {
    expression: string;
    sampleData: Record<string, unknown>;
  }): { result: unknown; error: string | null };
  containsWrapper?(input: string): boolean;
}

export interface FlowcordiaActivepiecesRuntimeServices {
  loadPiece(packageName: string): Promise<UnknownRecord>;
  resolveConnection(externalId: string): Promise<unknown>;
  formulaEvaluator?: FlowcordiaActivepiecesFormulaEvaluator;
  projectId?: string;
  projectExternalId?: string;
  runId?: string;
  serverApiUrl?: string;
  serverPublicUrl?: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

function storedConnectionValue(value: unknown): unknown {
  if (
    isRecord(value) &&
    value.kind === "activepieces_connection" &&
    "value" in value
  ) {
    return value.value;
  }
  return value;
}

async function resolveInputValue(input: {
  value: unknown;
  sampleData: Record<string, unknown>;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<unknown> {
  if (typeof input.value === "string") {
    const connection = input.value.match(CONNECTION_REFERENCE);
    if (connection?.[1]) {
      return storedConnectionValue(await input.services.resolveConnection(connection[1]));
    }
    if (
      input.services.formulaEvaluator &&
      (input.value.includes("{{") || input.services.formulaEvaluator.containsWrapper?.(input.value))
    ) {
      const evaluated = input.services.formulaEvaluator.evaluate({
        expression: input.value,
        sampleData: input.sampleData,
      });
      if (evaluated.error) {
        throw new Error(`Activepieces formula could not be resolved: ${evaluated.error}`);
      }
      return evaluated.result;
    }
    return input.value;
  }
  if (Array.isArray(input.value)) {
    return Promise.all(
      input.value.map((value) =>
        resolveInputValue({ value, sampleData: input.sampleData, services: input.services })
      )
    );
  }
  if (isRecord(input.value)) {
    const entries = await Promise.all(
      Object.entries(input.value).map(async ([key, value]) => [
        key,
        await resolveInputValue({ value, sampleData: input.sampleData, services: input.services }),
      ])
    );
    return Object.fromEntries(entries);
  }
  return input.value;
}

function findPiece(module: UnknownRecord, pieceName: string): UnknownRecord {
  const candidates = [module.default, ...Object.values(module)];
  const piece = candidates.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.name === pieceName &&
      (isRecord(candidate.actions) || isRecord(candidate.triggers))
  );
  if (!isRecord(piece)) {
    throw new Error(`Activepieces package ${pieceName} did not export its piece definition.`);
  }
  return piece;
}

function unsupportedCapability(name: string): never {
  throw new Error(
    `Activepieces piece requested ${name}, which is not mapped to the Flowcordia Trigger.dev runtime yet.`
  );
}

function actionContext(input: {
  node: WorkflowNode;
  propsValue: UnknownRecord;
  auth: unknown;
  services: FlowcordiaActivepiecesRuntimeServices;
}) {
  const projectId = input.services.projectId ?? "flowcordia";
  const runId = input.services.runId ?? "flowcordia-run";
  return {
    executionType: "BEGIN",
    propsValue: input.propsValue,
    auth: input.auth,
    step: { name: input.node.id },
    project: {
      id: projectId,
      externalId: async () => input.services.projectExternalId,
    },
    server: {
      apiUrl: input.services.serverApiUrl ?? "",
      publicUrl: input.services.serverPublicUrl ?? "",
      token: "",
    },
    connections: {
      get: async (key: string) => storedConnectionValue(await input.services.resolveConnection(key)),
    },
    tags: { add: async () => undefined },
    output: { update: async () => undefined },
    store: {
      put: async () => unsupportedCapability("context.store.put"),
      get: async () => unsupportedCapability("context.store.get"),
      delete: async () => unsupportedCapability("context.store.delete"),
    },
    files: {
      write: async () => unsupportedCapability("context.files.write"),
    },
    flows: {
      list: async () => unsupportedCapability("context.flows.list"),
      current: { id: input.node.id, version: { id: input.node.id } },
    },
    agent: {
      tools: async () => unsupportedCapability("context.agent.tools"),
    },
    run: {
      id: runId,
      stop: () => unsupportedCapability("context.run.stop"),
      respond: () => unsupportedCapability("context.run.respond"),
      createWaitpoint: async () => unsupportedCapability("context.run.createWaitpoint"),
      waitForWaitpoint: () => unsupportedCapability("context.run.waitForWaitpoint"),
    },
  };
}

function sampleData(input: {
  workflowInput: JsonValue;
  outputs: Readonly<Record<string, JsonValue>>;
}): Record<string, unknown> {
  return {
    trigger: { output: input.workflowInput },
    ...Object.fromEntries(
      Object.entries(input.outputs).map(([stepName, output]) => [stepName, { output }])
    ),
  };
}

export async function executeFlowcordiaActivepiecesAction(input: {
  node: WorkflowNode;
  configuration?: FlowcordiaActivepiecesPieceConfiguration;
  workflowInput: JsonValue;
  outputs: Readonly<Record<string, JsonValue>>;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<JsonValue> {
  const parsed = input.configuration
    ? { success: true as const, configuration: input.configuration }
    : parseFlowcordiaActivepiecesPieceConfiguration(input.node);
  if (!parsed.success) throw new Error(parsed.message);
  if (parsed.configuration.stepType !== "action") {
    throw new Error("Activepieces trigger execution requires a trigger binding, not an action run.");
  }

  const settings = parsed.configuration.settings;
  const module = await input.services.loadPiece(settings.pieceName);
  const piece = findPiece(module, settings.pieceName);
  const actions = piece.actions;
  if (!isRecord(actions)) {
    throw new Error(`Activepieces piece ${settings.pieceName} does not expose actions.`);
  }
  const action = actions[settings.actionName!];
  if (!isRecord(action) || typeof action.run !== "function") {
    throw new Error(
      `Activepieces action ${settings.pieceName}/${settings.actionName} is unavailable in ${settings.pieceVersion}.`
    );
  }

  const resolved = await resolveInputValue({
    value: settings.input,
    sampleData: sampleData({ workflowInput: input.workflowInput, outputs: input.outputs }),
    services: input.services,
  });
  if (!isRecord(resolved)) {
    throw new Error("Activepieces action input did not resolve to an object.");
  }
  const context = actionContext({
    node: input.node,
    propsValue: resolved,
    auth: resolved.auth,
    services: input.services,
  });
  return jsonValue(await (action.run as (context: UnknownRecord) => Promise<unknown>)(context));
}
