import type { FlowcordiaFunction } from "@flowcordia/runtime";

type QualifyLeadInput = {
  leadId: string;
};

type QualifyLeadOutput = {
  qualified: boolean;
};

export const qualifyLead: FlowcordiaFunction<QualifyLeadInput, QualifyLeadOutput> = async (
  input
) => ({
  qualified: input.leadId.startsWith("lead_qualified"),
});
