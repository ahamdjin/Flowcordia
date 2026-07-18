import {
  ProposalCommandService,
  type ControlPlaneResult,
  type CreateProposalCommand,
  type GitHubProposalGateway,
  type ProposalCommandValue,
} from "@flowcordia/control-plane";
import type { CreateGitHubProposalWithSourcePatchesInput } from "@flowcordia/github-proposals";
import type { GitHubRepositorySourcePatch } from "@flowcordia/github-workflows";
import { createGitHubProposalGateway } from "./github.server";
import { flowcordiaProposalStore } from "./prisma.server";
import { canonicalSourcePatchIdentity } from "./source-patch-identity";

export interface CreateSourceProposalCommand extends CreateProposalCommand {
  sourcePatches: readonly GitHubRepositorySourcePatch[];
  sourceDigest: string;
}

function invalidInput(message: string): ControlPlaneResult<never> {
  return {
    success: false,
    error: {
      code: "invalid_input",
      operation: "create",
      message,
      retryable: false,
    },
  };
}

export async function createSourceAwareProposalCommandService(
  scope: CreateProposalCommand["scope"],
) {
  const github = await createGitHubProposalGateway(scope);

  return {
    async create(
      command: CreateSourceProposalCommand,
    ): Promise<ControlPlaneResult<ProposalCommandValue>> {
      let identity: ReturnType<typeof canonicalSourcePatchIdentity>;
      try {
        identity = canonicalSourcePatchIdentity(command?.sourcePatches);
      } catch (error) {
        return invalidInput(
          error instanceof Error ? error.message : "Repository source patches are invalid.",
        );
      }
      if (identity.digest !== command.sourceDigest) {
        return invalidInput(
          "Source patch digest does not match the exact repository source patch content.",
        );
      }

      const sourceGateway: GitHubProposalGateway = {
        create: (input) =>
          github.create({
            ...input,
            sourcePatches: identity.patches,
          } satisfies CreateGitHubProposalWithSourcePatchesInput),
        submit: github.submit,
        promote: github.promote,
      };
      const service = new ProposalCommandService({
        store: flowcordiaProposalStore,
        github: sourceGateway,
      });
      return service.create(command);
    },
  };
}
