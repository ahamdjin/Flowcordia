import type { FlowcordiaStarterTemplateId } from "./contract";

export const FLOWCORDIA_BOOTSTRAP_CONFIRMATION = "CREATE_FLOWCORDIA_STARTER_WORKFLOW";

export type FlowcordiaBootstrapCommand = {
  operation: "bootstrap";
  confirmation: typeof FLOWCORDIA_BOOTSTRAP_CONFIRMATION;
  templateId: FlowcordiaStarterTemplateId;
  workflowId: string;
  name: string;
  description: string;
};

export function buildFlowcordiaBootstrapCommand(input: {
  templateId: FlowcordiaStarterTemplateId;
  workflowId: string;
  name: string;
  description: string;
}): FlowcordiaBootstrapCommand {
  return {
    operation: "bootstrap",
    confirmation: FLOWCORDIA_BOOTSTRAP_CONFIRMATION,
    templateId: input.templateId,
    workflowId: input.workflowId,
    name: input.name,
    description: input.description,
  };
}
