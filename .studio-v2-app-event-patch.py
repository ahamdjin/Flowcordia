from pathlib import Path

schema_path = Path("internal-packages/database/prisma/schema.prisma")
schema = schema_path.read_text()
model = '''model FlowcordiaActivepiecesAppEventListener {
  id String @id @default(cuid())

  organizationId       String
  projectId            String
  runtimeEnvironmentId String
  workflowId           String
  nodeId               String?

  pieceName       String
  pieceVersion    String
  triggerName     String
  event           String
  identifierValue String
  mode            String

  simulationId    String?
  simulationRunId String?
  createdByUserId String?
  expiresAt       DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([simulationId, event, identifierValue], map: "FlowcordiaActivepiecesAppEventListener_simulation_event_key")
  @@index([pieceName, event, identifierValue, mode], map: "FlowcordiaActivepiecesAppEventListener_lookup_idx")
  @@index([runtimeEnvironmentId, workflowId], map: "FlowcordiaActivepiecesAppEventListener_environment_workflow_idx")
  @@index([expiresAt], map: "FlowcordiaActivepiecesAppEventListener_expiry_idx")
}

'''
anchor = "model FlowcordiaWebhookEndpoint {"
if "model FlowcordiaActivepiecesAppEventListener {" not in schema:
    if anchor not in schema:
        raise SystemExit("schema listener anchor not found")
    schema = schema.replace(anchor, model + anchor, 1)
schema_path.write_text(schema)

context_path = Path(
    "apps/webapp/app/features/flowcordia/workflows/studio-v2/activepieces-interaction-context.server.ts"
)
text = context_path.read_text()
text = text.replace(
    '  executeFlowcordiaActivepiecesAction,\n',
    '  executeFlowcordiaActivepiecesAction,\n  executeFlowcordiaActivepiecesAppEventParse,\n',
    1,
)
text = text.replace(
    '  FlowcordiaActivepiecesTriggerInteraction,\n',
    '  FlowcordiaActivepiecesTriggerInteraction,\n  FlowcordiaActivepiecesTriggerPayload,\n',
    1,
)
variant_anchor = '''  | {
      requestId: string;
      kind: "trigger_renew";
      interaction: FlowcordiaActivepiecesTriggerInteraction;
    }
  | {
      requestId: string;
      kind: "trigger_simulation";'''
variant_replacement = '''  | {
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
      kind: "trigger_simulation";'''
if variant_anchor not in text:
    raise SystemExit("context app-event payload anchor not found")
text = text.replace(variant_anchor, variant_replacement, 1)
switch_anchor = '''        case "trigger_renew":
          await executeFlowcordiaActivepiecesTriggerRenew({ interaction: payload.interaction, services });
          result = null;
          break;
        case "trigger_simulation": {'''
switch_replacement = '''        case "trigger_renew":
          await executeFlowcordiaActivepiecesTriggerRenew({ interaction: payload.interaction, services });
          result = null;
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
        case "trigger_simulation": {'''
if switch_anchor not in text:
    raise SystemExit("context app-event switch anchor not found")
context_path.write_text(text.replace(switch_anchor, switch_replacement, 1))

server_path = Path(
    "apps/webapp/app/features/flowcordia/workflows/studio-v2/activepieces-interaction.server.ts"
)
text = server_path.read_text()
text = text.replace(
    'import type { WorkflowNode } from "@flowcordia/workflow";\n',
    'import type { WorkflowNode } from "@flowcordia/workflow";\nimport {\n  deleteStudioV2ActivepiecesSimulationAppListeners,\n  replaceStudioV2ActivepiecesSimulationAppListeners,\n  type StudioV2ActivepiecesAppListener,\n} from "./activepieces-app-event-listeners.server";\n',
    1,
)
server_variant_anchor = '''  | {
      requestId?: string;
      kind: "trigger_webhook_inspect" | "trigger_handshake" | "trigger_renew";
      interaction: {
        pieceName: string;
        triggerName: string;
        input: Record<string, unknown>;
        sampleData?: Record<string, unknown>;
        webhookUrl?: string;
        payload?: unknown;
      };
    }
  | {
      requestId?: string;
      kind: "trigger_simulation";'''
