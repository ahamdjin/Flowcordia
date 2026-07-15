import { ProposalCommandService, type ControlPlaneScope } from "@flowcordia/control-plane";
import { createGitHubProposalGateway } from "./github.server";
import { flowcordiaProposalStore } from "./prisma.server";

export async function createProposalCommandService(scope: ControlPlaneScope) {
  return new ProposalCommandService({
    store: flowcordiaProposalStore,
    github: await createGitHubProposalGateway(scope),
  });
}
