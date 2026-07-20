export const FLOWCORDIA_BOOTSTRAP_CONFIRMATION = "CREATE_FLOWCORDIA_STARTER_WORKFLOW";

export interface FlowcordiaBootstrapCommand {
  operation: "bootstrap";
  confirmation: typeof FLOWCORDIA_BOOTSTRAP_CONFIRMATION;
  workflowId: string;
  name: string;
  description: string;
}

export function buildFlowcordiaBootstrapCommand(input: {
  workflowId: string;
  name: string;
  description: string;
}): FlowcordiaBootstrapCommand {
  return {
    operation: "bootstrap",
    confirmation: FLOWCORDIA_BOOTSTRAP_CONFIRMATION,
    workflowId: input.workflowId,
    name: input.name,
    description: input.description,
  };
}