server_variant_replacement = '''  | {
      requestId?: string;
      kind: "trigger_webhook_inspect" | "trigger_handshake" | "trigger_renew";
      interaction: {
        pieceName: string;
        triggerName: string;
        input: Record<string, unknown>;
        sampleData?: Record<string, unknown>;
        webhookUrl?: string;
        payload?: unknown;
      };
    }
  | {
      requestId?: string;
      kind: "app_event_parse";
      payload: {
        body: unknown;
        rawBody?: unknown;
        method?: string;
        headers: Record<string, string>;
        queryParams: Record<string, string>;
      };
    }
  | {
      requestId?: string;
      kind: "trigger_simulation";'''
if server_variant_anchor not in text:
    raise SystemExit("server app-event payload anchor not found")
text = text.replace(server_variant_anchor, server_variant_replacement, 1)
text = text.replace(
    '  updatedAt?: string;\n};',
    '  updatedAt?: string;\n  appListeners?: StudioV2ActivepiecesAppListener[];\n};',
    1,
)
helper_anchor = '''function parseSimulationMetadata(
  value: unknown,
  runId: string
): StudioV2ActivepiecesTriggerSimulation | null {'''
helper = '''function parseAppListeners(value: unknown): StudioV2ActivepiecesAppListener[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const listeners: StudioV2ActivepiecesAppListener[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !Array.isArray(candidate.events) || typeof candidate.identifierValue !== "string") {
      continue;
    }
    const events = candidate.events.filter((event): event is string => typeof event === "string");
    if (events.length === 0) continue;
    listeners.push({ events, identifierValue: candidate.identifierValue });
  }
  return listeners.length > 0 ? listeners : undefined;
}

'''
if helper_anchor not in text:
    raise SystemExit("server simulation parser anchor not found")
text = text.replace(helper_anchor, helper + helper_anchor, 1)
text = text.replace(
    '    updatedAt: typeof metadata.updatedAt === "string" ? metadata.updatedAt : undefined,\n  };',
    '    updatedAt: typeof metadata.updatedAt === "string" ? metadata.updatedAt : undefined,\n    appListeners: parseAppListeners(metadata.appListeners),\n  };',
    1,
)
text = text.replace(
    'export async function startStudioV2ActivepiecesTriggerSimulation(input: {\n  projectId: string;\n',
    'export async function startStudioV2ActivepiecesTriggerSimulation(input: {\n  organizationId: string;\n  projectId: string;\n',
    1,
)
return_anchor = '''    const simulation = parseSimulationMetadata(run?.metadata, triggered.run.id);
    if (simulation?.status === "ARMED" || simulation?.status === "COMPLETED") return simulation;'''
return_replacement = '''    const simulation = parseSimulationMetadata(run?.metadata, triggered.run.id);
    if (simulation?.status === "ARMED") {
      if (simulation.triggerType === "APP_WEBHOOK" && simulation.appListeners?.length) {
        await replaceStudioV2ActivepiecesSimulationAppListeners({
          organizationId: input.organizationId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          actorId: input.actorId,
          workflowId: input.flowId,
          pieceName: input.pieceName,
          pieceVersion: exactPieceVersion(input.pieceVersion),
          triggerName: input.interaction.triggerName,
          simulationId,
          simulationRunId: triggered.run.id,
          appListeners: simulation.appListeners,
        });
      }
      return simulation;
    }
    if (simulation?.status === "COMPLETED") return simulation;'''
if return_anchor not in text:
    raise SystemExit("server simulation return anchor not found")
text = text.replace(return_anchor, return_replacement, 1)
cancel_anchor = '''  const response = await fetch(active.waitTokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "CANCEL" }),
    redirect: "error",
  });
  return response.ok;'''
cancel_replacement = '''  const response = await fetch(active.waitTokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "CANCEL" }),
    redirect: "error",
  });
  if (response.ok) {
    await deleteStudioV2ActivepiecesSimulationAppListeners({ simulationId: active.simulationId });
  }
  return response.ok;'''
if cancel_anchor not in text:
    raise SystemExit("server simulation cancel anchor not found")
server_path.write_text(text.replace(cancel_anchor, cancel_replacement, 1))

trigger_path = Path(
    "apps/webapp/app/features/flowcordia/workflows/studio-v2/activepieces-trigger-testing.server.ts"
)
text = trigger_path.read_text()
old = '''      projectId: input.projectId,
      environmentId: input.environmentId,
      actorId: input.actorId,'''
new = '''      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorId: input.actorId,'''
if old not in text:
    raise SystemExit("trigger testing start anchor not found")
trigger_path.write_text(text.replace(old, new, 1))
