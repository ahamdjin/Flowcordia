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
  evaluate(input: { expression: string; sampleData: Record<string, unknown> }): {
    result: unknown;
    error: string | null;
  };
  containsWrapper?(input: string): boolean;
}

export interface FlowcordiaActivepiecesStoreService {
  put(key: string, value: unknown, scope?: string): Promise<unknown>;
  get(key: string, scope?: string): Promise<unknown>;
  delete(key: string, scope?: string): Promise<void>;
}

export interface FlowcordiaActivepiecesWaitpoint {
  id: string;
  resumeUrl: string;
  buildResumeUrl(params: { queryParams: Record<string, string>; sync?: boolean }): string;
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
  store?: FlowcordiaActivepiecesStoreService;
  writeFile?(input: { fileName: string; data: unknown }): Promise<string>;
  listFlows?(input?: { externalIds?: string[] }): Promise<unknown>;
  addTag?(name: string): Promise<void>;
  updateOutput?(data: Record<string, unknown>): Promise<void>;
  agentTools?(input: UnknownRecord): Promise<UnknownRecord>;
  stopRun?(input?: UnknownRecord): void;
  respond?(input?: UnknownRecord): void;
  createWaitpoint?(input: UnknownRecord): Promise<FlowcordiaActivepiecesWaitpoint>;
  waitForWaitpoint?(waitpointId: string): void;
}

export interface FlowcordiaActivepiecesPropertyInteraction {
  pieceName: string;
  actionOrTriggerName: string;
  propertyName: string;
  input: JsonObject;
  sampleData?: Record<string, unknown>;
  searchValue?: string;
}

export interface FlowcordiaActivepiecesTriggerPayload {
  body: unknown;
  rawBody?: unknown;
  method?: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
}

export interface FlowcordiaActivepiecesTriggerInteraction {
  pieceName: string;
  triggerName: string;
  input: JsonObject;
  sampleData?: Record<string, unknown>;
  webhookUrl?: string;
  payload?: FlowcordiaActivepiecesTriggerPayload;
}

export interface FlowcordiaActivepiecesTriggerDescriptor {
  triggerType: string;
  testStrategy: string;
}

