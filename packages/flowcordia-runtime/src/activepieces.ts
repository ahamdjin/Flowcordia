import {
  parseFlowcordiaActivepiecesPieceConfiguration,
  type FlowcordiaActivepiecesPieceConfiguration,
  type JsonObject,
  type JsonValue,
  type WorkflowNode,
} from "@flowcordia/workflow";

const CONNECTION_REFERENCE = /^\{\{connections\['([^']+)'\]\}\}$/;
const DYNAMIC_KEY_MARKER = "~ap~";
const DYNAMIC_RESERVED_CHARS = /[~.[\]"']/;
const DYNAMIC_ESCAPE_SEQUENCES: Record<string, string> = {
  "~": "~0",
  ".": "~1",
  "[": "~2",
  "]": "~3",
  '"': "~4",
  "'": "~5",
};

type UnknownRecord = Record<string, unknown>;

export interface FlowcordiaActivepiecesFormulaEvaluator {
  evaluate(input: { expression: string; sampleData: Record<string, unknown> }): {
    result: unknown;
    error: string | null;
  };
  containsWrapper?(input: string): boolean;
}

export interface FlowcordiaActivepiecesRuntimeServices {
  loadPiece(packageName: string): Promise<UnknownRecord>;
  resolveConnection(externalId: string): Promise<unknown> | unknown;
  formulaEvaluator?: FlowcordiaActivepiecesFormulaEvaluator;
  projectId?: string;
  projectExternalId?: string;
  runId?: string;
  serverApiUrl?: string;
  serverPublicUrl?: string;
}

export interface FlowcordiaActivepiecesPropertyInput {
  pieceName: string;
  pieceVersion: string;
  actionOrTriggerName: string;
  propertyName: string;
  input: JsonObject;
  searchValue?: string;
  sampleData?: Readonly<Record<string, JsonValue>>;
}

export interface FlowcordiaActivepiecesAuthValidationInput {
  pieceName: string;
  pieceVersion: string;
  connectionExternalId: string;
}

export interface FlowcordiaActivepiecesAuthValidationResult {
  valid: boolean;
  error?: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

function storedConnectionValue(value: unknown): unknown {
  if (isRecord(value) && value.kind === "activepieces_connection" && "value" in value) {
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

function findComponent(piece: UnknownRecord, name: string): UnknownRecord {
  const actions = isRecord(piece.actions) ? piece.actions : {};
  const triggers = isRecord(piece.triggers) ? piece.triggers : {};
  const component = actions[name] ?? triggers[name];
  if (!isRecord(component)) {
    throw new Error(`Activepieces component ${String(piece.name)}/${name} is unavailable.`);
  }
  return component;
}

function unsupportedCapability(name: string): never {
  throw new Error(
    `Activepieces piece requested ${name}, which is not mapped to the Flowcordia Trigger.dev runtime yet.`
  );
}

function connectionManager(services: FlowcordiaActivepiecesRuntimeServices) {
  return {
    get: async (key: string) => storedConnectionValue(await services.resolveConnection(key)),
  };
}

function projectContext(services: FlowcordiaActivepiecesRuntimeServices) {
  return {
    id: services.projectId ?? "flowcordia",
    externalId: async () => services.projectExternalId,
  };
}

function serverContext(services: FlowcordiaActivepiecesRuntimeServices) {
  return {
    token: "",
    apiUrl: services.serverApiUrl ?? "",
    publicUrl: services.serverPublicUrl ?? "",
  };
}

function flowsContext() {
  return {
    list: async () => unsupportedCapability("context.flows.list"),
    current: { id: "flowcordia", version: { id: "flowcordia" } },
  };
}

function actionContext(input: {
  node: WorkflowNode;
  propsValue: UnknownRecord;
  auth: unknown;
  services: FlowcordiaActivepiecesRuntimeServices;
}) {
  const runId = input.services.runId ?? "flowcordia-run";
  return {
    executionType: "BEGIN",
    propsValue: input.propsValue,
    auth: input.auth,
    step: { name: input.node.id },
    project: projectContext(input.services),
    server: serverContext(input.services),
    connections: connectionManager(input.services),
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
    flows: flowsContext(),
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

function propertyContext(input: {
  actionOrTriggerName: string;
  searchValue?: string;
  services: FlowcordiaActivepiecesRuntimeServices;
}) {
  return {
    searchValue: input.searchValue,
    server: serverContext(input.services),
    project: projectContext(input.services),
    flows: flowsContext(),
    step: { name: input.actionOrTriggerName },
    connections: connectionManager(input.services),
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

function escapeDynamicKey(key: string): string {
  if (!DYNAMIC_RESERVED_CHARS.test(key)) return key;
  return (
    DYNAMIC_KEY_MARKER +
    key.replace(/[~.[\]"']/g, (character) => DYNAMIC_ESCAPE_SEQUENCES[character]!)
  );
}

function escapeDynamicPropertyKeys(properties: UnknownRecord): UnknownRecord {
  return Object.fromEntries(
    Object.entries(properties).map(([key, property]) => [escapeDynamicKey(key), property])
  );
}

function connectionAuthType(connection: UnknownRecord): string | null {
  switch (connection.type) {
    case "OAUTH2":
    case "PLATFORM_OAUTH2":
    case "CLOUD_OAUTH2":
      return "OAUTH2";
    case "SECRET_TEXT":
    case "BASIC_AUTH":
    case "CUSTOM_AUTH":
    case "OIDC":
      return connection.type;
    default:
      return null;
  }
}

function matchingAuthProperty(piece: UnknownRecord, connection: UnknownRecord): UnknownRecord | null {
  const expectedType = connectionAuthType(connection);
  if (!expectedType) return null;
  const candidates = Array.isArray(piece.auth) ? piece.auth : [piece.auth];
  const match = candidates.find(
    (candidate) => isRecord(candidate) && candidate.type === expectedType
  );
  return isRecord(match) ? match : null;
}

function authValueForValidation(authProperty: UnknownRecord, connection: UnknownRecord): unknown {
  switch (authProperty.type) {
    case "SECRET_TEXT":
      return connection.secret_text;
    case "CUSTOM_AUTH":
    case "OIDC":
      return connection.props;
    default:
      return connection;
  }
}

export async function executeFlowcordiaActivepiecesProperty(input: {
  request: FlowcordiaActivepiecesPropertyInput;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<JsonValue> {
  const module = await input.services.loadPiece(input.request.pieceName);
  const piece = findPiece(module, input.request.pieceName);
  const component = findComponent(piece, input.request.actionOrTriggerName);
  const properties = isRecord(component.props) ? component.props : {};
  const property = properties[input.request.propertyName];
  if (!isRecord(property)) {
    throw new Error(
      `Activepieces property ${input.request.pieceName}/${input.request.actionOrTriggerName}/${input.request.propertyName} is unavailable.`
    );
  }

  const resolvedInput = await resolveInputValue({
    value: input.request.input,
    sampleData: Object.fromEntries(
      Object.entries(input.request.sampleData ?? {}).map(([name, output]) => [name, { output }])
    ),
    services: input.services,
  });
  if (!isRecord(resolvedInput)) {
    throw new Error("Activepieces property input did not resolve to an object.");
  }

  const context = propertyContext({
    actionOrTriggerName: input.request.actionOrTriggerName,
    searchValue: input.request.searchValue,
    services: input.services,
  });
  try {
    switch (property.type) {
      case "DYNAMIC": {
        if (typeof property.props !== "function") {
          throw new Error("Activepieces dynamic property does not expose a props resolver.");
        }
        const dynamicProperties = await (
          property.props as (values: UnknownRecord, context: UnknownRecord) => Promise<unknown>
        )(resolvedInput, context);
        if (!isRecord(dynamicProperties)) {
          throw new Error("Activepieces dynamic property resolver returned an invalid property map.");
        }
        return jsonValue({ type: "DYNAMIC", options: escapeDynamicPropertyKeys(dynamicProperties) });
      }
      case "DROPDOWN":
      case "MULTI_SELECT_DROPDOWN": {
        if (typeof property.options !== "function") {
          throw new Error("Activepieces dropdown property does not expose an options resolver.");
        }
        const options = await (
          property.options as (values: UnknownRecord, context: UnknownRecord) => Promise<unknown>
        )(resolvedInput, context);
        return jsonValue({ type: property.type, options });
      }
      default:
        throw new Error(
          `Activepieces property type ${String(property.type)} is not executable in the Builder.`
        );
    }
  } catch {
    return jsonValue({
      type: property.type,
      options: {
        disabled: true,
        options: [],
        placeholder: "Throws an error, reconnect or refresh the page",
      },
    });
  }
}

export async function validateFlowcordiaActivepiecesConnection(input: {
  request: FlowcordiaActivepiecesAuthValidationInput;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<FlowcordiaActivepiecesAuthValidationResult> {
  const module = await input.services.loadPiece(input.request.pieceName);
  const piece = findPiece(module, input.request.pieceName);
  const rawConnection = await input.services.resolveConnection(input.request.connectionExternalId);
  const value = storedConnectionValue(rawConnection);
  if (!isRecord(value)) {
    return { valid: false, error: "Connection value is unavailable." };
  }
  if (value.type === "NO_AUTH" && piece.auth === undefined) return { valid: true };

  const authProperty = matchingAuthProperty(piece, value);
  if (!authProperty) {
    return {
      valid: false,
      error: "Connection value type does not match the Activepieces piece authentication type.",
    };
  }
  if (typeof authProperty.validate !== "function") return { valid: true };

  const result = await (
    authProperty.validate as (input: UnknownRecord) => Promise<unknown> | unknown
  )({
    auth: authValueForValidation(authProperty, value),
    server: serverContext(input.services),
  });
  if (!isRecord(result) || typeof result.valid !== "boolean") {
    throw new Error("Activepieces authentication validator returned an invalid response.");
  }
  return {
    valid: result.valid,
    ...(typeof result.error === "string" ? { error: result.error } : {}),
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
    throw new Error(
      "Activepieces trigger execution requires a trigger binding, not an action run."
    );
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
