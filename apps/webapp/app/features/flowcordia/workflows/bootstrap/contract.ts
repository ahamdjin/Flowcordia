import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  validateWorkflow,
  type WorkflowDefinition,
} from "@flowcordia/workflow";

const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;

export const FLOWCORDIA_STARTER_TEMPLATE_IDS = [
  "manual",
  "api_transform",
  "scheduled_delay",
] as const;

export type FlowcordiaStarterTemplateId = (typeof FLOWCORDIA_STARTER_TEMPLATE_IDS)[number];

export interface FlowcordiaStarterTemplate {
  id: FlowcordiaStarterTemplateId;
  label: string;
  description: string;
  nodeSummary: string;
  defaultWorkflowId: string;
  defaultName: string;
  defaultDescription: string;
}

export const FLOWCORDIA_STARTER_TEMPLATES: readonly FlowcordiaStarterTemplate[] = [
  {
    id: "manual",
    label: "Manual workflow",
    description: "Start manually and return the workflow input unchanged.",
    nodeSummary: "Manual trigger → Output",
    defaultWorkflowId: "starter_workflow",
    defaultName: "Starter workflow",
    defaultDescription: "A governed first workflow created by Flowcordia Studio.",
  },
  {
    id: "api_transform",
    label: "Authenticated API",
    description: "Receive a project-token request and normalize it into a reviewed output shape.",
    nodeSummary: "API trigger → Map data → Output",
    defaultWorkflowId: "api_intake",
    defaultName: "API intake",
    defaultDescription:
      "Normalize an authenticated API request through a governed Flowcordia workflow.",
  },
  {
    id: "scheduled_delay",
    label: "Scheduled durable wait",
    description: "Run on a weekday schedule, pause durably, and return the scheduled payload.",
    nodeSummary: "Schedule → Wait → Output",
    defaultWorkflowId: "scheduled_follow_up",
    defaultName: "Scheduled follow-up",
    defaultDescription: "Run on a reviewed weekday schedule and continue after a durable wait.",
  },
] as const;

function workflowForTemplate(input: {
  templateId: FlowcordiaStarterTemplateId;
  workflowId: string;
  name: string;
  description?: string;
}): WorkflowDefinition {
  const shared = {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    id: input.workflowId,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
  } as const;

  switch (input.templateId) {
    case "manual":
      return {
        ...shared,
        labels: ["starter", "manual"],
        nodes: [
          {
            id: "manual_trigger",
            name: "Manual trigger",
            kind: "trigger",
            operation: "trigger.manual",
            position: { x: 120, y: 180 },
            configuration: {},
          },
          {
            id: "output",
            name: "Return output",
            kind: "output",
            operation: "output.return",
            position: { x: 460, y: 180 },
            configuration: {},
          },
        ],
        edges: [
          {
            id: "manual_trigger_to_output",
            source: "manual_trigger",
            target: "output",
          },
        ],
      };
    case "api_transform":
      return {
        ...shared,
        labels: ["starter", "api"],
        nodes: [
          {
            id: "api_trigger",
            name: "Authenticated API",
            kind: "trigger",
            operation: "trigger.api",
            position: { x: 80, y: 180 },
            configuration: {},
          },
          {
            id: "normalize_payload",
            name: "Normalize payload",
            kind: "control",
            operation: "data.map",
            position: { x: 390, y: 180 },
            configuration: {
              mode: "replace",
              entries: [
                { target: "payload", source: "", required: true },
                { target: "template", value: "api_transform" },
              ],
            },
          },
          {
            id: "output",
            name: "Return normalized output",
            kind: "output",
            operation: "output.return",
            position: { x: 720, y: 180 },
            configuration: {},
          },
        ],
        edges: [
          {
            id: "api_trigger_to_normalize_payload",
            source: "api_trigger",
            target: "normalize_payload",
          },
          {
            id: "normalize_payload_to_output",
            source: "normalize_payload",
            target: "output",
          },
        ],
      };
    case "scheduled_delay":
      return {
        ...shared,
        labels: ["starter", "schedule"],
        nodes: [
          {
            id: "schedule_trigger",
            name: "Weekday schedule",
            kind: "trigger",
            operation: "trigger.schedule",
            position: { x: 80, y: 180 },
            configuration: { cron: "0 9 * * 1-5", timezone: "UTC" },
          },
          {
            id: "durable_wait",
            name: "Wait one minute",
            kind: "control",
            operation: "control.wait",
            position: { x: 390, y: 180 },
            configuration: { durationSeconds: 60 },
          },
          {
            id: "output",
            name: "Return scheduled output",
            kind: "output",
            operation: "output.return",
            position: { x: 720, y: 180 },
            configuration: {},
          },
        ],
        edges: [
          {
            id: "schedule_trigger_to_durable_wait",
            source: "schedule_trigger",
            target: "durable_wait",
          },
          {
            id: "durable_wait_to_output",
            source: "durable_wait",
            target: "output",
          },
        ],
      };
  }
}

export function createFlowcordiaStarterWorkflow(input: {
  templateId: FlowcordiaStarterTemplateId;
  workflowId: string;
  name: string;
  description?: string;
}): WorkflowDefinition {
  const workflowId = input.workflowId.trim();
  const name = input.name.trim();
  const description = input.description?.trim();
  if (!FLOWCORDIA_STARTER_TEMPLATE_IDS.includes(input.templateId)) {
    throw new TypeError("Starter template is unsupported.");
  }
  if (!WORKFLOW_ID_PATTERN.test(workflowId)) {
    throw new TypeError("Workflow ID has an invalid format.");
  }
  if (name.length < 1 || name.length > 160) {
    throw new TypeError("Workflow name must contain between 1 and 160 characters.");
  }
  if ((description?.length ?? 0) > 2_000) {
    throw new TypeError("Workflow description cannot exceed 2000 characters.");
  }

  const validated = validateWorkflow(
    workflowForTemplate({ templateId: input.templateId, workflowId, name, description })
  );
  if (!validated.success) {
    throw new TypeError(
      validated.issues[0]?.message ?? "The starter workflow does not satisfy the contract."
    );
  }
  return validated.workflow;
}