export interface FlowcordiaActivepiecesTriggerEnableResult extends FlowcordiaActivepiecesTriggerDescriptor {
  schedule: JsonValue | null;
  appListeners: Array<{
    events: string[];
    identifierValue: string;
  }>;
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

function unsupportedCapability(name: string): never {
  throw new Error(
    `Activepieces piece requested ${name}, which is not mapped to the Flowcordia Trigger.dev runtime yet.`
  );
}

function projectContext(services: FlowcordiaActivepiecesRuntimeServices) {
  const projectId = services.projectId ?? "flowcordia";
  return {
    id: projectId,
    externalId: async () => services.projectExternalId,
  };
}

function serverContext(services: FlowcordiaActivepiecesRuntimeServices) {
  return {
    apiUrl: services.serverApiUrl ?? "",
    publicUrl: services.serverPublicUrl ?? "",
    token: "",
  };
}

function connectionsContext(services: FlowcordiaActivepiecesRuntimeServices) {
  return {
    get: async (key: string) => storedConnectionValue(await services.resolveConnection(key)),
  };
}

function flowsContext(services: FlowcordiaActivepiecesRuntimeServices, flowId: string) {
  return {
    list: async (params?: { externalIds?: string[] }) => {
      if (!services.listFlows) return unsupportedCapability("context.flows.list");
      return services.listFlows(params);
    },
    current: { id: flowId, version: { id: flowId } },
  };
}

function storeContext(services: FlowcordiaActivepiecesRuntimeServices) {
  return {
    put: async (key: string, value: unknown, scope?: string) => {
      if (!services.store) return unsupportedCapability("context.store.put");
      return services.store.put(key, value, scope);
    },
    get: async (key: string, scope?: string) => {
      if (!services.store) return unsupportedCapability("context.store.get");
      return services.store.get(key, scope);
    },
    delete: async (key: string, scope?: string) => {
      if (!services.store) return unsupportedCapability("context.store.delete");
      return services.store.delete(key, scope);
    },
  };
}

function filesContext(services: FlowcordiaActivepiecesRuntimeServices) {
  return {
    write: async (input: { fileName: string; data: unknown }) => {
      if (!services.writeFile) return unsupportedCapability("context.files.write");
      return services.writeFile(input);
    },
  };
}

function runContext(services: FlowcordiaActivepiecesRuntimeServices) {
  const runId = services.runId ?? "flowcordia-run";
  return {
    id: runId,
    stop: (input?: UnknownRecord) => {
      if (!services.stopRun) return unsupportedCapability("context.run.stop");
      return services.stopRun(input);
    },
    respond: (input?: UnknownRecord) => {
      if (!services.respond) return unsupportedCapability("context.run.respond");
      return services.respond(input);
    },
    createWaitpoint: async (input: UnknownRecord) => {
      if (!services.createWaitpoint) return unsupportedCapability("context.run.createWaitpoint");
      return services.createWaitpoint(input);
    },
    waitForWaitpoint: (waitpointId: string) => {
      if (!services.waitForWaitpoint) return unsupportedCapability("context.run.waitForWaitpoint");
      return services.waitForWaitpoint(waitpointId);
    },
  };
}

function actionContext(input: {
  node: WorkflowNode;
  propsValue: UnknownRecord;
  auth: unknown;
  services: FlowcordiaActivepiecesRuntimeServices;
}) {
  return {
    executionType: "BEGIN",
    propsValue: input.propsValue,
    auth: input.auth,
    step: { name: input.node.id },
    project: projectContext(input.services),
    server: serverContext(input.services),
    connections: connectionsContext(input.services),
    tags: {
      add: async ({ name }: { name: string }) => input.services.addTag?.(name),
    },
    output: {
      update: async ({ data }: { data: Record<string, unknown> }) =>
        input.services.updateOutput?.(data),
    },
    store: storeContext(input.services),
    files: filesContext(input.services),
    flows: flowsContext(input.services, input.node.id),
    agent: {
      tools: async (params: UnknownRecord) => {
        if (!input.services.agentTools) return unsupportedCapability("context.agent.tools");
        return input.services.agentTools(params);
      },
    },
    run: runContext(input.services),
  };
}

function propertyContext(input: {
  services: FlowcordiaActivepiecesRuntimeServices;
  searchValue?: string;
  flowId: string;
}) {
  return {
    server: serverContext(input.services),
    project: projectContext(input.services),
    searchValue: input.searchValue,
    flows: flowsContext(input.services, input.flowId),
    connections: connectionsContext(input.services),
  };
}

function triggerContext(input: {
  services: FlowcordiaActivepiecesRuntimeServices;
  propsValue: UnknownRecord;
  triggerType: unknown;
  webhookUrl?: string;
  payload?: FlowcordiaActivepiecesTriggerPayload;
  flowId: string;
  setSchedule?: (schedule: UnknownRecord) => void;
  createAppListeners?: (input: { events: string[]; identifierValue: string }) => void;
}) {
  const base = {
    auth: input.propsValue.auth,
    propsValue: input.propsValue,
    step: { name: input.flowId },
    project: projectContext(input.services),
    connections: connectionsContext(input.services),
    flows: flowsContext(input.services, input.flowId),
    store: storeContext(input.services),
    files: filesContext(input.services),
    server: serverContext(input.services),
    webhookUrl: input.webhookUrl ?? input.services.serverPublicUrl ?? "",
    payload: input.payload ?? {
      body: {},
      headers: {},
      queryParams: {},
    },
    setSchedule: (schedule: UnknownRecord) => input.setSchedule?.(schedule),
    app: {
      createListeners: (listeners: { events: string[]; identifierValue: string }) =>
        input.createAppListeners?.(listeners),
    },
  };
  if (input.triggerType === "MANUAL") {
    return base;
  }
  return base;
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

function findActionOrTrigger(piece: UnknownRecord, name: string): UnknownRecord {
  const actions = isRecord(piece.actions) ? piece.actions : {};
  const triggers = isRecord(piece.triggers) ? piece.triggers : {};
  const component = actions[name] ?? triggers[name];
  if (!isRecord(component)) {
    throw new Error(`Activepieces action or trigger ${name} is unavailable.`);
  }
  return component;
}

async function loadResolvedTrigger(input: {
  interaction: FlowcordiaActivepiecesTriggerInteraction;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<{ trigger: UnknownRecord; resolved: UnknownRecord }> {
  const module = await input.services.loadPiece(input.interaction.pieceName);
  const piece = findPiece(module, input.interaction.pieceName);
  const triggers = piece.triggers;
  if (!isRecord(triggers)) {
    throw new Error(`Activepieces piece ${input.interaction.pieceName} does not expose triggers.`);
  }
  const trigger = triggers[input.interaction.triggerName];
  if (!isRecord(trigger)) {
    throw new Error(
      `Activepieces trigger ${input.interaction.pieceName}/${input.interaction.triggerName} is unavailable.`
    );
  }
  const resolved = await resolveInputValue({
    value: input.interaction.input,
    sampleData: input.interaction.sampleData ?? {},
    services: input.services,
  });
  if (!isRecord(resolved)) {
    throw new Error("Activepieces trigger input did not resolve to an object.");
  }
  return { trigger, resolved };
}

function triggerDescriptor(trigger: UnknownRecord): FlowcordiaActivepiecesTriggerDescriptor {
  if (typeof trigger.type !== "string" || typeof trigger.testStrategy !== "string") {
    throw new Error("Activepieces trigger does not expose its exact type and test strategy.");
  }
  return {
    triggerType: trigger.type,
    testStrategy: trigger.testStrategy,
  };
}

export async function executeFlowcordiaActivepiecesProperty(input: {
  interaction: FlowcordiaActivepiecesPropertyInteraction;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<JsonValue> {
  const module = await input.services.loadPiece(input.interaction.pieceName);
  const piece = findPiece(module, input.interaction.pieceName);
  const component = findActionOrTrigger(piece, input.interaction.actionOrTriggerName);
  const props = isRecord(component.props) ? component.props : {};
  const property = props[input.interaction.propertyName];
  if (!isRecord(property)) {
    throw new Error(
      `Activepieces property ${input.interaction.actionOrTriggerName}/${input.interaction.propertyName} is unavailable.`
    );
  }
  const resolved = await resolveInputValue({
    value: input.interaction.input,
    sampleData: input.interaction.sampleData ?? {},
    services: input.services,
  });
  if (!isRecord(resolved)) {
    throw new Error("Activepieces property input did not resolve to an object.");
  }
  const context = propertyContext({
    services: input.services,
    searchValue: input.interaction.searchValue,
    flowId: input.interaction.actionOrTriggerName,
  });
  if (property.type === "DYNAMIC" && typeof property.props === "function") {
    return jsonValue({
      type: property.type,
      options: await (
        property.props as (props: UnknownRecord, ctx: UnknownRecord) => Promise<unknown>
      )(resolved, context),
    });
  }
  if (
    (property.type === "DROPDOWN" || property.type === "MULTI_SELECT_DROPDOWN") &&
    typeof property.options === "function"
  ) {
    return jsonValue({
      type: property.type,
      options: await (
        property.options as (props: UnknownRecord, ctx: UnknownRecord) => Promise<unknown>
      )(resolved, context),
    });
  }
  throw new Error(
    `Activepieces property ${input.interaction.propertyName} does not expose dynamic options.`
  );
}

export async function inspectFlowcordiaActivepiecesTrigger(input: {
  interaction: FlowcordiaActivepiecesTriggerInteraction;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<FlowcordiaActivepiecesTriggerDescriptor> {
  const { trigger } = await loadResolvedTrigger(input);
  return triggerDescriptor(trigger);
}

export async function executeFlowcordiaActivepiecesTriggerEnable(input: {
  interaction: FlowcordiaActivepiecesTriggerInteraction;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<FlowcordiaActivepiecesTriggerEnableResult> {
  const { trigger, resolved } = await loadResolvedTrigger(input);
  const descriptor = triggerDescriptor(trigger);
  let schedule: JsonValue | null = null;
  const appListeners: FlowcordiaActivepiecesTriggerEnableResult["appListeners"] = [];
  const context = triggerContext({
    services: input.services,
    propsValue: resolved,
    triggerType: trigger.type,
    webhookUrl: input.interaction.webhookUrl,
    payload: input.interaction.payload,
    flowId: input.interaction.triggerName,
    setSchedule(value) {
      schedule = jsonValue(value);
    },
    createAppListeners(value) {
      appListeners.push({
        events: [...value.events],
        identifierValue: value.identifierValue,
      });
    },
  });
  if (typeof trigger.onEnable === "function") {
    await (trigger.onEnable as (context: UnknownRecord) => Promise<unknown>)(context);
  }
  return {
    ...descriptor,
    schedule,
    appListeners,
  };
}

export async function executeFlowcordiaActivepiecesTriggerRun(input: {
  interaction: FlowcordiaActivepiecesTriggerInteraction;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<JsonValue> {
  const { trigger, resolved } = await loadResolvedTrigger(input);
  if (typeof trigger.run !== "function") {
    throw new Error(
      `Activepieces trigger ${input.interaction.pieceName}/${input.interaction.triggerName} does not expose run().`
    );
  }
  const context = triggerContext({
    services: input.services,
    propsValue: resolved,
    triggerType: trigger.type,
    webhookUrl: input.interaction.webhookUrl,
    payload: input.interaction.payload,
    flowId: input.interaction.triggerName,
  });
  return jsonValue(await (trigger.run as (context: UnknownRecord) => Promise<unknown>)(context));
}

export async function executeFlowcordiaActivepiecesTriggerDisable(input: {
  interaction: FlowcordiaActivepiecesTriggerInteraction;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<void> {
  const { trigger, resolved } = await loadResolvedTrigger(input);
  if (typeof trigger.onDisable !== "function") return;
  const context = triggerContext({
    services: input.services,
    propsValue: resolved,
    triggerType: trigger.type,
    webhookUrl: input.interaction.webhookUrl,
    payload: input.interaction.payload,
    flowId: input.interaction.triggerName,
  });
  await (trigger.onDisable as (context: UnknownRecord) => Promise<unknown>)(context);
}

export async function executeFlowcordiaActivepiecesTriggerTest(input: {
  interaction: FlowcordiaActivepiecesTriggerInteraction;
  services: FlowcordiaActivepiecesRuntimeServices;
}): Promise<JsonValue> {
  const { trigger, resolved } = await loadResolvedTrigger(input);
  const descriptor = triggerDescriptor(trigger);
  if (descriptor.testStrategy === "SIMULATION") {
    throw new Error(
      `Activepieces trigger ${input.interaction.pieceName}/${input.interaction.triggerName} requires simulation instead of a test function.`
    );
  }
  const context = triggerContext({
    services: input.services,
    propsValue: resolved,
    triggerType: trigger.type,
    webhookUrl: input.interaction.webhookUrl,
    payload: input.interaction.payload,
    flowId: input.interaction.triggerName,
  });
  const test = typeof trigger.test === "function" ? trigger.test : trigger.run;
  if (typeof test !== "function") {
    return jsonValue([trigger.sampleData ?? null]);
  }
  return jsonValue(await (test as (context: UnknownRecord) => Promise<unknown>)(context));
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
